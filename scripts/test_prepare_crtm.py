"""Offline regressions for official CRTM normalization; no network or database."""
import csv
import importlib.util
import io
import json
import tempfile
import sys
import os
from unittest.mock import patch
import unittest
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("prepare_crtm", Path(__file__).with_name("prepare-crtm.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture(path, broken=False):
    tables = {
        "agency": [["agency_id", "agency_timezone"], ["CRTM", "Europe/Madrid"]],
        "stops": [["stop_id", "stop_name", "stop_lat", "stop_lon", "location_type", "parent_station", "stop_code"],
                  ["station", "Station", "40.4", "-3.7", "1", "", ""],
                  ["stop", "Platform", "40.4", "-3.7", "0", "station", "0072"]],
        "routes": [["route_id", "agency_id", "route_short_name", "route_type"], ["line", "CRTM", "C-1", "3"]],
        "trips": [["trip_id", "route_id", "service_id", "trip_headsign"], ["trip\t1", "missing" if broken else "line", "service", "Destination"]],
        "stop_times": [["trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time"],
                       ["trip\t1", "stop", "1", "25:00:00", "25:00:00"],
                       ["trip\t1", "stop", "2", "25:30:00", "25:30:00"]],
        "calendar": [["service_id", *module.DAYS, "start_date", "end_date"], ["service", *(["1"] * 7), "20260901", "20261001"]],
        "calendar_dates": [["service_id", "date", "exception_type"], ["service", "20261002", "1"]],
        "frequencies": [["trip_id", "start_time", "end_time", "headway_secs", "exact_times"], ["trip\t1", "25:00:00", "26:00:00", "600", ""]],
    }
    with zipfile.ZipFile(path, "w") as archive:
        for name, rows in tables.items():
            stream = io.StringIO(newline="")
            csv.writer(stream).writerows(rows)
            archive.writestr(name + ".txt", stream.getvalue())


class NormalizationTests(unittest.TestCase):
    def test_preserves_identity_sequences_and_frequency_semantics(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "feed.zip"
            fixture(archive)
            manifest = module.normalize(archive, "metro", root, {"modified": 0}, "2026-09-25T00:00:00Z")
            self.assertEqual(manifest["repeatedStopTrips"], 1)
            self.assertEqual(manifest["serviceEnd"], "2026-10-02")
            self.assertFalse(manifest["routingIncluded"])
            with (root / "trips.csv").open() as f:
                self.assertEqual(next(csv.DictReader(f))["external_id"], "trip\t1")
            with (root / "stops.csv").open() as f:
                self.assertEqual(list(csv.DictReader(f))[1]["stop_code"], "0072")
            with (root / "stop_times.csv").open() as f:
                rows = list(csv.DictReader(f))
                self.assertEqual([r["sequence"] for r in rows], ["1", "2"])
                self.assertEqual(rows[0]["departure_seconds"], "90000")
            with (root / "frequencies.csv").open() as f:
                self.assertEqual(next(csv.DictReader(f))["exact_times"], "0")
            self.assertEqual(json.loads((root / "manifest.json").read_text()), manifest)

    def test_rejects_broken_references(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "feed.zip"
            fixture(archive, broken=True)
            with self.assertRaisesRegex(ValueError, "Broken trip reference"):
                module.normalize(archive, "metro", root, {"modified": 0}, "2026-09-25T00:00:00Z")

    def test_reprocessing_keeps_original_retrieval_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "metro.zip"
            fixture(archive)
            (root / "metro.item.json").write_text(json.dumps({
                "id": module.SOURCES["metro"]["itemId"], "owner": "ConsorcioRegional",
                "access": "public", "modified": 0,
            }))
            with patch.object(module, "ROOT", root), patch("sys.stdout", io.StringIO()):
                module.prepare("metro", source_dir=root)
                manifest = next((root / "data/sources/crtm/metro").glob("*/manifest.json"))
                original = manifest.read_bytes()
                os.utime(archive, (archive.stat().st_atime, archive.stat().st_mtime + 60))
                module.prepare("metro", source_dir=root)
                self.assertEqual(manifest.read_bytes(), original)

    def test_time_and_identifier_bounds(self):
        self.assertEqual(module.seconds("25:01:02"), 90062)
        self.assertEqual(module.ident("trip\t1"), "trip\t1")
        for value in ["72:00:00", "12:60:00", "-1:00:00"]:
            with self.assertRaises(ValueError):
                module.seconds(value)
        for value in ["", "id\x00suffix", "id\nsuffix"]:
            with self.assertRaises(ValueError):
                module.ident(value)


if __name__ == "__main__":
    unittest.main()
