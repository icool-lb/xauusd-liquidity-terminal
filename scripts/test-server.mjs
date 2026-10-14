// اختبار الماسح وبوت Telegram ومحرّك الاستراتيجيتين — بلا شبكة (fetch مُحاكى)
// node scripts/test-server.mjs
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'xau-'));
await build({ entryPoints: { tvhook: 'api/tv-hook.ts', scan: 'api/scan.ts', telegram: 'api/telegram.ts', engine: 'src/lib/engine.ts', desk: 'api/_lib/desk.ts', dbn: 'api/_lib/databento.ts', dbapi: 'api/databento.ts' },
  bundle: true, platform: 'node', format: 'esm', outdir: out, logLevel: 'error' });
const scan = (await import(join(out, 'scan.js'))).default;
const tg = (await import(join(out, 'telegram.js'))).default;
const E = await import(join(out, 'engine.js'));
const D = await import(join(out, 'desk.js'));

let fail = 0;
const ok = (c, n, x) => { console.log((c ? '  PASS ' : '  FAIL ') + n + (x !== undefined ? '   → ' + x : '')); if (!c) fail++; };

// ---------- بيانات: محاكاة المنصة نفسها + حجم ----------
const DAY = 86400;
const end = Math.floor(Date.UTC(2026, 9, 8, 21, 0) / 1000); // الأربعاء
let hist = E.generateHistory(12, 2650, 77).filter((c) => c.time < end);
let seed = 5; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
hist = hist.map((c) => ({ ...c, volume: Math.round(800 + rnd() * 600 + Math.abs(c.close - c.open) * 120) }));
console.log('candles', hist.length, new Date(hist[0].time * 1000).toISOString(), '→', new Date(hist[hist.length - 1].time * 1000).toISOString());

console.log('\n[1] المحرّك');
const lastDay = Math.floor(hist[hist.length - 1].time / DAY) * DAY;
let anyPending = 0, anyMom = 0, anySweep = 0, scored = true;
for (let d = 0; d < 8; d++) {
  const a = E.analyzeDay(hist, lastDay - d * DAY);
  if (!a) continue;
  anyMom += a.momSignals.length; anySweep += a.signals.length;
  for (const s of [...a.signals, ...a.momSignals]) if (!(s.score >= 0 && s.score <= 100) || !s.kind) scored = false;
  for (const s of a.momSignals) if (s.side === 'long' ? !(s.stop < s.entry && s.tp1 > s.entry) : !(s.stop > s.entry && s.tp1 < s.entry)) scored = false;
}
ok(anySweep + anyMom > 0, 'المحرّك يعطي صفقات سحب وزخم', `سحب ${anySweep} · زخم ${anyMom}`);
ok(scored, 'كل صفقة لها نوع ودرجة 0–100 ووقف/هدف في الجهة الصحيحة');
// أمر معلّق: نقطع اليوم عند كل شمعة ونرى هل يظهر أمر بعد BOS ثم يُعبَّأ
const dayC = hist.filter((c) => c.time >= lastDay - DAY && c.time < lastDay);
const prefix = hist.filter((c) => c.time < lastDay - DAY);
let pendSeen = null, filledAfter = false;
for (let i = 20; i < dayC.length; i++) {
  const a = E.analyzeDay([...prefix, ...dayC.slice(0, i + 1)], lastDay - DAY);
  if (a.momPending && !pendSeen) pendSeen = a.momPending;
  if (pendSeen && a.momSignals.some((s) => s.sweepTime === pendSeen.bosTime)) { filledAfter = true; break; }
}
for (let d = 2; d < 8 && !pendSeen; d++) {
  const ds = lastDay - d * DAY, dc = hist.filter((c) => c.time >= ds && c.time < ds + DAY), pf = hist.filter((c) => c.time < ds);
  for (let i = 20; i < dc.length; i++) { const a = E.analyzeDay([...pf, ...dc.slice(0, i + 1)], ds); if (a.momPending) { pendSeen = a.momPending; break; } }
}
ok(!!pendSeen, 'أمر زخم معلّق يظهر بعد BOS وقبل التعبئة', pendSeen ? `${pendSeen.side} @ ${pendSeen.limit}` : '—');
const base = E.backtestStrats(hist, 7, { sweepVol: 1.2, momVol: 1.1 }), off = E.backtestStrats(hist, 7, { sweepVol: 0, momVol: 0 });
ok(off.all.trades >= base.all.trades, 'إزالة فلاتر الحجم لا تُنقص الصفقات', `${base.all.trades} → ${off.all.trades}`);
ok(E.getEngineCfg().sweepVol === E.DEFAULT_ENGINE_CFG.sweepVol, 'withCfg يعيد الإعداد الأصلي بعد المقارنة');
const novol = hist.map((c) => ({ ...c, volume: 0 }));
ok(E.backtestStrats(novol, 7, { sweepVol: 1.5, momVol: 1.5 }).all.trades === E.backtestStrats(novol, 7, { sweepVol: 0, momVol: 0 }).all.trades, 'بلا حجم من الوسيط ⇐ الفلتر يُتخطّى ولا يمنع الإشارات');
ok(JSON.stringify(E.normalizeCfg({ sweepVol: 99, momWindow: -3 })).includes('"sweepVol":3'), 'normalizeCfg يقصّ القيم الشاذة');

