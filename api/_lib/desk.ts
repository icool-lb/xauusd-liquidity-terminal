// ============================================================
// مكتب التداول الخادمي: تحليل + طاقم خبراء + صياغة تنبيهات Telegram
// يستعمل محرّك المنصّة نفسه (src/lib/engine) فتتطابق الإشارات مع ما تراه في الواجهة
// ============================================================
import {
  analyzeDay, backtestStrats, getEngineCfg, inKillZone, normalizeCfg, sessionOf, setEngineCfg, setSessionWindows,
  type Candle, type DayAnalysis, type EngineCfg, type PendingOrder, type Signal,
} from '../../src/lib/engine.js';
import { esc } from './telegram.js';
import { crew, lotFor as lotCalc, CREW_ROLES, type CrewInput } from '../../src/lib/crew.js';

const DAY = 86400, M15 = 900;
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const hm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);

// إعدادات الخادم: ENGINE_CFG و SESSION_WINDOWS (JSON) تطابق ما اعتمدته في صفحة الإعدادات
export function applyServerConfig() {
  try { if (process.env.ENGINE_CFG) setEngineCfg(normalizeCfg(JSON.parse(process.env.ENGINE_CFG) as Partial<EngineCfg>)); } catch { /* تجاهل */ }
  try { if (process.env.SESSION_WINDOWS) setSessionWindows(JSON.parse(process.env.SESSION_WINDOWS)); } catch { /* تجاهل */ }
}

export function risk() {
  const bal = Number(process.env.ACCOUNT_BALANCE) || 10000;
  const pct = Math.min(3, Math.max(0.1, Number(process.env.RISK_PCT) || 1));
  return { bal, pct, usd: (bal * pct) / 100 };
}
// XAUUSD: لوت واحد = 100 أونصة ⇒ حركة 1$ = 100$ للوت
export function lotFor(stopDist: number) {
  const r = risk();
  return lotCalc(stopDist, r.bal, r.pct);
}

// الشموع المغلقة فقط: الشمعة الجارية تتغيّر ولا يُبنى عليها تنبيه
export function closedOnly(c: Candle[], now = Date.now() / 1000) {
  return c.filter((x) => x.time + M15 <= now + 5);
}

export function today(c: Candle[]): DayAnalysis | null {
  if (!c.length) return null;
  const last = c[c.length - 1].time;
  return analyzeDay(c, Math.floor(last / DAY) * DAY);
}

// ---------------- طاقم الخبراء: من src/lib/crew (نفس ما يعرضه السكانر في الواجهة) ----------------
function crewFor(a: DayAnalysis, o: CrewInput) {
  const r = risk();
  return crew(a, o, { balance: r.bal, riskPct: r.pct });
}

function block(title: string, a: DayAnalysis, s: { kind: 'sweep' | 'mom'; side: 'long' | 'short'; entry: number; stop: number; tp1: number; tp2: number; rr: number; volRatio?: number; t: number; label?: string; score?: number; reason: string[] }, extra = '') {
  const long = s.side === 'long';
  const c = crewFor(a, s);
  const head = `${long ? '🟢' : '🔴'} <b>${title}</b> · XAUUSD ${long ? 'شراء' : 'بيع'}`;
  return [
    head,
    `دخول <b>${f2(s.entry)}</b>${extra}`,
    `وقف <b>${f2(s.stop)}</b> (${f2(Math.abs(s.entry - s.stop))}$) · هدف1 <b>${f2(s.tp1)}</b> · هدف2 ${f2(s.tp2)}`,
    s.score != null ? `درجة التوافق ${s.score}/100` : '',
    '',
    ...s.reason.map((r) => '• ' + esc(r)),
    '',
    ...c.lines.map((l) => `${l.ok === true ? '✅' : l.ok === false ? '⚠️' : '▫️'} ${l.who}: ${esc(l.say)}`),
    `📦 الحجم المقترح: <b>${c.lot.toFixed(2)}</b> لوت`,
    '',
    c.go ? '👔 <b>المدير: صفقة صالحة</b> — التزم بالوقف ولا تحرّكه' : '👔 <b>المدير: مراقبة فقط</b> — شروط غير مكتملة',
    `<i>${hm(s.t)} UTC · ليست نصيحة مالية</i>`,
  ].filter((x) => x !== '').join('\n');
}

