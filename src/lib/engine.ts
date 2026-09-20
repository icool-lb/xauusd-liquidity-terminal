// ============================================================
// محرك تحليل سيولة الذهب — Liquidity / ICT Logic Engine
// ============================================================

export interface Candle {
  time: number; // unix seconds (UTC, M15)
  open: number;
  high: number;
  low: number;
  close: number;
}

export type LevelKind = 'ASIA_H' | 'ASIA_L' | 'PDH' | 'PDL' | 'OPEN' | 'SUP' | 'RES';

export interface Level {
  kind: LevelKind;
  label: string;
  price: number;
  swept: boolean;
  sweptAt?: number;
}

export interface SweepEvent {
  time: number;
  levelLabel: string;
  levelPrice: number;
  direction: 'below' | 'above'; // سحب أسفل المستوى أو فوقه
  extreme: number; // قاع/قمة السحب
  penetration: number;
}

export interface Signal {
  id: string;
  time: number;
  side: 'long' | 'short';
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  rr: number;
  reason: string[];
  sweepTime: number;
  chochTime: number;
  status: 'active' | 'tp1' | 'tp2' | 'sl';
  exitPrice?: number;
  pnlR?: number;
}

export interface DayAnalysis {
  dayKey: string;
  candles: Candle[];
  open: number;
  asiaHigh: number;
  asiaLow: number;
  pdh: number;
  pdl: number;
  levels: Level[];
  sweeps: SweepEvent[];
  signals: Signal[];
  bias: 'bullish' | 'bearish' | 'neutral';
  lastPrice: number;
}

// ---------- أدوات ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const M15 = 15 * 60;
const DAY = 24 * 3600;

function utcDayStart(t: number) {
  return Math.floor(t / DAY) * DAY;
}

export function sessionOf(t: number): 'asia' | 'london' | 'ny' | 'off' {
  const h = ((t % DAY) / 3600);
  if (h < 8) return 'asia';
  if (h < 13) return 'london';
  if (h < 21) return 'ny';
  return 'off';
}

// ---------- توليد بيانات واقعية (محاكاة XAUUSD) ----------
// توليد يوم كامل بسيناريو سلوكي: آسيا هادئة، لندن/نيويورك فيها سحب سيولة ثم اتجاه

type Scenario = 'sweep-low-up' | 'sweep-high-down' | 'sweep-both-chop' | 'trend-up' | 'trend-down';

function pickScenario(rnd: () => number): Scenario {
  const r = rnd();
  if (r < 0.30) return 'sweep-low-up';
  if (r < 0.58) return 'sweep-high-down';
  if (r < 0.74) return 'sweep-both-chop';
  if (r < 0.87) return 'trend-up';
  return 'trend-down';
}

