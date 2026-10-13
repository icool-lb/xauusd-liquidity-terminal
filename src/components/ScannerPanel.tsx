// ============================================================
// السكانر — ما يراه الماسح الآن: الأوامر المعلّقة، صفقات اليوم، السحوبات تحت المراقبة
// نفس المحرّك ونفس طاقم الخبراء الذي يرسل إلى Telegram، مع أزرار الفحص والإرسال
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { analyzeDay, getEngineCfg, type Candle, type DayAnalysis, type PendingOrder, type Signal } from '../lib/engine';
import { crew, type CrewInput } from '../lib/crew';

const DAY = 86400, M15 = 900;
const f2 = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const hm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
const LS_SCANKEY = 'xau_scan_key';
const lsGet = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };

type Health = { metaapi: boolean; telegram: boolean; chat: boolean; webhook: boolean; scanKey: boolean; symbol: string | null } | null;

function Crew({ a, o, acct }: { a: DayAnalysis; o: CrewInput; acct: { balance: number; riskPct: number } }) {
  const c = crew(a, o, acct);
  return (
    <div className="mt-2 space-y-1 border-t border-[#3e3e38] pt-2">
      {c.lines.map((l, i) => (
        <div key={i} className="flex gap-1.5 text-[10.5px] leading-relaxed">
          <span className="shrink-0">{l.ok === true ? '✅' : l.ok === false ? '⚠️' : '▫️'}</span>
          <span><b className="text-slate-200">{l.who}:</b> <span className="text-slate-400">{l.say}</span></span>
        </div>
      ))}
      <div className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${c.go ? 'bg-emerald-400/10 text-emerald-300' : 'bg-slate-400/10 text-slate-300'}`}>
        👔 المدير: {c.go ? `صفقة صالحة — ${c.lot.toFixed(2)} لوت، التزم بالوقف` : 'مراقبة فقط — شروط غير مكتملة'}
      </div>
    </div>
  );
}

function Setup({ title, tone, s, a, crewIn, acct, note }: {
  title: string; tone: 'pending' | 'trade' | 'done';
  s: { side: 'long' | 'short'; entry: number; stop: number; tp1: number; tp2: number; rr: number; score?: number; reason: string[] };
  a: DayAnalysis; crewIn: CrewInput; acct: { balance: number; riskPct: number }; note?: string;
}) {
  const [open, setOpen] = useState(tone !== 'done');
  const long = s.side === 'long';
  const ring = tone === 'pending' ? 'border-amber-400/60 bg-amber-400/[0.06]' : tone === 'trade' ? (long ? 'border-emerald-400/50 bg-emerald-400/[0.05]' : 'border-red-400/50 bg-red-400/[0.05]') : 'border-[#3e3e38] bg-[#30302e]';
  return (
    <div className={`rounded-xl border p-3 ${ring}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-right">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${long ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>{long ? '▲ شراء' : '▼ بيع'}</span>
        <span className="font-display flex-1 text-[13px] font-bold text-slate-100">{title}</span>
        {s.score != null && <span className="font-mono text-[10px] text-amber-300" dir="ltr">{s.score}/100</span>}
        <span className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      <div dir="ltr" className="mt-2 grid grid-cols-4 gap-1.5 text-center font-mono text-[10.5px]">
        <div className="rounded-lg bg-[#262624] py-1"><div className="text-[9px] text-slate-500">ENTRY</div><b className="text-slate-100">{f2(s.entry)}</b></div>
        <div className="rounded-lg bg-[#262624] py-1"><div className="text-[9px] text-slate-500">SL</div><b className="text-red-300">{f2(s.stop)}</b></div>
        <div className="rounded-lg bg-[#262624] py-1"><div className="text-[9px] text-slate-500">TP1</div><b className="text-emerald-300">{f2(s.tp1)}</b></div>
        <div className="rounded-lg bg-[#262624] py-1"><div className="text-[9px] text-slate-500">R:R</div><b className="text-slate-100">{s.rr}</b></div>
      </div>
      {note && <p className="mt-1.5 text-[10.5px] text-amber-200/90">{note}</p>}
      {open && (
        <>
          <ul className="mt-2 space-y-0.5 text-[10.5px] leading-relaxed text-slate-300">
            {s.reason.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
          <Crew a={a} o={crewIn} acct={acct} />
        </>
      )}
    </div>
  );
}

export function ScannerPanel({ all, account, riskPct, live }: { all: Candle[]; account: number; riskPct: number; live: boolean }) {
  const acct = { balance: account, riskPct };
  const [tick, setTick] = useState(0);
  const [checkedAt, setCheckedAt] = useState<number>(() => Date.now());
  const [health, setHealth] = useState<Health>(null);
  const [srv, setSrv] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => { const id = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    fetch('/api/scan?health=1', { cache: 'no-store' }).then((r) => r.json()).then((j) => setHealth(j?.ok ? j : null)).catch(() => setHealth(null));
  }, []);

  // الشموع المغلقة فقط — نفس قاعدة الماسح الخادمي
  // بداية الشمعة الجارية؛ تتغيّر مرة كل 15 دقيقة فقط — لا إعادة تحليل كل ثانية
  const slot = Math.floor(now / M15) * M15;
  const closed = useMemo(() => all.filter((c) => c.time < slot), [all, slot, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = useMemo(() => {
    if (closed.length < 20) return null;
    const last = closed[closed.length - 1].time;
    return analyzeDay(closed, Math.floor(last / DAY) * DAY);
  }, [closed]);
  const lastClosed = closed.length ? closed[closed.length - 1].time : 0;
  const nextIn = Math.max(0, Math.ceil((Math.floor(now / M15) + 1) * M15 - now));
  const cfg = getEngineCfg();

  const runLocal = () => { setTick((x) => x + 1); setCheckedAt(Date.now()); };
  const runServer = async (send: boolean) => {
    const key = lsGet(LS_SCANKEY);
    if (!key) { setSrv('أدخل مفتاح الماسح أولاً: ⚙️ الإعدادات ← مكتب التداول على الخادم'); return; }
    setBusy(true); setSrv('…');
    try {
      const r = await fetch(`/api/scan?key=${encodeURIComponent(key)}${send ? '' : '&dry=1'}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.status === 401) setSrv('❌ مفتاح الماسح لا يطابق SCAN_KEY');
      else if (!j.ok) setSrv('❌ ' + j.error);
      else if (j.skipped) setSrv('🏛️ السوق مغلق — الماسح متوقف حتى الأحد 22:00 UTC');
      else setSrv(`✅ الخادم فحص ${j.candles} شمعة حتى ${String(j.lastClosed).slice(11, 16)} UTC — ${(j.events ?? []).length ? `${j.events.length} حدث${send ? ' أُرسل إلى Telegram' : ''}` : 'لا جديد على آخر شمعة'}`);
    } catch { setSrv('❌ تعذّر الوصول إلى الخادم'); }
    setBusy(false);
  };

  const sigIn = (s: Signal): CrewInput => ({ kind: s.kind ?? 'sweep', side: s.side, entry: s.entry, stop: s.stop, tp1: s.tp1, rr: s.rr, volRatio: s.volRatio, t: s.time, score: s.score,
    label: s.kind === 'mom' ? undefined : a?.sweeps.find((w) => w.time === s.sweepTime)?.levelLabel });
  const pendIn = (p: PendingOrder): CrewInput => ({ kind: 'mom', side: p.side, entry: p.limit, stop: p.stop, tp1: p.tp1, rr: p.rr, volRatio: p.volRatio, t: p.bosTime });
  const active = a ? [...a.signals, ...a.momSignals].filter((s) => s.status === 'active').sort((x, y) => y.time - x.time) : [];
  const done = a ? [...a.signals, ...a.momSignals].filter((s) => s.status !== 'active').sort((x, y) => y.time - x.time) : [];
  const watch = a ? a.sweeps.filter((w) => !a.signals.some((s) => s.sweepTime === w.time) && lastClosed - w.time <= 4 * M15) : [];
  const lp = all.length ? all[all.length - 1].close : 0;
  const un = a ? a.levels.filter((l) => !l.swept && l.kind !== 'OPEN' && Number.isFinite(l.price)) : [];
  const above = un.filter((l) => l.price > lp).sort((x, y) => x.price - y.price)[0];
  const below = un.filter((l) => l.price < lp).sort((x, y) => y.price - x.price)[0];
  const ready = health && health.metaapi && health.telegram && health.chat && health.scanKey;

  return (
    <div className="space-y-3">
      {/* الرأس */}
      <div className="rounded-2xl border border-[#3e3e38] bg-[#30302e] p-3.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} />
          <h2 className="font-display flex-1 text-[17px] font-bold text-slate-50">السكانر</h2>
          <span className="font-mono text-[10px] text-slate-400" dir="ltr">next {Math.floor(nextIn / 60)}:{String(nextIn % 60).padStart(2, '0')}</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          يفحص كل شمعة M15 مغلقة: <b className="text-amber-300">السحب + الحجم</b> و<b className="text-amber-300">الزخم</b>
          {lastClosed ? <> · آخر شمعة <span dir="ltr" className="font-mono">{hm(lastClosed)}</span> UTC</> : null}
          {' '}· فُحص {new Date(checkedAt).toISOString().slice(11, 19)}
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button onClick={runLocal} className="rounded-xl bg-amber-400 px-3 py-2 text-[12px] font-bold text-[#1f1e1d] transition hover:bg-amber-300 active:scale-[.98]">افحص الآن</button>
          <button onClick={() => runServer(true)} disabled={busy} className="rounded-xl border border-amber-400/50 px-3 py-2 text-[12px] font-bold text-amber-300 transition hover:bg-amber-400/10 disabled:opacity-50">أرسل إلى Telegram</button>
        </div>
        <button onClick={() => runServer(false)} disabled={busy} className="mt-1.5 w-full rounded-xl px-3 py-1 text-[10.5px] text-slate-400 hover:text-slate-200 disabled:opacity-50">فحص الخادم بلا إرسال</button>
        {srv && <p className="mt-1.5 rounded-lg bg-[#262624] px-2.5 py-1.5 text-[10.5px] leading-relaxed text-slate-300">{srv}</p>}
        {/* حالة الماسح الخادمي */}
        <div className="mt-2.5 flex flex-wrap gap-1 text-[10px]">
          {health === null ? <span className="text-slate-500">حالة الخادم غير متاحة (تعمل محلياً؟)</span> : ([
            ['MetaApi', health.metaapi], ['Telegram', health.telegram], ['Chat ID', health.chat], ['مفتاح', health.scanKey],
          ] as [string, boolean][]).map(([k, v]) => (
            <span key={k} className={`rounded-full px-2 py-0.5 ${v ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>{v ? '✓' : '✗'} {k}</span>
          ))}
          {health && <span className={`mr-auto font-bold ${ready ? 'text-emerald-300' : 'text-amber-300'}`}>{ready ? 'الماسح الخادمي يعمل 24/5' : 'الماسح الخادمي ينتظر الإعداد'}</span>}
        </div>
      </div>

      {!live && <p className="rounded-xl border border-[#3e3e38] p-3 text-[11px] text-slate-400">اتصل بحسابك ليبدأ السكانر.</p>}

      {a && (
        <>
          {a.momPending && (
            <Setup title={`أمر زخم معلّق — حتى ${hm(a.momPending.expiresAt)}`} tone="pending" a={a} acct={acct}
              s={{ ...a.momPending, entry: a.momPending.limit }} crewIn={pendIn(a.momPending)}
              note={lp ? `السعر الآن ${f2(lp)} — يبعد ${f2(Math.abs(lp - a.momPending.limit))}$ عن الأمر` : undefined} />
          )}
          {active.map((s) => (
            <Setup key={s.id} title={`${s.kind === 'mom' ? 'زخم' : 'سحب + كسر'} · ${hm(s.time)} · نشطة`} tone="trade" a={a} acct={acct} s={s} crewIn={sigIn(s)} />
          ))}
          {watch.map((w) => (
            <div key={w.time} className="rounded-xl border border-dashed border-amber-400/40 p-3 text-[11px] leading-relaxed text-slate-300">
              👀 <b className="text-amber-300">سحب تحت المراقبة</b> · {w.levelLabel} <span dir="ltr" className="font-mono">{f2(w.levelPrice)}</span> ({w.direction === 'below' ? 'أسفل' : 'فوق'})
              {Number.isFinite(w.volRatio as number) && <> · حجم <span dir="ltr" className="font-mono">×{(w.volRatio as number).toFixed(2)}</span></>}
              <div className="text-slate-500">ننتظر كسراً هيكلياً {w.direction === 'below' ? 'صاعداً' : 'هابطاً'} قبل الدخول.</div>
            </div>
          ))}
          {!a.momPending && !active.length && !watch.length && (
            <div className="rounded-xl border border-[#3e3e38] p-3 text-[11px] leading-relaxed text-slate-400">
              🔎 لا فرصة الآن. أقرب سيولة:
              <div className="mt-1 flex justify-between font-mono text-[11px]" dir="ltr">
                <span className="text-red-300">{below ? `▼ ${f2(below.price)}` : '—'}</span>
                <span className="text-emerald-300">{above ? `▲ ${f2(above.price)}` : '—'}</span>
              </div>
              <div className="mt-0.5 flex justify-between text-[10px]"><span>{above?.label ?? ''}</span><span>{below?.label ?? ''}</span></div>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold text-slate-400">صفقات اليوم المغلقة</div>
              <div className="space-y-1">
                {done.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg bg-[#30302e] px-2.5 py-1.5 text-[10.5px]">
                    <span className={s.side === 'long' ? 'text-emerald-300' : 'text-red-300'}>{s.side === 'long' ? '▲' : '▼'}</span>
                    <span className="text-slate-300">{s.kind === 'mom' ? 'زخم' : 'سحب'}</span>
                    <span className="font-mono text-slate-500" dir="ltr">{hm(s.time)} @ {f2(s.entry)}</span>
                    <span className={`mr-auto font-bold ${s.status === 'sl' ? 'text-red-300' : 'text-emerald-300'}`} dir="ltr">{s.status === 'sl' ? '−1R' : `+${s.pnlR}R`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {a.rejected.length > 0 && (
            <details className="rounded-xl border border-[#3e3e38] p-2.5 text-[10.5px] text-slate-400">
              <summary className="cursor-pointer">فرص رفضها الانضباط ({a.rejected.length})</summary>
              <ul className="mt-1.5 space-y-1">
                {a.rejected.map((r, i) => <li key={i}>{r.side === 'long' ? '▲' : '▼'} {r.label} · <span dir="ltr" className="font-mono">{f2(r.entry)}</span> — {r.why}</li>)}
              </ul>
            </details>
          )}
          <p className="text-[9.5px] leading-relaxed text-slate-500">
            الإعداد: حجم السحب {cfg.sweepVol ? `≥ ×${cfg.sweepVol}` : 'بلا فلتر'} · الزخم {cfg.momOn ? (cfg.momBias ? 'مع الافتتاح' : 'مفعّل') : 'معطّل'} · أدنى R:R {cfg.minRR}. الدرجة توافق شروط لا احتمال ربح. ليست نصيحة مالية.
          </p>
        </>
      )}
    </div>
  );
}
