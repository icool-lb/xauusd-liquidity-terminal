import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  ColorType,
} from 'lightweight-charts';
import { fvgZones, orderBlocks, liquidityPools, type FvgZone, type ObZone, type LiqPool } from '../lib/smc';
import { jsPDF } from 'jspdf';
import {
  KILL_ZONES, computeOTE, detectStructure,
  type DayAnalysis, type Candle,
} from '../lib/engine';

export interface AutoLayers { fvg: boolean; bos: boolean; liq: boolean; sess: boolean; ob: boolean }

const C = {
  bg: '#1f1e1d', grid: '#33322e',
  up: '#34d399', down: '#f87171',
  open: '#22d3ee', asia: '#fbbf24', pd: '#a78bfa',
};

interface Props {
  candles: Candle[];        // شموع يوم التحليل (M15)
  analysis: DayAnalysis | null;
  showAll: Candle[];        // شموع العرض (بالفريم المختار)
  tfSeconds: number;
  layers: AutoLayers;
  fallback?: boolean;       // true = نعرض هيكل آخر يوم تداول لأن يوم اليوم لم يكتمل بعد
}

export default function GoldChart({ candles, analysis, showAll, tfSeconds, layers, fallback = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lastFitKey = useRef<string>('');
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  // تنظيف العلامات والخطوط الحالية — يُستدعى قبل إزالة المخطط لا بعدها (وإلا طلبت المكتبة رسماً على مخطط مُتلَف)
  const overlayCleanup = useRef<(() => void) | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const stateRef = useRef({ analysis, layers, tfSeconds, fallback, showAll });
  stateRef.current = { analysis, layers, tfSeconds, fallback, showAll };
  // المناطق الذكية تُحسب مرة لكل تغيّر في الشموع لا مع كل تمرير
  const zonesRef = useRef<{ key: string; fvg: FvgZone[]; ob: ObZone[]; liq: LiqPool[] }>({ key: '', fvg: [], ob: [], liq: [] });
  const [full, setFull] = useState(false);

  // ---------- إنشاء الشارت ----------
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: '#a6a39b',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: '#3e3e38' },
      timeScale: { borderColor: '#3e3e38', timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: '#4d4c45', labelBackgroundColor: '#3e3e38' },
        horzLine: { color: '#4d4c45', labelBackgroundColor: '#3e3e38' },
      },
      handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      kineticScroll: { touch: true, mouse: true },
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
    return () => {
      ro.disconnect();
      try { overlayCleanup.current?.(); } catch { /* تجاهل */ }
      overlayCleanup.current = null;
      chartRef.current = null; seriesRef.current = null;
      chart.remove();
    };
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

  // ---------- طبقة الرسم (جلسات + طبقات تلقائية) ----------
  useEffect(() => {
    drawRef.current = () => {
      const chart = chartRef.current, series = seriesRef.current, cv = canvasRef.current;
      if (!chart || !series || !cv) return;
      const { analysis: an, layers: ly, tfSeconds: tf, fallback: fb, showAll: sa } = stateRef.current;
      const zk = `${sa.length}-${sa[sa.length - 1]?.time}-${sa[sa.length - 1]?.close}-${tf}`;
      if (zonesRef.current.key !== zk) zonesRef.current = { key: zk, fvg: fvgZones(sa, 220), ob: orderBlocks(sa, 220), liq: liquidityPools(sa, 260) };
      const Z = zonesRef.current;
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
        const x0 = x(t0), xEnd = x(t1 + 8 * tf) ?? W;

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
            ctx.fillStyle = '#a6a39b';
            ctx.font = '9px JetBrains Mono';
            ctx.fillText(kz.label, xa + 3, 12);
          }
        }

        // (صناديق السحب الكبيرة القديمة أُزيلت: السحب يظهر بالأسهم وبملصق «✓ سُحبت» على خط السيولة)
        // ===== رسم المناطق: ألوان مميّزة لكل نوع + حالة حيّة =====
        const lastP = sa.length ? sa[sa.length - 1].close : an.lastPrice;
        const pill = (txt: string, xx: number, yy: number, col: string, solid = true) => {
          ctx.font = 'bold 9px JetBrains Mono, IBM Plex Sans Arabic';
          const w = ctx.measureText(txt).width + 8;
          const x1 = Math.min(Math.max(2, xx), W - w - 2);
          ctx.fillStyle = solid ? col : '#262624e6';
          ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x1, yy - 7, w, 14, 7); else ctx.rect(x1, yy - 7, w, 14); ctx.fill();
          if (!solid) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); }
          ctx.fillStyle = solid ? '#1f1e1d' : col;
          ctx.fillText(txt, x1 + 4, yy + 3);
        };
        const zone = (t1: number, t2: number | null, pTop: number, pBot: number, col: string, fillA: string, opt: { dash?: number[]; lw?: number; strokeA?: string } = {}) => {
          const yT = y(pTop), yB = y(pBot);
          if (yT === null || yB === null) return null;
          const x1 = Math.max(0, x(t1) ?? 0), x2 = t2 == null ? W : Math.min(W, x(t2) ?? W);
          if (x2 <= x1) return null;
          const top = Math.min(yT, yB), h = Math.max(Math.abs(yB - yT), 2);
          ctx.fillStyle = col + fillA;
          ctx.fillRect(x1, top, x2 - x1, h);
          ctx.strokeStyle = col + (opt.strokeA ?? 'cc'); ctx.lineWidth = opt.lw ?? 1;
          ctx.setLineDash(opt.dash ?? []);
          ctx.strokeRect(x1, top, x2 - x1, h);
          ctx.setLineDash([]); ctx.lineWidth = 1;
          return { x1, x2, top, h };
        };
        const byDist = <T,>(arr: T[], p: (t: T) => number, n: number) => arr.slice().sort((q, r) => Math.abs(p(q) - lastP) - Math.abs(p(r) - lastP)).slice(0, n);

        // 1) FVG — تركواز صاعد · وردي هابط؛ الجزء الممتلئ باهت والمتبقّي واضح؛ تختفي عند الامتلاء الكامل
        if (ly.fvg) {
          const act = byDist(Z.fvg.filter((g) => g.state !== 'filled'), (g) => (g.remTop + g.remBottom) / 2, 5);
          const done = Z.fvg.filter((g) => g.state === 'filled').slice(-2);
          for (const g of done) zone(g.t0, g.tEnd ?? null, g.top, g.bottom, '#94a3b8', '0c', { dash: [2, 4], strokeA: '33' });
          for (const g of act) {
            const col = g.dir === 'up' ? '#2dd4bf' : '#f472b6';
            if (g.state === 'partial') zone(g.t0, null, g.top, g.bottom, col, '0d', { dash: [3, 3], strokeA: '55' });
            const r = zone(g.t0, null, g.remTop, g.remBottom, col, g.state === 'fresh' ? '30' : '24', { lw: 1.2 });
            if (r) pill(`FVG ${g.dir === 'up' ? '▲' : '▼'} ${g.size.toFixed(1)}$${g.state === 'partial' ? ` · ${Math.round(g.fill * 100)}%` : ''}`, r.x1 + 4, r.top + Math.min(r.h / 2, 9), col);
          }
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
        // 2) أوردر بلوك — أخضر طلب · برتقالي عرض؛ مُختبر = متقطّع؛ مكسور = Breaker رمادي
        if (ly.ob) {
          const act = byDist(Z.ob.filter((o) => o.state !== 'broken'), (o) => (o.top + o.bottom) / 2, 4);
          for (const o of Z.ob.filter((q) => q.state === 'broken').slice(-1))
            zone(o.t0, o.tEnd ?? null, o.top, o.bottom, '#94a3b8', '10', { dash: [4, 3], strokeA: '55' });
          for (const o of act) {
            const col = o.dir === 'up' ? '#4ade80' : '#fb923c';
            const r = zone(o.t0, null, o.top, o.bottom, col, o.state === 'fresh' ? '33' : '1c', { lw: o.state === 'fresh' ? 1.6 : 1, dash: o.state === 'tested' ? [5, 3] : [] });
            if (r) {
              ctx.fillStyle = col; ctx.fillRect(r.x1, r.top, 3, r.h); // حافة البداية
              pill(`OB ${o.dir === 'up' ? 'طلب' : 'عرض'} ×${o.strength.toFixed(1)}${o.state === 'tested' ? ' · مُختبر' : ''}`, r.x1 + 6, r.top + Math.min(r.h / 2, 9), col, o.state === 'fresh');
            }
          }
        }
        // 3) السيولة — BSL أصفر فوق القمم · SSL بنفسجي تحت القيعان؛ المتساوية أسمك؛ المسحوبة تتوقّف عند السحب ✓
        if (ly.liq) {
          const act = byDist(Z.liq.filter((p) => !p.swept), (p) => p.price, 6);
          const swept = Z.liq.filter((p) => p.swept).sort((q, r) => (r.tSwept ?? 0) - (q.tSwept ?? 0)).slice(0, 2);
          const line = (p: LiqPool, x2: number, faded: boolean) => {
            const yy = y(p.price), x1 = Math.max(0, x(p.t0) ?? 0);
            if (yy === null || x2 <= x1) return null;
            const col = p.side === 'BSL' ? '#facc15' : '#a78bfa';
            ctx.strokeStyle = col + (faded ? '55' : 'ee');
            ctx.lineWidth = p.equal ? 2.4 : 1.4;
            ctx.setLineDash(faded ? [2, 4] : [7, 4]);
            ctx.beginPath(); ctx.moveTo(x1, yy); ctx.lineTo(x2, yy); ctx.stroke();
            ctx.setLineDash([]); ctx.lineWidth = 1;
            return { yy, col };
          };
          for (const p of swept) {
            const xs = Math.min(W, x(p.tSwept ?? 0) ?? W);
            const r = line(p, xs, true);
            if (r) pill(`✓ ${p.side} سُحبت`, xs - 70, r.yy + (p.side === 'BSL' ? -10 : 10), r.col, false);
          }
          for (const p of act) {
            const r = line(p, W, false);
            if (r) pill(`${p.side}${p.equal ? ` · ${p.side === 'BSL' ? 'EQH' : 'EQL'}×${p.touches}` : ''} ${p.price.toFixed(2)}`, Math.max(40, (x(p.t0) ?? 40) + 4), r.yy + (p.side === 'BSL' ? -9 : 9), r.col);
          }
        }
        // دليل الألوان
        {
          const items: [string, string][] = [];
          if (ly.fvg) items.push(['#2dd4bf', 'FVG▲'], ['#f472b6', 'FVG▼']);
          if (ly.ob) items.push(['#4ade80', 'OB طلب'], ['#fb923c', 'OB عرض']);
          if (ly.liq) items.push(['#facc15', 'BSL'], ['#a78bfa', 'SSL']);
          let xx = 44;
          ctx.font = '9px JetBrains Mono, IBM Plex Sans Arabic';
          for (const [col, txt] of items) {
            ctx.fillStyle = col; ctx.fillRect(xx, H - 34, 9, 9);
            ctx.fillStyle = '#d6d3c8'; ctx.fillText(txt, xx + 12, H - 26);
            xx += ctx.measureText(txt).width + 26;
          }
        }
        // 4) خطوط افتتاح/إغلاق الجلسات
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
        if (now >= t0 && now <= t1 + 8 * tf) {
          const xn = x(now);
          if (xn !== null) {
            ctx.strokeStyle = '#fbbf2455';
            ctx.setLineDash([2, 4]);
            ctx.beginPath(); ctx.moveTo(xn, 0); ctx.lineTo(xn, H); ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        if (fb) {
          ctx.fillStyle = '#fbbf24cc';
          ctx.font = 'bold 10px JetBrains Mono';
          ctx.textAlign = 'center';
          ctx.fillText('📅 يُعرض هيكل آخر جلسة تداول — تُبنى مستويات اليوم الجديد تلقائياً فور اكتمال شموعه', W / 2, 26);
          ctx.textAlign = 'left';
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

    // حفظ موضع المستخدم (الزوم/التمرير) قبل تحديث البيانات ثم استرجاعه —
    // وإلا يقفز الشارت لموضعه الافتراضي مع كل نبضة 5 ثوانٍ
    const ts0 = chart.timeScale();
    const savedRange = ts0.getVisibleLogicalRange();
    series.setData(showAll.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    if (savedRange) ts0.setVisibleLogicalRange(savedRange);

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
        if (lv.kind === 'LON_H') lines.push(mk(lv.price, '#67e8f9', 'ق لندن'));
        if (lv.kind === 'LON_L') lines.push(mk(lv.price, '#67e8f9', 'قاع لندن'));
        if (lv.kind === 'NY_H') lines.push(mk(lv.price, '#6ee7b7', 'ق نيويورك'));
        if (lv.kind === 'NY_L') lines.push(mk(lv.price, '#6ee7b7', 'قاع نيويورك'));
        if (lv.kind === 'LON_C') lines.push(mk(lv.price, '#fdba74', 'إغلاق لندن', 'dotted'));
        if (lv.kind === 'NY_C') lines.push(mk(lv.price, '#fdba74', 'إغلاق نيويورك', 'dotted'));
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

    // الملاءمة التلقائية مرة واحدة فقط عند تغيّر يوم التحليل أو الفريم — لا مع كل تحديث بيانات
    const fitKey = `${analysis?.dayKey ?? ''}-${tfSeconds}`;
    if (lastFitKey.current !== fitKey) {
      lastFitKey.current = fitKey;
      fitDay();
    }
    requestAnimationFrame(() => drawRef.current());
    setTimeout(() => drawRef.current(), 100);

    const cleanup = () => {
      pm.detach();
      lines.forEach((l) => l && series.removePriceLine(l));
    };
    overlayCleanup.current = cleanup;
    return () => {
      // إن كان المخطط قد أُزيل فقد نُظّفت الطبقات قبله — لا تلمس سلسلة مُتلَفة
      if (!chartRef.current || overlayCleanup.current !== cleanup) return;
      overlayCleanup.current = null;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, analysis, candles, tfSeconds]);

  const fitDay = () => {
    const chart = chartRef.current;
    const an = stateRef.current.analysis;
    const tf = stateRef.current.tfSeconds;
    if (!chart || !an || !an.candles.length) return;
    const first = Math.floor(an.candles[0].time / tf) * tf;
    const last = Math.floor((an.candles[an.candles.length - 1].time + 8 * tf) / tf) * tf;
    chart.timeScale().setVisibleRange({ from: first as UTCTimestamp, to: last as UTCTimestamp });
  };

  // إعادة رسم الطبقات عند تغيّرها
  useEffect(() => {
    drawRef.current();
  }, [layers]);

  // زوم دقيق حول مركز الشاشة عبر النطاق المنطقي
  const zoom = (dir: 1 | -1) => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const r = ts.getVisibleLogicalRange();
    if (!r) return;
    const center = (r.from + r.to) / 2;
    const half = Math.max(3, ((r.to - r.from) / 2) * (dir === 1 ? 0.65 : 1 / 0.65));
    ts.setVisibleLogicalRange({ from: center - half, to: center + half });
  };

  // تصدير PDF عالي الدقة: تكبير مؤقت للشارت + دمج طبقة الشارت مع طبقة الرسم
  const [exporting, setExporting] = useState(false);
  const exportPdf = async () => {
    const chart = chartRef.current, host = ref.current, ov = canvasRef.current;
    if (!chart || !host || !ov || exporting) return;
    const lib = host.querySelector('canvas:not([data-overlay])') as HTMLCanvasElement | null;
    if (!lib) return;
    setExporting(true);
    const ow = host.clientWidth, oh = host.clientHeight; // الأبعاد الأصلية للاستعادة
    try {
      const scale = 2.5; // دقة التصدير
      const w0 = ow, h0 = oh;
      host.style.width = w0 * scale + 'px';
      host.style.height = h0 * scale + 'px';
      chart.applyOptions({ width: w0 * scale, height: h0 * scale });
      syncCanvas();
      drawRef.current();
      await new Promise((r) => setTimeout(r, 400)); // انتظر إعادة رسم المكتبة
      requestAnimationFrame(() => drawRef.current());

      const W = lib.width, H = lib.height;
      const out = document.createElement('canvas');
      out.width = W; out.height = H + Math.round(H * 0.07);
      const octx = out.getContext('2d');
      if (!octx) throw new Error('canvas');
      octx.fillStyle = '#1f1e1d';
      octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(lib, 0, Math.round(H * 0.07));
      octx.drawImage(ov, 0, Math.round(H * 0.07));
      // ترويسة التقرير
      const pad = Math.round(H * 0.02), th = Math.round(H * 0.07);
      octx.fillStyle = '#fbbf24';
      octx.font = `bold ${Math.round(th * 0.42)}px "JetBrains Mono", monospace`;
      octx.textBaseline = 'middle';
      octx.fillText('XAUUSD — LIQUIDITY TERMINAL', pad, th / 2);
      octx.fillStyle = '#a6a39b';
      octx.font = `${Math.round(th * 0.3)}px "JetBrains Mono", monospace`;
      const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
      octx.fillText(stamp, pad, th / 2 + th * 0.3);
      octx.textAlign = 'right';
      octx.fillText(`RES ${scale}x`, W - pad, th / 2);
      octx.textAlign = 'left';

      const img = out.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      const m = 18;
      const iw = pw - m * 2, ih = (out.height / out.width) * iw;
      const fh = ih > ph - m * 2 ? (ph - m * 2) : ih;
      const fw = (out.width / out.height) * fh;
      pdf.addImage(img, 'PNG', m + (iw - fw) / 2, m + ((ph - m * 2) - fh) / 2, fw, fh);
      pdf.save(`XAUUSD-analysis-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch { /* تجاهل */ } finally {
      host.style.width = '';
      host.style.height = '';
      chart.applyOptions({ width: ow, height: oh });
      syncCanvas();
      drawRef.current();
      setExporting(false);
    }
  };

  const ctrlBtn =
    'flex h-7 w-7 items-center justify-center rounded-sm border border-[#4d4c45] bg-[#30302ee6] text-[13px] font-bold text-slate-300 transition hover:border-amber-400/60 hover:text-amber-300 active:scale-90';

  return (
    <div
      ref={ref}
      className={full ? 'fixed inset-0 z-[100] bg-[#1f1e1d]' : 'relative h-full w-full'}
      dir="ltr"
    >
      <canvas ref={canvasRef} data-overlay className="pointer-events-none absolute inset-0 z-10" />
      {/* أدوات الزوم وملء الشاشة */}
      <div className="absolute left-2 top-2 z-20 flex flex-col gap-1">
        <button
          className={`${ctrlBtn} ${exporting ? 'border-amber-400 text-amber-300' : ''}`}
          title="تصدير PDF عالي الدقة"
          onClick={exportPdf}
        >{exporting ? '…' : '⤓'}</button>
        <button className={ctrlBtn} title="تقريب" onClick={() => zoom(1)}>＋</button>
        <button className={ctrlBtn} title="إبعاد" onClick={() => zoom(-1)}>－</button>
        <button className={ctrlBtn} title="ملاءمة يوم التحليل" onClick={fitDay}>⤢</button>
        <button
          className={ctrlBtn}
          title="الذهاب لآخر سعر"
          onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
        >»</button>
        <button
          className={`${ctrlBtn} ${full ? 'border-amber-400 text-amber-300' : ''}`}
          title={full ? 'خروج من ملء الشاشة' : 'ملء الشاشة'}
          onClick={() => setFull((v) => !v)}
        >{full ? '✕' : '⛶'}</button>
      </div>
    </div>
  );
}
