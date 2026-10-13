// ============================================================
// مناطق ذكية ديناميكية: FVG · أوردر بلوك · مجمّعات السيولة (BSL/SSL)
// كل منطقة لها حالة تتحدّث مع كل شمعة: جديدة ← مُختبرة/ممتلئة جزئياً ← مُستهلكة/مكسورة/مسحوبة
// دوال نقية بلا DOM — يستعملها الشارت والشريط ومجلس الخبراء والمهارة
// ============================================================
import type { Candle } from './engine.js';

export function atrOf(c: Candle[], n = 14): number {
  if (c.length < 2) return 1;
  let s = 0, k = 0;
  for (let i = Math.max(1, c.length - n); i < c.length; i++) {
    const p = c[i - 1], x = c[i];
    s += Math.max(x.high - x.low, Math.abs(x.high - p.close), Math.abs(x.low - p.close)); k++;
  }
  return k ? s / k : 1;
}

// ---------- FVG ----------
export interface FvgZone {
  dir: 'up' | 'down';
  t0: number;            // وقت الشمعة الوسطى
  top: number; bottom: number;        // الحدود الأصلية
  remTop: number; remBottom: number;  // الجزء غير الممتلئ بعد
  fill: number;          // 0..1 نسبة الامتلاء
  state: 'fresh' | 'partial' | 'filled';
  tEnd?: number;         // وقت الامتلاء الكامل
  size: number;
}

export function fvgZones(c: Candle[], lookback = 160, minAtr = 0.2): FvgZone[] {
  const out: FvgZone[] = [];
  if (c.length < 5) return out;
  const atr = atrOf(c, 30);
  const start = Math.max(2, c.length - lookback);
  for (let i = start; i < c.length; i++) {
    const a = c[i - 2], b = c[i - 1], d = c[i];
    let z: FvgZone | null = null;
    if (a.high < d.low && d.low - a.high >= minAtr * atr)
      z = { dir: 'up', t0: b.time, top: d.low, bottom: a.high, remTop: d.low, remBottom: a.high, fill: 0, state: 'fresh', size: d.low - a.high };
    if (a.low > d.high && a.low - d.high >= minAtr * atr)
      z = { dir: 'down', t0: b.time, top: a.low, bottom: d.high, remTop: a.low, remBottom: d.high, fill: 0, state: 'fresh', size: a.low - d.high };
    if (!z) continue;
    // تتبّع الامتلاء بعد اكتمال الفجوة
    for (let k = i + 1; k < c.length; k++) {
      const x = c[k];
      if (z.dir === 'up') {
        if (x.low < z.remTop) z.remTop = Math.max(z.bottom, x.low);
      } else if (x.high > z.remBottom) z.remBottom = Math.min(z.top, x.high);
      z.fill = 1 - Math.max(0, z.remTop - z.remBottom) / z.size;
      if (z.fill >= 0.999) { z.state = 'filled'; z.tEnd = x.time; break; }
      if (z.fill > 0.05) z.state = 'partial';
    }
    out.push(z);
  }
  return out;
}

// ---------- أوردر بلوك ----------
export interface ObZone {
  dir: 'up' | 'down';   // up = طلب (شرائي) · down = عرض (بيعي)
  t0: number; top: number; bottom: number;
  state: 'fresh' | 'tested' | 'broken';
  tTest?: number; tEnd?: number;
  strength: number;      // قوة الاندفاع بعده ÷ ATR
}

