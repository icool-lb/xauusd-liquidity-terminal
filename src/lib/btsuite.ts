// ============================================================
// خبير الباك-تيست اليومي — يفحص بيانات MetaApi آلياً كل يوم
// يجرب تركيبات إعدادات على إشارات المحرك ويقيس أثر كل تعديل
// ============================================================

import { analyzeDay, inKillZone, type Candle, type Signal } from './engine';

const DAY = 24 * 3600;
const M15 = 900;

export interface BtConfig {
  id: string;
  label: string;
  tpMode: 'tp1' | 'fixed10' | 'fixed15' | 'r1.5';
  slMode: 'engine' | 'fixed15';
  kzOnly: boolean;
  minRR: number;
  days: number;
}

export interface BtComboResult {
  cfg: BtConfig;
  trades: number;
  wins: number;
  winRate: number;
  expectancyR: number;
  netPnl: number;      // $ على 0.01 لوت بمخاطرة 15$/R
  profitFactor: number;
  maxConsecLoss: number;
}

export interface BtRecommendation {
  text: string;
  impact: string;      // التأثير المقاس
  positive: boolean;
}

export interface BtSuiteResult {
  ranAt: number;
  daysTested: number;
  baseline: BtComboResult;
  top: BtComboResult[];
  recommendations: BtRecommendation[];
  verdict: string;     // جملة التوصية اليومية
}

interface RawSignal { sig: Signal; candles: Candle[] }

// جمع إشارات المحرك من كل يوم مع شموعه (مرة واحدة ثم نعيد محاكاتها بكل تركيبة)
function collectSignals(all: Candle[], days: number): RawSignal[] {
  if (all.length < 100) return [];
  const now = Math.floor(Date.now() / 1000 / M15) * M15;
  const todayStart = Math.floor(now / DAY) * DAY;
  const out: RawSignal[] = [];
  for (let d = days; d >= 1; d--) {
    const a = analyzeDay(all, todayStart - d * DAY);
    if (!a) continue;
    for (const sig of a.signals) {
      if (sig.status === 'active') continue;
      out.push({ sig, candles: a.candles });
    }
  }
  return out;
}

function simulate(raw: RawSignal[], cfg: BtConfig): BtComboResult {
  const cutoff = Date.now() / 1000 - cfg.days * DAY;
  let trades = 0, wins = 0, consec = 0, maxConsec = 0, sumR = 0, grossW = 0, grossL = 0;
  const r1 = (n: number) => Math.round(n * 100) / 100;

  for (const { sig, candles } of raw) {
    if (sig.time < cutoff) continue;
    if (cfg.kzOnly && !inKillZone(sig.time)) continue;
    if (sig.rr < cfg.minRR) continue;

    const dir = sig.side === 'long' ? 1 : -1;
    const entry = sig.entry;
    const sl = cfg.slMode === 'engine' ? sig.stop : entry - dir * 15;
    let tp: number;
    const risk = Math.abs(entry - sl);
    if (risk < 1) continue; // إعداد غير قابل للتداول
    if (cfg.tpMode === 'tp1') tp = sig.tp1;
    else if (cfg.tpMode === 'fixed10') tp = entry + dir * 10;
    else if (cfg.tpMode === 'fixed15') tp = entry + dir * 15;
    else tp = entry + dir * risk * 1.5;
    if (dir > 0 ? tp <= entry : tp >= entry) continue;

    // محاكاة الخروج على شموع اليوم (محافظ: الوقف أولاً إذا لُمسا معاً)
    const startIdx = candles.findIndex((c) => c.time >= sig.time);
    if (startIdx < 0) continue;
    let result: 'win' | 'loss' | null = null;
    let exitR = 0;
    for (let i = startIdx; i < candles.length; i++) {
      const c = candles[i];
      const hitSL = dir > 0 ? c.low <= sl : c.high >= sl;
      const hitTP = dir > 0 ? c.high >= tp : c.low <= tp;
      if (hitSL) { result = 'loss'; exitR = -1; break; }
      if (hitTP) { result = 'win'; exitR = Math.abs(tp - entry) / risk; break; }
    }
    if (!result) continue; // لم يُحسم داخل اليوم — لا نحتسبه
    trades++;
    if (result === 'win') {
      wins++; consec = 0;
      sumR += exitR; grossW += exitR * risk;
    } else {
      consec++; maxConsec = Math.max(maxConsec, consec);
      sumR -= 1; grossL += risk;
    }
  }

  const winRate = trades ? (wins / trades) * 100 : 0;
  const expectancyR = trades ? sumR / trades : 0;
  const netPnl = Math.round(sumR * 15);
  const profitFactor = grossL > 0 ? grossW / grossL : grossW > 0 ? 99 : 0;
  return {
    cfg, trades, wins,
    winRate: r1(winRate), expectancyR,
    netPnl, profitFactor: r1(Math.min(profitFactor, 99)), maxConsecLoss: maxConsec,
  };
}