export function sigMsg(a: DayAnalysis, s: Signal) {
  const sw = a.sweeps.find((x) => x.time === s.sweepTime);
  return block(s.kind === 'mom' ? 'تفعيل أمر الزخم' : 'سحب سيولة + كسر هيكلي', a,
    { ...s, kind: s.kind ?? 'sweep', t: s.time, label: sw?.levelLabel });
}

export function pendingMsg(a: DayAnalysis, p: PendingOrder) {
  return block('أمر زخم معلّق (Limit)', a,
    { kind: 'mom', side: p.side, entry: p.limit, stop: p.stop, tp1: p.tp1, tp2: p.tp2, rr: p.rr, volRatio: p.volRatio, t: p.bosTime, reason: p.reason },
    ` (أمر محدد — صالح حتى ${hm(p.expiresAt)} UTC، يُلغى إن لم يُعبَّأ)`);
}

// ---------------- المسح: ما الجديد على آخر شمعة مغلقة؟ ----------------
export interface ScanOut { lastClosed: number; price: number; events: { type: string; text: string }[]; analysis: DayAnalysis | null }

export function scan(all: Candle[], now = Date.now() / 1000): ScanOut {
  const c = closedOnly(all, now);
  const a = today(c);
  const last = c.length ? c[c.length - 1] : null;
  const out: ScanOut = { lastClosed: last?.time ?? 0, price: last?.close ?? 0, events: [], analysis: a };
  if (!a || !last) return out;
  const T = last.time; // كل تشغيل يرى شمعة مغلقة مختلفة ⇒ لا تكرار مع تشغيل كل 15 دقيقة
  for (const s of a.signals) if (s.chochTime === T) out.events.push({ type: 'sweep', text: sigMsg(a, s) });
  for (const s of a.momSignals) if (s.time === T) out.events.push({ type: 'mom-fill', text: sigMsg(a, s) });
  if (a.momPending && a.momPending.bosTime === T) out.events.push({ type: 'mom-pending', text: pendingMsg(a, a.momPending) });
  // إنذار مبكر: سحب حدث الآن بحجم مرتفع ولم يكتمل الكسر بعد
  const minV = getEngineCfg().sweepVol;
  for (const sw of a.sweeps) if (sw.time === T && !a.signals.some((s) => s.sweepTime === sw.time)
    && (!minV || !Number.isFinite(sw.volRatio as number) || (sw.volRatio as number) >= minV)) {
    const vr = Number.isFinite(sw.volRatio as number) ? ` · حجم ×${f2(sw.volRatio as number)}` : '';
    out.events.push({ type: 'sweep-watch', text: `👀 <b>سحب سيولة الآن</b> · ${esc(sw.levelLabel)} ${f2(sw.levelPrice)} (${sw.direction === 'below' ? 'أسفل' : 'فوق'}، أقصى ${f2(sw.extreme)})${vr}\nننتظر كسراً هيكلياً ${sw.direction === 'below' ? 'صاعداً' : 'هابطاً'} قبل أي دخول.` });
  }
  return out;
}

// ---------------- نصوص الأوامر ----------------
export function statusText(all: Candle[]) {
  const c = closedOnly(all);
  const a = today(c);
  if (!a) return 'لا توجد بيانات كافية لليوم بعد.';
  const lp = all[all.length - 1]?.close ?? a.lastPrice;
  const un = a.levels.filter((l) => !l.swept && l.kind !== 'OPEN' && Number.isFinite(l.price));
  const ab = un.filter((l) => l.price > lp).sort((x, y) => x.price - y.price).slice(0, 2);
  const be = un.filter((l) => l.price < lp).sort((x, y) => y.price - x.price).slice(0, 2);
  const sess = sessionOf(Math.floor(Date.now() / 1000));
  const lines = [
    `🟡 <b>XAUUSD ${f2(lp)}</b> · ${a.bias === 'bullish' ? '▲ فوق الافتتاح (إيجابي)' : a.bias === 'bearish' ? '▼ تحت الافتتاح (سلبي)' : '● حول الافتتاح'}`,
    `الافتتاح ${f2(a.open)} · ${sess === 'asia' ? 'آسيا' : sess === 'london' ? 'لندن' : sess === 'ny' ? 'نيويورك' : 'خارج الجلسات'}${inKillZone(Date.now() / 1000) ? ' · ⚡ منطقة قتل' : ''}`,
    '',
    '⬆️ سيولة أعلى: ' + (ab.map((l) => `${esc(l.label)} ${f2(l.price)}`).join(' · ') || '—'),
    '⬇️ سيولة أسفل: ' + (be.map((l) => `${esc(l.label)} ${f2(l.price)}`).join(' · ') || '—'),
    '',
    `سحوبات اليوم: ${a.sweeps.length} · صفقات سحب: ${a.signals.length} · صفقات زخم: ${a.momSignals.length}`,
  ];
  for (const s of [...a.signals, ...a.momSignals]) {
    const st = s.status === 'active' ? '⏳ نشطة' : s.status === 'sl' ? '❌ وقف' : `✅ ${s.status} ${s.pnlR}R`;
    lines.push(`${s.side === 'long' ? '🟢' : '🔴'} ${s.kind === 'mom' ? 'زخم' : 'سحب'} ${hm(s.time)} @ ${f2(s.entry)} → ${st}`);
  }
  if (a.momPending) lines.push(`⏳ أمر زخم معلّق ${a.momPending.side === 'long' ? 'شراء' : 'بيع'} @ ${f2(a.momPending.limit)} حتى ${hm(a.momPending.expiresAt)}`);
  return lines.join('\n');
}