// ---------- محاكاة MetaApi و Telegram ----------
let NOW = end;
const tgSent = [];
global.fetch = async (u, o) => {
  u = String(u);
  if (u.includes('agiliumtrade')) {
    if (o?.headers?.['auth-token'] !== 'MT') return { ok: false, status: 401, json: async () => ({}) };
    const vis = hist.filter((c) => c.time <= NOW).slice(-1000).reverse() // الأحدث أولاً + الشمعة الجارية
      .map((c) => ({ time: new Date(c.time * 1000).toISOString(), open: c.open, high: c.high, low: c.low, close: c.close, tickVolume: c.volume }));
    return { ok: true, json: async () => vis };
  }
  if (u.includes('api.telegram.org')) { const b = JSON.parse(o.body); tgSent.push({ m: u.split('/').pop(), ...b }); return { ok: true, json: async () => ({ ok: true }) }; }
  throw new Error('unexpected ' + u);
};
const mkRes = () => { const r = { code: 0, body: null, h: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.h[k] = v; }; r.end = () => r; return r; };
Object.assign(process.env, { METAAPI_TOKEN: 'MT', METAAPI_ACCOUNT_ID: 'acc', SCAN_KEY: 'sk', TELEGRAM_BOT_TOKEN: 'bt', TELEGRAM_CHAT_ID: '42', TELEGRAM_WEBHOOK_SECRET: 'whsecret123' });

console.log('\n[1ب] المناطق والمجلس');
{
  await build({ entryPoints: { smc: 'src/lib/smc.ts', council: 'src/lib/council.ts', brief: 'src/lib/brief.ts' }, bundle: true, platform: 'node', format: 'esm', outdir: out, logLevel: 'error' });
  const S = await import(join(out, 'smc.js')), C = await import(join(out, 'council.js'));
  // FVG مصطنعة: قفزة ثم عودة تملأ نصفها ثم كلها
  const mk = (t, o, h, l, c) => ({ time: 1758000000 + t * 900, open: o, high: h, low: l, close: c, volume: 100 });
  const base = []; for (let i = 0; i < 40; i++) base.push(mk(i, 100, 101, 99, 100));
  const gap = [...base, mk(40, 100, 101, 99.5, 101), mk(41, 101, 106, 101, 105.5), mk(42, 105.5, 107, 104, 106)];
  let z = S.fvgZones(gap).filter((q) => q.dir === 'up').pop();
  ok(z && z.state === 'fresh' && z.bottom === 101 && z.top === 104, 'FVG صاعدة تُكتشف بحدودها', z && `${z.bottom}-${z.top}`);
  z = S.fvgZones([...gap, mk(43, 106, 106, 102.5, 103)]).filter((q) => q.dir === 'up').pop();
  ok(z.state === 'partial' && Math.abs(z.fill - 0.5) < 0.01 && z.remTop === 102.5, 'دخول السعر يملأها جزئياً ويقلّصها', Math.round(z.fill * 100) + '%');
  z = S.fvgZones([...gap, mk(43, 106, 106, 100.5, 101)]).filter((q) => q.dir === 'up').pop();
  ok(z.state === 'filled' && z.tEnd, 'الامتلاء الكامل يغلقها');
  const pools = S.liquidityPools(hist);
  ok(pools.some((p) => p.side === 'BSL') && pools.some((p) => p.side === 'SSL') && pools.every((p) => !p.swept || p.tSwept > p.t0), 'السيولة BSL/SSL والمسحوبة بعد تكوّنها');
  const obs = S.orderBlocks(hist);
  ok(obs.every((o) => o.top >= o.bottom && o.strength >= 1.5 && (o.state !== 'broken' || o.tEnd)), 'أوردر بلوك: حدود سليمة وقوة ≥ 1.5×ATR', obs.length);
  const odds = S.firstBreakOdds(hist);
  ok(odds === null || Math.abs(odds.upFirst + odds.downFirst + odds.none - 100) <= 2, 'الاحتمالات مجموعها 100%', odds && JSON.stringify(odds));
  const a = E.analyzeDay(hist, lastDay);
  const rd = C.councilRound({ gold: hist, analysis: a, balance: 10000, riskPct: 1 }, hist[hist.length - 1].time + 900);
  ok(rd && rd.msgs.length >= 6 && Math.abs(rd.verdict.score) <= 100 && rd.msgs.every((m) => ['توصية', 'ملاحظة', 'تنبيه', 'اقتراح', 'توجيه'].includes(m.type)), 'جولة المجلس: 6+ رسائل بأنواع صحيحة وقرار ضمن ±100', rd && rd.verdict.text);
  const ids = new Set(rd.msgs.map((m) => m.id));
  ok(ids.size === rd.msgs.length, 'معرّفات رسائل المجلس فريدة');
  const rd2 = C.councilRound({ gold: hist, analysis: a, balance: 10000, riskPct: 1 }, hist[hist.length - 1].time + 900 + 300);
  ok(rd2.slot === rd.slot + 1, 'جولة جديدة كل 5 دقائق');
}