// آخر شمعة معاكسة قبل اندفاع ≥ 1.5×ATR خلال 3 شموع يغلق خلف طرفها — تعريف ICT العملي
export function orderBlocks(c: Candle[], lookback = 160, impulseAtr = 1.5): ObZone[] {
  const out: ObZone[] = [];
  if (c.length < 8) return out;
  const atr = atrOf(c, 30);
  const start = Math.max(1, c.length - lookback);
  for (let i = start; i < c.length - 3; i++) {
    const o = c[i];
    const nx = c.slice(i + 1, i + 4);
    const bearish = o.close < o.open, bullish = o.close > o.open;
    const hi = Math.max(...nx.map((x) => x.high)), lo = Math.min(...nx.map((x) => x.low));
    let z: ObZone | null = null;
    if (bearish && hi - o.low >= impulseAtr * atr && nx[nx.length - 1].close > o.high)
      z = { dir: 'up', t0: o.time, top: o.high, bottom: o.low, state: 'fresh', strength: (hi - o.low) / atr };
    if (bullish && o.high - lo >= impulseAtr * atr && nx[nx.length - 1].close < o.low)
      z = { dir: 'down', t0: o.time, top: o.high, bottom: o.low, state: 'fresh', strength: (o.high - lo) / atr };
    if (!z) continue;
    if (out.some((q) => q.dir === z!.dir && Math.abs(q.t0 - z!.t0) <= 2 * 900)) continue; // لا تكرار لنفس الاندفاع
    for (let k = i + 4; k < c.length; k++) {
      const x = c[k];
      if (z.dir === 'up') {
        if (x.close < z.bottom) { z.state = 'broken'; z.tEnd = x.time; break; }
        if (x.low <= z.top && z.state === 'fresh') { z.state = 'tested'; z.tTest = x.time; }
      } else {
        if (x.close > z.top) { z.state = 'broken'; z.tEnd = x.time; break; }
        if (x.high >= z.bottom && z.state === 'fresh') { z.state = 'tested'; z.tTest = x.time; }
      }
    }
    out.push(z);
  }
  return out;
}

// ---------- مجمّعات السيولة ----------
export interface LiqPool {
  side: 'BSL' | 'SSL';  // BSL فوق القمم (أوامر وقف البائعين) · SSL تحت القيعان
  price: number; t0: number;
  equal: boolean;       // قمم/قيعان متساوية = سيولة أقوى
  touches: number;
  swept: boolean; tSwept?: number;
}

export function liquidityPools(c: Candle[], lookback = 192, wing = 3): LiqPool[] {
  if (c.length < 2 * wing + 2) return [];
  const atr = atrOf(c, 30), tol = 0.15 * atr;
  const s = c.slice(-lookback);
  const pools: LiqPool[] = [];
  const add = (side: LiqPool['side'], price: number, t0: number) => {
    const q = pools.find((p) => p.side === side && !p.swept && Math.abs(p.price - price) <= tol);
    if (q) { q.touches++; q.equal = true; q.price = side === 'BSL' ? Math.max(q.price, price) : Math.min(q.price, price); return; }
    pools.push({ side, price, t0, equal: false, touches: 1, swept: false });
  };
  for (let i = wing; i < s.length - wing; i++) {
    let h = true, l = true;
    for (let k = 1; k <= wing; k++) {
      if (s[i].high <= s[i - k].high || s[i].high < s[i + k].high) h = false;
      if (s[i].low >= s[i - k].low || s[i].low > s[i + k].low) l = false;
    }
    // تحقّق السحب قبل إضافة محور جديد: أي شمعة بعد المحور تجاوزته
    if (h) add('BSL', s[i].high, s[i].time);
    if (l) add('SSL', s[i].low, s[i].time);
  }
  for (const p of pools) {
    const from = s.findIndex((x) => x.time > p.t0 + wing * 900);
    if (from < 0) continue;
    for (let k = from; k < s.length; k++) {
      if (p.side === 'BSL' ? s[k].high > p.price : s[k].low < p.price) { p.swept = true; p.tSwept = s[k].time; break; }
    }
  }
  return pools;
}

