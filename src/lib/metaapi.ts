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

// MetaApi غيّرت نطاقاتها بين agiliumtrade.ai و agiliumtrade.agiliumtrade.ai
// لذلك نجرّب الصيغتين تلقائياً حسب ما تصل إليه شبكة المستخدم
const PROV_HOSTS = [
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai',
  'https://mt-provisioning-api-v1.agiliumtrade.ai',
];
const mdHosts = (region: string) => [
  `https://mt-market-data-client-api-v1.${region}.agiliumtrade.agiliumtrade.ai`,
  `https://mt-market-data-client-api-v1.${region}.agiliumtrade.ai`,
];
const clientHosts = (region: string) => [
  `https://mt-client-api-v1.${region}.agiliumtrade.agiliumtrade.ai`,
  `https://mt-client-api-v1.${region}.agiliumtrade.ai`,
];

class NetworkError extends Error {}

async function apiFetch(url: string, token: string) {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'auth-token': token, Accept: 'application/json' } });
  } catch {
    throw new NetworkError(new URL(url).host);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.message || j.error || msg;
    } catch { /* ignore */ }
    if (res.status === 401 || res.status === 403) msg = 'رمز الوصول غير صالح — أنشئ توكناً جديداً من app.metaapi.cloud/token';
    if (res.status === 404) msg = 'الحساب أو الرمز غير موجود — تحقق من Account ID واسم الرمز';
    throw new Error(msg);
  }
  return res.json();
}

// يجرّب المضيفين بالتتابع عند فشل الشبكة فقط، ويرمي أخطاء HTTP مباشرة
async function apiFetchHosts(hosts: string[], path: string, token: string) {
  const attempted: string[] = [];
  for (const h of hosts) {
    try {
      return await apiFetch(h + path, token);
    } catch (e) {
      if (e instanceof NetworkError) {
        attempted.push(h.replace('https://', ''));
        continue;
      }
      throw e;
    }
  }
  throw new Error(
    `تعذّر الوصول إلى خوادم MetaApi (جرّبنا: ${attempted.join(' + ')}). ` +
    'الأسباب المحتملة: حجب الشبكة/VPN، أو مانع إعلانات يحجب الطلبات، أو انقطاع الإنترنت. جرّب شبكة أخرى أو عطّل VPN.'
  );
}

// جلب منطقة الحساب + التحقق من حالته
export async function resolveAccount(creds: MetaApiCreds): Promise<string> {
  const acc = await apiFetchHosts(PROV_HOSTS, `/users/current/accounts/${encodeURIComponent(creds.accountId)}`, creds.token);
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
  volume?: number;
}

function mapCandle(c: RawCandle): Candle {
  return {
    time: Math.floor(new Date(c.time).getTime() / 1000),
    open: c.open, high: c.high, low: c.low, close: c.close,
    volume: c.volume ?? 0,
  };
}

// شموع تاريخية M15 — واجهة MetaApi ترقّم للخلف من startTime:
// نبدأ من الآن ونسحب 1000 شمعة في كل دفعة رجوعاً حتى نغطي المدة المطلوبة
export async function fetchHistory(creds: MetaApiCreds, region: string, days: number, timeframe = '15m'): Promise<Candle[]> {
  const base =
    `/users/current/accounts/${encodeURIComponent(creds.accountId)}` +
    `/historical-market-data/symbols/${encodeURIComponent(creds.symbol)}/timeframes/${timeframe}/candles`;

  const map = (raw: RawCandle[]): Candle[] =>
    raw.map(mapCandle).sort((a, b) => a.time - b.time);

  const target = Date.now() - days * 24 * 3600 * 1000;
  let out: Candle[] = [];
  let from = new Date(); // نبدأ من اللحظة الحالية ونرجع للماضي
  for (let i = 0; i < 12; i++) {
    const chunk = map(await apiFetchHosts(
      mdHosts(region),
      `${base}?startTime=${encodeURIComponent(from.toISOString())}&limit=1000`,
      creds.token
    ));
    const fresh = chunk.filter((c) => !out.length || c.time < out[0].time);
    if (!fresh.length) break;
    out = [...fresh, ...out];
    if (chunk.length < 1000) break; // وصلنا لأقدم ما يتيحه الوسيط
    if (out[0].time * 1000 <= target) break; // غطّينا المدة المطلوبة
    from = new Date((out[0].time - 1) * 1000);
  }

  if (!out.length) {
    throw new Error(`لا توجد بيانات للرمز ${creds.symbol} — جرّب صيغة وسيطك (XAUUSD. / XAUUSD.pro / GOLD)`);
  }
  return out;
}

// الشمعة الحالية (المتكونة الآن)
export async function fetchCurrentCandle(creds: MetaApiCreds, region: string, timeframe = '15m'): Promise<Candle> {
  const url =
    `/users/current/accounts/${encodeURIComponent(creds.accountId)}` +
    `/symbols/${encodeURIComponent(creds.symbol)}/current-candles/${timeframe}`;
  const raw: RawCandle = await apiFetchHosts(clientHosts(region), url, creds.token);
  return mapCandle(raw);
}

// السعر اللحظي (بديل أخف للتحديث)
export async function fetchPrice(creds: MetaApiCreds, region: string): Promise<{ bid: number; ask: number }> {
  const url =
    `/users/current/accounts/${encodeURIComponent(creds.accountId)}` +
    `/symbols/${encodeURIComponent(creds.symbol)}/current-price`;
  return apiFetchHosts(clientHosts(region), url, creds.token);
}
