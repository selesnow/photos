"""
Проверка, что правки сайта не сломали автоматизации (запускается локально и в Action check.yml).

  python -I .github/scripts/check_site.py

Что проверяет (каждый пункт соответствует тому, на что опираются бот и Action):
  1. цены в index.html соответствуют prices.json (правила apply_prices.py находят свои фрагменты);
  2. вёрстка трёх слайдеров портфолио, куда add_photos.py вставляет новые фото;
  3. каждый слайд портфолио ссылается на существующие фото и миниатюру;
  4. sitemap.xml: опорные строки, куда add_photos.py вставляет картинки;
  5. локации в портфолио известны боту (иначе он их не предложит и add_photos остановится);
  6. все блоки JSON-LD (Schema.org) остаются валидным JSON;
  7. в index.html подключён чат.

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
# Названия локаций, которые знает бот (tg-chat-worker/src/photos.js, LOCATIONS).
# Новая локация на сайте = обновить и этот список, и LOCATIONS в Worker.
KNOWN_LOCATIONS = {"Хургада (Мамша)", "Эль-Гуна", "Пустыня", "Утёс", "Море + Пустыня"}


def read(path: Path) -> str:
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def check() -> list[str]:
    errors: list[str] = []
    html = read(ap.INDEX)

    # 1. цены
    try:
        if ap.render(html, ap.load_prices()) != html:
            errors.append("Цены в index.html не соответствуют prices.json: запустите "
                          "python .github/scripts/apply_prices.py (или верните ручную правку цены).")
    except ap.RuleError as e:
        errors.append(f"Автоматика цен не находит своё место в index.html: {e}")

    # 2. слайдеры портфолио
    for s in SECTIONS:
        # Та же строгая структура, что в add_photos.py: вкладка → слайдер → wrapper → перевод строки
        if not re.search(rf'id="tab-{s}">\s*<div class="swiper swiper-{s}">\s*<div class="swiper-wrapper">\r?\n', html):
            errors.append(f'Не найден блок портфолио id="tab-{s}" со вложенными «<div class="swiper swiper-{s}">» и '
                          f'«<div class="swiper-wrapper">» и переводом строки после него: туда add_photos.py '
                          f"(и бот) вставляют новые фото.")

    # 3. слайды → файлы
    slides = re.findall(r'data-full="(img/(?:family|couple|single)/\d+\.webp)"', html)
    for src in slides:
        p = ROOT / src
        thumb = p.parent / "thumb" / p.name
        if not p.exists():
            errors.append(f"Слайд ссылается на несуществующее фото: {src}")
        if not thumb.exists():
            errors.append(f"Нет миниатюры для слайда: {thumb.relative_to(ROOT).as_posix()}")

    # 4. sitemap
    sitemap = read(ROOT / "sitemap.xml")
    if "<lastmod>" not in sitemap or "  </url>" not in sitemap:
        errors.append("В sitemap.xml нет <lastmod> или закрывающей строки «  </url>»: на них опирается add_photos.py.")
    for s in SECTIONS:
        if not re.search(rf"^[ \t]*<image:image><image:loc>{re.escape(SITE)}/img/{s}/", sitemap, re.M):
            errors.append(f"В sitemap.xml нет ни одной картинки раздела {s} в привычном формате "
                          f"(опорная строка для вставки новых фото).")

    # 5. локации
    unknown = sorted(set(re.findall(r'data-location="([^"]+)"', html)) - KNOWN_LOCATIONS)
    if unknown:
        errors.append(f"На сайте появились локации, которых не знает бот: {', '.join(unknown)}. Обновите LOCATIONS в "
                      f"tg-chat-worker/src/photos.js (и KNOWN_LOCATIONS в check_site.py), затем задеплойте Worker.")

    # 6. JSON-LD
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    if not blocks:
        errors.append("В index.html не найдены блоки JSON-LD (Schema.org).")
    for i, block in enumerate(blocks, 1):
        try:
            json.loads(block)
        except ValueError as e:
            errors.append(f"JSON-LD блок №{i} невалиден: {e}")

    # 7. чат
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
