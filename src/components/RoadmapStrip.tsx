// ============================================================
// شريط خارطة الطريق — السعر الآن ← التوجه خلال فريم محدد
// + منطقة اختبار وسحب سيولة + أرقام الاختبار + تأكيد Databento
// ============================================================

export interface RoadmapInfo {
  dir: 'up' | 'down';
  target: number;      // الهدف الأول
  eta: string;         // الفريم/المدة المتوقعة
  liq: { price: number; label: string } | null; // منطقة اختبار وسحب سيولة
  testNumbers: { price: number; label: string }[]; // الأرقام التي سيعبرها السعر
}

export interface DbConfirm {
  ok: boolean | null;  // true يؤكد / false معاكس / null متعادل
  ratio: number;       // حصة الشراء العدواني 0..1
  total: number;       // عدد الصفقات المفحوصة
  time: number;        // وقت آخر فحص
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RoadmapStrip({ price, roadmap, archive, hasDbKey, dbConfirm }: {
  price: number;
  roadmap: RoadmapInfo | null;
  archive: boolean;
  hasDbKey: boolean;
  dbConfirm: DbConfirm | null;
}) {
  const up = roadmap?.dir === 'up';
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-amber-400/25 bg-gradient-to-l from-amber-400/10 via-[#0a0f1c] to-[#0a0f1c] px-4 py-1.5 text-[10.5px]">
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.2em] text-amber-300/80">خارطة الطريق</span>
      <span className="shrink-0 text-slate-400">
        السعر الآن <b dir="ltr" className="font-mono text-[12px] text-white">{price ? fmt(price) : '—'}</b>
      </span>
      {roadmap ? (
        <>
          <span className={`shrink-0 font-black ${up ? 'text-emerald-300' : 'text-red-300'}`}>
            {up ? '▲ التوجه إلى' : '▼ التوجه إلى'} <b dir="ltr" className="font-mono text-[12px]">{fmt(roadmap.target)}</b>
          </span>
          <span className="shrink-0 text-slate-500">خلال <b className="text-slate-300">{roadmap.eta}</b></span>
          {roadmap.liq && (
            <span className="shrink-0 text-slate-400">
              🧲 منطقة اختبار وسحب سيولة: <b dir="ltr" className="font-mono font-bold text-amber-300">{fmt(roadmap.liq.price)}</b>
              <span className="text-slate-500"> ({roadmap.liq.label})</span>
            </span>
          )}
          {roadmap.testNumbers.length > 0 && (
            <span className="flex shrink-0 flex-wrap items-center gap-1 text-slate-400">
              أرقام الاختبار:
              {roadmap.testNumbers.map((t, i) => (
                <b key={i} dir="ltr" title={t.label}
                  className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9.5px] ${up ? 'border-emerald-400/30 text-emerald-200' : 'border-red-400/30 text-red-200'}`}>
                  {fmt(t.price)}
                </b>
              ))}
            </span>
          )}
        </>
      ) : (
        <span className="shrink-0 text-slate-500">◆ لا موجة واضحة بعد — التوجيه يظهر هنا فور انحياز الأطر الكبرى معاً</span>
      )}
      {archive && (
        <span className="shrink-0 rounded-sm border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[8.5px] text-cyan-300">🏛️ وضع أرشيف — التوجهات من بيانات ما قبل الإغلاق</span>
      )}

      {/* تأكيد Databento لرأس المال المؤسسي */}
      <span className="mr-auto flex shrink-0 items-center gap-1.5">
        {!hasDbKey ? (
          <span className="rounded-sm border border-[#2a3a5f] px-2 py-0.5 text-[9px] text-slate-500">🔌 أدخل مفتاح Databento في لوحة الحيتان لتأكيد التوجه لحظياً</span>
        ) : dbConfirm === null ? (
          <span className="animate-pulse rounded-sm border border-amber-400/30 px-2 py-0.5 text-[9px] text-amber-300">⏳ جارٍ فحص تدفق GC من CME…</span>
        ) : dbConfirm.ok === true ? (
          <span className="rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
            ✅ Databento يؤكد التوجه: {Math.round((up ? dbConfirm.ratio : 1 - dbConfirm.ratio) * 100)}% {up ? 'شراء' : 'بيع'} عدواني
            <span className="text-emerald-400/60"> ({dbConfirm.total.toLocaleString('en-US')} صفقة)</span>
          </span>
        ) : dbConfirm.ok === false ? (
          <span className="animate-pulse rounded-sm border border-red-400/50 bg-red-400/10 px-2 py-0.5 text-[9px] font-black text-red-300">
            ⚠️ Databento معاكس للتوجه — لا تدخل عكس رأس المال المؤسسي
          </span>
        ) : (
          <span className="rounded-sm border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] text-amber-300">
            ◐ Databento متعادل — لا تأكيد ولا نفي ({dbConfirm.total.toLocaleString('en-US')} صفقة)
          </span>
        )}
      </span>
    </div>
  );
}
