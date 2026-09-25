// ============================================================
// محرك تحليل سيولة الذهب — Liquidity / ICT Logic Engine
// ============================================================

export interface Candle {
  time: number; // unix seconds (UTC, M15)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // حجم التيكات من MetaApi
}

export type LevelKind = 'ASIA_H' | 'ASIA_L' | 'PDH' | 'PDL' | 'OPEN' | 'SUP' | 'RES'
  | 'LON_H' | 'LON_L' | 'NY_H' | 'NY_L' | 'LON_C' | 'NY_C';

export type LevelStrength = 'strong' | 'medium' | 'weak';

export interface Level {
  kind: LevelKind;
  label: string;
  price: number;
  swept: boolean;
  sweptAt?: number;
  strength: LevelStrength;
  touches: number;
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
  // قمم وقيعان الجلسات اليومية
  londonHigh: number;
  londonLow: number;
  nyHigh: number;
  nyLow: number;
  // إغلاقات جلسات الأمس (مرجعية)
  prevLondonClose: number;
  prevNyClose: number;
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
  if (dayCandles.length < 10) return null;
  const prevCandles = all.filter((c) => c.time >= dayStart - DAY && c.time < dayStart);
  const hist = all.filter((c) => c.time < dayStart);

  const open = dayCandles[0].open;
  const asiaC = dayCandles.filter((c) => sessionOf(c.time) === 'asia');
  // إذا لم تصلنا شموع آسيا بعد (بيانات محدودة)، نستخدم أقرب تقدير متاح
  const asiaHigh = asiaC.length ? Math.max(...asiaC.map((c) => c.high)) : Math.max(...dayCandles.slice(0, 8).map((c) => c.high));
  const asiaLow = asiaC.length ? Math.min(...asiaC.map((c) => c.low)) : Math.min(...dayCandles.slice(0, 8).map((c) => c.low));
  const pdh = prevCandles.length ? Math.max(...prevCandles.map((c) => c.high)) : asiaHigh + 15;
  const pdl = prevCandles.length ? Math.min(...prevCandles.map((c) => c.low)) : asiaLow - 15;

  // قمم وقيعان جلسات اليوم + إغلاقات جلسات الأمس
  const londonC = dayCandles.filter((c) => sessionOf(c.time) === 'london');
  const nyC = dayCandles.filter((c) => sessionOf(c.time) === 'ny');
  const londonHigh = londonC.length ? Math.max(...londonC.map((c) => c.high)) : NaN;
  const londonLow = londonC.length ? Math.min(...londonC.map((c) => c.low)) : NaN;
  const nyHigh = nyC.length ? Math.max(...nyC.map((c) => c.high)) : NaN;
  const nyLow = nyC.length ? Math.min(...nyC.map((c) => c.low)) : NaN;
  const prevL = prevCandles.filter((c) => sessionOf(c.time) === 'london');
  const prevN = prevCandles.filter((c) => sessionOf(c.time) === 'ny');
  const prevLondonClose = prevL.length ? prevL[prevL.length - 1].close : NaN;
  const prevNyClose = prevN.length ? prevN[prevN.length - 1].close : NaN;

  // دعوم ومقاومات من قمم/قيعان الأيام السابقة
  const pv = pivots(hist.slice(-96 * 5), 4);
  const sups = cluster(pv.lows.filter((p) => p < open - 4), 4).slice(-3);
  const ress = cluster(pv.highs.filter((p) => p > open + 4), 4).slice(0, 3);

  // تقييم قوة المستوى: لمسات تاريخية ×0.8 + أساس السيولة + رقم نفسي صحيح
  const strengthOf = (price: number, isSup: boolean, base: number): Pick<Level, 'strength' | 'touches'> => {
    let touches = 0;
    for (const c of hist) {
      const near = isSup ? c.low : c.high;
      if (Math.abs(near - price) <= 2.5) touches++;
    }
    let score = base + touches * 0.8;
    if (Math.abs(price % 10) < 1.2 || Math.abs(price % 50) < 2) score += 0.5;
    return { strength: score >= 3 ? 'strong' : score >= 1.5 ? 'medium' : 'weak', touches };
  };
  const mk = (kind: LevelKind, label: string, price: number, base: number, isSup: boolean): Level => ({
    kind, label, price: r2(price), swept: false, ...strengthOf(price, isSup, base),
  });

