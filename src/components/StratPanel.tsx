import { useMemo, useState } from 'react';
import { runStrategyLab, mergedPlan, type StrategyResult } from '../lib/strategies';
import type { Candle } from '../lib/engine';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function StratPanel({ candles, price }: { candles: Candle[]; price: number }) {
  const [open, setOpen] = useState(true);
  const [showTv, setShowTv] = useState(false);
  const results = useMemo(() => runStrategyLab(candles), [candles]);
  const plan = useMemo(() => mergedPlan(results, price), [results, price]);

  if (!results.length) return null;
  const best = results[0];

  return (
    <div className="rounded-sm border border-emerald-400/25 bg-[#0c1220] p-2">
      <button onClick={() => setOpen((v) => !v)} className="mb-1.5 flex w-full items-center gap-1.5 text-right">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">مختبر الاستراتيجيات — اختبار ودمج</h3>
        <div className="h-px flex-1 bg-[#1a2540]" />
        <span className="text-[10px] text-slate-600">{open ? '▲ طي' : '▼ عرض'}</span>
      </button>
      {open && (
        <div className="space-y-1.5">
          {/* الأفضل + الصفقة المدمجة */}
          <div className="rounded-sm border border-amber-400/30 bg-amber-400/5 p-2">
            <div className="text-[9px] font-bold text-amber-300">🏆 الأعلى ربحية على بياناتك (آخر 30 يوماً)</div>
            <div className="mt-0.5 text-[11px] font-black text-white">{best.name}</div>
            <div className="mt-0.5 flex flex-wrap gap-2 font-mono text-[9px] text-slate-400" dir="ltr">
              <span>Win {best.winRate}%</span>
              <span>PF {best.profitFactor}</span>
              <span>{best.netPnl >= 0 ? '+' : ''}{best.netPnl}$/0.01</span>
              <span>{best.tradesPerDay}/day</span>
              <span>جودة {best.quality}</span>
            </div>
          </div>

          {plan && (
            <div className={`rounded-sm border p-2 ${plan.side === 'flat' ? 'border-[#1a2540] bg-[#080c16]' : plan.confidence >= 55 ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-[#2a3a5f] bg-[#080c16]'}`}>
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className={`text-[11px] font-black ${plan.side === 'long' ? 'text-emerald-300' : plan.side === 'short' ? 'text-red-300' : 'text-slate-400'}`}>
                  {plan.side === 'long' ? '▲ صفقة دمج: شراء' : plan.side === 'short' ? '▼ صفقة دمج: بيع' : '◆ بانتظار تفاقم الاستراتيجيات'}
                </span>
                {plan.side !== 'flat' && (
                  <span className="rounded-sm bg-[#1a2540] px-1.5 py-0.5 font-mono text-[8.5px] font-bold text-cyan-300" dir="ltr">
                    ثقة {plan.confidence}%
                  </span>
                )}
              </div>
              {plan.side !== 'flat' ? (
                <>
                  <div className="flex items-center gap-2 font-mono text-[10px]" dir="ltr">
                    <span className="text-slate-400">دخول <b className="text-white">{fmt(plan.entry)}</b></span>
                    <span className="text-red-300">وقف {fmt(plan.stop)}</span>
                    <span className="text-emerald-300">هدف {fmt(plan.tp)} (+10$)</span>
                  </div>
                  <p className="mt-0.5 text-[9px] text-slate-400">
                    متفقة: <b className="text-emerald-300">{plan.agreeing.join(' + ')}</b>
                    {plan.opposing.length > 0 && <span className="mr-2 text-red-300/80">معارضة: {plan.opposing.join('، ')}</span>}
                  </p>
                  <p className="mt-0.5 text-[9px] leading-relaxed text-cyan-300/80">{plan.note}</p>
                </>
              ) : (
                <p className="text-[9.5px] text-slate-500">{plan.note}</p>
              )}
            </div>
          )}

          {/* جدول الترتيب */}
          <div>
            <div className="mb-0.5 text-[9px] font-bold text-slate-400">ترتيب الاستراتيجيات على نفس القواعد (وقف 15$ / هدف 10$)</div>
            <div className="overflow-hidden rounded-sm border border-[#1a2540]">
              {results.map((r, i) => (
                <StratRow key={r.name} r={r} rank={i + 1} />
              ))}
            </div>
          </div>

          {/* ربط TradingView الخارجي */}
          <button onClick={() => setShowTv((v) => !v)} className="w-full rounded-sm border border-dashed border-[#2a3a5f] py-1 text-[9px] text-slate-500 transition hover:text-slate-300">
            {showTv ? '▲ إخفاء ربط TradingView الخارجي (تنبيهات 24/7)' : '▼ ربط TradingView الخارجي — تنبيهات لهاتفك حتى والتطبيق مغلق'}
          </button>
          {showTv && (
            <div className="rounded-sm border border-dashed border-[#2a3a5f] p-2 text-[9px] leading-relaxed text-slate-400">
              <p className="text-slate-300">حسابك المدفوع يتيح Webhook Alerts تُطلق من خوادم TradingView على مدار الساعة:</p>
              <ol className="mr-3 mt-1 list-decimal space-y-0.5">
                <li>أنشئ بوتاً في Telegram عبر <b dir="ltr">@BotFather</b> وخذ التوكن، وأرسل رسالة للبوت ثم افتح <b dir="ltr">api.telegram.org/botTOKEN/getUpdates</b> لمعرفة <b>chat_id</b>.</li>
                <li>في Vercel ← Settings ← Environment Variables أضف: <b dir="ltr">TELEGRAM_BOT_TOKEN</b> و <b dir="ltr">TELEGRAM_CHAT_ID</b> و <b dir="ltr">TV_HOOK_KEY</b> (كلمة سر اخترها أنت).</li>
                <li>في TradingView أنشئ تنبيهاً ← تبويب الإشعارات ← Webhook URL:
                  <code dir="ltr" className="mt-0.5 block rounded-sm bg-[#080c16] p-1 font-mono text-[8px] text-cyan-300">https://xauusd-liquidity-terminal.vercel.app/api/tv-hook?key=TV_HOOK_KEY</code>
                </li>
                <li>رسالة التنبيه (مثال): <code dir="ltr" className="block rounded-sm bg-[#080c16] p-1 font-mono text-[8px] text-cyan-300">{'{"side":"buy","price":{{close}},"note":"اختراق قمة آسيا"}'}</code></li>
              </ol>
              <p className="mt-1 text-amber-300/80">ستصلك رسالة Telegram فوراً مهما كان هاتفك — لأن التنبيه يُطلق من خوادم TradingView لا من متصفحك.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StratRow({ r, rank }: { r: StrategyResult; rank: number }) {
  const pnlColor = r.netPnl >= 0 ? 'text-emerald-300' : 'text-red-300';
  return (
    <div className={`flex items-center gap-2 border-b border-[#101828] px-2 py-1.5 text-[9.5px] last:border-0 ${rank === 1 ? 'bg-amber-400/5' : ''}`}>
      <span className={`w-4 font-mono font-black ${rank === 1 ? 'text-amber-300' : 'text-slate-600'}`}>{rank}</span>
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-white">{r.name}</span>
          <span className="rounded-sm bg-[#1a2540] px-1 text-[8px] text-slate-500">{r.family}</span>
          {r.current !== 'flat' && (
            <span className={`font-black ${r.current === 'long' ? 'text-emerald-300' : 'text-red-300'}`}>{r.current === 'long' ? '▲' : '▼'}</span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[8.5px] text-slate-500" dir="ltr">
          {r.trades} trades · {r.tradesPerDay}/day · خسائر متتالية {r.maxConsecLoss}
        </div>
      </div>
      <div className="text-left font-mono" dir="ltr">
        <div className={`font-bold ${pnlColor}`}>{r.netPnl >= 0 ? '+' : ''}{r.netPnl}$</div>
        <div className="text-[8.5px] text-slate-500">{r.winRate}% · ج{r.quality}</div>
      </div>
    </div>
  );
}