export function generateDay(seed: number, dayStart: number, startPrice: number): Candle[] {
  const rnd = mulberry32(seed);
  const scenario = pickScenario(rnd);
  const candles: Candle[] = [];

  let price = startPrice;
  // نطاق آسيا المستهدف
  const asiaRange = 9 + rnd() * 8; // 9-17$
  const asiaAnchor = price;
  let asiaHigh = -Infinity, asiaLow = Infinity;

  // مسار مبسّط: نبني "نقاط طريق" ثم نمشي بينها بعشوائية
  // المراحل: asia (32 شمعة) → london (20) → ny (32) → off (12)
  const wp: { idx: number; price: number }[] = [];
  const dirUp = scenario === 'sweep-low-up' || scenario === 'trend-up';
  const dirDown = scenario === 'sweep-high-down' || scenario === 'trend-down';
  const mainMove = 24 + rnd() * 26; // الحركة الرئيسية 24-50$

  if (scenario === 'sweep-low-up') {
    const sweepDepth = 3 + rnd() * 6;
    wp.push({ idx: 36, price: asiaAnchor - asiaRange / 2 - sweepDepth }); // سحب قاع آسيا
    wp.push({ idx: 52, price: asiaAnchor + asiaRange * 0.4 });
    wp.push({ idx: 80, price: asiaAnchor + mainMove });
    wp.push({ idx: 95, price: asiaAnchor + mainMove + (rnd() - 0.4) * 8 });
  } else if (scenario === 'sweep-high-down') {
    const sweepDepth = 3 + rnd() * 6;
    wp.push({ idx: 36, price: asiaAnchor + asiaRange / 2 + sweepDepth });
    wp.push({ idx: 52, price: asiaAnchor - asiaRange * 0.4 });
    wp.push({ idx: 80, price: asiaAnchor - mainMove });
    wp.push({ idx: 95, price: asiaAnchor - mainMove - (rnd() - 0.4) * 8 });
  } else if (scenario === 'sweep-both-chop') {
    const d1 = 3 + rnd() * 5;
    wp.push({ idx: 34, price: asiaAnchor + asiaRange / 2 + d1 });
    wp.push({ idx: 48, price: asiaAnchor - asiaRange / 2 - d1 });
    wp.push({ idx: 70, price: asiaAnchor + asiaRange / 2 + 2 });
    wp.push({ idx: 95, price: asiaAnchor + (rnd() - 0.5) * 10 });
  } else if (dirUp) {
    wp.push({ idx: 30, price: asiaAnchor - asiaRange * 0.3 });
    wp.push({ idx: 60, price: asiaAnchor + mainMove * 0.6 });
    wp.push({ idx: 95, price: asiaAnchor + mainMove });
  } else if (dirDown) {
    wp.push({ idx: 30, price: asiaAnchor + asiaRange * 0.3 });
    wp.push({ idx: 60, price: asiaAnchor - mainMove * 0.6 });
    wp.push({ idx: 95, price: asiaAnchor - mainMove });
  }

  const targetAt = (i: number): number => {
    // آسيا: تذبذب حول المرساة
    if (i < 32) {
      const w = Math.sin(i / 4.5 + rnd() * 0.5) * (asiaRange / 2) * (0.6 + rnd() * 0.5);
      return asiaAnchor + w;
    }
    // بعد آسيا: استيفاء بين نقاط الطريق
    let prev = { idx: 31, price: asiaAnchor + (rnd() - 0.5) * asiaRange * 0.3 };
    for (const p of wp) {
      if (i <= p.idx) {
        const f = (i - prev.idx) / Math.max(1, p.idx - prev.idx);
        return prev.price + (p.price - prev.price) * f;
      }
      prev = p;
    }
    return wp[wp.length - 1].price;
  };

  for (let i = 0; i < 96; i++) {
    const t = dayStart + i * M15;
    const ses = sessionOf(t);
    const vol = ses === 'asia' ? 1.1 : ses === 'london' ? 2.6 : ses === 'ny' ? 3.0 : 1.2;
    const tgt = targetAt(i);
    const drift = (tgt - price) * 0.35;
    const noise = (rnd() - 0.5) * 2 * vol;
    let open = price;
    let close = price + drift + noise;
    let high = Math.max(open, close) + rnd() * vol * 0.9;
    let low = Math.min(open, close) - rnd() * vol * 0.9;

    if (i < 32) {
      asiaHigh = Math.max(asiaHigh, high);
      asiaLow = Math.min(asiaLow, low);
    } else if (i < 40) {
      // نافذة لندن المبكرة: إجبار فتيل السحب وفق السيناريو
      if (scenario === 'sweep-low-up' && i === 36) {
        low = asiaLow - (3 + rnd() * 5);
        close = asiaLow + 1 + rnd() * 2;
        open = Math.max(open, close) - rnd();
        high = Math.max(open, close) + rnd() * 1.5;
      }
      if (scenario === 'sweep-high-down' && i === 36) {
        high = asiaHigh + (3 + rnd() * 5);
        close = asiaHigh - 1 - rnd() * 2;
        open = Math.min(open, close) + rnd();
        low = Math.min(open, close) - rnd() * 1.5;
      }
      if (scenario === 'sweep-both-chop' && i === 34) {
        high = asiaHigh + (3 + rnd() * 4);
        close = asiaHigh - 1 - rnd() * 2;
        low = Math.min(low, close - rnd() * 2);
      }
      if (scenario === 'sweep-both-chop' && i === 48) {
        low = asiaLow - (3 + rnd() * 4);
        close = asiaLow + 1 + rnd() * 2;
        high = Math.max(high, close + rnd() * 2);
      }
    }

    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    candles.push({ time: t, open: r2(open), high: r2(high), low: r2(low), close: r2(close) });
    price = close;
  }
  return candles;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function generateHistory(days: number, endPrice: number, seedBase: number): Candle[] {
  // نولّد من الأقدم للأحدث؛ نسير عكسياً لضبط سعر النهاية تقريباً
  const now = Math.floor(Date.now() / 1000 / M15) * M15;
  const todayStart = utcDayStart(now);
  const all: Candle[] = [];
  let price = endPrice - 120; // نقطة انطلاق تقريبية
  for (let d = days - 1; d >= 0; d--) {
    const ds = todayStart - d * DAY;
    const dayCandles = generateDay(seedBase + d * 7919, ds, price);
    all.push(...dayCandles);
    price = dayCandles[dayCandles.length - 1].close;
  }
  return all;
}

// ---------- التحليل ----------

function pivots(candles: Candle[], wing: number): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = wing; i < candles.length - wing; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= wing; j++) {
      if (candles[i].high < candles[i - j].high || candles[i].high < candles[i + j].high) isH = false;
      if (candles[i].low > candles[i - j].low || candles[i].low > candles[i + j].low) isL = false;
    }
    if (isH) highs.push(candles[i].high);
    if (isL) lows.push(candles[i].low);
  }
  return { highs, lows };
}

