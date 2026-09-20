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
import type { DayAnalysis, Candle } from '../lib/engine';

const C = {
  bg: '#050810',
  grid: '#101830',
  up: '#34d399',
  down: '#f87171',
  open: '#22d3ee',
  asiaH: '#fbbf24',
  asiaL: '#fbbf24',
  pdh: '#a78bfa',
  pdl: '#a78bfa',
  res: '#f87171',
  sup: '#34d399',
  entry: '#ffffff',
  stop: '#f87171',
  tp: '#34d399',
};

interface Props {
  candles: Candle[];
  analysis: DayAnalysis | null;
  showAll: Candle[];
}

export default function GoldChart({ candles, analysis, showAll }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: '#8b98b8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
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
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight });
    });
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !showAll.length) return;

    series.setData(showAll.map((c) => ({ ...c, time: c.time as UTCTimestamp })));

    // خطوط المستويات
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
      lines.push(mk(analysis.asiaHigh, C.asiaH, 'قمة آسيا'));
      lines.push(mk(analysis.asiaLow, C.asiaL, 'قاع آسيا'));
      lines.push(mk(analysis.pdh, C.pdh, 'قمة الأمس', 'dotted'));
      lines.push(mk(analysis.pdl, C.pdl, 'قاع الأمس', 'dotted'));
      for (const lv of analysis.levels) {
        if (lv.kind === 'RES') lines.push(mk(lv.price, C.res, lv.label, 'dotted'));
        if (lv.kind === 'SUP') lines.push(mk(lv.price, C.sup, lv.label, 'dotted'));
      }
      const sig = analysis.signals[0];
      if (sig) {
        lines.push(mk(sig.entry, C.entry, 'دخول', 'solid'));
        lines.push(mk(sig.stop, C.stop, 'وقف', 'solid'));
        lines.push(mk(sig.tp1, C.tp, 'هدف 1', 'solid'));
        lines.push(mk(sig.tp2, C.tp, 'هدف 2'));
      }
    }

    // علامات السحب والكسر الهيكلي والدخول
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
          color: '#22d3ee',
          shape: 'circle',
          text: 'CHoCH',
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

    // تركيز على يوم التحليل
    if (analysis && analysis.candles.length) {
      const first = analysis.candles[0].time as UTCTimestamp;
      const last = analysis.candles[analysis.candles.length - 1].time as UTCTimestamp;
      chart.timeScale().setVisibleRange({ from: first, to: (last + 8 * 900) as UTCTimestamp });
    }

    return () => {
      pm.detach();
      lines.forEach((l) => series.removePriceLine(l));
    };
  }, [showAll, analysis, candles]);

  return <div ref={ref} className="h-full w-full" dir="ltr" />;
}
