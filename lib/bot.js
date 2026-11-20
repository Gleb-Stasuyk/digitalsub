'use strict';
// Telegram-бот администратора: уведомления о заявках с кнопками статуса, заметки и команды.
// Работает через long polling (getUpdates) внутри процесса сайта; ошибки логируются и не роняют сервер.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const TZ = 'Europe/Moscow';
const fmtTime = (iso) => new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) + ' МСК';
const rub = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)) + ' ₽';
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createBot({ token, adminChatId, dataDir, store, apiBase = 'https://api.telegram.org' }) {
  const { STATUSES, ACTIVE } = store;
  const STATE = path.join(dataDir, 'bot-state.json');
  let state = { offset: 0, adminChatId: null, pendingNote: null };
  try { if (fs.existsSync(STATE)) state = { ...state, ...JSON.parse(fs.readFileSync(STATE, 'utf8')) }; } catch (e) { console.error('[bot] bot-state.json повреждён:', e.message); }
  const admin = () => String(adminChatId || state.adminChatId || '');
  const saveState = () => fsp.writeFile(STATE, JSON.stringify(state)).catch((e) => console.error('[bot] state save:', e.message));
  let stopped = false;

  async function api(method, body, timeoutMs = 15000) {
    const r = await fetch(`${apiBase}/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(timeoutMs),
    });
    const j = await r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
    if (!j.ok) { const e = new Error(`${method}: ${j.description || r.status}`); e.code = j.error_code || r.status; throw e; }
    return j.result;
  }
  const safe = (p) => p.catch((e) => { console.error('[bot]', e.message); return null; });

  // ---------- Карточка заявки ----------
  function card(l) {
    const st = STATUSES[l.status] || STATUSES.new;
    const c = l.calc;
    const calcTxt = c && c.summary ? esc(c.summary.replace(/^(Расчёт с калькулятора|Готовое решение):\s?\n?/, '')) : '';
    const lines = [
      `<b>Заявка #${l.num}</b> · ${st.icon} <b>${st.label}</b>`,
      '',
      `<b>Имя:</b> ${esc(l.name)}`,
      `<b>Контакт:</b> ${esc(l.contact)}`,
      `<b>Тип:</b> ${esc(l.product || '—')}`,
      `<b>Задача:</b> ${esc(l.message || '—')}`,
    ];
    if (calcTxt) lines.push('', `<b>${c.kind === 'project' ? 'Готовое решение' : 'Расчёт'}:</b>`, calcTxt);
    lines.push('', `<b>NDA:</b> ${l.nda ? 'да, подписать соглашение о неконкуренции и неразглашении' : 'нет'}`);
    if (l.amount) lines.push(`<b>Сумма:</b> ${rub(l.amount)}`);
    lines.push(`<b>Страница:</b> ${esc(l.page || '—')}`, `<b>Время:</b> ${fmtTime(l.createdAt)}`);
    if (l.notes && l.notes.length) { lines.push('', '<b>Заметки:</b>'); l.notes.slice(-5).forEach((n) => lines.push(`• ${esc(n.text)} <i>(${fmtTime(n.at)})</i>`)); }
    if (l.history && l.history.length > 1) lines.push('', `<i>История: ${l.history.map((h) => `${(STATUSES[h.status] || {}).label || h.status} ${fmtTime(h.at)}`).join(' → ')}</i>`);
    let t = lines.join('\n');
    if (t.length > 4000) t = t.slice(0, 3990) + '…';
    return t;
  }
  const keyboard = (l) => ({ inline_keyboard: [
    [['work', 'В работу'], ['await', 'Ждём оплату']].map(([s, t]) => ({ text: (l.status === s ? '• ' : '') + t, callback_data: `s:${l.num}:${s}` })),
    [['paid', 'Оплачен'], ['rejected', 'Отказ']].map(([s, t]) => ({ text: (l.status === s ? '• ' : '') + t, callback_data: `s:${l.num}:${s}` })),
    [{ text: '📝 Заметка', callback_data: `n:${l.num}` }],
  ] });

  async function sendCard(l, chatId = admin()) {
    const m = await api('sendMessage', { chat_id: chatId, text: card(l), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard(l) });
    await store.setTg(l.num, { chatId: m.chat.id, messageId: m.message_id });
    return m;
  }
  async function refreshCard(l) {
    if (!l || !l.tg) return;
    try { await api('editMessageText', { chat_id: l.tg.chatId, message_id: l.tg.messageId, text: card(l), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard(l) }); }
    catch (e) { if (!/not modified/.test(e.message)) console.error('[bot] edit:', e.message); }
  }
  const reply = (chatId, text, extra = {}) => api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

  // ---------- Команды ----------
  const short = (l) => `#${l.num} · ${(STATUSES[l.status] || {}).icon || ''} ${esc(l.name)} · ${esc(l.contact)} · ${fmtTime(l.createdAt).replace(/, \d\d:\d\d МСК/, '')}`;
  const HELP = [
    '<b>Команды</b>',
    '/leads — новые и активные заявки',
    '/lead N — карточка заявки №N с кнопками',
    '/stats — заявки и оплаты за неделю и месяц',
    '/find текст — поиск по телефону, имени, тексту, заметкам',
    '/sum N сумма — указать сумму оплаты заявки (для /stats)',
    '/cancel — отменить ввод заметки',
    '/help — эта справка',
    '',
    'Кнопки под заявкой меняют её статус, «Заметка» — следующее сообщение сохранится как заметка.',
  ].join('\n');

  function stats() {
    const now = Date.now();
    const msk = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    const monthStartMsk = new Date(Date.UTC(msk.getFullYear(), msk.getMonth(), 1) - 3 * 3600e3).getTime(); // МСК = UTC+3
    const periods = [['За 7 дней', now - 7 * 864e5], ['С начала месяца', monthStartMsk]];
    const all = store.all();
    const out = ['<b>Статистика</b>'];
    for (const [name, from] of periods) {
      const created = all.filter((l) => Date.parse(l.createdAt) >= from);
      const paid = all.filter((l) => l.status === 'paid' && Date.parse(([...l.history].reverse().find((h) => h.status === 'paid') || {}).at || l.createdAt) >= from);
      out.push('', `<b>${name}</b>`, `Заявок: ${created.length}`, `Оплачено: ${paid.length} на ${rub(paid.reduce((s, l) => s + (l.amount || 0), 0))}`);
    }
    const byStatus = Object.entries(STATUSES).map(([k, v]) => `${v.icon} ${v.label}: ${all.filter((l) => l.status === k).length}`);
    out.push('', '<b>Сейчас</b>', ...byStatus, '', '<i>Сумма оплаты — из калькулятора (старт + разовые) или задана вручную: /sum N сумма.</i>');
    return out.join('\n');
  }

  async function onMessage(m) {
    const chatId = String(m.chat.id);
    const text = String(m.text || '').trim();
    if (!admin()) {
      if (m.chat.type === 'private' && /^\/start\b/.test(text)) {
        state.adminChatId = chatId; await saveState();
        console.log(`[bot] администратор назначен: chat ${chatId}`);
        return reply(chatId, `Готово: этот чат назначен администратором DigitalSub. Сюда будут приходить заявки с сайта.\n\n${HELP}`);
      }
      return;
    }
    if (chatId !== admin()) { if (/^\/start\b/.test(text)) await reply(chatId, 'Этот бот служебный и доступен только администратору DigitalSub.'); return; }

    const [cmd0, ...args] = text.split(/\s+/); const cmd = cmd0.replace(/@\w+$/, '').toLowerCase(); const arg = args.join(' ');
    if (state.pendingNote && !text.startsWith('/')) {
      const num = state.pendingNote; state.pendingNote = null; await saveState();
      const l = await store.addNote(num, text, 'telegram');
      if (!l) return reply(chatId, `Заявка #${num} не найдена.`);
      await refreshCard(l);
      return reply(chatId, `Заметка к заявке #${num} сохранена.`);
    }
    switch (cmd) {
      case '/start': case '/help': return reply(chatId, HELP);
      case '/cancel': state.pendingNote = null; await saveState(); return reply(chatId, 'Ввод заметки отменён.');
      case '/leads': {
        const list = store.all().filter((l) => ACTIVE.includes(l.status)).slice(-40).reverse();
        if (!list.length) return reply(chatId, 'Активных заявок нет.');
        const groups = ACTIVE.map((s) => [s, list.filter((l) => l.status === s)]).filter(([, a]) => a.length);
        return reply(chatId, groups.map(([s, a]) => `<b>${STATUSES[s].icon} ${STATUSES[s].label} (${a.length})</b>\n${a.map(short).join('\n')}`).join('\n\n') + '\n\nОткрыть: /lead N');
      }
      case '/lead': {
        const l = store.get(parseInt(arg.replace('#', ''), 10));
        if (!l) return reply(chatId, 'Укажите номер: /lead 12');
        return sendCard(l, chatId);
      }
      case '/stats': return reply(chatId, stats());
      case '/find': {
        if (!arg) return reply(chatId, 'Что искать? Например: /find 79991234567 или /find Иван');
        const found = store.search(arg).slice(-30).reverse();
        return reply(chatId, found.length ? `Найдено: ${found.length}\n${found.map(short).join('\n')}\n\nОткрыть: /lead N` : 'Ничего не найдено.');
      }
      case '/sum': {
        const num = parseInt((args[0] || '').replace('#', ''), 10); const sum = Number((args.slice(1).join('')).replace(/[^\d]/g, ''));
        const l = store.get(num);
        if (!l || !args[1]) return reply(chatId, 'Формат: /sum 12 25000');
        await store.setAmount(num, sum); await refreshCard(l);
        return reply(chatId, `Сумма заявки #${num}: ${rub(sum)}`);
      }
      default: return reply(chatId, `Не понял команду.\n\n${HELP}`);
    }
  }

  async function onCallback(q) {
    const chatId = String((q.message && q.message.chat.id) || q.from.id);
    if (!admin() || chatId !== admin()) return api('answerCallbackQuery', { callback_query_id: q.id, text: 'Нет доступа' });
    const [kind, numS, st] = String(q.data || '').split(':'); const num = Number(numS);
    const l = store.get(num);
    if (!l) return api('answerCallbackQuery', { callback_query_id: q.id, text: `Заявка #${num} не найдена (удалена?)` });
    if (kind === 's' && STATUSES[st]) {
      await store.setStatus(num, st, 'telegram');
      // карточка могла быть открыта через /lead — обновляем именно это сообщение
      if (q.message) { l.tg = { chatId: q.message.chat.id, messageId: q.message.message_id }; await store.setTg(num, l.tg); }
      await refreshCard(l);
      return api('answerCallbackQuery', { callback_query_id: q.id, text: `#${num}: ${STATUSES[st].label}` });
    }
    if (kind === 'n') {
      state.pendingNote = num; await saveState();
      await api('answerCallbackQuery', { callback_query_id: q.id });
      return reply(chatId, `Напишите заметку к заявке #${num} следующим сообщением (или /cancel).`);
    }
    return api('answerCallbackQuery', { callback_query_id: q.id });
  }

  async function poll() {
    let backoff = 2000;
    safe(api('setMyCommands', { commands: [
      { command: 'leads', description: 'Новые и активные заявки' }, { command: 'lead', description: 'Карточка заявки: /lead N' },
      { command: 'stats', description: 'Статистика за неделю и месяц' }, { command: 'find', description: 'Поиск: /find текст' },
      { command: 'help', description: 'Справка' },
    ] }));
    while (!stopped) {
      try {
        const updates = await api('getUpdates', { offset: state.offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, 60000);
        backoff = 2000;
        for (const u of updates) {
          state.offset = u.update_id + 1;
          try {
            if (u.message) await onMessage(u.message);
            else if (u.callback_query) await onCallback(u.callback_query);
          } catch (e) { console.error('[bot] update', u.update_id, e.message); }
        }
        if (updates.length) await saveState();
      } catch (e) {
        if (stopped) break;
        const wait = e.code === 409 ? 30000 : backoff;
        console.error(`[bot] getUpdates: ${e.message}; повтор через ${wait / 1000} с`);
        await sleep(wait); backoff = Math.min(backoff * 2, 60000);
      }
    }
  }

  return {
    start() { console.log(`[bot] запущен, администратор: ${admin() ? 'назначен' : 'ещё не назначен (ждём /start)'}`); poll(); },
    stop() { stopped = true; },
    hasAdmin: () => !!admin(),
    // Новая заявка — карточка администратору. Без админа заявка просто сохраняется.
    notifyLead(l) { if (admin()) safe(sendCard(l)); },
    refreshCard: (l) => safe(refreshCard(l)),
    async removed(l) { if (l && l.tg) await safe(api('editMessageText', { chat_id: l.tg.chatId, message_id: l.tg.messageId, text: `Заявка #${l.num} удалена из админки.` })); },
    card,
  };
}

module.exports = { createBot, fmtTime };