console.log('\n[2] الماسح /api/scan');
let r = mkRes(); await scan({ query: { key: 'bad' }, headers: {} }, r); ok(r.code === 401, 'مفتاح خاطئ ⇐ 401');
// تشغيل كل 15 دقيقة (+2) عبر يومين: كل حدث يُرسل مرة واحدة فقط
const realNow = Date.now; const seen = new Map(); const trades = []; let runs = 0, dup = 0, events = 0;
for (let t = end - 6 * DAY + 120; t <= end; t += 900) {
  NOW = t; Date.now = () => t * 1000;
  r = mkRes(); await scan({ query: { key: 'sk', dry: '1' }, headers: {} }, r); runs++;
  if (r.body?.skipped) continue;
  for (const e of r.body.events) { events++; const k = e.text; if (seen.has(k)) dup++; seen.set(k, t); if (e.type !== 'sweep-watch') trades.push({ t, e }); }
}
Date.now = realNow;
ok(runs > 400 && events > 0, 'الماسح يعمل على 6 أيام من التشغيل كل 15 دقيقة', `${runs} تشغيل · ${events} حدث · ${trades.length} صفقة/أمر`);
ok(trades.length > 0, 'الماسح يلتقط صفقات أو أوامر معلّقة', trades.map((x) => x.e.type).join(','));
ok(dup === 0, 'لا تكرار للتنبيه نفسه بين التشغيلات');
const kinds = [...seen.keys()].map((t) => t.split('\n')[0]);
console.log('     أمثلة:', [...new Set(kinds)].slice(0, 5).join(' | '));
// ماسح غير جاف يرسل فعلاً
NOW = end; Date.now = () => end * 1000; tgSent.length = 0;
const evAt = (trades[0] ?? { t: [...seen.values()][0] }).t; NOW = evAt; Date.now = () => evAt * 1000;
r = mkRes(); await scan({ query: { key: 'sk' }, headers: {} }, r); Date.now = realNow;
ok(r.code === 200 && tgSent.length === r.body.events.length && tgSent.length > 0 && tgSent[0].chat_id === '42' && tgSent[0].parse_mode === 'HTML', 'الإرسال الفعلي إلى Telegram بنفس عدد الأحداث', tgSent.length);
const txt = tgSent.map((x) => x.text).join('\n');
ok(/المدير/.test(txt) && /مدير المخاطر/.test(txt) && /لوت/.test(txt), 'الرسالة فيها رأي الخبراء والمدير واللوت');
ok(!/<(?!\/?(b|i|code)>)/.test(txt), 'وسوم HTML المسموحة فقط (b/i/code)');
Date.now = () => Date.UTC(2026, 9, 10, 12); /* السبت */ r = mkRes(); await scan({ query: { key: 'sk' }, headers: {} }, r); Date.now = realNow;
ok(r.body?.skipped === 'market closed', 'السبت ⇐ السوق مغلق ولا طلب', JSON.stringify(r.body).slice(0, 120));
process.env.METAAPI_TOKEN = 'WRONG'; Date.now = () => end * 1000; r = mkRes(); await scan({ query: { key: 'sk' }, headers: {} }, r); Date.now = realNow;
ok(r.code === 502 && /token rejected/.test(r.body.error), 'توكن MetaApi مرفوض ⇐ رسالة واضحة');
process.env.METAAPI_TOKEN = 'MT';
r = mkRes(); Date.now = () => end * 1000; await scan({ query: {}, headers: { authorization: 'Bearer cs' } }, r); ok(r.code === 401, 'CRON_SECRET غير مضبوط ⇐ Bearer مرفوض');
process.env.CRON_SECRET = 'cs'; r = mkRes(); await scan({ query: {}, headers: { authorization: 'Bearer cs' } }, r); Date.now = realNow;
ok(r.code === 200, 'Vercel Cron بـ Authorization: Bearer CRON_SECRET');

