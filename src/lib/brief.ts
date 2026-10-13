// ============================================================
// إيجاز الذهب (Gold AI) — نص عربي واحد يشرح المسار والاتجاه والمناطق والاحتمالات والتوصية
// تستعمله المهارة (scripts/brief.mjs) وبوت Telegram (/brief) — نص خام بلا HTML
// ============================================================
import { analyzeDay, inKillZone, sessionOf, type Candle } from './engine.js';
import { atrOf, firstBreakOdds, fvgZones, liquidityPools, orderBlocks } from './smc.js';
import { councilRound } from './council.js';

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const DAY = 86400;

// اتجاه إطار أعلى بسيط: تجميع H1/H4 ثم مقارنة الإغلاق بمتوسط 20 وموقع آخر محورين
function trendOf(c: Candle[], sec: number): 'صاعد' | 'هابط' | 'عرضي' {
  const m = new Map<number, Candle>();
  for (const x of c) {
    const k = Math.floor(x.time / sec) * sec, e = m.get(k);
    if (e) { e.high = Math.max(e.high, x.high); e.low = Math.min(e.low, x.low); e.close = x.close; }
    else m.set(k, { ...x, time: k });
  }
  const a = [...m.values()];
  if (a.length < 22) return 'عرضي';
  const ma = a.slice(-20).reduce((q, x) => q + x.close, 0) / 20, last = a[a.length - 1].close;
  const hh = a[a.length - 1].high > Math.max(...a.slice(-10, -1).map((x) => x.high));
  const ll = a[a.length - 1].low < Math.min(...a.slice(-10, -1).map((x) => x.low));
  if (last > ma * 1.0015 || hh) return 'صاعد';
  if (last < ma * 0.9985 || ll) return 'هابط';
  return 'عرضي';
}

export interface BriefInput { gold: Candle[]; silver?: Candle[]; eurusd?: Candle[]; balance: number; riskPct: number; now?: number }

