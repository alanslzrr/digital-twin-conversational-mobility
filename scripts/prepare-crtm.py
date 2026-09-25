"""Bounded, explicit CRTM GTFS normalization. Does not touch OTP or the database."""
import argparse
import csv
import hashlib
import io
import json
import math
import re
import shutil
import tempfile
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = json.loads((ROOT / "apps/mobility-core/src/catalogs/crtm-sources.json").read_text())
TERMS = "https://www.crtm.es/licencia-de-uso"
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(url, target, maximum):
    temporary = target.with_suffix(".download")
    try:
        with urllib.request.urlopen(url, timeout=90) as response, temporary.open("wb") as output:
            if not response.url.startswith("https://"):
                raise ValueError("HTTPS source required")
            size = 0
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > maximum:
                    raise ValueError("Source exceeds size limit")
                output.write(chunk)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def ident(value):
    value = value.strip()
    if not value or len(value) > 250 or any(ord(c) < 32 and c != "\t" for c in value):
        raise ValueError("Invalid GTFS identifier")
    return value


def number(value, low=0, high=2_147_483_647):
    if not re.fullmatch(r"\d+", value):
        raise ValueError("Invalid integer")
    n = int(value)
    if not low <= n <= high:
        raise ValueError("Integer out of range")
    return n


def seconds(value):
    if not value:
        return ""
    m = re.fullmatch(r"(\d{1,2}):([0-5]\d):([0-5]\d)", value)
    if not m or int(m[1]) > 71:
        raise ValueError("Unsupported GTFS time")
    return int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3])


def day(value):
    parsed = datetime.strptime(value, "%Y%m%d")
    if parsed.strftime("%Y%m%d") != value:
        raise ValueError("Invalid service date")
    return parsed.strftime("%Y-%m-%d")


