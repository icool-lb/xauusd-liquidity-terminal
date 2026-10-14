import { useEffect, useMemo, useRef, useState } from 'react';
import { Fold } from './components/Fold';
import { SweepMomLab } from './components/SweepMomLab';
import { ScannerPanel } from './components/ScannerPanel';
import { CouncilPanel } from './components/CouncilPanel';
import { NewsTicker } from './components/NewsTicker';
import { buildTicker } from './lib/ticker';
import { councilRound, type Round } from './lib/council';
import GoldChart from './components/GoldChart';
import { LevelsPanel, RiskCalc, StatsPanel, EventsLog, SessionPlan, ConnectionPanel, EquityCurve, LevelStats, SessionTimeline, CrewPanel } from './components/Panels';
import { DevPanel, NewsPanel, WhalePanel } from './components/V16Panels';
import { DnaPanel } from './components/DnaPanel';
import { StratPanel } from './components/StratPanel';
import { BtExpertPanel } from './components/BtExpertPanel';
import { SettingsPage } from './components/SettingsPage';
import { TimingPanel } from './components/TimingPanel';
import { RoadmapStrip, type RoadmapInfo, type DbConfirm } from './components/RoadmapStrip';
import { SignalCard } from './components/SignalCard';
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
  type Tab = 'desk' | 'lab' | 'crew' | 'tv' | 'settings';
  const [tab, setTabRaw] = useState<Tab>(() => { try { const t = localStorage.getItem('xau_tab') as Tab | null; return t && ['desk', 'lab', 'crew', 'tv', 'settings'].includes(t) ? t : 'desk'; } catch { return 'desk'; } });
  const setTab = (t: Tab) => { setTabRaw(t); try { localStorage.setItem('xau_tab', t); } catch { /* تجاهل */ } };
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

  // ---- بيانات الترابط: الفضة واليورو (مرآة الدولار) بنفس لاحقة رمز الذهب عند الوسيط ----
  const [silver, setSilver] = useState<Candle[]>([]);
  const [eurusd, setEurusd] = useState<Candle[]>([]);
  useEffect(() => {
    if (liveStatus !== 'ok' || !creds) return;
    const m = /^(XAUUSD|GOLD)(.*)$/i.exec(creds.symbol);
    const suf = m ? m[2] : '';
    const get = async () => {
      const try1 = async (syms: string[]) => { for (const sy of syms) { try { const c = await fetchHistory({ ...creds, symbol: sy }, regionRef.current, 3); if (c.length > 50) return c; } catch { /* جرّب التالي */ } } return []; };
      setSilver(await try1(['XAGUSD' + suf, 'SILVER' + suf, 'XAGUSD']));
      setEurusd(await try1(['EURUSD' + suf, 'EURUSD']));
    };
    void get();
    const id = setInterval(get, 300_000);
    return () => clearInterval(id);
  }, [liveStatus, creds]);

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
  // تحليل الشارت: إن لم يكتمل يوم التحليل بعد (افتتاح الأسبوع 22:00 UTC أو بداية كل يوم)
  // نرسم هيكل آخر يوم تداول مكتمل حتى لا يبقى الشارت أعمى — يتحول تلقائياً فور اكتمال الشموع
  const chartAnalysis: DayAnalysis | null = useMemo(() => {
    if (all.length < 10) return null;
    const live = analyzeDay(all, effDayStart);
    if (live) return live;
    for (let back = 1; back <= 4; back++) {
      const prev = analyzeDay(all, effDayStart - back * DAY);
      if (prev) return prev;
    }
    return null;
  }, [all, effDayStart]);
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
        if (!trades.length) { setDbConfirm({ ok: null, ratio: 0, total: 0, time: Date.now() }); return; } // خارج ساعات CME — سوق مغلق
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
      } catch (e) {
        // نحتفظ بآخر قيمة ناجحة؛ وإن لم يسبقها نجاح نظهر سبب الفشل بصدق بدل الانتظار الأبدي
        const msg = e instanceof Error ? e.message : 'تعذر السحب';
        setDbConfirm((prev) => prev ?? { ok: null, ratio: 0, total: 0, time: Date.now(), err: msg });
      }
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

  // ---- مجلس الخبراء: جولة كل 5 دقائق تُحفظ في المتصفح ----
  const [rounds, setRounds] = useState<Round[]>(() => { try { return JSON.parse(localStorage.getItem('xau_council') || '[]') as Round[]; } catch { return []; } });
  const councilIn = useRef({ all, analysis, silver, eurusd, account, riskPct });
  councilIn.current = { all, analysis, silver, eurusd, account, riskPct };
  useEffect(() => {
    if (liveStatus !== 'ok' || dayOffset !== 0) return;
    const tick = () => {
      const c = councilIn.current;
      const slot = Math.floor(Date.now() / 1000 / 300);
      setRounds((prev) => {
        if (prev[0]?.slot === slot) return prev;
        const r = councilRound({ gold: c.all, analysis: c.analysis, silver: c.silver, eurusd: c.eurusd, balance: c.account, riskPct: c.riskPct,
          pending: c.analysis?.momPending ? { side: c.analysis.momPending.side, limit: c.analysis.momPending.limit } : null });
        if (!r) return prev;
        const urgent = r.msgs.filter((m) => m.priority >= 2);
        if (urgent.length && prev.length) setTimeout(() => crewAlert(`🏛️ ${urgent[0].who} (${urgent[0].type}): ${urgent[0].text}`), 0);
        else if (prev[0] && prev[0].verdict.lean !== r.verdict.lean) setTimeout(() => crewAlert(`🏛️ تغيّر قرار مجلس الخبراء: ${r.verdict.text}`, false), 0);
        const next = [r, ...prev].slice(0, 48);
        try { localStorage.setItem('xau_council', JSON.stringify(next)); } catch { /* تجاهل */ }
        return next;
      });
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStatus, dayOffset, analysis != null]);
  const tickerItems = useMemo(() => buildTicker(all, dayOffset === 0 ? analysis : null, rounds[0] ?? null), [all, analysis, rounds, dayOffset]);

  const lastPrice = all.length ? all[all.length - 1].close : 0;
  const prevPrice = all.length > 1 ? all[all.length - 2].close : lastPrice;
  const delta = lastPrice - prevPrice;
  const curSession = sessionOf(Math.floor(Date.now() / 1000));
  const sig = analysis?.signals[0] ?? null;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const tabs = [
    ['desk', 'المكتب'], ['lab', 'المختبر'], ['crew', 'الخبراء والأخبار'], ['tv', 'TradingView'], ['settings', 'الإعدادات'],
  ] as const;
  const biasTxt = analysis ? (analysis.bias === 'bullish' ? '▲ فوق الافتتاح' : analysis.bias === 'bearish' ? '▼ تحت الافتتاح' : '● حول الافتتاح') : '';
  const biasCls = analysis?.bias === 'bullish' ? 'bg-emerald-400/10 text-emerald-300' : analysis?.bias === 'bearish' ? 'bg-red-400/10 text-red-300' : 'bg-slate-400/10 text-slate-300';
  const card = 'rounded-2xl border border-[#3e3e38] bg-[#262624]';

  return (
    <div dir="rtl" className="flex h-screen flex-col bg-[#1f1e1d] text-slate-200">
      {/* ===== الرأس ===== */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#3e3e38] bg-[#1f1e1d] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 font-display text-[15px] font-bold text-[#1f1e1d]">Au</div>
          <div>
            <div className="font-display text-[17px] font-bold leading-none text-slate-50">منصة سيولة الذهب</div>
            <div className="mt-1 text-[10px] text-slate-500"><span dir="ltr">XAUUSD · V36</span> · السحب والحجم · الزخم</div>
          </div>
        </div>
        <div dir="ltr" className="flex items-baseline gap-2 font-mono">
          <span className="text-[22px] font-bold text-slate-50">{lastPrice ? fmt(lastPrice) : '—'}</span>
          {lastPrice > 0 && <span className={`text-[12px] font-bold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}</span>}
        </div>
        {analysis && <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${biasCls}`}>{biasTxt}</span>}
        <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${sessionColor[curSession]}`}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />{sessionLabel[curSession]}
        </span>
        {inKillZone(Math.floor(Date.now() / 1000)) && <span className="rounded-full bg-amber-400/15 px-3 py-1 text-[11px] font-bold text-amber-300">⚡ منطقة قتل</span>}
        <div className="mr-auto flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${liveStatus === 'ok' ? 'bg-emerald-400/10 text-emerald-300' : liveStatus === 'loading' ? 'bg-slate-400/10 text-slate-300' : 'bg-red-400/10 text-red-300'}`}>
            {liveStatus === 'ok' ? '● مباشر' : liveStatus === 'loading' ? '… اتصال' : liveStatus === 'error' ? '⚠ خطأ اتصال' : '○ غير متصل'}
          </span>
          <button onClick={() => setSoundOn((v) => !v)} title="تنبيه نغمة" className={`rounded-full px-2 py-1 text-[12px] ${soundOn ? 'bg-amber-400/15' : 'opacity-50'}`}>{soundOn ? '🔔' : '🔕'}</button>
          <button onClick={() => { const nv = !voiceOn; setVoiceOn(nv); setVoice(nv); }} title="نطق عربي" className={`rounded-full px-2 py-1 text-[12px] ${voiceOn ? 'bg-amber-400/15' : 'opacity-50'}`}>{voiceOn ? '🗣' : '🤐'}</button>
          <button onClick={() => { unlockAudio(); beepLib(880); setTimeout(() => beepLib(1174), 250); speak('الصوت يعمل'); }} title="اختبار الصوت" className="rounded-full px-2 py-1 text-[12px] hover:bg-[#30302e]">🔊</button>
          <span dir="ltr" className="font-mono text-[11px] text-slate-500">{clock.toISOString().slice(11, 19)} UTC</span>
        </div>
      </header>

      {/* ===== التبويبات ===== */}
      <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#3e3e38] bg-[#1f1e1d] px-3">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`relative shrink-0 px-3.5 py-2.5 text-[12.5px] font-bold transition ${tab === k ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}>
            {l}
            {tab === k && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-amber-400" />}
          </button>
        ))}
        {liveStatus === 'ok' && dataInfo && <span dir="ltr" className="mr-auto shrink-0 font-mono text-[10px] text-slate-500">{dataInfo}</span>}
      </nav>

      {liveStatus === 'ok' && <NewsTicker items={tickerItems} />}

      {toast && (
        <div className="fixed bottom-4 left-4 z-50 max-w-[min(440px,92vw)] rounded-2xl border border-amber-400/40 bg-[#30302e] px-4 py-2.5 text-[12.5px] font-bold text-amber-200 shadow-[0_8px_40px_rgba(0,0,0,0.45)]">
          {toast}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ===== المكتب: يبقى مركّباً دائماً (الشارت والتنبيهات تعمل في الخلفية) ===== */}
        <div className={tab === 'desk' ? '' : 'hidden'}>
          {liveStatus === 'ok' && <RoadmapStrip price={lastPrice} roadmap={roadmap} archive={archiveMode} hasDbKey={!!loadDbKey()} dbConfirm={dbConfirm} />}
          {liveStatus === 'ok' && (
            <div className="mx-3 mt-3">
              <Fold id="today" title="صفقة اليوم — الخطة والأسباب والنتيجة" accent="#d97757" defaultOpen
                badge={sig ? <span className={sig.side === 'long' ? 'text-emerald-300' : 'text-red-300'}>{sig.side === 'long' ? '▲ شراء' : '▼ بيع'} {sig.status === 'active' ? '· نشطة' : sig.status === 'sl' ? '· وقف' : '· هدف'}</span> : 'لا صفقة بعد'}>
                <SignalCard analysis={analysis} price={dayOffset === 0 ? lastPrice : (analysis?.lastPrice ?? lastPrice)} />
              </Fold>
            </div>
          )}
      {analysis && (
        <div className="mx-3 mt-3 flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#3e3e38] bg-[#262624] px-3 py-2 text-[10.5px]">
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
            <div key={i} className="flex shrink-0 items-center gap-1.5 rounded-sm bg-[#30302e] px-2.5 py-1">
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

          <div className="grid gap-3 p-3 lg:grid-cols-[340px_minmax(0,1fr)_290px]">
            {/* السكانر */}
            <aside className="order-2 space-y-3 lg:order-1">
              {liveStatus !== 'ok' && (
                <div className={`${card} p-3`}>
                  <ConnectionPanel creds={creds} status={liveStatus} error={liveError}
                    onSave={(c) => { saveCreds(c); setCreds(c); }} onTest={() => creds && connectLive(creds)} />
                </div>
              )}
              {priceWarn && <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5 text-[11px] leading-relaxed text-amber-200">{priceWarn}</p>}
              <ScannerPanel all={all} account={account} riskPct={riskPct} live={liveStatus === 'ok'} />
              <CouncilPanel rounds={rounds} compact />
            </aside>

            {/* الشارت */}
            <main className={`order-1 min-w-0 ${card} p-2 lg:order-2`}>
              <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
                <div dir="ltr" className="flex rounded-xl bg-[#30302e] p-0.5 font-mono text-[10.5px]">
                  {[[300, '5m'], [900, '15m'], [1800, '30m'], [3600, '1H'], [14400, '4H'], [86400, '1D']].map(([sec, l]) => (
                    <button key={sec} onClick={() => setTf(sec as number)}
                      className={`rounded-lg px-2 py-1 transition ${tf === sec ? 'bg-amber-400 text-[#1f1e1d]' : 'text-slate-400 hover:text-slate-100'}`}>{l}</button>
                  ))}
                </div>
                <select value={dayOffset} onChange={(e) => setDayOffset(Number(e.target.value))}
                  className="rounded-xl border border-[#3e3e38] bg-[#30302e] px-2 py-1 text-[11px] text-slate-200 outline-none">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <option key={d} value={d}>{d === 0 ? 'اليوم' : `قبل ${d} يوم`}</option>)}
                </select>
                <div className="flex items-center gap-1 overflow-x-auto text-[10px] font-bold">
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
                    className="shrink-0 rounded-full border px-2.5 py-1 transition active:scale-95"
                    style={{
                      borderColor: layers[k] ? col : '#3e3e38',
                      color: layers[k] ? col : '#64748b',
                      background: layers[k] ? col + '18' : 'transparent',
                    }}
                  >
                    {layers[k] ? '◉ ' : '○ '}{label}
                  </button>
                ))}
                </div>
              </div>

              {liveStatus === 'ok' && archiveMode && (
                <div className="mb-2 rounded-xl bg-cyan-400/10 px-3 py-1.5 text-[11px] text-cyan-200">🏛️ السوق مغلق — الخبراء يعملون على الأرشيف ({btData.length.toLocaleString('en-US')} شمعة).</div>
              )}
              {liveStatus === 'ok' && dataStale && (
                <div className="mb-2 rounded-xl bg-amber-400/10 px-3 py-1.5 text-[11px] text-amber-200">⚠️ بيانات حسابك تتوقف عند {new Date(lastDataDay * 1000).toISOString().slice(0, 10)} — أعد الاتصال من الإعدادات.</div>
              )}
              <div className="relative h-[62vh] min-h-[380px] overflow-hidden rounded-xl bg-[#1f1e1d]">
                {liveStatus !== 'ok' ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                    {liveStatus === 'loading' && <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />}
                    <p className="max-w-sm text-[12.5px] leading-relaxed text-slate-400">
                      {liveStatus === 'loading' && 'جارٍ الاتصال بحسابك عبر MetaApi وسحب 30 يوماً من شموع الذهب…'}
                      {liveStatus === 'idle' && 'أدخل بيانات MetaApi في لوحة الاتصال بجانب السكانر ثم اضغط «حفظ واتصال».'}
                      {liveStatus === 'error' && liveError}
                    </p>
                  </div>
                ) : (
                  <GoldChart candles={chartAnalysis?.candles ?? []} analysis={chartAnalysis} showAll={displayCandles}
                    tfSeconds={tf} layers={layers} fallback={analysis == null && chartAnalysis != null} />
                )}
              </div>
              <div className="px-2 pb-1 pt-3">
                <SessionTimeline />
                {analysis && <div className="mt-2"><EventsLog a={analysis} /></div>}
              </div>
            </main>

            {/* المخاطرة والمستويات والتوقيت */}
            <aside className="order-3 space-y-3">
              <div className={`${card} p-3`}><RiskCalc s={sig} account={account} riskPct={riskPct} /></div>
              <Fold id="acct" title="الحساب والمخاطرة" accent="#d97757" badge={<span dir="ltr">${account.toLocaleString('en-US')} · {riskPct}%</span>}>
                <label className="mb-2 block text-[11px] text-slate-400">رأس المال ($)
                  <input type="number" value={account} min={100} step={100} onChange={(e) => setAccount(Number(e.target.value) || 0)} dir="ltr"
                    className="mt-1 w-full rounded-lg border border-[#3e3e38] bg-[#30302e] px-2 py-1.5 font-mono text-[12px] text-slate-100 outline-none focus:border-amber-400/60" />
                </label>
                <label className="block text-[11px] text-slate-400">المخاطرة لكل صفقة %
                  <input type="number" value={riskPct} min={0.25} max={5} step={0.25} onChange={(e) => setRiskPct(Number(e.target.value) || 1)} dir="ltr"
                    className="mt-1 w-full rounded-lg border border-[#3e3e38] bg-[#30302e] px-2 py-1.5 font-mono text-[12px] text-slate-100 outline-none focus:border-amber-400/60" />
                </label>
              </Fold>
              {analysis && <Fold id="levels" title="المستويات وقوتها" accent="#d97757" badge={analysis.levels.length}><LevelsPanel a={analysis} /></Fold>}
              <Fold id="timing" title="خبير التوقيت المؤسسي" accent="#a78bfa" keep>
                <TimingPanel a={analysis} wave={wave} ladder={tfLadder} dbConfirm={dbConfirm} news={newsList} account={account} riskPct={riskPct}
                  tNow={all.length ? all[all.length - 1].time : Math.floor(Date.now() / 1000)} onAlert={crewAlert} />
              </Fold>
            </aside>
          </div>
        </div>

        {/* ===== المختبر: يُحسب عند الفتح فقط ===== */}
        {tab === 'lab' && (
          <div className="grid gap-3 p-3 lg:grid-cols-2">
            {liveStatus !== 'ok' && <p className="text-[12px] text-slate-400">اتصل بحسابك أولاً — المختبر يعمل على بياناتك الحقيقية.</p>}
            {liveStatus === 'ok' && <section className={`${card} p-4 lg:col-span-2`}><h3 className="font-display mb-2 text-[16px] font-bold text-slate-50">مختبر السحب والزخم</h3><SweepMomLab candles={labData} /></section>}
            {stats && <section className={`${card} space-y-4 p-4`}><h3 className="font-display text-[16px] font-bold text-slate-50">الأداء والباك-تيست</h3><StatsPanel st={stats} /><EquityCurve st={stats} /><LevelStats st={stats} /></section>}
            {liveStatus === 'ok' && <section className={`${card} p-4`}><BtExpertPanel candles={labData} /></section>}
            {liveStatus === 'ok' && <section className={`${card} p-4 lg:col-span-2`}><StratPanel candles={labData} price={lastPrice} /></section>}
          </div>
        )}

        {/* ===== الخبراء والأخبار: الأخبار والحيتان تبقى مركّبة لأنها تُطلق التنبيهات ===== */}
        <div className={`${tab === 'crew' ? 'grid' : 'hidden'} gap-3 p-3 lg:grid-cols-2`}>
          {tab === 'crew' && <section className="lg:col-span-2"><CouncilPanel rounds={rounds} /></section>}
          {tab === 'crew' && (
            <section className={`${card} p-4`}>
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
            </section>
          )}
          <section className={`${card} p-4`}>
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
          </section>
          <section className={`${card} p-4`}><WhalePanel whales={whales} onAlert={crewAlert} onStatus={setDbOk} /></section>
          {tab === 'crew' && <section className={`${card} p-4`}><DnaPanel tfs={tfLadder} wave={wave} /></section>}
          {tab === 'crew' && <section className={`${card} p-4`}><DevPanel st={stats} whales={whales} newsCount={newsList.filter((e) => e.time + 3600 > Date.now() / 1000).length} conds={conds} /></section>}
          {tab === 'crew' && <section className={`${card} p-4`}><SessionPlan /></section>}
        </div>

        {tab === 'tv' && (
          <div className="h-full p-3">
            <iframe title="TradingView XAUUSD" dir="ltr" className={`h-[calc(100vh-130px)] w-full ${card}`}
              src="https://www.tradingview.com/widgetembed/?symbol=OANDA%3AXAUUSD&interval=15&theme=dark&style=1&locale=ar&timezone=Etc%2FUTC&hide_side_toolbar=0&allow_symbol_change=1&withdateranges=1&studies=%5B%5D" />
          </div>
        )}

        {tab === 'settings' && (
          <div className="mx-auto max-w-3xl p-3">
            <SettingsPage creds={creds} status={liveStatus} error={liveError}
              onSave={(c) => { saveCreds(c); setCreds(c); }} onTest={() => creds && connectLive(creds)} onDbStatus={setDbOk} />
          </div>
        )}

        <p className="px-4 pb-4 text-center text-[10px] text-slate-600">بيانات حقيقية من حساب MT4/MT5 عبر MetaApi · ليست نصيحة استثمارية</p>
      </div>
    </div>
  );
}
