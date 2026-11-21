'use strict';
// Генератор статических страниц сайта: node site/build.js
// Общие шапка, подвал и форма заявки собираются здесь; крупные блоки лежат в site/partials/.
// Результат — готовые HTML-файлы в public/ (их и раздаёт server.js). После правок запустите сборку заново.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const SITE = 'https://digitalsub.ru';
const P = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/pricing.json'), 'utf8'));
const PR = JSON.parse(fs.readFileSync(path.join(PUB, 'assets/projects.json'), 'utf8'));
const SERVICES = require('./services');
const part = (n) => fs.readFileSync(path.join(__dirname, 'partials', n + '.html'), 'utf8').replace(/\s+$/, '');
const LASTMOD = new Date().toISOString().slice(0, 10);

const nb = (n) => new Intl.NumberFormat('ru-RU').format(n).replace(/\s/g, '\u00a0');
const rub = (n) => `${nb(n)}\u00a0₽`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const baseById = (id) => { const b = P.bases.find((x) => x.id === id); if (!b) throw new Error('base ' + id); return b; };
const modById = (id) => { const m = P.modules.find((x) => x.id === id); if (!m) throw new Error('module ' + id); return m; };
const unit1 = (u) => (Array.isArray(u) ? u[0] : u);
const modPrice = (m) => `${m.once ? '' : '+'}${m.from ? 'от ' : ''}${rub(m.price)}${m.once ? ' разово' : '/мес'}${m.qty ? ` за ${m.qty.short || unit1(m.qty.unit)}` : ''}`;
const minPrice = Math.min(...P.bases.map((b) => b.price));
const disc = P.terms.filter((t) => t.discount);
const pct = (v) => Math.round(v * 100) + '%';
// «при подписке на 24 месяца скидка 25%, на 36 месяцев — 35%»
const discText = disc.map((t, i) => (i === 0 ? `при подписке на ${t.months} месяц${t.months % 10 >= 2 && t.months % 10 <= 4 ? 'а' : 'ев'} скидка ${pct(t.discount)}` : `на ${t.months} месяц${t.months % 10 >= 2 && t.months % 10 <= 4 ? 'а' : 'ев'} — ${pct(t.discount)}`)).join(', ');
const ld = (o) => `  <script type="application/ld+json">${JSON.stringify(o)}</script>`;
const svg = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

/* ---------- Общие блоки ---------- */
const NAV = [
  ['/', 'Главная', 'home'], ['/prices', 'Цены', 'prices'], ['/solutions', 'Готовые решения', 'solutions'], ['/buyout', 'Выкуп', 'buyout'], ['/faq', 'Вопросы', 'faq'], ['/blog', 'Блог', 'blog'],
];
function header(active) {
  const a = (href, text, key, extra = '') => `<a href="${href}"${key === active ? ' class="is-active" aria-current="page"' : ''}${extra}>${text}</a>`;
  const svc = SERVICES.map((s) => `<a href="/services/${s.slug}"${active === 'svc-' + s.slug ? ' class="is-active" aria-current="page"' : ''}>${s.short}</a>`).join('');
  const svcActive = active === 'services' || String(active).startsWith('svc-');
  return `  <a class="skip" href="#main">Перейти к содержанию</a>
  <header class="header" id="top">
    <div class="container header__inner">
      <a class="logo" href="/" aria-label="DigitalSub — на главную"><img src="/favicon.svg" alt="" width="32" height="32"><span>Digital<b>Sub</b></span></a>
      <nav class="nav" id="nav" aria-label="Основная навигация">
        ${a('/', 'Главная', 'home')}
        <div class="nav__drop">
          <a class="nav__droplink${svcActive ? ' is-active' : ''}" href="/services"${active === 'services' ? ' aria-current="page"' : ''}>Услуги</a>
          <div class="nav__menu">${svc}</div>
        </div>
        ${NAV.slice(1).map(([h, t, k]) => a(h, t, k)).join('\n        ')}
        <a class="btn nav__cta" href="#lead">Оставить заявку</a>
      </nav>
      <a class="btn btn--sm header__cta" href="#lead">Оставить заявку</a>
      <button class="burger" id="burger" type="button" aria-label="Открыть меню" aria-expanded="false" aria-controls="nav"><span></span><span></span><span></span></button>
    </div>
  </header>`;
}
const FOOTER = `  <footer class="footer">
    <div class="container footer__inner">
      <div>
        <a class="logo" href="/"><img src="/favicon.svg" alt="" width="28" height="28"><span>Digital<b>Sub</b></span></a>
        <p class="footer__tag">Сайты и приложения по подписке с правом выкупа.</p>
      </div>
      <nav class="footer__nav" aria-label="Услуги">
        <p class="footer__title">Услуги</p>
        ${SERVICES.map((s) => `<a href="/services/${s.slug}">${s.short}</a>`).join('')}
      </nav>
      <nav class="footer__nav" aria-label="Разделы сайта">
        <p class="footer__title">Разделы</p>
        <a href="/prices">Цены и калькулятор</a><a href="/dlya-biznesa">Для бизнеса по отраслям</a><a href="/solutions">Готовые решения</a><a href="/buyout">Выкуп и переуступка</a><a href="/faq">Вопросы</a><a href="/blog">Блог</a><a href="/#lead">Оставить заявку</a><a href="/privacy">Политика конфиденциальности</a>
      </nav>
      <p class="footer__copy">© <span id="year">2026</span> DigitalSub · digitalsub.ru</p>
    </div>
  </footer>`;

function lead({ product, title, text, niche } = {}) {
  let h = part('lead');
  if (product) {
    if (!h.includes(`<option value="${product}">`)) throw new Error('no option ' + product);
    h = h.replace(`<option value="${product}">`, `<option value="${product}" selected>`);
  }
  if (NDA) h = h.replace('+9&nbsp;900&nbsp;₽', '+' + rub(NDA.price));
  if (niche) h = h.replace(/(<textarea id="f-message"[^>]*>)(<\/textarea>)/, `$1Сфера: ${esc(niche)}. $2`);
  if (title) h = h.replace('<h2>Расскажите о задаче</h2>', `<h2>${title}</h2>`);
  if (text) h = h.replace(/(<h2>[^<]*<\/h2>\s*<p>)[^<]*(<\/p>)/, `$1${text}$2`);
  return h;
}

function crumbs(list) {
  const items = [['/', 'Главная'], ...list];
  const html = `<nav class="crumbs" aria-label="Навигационная цепочка"><ol>${items.map(([h, t], i) => i === items.length - 1 ? `<li aria-current="page">${t}</li>` : `<li><a href="${h}">${t}</a></li>`).join('')}</ol></nav>`;
  const json = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([h, t], i) => ({ '@type': 'ListItem', position: i + 1, name: t, item: SITE + h })) };
  return { html, json };
}