console.log('\n[3] بوت Telegram');
const upd = (chat, text) => ({ message: { chat: { id: chat }, text } });
const post = async (body, secret = 'whsecret123') => { const rr = mkRes(); await tg({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body, query: {} }, rr); return rr; };
r = await post(upd(42, '/status'), 'nope'); ok(r.code === 401, 'سرّ الـ webhook خاطئ ⇐ 401');
tgSent.length = 0; r = await post(upd(999, '/status')); ok(r.code === 200 && tgSent.length === 0, 'محادثة غريبة ⇐ صمت تام');
tgSent.length = 0; await post(upd(999, '/id')); ok(tgSent.length === 1 && tgSent[0].chat_id === 999 && /999/.test(tgSent[0].text), '/id يردّ بالمعرّف حتى لغير المسجّل');
Date.now = () => end * 1000; NOW = end;
for (const c of ['/status', '/levels', '/bt', '/settings', '/crew', '/help', '/scan', '/brief', '/council', '/foo']) {
  tgSent.length = 0; r = await post(upd(42, c));
  ok(r.code === 200 && tgSent.length >= 1 && tgSent.every((x) => x.chat_id === 42), `${c} يردّ`, tgSent[0]?.text.split('\n')[0].slice(0, 60));
}
tgSent.length = 0; await post(upd(42, '/brief'));
const bt = tgSent.map((x) => x.text).join('\n');
ok(/الصورة الآن/.test(bt) && /المناطق|السيولة/.test(bt) && /الاحتمالات/.test(bt) && /المسار المرجّح/.test(bt) && /ليس نصيحة مالية/.test(bt), '/brief فيه الأقسام الستة والتنبيه');
ok(!/<(?!\/?(b|i|code)>)/.test(bt), '/brief بلا وسوم HTML غير مسموحة (النص مُهرَّب)');
tgSent.length = 0; await post(upd(42, '/council'));
const ct = tgSent.map((x) => x.text).join('\n');
ok(/مجلس الخبراء/.test(ct) && (ct.match(/• <b>/g) || []).length >= 6, '/council يعرض جولة كاملة', (ct.match(/• <b>/g) || []).length + ' رسالة');
Date.now = realNow;
tgSent.length = 0; r = mkRes(); await tg({ method: 'GET', headers: { host: 'x.vercel.app' }, query: { key: 'sk', setup: '1' } }, r);
ok(r.body.ok && tgSent.some((x) => x.m === 'setWebhook' && x.url === 'https://x.vercel.app/api/telegram' && x.secret_token === 'whsecret123') && tgSent.some((x) => x.m === 'setMyCommands'), 'الإعداد يسجّل الـ webhook بالسرّ والأوامر');

