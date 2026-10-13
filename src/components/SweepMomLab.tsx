// ============================================================
// مختبر السحب والزخم — يقارن إعدادات الاستراتيجيتين على بياناتك الحقيقية
// قبل أن تحفظ أي تغيير: صفقات، نسبة نجاح، مجموع R، أسوأ تراجع
// ============================================================
import { useMemo, useState } from 'react';
import type { Candle, EngineCfg, StratBt } from '../lib/engine';
import { backtestStrats, getEngineCfg, setEngineCfg } from '../lib/engine';

type Variant = { label: string; cfg: Partial<EngineCfg> };

function variants(cur: EngineCfg): Variant[] {
  return [
    { label: 'الإعداد الحالي', cfg: {} },
    { label: cur.sweepVol ? 'بلا فلتر حجم السحب' : 'حجم السحب ×1.2', cfg: { sweepVol: cur.sweepVol ? 0 : 1.2 } },
    { label: 'حجم السحب ×1.5', cfg: { sweepVol: 1.5 } },
    { label: cur.momVol ? 'بلا فلتر حجم الكسر' : 'حجم الكسر ×1.1', cfg: { momVol: cur.momVol ? 0 : 1.1 } },
    { label: 'حجم الكسر ×1.3', cfg: { momVol: 1.3 } },
    { label: cur.momBias ? 'زخم بلا شرط الافتتاح' : 'زخم مع الافتتاح', cfg: { momBias: !cur.momBias } },
    { label: 'الحجم + الافتتاح معاً', cfg: { sweepVol: 1.2, momVol: 1.1, momBias: true } },
    { label: 'موجة كسر ≥ 12$', cfg: { momMinLeg: 12 } },
    { label: 'إشارتا سحب يومياً', cfg: { maxSignals: 2 } },
  ];
}

const cell = (b: StratBt) => (
  <span dir="ltr" className={`font-mono ${b.totalR > 0 ? 'text-emerald-300' : b.totalR < 0 ? 'text-red-300' : 'text-slate-400'}`}>
    {b.totalR > 0 ? '+' : ''}{b.totalR}R <span className="text-slate-500">({b.trades}·{b.winRate}%)</span>
  </span>
);

export function SweepMomLab({ candles }: { candles: Candle[] }) {
  const span = candles.length ? Math.floor((candles[candles.length - 1].time - candles[0].time) / 86400) : 0;
  const [days, setDays] = useState(() => Math.min(30, Math.max(5, span - 2)));
  const [run, setRun] = useState(0);
  const cur = getEngineCfg();
  const rows = useMemo(() => {
    if (!run || candles.length < 300) return null;
    return variants(cur).map((v) => ({ ...v, bt: backtestStrats(candles, days, v.cfg) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, days, candles.length]);
  const best = rows ? rows.slice().sort((a, b) => b.bt.all.totalR - a.bt.all.totalR)[0] : null;

  return (
    <div className="space-y-2 text-[10px]">
      <p className="leading-relaxed text-slate-500">
        يعيد اختبار <b className="text-amber-300">السحب + الحجم</b> و<b className="text-orange-300">الزخم</b> يوماً بيوم على شموعك، ويقارن إعدادات بديلة بنفس البيانات.
        الأرقام بوحدة R (المخاطرة). عيّنة أيام قليلة لا تكفي للحكم — اختر الإعداد الذي يربح في أكثر من فترة، لا الأعلى فقط.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-slate-400">الفترة:</span>
        {[10, 20, 30, 60, 90].filter((d) => d <= Math.max(10, span - 1)).map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`rounded-sm border px-2 py-0.5 font-mono ${days === d ? 'border-amber-400/60 text-amber-300' : 'border-[#4d4c45] text-slate-500'}`}>{d}ي</button>
        ))}
        <button onClick={() => setRun((x) => x + 1)} className="mr-auto rounded-sm border border-cyan-400/50 bg-cyan-400/10 px-3 py-1 font-bold text-cyan-200 active:scale-95">
          {run ? '↻ أعد الاختبار' : '▶ شغّل المقارنة'}
        </button>
      </div>
      {candles.length < 300 && <p className="text-amber-300">بيانات غير كافية بعد — اتصل بحسابك أولاً.</p>}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="text-slate-500">
              <th className="p-1 text-right font-normal">الإعداد</th><th className="p-1 font-normal">السحب</th><th className="p-1 font-normal">الزخم</th><th className="p-1 font-normal">المجموع</th><th className="p-1 font-normal">أسوأ تراجع</th><th />
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-t border-[#3e3e38] ${r === best ? 'bg-emerald-400/5' : ''}`}>
                  <td className="p-1 text-slate-300">{r === best && '★ '}{r.label}</td>
                  <td className="p-1 text-center">{cell(r.bt.sweep)}</td>
                  <td className="p-1 text-center">{cell(r.bt.mom)}</td>
                  <td className="p-1 text-center font-bold">{cell(r.bt.all)}</td>
                  <td className="p-1 text-center font-mono text-red-300/80" dir="ltr">{r.bt.all.maxDD}R</td>
                  <td className="p-1">{i > 0 && (
                    <button
                      onClick={() => { setEngineCfg(r.cfg); location.reload(); }}
                      className="rounded-sm border border-[#4d4c45] px-1.5 py-0.5 text-[9px] text-slate-300 hover:border-emerald-400/50 hover:text-emerald-300"
                    >اعتمد</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[9px] text-slate-600">(صفقات · نسبة النجاح) — الإعداد الحالي: حجم السحب {cur.sweepVol ? '×' + cur.sweepVol : 'off'} · حجم الكسر {cur.momVol ? '×' + cur.momVol : 'off'} · الزخم {cur.momOn ? (cur.momBias ? 'مع الافتتاح' : 'بلا شرط') : 'معطّل'}</p>
        </div>
      )}
    </div>
  );
}
