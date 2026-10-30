# Цены на сайте

Единственный источник цен, названий локаций для бота и подписей к фото — [prices.json](prices.json).
Руками цены в `index.html` и `script.js` не правим.

## Как менять цены

**Через Telegram-бота** (основной способ): в личке с ботом `/prices` → раздел → позиция → кнопки −10 / −5 / +5 / +10
или «✍️ Ввести число» → «✅ Опубликовать». Сайт обновится за 1–2 минуты, бот напишет «✅ Цены обновлены».

**Вручную:** изменить число в `prices.json` и выполнить
```
python .github/scripts/apply_prices.py
```
Проверка: `python -I .github/scripts/check_site.py` (всё ли на месте), `python -I .github/scripts/test_prices.py`
(механизм), `node .github/tests/calc.test.mjs` (калькулятор в браузере, нужен `npm i --no-save playwright-core`).

## Как считается итог в калькуляторе

```
итог = цена типа съёмки + доплата за локацию + трансфер (если выбран) + доп. услуги
```

- **Эль-Гуна** (и любая локация с `surcharge` > 0) добавляет доплату к любой съёмке.
- **Трансфер** зависит от локации (`locations.*.transfer`).
- **Летящее платье:** в пакет входит одно платье, но только на локациях из `types.dress.dress_included_at`
  (сейчас только «Пустыня»; «Море + Пустыня» платное). На остальных локациях калькулятор автоматически добавляет
  аренду платья по цене `extras.dress.price`. Чекбокс «доп. платье» всегда платный.
- `priceRange` в Schema = от минимальной цены съёмки до (максимальная съёмка + максимальная доплата + максимальный трансфер).

## Как это устроено: всё привязано к идентификаторам

Скрипт `apply_prices.py` ищет места на странице **по идентификаторам**, а не по тексту. Поэтому тексты можно править
свободно (в рамках пожеланий владельца), а новые позиции добавляются без правок кода.

| Метка в `index.html` | Что делает |
|---|---|
| `<span data-p="types.family.price">$170</span>` | любое место, где показана цена; путь = путь в `prices.json` |
| `data-pf="plus"` / `data-pf="tag"` | формат «+$N» / « (+$N)» (при нуле пусто; метка доплаты на карточке локации) |
| `<span data-p-list="transfers">` | список «Название — $трансфер» по **всем** локациям (в FAQ) |
| `<button data-type="family">` | кнопка типа в калькуляторе; `data-price`, `data-dress-free` ставит скрипт |
| `<button data-loc="el_gouna">` | кнопка локации; `data-price` (доплата), `data-transfer` ставит скрипт |
| `<input data-extra="fast">` | чекбокс доп. услуги; `value` = цена; `data-label`, `data-ready` для сообщения |
| `<div class="package-card" data-type="…">`, `<div class="location-card" data-loc="…">` | карточки (их наличие проверяет `check_site.py`) |
| `"sku": "type:family"` в Offer (Schema.org) | цена Offer берётся из `types.family.price` |
| FAQ в Schema.org | тексты ответов выводятся из видимого FAQ (один источник) |

Подписи для сообщения в Telegram (`data-label`, `data-clean`) лежат в разметке кнопок, в `script.js` ни цен, ни названий нет.

## Как добавить новую локацию

1. **`prices.json`** → `locations`: ключ (латиницей, например `dahab`), `name` (как в калькуляторе), `emoji`, `photo_name`
   (название на фото в портфолио, в точности как будет в `data-location`), `aliases` (начала слов для подписи к фото,
   строчными, без «ё»), `surcharge`, `transfer`.
2. **`index.html`** по образцу соседних:
   - кнопка в калькуляторе (`#calc-loc-grid`): `data-loc="dahab"`, `data-label`, `data-clean`, внутри `data-p`-метки;
   - карточка в разделе локаций: `<div class="location-card" data-loc="dahab">` и пустая метка
     `<span data-p="locations.dahab.surcharge" data-pf="tag"></span>` внутри `location-tag`.
3. `python .github/scripts/apply_prices.py`, затем `python -I .github/scripts/check_site.py`. Если чего-то не хватает,
   проверка называет, что именно добавить.

Всё остальное подхватывается само: список трансферов в FAQ (HTML и Schema), `priceRange`, меню `/prices` в боте,
кнопки и разбор подписей при загрузке фото через бота (деплой Worker **не нужен**).

## Как добавить новый тип съёмки

1. **`prices.json`** → `types`: ключ, `name`, `emoji`, `price` (и `dress_included_at`, если в пакет входит платье).
2. **`index.html`**: кнопка `data-type="…"` в калькуляторе (`data-label`), карточка `package-card` с `data-type="…"` и
   `data-p` у цены, `Offer` с `"sku": "type:…"` в Schema.org.
3. `apply_prices.py` и `check_site.py`, как выше. Вкладку портфолио для нового типа это не создаёт: вкладки
   (`family`, `couple`, `single`) отдельная сущность, их добавление затрагивает `add_photos.py` и бота.

Новая доп. услуга: `extras` в `prices.json` + чекбокс `data-extra="…"` с `data-label` (и `data-ready`, если меняет срок).

## Как это работает с ботом

`/prices` в боте → Cloudflare Worker (репозиторий tg-chat-worker) читает актуальный `prices.json` из GitHub и копит правки
в черновике → «Опубликовать» отправляет в GitHub событие `prices_update` с изменёнными позициями → workflow `prices.yml`
запускает `update_prices.py` (проверка, запись `prices.json`, `apply_prices.py`), коммитит и пушит. Откат любого
изменения: `git revert` коммита «Цены через Telegram».
