import { useEffect, useMemo, useRef, useState } from 'react';
import GoldChart from './components/GoldChart';
import { LevelsPanel, SignalCard, RiskCalc, StatsPanel, EventsLog, SessionPlan, ConnectionPanel, EquityCurve, LevelStats, SessionTimeline, CrewPanel } from './components/Panels';
import { DevPanel, NewsPanel, WhalePanel } from './components/V16Panels';
import {
  analyzeDay, backtestFull, sessionOf, inKillZone, aggregate, detectWhales, analyzeConditions,
  type Candle, type DayAnalysis, type NewsEvent,
} from './lib/engine';
import {
  loadCreds, saveCreds, loadRegion, resolveAccount, fetchHistory, fetchCurrentCandle, fetchPrice,
  type MetaApiCreds,
} from './lib/metaapi';
const DAY = 24 * 3600;
const BT_DAYS = 25; // أيام الباك-تيست من التاريخ المحمَّل (30 يوماً)

const sessionLabel: Record<string, string> = {
  asia: 'جلسة آسيا', london: 'جلسة لندن', ny: 'جلسة نيويورك', off: 'خارج الجلسات',
};
const sessionColor: Record<string, string> = {
  asia: 'text-amber-300 border-amber-400/40', london: 'text-cyan-300 border-cyan-400/40',
  ny: 'text-emerald-300 border-emerald-400/40', off: 'text-slate-500 border-slate-600',
};

