import { useState } from 'react';
import type { DayAnalysis, Signal, BacktestStats } from '../lib/engine';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{children}</h3>
      <div className="h-px flex-1 bg-[#1a2540]" />
    </div>
  );
}

// ---------- لوحة المستويات ----------
export function LevelsPanel({ a }: { a: DayAnalysis }) {
  const order = ['PDH', 'LON_H', 'LON_C', 'RES', 'ASIA_H', 'OPEN', 'ASIA_L', 'SUP', 'NY_H', 'NY_L', 'NY_C', 'PDL'];
  const sorted = [...a.levels].sort(
    (x, y) => (order.indexOf(x.kind) < 0 ? 99 : order.indexOf(x.kind)) - (order.indexOf(y.kind) < 0 ? 99 : order.indexOf(y.kind)) || y.price - x.price
  );
  const color: Record<string, string> = {
    PDH: 'text-violet-300', PDL: 'text-violet-300',
    ASIA_H: 'text-amber-300', ASIA_L: 'text-amber-300',
    OPEN: 'text-cyan-300', RES: 'text-red-300', SUP: 'text-emerald-300',
    LON_H: 'text-cyan-200', LON_L: 'text-cyan-200', LON_C: 'text-orange-300',
    NY_H: 'text-emerald-200', NY_L: 'text-emerald-200', NY_C: 'text-orange-300',
  };
  const strength = {
    strong: { t: 'قوي', c: 'bg-red-400/15 text-red-300' },
    medium: { t: 'متوسط', c: 'bg-amber-400/15 text-amber-300' },
    weak: { t: 'ضعيف', c: 'bg-slate-500/10 text-slate-500' },
  } as const;
  return (
    <div>
      <SectionTitle>خريطة السيولة والمستويات</SectionTitle>
      <div className="space-y-px">
        {sorted.map((lv, i) => (
          <div
            key={i}
            className={`flex items-center justify-between border border-transparent px-2 py-1.5 text-xs ${
              lv.kind === 'OPEN' ? 'bg-cyan-400/5' : 'hover:bg-[#111a2b]'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`font-medium ${color[lv.kind] ?? 'text-slate-300'}`}>{lv.label}</span>
              <span className={`rounded-sm px-1 py-px text-[8.5px] font-bold ${strength[lv.strength].c}`}>
                {strength[lv.strength].t}
              </span>
              {(lv.kind === 'RES' || lv.kind === 'SUP') && lv.touches > 0 && (
                <span className="text-[8.5px] text-slate-600">{lv.touches} لمسة</span>
              )}
              {lv.swept && (
                <span className="rounded-sm bg-amber-400/15 px-1.5 py-px text-[9px] font-bold text-amber-300">
                  تم سحبه ✓
                </span>
              )}
            </div>
            <span dir="ltr" className={`font-mono text-[11px] ${lv.swept ? 'text-slate-600 line-through' : 'text-slate-200'}`}>
              {fmt(lv.price)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- بطاقة الإشارة ----------
export function SignalCard({ s, bias }: { s: Signal | null; bias: DayAnalysis['bias'] }) {
  const biasText = bias === 'bullish' ? 'صاعد — فوق الافتتاح' : bias === 'bearish' ? 'هابط — تحت الافتتاح' : 'محايد';
  const biasColor = bias === 'bullish' ? 'text-emerald-300' : bias === 'bearish' ? 'text-red-300' : 'text-slate-400';

  if (!s) {
    return (
      <div>
        <SectionTitle>إشارة اليوم</SectionTitle>
        <div className="rounded-md border border-dashed border-[#2a3a5f] p-4 text-center">
          <div className={`mb-1 text-xs font-bold ${biasColor}`}>الاتجاه: {biasText}</div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            لا توجد إشارة مكتملة بعد. القاعدة: لا دخول بدون <span className="text-amber-300">سحب سيولة واضح</span> ثم كسر هيكلي.
          </p>
        </div>
      </div>
    );
  }

  const isLong = s.side === 'long';
  const statusMap = {
    active: { t: 'نشطة', c: 'bg-cyan-400/15 text-cyan-300' },
    tp1: { t: 'حققت الهدف 1 ✓', c: 'bg-emerald-400/15 text-emerald-300' },
    tp2: { t: 'حققت الهدف 2 ✓✓', c: 'bg-emerald-400/15 text-emerald-300' },
    sl: { t: 'ضربت الوقف ✗', c: 'bg-red-400/15 text-red-300' },
  }[s.status];

  return (
    <div>
      <SectionTitle>إشارة اليوم</SectionTitle>
      <div className={`rounded-md border-r-[3px] bg-[#0c1220] p-3 ${isLong ? 'border-emerald-400' : 'border-red-400'}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className={`text-sm font-black ${isLong ? 'text-emerald-300' : 'text-red-300'}`}>
            {isLong ? 'صفقة شراء' : 'صفقة بيع'}
          </span>
          <span className={`rounded-sm px-2 py-0.5 text-[10px] font-bold ${statusMap.c}`}>{statusMap.t}</span>
        </div>
        <div dir="ltr" className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
          <div className="rounded-sm bg-[#111a2b] p-1.5 text-center"><div className="text-[9px] text-slate-500">ENTRY</div><div className="text-white">{fmt(s.entry)}</div></div>
          <div className="rounded-sm bg-[#111a2b] p-1.5 text-center"><div className="text-[9px] text-slate-500">STOP</div><div className="text-red-300">{fmt(s.stop)}</div></div>
          <div className="rounded-sm bg-[#111a2b] p-1.5 text-center"><div className="text-[9px] text-slate-500">TP1</div><div className="text-emerald-300">{fmt(s.tp1)}</div></div>
          <div className="rounded-sm bg-[#111a2b] p-1.5 text-center"><div className="text-[9px] text-slate-500">TP2</div><div className="text-emerald-300">{fmt(s.tp2)}</div></div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">العائد/المخاطرة</span>
          <span dir="ltr" className="font-mono font-bold text-amber-300">1 : {s.rr}</span>
        </div>
        <ul className="mt-2 space-y-1 border-t border-[#1a2540] pt-2">
          {s.reason.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-slate-400">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-cyan-400" />{r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- حاسبة المخاطرة ----------
export function RiskCalc({ s, account, riskPct }: { s: Signal | null; account: number; riskPct: number }) {
  const riskUsd = (account * riskPct) / 100;
  const stopDist = s ? Math.abs(s.entry - s.stop) : 0;
  // أونصة ذهب: كل 1$ حركة = 1$ لكل أونصة. اللوت القياسي = 100 أونصة
  const lots = s && stopDist > 0 ? riskUsd / (stopDist * 100) : 0;
  return (
    <div>
      <SectionTitle>حاسبة حجم الصفقة</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
        <div className="rounded-sm bg-[#0c1220] p-2"><div className="text-[9px] text-slate-500">المخاطرة $</div><div dir="ltr" className="font-mono font-bold text-white">{riskUsd.toFixed(0)}</div></div>
        <div className="rounded-sm bg-[#0c1220] p-2"><div className="text-[9px] text-slate-500">مسافة الوقف</div><div dir="ltr" className="font-mono font-bold text-white">{s ? stopDist.toFixed(1) + '$' : '—'}</div></div>
        <div className="rounded-sm bg-amber-400/10 p-2"><div className="text-[9px] text-amber-300/70">الحجم (لوت)</div><div dir="ltr" className="font-mono font-black text-amber-300">{s ? lots.toFixed(2) : '—'}</div></div>
      </div>
    </div>
  );
}

// ---------- إحصائيات الباك تست ----------
export function StatsPanel({ st }: { st: BacktestStats }) {
  const items = [
    { l: 'أيام الاختبار', v: String(st.days) },
    { l: 'إشارات', v: String(st.total) },
    { l: 'نسبة النجاح', v: st.total ? `${st.winRate}%` : '—', hot: st.winRate >= 50 },
    { l: 'متوسط R:R', v: st.total ? `1:${st.avgRR}` : '—' },
    { l: 'المحصلة R', v: st.total ? `${st.totalR > 0 ? '+' : ''}${st.totalR}R` : '—', hot: st.totalR > 0 },
  ];
  return (
    <div>
      <SectionTitle>أداء الاستراتيجية (محاكاة)</SectionTitle>
      <div className="grid grid-cols-5 gap-1">
        {items.map((it, i) => (
          <div key={i} className="rounded-sm bg-[#0c1220] p-2 text-center">
            <div className="text-[8.5px] text-slate-500">{it.l}</div>
            <div dir="ltr" className={`font-mono text-[12px] font-bold ${it.hot === undefined ? 'text-slate-200' : it.hot ? 'text-emerald-300' : 'text-red-300'}`}>{it.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- سجل الأحداث ----------
export function EventsLog({ a }: { a: DayAnalysis }) {
  const t = (unix: number) =>
    new Date(unix * 1000).toISOString().slice(11, 16) + ' UTC';
  const rows: { time: string; text: string; cls: string }[] = [];
  for (const sw of a.sweeps) {
    rows.push({
      time: t(sw.time),
      text: `سحب سيولة ${sw.levelLabel} — اختراق ${sw.penetration}$ ثم عودة (فتيل رفض)`,
      cls: 'text-amber-300',
    });
  }
  for (const s of a.signals) {
    rows.push({ time: t(s.chochTime), text: `كسر هيكلي ${s.side === 'long' ? 'صاعد' : 'هابط'} (CHoCH)`, cls: 'text-cyan-300' });
    rows.push({ time: t(s.time), text: `تفعيل إشارة ${s.side === 'long' ? 'شراء' : 'بيع'} عند ${s.entry}`, cls: s.side === 'long' ? 'text-emerald-300' : 'text-red-300' });
    if (s.status !== 'active') {
      rows.push({ time: '—', text: `النتيجة: ${s.status === 'sl' ? 'وقف خسارة (-1R)' : `هدف محقق (+${s.pnlR}R)`}`, cls: s.status === 'sl' ? 'text-red-400' : 'text-emerald-400' });
    }
  }
  rows.sort((x, y) => x.time.localeCompare(y.time));
  return (
    <div>
      <SectionTitle>سجل أحداث الجلسة</SectionTitle>
      {rows.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-slate-600">لم تُرصد أحداث بعد في هذا اليوم</p>
      ) : (
        <div className="max-h-40 space-y-1 overflow-y-auto pl-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-baseline gap-2 text-[11px]">
              <span dir="ltr" className="shrink-0 font-mono text-[10px] text-slate-600">{r.time}</span>
              <span className={r.cls}>{r.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- خطة الجلسة ----------
export function SessionPlan() {
  const steps = [
    'حدّد نطاق آسيا (قمة + قاع) قبل لندن',
    'حدّد الاتجاه: فوق الافتتاح = شراء فقط',
    'انتظر سحب سيولة واضح (فتيل + عودة)',
    'انتظر الكسر الهيكلي على M15',
    'ادخل عند إعادة الاختبار — وقفك خلف قاع/قمة السحب',
    'هدفك الأول: السيولة المقابلة — R:R لا يقل عن 1:2',
    'صفقة واحدة لليوم، وتوقف عند أول خبر أحمر',
  ];
  return (
    <div>
      <SectionTitle>قائمة انضباط الجلسة</SectionTitle>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-[#2a3a5f] font-mono text-[9px] text-amber-300">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}


// ---------- لوحة الاتصال بـ MetaApi ----------
export function ConnectionPanel({
  creds,
  status,
  error,
  onSave,
  onTest,
}: {
  creds: { token: string; accountId: string; symbol: string } | null;
  status: 'idle' | 'loading' | 'ok' | 'error';
  error: string;
  onSave: (c: { token: string; accountId: string; symbol: string }) => void;
  onTest: () => void;
}) {
  const [token, setToken] = useState(creds?.token ?? '');
  const [accountId, setAccountId] = useState(creds?.accountId ?? '');
  const [symbol, setSymbol] = useState(creds?.symbol ?? 'XAUUSD');

  const statusBadge = {
    idle: { t: 'غير متصل', c: 'bg-slate-600/30 text-slate-400' },
    loading: { t: 'جارٍ الاتصال…', c: 'bg-amber-400/15 text-amber-300' },
    ok: { t: 'متصل ● بيانات حية', c: 'bg-emerald-400/15 text-emerald-300' },
    error: { t: 'فشل الاتصال', c: 'bg-red-400/15 text-red-300' },
  }[status];

  return (
    <div>
      <SectionTitle>الاتصال بالبيانات الحقيقية — MetaApi</SectionTitle>
      <div className="space-y-2 rounded-md border border-[#1a2540] bg-[#0c1220] p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500">حساب MT4/MT5 عبر MetaApi</span>
          <span className={`rounded-sm px-1.5 py-0.5 text-[9px] font-bold ${statusBadge.c}`}>{statusBadge.t}</span>
        </div>
        <label className="block text-[10px] text-slate-500">
          API Token
          <input
            type="password" value={token} onChange={(e) => setToken(e.target.value)}
            placeholder="من app.metaapi.cloud/token"
            className="mt-0.5 w-full rounded-sm border border-[#1a2540] bg-[#080c16] px-2 py-1 font-mono text-[10px] text-white outline-none focus:border-amber-400/50"
            dir="ltr"
          />
        </label>
        <label className="block text-[10px] text-slate-500">
          Account ID
          <input
            type="text" value={accountId} onChange={(e) => setAccountId(e.target.value)}
            placeholder="مثال: 865d3a4d-3803-486d-…"
            className="mt-0.5 w-full rounded-sm border border-[#1a2540] bg-[#080c16] px-2 py-1 font-mono text-[10px] text-white outline-none focus:border-amber-400/50"
            dir="ltr"
          />
        </label>
        <label className="block text-[10px] text-slate-500">
          رمز الذهب عند وسيطك
          <input
            type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)}
            placeholder="XAUUSD / XAUUSD. / GOLD"
            className="mt-0.5 w-full rounded-sm border border-[#1a2540] bg-[#080c16] px-2 py-1 font-mono text-[10px] text-white outline-none focus:border-amber-400/50"
            dir="ltr"
          />
        </label>
        <div className="flex gap-1.5 pt-1">
          <button
            onClick={() => onSave({ token: token.trim(), accountId: accountId.trim(), symbol: symbol.trim() || 'XAUUSD' })}
            className="flex-1 rounded-sm bg-amber-400 px-2 py-1.5 text-[11px] font-black text-black transition hover:bg-amber-300 active:scale-95"
          >
            حفظ واتصال
          </button>
          <button
            onClick={onTest}
            className="rounded-sm border border-[#2a3a5f] px-2.5 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-[#111a2b] active:scale-95"
          >
            اختبار
          </button>
        </div>
        {status === 'error' && (
          <p className="rounded-sm bg-red-400/10 p-1.5 text-[10px] leading-relaxed text-red-300">{error}</p>
        )}
        <p className="text-[9px] leading-relaxed text-slate-600">
          التوكن يُحفظ في متصفحك فقط (localStorage) ولا يُرسل لأي جهة سوى خوادم MetaApi الرسمية.
          حسابك يجب أن يكون بحالة DEPLOYED ومتصلاً بالوسيط.
        </p>
      </div>
    </div>
  );
}


// ---------- منحنى رأس المال ----------
export function EquityCurve({ st }: { st: import('../lib/engine').BacktestFull }) {
  if (!st.curve.length) return null;
  const W = 240, H = 56, pad = 4;
  const rs = st.curve.map((c) => c.r);
  const min = Math.min(0, ...rs), max = Math.max(1, ...rs);
  const px = (i: number) => pad + (i / Math.max(1, rs.length - 1)) * (W - pad * 2);
  const py = (r: number) => H - pad - ((r - min) / (max - min || 1)) * (H - pad * 2);
  const pts = st.curve.map((c, i) => `${px(i)},${py(c.r)}`).join(' ');
  const pos = st.totalR >= 0;
  return (
    <div>
      <SectionTitle>منحنى الأداء التراكمي (R)</SectionTitle>
      <div className="rounded-md border border-[#1a2540] bg-[#0c1220] p-2" dir="ltr">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <line x1={0} x2={W} y1={py(0)} y2={py(0)} stroke="#2a3a5f" strokeDasharray="3 3" strokeWidth="0.5" />
          <polyline points={`${px(0)},${py(0)} ${pts}`} fill="none" stroke={pos ? '#34d399' : '#f87171'} strokeWidth="1.5" />
          <text x={W - 4} y={py(rs[rs.length - 1]) - 3} textAnchor="end" fill={pos ? '#34d399' : '#f87171'} fontSize="9" fontFamily="JetBrains Mono">
            {st.totalR > 0 ? '+' : ''}{st.totalR}R
          </text>
        </svg>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-center text-[10px]">
        <div className="rounded-sm bg-[#0c1220] p-1.5">
          <div className="text-[8.5px] text-slate-500">التوقع لكل صفقة</div>
          <div dir="ltr" className={`font-mono font-bold ${st.expectancyR >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{st.expectancyR}R</div>
        </div>
        <div className="rounded-sm bg-[#0c1220] p-1.5">
          <div className="text-[8.5px] text-slate-500">أقصى تراجع</div>
          <div dir="ltr" className="font-mono font-bold text-red-300">-{st.maxDrawdownR}R</div>
        </div>
      </div>
    </div>
  );
}

// ---------- أي مستوى يعطي أفضل الإشارات ----------
export function LevelStats({ st }: { st: import('../lib/engine').BacktestFull }) {
  if (!st.byLevel.length) return null;
  return (
    <div>
      <SectionTitle>أداء الإشارات حسب المستوى</SectionTitle>
      <div className="space-y-1">
        {st.byLevel.map((l, i) => {
          const wr = Math.round((l.wins / l.signals) * 100);
          return (
            <div key={i} className="flex items-center gap-2 text-[10.5px]">
              <span className="w-28 truncate text-slate-400">{l.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#111a2b]">
                <div className={`h-full ${wr >= 50 ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${wr}%` }} />
              </div>
              <span dir="ltr" className="w-16 text-left font-mono text-[9.5px] text-slate-500">{l.wins}/{l.signals} · {wr}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- الخط الزمني للجلسات (24 ساعة UTC) ----------
export function SessionTimeline() {
  const now = new Date();
  const pct = ((now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 86400) * 100;
  const segs = [
    { from: 0, to: 8, c: '#fbbf2422', label: 'آسيا' },
    { from: 7, to: 10, c: '#22d3ee33', label: 'KZ لندن' },
    { from: 8, to: 13, c: '#22d3ee18', label: 'لندن' },
    { from: 12, to: 15, c: '#34d39933', label: 'KZ نيويورك' },
    { from: 13, to: 21, c: '#34d39918', label: 'نيويورك' },
  ];
  return (
    <div className="relative h-8 select-none" dir="ltr">
      <div className="absolute inset-x-0 top-3 h-3 overflow-hidden rounded-sm bg-[#0c1220]">
        {segs.map((s, i) => (
          <div key={i} className="absolute top-0 h-full" style={{ left: `${(s.from / 24) * 100}%`, width: `${((s.to - s.from) / 24) * 100}%`, background: s.c }} />
        ))}
        <div className="absolute top-0 h-full w-px bg-amber-400" style={{ left: `${pct}%` }}>
          <div className="absolute -top-1 right-0 h-2 w-2 translate-x-1/2 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]" />
        </div>
      </div>
      <div className="absolute inset-x-0 top-6 flex justify-between font-mono text-[8px] text-slate-600">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
      </div>
    </div>
  );
}

// ---------- طاقم الخبراء — مراقبة لحظية وتنبيهات ----------
import { sessionOf, inKillZone, newsImpactNote, type BacktestFull, type NewsEvent, type WhalePrint, type ConditionStat } from '../lib/engine';

interface ExpertDef {
  name: string;
  role: string;
  color: string;
  proposal: string;
}

const EXPERT_META: ExpertDef[] = [
  { name: 'مايكل روس', role: 'خبير مالي — بورصة نيويورك', color: '#f87171', proposal: 'تقويم أخبار مع حظر دخول آلي وقت الإصدارات' },
  { name: 'كينجي ساتو', role: 'خبير مالي — بورصة طوكيو', color: '#34d399', proposal: 'تقرير صباحي: اتساع آسيا مقارنة بمتوسط 5 أيام' },
  { name: 'أليكس ريد', role: 'خبير استراتيجيات + TradingView', color: '#22d3ee', proposal: 'مزامنة الإشارات مع TradingView عبر Webhook' },
  { name: 'المحلل الرئيسي — أنا', role: 'منسق تحليل السيولة ICT', color: '#a78bfa', proposal: 'دفتر صفقات (Journal) لقياس الانضباط' },
  { name: 'مهندس البيانات — أنا', role: 'موثوقية التغذية MetaApi', color: '#fbbf24', proposal: 'تنبيه تيليجرام عند انقطاع التغذية' },
  { name: 'مدير المخاطر — أنا', role: 'حماية رأس المال', color: '#e879f9', proposal: 'إحصاءات أداء حسب الجلسة' },
  { name: 'مدير التطوير — أنا', role: 'دورة اقتراحات آلية ← اعتماد', color: '#fb923c', proposal: 'فلتر R:R ديناميكي حسب نسبة النجاح الأسبوعية' },
  { name: 'لينا حداد', role: 'مديرة الأخبار الاقتصادية والجيوسياسية', color: '#f87171', proposal: 'حظر دخول آلي من 10 دقائق قبل الخبر حتى شمعة الإغلاق بعده' },
  { name: 'جيك ليفيت', role: 'خبير الحيتان — تدفق البنوك ورؤوس الأموال', color: '#22d3ee', proposal: 'فلتر تزامن: لا دخول إلا مع بصمة حجم مؤسسي' },
  { name: 'خبير Databento — أنا', role: 'صفقات المؤسسات من CME (عقد GC)', color: '#60a5fa', proposal: 'رصد أعماق السوق عبر MBP-10 لعقود الذهب' },
  { name: 'ماركو فيشر', role: 'متابعة استراتيجيات ومؤشرات المنصات الاحترافية', color: '#34d399', proposal: 'بناء إشارة مساعدة من أفضل شرط مؤشرات مثبت على بياناتنا' },
  { name: 'يوسف النجار', role: 'خبير بصمة الشموع — Candle DNA', color: '#a78bfa', proposal: 'قراءة DNA كل شمعة عبر 8 أطر وتحويلها إلى موجة تداول بمسار مستهدفات' },
  { name: 'ساندي كوهين', role: 'خبيرة استراتيجيات ومؤشرات TradingView', color: '#34d399', proposal: 'دمج أفضل الاستراتيجيات المتفقة في صفقة واحدة بهدف 10$ على 0.01' },
];

export interface CrewExtra {
  news: NewsEvent[];
  whales: WhalePrint[];
  conds: ConditionStat[];
  dbOk: boolean | null;
  stratBest?: { name: string; winRate: number; trades: number; netPnl: number } | null;
  stratLive?: string;
}

export interface CrewWave { dir: 'up' | 'down' | 'flat'; strength: number; summary: string; path: { price: number; label: string }[]; }

export function CrewPanel({ a, st, lastCandleTime, extra, wave }: { a: DayAnalysis | null; st: BacktestFull | null; lastCandleTime: number; extra?: CrewExtra; wave?: CrewWave | null }) {
  const [open, setOpen] = useState(true);
  const now = Math.floor(Date.now() / 1000);
  const kz = inKillZone(now);
  const sess = sessionOf(now);
  const price = a?.lastPrice ?? 0;

  // رصد لحظي لكل خبير من بيانات المنصة الفعلية
  const unswept = a?.levels.filter((l) => !l.swept && l.kind !== 'OPEN' && Number.isFinite(l.price)) ?? [];
  const above = [...unswept].filter((l) => l.price > price).sort((x, y) => x.price - y.price)[0];
  const below = [...unswept].filter((l) => l.price < price).sort((x, y) => y.price - x.price)[0];
  const asiaW = a ? a.asiaHigh - a.asiaLow : 0;
  const minsAgo = lastCandleTime ? Math.max(0, Math.round((now - lastCandleTime) / 60)) : null;

  const lines: string[] = [
    kz
      ? `⚡ منطقة قتل ${sess === 'london' ? 'لندن' : 'نيويورك'} نشطة — ${above ? `راقب سحب ${above.label} ${fmt(above.price)}` : 'لا سيولة علوية'} / ${below ? `${below.label} ${fmt(below.price)}` : 'لا سيولة سفلية'}`
      : 'الصيد متوقف خارج مناطق القتل (07–10 / 12–15 UTC)',
    !a ? 'بانتظار بيانات آسيا…'
      : asiaW < 8 ? `نطاق آسيا ضيق (${asiaW.toFixed(1)}$) — توقّع اختراق حاد مع لندن`
      : asiaW > 16 ? `نطاق آسيا واسع (${asiaW.toFixed(1)}$) — السيولة بعيدة، انتظر السحب أولاً`
      : `نطاق آسيا طبيعي (${asiaW.toFixed(1)}$)`,
    st ? `الباك-تيست: ${st.winRate}% نجاح على ${st.total} إشارة — التوقع ${st.expectancyR >= 0 ? '+' : ''}${st.expectancyR}R ${st.expectancyR > 0 ? '— الاستراتيجية جاهزة' : '— حذر'}` : 'لا نتائج باك-تيست كافية بعد',
    a ? `${a.sweeps.length} سحب سيولة اليوم — ${unswept.length} مستويات لم تُسحب بعد` : 'لا تحليل بعد',
    minsAgo === null ? 'غير متصل بمصدر البيانات'
      : minsAgo <= 1 ? `البيانات حية — آخر شمعة قبل ${minsAgo} دقيقة`
      : `⚠️ آخر شمعة قبل ${minsAgo} دقيقة — تحقق من الاتصال`,
    st ? `أقصى تراجع ${st.maxDrawdownR}R — ثبّت المخاطرة 1% ولا ترفعها بعد الخسارة` : 'ثبّت المخاطرة 1% لكل صفقة',
    // مدير التطوير
    autoDevCount(st, extra?.whales.length ?? 0, extra?.news.length ?? 0, extra?.conds)
      ? `${autoDevCount(st, extra?.whales.length ?? 0, extra?.news.length ?? 0, extra?.conds)} اقتراح تطوير في دورة العرض — الأحدث: ${latestDev(st, extra)}`
      : 'لا اقتراحات تطوير مفتوحة — النظام مستقر',
    // مديرة الأخبار — تنظيم ذاتي
    (() => {
      const all = extra?.news ?? [];
      const next = all.filter((e) => e.time > now).sort((x, y) => x.time - y.time)[0];
      if (!next) return `نظّمت ${all.length} خبراً هذا الأسبوع تلقائياً — لا أخبار قادمة الآن`;
      const mins = Math.round((next.time - now) / 60);
      return `أدير ${all.length} خبراً هذا الأسبوع — القادم ${mins > 0 ? `بعد ${mins} دقيقة` : 'الآن'}: «${next.title}» — توقعي جاهز مع سيناريوهاته`;
    })(),
    // خبير الحيتان
    (() => {
      const w = (extra?.whales ?? [])[extra!.whales.length - 1];
      return w
        ? `آخر بصمة ${w.side} @ ${fmt(w.price)} (${w.rangeX.toFixed(1)}× المدى) — ${(extra?.whales.length ?? 0) > 1 ? 'نشاط مؤسسي متكرر، راقب الامتداد' : 'راقب هل تُتبع باستمرارية'}`
        : 'لا بصمات حيتان مرصودة — السيولة هادئة، لا تطارد الصفقة الكبيرة الآن';
    })(),
    // خبير Databento
    extra?.dbOk === true ? 'تغذية Databento متصلة — اضغط «فحص الحيتان» لسحب صفقات GC المؤسسية'
      : extra?.dbOk === false ? 'مفتاح Databento غير متصل — أدخله في لوحة الحيتان للحصول على بيانات البنوك'
      : 'تغذية Databento غير مهيأة — أدخل المفتاح لرصد صفقات المؤسسات من CME',
    // ماركو فيشر — استراتيجيات المنصات
    (() => {
      const c = extra?.conds ?? [];
      if (!c.length) return 'جارٍ جمع عينة كافية من بياناتك لتقييم شروط المؤشرات…';
      const best = c[0];
      return `أفضل شرط على بياناتك: «${best.name}» — نجاح ${best.winRate}% في ${best.hits} حالة — ابنِ عليه`;
    })(),
    // يوسف النجار — بصمة الشموع
    wave ? `${wave.dir === 'flat' ? '◆ لا موجة الآن' : wave.dir === 'up' ? `▲ موجة صاعدة ${wave.strength}%` : `▼ موجة هابطة ${wave.strength}%`} — ${wave.path[0] ? `التالي: ${fmt(wave.path[0].price)} (${wave.path[0].label})` : 'أجمع بصمات الأطر…'}` : 'بانتظار سلالم الأطر الصغرى (دقيقة/5 دقائق)…',
    // ساندي كوهين — مختبر الاستراتيجيات
    extra?.stratBest
      ? `الأفضل الآن: «${extra.stratBest.name}» — ربح ${extra.stratBest.winRate}% على ${extra.stratBest.trades} صفقة (+${extra.stratBest.netPnl}$/0.01) — ${extra.stratLive ? `الدمج يقول: ${extra.stratLive}` : 'لا إشارة دمج مفتوحة'}`
      : 'المختبر يحتاج بيانات متصلة لاختبار الاستراتيجيات الثماني…',
  ];

  function autoDevCount(st2: BacktestFull | null, wl: number, nw: number, conds2?: ConditionStat[]): number {
    let n = 0;
    if (st2 && (st2.winRate < 45 || st2.expectancyR > 0 || st2.maxDrawdownR > 6)) n++;
    if (wl >= 2) n++;
    if (nw > 0) n++;
    if (conds2?.length && conds2[0].winRate >= 55) n++;
    return n;
  }
  function latestDev(st2: BacktestFull | null, ex?: CrewExtra): string {
    if (st2 && st2.winRate < 45) return 'شدّد فلتر R:R إلى 1:2.5';
    if (st2 && st2.maxDrawdownR > 6) return 'حظر التداول بعد خسارتين متتاليتين';
    if ((ex?.whales.length ?? 0) >= 2) return 'فلتر تزامن مع بصمات الحجم';
    if ((ex?.news.length ?? 0) > 0) return 'حظر دخول آلي وقت الأخبار';
    if (ex?.conds?.length && ex.conds[0].winRate >= 55) return `إشارة مساعدة من «${ex.conds[0].name}»`;
    if (st2) return 'دخول ثانٍ بعد الهدف الأول';
    return 'بانتظار البيانات';
  }

  // آخر أحداث الطاقم (منسوبة)
  const feed: { t: number; who: string; color: string; msg: string }[] = [];
  if (a) {
    for (const sw of a.sweeps.slice(-4)) {
      feed.push({ t: sw.time, who: 'المحلل الرئيسي', color: '#a78bfa', msg: `سحب ${sw.levelLabel} — اختراق ${sw.penetration}$ ثم عودة` });
    }
    const s = a.signals[0];
    if (s) feed.push({ t: s.time, who: 'خبير الاستراتيجيات', color: '#22d3ee', msg: `تفعيل ${s.side === 'long' ? 'شراء' : 'بيع'} @ ${fmt(s.entry)} — R:R 1:${s.rr}` });
    for (const w of (extra?.whales ?? []).slice(-2)) {
      feed.push({ t: w.time, who: 'خبير الحيتان', color: '#22d3ee', msg: `بصمة ${w.side} @ ${fmt(w.price)} — مدى ${w.range.toFixed(1)}$` });
    }
    const nextEv = (extra?.news ?? []).filter((e) => e.time > now).sort((x, y) => x.time - y.time)[0];
    if (nextEv) feed.push({ t: nextEv.time, who: 'مديرة الأخبار', color: '#f87171', msg: `مجدول: «${nextEv.title}» — ${newsImpactNote(nextEv).move}` });
    const bestCond = extra?.conds?.[0];
    if (bestCond && bestCond.winRate >= 55) feed.push({ t: now, who: 'ماركو فيشر', color: '#34d399', msg: `توصية بناء: «${bestCond.name}» نجح ${bestCond.winRate}% — جرّبه على 0.01` });
    feed.sort((x, y) => y.t - x.t);
  }

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="mb-2 flex w-full items-center gap-2 text-right">
        <span className={`h-1.5 w-1.5 rounded-full ${kz ? 'animate-pulse bg-red-400' : 'bg-amber-400'}`} />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">طاقم الخبراء — مراقبة لحظية</h3>
        <div className="h-px flex-1 bg-[#1a2540]" />
        <span className="text-[10px] text-slate-600">{open ? '▲ طي' : '▼ عرض (13)'}</span>
      </button>
      {open && (
        <div className="space-y-1.5">
          {EXPERT_META.map((e, i) => (
            <div key={i} className="rounded-sm border border-[#1a2540] bg-[#0c1220] p-2">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-black" style={{ background: e.color + '22', color: e.color }}>
                  {e.name[0]}
                </span>
                <div className="flex-1">
                  <div className="text-[11px] font-bold leading-none text-white">{e.name}</div>
                  <div className="mt-0.5 text-[8.5px] text-slate-500">{e.role}</div>
                </div>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.color, opacity: kz && i === 0 ? 1 : 0.5 }} />
              </div>
              <p className="text-[10px] leading-relaxed text-slate-300">{lines[i]}</p>
              <p className="mt-0.5 text-[9px] leading-relaxed text-slate-600">
                <span style={{ color: e.color }}>تطوير مقترح: </span>{e.proposal}
              </p>
            </div>
          ))}
          {feed.length > 0 && (
            <div className="rounded-sm border border-[#1a2540] bg-[#080c16] p-2">
              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">آخر أحداث الطاقم</div>
              {feed.slice(0, 4).map((f, i) => (
                <div key={i} className="flex items-start gap-1.5 py-0.5 text-[10px] text-slate-400">
                  <span className="mt-0.5 font-mono text-[8.5px] text-slate-600" dir="ltr">
                    {new Date(f.t * 1000).toISOString().slice(11, 16)}
                  </span>
                  <span className="shrink-0 font-bold" style={{ color: f.color }}>{f.who}:</span>
                  <span>{f.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
