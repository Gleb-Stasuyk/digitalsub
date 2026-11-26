'use strict';
// Антиспам заявок: подпись токена формы (HMAC), лимит по IP, фильтры содержимого.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MIN_FILL_MS = 3000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const BURST = { ms: 10 * 60 * 1000, max: 5, msg: 'Слишком много заявок подряд. Подождите несколько минут и попробуйте снова.' };
const DAILY = { ms: 24 * 60 * 60 * 1000, max: 20, msg: 'Слишком много заявок с вашего адреса за сутки. Попробуйте завтра или напишите на info@digitalsub.ru.' };
const HTML_RE = /<\s*\/?\s*[a-zA-Z!?][^>]{0,200}>/;
const LINK_RE = /https?:\/\/[^\s<>]+|www\.[^\s<>]+/gi;

function loadSecret(dataDir) {
  const fromEnv = String(process.env.FORM_SECRET || '').trim();
  if (fromEnv.length >= 16) return fromEnv;
  const file = path.join(dataDir, 'form-secret');
  try {
    const s = fs.readFileSync(file, 'utf8').trim();
    if (s.length >= 16) return s;
  } catch {}
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  console.log('[lead] сгенерирован секрет подписи формы в каталоге данных; чтобы зафиксировать его, задайте FORM_SECRET в .env');
  return s;
}

function createAntispam(dataDir) {
  const secret = loadSecret(dataDir);
  const hits = new Map();

  function sign(ts = Date.now()) {
    const t = String(ts);
    const sig = crypto.createHmac('sha256', secret).update(t).digest('base64url');
    return `${t}.${sig}`;
  }

  function checkToken(token) {
    const raw = String(token || '').trim();
    if (!raw) return 'token_missing';
    const i = raw.lastIndexOf('.');
    if (i < 1) return 'token_invalid';
    const t = raw.slice(0, i), sig = raw.slice(i + 1);
    if (!/^\d{10,15}$/.test(t)) return 'token_invalid';
    const expect = crypto.createHmac('sha256', secret).update(t).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'token_invalid';
    const age = Date.now() - Number(t);
    if (age < MIN_FILL_MS) return 'too_fast';
    if (age > TOKEN_TTL_MS) return 'token_expired';
    return null;
  }

  // Принимаем токен из скрытого поля или cookie: достаточно одного действительного.
  // Если в поле есть значение, проверяем его; cookie — запасной путь без JS.
  function checkRequestToken(bodyToken, cookieToken) {
    const field = String(bodyToken || '').trim();
    if (field) return checkToken(field);
    if (cookieToken) return checkToken(cookieToken);
    return 'token_missing';
  }

  function parseCookie(req, name) {
    const raw = String(req.headers.cookie || '');
    const re = new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)');
    const m = re.exec(raw);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function tokenCookie(req, token) {
    const https = String(req.headers['x-forwarded-proto'] || '').includes('https');
    return `ds_ft=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${https ? '; Secure' : ''}`;
  }

  function rateLimit(ip) {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < DAILY.ms);
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        const keep = v.filter((t) => now - t < DAILY.ms);
        if (keep.length) hits.set(k, keep); else hits.delete(k);
      }
    }
    const burst = list.filter((t) => now - t < BURST.ms).length;
    if (burst > BURST.max) return BURST;
    if (list.length > DAILY.max) return DAILY;
    return null;
  }

  function contentReason(name, message) {
    if (HTML_RE.test(name) || HTML_RE.test(message)) return 'html';
    if (/(https?:\/\/|www\.)/i.test(name)) return 'url_in_name';
    const links = message.match(LINK_RE) || [];
    if (links.length > 2) return 'too_many_links';
    return null;
  }

  function validContact(c) {
    const s = String(c || '').trim();
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return true;
    if (/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(s)) return true;
    if (/^(https?:\/\/)?(t\.me|telegram\.me)\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/i.test(s)) return true;
    if (/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,24}$/.test(s) && !/\s/.test(s) && s.length <= 100) return true;
    return false;
  }

  return { sign, checkToken, checkRequestToken, parseCookie, tokenCookie, rateLimit, contentReason, validContact, MIN_FILL_MS, TOKEN_TTL_MS, BURST, DAILY };
}

module.exports = { createAntispam };
