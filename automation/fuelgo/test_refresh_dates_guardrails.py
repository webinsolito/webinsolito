"""Regression coverage for MIMIT refresh rejection before province files are touched."""
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from validate_refresh import validate


class FuelGoDateGuardrails(unittest.TestCase):
    def setUp(self):
        self.today = date(2026, 10, 10)
        self.current = {
            "schema": 2,
            "source": "Ministero delle Imprese e del Made in Italy",
            "source_date_prices": "2026-10-10",
            "source_date_anagrafica": "2026-10-10",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "count": 2000,
            "provinces": [],
        }
        self.previous = {"source_date_prices": "2026-10-09", "count": 2000}
        self.folder = TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)

    def reject(self, message):
        with self.assertRaisesRegex(ValueError, message):
            validate(self.current, self.previous, Path(self.folder.name), today=self.today)

    def test_rejects_regressed_price_feed(self):
        self.current["source_date_prices"] = "2026-10-08"
        self.reject("older than previously published")

    def test_rejects_future_price_feed(self):
        self.current["source_date_prices"] = "2026-10-11"
        self.reject("future-dated")

    def test_rejects_future_anagrafica(self):
        self.current["source_date_anagrafica"] = "2026-10-11"
        self.reject("future-dated")

    def test_rejects_stale_price_feed(self):
        self.current["source_date_prices"] = "2026-10-06"
        self.previous["source_date_prices"] = "2026-10-05"
        self.reject("stale MIMIT source")

    def test_rejects_stale_anagrafica(self):
        self.current["source_date_anagrafica"] = "2026-09-01"
        self.reject("stale MIMIT source")

    def test_rejects_collapsed_station_count(self):
        self.current["count"] = 1100
        self.reject("station count collapsed")

    def test_rejects_naive_generation_timestamp(self):
        self.current["generated_at"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        self.reject("generated_at must be a recent UTC timestamp")

    def test_rejects_unknown_source(self):
        self.current["source"] = "unverified source"
        self.reject("unexpected FuelGo schema or source")


if __name__ == "__main__":
    unittest.main()
