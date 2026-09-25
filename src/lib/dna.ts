// ============================================================
// خبير بصمة الشموع — Candle DNA & موجة التداول
// كل شمعة: بصمة (جسم/فتيلان/حجم) + نمط له مدلول + توقع مساره
// ============================================================

import { aggregate, type Candle } from './engine';

export interface CandleDNA {
  time: number;
  dir: 'صاعدة' | 'هابطة' | 'دوجي';
  range: number;
  body: number;
  bodyPct: number;      // نسبة الجسم من المدى 0..100
  upperPct: number;     // فتيل علوي %
  lowerPct: number;     // فتيل سفلي %
  volX: number;         // حجم مقارنة بالمتوسط
  closePos: number;     // موقع الإغلاق 0..1
  pattern: string;
  meaning: string;
  dirScore: number;     // -3..3 ميل النمط
  fp: string;           // بصمة مختصرة للعرض
}

const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------- المدلولات (مكتبة النماذج) ----------
interface PatternDef { name: string; meaning: string; dir: number }
const LIB: Record<string, PatternDef> = {
  doji: { name: 'دوجي', meaning: 'تردد كامل بين المشترين والبائعين — توازن يسبق انفجاراً، انتظر كسر الفتيل', dir: 0 },
  hammer: { name: 'مطرقة', meaning: 'رفض هابط ثم صعود — انعكاس صاعد محتمل عند القيعان', dir: 2 },
  invHammer: { name: 'مطرقة مقلوبة', meaning: 'محاولة صعود من قاع — شرارة انعكاس صاعد', dir: 1.5 },
  star: { name: 'نجم رماية', meaning: 'رفض صاعد عند القمم — انعكاس هابط محتمل', dir: -2 },
  pinUp: { name: 'دبوس صاعد', meaning: 'فتيل سفلي طويل = امتصاص سيولة أسفل ثم صعود', dir: 2.5 },
  pinDown: { name: 'دبوس هابط', meaning: 'فتيل علوي طويل = سيولة علوية التهمت ثم هبوط', dir: -2.5 },
  maruUp: { name: 'ماروبوزو صاعد', meaning: 'جسم صافٍ بلا فتائل — سيطرة شرائية كاملة، الزخم مستمر غالباً', dir: 2.5 },
  maruDown: { name: 'ماروبوزو هابط', meaning: 'جسم صافٍ هابط — سيطرة بيعية، الضغط مستمر غالباً', dir: -2.5 },
  engulfUp: { name: 'ابتلاع شرائي', meaning: 'شمعة تبتلع سابقتها هابطة — انعكاس صاعد قوي', dir: 3 },
  engulfDown: { name: 'ابتلاع بيعي', meaning: 'شمعة تبتلع سابقتها صاعدة — انعكاس هابط قوي', dir: -3 },
  inside: { name: 'شمعة داخلية', meaning: 'تقارب ضمن نطاق الشمعة السابقة — ضغط يتفجر، كسر الحدين يحدد الاتجاه', dir: 0 },
  morning: { name: 'نجمة الصباح', meaning: 'ثلاثية: هبوط + دوجي + ابتلاع صاعد — قاع مؤكد غالباً', dir: 3 },
  evening: { name: 'نجمة المساء', meaning: 'ثلاثية: صعود + دوجي + ابتلاع هابط — قمة مؤكدة غالباً', dir: -3 },
  thrust: { name: 'شمعة دافعة', meaning: 'جسم كبير بحجم مرتفع — حركة مؤسسية حقيقية، اتبعها لا تقاومها', dir: 1.5 },
  neutral: { name: 'عادية', meaning: 'لا مدلول ذا قيمة وحدها — اقرأها ضمن السياق', dir: 0 },
};