function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length && Math.abs(v - out[out.length - 1]) < tol) {
      out[out.length - 1] = (out[out.length - 1] + v) / 2;
    } else out.push(v);
  }
  return out;
}

export function analyzeDay(all: Candle[], dayStart: number): DayAnalysis | null {
  const dayCandles = all.filter((c) => c.time >= dayStart && c.time < dayStart + DAY);
  if (dayCandles.length < 40) return null;
  const prevCandles = all.filter((c) => c.time >= dayStart - DAY && c.time < dayStart);
  const hist = all.filter((c) => c.time < dayStart);

  const open = dayCandles[0].open;
  const asiaC = dayCandles.filter((c) => sessionOf(c.time) === 'asia');
  const asiaHigh = Math.max(...asiaC.map((c) => c.high));
  const asiaLow = Math.min(...asiaC.map((c) => c.low));
  const pdh = prevCandles.length ? Math.max(...prevCandles.map((c) => c.high)) : asiaHigh + 15;
  const pdl = prevCandles.length ? Math.min(...prevCandles.map((c) => c.low)) : asiaLow - 15;

  // دعوم ومقاومات من قمم/قيعان الأيام السابقة
  const pv = pivots(hist.slice(-96 * 5), 4);
  const sups = cluster(pv.lows.filter((p) => p < open - 4), 4).slice(-3);
  const ress = cluster(pv.highs.filter((p) => p > open + 4), 4).slice(0, 3);

  const levels: Level[] = [
    { kind: 'PDH', label: 'قمة الأمس', price: r2(pdh), swept: false },
    { kind: 'ASIA_H', label: 'قمة آسيا', price: r2(asiaHigh), swept: false },
    { kind: 'OPEN', label: 'الافتتاح اليومي', price: r2(open), swept: false },
    { kind: 'ASIA_L', label: 'قاع آسيا', price: r2(asiaLow), swept: false },
    { kind: 'PDL', label: 'قاع الأمس', price: r2(pdl), swept: false },
    ...ress.map((p, i) => ({ kind: 'RES' as const, label: `مقاومة ${i + 1}`, price: r2(p), swept: false })),
    ...sups.map((p, i) => ({ kind: 'SUP' as const, label: `دعم ${i + 1}`, price: r2(p), swept: false })),
  ];

  // كشف السحب: فتيل يخترق المستوى بعد آسيا ثم إغلاق يعود داخله
  const sweeps: SweepEvent[] = [];
  const post = dayCandles.filter((c) => sessionOf(c.time) !== 'asia');
  const sweepLevels = levels.filter((l) => l.kind !== 'OPEN');
  for (const c of post) {
    for (const lv of sweepLevels) {
      if (lv.swept) continue;
      const isUpper = lv.price > open; // سيولة علوية
      if (isUpper && c.high > lv.price + 0.5 && c.close < lv.price) {
        lv.swept = true; lv.sweptAt = c.time;
        sweeps.push({ time: c.time, levelLabel: lv.label, levelPrice: lv.price, direction: 'above', extreme: c.high, penetration: r2(c.high - lv.price) });
      } else if (!isUpper && c.low < lv.price - 0.5 && c.close > lv.price) {
        lv.swept = true; lv.sweptAt = c.time;
        sweeps.push({ time: c.time, levelLabel: lv.label, levelPrice: lv.price, direction: 'below', extreme: c.low, penetration: r2(lv.price - c.low) });
      }
    }
  }

  // بعد كل سحب: ابحث عن كسر هيكلي (CHoCH) ثم ابنِ الإشارة
  const signals: Signal[] = [];
  const sigCandles = dayCandles;
  for (const sw of sweeps) {
    const startIdx = sigCandles.findIndex((c) => c.time === sw.time);
    if (startIdx < 0) continue;
    const wantLong = sw.direction === 'below'; // سحب قاع → انعكاس صاعد
    // نقطة الهيكل: آخر قمة/قاع ثانوي قرب قاع/قمة السحب
    const lookStart = Math.max(0, startIdx - 4);
    let minorSwing = wantLong ? -Infinity : Infinity;
    for (let i = lookStart; i < startIdx; i++) {
      if (wantLong) minorSwing = Math.max(minorSwing, sigCandles[i].high);
      else minorSwing = Math.min(minorSwing, sigCandles[i].low);
    }
    let chochIdx = -1;
    for (let i = startIdx + 1; i < sigCandles.length; i++) {
      const c = sigCandles[i];
      // حدّث الهيكل بأي قمة/قاع جديد قبل الكسر
      if (i > startIdx + 2) {
        const p = sigCandles[i - 2];
        if (wantLong) minorSwing = Math.max(minorSwing, p.high);
        else minorSwing = Math.min(minorSwing, p.low);
      }
      if (wantLong && c.close > minorSwing) { chochIdx = i; break; }
      if (!wantLong && c.close < minorSwing) { chochIdx = i; break; }
    }
    if (chochIdx < 0) continue;
    const cc = sigCandles[chochIdx];
    const entry = cc.close;
    const buffer = 1.5;
    const stop = wantLong ? sw.extreme - buffer : sw.extreme + buffer;
    const risk = Math.abs(entry - stop);
    if (risk < 2) continue;
    // الأهداف: أقرب سيولة مقابلة لم تُسحب بعد، ثم المستوى التالي
    const fresh = levels.filter((l) => !l.swept);
    const upLevels = fresh.filter((l) => l.price > entry + 3).sort((a, b) => a.price - b.price);
    const dnLevels = fresh.filter((l) => l.price < entry - 3).sort((a, b) => b.price - a.price);
    const tp1 = wantLong ? (upLevels[0]?.price ?? entry + risk * 2) : (dnLevels[0]?.price ?? entry - risk * 2);
    const tp2 = wantLong ? (upLevels[1]?.price ?? entry + risk * 3) : (dnLevels[1]?.price ?? entry - risk * 3);
    const rr = Math.abs(tp1 - entry) / risk;
    if (rr < 1.2) continue;

    const reasons = [
      `سحب سيولة ${sw.levelLabel} (${sw.direction === 'below' ? 'أسفل' : 'فوق'} ${sw.levelPrice})`,
      `كسر هيكلي ${wantLong ? 'صاعد' : 'هابط'} بعد السحب`,
      entry > open ? 'السعر فوق الافتتاح اليومي' : 'السعر تحت الافتتاح اليومي',
    ];

    // محاكاة النتيجة بعد الدخول
    let status: Signal['status'] = 'active';
    let exitPrice: number | undefined;
    let pnlR: number | undefined;
    for (let i = chochIdx + 1; i < sigCandles.length; i++) {
      const c = sigCandles[i];
      if (wantLong) {
        if (c.low <= stop) { status = 'sl'; exitPrice = stop; pnlR = -1; break; }
        if (c.high >= tp2) { status = 'tp2'; exitPrice = tp2; pnlR = r2((tp2 - entry) / risk); break; }
        if (c.high >= tp1) { status = 'tp1'; exitPrice = tp1; pnlR = r2((tp1 - entry) / risk); break; }
      } else {
        if (c.high >= stop) { status = 'sl'; exitPrice = stop; pnlR = -1; break; }
        if (c.low <= tp2) { status = 'tp2'; exitPrice = tp2; pnlR = r2((entry - tp2) / risk); break; }
        if (c.low <= tp1) { status = 'tp1'; exitPrice = tp1; pnlR = r2((entry - tp1) / risk); break; }
      }
    }

    signals.push({
      id: `${dayStart}-${sw.time}`,
      time: cc.time, side: wantLong ? 'long' : 'short',
      entry: r2(entry), stop: r2(stop), tp1: r2(tp1), tp2: r2(tp2),
      rr: r2(rr), reason: reasons, sweepTime: sw.time, chochTime: cc.time,
      status, exitPrice, pnlR,
    });
    break; // إشارة واحدة لكل يوم (قاعدة الانضباط)
  }

  const lastPrice = dayCandles[dayCandles.length - 1].close;
  const bias = lastPrice > open + 2 ? 'bullish' : lastPrice < open - 2 ? 'bearish' : 'neutral';

  return {
    dayKey: new Date(dayStart * 1000).toISOString().slice(0, 10),
    candles: dayCandles, open: r2(open), asiaHigh: r2(asiaHigh), asiaLow: r2(asiaLow),
    pdh: r2(pdh), pdl: r2(pdl), levels, sweeps, signals, bias, lastPrice: r2(lastPrice),
  };
}

