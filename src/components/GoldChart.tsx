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
  KILL_ZONES, detectFVGs, computeOTE, detectStructure, autoLiquidityZones,
  type DayAnalysis, type Candle,
} from '../lib/engine';
import { TOOL_META, type Drawing, type ToolId } from '../lib/drawings';

export interface AutoLayers { fvg: boolean; bos: boolean; liq: boolean; sess: boolean }

const C = {
  bg: '#050810', grid: '#101830',
  up: '#34d399', down: '#f87171',
  open: '#22d3ee', asia: '#fbbf24', pd: '#a78bfa',
};

interface Props {
  candles: Candle[];        // شموع يوم التحليل (M15)
  analysis: DayAnalysis | null;
  showAll: Candle[];        // شموع العرض (بالفريم المختار)
  tfSeconds: number;
  drawings: Drawing[];
  layers: AutoLayers;
  activeTool: ToolId;
  onChartClick: (t: number, p: number) => void;
}

export default function GoldChart({ candles, analysis, showAll, tfSeconds, drawings, layers, activeTool, onChartClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const stateRef = useRef({ analysis, drawings, layers, tfSeconds });
  stateRef.current = { analysis, drawings, layers, tfSeconds };

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
      handleScroll: true,
      handleScale: true,
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

    // نقرة على الشارت → تحويل الإحداثيات إلى وقت/سعر
    chart.subscribeCrosshairMove(() => {});
    const el = ref.current;
    const onClick = (ev: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const t = chart.timeScale().coordinateToTime(cx);
      const p = series.coordinateToPrice(cy);
      if (t === null || p === null) return;
      onChartClickRef.current(t as number, p as number);
    };
    el.addEventListener('click', onClick);

    const ro = new ResizeObserver(() => {
      if (!ref.current || !canvasRef.current) return;
      chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight });
      syncCanvas();
      drawRef.current();
    });
    ro.observe(ref.current);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => drawRef.current());
    return () => { el.removeEventListener('click', onClick); ro.disconnect(); chart.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChartClickRef = useRef(onChartClick);
  onChartClickRef.current = onChartClick;

  const syncCanvas = () => {
    const cv = canvasRef.current, host = ref.current;
    if (!cv || !host) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = host.clientWidth * dpr;
    cv.height = host.clientHeight * dpr;
    cv.style.width = host.clientWidth + 'px';
    cv.style.height = host.clientHeight + 'px';
  };

  // ---------- طبقة الرسم (جلسات + مناطق تلقائية + رسوم المستخدم) ----------
  useEffect(() => {
    drawRef.current = () => {
      const chart = chartRef.current, series = seriesRef.current, cv = canvasRef.current;
      if (!chart || !series || !cv) return;
      const { analysis: an, drawings: drs, layers: ly } = stateRef.current;
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

      if (an && an.candles.length) {
        const day = an.candles;
        const t0 = day[0].time, t1 = day[day.length - 1].time;
        const x0 = x(t0), xEnd = x(t1 + 8 * 900) ?? W;

        const band = (a: number, b: number, color: string, alpha: string) => {
          const xa = x(a) ?? x0 ?? 0;
          const xb = x(b) ?? xEnd;
          if (xb < 0 || xa > W) return;
          ctx.fillStyle = color + alpha;
          ctx.fillRect(Math.max(0, xa), 0, Math.min(W, xb) - Math.max(0, xa), H);
        };
        band(t0, t0 + 8 * 3600, '#fbbf24', '10');
        band(t0 + 8 * 3600, t0 + 13 * 3600, '#22d3ee', '0a');
        band(t0 + 13 * 3600, t0 + 21 * 3600, '#34d399', '0a');
        for (const kz of KILL_ZONES) {
          band(t0 + kz.start * 3600, t0 + kz.end * 3600, '#22d3ee', '14');
          const xa = x(t0 + kz.start * 3600);
          if (xa !== null && xa > 0 && xa < W) {
            ctx.fillStyle = '#8b98b8';
            ctx.font = '9px JetBrains Mono';
            ctx.fillText(kz.label, xa + 3, 12);
          }
        }

        for (const sw of an.sweeps) {
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

        if (ly.fvg) for (const g of detectFVGs(day, 60)) {
          if (g.filled) continue;
          const yT = y(g.top), yB = y(g.bottom);
          if (yT === null || yB === null) continue;
          const xg = x(g.time) ?? x0 ?? 0;
          ctx.fillStyle = g.dir === 'up' ? '#34d39914' : '#f8717114';
          ctx.fillRect(xg, yT, Math.min(W, xEnd) - xg, Math.max(yB - yT, 2));
        }

        const sig = an.signals[0];
        if (sig) {
          const xs = x(sig.time) ?? 0;
          const xe = Math.min(W, xEnd);
          const box = (pA: number, pB: number, color: string) => {
            const yA = y(pA), yB = y(pB);
            if (yA === null || yB === null) return;
            ctx.fillStyle = color;
            ctx.fillRect(xs, Math.min(yA, yB), xe - xs, Math.abs(yB - yA));
          };
          box(sig.entry, sig.stop, '#f8717114');
          box(sig.entry, sig.tp1, '#34d3991a');
          box(sig.tp1, sig.tp2, '#34d3990d');
          const ote = computeOTE(sig.side, sig.stop, sig.tp2, sig.entry);
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

        // ===== الطبقات التلقائية =====
        // 1) علامات الهيكل BOS / CHoCH
        if (ly.bos) {
          for (const m of detectStructure(day)) {
            const xx = x(m.time), yy = y(m.price);
            if (xx === null || yy === null) continue;
            const col = m.kind === 'CHoCH' ? '#e879f9' : '#22d3ee';
            ctx.strokeStyle = col;
            ctx.setLineDash([2, 2]);
            ctx.beginPath(); ctx.moveTo(xx - 14, yy); ctx.lineTo(xx + 14, yy); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = col;
            ctx.font = 'bold 8.5px JetBrains Mono';
            ctx.fillText(m.kind, xx + 16, m.dir === 'up' ? yy - 4 : yy + 10);
          }
        }
        // 2) مناطق السيولة التلقائية
        if (ly.liq) {
          for (const zn of autoLiquidityZones(an)) {
            const yT = y(zn.top), yB = y(zn.bottom);
            if (yT === null || yB === null) continue;
            const x1 = x(zn.from) ?? 0;
            const x2 = zn.to ? (x(zn.to) ?? W) : W;
            const col = zn.side === 'buy' ? '#fbbf24' : '#a78bfa';
            ctx.fillStyle = col + '14';
            ctx.fillRect(x1, yT, Math.min(W, x2) - x1, Math.max(yB - yT, 4));
            ctx.strokeStyle = col + '55';
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(x1, yT, Math.min(W, x2) - x1, Math.max(yB - yT, 4));
            ctx.setLineDash([]);
            ctx.fillStyle = col;
            ctx.font = 'bold 8.5px JetBrains Mono';
            ctx.fillText(zn.label, x1 + 4, yT + 10);
          }
        }
        // 3) خطوط افتتاح/إغلاق الجلسات
        if (ly.sess) {
          const marks: [number, string, string][] = [
            [t0, 'افتتاح اليوم', '#22d3ee'],
            [t0 + 8 * 3600, 'افتتاح لندن', '#22d3ee'],
            [t0 + 13 * 3600, 'افتتاح نيويورك', '#34d399'],
            [t0 + 21 * 3600, 'إغلاق نيويورك', '#f97316'],
          ];
          for (const [tt, label, col] of marks) {
            const xx = x(tt);
            if (xx === null || xx < 0 || xx > W) continue;
            ctx.strokeStyle = col + '66';
            ctx.setLineDash([1, 4]);
            ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, H); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = col;
            ctx.font = '8.5px JetBrains Mono';
            ctx.fillText(label, xx + 3, H - 6);
          }
        }

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
      }

      // ===== رسوم المستخدم =====
      for (const d of drs) {
        const meta = TOOL_META[d.tool];
        if (!meta) continue;
        if (meta.kind === 'hline') {
          const yy = y(d.p1);
          if (yy === null) continue;
          ctx.strokeStyle = meta.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
          ctx.fillStyle = meta.color;
          ctx.font = 'bold 9px JetBrains Mono';
          ctx.fillText(`${meta.label} ${d.p1.toFixed(2)}`, 6, yy - 3);
        } else if (meta.kind === 'zone') {
          const y1 = y(d.p1), y2 = y(d.p2 ?? d.p1);
          if (y1 === null || y2 === null) continue;
          const x1 = x(d.t1) ?? 0;
          const x2 = d.t2 ? (x(d.t2) ?? W) : W;
          const top = Math.min(y1, y2), h = Math.max(Math.abs(y2 - y1), 3);
          ctx.fillStyle = meta.color + '1f';
          ctx.fillRect(x1, top, x2 - x1, h);
          ctx.strokeStyle = meta.color + '99';
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(x1, top, x2 - x1, h);
          ctx.setLineDash([]);
          ctx.fillStyle = meta.color;
          ctx.font = 'bold 9px JetBrains Mono';
          ctx.fillText(meta.label, x1 + 4, top + 11);
        } else if (meta.kind === 'label') {
          const xx = x(d.t1), yy = y(d.p1);
          if (xx === null || yy === null) continue;
          ctx.fillStyle = meta.color;
          ctx.beginPath();
          ctx.arc(xx, yy, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = 'bold 10px JetBrains Mono';
          ctx.fillText(meta.label, xx + 6, yy - 5);
        } else if (meta.kind === 'vline') {
          const xx = x(d.t1);
          if (xx === null) continue;
          ctx.strokeStyle = meta.color;
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, H); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = meta.color;
          ctx.font = 'bold 9px JetBrains Mono';
          ctx.fillText(meta.label, xx + 4, 24);
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

    const lines: (ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null)[] = [];
    if (analysis) {
      const mk = (price: number, color: string, title: string, style: 'solid' | 'dashed' | 'dotted' = 'dashed') => {
        if (!Number.isFinite(price)) return null;
        return series.createPriceLine({
          price, color, title,
          lineWidth: style === 'solid' ? 2 : 1,
          lineStyle: style === 'solid' ? 0 : style === 'dashed' ? 2 : 1,
          axisLabelVisible: true,
        });
      };
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

    const snap = (t: number) => (Math.floor(t / tfSeconds) * tfSeconds) as UTCTimestamp;
    const markers: any[] = [];
    if (analysis) {
      for (const sw of analysis.sweeps) {
        markers.push({
          time: snap(sw.time),
          position: sw.direction === 'below' ? 'belowBar' : 'aboveBar',
          color: '#fbbf24',
          shape: sw.direction === 'below' ? 'arrowUp' : 'arrowDown',
          text: `سحب ${sw.levelLabel}`,
        });
      }
      for (const s of analysis.signals) {
        markers.push({
          time: snap(s.chochTime),
          position: s.side === 'long' ? 'belowBar' : 'aboveBar',
          color: '#22d3ee', shape: 'circle', text: 'CHoCH',
        });
        markers.push({
          time: snap(s.time),
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
      const first = snap(analysis.candles[0].time);
      const last = snap(analysis.candles[analysis.candles.length - 1].time + 8 * tfSeconds);
      chart.timeScale().setVisibleRange({ from: first, to: last });
    }
    requestAnimationFrame(() => drawRef.current());
    setTimeout(() => drawRef.current(), 100);

    return () => {
      pm.detach();
      lines.forEach((l) => l && series.removePriceLine(l));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, analysis, candles, tfSeconds]);

  // إعادة رسم الرسوم اليدوية عند تغيّرها
  useEffect(() => {
    drawRef.current();
  }, [drawings]);

  return (
    <div
      ref={ref}
      className="relative h-full w-full"
      dir="ltr"
      style={{ cursor: activeTool !== 'none' ? 'crosshair' : 'default' }}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10" />
    </div>
  );
}