// ---------- تحليل بصمة شمعة واحدة ----------
export function dnaOf(c: Candle, avgVol = 0, prev?: Candle): CandleDNA {
  const range = c.high - c.low;
  const body = Math.abs(c.close - c.open);
  const upper = c.high - Math.max(c.open, c.close);
  const lower = Math.min(c.open, c.close) - c.low;
  const bodyPct = range > 0 ? (body / range) * 100 : 0;
  const upperPct = range > 0 ? (upper / range) * 100 : 0;
  const lowerPct = range > 0 ? (lower / range) * 100 : 0;
  const volX = avgVol > 0 ? (c.volume ?? 0) / avgVol : 0;
  const closePos = range > 0 ? (c.close - c.low) / range : 0.5;
  const isUp = c.close > c.open;

  let key: keyof typeof LIB = 'neutral';
  if (range > 0) {
    if (bodyPct < 10) key = 'doji';
    else if (bodyPct > 90) key = isUp ? 'maruUp' : 'maruDown';
    else if (lowerPct >= 55 && bodyPct < 45) key = 'pinUp';
    else if (upperPct >= 55 && bodyPct < 45) key = 'pinDown';
    else if (lowerPct >= 2 * bodyPct && upperPct < bodyPct && closePos > 0.6) key = 'hammer';
    else if (upperPct >= 2 * bodyPct && lowerPct < bodyPct && closePos < 0.4) key = 'star';
    else if (prev && body > Math.abs(prev.close - prev.open) * 1.2) {
      if (isUp && c.open <= prev.close && c.close >= prev.open && prev.close < prev.open) key = 'engulfUp';
      else if (!isUp && c.open >= prev.close && c.close <= prev.open && prev.close > prev.open) key = 'engulfDown';
    }
    if (prev && c.high < prev.high && c.low > prev.low) key = 'inside';
    if (bodyPct > 60 && volX >= 1.8) key = isUp ? 'maruUp' : 'maruDown'; // دافعة بحجم = ماروبوزو عملي
  }

  const def = LIB[key];
  const dir: CandleDNA['dir'] = bodyPct < 10 ? 'دوجي' : isUp ? 'صاعدة' : 'هابطة';
  return {
    time: c.time,
    dir,
    range: r1(range), body: r1(body), bodyPct: Math.round(bodyPct),
    upperPct: Math.round(upperPct), lowerPct: Math.round(lowerPct),
    volX: r1(volX), closePos: r1(closePos * 100) / 100,
    pattern: def.name, meaning: def.meaning, dirScore: def.dir,
    fp: `${dir === 'صاعدة' ? '▲' : dir === 'هابطة' ? '▼' : '◆'} ج${Math.round(bodyPct)}% ع${Math.round(upperPct)}% س${Math.round(lowerPct)}% ح${volX ? volX.toFixed(1) : '—'}×`,
  };
}

// النمط الثلاثي (نجمة صباح/مساء) يحتاج آخر 3 شموع مكتملة
export function triplePattern(c0: Candle, c1: Candle, c2: Candle): PatternDef | null {
  const body1 = Math.abs(c1.close - c1.open);
  const range1 = c1.high - c1.low;
  const body2 = Math.abs(c2.close - c2.open);
  if (range1 > 0 && body1 / range1 < 0.15) {
    if (c0.close < c0.open && c2.close > c2.open && c2.close > (c0.open + c0.close) / 2 && body2 > body1 * 2) return LIB.morning;
    if (c0.close > c0.open && c2.close < c2.open && c2.close < (c0.open + c0.close) / 2 && body2 > body1 * 2) return LIB.evening;
  }
  return null;
}

// ---------- تحليل إطار زمني ----------
export interface TfAnalysis {
  tf: string;        // الاسم المعروض
  weight: number;    // وزن التقاء
  closed: CandleDNA; // آخر شمعة مكتملة
  live: CandleDNA | null;
  momentum: number;  // -3..3
  dir: 'up' | 'down' | 'flat';
  atr: number;       // متوسط المدى
  speed: number;     // $ لكل وحدة إطاره
  volAvg: number;
}

function analyzeTf(tf: string, weight: number, candles: Candle[]): TfAnalysis | null {
  if (candles.length < 25) return null;
  const avgVol = candles.slice(-60).reduce((a, c) => a + (c.volume ?? 0), 0) / Math.min(60, candles.length);
  const atr = candles.slice(-14).reduce((a, c) => a + (c.high - c.low), 0) / 14;
  // زخم: آخر 6 شمعات موزونة + ميل النمط الحالي
  let mom = 0;
  const last6 = candles.slice(-6);
  last6.forEach((c, i) => {
    const w = (i + 1) / 6;
    const d = c.close > c.open ? 1 : c.close < c.open ? -1 : 0;
    mom += d * w * (1 + Math.min((c.volume ?? 0) / (avgVol || 1), 2) * 0.3);
  });
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const dna = dnaOf(last, avgVol, prev);
  const triple = candles.length >= 3 ? triplePattern(candles[candles.length - 3], candles[candles.length - 2], candles[candles.length - 1]) : null;
  if (triple) { dna.pattern = triple.name; dna.meaning = triple.meaning; dna.dirScore = triple.dir; }
  mom += dna.dirScore * 0.5;
  mom = Math.max(-3, Math.min(3, mom));
  const dir = mom > 0.8 ? 'up' : mom < -0.8 ? 'down' : 'flat';
  const spanSec = candles.length > 1 ? candles[candles.length - 1].time - candles[candles.length - 2].time : 900;
  return { tf, weight, closed: dna, live: null, momentum: r1(mom), dir, atr: r1(atr), speed: r1(atr / (spanSec / 60)), volAvg: Math.round(avgVol) };
}

// ---------- بناء سلم الأطر من بيانات MetaApi ----------
export function buildTfLadder(m1: Candle[], m5: Candle[], m15: Candle[]): TfAnalysis[] {
  const out: TfAnalysis[] = [];
  const push = (t: TfAnalysis | null) => { if (t) out.push(t); };
  push(analyzeTf('1 دقيقة', 0.5, m1));
  push(analyzeTf('5 دقائق', 0.8, m5));
  push(analyzeTf('10 دقائق', 0.9, aggregate(m5, 600)));
  push(analyzeTf('15 دقيقة', 1, m15));
  push(analyzeTf('30 دقيقة', 1.2, aggregate(m15, 1800)));
  push(analyzeTf('ساعة', 1.5, aggregate(m15, 3600)));
  push(analyzeTf('4 ساعات', 2, aggregate(m15, 14400)));
  push(analyzeTf('يومي', 2.5, aggregate(m15, 86400)));
  return out;
}

