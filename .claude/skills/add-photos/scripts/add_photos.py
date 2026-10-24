"""
Добавление новых фото в портфолио (используется навыком add-photos).

  python .claude/skills/add-photos/scripts/add_photos.py find
      Показать новые фото (файлы с нечисловыми именами) в img/family, img/couple, img/single
      и список локаций, которые уже есть на сайте.

  python .claude/skills/add-photos/scripts/add_photos.py add <раздел> "<Локация>" [файл ...] [--new-location]
      Раздел: family | couple | single.
      Локация должна в точности совпадать с уже существующей на сайте, иначе скрипт
      остановится (защита от опечаток вроде «Утес»). --new-location — для новой локации.
      Без списка файлов берутся все новые фото раздела (по алфавиту = по времени съёмки).
      1. Переименовывает в следующие свободные номера (N.jpg, N+1.jpg ...).
      2. Делает WebP + миниатюры только для этих файлов (функциями из optimize_images.py).
      3. Вставляет слайды в НАЧАЛО раздела портфолио в index.html.
      4. Вставляет картинки в начало блока раздела в sitemap.xml и обновляет lastmod.
      Фото разных локаций добавляйте отдельными вызовами с явным списком файлов.
"""

import datetime
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True  # не мусорить __pycache__ в корне сайта
import optimize_images as oi  # noqa: E402
IMG = ROOT / "img"
INDEX = ROOT / "index.html"
SITEMAP = ROOT / "sitemap.xml"
SITE = "https://christina-hurghada.photos"
SOURCE_EXT = {".jpg", ".jpeg", ".png"}

SECTIONS = {
    "family": "Семейное фото",
    "couple": "Парное фото",
    "single": "Индивидуальное фото",
}


def new_files(section: str) -> list[Path]:
    d = IMG / section
    return sorted(p for p in d.iterdir()
                  if p.is_file() and p.suffix.lower() in SOURCE_EXT and not p.stem.isdigit())


def known_locations(html: str) -> list[str]:
    return sorted(set(re.findall(r'data-location="([^"]+)"', html)))


def next_number(section: str) -> int:
    nums = [int(p.stem) for p in (IMG / section).iterdir() if p.stem.isdigit()]
    return max(nums, default=0) + 1


def slide(section: str, n: int, location: str) -> str:
    return (f'            <div class="swiper-slide"><div class="swiper-slide-photo" '
            f'data-full="img/{section}/{n}.webp" data-location="{location}">'
            f'<span class="photo-loc-badge"><i class="ri-map-pin-2-line"></i> {location}</span>'
            f'<img src="img/{section}/thumb/{n}.webp" alt="{SECTIONS[section]} {n}" loading="lazy">'
            f'<div class="photo-overlay"><span class="photo-zoom-btn">'
            f'<i class="ri-search-eye-line"></i></span></div></div></div>\n')


def insert_html(section: str, nums: list[int], location: str) -> None:
    text = INDEX.read_text(encoding="utf-8")
    m = re.search(rf'id="tab-{section}".*?<div class="swiper-wrapper">\r?\n', text, re.S)
    if not m:
        sys.exit(f"Не найден раздел tab-{section} в index.html")
    nl = "\r\n" if "\r\n" in m.group(0) else "\n"
    block = "".join(slide(section, n, location) for n in nums).replace("\n", nl)
    INDEX.write_text(text[:m.end()] + block + text[m.end():], encoding="utf-8", newline="")


def insert_sitemap(section: str, nums: list[int]) -> None:
    text = SITEMAP.read_text(encoding="utf-8")
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = "".join(f"    <image:image><image:loc>{SITE}/img/{section}/{n}.webp"
                    f"</image:loc></image:image>{nl}" for n in nums)
    m = re.search(rf"^[ \t]*<image:image><image:loc>{re.escape(SITE)}/img/{section}/", text, re.M)
    pos = m.start() if m else text.index("  </url>")
    text = text[:pos] + lines + text[pos:]
    today = datetime.date.today().isoformat()
    text = re.sub(r"<lastmod>[^<]*</lastmod>", f"<lastmod>{today}</lastmod>", text, count=1)
    SITEMAP.write_text(text, encoding="utf-8", newline="")


def optimize(src: Path) -> None:
    """WebP + миниатюра только для этого файла — теми же функциями, что и optimize_images.py."""
    dst = src.with_suffix(".webp")
    oi.convert(src, dst, oi.MAX_FULL_SIDE, oi.QUALITY_FULL)
    oi.make_thumb(src, src.parent / "thumb" / dst.name)
    print(f"  WebP: {dst.relative_to(ROOT)}  "
          f"{oi.human(src.stat().st_size)} -> {oi.human(dst.stat().st_size)}, миниатюра готова")


def cmd_find() -> None:
    html = INDEX.read_text(encoding="utf-8")
    for s in SECTIONS:
        files = new_files(s)
        print(f"{s}: " + (", ".join(p.name for p in files) if files else "нет новых фото"))
    print("Локации на сайте: " + ", ".join(known_locations(html)))


def cmd_add(section: str, location: str, names: list[str], new_location: bool) -> None:
    if section not in SECTIONS:
        sys.exit(f"Неизвестный раздел: {section}. Допустимо: {', '.join(SECTIONS)}")
    files = [IMG / section / n for n in names] if names else new_files(section)
    if not files:
        sys.exit(f"В img/{section} нет новых фото")
    for f in files:
        if not f.exists():
            sys.exit(f"Файл не найден: {f}")
    known = known_locations(INDEX.read_text(encoding="utf-8"))
    if location not in known and not new_location:
        sys.exit(f"Локации «{location}» нет на сайте (есть: {', '.join(known)}). "
                 f"Проверьте написание; для действительно новой локации добавьте --new-location.")

    n = next_number(section)
    nums, renamed = [], []
    for f in files:
        dst = f.with_name(f"{n}{f.suffix.lower()}")
        f.rename(dst)
        print(f"  {section}/{f.name} -> {dst.name}")
        nums.append(n)
        renamed.append(dst)
        n += 1

    for src in renamed:
        optimize(src)
    insert_html(section, nums, location)
    insert_sitemap(section, nums)
    oi.check_html()
    print(f"\nДобавлено в начало раздела {section} ({location}): {', '.join(map(str, nums))}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # кириллица в консоли Windows
    sys.stderr.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    new_location = "--new-location" in args
    args = [a for a in args if a != "--new-location"]
    if args[:1] == ["find"]:
        cmd_find()
    elif args[:1] == ["add"] and len(args) >= 3:
        cmd_add(args[1], args[2], args[3:], new_location)
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