export interface BacktestStats {
  days: number;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgRR: number;
  totalR: number;
}

export function backtest(all: Candle[], days: number): BacktestStats {
  const now = Math.floor(Date.now() / 1000 / M15) * M15;
  const todayStart = utcDayStart(now);
  let total = 0, wins = 0, losses = 0, sumR = 0, sumRR = 0;
  for (let d = days; d >= 0; d--) {
    const a = analyzeDay(all, todayStart - d * DAY);
    if (!a) continue;
    for (const s of a.signals) {
      if (s.status === 'active') continue;
      total++;
      sumRR += s.rr;
      sumR += s.pnlR ?? 0;
      if ((s.pnlR ?? 0) > 0) wins++; else losses++;
    }
  }
  return {
    days: days + 1, total, wins, losses,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    avgRR: total ? r2(sumRR / total) : 0,
    totalR: r2(sumR),
  };
}

// ---------- شمعة حية (محاكاة) ----------
export function nextLiveCandle(prev: Candle, rnd: () => number): Candle {
  const vol = 2.2;
  const drift = (rnd() - 0.5) * 2 * vol;
  const open = prev.close;
  const close = open + drift;
  const high = Math.max(open, close) + rnd() * vol * 0.8;
  const low = Math.min(open, close) - rnd() * vol * 0.8;
  return { time: prev.time + M15, open: r2(open), high: r2(high), low: r2(low), close: r2(close) };
}