export function goldBrief(inp: BriefInput): string {
  const now = inp.now ?? Date.now() / 1000;
  const g = inp.gold.filter((x) => x.time + 900 <= now + 5);
  if (g.length < 100) return 'بيانات غير كافية لإيجاز الذهب (أقل من 100 شمعة M15 مغلقة).';
  const last = g[g.length - 1], p = last.close;
  const a = analyzeDay(g, Math.floor(last.time / DAY) * DAY);
  if (!a) return 'لا توجد شموع كافية لليوم الحالي بعد.';
  const atr = atrOf(g, 30), odds = firstBreakOdds(g);
  const F = fvgZones(g, 220).filter((z) => z.state !== 'filled');
  const O = orderBlocks(g, 220).filter((z) => z.state !== 'broken');
  const L = liquidityPools(g, 260);
  const near = <T,>(arr: T[], k: (t: T) => number, n: number) => arr.slice().sort((x, y) => Math.abs(k(x) - p) - Math.abs(k(y) - p)).slice(0, n);
  const tH1 = trendOf(g, 3600), tH4 = trendOf(g, 14400);
  const sess = sessionOf(now);
  const round = councilRound({ gold: g, analysis: a, silver: inp.silver, eurusd: inp.eurusd, balance: inp.balance, riskPct: inp.riskPct,
    pending: a.momPending ? { side: a.momPending.side, limit: a.momPending.limit } : null }, now);
  const L1: string[] = [];
  const t = new Date(last.time * 1000).toISOString().slice(0, 16).replace('T', ' ');

  L1.push(`🟡 إيجاز الذهب XAUUSD — ${t} UTC (آخر شمعة M15 مغلقة)`);
  L1.push('');
  L1.push('١) الصورة الآن');
  L1.push(`• السعر ${f2(p)} ${p >= a.open ? 'فوق' : 'تحت'} افتتاح اليوم ${f2(a.open)} (${p >= a.open ? '+' : '−'}${f2(Math.abs(p - a.open))}$) ⇒ الانحياز ${p >= a.open ? 'إيجابي' : 'سلبي'}.`);
  L1.push(`• الاتجاه: ساعة ${tH1} · 4 ساعات ${tH4}. ${tH1 === tH4 && tH1 !== 'عرضي' ? 'الإطاران متوافقان — التداول مع الاتجاه أولى.' : 'الإطاران غير متوافقين — حذر وأحجام أصغر.'}`);
  L1.push(`• الجلسة: ${sess === 'asia' ? 'آسيا' : sess === 'london' ? 'لندن' : sess === 'ny' ? 'نيويورك' : 'خارج الجلسات'}${inKillZone(now) ? ' (منطقة قتل — أفضل نافذة تنفيذ)' : ''}. التذبذب ATR ${f2(atr)}$.`);
  L1.push(`• مستويات اليوم: قمة/قاع آسيا ${f2(a.asiaHigh)}/${f2(a.asiaLow)} · لندن ${f2(a.londonHigh)}/${f2(a.londonLow)} · أمس ${f2(a.pdh)}/${f2(a.pdl)}.`);
  L1.push('');
  L1.push('٢) مناطق السيولة والتداول');
  const bsl = near(L.filter((x) => !x.swept && x.price > p), (x) => x.price, 2), ssl = near(L.filter((x) => !x.swept && x.price < p), (x) => x.price, 2);
  L1.push(`• سيولة شرائية (BSL) أعلى: ${bsl.map((x) => `${f2(x.price)}${x.equal ? ' قمم متساوية' : ''}`).join(' · ') || '—'}`);
  L1.push(`• سيولة بيعية (SSL) أسفل: ${ssl.map((x) => `${f2(x.price)}${x.equal ? ' قيعان متساوية' : ''}`).join(' · ') || '—'}`);
  const sw = L.filter((x) => x.swept && (x.tSwept ?? 0) >= last.time - 4 * 3600);
  if (sw.length) L1.push(`• سُحبت حديثاً: ${sw.map((x) => `${x.side} ${f2(x.price)}`).join(' · ')}`);
  for (const z of near(F, (x) => (x.remTop + x.remBottom) / 2, 3))
    L1.push(`• FVG ${z.dir === 'up' ? 'صاعدة (دعم)' : 'هابطة (مقاومة)'} ${f2(z.remBottom)}–${f2(z.remTop)}${z.state === 'partial' ? ` · ممتلئة ${Math.round(z.fill * 100)}%` : ' · جديدة'}`);
  for (const z of near(O, (x) => (x.top + x.bottom) / 2, 2))
    L1.push(`• أوردر بلوك ${z.dir === 'up' ? 'طلب' : 'عرض'} ${f2(z.bottom)}–${f2(z.top)} · قوة ×${z.strength.toFixed(1)}${z.state === 'tested' ? ' · مُختبر' : ' · جديد'}`);
  L1.push('');
  L1.push('٣) الاحتمالات (ترددات تاريخية من بياناتك)');
  if (odds) L1.push(`• في ${odds.n} يوماً كان فيها السعر ${odds.bias === 'above' ? 'فوق' : 'تحت'} الافتتاح بهذه الساعة: كُسرت القمة أولاً ${odds.upFirst}% · القاع أولاً ${odds.downFirst}% · لا كسر ${odds.none}%.`);
  else L1.push('• العيّنة التاريخية غير كافية لحساب احتمال موثوق.');
  L1.push('');
  L1.push('٤) الفرص الآن');
  if (a.momPending) L1.push(`• أمر زخم معلّق: ${a.momPending.side === 'long' ? 'شراء' : 'بيع'} محدد ${f2(a.momPending.limit)} · وقف ${f2(a.momPending.stop)} · هدف ${f2(a.momPending.tp1)} · R:R ${a.momPending.rr}`);
  const act = [...a.signals, ...a.momSignals].filter((s) => s.status === 'active');
  for (const s of act) L1.push(`• صفقة نشطة ${s.side === 'long' ? 'شراء' : 'بيع'} (${s.kind === 'mom' ? 'زخم' : 'سحب + كسر'}) من ${f2(s.entry)} · وقف ${f2(s.stop)} · هدف ${f2(s.tp1)}`);
  if (!a.momPending && !act.length) L1.push('• لا إعداد مكتمل الشروط الآن — الانتظار موقف.');
  L1.push('');
  if (round) {
    L1.push(`٥) مجلس الخبراء — ${round.verdict.text}`);
    for (const m of round.msgs) L1.push(`• ${m.who} (${m.type}): ${m.text}`);
    L1.push('');
  }
  // التوصية الختامية: لا توصية بلا إعداد، وإلا وصف المسار المرجّح
  L1.push('٦) المسار المرجّح والتوصية');
  const lean = round?.verdict.lean ?? 0;
  const tgt = lean > 0 ? bsl[0] : lean < 0 ? ssl[0] : null;
  if (lean !== 0 && tgt) {
    const entryZone = lean > 0 ? near(F.filter((z) => z.dir === 'up' && z.remTop <= p), (z) => z.remTop, 1)[0] : near(F.filter((z) => z.dir === 'down' && z.remBottom >= p), (z) => z.remBottom, 1)[0];
    L1.push(`• المسار المرجّح ${lean > 0 ? 'صعوداً' : 'هبوطاً'} نحو ${f2(tgt.price)}${entryZone ? ` بعد ارتداد إلى ${lean > 0 ? 'FVG' : 'FVG'} ${f2(entryZone.remBottom)}–${f2(entryZone.remTop)}` : ''}.`);
    L1.push(`• الإبطال: ${lean > 0 ? `إغلاق M15 تحت ${f2(ssl[0]?.price ?? a.open)}` : `إغلاق M15 فوق ${f2(bsl[0]?.price ?? a.open)}`}.`);
  } else L1.push('• لا أفضلية واضحة — أفضل قرار عدم الدخول حتى سحب سيولة وكسر هيكلي.');
  L1.push(`• المخاطرة: ${inp.riskPct}% من $${inp.balance} — وقف لا يقل عن ${f2(atr * 1.5)}$.`);
  L1.push('');
  L1.push('تحليل آلي من بيانات حسابك — ليس نصيحة مالية، والنتائج السابقة لا تضمن المستقبل.');
  return L1.join('\n');
}
