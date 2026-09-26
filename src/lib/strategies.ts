// ============================================================
// مختبر الاستراتيجيات — اختبار مؤشرات واستراتيجيات TradingView
// الشهيرة على بياناتك الحقيقية: نفس القواعد، نفس الأهداف (10$ على 0.01)
// ============================================================

import type { Candle } from './engine';

export interface StrategyResult {
  name: string;
  family: string;
  trades: number;
  wins: number;
  winRate: number;
  netPnl: number;       // صافي الربح بالدولار على 0.01 لوت (10$ هدف / 15$ وقف)
  profitFactor: number;
  maxConsecLoss: number;
  tradesPerDay: number;
  expectancy: number;   // متوسط الربح لكل صفقة $
  quality: number;      // درجة مركبة 0..100 للترتيب
  current: 'long' | 'short' | 'flat';
  currentNote: string;
}

type Side = 'long' | 'short';
interface Signal { time: number; side: Side }

// مولد إشارات لكل استراتيجية: يقرأ الشموع حتى i ويعطي إشارة عند i إن وجدت
type SignalFn = (c: Candle[], i: number) => Signal | null;

const r1 = (n: number) => Math.round(n * 10) / 10;

function ema(prev: number, price: number, period: number): number {
  const k = 2 / (period + 1);
  return price * k + prev * (1 - k);
}

