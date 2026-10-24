"""
Оптимизация изображений сайта в WebP.

Запуск:  python optimize_images.py
         python optimize_images.py --force   (пересоздать все WebP заново)

Что делает:
  1. Для каждого .jpg/.jpeg/.png в папке img/ создаёт рядом .webp с тем же именем
     (img/family/2.jpg -> img/family/2.webp). Оригиналы не трогает.
  2. Пропускает файлы, у которых .webp уже есть и он новее оригинала —
     обрабатываются только новые или изменённые фото.
  3. Полные фото уменьшает до MAX_FULL_SIDE по длинной стороне,
     миниатюры (папки thumb/) оставляет в исходном размере.
  4. В подпапках img/ (family, couple, reviews ...) создаёт миниатюру
     thumb/<имя>.webp, если её ещё нет.
  5. Проверяет index.html: какие пути ещё указывают на .jpg/.png
     и нет ли ссылок на несуществующие файлы.

Нужен Pillow:  pip install Pillow
"""

import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
IMG_DIR = ROOT / "img"
HTML_FILES = [ROOT / "index.html", ROOT / "404.html"]

SOURCE_EXT = {".jpg", ".jpeg", ".png"}
# Файлы, которые остаются в JPG (превью для соцсетей/мессенджеров)
SKIP_FILES = {"og-image.jpg"}

MAX_FULL_SIDE = 2000   # px, длинная сторона полного фото
THUMB_WIDTH = 400      # px, ширина миниатюры
QUALITY_FULL = 82
QUALITY_THUMB = 80


def is_thumb(path: Path) -> bool:
    return path.parent.name == "thumb"


def needs_update(src: Path, dst: Path, force: bool) -> bool:
    return force or not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime


def open_image(src: Path) -> Image.Image:
    im = Image.open(src)
    im = ImageOps.exif_transpose(im)  # учесть поворот из EXIF
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    return im


def save_webp(im: Image.Image, dst: Path, quality: int) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=quality, method=6)


def convert(src: Path, dst: Path, max_side: int | None, quality: int) -> None:
    im = open_image(src)
    if max_side and max(im.size) > max_side:
        im.thumbnail((max_side, max_side), Image.LANCZOS)
    save_webp(im, dst, quality)


def make_thumb(src: Path, dst: Path) -> None:
    im = open_image(src)
    if im.width > THUMB_WIDTH:
        h = round(im.height * THUMB_WIDTH / im.width)
        im = im.resize((THUMB_WIDTH, h), Image.LANCZOS)
    save_webp(im, dst, QUALITY_THUMB)


def human(n: int) -> str:
    return f"{n / 1024 / 1024:.1f} МБ" if n >= 1024 * 1024 else f"{n / 1024:.0f} КБ"


def check_html() -> None:
    print("\nПроверка HTML:")
    ok = True
    for html in HTML_FILES:
        if not html.exists():
            continue
        text = html.read_text(encoding="utf-8")
        refs = set(re.findall(r'["\'(](img/[^"\')\s]+)', text))
        legacy = sorted(r for r in refs
                        if Path(r).suffix.lower() in SOURCE_EXT and Path(r).name not in SKIP_FILES)
        missing = sorted(r for r in refs if not (ROOT / r).exists())
        for r in legacy:
            print(f"  [{html.name}] ещё не WebP: {r}")
        for r in missing:
            print(f"  [{html.name}] файл не найден: {r}")
        ok = ok and not legacy and not missing
    if ok:
        print("  Все ссылки на изображения указывают на существующие WebP.")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # кириллица в консоли Windows
    force = "--force" in sys.argv
    sources = sorted(p for p in IMG_DIR.rglob("*")
                     if p.suffix.lower() in SOURCE_EXT and p.name not in SKIP_FILES)

    converted = thumbs = 0
    size_before = size_after = 0

    for src in sources:
        dst = src.with_suffix(".webp")
        if needs_update(src, dst, force):
            if is_thumb(src):
                convert(src, dst, None, QUALITY_THUMB)
            else:
                convert(src, dst, MAX_FULL_SIDE, QUALITY_FULL)
            converted += 1
            size_before += src.stat().st_size
            size_after += dst.stat().st_size
            print(f"  WebP: {dst.relative_to(ROOT)}  "
                  f"{human(src.stat().st_size)} -> {human(dst.stat().st_size)}")

        # Миниатюры для фото в подпапках img/<раздел>/, если их нет
        if not is_thumb(src) and src.parent != IMG_DIR:
            thumb_dst = src.parent / "thumb" / f"{src.stem}.webp"
            thumb_src = next((src.parent / "thumb" / f"{src.stem}{e}"
                              for e in SOURCE_EXT
                              if (src.parent / "thumb" / f"{src.stem}{e}").exists()), None)
            if thumb_src is None and needs_update(src, thumb_dst, force):
                make_thumb(src, thumb_dst)
                thumbs += 1
                print(f"  Миниатюра: {thumb_dst.relative_to(ROOT)}")

    print(f"\nГотово. Сконвертировано: {converted}, новых миниатюр: {thumbs}.")
    if converted:
        saved = size_before - size_after
        print(f"Вес: {human(size_before)} -> {human(size_after)} "
              f"(экономия {human(saved)}, {saved / size_before:.0%}).")
    else:
        print("Все изображения уже оптимизированы.")

    check_html()


if __name__ == "__main__":
    main()
