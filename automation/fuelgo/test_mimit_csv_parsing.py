"""FuelGo regression tests for the upstream CSV normalization helpers."""
import unittest
from datetime import datetime
from update_fuel import clean_key, decode, dt_key, fnum, rows, valid_coord

class MimitCsvParsingTests(unittest.TestCase):
    def test_cp1252_decode_preserves_accented_station_names(self):
        self.assertEqual(decode("Caffè".encode("cp1252")), "Caffè")

    def test_header_detection_after_mimit_metadata(self):
        sample = "MIMIT export\nupdated 2026-10-10\nidImpianto|Provincia|Comune\n42|BS|SAREZZO\n"
        self.assertEqual(list(rows(sample))[0], {"idimpianto": "42", "provincia": "BS", "comune": "SAREZZO"})

    def test_comma_decimal_prices(self):
        self.assertEqual(fnum("1,795"), 1.795)

    def test_reject_non_finite_prices(self):
        self.assertIsNone(fnum("nan"))
        self.assertIsNone(fnum("inf"))

    def test_zero_zero_coordinates_are_not_usable(self):
        self.assertFalse(valid_coord(0, 0))
        self.assertTrue(valid_coord(45.5416, 10.2118))

    def test_communication_dates_order_chronologically(self):
        self.assertLess(dt_key("09/10/2026 08:00:00"), dt_key("10/10/2026 08:00:00"))

    def test_accented_headers_normalize(self):
        self.assertEqual(clean_key("Città Impianto"), "cittaimpianto")

if __name__ == "__main__":
    unittest.main()