export default function App() {
  // ---- بيانات حقيقية فقط (MetaApi) ----
  const [chartView, setChartView] = useState<'engine' | 'tv'>('engine');
  const [creds, setCreds] = useState<MetaApiCreds | null>(() => loadCreds());
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [liveError, setLiveError] = useState('');
  const [liveData, setLiveData] = useState<Candle[]>([]);
  const [dataInfo, setDataInfo] = useState('');
  const [priceWarn, setPriceWarn] = useState('');
  const regionRef = useRef<string>(loadRegion());

  // ---- مشترك ----
  const [dayOffset, setDayOffset] = useState(0);
  const [account, setAccount] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // جلب 30 يوماً من شموع M15 + التحقق من تطابق السعر مع اللحظي
  const connectLive = async (c: MetaApiCreds) => {
    setLiveStatus('loading');
    setLiveError('');
    setPriceWarn('');
    try {
      const region = await resolveAccount(c);
      regionRef.current = region;
      const candles = await fetchHistory(c, region, 30);
      setLiveData(candles);
      if (candles.length) {
        const from = new Date(candles[0].time * 1000).toISOString().slice(5, 16).replace('T', ' ');
        const to = new Date(candles[candles.length - 1].time * 1000).toISOString().slice(5, 16).replace('T', ' ');
        setDataInfo(`${c.symbol} · ${candles.length} شمعة · ${from} ← ${to} UTC`);
      } else setDataInfo('');
      // فحص سلامة: آخر إغلاق تاريخي يجب أن يطابق السعر اللحظي للوسيط
      try {
        const px = await fetchPrice(c, region);
        const last = candles[candles.length - 1]?.close;
        if (last && px?.bid && Math.abs(last - px.bid) / px.bid > 0.015) {
          setPriceWarn(
            `آخر إغلاق تاريخي (${last.toFixed(2)}) يختلف عن السعر اللحظي لوسيطك (${px.bid.toFixed(2)}) — ` +
            `تأكد أن «${c.symbol}» هو رمز الذهب الفوري الصحيح لدى وسيطك (جرّب XAUUSD / XAUUSD. / GOLD)`
          );
        }
      } catch { /* فحص اختياري */ }
      setLiveStatus('ok');
    } catch (e) {
      setLiveStatus('error');
      setLiveError(e instanceof Error ? e.message : 'خطأ غير معروف');
    }
  };

  useEffect(() => {
    if (creds?.token && creds?.accountId) connectLive(creds);
    else setLiveStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds]);

  // تحديث الشمعة الحالية والسعر كل 5 ثوانٍ
  useEffect(() => {
    if (liveStatus !== 'ok' || !creds) return;
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
    }, 5000);
    return () => clearInterval(id);
  }, [liveStatus, creds]);

  const all = liveData;

  // ---- الفريمات والطبقات التلقائية ----
  const [tf, setTf] = useState(900); // بالثواني
  const [layers, setLayers] = useState({ fvg: true, bos: true, liq: true, sess: false, ob: true });

  const todayStart = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const lastDataDay = all.length ? Math.floor(all[all.length - 1].time / DAY) * DAY : todayStart;
  const effDayStart = Math.min(todayStart - dayOffset * DAY, lastDataDay);
  const dataStale = all.length > 0 && todayStart - lastDataDay >= DAY * 2;

  const analysis: DayAnalysis | null = useMemo(
    () => (all.length >= 10 ? analyzeDay(all, effDayStart) : null),
    [all, effDayStart]
  );
  const stats = useMemo(() => (all.length >= 200 ? backtestFull(all, BT_DAYS) : null), [all]);
  const whales = useMemo(() => detectWhales(all), [all]);
  const conds = useMemo(() => analyzeConditions(all), [all]);
  const [newsList, setNewsList] = useState<NewsEvent[]>([]);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
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

  // تنبيه صوتي عند اكتمال إشارة جديدة (منسوب لخبير الاستراتيجيات)
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 10000);
  };
  const beep = (freq = 880) => {
    if (!soundOn) return;
    try {
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.frequency.value = freq; gain.gain.value = 0.08;
      osc.start(); osc.stop(ac.currentTime + 0.35);
    } catch { /* الصوت غير متاح */ }
  };
  const lastSigId = useRef<string>('');
  useEffect(() => {
    const s = analysis?.signals[0];
    if (!s || dayOffset !== 0) return;
    if (lastSigId.current && lastSigId.current !== s.id) {
      showToast(`🔔 أليكس ريد (خبير الاستراتيجيات): إشارة ${s.side === 'long' ? 'شراء' : 'بيع'} @ ${s.entry} — وقف ${s.stop} — ${s.reason || 'حسب محرك ICT'}`);
      beep(880);
    }
    lastSigId.current = s.id;
  }, [analysis, dayOffset, soundOn]);

  // تنبيه بداية/نهاية الكيلزون (منسوب لخبير نيويورك وخبير طوكيو)
  const lastKz = useRef(false);
  useEffect(() => {
    const t = all.length ? all[all.length - 1].time : 0;
    if (!t || dayOffset !== 0) return;
    const kz = inKillZone(t);
    if (kz && !lastKz.current) {
      showToast(`🔔 مايكل روس (خبير نيويورك): بدأ Kill Zone — أفضل نافذة تنفيذ، راقب السيولة غير المكتسحة`);
      beep(1320);
    }
    if (!kz && lastKz.current) {
      showToast(`🔔 كينجي ساتو (خبير طوكيو): انتهت نافذة الكيلزون — تقلب السوق سيهدأ الآن`);
    }
    lastKz.current = kz;
  }, [all, dayOffset, soundOn]);

  const lastPrice = all.length ? all[all.length - 1].close : 0;
  const prevPrice = all.length > 1 ? all[all.length - 2].close : lastPrice;
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
            <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.25em] text-slate-500" dir="ltr">XAUUSD · LIQUIDITY TERMINAL · V17</div>
          </div>
        </div>
        <div className="h-6 w-px bg-[#1a2540]" />
        <div dir="ltr" className="flex items-baseline gap-2 font-mono">
          <span className="text-lg font-black text-white">{lastPrice ? fmt(lastPrice) : '—'}</span>
          {lastPrice > 0 && (
            <span className={`text-[11px] font-bold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}
            </span>
          )}
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
        {liveStatus === 'ok' && (
          <span className="flex items-center gap-1.5 rounded-sm border border-emerald-400/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            بيانات حقيقية · مباشر
          </span>
        )}

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
        </div>
      </header>

      {/* ===== شريط المستويات ===== */}
      {analysis && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#1a2540] bg-[#070b14] px-4 py-1.5 text-[10px]">
          {([
            ['قمة الأمس', analysis.pdh, 'text-violet-300'],
            ['ق لندن', analysis.londonHigh, 'text-cyan-200'],
            ['قاع لندن', analysis.londonLow, 'text-cyan-200'],
            ['قمة آسيا', analysis.asiaHigh, 'text-amber-300'],
            ['الافتتاح', analysis.open, 'text-cyan-300'],
            ['قاع آسيا', analysis.asiaLow, 'text-amber-300'],
            ['ق نيويورك', analysis.nyHigh, 'text-emerald-200'],
            ['قاع نيويورك', analysis.nyLow, 'text-emerald-200'],
            ['إغلاق نيويورك أمس', analysis.prevNyClose, 'text-orange-300'],
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
              {analysis.bias === 'bullish' ? '▲ إيجابي — فوق الافتتاح' : analysis.bias === 'bearish' ? '▼ سلبي — أسفل الافتتاح' : '● محايد'}
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
        {/* العمود الأيمن: الاتصال + المستويات */}
        <aside className="order-2 w-full shrink-0 space-y-5 border-b border-[#1a2540] bg-[#080c16] p-3 lg:order-1 lg:w-60 lg:border-b-0 lg:border-l lg:overflow-y-auto">
          <ConnectionPanel
            creds={creds}
            status={liveStatus}
            error={liveError}
            onSave={(c) => { saveCreds(c); setCreds(c); }}
            onTest={() => creds && connectLive(creds)}
          />
          {liveStatus === 'ok' && dataInfo && (
            <p dir="ltr" className="rounded-sm bg-emerald-400/5 px-2 py-1 text-center font-mono text-[9.5px] text-emerald-300/80">{dataInfo}</p>
          )}
          {priceWarn && (
            <p className="rounded-sm border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300">{priceWarn}</p>
          )}
          {/* اختيار اليوم */}
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">يوم التحليل</div>
            <div className="grid grid-cols-5 gap-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
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
            {liveStatus === 'ok' && dataInfo && (
              <span dir="ltr" className="mr-auto rounded-sm bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-300">{dataInfo}</span>
            )}
          </div>
          {/* شريط الطبقات التلقائية */}
          {chartView === 'engine' && (
            <div className="shrink-0 px-3 pt-1.5">
              <div className="flex items-center gap-1 overflow-x-auto text-[9.5px] font-bold">
                <span className="shrink-0 text-slate-500">كشف تلقائي:</span>
                {([
                  ['fvg', 'FVG', '#64748b'],
                  ['bos', 'BOS / CHoCH', '#e879f9'],
                  ['ob', 'أوردر بلوك', '#34d399'],
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
            </div>
          )}
          {/* تحذير البيانات الراكدة */}
          {liveStatus === 'ok' && dataStale && (
            <div className="mx-3 mt-1.5 shrink-0 rounded-sm border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] leading-relaxed text-amber-300">
              ⚠️ بيانات حسابك تتوقف عند {new Date(lastDataDay * 1000).toISOString().slice(0, 10)} — اضغط «حفظ واتصال» لإعادة الجلب، وإن استمرت المشكلة فتأكد أن الحساب يعمل (DEPLOYED) وأن الوسيط يوفّر بيانات الرمز.
            </div>
          )}
          <div className="min-h-0 flex-1 p-2">
            <div className="relative h-full overflow-hidden rounded-md border border-[#1a2540] bg-[#050810] p-1">
              {chartView === 'engine' ? (
                liveStatus !== 'ok' ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    {liveStatus === 'loading' && <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />}
                    <p className="max-w-sm text-[12px] leading-relaxed text-slate-400">
                      {liveStatus === 'loading' && 'جارٍ الاتصال بحسابك عبر MetaApi وسحب 30 يوماً من شموع الذهب…'}
                      {liveStatus === 'idle' && 'أدخل بيانات MetaApi في اللوحة الجانبية (API Token + Account ID + الرمز) ثم اضغط «حفظ واتصال»'}
                      {liveStatus === 'error' && liveError}
                    </p>
                  </div>
                ) : (
                  <GoldChart
                    candles={analysis?.candles ?? []}
                    analysis={analysis}
                    showAll={displayCandles}
                    tfSeconds={tf}
                    layers={layers}
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
          <CrewPanel
            a={analysis}
            st={stats}
            lastCandleTime={all.length ? all[all.length - 1].time : 0}
            extra={{ news: newsList, whales, conds, dbOk }}
          />
          <DevPanel st={stats} whales={whales} newsCount={newsList.filter((e) => e.time + 3600 > Date.now() / 1000).length} conds={conds} />
          <NewsPanel
            balance={account}
            riskPct={riskPct}
            onAlert={showToast}
            onChange={setNewsList}
            ctx={analysis ? {
              bias: analysis.bias,
              h1Bias,
              lastPrice: analysis.lastPrice,
              open: analysis.open,
              lastWhaleSide: whales.length ? whales[whales.length - 1].side : undefined,
              nearLiquidity: (() => {
                const un = analysis.levels.filter((l) => !l.swept && l.kind !== 'OPEN' && Number.isFinite(l.price));
                const ab = un.filter((l) => l.price > analysis.lastPrice).sort((x, y) => x.price - y.price)[0];
                const be = un.filter((l) => l.price < analysis.lastPrice).sort((x, y) => y.price - x.price)[0];
                if (ab && be) return Math.abs(ab.price - analysis.lastPrice) < Math.abs(analysis.lastPrice - be.price) ? `${ab.label} أعلى` : `${be.label} أسفل`;
                return ab ? `${ab.label} أعلى` : be ? `${be.label} أسفل` : undefined;
              })(),
            } : null}
          />
          <WhalePanel whales={whales} onAlert={showToast} onStatus={setDbOk} />
          <SessionPlan />
          <p className="rounded-sm border border-[#1a2540] bg-[#0c1220] p-2 text-[9.5px] leading-relaxed text-slate-600">
            بيانات حقيقية مباشرة من حساب MT4/MT5 عبر MetaApi — 30 يوماً من شموع M15، ويتحدث السعر والشمعة الحالية كل 5 ثوانٍ. هذا ليس نصيحة استثمارية.
          </p>
        </aside>
      </div>
    </div>
  );
}