export function levelsText(all: Candle[]) {
  const a = today(closedOnly(all));
  if (!a) return 'لا بيانات.';
  return ['📐 <b>مستويات اليوم</b>', ...a.levels.filter((l) => Number.isFinite(l.price)).sort((x, y) => y.price - x.price)
    .map((l) => `${l.swept ? '〰️' : l.strength === 'strong' ? '🟥' : l.strength === 'medium' ? '🟧' : '⬜'} ${esc(l.label)} <b>${f2(l.price)}</b>${l.swept ? ' (سُحب)' : ''}`)].join('\n');
}

export function btText(all: Candle[], days = 20) {
  const b = backtestStrats(closedOnly(all), days);
  const row = (n: string, x: { trades: number; winRate: number; totalR: number; maxDD: number }) => `${n}: ${x.trades} صفقة · ${x.winRate}% · <b>${x.totalR > 0 ? '+' : ''}${x.totalR}R</b> · تراجع ${x.maxDD}R`;
  return [`🧪 <b>باك-تيست ${days} يوماً</b> (نفس محرّك المنصة)`, row('السحب + الحجم', b.sweep), row('الزخم', b.mom), row('المجموع', b.all),
    '', '<i>النتائج السابقة لا تضمن المستقبل.</i>'].join('\n');
}

export function cfgText() {
  const c = getEngineCfg(); const r = risk();
  return ['⚙️ <b>الإعدادات</b>',
    `إشارات السحب/يوم ${c.maxSignals} · أدنى R:R ${c.minRR} · فلتر الافتتاح ${c.openFilter ? 'نعم' : 'لا'}`,
    `حجم السحب ≥ ${c.sweepVol ? '×' + c.sweepVol : 'off'} · الزخم ${c.momOn ? 'مفعّل' : 'معطّل'} · حجم الكسر ≥ ${c.momVol ? '×' + c.momVol : 'off'} · مع الافتتاح ${c.momBias ? 'نعم' : 'لا'} · موجة ≥ ${c.momMinLeg}$`,
    `الحساب $${r.bal} · مخاطرة ${r.pct}% ($${r.usd.toFixed(0)})`,
    '', 'للتعديل: متغيّرات Vercel <code>ENGINE_CFG</code> و<code>ACCOUNT_BALANCE</code> و<code>RISK_PCT</code>.'].join('\n');
}

export const CREW_TEXT = ['👥 <b>طاقم الخبراء</b>', ...CREW_ROLES.map(([w, d]) => `${w} — ${d}`)].join('\n');

export const HELP_TEXT = ['🤖 <b>أوامر البوت</b>',
  '/status — السعر والانحياز وأقرب سيولة وصفقات اليوم',
  '/levels — مستويات اليوم وقوتها',
  '/scan — فحص الآن وإرسال أي إشارة على آخر شمعة',
  '/bt — باك-تيست 20 يوماً للاستراتيجيتين',
  '/settings — الإعدادات الحالية',
  '/crew — طاقم الخبراء',
  '/id — معرّف هذه المحادثة'].join('\n');
