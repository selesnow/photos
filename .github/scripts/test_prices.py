"""
Проверки механизма цен. Запуск:  python -I .github/scripts/test_prices.py

Главное: index.html соответствует prices.json; замена цен обратима (вернули старые цены — получили
побайтно тот же index.html); новые позиции подхватываются без правок кода; ошибки разметки не молчат.
"""

import copy
import json
import re
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


def schema_faq(text: str) -> dict:
    block = re.search(r'<script type="application/ld\+json">(.*?)</script>', text, re.S).group(1)
    out = {}

    def walk(o):
        if isinstance(o, dict):
            if o.get("@type") == "Question":
                out[o["name"]] = o["acceptedAnswer"]["text"]
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(json.loads(block))
    return out


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
        for needle in ('фотосессии от $111', '"priceRange": "$111 - $331"', 'data-p="types.family.price">$199<',
                       'data-type="family" data-price="199"', 'data-loc="el_gouna" data-price="55"',
                       '(+$55)', 'Утёс — $77', 'data-p="extras.dress.price">$45<', '"price": "199"'):
            self.assertIn(needle, new)
        self.assertEqual(ap.render(new, self.p0), self.html)

    def test_surcharge_label_follows_data_on_any_location(self):
        """Доплата на карточке локации появляется у любой локации и исчезает при нуле."""
        p = copy.deepcopy(self.p0)
        p["locations"]["cliff"]["surcharge"] = 10
        p["locations"]["el_gouna"]["surcharge"] = 0
        new = ap.render(self.html, p)
        card = lambda key: re.search(rf'<div class="location-card" data-loc="{key}".*?</span></span>', new, re.S).group(0)
        self.assertIn("(+$10)", card("cliff"))
        self.assertNotIn("(+$", card("el_gouna"))

    def test_faq_schema_follows_visible_faq(self):
        p = copy.deepcopy(self.p0)
        p["locations"]["desert"]["transfer"] = 35
        p["types"]["dress"]["price"] = 160
        new = ap.render(self.html, p)
        answers = schema_faq(new)
        transfer = next(v for k, v in answers.items() if "добраться" in k)
        dress = next(v for k, v in answers.items() if "спец-пакет" in k)
        self.assertIn("Пустыня — $35", transfer)
        self.assertIn("($160)", dress)

    def test_new_location_and_type_need_no_code_changes(self):
        """Новая локация/тип = prices.json + разметка; скрипт подхватывает их сам."""
        p = copy.deepcopy(self.p0)
        p["locations"]["dahab"] = {"name": "Дахаб", "photo_name": "Дахаб", "aliases": ["дахаб"], "surcharge": 15, "transfer": 60}
        with self.assertRaises(ap.RuleError) as ctx:  # пока кнопки нет, скрипт говорит что добавить
            ap.render(self.html, p)
        self.assertIn("dahab", str(ctx.exception))
        button = ('<button class="calc-option-btn" data-loc="dahab" data-price="0">'
                  '<span class="calc-opt-name">Дахаб</span><span class="calc-opt-price" data-p="locations.dahab.surcharge" '
                  'data-pf="plus">+$0</span><span class="calc-opt-sub">🚗 трансфер: <span data-p="locations.dahab.transfer">$0</span></span></button>')
        html2 = self.html.replace('<button class="calc-option-btn" data-loc="desert"', button + '<button class="calc-option-btn" data-loc="desert"', 1)
        new = ap.render(html2, p)
        self.assertIn('data-loc="dahab" data-price="15" data-transfer="60"', new)
        self.assertIn("Дахаб — $60", new)  # попал в список трансферов в FAQ и Schema

    def test_orphans_and_bad_paths_fail_loudly(self):
        with self.assertRaises(ap.RuleError):  # кнопка без позиции в prices.json
            ap.render(self.html.replace('<button class="calc-option-btn" data-loc="desert"',
                                        '<button class="calc-option-btn" data-loc="mars"', 1), self.p0)
        with self.assertRaises(ap.RuleError):  # неизвестный путь в data-p
            ap.render(self.html.replace('data-p="types.family.price"', 'data-p="types.nope.price"', 1), self.p0)
        with self.assertRaises(ap.RuleError):  # Offer с неизвестным sku
            ap.render(self.html.replace('"sku": "type:family"', '"sku": "type:nope"', 1), self.p0)
        with self.assertRaises(ap.RuleError):  # чекбокс без позиции
            ap.render(self.html.replace('data-extra="raw"', 'data-extra="zzz"', 1), self.p0)

    def test_price_validation(self):
        p = copy.deepcopy(self.p0)
        for bad in (0, -1, "1", 1.5, True):
            p["types"]["family"]["price"] = bad
            with self.assertRaises(ap.RuleError):
                ap.render(self.html, p)

    def test_update_validation(self):
        for key, value in (("types.family.name", 1), ("types.family.price", "9"), ("types.family.price", True),
                           ("types.family.price", 10000), ("types.x.price", 1), ("locations.cliff.price", 1),
                           ("locations.cliff.aliases", 1)):
            with self.assertRaises(ap.RuleError, msg=f"{key}={value!r}"):
                up.apply_changes(copy.deepcopy(self.p0), {key: value})

    def test_dump_format_is_stable(self):
        with open(ap.PRICES, encoding="utf-8", newline="") as f:
            self.assertEqual(up.dump_prices(self.p0), f.read().replace("\r\n", "\n"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
