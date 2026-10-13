// ============================================================
// مجلس الخبراء — جولة كل 5 دقائق من بيانات المنصة الحيّة
// شخصيات افتراضية بأدوار وخبرات محددة؛ كل جملة تُشتق بقاعدة صريحة من الأرقام — لا كلام أشخاص حقيقيين.
// الأسماء قابلة للتغيير من الإعدادات (localStorage: xau_council_names)
// ============================================================
import { inKillZone, sessionOf, type Candle, type DayAnalysis } from './engine.js';
import { atrOf, firstBreakOdds, summarizeZones, type ZonesSummary } from './smc.js';

export type MsgType = 'توصية' | 'ملاحظة' | 'تنبيه' | 'اقتراح' | 'توجيه';
export interface CouncilMsg { id: string; who: string; role: string; type: MsgType; text: string; lean: -1 | 0 | 1; priority: 0 | 1 | 2; w?: number }
export interface Round { slot: number; t: number; msgs: CouncilMsg[]; verdict: { lean: -1 | 0 | 1; score: number; text: string } }

export const EXPERTS = [
  { id: 'ny', name: 'رالف', role: 'خبير ذهب — بورصة نيويورك، 30 عاماً' },
  { id: 'ldn', name: 'بابلو', role: 'محلل سوق لندن — يوصي لشركات كبرى' },
  { id: 'asia', name: 'لي وي', role: 'متداول آسيا — مشتريات حكومية' },
  { id: 'corr', name: 'سامر', role: 'خبير الترابط: الدولار (عكسي) والفضة (طردي)' },
  { id: 'liq', name: 'ليلى', role: 'خبيرة السيولة والاتجاه وتغيّره' },
  { id: 'bank', name: 'ريتشارد', role: 'مدير عام بنك عالمي — المخاطر والقرار' },
  { id: 'dealer', name: 'أبو علي', role: 'تاجر ذهب فعلي بالجملة' },
] as const;
export type ExpertId = typeof EXPERTS[number]['id'];

export function expertNames(): Record<ExpertId, string> {
  const d = Object.fromEntries(EXPERTS.map((e) => [e.id, e.name])) as Record<ExpertId, string>;
  try { const o = JSON.parse(localStorage.getItem('xau_council_names') || '{}'); for (const k of Object.keys(d) as ExpertId[]) if (typeof o[k] === 'string' && o[k].trim()) d[k] = o[k].trim().slice(0, 30); } catch { /* تجاهل */ }
  return d;
}
export function setExpertNames(n: Partial<Record<ExpertId, string>>) {
  try { localStorage.setItem('xau_council_names', JSON.stringify(n)); } catch { /* تجاهل */ }
}

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');


// معامل ارتباط عوائد الإغلاق على نافذة n
export function corr(a: Candle[], b: Candle[], n = 96): number | null {
  const mb = new Map(b.map((x) => [x.time, x.close]));
  const pairs: [number, number][] = [];
  for (let i = 1; i < a.length; i++) {
    const p0 = mb.get(a[i - 1].time), p1 = mb.get(a[i].time);
    if (p0 == null || p1 == null) continue;
    pairs.push([a[i].close / a[i - 1].close - 1, p1 / p0 - 1]);
  }
  const s = pairs.slice(-n);
  if (s.length < 30) return null;
  const mx = s.reduce((q, p) => q + p[0], 0) / s.length, my = s.reduce((q, p) => q + p[1], 0) / s.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of s) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
const chg = (c: Candle[], bars: number) => (c.length > bars ? (c[c.length - 1].close / c[c.length - 1 - bars].close - 1) * 100 : NaN);

export interface CouncilInput {
  gold: Candle[];             // M15
  analysis: DayAnalysis | null;
  silver?: Candle[]; eurusd?: Candle[];  // EURUSD = مرآة عكسية للدولار (DXY ≈ 57% يورو)
  balance: number; riskPct: number;
  pending?: { side: 'long' | 'short'; limit: number } | null;
}

