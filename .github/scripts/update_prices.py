"""
Применение изменений цен, пришедших из Telegram-бота (вызывается Action .github/workflows/prices.yml).

  PAYLOAD='{"chat_id": 123, "changes": {"types.family.price": 180, "locations.cliff.transfer": 45}}' \\
    python .github/scripts/update_prices.py

Что делает:
  1. проверяет изменения: разрешены только цены (types.*.price, extras.*.price,
     locations.*.surcharge, locations.*.transfer), целые числа 0…9999, ключ должен существовать;
  2. обновляет prices.json;
  3. прогоняет apply_prices.py, то есть переписывает цены в index.html;
  4. пишет в GITHUB_OUTPUT: changed (число реально изменённых цен) и summary (список «было → стало»).

Приходят только изменённые позиции, а не весь файл: так одновременные правки двух людей
в разных позициях не затирают друг друга.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
import apply_prices as ap  # noqa: E402

FIELDS = {"types": {"price"}, "extras": {"price"}, "locations": {"surcharge", "transfer"}}
FIELD_LABELS = {"surcharge": "доплата", "transfer": "трансфер"}
MAX_PRICE = 9999


def dump_prices(p: dict) -> str:
    """Тот же компактный формат, что и в репозитории: один пункт на строку."""
    def item(v: dict) -> str:
        return "{ " + ", ".join(f'"{k}": {json.dumps(x, ensure_ascii=False)}' for k, x in v.items()) + " }"

    groups = []
    for group in ("types", "locations", "extras"):
        rows = ",\n".join(f'    "{k}": {item(v)}' for k, v in p[group].items())
        groups.append(f'  "{group}": {{\n{rows}\n  }}')
    return '{\n  "currency": ' + json.dumps(p["currency"]) + ',\n' + ",\n".join(groups) + '\n}\n'


def parse_key(p: dict, key: str) -> tuple[str, str, str]:
    parts = key.split(".")
    if len(parts) != 3:
        raise ap.RuleError(f"Некорректный ключ цены: {key!r}")
    group, item, field = parts
    if group not in FIELDS or field not in FIELDS[group]:
        raise ap.RuleError(f"Нельзя менять {key!r}: допустимы только цены")
    if item not in p[group]:
        raise ap.RuleError(f"Неизвестная позиция: {key!r}")
    return group, item, field


def label(p: dict, group: str, item: str, field: str) -> str:
    name = p[group][item]["name"]
    return f"{name}, {FIELD_LABELS[field]}" if group == "locations" else name


def apply_changes(p: dict, changes: dict) -> list[str]:
    lines = []
    for key, value in changes.items():
        group, item, field = parse_key(p, key)
        if type(value) is not int or not 0 <= value <= MAX_PRICE:
            raise ap.RuleError(f"{key}: цена должна быть целым числом от 0 до {MAX_PRICE}")
        old = p[group][item][field]
        if old != value:
            p[group][item][field] = value
            lines.append(f"{label(p, group, item, field)}: ${old} → ${value}")
    return lines


def write_output(**values) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        for k, v in values.items():
            text = str(v)
            if "\n" in text:  # многострочные значения — через разделитель
                f.write(f"{k}<<__EOF__\n{text}\n__EOF__\n")
            else:
                f.write(f"{k}={text}\n")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    payload = json.loads(os.environ["PAYLOAD"])
    changes = payload.get("changes")
    if not isinstance(changes, dict) or not changes:
        sys.exit("Нет изменений цен в событии")

    p = ap.load_prices()
    try:
        lines = apply_changes(p, changes)
        if not lines:
            print("Все цены уже такие, менять нечего")
            write_output(changed=0, summary="")
            return
        with open(ap.INDEX, encoding="utf-8", newline="") as f:
            html = f.read()
        new_html = ap.render(html, p)  # заодно проверяет все правила на новых ценах
    except ap.RuleError as e:
        sys.exit(f"Ошибка: {e}")

    with open(ap.PRICES, "w", encoding="utf-8", newline="") as f:
        f.write(dump_prices(p))
    with open(ap.INDEX, "w", encoding="utf-8", newline="") as f:
        f.write(new_html)

    summary = "\n".join(lines)
    print(f"Обновлено цен: {len(lines)}\n{summary}")
    write_output(changed=len(lines), summary=summary)


if __name__ == "__main__":
    main()
