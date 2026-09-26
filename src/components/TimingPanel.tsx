// ============================================================
// خبير التوقيت المؤسسي — أوستن كارتر
// متى تشتري البنوك ومتى تبيع: تقييم حي لجودة لحظة الدخول من 7 عوامل
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  inKillZone, sessionOf, newsLotSuggestion, KILL_ZONES,
  type DayAnalysis, type NewsEvent,
} from '../lib/engine';
import type { TfAnalysis, Wave } from '../lib/dna';
import type { DbConfirm } from './RoadmapStrip';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Factor { label: string; pts: number; max: number; hint: string }

export function TimingPanel({ a, wave, ladder, dbConfirm, news, account, riskPct, tNow, onAlert }: {
  a: DayAnalysis | null;
  wave: Wave | null;
  ladder: TfAnalysis[];
  dbConfirm: DbConfirm | null;
  news: NewsEvent[];
  account: number;
  riskPct: number;
  tNow: number;              // وقت آخر شمعة (حي أو أرشيف)
  onAlert: (msg: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const calc = useMemo(() => {
    if (!a) return null;
    const price = a.lastPrice;
    const factors: Factor[] = [];
    const sess = sessionOf(tNow);
    const kz = inKillZone(tNow);
    const sessPts = kz ? 20 : sess === 'london' || sess === 'ny' ? 10 : sess === 'asia' ? 4 : 2;
    factors.push({ label: 'نافذة الجلسة / منطقة القتل', pts: sessPts, max: 20, hint: kz ? 'أنت داخل كيلزون — نافذة المؤسسات' : 'خارج الكيلزون — الحركة مؤسساتها أقل' });

    const wDir = wave && wave.dir !== 'flat' ? wave.dir : null;
    const wPts = wDir ? (wave!.strength >= 60 ? 20 : wave!.strength >= 40 ? 13 : wave!.strength >= 25 ? 7 : 3) : 0;
    factors.push({ label: 'اتجاه الموجة عبر الأطر الثمانية', pts: wPts, max: 20, hint: wDir ? `موجة ${wDir === 'up' ? 'صاعدة' : 'هابطة'} بقوة ${wave!.strength}%` : 'لا موجة واضحة — الأطر متضاربة' });

    // قرب السعر من منطقة غير ممسوحة (دخول البنوك عند المناطق لا في منتصف النطاق)
    const tf15 = ladder.find((t) => t.tf === '15 دقيقة');
    const atr = tf15?.atr ?? 5;
    const un = a.levels.filter((l) => !l.swept && l.kind !== 'OPEN' && Number.isFinite(l.price));
    const nearest = un.length ? Math.min(...un.map((l) => Math.abs(l.price - price))) : Infinity;
    const zonePts = nearest <= atr * 1.5 ? 15 : nearest <= atr * 3 ? 9 : 0;
    factors.push({ label: 'السعر عند منطقة (سيولة/أوردر بلوك)', pts: zonePts, max: 15, hint: nearest <= atr * 3 ? `أقرب منطقة على بُعد ${nearest.toFixed(1)}$` : `أقرب منطقة بعيدة ${nearest === Infinity ? '—' : nearest.toFixed(1) + '$'} — في منتصف النطاق` });

    // بصمة شمعة التنفيذ 15م
    const dna = tf15?.closed;
    const sgn = wDir === 'up' ? 1 : wDir === 'down' ? -1 : (a.signals[0]?.side === 'long' ? 1 : a.signals[0]?.side === 'short' ? -1 : 0);
    const dnaAligned = sgn !== 0 && dna ? dna.dirScore * sgn > 0 : false;
    const dnaPts = dnaAligned ? (Math.abs(dna!.dirScore) >= 2 ? 10 : 6) : 0;
    factors.push({ label: 'بصمة شمعة 15 دقيقة مع الاتجاه', pts: dnaPts, max: 10, hint: dna ? `${dna.pattern} (${dna.dirScore > 0 ? '+' : ''}${dna.dirScore})` : 'لا بيانات' });

    // تأكيد Databento
    const dbPts = dbConfirm?.ok === true ? 15 : dbConfirm?.ok === null && dbConfirm ? 5 : 0;
    factors.push({ label: 'تأكيد تدفق المؤسسات (Databento)', pts: dbPts, max: 15, hint: dbConfirm?.ok === true ? 'رأس المال المؤسسي معك' : dbConfirm?.ok === false ? '⚠️ المعاكس' : dbConfirm ? 'متعادل' : 'لا مفتاح بعد' });

    // الأخبار العالية
    const hot = news.filter((e) => e.impact === 'high' && e.currency !== 'ALL');
    const minsToNews = hot.length ? Math.min(...hot.map((e) => (e.time - tNow) / 60)) : Infinity;
    const newsBlocked = minsToNews <= 20;
    factors.push({ label: 'بُعد الأخبار العالية (±20 دقيقة)', pts: newsBlocked ? 0 : 10, max: 10, hint: newsBlocked ? `خبر خلال ${Math.max(0, Math.round(minsToNews))} دقيقة!` : Number.isFinite(minsToNews) ? `أقرب خبر عالي بعد ${Math.round(minsToNews)} دقيقة` : 'لا أخبار عالية قريبة' });

    // تقاء مع إشارة المحرك
    const sig = a.signals[0];
    const sigAlign = sig && sgn !== 0 && ((sig.side === 'long' ? 1 : -1) === sgn);
    factors.push({ label: 'تقاء مع إشارة محرك ICT الحية', pts: sigAlign ? 10 : 0, max: 10, hint: sig ? `إشارة ${sig.side === 'long' ? 'شراء' : 'بيع'} ${sigAlign ? 'متفقة' : 'غير متفقة'}` : 'لا إشارة' });

    const score = factors.reduce((s, f) => s + f.pts, 0);
    const blockedNews = newsBlocked;
    const blockedDb = dbConfirm?.ok === false;
    const tier: 'green' | 'amber' | 'red' = blockedNews || blockedDb ? 'red' : score >= 75 ? 'green' : score >= 55 ? 'amber' : 'red';

    // خطة التنفيذ عند الجاهزية
    let plan: { side: 'long' | 'short'; entry: number; sl: number; tp: number; lot: number } | null = null;
    if (!blockedNews && !blockedDb && sgn !== 0 && tier !== 'red') {
      const side: 'long' | 'short' = sgn > 0 ? 'long' : 'short';
      const inDir = un
        .filter((l) => (sgn > 0 ? l.price < price : l.price > price))
        .sort((x, y) => Math.abs(x.price - price) - Math.abs(y.price - price));
      const entry = inDir[0] && Math.abs(inDir[0].price - price) <= atr * 3 ? inDir[0].price : price;
      const lows = a.candles.slice(-8).map((c) => c.low);
      const highs = a.candles.slice(-8).map((c) => c.high);
      let sl = side === 'long' ? Math.min(...lows) - 0.8 : Math.max(...highs) + 0.8;
      if (Math.abs(entry - sl) > atr * 4) sl = side === 'long' ? entry - atr * 1.8 : entry + atr * 1.8;
      const wT = wave?.path[0]?.price;
      const tp = wT && ((side === 'long' && wT > entry) || (side === 'short' && wT < entry)) ? wT : entry + sgn * atr * 3;
      if (Math.abs(tp - entry) >= 2) {
        const sug = newsLotSuggestion(account || 1000, riskPct || 1, Math.abs(entry - sl));
        plan = { side, entry: +entry.toFixed(2), sl: +sl.toFixed(2), tp: +tp.toFixed(2), lot: sug.lot };
      }
    }

    // العد التنازلي لأقرب كيلزون
    const h = (tNow % 86400) / 3600;
    const nextKz = KILL_ZONES.map((k) => { let d = k.start - h; if (d <= 0) d += 24; return { label: k.label, inH: d }; }).sort((x, y) => x.inH - y.inH)[0];
    const nextHot = hot.filter((e) => e.time > tNow).sort((x, y) => x.time - y.time)[0];

    return { factors, score, tier, plan, blockedNews, blockedDb, minsToNews, nextKz, nextHot };
  }, [a, wave, ladder, dbConfirm, news, tNow, account, riskPct]);

  // تنبيه صوتي عند فتح نافذة خضراء
  const lastTier = useRef<string>('');
  const lastAlert = useRef(0);
  useEffect(() => {
    if (!calc) return;
    const key = `${calc.tier}-${calc.plan?.side}-${calc.plan?.entry}`;
    if (calc.tier === 'green' && key !== lastTier.current && calc.plan) {
      const t = Date.now();
      if (t - lastAlert.current > 1800_000) {
        lastAlert.current = t;
        const p = calc.plan;
        onAlert(`🟢 أوستن كارتر (خبير توقيت البنوك): نافذة دخول مثالية الآن — ${p.side === 'long' ? 'شراء' : 'بيع'} عند ${p.entry}، وقف ${p.sl}، هدف ${p.tp}، لوت ${p.lot.toFixed(2)}`);
      }
    }
    lastTier.current = key0(calc);
    function key0(c: NonNullable<typeof calc>) { return `${c.tier}-${c.plan?.side}-${c.plan?.entry}`; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc]);

  if (!calc) return null;

  const tierStyle = {
    green: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300',
    amber: 'border-amber-400/50 bg-amber-400/10 text-amber-300',
    red: 'border-red-400/50 bg-red-400/10 text-red-300',
  }[calc.tier];
  const tierText = calc.blockedNews
    ? `⛔ تجميد دخول — خبر عالي التأثير ${calc.minsToNews > 0 ? `خلال ${Math.max(0, Math.round(calc.minsToNews))} دقيقة` : 'الآن'} (قاعدة البنوك: لا دخول ±20 دقيقة)`
    : calc.blockedDb
      ? '⛔ رأس المال المؤسسي معاكس للاتجاه — انتظر انقلاب التدفق (Databento)'
      : calc.tier === 'green'
        ? '🟢 نافذة دخول مثالية الآن — المعايير السبعة متحققة'
        : calc.tier === 'amber'
          ? '🟡 فرصة جيدة — ادخل بنصف الحجم المعتاد فقط'
          : '🔴 ليس الآن — المؤسسات لا تدخل في هذه الظروف';

  return (
    <div className="rounded-sm border border-emerald-400/25 bg-[#0c1220] p-2">
      <button onClick={() => setOpen((v) => !v)} className="mb-1.5 flex w-full items-center gap-1.5 text-right">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">خبير التوقيت المؤسسي — متى يشتري البنوك</h3>
        <div className="h-px flex-1 bg-[#1a2540]" />
        <span className="text-[10px] text-slate-600">{open ? '▲ طي' : '▼ عرض'}</span>
      </button>
      {open && (
        <div className="space-y-1.5">
          {/* الحكم */}
          <div className={`rounded-sm border px-2 py-1.5 text-[10px] font-bold leading-relaxed ${tierStyle}`}>{tierText}</div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1a2540]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, calc.score)}%`, background: calc.tier === 'green' ? '#34d399' : calc.tier === 'amber' ? '#fbbf24' : '#f87171' }}
              />
            </div>
            <span className="font-mono text-[10px] font-bold text-slate-300" dir="ltr">{calc.score}/100</span>
          </div>

          {/* العوامل السبعة */}
          <div className="space-y-0.5">
            {calc.factors.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[9px]">
                <span className={f.pts >= f.max * 0.6 ? 'text-emerald-300' : f.pts > 0 ? 'text-amber-300' : 'text-slate-600'}>
                  {f.pts >= f.max * 0.6 ? '✔' : f.pts > 0 ? '◐' : '✖'}
                </span>
                <span className="text-slate-400">{f.label}</span>
                <span className="mr-auto shrink-0 font-mono text-slate-600" dir="ltr">{f.pts}/{f.max}</span>
              </div>
            ))}
          </div>

          {/* خطة التنفيذ */}
          {calc.plan && (
            <div className="rounded-sm border border-[#1a2540] bg-[#080c16] p-2 text-[10px]">
              <div className="mb-1 flex items-center gap-1.5">
                <span className={`font-black ${calc.plan.side === 'long' ? 'text-emerald-300' : 'text-red-300'}`}>{calc.plan.side === 'long' ? '▲ شراء' : '▼ بيع'}</span>
                <span className="text-slate-500">— خطّة أوستن:</span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-center font-mono" dir="ltr">
                <div className="rounded-sm bg-[#0c1220] p-1"><div className="font-bold text-white">{fmt(calc.plan.entry)}</div><div className="text-[7.5px] text-slate-500">دخول</div></div>
                <div className="rounded-sm bg-[#0c1220] p-1"><div className="font-bold text-red-300">{fmt(calc.plan.sl)}</div><div className="text-[7.5px] text-slate-500">وقف</div></div>
                <div className="rounded-sm bg-[#0c1220] p-1"><div className="font-bold text-emerald-300">{fmt(calc.plan.tp)}</div><div className="text-[7.5px] text-slate-500">هدف</div></div>
                <div className="rounded-sm bg-[#0c1220] p-1"><div className="font-bold text-amber-300">{calc.plan.lot.toFixed(2)}</div><div className="text-[7.5px] text-slate-500">لوت</div></div>
              </div>
            </div>
          )}

          {/* العد التنازلي */}
          <div className="flex flex-wrap gap-2 text-[8.5px] text-slate-500">
            <span>⏳ أقرب كيلزون: <b className="text-slate-300">{calc.nextKz.label} بعد {calc.nextKz.inH < 1 ? `${Math.round(calc.nextKz.inH * 60)} دقيقة` : `${calc.nextKz.inH.toFixed(1)} ساعة`}</b></span>
            {calc.nextHot && (
              <span>📰 أقرب خبر عالي: <b className="text-slate-300">{calc.nextHot.title}</b> {new Date(calc.nextHot.time * 1000).toISOString().slice(11, 16)} UTC</span>
            )}
          </div>

          {/* منهج البنوك */}
          <p className="rounded-sm bg-[#080c16] p-1.5 text-[8.5px] leading-relaxed text-slate-600">
            منهج أوستن من دراسة تصرفات البنوك وصناديق التحوط: ① لا دخول إلا بعد كسر سيولة وهمية وانعكاس (Sweep + MSS)
            ② التنفيذ داخل كيلزوني لندن ونيويورك حيث ينفذ رأس المال الكبير ③ تجنّب ±20 دقيقة حول الأخبار العالية ثم التغذي على سيولتها
            ④ تدفق Databento يسبق الحركة — لا دخول عكسه ⑤ لا دخول في منتصف النطاق — فقط عند المناطق غير الممسوحة.
          </p>
        </div>
      )}
    </div>
  );
}