function pageHead({ crumbsHtml, eyebrow, h1, lead: leadText, points, actions }) {
  return `    <section class="page-head">
      <div class="hero__glow" aria-hidden="true"></div>
      <div class="container page-head__inner">
        ${crumbsHtml}
        <p class="eyebrow">${eyebrow}</p>
        <h1>${h1}</h1>
        ${leadText ? `<p class="lead">${leadText}</p>` : ''}
        ${points ? `<ul class="hero__points">${points.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
        ${actions ? `<div class="hero__actions">${actions}</div>` : ''}
      </div>
    </section>`;
}

// Чередование фона секций: первая после шапки — обычная, дальше через одну
function sections(list) {
  return list.map((h, i) => h.replace(/class="section( section--alt)?"/, `class="section${i % 2 ? ' section--alt' : ''}"`)).join('\n\n');
}
const dropHead = (h) => h.replace(/\s*<div class="section__head">[\s\S]*?<\/div>\n/, '\n');

function faqItems(html) {
  return [...html.matchAll(/<details[^>]*><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map((m) => [m[1], m[2]]);
}
function faqLd(items) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } })) };
}
function faqBlock(items, { id = 'faq', eyebrow = 'Вопросы', title = 'Частые вопросы' } = {}) {
  const half = Math.ceil(items.length / 2);
  const col = (arr) => `            <div class="faq__col">\n${arr.map(([q, a]) => `              <details><summary>${q}</summary><p>${a}</p></details>`).join('\n')}\n            </div>`;
  return `    <section class="section" id="${id}">
      <div class="container">
        <div class="section__head"><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div>
        <div class="faq">
${col(items.slice(0, half))}
${col(items.slice(half))}
          </div>
      </div>
    </section>`;
}

const ORG = { '@type': 'Organization', name: 'DigitalSub', url: SITE + '/' };

// Яндекс Метрика (сниппет Глеба без изменений): скрипт — в <head>, <noscript> — в начале <body>.
// Хеши встроенного скрипта и style-атрибута пишутся в lib/csp.json для CSP-заголовка server.js.
// Google Tag Manager (официальная установка): скрипт — в <head>, <noscript>-iframe — сразу после <body>.
const splitNs = (t) => [t.slice(0, t.indexOf('<noscript>')).replace(/\s+$/, ''), t.slice(t.indexOf('<noscript>')).replace(/\s+$/, '')];
const [gtmHead, gtmBody] = splitNs(fs.readFileSync(path.join(__dirname, 'partials', 'gtm.html'), 'utf8'));
const [ymHead0, ymBody0] = splitNs(fs.readFileSync(path.join(__dirname, 'partials', 'metrika.html'), 'utf8'));
const ymHead = gtmHead + '\n' + ymHead0;
const ymBody = gtmBody + '\n' + ymBody0;
{
  const crypto = require('node:crypto');
  const h = (t) => 'sha256-' + crypto.createHash('sha256').update(t, 'utf8').digest('base64');
  const scripts = [...ymHead.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].filter((m) => m[1].trim()).map((m) => h(m[1]));
  const styles = [...ymBody.matchAll(/style="([^"]*)"/g)].map((m) => h(m[1]));
  fs.writeFileSync(path.join(__dirname, '..', 'lib', 'csp.json'), JSON.stringify({ _comment: 'Генерируется site/build.js из site/partials/gtm.html и metrika.html', scriptHashes: scripts, styleAttrHashes: styles }, null, 2) + '\n');
}

function layout({ url, title, desc, active, body, jsonld = [], head = '', ogTitle, ogDesc, robots = 'index, follow' }) {
  const canon = SITE + url;
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${canon}">
  <meta name="theme-color" content="#0b1020">
  <meta name="robots" content="${robots}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="DigitalSub">
  <meta property="og:url" content="${canon}">
  <meta property="og:title" content="${esc(ogTitle || title)}">
  <meta property="og:description" content="${esc(ogDesc || desc)}">
  <meta property="og:image" content="${SITE}/assets/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
${head}  <link rel="stylesheet" href="/assets/styles.css">
${ymHead}
${jsonld.map(ld).join('\n')}
</head>
<body>
${ymBody}
${header(active)}

  <main id="main">
${body}
  </main>

${FOOTER}
  <script src="/assets/main.js" defer></script>
</body>
</html>
`;
}

/* ---------- Карточки ---------- */
function productCards() {
  return `<div class="grid grid--3 products">
${SERVICES.map((s) => { const b = baseById(s.base); return `          <article class="card feature">
            <div class="feature__icon">${svg(s.icon)}</div>
            <h3><a class="feature__link" href="/services/${s.slug}">${s.short}</a></h3>
            <p>${s.card}</p>
            <div class="feature__foot"><span class="feature__price">от <b data-base-price="${b.id}">${rub(b.price)}</b>/мес</span><span class="feature__more" aria-hidden="true">Подробнее →</span></div>
          </article>`; }).join('\n')}
        </div>`;
}

const PROJ = require('./projects');
const projects = PR.projects.map((p) => {
  const d = PROJ[p.id]; if (!d) throw new Error('no text for project ' + p.id);
  // Картинки, которых ещё нет в public/assets/projects, пропускаются; если нет ни одной — берётся fallback
  const have = d.images.filter(([f]) => fs.existsSync(path.join(PUB, 'assets/projects', f)));
  const images = have.length ? have : (d.fallback || []);
  if (!images.length) throw new Error('no images for project ' + p.id);
  return { ...p, ...d, images };
});
const imgDims = (p) => (p.portrait ? 'width="540" height="1170"' : 'width="960" height="600"');
const NDA = P.modules.find((x) => x.id === 'nda');
const projPrice = (p) => (typeof p.price === 'number' ? rub(p.price) : 'Цена по запросу');
const imgSrc = (f) => `/assets/projects/${f}`;
// Кнопки готового решения: подставляют проект в форму заявки на этой же странице (см. attachProject в main.js)
function projectButtons(p) {
  const btn = (cls, mode, text, line, label) => `<button class="btn${cls} btn--block project__btn" type="button" data-project-action="${mode}" data-id="${p.id}" data-name="${esc(p.name)}" data-line="${esc(line)}" data-label="${esc(label)}">${text}</button>`;
  return p.kind === 'service'
    ? btn('', 'order', 'Заказать', 'Хочу заказать', 'Заказ') + '\n' + btn(' btn--ghost', 'sub', 'Хочу с обслуживанием по подписке', 'Хочу с обслуживанием по подписке', 'Заказ с обслуживанием по подписке')
    : btn('', 'buy', 'Купить проект целиком', `Хочу купить проект целиком (исходный код${p.host ? ' и домен' : ''})`, 'Покупка проекта') + '\n' + btn(' btn--ghost', 'copy', 'Хочу такой же по подписке', 'Хочу такой же продукт под свой бренд по подписке', 'Копия проекта по подписке');
}
function projectCard(p) {
  const url = `/solutions/${p.slug}`;
  const [img, alt] = p.images[0];
  return `          <article class="card project" data-project="${p.id}">
            <a class="project__shot${p.portrait ? ' project__shot--phone' : ''}" href="${url}" tabindex="-1" aria-hidden="true"><img src="${imgSrc(img)}" alt="" ${imgDims(p)} loading="lazy" decoding="async"></a>
            <div class="project__body">
              <p class="project__niche">${p.niche}</p>
              <h3><a class="project__title" href="${url}">${p.name}</a>${p.host ? ` <span class="project__host">${p.host}</span>` : ''}</h3>
              <p>${p.short}</p>
              <ul class="ticks">${p.cardFeatures.map((x) => `<li>${x}</li>`).join('')}</ul>
              ${p.stack ? `<p class="project__stack">${p.stack}</p>` : ''}
              <div class="project__foot">
                <div class="project__row"><a class="project__link" href="${url}">Подробнее →</a><span class="project__price" data-price="${p.id}">${projPrice(p)}</span></div>
                ${projectButtons(p).replace(/\n/g, '\n                ')}
              </div>
            </div>
          </article>`;
}

/* ---------- Расчёты подписки (та же логика, что в калькуляторе main.js) ---------- */
const rnd = (n) => Math.round(n / (P.roundTo || 1)) * (P.roundTo || 1);
function subCalc(baseId, months = 12) {
  const price = baseById(baseId).price;
  const t = P.terms.find((x) => x.months === months) || P.terms[0];
  const monthly = rnd(price * (1 - (t.discount || 0)));
  const total = monthly * t.months;
  const buyout = rnd(Math.max(P.buyout.multiplier * price - P.buyout.creditShare * total, P.buyout.minMonths * price));
  return { monthly, total, buyout, start: monthly * P.startPayment.months, own: total + buyout };
}
const NICHE_HELPERS = {
  p: (id) => rub(baseById(id).price),
  m: (id) => modPrice(modById(id)),
  buyout12: (id) => rub(subCalc(id).buyout),
  start: (id) => rub(subCalc(id).start),
};
const NICHES = require('./niches')(NICHE_HELPERS);
const NICHES_LIST = NICHES;
const ICON_NICHE = '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>';

/* ---------- Страницы ---------- */
const pages = [];
const add = (file, url, html, prio, freq = 'monthly') => pages.push({ file, url, html, prio, freq });

// Главная
{
  const hero = part('hero');
  const how = part('how');
  const what = `    <section class="section" id="what">
      <div class="container">
        <div class="section__head">
          <p class="eyebrow">Что делаем</p>
          <h2>Продукты для малого бизнеса и сферы услуг</h2>
          <p class="section__sub">Салоны красоты, клиники, автосервисы, школы и курсы, локальная розница: всем, кому нужен понятный цифровой инструмент без крупных вложений.</p>
        </div>
        ${productCards()}
      </div>
    </section>`;
  const tariffs = `    <section class="section" id="tariffs">
      <div class="container">
        <div class="section__head">
          <p class="eyebrow">Тарифы</p>
          <h2>От ${rub(minPrice)} в месяц</h2>
          <p class="section__sub">Итоговая стоимость зависит от задачи и фиксируется в договоре. Начните с необходимого — новые модули подключаются в любой момент.</p>
        </div>
        <div class="grid grid--3">
          <div class="card fact"><p class="fact__big">до ${Math.round(Math.max(...P.terms.map((t) => t.discount)) * 100)}%</p><h3>Скидка за срок</h3><p>Минимальный срок подписки — 12 месяцев, ${discText}. Срок отсчитывается с запуска первой версии.</p></div>
          <div class="card fact"><p class="fact__big">${P.startPayment.months} платежа</p><h3>Оплата на старте</h3><p>На старте оплачиваются только первый и последний месяц подписки, дальше — ежемесячно.</p></div>
          <div class="card fact"><p class="fact__big">${P.bases.length} основ</p><h3>Модули по необходимости</h3><p>Онлайн-оплата, запись, Telegram, интеграции, продвижение — подключаются к основе, когда понадобятся.</p></div>
        </div>
        <div class="teaser__actions"><a class="btn btn--lg" href="/prices">Все тарифы и модули</a><a class="btn btn--ghost btn--lg" href="/prices#calc">Рассчитать стоимость</a></div>
      </div>
    </section>`;
  const bo = `    <section class="section" id="buyout-teaser">
      <div class="container buyout">
        <div class="buyout__text">
          <p class="eyebrow">Модель выкупа</p>
          <h2>Платите за подписку, а получаете актив</h2>
          <p>Когда проект начнёт приносить прибыль, выкупите исходный код и права и развивайте его своей командой. А если продукт стал не нужен — передайте его другому владельцу или продайте через наш каталог.</p>
          <ul class="ticks ticks--lg">
            <li><b>Цена выкупа фиксируется в договоре</b> заранее, без сюрпризов.</li>
            <li><b>30% оплаченных подписок засчитывается</b> в цену выкупа.</li>
            <li><b>Проект можно переуступить или продать</b>, он не пропадёт.</li>
          </ul>
          <a class="btn btn--lg" href="/buyout">Как работает выкуп</a>
        </div>
        <div class="card buyout__calc">
          <p class="buyout__calc-title">Коротко об условиях</p>
          <div class="calc-row"><span>Базовая цена выкупа</span><b id="b-base">${P.buyout.multiplier} × платёж без скидки</b></div>
          <div class="calc-row"><span>Зачёт оплаченных подписок</span><b id="b-credit">−${Math.round(P.buyout.creditShare * 100)}% оплаченного</b></div>
          <div class="calc-row"><span>Минимальная цена выкупа</span><b id="b-min">${P.buyout.minMonths} × платёж</b></div>
          <div class="calc-row"><span>Переуступка проекта</span><b><span data-transfer-share>${Math.round(PR.transfer.share * 100)}%</span>, от <span data-transfer-min>${rub(PR.transfer.min)}</span></b></div>
          <div class="calc-row"><span>Продажа через каталог</span><b><span data-sale-commission>${Math.round(PR.saleCommission * 100)}%</span> комиссия</b></div>
          <p class="buyout__hint">Подробнее — на странице <a href="/buyout">«Выкуп и переуступка»</a>.</p>
        </div>
      </div>
    </section>`;
  const body = hero + '\n\n' + sections([how, part('remote'), what, tariffs, bo, lead()]);
  add('index.html', '/', layout({
    url: '/', active: 'home',
    title: 'DigitalSub — сайты и приложения по подписке с правом выкупа',
    desc: 'Сайт, интернет-магазин, веб-приложение, мобильное приложение Android или десктоп-программа для вашего бизнеса без оплаты разработки. Подписка от 4 900 ₽/мес: хостинг, домен, обновления и поддержка включены. Первая версия сайта за 3–7 дней, мобильного и десктоп-приложения — до 30 дней. Право выкупа продукта.',
    ogDesc: 'Не платите за разработку — подпишитесь на готовый продукт для своего бизнеса. От 4 900 ₽/мес, первая версия сайта за 3–7 дней.',
    head: '  <meta name="yandex-verification" content="57df291596b35bf1" />\n  <meta name="keywords" content="сайт по подписке, сайт в рассрочку, разработка сайтов, CRM для бизнеса, онлайн-запись, веб-приложение, мобильное приложение Android, десктоп-приложение, выкуп сайта">\n  <script src="/assets/legacy-hash.js"></script>\n',
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'ProfessionalService', name: 'DigitalSub', url: SITE + '/', image: SITE + '/assets/og-image.png', description: 'Разработка сайтов, интернет-магазинов, веб-, мобильных и десктоп-приложений по подписке с правом выкупа.', areaServed: 'RU', priceRange: `от ${nb(minPrice)} ₽/мес` },
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'DigitalSub', url: SITE + '/', inLanguage: 'ru' },
    ],
    body,
  }), '1.0', 'weekly');
}

