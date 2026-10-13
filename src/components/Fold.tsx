// ============================================================
// قسم قابل للطي — المحتوى لا يُرسم (ولا يحسب) إلا عند الفتح
// الحالة تُحفظ لكل قسم في المتصفح فتبقى الواجهة كما تركها المستخدم
// ============================================================
import { useState, type ReactNode } from 'react';

const key = (id: string) => 'xau_fold_' + id;
function load(id: string, d: boolean): boolean {
  try { const v = localStorage.getItem(key(id)); return v === null ? d : v === '1'; } catch { return d; }
}

// keep: يبقى المحتوى مركّباً ومخفياً عند الطي — للّوحات التي تراقب وتُطلق تنبيهات (الأخبار، الحيتان، التوقيت)
export function Fold({ id, title, badge, accent = '#94a3b8', defaultOpen = false, keep = false, children }: {
  id: string; title: string; badge?: ReactNode; accent?: string; defaultOpen?: boolean; keep?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(() => load(id, defaultOpen));
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem(key(id), v ? '1' : '0'); } catch { /* تجاهل */ } };
  return (
    <section className="rounded-md border border-[#2c2c33] bg-[#16161a]">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-right text-[11px] font-bold transition hover:bg-[#1c1c21]"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
        <span className="flex-1 truncate" style={{ color: open ? accent : '#cbd5e1' }}>{title}</span>
        {badge != null && <span className="shrink-0 text-[9.5px] font-normal text-slate-400">{badge}</span>}
        <span className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {(open || keep) && <div className="border-t border-[#2c2c33] p-2.5" hidden={!open}>{children}</div>}
    </section>
  );
}
