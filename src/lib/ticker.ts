// منطق الشريط العاجل — نقي بلا React
import type { Candle, DayAnalysis } from './engine';
import { firstBreakOdds, summarizeZones } from './smc';
import type { Round } from './council';

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');

export interface TickerItem { tag: string; text: string; tone: 'up' | 'down' | 'warn' | 'info' }

export function buildTicker(all: Candle[], a: DayAnalysis | null, round: Round | null): TickerItem[] {
  const out: TickerItem[] = [];
  if (!a || all.length < 30) return out;
  const p = all[all.length - 1].close, Z = summarizeZones(all), odds = firstBreakOdds(all);
  const above = p >= a.open;
  out.push({ tag: 'السعر', tone: above ? 'up' : 'down', text: `الذهب ${f2(p)} — ${above ? 'فوق' : 'تحت'} افتتاح اليوم ${f2(a.open)} بـ ${f2(Math.abs(p - a.open))}$، الانحياز ${above ? 'إيجابي' : 'سلبي'}` });
  if (round) out.push({ tag: 'المجلس', tone: round.verdict.lean > 0 ? 'up' : round.verdict.lean < 0 ? 'down' : 'info', text: `قرار مجلس الخبراء: ${round.verdict.text}` });
  if (odds) {
    const strong = odds.upFirst >= odds.downFirst ? `كسر القمة أولاً ${odds.upFirst}%` : `كسر القاع أولاً ${odds.downFirst}%`;
    out.push({ tag: 'الاحتمال الأقوى', tone: odds.upFirst >= odds.downFirst ? 'up' : 'down', text: `${strong} — من ${odds.n} يوماً مشابهاً في بياناتك (ترددات تاريخية، لا ضمان)` });
  }
  if (a.momPending) out.push({ tag: 'أمر معلّق', tone: a.momPending.side === 'long' ? 'up' : 'down', text: `زخم ${a.momPending.side === 'long' ? 'شراء' : 'بيع'} محدد عند ${f2(a.momPending.limit)} · وقف ${f2(a.momPending.stop)} · هدف ${f2(a.momPending.tp1)}` });
  const act = [...a.signals, ...a.momSignals].filter((s) => s.status === 'active');
  for (const s of act) out.push({ tag: 'صفقة نشطة', tone: s.side === 'long' ? 'up' : 'down', text: `${s.side === 'long' ? 'شراء' : 'بيع'} ${s.kind === 'mom' ? 'زخم' : 'سحب'} من ${f2(s.entry)} · وقف ${f2(s.stop)} · هدف ${f2(s.tp1)}` });
  if (Z) {
    if (Z.nearBSL) out.push({ tag: 'سيولة أعلى', tone: 'info', text: `BSL ${f2(Z.nearBSL.price)}${Z.nearBSL.equal ? ' (قمم متساوية — هدف مغناطيسي)' : ''} على بعد ${f2(Z.nearBSL.price - p)}$` });
    if (Z.nearSSL) out.push({ tag: 'سيولة أسفل', tone: 'info', text: `SSL ${f2(Z.nearSSL.price)}${Z.nearSSL.equal ? ' (قيعان متساوية — هدف مغناطيسي)' : ''} على بعد ${f2(p - Z.nearSSL.price)}$` });
    for (const s of Z.sweptRecent) out.push({ tag: 'عاجل', tone: 'warn', text: `سُحبت سيولة ${s.side === 'BSL' ? 'فوق' : 'تحت'} ${f2(s.price)} — راقب تغيّر الاتجاه` });
    if (Z.nearFvgUp) out.push({ tag: 'FVG', tone: 'up', text: `فجوة صاعدة غير ممتلئة ${f2(Z.nearFvgUp.remBottom)}–${f2(Z.nearFvgUp.remTop)} — منطقة دعم/دخول شراء` });
    if (Z.nearFvgDown) out.push({ tag: 'FVG', tone: 'down', text: `فجوة هابطة غير ممتلئة ${f2(Z.nearFvgDown.remBottom)}–${f2(Z.nearFvgDown.remTop)} — منطقة مقاومة/دخول بيع` });
    if (Z.nearObUp) out.push({ tag: 'OB', tone: 'up', text: `أوردر بلوك طلب ${f2(Z.nearObUp.bottom)}–${f2(Z.nearObUp.top)}${Z.nearObUp.state === 'tested' ? ' (مُختبر)' : ' (جديد)'}` });
    if (Z.nearObDown) out.push({ tag: 'OB', tone: 'down', text: `أوردر بلوك عرض ${f2(Z.nearObDown.bottom)}–${f2(Z.nearObDown.top)}${Z.nearObDown.state === 'tested' ? ' (مُختبر)' : ' (جديد)'}` });
    out.push({ tag: 'التذبذب', tone: 'info', text: `متوسط مدى الشمعة (ATR) ${f2(Z.atr)}$ — وقف معقول ≥ ${f2(Z.atr * 1.5)}$` });
  }
  if (round) for (const m of round.msgs.filter((x) => x.priority >= 1).slice(0, 4)) out.push({ tag: m.type, tone: m.type === 'تنبيه' ? 'warn' : m.lean > 0 ? 'up' : m.lean < 0 ? 'down' : 'info', text: `${m.who}: ${m.text}` });
  out.push({ tag: 'تذكير', tone: 'info', text: 'الالتزام بالوقف أهم من دقة الدخول · لا تتجاوز مخاطرة 1–2% للصفقة · ليست نصيحة مالية' });
  return out;
}

