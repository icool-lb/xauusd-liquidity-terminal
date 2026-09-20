import { useEffect, useMemo, useRef, useState } from 'react';
import GoldChart from './components/GoldChart';
import { LevelsPanel, SignalCard, RiskCalc, StatsPanel, EventsLog, SessionPlan, ConnectionPanel, EquityCurve, LevelStats, SessionTimeline } from './components/Panels';
import {
  generateHistory, analyzeDay, backtestFull, nextLiveCandle, makeRng,
  sessionOf, inKillZone, aggregate, type Candle, type DayAnalysis,
} from './lib/engine';
import {
  loadCreds, saveCreds, loadRegion, resolveAccount, fetchHistory, fetchCurrentCandle,
  type MetaApiCreds,
} from './lib/metaapi';
import { TOOL_META, loadDrawings, saveDrawings, uid, type Drawing, type ToolId } from './lib/drawings';

const DAY = 24 * 3600;
const BASE_PRICE = 4378;
const DAYS = 9;

const sessionLabel: Record<string, string> = {
  asia: 'جلسة آسيا', london: 'جلسة لندن', ny: 'جلسة نيويورك', off: 'خارج الجلسات',
};
const sessionColor: Record<string, string> = {
  asia: 'text-amber-300 border-amber-400/40', london: 'text-cyan-300 border-cyan-400/40',
  ny: 'text-emerald-300 border-emerald-400/40', off: 'text-slate-500 border-slate-600',
};

