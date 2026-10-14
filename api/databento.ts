// ============================================================
// Databento (عقود الذهب GC من CME) — محمي بـ SCAN_KEY، البيانات للاستعمال الشخصي فقط (ترخيص CME)
// GET /api/databento?key=…&mode=status            ← هل المفتاح يعمل؟ تأخّر البيانات؟ كلفة الطلبات؟
// GET /api/databento?key=…&mode=candles&days=3    ← شموع 15د بحجم حقيقي (+ &delta=1 للدلتا، يومان كحد أقصى)
// GET /api/databento?key=…&mode=bt&days=60        ← باك-تيست الاستراتيجيتين بالحجم الحقيقي وبفلاتر مختلفة
// كل طلب بيانات يُسعَّر أولاً، ويُرفض إن تجاوز &max= دولار (الافتراضي 1$) — حتى لا تصلك فاتورة مفاجئة.
// ============================================================
import { backtestStrats, getEngineCfg } from '../src/lib/engine.js';
import { applyServerConfig } from './_lib/desk.js';
import { availEnd, dbCost, dbM15, dbRange, dbReady, dbTrades, DB_DATASET, DB_SYMBOL } from './_lib/databento.js';

const DAY = 86400;
const iso = (t: number) => new Date(t * 1000).toISOString();

const VARIANTS: [string, Record<string, unknown>][] = [
  ['الإعداد الحالي', {}], ['بلا فلاتر', { sweepVol: 0, momVol: 0, momBias: false }],
  ['حجم السحب ×1.2', { sweepVol: 1.2 }], ['حجم السحب ×1.5', { sweepVol: 1.5 }],
  ['حجم الكسر ×1.1', { momVol: 1.1 }], ['حجم الكسر ×1.3', { momVol: 1.3 }],
  ['زخم مع الافتتاح', { momBias: true }], ['الحجم + الافتتاح', { sweepVol: 1.2, momVol: 1.1, momBias: true }],
  ['موجة كسر ≥ 12$', { momMinLeg: 12 }], ['الزخم معطّل', { momOn: false }],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  const key = String(req.query?.key ?? '');
  if (!process.env.SCAN_KEY || key !== process.env.SCAN_KEY) { res.status(401).json({ ok: false, error: 'invalid key' }); return; }
  if (!dbReady()) { res.status(500).json({ ok: false, error: 'DATABENTO_API_KEY not set' }); return; }
  const mode = String(req.query?.mode ?? 'status');
  const maxUsd = Math.min(20, Math.max(0, Number(req.query?.max ?? 1) || 0));
  try {
    const range = await dbRange();
    const endM = availEnd(range, 'ohlcv-1m'), endT = availEnd(range, 'trades');
    const endS = Math.floor(Date.parse(endM) / 1000);
    const lagMin = Math.round((Date.now() / 1000 - endS) / 60);

    if (mode === 'status') {
      const [c1, c90, t1] = await Promise.all([
        dbCost('ohlcv-1m', iso(endS - DAY), endM), dbCost('ohlcv-1m', iso(endS - 90 * DAY), endM),
        dbCost('trades', iso(Math.floor(Date.parse(endT) / 1000) - DAY), endT),
      ]);
      const last = await dbM15(iso(endS - 3600), endM);
      res.status(200).json({ ok: true, dataset: DB_DATASET, symbol: DB_SYMBOL, availableEnd: endM, lagMinutes: lagMin,
        costUsd: { 'ohlcv-1m · يوم': c1, 'ohlcv-1m · 90 يوماً': c90, 'trades · يوم': t1 }, lastBars: last.slice(-4) });
      return;
    }

    if (mode === 'candles') {
      const days = Math.min(10, Math.max(1, Number(req.query?.days ?? 3) || 3));
      const start = iso(endS - days * DAY);
      const cost = await dbCost('ohlcv-1m', start, endM);
      if (cost > maxUsd) { res.status(402).json({ ok: false, error: 'cost above max', costUsd: cost, maxUsd }); return; }
      const candles = await dbM15(start, endM);
      let delta = false;
      if (String(req.query?.delta ?? '') === '1' && days <= 2) {
        const tEnd = endT, tStart = iso(Math.floor(Date.parse(endT) / 1000) - days * DAY);
        const tc = await dbCost('trades', tStart, tEnd);
        if (tc > maxUsd) { res.status(402).json({ ok: false, error: 'trades cost above max', costUsd: tc, maxUsd }); return; }
        const d = await dbTrades(tStart, tEnd);
        for (const c of candles) { const x = d.get(c.time); if (x) Object.assign(c, { buy: x.buy, sell: x.sell, delta: x.buy - x.sell }); }
        delta = true;
      }
      res.status(200).json({ ok: true, source: 'databento', symbol: DB_SYMBOL, lagMinutes: lagMin, costUsd: cost, delta, candles });
      return;
    }

    if (mode === 'bt') {
      const days = Math.min(120, Math.max(5, Number(req.query?.days ?? 60) || 60));
      const start = iso(endS - (days + 4) * DAY);
      const cost = await dbCost('ohlcv-1m', start, endM);
      if (cost > maxUsd) { res.status(402).json({ ok: false, error: 'cost above max', costUsd: cost, maxUsd }); return; }
      applyServerConfig();
      const candles = (await dbM15(start, endM)).filter((c) => c.time + 900 <= endS);
      const rows = VARIANTS.map(([label, cfg]) => ({ label, cfg, ...backtestStrats(candles, days, cfg) }));
      res.status(200).json({ ok: true, source: 'databento', symbol: DB_SYMBOL, days, candles: candles.length,
        from: iso(candles[0]?.time ?? 0), to: iso(candles[candles.length - 1]?.time ?? 0), costUsd: cost, cfg: getEngineCfg(), rows });
      return;
    }
    res.status(400).json({ ok: false, error: 'mode = status | candles | bt' });
  } catch (e) {
    const status = (e as { status?: number }).status;
    res.status(502).json({ ok: false, error: status === 401 ? 'Databento key rejected' : String((e as Error).message ?? e).slice(0, 300) });
  }
}
