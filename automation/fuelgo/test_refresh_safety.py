"""FuelGo MIMIT validator regression tests; run with python -m unittest discover -s automation/fuelgo."""
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import json

from validate_refresh import parse_day, validate


class FuelGoRefreshSafetyTests(unittest.TestCase):
    def test_reject_impossible_calendar_date(self):
        with self.assertRaises(ValueError):
            parse_day("2026-02-30", "source_date_prices")

    def test_reject_missing_province_coverage_before_reading_files(self):
        index = {
            "schema": 2,
            "source": "Ministero delle Imprese e del Made in Italy",
            "source_date_prices": "2026-10-10",
            "source_date_anagrafica": "2026-10-10",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "count": 21000,
            "provinces": [],
        }
        previous = {"source_date_prices": "2026-10-09", "count": 21000}
        with TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "province coverage incomplete"):
                validate(index, previous, Path(folder), today=date(2026, 10, 10))


if __name__ == "__main__":
    unittest.main()
