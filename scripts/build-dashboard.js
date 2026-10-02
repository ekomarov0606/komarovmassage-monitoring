const fs = require('fs');
const path = require('path');

const REPORT_DIR = path.resolve('lhci-reports');
const OUT_DIR = path.resolve('dashboard');
const HISTORY_FILE = path.join(OUT_DIR, 'history.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

const jsonFiles = fs.existsSync(REPORT_DIR)
  ? fs.readdirSync(REPORT_DIR).filter((f) => f.endsWith('.json'))
  : [];

const reports = [];
for (const file of jsonFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, file), 'utf8'));
    if (!data.categories || !data.audits) continue;
    reports.push(data);
  } catch (_) {}
}

const AUDIT_RU = {
  'largest-contentful-paint': 'Отображение самого крупного элемента (LCP)',
  'first-contentful-paint': 'Первое отображение содержимого (FCP)',
  'speed-index': 'Индекс скорости загрузки',
  'total-blocking-time': 'Общее время блокировки',
  'cumulative-layout-shift': 'Смещение элементов страницы (CLS)',
  'interactive': 'Время до полной интерактивности',
  'render-blocking-resources': 'Ресурсы, блокирующие отображение страницы',
  'unused-css-rules': 'Неиспользуемые CSS-стили',
  'unused-javascript': 'Неиспользуемый JavaScript',
  'uses-optimized-images': 'Изображения можно оптимизировать',
  'uses-responsive-images': 'Некоторые изображения имеют избыточный размер',
  'uses-webp-images': 'Можно использовать более эффективный формат изображений',
  'offscreen-images': 'Отложите загрузку изображений вне экрана',
  'modern-image-formats': 'Используйте современные форматы изображений',
  'uses-text-compression': 'Включите сжатие текстовых ресурсов',
  'uses-rel-preconnect': 'Предварительно подключайтесь к нужным источникам',
  'server-response-time': 'Сократите время ответа сервера',
  'redirects': 'Избегайте лишних перенаправлений',
  'dom-size': 'Слишком большой DOM',
  'network-requests': 'Сетевые запросы',
  'network-rtt': 'Задержка сети',
  'mainthread-work-breakdown': 'Снизьте нагрузку на основной поток',
  'bootup-time': 'Сократите время выполнения JavaScript',
  'font-display': 'Настройте отображение веб-шрифтов',
  'third-party-summary': 'Влияние стороннего кода',
  'errors-in-console': 'Ошибки в консоли браузера',
  'image-alt': 'У изображений отсутствует альтернативный текст',
  'button-name': 'У кнопок отсутствуют доступные названия',
  'link-name': 'У ссылок отсутствуют доступные названия',
  'label': 'У элементов формы отсутствуют подписи',
  'color-contrast': 'Недостаточная контрастность текста',
  'heading-order': 'Нарушен порядок заголовков',
  'html-has-lang': 'У страницы не указан язык',
  'document-title': 'У страницы отсутствует корректный заголовок',
  'meta-description': 'У страницы отсутствует meta description',
  'http-status-code': 'Страница возвращает некорректный HTTP-статус',
  'crawlable-anchors': 'Некоторые ссылки нельзя сканировать',
  'is-crawlable': 'Страница может быть недоступна поисковым роботам',
  'robots-txt': 'Проблема с robots.txt',
  'canonical': 'Проблема с canonical-ссылкой',
  'hreflang': 'Проблема с hreflang',
  'structured-data': 'Проблема со структурированными данными',
  'viewport': 'Не настроен viewport для мобильных устройств',
  'tap-targets': 'Интерактивные элементы расположены слишком близко',
  'uses-long-cache-ttl': 'Настройте более длительное кэширование ресурсов',
  'total-byte-weight': 'Большой общий вес страницы',
};

function score(v) {
  return typeof v === 'number' ? Math.round(v * 100) : null;
}

