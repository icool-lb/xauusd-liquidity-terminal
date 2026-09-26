// ============================================================
// عميل Databento — بيانات الصفقات المؤسسية (CME Globex GC)
// المفتاح يُحفظ في متصفح المستخدم فقط (localStorage)
// ============================================================

const HIST = 'https://hist.databento.com/v0';
const KEY_LS = 'xau_databento_key';

export function loadDbKey(): string {
  try { return localStorage.getItem(KEY_LS) ?? ''; } catch { return ''; }
}
export function saveDbKey(k: string) {
  try { localStorage.setItem(KEY_LS, k); } catch { /* تجاهل */ }
}

function isLocalDev(): boolean {
  try { return ['localhost', '127.0.0.1'].includes(location.hostname); } catch { return true; }
}

async function dbFetch(path: string, key: string): Promise<Response> {
  // Databento يستخدم HTTP Basic: api_key كاسم مستخدم وكلمة مرور فارغة
  const auth = 'Basic ' + btoa(key + ':');
  if (!isLocalDev()) {
    // عبر وسيط المنصة الخادمي (يتجنب حظر CORS من المتصفح) — المفتاح في الترويسة فقط
    const [p, query] = path.split('?');
    const url = '/api/db-proxy?path=' + encodeURIComponent(p.replace(/^\//, '')) + (query ? '&' + query : '');
    const r = await fetch(url, { headers: { 'x-db-key': key } });
    if (r.ok) return r;
    // إن لم يكن الوسيط متاحاً (بيئة بلا api/) جرّب المباشر كملاذ أخير
  }
  return fetch(HIST + path, { headers: { Authorization: auth } });
}

// تحقق من المفتاح وقائمة مجموعات البيانات المتاحة
export async function checkDbKey(key: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const r = await dbFetch('/datasets.list', key);
    if (r.status === 401 || r.status === 403) return { ok: false, msg: 'المفتاح مرفوض — تحقق منه في لوحة Databento' };
    if (!r.ok) return { ok: false, msg: `خطأ من الخادم (${r.status})` };
    const txt = await r.text();
    const hasGlbx = txt.includes('GLBX');
    return { ok: true, msg: hasGlbx ? 'المفتاح يعمل — مجموعة GLBX (CME) متاحة' : 'المفتاح يعمل' };
  } catch (e) {
    return { ok: false, msg: 'تعذر الوصول لخوادم Databento حتى عبر وسيط المنصة — تحقق من الشبكة وأعد المحاولة' };
  }
}

export interface DbTrade {
  ts: number;      // unix ms
  price: number;   // USD
  size: number;    // عقود
  side: string;    // 'A' عدواني / 'B' ممرِّر
  action: string;  // 'T' ضربة / 'F' ملء
}

// سحب صفقات عقود الذهب GC من CME Globex عبر timeseries.get (ترميز json)
export async function fetchGcTrades(key: string, hoursBack = 3): Promise<DbTrade[]> {
  const end = new Date();
  const start = new Date(end.getTime() - hoursBack * 3600_000);
  const p = new URLSearchParams({
    dataset: 'GLBX.MDP3',
    schema: 'trades',
    symbols: 'GC',
    start: start.toISOString(),
    end: end.toISOString(),
    encoding: 'json',
  });
  const r = await dbFetch('/timeseries.get?' + p.toString(), key);
  if (r.status === 401 || r.status === 403) throw new Error('المفتاح مرفوض');
  if (r.status === 402) throw new Error('رصيد Databento غير كافٍ لسحب هذه البيانات');
  if (!r.ok) throw new Error(`خطأ من Databento (${r.status})`);
  const txt = await r.text();
  const out: DbTrade[] = [];
  for (const line of txt.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const o = JSON.parse(t);
      let price = Number(o.price ?? 0);
      // DBN يعطي السعر بنقطة ثابتة (10^-9) — إن كان خاماً ضخماً قسّمه
      if (price > 1_000_000) price = price / 1e9;
      out.push({
        ts: Math.floor(Number(o.ts_event ?? 0) / 1_000_000),
        price,
        size: Number(o.size ?? 0),
        side: String(o.side ?? ''),
        action: String(o.action ?? ''),
      });
    } catch { /* تجاهل السطر التالف */ }
  }
  return out;
}

// تحليل بصمات الحيتان المؤسسية من صفقات العقود
export interface DbWhaleStats {
  total: number;
  volume: number;
  buyVol: number;   // حجم الضربات الشرائية (ضربات على العرض = مشترٍ عدواني)
  sellVol: number;  // حجم الضربات البيعية
  bigPrints: DbTrade[]; // أكبر 6 صفقات
  window: string;
}

export function analyzeWhales(trades: DbTrade[]): DbWhaleStats {
  let volume = 0, buyVol = 0, sellVol = 0;
  for (const t of trades) {
    volume += t.size;
    // في DBN: side='A' = مشترٍ عدواني ضرب العرض (شراء مبادر)، side='B' = بائع عدواني ضرب الطلب
    if (t.side === 'A') buyVol += t.size; else sellVol += t.size;
  }
  const big = [...trades].sort((a, b) => b.size - a.size).slice(0, 6);
  return { total: trades.length, volume, buyVol, sellVol, bigPrints: big, window: '' };
}