// Цены
{
  const c = crumbs([['/prices', 'Цены']]);
  const pricing = part('pricing');
  const body = pageHead({ crumbsHtml: c.html, eyebrow: 'Цены', h1: 'Цены на сайты и приложения <span class="grad">по подписке</span>',
    lead: `Ежемесячная подписка от ${rub(minPrice)}: разработка, хостинг, домен, обновления и поддержка включены. Выберите основу, добавьте модули и узнайте точную цену в калькуляторе.`,
    actions: '<a class="btn btn--lg" href="#calc">Открыть калькулятор</a><a class="btn btn--ghost btn--lg" href="#lead">Обсудить проект</a>' })
    + '\n\n' + sections([pricing, part('calc'), part('remote'), lead({ text: 'Отправьте расчёт из калькулятора или опишите задачу — ответим в течение рабочего дня, уточним детали и зафиксируем цену в договоре.' })]);
  const offers = { '@context': 'https://schema.org', '@type': 'OfferCatalog', name: 'Тарифы DigitalSub', url: SITE + '/prices', itemListElement: SERVICES.map((s) => { const b = baseById(s.base); return { '@type': 'Offer', name: b.name, url: `${SITE}/services/${s.slug}`, priceCurrency: 'RUB', price: b.price, priceSpecification: { '@type': 'UnitPriceSpecification', price: b.price, priceCurrency: 'RUB', unitText: 'месяц', unitCode: 'MON' } }; }) };
  add('prices.html', '/prices', layout({ url: '/prices', active: 'prices',
    title: 'Цены на разработку сайтов и приложений по подписке — калькулятор | DigitalSub',
    desc: `Тарифы DigitalSub: лендинг от 4 900 ₽/мес, многостраничный сайт от 9 900 ₽, интернет-магазин от 14 900 ₽, веб-приложение от 19 900 ₽, Android от 29 900 ₽, десктоп от 34 900 ₽. Модули, скидки до 35% и калькулятор стоимости с выкупом.`,
    head: '  <link rel="preload" href="/assets/pricing.json" as="fetch" crossorigin>\n',
    jsonld: [c.json, offers], body }), '0.9', 'weekly');
}

