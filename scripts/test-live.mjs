// اختبار السعر الحي: MetaAPI مُحاكى كما يتصرّف فعلاً — current-candles عالقة على شمعة قديمة، current-price يتحرّك.
// npm run build && NODE_PATH=$(npm root -g) node scripts/test-live.mjs
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = mkdtempSync(join(tmpdir(), 'xau-live-'));
await build({ entryPoints: { engine: 'src/lib/engine.ts' }, bundle: true, platform: 'node', format: 'esm', outdir: out, logLevel: 'error' });
const E = await import(join(out, 'engine.js'));
const now = Math.floor(Date.now() / 1000);
const h15 = E.generateHistory(30, 2650, 31).filter((c) => c.time <= now);
const last = h15[h15.length - 1];
const h1 = []; for (let t = Math.floor(now / 60) * 60 - 600 * 60; t <= now; t += 60) h1.push({ time: t, open: last.close, high: last.close + 1, low: last.close - 1, close: last.close });
let price = last.close; let calls = 0;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = createServer(async (q, r) => { const p = q.url.split('?')[0]; try { const f = join('dist', p === '/' ? 'index.html' : p); const b = await readFile(f); r.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); } }).listen(0);
const port = srv.address().port;
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 400, height: 860 } });
const errs = []; pg.on('pageerror', (e) => errs.push(String(e)));
await pg.route(/agiliumtrade/, async (rt) => {
  const u = new URL(rt.request().url());
  if (u.pathname.endsWith('/candles')) {
    const tf = u.pathname.split('/timeframes/')[1]?.split('/')[0];
    const src = tf === '1m' ? h1 : h15;
    const st = u.searchParams.get('startTime'); const t0 = st ? Date.parse(st) / 1000 : Infinity;
    const arr = src.filter((c) => c.time <= t0).slice(-1000).reverse().map((c) => ({ time: new Date(c.time * 1000).toISOString(), open: c.open, high: c.high, low: c.low, close: c.close, tickVolume: 100 }));
    return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(arr) });
  }
  // مثل MetaAPI الحقيقي: شمعة عالقة من بداية الأسبوع
  if (u.pathname.includes('current-candles')) { const c = h15[0]; return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ time: new Date(c.time * 1000).toISOString(), open: c.open, high: c.high, low: c.low, close: c.close }) }); }
  if (u.pathname.includes('current-price')) { calls++; price += 1.5; return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bid: price, ask: price + 0.1 }) }); }
  return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'DEPLOYED', region: 'new-york' }) });
});
await pg.route(/\/api\//, (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"cfg":{},"rules":[]}' }));
await pg.route((u) => !u.href.startsWith(`http://localhost:${port}`) && !/agiliumtrade/.test(u.href), (rt) => rt.abort());
await pg.addInitScript(() => localStorage.setItem('xau_metaapi_creds', JSON.stringify({ token: 't', accountId: 'a', symbol: 'XAUUSD' })));
await pg.goto(`http://localhost:${port}/`);
await pg.waitForFunction(() => /● مباشر|متصل/.test(document.body.innerText), null, { timeout: 30000 });
const readPx = () => pg.evaluate(() => { const m = document.body.innerText.match(/\b(\d{4}\.\d{2})\b/); return m ? +m[1] : null; });
await pg.waitForTimeout(2500); const p1 = await readPx(); await pg.waitForTimeout(7000); const p2 = await readPx();
let fail = 0; const ok = (c, n, x) => { console.log((c ? '  PASS ' : '  FAIL ') + n + (x !== undefined ? '  → ' + x : '')); if (!c) fail++; };
ok(calls >= 2, 'current-price يُستدعى دورياً', calls);
ok(p1 != null && p2 != null && p2 > p1, 'السعر في الرأس يتحرّك رغم الشمعة العالقة', `${p1} → ${p2}`);
const has1m = await pg.getByRole('button', { name: '1m', exact: true }).count();
ok(has1m === 1, 'زر فريم الدقيقة موجود');
await pg.getByRole('button', { name: '1m', exact: true }).click(); await pg.waitForTimeout(800);
await pg.screenshot({ path: '/tmp/live-1m.png' });
const cH = await pg.$('h2:has-text("مجلس الخبراء")');
if (cH) { await cH.scrollIntoViewIfNeeded(); await pg.screenshot({ path: '/tmp/live-council.png' }); }
// المؤشّر: «بيع» يسار و«شراء» يمين، والنقطة في جهة الميل
const meter = await pg.evaluate(() => {
  const h = [...document.querySelectorAll('h2')].find((x) => /مجلس الخبراء/.test(x.textContent)); const box = h?.closest('section, div')?.parentElement ?? document.body;
  const row = [...box.querySelectorAll('div[dir="ltr"]')].find((d) => /بيع/.test(d.textContent) && /شراء/.test(d.textContent));
  if (!row) return null; const sp = row.querySelectorAll('span'); const L = sp[0].getBoundingClientRect().x, R = sp[sp.length - 1].getBoundingClientRect().x;
  return { left: sp[0].textContent, right: sp[sp.length - 1].textContent, ordered: L < R };
});
ok(meter && meter.left === 'بيع' && meter.right === 'شراء' && meter.ordered, 'مؤشّر المجلس: بيع يسار وشراء يمين', JSON.stringify(meter));
ok(errs.length === 0, 'بلا أخطاء صفحة', errs.join(' | ').slice(0, 300));
await b.close(); srv.close();
console.log(fail ? `\n✗ ${fail} فشل` : '\n✓ السعر الحي وفريم الدقيقة سليمان'); process.exit(fail ? 1 : 0);
