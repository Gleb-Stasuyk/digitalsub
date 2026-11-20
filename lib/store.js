'use strict';
// Хранилище заявок: data/leads-db.json (все заявки со статусами, историей и заметками).
// data/leads.jsonl остаётся журналом «как пришло» (дописывается при каждой новой заявке).
// При первом запуске заявки из leads.jsonl переносятся в leads-db.json с номерами по порядку.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const STATUSES = {
  new: { label: 'Новая', icon: '🆕' },
  work: { label: 'В работе', icon: '🛠' },
  await: { label: 'Ждём оплату', icon: '⏳' },
  paid: { label: 'Оплачен', icon: '✅' },
  rejected: { label: 'Отказ', icon: '❌' },
};
const ACTIVE = ['new', 'work', 'await'];

function createStore(dataDir) {
  const DB = path.join(dataDir, 'leads-db.json');
  const LOG = path.join(dataDir, 'leads.jsonl');
  let db = { seq: 0, leads: [] };

  if (fs.existsSync(DB)) {
    db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  } else if (fs.existsSync(LOG)) {
    for (const line of fs.readFileSync(LOG, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const l = JSON.parse(line); db.leads.push(normalize(l, ++db.seq)); } catch (e) { console.error('[store] пропущена строка leads.jsonl:', e.message); }
    }
    fs.writeFileSync(DB, JSON.stringify(db, null, 1));
    console.log(`[store] перенесено заявок из leads.jsonl: ${db.leads.length}`);
  }

  function normalize(l, num) {
    return {
      num, ...l, num,
      status: l.status || 'new',
      history: l.history || [{ at: l.createdAt || new Date().toISOString(), status: 'new', by: 'site' }],
      notes: l.notes || [],
      amount: typeof l.amount === 'number' ? l.amount : estimate(l),
    };
  }

  // Атомарная запись, по очереди
  let chain = Promise.resolve();
  function save() {
    const snapshot = JSON.stringify(db, null, 1);
    chain = chain.then(async () => {
      const tmp = DB + '.tmp';
      await fsp.writeFile(tmp, snapshot, 'utf8');
      await fsp.rename(tmp, DB);
    }).catch((e) => console.error('[store] не удалось сохранить:', e.message));
    return chain;
  }

  const get = (num) => db.leads.find((l) => l.num === Number(num));
  return {
    STATUSES, ACTIVE,
    all: () => db.leads,
    get,
    async add(lead) {
      const l = normalize(lead, ++db.seq);
      db.leads.push(l);
      await fsp.appendFile(LOG, JSON.stringify(lead) + '\n', 'utf8');
      await save();
      return l;
    },
    async setStatus(num, status, by) {
      const l = get(num); if (!l || !STATUSES[status]) return null;
      if (l.status !== status) { l.status = status; l.history.push({ at: new Date().toISOString(), status, by }); await save(); }
      return l;
    },
    async addNote(num, text, by) {
      const l = get(num); if (!l) return null;
      l.notes.push({ at: new Date().toISOString(), text: String(text).slice(0, 2000), by }); await save(); return l;
    },
    async setAmount(num, amount) {
      const l = get(num); if (!l) return null;
      l.amount = Math.max(0, Math.round(Number(amount) || 0)); await save(); return l;
    },
    async setTg(num, tg) { const l = get(num); if (!l) return null; l.tg = tg; await save(); return l; },
    async remove(num) {
      const i = db.leads.findIndex((l) => l.num === Number(num)); if (i < 0) return null;
      const [l] = db.leads.splice(i, 1); await save(); return l;
    },
    search(q) {
      const s = String(q || '').toLowerCase().trim(); if (!s) return [];
      const digits = s.replace(/\D/g, '');
      return db.leads.filter((l) => {
        const hay = [l.name, l.contact, l.message, l.product, l.page, l.calc && l.calc.summary, ...(l.notes || []).map((n) => n.text)].join(' ').toLowerCase();
        if (hay.includes(s)) return true;
        return digits.length >= 4 && String(l.contact || '').replace(/\D/g, '').includes(digits);
      });
    },
  };
}

// Сумма по умолчанию для статистики оплат: стартовый платёж + разовые услуги по калькулятору,
// цена готового решения или 0. Точную сумму можно задать в админке или командой /sum.
function estimate(l) {
  const c = l.calc;
  if (!c) return 0;
  if (c.kind === 'project') { const m = /Цена:\s*([\d\s\u00a0]+)/.exec(c.summary || ''); return m ? Number(m[1].replace(/\D/g, '')) : 0; }
  return (Number(c.start) || 0) + (Number(c.once) || 0);
}

module.exports = { createStore, STATUSES, ACTIVE };
