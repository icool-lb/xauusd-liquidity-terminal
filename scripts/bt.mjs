// باك-تيست من سطر الأوامر بنفس محرّك المنصة — تستعمله مهارة gold-ai
//   METAAPI_TOKEN=… METAAPI_ACCOUNT_ID=… node scripts/bt.mjs --days 30
//   node scripts/bt.mjs --file candles.json --days 20 [--json]
// candles.json: مصفوفة {time(unix s), open, high, low, close, volume}
import { build } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const days = +arg('days', 30), file = arg('file'), asJson = process.argv.includes('--json');
const out = mkdtempSync(join(tmpdir(), 'xau-bt-'));
await build({ entryPoints: { engine: 'src/lib/engine.ts', mt: 'api/_lib/metaapi.ts' }, bundle: true, platform: 'node', format: 'esm', outdir: out, logLevel: 'error' });
const E = await import(join(out, 'engine.js'));
const M = await import(join(out, 'mt.js'));

let candles;
if (file) candles = JSON.parse(readFileSync(file, 'utf8'));
else {
  const env = M.mtEnv();
  if (!env) { console.error('ضع METAAPI_TOKEN و METAAPI_ACCOUNT_ID أو استعمل --file'); process.exit(2); }
  candles = await M.fetchM15(env, Math.ceil((days + 3) / 10));
}
candles = candles.filter((c) => c.time + 900 <= Date.now() / 1000 + 5);
if (process.env.ENGINE_CFG) E.setEngineCfg(JSON.parse(process.env.ENGINE_CFG));

const V = [
  ['الإعداد الحالي', {}], ['بلا فلاتر', { sweepVol: 0, momVol: 0, momBias: false }], ['حجم السحب ×1.2', { sweepVol: 1.2 }],
  ['حجم السحب ×1.5', { sweepVol: 1.5 }], ['حجم الكسر ×1.1', { momVol: 1.1 }], ['حجم الكسر ×1.3', { momVol: 1.3 }],
  ['زخم مع الافتتاح', { momBias: true }], ['الحجم + الافتتاح', { sweepVol: 1.2, momVol: 1.1, momBias: true }], ['موجة كسر ≥ 12$', { momMinLeg: 12 }],
  ['إشارتا سحب يومياً', { maxSignals: 2 }], ['الزخم معطّل', { momOn: false }],
];
const rows = V.map(([label, cfg]) => ({ label, cfg, ...E.backtestStrats(candles, days, cfg) }));
if (asJson) { console.log(JSON.stringify({ candles: candles.length, days, cfg: E.getEngineCfg(), rows }, null, 2)); process.exit(0); }
const f = (b) => `${b.totalR >= 0 ? '+' : ''}${b.totalR}R (${b.trades}·${b.winRate}%·DD ${b.maxDD})`;
console.log(`${candles.length} شمعة · ${days} يوماً · الإعداد ${JSON.stringify(E.getEngineCfg())}\n`);
for (const r of rows) console.log(`${r.label.padEnd(22)} سحب ${f(r.sweep).padEnd(26)} زخم ${f(r.mom).padEnd(26)} المجموع ${f(r.all)}`);
