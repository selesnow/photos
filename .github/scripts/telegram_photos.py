"""
Загрузка фото из Telegram в портфолио (вызывается GitHub Action .github/workflows/photos.yml).

  python .github/scripts/telegram_photos.py process   — скачать фото пачки и добавить на сайт

Данные пачки приходят от Cloudflare Worker (репозиторий tg-chat-worker) событием
repository_dispatch → переменная окружения PAYLOAD (JSON):
  {"batch": "a1b2c3d4", "chat_id": 123, "category": "family", "location": "Утёс",
   "files": [{"file_id": "...", "name": "IMG_1.jpg", "mime": "image/jpeg"}, ...]}

Файлы скачиваются из Telegram по file_id, дальше всё делает add_photos.py (тот же скрипт,
что и у навыка add-photos): номера, WebP, миниатюры, слайды в начале раздела, sitemap.
Оригиналы после конвертации удаляются, в репозиторий попадают только WebP.

Уведомления в чат отправляет tg_notify.py.

Переменные окружения: PAYLOAD, TELEGRAM_BOT_TOKEN,
GITHUB_OUTPUT (куда записать count/summary для следующих шагов), TELEGRAM_API (для тестов).
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".claude" / "skills" / "add-photos" / "scripts"))
sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True
import add_photos as ap  # noqa: E402

API = os.environ.get("TELEGRAM_API", "https://api.telegram.org")
MAX_FILES = 20
MAX_BYTES = 20 * 1024 * 1024
CATEGORY_NAMES = {"family": "Семейные", "couple": "Парные", "single": "Индивидуальные"}


def telegram(method: str, **params) -> dict:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    data = urllib.parse.urlencode(params).encode()
    with urllib.request.urlopen(f"{API}/bot{token}/{method}", data, timeout=30) as r:
        return json.load(r)


def download(file_id: str, dst_base: Path) -> Path:
    """Скачать файл из Telegram. Возвращает путь с подходящим расширением (jpg/jpeg/png)."""
    info = telegram("getFile", file_id=file_id)
    if not info.get("ok"):
        raise RuntimeError(f"Telegram не отдал файл: {info.get('description', 'неизвестная ошибка')}")
    file_path = info["result"]["file_path"]
    if info["result"].get("file_size", 0) > MAX_BYTES:
        raise RuntimeError("файл больше 20 МБ")

    ext = Path(file_path).suffix.lower() or ".jpg"
    raw = dst_base.with_suffix(ext)
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    with urllib.request.urlopen(f"{API}/file/bot{token}/{file_path}", timeout=60) as r:
        raw.write_bytes(r.read(MAX_BYTES + 1))
    if raw.stat().st_size > MAX_BYTES:
        raw.unlink()
        raise RuntimeError("файл больше 20 МБ")

    # Проверяем, что это действительно картинка, и приводим WebP/прочее к PNG (add_photos берёт jpg/png)
    from PIL import Image
    try:
        with Image.open(raw) as im:
            im.verify()
        fmt = Image.open(raw).format
    except Exception as e:  # noqa: BLE001
        raw.unlink(missing_ok=True)
        raise RuntimeError(f"это не изображение ({e.__class__.__name__})") from e

    if fmt in ("JPEG", "PNG"):
        want = ".png" if fmt == "PNG" else ".jpg"
        if raw.suffix != want:
            raw = raw.rename(dst_base.with_suffix(want))
        return raw

    png = dst_base.with_suffix(".png")
    from PIL import ImageOps
    im = ImageOps.exif_transpose(Image.open(raw))
    im.save(png, "PNG")
    raw.unlink()
    return png


def write_output(**values) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        for k, v in values.items():
            f.write(f"{k}={v}\n")


def cmd_process() -> None:
    payload = json.loads(os.environ["PAYLOAD"])
    batch = str(payload.get("batch", ""))
    category = payload.get("category")
    location = payload.get("location")
    files = payload.get("files") or []

    if not re.fullmatch(r"[A-Za-z0-9]{1,16}", batch):
        sys.exit("Некорректный ID пачки")
    if category not in CATEGORY_NAMES:
        sys.exit(f"Неизвестная категория: {category!r}")
    if not isinstance(location, str) or not location:
        sys.exit("Не указана локация")
    if not files or len(files) > MAX_FILES:
        sys.exit(f"Ожидалось от 1 до {MAX_FILES} фото, пришло {len(files)}")

    # Имена tg_<пачка>_<NN> сортируются в порядке отправки, add_photos присвоит номера по этому порядку
    section_dir = ap.IMG / category
    names = []
    for i, f in enumerate(files, start=1):
        print(f"Скачиваю {i}/{len(files)}…")
        path = download(f["file_id"], section_dir / f"tg_{batch}_{i:02d}")
        names.append(path.name)

    try:
        ap.cmd_add(category, location, names, new_location=False, drop_originals=True)
    except SystemExit as e:  # add_photos сообщает об ошибках через sys.exit(текст)
        raise SystemExit(str(e.code))

    summary = f"{len(files)} фото, {CATEGORY_NAMES[category]}, {location}"
    write_output(count=len(files), summary=summary, chat_id=payload["chat_id"])
    print(f"\nГотово: {summary}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "process":
        cmd_process()
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
