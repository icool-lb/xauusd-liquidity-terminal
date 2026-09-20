import { useEffect, useMemo, useState } from 'react';
import GoldChart from './components/GoldChart';
import { LevelsPanel, SignalCard, RiskCalc, StatsPanel, EventsLog, SessionPlan } from './components/Panels';
import {
  generateHistory, analyzeDay, backtest, nextLiveCandle, makeRng,
  sessionOf, type Candle, type DayAnalysis,
} from './lib/engine';

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
  const [seed, setSeed] = useState(20260920);
  const [dayOffset, setDayOffset] = useState(0); // 0 = اليوم
  const [account, setAccount] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [liveCandles, setLiveCandles] = useState<Candle[]>([]);
  const [clock, setClock] = useState(new Date());

  const history = useMemo(() => generateHistory(DAYS, BASE_PRICE, seed), [seed]);

  // محاكاة تدفق لحظي على يوم اليوم
  useEffect(() => {
    setLiveCandles([]);
  }, [seed]);
  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date());
      setLiveCandles((prev) => {
        const last = prev.length ? prev[prev.length - 1] : history[history.length - 1];
        const rnd = makeRng(Math.floor(Math.random() * 1e9));
        // نضيف شمعة جديدة كل 8 نبضات، وإلا نحدّث الحالية
        if (prev.length % 8 === 7) return [...prev, nextLiveCandle(last, rnd)];
        const jitter = nextLiveCandle(last, rnd);
        const updated = { ...last, close: jitter.close, high: Math.max(last.high, jitter.high), low: Math.min(last.low, jitter.low) };
        return prev.length ? [...prev.slice(0, -1), updated] : [updated];
      });
    }, 3000);
    return () => clearInterval(id);
  }, [history]);

  const all = useMemo(() => [...history, ...liveCandles], [history, liveCandles]);

  const todayStart = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const analysis: DayAnalysis | null = useMemo(
    () => analyzeDay(all, todayStart - dayOffset * DAY),
    [all, todayStart, dayOffset]
  );
  const stats = useMemo(() => backtest(all, DAYS - 1), [all]);

  const lastPrice = all[all.length - 1]?.close ?? BASE_PRICE;
  const prevPrice = all[all.length - 2]?.close ?? lastPrice;
  const delta = lastPrice - prevPrice;
  const curSession = sessionOf(Math.floor(Date.now() / 1000));
  const sig = analysis?.signals[0] ?? null;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div dir="rtl" className="flex h-screen flex-col bg-[#050810] text-slate-200 scanlines">
      {/* ===== الرأس ===== */}
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-[#1a2540] bg-[#080c16] px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-amber-400/15 font-black text-amber-300">Au</div>
          <div>
            <div className="text-[13px] font-black leading-none text-white">منصة سيولة الذهب</div>
            <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.25em] text-slate-500" dir="ltr">XAUUSD · LIQUIDITY TERMINAL</div>
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
        <div className="mr-auto flex items-center gap-3">
          <span dir="ltr" className="font-mono text-[11px] text-slate-400">
            {clock.toISOString().slice(11, 19)} <span className="text-slate-600">UTC</span>
          </span>
          <button
            onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
            className="rounded-sm border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-300 transition hover:bg-amber-400/20 active:scale-95"
          >
            ⟳ سيناريو جديد
          </button>
        </div>
      </header>

      {/* ===== شريط المستويات ===== */}
      {analysis && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#1a2540] bg-[#070b14] px-4 py-1.5 text-[10px]">
          {[
            ['قمة الأمس', analysis.pdh, 'text-violet-300'],
            ['قمة آسيا', analysis.asiaHigh, 'text-amber-300'],
            ['الافتتاح', analysis.open, 'text-cyan-300'],
            ['قاع آسيا', analysis.asiaLow, 'text-amber-300'],
            ['قاع الأمس', analysis.pdl, 'text-violet-300'],
          ].map(([l, v, c], i) => (
            <div key={i} className="flex shrink-0 items-center gap-1.5 rounded-sm bg-[#0c1220] px-2.5 py-1">
              <span className="text-slate-500">{l}</span>
              <span dir="ltr" className={`font-mono font-bold ${c}`}>{fmt(v as number)}</span>
            </div>
          ))}
          <div className="mr-auto flex shrink-0 items-center gap-2">
            <span className="text-slate-500">الاتجاه:</span>
            <span className={`font-bold ${analysis.bias === 'bullish' ? 'text-emerald-300' : analysis.bias === 'bearish' ? 'text-red-300' : 'text-slate-400'}`}>
              {analysis.bias === 'bullish' ? '▲ صاعد (فوق الافتتاح)' : analysis.bias === 'bearish' ? '▼ هابط (تحت الافتتاح)' : '● محايد'}
            </span>
          </div>
        </div>
      )}

      {/* ===== الجسم ===== */}
      <div className="flex min-h-0 flex-1">
        {/* العمود الأيمن: المستويات */}
        <aside className="w-60 shrink-0 overflow-y-auto border-l border-[#1a2540] bg-[#080c16] p-3 space-y-5">
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
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 p-2">
            <div className="h-full rounded-md border border-[#1a2540] bg-[#050810] p-1">
              <GoldChart candles={analysis?.candles ?? []} analysis={analysis} showAll={all} />
            </div>
          </div>
          <div className="shrink-0 border-t border-[#1a2540] bg-[#080c16] px-4 py-3">
            {analysis && <EventsLog a={analysis} />}
          </div>
        </main>

        {/* العمود الأيسر: الإشارة */}
        <aside className="w-72 shrink-0 space-y-5 overflow-y-auto border-r border-[#1a2540] bg-[#080c16] p-3">
          <SignalCard s={dayOffset === 0 ? sig : analysis?.signals[0] ?? null} bias={analysis?.bias ?? 'neutral'} />
          <RiskCalc s={sig} account={account} riskPct={riskPct} />
          <StatsPanel st={stats} />
          <SessionPlan />
          <p className="rounded-sm border border-[#1a2540] bg-[#0c1220] p-2 text-[9.5px] leading-relaxed text-slate-600">
            بيانات هذه المنصة محاكاة تعليمية مبنية على سلوك الذهب اللحظي (نطاق آسيا → سحب لندن → اتجاه نيويورك). للتداول الحقيقي اربطها ببيانات وسيطك. هذا ليس نصيحة استثمارية.
          </p>
        </aside>
      </div>
    </div>
  );
}
