import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  ColorType,
} from 'lightweight-charts';
import {
  KILL_ZONES, detectFVGs, computeOTE,
  type DayAnalysis, type Candle,
} from '../lib/engine';

const C = {
  bg: '#050810',
  grid: '#101830',
  up: '#34d399',
  down: '#f87171',
  open: '#22d3ee',
  asia: '#fbbf24',
  london: '#22d3ee',
  ny: '#34d399',
  pd: '#a78bfa',
};

interface Props {
  candles: Candle[];
  analysis: DayAnalysis | null;
  showAll: Candle[];
}

export default function GoldChart({ candles, analysis, showAll }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const drawRef = useRef<() => void>(() => {});

  // ---------- إنشاء الشارت ----------
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: '#8b98b8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: '#1a2540' },
      timeScale: { borderColor: '#1a2540', timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: '#2a3a5f', labelBackgroundColor: '#1a2540' },
        horzLine: { color: '#2a3a5f', labelBackgroundColor: '#1a2540' },
      },
      width: ref.current.clientWidth,
      height: ref.current.clientHeight,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: C.up, downColor: C.down,
      borderUpColor: C.up, borderDownColor: C.down,
      wickUpColor: C.up, wickDownColor: C.down,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (!ref.current || !canvasRef.current) return;
      chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight });
      syncCanvas();
      drawRef.current();
    });
    ro.observe(ref.current);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => drawRef.current());
    return () => { ro.disconnect(); chart.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncCanvas = () => {
    const cv = canvasRef.current, host = ref.current;
    if (!cv || !host) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = host.clientWidth * dpr;
    cv.height = host.clientHeight * dpr;
    cv.style.width = host.clientWidth + 'px';
    cv.style.height = host.clientHeight + 'px';
  };

  // ---------- الرسم فوق الشارت (جلسات، مناطق، صناديق) ----------
  useEffect(() => {
    drawRef.current = () => {
      const chart = chartRef.current, series = seriesRef.current, cv = canvasRef.current;
      if (!chart || !series || !cv || !analysis) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = cv.width / dpr, H = cv.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const ts = chart.timeScale();
      const x = (t: number): number | null => {
        const c = ts.timeToCoordinate(t as UTCTimestamp);
        return c === null ? null : (c as number);
      };
      const y = (p: number): number | null => {
        const c = series.priceToCoordinate(p);
        return c === null ? null : (c as number);
      };
      const day = analysis.candles;
      if (!day.length) return;
      const t0 = day[0].time, t1 = day[day.length - 1].time;
      const x0 = x(t0), xEnd = x(t1 + 8 * 900) ?? W;

      // 1) تظليل الجلسات
      const band = (a: number, b: number, color: string, alpha: string) => {
        const xa = x(a) ?? x0 ?? 0;
        const xb = x(b) ?? xEnd;
        if (xb < 0 || xa > W) return;
        ctx.fillStyle = color + alpha;
        ctx.fillRect(Math.max(0, xa), 0, Math.min(W, xb) - Math.max(0, xa), H);
      };
      // آسيا 00-08
      band(t0, t0 + 8 * 3600, '#fbbf24', '10');
      // لندن 08-13
      band(t0 + 8 * 3600, t0 + 13 * 3600, '#22d3ee', '0a');
      // نيويورك 13-21
      band(t0 + 13 * 3600, t0 + 21 * 3600, '#34d399', '0a');
      // Kill Zones أغمق
      for (const kz of KILL_ZONES) {
        band(t0 + kz.start * 3600, t0 + kz.end * 3600, '#22d3ee', '14');
        const xa = x(t0 + kz.start * 3600);
        if (xa !== null && xa > 0 && xa < W) {
          ctx.fillStyle = '#8b98b8';
          ctx.font = '9px JetBrains Mono';
          ctx.fillText(kz.label, xa + 3, 12);
        }
      }

      // 2) مناطق سيولة مسحوبة (من بداية اليوم حتى لحظة السحب)
      for (const sw of analysis.sweeps) {
        const yA = y(sw.levelPrice), yB = y(sw.extreme);
        if (yA === null || yB === null) continue;
        const xs = x(sw.time) ?? xEnd;
        const top = Math.min(yA, yB), h = Math.abs(yB - yA);
        ctx.fillStyle = '#fbbf2422';
        ctx.fillRect(Math.max(0, x0 ?? 0), top, Math.min(W, xs) - Math.max(0, x0 ?? 0), Math.max(h, 3));
        ctx.strokeStyle = '#fbbf2466';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(Math.max(0, x0 ?? 0), top, Math.min(W, xs) - Math.max(0, x0 ?? 0), Math.max(h, 3));
        ctx.setLineDash([]);
      }

      // 3) فجوات FVG غير المملوءة
      for (const g of detectFVGs(day, 50)) {
        if (g.filled) continue;
        const yT = y(g.top), yB = y(g.bottom);
        if (yT === null || yB === null) continue;
        const xg = x(g.time) ?? x0 ?? 0;
        ctx.fillStyle = g.dir === 'up' ? '#34d39914' : '#f8717114';
        ctx.fillRect(xg, yT, Math.min(W, xEnd) - xg, Math.max(yB - yT, 2));
      }

      // 4) صندوق الصفقة + منطقة OTE
      const sig = analysis.signals[0];
      if (sig) {
        const xs = x(sig.time) ?? 0;
        const xe = Math.min(W, xEnd);
        const box = (pA: number, pB: number, color: string) => {
          const yA = y(pA), yB = y(pB);
          if (yA === null || yB === null) return;
          const top = Math.min(yA, yB);
          ctx.fillStyle = color;
          ctx.fillRect(xs, top, xe - xs, Math.abs(yB - yA));
        };
        box(sig.entry, sig.stop, '#f8717114');          // منطقة المخاطرة
        box(sig.entry, sig.tp1, '#34d3991a');           // هدف 1
        box(sig.tp1, sig.tp2, '#34d3990d');             // هدف 2
        // OTE
        const ote = computeOTE(sig.side, sig.side === 'long' ? sig.stop : sig.stop, sig.side === 'long' ? sig.tp2 : sig.tp2, sig.entry);
        ctx.strokeStyle = '#22d3ee88';
        ctx.setLineDash([5, 4]);
        for (const p of [ote.oteTop, ote.oteBottom]) {
          const yy = y(p);
          if (yy !== null) { ctx.beginPath(); ctx.moveTo(xs, yy); ctx.lineTo(xe, yy); ctx.stroke(); }
        }
        ctx.setLineDash([]);
        ctx.fillStyle = '#22d3ee';
        ctx.font = '9px JetBrains Mono';
        ctx.fillText('OTE', xs + 4, (y(ote.oteTop) ?? 0) - 3);
      }

      // 5) خط "الآن" لليوم الحالي
      const now = Math.floor(Date.now() / 1000);
      if (now >= t0 && now <= t1 + 8 * 900) {
        const xn = x(now);
        if (xn !== null) {
          ctx.strokeStyle = '#fbbf2455';
          ctx.setLineDash([2, 4]);
          ctx.beginPath(); ctx.moveTo(xn, 0); ctx.lineTo(xn, H); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };
    drawRef.current();
  });

  // ---------- البيانات والخطوط ----------
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !showAll.length) return;
    syncCanvas();

    series.setData(showAll.map((c) => ({ ...c, time: c.time as UTCTimestamp })));

    const lines: ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[] = [];
    if (analysis) {
      const mk = (price: number, color: string, title: string, style: 'solid' | 'dashed' | 'dotted' = 'dashed') =>
        series.createPriceLine({
          price, color, title,
          lineWidth: style === 'solid' ? 2 : 1,
          lineStyle: style === 'solid' ? 0 : style === 'dashed' ? 2 : 1,
          axisLabelVisible: true,
        });
      lines.push(mk(analysis.open, C.open, 'الافتتاح', 'solid'));
      lines.push(mk(analysis.asiaHigh, C.asia, 'قمة آسيا'));
      lines.push(mk(analysis.asiaLow, C.asia, 'قاع آسيا'));
      lines.push(mk(analysis.pdh, C.pd, 'قمة الأمس', 'dotted'));
      lines.push(mk(analysis.pdl, C.pd, 'قاع الأمس', 'dotted'));
      for (const lv of analysis.levels) {
        if (lv.kind === 'RES') lines.push(mk(lv.price, C.down, lv.label, 'dotted'));
        if (lv.kind === 'SUP') lines.push(mk(lv.price, C.up, lv.label, 'dotted'));
      }
      const sig = analysis.signals[0];
      if (sig) {
        lines.push(mk(sig.entry, '#ffffff', 'دخول', 'solid'));
        lines.push(mk(sig.stop, C.down, 'وقف', 'solid'));
        lines.push(mk(sig.tp1, C.up, 'هدف 1', 'solid'));
        lines.push(mk(sig.tp2, C.up, 'هدف 2'));
      }
    }

    const markers: any[] = [];
    if (analysis) {
      for (const sw of analysis.sweeps) {
        markers.push({
          time: sw.time as UTCTimestamp,
          position: sw.direction === 'below' ? 'belowBar' : 'aboveBar',
          color: '#fbbf24',
          shape: sw.direction === 'below' ? 'arrowUp' : 'arrowDown',
          text: `سحب ${sw.levelLabel}`,
        });
      }
      for (const s of analysis.signals) {
        markers.push({
          time: s.chochTime as UTCTimestamp,
          position: s.side === 'long' ? 'belowBar' : 'aboveBar',
          color: '#22d3ee', shape: 'circle', text: 'CHoCH',
        });
        markers.push({
          time: s.time as UTCTimestamp,
          position: s.side === 'long' ? 'belowBar' : 'aboveBar',
          color: s.side === 'long' ? '#34d399' : '#f87171',
          shape: s.side === 'long' ? 'arrowUp' : 'arrowDown',
          text: s.side === 'long' ? 'شراء' : 'بيع',
        });
      }
      markers.sort((a, b) => (a.time as number) - (b.time as number));
    }
    const pm = createSeriesMarkers(series, markers);

    if (analysis && analysis.candles.length) {
      const first = analysis.candles[0].time as UTCTimestamp;
      const last = analysis.candles[analysis.candles.length - 1].time as UTCTimestamp;
      chart.timeScale().setVisibleRange({ from: first, to: (last + 8 * 900) as UTCTimestamp });
    }
    // إعادة رسم الطبقات بعد تحميل البيانات
    requestAnimationFrame(() => drawRef.current());
    setTimeout(() => drawRef.current(), 100);

    return () => {
      pm.detach();
      lines.forEach((l) => series.removePriceLine(l));
    };
  }, [showAll, analysis, candles]);

  return (
    <div ref={ref} className="relative h-full w-full" dir="ltr">
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10" />
    </div>
  );
}
