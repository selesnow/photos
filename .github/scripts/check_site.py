"""
Проверка, что правки сайта не сломали автоматизации (запускается локально и в Action check.yml).

  python -I .github/scripts/check_site.py

Что проверяет (каждый пункт соответствует тому, на что опираются бот и Action'ы):
  1. цены в index.html соответствуют prices.json, все data-p / data-type / data-loc / data-extra / sku
     указывают на существующие позиции (правила apply_prices.py находят свои места);
  2. у каждого типа и локации из prices.json есть всё, что нужно сайту: кнопка калькулятора, карточка
     (цены / локации), Offer в Schema.org; и наоборот, на странице нет «осиротевших» карточек;
  3. у локаций заполнены photo_name и aliases (по ним бот предлагает локацию фото и разбирает подписи);
  4. вёрстка трёх слайдеров портфолио, куда add_photos.py вставляет новые фото;
  5. каждый слайд портфолио ссылается на существующие фото и миниатюру;
  6. sitemap.xml: опорные строки, куда add_photos.py вставляет картинки;
  7. все локации в портфолио известны prices.json (поле photo_name);
  8. все блоки JSON-LD (Schema.org) остаются валидным JSON;
  9. в index.html подключён чат.

Код возврата 1, если что-то сломано; сообщения написаны так, чтобы было понятно, что чинить.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
import apply_prices as ap  # noqa: E402

SECTIONS = ("family", "couple", "single")
SITE = "https://christina-hurghada.photos"


def read(path: Path) -> str:
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def check() -> list[str]:
    errors: list[str] = []
    html = read(ap.INDEX)
    p = ap.load_prices()
    types, locs = p["types"], p["locations"]

    # 1. цены и все привязки по идентификаторам
    try:
        if ap.render(html, p) != html:
            errors.append("Цены в index.html не соответствуют prices.json: запустите "
                          "python .github/scripts/apply_prices.py (или верните ручную правку цены).")
    except ap.RuleError as e:
        errors.append(f"Автоматика цен: {e}")

    # 2. полнота: каждая позиция prices.json присутствует на странице, и наоборот
    cards = set(re.findall(r'<div class="package-card[^"]*" data-type="(\w+)"', html))
    for key in sorted(set(types) - cards):
        errors.append(f'Для типа «{types[key]["name"]}» ({key}) нет карточки в разделе цен: добавьте '
                      f'<div class="package-card" data-type="{key}"> по образцу соседних.')
    for key in sorted(cards - set(types)):
        errors.append(f'Карточка цен data-type="{key}" не найдена в prices.json (types): добавьте тип или уберите карточку.')

    loc_cards = set(re.findall(r'<div class="location-card" data-loc="(\w+)"', html))
    for key in sorted(set(locs) - loc_cards):
        errors.append(f'Для локации «{locs[key]["name"]}» ({key}) нет карточки в разделе локаций: добавьте '
                      f'<div class="location-card" data-loc="{key}"> с меткой доплаты '
                      f'<span data-p="locations.{key}.surcharge" data-pf="tag"></span> внутри location-tag.')
    for key in sorted(loc_cards - set(locs)):
        errors.append(f'Карточка локации data-loc="{key}" не найдена в prices.json (locations).')

    offers = set(re.findall(r'"sku": "type:(\w+)"', html))
    for key in sorted(set(types) - offers):
        errors.append(f'В Schema.org нет Offer для типа «{types[key]["name"]}»: добавьте в hasOfferCatalog '
                      f'Offer с "sku": "type:{key}" (по образцу соседних).')

    # 3. данные локаций для бота
    names = set()
    for key, loc in locs.items():
        photo = loc.get("photo_name")
        aliases = loc.get("aliases")
        if not photo or not isinstance(photo, str):
            errors.append(f"locations.{key}: не заполнено photo_name (название локации на фото портфолио).")
        elif photo in names:
            errors.append(f"locations.{key}: photo_name «{photo}» уже используется другой локацией.")
        names.add(photo)
        if not aliases or not isinstance(aliases, list) or not all(isinstance(a, str) and a.strip() for a in aliases):
            errors.append(f"locations.{key}: aliases должен быть непустым списком слов для разбора подписи к фото.")

    # 4. слайдеры портфолио
    for s in SECTIONS:
        # Та же строгая структура, что в add_photos.py: вкладка → слайдер → wrapper → перевод строки
        if not re.search(rf'id="tab-{s}">\s*<div class="swiper swiper-{s}">\s*<div class="swiper-wrapper">\r?\n', html):
            errors.append(f'Не найден блок портфолио id="tab-{s}" со вложенными «<div class="swiper swiper-{s}">» и '
                          f'«<div class="swiper-wrapper">» и переводом строки после него: туда add_photos.py '
                          f"(и бот) вставляют новые фото.")

    # 5. слайды → файлы
    for src in re.findall(r'data-full="(img/(?:family|couple|single)/\d+\.webp)"', html):
        path = ROOT / src
        thumb = path.parent / "thumb" / path.name
        if not path.exists():
            errors.append(f"Слайд ссылается на несуществующее фото: {src}")
        if not thumb.exists():
            errors.append(f"Нет миниатюры для слайда: {thumb.relative_to(ROOT).as_posix()}")

    # 6. sitemap
    sitemap = read(ROOT / "sitemap.xml")
    if "<lastmod>" not in sitemap or "  </url>" not in sitemap:
        errors.append("В sitemap.xml нет <lastmod> или закрывающей строки «  </url>»: на них опирается add_photos.py.")
    for s in SECTIONS:
        if not re.search(rf"^[ \t]*<image:image><image:loc>{re.escape(SITE)}/img/{s}/", sitemap, re.M):
            errors.append(f"В sitemap.xml нет ни одной картинки раздела {s} в привычном формате "
                          f"(опорная строка для вставки новых фото).")

    # 7. локации портфолио известны prices.json
    unknown = sorted(set(re.findall(r'data-location="([^"]+)"', html)) - names)
    if unknown:
        errors.append(f"В портфолио есть локации, которых нет в prices.json (photo_name): {', '.join(unknown)}. "
                      f"Добавьте локацию в prices.json (с photo_name и aliases), иначе бот её не предложит.")

    # 8. JSON-LD
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    if not blocks:
        errors.append("В index.html не найдены блоки JSON-LD (Schema.org).")
    for i, block in enumerate(blocks, 1):
        try:
            json.loads(block)
        except ValueError as e:
            errors.append(f"JSON-LD блок №{i} невалиден: {e}")

    # 9. чат
    for needle in ("chat.css", "chat.js"):
        if needle not in html:
            errors.append(f"В index.html не подключён {needle}: пропадёт чат на сайте.")

    return errors


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    errors = check()
    if errors:
        print(f"Найдено проблем: {len(errors)}")
        for e in errors:
            print(f"  ✗ {e}")
        sys.exit(1)
    print("Всё в порядке: автоматизации (цены, фото, чат) найдут свои места на сайте.")


if __name__ == "__main__":
    main()