export function makeRng(seed: number) {
  return mulberry32(seed);
}


// ============================================================
// ترقيات الفريق: FVG، OTE، Kill Zones، إحصاءات متقدمة
// ============================================================

export interface FVG {
  time: number; // بداية الفجوة
  top: number;
  bottom: number;
  dir: 'up' | 'down';
  filled: boolean;
}

// فجوات القيمة العادلة: 3 شموع، فجوة بين فتيل الأولى والثالثة
export function detectFVGs(candles: Candle[], lookback = 60): FVG[] {
  const out: FVG[] = [];
  const start = Math.max(2, candles.length - lookback);
  for (let i = start; i < candles.length; i++) {
    const a = candles[i - 2], c = candles[i];
    if (a.high < c.low) out.push({ time: candles[i - 1].time, top: c.low, bottom: a.high, dir: 'up', filled: false });
    if (a.low > c.high) out.push({ time: candles[i - 1].time, top: a.low, bottom: c.high, dir: 'down', filled: false });
  }
  // هل مُلئت الفجوة لاحقاً؟
  for (const g of out) {
    const idx = candles.findIndex((c) => c.time === g.time);
    for (let i = idx + 2; i < candles.length; i++) {
      if (g.dir === 'up' && candles[i].low <= g.bottom) { g.filled = true; break; }
      if (g.dir === 'down' && candles[i].high >= g.top) { g.filled = true; break; }
    }
  }
  return out;
}

