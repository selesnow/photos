"""
Управление портфолио сайта: просмотр списка фото, удаление фото, изменение плашки локации.

  python .github/scripts/portfolio.py list <family|couple|single> [--json]
  python .github/scripts/portfolio.py delete <family|couple|single> <номер> [номер ...]
  python .github/scripts/portfolio.py set-location <family|couple|single> <номер> "<Локация>"
  python .github/scripts/portfolio.py event-process

Используется Action'ами (по командам из Telegram-бота) и работает локально.

Как устроено:
  • слайд в слайдере tab-<раздел> содержит разметку с data-full="img/<раздел>/N.webp" и data-location="<Локация>";
  • удаление вырезает слайд из index.html, строку из sitemap.xml, удаляет WebP и thumb/WebP;
  • изменение локации обновляет data-location="..." и <span class="photo-loc-badge">;
  • локация должна в точности совпадать с photo_name в prices.json;
  • в каждом разделе должно оставаться не меньше MIN_PHOTOS (4) фото для корректной работы Swiper c loop.
"""

import datetime
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "index.html"
SITEMAP = ROOT / "sitemap.xml"
PRICES = ROOT / "prices.json"
SITE = "https://christina-hurghada.photos"
MIN_PHOTOS = 4

SECTIONS = {
    "family": "Семейные",
    "couple": "Парные",
    "single": "Индивидуальные",
}


def read_index() -> str:
    with open(INDEX, encoding="utf-8", newline="") as f:
        return f.read()


