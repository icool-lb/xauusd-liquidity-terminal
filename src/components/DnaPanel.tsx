import { useState } from 'react';
import type { TfAnalysis, Wave } from '../lib/dna';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// شمعة مصغرة: جسم + فتيلان بنسب حقيقية من بصمة الشمعة
function MiniCandle({ d, color }: { d: TfAnalysis['closed']; color: string }) {
  const total = Math.max(d.upperPct + d.bodyPct + d.lowerPct, 1);
  return (
    <div className="flex h-8 w-4 shrink-0 items-stretch justify-center" title={d.fp}>
      <div className="flex flex-col justify-center" style={{ height: '100%' }}>
        <div style={{ height: `${(d.upperPct / total) * 100}%` }} className="w-px mx-auto bg-current opacity-70" />
        <div style={{ height: `${Math.max((d.bodyPct / total) * 100, 8)}%`, background: color }} className="w-2.5 rounded-[1px]" />
        <div style={{ height: `${(d.lowerPct / total) * 100}%` }} className="w-px mx-auto bg-current opacity-70" />
      </div>
    </div>
  );
}

function dirColor(dir: 'up' | 'down' | 'flat') {
  return dir === 'up' ? '#34d399' : dir === 'down' ? '#f87171' : '#94a3b8';
}
function dirArrow(dir: 'up' | 'down' | 'flat') {
  return dir === 'up' ? '▲' : dir === 'down' ? '▼' : '◆';
}

export function DnaPanel({ tfs, wave }: { tfs: TfAnalysis[]; wave: Wave | null }) {
  const [open, setOpen] = useState(true);
  const [sel, setSel] = useState<number>(3); // 15د افتراضياً

  if (!tfs.length) return null;
  const selTf = tfs[Math.min(sel, tfs.length - 1)];
  const w = wave;

  return (
    <div className="rounded-sm border border-violet-400/25 bg-[#0c1220] p-2">
      <button onClick={() => setOpen((v) => !v)} className="mb-1.5 flex w-full items-center gap-1.5 text-right">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">خبير بصمة الشموع — Candle DNA & الموجة</h3>
        <div className="h-px flex-1 bg-[#1a2540]" />
        <span className="text-[10px] text-slate-600">{open ? '▲ طي' : '▼ عرض'}</span>
      </button>
      {open && (
        <div className="space-y-1.5">
          {/* شريط الأطر الزمنية */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {tfs.map((t, i) => (
              <button
                key={t.tf}
                onClick={() => setSel(i)}
                className="flex shrink-0 flex-col items-center gap-0.5 rounded-sm border px-1.5 py-1 transition"
                style={{
                  borderColor: sel === i ? dirColor(t.dir) : '#1a2540',
                  background: sel === i ? dirColor(t.dir) + '14' : '#080c16',
                }}
              >
                <span className="text-[8.5px] font-bold text-slate-300">{t.tf}</span>
                <span style={{ color: dirColor(t.dir) }} className="text-[11px] font-black leading-none">{dirArrow(t.dir)}</span>
                <span className="font-mono text-[7.5px] text-slate-500" dir="ltr">{t.momentum > 0 ? '+' : ''}{t.momentum}</span>
              </button>
            ))}
          </div>

          {/* بصمة الشمعة المختارة */}
          {selTf && (
            <div className="rounded-sm border border-[#1a2540] bg-[#080c16] p-2">
              <div className="flex items-center gap-2">
                <span style={{ color: dirColor(selTf.dir) }}><MiniCandle d={selTf.closed} color={dirColor(selTf.dir)} /></span>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black text-white">{selTf.closed.pattern}</span>
                    <span className="rounded-sm bg-violet-400/10 px-1 font-mono text-[8.5px] text-violet-300" dir="ltr">{selTf.closed.fp}</span>
                  </div>
                  <p className="mt-0.5 text-[9.5px] leading-relaxed text-slate-400">{selTf.closed.meaning}</p>
                </div>
              </div>
              <div className="mt-1 grid grid-cols-4 gap-1 text-center font-mono text-[8.5px]" dir="ltr">
                <div className="rounded-sm bg-[#0c1220] p-1"><div className="font-bold text-white">{selTf.closed.bodyPct}%</div><div className="text-slate-500">جسم</div></div>
                <div className="rounded-sm bg-[#0c1220] p-1"><div className="font-bold text-white">{selTf.closed.upperPct}/{selTf.closed.lowerPct}%</div><div className="text-slate-500">فتيل ع/س</div></div>
                <div className="rounded-sm bg-[#0c1220] p-1"><div className="font-bold text-white">{selTf.closed.volX ? selTf.closed.volX.toFixed(1) : '—'}×</div><div className="text-slate-500">حجم</div></div>
                <div className="rounded-sm bg-[#0c1220] p-1"><div className="font-bold text-white">{selTf.atr}$</div><div className="text-slate-500">ATR</div></div>
              </div>
            </div>
          )}

          {/* الموجة */}
          {w && (
            <div className="rounded-sm border border-[#1a2540] bg-[#080c16] p-2">
              <div className="mb-1 flex items-center gap-2">
                <span className={`text-[13px] font-black ${w.dir === 'up' ? 'text-emerald-300' : w.dir === 'down' ? 'text-red-300' : 'text-slate-400'}`}>
                  {w.dir === 'up' ? '▲ موجة صاعدة' : w.dir === 'down' ? '▼ موجة هابطة' : '◆ لا موجة'}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1a2540]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${w.strength}%`, background: w.dir === 'down' ? '#f87171' : '#34d399' }}
                  />
                </div>
                <span className="font-mono text-[10px] font-bold text-slate-300" dir="ltr">{w.strength}%</span>
              </div>
              <p className="text-[9.5px] leading-relaxed text-slate-400">
                {w.summary} — اتفاق: <b className="text-emerald-300">{w.agreeUp} صاعد</b> / <b className="text-red-300">{w.agreeDown} هابط</b> من {w.total} أطر
              </p>
              {w.path.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {w.path.map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px]">
                      <span className="font-mono text-[9px] text-slate-600" dir="ltr">{i === 0 ? '①' : '②'}</span>
                      <span className="text-slate-400">{t.label}:</span>
                      <span dir="ltr" className="font-mono font-bold text-amber-300">{fmt(t.price)}</span>
                      <span className="mr-auto text-[8.5px] text-slate-600">{t.eta}</span>
                    </div>
                  ))}
                  <p className="text-[9px] text-violet-300/80">
                    ➡️ السير المتوقع: {w.dir === 'up' ? 'صعوداً' : 'هبوطاً'} نحو {fmt(w.path[0].price)} ثم {w.path[1] ? fmt(w.path[1].price) : 'الهدف التالي'} — سرعة السوق الحالية {w.speed15}$/15د
                  </p>
                </div>
              )}
              {/* آفاق زمنية */}
              <div className="mt-1.5 grid grid-cols-4 gap-1">
                {w.horizons.map((h) => (
                  <div key={h.label} className="rounded-sm bg-[#0c1220] p-1 text-center">
                    <div className="text-[8.5px] font-bold text-slate-400">{h.label}</div>
                    <div className="font-mono text-[8.5px] font-bold text-white" dir="ltr">{fmt(h.mid)}</div>
                    <div className="font-mono text-[7.5px] text-slate-600" dir="ltr">{fmt(h.low)} – {fmt(h.high)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
