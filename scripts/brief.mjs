// إيجاز الذهب من سطر الأوامر — تستعمله مهارة gold-ai
//   METAAPI_TOKEN=… METAAPI_ACCOUNT_ID=… [METAAPI_SYMBOL=XAUUSD] node scripts/brief.mjs
//   node scripts/brief.mjs --file candles.json [--silver xag.json] [--eurusd eur.json]
import { build } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
const out = mkdtempSync(join(tmpdir(), 'xau-brief-'));
await build({ entryPoints: { brief: 'src/lib/brief.ts', mt: 'api/_lib/metaapi.ts' }, bundle: true, platform: 'node', format: 'esm', outdir: out, logLevel: 'error' });
const B = await import(join(out, 'brief.js'));
const M = await import(join(out, 'mt.js'));
const load = (f) => (f ? JSON.parse(readFileSync(f, 'utf8')) : undefined);
let gold = load(arg('file')), silver = load(arg('silver')), eurusd = load(arg('eurusd'));
if (!gold) {
  const env = M.mtEnv();
  if (!env) { console.error('ضع METAAPI_TOKEN و METAAPI_ACCOUNT_ID أو استعمل --file'); process.exit(2); }
  const rel = M.relatedSymbols(env);
  [gold, silver, eurusd] = await Promise.all([M.fetchM15(env, 1), M.fetchFirst(env, rel.silver), M.fetchFirst(env, rel.eurusd)]);
}
const now = arg('now') ? +arg('now') : Date.now() / 1000;
console.log(B.goldBrief({ gold, silver, eurusd, balance: +(process.env.ACCOUNT_BALANCE || 10000), riskPct: +(process.env.RISK_PCT || 1), now }));
