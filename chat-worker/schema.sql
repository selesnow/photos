-- Схема базы chat-db для чата на сайте
-- Применение: npx wrangler d1 execute chat-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,          -- случайный ID посетителя (хранится в localStorage)
  code       TEXT NOT NULL,             -- короткий код для Telegram, например #a1b2c3
  name       TEXT,                      -- имя, если посетитель его указал
  topic_id   INTEGER,                   -- ID темы, если группа в режиме тем (форум)
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_topic ON sessions(topic_id);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  sender     TEXT NOT NULL CHECK (sender IN ('user', 'op')),
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);

-- Связь «сообщение в Telegram → посетитель», чтобы ответ через Reply попадал нужному человеку
CREATE TABLE IF NOT EXISTS tg_map (
  tg_message_id INTEGER PRIMARY KEY,
  session_id    TEXT NOT NULL
);
