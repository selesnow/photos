"""
Проверки механизма цен. Запуск:  python -I .github/scripts/test_prices.py

Главное: index.html должен соответствовать prices.json, а замена цен — быть обратимой
(вернули старые цены — получили побайтно тот же index.html).
"""

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
import apply_prices as ap  # noqa: E402
import update_prices as up  # noqa: E402


def html() -> str:
    with open(ap.INDEX, encoding="utf-8", newline="") as f:
        return f.read()


class PricesTest(unittest.TestCase):
    def setUp(self):
        self.p0 = ap.load_prices()
        self.html = html()

    def test_site_matches_prices_json(self):
        self.assertEqual(ap.render(self.html, self.p0), self.html)

    def test_every_spot_changes_and_is_reversible(self):
        p = copy.deepcopy(self.p0)
        p["types"]["family"]["price"] = 199
        p["types"]["couple"]["price"] = 111
        p["locations"]["el_gouna"]["surcharge"] = 55
        p["locations"]["cliff"]["transfer"] = 77
        p["extras"]["dress"]["price"] = 45
        new = ap.render(self.html, p)
        for needle in ('фотосессии от $111', '"priceRange": "$111 - $331"', 'package-price">$199<',
                       'data-type="family" data-price="199"', 'data-loc="el_gouna" data-price="55"',
                       'Египетская Венеция (+$55)', 'Утёс — $77', 'Море) — $45.'):
            self.assertIn(needle, new)
        self.assertEqual(ap.render(new, self.p0), self.html)

    def test_changed_markup_fails_loudly(self):
        with self.assertRaises(ap.RuleError):
            ap.render(self.html.replace('package-price">$170', 'package-price">170 USD'), self.p0)

    def test_price_validation(self):
        p = copy.deepcopy(self.p0)
        for bad in (0, -1, "1", 1.5):
            p["types"]["family"]["price"] = bad
            with self.assertRaises(ap.RuleError):
                ap.render(self.html, p)

    def test_update_validation(self):
        for key, value in (("types.family.name", 1), ("types.family.price", "9"), ("types.family.price", True),
                           ("types.family.price", 10000), ("types.x.price", 1), ("locations.cliff.price", 1)):
            with self.assertRaises(ap.RuleError, msg=f"{key}={value!r}"):
                up.apply_changes(copy.deepcopy(self.p0), {key: value})

    def test_dump_format_is_stable(self):
        with open(ap.PRICES, encoding="utf-8", newline="") as f:
            self.assertEqual(up.dump_prices(self.p0), f.read().replace("\r\n", "\n"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