// Готовые решения: каталог
{
  const c = crumbs([['/solutions', 'Готовые решения']]);
  const list = `    <section class="section" id="solutions">
      <div class="container">
        <div class="grid projects projects--catalog">
${projects.map(projectCard).join('\n')}
        </div>
      </div>
    </section>`;
  const sell = `    <section class="section" id="sell">
      <div class="container buyout">
        <div class="buyout__text">
          <p class="eyebrow">Продать свой проект</p>
          <h2>Разместим ваш проект в каталоге</h2>
          <p>Если продукт, сделанный по подписке, стал не нужен или вы хотите на нём заработать, выставим его на продажу в этом разделе, покажем покупателям и проведём передачу. Если покупатель уже есть, переоформим проект на него.</p>
          <a class="btn btn--lg" href="/buyout#transfer">Условия продажи и переуступки</a>
        </div>
        <div class="card buyout__calc">
          <p class="buyout__calc-title">Условия</p>
          <div class="calc-row"><span>Продажа через каталог</span><b><span data-sale-commission>${Math.round(PR.saleCommission * 100)}%</span> от суммы продажи</b></div>
          <div class="calc-row"><span>Переуступка своему покупателю</span><b><span data-transfer-share>${Math.round(PR.transfer.share * 100)}%</span> от остаточной стоимости</b></div>
          <div class="calc-row"><span>Минимальная комиссия переуступки</span><b data-transfer-min>${rub(PR.transfer.min)}</b></div>
          <p class="buyout__hint">Комиссия за продажу через каталог берётся, только если проект продан.</p>
        </div>
      </div>
    </section>`;
  const body = pageHead({ crumbsHtml: c.html, eyebrow: 'Готовые решения', h1: 'Готовые сайты и приложения: <span class="grad">купить или повторить</span>',
    lead: 'Каждый проект можно купить целиком — с исходным кодом и доменом — или заказать такой же под свой бренд по подписке: на готовой основе это быстрее и дешевле, чем с нуля.' })
    + '\n\n' + sections([list, sell, lead({ product: 'Готовое решение', title: 'Интересует проект?', text: 'Нажмите кнопку в карточке — проект добавится в заявку. Ответим в течение рабочего дня.' })]);
  const items = projects.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/solutions/${p.slug}`, name: p.name }));
  add('solutions.html', '/solutions', layout({ url: '/solutions', active: 'solutions',
    title: 'Готовые решения: сайты, приложения и сервисы на продажу | DigitalSub',
    desc: 'Готовые проекты DigitalSub: веб-приложение SimpleAB, игровой проект L2Start с собственным сервером, интернет-магазин ARM Game, мобильная игра Alias и личный VPN по запросу. Купите проект целиком или закажите такой же по подписке.',
    jsonld: [c.json, { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Готовые решения DigitalSub', itemListElement: items }], body }), '0.8');
}

// Готовые решения: страницы проектов
for (const p of projects) {
  const url = `/solutions/${p.slug}`;
  const c = crumbs([['/solutions', 'Готовые решения'], [url, p.name]]);
  const svc = p.kind === 'service';
  const [main, mainAlt] = p.images[0];
  const gallery = `<div class="gallery${p.portrait ? ' gallery--phone' : ''}">
          <div class="gallery__main card"><img id="gallery-main" src="${imgSrc(main)}" alt="${esc(p.name + ': ' + mainAlt)}" ${imgDims(p)} decoding="async"></div>
          ${p.images.length > 1 ? `<div class="gallery__thumbs" role="group" aria-label="Скриншоты">${p.images.map(([f, alt], i) => `<button class="gallery__thumb" type="button" data-src="${imgSrc(f)}" data-alt="${esc(p.name + ': ' + alt)}" aria-label="${esc(alt)}"${i === 0 ? ' aria-current="true"' : ''}><img src="${imgSrc(f)}" alt="" ${p.portrait ? 'width="108" height="234"' : 'width="160" height="100"'} loading="lazy" decoding="async"></button>`).join('')}</div>` : ''}
        </div>`;
  const included = p.included || (svc
    ? ['Развёртывание и настройка сервера на вашем VPS', 'Подключение ваших устройств и инструкции', 'Передача всех доступов', 'Обслуживание — по подписке, если нужно']
    : [`Исходный код${p.host ? ` и домен ${p.host}` : ''}`, 'Доступы к проекту и инструкции', 'Помощь с переносом на ваш сервер', 'Или копия под ваш бренд по подписке']);
  const top = `    <section class="page-head product-page">
      <div class="hero__glow" aria-hidden="true"></div>
      <div class="container page-head__inner">
        ${c.html}
        <div class="product">
        ${gallery}
        <div class="product__info">
          <p class="eyebrow">${p.niche}</p>
          <h1>${p.name}</h1>
          ${p.url ? `<p class="product__host"><a href="${p.url}" target="_blank" rel="noopener">${p.host} ↗</a></p>` : `<p class="product__host product__host--off">${svc ? 'Разворачиваем на вашем сервере' : 'Демо по запросу'}</p>`}
          <p class="lead">${p.short}</p>
          <div class="card product__buy">
            <p class="product__price-label">${svc ? 'Стоимость' : 'Цена проекта целиком'}</p>
            <p class="product__price" data-price="${p.id}">${projPrice(p)}</p>
            <div class="product__btns">
              ${projectButtons(p).replace(/\n/g, '\n              ')}
            </div>
            <p class="product__inc-title">${svc ? 'Что входит' : 'В покупку входит'}</p>
            <ul class="ticks">${included.map((x) => `<li>${x}</li>`).join('')}</ul>
            ${NDA ? `<p class="product__nda">${svc ? 'Можно подписать' : 'При покупке можно подписать'} <a href="/faq#nda">соглашение о неконкуренции и неразглашении</a> — ${rub(NDA.price)}. Отметьте этот пункт в заявке.</p>` : ''}
          </div>
        </div>
        </div>
      </div>
    </section>`;
  const others = projects.filter((x) => x.id !== p.id);
  const details = `    <section class="section" id="features">
      <div class="container product-details">
        <div>
          <p class="eyebrow">${svc ? 'Что вы получаете' : 'Возможности'}</p>
          <h2>${svc ? 'Как устроен личный VPN' : 'Что умеет ' + p.name}</h2>
          <p class="product__about">${p.about}</p>
          <ul class="ticks ticks--lg">${p.features.map((x) => `<li>${x}</li>`).join('')}</ul>
        </div>
        <aside class="card product-side">
          ${p.stack ? `<p class="product-side__title">Технологии</p><p>${p.stack}</p>` : ''}
          <p class="product-side__title">${svc ? 'Как заказать' : 'Купить или повторить'}</p>
          <p>${svc ? 'Нажмите «Заказать» — уточним задачу, количество устройств и пользователей и назовём стоимость.' : 'Проект можно купить целиком или заказать такой же продукт под ваш бренд по подписке — на готовой основе это быстрее и дешевле, чем с нуля.'}</p>
          <p class="product-side__title">Другие решения</p>
          <ul class="product-side__list">${others.map((o) => `<li><a href="/solutions/${o.slug}">${o.name}</a> <span>${o.niche}</span></li>`).join('')}</ul>
          <a class="btn btn--ghost btn--block" href="/solutions">Все готовые решения</a>
        </aside>
      </div>
    </section>`;
  const body = top + '\n\n' + sections([details, lead({ product: 'Готовое решение', title: svc ? 'Заказать личный VPN' : `Интересует ${p.name}?`, text: 'Нажмите кнопку выше или опишите задачу — ответим в течение рабочего дня.' })]);
  const product = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: strip(p.about), url: SITE + url, category: p.niche, image: p.images.filter(([f]) => !f.endsWith('.svg')).map(([f]) => SITE + imgSrc(f)), brand: ORG };
  if (p.schemaType) product.additionalType = p.schemaType;
  if (!product.image.length) delete product.image;
  // Цена указывается в разметке только если она задана в projects.json (без выдуманной цены для «по запросу»)
  if (typeof p.price === 'number') product.offers = { '@type': 'Offer', price: p.price, priceCurrency: 'RUB', availability: 'https://schema.org/InStock', url: SITE + url, seller: ORG };
  add(`solutions/${p.slug}.html`, url, layout({ url, active: 'solutions',
    title: svc ? 'Личный VPN на вашем сервере — развёртывание и настройка | DigitalSub' : `${p.name} — купить готовый проект: ${p.niche.split(' · ')[0].toLowerCase()} | DigitalSub`,
    desc: strip(p.short).slice(0, 200), jsonld: [c.json, product], body }), '0.7');
}

// Выкуп
{
  const c = crumbs([['/buyout', 'Выкуп и переуступка']]);
  const buyout = part('buyout');
  const compare = part('compare');
  const body = pageHead({ crumbsHtml: c.html, eyebrow: 'Выкуп и переуступка', h1: 'Выкуп, переуступка <span class="grad">и продажа проекта</span>',
    lead: 'Продукт по подписке можно выкупить в собственность с зачётом оплаченных месяцев, передать другому владельцу или продать через наш каталог. Все условия фиксируются в договоре заранее.',
    actions: '<a class="btn btn--lg" href="/prices#calc">Посчитать выкуп</a><a class="btn btn--ghost btn--lg" href="#lead">Задать вопрос</a>' })
    + '\n\n' + sections([buyout, compare, lead()]);
  add('buyout.html', '/buyout', layout({ url: '/buyout', active: 'buyout',
    title: 'Выкуп сайта или приложения по подписке, переуступка и продажа проекта | DigitalSub',
    desc: 'Как выкупить продукт по подписке: 12 платежей без скидки минус 30% оплаченного, минимум 3 платежа. Переуступка проекта — 15% от остаточной стоимости, от 30 000 ₽; продажа через каталог — 10%. Сравнение с разработкой под ключ.',
    jsonld: [c.json], body }), '0.8');
}

// FAQ
{
  const c = crumbs([['/faq', 'Вопросы']]);
  const faq = part('faq');
  const items = faqItems(faq);
  const body = pageHead({ crumbsHtml: c.html, eyebrow: 'Вопросы', h1: 'Вопросы <span class="grad">о подписке</span>',
    lead: 'Как устроена подписка, сроки, что входит в тариф, выкуп, домен, правки и продвижение. Не нашли ответ — спросите в заявке внизу страницы.' })
    + '\n\n' + sections([dropHead(faq), lead({ title: 'Остались вопросы?' })]);
  add('faq.html', '/faq', layout({ url: '/faq', active: 'faq',
    title: 'Вопросы о сайтах и приложениях по подписке | DigitalSub',
    desc: 'Ответы на вопросы о подписке DigitalSub: сроки разработки, что входит в подписку, минимальный срок, выкуп и переуступка проекта, домен, правки, продвижение и готовые решения.',
    jsonld: [c.json, faqLd(items)], body }), '0.7');
}

// Услуги: список
{
  const c = crumbs([['/services', 'Услуги']]);
  const body = pageHead({ crumbsHtml: c.html, eyebrow: 'Услуги', h1: 'Сайты и приложения <span class="grad">по подписке</span>',
    lead: 'Шесть основ продукта — от лендинга до программы для Windows. Выберите подходящую: на странице каждой услуги — что входит, сроки, цена, модули и ответы на вопросы.' })
    + '\n\n' + sections([`    <section class="section" id="what">
      <div class="container">
        ${productCards()}
      </div>
    </section>`, `    <section class="section" id="niches">
      <div class="container">
        <div class="section__head"><p class="eyebrow">По отраслям</p><h2>Решения для вашей сферы</h2><p class="section__sub">Типовые наборы функций и тарифы для конкретных видов бизнеса.</p></div>
        <ul class="niche-links">${NICHES_LIST.map((n) => `<li><a href="/dlya-biznesa/${n.slug}">${n.h1} ${n.h1grad}</a></li>`).join('')}</ul>
        <div class="teaser__actions"><a class="btn btn--ghost btn--lg" href="/dlya-biznesa">Все отрасли</a></div>
      </div>
    </section>`, part('how'), lead()]);
  add('services.html', '/services', layout({ url: '/services', active: 'services',
    title: 'Услуги DigitalSub: разработка сайтов и приложений по подписке',
    desc: 'Лендинги, многостраничные сайты, интернет-магазины, веб-приложения, Android-приложения и десктоп-программы по подписке от 4 900 ₽/мес с хостингом, поддержкой и правом выкупа.',
    jsonld: [c.json, { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Услуги DigitalSub', itemListElement: SERVICES.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/services/${s.slug}`, name: s.name })) }], body }), '0.9');
}