function sma(arr: number[], period: number): number {
  return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ---------- مكتبة الاستراتيجيات (قواعد TradingView القياسية) ----------

function buildLibrary(): { name: string; family: string; fn: SignalFn; note: (c: Candle[]) => string }[] {
  return [
    {
      name: 'RSI عكسي (14)', family: 'أوسيلاتور',
      fn: (c, i) => {
        if (i < 16) return null;
        const g: number[] = [], l: number[] = [];
        for (let k = i - 14; k < i; k++) {
          const d = c[k].close - c[k - 1].close;
          if (d >= 0) g.push(d); else l.push(-d);
        }
        const rsi = 100 - 100 / (1 + (g.reduce((a, b) => a + b, 0) / 14) / ((l.reduce((a, b) => a + b, 0) / 14) || 1e-9));
        if (rsi < 30) return { time: c[i].time, side: 'long' };
        if (rsi > 70) return { time: c[i].time, side: 'short' };
        return null;
      },
      note: (c) => `RSI الآن ${rsiNow(c).toFixed(0)}`,
    },
    {
      name: 'تقاطع EMA 9/21', family: 'اتجاه',
      fn: (c, i) => {
        if (i < 22) return null;
        let e9 = c[i - 22].close, e21 = c[i - 22].close;
        let p9 = e9, p21 = e21;
        for (let k = i - 21; k <= i; k++) {
          p9 = e9; p21 = e21;
          e9 = ema(e9, c[k].close, 9);
          e21 = ema(e21, c[k].close, 21);
        }
        if (p9 <= p21 && e9 > e21) return { time: c[i].time, side: 'long' };
        if (p9 >= p21 && e9 < e21) return { time: c[i].time, side: 'short' };
        return null;
      },
      note: () => 'ينتظر التقاطع التالي',
    },
    {
      name: 'MACD (12/26/9)', family: 'زخم',
      fn: (c, i) => {
        if (i < 40) return null;
        const closes = c.slice(0, i + 1).map((x) => x.close);
        let e12 = closes[i - 35], e26 = closes[i - 35];
        for (let k = i - 34; k <= i; k++) { e12 = ema(e12, closes[k], 12); e26 = ema(e26, closes[k], 26); }
        const macd = e12 - e26;
        let sig = macd;
        const hist: number[] = [];
        // تقريب: خط إشارة EMA9 لـ MACD — نحسب تقريبياً من آخر 10 قيم
        for (let k = Math.max(9, i - 9); k <= i; k++) {
          let a = closes[k - 30], b = closes[k - 30];
          for (let j = k - 29; j <= k; j++) { a = ema(a, closes[j], 12); b = ema(b, closes[j], 26); }
          hist.push(a - b);
        }
        sig = sma(hist, 9);
        const prevMacd = hist.length > 1 ? hist[hist.length - 2] : macd;
        if (prevMacd <= sig && macd > sig) return { time: c[i].time, side: 'long' };
        if (prevMacd >= sig && macd < sig) return { time: c[i].time, side: 'short' };
        return null;
      },
      note: () => 'يتتبع تقاطع خط الإشارة',
    },
    {
      name: 'بولينجر عكسي (20/2)', family: 'تقلب',
      fn: (c, i) => {
        if (i < 21) return null;
        const closes = c.slice(i - 20, i).map((x) => x.close);
        const mid = closes.reduce((a, b) => a + b, 0) / 20;
        const sd = Math.sqrt(closes.reduce((a, b) => a + (b - mid) ** 2, 0) / 20);
        if (c[i].close < mid - 2 * sd) return { time: c[i].time, side: 'long' };
        if (c[i].close > mid + 2 * sd) return { time: c[i].time, side: 'short' };
        return null;
      },
      note: (c) => `السعر ${c[c.length - 1].close.toFixed(1)} داخل/خارج النطاق`,
    },
    {
      name: 'سوبرترند (10/3)', family: 'اتجاه',
      fn: (c, i) => {
        if (i < 12) return null;
        const atr = c.slice(i - 10, i).reduce((a, x) => a + (x.high - x.low), 0) / 10;
        const mid = (c[i].high + c[i].low) / 2;
        const prev = c[i - 1];
        const prevMid = (prev.high + prev.low) / 2;
        const prevUp = prevMid - 3 * atr, prevDn = prevMid + 3 * atr;
        if (c[i].close > prevDn && prev.close <= prevDn) return { time: c[i].time, side: 'long' };
        if (c[i].close < prevUp && prev.close >= prevUp) return { time: c[i].time, side: 'short' };
        void mid;
        return null;
      },
      note: () => 'يقرأ انقلاب خط السوبرترند',
    },
    {
      name: 'كسر قناة دونشيان 20', family: 'زخم',
      fn: (c, i) => {
        if (i < 21) return null;
        const hh = Math.max(...c.slice(i - 20, i).map((x) => x.high));
        const ll = Math.min(...c.slice(i - 20, i).map((x) => x.low));
        if (c[i].close > hh) return { time: c[i].time, side: 'long' };
        if (c[i].close < ll) return { time: c[i].time, side: 'short' };
        return null;
      },
      note: (c) => `السقف ${Math.max(...c.slice(-20).map((x) => x.high)).toFixed(1)} / الأرض ${Math.min(...c.slice(-20).map((x) => x.low)).toFixed(1)}`,
    },
    {
      name: 'ستوكاستيك (14/3)', family: 'أوسيلاتور',
      fn: (c, i) => {
        if (i < 18) return null;
        const kArr: number[] = [];
        for (let k = i - 3; k <= i; k++) {
          const hh = Math.max(...c.slice(k - 14, k).map((x) => x.high));
          const ll = Math.min(...c.slice(k - 14, k).map((x) => x.low));
          kArr.push(hh === ll ? 50 : ((c[k].close - ll) / (hh - ll)) * 100);
        }
        const k = sma(kArr, 3);
        const pk = sma(kArr.slice(0, -1), 3) || k;
        if (pk < 20 && k >= 20) return { time: c[i].time, side: 'long' };
        if (pk > 80 && k <= 80) return { time: c[i].time, side: 'short' };
        return null;
      },
      note: (c) => `الستوكاستيك الآن ${stochNow(c).toFixed(0)}`,
    },
    {
      name: 'ابتلاع شمعة + حجم', family: 'سعري/حجمي',
      fn: (c, i) => {
        if (i < 2) return null;
        const avgVol = c.slice(Math.max(0, i - 20), i).reduce((a, x) => a + (x.volume ?? 0), 0) / 20;
        const p = c[i - 1], cur = c[i];
        if (cur.volume && avgVol && cur.volume < avgVol * 1.2) return null;
        if (cur.close > cur.open && p.close < p.open && cur.close > p.open && cur.open < p.close) return { time: cur.time, side: 'long' };
        if (cur.close < cur.open && p.close > p.open && cur.close < p.open && cur.open > p.close) return { time: cur.time, side: 'short' };
        return null;
      },
      note: () => 'يرصد آخر ابتلاع بحجم مؤكد',
    },
  ];
}

function rsiNow(c: Candle[]): number {
  const i = c.length - 1;
  if (i < 15) return 50;
  let g = 0, l = 0;
  for (let k = i - 13; k <= i; k++) {
    const d = c[k].close - c[k - 1].close;
    if (d >= 0) g += d; else l -= d;
  }
  return 100 - 100 / (1 + (g / 14) / ((l / 14) || 1e-9));
}
function stochNow(c: Candle[]): number {
  const i = c.length - 1;
  if (i < 14) return 50;
  const hh = Math.max(...c.slice(i - 14, i).map((x) => x.high));
  const ll = Math.min(...c.slice(i - 14, i).map((x) => x.low));
  return hh === ll ? 50 : ((c[i].close - ll) / (hh - ll)) * 100;
}

// ---------- محاكاة باك-تيست موحّدة: وقف 15$ / هدف 10$ على 0.01 ----------
export function runStrategyLab(candles: Candle[], slD = 15, tpD = 10, days = 0): StrategyResult[] {
  if (!days && candles.length > 1) {
    days = Math.max(30, Math.min(150, Math.floor((candles[candles.length - 1].time - candles[0].time) / 86400) - 1));
  }
  days = days || 30;
  if (candles.length < 120) return [];
  const lib = buildLibrary();
  const startIdx = Math.max(30, candles.length - days * 96); // 96 شمعة يومياً (M15)
  const results: StrategyResult[] = [];

  for (const st of lib) {
    let trades = 0, wins = 0, consecLoss = 0, maxConsec = 0, grossWin = 0, grossLoss = 0, net = 0;
    let pos: { side: Side; entry: number; sl: number; tp: number } | null = null;
    let lastSignalTime = 0;

    for (let i = startIdx; i < candles.length; i++) {
      const c = candles[i];
      // إدارة الصفقة المفتوحة: نفحص الوقف أولاً (محافظ)
      if (pos) {
        const hitSL = pos.side === 'long' ? c.low <= pos.sl : c.high >= pos.sl;
        const hitTP = pos.side === 'long' ? c.high >= pos.tp : c.low <= pos.tp;
        if (hitSL || hitTP) {
          const win = hitTP && !hitSL ? true : hitSL && !hitTP ? false : false; // كلاهما = وقف أولاً (محافظ)
          trades++;
          if (win) { wins++; consecLoss = 0; grossWin += tpD; net += tpD; }
          else { consecLoss++; maxConsec = Math.max(maxConsec, consecLoss); grossLoss += slD; net -= slD; }
          pos = null;
          lastSignalTime = c.time;
        }
        continue;
      }
      const sig = st.fn(candles, i);
      if (sig && sig.time !== lastSignalTime) {
        const entry = c.close;
        pos = {
          side: sig.side,
          entry,
          sl: sig.side === 'long' ? entry - slD : entry + slD,
          tp: sig.side === 'long' ? entry + tpD : entry - tpD,
        };
        lastSignalTime = sig.time;
      }
    }

    const daysSpan = Math.max(1, (candles[candles.length - 1].time - candles[startIdx].time) / 86400);
    const winRate = trades ? (wins / trades) * 100 : 0;
    const expectancy = trades ? net / trades : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
    // درجة الجودة: ربحية + استمرارية + تكرار
    const quality = Math.max(0, Math.min(100, Math.round(
      (winRate - 35) * 1.2 + (profitFactor - 1) * 25 + Math.min(trades / daysSpan, 3) * 6 + expectancy * 1.5
    )));

    // الوضع الحالي: هل الاستراتيجية تعطي إشارة الآن على آخر شمعة؟
    let current: StrategyResult['current'] = 'flat';
    let currentNote = st.note(candles);
    try {
      const sig = st.fn(candles, candles.length - 1);
      if (sig) {
        current = sig.side;
        currentNote = (sig.side === 'long' ? 'إشارة شراء الآن' : 'إشارة بيع الآن') + ' — ' + currentNote;
      }
    } catch { /* بعض الاستراتيجيات تحتاج عمقاً أكبر */ }

    results.push({
      name: st.name, family: st.family, trades, wins,
      winRate: r1(winRate), netPnl: r1(net), profitFactor: r1(Math.min(profitFactor, 99)),
      maxConsecLoss: maxConsec, tradesPerDay: r1(trades / daysSpan),
      expectancy: r1(expectancy), quality, current, currentNote,
    });
  }
  return results.sort((a, b) => b.quality - a.quality);
}

// ---------- الدمج: تداول فقط بتفاقم أفضل الاستراتيجيات ----------
export interface MergedPlan {
  side: 'long' | 'short' | 'flat';
  entry: number;
  stop: number;
  tp: number;          // هدف 10$
  agreeing: string[];  // الاستراتيجيات المتفقة
  opposing: string[];
  confidence: number;  // 0..100
  expectancy10: number; // توقع الربح $ لهذه الصفقة على 0.01
  note: string;
}

export function mergedPlan(results: StrategyResult[], price: number, tpD = 10, slD = 15): MergedPlan | null {
  const live = results.filter((r) => r.current !== 'flat');
  const longs = live.filter((r) => r.current === 'long');
  const shorts = live.filter((r) => r.current === 'short');
  const empty: MergedPlan = { side: 'flat', entry: price, stop: price - slD, tp: price + tpD, agreeing: [], opposing: [], confidence: 0, expectancy10: 0, note: 'لا توجد إشارات مفتوحة الآن من الاستراتيجيات المختبرة' };
  if (!live.length) return { ...empty, entry: price };
  const side = longs.length >= shorts.length ? 'long' : 'short';
  const agree = side === 'long' ? longs : shorts;
  const oppose = side === 'long' ? shorts : longs;
  const sgn = side === 'long' ? 1 : -1;
  // الثقة: عدد المتفقات أوزانها بجودتها مقابل المعارضات
  const wAgree = agree.reduce((a, r) => a + r.quality, 0);
  const wOppose = oppose.reduce((a, r) => a + r.quality, 0);
  const confidence = Math.max(0, Math.min(100, Math.round((wAgree / (wAgree + wOppose + 1)) * 100 + agree.length * 8)));
  const avgQ = agree.length ? wAgree / agree.length : 0;
  const avgExp = agree.length ? agree.reduce((a, r) => a + r.expectancy, 0) / agree.length : 0;
  return {
    side, entry: price,
    stop: +(price - sgn * slD).toFixed(2),
    tp: +(price + sgn * tpD).toFixed(2),
    agreeing: agree.map((r) => r.name),
    opposing: oppose.map((r) => r.name),
    confidence,
    expectancy10: r1(avgExp * Math.min(agree.length, 2) * 0.6),
    note: agree.length >= 2
      ? `دمج ${agree.length} استراتيجيات متفقة (متوسط جودتها ${avgQ.toFixed(0)}%) — توقع ${avgExp >= 0 ? 'ربح' : 'خسارة'} متوسط ${Math.abs(avgExp)}$/صفقة تاريخياً`
      : 'إشارة استراتيجية واحدة فقط — انتظر تأكيداً ثانياً قبل الدخول',
  };
}
