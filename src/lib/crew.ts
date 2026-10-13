// ============================================================
// طاقم الخبراء والمدير — مصدر واحد للواجهة (السكانر) وللخادم (Telegram)
// كل خبير قاعدة صريحة واحدة ⇒ ok: true | false | null (لا معلومة)
// ============================================================
import { inKillZone, sessionOf, type DayAnalysis } from './engine.js';

export interface CrewInput {
  kind: 'sweep' | 'mom';
  side: 'long' | 'short';
  entry: number; stop: number; tp1: number; rr: number;
  volRatio?: number; t: number; label?: string; score?: number;
}
export interface Verdict { who: string; say: string; ok: boolean | null }

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');

// لوت الذهب = 100 أونصة ⇒ حركة 1$ = 100$ للوت
export function lotFor(stopDist: number, balance: number, riskPct: number) {
  const usd = (balance * riskPct) / 100;
  return { lot: Math.floor((usd / (Math.max(0.5, stopDist) * 100)) * 100) / 100, usd };
}

export function crew(a: DayAnalysis, o: CrewInput, acct: { balance: number; riskPct: number }): { lines: Verdict[]; go: boolean; lot: number } {
  const long = o.side === 'long';
  const lines: Verdict[] = [];
  if (o.kind === 'sweep') {
    const lv = a.levels.find((l) => l.label === o.label);
    lines.push({ who: '🧲 خبير السيولة', ok: lv ? lv.strength !== 'weak' : null,
      say: lv ? `سحب ${lv.label} — مستوى ${lv.strength === 'strong' ? 'قوي' : lv.strength === 'medium' ? 'متوسط' : 'ضعيف'} (${lv.touches} لمسة)` : 'سحب مستوى سيولة' });
  } else {
    lines.push({ who: '⚡ خبير الزخم', ok: true, say: 'كسر هيكلي مع الترند — الدخول على ارتداد 50% لا مطاردة' });
  }
  const vr = o.volRatio;
  const hasV = Number.isFinite(vr as number);
  lines.push({ who: '📊 خبير الحجم', ok: hasV ? (vr as number) >= 1.2 : null,
    say: hasV ? `الحجم ×${f2(vr as number)} من متوسط 20 شمعة — ${(vr as number) >= 1.5 ? 'مشاركة مؤسسية واضحة' : (vr as number) >= 1.2 ? 'تأكيد مقبول' : 'حجم ضعيف'}` : 'الوسيط لا يوفّر حجماً — بلا تأكيد' });
  const withOpen = long ? o.entry >= a.open : o.entry <= a.open;
  lines.push({ who: '🧭 قاعدة الافتتاح', ok: withOpen,
    say: `الافتتاح ${f2(a.open)} — ${withOpen ? (long ? 'شراء فوق الافتتاح (إيجابي)' : 'بيع تحت الافتتاح (سلبي)') : 'عكس انحياز اليوم'}` });
  const sess = sessionOf(o.t), kz = inKillZone(o.t);
  const d = new Date(o.t * 1000);
  lines.push({ who: '🕐 خبير التوقيت', ok: sess !== 'asia' && sess !== 'off',
    say: `${sess === 'london' ? 'جلسة لندن' : sess === 'ny' ? 'جلسة نيويورك' : sess === 'asia' ? 'جلسة آسيا — سيولة أقل' : 'خارج الجلسات'}${kz ? ' · داخل منطقة القتل' : ''}${d.getUTCDay() === 5 && d.getUTCHours() >= 17 ? ' · جمعة متأخرة' : ''}` });
  const { lot, usd } = lotFor(Math.abs(o.entry - o.stop), acct.balance, acct.riskPct);
  lines.push({ who: '🛡 مدير المخاطر', ok: o.rr >= 1.2 && lot >= 0.01,
    say: `R:R ${f2(o.rr)} · الحجم ${lot.toFixed(2)} لوت لمخاطرة $${usd.toFixed(0)} (${acct.riskPct}%)${lot < 0.01 ? ' — أقل من الحد الأدنى' : ''}` });
  const no = lines.filter((l) => l.ok === false).length;
  return { lines, go: no === 0 || (no === 1 && (o.score ?? 0) >= 65), lot };
}

export const CREW_ROLES = [
  ['🧲 خبير السيولة', 'يقيّم المستوى المسحوب وقوته'],
  ['📊 خبير الحجم', 'يؤكد أن السحب/الكسر بحجم أعلى من المعتاد'],
  ['⚡ خبير الزخم', 'BOS مع الترند ودخول بارتداد 50%'],
  ['🧭 قاعدة الافتتاح', 'فوق الافتتاح إيجابي، تحته سلبي'],
  ['🕐 خبير التوقيت', 'الجلسة ومنطقة القتل وأوقات الحذر'],
  ['🛡 مدير المخاطر', 'اللوت من رأس المال ونسبة المخاطرة و R:R'],
  ['👔 المدير', 'القرار النهائي: صفقة صالحة أم مراقبة'],
] as const;
