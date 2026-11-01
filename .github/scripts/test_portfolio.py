"""
Проверки управления портфолио. Запуск:  python -I .github/scripts/test_portfolio.py
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
import portfolio as port

ROOT = Path(__file__).resolve().parents[2]


class PortfolioTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)

        # Копируем реальные index.html, sitemap.xml и prices.json во временную папку
        self.tmp_index = self.tmp_path / "index.html"
        self.tmp_sitemap = self.tmp_path / "sitemap.xml"
        self.tmp_prices = self.tmp_path / "prices.json"
        shutil.copy2(ROOT / "index.html", self.tmp_index)
        shutil.copy2(ROOT / "sitemap.xml", self.tmp_sitemap)
        shutil.copy2(ROOT / "prices.json", self.tmp_prices)

        # Создаём фиктивную структуру картинок img/<section>/N.webp и thumb/N.webp
        self.tmp_img = self.tmp_path / "img"
        for sec in ("family", "couple", "single"):
            (self.tmp_img / sec / "thumb").mkdir(parents=True, exist_ok=True)
            for p in port.get_photos(sec):
                n = p["number"]
                (self.tmp_img / sec / f"{n}.webp").write_bytes(b"webp")
                (self.tmp_img / sec / "thumb" / f"{n}.webp").write_bytes(b"thumb")

        # Перенаправляем пути модуля
        self.orig_index = port.INDEX
        self.orig_sitemap = port.SITEMAP
        self.orig_prices = port.PRICES
        self.orig_root = port.ROOT

        port.INDEX = self.tmp_index
        port.SITEMAP = self.tmp_sitemap
        port.PRICES = self.tmp_prices
        port.ROOT = self.tmp_path

    def tearDown(self):
        port.INDEX = self.orig_index
        port.SITEMAP = self.orig_sitemap
        port.PRICES = self.orig_prices
        port.ROOT = self.orig_root
        self.tmp.cleanup()

    def test_get_photos(self):
        family = port.get_photos("family")
        self.assertGreaterEqual(len(family), 9)
        self.assertEqual(family[0]["number"], 2)
        self.assertEqual(family[0]["location"], "Утёс")

    def test_set_location(self):
        # Меняем локацию фото №2 в семейных на "Пустыня"
        changed = port.set_location("family", 2, "Пустыня")
        self.assertTrue(changed)

        family = port.get_photos("family")
        self.assertEqual(family[0]["location"], "Пустыня")

        # Повторный вызов не меняет файл
        changed_again = port.set_location("family", 2, "Пустыня")
        self.assertFalse(changed_again)

        # Неизвестная локация вызывает SystemExit
        with self.assertRaises(SystemExit):
            port.set_location("family", 2, "Несуществующая локация")

    def test_delete_photo(self):
        # Удаляем фото №2 из семейных
        deleted = port.delete("family", [2])
        self.assertEqual(deleted, [2])

        family = port.get_photos("family")
        self.assertNotIn(2, [p["number"] for p in family])

        # Файлы удалены
        self.assertFalse((self.tmp_img / "family" / "2.webp").exists())
        self.assertFalse((self.tmp_img / "family" / "thumb" / "2.webp").exists())

        # Из sitemap удалена строка
        sitemap_text = self.tmp_sitemap.read_text(encoding="utf-8")
        self.assertNotIn("family/2.webp", sitemap_text)

    def test_delete_min_photos_guard(self):
        # Попытка удалить слишком много фото (меньше 4) должна отклоняться
        family = port.get_photos("family")
        nums = [p["number"] for p in family]
        # Всего 9, удаляем 6 -> останется 3 (< MIN_PHOTOS = 4)
        to_delete = nums[:6]
        with self.assertRaises(SystemExit) as ctx:
            port.delete("family", to_delete)
        self.assertIn("должно остаться не меньше 4", str(ctx.exception))

    def test_event_process_set_location(self):
        out_file = self.tmp_path / "github_output"
        os.environ["GITHUB_OUTPUT"] = str(out_file)
        os.environ["PAYLOAD"] = json.dumps({
            "chat_id": 12345,
            "action": "set_location",
            "category": "family",
            "number": 2,
            "location": "Пустыня",
        })
        port.event_process()

        out_content = out_file.read_text(encoding="utf-8")
        self.assertIn("changed=1", out_content)
        self.assertIn("chat_id=12345", out_content)
        self.assertIn("Локация фото №2 (Семейные) изменена на «Пустыня»", out_content)

    def test_event_process_delete(self):
        out_file = self.tmp_path / "github_output"
        os.environ["GITHUB_OUTPUT"] = str(out_file)
        os.environ["PAYLOAD"] = json.dumps({
            "chat_id": 12345,
            "action": "delete",
            "category": "family",
            "numbers": [2],
        })
        port.event_process()

        out_content = out_file.read_text(encoding="utf-8")
        self.assertIn("changed=1", out_content)
        self.assertIn("chat_id=12345", out_content)
        self.assertIn("Фото удалены (Семейные): №2", out_content)


if __name__ == "__main__":
    unittest.main()
