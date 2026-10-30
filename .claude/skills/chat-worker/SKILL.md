---
name: chat-worker
description: Разработка, тестирование и деплой Cloudflare Worker и Telegram-бота сайта christina-hurghada.photos (чат на сайте, загрузка фото в портфолио, изменение цен через бота). Используй, когда просят доработать бота, добавить команду или кнопку, поправить чат, поменять список админов, обновить секреты или токен GitHub, задеплоить Worker, откатить его, разобраться, почему бот молчит или тесты зависают.
---

# Worker и бот сайта

Код **не в этом репозитории**, а рядом: `C:\Users\User\Documents\R books\tg-chat-worker` (свой git, тег
`worker-chat-stable` до модулей админов). Туда же смотрите за деталями: **`README.md` в той папке**: файлы, настройки,
порядок деплоя, тесты, потоки. Здесь только то, что нужно помнить, чтобы не навредить.

## Перед любыми правками

- Прочитать `README.md` Worker. Работать в `src/photos.js`, `src/prices.js`, `src/common.js`; **чат сайта
  (`src/index.js`, `chat.js`) на работающем проде не ломать**, у него есть регрессионные тесты.
- Права: загрузка фото и цены доступны только Telegram-ID из `ADMIN_IDS` (`wrangler.toml`), в **личке** с ботом.
  Чужие сообщения и кнопки в этих модулях игнорируются молча, это сознательно.
- Любая новая команда, кнопка или поток админа добавляется модулем по образцу `prices.js` (`handleXxxUpdate` →
  вызов в начале `processUpdate`), с префиксом `callback_data` (`ph:`, `pr:`, ≤ 64 байт, без русского текста).

## Тесты (обязательны перед деплоем)

```
cd ..\tg-chat-worker
sh test/run.sh        # 29 сценариев: фото, цены, регрессия чата; реальные токены не используются
```

Новая логика = новые сценарии в `test/bot.test.mjs` (подставные Telegram и GitHub уже есть). Если тесты «висят»:
`.wrangler/dev.log` покажет ошибку сборки; остановить остатки `wrangler`/`workerd` (иначе занят `.wrangler/state`).

## Деплой (только после согласия владельца)

1. Если есть миграция: `npx wrangler d1 execute chat-db --remote --file=migrations/000N_*.sql -y`, затем **проверить**,
   что таблица создана (команда один раз упала с `Authentication error`, а деплой после неё прошёл).
2. `npx wrangler deploy`.
3. Менялись типы апдейтов или секрет webhook, значит `setWebhook` заново (`secret_token`, `allowed_updates`:
   `message` и `callback_query`). Новый секрет: сгенерировать, `wrangler secret put WEBHOOK_SECRET`, тот же в `setWebhook`.
4. Новые команды: `setMyCommands`.
5. Проверка чата: сообщение с сайта → группа → Reply → ответ в виджете. Откат: `npx wrangler rollback`.

## Секреты

Никогда не печатать и не коммитить. `BOT_TOKEN` лежит в переменной среды `PHOTOSESSION_CHAT_BOT`; GitHub-токен
для Worker и для обновления секретов: `GITHUB_TOKEN_PHOTOS` (fine-grained, только репозиторий `photos`, Contents RW).
Секреты передавать через stdin (`$env:X | npx wrangler secret put NAME`, `gh secret set NAME --repo ... <`), не в аргументах.
GitHub-секрет `TELEGRAM_BOT_TOKEN` нужен Action'ам сайта (скачивание фото, уведомления).

## Связанные Action (в репозитории сайта)

`photos.yml` ← событие `photos_upload` (фото портфолио и, при `category: reviews`, скриншоты отзывов),
`prices.yml` ← `prices_update`, `reviews.yml` ← `review_delete`; все в общей очереди `site-content`, и каждый перед
коммитом запускает `check_site.py` (при поломке ничего не публикуется). Модули бота: `photos.js` (`ph:`), `prices.js` (`pr:`),
`reviews.js` (`rv:`).
Событие `repository_dispatch` срабатывает только на workflow из `main`. Ручной прогон без бота:
`gh workflow run prices.yml --repo selesnow/photos -f payload='{"chat_id":<id>,"changes":{...}}'`.
