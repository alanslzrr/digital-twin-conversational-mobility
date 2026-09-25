"""Prepare a reproducible Madrid subset from the official Renfe GTFS (stdlib only)."""
import csv
import hashlib
import io
import json
import shutil
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parent.parent
GTFS_URL = "https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip"
OSM_URL = "https://download.geofabrik.de/europe/spain/madrid-latest.osm.pbf"


def sha256(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def prepare(download=False):
    sources, target = ROOT / "data/sources", ROOT / "data/otp"
    sources.mkdir(parents=True, exist_ok=True)
    target.mkdir(parents=True, exist_ok=True)
    for url, path in [(GTFS_URL, sources / "renfe.gtfs.zip"), (OSM_URL, target / "madrid.osm.pbf")]:
        if download or not path.exists():
            temporary = path.with_suffix(".download")
            with urllib.request.urlopen(url, timeout=180) as response, temporary.open("wb") as out:
                shutil.copyfileobj(response, out)
            temporary.replace(path)

    with zipfile.ZipFile(sources / "renfe.gtfs.zip") as archive:
        def read(table):
            if f"{table}.txt" not in archive.namelist():
                return []
            with archive.open(f"{table}.txt") as raw:
                # Renfe pads headers and IDs inconsistently across tables.
                return [{key.strip(): value.strip() for key, value in row.items()}
                        for row in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"))]

        routes = [row for row in read("routes") if row["route_id"].startswith("10T")]
        if not routes or not any("Chamart" in row["route_long_name"] for row in routes):
            raise ValueError("Madrid route convention changed; inspect the feed before importing")
        route_ids = {row["route_id"] for row in routes}
        trips = [row for row in read("trips") if row["route_id"] in route_ids]
        trip_ids = {row["trip_id"] for row in trips}
        times = [row for row in read("stop_times") if row["trip_id"] in trip_ids]
        stop_ids = {row["stop_id"] for row in times}
        stops = [row for row in read("stops") if row["stop_id"] in stop_ids]
        if stop_ids != {row["stop_id"] for row in stops}:
            raise ValueError("Missing referenced stop")
        services = {row["service_id"] for row in trips}
        shape_ids = {row.get("shape_id") for row in trips}
        calendar = [row for row in read("calendar") if row["service_id"] in services]
        tables = {"agency": read("agency"), "routes": routes, "trips": trips,
                  "stops": stops, "stop_times": times, "calendar": calendar,
                  "calendar_dates": [row for row in read("calendar_dates") if row["service_id"] in services],
                  "shapes": [row for row in read("shapes") if row["shape_id"] in shape_ids],
                  "transfers": [row for row in read("transfers") if row["from_stop_id"] in stop_ids and row["to_stop_id"] in stop_ids]}
        if services - {row["service_id"] for row in calendar + tables["calendar_dates"]}:
            raise ValueError("Missing referenced service calendar")
        tables["feed_info"] = [{"feed_publisher_name": "Renfe (Madrid subset)",
                               "feed_publisher_url": "https://data.renfe.com/dataset/horarios-cercanias",
                               "feed_lang": "es", "feed_id": "renfe"}]
        with zipfile.ZipFile(target / "renfe-madrid.gtfs.zip", "w", zipfile.ZIP_DEFLATED) as output:
            for table, rows in tables.items():
                if not rows:
                    continue
                text = io.StringIO(newline="")
                writer = csv.DictWriter(text, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
                entry = zipfile.ZipInfo(f"{table}.txt", (2020, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                output.writestr(entry, text.getvalue())
    version = sha256(target / "renfe-madrid.gtfs.zip")
    manifest = {
        "preparedAt": datetime.now(timezone.utc).isoformat(), "parserVersion": "renfe-madrid-v1",
        "staticVersion": version, "feedId": "renfe", "timezone": "Europe/Madrid",
        "serviceStart": min(row["start_date"] for row in calendar),
        "serviceEnd": max(row["end_date"] for row in calendar),
        "coverage": "Renfe Madrid network only; streets limited to the Madrid OSM extract. No Metro/EMT routes.",
        "sources": [
            {"url": GTFS_URL, "license": "CC-BY-4.0", "sha256": sha256(sources / "renfe.gtfs.zip")},
            {"url": OSM_URL, "license": "ODbL-1.0", "attribution": "OpenStreetMap contributors / Geofabrik", "sha256": sha256(target / "madrid.osm.pbf")}],
        "counts": {table: len(rows) for table, rows in tables.items()}}
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    # Compact normalized inputs for the database importer, not a second GTFS parser.
    (sources / "renfe-madrid.json").write_text(json.dumps({"manifest": manifest, "stops": stops, "routes": routes, "trips": trips, "stopTimes": [{k: row.get(k, "") for k in ("trip_id", "stop_id", "stop_sequence", "stop_headsign")} for row in times]}))
    for name in ("build-config.json", "router-config.json", "otp-config.json"):
        shutil.copyfile(ROOT / "infra/otp" / name, target / name)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Refresh both source downloads explicitly")
    prepare(parser.parse_args().download)
