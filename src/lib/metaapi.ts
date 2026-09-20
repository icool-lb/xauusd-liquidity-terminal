// ============================================================
// ربط MetaApi — بيانات حقيقية من حساب MT4/MT5 الخاص بالمستخدم
// ============================================================
import type { Candle } from './engine';

export interface MetaApiCreds {
  token: string;
  accountId: string;
  symbol: string;
}

const LS_KEY = 'xau_metaapi_creds';
const LS_REGION = 'xau_metaapi_region';

export function loadCreds(): MetaApiCreds | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c.token || !c.accountId) return null;
    return { token: c.token, accountId: c.accountId, symbol: c.symbol || 'XAUUSD' };
  } catch {
    return null;
  }
}

export function saveCreds(c: MetaApiCreds) {
  localStorage.setItem(LS_KEY, JSON.stringify(c));
}

export function loadRegion(): string {
  return localStorage.getItem(LS_REGION) || 'new-york';
}
function saveRegion(r: string) {
  localStorage.setItem(LS_REGION, r);
}

const PROV = 'https://mt-provisioning-api-v1.agiliumtrade.ai';
const mdHost = (region: string) => `https://mt-market-data-client-api-v1.${region}.agiliumtrade.ai`;
const clientHost = (region: string) => `https://mt-client-api-v1.${region}.agiliumtrade.ai`;

async function apiFetch(url: string, token: string) {
  const res = await fetch(url, { headers: { 'auth-token': token, Accept: 'application/json' } });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.message || j.error || msg;
    } catch { /* ignore */ }
    if (res.status === 401 || res.status === 403) msg = 'رمز الوصول غير صالح — تحقق من التوكن';
    if (res.status === 404) msg = 'الحساب أو الرمز غير موجود — تحقق من Account ID واسم الرمز';
    throw new Error(msg);
  }
  return res.json();
}

// جلب منطقة الحساب + التحقق من حالته
export async function resolveAccount(creds: MetaApiCreds): Promise<string> {
  const acc = await apiFetch(`${PROV}/users/current/accounts/${encodeURIComponent(creds.accountId)}`, creds.token);
  if (acc.state !== 'DEPLOYED') {
    throw new Error(`حالة الحساب: ${acc.state} — يجب أن يكون DEPLOYED (فعّله من لوحة MetaApi)`);
  }
  const region: string = acc.region || 'new-york';
  saveRegion(region);
  return region;
}

interface RawCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

function mapCandle(c: RawCandle): Candle {
  return {
    time: Math.floor(new Date(c.time).getTime() / 1000),
    open: c.open, high: c.high, low: c.low, close: c.close,
  };
}

// شموع تاريخية M15 لعدد أيام
export async function fetchHistory(creds: MetaApiCreds, region: string, days: number): Promise<Candle[]> {
  const startTime = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const url =
    `${mdHost(region)}/users/current/accounts/${encodeURIComponent(creds.accountId)}` +
    `/historical-market-data/symbols/${encodeURIComponent(creds.symbol)}` +
    `/timeframes/15m/candles?startTime=${encodeURIComponent(startTime)}&limit=1000`;
  const raw: RawCandle[] = await apiFetch(url, creds.token);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`لا توجد بيانات للرمز ${creds.symbol} — جرّب صيغة وسيطك (XAUUSD. / XAUUSD.pro / GOLD)`);
  }
  return raw.map(mapCandle).sort((a, b) => a.time - b.time);
}

// الشمعة الحالية (المتكونة الآن)
export async function fetchCurrentCandle(creds: MetaApiCreds, region: string): Promise<Candle> {
  const url =
    `${clientHost(region)}/users/current/accounts/${encodeURIComponent(creds.accountId)}` +
    `/symbols/${encodeURIComponent(creds.symbol)}/current-candles/15m`;
  const raw: RawCandle = await apiFetch(url, creds.token);
  return mapCandle(raw);
}

// السعر اللحظي (بديل أخف للتحديث)
export async function fetchPrice(creds: MetaApiCreds, region: string): Promise<{ bid: number; ask: number }> {
  const url =
    `${clientHost(region)}/users/current/accounts/${encodeURIComponent(creds.accountId)}` +
    `/symbols/${encodeURIComponent(creds.symbol)}/current-price`;
  return apiFetch(url, creds.token);
}
