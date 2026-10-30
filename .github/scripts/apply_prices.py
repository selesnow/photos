"""
Применение цен из prices.json к index.html (единственный источник правды — prices.json).

  python .github/scripts/apply_prices.py           — переписать цены в index.html
  python .github/scripts/apply_prices.py --check   — только проверить, что index.html соответствует
                                                     prices.json (код возврата 1, если нет)

Цены нужны сразу в статичном HTML (поисковики, Schema.org, отключённый JS), поэтому они не
подгружаются в браузере, а вписываются в разметку этим скриптом.

Скрипт ищет места **по идентификаторам**, а не по тексту, поэтому тексты страницы можно править
свободно, а новые типы и локации добавляются без правок кода (достаточно prices.json и разметки):

  data-p="types.family.price"      любой элемент, где показана цена; путь = путь в prices.json.
    data-pf="plus"                 формат «+$N» (по умолчанию «$N»)
    data-pf="tag"                  формат « (+$N)», при нуле пусто (метка доплаты на карточке локации)
  data-p-list="transfers"          список «Название — $трансфер» по всем локациям (в FAQ)
  <button data-type="family">      кнопки калькулятора: data-price / data-dress-free выставляются из файла
  <button data-loc="el_gouna">     кнопки локаций: data-price (доплата) и data-transfer
  <input data-extra="fast">        чекбоксы доп. услуг: value = цена
  "sku": "type:family"             у каждого Offer в Schema.org: цена берётся из types.family.price
  FAQ в Schema.org                 тексты ответов берутся из видимого FAQ (один источник — HTML)

Прочее, что считается автоматически: «от $N» в title/og/twitter, priceRange в Schema, начальное
состояние калькулятора (итог и трансфер до работы JS).

Ошибки (нет кнопки для типа из prices.json, неизвестный путь в data-p и т. п.) описаны понятно:
скрипт лучше остановится, чем молча оставит на сайте старую цену.
"""

import html as htmllib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "index.html"
PRICES = ROOT / "prices.json"


class RuleError(Exception):
    pass


def load_prices(path: Path = PRICES) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def validate(p: dict) -> None:
    for group in ("types", "extras"):
        for key, item in p[group].items():
            if not _is_int(item["price"]) or item["price"] < 0:
                raise RuleError(f"{group}.{key}.price: нужно целое число ≥ 0")
    for key, item in p["locations"].items():
        for field in ("surcharge", "transfer"):
            if not _is_int(item[field]) or item[field] < 0:
                raise RuleError(f"locations.{key}.{field}: нужно целое число ≥ 0")
    for key, item in p["types"].items():
        if item["price"] < 1:
            raise RuleError(f"types.{key}.price: цена съёмки должна быть больше 0")


def price_range(p: dict) -> tuple[int, int]:
    prices = [t["price"] for t in p["types"].values()]
    high = max(prices) + max(l["surcharge"] for l in p["locations"].values()) \
        + max(l["transfer"] for l in p["locations"].values())
    return min(prices), high


def initial_total(p: dict, type_key: str, loc_key: str) -> int:
    t, l = p["types"][type_key], p["locations"][loc_key]
    total = t["price"] + l["surcharge"]
    if t.get("dress_included_at") and loc_key not in t["dress_included_at"]:
        total += p["extras"]["dress"]["price"]  # платье вне пустыни — за отдельную плату
    return total


def lookup(p: dict, path: str) -> int:
    node = p
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            raise RuleError(f'data-p="{path}": такого пути нет в prices.json')
        node = node[part]
    if not _is_int(node):
        raise RuleError(f'data-p="{path}": по этому пути не число')
    return node


def fmt_price(value: int, mode: str) -> str:
    if mode == "plus":
        return f"+${value}"
    if mode == "tag":
        return f" (+${value})" if value else ""
    return f"${value}"