// ---------- ملخص للشريط والخبراء ----------
export interface ZonesSummary {
  atr: number; price: number;
  nearBSL?: LiqPool; nearSSL?: LiqPool;
  nearFvgUp?: FvgZone; nearFvgDown?: FvgZone;
  nearObUp?: ObZone; nearObDown?: ObZone;
  freshFvg: number; freshOb: number; sweptRecent: LiqPool[];
}
export function summarizeZones(c: Candle[]): ZonesSummary | null {
  if (c.length < 20) return null;
  const price = c[c.length - 1].close, atr = atrOf(c, 30);
  const F = fvgZones(c).filter((z) => z.state !== 'filled');
  const O = orderBlocks(c).filter((z) => z.state !== 'broken');
  const L = liquidityPools(c);
  const near = <T,>(arr: T[], key: (t: T) => number) => arr.slice().sort((a, b) => Math.abs(key(a) - price) - Math.abs(key(b) - price))[0];
  const last = c[c.length - 1].time;
  return {
    atr, price,
    nearBSL: near(L.filter((p) => !p.swept && p.price > price), (p) => p.price),
    nearSSL: near(L.filter((p) => !p.swept && p.price < price), (p) => p.price),
    nearFvgUp: near(F.filter((z) => z.dir === 'up' && z.remTop <= price), (z) => z.remTop),
    nearFvgDown: near(F.filter((z) => z.dir === 'down' && z.remBottom >= price), (z) => z.remBottom),
    nearObUp: near(O.filter((z) => z.dir === 'up' && z.top <= price), (z) => z.top),
    nearObDown: near(O.filter((z) => z.dir === 'down' && z.bottom >= price), (z) => z.bottom),
    freshFvg: F.filter((z) => z.state === 'fresh').length,
    freshOb: O.filter((z) => z.state === 'fresh').length,
    sweptRecent: L.filter((p) => p.swept && (p.tSwept ?? 0) >= last - 3 * 900),
  };
}

// ---------- احتمالات تجريبية: أيّ جهة تُكسر أولاً؟ ----------
// لكل يوم سابق: عند نفس ساعة الآن، هل السعر فوق/تحت الافتتاح؟ ثم أيّهما يُكسر أولاً بقية اليوم: قمة اليوم حتى تلك
// الساعة أم قاعه. نعدّ الأيام المشابهة لانحياز اليوم فقط. هذه ترددات تاريخية من بياناتك — لا تنبّؤ.
export interface Odds { upFirst: number; downFirst: number; none: number; n: number; bias: 'above' | 'below' }
export function firstBreakOdds(all: Candle[], now?: number): Odds | null {
  if (all.length < 300) return null;
  const DAY = 86400;
  const t = now ?? all[all.length - 1].time;
  const dayStart = Math.floor(t / DAY) * DAY, sec = t - dayStart;
  const today = all.filter((x) => x.time >= dayStart && x.time <= t);
  if (today.length < 4) return null;
  const bias: Odds['bias'] = today[today.length - 1].close >= today[0].open ? 'above' : 'below';
  const byDay = new Map<number, Candle[]>();
  for (const x of all) { const d = Math.floor(x.time / DAY) * DAY; if (d >= dayStart) continue; (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(x); }
  let up = 0, dn = 0, none = 0;
  for (const [d, cs] of byDay) {
    const before = cs.filter((x) => x.time - d <= sec), after = cs.filter((x) => x.time - d > sec);
    if (before.length < 4 || after.length < 4) continue;
    const b: Odds['bias'] = before[before.length - 1].close >= before[0].open ? 'above' : 'below';
    if (b !== bias) continue;
    const hi = Math.max(...before.map((x) => x.high)), lo = Math.min(...before.map((x) => x.low));
    let res = 0;
    for (const x of after) {
      const u = x.high > hi, d2 = x.low < lo;
      if (u && d2) { res = 0; break; } // الشمعة نفسها كسرت الطرفين — غير محسوم
      if (u) { res = 1; break; } if (d2) { res = -1; break; }
    }
    if (res > 0) up++; else if (res < 0) dn++; else none++;
  }
  const n = up + dn + none;
  if (n < 5) return null;
  return { upFirst: Math.round((up / n) * 100), downFirst: Math.round((dn / n) * 100), none: Math.round((none / n) * 100), n, bias };
}