function numericAudit(r, id) {
  const v = r.audits?.[id]?.numericValue;
  return typeof v === 'number' ? v : null;
}

function median(values) {
  const a = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function pageLabel(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/^\//, '').replace(/\/$/, '');
    if (!p) return 'Главная';
    const parts = p.split('/');
    const lang = parts[0]?.toUpperCase();
    const page = parts[1] || '';
    if (!page) return `${lang} — Главная`;
    if (page === 'certificates') return `${lang} — Сертификаты`;
    if (page === 'vyezd') return `${lang} — Выезд на дом`;
    return p;
  } catch { return url; }
}

function auditWeights(report) {
  const weights = new Map();
  for (const [categoryId, category] of Object.entries(report.categories || {})) {
    for (const ref of category.auditRefs || []) {
      if (!weights.has(ref.id)) weights.set(ref.id, []);
      weights.get(ref.id).push({ categoryId, weight: ref.weight || 0 });
    }
  }
  return weights;
}

function classifyIssues(rs) {
  if (!rs.length) return { errors: [], warnings: [] };
  const weights = auditWeights(rs[0]);
  const ids = new Set();
  rs.forEach((r) => Object.keys(r.audits || {}).forEach((id) => ids.add(id)));
  const errors = [];
  const warnings = [];

  for (const id of ids) {
    const audits = rs.map((r) => r.audits?.[id]).filter(Boolean);
    const scored = audits.filter((a) => typeof a.score === 'number' && a.scoreDisplayMode !== 'notApplicable');
    if (!scored.length) continue;
    const med = median(scored.map((a) => a.score));
    if (med == null || med >= 0.9) continue;

    const sample = scored.find((a) => a.title) || scored[0];
    const refs = weights.get(id) || [];
    const weightedCore = refs.some((r) => r.weight > 0 && ['seo', 'accessibility', 'best-practices'].includes(r.categoryId));
    const item = {
      id,
      title: AUDIT_RU[id] || sample.title || id,
      description: '',
      displayValue: sample.displayValue || '',
      score: Math.round(med * 100),
      categories: refs.map((r) => r.categoryId),
    };

    if (med === 0 && weightedCore) errors.push(item);
    else warnings.push(item);
  }

  const sorter = (a, b) => a.score - b.score || a.title.localeCompare(b.title, 'ru');
  return { errors: errors.sort(sorter), warnings: warnings.sort(sorter) };
}

const grouped = new Map();
for (const r of reports) {
  const url = r.finalUrl || r.requestedUrl || 'unknown';
  if (!grouped.has(url)) grouped.set(url, []);
  grouped.get(url).push(r);
}

const pages = [...grouped.entries()].map(([url, rs]) => {
  const issues = classifyIssues(rs);
  return {
    url,
    label: pageLabel(url),
    performance: Math.round(median(rs.map((r) => score(r.categories.performance?.score)))),
    seo: Math.round(median(rs.map((r) => score(r.categories.seo?.score)))),
    accessibility: Math.round(median(rs.map((r) => score(r.categories.accessibility?.score)))),
    bestPractices: Math.round(median(rs.map((r) => score(r.categories['best-practices']?.score)))),
    lcp: median(rs.map((r) => numericAudit(r, 'largest-contentful-paint'))),
    cls: median(rs.map((r) => numericAudit(r, 'cumulative-layout-shift'))),
    bytes: median(rs.map((r) => numericAudit(r, 'total-byte-weight'))),
    errors: issues.errors,
    warnings: issues.warnings,
  };
}).sort((a, b) => a.url.localeCompare(b.url));

const avg = (key) => {
  const vals = pages.map((p) => p[key]).filter((v) => Number.isFinite(v));
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
};

const summary = {
  performance: avg('performance'),
  seo: avg('seo'),
  accessibility: avg('accessibility'),
  bestPractices: avg('bestPractices'),
  lcp: pages.length ? median(pages.map((p) => p.lcp)) : null,
  bytes: pages.length ? median(pages.map((p) => p.bytes)) : null,
  errors: pages.reduce((n, p) => n + p.errors.length, 0),
  warnings: pages.reduce((n, p) => n + p.warnings.length, 0),
};