// Услуги: страницы
for (const s of SERVICES) {
  const b = baseById(s.base);
  const allowed = new Set(b.modules);
  s.modules.forEach((id) => { if (!allowed.has(id)) throw new Error(`module ${id} not allowed for ${b.id}`); });
  const url = `/services/${s.slug}`;
  const c = crumbs([['/services', 'Услуги'], [url, s.short]]);
  const buyoutEx = Math.round(Math.max(P.buyout.multiplier * b.price - P.buyout.creditShare * b.price * 12, P.buyout.minMonths * b.price) / (P.roundTo || 1)) * (P.roundTo || 1);
  const head = pageHead({ crumbsHtml: c.html, eyebrow: s.short + ' · по подписке', h1: `${s.h1} <span class="grad">${s.h1grad}</span>`, lead: s.lead,
    points: [`<b>от <span data-base-price="${b.id}">${rub(b.price)}</span></b> в месяц`, `<b>${s.time}</b> до первой версии`, `<b>${P.startPayment.months} месяца</b> оплаты на старте`, '<b>право выкупа</b>'],
    actions: `<a class="btn btn--lg" href="#lead">Обсудить проект</a><a class="btn btn--ghost btn--lg" href="/prices?base=${b.id}#calc">Рассчитать стоимость</a>` });
  const inc = `    <section class="section" id="included">
      <div class="container">
        <div class="section__head"><p class="eyebrow">Что входит</p><h2>${s.name}: что вы получаете</h2></div>
        <div class="grid grid--3 svc-info">
          <div class="card"><h3>В подписке</h3><ul class="ticks">${s.included.map((x) => `<li>${x}</li>`).join('')}</ul></div>
          <div class="card"><h3>Кому подходит</h3><p>${s.forWhom}</p><ul class="ticks">${s.forList.map((x) => `<li>${x}</li>`).join('')}</ul></div>
          <div class="card"><h3>Сроки и оплата</h3><ul class="ticks">
            <li>Первая версия — ${s.time}</li>
            <li>от ${rub(b.price)}/мес при подписке на 12 месяцев</li>
            <li>Срок 12 месяцев, ${discText}</li>
            <li>На старте — первый и последний месяц подписки</li>
            <li>Выкуп: ${P.buyout.multiplier} платежей без скидки минус ${Math.round(P.buyout.creditShare * 100)}% оплаченного; после 12 месяцев на базовом тарифе — около ${rub(buyoutEx)}</li>
          </ul></div>
        </div>
        ${s.related ? `<p class="note"><b>Пример:</b> <a href="/solutions">${s.related.name}</a> — ${s.related.text} Его можно купить целиком или заказать такой же по подписке.</p>` : ''}
      </div>
    </section>`;
  const mods = `    <section class="section" id="modules">
      <div class="container">
        <div class="section__head"><p class="eyebrow">Модули</p><h2>Что можно добавить</h2><p class="section__sub">Модули подключаются к основе в любой момент и увеличивают ежемесячный платёж. Полный список и точный расчёт — в калькуляторе.</p></div>
        <div class="grid svc-mods">
${s.modules.map((id) => { const m = modById(id); return `          <div class="card svc-mod"><h3>${m.name}</h3>${m.note ? `<p>${m.note}</p>` : ''}<p class="svc-mod__price" data-mod-price="${m.id}">${modPrice(m)}</p></div>`; }).join('\n')}
        </div>
        ${s.base === 'android' || s.modules.some((id) => modById(id).adBudget) || s.modules.some((id) => ['direct', 'appads', 'vkads'].includes(id)) ? '<p class="note">Рекламный бюджет оплачивается отдельно, напрямую рекламной площадке.</p>' : ''}
        <div class="teaser__actions"><a class="btn btn--lg" href="/prices?base=${b.id}#calc">Рассчитать в калькуляторе</a><a class="btn btn--ghost btn--lg" href="/prices">Все тарифы</a></div>
      </div>
    </section>`;
  const faq = faqBlock(s.faq, { id: 'faq', title: `Вопросы: ${s.short.toLowerCase()}` });
  const body = head + '\n\n' + sections([inc, mods, faq, lead({ product: s.product, title: 'Обсудим ваш проект', text: `Расскажите о задаче — ответим в течение рабочего дня, предложим решение и зафиксируем цену. В заявке уже выбрано: «${s.short}».` })]);
  const service = { '@context': 'https://schema.org', '@type': 'Service', name: s.name, serviceType: s.serviceType, description: s.desc, url: SITE + url, areaServed: 'RU', provider: ORG,
    offers: { '@type': 'Offer', url: SITE + url, priceCurrency: 'RUB', price: b.price, priceSpecification: { '@type': 'UnitPriceSpecification', price: b.price, priceCurrency: 'RUB', unitText: 'месяц', unitCode: 'MON' } } };
  add(`services/${s.slug}.html`, url, layout({ url, active: 'svc-' + s.slug, title: s.title, desc: s.desc, jsonld: [c.json, service, faqLd(s.faq)], body }), '0.9');
}

