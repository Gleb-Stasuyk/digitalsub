(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Меню ---------- */
  const burger = $('#burger'), nav = $('#nav');
  if (burger && nav) {
    burger.addEventListener('click', () => {
      const open = nav.classList.toggle('nav--open');
      burger.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('no-scroll', open);
    });
    $$('a', nav).forEach((a) => a.addEventListener('click', () => {
      nav.classList.remove('nav--open'); burger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('no-scroll');
    }));
  }
  const header = $('.header');
  const onScroll = () => header && header.classList.toggle('header--scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const y = $('#year'); if (y) y.textContent = String(new Date().getFullYear());

  /* ---------- Карусель тарифов ---------- */
  function initCarousel(root) {
    if (!root) return;
    const track = $('.carousel__track', root), dotsBox = $('.carousel__dots', root);
    const slides = $$('.plan', track), prev = $('[data-dir="-1"]', root), next = $('[data-dir="1"]', root);
    slides.forEach((sl, i) => { sl.setAttribute('role', 'group'); sl.setAttribute('aria-roledescription', 'слайд'); sl.setAttribute('aria-label', `${i + 1} из ${slides.length}: ${$('h3', sl).textContent}`); });
    const perView = () => { const w = slides[0].getBoundingClientRect().width || 1; return Math.max(1, Math.round(track.clientWidth / w)); };
    const pages = () => Math.max(1, slides.length - perView() + 1);
    const current = () => {
      const left = track.scrollLeft; let best = 0, dist = Infinity;
      slides.forEach((sl, i) => { const d = Math.abs(sl.offsetLeft - slides[0].offsetLeft - left); if (d < dist) { dist = d; best = i; } });
      return Math.min(best, pages() - 1);
    };
    const go = (i) => {
      i = Math.max(0, Math.min(pages() - 1, i));
      track.scrollTo({ left: slides[i].offsetLeft - slides[0].offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    function buildDots() {
      dotsBox.textContent = '';
      for (let i = 0; i < pages(); i++) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'carousel__dot';
        b.setAttribute('aria-label', `Показать тариф ${i + 1}: ${$('h3', slides[i]).textContent}`);
        b.addEventListener('click', () => go(i)); dotsBox.append(b);
      }
      update();
    }
    function update() {
      const c = current(), n = pages();
      $$('.carousel__dot', dotsBox).forEach((d, i) => { d.setAttribute('aria-current', i === c ? 'true' : 'false'); });
      prev.disabled = c <= 0; next.disabled = c >= n - 1;
      root.classList.toggle('carousel--static', n <= 1);
    }
    prev.addEventListener('click', () => go(current() - 1));
    next.addEventListener('click', () => go(current() + 1));
    track.addEventListener('keydown', (e) => {
      if (e.target !== track) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(pages() - 1); }
    });
    let t; track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(update, 60); }, { passive: true });
    let rw; window.addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(buildDots, 150); });
    // Карточка «Рассчитать» внутри слайда может получить фокус — прокручиваем к ней
    track.addEventListener('focusin', (e) => { const sl = e.target.closest('.plan'); if (sl) { const i = slides.indexOf(sl); const c = current(); if (i < c || i >= c + perView()) go(i); } });
    buildDots();
  }
  initCarousel($('#pricing-carousel'));

  /* ---------- Цели Яндекс Метрики ---------- */
  // Идентификаторы целей (тип «JavaScript-событие»): lead_submit, telegram_click, calc_used, buy_solution
  // Те же события уходят в dataLayer для триггеров Google Tag Manager ({ event: 'lead_submit' } и т. д.) и в GA4 через gtag('event', …)
  const goal = (name) => {
    try { if (typeof ym === 'function') ym(114405591, 'reachGoal', name); } catch (e) { /* метрика недоступна */ }
    try { (window.dataLayer = window.dataLayer || []).push({ event: name }); } catch (e) { /* нет dataLayer */ }
    try { if (typeof gtag === 'function') gtag('event', name); } catch (e) { /* нет gtag (GA4) */ }
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && /^(https?:)?\/\/(www\.)?(t\.me|telegram\.me)\//i.test(a.getAttribute('href'))) goal('telegram_click');
    const b = e.target.closest && e.target.closest('[data-project-action="buy"]');
    if (b) goal('buy_solution');
  });
  let calcUsed = false;
  const calcTouched = () => { if (!calcUsed) { calcUsed = true; goal('calc_used'); } };

  /* ---------- Калькулятор ---------- */
  const fmt = (n, cur = '₽') => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + '\u00a0' + cur;
  const state = { base: null, modules: new Map(), term: 12, tab: null }; // modules: id -> количество
  let P = null, lastCalc = null;
  const round = (n) => { const r = (P && P.roundTo) || 1; return Math.round(n / r) * r; };
  const curBase = () => P.bases.find((b) => b.id === state.base) || P.bases[0];
  const modById = (id) => P.modules.find((m) => m.id === id);
  // unit: строка или формы ["язык", "языка", "языков"]
  const plural = (u, n) => {
    if (!Array.isArray(u)) return u;
    const a = n % 100, b = n % 10;
    return a > 10 && a < 20 ? u[2] : b === 1 ? u[0] : b >= 2 && b <= 4 ? u[1] : u[2];
  };
  const unit1 = (u) => (Array.isArray(u) ? u[0] : u);
  const modLabel = (m, q) => (m.qty ? `${m.name}: ${q} ${plural(m.qty.unit, q)}` : m.from ? `${m.name} (от ${fmt(m.price)})` : m.once ? `${m.name} (разово)` : m.name);

  function compute() {
    const base = curBase();
    const allowed = new Set(base.modules || P.modules.map((m) => m.id));
    const mods = [];
    state.modules.forEach((q, id) => { const m = modById(id); if (m && allowed.has(id)) mods.push({ ...m, q, cost: m.price * q }); });
    mods.sort((a, b) => P.modules.findIndex((x) => x.id === a.id) - P.modules.findIndex((x) => x.id === b.id));
    const term = P.terms.find((t) => t.months === state.term) || P.terms[0];
    const fullMonthly = base.price + mods.filter((m) => !m.once).reduce((s, m) => s + m.cost, 0);
    const once = mods.filter((m) => m.once).reduce((s, m) => s + m.cost, 0); // разовые услуги (раздел «Юридическое»)
    const monthly = round(fullMonthly * (1 - (term.discount || 0)));
    const start = monthly * ((P.startPayment && P.startPayment.months) || 2);
    const paidSubs = monthly * term.months;
    const total = paidSubs;
    const bo = P.buyout;
    const buyoutBase = bo.multiplier * fullMonthly;
    const credit = bo.creditShare * paidSubs;
    const buyoutMin = bo.minMonths * fullMonthly;
    const buyout = round(Math.max(buyoutBase - credit, buyoutMin));
    return { base, mods, once, term, fullMonthly, monthly, start, paidSubs, total, buyoutBase, credit, buyoutMin, buyout };
  }

  function render() {
    const c = compute(); lastCalc = c; const cur = P.currency || '₽';
    updateTabCounts(); attachCalc();
    const hasFrom = c.mods.some((m) => m.from && !m.once);
    const onceRow = $('#r-once-row'); if (onceRow) { onceRow.hidden = !c.once; $('#r-once').textContent = fmt(c.once, cur); }
    $('#r-monthly').textContent = (hasFrom ? 'от ' : '') + fmt(c.monthly, cur);
    const notes = [];
    if (hasFrom) notes.push('Часть модулей указана «от»: итоговая цена уточняется после обсуждения задачи.');
    if (c.mods.some((m) => m.adBudget)) notes.push('Рекламный бюджет оплачивается отдельно, напрямую рекламной площадке.');
    const fn = $('#r-fromnote'); if (fn) fn.textContent = notes.join(' ');
    $('#r-discount').textContent = c.term.discount ? `скидка ${Math.round(c.term.discount * 100)}% за срок ${c.term.months} мес. (без скидки ${fmt(c.fullMonthly, cur)})` : `базовая цена при сроке ${c.term.months} мес.`;
    $('#r-start').textContent = (hasFrom ? 'от ' : '') + fmt(c.start, cur);
    $('#r-total').textContent = (hasFrom ? 'от ' : '') + fmt(c.total, cur);
    $('#r-buyout').textContent = (hasFrom ? 'от ' : '') + fmt(c.buyout, cur);
    const pct = Math.round(P.buyout.creditShare * 100);
    const f = $('#r-formula'); f.textContent = '';
    f.append(`Выкуп = ${P.buyout.multiplier} × ${fmt(c.fullMonthly, cur)} (платёж без скидки) − ${pct}% × ${fmt(c.paidSubs, cur)} (оплачено за ${c.term.months} мес.)`);
    f.append(document.createElement('br'));
    f.append(`= ${fmt(c.buyoutBase, cur)} − ${fmt(c.credit, cur)}, но не меньше ${P.buyout.minMonths} × платёж без скидки (${fmt(c.buyoutMin, cur)}).`);
    $('#r-selected').textContent = c.mods.length ? `Модули: ${c.mods.map((m) => modLabel(m, m.q)).join(', ')}` : 'Модули не выбраны';
  }

  function option(type, name, value, checked, title, sub, price) {
    const l = document.createElement('label'); l.className = `opt opt--${type}`;
    const i = document.createElement('input'); i.type = type; i.name = name; i.value = value; i.checked = checked;
    const box = document.createElement('span'); box.className = 'opt__box';
    const t = document.createElement('span'); t.className = 'opt__title'; t.textContent = title;
    box.append(t);
    if (sub) { const s = document.createElement('span'); s.className = 'opt__sub'; s.textContent = sub; box.append(s); }
    if (price) { const p = document.createElement('span'); p.className = 'opt__price'; p.textContent = price; box.append(p); }
    l.append(i, box); return l;
  }

  function moduleItem(m, cur) {
    const checked = state.modules.has(m.id);
    const wrap = document.createElement('div'); wrap.className = 'mod' + (m.qty ? ' mod--qty' : '') + (checked ? ' mod--on' : '');
    wrap.dataset.id = m.id;
    const pr = m.once ? `${fmt(m.price, cur)} разово` : `+${m.from ? 'от ' : ''}${fmt(m.price, cur)}`;
    wrap.append(option('checkbox', 'calc-mod', m.id, checked, m.name, m.note || '', m.qty ? `${pr} / ${m.qty.short || unit1(m.qty.unit)}` : pr));
    if (m.qty) {
      const q = document.createElement('div'); q.className = 'qty';
      const lab = document.createElement('span'); lab.className = 'qty__label'; lab.textContent = m.qty.label || 'Количество';
      const minus = document.createElement('button'); minus.type = 'button'; minus.className = 'qty__btn'; minus.textContent = '−'; minus.setAttribute('aria-label', 'Меньше');
      const inp = document.createElement('input'); inp.type = 'number'; inp.className = 'qty__input'; inp.min = m.qty.min || 1; inp.max = m.qty.max || 99; inp.step = 1;
      inp.value = state.modules.get(m.id) || m.qty.default || 1; inp.setAttribute('aria-label', `${m.qty.label || 'Количество'}: ${m.name}`);
      const plus = document.createElement('button'); plus.type = 'button'; plus.className = 'qty__btn'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Больше');
      const set = (v) => {
        v = Math.min(Number(inp.max), Math.max(Number(inp.min), parseInt(v, 10) || Number(inp.min)));
        inp.value = v;
        state.modules.set(m.id, v); wrap.classList.add('mod--on'); wrap.querySelector('input[type=checkbox]').checked = true; render();
      };
      minus.addEventListener('click', () => set(Number(inp.value) - 1));
      plus.addEventListener('click', () => set(Number(inp.value) + 1));
      inp.addEventListener('change', () => set(inp.value));
      q.append(lab, minus, inp, plus); wrap.append(q);
    }
    return wrap;
  }

  function renderModules() {
    const cur = P.currency || '₽';
    const base = curBase();
    const allowed = base.modules || P.modules.map((m) => m.id);
    // Модули, недоступные для новой основы, сбрасываются
    [...state.modules.keys()].forEach((id) => { if (!allowed.includes(id)) state.modules.delete(id); });
    const box = $('#calc-modules'); box.textContent = '';
    const groups = P.groups && P.groups.length ? P.groups : [{ id: 'all', name: 'Модули' }];
    const present = groups
      .map((g) => ({ g, list: P.modules.filter((m) => allowed.includes(m.id) && (g.id === 'all' || m.group === g.id)) }))
      .filter((x) => x.list.length);
    if (!present.some((x) => x.g.id === state.tab)) state.tab = present.length ? present[0].g.id : null;

    // Вкладки разделов (ARIA tabs): одна видимая секция, выбор сохраняется между вкладками
    const tabs = document.createElement('div'); tabs.className = 'modtabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Разделы модулей');
    box.append(tabs);
    present.forEach(({ g, list }) => {
      const active = g.id === state.tab;
      const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'modtab';
      tab.id = `modtab-${g.id}`; tab.dataset.group = g.id;
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(active)); tab.setAttribute('aria-controls', `modpanel-${g.id}`);
      tab.tabIndex = active ? 0 : -1;
      const name = document.createElement('span'); name.textContent = g.name;
      const cnt = document.createElement('span'); cnt.className = 'modtab__count'; cnt.setAttribute('aria-label', 'выбрано');
      tab.append(name, cnt); tabs.append(tab);

      const sec = document.createElement('div'); sec.className = 'modgroup'; sec.dataset.group = g.id;
      sec.id = `modpanel-${g.id}`; sec.setAttribute('role', 'tabpanel'); sec.setAttribute('aria-labelledby', tab.id); sec.tabIndex = 0;
      sec.hidden = !active;
      if (g.note) { const n = document.createElement('p'); n.className = 'modgroup__note'; n.textContent = g.note; sec.append(n); }
      const grid = document.createElement('div'); grid.className = 'modgroup__grid';
      list.forEach((m) => grid.append(moduleItem(m, cur)));
      sec.append(grid); box.append(sec);
    });
    updateTabCounts();
  }

  function selectTab(id, focus) {
    state.tab = id;
    $$('#calc-modules .modtab').forEach((t) => {
      const on = t.dataset.group === id;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      if (on) { if (focus) t.focus(); t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    });
    $$('#calc-modules .modgroup').forEach((p) => { p.hidden = p.dataset.group !== id; });
  }

  function updateTabCounts() {
    $$('#calc-modules .modtab').forEach((t) => {
      const n = $$(`#modpanel-${t.dataset.group} input[type=checkbox]:checked`).length;
      const c = t.querySelector('.modtab__count'); c.textContent = n ? String(n) : ''; c.hidden = !n;
      t.classList.toggle('modtab--has', n > 0);
      t.setAttribute('aria-label', `${t.firstChild.textContent}${n ? `, выбрано: ${n}` : ''}`);
    });
  }

  function build() {
    const cur = P.currency || '₽';
    state.base = P.defaultBase || P.bases[0].id; state.term = P.defaultTerm || P.terms[0].months;
    const qb = new URLSearchParams(location.search).get('base');
    if (qb && P.bases.some((b) => b.id === qb)) state.base = qb;
    const bases = $('#calc-bases'); bases.textContent = '';
    P.bases.forEach((b) => bases.append(option('radio', 'calc-base', b.id, b.id === state.base, b.name, b.desc, `от ${fmt(b.price, cur)}/мес`)));
    const terms = $('#calc-terms'); terms.textContent = '';
    P.terms.forEach((t) => terms.append(option('radio', 'calc-term', String(t.months), t.months === state.term, `${t.months} мес.`, t.discount ? `скидка ${Math.round(t.discount * 100)}%` : 'базовая цена', '')));
    renderModules();

    const calcRoot = $('#calc-bases').closest('section') || document;
    ['change', 'click'].forEach((ev) => calcRoot.addEventListener(ev, (e) => { if (e.isTrusted && e.target.closest('input, button.qty__btn, .modtab')) calcTouched(); }));
    bases.addEventListener('change', (e) => { state.base = e.target.value; state.tab = null; renderModules(); render(); });
    $('#calc-modules').addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const m = modById(e.target.value); const wrap = e.target.closest('.mod');
      if (e.target.checked) {
        const qi = wrap.querySelector('.qty__input');
        state.modules.set(m.id, qi ? Math.max(1, parseInt(qi.value, 10) || 1) : 1);
      } else state.modules.delete(m.id);
      wrap.classList.toggle('mod--on', e.target.checked); render();
    });
    terms.addEventListener('change', (e) => { state.term = Number(e.target.value); render(); });
    $('#calc-modules').addEventListener('click', (e) => {
      const t = e.target.closest('.modtab'); if (t) selectTab(t.dataset.group, false);
    });
    $('#calc-modules').addEventListener('keydown', (e) => {
      const t = e.target.closest('.modtab'); if (!t) return;
      const all = $$('#calc-modules .modtab'); let i = all.indexOf(t);
      if (e.key === 'ArrowRight') i = (i + 1) % all.length;
      else if (e.key === 'ArrowLeft') i = (i - 1 + all.length) % all.length;
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = all.length - 1;
      else return;
      e.preventDefault(); selectTab(all[i].dataset.group, true);
    });

    $$('[data-base]').forEach((a) => a.addEventListener('click', () => {
      const inp = $(`#calc-bases input[value="${a.dataset.base}"]`);
      if (inp) { inp.checked = true; state.base = a.dataset.base; state.tab = null; renderModules(); render(); }
    }));

    const t = (s, v) => { const el = $(s); if (el) el.textContent = v; };
    t('#b-base', `${P.buyout.multiplier} × платёж без скидки`);
    t('#b-credit', `−${Math.round(P.buyout.creditShare * 100)}% оплаченного`);
    t('#b-min', `${P.buyout.minMonths} × платёж`);
    render();
  }

  function calcSummary(c) {
    const cur = P.currency || '₽';
    return [
      'Расчёт с калькулятора:',
      `Основа: ${c.base.name}`,
      `Модули: ${c.mods.length ? c.mods.map((m) => modLabel(m, m.q)).join(', ') : 'нет'}`,
      `Срок: ${c.term.months} мес.`,
      `Платёж: ${c.mods.some((m) => m.from) ? 'от ' : ''}${fmt(c.monthly, cur)}/мес, старт (первый и последний месяц): ${fmt(c.start, cur)}`,
      `Итого за срок: ${fmt(c.total, cur)}, выкуп в конце срока: ${fmt(c.buyout, cur)}`,
      ...(c.once ? [`Разовые услуги: ${fmt(c.once, cur)}`] : []),
    ].join('\n');
  }

  // Расчёт прикладывается к заявке скрытым полем и обновляется при изменении калькулятора
  function attachCalc() {
    if (!state.attached || !lastCalc) return;
    const c = lastCalc;
    $('#f-calc').value = JSON.stringify({
      base: c.base.id, modules: Object.fromEntries(c.mods.map((m) => [m.id, m.q])), term: c.term.months,
      monthly: c.monthly, once: c.once, start: c.start, total: c.total, buyout: c.buyout, from: c.mods.some((m) => m.from),
      summary: calcSummary(c),
    });
  }

  const sendBtn = $('#calc-send');
  if (sendBtn) sendBtn.addEventListener('click', () => {
    if (!lastCalc) return;
    const sel = $('#f-product');
    const map = { landing: 'Лендинг', site: 'Многостраничный сайт', shop: 'Интернет-магазин', android: 'Мобильное приложение Android', webapp: 'Веб-приложение', desktop: 'Десктоп-приложение' };
    const val = map[lastCalc.base.id] || lastCalc.base.name;
    if (sel) { if (![...sel.options].some((o) => o.value === val)) sel.add(new Option(val, val)); sel.value = val; }
    state.attached = true; attachCalc();
    $('#lead').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => { const n = $('#f-name'); if (n) n.focus({ preventScroll: true }); }, 500);
    const st = $('#form-status'); if (st) { st.className = 'form__status form__status--ok'; st.textContent = '✓ Расчёт добавлен в заявку. Укажите имя и контакт и нажмите «Отправить заявку».'; }
  });

  /* ---------- Готовые решения ---------- */
  let PR = null;
  const prPrice = (id) => { const p = PR && PR.projects.find((x) => x.id === id); return p && typeof p.price === 'number' ? fmt(p.price, PR.currency || '₽') : 'Цена по запросу'; };
  if ($('[data-price],[data-transfer-share],[data-transfer-min],[data-sale-commission],[data-project-action]')) fetch('/assets/projects.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      PR = data;
      $$('[data-price]').forEach((el) => { el.textContent = prPrice(el.dataset.price); });
      const pct = (v) => Math.round(v * 100) + '%';
      if (data.transfer) {
        $$('[data-transfer-share]').forEach((el) => { el.textContent = pct(data.transfer.share); });
        $$('[data-transfer-min]').forEach((el) => { el.textContent = fmt(data.transfer.min, data.currency || '₽'); });
      }
      if (typeof data.saleCommission === 'number') $$('[data-sale-commission]').forEach((el) => { el.textContent = pct(data.saleCommission); });
    })
    .catch((e) => console.error(e));

  // Кнопки готовых решений: data-project-action = buy | copy | order | sub, data-line — строка для заявки, data-label — для статуса
  function attachProject(btn) {
    const { id, name, line, label } = btn.dataset; const mode = btn.dataset.projectAction;
    const p = PR && PR.projects.find((x) => x.id === id);
    const subFrom = mode === 'copy' && p && typeof p.subscriptionFrom === 'number' ? `, от ${fmt(p.subscriptionFrom, PR.currency || '₽')}/мес` : '';
    const withPrice = mode === 'buy' || mode === 'order';
    const summary = `Готовое решение: ${name}\n${line}${subFrom}${withPrice ? `\nЦена: ${prPrice(id)}` : ''}`;
    state.attached = false; // расчёт калькулятора больше не перезаписывает заявку
    $('#f-calc').value = JSON.stringify({ kind: 'project', project: id, mode, summary });
    const sel = $('#f-product'); if (sel) sel.value = 'Готовое решение';
    $('#lead').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => { const n = $('#f-name'); if (n) n.focus({ preventScroll: true }); }, 500);
    const st = $('#form-status');
    if (st) { st.className = 'form__status form__status--ok'; st.textContent = `✓ ${label} «${name}» добавлен${/^(Покупка|Копия)/.test(label) ? 'а' : ''} в заявку. Укажите имя и контакт и нажмите «Отправить заявку».`; }
  }
  $$('[data-project-action]').forEach((b) => b.addEventListener('click', () => attachProject(b)));

  /* ---------- Галерея на странице готового решения ---------- */
  const gMain = $('#gallery-main');
  $$('.gallery__thumb').forEach((t) => t.addEventListener('click', () => {
    if (!gMain) return;
    gMain.src = t.dataset.src; gMain.alt = t.dataset.alt;
    $$('.gallery__thumb').forEach((x) => x.removeAttribute('aria-current')); t.setAttribute('aria-current', 'true');
  }));

  // Цены на карточках и страницах услуг берутся из pricing.json, чтобы не расходиться с калькулятором
  function hydratePrices() {
    const cur = P.currency || '₽';
    $$('[data-base-price]').forEach((el) => { const b = P.bases.find((x) => x.id === el.dataset.basePrice); if (b) el.textContent = fmt(b.price, cur); });
    $$('[data-mod-price]').forEach((el) => {
      const m = modById(el.dataset.modPrice); if (!m) return;
      el.textContent = `${m.once ? '' : '+'}${m.from ? 'от ' : ''}${fmt(m.price, cur)}${m.once ? ' разово' : '/мес'}${m.qty ? ` за ${m.qty.short || unit1(m.qty.unit)}` : ''}`;
    });
  }
  const needCalc = !!$('#calc-bases'), needPrices = !!$('[data-base-price],[data-mod-price]');
  if (needCalc || needPrices) fetch('/assets/pricing.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => { P = data; hydratePrices(); if (needCalc) build(); })
    .catch((e) => { console.error(e); const b = $('#calc-bases'); if (b) b.textContent = 'Не удалось загрузить цены. Оставьте заявку, и мы сделаем расчёт вручную.'; });

  /* ---------- Форма заявки ---------- */
  const form = $('#lead-form'), status = $('#form-status');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.page = location.pathname + location.search;
    const setStatus = (t, ok) => { status.className = 'form__status ' + (ok ? 'form__status--ok' : 'form__status--err'); status.textContent = t; };
    $$('.field--err', form).forEach((f) => f.classList.remove('field--err'));
    const bad = [];
    if (!data.name || data.name.trim().length < 2) bad.push('#f-name');
    if (!data.contact || data.contact.trim().length < 3) bad.push('#f-contact');
    bad.forEach((s) => $(s).closest('.field').classList.add('field--err'));
    if (bad.length) { setStatus('Заполните имя и телефон или Telegram.', false); $(bad[0]).focus(); return; }
    if (!data.consent) { setStatus('Нужно согласие на обработку персональных данных.', false); return; }
    const btn = $('button[type="submit"]', form); btn.disabled = true; btn.textContent = 'Отправляем…';
    try {
      const r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Ошибка отправки');
      form.reset(); $('#f-calc').value = ''; state.attached = false;
      setStatus('Спасибо! Заявка отправлена, мы свяжемся с вами в течение рабочего дня.', true);
      goal('lead_submit');
    } catch (err) {
      setStatus((err && err.message) || 'Не удалось отправить заявку. Попробуйте ещё раз.', false);
    } finally { btn.disabled = false; btn.textContent = 'Отправить заявку'; }
  });
})();

/* Ссылка вида /faq#nda раскрывает нужный вопрос */
(() => {
  const open = () => { const id = decodeURIComponent(location.hash.slice(1)); const d = id && document.getElementById(id); if (d && d.tagName === 'DETAILS') { d.open = true; d.scrollIntoView({ block: 'center' }); } };
  window.addEventListener('hashchange', open); open();
})();
