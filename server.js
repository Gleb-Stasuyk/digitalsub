'use strict';
// DigitalSub — минимальный сервер без внешних зависимостей:
// раздаёт статику из ./public, принимает заявки на POST /api/lead,
// отправляет их в Telegram-бот администратора (lib/bot.js) и обслуживает веб-админку /admin (lib/admin.js).
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const PORT = parseInt(process.env.PORT || '8080', 10);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const LEADS_FILE = path.join(DATA_DIR, 'leads-db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const MAX_BODY = 16 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });
const { createStore } = require('./lib/store');
const { createBot } = require('./lib/bot');
const { createAdmin } = require('./lib/admin');
const store = createStore(DATA_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': cspHeader(),
};

// CSP: свои файлы + Яндекс Метрика + Google Tag Manager / Analytics. Хеши встроенных скриптов счётчиков пишет site/build.js в lib/csp.json.
function cspHeader() {
  let hashes = [], styleHashes = [];
  try { const c = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'csp.json'), 'utf8')); hashes = c.scriptHashes || []; styleHashes = c.styleAttrHashes || []; } catch {}
  const ym = 'https://mc.yandex.ru https://mc.yandex.com';
  const g = 'https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com';
  return [
    "default-src 'self'",
    `img-src 'self' data: ${ym} ${g} https://www.google.com https://*.g.doubleclick.net`,
    "style-src 'self'",
    styleHashes.length ? `style-src-attr 'unsafe-hashes' ${styleHashes.map((h) => `'${h}'`).join(' ')}` : '',
    `script-src 'self' ${hashes.map((h) => `'${h}'`).join(' ')} ${ym} https://yastatic.net ${g}`.replace(/\s+/g, ' '),
    `connect-src 'self' ${ym} wss://mc.yandex.ru wss://mc.yandex.com ${g} https://www.google.com https://*.g.doubleclick.net`,
    `frame-src blob: ${ym} https://www.googletagmanager.com`,
    `child-src blob: ${ym}`,
    "frame-ancestors 'self' https://metrika.yandex.ru https://metrika.yandex.by https://metrica.yandex.com https://metrica.yandex.com.tr https://webvisor.com https://*.webvisor.com",
    "base-uri 'self'",
    "form-action 'self'",
  ].filter(Boolean).join('; ');
}

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

function clientIp(req) {
  return String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
}
function refPath(ref) { try { const u = new URL(ref); return (u.pathname + u.search).slice(0, 300); } catch { return ''; } }
async function readBody(req, max) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) return null; chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

