import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NEWS_PRESETS, newsImpactNote, newsLotSuggestion, forecastNews,
  type BacktestFull, type NewsEvent, type WhalePrint, type ConditionStat, type NewsCtx,
} from '../lib/engine';
import { fetchWeekCalendar } from '../lib/newsfeed';
import { loadDbKey, saveDbKey, checkDbKey, fetchGcTrades, analyzeWhales, type DbWhaleStats } from '../lib/databento';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const utcHM = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);

// ============================================================
// مدير تطوير المنصة — يقترح آلياً ويعرض على المهندسين والمحللين
// ============================================================

interface Proposal {
  id: string;
  by: string;       // صاحب الاقتراح
  color: string;
  text: string;     // نص الاقتراح
  goal: string;     // الهدف التجاري (صيد 10$ على 0.01)
  born: number;     // وقت الاقتراح
}

const STAGES = ['مقترح من مدير التطوير', 'معروض على مهندسي الصفقات', 'قيد مراجعة المحللين', 'معتمد في خطة التطوير'];
const STAGE_SEC = 40;

export function DevPanel({ st, whales, newsCount, conds }: { st: BacktestFull | null; whales: WhalePrint[]; newsCount: number; conds: ConditionStat[] }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 10000);
    return () => clearInterval(id);
  }, []);

  // توليد الاقتراحات تلقائياً من إحصاءات المنصة الفعلية
  const auto = useMemo(() => {
    const out: Omit<Proposal, 'born'>[] = [];
    if (st) {
      if (st.winRate < 45) out.push({ id: 'p1', by: 'مدير التطوير', color: '#fbbf24', text: `نسبة نجاح الإشارات ${st.winRate}% دون الحد الأدنى — شدّد فلتر R:R إلى 1:2.5 واشترط فتيل سحب ≥ 3$`, goal: 'رفع جودة الدخول لصيد حركة 10$ على 0.01 بثقة أعلى' });
      if (st.expectancyR > 0) out.push({ id: 'p2', by: 'مدير التطوير', color: '#fbbf24', text: `التوقع الإيجابي ${st.expectancyR}R — أضف دخولاً ثانياً بنفس الوقف بعد تحقيق الهدف الأول`, goal: 'مضاعفة فرص 10$ على 0.01 من نفس الإشارة' });
      if (st.maxDrawdownR > 6) out.push({ id: 'p3', by: 'مدير التطوير', color: '#fbbf24', text: `أقصى تراجع ${st.maxDrawdownR}R مرتفع — فعّل حظر التداول بعد خسارتين متتاليتين في اليوم`, goal: 'حماية رأس المال من السحوبات التي تلتهم أرباح عشرات الصفقات الرابحة' });
    }
    if (whales.length >= 2) out.push({ id: 'p4', by: 'خبير الحيتان', color: '#22d3ee', text: `${whales.length} بصمات حيتان خلال آخر 24 ساعة — اربط الإشارات بفلتر تزامن مع بصمة حجم`, goal: 'ركوب موجة رأس المال المؤسسي لحركة 10$+ على 0.01' });
    if (newsCount > 0) out.push({ id: 'p5', by: 'مديرة الأخبار', color: '#f87171', text: `${newsCount} أخبار مجدولة — أضف حظر دخول آلي من 10 دقائق قبل الخبر حتى شمعة إغلاق بعده`, goal: 'تفادي سيولة الخبر العكسية والدخول بعد امتصاصها بحركة نظيفة 10$' });
    if (conds.length && conds[0].winRate >= 55) out.push({ id: 'p6', by: 'خبير استراتيجيات المنصات', color: '#34d399', text: `شرط «${conds[0].name}» نجح ${conds[0].winRate}% على بياناتك — ابنِ عليه إشارة مساعدة`, goal: 'مصدر دخل إضافي 10$ على 0.01 من الشروط المثبتة' });
    return out;
  }, [st, whales.length, newsCount, conds]);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    setProposals((prev) => {
      const fresh = auto.filter((p) => !seen.current.has(p.id) && !prev.some((q) => q.id === p.id));
      if (!fresh.length) return prev;
      fresh.forEach((p) => seen.current.add(p.id));
      return [...prev, ...fresh.map((p) => ({ ...p, born: Date.now() }))];
    });
  }, [auto]);

  const now = Date.now();
  const stageOf = (p: Proposal) => Math.min(3, Math.floor((now - p.born) / (STAGE_SEC * 1000)));
  const stageColor = ['#fbbf24', '#22d3ee', '#a78bfa', '#34d399'];

  return (
    <div className="rounded-sm border border-amber-400/25 bg-[#0c1220] p-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">مدير تطوير المنصة — دورة الاقتراحات</h3>
      </div>
      {proposals.length === 0 && (
        <p className="text-[10px] leading-relaxed text-slate-500">بانتظار بيانات كافية (اتصال + باك-تيست) لتوليد اقتراحات تطوير آلية…</p>
      )}
      <div className="space-y-1.5">
        {proposals.slice(-5).reverse().map((p) => {
          const s = stageOf(p);
          return (
            <div key={p.id} className="rounded-sm border border-[#1a2540] bg-[#080c16] p-2">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="text-[9px] font-black" style={{ color: p.color }}>{p.by}</span>
                <span className="h-px flex-1 bg-[#1a2540]" />
                <span className="text-[8.5px] font-bold" style={{ color: stageColor[s] }}>{STAGES[s]}</span>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-300">{p.text}</p>
              <p className="mt-0.5 text-[9px] text-emerald-400/80">🎯 الهدف: {p.goal}</p>
              <div className="mt-1 flex gap-0.5">
                {STAGES.map((_, i) => (
                  <div key={i} className="h-0.5 flex-1 rounded-full" style={{ background: i <= s ? stageColor[i] : '#1a2540' }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[8.5px] leading-relaxed text-slate-600">الحلقة تلقائية: مدير التطوير يولّد اقتراحاً من إحصاءات المنصة الفعلية ← يُعرض على مهندسي الصفقات ← يراجعه المحللون ← يُعتمد في خطة التطوير. والعكس: أي خبير يلاحظ فرصة صيد (10$ على 0.01) يقترح تعديلاً مباشرة.</p>
    </div>
  );
}

// ============================================================
// مديرة الأخبار الاقتصادية والجيوسياسية — توقع + تنبيه + لوت
// ============================================================

const LS_NEWS = 'xau_news_events';

function loadNews(): NewsEvent[] {
  try { return JSON.parse(localStorage.getItem(LS_NEWS) ?? '[]'); } catch { return []; }
}
function saveNews(list: NewsEvent[]) {
  try { localStorage.setItem(LS_NEWS, JSON.stringify(list)); } catch { /* تجاهل */ }
}

export function NewsPanel({ balance, riskPct, onAlert, onChange, ctx }: {
  balance: number; riskPct: number; onAlert: (msg: string) => void;
  onChange?: (list: NewsEvent[]) => void; ctx?: NewsCtx | null;
}) {
  const [list, setList] = useState<NewsEvent[]>(loadNews);
  const [open, setOpen] = useState(true);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', time: '12:30', currency: 'USD', impact: 'high' as NewsEvent['impact'], forecast: '', previous: '' });
  const [autoMsg, setAutoMsg] = useState('');
  const [autoOk, setAutoOk] = useState<boolean | null>(null);
  const alerted = useRef(new Set<string>());
  const booted = useRef(false);

  useEffect(() => { saveNews(list); onChange?.(list); }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  // لينا تجلب جدول الأسبوع تلقائياً وتدمجه مع المخزّن
  const autoLoad = async () => {
    setAutoOk(null);
    setAutoMsg('لينا تجلب جدول أخبار الأسبوع تلقائياً…');
    try {
      const fresh = await fetchWeekCalendar();
      setList((prev) => {
        const ids = new Set(prev.map((e) => e.id));
        const merged = [...prev, ...fresh.filter((e) => !ids.has(e.id))].sort((a, b) => a.time - b.time).slice(0, 60);
        return merged;
      });
      setAutoOk(true);
      setAutoMsg(`لينا نظّمت ${fresh.length} خبراً هذا الأسبوع — التوقعات والتنبيهات جاهزة`);
    } catch {
      setAutoOk(false);
      setAutoMsg('تعذر الجلب التلقائي (شبكة/مصدر) — الجدول المخزّن والإضافة اليدوية متاحان، وسأعيد المحاولة تلقائياً كل ساعة');
    }
  };

  useEffect(() => {
    if (!booted.current) { booted.current = true; autoLoad(); }
    const id = setInterval(() => { if (document.visibilityState === 'visible') autoLoad(); }, 3600_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = Date.now() / 1000;

  // تنبيهات تلقائية قبل الخبر وبعده (بصوت لينا)
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now() / 1000;
      for (const ev of list) {
        const d = ev.time - t;
        if (d > 0 && d <= 600 && !alerted.current.has(ev.id + '-10')) {
          alerted.current.add(ev.id + '-10');
          const f = forecastNews(ev, ctx ?? null);
          onAlert(`🔔 لينا حداد (مديرة الأخبار): «${ev.title}» بعد ${Math.round(d / 60)} دقيقة — توقعي: ${f.lean}`);
        }
        if (d <= 0 && d > -120 && !alerted.current.has(ev.id + '-0')) {
          alerted.current.add(ev.id + '-0');
          onAlert(`⚡ لينا: صدر «${ev.title}» الآن — ${newsImpactNote(ev).move} — انتظري شمعة 15 دقيقة كاملة قبل أي دخول`);
        }
      }
    }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, ctx]);

  const addEvent = (preset?: (typeof NEWS_PRESETS)[number]) => {
    const base = preset ?? { title: form.title, currency: form.currency, impact: form.impact, forecast: form.forecast, previous: form.previous };
    if (!base.title || !form.date) return;
    const time = Math.floor(new Date(`${form.date}T${form.time}:00Z`).getTime() / 1000);
    if (!Number.isFinite(time)) return;
    setList((l) => [...l, { ...base, id: 'man-' + Math.random().toString(36).slice(2), time }].sort((x, y) => x.time - y.time));
  };

  const upcoming = list.filter((e) => e.time + 7200 > now).slice(0, 6);
  const sug = newsLotSuggestion(balance || 1000, riskPct || 1, 15);

  return (
    <div className="rounded-sm border border-red-400/25 bg-[#0c1220] p-2">
      <button onClick={() => setOpen((v) => !v)} className="mb-1.5 flex w-full items-center gap-1.5 text-right">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300">مديرة الأخبار — تنظيم ذاتي وتوقعات</h3>
        <div className="h-px flex-1 bg-[#1a2540]" />
        <span className="text-[10px] text-slate-600">{open ? '▲ طي' : '▼ عرض'}</span>
      </button>
      {open && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${autoOk === true ? 'bg-emerald-400' : autoOk === false ? 'bg-amber-400' : 'animate-pulse bg-red-400'}`} />
            <p className={`flex-1 text-[9px] leading-relaxed ${autoOk === true ? 'text-emerald-400/90' : 'text-slate-400'}`}>{autoMsg || 'جارٍ التهيئة…'}</p>
            <button onClick={autoLoad} className="shrink-0 rounded-sm border border-[#2a3a5f] px-1.5 py-0.5 text-[8.5px] text-slate-400 transition hover:border-red-400/40 hover:text-red-300">تحديث الجدول</button>
          </div>

          {upcoming.map((ev) => {
            const f = forecastNews(ev, ctx ?? null);
            const mins = Math.round((ev.time - now) / 60);
            const sideColor = f.leanSide === 'up' ? 'text-emerald-300' : f.leanSide === 'down' ? 'text-red-300' : 'text-amber-300';
            return (
              <div key={ev.id} className="rounded-sm border border-[#1a2540] bg-[#080c16] p-2">
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-sm px-1.5 py-0.5 text-[8.5px] font-black ${ev.impact === 'high' ? 'bg-red-400/15 text-red-300' : 'bg-amber-400/15 text-amber-300'}`}>
                    {ev.impact === 'high' ? 'عالي' : 'متوسط'}
                  </span>
                  <span className="flex-1 text-[10.5px] font-bold text-white">{ev.title}</span>
                  <span dir="ltr" className="font-mono text-[9px] text-slate-500">
                    {new Date(ev.time * 1000).toISOString().slice(5, 16).replace('T', ' ')} UTC
                  </span>
                  <button onClick={() => setList((l) => l.filter((x) => x.id !== ev.id))} className="text-[9px] text-slate-600 hover:text-red-400">✕</button>
                </div>
                <div className="mt-0.5 text-[9px] text-slate-500">
                  <span className="text-slate-400">{mins > 0 ? `⏱ بعد ${mins} دقيقة` : '⏱ صدر'}</span>
                  {ev.forecast && <span className="mr-2">توقعات السوق: {ev.forecast}</span>}
                  {ev.previous && <span className="mr-2">سابق: {ev.previous}</span>}
                </div>
                <div className="mt-1 rounded-sm bg-[#0c1220] p-1.5">
                  <p className={`text-[9.5px] font-bold leading-relaxed ${sideColor}`}>🔮 توقع لينا: {f.lean}</p>
                  <div className="mt-1 space-y-0.5">
                    {f.scenarios.map((s, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[9px] text-slate-400">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#1a2540]">
                          <div className="h-full bg-red-400/70" style={{ width: `${s.prob}%` }} />
                        </div>
                        <span dir="ltr" className="w-7 shrink-0 text-center font-mono text-slate-500">{s.prob}%</span>
                        <span className="flex-[2]"><b className="text-slate-300">{s.cond}:</b> {s.move}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[8.5px] leading-relaxed text-slate-500">{f.marketNote}</p>
                  <p className="mt-0.5 text-[8.5px] leading-relaxed text-cyan-300/80">🧭 {f.advice}</p>
                </div>
                <p className="mt-1 text-[9.5px] font-bold text-emerald-300">
                  💰 دخول الخبر: {sug.lot.toFixed(2)} لوت — وقف {fmt(15)}$ — هدف {fmt(sug.target10)}$ حركة = 10$ على {sug.lot.toFixed(2)}
                </p>
              </div>
            );
          })}
          {upcoming.length === 0 && <p className="text-[10px] text-slate-500">لا أخبار قادمة في الجدول — اضغط «تحديث الجدول» أو أضف خبراً يدوياً.</p>}

          <button onClick={() => setManual((v) => !v)} className="w-full rounded-sm border border-dashed border-[#2a3a5f] py-1 text-[9px] text-slate-500 transition hover:text-slate-300">
            {manual ? '▲ إخفاء الإضافة اليدوية (احتياط)' : '▼ إضافة خبر يدوي (احتياط)'}
          </button>
          {manual && (
            <div className="rounded-sm border border-dashed border-[#2a3a5f] p-2">
              <input
                placeholder="عنوان الخبر…"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="mb-1 w-full rounded-sm border border-[#1a2540] bg-[#0c1220] px-2 py-1 text-[10px] text-white outline-none focus:border-red-400/50"
              />
              <div className="mb-1 flex gap-1">
                <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="w-1/2 rounded-sm border border-[#1a2540] bg-[#0c1220] px-1 py-1 font-mono text-[9.5px] text-white outline-none" dir="ltr" />
                <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="w-1/2 rounded-sm border border-[#1a2540] bg-[#0c1220] px-1 py-1 font-mono text-[9.5px] text-white outline-none" dir="ltr" />
              </div>
              <div className="mb-1 flex gap-1">
                <select value={form.impact} onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value as NewsEvent['impact'] }))} className="flex-1 rounded-sm border border-[#1a2540] bg-[#0c1220] px-1 py-1 text-[9.5px] text-white outline-none">
                  <option value="high">عالي التأثير</option>
                  <option value="medium">متوسط</option>
                  <option value="low">منخفض</option>
                </select>
                <input placeholder="توقعات" value={form.forecast} onChange={(e) => setForm((f) => ({ ...f, forecast: e.target.value }))} className="flex-1 rounded-sm border border-[#1a2540] bg-[#0c1220] px-1 py-1 text-[9.5px] text-white outline-none" />
                <input placeholder="سابق" value={form.previous} onChange={(e) => setForm((f) => ({ ...f, previous: e.target.value }))} className="flex-1 rounded-sm border border-[#1a2540] bg-[#0c1220] px-1 py-1 text-[9.5px] text-white outline-none" />
              </div>
              <button onClick={() => addEvent()} className="w-full rounded-sm bg-red-400/15 py-1 text-[10px] font-bold text-red-300 transition hover:bg-red-400/25">+ إضافة</button>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {NEWS_PRESETS.map((p, i) => (
                  <button key={i} title={`أضف «${p.title}» في التاريخ المختار أعلاه`} onClick={() => addEvent(p)} className="rounded-sm border border-[#2a3a5f] px-1.5 py-0.5 text-[8.5px] text-slate-400 transition hover:border-red-400/40 hover:text-red-300">
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// خبير الحيتان + Databento — تدفق رؤوس الأموال والبنوك
// ============================================================

export function WhalePanel({ whales, onAlert, onStatus }: { whales: WhalePrint[]; onAlert: (msg: string) => void; onStatus?: (ok: boolean | null) => void }) {
  const [open, setOpen] = useState(true);
  const [dbKey, setDbKey] = useState(loadDbKey);
  const [dbMsg, setDbMsg] = useState('');
  const [dbOk, setDbOk] = useState(false);
  const [dbBusy, setDbBusy] = useState(false);
  const [dbStats, setDbStats] = useState<DbWhaleStats | null>(null);
  const lastWhale = useRef(0);

  // تنبيه لحظي عند بصمة حوت جديدة من بياناتك المباشرة
  useEffect(() => {
    const w = whales[whales.length - 1];
    if (w && w.time > lastWhale.current) {
      if (lastWhale.current !== 0) {
        onAlert(`🐋 جيك ليفيت (خبير الحيتان): بصمة ${w.side} @ ${fmt(w.price)} — مدى ${w.range.toFixed(1)}$ (${w.rangeX.toFixed(1)}×) وحجم ${w.volX.toFixed(1)}×`);
      }
      lastWhale.current = w.time;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whales]);

  const verify = async () => {
    setDbMsg('جارٍ التحقق…');
    saveDbKey(dbKey);
    const r = await checkDbKey(dbKey);
    setDbOk(r.ok);
    onStatus?.(r.ok ? true : false);
    setDbMsg(r.msg);
  };

  const scan = async () => {
    if (!dbKey) return;
    setDbBusy(true);
    setDbMsg('جارٍ سحب صفقات GC من CME (آخر 3 ساعات)…');
    try {
      const trades = await fetchGcTrades(dbKey, 3);
      if (!trades.length) {
        setDbStats(null);
        setDbMsg('لا صفقات في النافذة — قد يكون السوق خارج ساعات CME (جرّب وقت جلسة نيويورك)');
      } else {
        setDbStats(analyzeWhales(trades));
        setDbMsg(`تم تحليل ${trades.length.toLocaleString('en-US')} صفقة من عقود الذهب GC`);
      }
      setDbOk(true);
      onStatus?.(true);
    } catch (e) {
      setDbOk(false);
      onStatus?.(false);
      setDbMsg(e instanceof Error ? e.message : 'فشل السحب — تحقق من الشبكة والمفتاح ورصيد Databento');
    }
    setDbBusy(false);
  };

  return (
    <div className="rounded-sm border border-cyan-400/25 bg-[#0c1220] p-2">
      <button onClick={() => setOpen((v) => !v)} className="mb-1.5 flex w-full items-center gap-1.5 text-right">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">خبير الحيتان — تدفق رأس المال والبنوك</h3>
        <div className="h-px flex-1 bg-[#1a2540]" />
        <span className="text-[10px] text-slate-600">{open ? '▲ طي' : '▼ عرض'}</span>
      </button>
      {open && (
        <div className="space-y-1.5">
          {whales.length === 0 && <p className="text-[10px] text-slate-500">لا بصمات حيتان مرصودة في آخر 24 ساعة — السوق هادئ أو الحجم غير متاح من وسيطك.</p>}
          {whales.slice(-4).reverse().map((w, i) => (
            <div key={i} className="flex items-center gap-2 rounded-sm border border-[#1a2540] bg-[#080c16] px-2 py-1.5 text-[10px]">
              <span className={`font-black ${w.side === 'شراء عدواني' ? 'text-emerald-300' : 'text-red-300'}`}>{w.side === 'شراء عدواني' ? '▲' : '▼'}</span>
              <div className="flex-1">
                <span className="text-slate-300">بصمة @ {fmt(w.price)}</span>
                <span className="mr-2 text-slate-500">مدى {w.range.toFixed(1)}$ ({w.rangeX.toFixed(1)}×) · حجم {w.volX.toFixed(1)}×</span>
              </div>
              <span dir="ltr" className="font-mono text-[9px] text-slate-600">{utcHM(w.time)}</span>
            </div>
          ))}

          <div className="rounded-sm border border-dashed border-[#2a3a5f] p-2">
            <div className="mb-1 text-[9px] font-bold text-slate-400">تغذية Databento — صفقات المؤسسات (عقود GC / CME)</div>
            <div className="mb-1 flex gap-1">
              <input
                type="password"
                placeholder="Databento API Key"
                value={dbKey}
                onChange={(e) => setDbKey(e.target.value)}
                className="flex-1 rounded-sm border border-[#1a2540] bg-[#0c1220] px-2 py-1 font-mono text-[9.5px] text-white outline-none focus:border-cyan-400/50"
                dir="ltr"
              />
              <button onClick={verify} className="rounded-sm border border-cyan-400/40 px-2 py-1 text-[9.5px] font-bold text-cyan-300 transition hover:bg-cyan-400/10">تحقق</button>
              <button onClick={scan} disabled={dbBusy || !dbKey} className="rounded-sm bg-cyan-400/15 px-2 py-1 text-[9.5px] font-bold text-cyan-200 transition hover:bg-cyan-400/25 disabled:opacity-40">
                {dbBusy ? '…' : 'فحص الحيتان'}
              </button>
            </div>
            {dbMsg && <p className={`text-[9px] leading-relaxed ${dbOk ? 'text-emerald-400/90' : 'text-slate-400'}`}>{dbMsg}</p>}
            {dbStats && (
              <div className="mt-1.5 space-y-1">
                <div className="grid grid-cols-3 gap-1 text-center text-[9.5px]">
                  <div className="rounded-sm bg-[#080c16] p-1.5"><div className="font-mono font-bold text-white">{dbStats.total.toLocaleString('en-US')}</div><div className="text-slate-500">صفقة</div></div>
                  <div className="rounded-sm bg-[#080c16] p-1.5"><div className="font-mono font-bold text-emerald-300">{dbStats.buyVol.toLocaleString('en-US')}</div><div className="text-slate-500">حجم شراء عدواني</div></div>
                  <div className="rounded-sm bg-[#080c16] p-1.5"><div className="font-mono font-bold text-red-300">{dbStats.sellVol.toLocaleString('en-US')}</div><div className="text-slate-500">حجم بيع عدواني</div></div>
                </div>
                {dbStats.buyVol + dbStats.sellVol > 0 && (
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-[#1a2540]">
                    <div className="bg-emerald-400" style={{ width: `${(dbStats.buyVol / (dbStats.buyVol + dbStats.sellVol)) * 100}%` }} />
                    <div className="bg-red-400" style={{ width: `${(dbStats.sellVol / (dbStats.buyVol + dbStats.sellVol)) * 100}%` }} />
                  </div>
                )}
                <div>
                  <div className="mb-0.5 text-[8.5px] font-bold text-slate-500">أكبر الصفقات (بصمات مؤسسية)</div>
                  {dbStats.bigPrints.map((t, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-[#101828] py-0.5 font-mono text-[9px]" dir="ltr">
                      <span className="text-slate-500">{new Date(t.ts * 1000).toISOString().slice(11, 19)}</span>
                      <span className="font-bold text-white">{t.price.toFixed(1)}</span>
                      <span className={t.side === 'A' ? 'text-emerald-300' : 'text-red-300'}>{t.size} عقود {t.side === 'A' ? '▲ شراء' : '▼ بيع'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-1 text-[8.5px] leading-relaxed text-slate-600">مفتاحك يُحفظ في متصفحك فقط. الصفقات من بورصة شيكاغو (عقد GC = 100 أونصة) — أكبر بصمات الحيتان تظهر قبل تحركات 10$+.</p>
          </div>
        </div>
      )}
    </div>
  );
}
