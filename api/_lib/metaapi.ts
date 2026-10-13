// جلب شموع M15 من MetaApi على الخادم — المفاتيح من متغيّرات Vercel فقط
import type { Candle } from '../../src/lib/engine.js';

const hostsFor = (region: string) => [
  `https://mt-market-data-client-api-v1.${region}.agiliumtrade.ai`,
  `https://mt-market-data-client-api-v1.${region}.agiliumtrade.agiliumtrade.ai`,
];

export interface MtEnv { token: string; account: string; symbol: string; region: string }

export function mtEnv(): MtEnv | null {
  const token = process.env.METAAPI_TOKEN ?? '';
  const account = process.env.METAAPI_ACCOUNT_ID ?? '';
  if (!token || !account) return null;
  const region = /^[a-z-]{2,20}$/.test(process.env.METAAPI_REGION ?? '') ? process.env.METAAPI_REGION! : 'new-york';
  const symbol = /^[A-Za-z0-9._#-]{1,32}$/.test(process.env.METAAPI_SYMBOL ?? '') ? process.env.METAAPI_SYMBOL! : 'XAUUSD';
  return { token, account, symbol, region };
}

async function getJSON(url: string, token: string, ms = 9000): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'auth-token': token, Accept: 'application/json' }, signal: ac.signal });
    if (!r.ok) { const e = new Error('MetaApi HTTP ' + r.status) as Error & { status?: number }; e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}

// MetaApi تعيد حتى 1000 شمعة للخلف من startTime. نطلب صفحتين (~20 يوماً) للتحليل والباك-تيست.
type RawC = { time: string; open: number; high: number; low: number; close: number; tickVolume?: number; volume?: number };

export async function fetchM15(env: MtEnv, pages = 1): Promise<Candle[]> {
  const out = new Map<number, Candle>();
  let start: string | null = null;
  let lastErr: unknown = null;
  for (let p = 0; p < pages; p++) {
    let got = null as RawC[] | null;
    for (const h of hostsFor(env.region)) {
      const u = `${h}/users/current/accounts/${encodeURIComponent(env.account)}/historical-market-data/symbols/` +
        `${encodeURIComponent(env.symbol)}/timeframes/15m/candles?limit=1000` + (start ? `&startTime=${encodeURIComponent(start)}` : '');
      try { got = (await getJSON(u, env.token)) as RawC[]; break; } catch (e) {
        lastErr = e;
        if ((e as { status?: number }).status) throw e; // خطأ HTTP حقيقي (401/404) — لا فائدة من المضيف الآخر
      }
    }
    if (!got) throw lastErr ?? new Error('MetaApi unreachable');
    if (!got.length) break;
    for (const k of got) {
      const t = Math.floor(Date.parse(k.time) / 1000);
      if (Number.isFinite(t)) out.set(t, { time: t, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.tickVolume ?? k.volume ?? 0 });
    }
    const oldest = got.reduce((m, k) => (k.time < m ? k.time : m), got[0].time);
    start = new Date(Date.parse(oldest) - 1000).toISOString();
    if (got.length < 1000) break;
  }
  return [...out.values()].sort((a, b) => a.time - b.time);
}