export default function App() {
  // ---- مصدر البيانات ----
  const [mode, setMode] = useState<'sim' | 'live'>('sim');
  const [chartView, setChartView] = useState<'engine' | 'tv'>('engine');
  const [creds, setCreds] = useState<MetaApiCreds | null>(() => loadCreds());
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [liveError, setLiveError] = useState('');
  const [liveData, setLiveData] = useState<Candle[]>([]);
  const regionRef = useRef<string>(loadRegion());

  // ---- المحاكاة ----
  const [seed, setSeed] = useState(20260920);
  const simHistory = useMemo(() => generateHistory(DAYS, BASE_PRICE, seed), [seed]);
  const [simLive, setSimLive] = useState<Candle[]>([]);
  const [dataInfo, setDataInfo] = useState('');
  useEffect(() => { setSimLive([]); }, [seed]);

  // ---- مشترك ----
  const [dayOffset, setDayOffset] = useState(0);
  const [account, setAccount] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [clock, setClock] = useState(new Date());

  // نبضة الساعة + محاكاة التدفق اللحظي (وضع المحاكاة فقط)
  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date());
      if (mode !== 'sim') return;
      setSimLive((prev) => {
        const last = prev.length ? prev[prev.length - 1] : simHistory[simHistory.length - 1];
        const rnd = makeRng(Math.floor(Math.random() * 1e9));
        if (prev.length % 8 === 7) return [...prev, nextLiveCandle(last, rnd)];
        const jitter = nextLiveCandle(last, rnd);
        const updated = { ...last, close: jitter.close, high: Math.max(last.high, jitter.high), low: Math.min(last.low, jitter.low) };
        return prev.length ? [...prev.slice(0, -1), updated] : [updated];
      });
    }, 3000);
    return () => clearInterval(id);
  }, [simHistory, mode]);

  // تحميل البيانات الحقيقية عند تفعيل الوضع الحي
  const connectLive = async (c: MetaApiCreds) => {
    setLiveStatus('loading');
    setLiveError('');
    try {
      const region = await resolveAccount(c);
      regionRef.current = region;
      const candles = await fetchHistory(c, region, 30);
      setLiveData(candles);
      if (candles.length) {
        const from = new Date(candles[0].time * 1000).toISOString().slice(5, 16).replace('T', ' ');
        const to = new Date(candles[candles.length - 1].time * 1000).toISOString().slice(5, 16).replace('T', ' ');
        setDataInfo(`${candles.length} شمعة · ${from} ← ${to} UTC`);
      } else setDataInfo('');
      setLiveStatus('ok');
    } catch (e) {
      setLiveStatus('error');
      setLiveError(e instanceof Error ? e.message : 'خطأ غير معروف');
    }
  };

  useEffect(() => {
    if (mode === 'live') {
      if (creds?.token && creds?.accountId) connectLive(creds);
      else setLiveStatus('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, creds]);

  // تحديث الشمعة الحالية كل 15 ثانية في الوضع الحي
  useEffect(() => {
    if (mode !== 'live' || liveStatus !== 'ok' || !creds) return;
    const id = setInterval(async () => {
      try {
        const cc = await fetchCurrentCandle(creds, regionRef.current);
        setLiveData((prev) => {
          if (!prev.length) return [cc];
          const last = prev[prev.length - 1];
          if (cc.time === last.time) return [...prev.slice(0, -1), cc];
          if (cc.time > last.time) return [...prev, cc];
          return prev;
        });
      } catch { /* تجاهل أخطاء النبضة الواحدة */ }
    }, 15000);
    return () => clearInterval(id);
  }, [mode, liveStatus, creds]);

  const all = useMemo(
    () => (mode === 'sim' ? [...simHistory, ...simLive] : liveData),
    [mode, simHistory, simLive, liveData]
  );

  // ---- أدوات الرسم والفريمات ----
  const [tf, setTf] = useState(900); // ثواني
  const [layers, setLayers] = useState({ fvg: true, bos: true, liq: true, sess: false });
  const [activeTool, setActiveTool] = useState<ToolId>('none');
  const [pending, setPending] = useState<{ t: number; p: number } | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  const todayStart = Math.floor(Date.now() / 1000 / DAY) * DAY;
  // إذا كانت البيانات راكدة (اشتراك مجاني)، حلّل آخر يوم متاح فعلياً
  const lastDataDay = all.length ? Math.floor(all[all.length - 1].time / DAY) * DAY : todayStart;
  const effDayStart = Math.min(todayStart - dayOffset * DAY, lastDataDay);
  const dataStale = all.length > 0 && todayStart - lastDataDay >= DAY;
  const dayKey = new Date(effDayStart * 1000).toISOString().slice(0, 10);
  const symbolKey = (mode === 'live' ? creds?.symbol : null) ?? 'SIM';

  // تحميل/حفظ الرسوم لكل يوم ورمز
  useEffect(() => {
    setDrawings(loadDrawings(symbolKey, dayKey));
    setPending(null);
  }, [symbolKey, dayKey]);
  useEffect(() => {
    saveDrawings(symbolKey, dayKey, drawings);
  }, [drawings, symbolKey, dayKey]);

  const handleChartClick = (t: number, p: number) => {
    if (activeTool === 'none') return;
    const price = Math.round(p * 100) / 100;
    if (activeTool === 'erase') {
      setDrawings((ds) => {
        if (!ds.length) return ds;
        // احذف الأقرب لنقطة النقر (مسافة مركّبة سعر+زمن)
        let best = 0, bestScore = Infinity;
        ds.forEach((d, i) => {
          const score = Math.abs(d.p1 - price) + Math.abs(d.t1 - t) / 7200 + (d.p2 ? Math.abs(d.p2 - price) * 0.5 : 0);
          if (score < bestScore) { bestScore = score; best = i; }
        });
        return ds.filter((_, i) => i !== best);
      });
      return;
    }
    const kind = TOOL_META[activeTool]?.kind;
    if (kind === 'zone') {
      if (!pending) {
        setPending({ t, p: price });
      } else {
        setDrawings((ds) => [...ds, {
          id: uid(), tool: activeTool as Drawing['tool'],
          p1: pending.p, p2: price, t1: Math.min(pending.t, t), t2: Math.max(pending.t, t),
        }]);
        setPending(null);
      }
    } else if (kind === 'hline' || kind === 'label') {
      setDrawings((ds) => [...ds, { id: uid(), tool: activeTool as Drawing['tool'], p1: price, t1: t }]);
    } else if (kind === 'vline') {
      setDrawings((ds) => [...ds, { id: uid(), tool: activeTool as Drawing['tool'], p1: price, t1: t }]);
    }
  };
  const analysis: DayAnalysis | null = useMemo(
    () => (all.length >= 10 ? analyzeDay(all, effDayStart) : null),
    [all, effDayStart]
  );
  const stats = useMemo(() => (all.length >= 200 ? backtestFull(all, DAYS - 1) : null), [all]);
  const displayCandles = useMemo(() => aggregate(all, tf), [all, tf]);

  // تحيز H1: إغلاق آخر ساعة مقابل متوسط آخر 8 ساعات
  const h1Bias = useMemo(() => {
    if (all.length < 40) return 'neutral';
    const H = 3600;
    const agg = new Map<number, { o: number; c: number }>();
    for (const c of all) {
      const k = Math.floor(c.time / H) * H;
      const e = agg.get(k);
      if (e) e.c = c.close; else agg.set(k, { o: c.open, c: c.close });
    }
    const closes = [...agg.values()].map((v) => v.c).slice(-8);
    if (closes.length < 4) return 'neutral';
    const last = closes[closes.length - 1];
    const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
    return last > avg * 1.0004 ? 'bullish' : last < avg * 0.9996 ? 'bearish' : 'neutral';
  }, [all]);

  // تنبيه صوتي عند اكتمال إشارة جديدة
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState('');
  const lastSigId = useRef<string>('');
  useEffect(() => {
    const s = analysis?.signals[0];
    if (!s || dayOffset !== 0) return;
    if (lastSigId.current && lastSigId.current !== s.id) {
      setToast(`إشارة جديدة: ${s.side === 'long' ? 'شراء' : 'بيع'} @ ${s.entry} — وقف ${s.stop}`);
      if (soundOn) {
        try {
          const ac = new AudioContext();
          const osc = ac.createOscillator();
          const gain = ac.createGain();
          osc.connect(gain); gain.connect(ac.destination);
          osc.frequency.value = 880; gain.gain.value = 0.08;
          osc.start(); osc.stop(ac.currentTime + 0.35);
        } catch { /* الصوت غير متاح */ }
      }
      setTimeout(() => setToast(''), 9000);
    }
    lastSigId.current = s.id;
  }, [analysis, dayOffset, soundOn]);

  const lastPrice = all[all.length - 1]?.close ?? BASE_PRICE;
  const prevPrice = all[all.length - 2]?.close ?? lastPrice;
  const delta = lastPrice - prevPrice;
  const curSession = sessionOf(Math.floor(Date.now() / 1000));
  const sig = analysis?.signals[0] ?? null;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div dir="rtl" className="flex h-screen flex-col bg-[#050810] text-slate-200 scanlines">
      {/* ===== الرأس ===== */}
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#1a2540] bg-[#080c16] px-4 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-amber-400/15 font-black text-amber-300">Au</div>
          <div>
            <div className="text-[13px] font-black leading-none text-white">منصة سيولة الذهب</div>
            <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.25em] text-slate-500" dir="ltr">XAUUSD · LIQUIDITY TERMINAL · V9</div>
          </div>
        </div>
        <div className="h-6 w-px bg-[#1a2540]" />
        <div dir="ltr" className="flex items-baseline gap-2 font-mono">
          <span className="text-lg font-black text-white">{fmt(lastPrice)}</span>
          <span className={`text-[11px] font-bold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}
          </span>
        </div>
        <span className={`flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-bold ${sessionColor[curSession]}`}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          {sessionLabel[curSession]}
        </span>
        {inKillZone(Math.floor(Date.now() / 1000)) && (
          <span className="rounded-sm border border-red-400/50 bg-red-400/10 px-2 py-0.5 text-[10px] font-black text-red-300 animate-pulse">
            ⚡ منطقة قتل نشطة
          </span>
        )}

        {/* مفتاح مصدر البيانات */}
        <div className="flex rounded-sm border border-[#2a3a5f] p-0.5 text-[10px] font-bold">
          <button
            onClick={() => setMode('sim')}
            className={`rounded-sm px-2.5 py-1 transition ${mode === 'sim' ? 'bg-amber-400 text-black' : 'text-slate-400 hover:text-white'}`}
          >
            محاكاة تدريبية
          </button>
          <button
            onClick={() => setMode('live')}
            className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 transition ${mode === 'live' ? 'bg-emerald-400 text-black' : 'text-slate-400 hover:text-white'}`}
          >
            {mode === 'live' && liveStatus === 'ok' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />}
            بيانات حقيقية
          </button>
        </div>

        <div className="mr-auto flex items-center gap-3">
          <button
            onClick={() => setSoundOn((v) => !v)}
            title="تنبيه صوتي عند الإشارات"
            className={`rounded-sm border px-2 py-1 text-[11px] transition ${soundOn ? 'border-amber-400/40 text-amber-300' : 'border-[#2a3a5f] text-slate-600'}`}
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
          <span dir="ltr" className="font-mono text-[11px] text-slate-400">
            {clock.toISOString().slice(11, 19)} <span className="text-slate-600">UTC</span>
          </span>
          {mode === 'sim' && (
            <button
              onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
              className="rounded-sm border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-300 transition hover:bg-amber-400/20 active:scale-95"
            >
              ⟳ سيناريو جديد
            </button>
          )}
        </div>
      </header>

      {/* ===== شريط المستويات ===== */}
      {analysis && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#1a2540] bg-[#070b14] px-4 py-1.5 text-[10px]">
          {([
            ['قمة الأمس', analysis.pdh, 'text-violet-300'],
            ['قمة آسيا', analysis.asiaHigh, 'text-amber-300'],
            ['الافتتاح', analysis.open, 'text-cyan-300'],
            ['قاع آسيا', analysis.asiaLow, 'text-amber-300'],
            ['قاع الأمس', analysis.pdl, 'text-violet-300'],
          ] as [string, number, string][]).filter(([, v]) => Number.isFinite(v)).map(([l, v, c], i) => (
            <div key={i} className="flex shrink-0 items-center gap-1.5 rounded-sm bg-[#0c1220] px-2.5 py-1">
              <span className="text-slate-500">{l}</span>
              <span dir="ltr" className={`font-mono font-bold ${c}`}>{fmt(v)}</span>
            </div>
          ))}
          <div className="mr-auto flex shrink-0 items-center gap-3">
            <span className="text-slate-500">H1:</span>
            <span className={`font-mono font-bold ${h1Bias === 'bullish' ? 'text-emerald-300' : h1Bias === 'bearish' ? 'text-red-300' : 'text-slate-400'}`}>
              {h1Bias === 'bullish' ? '▲' : h1Bias === 'bearish' ? '▼' : '●'}
            </span>
            <span className="text-slate-500">اليومي:</span>
            <span className={`font-bold ${analysis.bias === 'bullish' ? 'text-emerald-300' : analysis.bias === 'bearish' ? 'text-red-300' : 'text-slate-400'}`}>
              {analysis.bias === 'bullish' ? '▲ صاعد (فوق الافتتاح)' : analysis.bias === 'bearish' ? '▼ هابط (تحت الافتتاح)' : '● محايد'}
            </span>
          </div>
        </div>
      )}

      {/* ===== الخط الزمني للجلسات ===== */}
      <div className="shrink-0 border-b border-[#1a2540] bg-[#050810] px-4">
        <SessionTimeline />
      </div>

      {/* ===== تنبيه الإشارة ===== */}
      {toast && (
        <div className="absolute left-1/2 top-14 z-50 -translate-x-1/2 rounded-md border border-amber-400/60 bg-[#0c1220] px-4 py-2 text-[12px] font-bold text-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.25)]">
          ⚡ {toast}
        </div>
      )}

      {/* ===== الجسم ===== */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* العمود الأيمن: المستويات */}
        <aside className="order-2 w-full shrink-0 space-y-5 border-b border-[#1a2540] bg-[#080c16] p-3 lg:order-1 lg:w-60 lg:border-b-0 lg:border-l lg:overflow-y-auto">
          {mode === 'live' && (
            <ConnectionPanel
              creds={creds}
              status={liveStatus}
              error={liveError}
              onSave={(c) => { saveCreds(c); setCreds(c); }}
              onTest={() => creds && connectLive(creds)}
            />
          )}
          {mode === 'live' && liveStatus === 'ok' && dataInfo && (
            <p dir="ltr" className="rounded-sm bg-emerald-400/5 px-2 py-1 text-center font-mono text-[9.5px] text-emerald-300/80">{dataInfo}</p>
          )}
          {/* اختيار اليوم */}
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">يوم التحليل</div>
            <div className="grid grid-cols-5 gap-1">
              {[0, 1, 2, 3, 4].map((d) => (
                <button
                  key={d}
                  onClick={() => setDayOffset(d)}
                  className={`rounded-sm py-1 font-mono text-[10px] font-bold transition ${
                    dayOffset === d ? 'bg-amber-400 text-black' : 'bg-[#0c1220] text-slate-400 hover:bg-[#111a2b]'
                  }`}
                >
                  {d === 0 ? 'اليوم' : `-${d}`}
                </button>
              ))}
            </div>
          </div>
          {analysis && <LevelsPanel a={analysis} />}
          {/* إعدادات المخاطرة */}
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">الحساب</div>
            <label className="mb-2 block text-[10px] text-slate-500">
              رأس المال ($)
              <input
                type="number" value={account} min={100} step={100}
                onChange={(e) => setAccount(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-sm border border-[#1a2540] bg-[#0c1220] px-2 py-1 font-mono text-[11px] text-white outline-none focus:border-amber-400/50"
                dir="ltr"
              />
            </label>
            <label className="block text-[10px] text-slate-500">
              المخاطرة لكل صفقة %
              <input
                type="number" value={riskPct} min={0.25} max={5} step={0.25}
                onChange={(e) => setRiskPct(Number(e.target.value) || 1)}
                className="mt-1 w-full rounded-sm border border-[#1a2540] bg-[#0c1220] px-2 py-1 font-mono text-[11px] text-white outline-none focus:border-amber-400/50"
                dir="ltr"
              />
            </label>
          </div>
        </aside>

        {/* المركز: الشارت + السجل */}
        <main className="order-1 flex min-h-[520px] min-w-0 flex-1 flex-col lg:order-2 lg:min-h-0">
          <div className="flex shrink-0 flex-wrap items-center gap-1 px-3 pt-2 text-[10px] font-bold">
            <button
              onClick={() => setChartView('engine')}
              className={`rounded-sm px-2.5 py-1 transition ${chartView === 'engine' ? 'bg-[#111a2b] text-amber-300' : 'text-slate-500 hover:text-white'}`}
            >
              شارت التحليل
            </button>
            <button
              onClick={() => setChartView('tv')}
              className={`rounded-sm px-2.5 py-1 transition ${chartView === 'tv' ? 'bg-[#111a2b] text-amber-300' : 'text-slate-500 hover:text-white'}`}
            >
              TradingView مباشر
            </button>
            {/* مبدّل الفريمات */}
            {chartView === 'engine' && (
              <div dir="ltr" className="flex rounded-sm border border-[#2a3a5f] p-0.5 font-mono text-[9px]">
                {[[300, '5m'], [900, '15m'], [1800, '30m'], [3600, '1H'], [14400, '4H'], [86400, '1D']].map(([s, l]) => (
                  <button
                    key={s}
                    onClick={() => setTf(s as number)}
                    className={`rounded-sm px-1.5 py-0.5 transition ${tf === s ? 'bg-cyan-400/20 text-cyan-300' : 'text-slate-500 hover:text-white'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            {mode === 'live' && dataInfo && (
              <span dir="ltr" className="mr-auto rounded-sm bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-300">{dataInfo}</span>
            )}
          </div>
          {/* شريط الطبقات التلقائية + أدوات الرسم اليدوي */}
          {chartView === 'engine' && (
            <div className="shrink-0 space-y-1 px-3 pt-1.5">
              {/* كشف تلقائي بنقرة واحدة */}
              <div className="flex items-center gap-1 overflow-x-auto text-[9.5px] font-bold">
                <span className="shrink-0 text-slate-500">كشف تلقائي:</span>
                {([
                  ['fvg', 'FVG', '#64748b'],
                  ['bos', 'BOS / CHoCH', '#e879f9'],
                  ['liq', 'مناطق السيولة', '#fbbf24'],
                  ['sess', 'افتتاح/إغلاق', '#f97316'],
                ] as const).map(([k, label, col]) => (
                  <button
                    key={k}
                    onClick={() => setLayers((s) => ({ ...s, [k]: !s[k] }))}
                    className="shrink-0 rounded-sm border px-2 py-1 transition active:scale-95"
                    style={{
                      borderColor: layers[k] ? col : '#1a2540',
                      color: layers[k] ? col : '#64748b',
                      background: layers[k] ? col + '18' : 'transparent',
                    }}
                  >
                    {layers[k] ? '◉ ' : '○ '}{label}
                  </button>
                ))}
              </div>
              {/* رسم يدوي */}
              <div className="flex items-center gap-1 overflow-x-auto text-[9.5px] font-bold" dir="ltr">
                <span className="shrink-0 text-slate-500" dir="rtl">يدوي:</span>
              {(Object.keys(TOOL_META) as (keyof typeof TOOL_META)[]).map((k) => (
                <button
                  key={k}
                  onClick={() => { setActiveTool(activeTool === k ? 'none' : (k as ToolId)); setPending(null); }}
                  className="shrink-0 rounded-sm border px-2 py-1 transition active:scale-95"
                  style={{
                    borderColor: activeTool === k ? TOOL_META[k].color : '#1a2540',
                    color: activeTool === k ? TOOL_META[k].color : '#8b98b8',
                    background: activeTool === k ? TOOL_META[k].color + '18' : 'transparent',
                  }}
                >
                  {TOOL_META[k].label}
                </button>
              ))}
              <button
                onClick={() => { setActiveTool(activeTool === 'erase' ? 'none' : 'erase'); setPending(null); }}
                className={`shrink-0 rounded-sm border px-2 py-1 transition ${activeTool === 'erase' ? 'border-red-400 bg-red-400/15 text-red-300' : 'border-[#1a2540] text-slate-500 hover:text-white'}`}
              >
                ⌫ ممحاة
              </button>
              <button
                onClick={() => { setDrawings([]); setPending(null); }}
                className="shrink-0 rounded-sm border border-[#1a2540] px-2 py-1 text-slate-500 transition hover:text-red-300"
              >
                مسح الكل ({drawings.length})
              </button>
              {pending && <span className="shrink-0 px-1 text-amber-300">← انقر النقطة الثانية لإكمال المنطقة</span>}
              {activeTool !== 'none' && activeTool !== 'erase' && !pending && TOOL_META[activeTool]?.kind !== 'zone' && (
                <span className="shrink-0 px-1 text-cyan-300">← انقر على الشارت لوضع {TOOL_META[activeTool]?.label}</span>
              )}
              </div>
            </div>
          )}
          {/* تحذير البيانات الراكدة */}
          {mode === 'live' && dataStale && (
            <div className="mx-3 mt-1.5 shrink-0 rounded-sm border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] leading-relaxed text-amber-300">
              ⚠️ بيانات حسابك التاريخية تتوقف عند {new Date(lastDataDay * 1000).toISOString().slice(0, 10)} (حد الباقة المجانية في MetaApi) — المنصة تحلل آخر يوم متاح، وستتراكم البيانات الحية مع فتح المنصة يومياً.
            </div>
          )}
          <div className="min-h-0 flex-1 p-2">
            <div className="relative h-full overflow-hidden rounded-md border border-[#1a2540] bg-[#050810] p-1">
              {chartView === 'engine' ? (
                mode === 'live' && liveStatus !== 'ok' ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    {liveStatus === 'loading' && <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />}
                    <p className="max-w-sm text-[12px] leading-relaxed text-slate-400">
                      {liveStatus === 'loading' && 'جارٍ الاتصال بحسابك عبر MetaApi وسحب شموع الذهب…'}
                      {liveStatus === 'idle' && 'أدخل بيانات MetaApi في اللوحة الجانبية (API Token + Account ID) ثم اضغط «حفظ واتصال»'}
                      {liveStatus === 'error' && liveError}
                    </p>
                  </div>
                ) : (
                  <GoldChart
                    candles={analysis?.candles ?? []}
                    analysis={analysis}
                    showAll={displayCandles}
                    tfSeconds={tf}
                    drawings={drawings}
                    layers={layers}
                    activeTool={activeTool}
                    onChartClick={handleChartClick}
                  />
                )
              ) : (
                <iframe
                  title="TradingView XAUUSD"
                  src="https://www.tradingview.com/widgetembed/?symbol=OANDA%3AXAUUSD&interval=15&theme=dark&style=1&locale=ar&timezone=Etc%2FUTC&hide_side_toolbar=0&allow_symbol_change=1&withdateranges=1&studies=%5B%5D"
                  className="h-full w-full border-0"
                  dir="ltr"
                />
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-[#1a2540] bg-[#080c16] px-4 py-3">
            {analysis && <EventsLog a={analysis} />}
          </div>
        </main>

        {/* العمود الأيسر: الإشارة */}
        <aside className="order-3 w-full shrink-0 space-y-5 border-t border-[#1a2540] bg-[#080c16] p-3 lg:w-72 lg:border-r lg:border-t-0 lg:overflow-y-auto">
          <SignalCard s={dayOffset === 0 ? sig : analysis?.signals[0] ?? null} bias={analysis?.bias ?? 'neutral'} />
          <RiskCalc s={sig} account={account} riskPct={riskPct} />
          {stats && <StatsPanel st={stats} />}
          {stats && <EquityCurve st={stats} />}
          {stats && <LevelStats st={stats} />}
          <SessionPlan />
          <p className="rounded-sm border border-[#1a2540] bg-[#0c1220] p-2 text-[9.5px] leading-relaxed text-slate-600">
            {mode === 'sim'
              ? 'البيانات الحالية محاكاة تعليمية مبنية على سلوك الذهب اللحظي. للبيانات الحقيقية فعّل «بيانات حقيقية» واربط حساب MetaApi.'
              : 'البيانات حقيقية من حساب MT4/MT5 عبر MetaApi. تُحدَّث الشمعة الحالية كل 15 ثانية. هذا ليس نصيحة استثمارية.'}
          </p>
        </aside>
      </div>
    </div>
  );
}