const bot = TG_TOKEN ? createBot({ token: TG_TOKEN, adminChatId: TG_ADMIN, dataDir: DATA_DIR, store, apiBase: process.env.TELEGRAM_API_BASE || undefined }) : null;
const admin = createAdmin({ password: ADMIN_PASSWORD, store, bot, clientIp, readBody, securityHeaders: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' } });

async function handleLead(req, res) {
  const ip = clientIp(req);
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
    nda: data.nda === true || data.nda === '1' || data.nda === 'on', // соглашение о неконкуренции и неразглашении
    page: clean(data.page, 300) || refPath(req.headers.referer),
    ip, userAgent: clean(req.headers['user-agent'], 300),
  };
  if (lead.name.length < 2) return json(res, 422, { ok: false, error: 'Укажите имя' });
  if (lead.contact.length < 3) return json(res, 422, { ok: false, error: 'Укажите телефон или Telegram' });
  if (!data.consent || data.consent === 'false') return json(res, 422, { ok: false, error: 'Нужно согласие на обработку данных' });

  let saved;
  try { saved = await store.add(lead); }
  catch (e) { console.error('Save failed:', e); return json(res, 500, { ok: false, error: 'Не удалось сохранить заявку' }); }
  console.log(`[lead] #${saved.num} ${lead.createdAt}`);
  if (bot) bot.notifyLead(saved); // не блокируем ответ
  return json(res, 200, { ok: true, id: lead.id });
}

const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const redirect = (res, location) => send(res, 301, '', { Location: location, 'Cache-Control': 'public, max-age=3600' });

// Кэш: HTML — всегда с проверкой (no-cache + ETag); статика с ?v=<хеш> из билда — на год (immutable);
// картинки — неделя; прочие файлы без версии (pricing.json, projects.json и т. п.) — час.
const LONG_CACHE = 'public, max-age=31536000, immutable';
function cacheControl(ext, search) {
  if (ext === '.html') return 'no-cache';
  if (/[?&]v=[0-9a-f]{6,}/.test(search || '')) return LONG_CACHE;
  if (['.png', '.jpg', '.webp', '.ico'].includes(ext) || ext === '.svg') return 'public, max-age=604800';
  return 'public, max-age=3600';
}

// Сжатие текстовых файлов: brotli или gzip, результат держится в памяти до изменения файла
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt', '.webmanifest']);
const zcache = new Map();
function pickEncoding(accept) {
  const a = String(accept || '');
  if (/\bbr\b/.test(a)) return 'br';
  if (/\bgzip\b/.test(a)) return 'gzip';
  return null;
}
async function compressed(file, st, enc) {
  const key = `${file}|${st.mtimeMs}|${st.size}|${enc}`;
  let buf = zcache.get(key);
  if (!buf) {
    const raw = await fsp.readFile(file);
    buf = enc === 'br'
      ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
      : zlib.gzipSync(raw, { level: 9 });
    if (zcache.size > 500) zcache.clear();
    zcache.set(key, buf);
  }
  return buf;
}

// Чистые адреса страниц: /prices -> public/prices.html, /services/shop -> public/services/shop.html.
// Старые адреса с .html и со слешем на конце перенаправляются на чистые (301).
async function serveStatic(req, res, pathname, search) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
  if (rel.includes('\0')) return send(res, 400, 'Bad request');
  if (rel === '/index.html') return redirect(res, '/' + search);
  const verification = /^\/(yandex_[0-9a-f]+|google[0-9a-z]+)\.html$/.test(rel); // отдаются как есть, без 301
  if (rel.endsWith('.html') && rel !== '/404.html' && !verification && isFile(path.join(PUBLIC_DIR, rel))) return redirect(res, rel.slice(0, -5) + search);
  if (rel.length > 1 && rel.endsWith('/')) {
    const clean = rel.replace(/\/+$/, '');
    if (isFile(path.join(PUBLIC_DIR, clean + '.html'))) return redirect(res, clean + search);
  }
  if (rel.endsWith('/')) rel += 'index.html';
  else if (!path.extname(rel) && isFile(path.join(PUBLIC_DIR, rel + '.html'))) rel += '.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error('not file');
    const ext = path.extname(file).toLowerCase();
    const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const headers = { ...SECURITY_HEADERS, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cacheControl(ext, search), ETag: etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    const enc = COMPRESSIBLE.has(ext) && st.size >= 1024 ? pickEncoding(req.headers['accept-encoding']) : null;
    if (COMPRESSIBLE.has(ext)) headers.Vary = 'Accept-Encoding';
    if (enc) {
      const body = await compressed(file, st, enc);
      res.writeHead(200, { ...headers, 'Content-Encoding': enc, 'Content-Length': body.length });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch {
    const nf = path.join(PUBLIC_DIR, '404.html');
    send(res, 404, fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found', { 'Content-Type': MIME['.html'] });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname, search } = new URL(req.url, 'http://localhost');
    if (pathname === '/api/health') return json(res, 200, { ok: true });
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return await admin(req, res, new URL(req.url, 'http://localhost'));
    if (pathname === '/api/lead') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
      return await handleLead(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, pathname, search);
  } catch (e) { console.error(e); if (!res.headersSent) json(res, 500, { ok: false, error: 'Server error' }); }
});

server.listen(PORT, () => {
  console.log(`DigitalSub запущен на порту ${PORT}. Заявки: ${LEADS_FILE} (${store.all().length}). Telegram-бот: ${bot ? 'включён' : 'выключен'}. Админка: ${ADMIN_PASSWORD ? 'включена' : 'выключена (нет ADMIN_PASSWORD)'}`);
  if (bot) bot.start();
});
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { if (bot) bot.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