console.log('\n[4] Webhook من مؤشر TradingView');
{
  const tvh = (await import(join(out, 'tvhook.js'))).default;
  process.env.TV_HOOK_KEY = 'tvk'; tgSent.length = 0;
  const body = { side: 'buy', setup: 'momentum', event: 'pending', price: 4180.5, sl: 4172.5, tp: 4197, lot: 0.12, rr: 2.06, note: 'BOS موجة 16$', ticker: 'XAUUSD' };
  let rr = mkRes(); await tvh({ method: 'POST', query: { key: 'bad' }, body }, rr); ok(rr.code === 401, 'مفتاح خاطئ ⇐ 401');
  rr = mkRes(); await tvh({ method: 'POST', query: { key: 'tvk' }, body: JSON.stringify(body) }, rr);
  const t = tgSent[0]?.text ?? '';
  ok(rr.code === 200 && /أمر زخم معلّق/.test(t) && /4180\.5/.test(t) && /\(8\.00\$\)/.test(t) && /0\.12/.test(t) && /R:R 2\.06/.test(t), 'رسالة TradingView: النوع والدخول والوقف واللوت و R:R', t.split('\n')[0]);
  tgSent.length = 0; rr = mkRes();
  await tvh({ method: 'POST', query: { key: 'tvk' }, body: { side: 'sell', setup: 'manage', event: 'breakeven', price: 4190, sl: 4190, tp: 4170, note: 'الصفقة في ربح 1R', ticker: 'XAUUSD' } }, rr);
  const b = tgSent[0]?.text ?? '';
  ok(rr.code === 200 && /نقل الوقف إلى الدخول/.test(b) && /4190/.test(b), 'تنبيه المدير: نقل الوقف إلى الدخول', b.split('\n')[0]);
}

console.log('\n[5] Databento (fetch مُحاكى)');
{
  const B = await import(join(out, 'dbn.js'));
  const csv = 'ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol\n' +
    '2026-10-14T12:00:00.000000000Z,33,1,1,4170.100000000,4171.000000000,4169.500000000,4170.800000000,120,GC.v.0\n' +
    '2026-10-14T12:14:00.000000000Z,33,1,1,4170.800000000,4173.200000000,4170.000000000,4172.900000000,80,GC.v.0\n' +
    '2026-10-14T12:15:00.000000000Z,33,1,1,4172900000000,4174000000000,4172000000000,4173500000000,50,GC.v.0\n';
  const c = B.to15(B.parseCsv(csv));
  ok(c.length === 2 && c[0].open === 4170.1 && c[0].high === 4173.2 && c[0].close === 4172.9 && c[0].volume === 200 && c[1].close === 4173.5,
    'تجميع الدقيقة ⇐ 15د بالحجم الحقيقي (نص عشري وعدد ×1e9)', JSON.stringify(c[0]));
  const tr = B.deltaOf(B.parseCsv('ts_event,side,size,price\n2026-10-14T12:01:00Z,B,5,4170\n2026-10-14T12:02:00Z,A,3,4169\n2026-10-14T12:16:00Z,A,2,4171\n'));
  const k = Math.floor(Date.parse('2026-10-14T12:00:00Z') / 1000);
  ok(tr.get(k).buy === 5 && tr.get(k).sell === 3 && tr.get(k + 900).sell === 2, 'الدلتا: B شراء عدواني · A بيع عدواني');
  const api = (await import(join(out, 'dbapi.js'))).default;
  const realFetch = globalThis.fetch; const urls = [];
  process.env.SCAN_KEY = process.env.SCAN_KEY || 'sk'; process.env.DATABENTO_API_KEY = 'db-secret-123';
  globalThis.fetch = async (u, o) => {
    urls.push({ u: String(u), auth: o?.headers?.Authorization });
    if (String(u).includes('get_dataset_range')) return new Response(JSON.stringify({ start: '2010-06-06T00:00:00Z', end: '2026-10-14T12:20:00Z', schema: { 'ohlcv-1m': { end: '2026-10-14T12:20:00Z' } } }));
    if (String(u).includes('get_cost')) return new Response('5.25');
    return new Response(csv);
  };
  let r = mkRes(); await api({ query: { key: 'bad' } }, r); ok(r.code === 401, 'Databento: مفتاح خاطئ ⇐ 401');
  r = mkRes(); await api({ query: { key: process.env.SCAN_KEY, mode: 'bt', days: '30' } }, r);
  ok(r.code === 402 && r.body.costUsd === 5.25 && !urls.some((x) => x.u.includes('timeseries')), 'كلفة فوق الحد ⇐ رفض قبل سحب أي بيانات', r.body.error);
  ok(urls.every((x) => x.auth === 'Basic ' + Buffer.from('db-secret-123:').toString('base64')) && !JSON.stringify(r.body).includes('db-secret'), 'المفتاح في ترويسة Basic فقط ولا يظهر في الاستجابة');
  globalThis.fetch = realFetch;
}

console.log(fail ? `\n✗ ${fail} فشل` : '\n✓ كل الاختبارات نجحت');
process.exit(fail ? 1 : 0);