let history = [];
try {
  if (fs.existsSync(HISTORY_FILE)) history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  if (!Array.isArray(history)) history = [];
} catch (_) { history = []; }

const now = new Date();
const snapshot = {
  timestamp: now.toISOString(),
  run: process.env.GITHUB_RUN_NUMBER || null,
  performance: summary.performance,
  seo: summary.seo,
  accessibility: summary.accessibility,
  bestPractices: summary.bestPractices,
  lcp: summary.lcp,
  bytes: summary.bytes,
  errors: summary.errors,
  warnings: summary.warnings,
};
if (pages.length) {
  if (snapshot.run && history.some((h) => String(h.run) === String(snapshot.run))) {
    history = history.map((h) => String(h.run) === String(snapshot.run) ? snapshot : h);
  } else {
    history.push(snapshot);
  }
}
history = history.slice(-90);
fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

const cls = (v, good = 90, warn = 75) => v == null ? 'neutral' : v >= good ? 'good' : v >= warn ? 'warn' : 'bad';
const fmtMB = (b) => b == null ? '—' : `${(b / 1024 / 1024).toFixed(2)} МБ`;
const fmtSec = (ms) => ms == null ? '—' : `${(ms / 1000).toFixed(2)} с`;
const esc = (s) => String(s ?? '').replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));

function card(title, value, klass, sub) {
  return `<div class="card ${klass}"><div class="title">${title}</div><div class="value">${value ?? '—'}</div><div class="sub">${sub}</div></div>`;
}

function issueList(items, type) {
  if (!items.length) return `<div class="none">Нет</div>`;
  return `<div class="issue-list">${items.map((i) => `<div class="issue ${type}"><div class="issue-title"><strong>${esc(i.title)}</strong><span class="score-small">оценка ${i.score}</span></div>${i.displayValue ? `<div class="issue-value">${esc(i.displayValue)}</div>` : ''}</div>`).join('')}</div>`;
}

const rows = pages.map((p, index) => `<tr class="main-row" data-detail="detail-${index}">
<td><button class="toggle" aria-expanded="false" aria-controls="detail-${index}">＋</button> <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.label)}</a></td>
<td><span class="pill ${cls(p.performance,90,75)}">${p.performance ?? '—'}</span></td>
<td><span class="pill ${cls(p.seo,95,90)}">${p.seo ?? '—'}</span></td>
<td><span class="pill ${cls(p.accessibility,90,80)}">${p.accessibility ?? '—'}</span></td>
<td><span class="pill ${cls(p.bestPractices,90,80)}">${p.bestPractices ?? '—'}</span></td>
<td>${fmtSec(p.lcp)}</td><td>${fmtMB(p.bytes)}</td>
<td><span class="pill ${p.errors.length === 0 ? 'good' : 'bad'}">${p.errors.length}</span></td>
<td><span class="pill ${p.warnings.length === 0 ? 'good' : p.warnings.length <= 4 ? 'warn' : 'bad'}">${p.warnings.length}</span></td>
</tr><tr id="detail-${index}" class="detail-row"><td colspan="9"><div class="detail-grid"><section><h3>Ошибки</h3>${issueList(p.errors, 'error')}</section><section><h3>Предупреждения</h3>${issueList(p.warnings, 'warning')}</section></div></td></tr>`).join('');