def normalize(archive_path, dataset, output, metadata, fetched_at):
    if dataset not in SOURCES:
        raise ValueError("Unknown CRTM dataset")
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or len(names) > 100 or sum(x.file_size for x in archive.infolist()) > 600_000_000:
            raise ValueError("Invalid or oversized GTFS archive")
        # No extraction: arbitrary archive paths cannot write to the filesystem.
        def rows(table):
            name = table + ".txt"
            if name not in names:
                return
            with archive.open(name) as raw:
                reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"))
                if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
                    raise ValueError("Invalid CSV headers")
                for index, row in enumerate(reader):
                    if index >= 3_000_000 or None in row or any(v is None or len(v) > 2000 for v in row.values()):
                        raise ValueError("Invalid or oversized CSV row")
                    yield {k.strip(): v.strip() for k, v in row.items()}
        def indexed(table, key):
            result = {}
            for row in rows(table):
                id = ident(row[key])
                if id in result:
                    raise ValueError("Duplicate GTFS identity")
                result[id] = row
            if not result:
                raise ValueError(f"Missing {table}")
            return result

        agencies = indexed("agency", "agency_id")
        if any(r["agency_timezone"] != "Europe/Madrid" for r in agencies.values()):
            raise ValueError("Unsupported agency timezone")
        stops, routes, trips = indexed("stops", "stop_id"), indexed("routes", "route_id"), indexed("trips", "trip_id")
        calendars = list(rows("calendar"))
        exceptions = list(rows("calendar_dates"))
        services = {r["service_id"] for r in calendars + exceptions}
        if not services:
            raise ValueError("Missing service calendars")
        for r in trips.values():
            if r["route_id"] not in routes or r["service_id"] not in services:
                raise ValueError("Broken trip reference")
        for r in stops.values():
            parent = r.get("parent_station", "")
            if parent and (parent not in stops or stops[parent].get("location_type") != "1"):
                raise ValueError("Broken or unsupported parent station")
            if parent == r["stop_id"]:
                raise ValueError("Cyclic station parent")
        counts, hashes = {}, {}
        def write(table, columns, values):
            path = output / (table + ".csv")
            count = 0
            with path.open("w", newline="", encoding="utf8") as stream:
                writer = csv.writer(stream)
                writer.writerow(["dataset_id"] + columns)
                for row in values:
                    writer.writerow([dataset] + row)
                    count += 1
            counts[table] = count
            hashes[table] = digest(path)
        def normalized_stops():
            for id, r in stops.items():
                lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
                if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
                    raise ValueError("Invalid stop coordinates")
                yield [id, r.get("stop_code", ""), ident(r["stop_name"]), lat, lon,
                       r.get("parent_station", ""), number(r.get("location_type") or "0", 0, 2),
                       number(r.get("wheelchair_boarding") or "0", 0, 2)]
        write("stops", ["external_id", "stop_code", "name", "latitude", "longitude", "parent_id", "location_type", "wheelchair"], normalized_stops())
        def normalized_routes():
            for id, r in routes.items():
                if r["agency_id"] not in agencies:
                    raise ValueError("Broken agency reference")
                yield [id, r["agency_id"], r.get("route_short_name", ""), r.get("route_long_name", ""), number(r["route_type"], 0, 1700)]
        write("routes", ["external_id", "agency_id", "short_name", "long_name", "route_type"], normalized_routes())
        write("trips", ["external_id", "route_id", "service_id", "headsign", "direction", "wheelchair"],
              ([id, r["route_id"], ident(r["service_id"]), r.get("trip_headsign", ""),
                number(r["direction_id"], 0, 1) if r.get("direction_id") else "",
                number(r.get("wheelchair_accessible") or "0", 0, 2)] for id, r in trips.items()))
        first_last = {}
        def normalized_times():
            for r in rows("stop_times"):
                if r["trip_id"] not in trips or r["stop_id"] not in stops:
                    raise ValueError("Broken stop_time reference")
                sequence = number(r["stop_sequence"])
                arr, dep = seconds(r.get("arrival_time", "")), seconds(r.get("departure_time", ""))
                if arr != "" and dep != "" and dep < arr:
                    raise ValueError("Departure before arrival")
                first_last.setdefault(r["trip_id"], []).append((sequence, r["stop_id"]))
                yield [r["trip_id"], sequence, r["stop_id"], arr, dep, r.get("stop_headsign", ""),
                       number(r.get("pickup_type") or "0", 0, 3), number(r.get("drop_off_type") or "0", 0, 3),
                       number(r.get("timepoint") or "1", 0, 1)]
        write("stop_times", ["trip_id", "sequence", "stop_id", "arrival_seconds", "departure_seconds", "headsign", "pickup_type", "drop_off_type", "timepoint"], normalized_times())
        if set(first_last) != set(trips):
            raise ValueError("Trip without stop times")
        repeated = 0
        for times in first_last.values():
            if len({s for s, _ in times}) != len(times):
                raise ValueError("Duplicate stop sequence")
            repeated += len({id for _, id in times}) != len(times)
        del first_last
        def normalized_calendar():
            for r in calendars:
                start, end = day(r["start_date"]), day(r["end_date"])
                if start > end:
                    raise ValueError("Reversed calendar")
                days = [str(i+1) for i, key in enumerate(DAYS) if number(r[key], 0, 1)]
                yield [ident(r["service_id"]), start, end, "{" + ",".join(days) + "}"]
        write("calendar", ["service_id", "start_date", "end_date", "weekdays"], normalized_calendar())
        write("exceptions", ["service_id", "date", "exception_type"],
              ([ident(r["service_id"]), day(r["date"]), number(r["exception_type"], 1, 2)] for r in exceptions))
        def normalized_frequencies():
            windows = {}
            for r in rows("frequencies"):
                if r["trip_id"] not in trips:
                    raise ValueError("Broken frequency reference")
                start, end = seconds(r["start_time"]), seconds(r["end_time"])
                if start == "" or end == "" or end <= start:
                    raise ValueError("Invalid frequency window")
                for a, b in windows.setdefault(r["trip_id"], []):
                    if max(a, start) < min(b, end):
                        raise ValueError("Overlapping frequency windows")
                windows[r["trip_id"]].append((start, end))
                yield [r["trip_id"], start, end, number(r["headway_secs"], 1, 86400), number(r.get("exact_times") or "0", 0, 1)]
        write("frequencies", ["trip_id", "start_seconds", "end_seconds", "headway_seconds", "exact_times"], normalized_frequencies())
        dates = [day(r[k]) for r in calendars for k in ["start_date", "end_date"]] + [day(r["date"]) for r in exceptions if r["exception_type"] == "1"]
        if not dates:
            raise ValueError("No positive service coverage")
        id = SOURCES[dataset]["itemId"]
        manifest = {"datasetId": dataset, "version": digest(archive_path), "parserVersion": "crtm-gtfs-v1",
                    "fetchedAt": fetched_at, "publishedAt": datetime.fromtimestamp(metadata["modified"]/1000, timezone.utc).isoformat(),
                    "timezone": "Europe/Madrid", "serviceStart": min(dates), "serviceEnd": max(dates),
                    "feedVersions": sorted({r.get("feed_version", "") for r in rows("feed_info")}),
                    "counts": counts, "tableHashes": hashes, "repeatedStopTrips": repeated,
                    "sourceUrl": f"https://www.arcgis.com/sharing/rest/content/items/{id}/data",
                    "catalogUrl": f"https://datos.crtm.es/datasets/{id}", "termsUrl": TERMS,
                    "attribution": "Powered by CRTM", "dataTreatment": "normalized from official static GTFS",
                    "operatingCompany": "not identified by this feed; agency CRTM is the publisher",
                    "routingIncluded": False, "realtimeIncluded": False}
        (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        return manifest


def prepare(dataset, download_sources=False, source_dir=None):
    root = ROOT / "data/sources/crtm"
    root.mkdir(parents=True, exist_ok=True)
    id = SOURCES[dataset]["itemId"]
    archive = (source_dir or root) / f"{dataset}.zip"
    metadata_file = (source_dir or root) / f"{dataset}.item.json"
    if download_sources or not archive.exists() or not metadata_file.exists():
        if source_dir:
            raise ValueError("Offline input directory is incomplete")
        download(f"https://www.arcgis.com/sharing/rest/content/items/{id}?f=json", metadata_file, 1_000_000)
        download(f"https://www.arcgis.com/sharing/rest/content/items/{id}/data", archive, 100_000_000)
    metadata = json.loads(metadata_file.read_text())
    if metadata.get("id") != id or metadata.get("owner") != "ConsorcioRegional" or metadata.get("access") != "public":
        raise ValueError("Official public CRTM dataset metadata required")
    fetched_at = datetime.fromtimestamp(archive.stat().st_mtime, timezone.utc).isoformat()
    target = root / dataset / digest(archive)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as temp:
        manifest = normalize(archive, dataset, Path(temp), metadata, fetched_at)
        if target.exists():
            previous = json.loads((target / "manifest.json").read_text())
            stable = lambda m: {k: v for k, v in m.items() if k not in {"fetchedAt", "publishedAt"}}
            if stable(previous) != stable(manifest):
                raise ValueError("Existing immutable export differs; inspect before replacing")
            if any(digest(target / (table + ".csv")) != expected for table, expected in previous["tableHashes"].items()):
                raise ValueError("Existing export checksum mismatch")
            # Preserve the original retrieval evidence for this content-addressed export.
            manifest = previous
        else:
            shutil.move(temp, target)
    print(json.dumps({"export": str(target), **{k: manifest[k] for k in ["datasetId", "serviceStart", "serviceEnd", "counts", "repeatedStopTrips"]}}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", choices=["all", *SOURCES], default="all")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--source-dir", type=Path, help="Offline official zip/metadata pairs")
    args = parser.parse_args()
    for dataset in SOURCES if args.dataset == "all" else [args.dataset]:
        prepare(dataset, args.download, args.source_dir)
