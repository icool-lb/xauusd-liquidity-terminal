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
  const order = ['PDH', 'RES', 'ASIA_H', 'OPEN', 'ASIA_L', 'SUP', 'PDL'];
  const sorted = [...a.levels].sort(
    (x, y) => order.indexOf(x.kind) - order.indexOf(y.kind) || y.price - x.price
  );
  const color: Record<string, string> = {
    PDH: 'text-violet-300', PDL: 'text-violet-300',
    ASIA_H: 'text-amber-300', ASIA_L: 'text-amber-300',
    OPEN: 'text-cyan-300', RES: 'text-red-300', SUP: 'text-emerald-300',
  };
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
            <div className="flex items-center gap-2">
              <span className={`font-medium ${color[lv.kind]}`}>{lv.label}</span>
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
