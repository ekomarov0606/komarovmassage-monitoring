const fs = require('fs');
const path = require('path');

const REPORT_DIR = path.resolve('lhci-reports');
const OUT_DIR = path.resolve('dashboard');

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

function score(v) {
  return typeof v === 'number' ? Math.round(v * 100) : null;
}

function numericAudit(r, id) {
  const v = r.audits?.[id]?.numericValue;
  return typeof v === 'number' ? v : null;
}

function median(values) {
  const a = values.filter((v) => typeof v === 'number').sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function pageLabel(url) {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? 'Главная' : u.pathname.replace(/^\//, '').replace(/\/$/, '') || 'Главная';
  } catch { return url; }
}

const grouped = new Map();
for (const r of reports) {
  const url = r.finalUrl || r.requestedUrl || 'unknown';
  if (!grouped.has(url)) grouped.set(url, []);
  grouped.get(url).push(r);
}

const pages = [...grouped.entries()].map(([url, rs]) => {
  const failedAudits = rs.map((r) => Object.values(r.audits || {}).filter((a) =>
    a && a.scoreDisplayMode !== 'notApplicable' && typeof a.score === 'number' && a.score < 0.9
  ).length);

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
    problems: Math.round(median(failedAudits)),
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
  problems: pages.reduce((n, p) => n + (p.problems || 0), 0),
};

const cls = (v, good = 90, warn = 75) => v == null ? 'neutral' : v >= good ? 'good' : v >= warn ? 'warn' : 'bad';
const fmtMB = (b) => b == null ? '—' : `${(b / 1024 / 1024).toFixed(2)} MB`;
const fmtSec = (ms) => ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`;
const esc = (s) => String(s).replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));

function card(title, value, klass, sub) {
  return `<div class="card ${klass}"><div class="title">${title}</div><div class="value">${value ?? '—'}</div><div class="sub">${sub}</div></div>`;
}

const rows = pages.map((p) => `<tr>
<td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.label)}</a></td>
<td><span class="pill ${cls(p.performance,90,75)}">${p.performance ?? '—'}</span></td>
<td><span class="pill ${cls(p.seo,95,90)}">${p.seo ?? '—'}</span></td>
<td><span class="pill ${cls(p.accessibility,90,80)}">${p.accessibility ?? '—'}</span></td>
<td><span class="pill ${cls(p.bestPractices,90,80)}">${p.bestPractices ?? '—'}</span></td>
<td>${fmtSec(p.lcp)}</td><td>${fmtMB(p.bytes)}</td>
<td><span class="pill ${p.problems === 0 ? 'good' : p.problems <= 3 ? 'warn' : 'bad'}">${p.problems}</span></td>
</tr>`).join('');

const generated = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Riga' });

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Komarov Massage — Site Quality Dashboard</title><style>
:root{color-scheme:light;--bg:#f6f7f8;--panel:#fff;--text:#19211e;--muted:#68716d;--border:#e4e7e5;--good:#159447;--goodbg:#e8f7ee;--warn:#b87900;--warnbg:#fff4d8;--bad:#c43d3d;--badbg:#fdeaea;--accent:#3b624b}*{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--text)}.wrap{max-width:1320px;margin:0 auto;padding:28px}.top{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:24px}.top h1{font-size:30px;margin:0 0 6px}.muted{color:var(--muted);font-size:14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:18px}.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px;min-height:140px}.card .title{font-weight:650}.card .value{font-size:38px;font-weight:750;margin:16px 0 6px}.card .sub{color:var(--muted);font-size:13px}.card.good{border-top:4px solid var(--good)}.card.warn{border-top:4px solid var(--warn)}.card.bad{border-top:4px solid var(--bad)}.card.neutral{border-top:4px solid #a9afac}.panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;overflow:hidden}.panel-head{padding:18px 20px;border-bottom:1px solid var(--border);font-weight:700}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:14px 16px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);background:#fafbfa}a{color:var(--accent);text-decoration:none;font-weight:600}.pill{display:inline-block;min-width:42px;text-align:center;padding:5px 8px;border-radius:999px;font-weight:700}.pill.good{color:var(--good);background:var(--goodbg)}.pill.warn{color:var(--warn);background:var(--warnbg)}.pill.bad{color:var(--bad);background:var(--badbg)}.foot{margin-top:14px;color:var(--muted);font-size:12px}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}.top{align-items:start;flex-direction:column}}@media(max-width:520px){.wrap{padding:16px}.grid{grid-template-columns:1fr 1fr;gap:10px}.card{padding:14px;min-height:124px}.card .value{font-size:30px}.top h1{font-size:24px}}
</style></head><body><main class="wrap"><div class="top"><div><h1>Site Quality Monitoring</h1><div class="muted">komarovmassage.lv · 9 ключевых страниц · медиана из 3 Lighthouse-прогонов</div></div><div class="muted">Обновлено: ${generated} (Рига)</div></div><section class="grid">
${card('Performance', summary.performance, cls(summary.performance,90,75), 'Скорость и эффективность загрузки')}
${card('SEO', summary.seo, cls(summary.seo,95,90), 'Техническая SEO-оптимизация Lighthouse')}
${card('Accessibility', summary.accessibility, cls(summary.accessibility,90,80), 'Доступность интерфейса')}
${card('Best Practices', summary.bestPractices, cls(summary.bestPractices,90,80), 'Качество и технические практики')}
${card('LCP', fmtSec(summary.lcp), summary.lcp <= 2500 ? 'good' : summary.lcp <= 4000 ? 'warn' : 'bad', 'Главный показатель скорости отображения')}
${card('Вес страницы', fmtMB(summary.bytes), summary.bytes <= 2500000 ? 'good' : summary.bytes <= 4000000 ? 'warn' : 'bad', 'Медианный объём загружаемых данных')}
${card('Найдено проблем', summary.problems, summary.problems === 0 ? 'good' : summary.problems <= 10 ? 'warn' : 'bad', 'Аудиты со score ниже 90% по страницам')}
${card('Страниц проверено', pages.length, pages.length === 9 ? 'good' : 'warn', 'RU / LV / EN: главная, сертификаты, выезд')}
</section><section class="panel"><div class="panel-head">Результаты по страницам</div><div class="table-wrap"><table><thead><tr><th>Страница</th><th>Performance</th><th>SEO</th><th>Accessibility</th><th>Best Practices</th><th>LCP</th><th>Вес</th><th>Проблемы</th></tr></thead><tbody>${rows || '<tr><td colspan="8">Нет данных Lighthouse</td></tr>'}</tbody></table></div></section><div class="foot">Пороговые значения: SEO ≥95; Performance ≥80; Accessibility ≥90; Best Practices ≥90; LCP ≤2.5 s; вес страницы ≤4 MB. Dashboard строится автоматически после каждого Lighthouse CI запуска.</div></main></body></html>`;

fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
fs.writeFileSync(path.join(OUT_DIR, 'data.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary, pages }, null, 2));
console.log(`Dashboard built from ${reports.length} Lighthouse reports across ${pages.length} pages.`);