export function councilRound(inp: CouncilInput, now = Date.now() / 1000): Round | null {
  const a = inp.analysis, g = inp.gold;
  if (!a || g.length < 60) return null;
  const N = expertNames();
  const slot = Math.floor(now / 300);
  const p = g[g.length - 1].close, atr = atrOf(g, 30);
  const Z: ZonesSummary | null = summarizeZones(g);
  const odds = firstBreakOdds(g, g[g.length - 1].time);
  const sess = sessionOf(now), kz = inKillZone(now);
  const hUTC = new Date(now * 1000).getUTCHours() + new Date(now * 1000).getUTCMinutes() / 60;
  const aboveOpen = p >= a.open;
  const msgs: CouncilMsg[] = [];
  // الوزن في القرار ثابت حسب اختصاص الخبير ومستقلّ عن «الأولوية» (التي تحدّد التنبيه فقط)
  const W: Record<ExpertId, number> = { ny: 2, ldn: 1.5, asia: 0.5, corr: 1.5, liq: 2, bank: 0, dealer: 0.5 };
  const add = (id: ExpertId, type: MsgType, text: string, lean: -1 | 0 | 1 = 0, priority: 0 | 1 | 2 = 0, w = W[id]) =>
    msgs.push({ id: `${slot}-${id}-${msgs.length}`, who: N[id], role: EXPERTS.find((e) => e.id === id)!.role, type, text, lean, priority, w });
  const up = Z?.nearBSL, dn = Z?.nearSSL;

  // نيويورك: الانحياز اليومي + نافذة نيويورك وبيانات 13:30
  {
    const nyNews = hUTC >= 13 && hUTC < 13.75;
    if (nyNews) add('ny', 'تنبيه', 'نافذة البيانات الأمريكية (13:30 UTC): لا دخول قبل إغلاق شمعة الخبر — الانزلاق في أعلى مستوياته.', 0, 2);
    else if (sess === 'ny' && kz) add('ny', 'توصية', `نيويورك في منطقة القتل: ${aboveOpen ? `شراء الارتدادات فوق الافتتاح ${f2(a.open)} نحو ${up ? f2(up.price) : 'القمة'}` : `بيع الارتدادات تحت الافتتاح ${f2(a.open)} نحو ${dn ? f2(dn.price) : 'القاع'}`}.`, aboveOpen ? 1 : -1, 1);
    else add('ny', 'ملاحظة', `السعر ${f2(p)} ${aboveOpen ? 'فوق' : 'تحت'} افتتاح اليوم ${f2(a.open)} — الانحياز ${aboveOpen ? 'إيجابي' : 'سلبي'}${sess === 'ny' ? '' : '، وأنتظر سيولة نيويورك لتأكيده'}.`, aboveOpen ? 1 : -1);
  }
  // لندن: قمة/قاع لندن وتثبيت LBMA
  {
    const fix = (hUTC >= 10.25 && hUTC < 10.75) || (hUTC >= 14.75 && hUTC < 15.25);
    const lh = a.londonHigh, ll = a.londonLow;
    if (fix) add('ldn', 'تنبيه', `قرب تثبيت سعر لندن (LBMA ${hUTC < 12 ? '10:30' : '15:00'} UTC) — حركات حادّة قصيرة شائعة، لا تطارد.`, 0, 1);
    else if (Number.isFinite(lh) && Number.isFinite(ll) && sess !== 'asia') {
      const sweptH = a.sweeps.some((s) => s.levelLabel.includes('لندن') && s.direction === 'above');
      const sweptL = a.sweeps.some((s) => s.levelLabel.includes('لندن') && s.direction === 'below');
      if (sweptH && p < lh) add('ldn', 'توصية', `سُحبت قمة لندن ${f2(lh)} وعاد السعر تحتها — ميل بيعي للعملاء نحو ${f2(ll)} ما دام تحت ${f2(lh)}.`, -1, 1);
      else if (sweptL && p > ll) add('ldn', 'توصية', `سُحب قاع لندن ${f2(ll)} وعاد السعر فوقه — ميل شرائي نحو ${f2(lh)} ما دام فوق ${f2(ll)}.`, 1, 1);
      else add('ldn', 'ملاحظة', `نطاق لندن ${f2(ll)} – ${f2(lh)} (${f2(lh - ll)}$). الكسر المؤكّد بالإغلاق خارجه يحدّد اتجاه نيويورك.`);
    } else add('ldn', 'توجيه', 'لندن لم تبدأ بعد — أراقب كسر نطاق آسيا عند الافتتاح 08:00 UTC.');
  }
  // آسيا: النطاق ومناطق الخصم للشراء الهادئ
  {
    const r = a.asiaHigh - a.asiaLow;
    const hi = Math.max(...a.candles.map((x) => x.high)), lo = Math.min(...a.candles.map((x) => x.low));
    const pos = hi > lo ? (p - lo) / (hi - lo) : 0.5;
    if (pos <= 0.3) add('asia', 'اقتراح', `السعر في منطقة الخصم (${Math.round(pos * 100)}% من مدى اليوم) — منطقة تجميع للمشتري طويل الأجل على دفعات قرب ${f2(lo)}.`, 1);
    else if (pos >= 0.7) add('asia', 'ملاحظة', `السعر في منطقة العلاوة (${Math.round(pos * 100)}% من مدى اليوم) — المشتري المؤسسي ينتظر التصحيح ولا يطارد القمة.`, -1);
    else add('asia', 'ملاحظة', `نطاق آسيا ${f2(r)}$ (${r < atr * 4 ? 'مضغوط — كسر قوي محتمل' : 'واسع — ارتداد أرجح'}). السعر وسط مدى اليوم.`);
  }
  // الترابط: الدولار عبر EURUSD (عكسي) والفضة (طردي)
  {
    const cS = inp.silver?.length ? corr(g, inp.silver) : null;
    const cE = inp.eurusd?.length ? corr(g, inp.eurusd) : null;
    const gC = chg(g, 8), sC = inp.silver ? chg(inp.silver, 8) : NaN, eC = inp.eurusd ? chg(inp.eurusd, 8) : NaN;
    if (cS == null && cE == null) add('corr', 'ملاحظة', 'بيانات الفضة/اليورو غير متاحة من وسيطك — أحكم على الذهب منفرداً.');
    else {
      const usdUp = Number.isFinite(eC) && eC < -0.05, usdDn = Number.isFinite(eC) && eC > 0.05;
      const div = Number.isFinite(sC) && Math.sign(sC) !== Math.sign(gC) && Math.abs(sC) > 0.15 && Math.abs(gC) > 0.1;
      const parts = [cS != null ? `ارتباط الفضة ${cS.toFixed(2)}` : '', cE != null ? `ارتباط اليورو ${cE.toFixed(2)} (الدولار عكسه)` : ''].filter(Boolean).join(' · ');
      if (div) add('corr', 'تنبيه', `تباعد: الذهب ${gC > 0 ? 'يصعد' : 'يهبط'} والفضة ${sC > 0 ? 'تصعد' : 'تهبط'} خلال ساعتين — حركة الذهب بلا تأكيد، خفّف الحجم. (${parts})`, 0, 1);
      else if (usdUp && gC > 0) add('corr', 'تنبيه', `الذهب يصعد رغم قوة الدولار — صعود غير مدعوم من الترابط، انتبه لانعكاس. (${parts})`, 0, 1);
      else if (usdDn && gC > 0) add('corr', 'توصية', `ضعف الدولار يدعم صعود الذهب${Number.isFinite(sC) && sC > 0 ? ' والفضة تؤكد' : ''} — الترابط في صالح الشراء. (${parts})`, 1);
      else if (usdUp && gC < 0) add('corr', 'توصية', `قوة الدولار تضغط على الذهب${Number.isFinite(sC) && sC < 0 ? ' والفضة تؤكد الهبوط' : ''} — الترابط في صالح البيع. (${parts})`, -1);
      else add('corr', 'ملاحظة', `الترابطات في وضعها الطبيعي. ${parts}`);
    }
  }
  // السيولة والاتجاه: CHoCH/BOS + أقرب سيولة ومناطق
  {
    const swept = Z?.sweptRecent ?? [];
    if (swept.length) {
      const s = swept[swept.length - 1];
      add('liq', 'تنبيه', `سُحبت سيولة ${s.side === 'BSL' ? 'شرائية فوق' : 'بيعية تحت'} ${f2(s.price)} الآن — راقب كسراً هيكلياً ${s.side === 'BSL' ? 'هابطاً' : 'صاعداً'} لتغيّر الاتجاه.`, s.side === 'BSL' ? -1 : 1, 2, 1);
    }
    if (odds) {
      const lean = odds.upFirst > odds.downFirst + 10 ? 1 : odds.downFirst > odds.upFirst + 10 ? -1 : 0;
      add('liq', lean ? 'توصية' : 'ملاحظة', `في ${odds.n} يوماً مشابهاً (${odds.bias === 'above' ? 'فوق' : 'تحت'} الافتتاح بهذه الساعة): كُسرت القمة أولاً ${odds.upFirst}% والقاع ${odds.downFirst}%. الهدف الأرجح ${lean > 0 ? (up ? `BSL ${f2(up.price)}` : 'القمة') : lean < 0 ? (dn ? `SSL ${f2(dn.price)}` : 'القاع') : 'غير محسوم'}.`, lean as -1 | 0 | 1, lean ? 1 : 0);
    } else if (!swept.length) add('liq', 'ملاحظة', `أقرب سيولة: أعلى ${up ? f2(up.price) : '—'} · أسفل ${dn ? f2(dn.price) : '—'}.`);
    const fz = aboveOpen ? Z?.nearFvgUp ?? Z?.nearObUp : Z?.nearFvgDown ?? Z?.nearObDown;
    if (fz) {
      const lvl = 'remTop' in fz ? (aboveOpen ? fz.remTop : fz.remBottom) : (aboveOpen ? fz.top : fz.bottom);
      add('liq', 'اقتراح', `أفضل منطقة دخول مع الاتجاه: ${'remTop' in fz ? 'FVG' : 'أوردر بلوك'} ${aboveOpen ? 'صاعد' : 'هابط'} عند ${f2(lvl)} (يبعد ${f2(Math.abs(p - lvl))}$).`, aboveOpen ? 1 : -1, 0, 1);
    }
  }
  // تاجر الجملة: الأرقام الدائرية والمدى
  {
    const r50 = Math.round(p / 50) * 50, r10 = Math.round(p / 10) * 10;
    const d50 = p - r50;
    if (Math.abs(d50) <= 3) add('dealer', 'تنبيه', `السعر عند الرقم النفسي ${r50} — طلبات التجّار الكبيرة تتجمّع هنا، توقّع تذبذباً قبل الحسم.`, 0, 1);
    else add('dealer', 'توجيه', `${d50 > 0 ? `فوق ${r50}: الشراء الفعلي يتباطأ قرب ${r50 + 50}، والبيع على دفعات أفضل من دفعة واحدة` : `تحت ${r50}: طلب المصانع والمجوهرات ينشط قرب ${r50 - 50}`}. أقرب رقم عشري ${r10}.`);
  }
  // مدير البنك: المخاطر + خلاصة المجلس
  // القرار = متوسط موزون للميول على كل الخبراء الذين لهم وزن (المحايد يسحب النسبة نحو الصفر)
  const voters = msgs.filter((m) => (m.w ?? 0) > 0);
  const wSum = voters.reduce((q, m) => q + (m.w ?? 0), 0) || 1;
  const score = Math.round((voters.reduce((q, m) => q + m.lean * (m.w ?? 0), 0) / wSum) * 100);
  const vLean: -1 | 0 | 1 = score >= 25 ? 1 : score <= -25 ? -1 : 0;
  {
    const stop = Math.max(atr * 1.5, 3), usd = (inp.balance * inp.riskPct) / 100;
    const lot = Math.floor((usd / (stop * 100)) * 100) / 100;
    if (inp.pending) add('bank', 'توجيه', `أمر الزخم المعلّق ${inp.pending.side === 'long' ? 'شراء' : 'بيع'} عند ${f2(inp.pending.limit)} هو الخطة الوحيدة الآن — لا تدخل قبله ولا تضاعف الحجم.`, inp.pending.side === 'long' ? 1 : -1, 1);
    else if (vLean === 0) add('bank', 'توجيه', `المجلس منقسم — البنوك لا تتداول بلا أفضلية. حماية رأس المال أولاً: انتظر.`);
    else add('bank', 'توصية', `خلاصة المجلس ${vLean > 0 ? 'شرائية' : 'بيعية'} (${Math.abs(score)}%). الحجم الأقصى ${lot.toFixed(2)} لوت لوقف ${f2(stop)}$ (1.5×ATR) ومخاطرة ${inp.riskPct}%.`, vLean, 1);
  }
  const vText = vLean > 0 ? `ميل شرائي ${score}%` : vLean < 0 ? `ميل بيعي ${Math.abs(score)}%` : 'انتظار — لا أفضلية واضحة';
  return { slot, t: slot * 300, msgs, verdict: { lean: vLean, score, text: vText } };
}

