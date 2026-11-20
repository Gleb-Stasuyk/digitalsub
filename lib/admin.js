'use strict';
// Веб-админка заявок: /admin (пароль из ADMIN_PASSWORD), API под /admin/api/*, выгрузка CSV.
// Сессия — случайный токен в cookie (HttpOnly, Secure, SameSite=Strict, Path=/admin), хранится в памяти.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const UI = path.join(__dirname, 'admin-ui');
const SESSION_TTL = 7 * 24 * 3600e3;
const COOKIE = 'ds_admin';

function createAdmin({ password, store, bot, clientIp, readBody, securityHeaders }) {
  const sessions = new Map(); // token -> expires
  const fails = new Map(); // ip -> [timestamps]
  const H = { ...securityHeaders, 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" };
  const pwHash = password ? crypto.createHash('sha256').update(password).digest() : null;

  const send = (res, status, body, headers = {}) => { res.writeHead(status, { ...H, ...headers }); res.end(body); };
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
  const page = (res, file, status = 200) => send(res, status, fs.readFileSync(path.join(UI, file)), { 'Content-Type': 'text/html; charset=utf-8' });

  function authed(req) {
    const m = /(?:^|;\s*)ds_admin=([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (!m) return false;
    const exp = sessions.get(m[1]);
    if (!exp || exp < Date.now()) { sessions.delete(m[1]); return false; }
    return m[1];
  }
  function tooMany(ip) {
    const now = Date.now(); const list = (fails.get(ip) || []).filter((t) => now - t < 15 * 60e3);
    fails.set(ip, list); if (fails.size > 5000) fails.clear();
    return list.length >= 5;
  }
  // Защита от CSRF: изменяющие запросы только с нашего Origin (плюс SameSite=Strict у cookie)
  function sameOrigin(req) {
    const o = req.headers.origin; if (!o) return true;
    try { return new URL(o).host === req.headers.host; } catch { return false; }
  }

  const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const mskTime = (iso) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  function filtered(url) {
    const st = url.searchParams.get('status') || ''; const q = url.searchParams.get('q') || '';
    let list = q ? store.search(q) : store.all();
    if (st === 'active') list = list.filter((l) => store.ACTIVE.includes(l.status)); else if (st) list = list.filter((l) => l.status === st);
    return [...list].reverse();
  }

  return async function handle(req, res, url) {
    const p = url.pathname;
    if (!pwHash) return send(res, 503, 'Админка не настроена: задайте ADMIN_PASSWORD.', { 'Content-Type': 'text/plain; charset=utf-8' });
    if (p === '/admin/assets/admin.js' || p === '/admin/assets/admin.css') {
      const f = path.join(UI, path.basename(p));
      return send(res, 200, fs.readFileSync(f), { 'Content-Type': p.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8' });
    }
    if (p === '/admin/login' && req.method === 'POST') {
      const ip = clientIp(req);
      if (tooMany(ip)) return send(res, 429, 'Слишком много попыток. Попробуйте через 15 минут.', { 'Content-Type': 'text/plain; charset=utf-8' });
      if (!sameOrigin(req)) return send(res, 403, 'Forbidden');
      const raw = await readBody(req, 4096); const pw = new URLSearchParams(raw || '').get('password') || '';
      const ok = crypto.timingSafeEqual(crypto.createHash('sha256').update(pw).digest(), pwHash);
      if (!ok) { fails.get(ip).push(Date.now()); console.warn(`[admin] неверный пароль с ${ip}`); return send(res, 303, '', { Location: '/admin?error=1' }); }
      const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, Date.now() + SESSION_TTL);
      return send(res, 303, '', { Location: '/admin', 'Set-Cookie': `${COOKIE}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}` });
    }
    const token = authed(req);
    if (p === '/admin/logout' && req.method === 'POST') {
      if (token) sessions.delete(token);
      return send(res, 303, '', { Location: '/admin', 'Set-Cookie': `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
    }
    if (p === '/admin' || p === '/admin/') return page(res, token ? 'admin.html' : 'login.html');
    if (!token) return json(res, 401, { ok: false, error: 'Нужен вход' });

    if (p === '/admin/api/leads' && req.method === 'GET') return json(res, 200, { ok: true, statuses: store.STATUSES, leads: filtered(url), botAdmin: bot ? bot.hasAdmin() : false });
    if (p === '/admin/export.csv' && req.method === 'GET') {
      const head = ['№', 'Дата (МСК)', 'Статус', 'Имя', 'Контакт', 'Тип', 'Задача', 'Расчёт / решение', 'NDA', 'Сумма', 'Страница', 'Заметки'];
      const rows = filtered(url).map((l) => [l.num, mskTime(l.createdAt), (store.STATUSES[l.status] || {}).label, l.name, l.contact, l.product, l.message, l.calc && l.calc.summary, l.nda ? 'да' : '', l.amount || '', l.page, (l.notes || []).map((n) => `${mskTime(n.at)}: ${n.text}`).join('\n')]);
      const csv = '\ufeff' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
      return send(res, 200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="digitalsub-leads-${new Date().toISOString().slice(0, 10)}.csv"` });
    }
    const m = /^\/admin\/api\/lead\/(\d+)\/(status|note|amount|delete)$/.exec(p);
    if (m && req.method === 'POST') {
      if (!sameOrigin(req) || !(req.headers['content-type'] || '').includes('application/json')) return json(res, 403, { ok: false, error: 'Forbidden' });
      let data = {}; try { data = JSON.parse((await readBody(req, 8192)) || '{}'); } catch { return json(res, 400, { ok: false }); }
      const num = Number(m[1]); let l;
      if (m[2] === 'status') l = await store.setStatus(num, data.status, 'web');
      else if (m[2] === 'note') l = String(data.text || '').trim() ? await store.addNote(num, String(data.text).trim(), 'web') : null;
      else if (m[2] === 'amount') l = await store.setAmount(num, data.amount);
      else if (m[2] === 'delete') { l = await store.remove(num); if (l && bot) await bot.removed(l); return json(res, l ? 200 : 404, { ok: !!l }); }
      if (!l) return json(res, 404, { ok: false, error: 'Не найдено' });
      if (bot) bot.refreshCard(l);
      return json(res, 200, { ok: true, lead: l });
    }
    return json(res, 404, { ok: false, error: 'Not found' });
  };
}

module.exports = { createAdmin };
