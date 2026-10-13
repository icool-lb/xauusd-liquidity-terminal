// ============================================================
// مجلس الخبراء — جولة كل 5 دقائق: توصية · ملاحظة · تنبيه · اقتراح · توجيه
// ============================================================
import { useEffect, useState } from 'react';
import { EXPERTS, type Round, type MsgType } from '../lib/council';

const typeCls: Record<MsgType, string> = {
  'توصية': 'bg-emerald-400/15 text-emerald-300',
  'تنبيه': 'bg-amber-400 text-[#1f1e1d]',
  'اقتراح': 'bg-cyan-400/15 text-cyan-300',
  'توجيه': 'bg-violet-400/15 text-violet-300',
  'ملاحظة': 'bg-slate-400/15 text-slate-300',
};
const hm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
const avatar = (n: string) => n.trim().slice(0, 1);

export function CouncilPanel({ rounds, compact = false }: { rounds: Round[]; compact?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const id = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(id); }, []);
  const cur = rounds[0];
  const next = cur ? Math.max(0, Math.ceil(cur.t + 300 - now)) : 0;
  if (!cur) return (
    <div className="rounded-2xl border border-[#3e3e38] bg-[#30302e] p-3.5 text-[11.5px] text-slate-400">
      <h2 className="font-display mb-1 text-[17px] font-bold text-slate-50">مجلس الخبراء</h2>
      يبدأ المجلس جولته الأولى فور وصول بيانات حسابك — ثم كل 5 دقائق.
    </div>
  );
  const v = cur.verdict;
  const prev = rounds[1];
  const msgs = compact && !showAll ? cur.msgs.slice().sort((a, b) => b.priority - a.priority).slice(0, 4) : cur.msgs;
  return (
    <div className="rounded-2xl border border-[#3e3e38] bg-[#30302e] p-3.5">
      <div className="flex items-center gap-2">
        <h2 className="font-display flex-1 text-[17px] font-bold text-slate-50">مجلس الخبراء</h2>
        <span className="font-mono text-[10px] text-slate-400" dir="ltr">{hm(cur.t)} · next {Math.floor(next / 60)}:{String(next % 60).padStart(2, '0')}</span>
      </div>
      {/* مؤشّر القرار */}
      <div className="mt-2 rounded-xl bg-[#262624] p-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-red-300">بيع</span>
          <b className={v.lean > 0 ? 'text-emerald-300' : v.lean < 0 ? 'text-red-300' : 'text-slate-200'}>{v.text}</b>
          <span className="text-emerald-300">شراء</span>
        </div>
        <div className="relative mt-1.5 h-2 rounded-full bg-gradient-to-l from-emerald-500/50 via-slate-600/40 to-red-500/50" dir="ltr">
          <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#1f1e1d] bg-amber-400 transition-all"
            style={{ left: `${50 + v.score / 2}%` }} />
        </div>
        {prev && prev.verdict.lean !== v.lean && <p className="mt-1.5 text-[10.5px] text-amber-300">⚡ تغيّر قرار المجلس منذ الجولة السابقة ({prev.verdict.text})</p>}
      </div>
      <div className="mt-2.5 space-y-2">
        {msgs.map((m) => (
          <div key={m.id} className={`flex gap-2.5 rounded-xl p-2 ${m.priority >= 2 ? 'bg-amber-400/10 ring-1 ring-amber-400/40' : 'bg-[#262624]'}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/20 font-display text-[14px] font-bold text-amber-300">{avatar(m.who)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <b className="text-[12px] text-slate-100">{m.who}</b>
                <span className={`rounded-full px-1.5 py-px text-[9.5px] font-bold ${typeCls[m.type]}`}>{m.type}</span>
                {m.lean !== 0 && <span className={`text-[10px] ${m.lean > 0 ? 'text-emerald-300' : 'text-red-300'}`}>{m.lean > 0 ? '▲' : '▼'}</span>}
              </div>
              <div className="text-[9.5px] text-slate-500">{m.role}</div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-300">{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      {compact && cur.msgs.length > 4 && (
        <button onClick={() => setShowAll(!showAll)} className="mt-2 w-full rounded-xl py-1 text-[11px] text-amber-300 hover:bg-amber-400/10">
          {showAll ? 'عرض أقل' : `كل الخبراء (${cur.msgs.length})`}
        </button>
      )}
      {!compact && rounds.length > 1 && (
        <details className="mt-3 text-[11px] text-slate-400">
          <summary className="cursor-pointer">الجولات السابقة ({rounds.length - 1})</summary>
          <div className="mt-2 space-y-1.5">
            {rounds.slice(1, 25).map((r) => (
              <div key={r.slot} className="rounded-lg bg-[#262624] p-2">
                <div className="flex justify-between"><span className="font-mono" dir="ltr">{hm(r.t)}</span><b className={r.verdict.lean > 0 ? 'text-emerald-300' : r.verdict.lean < 0 ? 'text-red-300' : 'text-slate-300'}>{r.verdict.text}</b></div>
                {r.msgs.filter((m) => m.priority >= 1).map((m) => <div key={m.id} className="mt-0.5 text-slate-500">• {m.who} ({m.type}): {m.text}</div>)}
              </div>
            ))}
          </div>
        </details>
      )}
      <p className="mt-2 text-[9.5px] leading-relaxed text-slate-500">
        شخصيات افتراضية بأدوار محددة؛ كل جملة محسوبة من بيانات حسابك بقاعدة صريحة — ليست أقوال أشخاص حقيقيين ولا نصيحة مالية. {EXPERTS.length} أعضاء.
      </p>
    </div>
  );
}
