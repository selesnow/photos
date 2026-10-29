/**
 * Чат на сайте christina-hurghada.photos ↔ Telegram-группа «Фотосессии».
 *
 * Посетитель пишет на сайте → бот публикует сообщение в группе.
 * Ответ в группе через «Ответить» (Reply) на сообщение посетителя → уходит на сайт.
 * Если группа переведена в режим тем, каждому посетителю создаётся своя тема,
 * и отвечать можно просто сообщением в этой теме.
 *
 * Эндпоинты:
 *   POST /api/send       { sid, text, name? , page? }  — сообщение от посетителя
 *   GET  /api/messages?sid=...&after=ID                 — новые сообщения переписки
 *   POST /tg/webhook                                    — апдейты от Telegram
 */

const ALLOWED_ORIGINS = [
  'https://christina-hurghada.photos',
  'https://www.christina-hurghada.photos',
];
// Для локальной разработки: localhost, адреса локальной сети (проверка с телефона)
// и «null» — так браузер называет страницу, открытую двойным кликом (file://)
const LOCAL_ORIGIN = /^(null|https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?)$/;

const SID_RE = /^[A-Za-z0-9-]{16,64}$/;
const MAX_TEXT = 2000;
const MAX_NAME = 60;
const RATE_PER_MINUTE = 8;
const RATE_PER_DAY = 100;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/tg/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      const cors = corsHeaders(request);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

      try {
        if (url.pathname === '/api/send' && request.method === 'POST') {
          return await handleSend(request, env, cors);
        }
        if (url.pathname === '/api/messages' && request.method === 'GET') {
          return await handleMessages(url, env, cors);
        }
      } catch (err) {
        console.error(err);
        return json({ ok: false, error: 'server_error' }, 500, cors);
      }
      return json({ ok: false, error: 'not_found' }, 404, cors);
    }

    return new Response('tg-chat ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};

/* ---------- Сайт → Telegram ---------- */

async function handleSend(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400, cors);
  }

  const sid = String(body.sid || '');
  const text = String(body.text || '').trim().slice(0, MAX_TEXT);
  let name = String(body.name || '').trim().slice(0, MAX_NAME);
  const page = String(body.page || '').slice(0, 200);
  const brief = cleanBrief(body.brief);
  if (!SID_RE.test(sid) || (!text && !brief)) return json({ ok: false, error: 'bad_request' }, 400, cors);
  if (brief?.name && !name) name = brief.name;

  const now = Date.now();
  const rate = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN created_at > ?2 THEN 1 ELSE 0 END) AS minute,
       COUNT(*) AS day
     FROM messages WHERE session_id = ?1 AND sender = 'user' AND created_at > ?3`
  ).bind(sid, now - 60_000, now - 86_400_000).first();
  if ((rate?.minute || 0) >= RATE_PER_MINUTE || (rate?.day || 0) >= RATE_PER_DAY) {
    return json({ ok: false, error: 'rate_limited' }, 429, cors);
  }

  let session = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sid).first();
  const isNew = !session;
  if (isNew) {
    const code = sid.replace(/-/g, '').slice(0, 6).toLowerCase();
    const topicId = await tryCreateTopic(env, `💬 ${name || 'Посетитель'} #${code}`);
    session = { id: sid, code, name: name || null, topic_id: topicId };
    await env.DB.prepare(
      'INSERT INTO sessions (id, code, name, topic_id, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(sid, code, session.name, topicId, now, now).run();
  } else {
    if (name && name !== session.name) session.name = name;
    await env.DB.prepare('UPDATE sessions SET last_seen = ?, name = ? WHERE id = ?')
      .bind(now, session.name, sid).run();
  }

  const header = [
    isNew ? '🆕 <b>Новый посетитель с сайта</b>' : brief && !text ? '📋 <b>Анкета с сайта</b>' : '💬 <b>Сообщение с сайта</b>',
    `#${session.code}${session.name ? ' · ' + esc(session.name) : ''}`,
  ];
  if (isNew && page) header.push(`<i>${esc(page)}</i>`);
  const hint = session.topic_id ? '' : '\n\n<i>↩️ Ответьте на это сообщение (Reply), чтобы написать посетителю</i>';

  const payload = {
    chat_id: env.CHAT_ID,
    text: `${header.join('\n')}\n\n${[brief && briefHtml(brief), text && esc(text)].filter(Boolean).join('\n\n')}${hint}`,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  };
  if (session.topic_id) payload.message_thread_id = session.topic_id;

  const sent = await tg(env, 'sendMessage', payload);
  if (!sent.ok) {
    console.error('sendMessage failed', JSON.stringify(sent));
    return json({ ok: false, error: 'telegram_failed' }, 502, cors);
  }

  const res = await env.DB.batch([
    env.DB.prepare('INSERT INTO messages (session_id, sender, text, created_at) VALUES (?, ?, ?, ?)')
      .bind(sid, 'user', [brief && briefPlain(brief), text].filter(Boolean).join('\n\n'), now),
    env.DB.prepare('INSERT OR REPLACE INTO tg_map (tg_message_id, session_id) VALUES (?, ?)')
      .bind(sent.result.message_id, sid),
  ]);

  return json({ ok: true, id: res[0].meta.last_row_id, ts: now }, 200, cors);
}