  const levels: Level[] = [
    mk('PDH', 'قمة الأمس', pdh, 2, false),
    mk('ASIA_H', 'قمة آسيا', asiaHigh, 1.5, false),
    mk('OPEN', 'الافتتاح اليومي', open, 1, false),
    mk('ASIA_L', 'قاع آسيا', asiaLow, 1.5, true),
    mk('PDL', 'قاع الأمس', pdl, 2, true),
    ...ress.map((p, i) => mk('RES', `مقاومة ${i + 1}`, p, 0.5, false)),
    ...sups.map((p, i) => mk('SUP', `دعم ${i + 1}`, p, 0.5, true)),
  ];
  if (Number.isFinite(londonHigh)) levels.push(mk('LON_H', 'قمة لندن', londonHigh, 1, false));
  if (Number.isFinite(londonLow)) levels.push(mk('LON_L', 'قاع لندن', londonLow, 1, true));
  if (Number.isFinite(nyHigh)) levels.push(mk('NY_H', 'قمة نيويورك', nyHigh, 1, false));
  if (Number.isFinite(nyLow)) levels.push(mk('NY_L', 'قاع نيويورك', nyLow, 1, true));
  if (Number.isFinite(prevLondonClose)) levels.push(mk('LON_C', 'إغلاق لندن أمس', prevLondonClose, 1, false));
  if (Number.isFinite(prevNyClose)) levels.push(mk('NY_C', 'إغلاق نيويورك أمس', prevNyClose, 1, false));

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
    // قاعدة الافتتاح: أسفل الافتتاح سلبي (لا شراء تحته)، وفوقه إيجابي (لا بيع فوقه)
    if (wantLong && entry < open - 2) continue;
    if (!wantLong && entry > open + 2) continue;
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
      entry > open
        ? 'التداول فوق الافتتاح = إيجابي (موافق للقاعدة)'
        : 'التداول أسفل الافتتاح = سلبي (موافق للقاعدة)',
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
    pdh: r2(pdh), pdl: r2(pdl),
    londonHigh: r2(londonHigh), londonLow: r2(londonLow), nyHigh: r2(nyHigh), nyLow: r2(nyLow),
    prevLondonClose: r2(prevLondonClose), prevNyClose: r2(prevNyClose),
    levels, sweeps, signals, bias, lastPrice: r2(lastPrice),
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


// ---------- تجميع الشموع لفريمات أعلى ----------
export function aggregate(candles: Candle[], seconds: number): Candle[] {
  if (seconds <= 900) return candles;
  const map = new Map<number, Candle>();
  for (const c of candles) {
    const k = Math.floor(c.time / seconds) * seconds;
    const e = map.get(k);
    if (e) {
      e.high = Math.max(e.high, c.high);
      e.low = Math.min(e.low, c.low);
      e.close = c.close;
    } else {
      map.set(k, { time: k, open: c.open, high: c.high, low: c.low, close: c.close });
    }
  }
  return [...map.values()];
}

export function utcDayStartOf(t: number) {
  return utcDayStart(t);
}


// ---------- كشف الهيكل التلقائي: BOS / CHoCH ----------
export interface StructMark {
  time: number;
  price: number;
  kind: 'BOS' | 'CHoCH';
  dir: 'up' | 'down';
}

export function detectStructure(candles: Candle[], wing = 3): StructMark[] {
  const marks: StructMark[] = [];
  let trend = 0; // 1 صاعد، -1 هابط
  let lastPH = NaN, lastPL = NaN;
  let lastPHtime = 0, lastPLtime = 0;
  for (let i = wing; i < candles.length; i++) {
    // قمة/قاع محوري مؤكد (ننظر wing شموع للخلف)
    const j = i - wing;
    let isPH = true, isPL = true;
    for (let k = j - wing; k <= j + wing; k++) {
      if (k < 0 || k >= candles.length || k === j) continue;
      if (candles[k].high > candles[j].high) isPH = false;
      if (candles[k].low < candles[j].low) isPL = false;
    }
    if (isPH) { lastPH = candles[j].high; lastPHtime = candles[j].time; }
    if (isPL) { lastPL = candles[j].low; lastPLtime = candles[j].time; }

    const c = candles[i];
    if (!isNaN(lastPH) && lastPHtime < c.time && c.close > lastPH && candles[i - 1].close <= lastPH) {
      const kind = trend === -1 ? 'CHoCH' : 'BOS';
      marks.push({ time: c.time, price: lastPH, kind, dir: 'up' });
      trend = 1;
      lastPH = NaN;
    }
    if (!isNaN(lastPL) && lastPLtime < c.time && c.close < lastPL && candles[i - 1].close >= lastPL) {
      const kind = trend === 1 ? 'CHoCH' : 'BOS';
      marks.push({ time: c.time, price: lastPL, kind, dir: 'down' });
      trend = -1;
      lastPL = NaN;
    }
  }
  return marks;
}

// ---------- مناطق السيولة التلقائية (فوق القمم / تحت القيعان) ----------
export interface LiqZone {
  top: number;
  bottom: number;
  side: 'buy' | 'sell';
  label: string;
  from: number;
  to?: number;
}

export function autoLiquidityZones(a: DayAnalysis): LiqZone[] {
  const zones: LiqZone[] = [];
  const t0 = a.candles[0]?.time ?? 0;
  const tEnd = a.candles[a.candles.length - 1]?.time ?? t0;
  const depth = 4; // عمق المنطقة بالدولار فوق/تحت المستوى
  const mk = (price: number, side: 'buy' | 'sell', label: string, kind: LevelKind) => {
    if (!Number.isFinite(price)) return;
    const lv = a.levels.find((l) => l.kind === kind);
    zones.push({
      top: side === 'buy' ? price + depth : price,
      bottom: side === 'buy' ? price : price - depth,
      side, label, from: t0,
      to: lv?.swept && lv.sweptAt ? lv.sweptAt : tEnd + 4 * 3600,
    });
  };
  mk(a.pdh, 'buy', 'سيولة شرائية — فوق قمة الأمس', 'PDH');
  mk(a.asiaHigh, 'buy', 'سيولة شرائية — فوق قمة آسيا', 'ASIA_H');
  mk(a.pdl, 'sell', 'سيولة بيعية — تحت قاع الأمس', 'PDL');
  mk(a.asiaLow, 'sell', 'سيولة بيعية — تحت قاع آسيا', 'ASIA_L');
  return zones;
}

// ---------- كشف الأوردر بلوك (Order Blocks) تلقائياً ----------
// القاعدة ICT: آخر شمعة معاكسة قبل حركة كاسرة للهيكل (BOS/CHoCH)
export interface OrderBlock {
  time: number;
  top: number;
  bottom: number;
  dir: 'up' | 'down'; // up = بلوك شرائي، down = بلوك بيعي
  kind: string;       // BOS أو CHoCH التي ولّدته
  to?: number;        // متى لامسه السعر مجدداً (تُوقف المنطقة عنده)
  broken: boolean;    // اخترقه إغلاق → استُهلك ولا يُرسم
}

export function detectOrderBlocks(candles: Candle[], lookback = 200): OrderBlock[] {
  const out: OrderBlock[] = [];
  const start = Math.max(0, candles.length - lookback);
  const marks = detectStructure(candles, 3);

  for (const m of marks) {
    const bi = candles.findIndex((c) => c.time >= m.time);
    if (bi < start + 2) continue;
    // آخر شمعة معاكسة للاتجاه خلال 12 شمعة قبل الكسر
    let j = -1;
    for (let i = bi - 1; i >= Math.max(start, bi - 12); i--) {
      const c = candles[i];
      if (m.dir === 'up' && c.close < c.open) { j = i; break; }
      if (m.dir === 'down' && c.close > c.open) { j = i; break; }
    }
    if (j < 0) continue;
    const c = candles[j];
    const ob: OrderBlock = { time: c.time, top: c.high, bottom: c.low, dir: m.dir, kind: m.kind, broken: false };
    // تتبّع ما بعد الكسر: أول لمسة تُوقف المنطقة، وإغلاق خلالها يستهلكها
    for (let i = bi; i < candles.length; i++) {
      const cc = candles[i];
      if (m.dir === 'up') {
        if (cc.close < ob.bottom) { ob.broken = true; break; }
        if (cc.low <= ob.top) { ob.to = cc.time; break; }
      } else {
        if (cc.close > ob.top) { ob.broken = true; break; }
        if (cc.high >= ob.bottom) { ob.to = cc.time; break; }
      }
    }
    // إلغاء التكرار: تجاهل بلوك متراكب مع السابق من نفس الاتجاه
    const prev = out[out.length - 1];
    if (prev && prev.dir === ob.dir && prev.bottom < ob.top && ob.bottom < prev.top && Math.abs(prev.time - ob.time) < 4 * 3600) {
      continue;
    }
    out.push(ob);
  }
  return out.slice(-10); // آخر 10 بلوكات فقط حفاظاً على وضوح الشارت
}

// ============================================================
// V16: الحيتان + الأخبار + تحليل الشروط (استراتيجيات المنصات)
// ============================================================

export interface WhalePrint {
  time: number;
  price: number;
  side: 'شراء عدواني' | 'بيع عدواني';
  range: number;      // مدى الشمعة $
  volume: number;     // حجم التيكات
  rangeX: number;     // مضاعف متوسط المدى
  volX: number;       // مضاعف متوسط الحجم
  score: number;      // مركّب
}

// رصد بصمات الحيتان: شمعة مداها وحجمها أعلى من المعتاد بشكل واضح
export function detectWhales(candles: Candle[], lookback = 96): WhalePrint[] {
  if (candles.length < 30) return [];
  const n = candles.length;
  const start = Math.max(1, n - lookback - 20);
  const base = candles.slice(Math.max(0, n - lookback - 96), start + 20);
  const avgRange = base.reduce((a, c) => a + (c.high - c.low), 0) / base.length;
  const withVol = base.filter((c) => c.volume && c.volume > 0);
  const avgVol = withVol.length ? withVol.reduce((a, c) => a + (c.volume ?? 0), 0) / withVol.length : 0;
  const out: WhalePrint[] = [];
  for (let i = Math.max(start, n - lookback); i < n; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    const vol = c.volume ?? 0;
    const rangeX = avgRange > 0 ? range / avgRange : 0;
    const volX = avgVol > 0 ? vol / avgVol : 0;
    const volOk = avgVol === 0 || volX >= 1.8;
    if (rangeX >= 1.8 && volOk) {
      out.push({
        time: c.time,
        price: c.close,
        side: c.close >= c.open ? 'شراء عدواني' : 'بيع عدواني',
        range: range,
        volume: vol,
        rangeX, volX,
        score: rangeX * volX,
      });
    }
  }
  return out.slice(-8);
}

// ---------- وحدة الأخبار الاقتصادية والجيوسياسية ----------

export type NewsImpact = 'high' | 'medium' | 'low';

export interface NewsEvent {
  id: string;
  time: number;        // unix seconds UTC
  title: string;
  currency: string;    // USD / XAU / ALL
  impact: NewsImpact;
  forecast: string;
  previous: string;
  actual?: string;
  outcome?: 'صعود' | 'هبوط' | 'ثبات';
  outcomeMove?: number; // حركة الذهب بعده بالدولار
}

export const NEWS_PRESETS: { title: string; currency: string; impact: NewsImpact; forecast: string; previous: string }[] = [
  { title: 'تقرير التوظيف الأمريكي NFP', currency: 'USD', impact: 'high', forecast: '', previous: '' },
  { title: 'مؤشر أسعار المستهلك CPI', currency: 'USD', impact: 'high', forecast: '', previous: '' },
  { title: 'قرار الفائدة الفيدرالي FOMC + مؤتمر باول', currency: 'USD', impact: 'high', forecast: '', previous: '' },
  { title: 'محضر اجتماع الفيدرالي', currency: 'USD', impact: 'medium', forecast: '', previous: '' },
  { title: 'مؤشر أسعار المنتجين PPI', currency: 'USD', impact: 'medium', forecast: '', previous: '' },
  { title: 'مبيعات التجزئة', currency: 'USD', impact: 'medium', forecast: '', previous: '' },
  { title: 'خطاب باول / مسؤولي الفيدرالي', currency: 'USD', impact: 'high', forecast: '', previous: '' },
  { title: 'أزمة جيوسياسية (توترات/حرب/عقوبات)', currency: 'ALL', impact: 'high', forecast: '', previous: '' },
];

// توقع تأثير الخبر على الذهب وفق طبيعته
export function newsImpactNote(ev: NewsEvent): { move: string; dir: string; note: string } {
  const t = ev.title;
  if (/NFP|توظيف|CPI|فائدة|FOMC|باول/.test(t)) {
    return {
      move: 'حركة متوقعة 15–30$ خلال أول 15 دقيقة',
      dir: 'ثنائية الاتجاه — انعكاسات حادة شائعة',
      note: 'الدولار يتحرك عكس الذهب غالباً. الأرقام الأقوى من المتوقع = ضغط على الذهب أولاً، ثم قد ينعكس بعد امتصاص السيولة.',
    };
  }
  if (/جيوسياسية|حرب|توترات|عقوبات|أزمة/.test(t)) {
    return {
      move: 'حركة متوقعة 10–25$ وقد تمتد',
      dir: 'صعود الذهب (ملاذ آمن) في التصعيد، وتراجعه عند التهدئة',
      note: 'الذهب يرتفع مع تصاعد التوتر ويهبط مع الإعلان عن تهدئة أو اتفاق. الفتيل الطويل فوق القمة = سيولة تُمتص ثم يكمل الصعود.',
    };
  }
  return {
    move: 'حركة متوقعة 8–15$',
    dir: 'محدودة الاتجاه',
    note: 'راقب هل تؤكد الحركة اتجاه اليوم أم تعكسه — لا تخترق السوق قبل شمعة إغلاق كاملة بعد الخبر.',
  };
}

// توصية اللوت لاستغلال الخبر وفق قاعدة المخاطرة
// 0.01 لوت على الذهب = 1$ ربح لكل 1$ حركة
export function newsLotSuggestion(balance: number, riskPct: number, stopDistance: number): { lot: number; riskUsd: number; target10: number } {
  const riskUsd = balance * (riskPct / 100);
  const raw = stopDistance > 0 ? riskUsd / stopDistance : 0;
  const lot = Math.max(0.01, Math.floor(raw * 100) / 100);
  // عدد الدولارات حركة مطلوبة لتحقيق 10$ على هذا اللوت
  const target10 = lot > 0 ? 10 / lot : 0;
  return { lot, riskUsd, target10 };
}

// ---------- محلل الشروط: أي شروط المؤشرات نجحت على بياناتك؟ ----------

export interface ConditionStat {
  name: string;
  hits: number;
  winRate: number;   // % إغلاقات مربحة خلال 8 شمعات لاحقة
  avgMove: number;   // متوسط الحركة اللاحقة $
}

// يقيس نجاح شروط شائعة من عالم المؤشرات/الاستراتيجيات على بيانات المنصة الفعلية
export function analyzeConditions(candles: Candle[], lookback = 480): ConditionStat[] {
  if (candles.length < 60) return [];
  const n = candles.length;
  const start = Math.max(30, n - lookback);
  const closes = candles.map((c) => c.close);

  const rsi = (i: number, period = 14): number => {
    let g = 0, l = 0;
    for (let k = i - period; k < i; k++) {
      const d = closes[k] - closes[k - 1];
      if (d >= 0) g += d; else l -= d;
    }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  };

  const stats = (name: string, cond: (i: number) => boolean): ConditionStat => {
    let hits = 0, wins = 0, sum = 0;
    for (let i = start; i < n - 8; i++) {
      if (!cond(i)) continue;
      hits++;
      const fwd = candles[i + 8].close - candles[i].close;
      sum += fwd;
      if (Math.abs(fwd) > 3) wins++; // حركة ≥ 3$ خلال ساعتين = فرصة قابلة للتداول
    }
    return { name, hits, winRate: hits ? Math.round((wins / hits) * 100) : 0, avgMove: hits ? +(sum / hits).toFixed(1) : 0 };
  };

  const ema = (i: number, period: number): number => {
    const k = 2 / (period + 1);
    let e = closes[Math.max(0, i - period * 3)];
    for (let j = Math.max(1, i - period * 3); j <= i; j++) e = closes[j] * k + e * (1 - k);
    return e;
  };

  return [
    stats('RSI(14) < 30 (تشبع بيعي)', (i) => rsi(i) < 30),
    stats('RSI(14) > 70 (تشبع شرائي)', (i) => rsi(i) > 70),
    stats('تقاطع EMA9 فوق EMA21', (i) => ema(i, 9) > ema(i, 21) && ema(i - 1, 9) <= ema(i - 1, 21)),
    stats('تقاطع EMA9 تحت EMA21', (i) => ema(i, 9) < ema(i, 21) && ema(i - 1, 9) >= ema(i - 1, 21)),
    stats('شمعة خارج Kill Zone + اندفاع', (i) => {
      const c = candles[i];
      return !inKillZone(c.time) && (c.high - c.low) > 5;
    }),
    stats('كسر قمة 8 شمعات (زخم)', (i) => candles[i].close > Math.max(...candles.slice(i - 8, i).map((c) => c.high))),
    stats('كسر قاع 8 شمعات (زخم)', (i) => candles[i].close < Math.min(...candles.slice(i - 8, i).map((c) => c.low))),
  ].filter((c) => c.hits >= 3).sort((x, y) => y.winRate - x.winRate);
}

// ---------- توقعات لينا حداد: نتيجة الخبر وتأثيره من حالة السوق ----------

export interface NewsCtx {
  bias: 'bullish' | 'bearish' | 'neutral';
  h1Bias: 'bullish' | 'bearish' | 'neutral';
  lastPrice: number;
  open: number;          // افتتاح اليوم
  lastWhaleSide?: string; // آخر بصمة حوت من الرصد المحلي
  nearLiquidity?: string; // أقرب سيولة غير ممسوحة
}

export interface NewsForecast {
  lean: string;              // الأرجح
  leanSide: 'up' | 'down' | 'two-way';
  scenarios: { cond: string; move: string; prob: number }[];
  marketNote: string;        // لماذا: بناءً على حالة السوق
  advice: string;            // خطة التنفيذ
}

export function forecastNews(ev: NewsEvent, ctx: NewsCtx | null): NewsForecast {
  const t = ev.title;
  const state: string[] = [];
  if (ctx) {
    state.push(ctx.lastPrice > ctx.open ? `الذهب فوق افتتاح اليوم (${fmt2(ctx.open)})` : `الذهب أسفل افتتاح اليوم (${fmt2(ctx.open)})`);
    state.push(ctx.h1Bias === 'bullish' ? 'زخم H1 صاعد' : ctx.h1Bias === 'bearish' ? 'زخم H1 هابط' : 'H1 بدون اتجاه');
    if (ctx.lastWhaleSide) state.push(`آخر بصمة رصدها جيك: ${ctx.lastWhaleSide}`);
    if (ctx.nearLiquidity) state.push(`السعر قريب من سيولة: ${ctx.nearLiquidity}`);
  }
  const marketNote = state.length ? 'حالة السوق الآن: ' + state.join(' — ') : 'بانتظار بيانات السوق المباشرة للدمج في التوقع.';

  const isUsdHigh = ev.currency === 'USD' && ev.impact === 'high' && /NFP|توظيف|CPI|فائدة|FOMC|باول/.test(t);
  const isFomc = /FOMC|فائدة/.test(t);
  const isGeo = /جيوسياسية|حرب|توترات|عقوبات|أزمة/.test(t);

  // ميل السوق الداخلي: هل الذهب في زخم صاعد قوي داخل الخبر؟
  const strongUp = ctx ? ctx.bias === 'bullish' && ctx.h1Bias === 'bullish' && ctx.lastPrice > ctx.open : false;
  const strongDown = ctx ? ctx.bias === 'bearish' && ctx.h1Bias === 'bearish' && ctx.lastPrice < ctx.open : false;

  if (isFomc) {
    return {
      lean: strongUp ? 'الأرجح: رد فعل هابط أولي مهما كانت النبرة، ثم امتصاص وعودة للاتجاه الصاعد' : strongDown ? 'الأرجح: ارتداد صاعد سريع يُباع — الاتجاه الهابط أقوى' : 'الأرجح: تذبذب عرضي حاد في أول 30 دقيقة ثم كسر واضح',
      leanSide: strongUp ? 'up' : strongDown ? 'down' : 'two-way',
      scenarios: [
        { cond: 'تصريحات متشددة + رفع/تمسك بالفائدة', move: 'هبوط 15–30$ خلال 15 دقيقة', prob: 35 },
        { cond: 'تصريحات متحفظة/مائلة للتيسير', move: 'صعود 15–30$ وقد يتجاوز قمة اليوم', prob: 35 },
        { cond: 'نبرة محايدة', move: 'تذبذب 10$ عرضياً ثم استكمال الاتجاه السائد', prob: 30 },
      ],
      marketNote,
      advice: 'لا دخول قبل مؤتمر باول. انتظر أول شمعة 15 دقيقة بعد التصريحات ثم تداول كسرها بوقف 15$. اللوت المقترح أدناه.',
    };
  }
  if (isUsdHigh) {
    const buyDip = strongUp ? 60 : strongDown ? 30 : 45;
    const sellTop = strongDown ? 60 : strongUp ? 30 : 45;
    return {
      lean: strongUp
        ? 'الأرجح: هبوط خاطف أولاً إن جاءت الأرقام قوية للدولار، يُشترى عند امتصاصه — الزخم الصاعد أقوى من الخبر'
        : strongDown
          ? 'الأرجح: ارتداد صاعد أولي يُباع عند السيولة العلوية — الاتجاه الهابط مسيطر'
          : 'الأرجح: حركة ثنائية الاتجاه (فتيلان طويلان) — السوق بلا مرجحية واضحة',
      leanSide: strongUp ? 'up' : strongDown ? 'down' : 'two-way',
      scenarios: [
        { cond: 'الخبر أقوى من التوقع (للدولار)', move: `هبوط 12–25$${strongUp ? ' ثم ارتداد شرائي محتمل' : ''}`, prob: Math.round(buyDip) },
        { cond: 'الخبر أضعف من التوقع', move: `صعود 12–25$${strongDown ? ' ثم ارتداد بيعي محتمل' : ''}`, prob: Math.round(sellTop) },
      ],
      marketNote,
      advice: 'القاعدة: أول 5 دقائق خداع سيولة. ادخل مع إغلاق شمعة 15 دقيقة كاملة بعد الخبر في اتجاه الحركة المؤكدة، وقف 15$، واللوت المقترح أدناه.',
    };
  }
  if (isGeo) {
    return {
      lean: strongDown
        ? 'الأرجح: صعود سريع مع التصعيد لكن بجلسة واحدة فقط — الترند الهابط سيبتلغه'
        : 'الأرجح: صعود الذهب كملاذ آمن مع أي تصعيد، وقد يتجاوز قمة الأسبوع',
      leanSide: 'up',
      scenarios: [
        { cond: 'تصعيد جديد (ضربات/عقوبات/تهديدات)', move: 'صعود 10–25$ قد يمتد لجلسات', prob: 45 },
        { cond: 'تهدئة أو مفاوضات', move: 'تراجع 8–15$ لامتصاص المكاسب', prob: 30 },
        { cond: 'كلام بلا فعل', move: 'لا تغيير يُذكر — السعر يعود لمنطق الجلسات', prob: 25 },
      ],
      marketNote,
      advice: 'الأخبار الجيوسياسية تُداول بالمتابعة لا بالتخمين: لا دخول إلا بعد تأكيد الخبر من مصدرين رسميين، والهدف أول سيولة أمامية.',
    };
  }
  return {
    lean: 'أثر محدود متوقع — الخبر ثانوي',
    leanSide: 'two-way',
    scenarios: [
      { cond: 'نتيجة أعلى من التوقع', move: 'تحرك 5–10$ يتلاشى سريعاً', prob: 40 },
      { cond: 'نتيجة أقل من التوقع', move: 'تحرك عكسي 5–10$', prob: 40 },
      { cond: 'مطابق للتوقع', move: 'لا حركة تُذكر', prob: 20 },
    ],
    marketNote,
    advice: 'لا تخصص رأس مال لهذا الخبر وحده — استغله فقط إن صادف سيولة واضحة عند صدوره.',
  };
}

function fmt2(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
