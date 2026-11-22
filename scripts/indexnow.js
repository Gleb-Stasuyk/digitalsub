'use strict';
// Отправка всех URL из sitemap.xml в IndexNow (Яндекс и общий api.indexnow.org).
// Запуск после деплоя: npm run indexnow   (или node scripts/indexnow.js [https://digitalsub.ru])
// Ключ — публичный файл public/<ключ>.txt в корне сайта (так требует протокол IndexNow, это не секрет).
const fs = require('node:fs');
const path = require('node:path');

const SITE = (process.argv[2] || 'https://digitalsub.ru').replace(/\/+$/, '');
const PUB = path.join(__dirname, '..', 'public');
const keyFile = fs.readdirSync(PUB).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('IndexNow: нет файла ключа public/<32 hex>.txt'); process.exit(1); }
const key = keyFile.slice(0, -4);
const host = new URL(SITE).host;
const urls = [...fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const body = JSON.stringify({ host, key, keyLocation: `${SITE}/${keyFile}`, urlList: urls });

(async () => {
  let failed = 0;
  for (const ep of ['https://yandex.com/indexnow', 'https://api.indexnow.org/indexnow']) {
    try {
      const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body });
      const t = (await r.text()).slice(0, 200).replace(/\s+/g, ' ');
      console.log(`${ep} -> HTTP ${r.status}${t ? ' ' + t : ''}`);
      if (r.status >= 400) failed++;
    } catch (e) { failed++; console.log(`${ep} -> ошибка: ${e.message}`); }
  }
  console.log(`URL отправлено: ${urls.length}`);
  process.exit(failed ? 1 : 0);
})();
