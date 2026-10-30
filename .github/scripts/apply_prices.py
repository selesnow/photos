"""
Применение цен из prices.json к index.html (единственный источник правды — prices.json).

  python .github/scripts/apply_prices.py           — переписать цены в index.html
  python .github/scripts/apply_prices.py --check   — только проверить, что index.html соответствует
                                                     prices.json (код возврата 1, если нет)

Цены на сайте нужны сразу в статичном HTML (поисковики, Schema.org, отключённый JS), поэтому
они не подгружаются в браузере, а вписываются в разметку этим скриптом. Калькулятор
(script.js) берёт числа из data-атрибутов, которые тоже выставляет этот скрипт.

Что обновляется:
  • title / og:title / twitter:title — «от $N» (минимальная цена съёмки)
  • Schema.org: priceRange и цены в Offer
  • карточки «Виды съёмок и цены»
  • калькулятор: цены типов, доплата и трансфер по локациям, доп. услуги, начальное состояние
  • метка «+$N» у Эль-Гуны, тексты FAQ (HTML и Schema) про трансфер и платье

Каждое правило обязано сработать ровно столько раз, сколько ожидается: если вёрстку поменяли
и правило ничего не нашло, скрипт падает с понятной ошибкой, а не молча оставляет старую цену.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "index.html"
PRICES = ROOT / "prices.json"

# Порядок и названия как в исходных текстах FAQ
FAQ_TRANSFER_ORDER = ["hurghada", "desert", "el_gouna", "cliff", "sea_desert"]


class RuleError(Exception):
    pass


def load_prices(path: Path = PRICES) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(p: dict) -> None:
    for group, field in (("types", "price"), ("extras", "price")):
        for key, item in p[group].items():
            if not isinstance(item[field], int) or item[field] < 0:
                raise RuleError(f"{group}.{key}.{field}: нужно целое число ≥ 0")
    for key, item in p["locations"].items():
        for field in ("surcharge", "transfer"):
            if not isinstance(item[field], int) or item[field] < 0:
                raise RuleError(f"locations.{key}.{field}: нужно целое число ≥ 0")
    for key, item in p["types"].items():
        if item["price"] < 1:
            raise RuleError(f"types.{key}.price: цена съёмки должна быть больше 0")


def price_range(p: dict) -> tuple[int, int]:
    prices = [t["price"] for t in p["types"].values()]
    low = min(prices)
    high = max(prices) + max(l["surcharge"] for l in p["locations"].values()) \
        + max(l["transfer"] for l in p["locations"].values())
    return low, high


def initial_total(p: dict, type_key: str, loc_key: str) -> int:
    t, l = p["types"][type_key], p["locations"][loc_key]
    total = t["price"] + l["surcharge"]
    if t.get("dress_included_at") and loc_key not in t["dress_included_at"]:
        total += p["extras"]["dress"]["price"]  # платье вне пустыни — за отдельную плату
    return total


def render(html: str, p: dict) -> str:
    validate(p)
    T, L, X = p["types"], p["locations"], p["extras"]

    def rule(name: str, pattern: str, repl, expected: int, flags: int = 0) -> None:
        nonlocal html
        html, n = re.subn(pattern, repl, html, flags=flags)
        if n != expected:
            raise RuleError(f"Правило «{name}»: найдено {n}, ожидалось {expected}. "
                            f"Вёрстка изменилась? Поправьте правило в apply_prices.py.")

    low, high = price_range(p)
    rule("title / og / twitter «от $N»", r"(фотосессии от \$)\d+",
         lambda m: f"{m.group(1)}{low}", 3)
    rule("Schema priceRange", r'("priceRange": "\$)\d+( - \$)\d+(")',
         lambda m: f"{m.group(1)}{low}{m.group(2)}{high}{m.group(3)}", 1)

    schema_names = {
        "Семейная фотосессия": "family",
        "Парная фотосессия (Love Story)": "couple",
        "Индивидуальная фотосессия": "single",
        "Фотосессия в летящем платье в пустыне": "dress",
    }
    rule("Schema Offer", r'("price": ")\d+(",\s*"priceCurrency": "USD",\s*"itemOffered": \{\s*"@type": "Service",\s*"name": ")([^"]+)(")',
         lambda m: f"{m.group(1)}{T[schema_names[m.group(3)]]['price']}{m.group(2)}{m.group(3)}{m.group(4)}", 4)

    card_names = {"Семейная": "family", "Парная": "couple", "Индивидуальная": "single", "Летящие платья": "dress"}
    rule("Карточки цен", r'(<h3 class="package-title">)([^<]+)(</h3>\s*<div class="package-price-wrap">\s*<span class="package-price">\$)\d+',
         lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}{T[card_names[m.group(2)]]['price']}", 4)

    def type_button(m):
        sel, key, tail = m.group(1) or "", m.group(2), m.group(3)
        t = T[key]
        dress = f' data-dress-free="{",".join(t["dress_included_at"])}"' if t.get("dress_included_at") else ""
        return (f'<button class="calc-option-btn{sel}" data-type="{key}" data-price="{t["price"]}"{dress}>'
                f'{tail}{t["price"]}</span>')
    rule("Калькулятор: типы съёмки",
         r'<button class="calc-option-btn( selected)?" data-type="(\w+)"[^>]*>(\s*<span class="calc-opt-name">[^<]*</span>\s*<span class="calc-opt-price">\$)\d+</span>',
         type_button, 4)

    def loc_button(m):
        sel, key, mid1, mid2 = m.group(1) or "", m.group(2), m.group(3), m.group(4)
        l = L[key]
        return (f'<button class="calc-option-btn{sel}" data-loc="{key}" data-price="{l["surcharge"]}" '
                f'data-transfer="{l["transfer"]}">{mid1}+${l["surcharge"]}</span>{mid2}{l["transfer"]}</span>')
    rule("Калькулятор: локации",
         r'<button class="calc-option-btn( selected)?" data-loc="(\w+)"[^>]*>(\s*<span class="calc-opt-name">[^<]*</span>\s*<span class="calc-opt-price">)\+\$\d+</span>(\s*<span class="calc-opt-sub">🚗 трансфер: \$)\d+</span>',
         loc_button, 5)

    rule("Калькулятор: доп. услуги",
         r'(<span class="calc-opt-price">\+\$)\d+(</span>\s*<input type="checkbox" id="opt-(fast|dress|raw)" value=")\d+(")',
         lambda m: f"{m.group(1)}{X[m.group(3)]['price']}{m.group(2)}{X[m.group(3)]['price']}{m.group(4)}", 3)

    # Начальное состояние калькулятора (до работы JS): выбранные по умолчанию тип и локация
    sel_type = re.search(r'calc-option-btn selected" data-type="(\w+)"', html)
    sel_loc = re.search(r'calc-option-btn selected" data-loc="(\w+)"', html)
    if not sel_type or not sel_loc:
        raise RuleError("В калькуляторе не найден выбранный по умолчанию тип или локация")
    transfer = L[sel_loc.group(1)]["transfer"]
    rule("Начальный трансфер: подсказка", r'(id="transfer-loc-note">[^<]*\(\$)\d+(\)</span>)',
         lambda m: f"{m.group(1)}{transfer}{m.group(2)}", 1)
    rule("Начальный трансфер: бейдж", r'(id="calc-transfer-price">\+\$)\d+(</span>)',
         lambda m: f"{m.group(1)}{transfer}{m.group(2)}", 1)
    rule("Начальный трансфер: значение", r'(id="opt-transfer" value=")\d+(")',
         lambda m: f"{m.group(1)}{transfer}{m.group(2)}", 1)
    total = initial_total(p, sel_type.group(1), sel_loc.group(1))
    rule("Начальный итог", r'(id="sum-total">\$)\d+(</div>)',
         lambda m: f"{m.group(1)}{total}{m.group(2)}", 1)

    rule("Метка Эль-Гуны", r"(Египетская Венеция \(\+\$)\d+(\))",
         lambda m: f"{m.group(1)}{L['el_gouna']['surcharge']}{m.group(2)}", 1)

    sentence = ", ".join(f"{L[k]['name']} — ${L[k]['transfer']}" for k in FAQ_TRANSFER_ORDER)
    rule("FAQ: трансфер", r'(Стоимость трансфера зависит от локации: )[^"\n<]*?\.(?=["\s<])',
         lambda m: f"{m.group(1)}{sentence}.", 2)
    rule("FAQ: платье входит в стоимость", r"(входит в стоимость \(\$)\d+(\))",
         lambda m: f"{m.group(1)}{T['dress']['price']}{m.group(2)}", 2)
    rule("FAQ: аренда платья", r"(Хургада, Эль-Гуна, Утёс, Море\) — \$)\d+(\.)",
         lambda m: f"{m.group(1)}{X['dress']['price']}{m.group(2)}", 2)

    return html


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    check = "--check" in sys.argv
    with open(INDEX, encoding="utf-8", newline="") as f:
        current = f.read()
    try:
        updated = render(current, load_prices())
    except RuleError as e:
        sys.exit(f"Ошибка: {e}")

    if updated == current:
        print("index.html уже соответствует prices.json")
        return
    if check:
        sys.exit("index.html не соответствует prices.json: запустите .github/scripts/apply_prices.py")
    with open(INDEX, "w", encoding="utf-8", newline="") as f:
        f.write(updated)
    print("index.html обновлён по prices.json")


if __name__ == "__main__":
    main()
