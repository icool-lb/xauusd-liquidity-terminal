// ============================================================
// محرك ربط الأخبار بالحركة — لينا تقارن الارتفاعات/الهبوط الحاد بأوقات الأخبار
// يرصد الحركات الحادة (≥2.3×ATR) في شموعك ويطابقها مع أقرب خبر صادر
// ============================================================

import type { Candle, NewsEvent } from './engine';

export interface NewsMove {
  time: number;           // وقت بداية الحركة (UTC s)
  dir: 'up' | 'down';
  size: number;           // حجم الحركة بالدولار
  atrX: number;           // مضاعف ATR
  event: NewsEvent | null;
  gapMin: number | null;  // دقائق بين الخبر وبداية الحركة (موجبة = الحركة بعد الخبر)
}

export interface NewsCorrelation {
  sharpTotal: number;     // كل الحركات الحادة
  matched: number;        // المطابقة بخبر
  matchPct: number;
  avgMove: number;        // متوسط حجم الحركة المرتبطة بخبر
  avgDelayMin: number;    // متوسط التأخر عن الخبر
  unMatched: number;      // حركات بلا خبر مرتبط (مؤسسية/مفاجئة)
  rows: NewsMove[];       // أكبر الحالات المطابقة
  windowDays: number;     // حجم النافذة الزمنية المفحوصة
}

const EMPTY: NewsCorrelation = {
  sharpTotal: 0, matched: 0, matchPct: 0, avgMove: 0, avgDelayMin: 0,
  unMatched: 0, rows: [], windowDays: 0,
};

export function analyzeNewsCorrelation(candles: Candle[], events: NewsEvent[]): NewsCorrelation {
  if (candles.length < 50) return EMPTY;
  const n = candles.length;
  const spanSec = candles[n - 1].time - candles[0].time;

  const atrAt = (i: number) => {
    const from = Math.max(0, i - 20);
    const seg = candles.slice(from, i);
    if (!seg.length) return candles[i].high - candles[i].low || 1;
    return seg.reduce((a, c) => a + (c.high - c.low), 0) / seg.length || 1;
  };

  // أخبار الدولار فقط — مراقبة الجيوسياسية الدائمة ليست حدثاً زمنياً محدداً
  const evs = events.filter((e) => (e.currency === 'USD' || e.currency === 'ALL') && !e.title.startsWith('مراقبة'));

  // رصد الحركات الحادة ودمج المتتالية بنفس الاتجاه خلال 3 شمعات
  const moves: (NewsMove & { bar: number })[] = [];
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const atr = atrAt(i);
    const range = c.high - c.low;
    const body = Math.abs(c.close - c.open);
    const sharp = range >= Math.max(6, atr * 2.3) || body >= atr * 2.2;
    if (!sharp) continue;
    const prev = candles[i - 1];
    const dir = c.close >= prev.close ? 'up' : 'down';
    const size = Math.max(dir === 'up' ? c.high - prev.close : prev.close - c.low, body);
    const last = moves[moves.length - 1];
    if (last && i - last.bar <= 3 && last.dir === dir) {
      last.size = Math.max(last.size, +size.toFixed(1));
      last.atrX = Math.max(last.atrX, +(range / atr).toFixed(1));
      last.bar = i;
      continue;
    }
    moves.push({ time: c.time, dir, size: +size.toFixed(1), atrX: +(range / atr).toFixed(1), event: null, gapMin: null, bar: i });
  }

  // مطابقة كل حركة بأقرب خبر في نافذة ±25 دقيقة
  let matched = 0, delaySum = 0, sizeSum = 0;
  for (const m of moves) {
    let best: NewsEvent | null = null;
    let bestGap = Infinity;
    for (const e of evs) {
      const gap = (m.time - e.time) / 60;
      if (Math.abs(gap) <= 25 && Math.abs(gap) < Math.abs(bestGap)) { best = e; bestGap = gap; }
    }
    if (best) {
      m.event = best;
      m.gapMin = Math.round(bestGap);
      matched++;
      delaySum += Math.abs(bestGap);
      sizeSum += m.size;
    }
  }

  const rows = moves.filter((m) => m.event).sort((a, b) => b.size - a.size).slice(0, 6);
  return {
    sharpTotal: moves.length,
    matched,
    matchPct: moves.length ? Math.round((matched / moves.length) * 100) : 0,
    avgMove: matched ? +(sizeSum / matched).toFixed(1) : 0,
    avgDelayMin: matched ? Math.round(delaySum / matched) : 0,
    unMatched: moves.length - matched,
    rows,
    windowDays: Math.max(1, Math.round(spanSec / 86400)),
  };
}
