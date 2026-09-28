// ============================================================
// بطاقة صفقة اليوم — الاتجاه + الأرقام + السبب + النتيجة
// تجيب فوراً: شراء أم بيع؟ من أين؟ وقف وهدف أين؟ لماذا؟ وهل نجحت؟
// ============================================================
import type { DayAnalysis, Signal } from '../lib/engine';
import { computeOTE } from '../lib/engine';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);

function StatusBadge({ s }: { s: Signal }) {
  if (s.status === 'active')
    return <span className="animate-pulse rounded-sm border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold text-cyan-300">⏳ نشطة — السعر يتحرك داخل الخطة</span>;
  if (s.status === 'sl')
    return <span className="rounded-sm border border-red-400/40 bg-red-400/10 px-2 py-0.5 text-[10px] font-bold text-red-300">❌ فشلت — ضربت الوقف</span>;
  return (
    <span className="rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
      {s.status === 'tp2' ? '✅ نجاح كامل — أصابت الهدف الثاني' : '✅ نجحت — أصابت الهدف الأول'}
    </span>
  );
}

export function SignalCard({ analysis, price }: { analysis: DayAnalysis | null; price: number }) {
  const sig = analysis?.signals[0] ?? null;

  // ---------- لا إشارة بعد: ماذا ننتظر بالضبط؟ ----------
  if (!analysis || !sig) {
    const fresh = (analysis?.levels ?? []).filter((l) => !l.swept);
    const above = fresh.filter((l) => l.price > price + 0.5).sort((a, b) => a.price - b.price).slice(0, 2);
    const below = fresh.filter((l) => l.price < price - 0.5).sort((a, b) => b.price - a.price).slice(0, 2);
    return (
      <div className="shrink-0 border-b border-[#2c2c33] bg-[#0e0e11] px-4 py-2" dir="rtl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black text-slate-200">🎯 صفقة اليوم</span>
          <span className="rounded-sm border border-[#3a3a44] px-2 py-0.5 text-[9px] text-slate-400">لا إشارة بعد — المنصة تنتظر اكتمال السيناريو المؤسسي</span>
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
          شرط الدخول (بلا استثناء): <b className="text-amber-300">① سحب سيولة</b> لمستوى ← <b className="text-fuchsia-300">② كسر هيكلي معاكس</b> ← <b className="text-cyan-300">③ التداول بجهة الافتتاح اليومي</b>.
        </p>
        {(above.length > 0 || below.length > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px]">
            <span className="text-slate-500">المحفّزات المنتظرة — اقترب السعر من:</span>
            {above.map((l) => (
              <span key={l.kind + l.price} className="rounded-sm border border-violet-400/30 bg-violet-400/5 px-1.5 py-0.5 text-violet-300">
                ⬆ {l.label} <b dir="ltr">{fmt(l.price)}</b> (على بُعد <b dir="ltr">{fmt(l.price - price)}$</b>)
              </span>
            ))}
            {below.map((l) => (
              <span key={l.kind + l.price} className="rounded-sm border border-amber-400/30 bg-amber-400/5 px-1.5 py-0.5 text-amber-300">
                ⬇ {l.label} <b dir="ltr">{fmt(l.price)}</b> (على بُعد <b dir="ltr">{fmt(price - l.price)}$</b>)
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- توجد إشارة ----------
  const long = sig.side === 'long';
  const risk = Math.abs(sig.entry - sig.stop);
  const closed = sig.status !== 'active';
  const pnlD = sig.pnlR != null ? Math.abs(sig.pnlR) * risk : null; // $ لكل أونصة = لوت 0.01
  const ote = computeOTE(sig.side, sig.stop, sig.tp2, sig.entry);

  // شريط تقدم السعر الحي بين الوقف والهدف
  const lo = Math.min(sig.stop, sig.tp2);
  const hi = Math.max(sig.stop, sig.tp2);
  const pct = hi > lo ? Math.max(2, Math.min(98, ((price - lo) / (hi - lo)) * 100)) : 50;

  const cell = (label: string, v: string, cls: string, sub?: string) => (
    <div className="rounded-sm bg-[#131316] px-2 py-1.5">
      <div className="text-[8.5px] text-slate-500">{label}</div>
      <div className={`font-mono text-[13px] font-black ${cls}`} dir="ltr">{v}</div>
      {sub && <div className="text-[8px] text-slate-500" dir="ltr">{sub}</div>}
    </div>
  );

  return (
    <div className={`shrink-0 border-b px-4 py-2 ${long ? 'border-emerald-400/30 bg-emerald-400/[0.04]' : 'border-red-400/30 bg-red-400/[0.04]'}`} dir="rtl">
      {/* الرأس: الاتجاه + الوقت + الحالة + R:R */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-black text-slate-200">🎯 صفقة اليوم</span>
        <span className={`rounded-sm px-2.5 py-0.5 text-[13px] font-black ${long ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'}`}>
          {long ? 'شراء ▲' : 'بيع ▼'}
        </span>
        <span className="font-mono text-[9px] text-slate-500" dir="ltr">{hm(sig.time)} UTC</span>
        <StatusBadge s={sig} />
        <span className="mr-auto rounded-sm border border-[#3a3a44] px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-300" dir="ltr">R:R = 1:{sig.rr}</span>
      </div>

      {/* الأرقام الأربعة الكبرى */}
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {cell('الدخول', fmt(sig.entry), 'text-white')}
        {cell('الوقف', fmt(sig.stop), 'text-red-300', `-${fmt(risk)}$`)}
        {cell('الهدف 1', fmt(sig.tp1), 'text-emerald-300', `+${fmt(Math.abs(sig.tp1 - sig.entry))}$`)}
        {cell('الهدف 2', fmt(sig.tp2), 'text-emerald-200', `+${fmt(Math.abs(sig.tp2 - sig.entry))}$`)}
      </div>

      {/* التقدم الحي أو النتيجة النهائية */}
      {!closed ? (
        <div className="mt-1.5">
          <div className="relative h-2 overflow-hidden rounded-full bg-[#222227]" dir="ltr">
            <div className={`absolute inset-y-0 left-0 transition-all ${long ? 'bg-emerald-400/50' : 'bg-red-400/50'}`} style={{ width: `${pct}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${pct}%` }} />
          </div>
          <div className="mt-0.5 flex justify-between font-mono text-[8.5px] text-slate-500" dir="ltr">
            <span className="text-red-400/80">وقف {fmt(sig.stop)}</span>
            <span className="font-bold text-white">الآن {fmt(price)}</span>
            <span className="text-emerald-400/80">هدف {fmt(sig.tp2)}</span>
          </div>
        </div>
      ) : (
        <p className={`mt-1.5 rounded-sm px-2 py-1 text-[10px] font-bold leading-relaxed ${sig.status === 'sl' ? 'bg-red-400/10 text-red-300' : 'bg-emerald-400/10 text-emerald-300'}`}>
          {sig.status === 'sl'
            ? `النتيجة: خسارة -1R ≈ ${fmt(risk)}$ بلوت 0.01 — الخروج عند ${fmt(sig.exitPrice ?? sig.stop)}. الانضباط انتصر: الخسارة كانت محدودة ومعروفة مسبقاً.`
            : `النتيجة: ربح +${sig.pnlR}R ≈ ${pnlD != null ? fmt(pnlD) : '—'}$ بلوت 0.01 — الخروج عند ${fmt(sig.exitPrice ?? sig.tp1)}.`}
        </p>
      )}

      {/* لماذا هذه الصفقة؟ */}
      <div className="mt-1.5 rounded-sm border border-[#2c2c33] bg-[#0a0a0c] p-1.5">
        <div className="text-[9px] font-bold text-slate-400">لماذا دخلنا؟ (سجلّ الأسباب)</div>
        <ul className="mt-0.5 space-y-0.5 text-[9.5px] leading-relaxed text-slate-300">
          {sig.reason.map((r, i) => <li key={i}>✚ {r}</li>)}
        </ul>
      </div>

      {/* منطقة الارتداد لمن فاته الدخول */}
      {!closed && (
        <p className="mt-1 text-[9.5px] leading-relaxed text-cyan-300">
          🔄 فاتك الدخول؟ منطقة الارتداد المثالية: <b dir="ltr">{fmt(Math.min(ote.oteTop, ote.oteBottom))} – {fmt(Math.max(ote.oteTop, ote.oteBottom))}</b> — تُدخل منها فقط بعد شمعة تأكيد {long ? 'صاعدة' : 'هابطة'}، وبنفس الوقف والهدف.
        </p>
      )}
    </div>
  );
}