const chartHistory = history.slice(-30);
const generated = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Riga' });
const historyJson = JSON.stringify(chartHistory).replace(/</g, '\\u003c');

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Мониторинг качества сайта Komarov Massage</title><style>
:root{color-scheme:light;--bg:#f6f7f8;--panel:#fff;--text:#19211e;--muted:#68716d;--border:#e4e7e5;--good:#159447;--goodbg:#e8f7ee;--warn:#b87900;--warnbg:#fff4d8;--bad:#c43d3d;--badbg:#fdeaea;--accent:#3b624b}*{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--text)}.wrap{max-width:1320px;margin:0 auto;padding:28px}.top{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:24px}.top h1{font-size:30px;margin:0 0 6px}.muted{color:var(--muted);font-size:14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:18px}.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px;min-height:140px}.card .title{font-weight:650}.card .value{font-size:38px;font-weight:750;margin:16px 0 6px}.card .sub{color:var(--muted);font-size:13px}.card.good{border-top:4px solid var(--good)}.card.warn{border-top:4px solid var(--warn)}.card.bad{border-top:4px solid var(--bad)}.card.neutral{border-top:4px solid #a9afac}.panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:18px}.panel-head{padding:18px 20px;border-bottom:1px solid var(--border);font-weight:700}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:14px 16px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);background:#fafbfa}a{color:var(--accent);text-decoration:none;font-weight:600}.pill{display:inline-block;min-width:42px;text-align:center;padding:5px 8px;border-radius:999px;font-weight:700}.pill.good{color:var(--good);background:var(--goodbg)}.pill.warn{color:var(--warn);background:var(--warnbg)}.pill.bad{color:var(--bad);background:var(--badbg)}.toggle{border:0;background:transparent;color:var(--accent);font-size:18px;cursor:pointer;padding:0 5px 0 0}.detail-row{display:none;background:#fbfcfb}.detail-row.open{display:table-row}.detail-row td{white-space:normal;padding:18px 26px}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.detail-grid h3{margin:0 0 12px;font-size:15px}.issue-list{display:grid;gap:9px}.issue{padding:11px 12px;border:1px solid var(--border);border-radius:10px;background:#fff}.issue.error{border-left:4px solid var(--bad)}.issue.warning{border-left:4px solid var(--warn)}.issue-title{display:flex;align-items:center;gap:8px}.issue-title strong{flex:1}.score-small{font-size:12px;color:var(--muted);font-weight:700}.issue-value{margin-top:5px;font-size:12px;color:var(--muted)}.none{font-size:13px;color:var(--good);font-weight:650}.history{padding:18px 20px}.chart{width:100%;height:250px;display:block}.legend{display:flex;gap:18px;flex-wrap:wrap;margin:4px 0 12px;font-size:12px;color:var(--muted)}.legend span:before{content:'';display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:var(--c)}.foot{margin-top:14px;color:var(--muted);font-size:12px}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}.top{align-items:start;flex-direction:column}.detail-grid{grid-template-columns:1fr}}@media(max-width:520px){.wrap{padding:16px}.grid{grid-template-columns:1fr 1fr;gap:10px}.card{padding:14px;min-height:124px}.card .value{font-size:30px}.top h1{font-size:24px}}
</style></head><body><main class="wrap"><div class="top"><div><h1>Мониторинг качества сайта</h1><div class="muted">komarovmassage.lv · 9 ключевых страниц · медиана из 3 проверок Lighthouse</div></div><div class="muted">Обновлено: ${generated} (Рига)</div></div><section class="grid">
${card('Скорость', summary.performance, cls(summary.performance,90,75), 'Скорость и эффективность загрузки')}
${card('SEO', summary.seo, cls(summary.seo,95,90), 'Поисковая оптимизация сайта')}
${card('Доступность', summary.accessibility, cls(summary.accessibility,90,80), 'Доступность интерфейса для пользователей')}
${card('Техническое качество', summary.bestPractices, cls(summary.bestPractices,90,80), 'Технические стандарты и лучшие практики')}
${card('Скорость показа главного элемента', fmtSec(summary.lcp), summary.lcp <= 2500 ? 'good' : summary.lcp <= 4000 ? 'warn' : 'bad', 'LCP — время появления крупнейшего элемента страницы')}
${card('Вес страницы', fmtMB(summary.bytes), summary.bytes <= 2500000 ? 'good' : summary.bytes <= 4000000 ? 'warn' : 'bad', 'Медианный объём загружаемых данных')}
${card('Ошибки', summary.errors, summary.errors === 0 ? 'good' : 'bad', 'Проваленные важные проверки')}
${card('Предупреждения', summary.warnings, summary.warnings === 0 ? 'good' : summary.warnings <= 20 ? 'warn' : 'bad', 'Проверки, требующие внимания')}
</section>
<section class="panel"><div class="panel-head">История качества сайта</div><div class="history"><div class="legend"><span style="--c:#b87900">Скорость</span><span style="--c:#159447">SEO</span><span style="--c:#3976c9">Доступность</span><span style="--c:#7156b8">Техническое качество</span></div><svg id="historyChart" class="chart" viewBox="0 0 1000 250" preserveAspectRatio="none" aria-label="История показателей качества сайта"></svg><div class="muted" id="historyNote"></div></div></section>
<section class="panel"><div class="panel-head">Результаты по страницам — нажмите ＋, чтобы увидеть подробности</div><div class="table-wrap"><table><thead><tr><th>Страница</th><th>Скорость</th><th>SEO</th><th>Доступность</th><th>Тех. качество</th><th>LCP</th><th>Вес</th><th>Ошибки</th><th>Предупр.</th></tr></thead><tbody>${rows || '<tr><td colspan="9">Нет данных проверки</td></tr>'}</tbody></table></div></section><div class="foot">Пороговые значения: SEO ≥95; скорость ≥80; доступность ≥90; техническое качество ≥90; LCP ≤2,5 с; вес страницы ≤4 МБ. Панель обновляется автоматически после каждой проверки.</div></main>
<script>
const historyData=${historyJson};
document.querySelectorAll('.main-row').forEach(row=>{row.addEventListener('click',e=>{if(e.target.closest('a'))return;const id=row.dataset.detail;const d=document.getElementById(id);const b=row.querySelector('.toggle');const open=d.classList.toggle('open');b.textContent=open?'−':'＋';b.setAttribute('aria-expanded',String(open));});});
(function(){const svg=document.getElementById('historyChart'),note=document.getElementById('historyNote');if(!historyData.length){note.textContent='История появится после следующих запусков.';return;}if(historyData.length===1)note.textContent='Сейчас сохранён 1 запуск. После следующих ежедневных проверок здесь появится динамика показателей.';const NS='http://www.w3.org/2000/svg',W=1000,H=250,pad=32;function el(n,a){const x=document.createElementNS(NS,n);Object.entries(a||{}).forEach(([k,v])=>x.setAttribute(k,v));svg.appendChild(x);return x;}[0,25,50,75,100].forEach(v=>{const y=H-pad-(v/100)*(H-pad*2);el('line',{x1:pad,y1:y,x2:W-pad,y2:y,stroke:'#e3e7e4','stroke-width':1});const t=el('text',{x:2,y:y+4,fill:'#7a837f','font-size':11});t.textContent=v;});const series=[['performance','#b87900'],['seo','#159447'],['accessibility','#3976c9'],['bestPractices','#7156b8']];series.forEach(([key,color])=>{const pts=historyData.map((h,i)=>{const x=historyData.length===1?W/2:pad+i*(W-pad*2)/(historyData.length-1);const v=Number(h[key]??0);const y=H-pad-(v/100)*(H-pad*2);return [x,y];});el('polyline',{points:pts.map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':3,'vector-effect':'non-scaling-stroke'});pts.forEach(p=>el('circle',{cx:p[0],cy:p[1],r:4,fill:color,'vector-effect':'non-scaling-stroke'}));});})();
</script></body></html>`;

fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
fs.writeFileSync(path.join(OUT_DIR, 'data.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary, pages, history }, null, 2));
console.log(`Панель построена из ${reports.length} отчётов Lighthouse для ${pages.length} страниц. Сохранено запусков в истории: ${history.length}.`);