function baseCfg(patch: Partial<BtConfig>): BtConfig {
  return { id: 'x', label: '', tpMode: 'tp1', slMode: 'engine', kzOnly: false, minRR: 0, days: 25, ...patch };
}

export function runBtSuite(all: Candle[]): BtSuiteResult | null {
  const spanDays = all.length > 1 ? Math.floor((all[all.length - 1].time - all[0].time) / 86400) : 0;
  const lookback = Math.min(180, Math.max(30, spanDays));
  const raw = collectSignals(all, lookback);
  if (raw.length < 15) return null;

  // شبكة التركيبات: نختبر أثر كل مقبض بمعزوله ثم نصنّف الكل
  const grid: BtConfig[] = [];
  const add = (patch: Partial<BtConfig>, label: string) => grid.push(baseCfg({ ...patch, id: grid.length + '', label }));
  add({}, 'الإعداد الحالي (خط الأساس)');
  add({ kzOnly: true }, 'قيّد الدخول بمناطق القتل');
  add({ tpMode: 'fixed10' }, 'هدف ثابت 10$ (هدفك اليومي)');
  add({ tpMode: 'fixed15' }, 'هدف ثابت 15$');
  add({ tpMode: 'r1.5' }, 'هدف 1.5× المخاطرة');
  add({ slMode: 'fixed15' }, 'وقف ثابت 15$');
  add({ minRR: 2 }, 'اشترط R:R ≥ 2');
  add({ minRR: 2.5 }, 'اشترط R:R ≥ 2.5');
  add({ days: 15 }, 'نافذة 15 يوماً');
  add({ days: 20 }, 'نافذة 20 يوماً');
  if (lookback >= 60) add({ days: 60 }, 'نافذة 60 يوماً');
  if (lookback >= 120) add({ days: 120 }, 'نافذة 120 يوماً');
  add({ kzOnly: true, tpMode: 'fixed10' }, 'دمج: كيلزون + هدف 10$');
  add({ kzOnly: true, tpMode: 'fixed10', minRR: 2 }, 'دمج: كيلزون + هدف 10$ + R:R 2');

  const results = grid.map((cfg) => simulate(raw, cfg)).sort((a, b) => b.expectancyR - a.expectancyR);
  const baseline = results.find((r) => r.cfg.id === '0')!;
  const withTrades = results.filter((r) => r.trades >= Math.max(5, baseline.trades * 0.4));

  // التوصيات: كل تعديل يحسن التوقع بفارق واضح
  const recs: BtRecommendation[] = [];
  const pushRec = (r: BtComboResult) => {
    if (r.cfg.id === '0') return;
    const dR = Math.round((r.expectancyR - baseline.expectancyR) * 100) / 100;
    if (r.expectancyR > baseline.expectancyR + 0.05 && r.trades >= 8) {
      recs.push({ text: r.cfg.label, impact: `التوقع ${baseline.expectancyR}R ← ${r.expectancyR}R (${dR > 0 ? '+' : ''}${dR}) على ${r.trades} صفقة`, positive: true });
    } else if (r.expectancyR < baseline.expectancyR - 0.15) {
      recs.push({ text: `تجنّب: ${r.cfg.label}`, impact: `يخفض التوقع إلى ${r.expectancyR}R`, positive: false });
    }
  };
  results.forEach(pushRec);

  const best = withTrades[0] ?? results[0];
  const verdict = recs.length && recs[0].positive
    ? `توصية اليوم: ${recs[0].text} — ${recs[0].impact}`
    : baseline.expectancyR > 0
      ? `الإعداد الحالي سليم (${baseline.expectancyR}R توقع) — لا تعديل اليوم`
      : `الإعداد الحالي خاسر تاريخياً (${baseline.expectancyR}R) — ${best.cfg.id !== '0' ? `جرّب: ${best.cfg.label} (${best.expectancyR}R)` : 'قلل التداول اليوم'}`;

  return {
    ranAt: Date.now(),
    daysTested: lookback,
    baseline,
    top: withTrades.slice(0, 4),
    recommendations: recs.slice(0, 5),
    verdict,
  };
}

// ---------- سجل الاختبارات اليومية ----------
const JOURNAL_LS = 'xau_bt_journal';

export interface BtJournalEntry {
  date: string;        // YYYY-MM-DD
  ranAt: number;
  baselineExp: number;
  topLabel: string;
  topExp: number;
  verdict: string;
}

export function loadBtJournal(): BtJournalEntry[] {
  try { return JSON.parse(localStorage.getItem(JOURNAL_LS) ?? '[]'); } catch { return []; }
}

export function appendBtJournal(entry: BtJournalEntry): BtJournalEntry[] {
  const list = [...loadBtJournal().filter((e) => e.date !== entry.date), entry]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);
  try { localStorage.setItem(JOURNAL_LS, JSON.stringify(list)); } catch { /* */ }
  return list;
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
