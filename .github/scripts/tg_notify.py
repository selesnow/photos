"""
Отправка сообщения в Telegram-чат из GitHub Action.

  MESSAGE="текст" PAYLOAD='{"chat_id": 123}' TELEGRAM_BOT_TOKEN=... python .github/scripts/tg_notify.py

Не зависит от Pillow и остальных скриптов, чтобы лёгкие workflow (цены) не ставили лишнего.
"""

import json
import os
import sys
import urllib.parse
import urllib.request

API = os.environ.get("TELEGRAM_API", "https://api.telegram.org")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    chat_id = json.loads(os.environ["PAYLOAD"])["chat_id"]
    data = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": os.environ["MESSAGE"],
        "disable_web_page_preview": "true",
    }).encode()
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    with urllib.request.urlopen(f"{API}/bot{token}/sendMessage", data, timeout=30) as r:
        res = json.load(r)
    if not res.get("ok"):
        sys.exit(f"Не удалось отправить уведомление: {res.get('description')}")


if __name__ == "__main__":
    main()