// ---------- موجة التداول: تقاء الأطر + مسار السعر ----------
export interface WaveTarget { price: number; label: string; eta: string }
export interface Wave {
  dir: 'up' | 'down' | 'flat';
  strength: number;        // 0..100 قوة الموجة
  agreeUp: number; agreeDown: number; total: number;
  summary: string;
  path: WaveTarget[];       // هنا ثم هنا
  horizons: { label: string; low: number; high: number; mid: number }[];
  speed15: number;          // $/15د
}

export function buildWave(tfs: TfAnalysis[], price: number, unswept: { label: string; price: number }[]): Wave {
  let score = 0, maxScore = 0, agreeUp = 0, agreeDown = 0;
  for (const t of tfs) {
    maxScore += t.weight * 3;
    score += t.momentum * t.weight;
    if (t.dir === 'up') agreeUp++;
    else if (t.dir === 'down') agreeDown++;
  }
  const strength = maxScore > 0 ? Math.min(100, Math.round((Math.abs(score) / maxScore) * 260)) : 0;
  const dir: Wave['dir'] = score > 0.6 ? 'up' : score < -0.6 ? 'down' : 'flat';
  const speed15 = tfs.find((t) => t.tf === '15 دقيقة')?.speed ?? 1;

  // الأهداف: أولاً أقرب سيولة/مستوى غير ممسوح في اتجاه الموجة، ثام نسبة ATR
  const atrH = tfs.find((t) => t.tf === 'ساعة')?.atr ?? 5;
  const atr4h = tfs.find((t) => t.tf === '4 ساعات')?.atr ?? 10;
  const sgn = dir === 'up' ? 1 : dir === 'down' ? -1 : 0;
  const inDir = unswept
    .filter((u) => sgn > 0 ? u.price > price : sgn < 0 ? u.price < price : true)
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));

  const path: WaveTarget[] = [];
  if (sgn !== 0 && inDir.length) path.push({ price: inDir[0].price, label: `سيولة: ${inDir[0].label}`, eta: '~30–60 دقيقة' });
  if (sgn !== 0) {
    path.push({ price: +(price + sgn * atrH).toFixed(2), label: `امتداد ATR ساعة`, eta: '~ساعة' });
    const nextLvl = inDir[1];
    if (nextLvl) path.push({ price: nextLvl.price, label: `الهدف الثاني: ${nextLvl.label}`, eta: '~2–4 ساعات' });
    else path.push({ price: +(price + sgn * atr4h * 1.5).toFixed(2), label: 'امتداد ATR 4 ساعات', eta: '~4 ساعات' });
  }

  // آفاق زمنية: مخروط الحركة المتوقع 5/10/15/60 دقيقة
  const drift = sgn * speed15;
  const horizons = [5, 10, 15, 60].map((mins) => {
    const sigma = speed15 * Math.sqrt(mins / 15) * 0.8;
    const mid = +(price + drift * (mins / 15) * 0.7).toFixed(2);
    return { label: mins === 60 ? 'ساعة' : `${mins} دقائق`, low: +(mid - sigma).toFixed(2), high: +(mid + sigma).toFixed(2), mid };
  });

  const summary = dir === 'flat'
    ? 'الأطر متضاربة — لا موجة واضحة الآن، انتظر انحياز 3 أطر كبرى معاً'
    : `موجة ${dir === 'up' ? 'صاعدة' : 'هابطة'} متفقة على ${dir === 'up' ? agreeUp : agreeDown} من ${tfs.length} أطر — ${strength >= 60 ? 'قوية، تداول معها' : strength >= 35 ? 'متوسطة، خفف اللوت' : 'ضعيفة، لا تلاحقها'}`;

  return { dir, strength, agreeUp, agreeDown, total: tfs.length, summary, path, horizons, speed15: r1(speed15) };
}

// نص إعلاني صوتي مختصر للموجة
export function waveSpeech(w: Wave): string {
  if (w.dir === 'flat') return 'لا توجد موجة واضحة الآن. الانتظار أفضل من المطاردة.';
  const d = w.dir === 'up' ? 'صاعدة' : 'هابطة';
  const t1 = w.path[0];
  const t2 = w.path[1];
  let s = `الموجة ${d} بقوة ${w.strength} بالمئة. `;
  if (t1) s += `الهدف الأول ${t1.price} ثم ${t2 ? t2.price : 'الهدف التالي'}. `;
  s += w.strength >= 35 ? 'تداول مع الموجة فقط.' : 'الموجة ضعيفة، خفف حجم الصفقة.';
  return s;
}
