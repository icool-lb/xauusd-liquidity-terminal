import { useEffect, useMemo, useRef, useState } from 'react';
import GoldChart from './components/GoldChart';
import { LevelsPanel, SignalCard, RiskCalc, StatsPanel, EventsLog, SessionPlan, ConnectionPanel, EquityCurve, LevelStats, SessionTimeline, CrewPanel } from './components/Panels';
import { DevPanel, NewsPanel, WhalePanel } from './components/V16Panels';
import { DnaPanel } from './components/DnaPanel';
import { StratPanel } from './components/StratPanel';
import { BtExpertPanel } from './components/BtExpertPanel';
import { SettingsPage } from './components/SettingsPage';
import { TimingPanel } from './components/TimingPanel';
import { RoadmapStrip, type RoadmapInfo, type DbConfirm } from './components/RoadmapStrip';
import { loadDbKey, fetchGcTrades, analyzeWhales } from './lib/databento';
import { loadBtJournal } from './lib/btsuite';
import { runStrategyLab, mergedPlan } from './lib/strategies';
import { buildTfLadder, buildWave, waveSpeech } from './lib/dna';
import { unlockAudio, setVoice, beep as beepLib, speak, signalChime } from './lib/audio';
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
  const [chartView, setChartView] = useState<'engine' | 'tv' | 'settings'>('engine');
  const [creds, setCreds] = useState<MetaApiCreds | null>(() => loadCreds());
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [liveError, setLiveError] = useState('');
  const [liveData, setLiveData] = useState<Candle[]>([]);
  const [m1Data, setM1Data] = useState<Candle[]>([]);
  const [m5Data, setM5Data] = useState<Candle[]>([]);
  const [btData, setBtData] = useState<Candle[]>([]); // أرشيف عميق للباك-تيست والمختبرات
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
      // سلالم الأطر الصغرى لخبير DNA: دقيقة (يوم) + 5 دقائق (3 أيام) — بالتوازي ولا تمنع الاتصال
      void Promise.all([
        fetchHistory(c, region, 1, '1m').then(setM1Data).catch(() => setM1Data([])),
        fetchHistory(c, region, 3, '5m').then(setM5Data).catch(() => setM5Data([])),
      ]);
      // أرشيف 180 يوماً لخبير الباك-تيست اليومي ومختبر الاستراتيجيات — يعمل حتى في العطلات
      setBtData([]);
      void fetchHistory(c, region, 180).then(setBtData).catch(() => setBtData([]));
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

  // تحديث الشموع الحالية (15م + 1م) والسعر كل 5 ثوانٍ
  useEffect(() => {
    if (liveStatus !== 'ok' || !creds) return;
    const merge = (prev: Candle[], cc: Candle) => {
      if (!prev.length) return [cc];
      const last = prev[prev.length - 1];
      if (cc.time === last.time) return [...prev.slice(0, -1), cc];
      if (cc.time > last.time) return [...prev, cc];
      return prev;
    };
    const id = setInterval(async () => {
      try {
        const [c15, c1] = await Promise.all([
          fetchCurrentCandle(creds, regionRef.current),
          fetchCurrentCandle(creds, regionRef.current, '1m'),
        ]);
        setLiveData((prev) => merge(prev, c15));
        setM1Data((prev) => merge(prev, c1));
      } catch { /* تجاهل أخطاء النبضة الواحدة */ }
    }, 5000);
    // تحديث تاريخ 5 دقائق كل ساعة
    const id5 = setInterval(() => {
      fetchHistory(creds, regionRef.current, 3, '5m').then(setM5Data).catch(() => { /* تجاهل */ });
    }, 3600_000);
    return () => { clearInterval(id); clearInterval(id5); };
  }, [liveStatus, creds]);

  const all = liveData;
  // وضع العطلة/الأرشيف: إن توقفت البيانات الحية أكثر من يومين نغذي الخبراء بالأرشيف العميق
  const archiveMode = all.length > 0 && btData.length > all.length && (Date.now() / 1000 - all[all.length - 1].time) > 2 * 86400;
  const labData = archiveMode ? btData : (btData.length >= 500 ? btData : all);

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
  const conds = useMemo(() => analyzeConditions(labData, archiveMode ? 2000 : 480), [labData, archiveMode]);
  // مختبر الاستراتيجيات (ساندي كوهين)
  const stratResults = useMemo(() => (labData.length >= 300 ? runStrategyLab(labData) : []), [labData]);
  const stratPlan = useMemo(() => mergedPlan(stratResults, analysis?.lastPrice ?? 0), [stratResults, analysis]);
  // خبير DNA: سلم الأطر الثمانية + موجة التداول
  const tfLadder = useMemo(() => buildTfLadder(m1Data, m5Data, all), [m1Data, m5Data, all]);
  const wave = useMemo(() => {
    if (!tfLadder.length || !analysis) return null;
    const un = analysis.levels
      .filter((l) => !l.swept && l.kind !== 'OPEN' && Number.isFinite(l.price))
      .map((l) => ({ label: l.label, price: l.price }));
    return buildWave(tfLadder, analysis.lastPrice, un);
  }, [tfLadder, analysis]);
  // إعلان الموجة صوتياً عند تغيرها (بفاصل 4 دقائق)
  const lastWaveVoice = useRef(0);
  useEffect(() => {
    if (!wave || dayOffset !== 0) return;
    if (wave.dir === 'flat' || wave.strength < 35) return;
    const t = Date.now();
    if (t - lastWaveVoice.current < 240_000) return;
    lastWaveVoice.current = t;
    crewAlert(`🌊 يوسف النجار (خبير بصمة الشموع): ${waveSpeech(wave)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave, dayOffset]);

  // ---- خارطة الطريق: الهدف + منطقة سحب السيولة + أرقام الاختبار ----
  const roadmap = useMemo((): RoadmapInfo | null => {
    if (!wave || !analysis || wave.dir === 'flat' || !wave.path.length) return null;
    const sgn = wave.dir === 'up' ? 1 : -1;
    const un = analysis.levels.filter((l) => !l.swept && l.kind !== 'OPEN' && Number.isFinite(l.price));
    const liqLvl = un
      .filter((l) => (sgn > 0 ? l.price > analysis.lastPrice : l.price < analysis.lastPrice))
      .sort((a, b) => Math.abs(a.price - analysis.lastPrice) - Math.abs(b.price - analysis.lastPrice))[0] ?? null;
    const seen = new Set<number>();
    const testNumbers: { price: number; label: string }[] = [];
    const push = (p: number, label: string) => {
      const k = Math.round(p * 10);
      if (seen.has(k) || Math.abs(p - analysis.lastPrice) < 0.6) return;
      seen.add(k);
      testNumbers.push({ price: +p.toFixed(2), label });
    };
    wave.path.forEach((p, i) => push(p.price, i === 0 ? 'أول اختبار' : 'هدف ثانٍ'));
    wave.horizons.forEach((h) => push(h.mid, `توقع ${h.label}`));
    testNumbers.sort((a, b) => (sgn > 0 ? a.price - b.price : b.price - a.price));
    return {
      dir: wave.dir,
      target: wave.path[0].price,
      eta: wave.path[0].eta,
      liq: liqLvl ? { price: liqLvl.price, label: liqLvl.label } : null,
      testNumbers: testNumbers.slice(0, 5),
    };
  }, [wave, analysis]);

  // ---- تأكيد Databento للموجة: فحص تدفق GC كل 10 دقائق ----
  const [newsList, setNewsList] = useState<NewsEvent[]>([]);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [dbConfirm, setDbConfirm] = useState<DbConfirm | null>(null);
  useEffect(() => {
    if (!dbOk) return;
    let dead = false;
    const tick = async () => {
      const key = loadDbKey();
      if (!key || dead) return;
      try {
        const trades = await fetchGcTrades(key, 1.5);
        if (dead) return;
        if (!trades.length) { setDbConfirm(null); return; } // خارج ساعات CME
        const s = analyzeWhales(trades);
        const totalVol = s.buyVol + s.sellVol;
        if (!totalVol) return;
        const ratio = s.buyVol / totalVol;
        const d = wave?.dir;
        const ok: boolean | null =
          d && d !== 'flat'
            ? d === 'up'
              ? ratio >= 0.56 ? true : ratio <= 0.46 ? false : null
              : ratio <= 0.44 ? true : ratio >= 0.54 ? false : null
            : null;
        setDbConfirm({ ok, ratio, total: s.total, time: Date.now() });
      } catch { /* نحتفظ بآخر قيمة ناجحة */ }
    };
    void tick();
    const id = setInterval(tick, 600_000);
    return () => { dead = true; clearInterval(id); };
  }, [dbOk, wave?.dir]);

  // تنبيه صوتي عند انقلاب تأكيد Databento إلى معاكس للموجة
  const lastDbAlert = useRef(0);
  useEffect(() => {
    if (dbConfirm?.ok !== false || !wave || wave.dir === 'flat' || dayOffset !== 0) return;
    const t = Date.now();
    if (t - lastDbAlert.current < 1200_000) return;
    lastDbAlert.current = t;
    crewAlert(`⚠️ جيك ليفيت (Databento): تدفق المؤسسات ${wave.dir === 'up' ? 'بيعي يعاكس الموجة الصاعدة' : 'شرائي يعاكس الموجة الهابطة'} — الانتظار أفضل من الدخول عكس رأس المال`, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbConfirm, wave, dayOffset]);

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

  // نظام الصوت: النغمات + النطق العربي — يُفتح قفل الصوت بأول لمسة في الصفحة
  const [soundOn, setSoundOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 10000);
  };
  // إعلام طاقم كامل: نافذة + نغمة + نطق عربي
  const crewAlert = (msg: string, chime = true) => {
    showToast(msg);
    if (soundOn && chime) signalChime(); else if (soundOn) beepLib(880);
    speak(msg);
  };
  // يُفتح قفل الصوت والنطق بأول لمسة في الصفحة (شرط المتصفحات)
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);
  const lastSigId = useRef<string>('');
  useEffect(() => {
    const s = analysis?.signals[0];
    if (!s || dayOffset !== 0) return;
    if (lastSigId.current && lastSigId.current !== s.id) {
      crewAlert(`🔔 أليكس ريد (خبير الاستراتيجيات): إشارة ${s.side === 'long' ? 'شراء' : 'بيع'} عند ${s.entry} — وقف ${s.stop} — ${s.reason || 'حسب محرك ICT'}`);
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
      crewAlert(`🔔 مايكل روس (خبير نيويورك): بدأت منطقة القتل — أفضل نافذة تنفيذ، راقب السيولة غير المكتسحة`);
    }
    if (!kz && lastKz.current) {
      crewAlert(`🔔 كينجي ساتو (خبير طوكيو): انتهت نافذة القتل — تقلب السوق سيهدأ الآن`, false);
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
            <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.25em] text-slate-500" dir="ltr">XAUUSD · LIQUIDITY TERMINAL · V23</div>
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
            title="تنبيه نغمة عند الإشارات"
            className={`rounded-sm border px-2 py-1 text-[11px] transition ${soundOn ? 'border-amber-400/40 text-amber-300' : 'border-[#2a3a5f] text-slate-600'}`}
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
          <button
            onClick={() => { const nv = !voiceOn; setVoiceOn(nv); setVoice(nv); }}
            title="إعلام صوتي منطوق بالعربية"
            className={`rounded-sm border px-2 py-1 text-[11px] transition ${voiceOn ? 'border-emerald-400/40 text-emerald-300' : 'border-[#2a3a5f] text-slate-600'}`}
          >
            {voiceOn ? '🗣' : '🤐'}
          </button>
          <button
            onClick={() => { unlockAudio(); beepLib(880); setTimeout(() => beepLib(1174), 250); speak('الصوت يعمل يا بطل'); }}
            title="اختبار الصوت والنطق"
            className="rounded-sm border border-[#2a3a5f] px-2 py-1 text-[11px] text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-300"
          >
            🔊
          </button>
          <span dir="ltr" className="font-mono text-[11px] text-slate-400">
            {clock.toISOString().slice(11, 19)} <span className="text-slate-600">UTC</span>
          </span>
        </div>
      </header>

      {/* ===== شريط خارطة الطريق: التوجه + أرقام الاختبار + تأكيد Databento ===== */}
      {liveStatus === 'ok' && (
        <RoadmapStrip
          price={lastPrice}
          roadmap={roadmap}
          archive={archiveMode}
          hasDbKey={!!loadDbKey()}
          dbConfirm={dbConfirm}
        />
      )}

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
            <button
              onClick={() => setChartView('settings')}
              className={`rounded-sm px-2.5 py-1 transition ${chartView === 'settings' ? 'bg-[#111a2b] text-amber-300' : 'text-slate-500 hover:text-white'}`}
            >
              ⚙️ الإعدادات
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
          {/* وضع العطلة: عمل الخبراء على الأرشيف */}
          {liveStatus === 'ok' && archiveMode && (
            <div className="mx-3 mt-1.5 shrink-0 rounded-sm border border-cyan-400/40 bg-cyan-400/10 px-2 py-1 text-[10px] leading-relaxed text-cyan-200">
              🏛️ البورصة مغلقة والبيانات الحية متوقفة — وضع الأرشيف نشط: خبير الباك-تيست ومختبر الاستراتيجيات ومحلل الشروط يعملون على {btData.length.toLocaleString('en-US')} شمعة أرشيفية (~{Math.round(btData.length / 96)} يوماً) لتطوير المنصة حتى أيام العطلة.
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
              {chartView === 'settings' ? (
                <SettingsPage
                  creds={creds}
                  status={liveStatus}
                  error={liveError}
                  onSave={(c) => { saveCreds(c); setCreds(c); }}
                  onTest={() => creds && connectLive(creds)}
                  onDbStatus={setDbOk}
                />
              ) : chartView === 'engine' ? (
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
          <TimingPanel
            a={analysis}
            wave={wave}
            ladder={tfLadder}
            dbConfirm={dbConfirm}
            news={newsList}
            account={account}
            riskPct={riskPct}
            tNow={all.length ? all[all.length - 1].time : Math.floor(Date.now() / 1000)}
            onAlert={crewAlert}
          />
          {stats && <StatsPanel st={stats} />}
          {stats && <EquityCurve st={stats} />}
          {stats && <LevelStats st={stats} />}
          <CrewPanel
            a={analysis}
            st={stats}
            lastCandleTime={all.length ? all[all.length - 1].time : 0}
            extra={{
              news: newsList, whales, conds, dbOk,
              btToday: (() => { const j = loadBtJournal(); const t = j[0]; return t && t.date === new Date().toISOString().slice(0, 10) ? { baselineExp: t.baselineExp, topLabel: t.topLabel, topExp: t.topExp } : null; })(),
              stratBest: stratResults[0] ?? null,
              stratLive: stratPlan && stratPlan.side !== 'flat' ? `${stratPlan.side === 'long' ? 'شراء' : 'بيع'} بثقة ${stratPlan.confidence}%` : undefined,
            }}
            wave={wave}
          />
          <DevPanel st={stats} whales={whales} newsCount={newsList.filter((e) => e.time + 3600 > Date.now() / 1000).length} conds={conds} />
          <NewsPanel
            candles={all}
            balance={account}
            riskPct={riskPct}
            onAlert={crewAlert}
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
          <WhalePanel whales={whales} onAlert={crewAlert} onStatus={setDbOk} />
          <DnaPanel tfs={tfLadder} wave={wave} />
          {liveStatus === 'ok' && <BtExpertPanel candles={labData} />}
          {liveStatus === 'ok' && <StratPanel candles={labData} price={lastPrice} />}
          <SessionPlan />
          <p className="rounded-sm border border-[#1a2540] bg-[#0c1220] p-2 text-[9.5px] leading-relaxed text-slate-600">
            بيانات حقيقية مباشرة من حساب MT4/MT5 عبر MetaApi — 30 يوماً من شموع M15، ويتحدث السعر والشمعة الحالية كل 5 ثوانٍ. هذا ليس نصيحة استثمارية.
          </p>
        </aside>
      </div>
    </div>
  );
}
