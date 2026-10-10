"""Offline regression tests for the published MIMIT FuelGo data updater.

Run from repository root:
    python -m unittest discover -s automation/fuelgo -p 'test_*.py' -v
No network or third-party packages are required.
"""
from __future__ import annotations

import importlib.util
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("update_fuel.py")
SPEC = importlib.util.spec_from_file_location("fuelgo_update_under_test", SCRIPT)
updater = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(updater)


class FuelGoUpdaterTests(unittest.TestCase):
    def test_extracts_real_source_date_from_header(self):
        sample = "Elenco prezzi MIMIT\nAggiornato: 2026-10-09\nidImpianto|prezzo"
        self.assertEqual(updater.extract_date(sample), "2026-10-09")
        self.assertIsNone(updater.extract_date("idImpianto|prezzo\n1|1,80"))

    def test_reads_pipe_delimited_csv_after_metadata(self):
        sample = (
            "Dati aggiornati al 2026-10-09\n"
            "idImpianto|descCarburante|prezzo|isSelf\n"
            "123|Benzina|1,789|1\n"
        )
        parsed = list(updater.rows(sample))
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["idimpianto"], "123")
        self.assertEqual(parsed[0]["desccarburante"], "Benzina")
        self.assertEqual(parsed[0]["prezzo"], "1,789")

    def test_rejects_feed_without_station_header(self):
        with self.assertRaisesRegex(ValueError, "idimpianto"):
            list(updater.rows("other|fields\n1|2\n"))

    def test_nonfinite_prices_never_pass_numeric_parser(self):
        for value in ("NaN", "inf", "-inf", "", "not-a-price"):
            with self.subTest(value=value):
                self.assertIsNone(updater.fnum(value))
        self.assertEqual(updater.fnum("1,799"), 1.799)

    def test_invalid_coordinates_are_not_accepted(self):
        self.assertTrue(updater.valid_coord(45.54, 10.21))
        for coords in ((0, 0), (91, 10), (45, -181), (None, 10)):
            with self.subTest(coords=coords):
                self.assertFalse(updater.valid_coord(*coords))

    def test_price_updates_sort_by_communication_timestamp(self):
        older = updater.dt_key("08/10/2026 08:00:00")
        newer = updater.dt_key("09/10/2026 08:00:00")
        self.assertLess(older, newer)
        self.assertLess(updater.dt_key("invalid"), older)

    def test_truncated_feed_preserves_last_valid_dataset(self):
        anag = (
            "2026-10-09\n"
            "idImpianto|Gestore|NomeImpianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine\n"
            "123|Test|Test|Via Roma|BRESCIA|BS|45,54|10,21\n"
        ).encode()
        prices = (
            "2026-10-09\n"
            "idImpianto|descCarburante|prezzo|isSelf|dtComu\n"
            "123|Benzina|1,789|1|09/10/2026 08:00:00\n"
        ).encode()
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            index = data / "index.json"
            original = '{"schema":2,"count":21509,"source_date_prices":"2026-10-09"}\n'
            index.write_text(original, encoding="utf-8")
            def offline_fetch(url):
                return anag if url == updater.ANAG else prices
            with patch.object(updater, "DATA_DIR", data), \\
                 patch.object(updater, "INDEX", index), \\
                 patch.object(updater, "fetch", side_effect=offline_fetch):
                with self.assertRaises(SystemExit):
                    updater.main()
            self.assertEqual(index.read_text(encoding="utf-8"), original)
            self.assertFalse((data / "provinces").exists())

    def test_download_failure_preserves_last_valid_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            index = data / "index.json"
            index.write_text('{"schema":2,"count":21509}', encoding="utf-8")
            with patch.object(updater, "DATA_DIR", data), \\
                 patch.object(updater, "INDEX", index), \\
                 patch.object(updater, "fetch", side_effect=OSError("upstream unavailable")):
                with self.assertRaises(OSError):
                    updater.main()
            self.assertEqual(index.read_text(encoding="utf-8"), '{"schema":2,"count":21509}')


if __name__ == "__main__":
    unittest.main()
