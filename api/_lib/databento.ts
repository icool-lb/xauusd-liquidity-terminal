// Databento — بيانات عقود الذهب من بورصة CME (GLBX.MDP3) على الخادم فقط
// المفتاح من DATABENTO_API_KEY في Vercel ولا يُعاد في أي استجابة.
// GC.v.0 = العقد الأنشط حجماً (يتبدّل عند التدوير، فتظهر فجوة ~عشرات الدولارات يوم التدوير).
import type { Candle } from '../../src/lib/engine.js';

const BASE = 'https://hist.databento.com/v0/';
export const DB_DATASET = 'GLBX.MDP3';
export const DB_SYMBOL = 'GC.v.0';
const M15 = 900;

export const dbReady = () => !!process.env.DATABENTO_API_KEY;

async function dbGet(path: string, params: Record<string, string>, ms = 40000): Promise<string> {
  const key = process.env.DATABENTO_API_KEY ?? '';
  if (!key) throw Object.assign(new Error('DATABENTO_API_KEY not set'), { status: 500 });
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(BASE + path + '?' + new URLSearchParams(params), {
      headers: { Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64') }, signal: ac.signal,
    });
    const body = await r.text();
    if (!r.ok) {
      // نص الخطأ من Databento لا يحوي المفتاح؛ نقصّه احتياطاً
      throw Object.assign(new Error(`Databento HTTP ${r.status}: ${body.replace(key, '***').slice(0, 240)}`), { status: r.status });
    }
    return body;
  } finally { clearTimeout(t); }
}

const base = (schema: string, start: string, end: string) =>
  ({ dataset: DB_DATASET, symbols: DB_SYMBOL, stype_in: 'continuous', schema, start, end });

export interface DbRange { start: string; end: string; schemaEnd: Record<string, string> }
export async function dbRange(): Promise<DbRange> {
  const j = JSON.parse(await dbGet('metadata.get_dataset_range', { dataset: DB_DATASET }));
  const schemaEnd: Record<string, string> = {};
  for (const [k, v] of Object.entries((j.schema ?? {}) as Record<string, { end?: string }>)) if (v?.end) schemaEnd[k] = v.end;
  return { start: j.start, end: j.end, schemaEnd };
}

/** آخر وقت متاح لهذا المخطط — طلبُ ما بعده يرفضه Databento */
export const availEnd = (r: DbRange, schema: string) => r.schemaEnd[schema] ?? r.end;

export async function dbCost(schema: string, start: string, end: string): Promise<number> {
  return Number(await dbGet('metadata.get_cost', base(schema, start, end))) || 0;
}

// السعر يصل نصاً عشرياً مع pretty_px، أو عدداً صحيحاً × 1e9 بدونه
const px = (s: string) => { const v = Number(s); return v > 1e7 ? v / 1e9 : v; };
const ts = (s: string) => (/^\d+$/.test(s) ? Math.floor(Number(s) / 1e9) : Math.floor(Date.parse(s) / 1000));

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => { const c = l.split(','); const o: Record<string, string> = {}; head.forEach((h, i) => (o[h] = c[i])); return o; });
}

/** شموع الدقيقة ⇐ شموع 15 دقيقة بحجم العقود الحقيقي */
export function to15(rows: Record<string, string>[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const r of rows) {
    const t = ts(r.ts_event), k = Math.floor(t / M15) * M15;
    const o = px(r.open), h = px(r.high), l = px(r.low), c = px(r.close), v = Number(r.volume) || 0;
    if (![o, h, l, c].every(Number.isFinite)) continue;
    const e = map.get(k);
    if (e) { e.high = Math.max(e.high, h); e.low = Math.min(e.low, l); e.close = c; e.volume = (e.volume ?? 0) + v; }
    else map.set(k, { time: k, open: o, high: h, low: l, close: c, volume: v });
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

/** الدلتا لكل 15 دقيقة: B = المشتري هو المنفِّذ العدواني (+)، A = البائع (−) */
export function deltaOf(rows: Record<string, string>[]): Map<number, { buy: number; sell: number }> {
  const m = new Map<number, { buy: number; sell: number }>();
  for (const r of rows) {
    const k = Math.floor(ts(r.ts_event) / M15) * M15, sz = Number(r.size) || 0;
    const e = m.get(k) ?? { buy: 0, sell: 0 };
    if (r.side === 'B') e.buy += sz; else if (r.side === 'A') e.sell += sz;
    m.set(k, e);
  }
  return m;
}

const csvParams = { encoding: 'csv', pretty_px: 'true', pretty_ts: 'true' };
export async function dbM15(start: string, end: string): Promise<Candle[]> {
  return to15(parseCsv(await dbGet('timeseries.get_range', { ...base('ohlcv-1m', start, end), ...csvParams }, 55000)));
}
export async function dbTrades(start: string, end: string) {
  return deltaOf(parseCsv(await dbGet('timeseries.get_range', { ...base('trades', start, end), ...csvParams }, 55000)));
}