// نطاق التداول + OTE: من طرف السحب إلى الهدف، المنطقة المثلى 62–79%
export interface OTE {
  eq: number;       // 50% خط التوازن
  oteTop: number;   // 62%
  oteBottom: number;// 79%
  premium: boolean; // هل السعر الحالي في منطقة ممتازة أم مخفّضة
}

export function computeOTE(side: 'long' | 'short', extreme: number, target: number, current: number): OTE {
  const range = target - extreme;
  const eq = extreme + range * 0.5;
  const oteTop = extreme + range * 0.62;
  const oteBottom = extreme + range * 0.79;
  // للشراء: الدخول المثالي في "الخصم" تحت التوازن
  const premium = side === 'long' ? current > eq : current < eq;
  return {
    eq: r2(eq),
    oteTop: r2(side === 'long' ? Math.min(oteTop, oteBottom) : Math.max(oteTop, oteBottom)),
    oteBottom: r2(side === 'long' ? Math.max(oteTop, oteBottom) : Math.min(oteTop, oteBottom)),
    premium,
  };
}

// مناطق القتل (UTC): لندن 07–10، نيويورك 12–15
export const KILL_ZONES = [
  { start: 7, end: 10, label: 'KZ لندن' },
  { start: 12, end: 15, label: 'KZ نيويورك' },
];

export function inKillZone(t: number): boolean {
  const h = (t % DAY) / 3600;
  return KILL_ZONES.some((k) => h >= k.start && h < k.end);
}

// ---------- باك تست موسّع: منحنى رأس المال + إحصاءات المستويات ----------
export interface BacktestFull extends BacktestStats {
  curve: { t: number; r: number }[];
  byLevel: { label: string; signals: number; wins: number }[];
  maxDrawdownR: number;
  expectancyR: number;
}

export function backtestFull(all: Candle[], days: number): BacktestFull {
  const now = Math.floor(Date.now() / 1000 / M15) * M15;
  const todayStart = utcDayStart(now);
  let total = 0, wins = 0, losses = 0, sumR = 0, sumRR = 0;
  const curve: { t: number; r: number }[] = [];
  let cum = 0, peak = 0, maxDD = 0;
  const levelAgg = new Map<string, { signals: number; wins: number }>();

  for (let d = days; d >= 0; d--) {
    const a = analyzeDay(all, todayStart - d * DAY);
    if (!a) continue;
    for (const s of a.signals) {
      if (s.status === 'active') continue;
      total++;
      sumRR += s.rr;
      const r = s.pnlR ?? 0;
      sumR += r;
      if (r > 0) wins++; else losses++;
      cum += r;
      peak = Math.max(peak, cum);
      maxDD = Math.max(maxDD, peak - cum);
      curve.push({ t: s.time, r: r2(cum) });
      const key = s.reason[0]?.split('(')[0]?.trim() ?? 'مستوى';
      const agg = levelAgg.get(key) ?? { signals: 0, wins: 0 };
      agg.signals++;
      if (r > 0) agg.wins++;
      levelAgg.set(key, agg);
    }
  }

  return {
    days: days + 1, total, wins, losses,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    avgRR: total ? r2(sumRR / total) : 0,
    totalR: r2(sumR),
    curve,
    byLevel: [...levelAgg.entries()].map(([label, v]) => ({ label, ...v })),
    maxDrawdownR: r2(maxDD),
    expectancyR: total ? r2(sumR / total) : 0,
  };
}