def plain_text(fragment: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", "", fragment)).split())


def rebuild_button(tag: str, key_attr: str, managed: dict) -> str:
    """Пересобирает тег: class, ключ, управляемые атрибуты (None = убрать), затем остальные как были."""
    attrs = re.findall(r'([\w-]+)="([^"]*)"', tag)
    d = dict(attrs)
    rest = [(k, v) for k, v in attrs if k not in ("class", key_attr, *managed)]
    parts = [f'class="{d["class"]}"'] if "class" in d else []
    parts.append(f'{key_attr}="{d[key_attr]}"')
    parts += [f'{k}="{v}"' for k, v in managed.items() if v is not None]
    parts += [f'{k}="{v}"' for k, v in rest]
    return "<button " + " ".join(parts) + ">"


def sync_buttons(html: str, key_attr: str, group: dict, managed_for, what: str) -> str:
    """Кнопки калькулятора <button data-xxx="ключ">: у каждого ключа из prices.json должна быть ровно такая кнопка."""
    found = set()

    def repl(m):
        key = re.search(rf'{key_attr}="(\w+)"', m.group(0)).group(1)
        if key not in group:
            raise RuleError(f'В калькуляторе есть кнопка {key_attr}="{key}", а в prices.json нет такой позиции ({what}). '
                            f"Добавьте её в prices.json или уберите кнопку.")
        found.add(key)
        return rebuild_button(m.group(0), key_attr, managed_for(key))

    html = re.sub(rf'<button\b[^>]*\b{key_attr}="\w+"[^>]*>', repl, html)
    missing = sorted(set(group) - found)
    if missing:
        raise RuleError(f'В калькуляторе нет кнопки {key_attr}="{missing[0]}" (позиция есть в prices.json: {what}). '
                        f"Добавьте кнопку по образцу соседних.")
    return html


def render(html: str, p: dict) -> str:
    validate(p)
    T, L, X = p["types"], p["locations"], p["extras"]

    # 1. Любые элементы с ценой: data-p="путь"
    def price_span(m):
        mode = (re.search(r'data-pf="(\w+)"', m.group(1)) or [None, ""])[1]
        return f"{m.group(1)}{fmt_price(lookup(p, m.group(2)), mode)}{m.group(4)}"
    html = re.sub(r'(<span\b[^>]*?\bdata-p="([\w.]+)"[^>]*>)(.*?)(</span>)', price_span, html, flags=re.S)

    # 2. Списки: data-p-list="transfers"
    def price_list(m):
        if m.group(2) != "transfers":
            raise RuleError(f'data-p-list="{m.group(2)}": неизвестный список (есть: transfers)')
        text = ", ".join("{} — ${}".format(loc["name"], loc["transfer"]) for loc in L.values())
        return m.group(1) + text + m.group(4)
    html = re.sub(r'(<span\b[^>]*?\bdata-p-list="(\w+)"[^>]*>)(.*?)(</span>)', price_list, html, flags=re.S)

    # 3. Кнопки калькулятора: типы и локации
    html = sync_buttons(html, "data-type", T, lambda k: {
        "data-price": T[k]["price"],
        "data-dress-free": ",".join(T[k]["dress_included_at"]) if T[k].get("dress_included_at") else None,
    }, "types")
    html = sync_buttons(html, "data-loc", L, lambda k: {
        "data-price": L[k]["surcharge"], "data-transfer": L[k]["transfer"],
    }, "locations")

    # 4. Чекбоксы доп. услуг
    found = set()

    def extra_input(m):
        key = re.search(r'data-extra="(\w+)"', m.group(0)).group(1)
        if key not in X:
            raise RuleError(f'Чекбокс data-extra="{key}" есть в калькуляторе, а в prices.json нет extras.{key}.')
        found.add(key)
        if re.search(r'\bvalue="\d*"', m.group(0)):
            return re.sub(r'\bvalue="\d*"', f'value="{X[key]["price"]}"', m.group(0))
        return m.group(0)[:-1] + f' value="{X[key]["price"]}">'
    html = re.sub(r'<input\b[^>]*\bdata-extra="\w+"[^>]*>', extra_input, html)
    missing = sorted(set(X) - found)
    if missing:
        raise RuleError(f'В калькуляторе нет чекбокса data-extra="{missing[0]}" (extras.{missing[0]} есть в prices.json).')

    # 5. Начальное состояние калькулятора (до работы JS): выбранные по умолчанию тип и локация
    sel_type = re.search(r'<button class="calc-option-btn selected"[^>]*data-type="(\w+)"', html)
    sel_loc = re.search(r'<button class="calc-option-btn selected"[^>]*data-loc="(\w+)"', html)
    if not sel_type or not sel_loc:
        raise RuleError("В калькуляторе не найден выбранный по умолчанию тип или локация (класс selected)")
    transfer = L[sel_loc.group(1)]["transfer"]
    for name, pattern, repl in (
        ("подсказка трансфера", r'(id="transfer-loc-note">[^<]*\(\$)\d+(\)</span>)', lambda m: f"{m.group(1)}{transfer}{m.group(2)}"),
        ("бейдж трансфера", r'(id="calc-transfer-price">\+\$)\d+(</span>)', lambda m: f"{m.group(1)}{transfer}{m.group(2)}"),
        ("значение трансфера", r'(id="opt-transfer" value=")\d+(")', lambda m: f"{m.group(1)}{transfer}{m.group(2)}"),
        ("начальный итог", r'(id="sum-total">\$)\d+(</div>)',
         lambda m: f"{m.group(1)}{initial_total(p, sel_type.group(1), sel_loc.group(1))}{m.group(2)}"),
    ):
        html, n = re.subn(pattern, repl, html)
        if n != 1:
            raise RuleError(f"Начальное состояние калькулятора ({name}): найдено {n}, ожидалось 1")

    # 6. «от $N» в title / og:title / twitter:title
    low, high = price_range(p)
    html, n = re.subn(r"(фотосессии от \$)\d+", lambda m: f"{m.group(1)}{low}", html)
    if n != 3:
        raise RuleError(f"Заголовок «… от $N»: найдено {n} (title, og:title, twitter:title), ожидалось 3")

    # 7. Schema.org: priceRange и цены Offer по sku
    html, n = re.subn(r'("priceRange": "\$)\d+( - \$)\d+(")',
                      lambda m: f"{m.group(1)}{low}{m.group(2)}{high}{m.group(3)}", html)
    if n != 1:
        raise RuleError(f"Schema priceRange: найдено {n}, ожидалось 1")

    def offer(m):
        if m.group(3) not in T:
            raise RuleError(f'Schema: Offer с "sku": "type:{m.group(3)}", а в prices.json нет types.{m.group(3)}')
        return f"{m.group(1)}{T[m.group(3)]['price']}{m.group(2)}{m.group(3)}{m.group(4)}"
    html = re.sub(r'("price": ")\d+(",\s*"priceCurrency": "USD",\s*"sku": "type:)(\w+)(")', offer, html)

    # 8. FAQ в Schema.org: тексты ответов берём из видимого FAQ
    pairs = re.findall(r'<span>([^<]+)</span>\s*<i class="ri-add-line faq-icon"></i>\s*</button>\s*'
                       r'<div class="faq-answer">(.*?)</div>', html, re.S)
    for question, answer in pairs:
        name = re.escape(json.dumps(plain_text(question), ensure_ascii=False)[1:-1])
        text = json.dumps(plain_text(answer), ensure_ascii=False)[1:-1]
        html = re.sub(rf'("name": "{name}",\s*"acceptedAnswer": \{{\s*"@type": "Answer",\s*"text": ")((?:[^"\\]|\\.)*)(")',
                      lambda m: f"{m.group(1)}{text}{m.group(3)}", html)
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
