'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  if (document.body.classList.contains('login')) {
    if (/[?&]error=1/.test(location.search)) $('#err').hidden = false;
    return;
  }
  const tz = { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' };
  const t = (iso) => new Date(iso).toLocaleString('ru-RU', tz);
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } kids.flat().forEach((k) => k != null && e.append(k)); return e; };
  let statuses = {};
  const params = () => { const p = new URLSearchParams(); const s = $('#f-status').value, q = $('#f-q').value.trim(); if (s) p.set('status', s); if (q) p.set('q', q); return p; };
  async function post(num, action, body) {
    const r = await fetch(`/admin/api/lead/${num}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    if (r.status === 401) location.reload();
    if (!r.ok) alert('Не удалось сохранить'); return r.ok;
  }
  function row(l) {
    const sel = el('select', { 'aria-label': `Статус заявки ${l.num}`, onchange: async (e) => { if (await post(l.num, 'status', { status: e.target.value })) load(); } },
      Object.entries(statuses).map(([k, v]) => { const o = el('option', { value: k }, `${v.icon} ${v.label}`); if (k === l.status) o.selected = true; return o; }));
    const amount = el('input', { class: 'amount', type: 'number', min: '0', step: '100', value: l.amount || 0, 'aria-label': 'Сумма', onchange: (e) => post(l.num, 'amount', { amount: Number(e.target.value) }) });
    const noteIn = el('input', { type: 'text', placeholder: 'Заметка', 'aria-label': 'Новая заметка' });
    const noteForm = el('form', { class: 'noteform', onsubmit: async (e) => { e.preventDefault(); if (noteIn.value.trim() && await post(l.num, 'note', { text: noteIn.value.trim() })) load(); } }, noteIn, el('button', { type: 'submit' }, '+'));
    const calc = l.calc && l.calc.summary ? el('details', {}, el('summary', {}, l.calc.kind === 'project' ? 'Готовое решение' : 'Расчёт'), el('pre', {}, l.calc.summary)) : null;
    const hist = (l.history || []).map((h) => `${(statuses[h.status] || {}).label || h.status} — ${t(h.at)}${h.by ? ` (${h.by})` : ''}`).join('\n');
    return el('tr', { 'data-status': l.status },
      el('td', { class: 'num' }, `#${l.num}`),
      el('td', {}, t(l.createdAt), el('div', { class: 'muted' }, l.page || '')),
      el('td', {}, el('b', {}, l.name), el('div', {}, l.contact), l.nda ? el('span', { class: 'badge badge--nda' }, 'NDA') : null),
      el('td', {}, el('span', { class: 'badge' }, l.product || '—'), el('div', { class: 'msg' }, l.message || ''), calc),
      el('td', {}, amount),
      el('td', { title: hist }, sel),
      el('td', {}, el('ul', { class: 'notes' }, (l.notes || []).map((n) => el('li', {}, el('time', {}, t(n.at) + ' '), n.text))), noteForm),
      el('td', {}, el('button', { class: 'del', type: 'button', title: 'Удалить заявку', onclick: async () => { if (confirm(`Удалить заявку #${l.num} без возможности восстановления?`) && await post(l.num, 'delete')) load(); } }, '✕')),
    );
  }
  async function load() {
    const p = params();
    $('#csv').href = '/admin/export.csv' + (p.toString() ? '?' + p : '');
    const r = await fetch('/admin/api/leads?' + p); if (r.status === 401) return location.reload();
    const j = await r.json(); statuses = j.statuses;
    const fs = $('#f-status');
    if (fs.options.length === 2) Object.entries(statuses).forEach(([k, v]) => fs.add(new Option(`${v.icon} ${v.label}`, k)));
    $('#botwarn').hidden = j.botAdmin;
    $('#count').textContent = `Заявок: ${j.leads.length}`;
    $('#rows').replaceChildren(...j.leads.map(row));
  }
  let tm; $('#f-q').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(load, 250); });
  $('#f-status').addEventListener('change', load);
  load(); setInterval(() => { if (!document.activeElement || !document.activeElement.closest('tbody')) load(); }, 60000);
})();
