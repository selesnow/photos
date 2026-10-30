"""
Отзывы клиентов на сайте (скриншоты): список, добавление, удаление.

  python .github/scripts/reviews.py list
  python .github/scripts/reviews.py add <файл> [файл ...]   файлы лежат в img/reviews/ и имеют нечисловые имена
  python .github/scripts/reviews.py delete <номер> [номер ...]

Используется Action'ами (отзывы приходят из Telegram-бота) и работает локально.

Как устроено:
  • отзыв = слайд в слайдере `.swiper-reviews` + img/reviews/N.webp (до 720 px в ширину) + img/reviews/thumb/N.webp;
  • новые отзывы встают в НАЧАЛО слайдера, номера сквозные (следующий = максимальный + 1, пропуски допустимы);
  • оригиналы (JPG/PNG) после конвертации удаляются, в репозиторий попадает только WebP;
  • удалять можно, пока на сайте остаётся не меньше MIN_REVIEWS отзывов: слайдер с loop и 3 слайдами в ряд
    при меньшем числе слайдов работает с ошибками.
Якорь вставки строгий (слайдер → wrapper → перевод строки): нестрогий поиск мог бы уйти в чужой слайдер.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True
import optimize_images as oi  # noqa: E402

IMG = ROOT / "img" / "reviews"
INDEX = ROOT / "index.html"
MAX_WIDTH = 720      # как у существующих отзывов (скриншоты телефона 720×1280)
MIN_REVIEWS = 3
SOURCE_EXT = {".jpg", ".jpeg", ".png"}
ANCHOR = re.compile(r'<div class="swiper swiper-reviews"[^>]*>\s*<div class="swiper-wrapper">\r?\n')


def read_index() -> str:
    with open(INDEX, encoding="utf-8", newline="") as f:
        return f.read()


def write_index(text: str) -> None:
    with open(INDEX, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def numbers(html: str) -> list[int]:
    """Номера отзывов в порядке на странице."""
    return [int(n) for n in re.findall(r'class="review-card" data-full="img/reviews/(\d+)\.webp"', html)]


def next_number() -> int:
    used = [int(p.stem) for p in IMG.iterdir() if p.is_file() and p.stem.isdigit()]
    return max(used + numbers(read_index()), default=0) + 1


def slide(n: int, nl: str = "\n") -> str:
    return (
        '          <div class="swiper-slide">\n'
        f'            <div class="review-card" data-full="img/reviews/{n}.webp">\n'
        f'              <img src="img/reviews/thumb/{n}.webp" srcset="img/reviews/thumb/{n}.webp 400w, img/reviews/{n}.webp 720w" '
        'sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" '
        f'alt="Отзыв клиента о фотосессии в Хургаде {n}" loading="lazy">\n'
        '              <div class="review-overlay"><span class="review-zoom-btn"><i class="ri-search-eye-line"></i></span></div>\n'
        '            </div>\n'
        '          </div>\n'
    ).replace("\n", nl)


def process(src: Path, n: int) -> None:
    """WebP до 720 px в ширину + миниатюра 400 px, теми же функциями, что у остальных фото сайта."""
    full = IMG / f"{n}.webp"
    im = oi.open_image(src)
    if im.width > MAX_WIDTH:
        im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)), oi.Image.LANCZOS)
    oi.save_webp(im, full, oi.QUALITY_FULL)
    oi.make_thumb(full, IMG / "thumb" / f"{n}.webp")


def add(names: list[str]) -> list[int]:
    files = [IMG / n for n in names]
    for f in files:
        if not f.is_file():
            sys.exit(f"Файл не найден: {f}")
        if f.suffix.lower() not in SOURCE_EXT:
            sys.exit(f"Неподдерживаемый формат: {f.name} (нужны JPG или PNG)")
        if f.stem.isdigit():
            sys.exit(f"{f.name}: имя из цифр занято под опубликованные отзывы")

    html = read_index()
    m = ANCHOR.search(html)
    if not m:
        sys.exit('Не найден слайдер отзывов: нужна разметка <div class="swiper swiper-reviews"> → '
                 '<div class="swiper-wrapper"> и перевод строки после него.')

    n = next_number()
    nums = []
    for f in files:
        process(f, n)
        f.unlink()  # оригинал в репозиторий не кладём
        print(f"  {f.name} -> reviews/{n}.webp (+ миниатюра)")
        nums.append(n)
        n += 1

    nl = "\r\n" if "\r\n" in m.group(0) else "\n"
    block = "".join(slide(x, nl) for x in nums)
    write_index(html[:m.end()] + block + html[m.end():])
    print(f"Добавлено отзывов: {len(nums)} (номера {', '.join(map(str, nums))}), в начало слайдера")
    return nums


def delete(nums: list[int]) -> list[int]:
    """Удаляет отзывы с сайта. Возвращает реально удалённые; уже отсутствующие пропускает (повтор безопасен)."""
    html = read_index()
    present = numbers(html)
    todo = [n for n in dict.fromkeys(nums) if n in present]
    if len(present) - len(todo) < MIN_REVIEWS:
        sys.exit(f"Нельзя удалить: на сайте должно остаться не меньше {MIN_REVIEWS} отзывов "
                 f"(сейчас {len(present)}, удалить хотели {len(todo)}).")

    for n in todo:
        pattern = (r'[ \t]*<div class="swiper-slide">\s*<div class="review-card" data-full="img/reviews/%d\.webp">'
                   r'\s*<img [^>]*>\s*<div class="review-overlay">.*?</div>\s*</div>\s*</div>\r?\n' % n)
        html, count = re.subn(pattern, "", html, count=1, flags=re.S)
        if count != 1:
            sys.exit(f"Не удалось аккуратно вырезать слайд отзыва №{n}: разметка отличается от ожидаемой.")
    write_index(html)

    for n in todo:
        for path in (IMG / f"{n}.webp", IMG / "thumb" / f"{n}.webp",
                     *[IMG / f"{n}{ext}" for ext in (".jpg", ".jpeg", ".png")]):
            path.unlink(missing_ok=True)
    skipped = [n for n in nums if n not in todo]
    print(f"Удалено отзывов: {len(todo)} ({', '.join(map(str, todo)) or '—'})"
          + (f"; уже не было: {', '.join(map(str, skipped))}" if skipped else ""))
    return todo


def event_delete() -> None:
    """Удаление по событию из бота: PAYLOAD = {"chat_id": …, "numbers": [N, …]}; итог в GITHUB_OUTPUT."""
    import json
    import os
    payload = json.loads(os.environ["PAYLOAD"])
    nums = payload.get("numbers")
    if not isinstance(nums, list) or not nums or not all(type(n) is int and n > 0 for n in nums) or len(nums) > 20:
        sys.exit("В событии нет корректного списка номеров отзывов")
    removed = delete(nums)
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"changed={len(removed)}\n")
            f.write("summary=" + ("Отзывы удалены: " + ", ".join(f"№{n}" for n in removed) if removed
                                  else "таких отзывов на сайте уже нет") + "\n")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if args[:1] == ["event-delete"]:
        event_delete()
    elif args[:1] == ["list"]:
        print(" ".join(map(str, numbers(read_index()))))
    elif args[:1] == ["add"] and len(args) > 1:
        add(args[1:])
    elif args[:1] == ["delete"] and len(args) > 1:
        try:
            delete([int(a) for a in args[1:]])
        except ValueError:
            sys.exit("Номера отзывов должны быть числами")
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
