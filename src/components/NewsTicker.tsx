// ============================================================
// شريط عاجل — يشرح السعر والاحتمالات والتوصيات والمناطق بلغة المتداول
// يتحرّك باستمرار، ويتوقف عند اللمس/المرور ليُقرأ
// ============================================================
import { useMemo } from 'react';
import type { TickerItem } from '../lib/ticker';

const toneCls = { up: 'text-emerald-300', down: 'text-red-300', warn: 'text-amber-300', info: 'text-slate-200' };
const tagCls = { up: 'bg-emerald-400/15 text-emerald-300', down: 'bg-red-400/15 text-red-300', warn: 'bg-amber-400 text-[#1f1e1d]', info: 'bg-slate-400/15 text-slate-300' };

export function NewsTicker({ items }: { items: TickerItem[] }) {
  const dur = useMemo(() => Math.max(40, items.reduce((q, i) => q + i.text.length, 0) / 7), [items]);
  if (!items.length) return null;
  const row = (k: string) => (
    <div className="flex shrink-0 items-center gap-6 pl-6" key={k}>
      {items.map((it, i) => (
        <span key={i} className="flex shrink-0 items-center gap-2 text-[12px]">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tagCls[it.tone]}`}>{it.tag}</span>
          <span className={toneCls[it.tone]}>{it.text}</span>
          <span className="text-slate-600">◆</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="group relative flex shrink-0 items-center overflow-hidden border-b border-[#3e3e38] bg-[#262624] py-1.5" aria-label="شريط التحليل العاجل">
      <span className="z-10 shrink-0 bg-amber-400 px-3 py-0.5 text-[11px] font-bold text-[#1f1e1d] shadow-[8px_0_12px_#262624]">● مباشر</span>
      <div className="flex min-w-0 flex-1 overflow-hidden" dir="rtl">
        <div className="ticker-track flex w-max group-hover:[animation-play-state:paused] active:[animation-play-state:paused]" style={{ animationDuration: `${dur}s` }}>
          {row('a')}{row('b')}
        </div>
      </div>
    </div>
  );
}
