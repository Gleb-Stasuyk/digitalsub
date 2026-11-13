'use strict';
// DigitalSub — минимальный сервер без внешних зависимостей:
// раздаёт статику из ./public и принимает заявки на POST /api/lead.
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = parseInt(process.env.PORT || '8080', 10);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const LEADS_FILE = path.join(DATA_DIR, 'leads.jsonl');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';
const MAX_BODY = 16 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};

// Простой rate limit: не больше 5 заявок за 10 минут с одного IP
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });

function clean(v, max, multiline = false) {
  const re = multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
  return String(v ?? '').replace(/\r\n?/g, '\n').replace(re, ' ').trim().slice(0, max);
}

function parseCalc(v) {
  if (!v) return null;
  try { const o = typeof v === 'string' ? JSON.parse(v.slice(0, 6000)) : v;
    if (o && typeof o.summary === 'string') o.summary = clean(o.summary, 3000, true); return o && typeof o === 'object' ? o : null; }
  catch { return null; }
}

async function notifyTelegram(lead) {
  if (!TG_TOKEN || !TG_CHAT) return false;
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const text = `<b>Новая заявка DigitalSub</b>\n\n<b>Имя:</b> ${esc(lead.name)}\n<b>Контакт:</b> ${esc(lead.contact)}\n<b>Тип:</b> ${esc(lead.product || '—')}\n<b>Задача:</b> ${esc(lead.message || '—')}${lead.calc && lead.calc.summary ? `\n\n<b>Расчёт:</b>\n${esc(lead.calc.summary.replace(/^Расчёт с калькулятора:\n?/, ''))}` : ''}\n\n<i>${lead.createdAt}</i>`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error('Telegram error', r.status, await r.text());
    return r.ok;
  } catch (e) { console.error('Telegram request failed:', e.message); return false; }
}

async function handleLead(req, res) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  if (rateLimited(ip)) return json(res, 429, { ok: false, error: 'Слишком много заявок. Попробуйте позже.' });
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) return json(res, 413, { ok: false, error: 'Слишком большой запрос' }); chunks.push(c); }
  let data;
  try {
    const raw = Buffer.concat(chunks).toString('utf8');
    data = (req.headers['content-type'] || '').includes('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch { return json(res, 400, { ok: false, error: 'Некорректные данные' }); }

  if (clean(data.website, 100)) return json(res, 200, { ok: true }); // honeypot — бот
  const lead = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: clean(data.name, 100),
    contact: clean(data.contact, 100),
    product: clean(data.product, 60),
    message: clean(data.message, 2000, true),
    calc: parseCalc(data.calc),
    ip, userAgent: clean(req.headers['user-agent'], 300),
  };
  if (lead.name.length < 2) return json(res, 422, { ok: false, error: 'Укажите имя' });
  if (lead.contact.length < 3) return json(res, 422, { ok: false, error: 'Укажите телефон или Telegram' });
  if (!data.consent || data.consent === 'false') return json(res, 422, { ok: false, error: 'Нужно согласие на обработку данных' });

  try { await fsp.appendFile(LEADS_FILE, JSON.stringify(lead) + '\n', 'utf8'); }
  catch (e) { console.error('Save failed:', e); return json(res, 500, { ok: false, error: 'Не удалось сохранить заявку' }); }
  console.log(`[lead] ${lead.createdAt} ${lead.name} / ${lead.contact}`);
  notifyTelegram(lead); // не блокируем ответ
  return json(res, 200, { ok: true, id: lead.id });
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error('not file');
    const ext = path.extname(file).toLowerCase();
    const cache = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch {
    const nf = path.join(PUBLIC_DIR, '404.html');
    send(res, 404, fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found', { 'Content-Type': MIME['.html'] });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api/health') return json(res, 200, { ok: true });
    if (pathname === '/api/lead') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
      return await handleLead(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, pathname);
  } catch (e) { console.error(e); if (!res.headersSent) json(res, 500, { ok: false, error: 'Server error' }); }
});

server.listen(PORT, () => console.log(`DigitalSub запущен на порту ${PORT}. Заявки: ${LEADS_FILE}. Telegram: ${TG_TOKEN && TG_CHAT ? 'включён' : 'выключен'}`));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => server.close(() => process.exit(0)));
