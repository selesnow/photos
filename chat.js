/* ==========================================================================
   Чат на сайте. Сообщения уходят в Telegram-группу через Cloudflare Worker
   (папка chat-worker/), ответы из Telegram подтягиваются опросом сервера.
   Внутри чата есть необязательная анкета: тип съёмки, локация, дата, контакты.
   ========================================================================== */
(function () {
  'use strict';

  var API = 'https://tg-chat.selesnow.workers.dev/api';

  var TEXT = {
    title: 'Кристина',
    subtitle: 'Фотограф в Хургаде · отвечу здесь',
    welcome: 'Здравствуйте! Напишите ваш вопрос — я отвечу прямо здесь, как только увижу сообщение. ' +
      'А чтобы мне было проще подготовить ответ, можно заполнить короткую анкету ниже (все поля необязательны).',
    inputPlaceholder: 'Напишите сообщение…',
    sentNotice: 'Сообщение отправлено. Переписка сохранится, даже если закрыть страницу.',
    briefSentNotice: 'Анкета отправлена. Скоро отвечу здесь или в указанном мессенджере.',
    failed: 'Не удалось отправить. Проверьте интернет и попробуйте ещё раз.',
    rateLimited: 'Слишком много сообщений подряд. Подождите минуту.',
    launcherLabel: 'Открыть чат с фотографом'
  };

  // Значения совпадают с названиями в калькуляторе, чтобы отчёты GA4 были сопоставимы
  var TYPES = ['Семейная', 'Парная (Love Story)', 'Индивидуальная', 'Летящее платье'];
  var LOCATIONS = ['Хургада Мамша', 'Пустыня', 'Утёс', 'Море + Пустыня', 'Эль-Гуна'];

  var POLL_OPEN = 3000;        // окно открыто — проверяем ответы часто
  var POLL_CLOSED = 30000;     // окно закрыто — редко, только ради значка непрочитанных
  var STORE_SID = 'tgchat_sid';
  var STORE_NAME = 'tgchat_name';
  var STORE_SEEN = 'tgchat_seen';
  var STORE_BRIEF = 'tgchat_brief'; // 'sent' | 'skipped'

  var sid = store(STORE_SID);
  var lastId = 0;
  var seenId = parseInt(store(STORE_SEEN) || '0', 10);
  var rendered = {};
  var isOpen = false;
  var sending = false;
  var pollTimer = null;
  var loaded = false;
  var sentCount = 0;
  var briefState = store(STORE_BRIEF);
  var picked = { type: '', location: '' };
  var briefEl = null;
  var briefToggle = null;
  var datePicker = null;

  /* ---------- Разметка ---------- */

  var root = document.createElement('div');
  root.className = 'tgchat';
  root.innerHTML =
    '<div class="tgchat-panel" role="dialog" aria-label="Чат с фотографом" aria-hidden="true">' +
      '<div class="tgchat-header">' +
        '<img class="tgchat-avatar" src="img/Christie.webp" alt="" width="42" height="42" loading="lazy">' +
        '<div class="tgchat-title"><strong></strong><span></span></div>' +
        '<button type="button" class="tgchat-close" aria-label="Закрыть чат"><i class="ri-close-line"></i></button>' +
      '</div>' +
      '<div class="tgchat-messages" aria-live="polite"></div>' +
      '<form class="tgchat-form" novalidate>' +
        '<div class="tgchat-row">' +
          '<textarea class="tgchat-input" rows="1" maxlength="2000" required></textarea>' +
          '<button type="submit" class="tgchat-send" aria-label="Отправить"><i class="ri-send-plane-2-fill"></i></button>' +
        '</div>' +
      '</form>' +
    '</div>' +
    '<button type="button" class="tgchat-launcher">' +
      '<i class="ri-chat-smile-3-fill"></i><i class="ri-close-line"></i>' +
      '<span class="tgchat-badge" hidden></span>' +
    '</button>';
  document.body.appendChild(root);

  var panel = root.querySelector('.tgchat-panel');
  var list = root.querySelector('.tgchat-messages');
  var form = root.querySelector('.tgchat-form');
  var input = root.querySelector('.tgchat-input');
  var sendBtn = root.querySelector('.tgchat-send');
  var launcher = root.querySelector('.tgchat-launcher');
  var badge = root.querySelector('.tgchat-badge');

  root.querySelector('.tgchat-title strong').textContent = TEXT.title;
  root.querySelector('.tgchat-title span').textContent = TEXT.subtitle;
  launcher.setAttribute('aria-label', TEXT.launcherLabel);
  input.placeholder = TEXT.inputPlaceholder;

  addMessage({ from: 'op', text: TEXT.welcome });
  buildBrief();

  /* ---------- События ---------- */

  launcher.addEventListener('click', function () { setOpen(!isOpen); });
  root.querySelector('.tgchat-close').addEventListener('click', function () { setOpen(false); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) setOpen(false);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    autosize();
    submit({ text: text }, function () { if (!input.value) input.value = text; });
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  input.addEventListener('input', autosize);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) schedulePoll(0);
  });

  // Если переписка уже была — подтянуть ответы, пришедшие пока посетителя не было
  if (sid) schedulePoll(0);

  /* ---------- Анкета ---------- */

  function buildBrief() {
    if (briefState === 'sent') return;

    briefEl = document.createElement('div');
    briefEl.className = 'tgchat-brief';
    briefEl.innerHTML =
      '<div class="tgchat-brief-title">📋 Расскажите о съёмке</div>' +
      '<div class="tgchat-brief-hint">Все поля необязательны, можно заполнить часть</div>' +
      '<div class="tgchat-brief-label">Тип съёмки</div>' +
      '<div class="tgchat-chips" data-group="type"></div>' +
      '<div class="tgchat-brief-label">Локация</div>' +
      '<div class="tgchat-chips" data-group="location"></div>' +
      '<div class="tgchat-brief-label">Желаемая дата</div>' +
      '<div class="tgchat-date-wrap">' +
        '<input type="text" class="tgchat-field tgchat-date" placeholder="Выберите дату" readonly aria-label="Желаемая дата съёмки">' +
        '<button type="button" class="tgchat-date-clear" aria-label="Очистить дату" hidden>&times;</button>' +
      '</div>' +
      '<div class="tgchat-brief-label">Как с вами связаться</div>' +
      '<input type="text" class="tgchat-field" data-field="name" maxlength="60" placeholder="Ваше имя" autocomplete="name">' +
      '<input type="text" class="tgchat-field" data-field="instagram" maxlength="100" placeholder="Instagram (@логин)" autocomplete="off" autocapitalize="none">' +
      '<input type="text" class="tgchat-field" data-field="telegram" maxlength="100" placeholder="Telegram (@логин)" autocomplete="off" autocapitalize="none">' +
      '<input type="tel" class="tgchat-field" data-field="whatsapp" maxlength="100" placeholder="WhatsApp (номер с кодом страны)" autocomplete="tel">' +
      '<div class="tgchat-brief-actions">' +
        '<button type="button" class="tgchat-brief-send">Отправить анкету</button>' +
        '<button type="button" class="tgchat-brief-skip">Пропустить</button>' +
      '</div>';

    fillChips(briefEl.querySelector('[data-group="type"]'), 'type', TYPES);
    fillChips(briefEl.querySelector('[data-group="location"]'), 'location', LOCATIONS);
    briefEl.querySelector('[data-field="name"]').value = store(STORE_NAME) || '';

    var dateInput = briefEl.querySelector('.tgchat-date');
    var dateClear = briefEl.querySelector('.tgchat-date-clear');
    if (window.flatpickr) {
      datePicker = window.flatpickr(dateInput, {
        locale: (window.flatpickr.l10ns && window.flatpickr.l10ns.ru) || 'ru',
        dateFormat: 'd.m.Y',
        minDate: new Date(Date.now() + 86400000),
        disableMobile: true,
        onChange: function () { dateClear.hidden = !dateInput.value; }
      });
    } else {
      dateInput.type = 'date';
      dateInput.readOnly = false;
    }
    dateClear.addEventListener('click', function () {
      if (datePicker) datePicker.clear(); else dateInput.value = '';
      dateClear.hidden = true;
    });

    briefEl.querySelector('.tgchat-brief-send').addEventListener('click', sendBrief);
    briefEl.querySelector('.tgchat-brief-skip').addEventListener('click', function () {
      setBriefOpen(false);
      store(STORE_BRIEF, 'skipped');
      briefState = 'skipped';
      track('chat_brief_skip');
    });

    briefToggle = document.createElement('button');
    briefToggle.type = 'button';
    briefToggle.className = 'tgchat-brief-toggle';
    briefToggle.textContent = '📋 Заполнить анкету о съёмке';
    briefToggle.addEventListener('click', function () { setBriefOpen(true); });

    list.appendChild(briefEl);
    list.appendChild(briefToggle);
    // Развёрнутая анкета — только новому посетителю, который ещё ничего не решил
    setBriefOpen(!briefState && !sid);
  }

  function fillChips(box, key, values) {
    values.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tgchat-chip';
      b.textContent = v;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var on = picked[key] !== v;
        picked[key] = on ? v : '';
        Array.prototype.forEach.call(box.children, function (c) {
          c.setAttribute('aria-pressed', c === b && on ? 'true' : 'false');
        });
      });
      box.appendChild(b);
    });
  }

  function setBriefOpen(open) {
    if (!briefEl) return;
    briefEl.hidden = !open;
    briefToggle.hidden = open;
    if (open) briefEl.scrollIntoView({ block: 'nearest' });
  }

  function readBrief() {
    var b = { type: picked.type, location: picked.location, date: briefEl.querySelector('.tgchat-date').value.trim() };
    Array.prototype.forEach.call(briefEl.querySelectorAll('[data-field]'), function (el) {
      b[el.getAttribute('data-field')] = el.value.trim();
    });
    return b;
  }

  function briefPlain(b) {
    var rows = [
      ['📸', 'Съёмка', b.type], ['📍', 'Локация', b.location], ['📅', 'Дата', b.date],
      ['📷', 'Instagram', b.instagram], ['✈️', 'Telegram', b.telegram], ['💬', 'WhatsApp', b.whatsapp]
    ];
    return '📋 Анкета\n' + rows.filter(function (r) { return r[2]; })
      .map(function (r) { return r[0] + ' ' + r[1] + ': ' + r[2]; }).join('\n');
  }

  function sendBrief() {
    var b = readBrief();
    var keys = ['type', 'location', 'date', 'instagram', 'telegram', 'whatsapp'];
    var filled = keys.filter(function (k) { return b[k]; });
    if (!filled.length && !b.name) {
      // Пустая анкета = «Пропустить»
      briefEl.querySelector('.tgchat-brief-skip').click();
      return;
    }
    if (b.name) store(STORE_NAME, b.name);

    var contacts = ['instagram', 'telegram', 'whatsapp'].filter(function (k) { return b[k]; });
    var onOk = function () {
      store(STORE_BRIEF, 'sent');
      briefState = 'sent';
      briefEl.remove();
      briefToggle.remove();
      briefEl = briefToggle = null;
      addNotice(TEXT.briefSentNotice);
      // Только обезличенные данные: сами контакты в аналитику не отправляются
      track('chat_brief_submit', {
        service_type: b.type || 'не указан',
        service_location: b.location || 'не указана',
        booking_date: b.date || 'не указана',
        chat_contacts: contacts.join(',') || 'нет',
        contact_count: contacts.length,
        brief_fields: filled.length
      });
    };
    submit({ brief: b }, null, onOk, briefPlain(b));
  }

  /* ---------- Логика ---------- */

  function setOpen(open) {
    isOpen = open;
    document.documentElement.classList.toggle('tgchat-open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      markSeen();
      if (briefEl && !briefEl.hidden) list.scrollTop = 0; else scrollDown();
      if (window.matchMedia('(min-width: 769px)').matches && !(briefEl && !briefEl.hidden)) input.focus();
      if (sid) schedulePoll(0);
      track('chat_open', { chat_has_history: sid ? 'yes' : 'no' });
    } else {
      launcher.focus();
      if (sid) schedulePoll(POLL_CLOSED);
    }
  }

  // payload: { text?, brief? }. onFail — вернуть текст в поле; onOk — после успешной отправки.
  function submit(payload, onFail, onOk, bubbleText) {
    if (sending) { if (onFail) onFail(); return; }

    var isFirst = !sid;
    if (!sid) {
      sid = uuid();
      store(STORE_SID, sid);
    }
    // Обычное сообщение сворачивает анкету, но она остаётся доступной кнопкой
    if (briefEl && !briefEl.hidden && !payload.brief) setBriefOpen(false);

    var bubble = addMessage({ from: 'user', text: bubbleText || payload.text, ts: Date.now() });
    bubble.classList.add('tgchat-msg-pending');
    sending = true;
    sendBtn.disabled = true;

    var body = {
      sid: sid,
      text: payload.text || '',
      page: location.pathname + location.hash
    };
    if (payload.brief) {
      body.brief = payload.brief;
      body.name = payload.brief.name || '';
    }

    fetch(API + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
      .then(function (res) {
        if (!res.data.ok) throw res;
        bubble.classList.remove('tgchat-msg-pending');
        rendered[res.data.id] = true;
        sentCount++;
        if (isFirst) {
          if (!payload.brief) addNotice(TEXT.sentNotice);
          track('chat_first_message', { with_brief: payload.brief ? 'yes' : 'no' });
        }
        if (payload.text) track('chat_message_sent', { message_index: sentCount });
        if (onOk) onOk();
      })
      .catch(function (err) {
        bubble.classList.remove('tgchat-msg-pending');
        bubble.classList.add('tgchat-msg-failed');
        var limited = err && err.status === 429;
        addNotice(limited ? TEXT.rateLimited : TEXT.failed);
        track('chat_error', { error_type: limited ? 'rate_limited' : 'send_failed' });
        if (onFail) onFail();
      })
      .then(function () {
        sending = false;
        sendBtn.disabled = false;
        schedulePoll(POLL_OPEN);
      });
  }

  function poll() {
    pollTimer = null;
    if (!sid || document.hidden) return;
    if (sending) return schedulePoll(1000);

    fetch(API + '/messages?sid=' + encodeURIComponent(sid) + '&after=' + lastId, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) return;
        data.messages.forEach(function (m) {
          if (m.id > lastId) lastId = m.id;
          if (rendered[m.id]) return;
          rendered[m.id] = true;
          addMessage(m);
          if (loaded && m.from === 'op') track('chat_reply_received');
        });
        if (!loaded) {
          loaded = true;
          // Сообщения, загруженные при первом открытии страницы, не считаем новыми
          if (!seenId) markSeen();
        }
        if (isOpen) markSeen();
        updateBadge();
      })
      .catch(function () {})
      .then(function () {
        schedulePoll(isOpen ? POLL_OPEN : POLL_CLOSED);
      });
  }

  function schedulePoll(delay) {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, delay);
  }

  function addMessage(m) {
    var el = document.createElement('div');
    el.className = 'tgchat-msg tgchat-msg-' + (m.from === 'user' ? 'user' : 'op');
    if (m.id) el.setAttribute('data-id', m.id);
    el.appendChild(document.createTextNode(m.text));
    if (m.ts) {
      var t = document.createElement('time');
      t.textContent = formatTime(m.ts);
      el.appendChild(t);
    }
    list.appendChild(el);
    scrollDown();
    return el;
  }

  function addNotice(text) {
    var el = document.createElement('div');
    el.className = 'tgchat-notice';
    el.textContent = text;
    list.appendChild(el);
    scrollDown();
  }

  function markSeen() {
    if (lastId > seenId) {
      seenId = lastId;
      store(STORE_SEEN, String(seenId));
    }
    updateBadge();
  }

  function updateBadge() {
    var unread = list.querySelectorAll('.tgchat-msg-op[data-id]');
    var count = 0;
    for (var i = 0; i < unread.length; i++) {
      if (parseInt(unread[i].getAttribute('data-id'), 10) > seenId) count++;
    }
    badge.hidden = isOpen || !count;
    badge.textContent = count > 9 ? '9+' : String(count);
  }

  function scrollDown() {
    list.scrollTop = list.scrollHeight;
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return hm;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + hm;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {
      return null;
    }
  }

  function track(event, params) {
    if (typeof window.gtag !== 'function') return;
    var p = { event_category: 'chat' };
    for (var k in params) p[k] = params[k];
    window.gtag('event', event, p);
  }
})();
