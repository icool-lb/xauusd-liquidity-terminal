// فحص الواجهة في Chromium مع MetaApi مُحاكى — يلتقط صوراً إلى scripts/shots/
// npm run build && node scripts/ui-smoke.mjs
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright'); // يقبل NODE_PATH لنسخة عامة
const out = mkdtempSync(join(tmpdir(), 'xau-ui-'));
await build({ entryPoints: { engine: 'src/lib/engine.ts' }, bundle: true, platform: 'node', format: 'esm', outdir: out, logLevel: 'error' });
const E = await import(join(out, 'engine.js'));
const now = Math.floor(Date.now() / 1000 / 900) * 900;
let seed = 9; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const hist = E.generateHistory(30, 2650, 31).filter((c) => c.time <= now)
  .map((c) => ({ ...c, volume: Math.round(800 + rnd() * 600 + Math.abs(c.close - c.open) * 120) }));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const srv = createServer(async (q, r) => {
  const p = q.url.split('?')[0];
  try { const f = join('dist', p === '/' ? 'index.html' : p); const b = await readFile(f); r.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); r.end(b); }
  catch { r.writeHead(404); r.end(); }
}).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const pg = await b.newPage({ viewport: { width: 1500, height: 950 }, locale: 'en-US' });
const errs = []; pg.on('pageerror', (e) => errs.push(String(e)));
await pg.route(/agiliumtrade/, async (rt) => {
  const u = new URL(rt.request().url());
  if (u.pathname.endsWith('/candles')) {
    const st = u.searchParams.get('startTime'); const lim = +(u.searchParams.get('limit') || 1000);
    const t0 = st ? Date.parse(st) / 1000 : Infinity;
    const arr = hist.filter((c) => c.time <= t0).slice(-lim).reverse().map((c) => ({ time: new Date(c.time * 1000).toISOString(), open: c.open, high: c.high, low: c.low, close: c.close, tickVolume: c.volume }));
    return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(arr) });
  }
  if (u.pathname.includes('current-candles')) { const c = hist[hist.length - 1]; return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ time: new Date(c.time * 1000).toISOString(), open: c.open, high: c.high, low: c.low, close: c.close, tickVolume: c.volume }) }); }
  if (u.pathname.includes('current-price')) { const c = hist[hist.length - 1]; return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bid: c.close, ask: c.close + 0.2 }) }); }
  return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'DEPLOYED', region: 'new-york' }) });
});
await pg.route((u) => !u.href.startsWith(`http://127.0.0.1:${port}`) && !/agiliumtrade/.test(u.href), (rt) => rt.abort());
await pg.addInitScript(() => localStorage.setItem('xau_metaapi_creds', JSON.stringify({ token: 't', accountId: 'a', symbol: 'XAUUSD' })));
await pg.goto(`http://127.0.0.1:${port}/`);
await pg.waitForFunction(() => /بيانات حقيقية · مباشر/.test(document.body.innerText), null, { timeout: 30000 });
await pg.waitForTimeout(1500);
await mkdir('scripts/shots', { recursive: true });
await pg.screenshot({ path: 'scripts/shots/desktop.png' });
const folds = await pg.$$eval('section button[aria-expanded]', (bs) => bs.map((b) => b.innerText.split('\n')[0] + ':' + b.getAttribute('aria-expanded')));
console.log('folds', folds.join(' | '));
// افتح مختبر السحب والزخم وشغّل المقارنة
await pg.getByRole('button', { name: /مختبر السحب والزخم/ }).click();
await pg.getByRole('button', { name: /شغّل المقارنة/ }).click();
await pg.waitForSelector('text=الإعداد الحالي', { timeout: 60000 });
const lab = await pg.$$eval('table', (ts) => ts.map((t) => t.innerText).find((x) => x.includes('الإعداد الحالي')));
console.log('lab\n' + lab);
await pg.screenshot({ path: 'scripts/shots/lab.png' });
await pg.setViewportSize({ width: 400, height: 860 }); await pg.waitForTimeout(500);
await pg.screenshot({ path: 'scripts/shots/mobile.png' });
console.log('errors', errs.length ? errs.join(' | ') : 'none');
await b.close(); srv.close();
process.exit(errs.length ? 1 : 0);