// Отрасли: хаб
{
  const c = crumbs([['/dlya-biznesa', 'Для бизнеса']]);
  const cards = `<div class="grid grid--3 products">
${NICHES.map((n) => { const b = baseById(n.base); return `          <article class="card feature">
            <div class="feature__icon">${svg(ICON_NICHE)}</div>
            <h3><a class="feature__link" href="/dlya-biznesa/${n.slug}">${n.short}</a></h3>
            <p>${n.card}</p>
            <div class="feature__foot"><span class="feature__price">от <b data-base-price="${b.id}">${rub(b.price)}</b>/мес</span><span class="feature__more" aria-hidden="true">Подробнее →</span></div>
          </article>`; }).join('\n')}
        </div>`;
  const body = pageHead({ crumbsHtml: c.html, eyebrow: 'Для бизнеса', h1: 'Сайты и приложения <span class="grad">для вашей отрасли</span>',
    lead: 'Готовые наборы функций для типовых задач: онлайн-запись для салонов, услуги и врачи для клиник, портфолио и замер для ремонта, меню и доставка для кафе. Всё — по подписке, без оплаты разработки и с правом выкупа.' })
    + '\n\n' + sections([`    <section class="section" id="niches">
      <div class="container">
        ${cards}
        <p class="note">Не нашли свою сферу? Это не значит, что мы её не делаем: <a href="/services">посмотрите все услуги</a> или опишите задачу в заявке.</p>
      </div>
    </section>`, lead()]);
  add('dlya-biznesa.html', '/dlya-biznesa', layout({ url: '/dlya-biznesa', active: 'niches',
    title: 'Сайты для бизнеса по отраслям — по подписке | DigitalSub',
    desc: 'Сайты и приложения для салонов красоты, стоматологий, ремонтных компаний, кафе с доставкой и интернет-магазинов по подписке: без оплаты разработки, с хостингом, поддержкой и правом выкупа.',
    jsonld: [c.json, { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Решения DigitalSub по отраслям', itemListElement: NICHES.map((n, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/dlya-biznesa/${n.slug}`, name: n.h1 + ' ' + n.h1grad })) }], body }), '0.8');
}

// Отрасли: страницы
for (const n of NICHES) {
  const b = baseById(n.base);
  const allowed = new Set(b.modules);
  n.modules.forEach((id) => { if (!allowed.has(id)) throw new Error(`niche ${n.slug}: module ${id} not allowed for ${b.id}`); });
  const url = `/dlya-biznesa/${n.slug}`;
  const c = crumbs([['/dlya-biznesa', 'Для бизнеса'], [url, n.short]]);
  const svc = SERVICES.find((s) => s.base === n.base);
  const sc = subCalc(n.base);
  const head = pageHead({ crumbsHtml: c.html, eyebrow: `${n.short} · по подписке`, h1: `${n.h1} <span class="grad">${n.h1grad}</span>`, lead: n.lead,
    points: [`<b>от <span data-base-price="${b.id}">${rub(b.price)}</span></b> в месяц`, `<b>${svc ? svc.time : '3–7 дней'}</b> до первой версии`, `<b>${P.startPayment.months} месяца</b> оплаты на старте`, '<b>право выкупа</b>'],
    actions: `<a class="btn btn--lg" href="#lead">Обсудить проект</a><a class="btn btn--ghost btn--lg" href="/prices?base=${b.id}#calc">Рассчитать стоимость</a>` });
  const pains = `    <section class="section" id="tasks">
      <div class="container">
        <div class="section__head"><p class="eyebrow">Задачи</p><h2>С чем приходят: ${n.niche}</h2></div>
        <div class="grid grid--2 niche-pains">
${n.pains.map(([t, x]) => `          <div class="card"><h3>${t}</h3><p>${x}</p></div>`).join('\n')}
        </div>
      </div>
    </section>`;
  const plan = `    <section class="section" id="included">
      <div class="container">
        <div class="section__head"><p class="eyebrow">Решение</p><h2>Что будет на сайте и сколько это стоит</h2></div>
        <div class="grid grid--3 svc-info">
          <div class="card"><h3>Что сделаем</h3><ul class="ticks">${n.solution.map((x) => `<li>${x}</li>`).join('')}</ul></div>
          <div class="card"><h3>Какой тариф подходит</h3><p>${n.planText}</p><p><a href="/services/${svc ? svc.slug : ''}">Подробнее о тарифе «${svc ? svc.short : b.name}» →</a></p></div>
          <div class="card"><h3>Оплата и выкуп</h3><ul class="ticks">
            <li>Хостинг, домен, SSL, обновления и правки — в подписке</li>
            <li>На старте — ${rub(sc.start)}: первый и последний месяц</li>
            <li>Срок 12 месяцев, ${discText}</li>
            <li>Выкуп: ${P.buyout.multiplier} платежей без скидки минус ${Math.round(P.buyout.creditShare * 100)}% оплаченного; после 12 месяцев на базовом тарифе — около ${rub(sc.buyout)}</li>
            <li>Домен оформляется на вас</li>
          </ul><p><a href="/buyout">Как устроен выкуп →</a></p></div>
        </div>
      </div>
    </section>`;
  const mods = `    <section class="section" id="modules">
      <div class="container">
        <div class="section__head"><p class="eyebrow">Модули</p><h2>Что пригодится в вашей сфере</h2><p class="section__sub">Модули подключаются в любой момент — начните с необходимого. Полный список и точный расчёт — в калькуляторе.</p></div>
        <div class="grid svc-mods">
${n.modules.map((id) => { const m = modById(id); return `          <div class="card svc-mod"><h3>${m.name}</h3>${m.note ? `<p>${m.note}</p>` : ''}<p class="svc-mod__price" data-mod-price="${m.id}">${modPrice(m)}</p></div>`; }).join('\n')}
        </div>
        <div class="teaser__actions"><a class="btn btn--lg" href="/prices?base=${b.id}#calc">Рассчитать в калькуляторе</a><a class="btn btn--ghost btn--lg" href="/dlya-biznesa">Другие отрасли</a></div>
      </div>
    </section>`;
  const rel = n.related ? projects.find((p) => p.id === n.related) : null;
  const related = rel ? `    <section class="section" id="example">
      <div class="container">
        <div class="section__head"><p class="eyebrow">Пример</p><h2>Готовое решение, на основе которого можно начать</h2><p class="section__sub">Его можно купить целиком или заказать такой же под ваш бренд по подписке — на готовой основе это быстрее, чем с нуля.</p></div>
        <div class="grid grid--3 projects">
${projectCard(rel)}
        </div>
      </div>
    </section>` : '';
  const faq = faqBlock(n.faq, { id: 'faq', title: `Вопросы: ${n.short.toLowerCase()}` });
  const body = head + '\n\n' + sections([pains, plan, mods, related, faq, lead({ product: n.product, niche: n.niche, title: 'Обсудим ваш проект', text: `Расскажите о задаче — ответим в течение рабочего дня, предложим решение и зафиксируем цену. Сфера «${n.niche}» уже указана в заявке.` })].filter(Boolean));
  const service = { '@context': 'https://schema.org', '@type': 'Service', name: strip(`${n.h1} ${n.h1grad}`), serviceType: n.query, description: n.desc, url: SITE + url, areaServed: 'RU', provider: ORG,
    offers: { '@type': 'Offer', url: SITE + url, priceCurrency: 'RUB', price: b.price, priceSpecification: { '@type': 'UnitPriceSpecification', price: b.price, priceCurrency: 'RUB', unitText: 'месяц', unitCode: 'MON' } } };
  add(`dlya-biznesa/${n.slug}.html`, url, layout({ url, active: 'niches', title: n.title, desc: n.desc, jsonld: [c.json, service, faqLd(n.faq)], body }), '0.8');
}

/* ---------- Блог: статьи — файлы site/blog/<slug>.html с метаданными в комментарии <!--meta {...} --> ---------- */
// В тексте статьи можно использовать подстановки из pricing.json: {{p:landing}}, {{start:site}}, {{total12:shop}},
// {{buyout12:landing}}, {{own12:landing}}, {{m24:landing}}, {{start24:...}}, {{total24:...}}, {{buyout24:...}}, {{own24:...}}, {{disc}}, {{bo_mult}}, {{bo_credit}}, {{bo_min}}.
function blogSubst(html) {
  return html.replace(/\{\{(\w+)(?::(\w+))?\}\}/g, (all, k, id) => {
    if (k === 'p') return rub(baseById(id).price);
    if (k === 'disc') return discText;
    if (k === 'bo_mult') return String(P.buyout.multiplier);
    if (k === 'bo_credit') return Math.round(P.buyout.creditShare * 100) + '%';
    if (k === 'bo_min') return String(P.buyout.minMonths);
    const mm = /^(start|total|buyout|own)(12|24|36)?$|^m(12|24|36)$/.exec(k);
    if (mm) { const months = Number(mm[2] || mm[3] || 12); const c = subCalc(id, months); return rub(mm[3] ? c.monthly : c[mm[1]]); }
    throw new Error('blog: неизвестная подстановка ' + all);
  });
}
const BLOG_DIR = path.join(__dirname, 'blog');
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const ruDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
const posts = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.html')).map((f) => {
  const raw = fs.readFileSync(path.join(BLOG_DIR, f), 'utf8');
  const mt = /^<!--meta\s*([\s\S]*?)-->\s*/.exec(raw); if (!mt) throw new Error('blog: нет метаданных в ' + f);
  const meta = JSON.parse(mt[1]);
  const html = blogSubst(raw.slice(mt[0].length)).trim();
  const words = strip(html).split(' ').length;
  return { ...meta, slug: meta.slug || f.replace(/\.html$/, ''), html, minutes: Math.max(1, Math.round(words / 180)) };
}).sort((a, b) => b.date.localeCompare(a.date));

// Блог: статьи
for (const a of posts) {
  const url = `/blog/${a.slug}`;
  const c = crumbs([['/blog', 'Блог'], [url, a.h1]]);
  const others = posts.filter((x) => x !== a).slice(0, 3);
  const body = pageHead({ crumbsHtml: c.html, eyebrow: 'Блог', h1: a.h1, lead: a.lead })
    .replace('<p class="lead">', `<p class="post__meta"><time datetime="${a.date}">${ruDate(a.date)}</time>${a.updated && a.updated !== a.date ? ` · обновлено <time datetime="${a.updated}">${ruDate(a.updated)}</time>` : ''} · ${a.minutes} мин чтения</p>\n        <p class="lead">`)
    + `\n\n    <article class="section post">
      <div class="container container--narrow prose">
${a.html.split('\n').map((l) => '        ' + l).join('\n')}
      </div>
    </article>`
    + (others.length ? `\n\n    <section class="section section--alt">
      <div class="container container--narrow">
        <div class="section__head"><p class="eyebrow">Читать дальше</p><h2>Другие статьи</h2></div>
        <ul class="post-list">${others.map((o) => `<li><a href="/blog/${o.slug}">${o.h1}</a><p>${o.desc}</p></li>`).join('')}</ul>
      </div>
    </section>` : '')
    + '\n\n' + lead({ title: 'Посчитаем ваш проект', text: 'Расскажите о задаче — ответим в течение рабочего дня, предложим формат и зафиксируем цену.' }).replace(/class="section( section--alt)?"/, 'class="section"');
  const article = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: a.h1, description: a.desc, datePublished: a.date, dateModified: a.updated || a.date, inLanguage: 'ru',
    mainEntityOfPage: { '@type': 'WebPage', '@id': SITE + url }, url: SITE + url, image: SITE + '/assets/og-image.png', author: ORG, publisher: { ...ORG, logo: { '@type': 'ImageObject', url: SITE + '/apple-touch-icon.png' } } };
  add(`blog/${a.slug}.html`, url, layout({ url, active: 'blog', title: a.title, desc: a.desc, ogTitle: a.h1, jsonld: [c.json, article], body,
    head: `  <meta property="article:published_time" content="${a.date}">\n  <meta property="article:modified_time" content="${a.updated || a.date}">\n` }), '0.7');
}

// Блог: список статей
{
  const c = crumbs([['/blog', 'Блог']]);
  const body = pageHead({ crumbsHtml: c.html, eyebrow: 'Блог', h1: 'Блог DigitalSub', lead: 'Разбираем, сколько стоят сайты и приложения, как выбрать формат и подрядчика и как устроена разработка по подписке. Без воды и выдуманных кейсов.' })
    + `\n\n    <section class="section">
      <div class="container">
        <div class="grid grid--2 posts">
${posts.map((a) => `          <article class="card feature post-card">
            <p class="post__meta"><time datetime="${a.date}">${ruDate(a.date)}</time> · ${a.minutes} мин чтения</p>
            <h2 class="post-card__title"><a class="feature__link" href="/blog/${a.slug}">${a.h1}</a></h2>
            <p>${a.desc}</p>
            <div class="feature__foot"><span></span><span class="feature__more" aria-hidden="true">Читать →</span></div>
          </article>`).join('\n')}
        </div>
      </div>
    </section>`;
  add('blog.html', '/blog', layout({ url: '/blog', active: 'blog', title: 'Блог DigitalSub: цены на сайты, подписка, выбор подрядчика', desc: 'Статьи о стоимости сайтов и приложений, разработке по подписке и выборе подрядчика для малого бизнеса.',
    jsonld: [c.json, { '@context': 'https://schema.org', '@type': 'Blog', name: 'Блог DigitalSub', url: SITE + '/blog', inLanguage: 'ru', publisher: ORG,
      blogPost: posts.map((a) => ({ '@type': 'BlogPosting', headline: a.h1, url: `${SITE}/blog/${a.slug}`, datePublished: a.date })) }], body }), '0.7', 'weekly');
}

// Политика
{
  const c = crumbs([['/privacy', 'Политика конфиденциальности']]);
  const body = part('privacy').replace('<main class="legal">', '<div class="legal">').replace('</main>', '</div>').replace('<div class="container container--narrow">', `<div class="container container--narrow">\n      ${c.html}`);
  add('privacy.html', '/privacy', layout({ url: '/privacy', active: '', title: 'Политика конфиденциальности — DigitalSub', desc: 'Политика обработки персональных данных сайта digitalsub.ru', jsonld: [c.json], body }), '0.2', 'yearly');
}

// Файлы подтверждения прав (Яндекс Вебмастер, Google Search Console) копируются как есть, без изменений
for (const f of fs.readdirSync(path.join(__dirname, 'verification'))) fs.copyFileSync(path.join(__dirname, 'verification', f), path.join(PUB, f));

// 404
fs.writeFileSync(path.join(PUB, '404.html'), layout({ url: '/404', active: '', robots: 'noindex', title: 'Страница не найдена — DigitalSub', desc: 'Такой страницы нет на digitalsub.ru',
  body: `    <div class="legal"><div class="container container--narrow"><p class="eyebrow">Ошибка 404</p><h1>Такой страницы нет</h1><p>Возможно, ссылка устарела. Вот основные разделы сайта:</p>
      <div class="hero__actions"><a class="btn" href="/">На главную</a><a class="btn btn--ghost" href="/services">Услуги</a><a class="btn btn--ghost" href="/prices">Цены</a><a class="btn btn--ghost" href="/faq">Вопросы</a></div></div></div>` })
  .replace(/\s*<link rel="canonical"[^>]+>/, '').replace(/\s*<meta property="og:url"[^>]+>/, '')
  .replace(/\s*<a class="btn btn--sm header__cta" href="#lead">[^<]+<\/a>/, '\n      <a class="btn btn--sm header__cta" href="/#lead">Оставить заявку</a>').replace('class="btn nav__cta" href="#lead"', 'class="btn nav__cta" href="/#lead"'));

for (const p of pages) {
  const f = path.join(PUB, p.file);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, p.html);
}
fs.writeFileSync(path.join(PUB, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${SITE}${p.url}</loc><lastmod>${LASTMOD}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.prio}</priority></url>`).join('\n')}
</urlset>
`);
console.log(`Собрано страниц: ${pages.length}\n` + pages.map((p) => `  ${p.url} -> public/${p.file}`).join('\n'));