async function handleMessages(url, env, cors) {
  const sid = url.searchParams.get('sid') || '';
  const after = parseInt(url.searchParams.get('after') || '0', 10) || 0;
  if (!SID_RE.test(sid)) return json({ ok: false, error: 'bad_request' }, 400, cors);

  const { results } = await env.DB.prepare(
    `SELECT id, sender, text, created_at FROM messages
     WHERE session_id = ? AND id > ? ORDER BY id DESC LIMIT 200`
  ).bind(sid, after).all();

  const messages = results.reverse().map((m) => ({
    id: m.id,
    from: m.sender,
    text: m.text,
    ts: m.created_at,
  }));
  return json({ ok: true, operator: env.OPERATOR_NAME || '', messages }, 200, cors);
}

/* ---------- Telegram → сайт ---------- */

async function handleWebhook(request, env) {
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('ok');
  }

  try {
    await processUpdate(update, env);
  } catch (err) {
    // Всегда отвечаем 200, иначе Telegram будет бесконечно повторять апдейт
    console.error('webhook error', err);
  }
  return new Response('ok');
}

async function processUpdate(update, env) {
  const msg = update.message;
  if (!msg || String(msg.chat?.id) !== String(env.CHAT_ID) || msg.from?.is_bot) return;

  const text = (msg.text || msg.caption || '').trim();

  if (text === '/help' || text.startsWith('/help@')) {
    await tg(env, 'sendMessage', {
      chat_id: env.CHAT_ID,
      message_thread_id: msg.is_topic_message ? msg.message_thread_id : undefined,
      parse_mode: 'HTML',
      text:
        '<b>Как отвечать посетителям сайта</b>\n\n' +
        '• Нажмите «Ответить» (Reply) на сообщение посетителя и напишите текст.\n' +
        '• Можно отвечать и на своё предыдущее сообщение в этой переписке.\n' +
        '• Если включены темы — просто пишите в теме посетителя.\n\n' +
        'Доставленный ответ бот отмечает 👍. На сайт уходит только текст.',
    });
    return;
  }

  let sid = null;
  if (msg.is_topic_message && msg.message_thread_id) {
    const row = await env.DB.prepare('SELECT id FROM sessions WHERE topic_id = ?')
      .bind(msg.message_thread_id).first();
    sid = row?.id || null;
  }
  if (!sid && msg.reply_to_message) {
    const row = await env.DB.prepare('SELECT session_id FROM tg_map WHERE tg_message_id = ?')
      .bind(msg.reply_to_message.message_id).first();
    sid = row?.session_id || null;
  }
  if (!sid) return; // обычное сообщение в группе, не адресованное посетителю

  if (!text) {
    await tg(env, 'sendMessage', {
      chat_id: env.CHAT_ID,
      message_thread_id: msg.is_topic_message ? msg.message_thread_id : undefined,
      reply_parameters: { message_id: msg.message_id },
      text: '⚠️ На сайт можно отправить только текст. Фото, стикеры и голосовые посетитель не увидит.',
    });
    return;
  }

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO messages (session_id, sender, text, created_at) VALUES (?, ?, ?, ?)')
      .bind(sid, 'op', text.slice(0, 4000), now),
    env.DB.prepare('INSERT OR REPLACE INTO tg_map (tg_message_id, session_id) VALUES (?, ?)')
      .bind(msg.message_id, sid),
  ]);

  await tg(env, 'setMessageReaction', {
    chat_id: env.CHAT_ID,
    message_id: msg.message_id,
    reaction: [{ type: 'emoji', emoji: '👍' }],
  });
}

/* ---------- Анкета ---------- */

const BRIEF_FIELDS = ['type', 'location', 'date', 'instagram', 'telegram', 'whatsapp'];

function cleanBrief(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of [...BRIEF_FIELDS, 'name']) {
    const v = String(raw[k] || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

// Достаём «логин» из @login или ссылки; null, если формат не похож на логин
function handle(v) {
  const m = v.replace(/^https?:\/\/(www\.)?(instagram\.com|t\.me)\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  return /^[A-Za-z0-9._]{2,40}$/.test(m) ? m : null;
}

function briefLines(b) {
  const lines = [];
  if (b.type) lines.push(['📸', 'Съёмка', b.type, esc(b.type)]);
  if (b.location) lines.push(['📍', 'Локация', b.location, esc(b.location)]);
  if (b.date) lines.push(['📅', 'Дата', b.date, esc(b.date)]);
  if (b.instagram) {
    const h = handle(b.instagram);
    lines.push(['📷', 'Instagram', b.instagram, h ? `<a href="https://instagram.com/${h}">@${h}</a>` : esc(b.instagram)]);
  }
  if (b.telegram) {
    const h = handle(b.telegram);
    lines.push(['✈️', 'Telegram', b.telegram, h ? `<a href="https://t.me/${h}">@${h}</a>` : esc(b.telegram)]);
  }
  if (b.whatsapp) lines.push(['💬', 'WhatsApp', b.whatsapp, esc(b.whatsapp)]);
  return lines;
}

function briefHtml(b) {
  return '📋 <b>Анкета</b>\n' + briefLines(b).map(([i, l, , h]) => `${i} ${l}: ${h}`).join('\n');
}

function briefPlain(b) {
  return '📋 Анкета\n' + briefLines(b).map(([i, l, p]) => `${i} ${l}: ${p}`).join('\n');
}

/* ---------- Вспомогательное ---------- */

async function tryCreateTopic(env, name) {
  const res = await tg(env, 'createForumTopic', { chat_id: env.CHAT_ID, name: name.slice(0, 128) });
  return res.ok ? res.result.message_thread_id : null;
}

async function tg(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({ ok: false }));
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