def write_index(text: str) -> None:
    with open(INDEX, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def read_sitemap() -> str:
    with open(SITEMAP, encoding="utf-8", newline="") as f:
        return f.read()


def write_sitemap(text: str) -> None:
    with open(SITEMAP, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def known_locations() -> set[str]:
    with open(PRICES, encoding="utf-8") as f:
        data = json.load(f)
    return {loc["photo_name"] for loc in data.get("locations", {}).values() if "photo_name" in loc}


def get_photos(section: str) -> list[dict]:
    """Возвращает фото раздела: [{'number': 2, 'location': 'Утёс'}, ...] в порядке расположения в слайдере."""
    if section not in SECTIONS:
        sys.exit(f"Неизвестный раздел: {section}. Допустимо: {', '.join(SECTIONS)}")

    html = read_index()
    tab_m = re.search(
        rf'id="tab-{section}"[^>]*>.*?<div class="swiper-wrapper">\s*(.*?)\s*</div>\s*<div class="swiper-controls">',
        html,
        re.S,
    )
    if not tab_m:
        sys.exit(f"Не найден раздел tab-{section} в index.html")

    wrapper_html = tab_m.group(1)
    pat = rf'data-full="img/{section}/(\d+)\.webp"\s+data-location="([^"]*)"'
    return [{"number": int(m[0]), "location": m[1]} for m in re.findall(pat, wrapper_html)]


def delete(section: str, nums: list[int]) -> list[int]:
    """Удаляет фото из раздела портфолио. Возвращает реально удалённые номера."""
    if section not in SECTIONS:
        sys.exit(f"Неизвестный раздел: {section}. Допустимо: {', '.join(SECTIONS)}")

    html = read_index()
    photos = get_photos(section)
    present = [p["number"] for p in photos]
    todo = [n for n in dict.fromkeys(nums) if n in present]

    if len(present) - len(todo) < MIN_PHOTOS:
        sys.exit(
            f"Нельзя удалить: в разделе «{SECTIONS[section]}» должно остаться не меньше {MIN_PHOTOS} фото "
            f"(сейчас {len(present)}, удалить хотели {len(todo)})."
        )

    for n in todo:
        pat = (
            rf'[ \t]*<div class="swiper-slide">\s*'
            rf'<div class="swiper-slide-photo"\s+data-full="img/{section}/{n}\.webp"\s+data-location="[^"]*">'
            rf'\s*<span class="photo-loc-badge"><i class="ri-map-pin-2-line"></i>\s*[^<]*</span>'
            rf'\s*<img\s+src="img/{section}/thumb/{n}\.webp"[^>]*>'
            rf'\s*<div class="photo-overlay"><span class="photo-zoom-btn"><i class="ri-search-eye-line"></i></span></div>'
            rf'\s*</div>\s*</div>\r?\n'
        )
        html, count = re.subn(pat, "", html, count=1)
        if count != 1:
            sys.exit(f"Не удалось аккуратно вырезать слайд фото {section} №{n}: разметка отличается от ожидаемой.")
    write_index(html)

    # Удаление из sitemap.xml
    sitemap = read_sitemap()
    sitemap_changed = False
    for n in todo:
        pat_sm = rf'^[ \t]*<image:image><image:loc>{re.escape(SITE)}/img/{section}/{n}\.webp</image:loc></image:image>\r?\n'
        sitemap, count = re.subn(pat_sm, "", sitemap, count=1, flags=re.M)
        if count:
            sitemap_changed = True
    if sitemap_changed:
        today = datetime.date.today().isoformat()
        sitemap = re.sub(r"<lastmod>[^<]*</lastmod>", f"<lastmod>{today}</lastmod>", sitemap, count=1)
        write_sitemap(sitemap)

    # Удаление файлов
    img_dir = ROOT / "img" / section
    for n in todo:
        for p in (
            img_dir / f"{n}.webp",
            img_dir / "thumb" / f"{n}.webp",
            *[img_dir / f"{n}{ext}" for ext in (".jpg", ".jpeg", ".png")],
        ):
            p.unlink(missing_ok=True)

    skipped = [n for n in nums if n not in todo]
    print(
        f"Удалено фото ({SECTIONS[section]}): {len(todo)} ({', '.join(map(str, todo)) or '—'})"
        + (f"; уже не было: {', '.join(map(str, skipped))}" if skipped else "")
    )
    return todo


def set_location(section: str, n: int, new_loc: str) -> bool:
    """Изменяет локацию фото. Возвращает True, если разметка была изменена."""
    if section not in SECTIONS:
        sys.exit(f"Неизвестный раздел: {section}. Допустимо: {', '.join(SECTIONS)}")

    valid_locs = known_locations()
    if new_loc not in valid_locs:
        sys.exit(f"Неизвестная локация: «{new_loc}». Допустимо: {', '.join(sorted(valid_locs))}")

    html = read_index()
    photos = get_photos(section)
    match = next((p for p in photos if p["number"] == n), None)
    if not match:
        sys.exit(f"Фото №{n} не найдено в разделе «{SECTIONS[section]}» на сайте")

    if match["location"] == new_loc:
        print(f"Фото {section} №{n} уже имеет локацию «{new_loc}»")
        return False

    pat = (
        rf'(<div class="swiper-slide-photo"\s+data-full="img/{section}/{n}\.webp"\s+data-location=")[^"]*(">'
        rf'\s*<span class="photo-loc-badge"><i class="ri-map-pin-2-line"></i>\s*)[^<]*(</span>)'
    )
    html, count = re.subn(pat, rf'\g<1>{new_loc}\g<2>{new_loc}\g<3>', html, count=1)
    if count != 1:
        sys.exit(f"Не удалось изменить плашку локации для фото {section} №{n}: разметка отличается от ожидаемой")

    write_index(html)
    print(f"Локация фото {section} №{n} изменена: «{match['location']}» -> «{new_loc}»")
    return True


def write_output(**values) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        for k, v in values.items():
            f.write(f"{k}={v}\n")


def event_process() -> None:
    """Обработка события от Telegram-бота через Cloudflare Worker."""
    payload = json.loads(os.environ["PAYLOAD"])
    action = payload.get("action")
    section = payload.get("category") or payload.get("section")
    chat_id = payload.get("chat_id")

    if section not in SECTIONS:
        sys.exit(f"В событии указан некорректный раздел: {section!r}")

    sec_name = SECTIONS[section]

    if action == "delete":
        nums = payload.get("numbers")
        if not isinstance(nums, list) or not nums or not all(type(n) is int and n > 0 for n in nums):
            sys.exit("В событии нет корректного списка номеров фото")
        removed = delete(section, nums)
        if removed:
            summary = f"Фото удалены ({sec_name}): " + ", ".join(f"№{n}" for n in removed)
            write_output(changed=len(removed), summary=summary, chat_id=chat_id)
        else:
            write_output(changed=0, summary="Таких фото на сайте уже нет", chat_id=chat_id)

    elif action == "set_location":
        n = payload.get("number")
        loc = payload.get("location")
        if not (type(n) is int and n > 0):
            sys.exit("В событии нет корректного номера фото")
        if not isinstance(loc, str) or not loc.strip():
            sys.exit("В событии нет корректной локации")
        changed = set_location(section, n, loc.strip())
        if changed:
            summary = f"Локация фото №{n} ({sec_name}) изменена на «{loc.strip()}»"
            write_output(changed=1, summary=summary, chat_id=chat_id)
        else:
            summary = f"Локация фото №{n} ({sec_name}) уже «{loc.strip()}»"
            write_output(changed=0, summary=summary, chat_id=chat_id)

    else:
        sys.exit(f"Неизвестное действие: {action!r}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    args = sys.argv[1:]

    if not args:
        print(__doc__)
        sys.exit(1)

    cmd = args[0]
    if cmd == "event-process":
        event_process()
    elif cmd == "list" and len(args) > 1:
        sec = args[1]
        as_json = "--json" in args[2:]
        photos = get_photos(sec)
        if as_json:
            print(json.dumps(photos, ensure_ascii=False, indent=2))
        else:
            print(f"{SECTIONS.get(sec, sec)} ({len(photos)} фото):")
            for p in photos:
                print(f"  №{p['number']}: {p['location']}")
    elif cmd == "delete" and len(args) > 2:
        sec = args[1]
        try:
            delete(sec, [int(a) for a in args[2:]])
        except ValueError:
            sys.exit("Номера фото должны быть числами")
    elif cmd == "set-location" and len(args) >= 4:
        sec = args[1]
        try:
            n = int(args[2])
        except ValueError:
            sys.exit("Номер фото должен быть числом")
        set_location(sec, n, args[3])
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
