import { useCallback, useEffect, useRef, useState } from 'react';
import {
  runBtSuite, loadBtJournal, appendBtJournal, todayKey,
  type BtSuiteResult, type BtJournalEntry,
} from '../lib/btsuite';
import { speak } from '../lib/audio';
import type { Candle } from '../lib/engine';

export function BtExpertPanel({ candles }: { candles: Candle[] }) {
  const [open, setOpen] = useState(true);
  const [suite, setSuite] = useState<BtSuiteResult | null>(null);
  const [journal, setJournal] = useState<BtJournalEntry[]>(loadBtJournal);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('بانتظار أول اتصال بالبيانات…');
  const runId = useRef(0);

  const run = useCallback((announceResult: boolean) => {
    if (runId.current) return; // لا تشغيل متوازٍ
    runId.current = 1;
    setBusy(true);
    setStatus('أليكس يختبر 12 تركيبة إعدادات على 30 يوماً من بياناتك…');
    // أجّل قليلاً لتظهر رسالة التحميل قبل الحساب
    setTimeout(() => {
      try {
        const res = runBtSuite(candles);
        if (!res) {
          setStatus('عينة الإشارات أقل من 15 صفقة — لا يمكن استخلاص نتيجة موثوقة بعد');
        } else {
          setSuite(res);
          const entry: BtJournalEntry = {
            date: todayKey(), ranAt: res.ranAt,
            baselineExp: res.baseline.expectancyR,
            topLabel: res.top[0]?.cfg.label ?? '—',
            topExp: res.top[0]?.expectancyR ?? 0,
            verdict: res.verdict,
          };
          setJournal(appendBtJournal(entry));
          setStatus(`آخر اختبار: الآن — ${res.baseline.trades + 0} إشارة محلولة على ${res.daysTested} يوماً`);
          if (announceResult) speak(`اكتمل الاختبار اليومي. ${res.verdict}`);
        }
      } catch {
        setStatus('تعذر الاختبار — حدث خطأ غير متوقع');
      }
      setBusy(false);
      runId.current = 0;
    }, 60);
  }, [candles]);

  // تشغيل تلقائي يومياً: إن لم يوجد سجل اليوم وبعد اكتمال البيانات
  useEffect(() => {
    if (candles.length < 300) return;
    const today = todayKey();
    if (journal[0]?.date === today) {
      // استرجاع حالة اليوم من السجل
      if (!suite) setStatus(`اختبار اليوم تم ✓ — التالي غداً تلقائياً (آخر: ${new Date(journal[0].ranAt).toISOString().slice(11, 16)} UTC)`);
      return;
    }
    run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.length]);

  const minsAgo = suite ? Math.max(0, Math.round((Date.now() - suite.ranAt) / 60000)) : null;
  const doneToday = journal[0]?.date === todayKey();

  return (
    <div className="rounded-sm border border-cyan-400/25 bg-[#0c1220] p-2">
      <button onClick={() => setOpen((v) => !v)} className="mb-1.5 flex w-full items-center gap-1.5 text-right">
        <span className={`h-1.5 w-1.5 rounded-full ${busy ? 'animate-pulse bg-amber-400' : doneToday ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">خبير الباك-تيست — الفحص اليومي</h3>
        <div className="h-px flex-1 bg-[#1a2540]" />
        <span className="text-[10px] text-slate-600">{open ? '▲ طي' : '▼ عرض'}</span>
      </button>
      {open && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <p className="flex-1 text-[9px] leading-relaxed text-slate-400">{status}</p>
            <button
              onClick={() => run(true)}
              disabled={busy || candles.length < 300}
              className="shrink-0 rounded-sm border border-cyan-400/40 px-2 py-0.5 text-[9px] font-bold text-cyan-300 transition hover:bg-cyan-400/10 disabled:opacity-40"
            >
              {busy ? 'يختبر…' : 'شغّل الآن'}
            </button>
          </div>

          {suite && (
            <>
              {/* حكم اليوم */}
              <div className={`rounded-sm border p-2 ${suite.baseline.expectancyR > 0 ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-red-400/30 bg-red-400/5'}`}>
                <div className="text-[9px] font-bold text-slate-400">{doneToday ? 'حكم اليوم' : 'آخر حكم'} {minsAgo !== null && minsAgo > 0 ? `(قبل ${minsAgo} دقيقة)` : ''}</div>
                <p className="mt-0.5 text-[11px] font-black leading-relaxed text-white">{suite.verdict}</p>
                <div className="mt-1 flex flex-wrap gap-2 font-mono text-[9px] text-slate-400" dir="ltr">
                  <span>أساس: {suite.baseline.trades} صفقة</span>
                  <span>Win {suite.baseline.winRate}%</span>
                  <span>{suite.baseline.expectancyR}R</span>
                  <span>{suite.baseline.netPnl >= 0 ? '+' : ''}{suite.baseline.netPnl}$/0.01</span>
                </div>
              </div>

              {/* أفضل التركيبات */}
              <div>
                <div className="mb-0.5 text-[9px] font-bold text-slate-400">أفضل التركيبات المختبرة (بنفس بياناتك)</div>
                <div className="overflow-hidden rounded-sm border border-[#1a2540]">
                  {suite.top.map((r, i) => (
                    <div key={r.cfg.id} className={`flex items-center gap-2 border-b border-[#101828] px-2 py-1.5 text-[9.5px] last:border-0 ${i === 0 ? 'bg-amber-400/5' : ''}`}>
                      <span className={`w-4 font-mono font-black ${i === 0 ? 'text-amber-300' : 'text-slate-600'}`}>{i + 1}</span>
                      <span className="flex-1 font-bold text-white">{r.cfg.label}</span>
                      <span className="font-mono text-[8.5px] text-slate-500" dir="ltr">{r.trades}t · {r.winRate}%</span>
                      <span className={`font-mono font-bold ${r.expectancyR >= 0 ? 'text-emerald-300' : 'text-red-300'}`} dir="ltr">
                        {r.expectancyR}R {r.netPnl >= 0 ? '+' : ''}{r.netPnl}$
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* التوصيات */}
              {suite.recommendations.length > 0 && (
                <div>
                  <div className="mb-0.5 text-[9px] font-bold text-slate-400">تعديلات مقاسة (قبول/رفض)</div>
                  {suite.recommendations.map((r, i) => (
                    <div key={i} className="mb-1 flex items-start gap-1.5 rounded-sm bg-[#080c16] px-2 py-1.5 text-[9.5px]">
                      <span className={r.positive ? 'text-emerald-300' : 'text-red-300'}>{r.positive ? '✅' : '⛔'}</span>
                      <div>
                        <span className="font-bold text-slate-200">{r.text}</span>
                        <span className="mr-1.5 font-mono text-[8.5px] text-slate-500">{r.impact}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* سجل الأيام */}
          {journal.length > 0 && (
            <div>
              <div className="mb-0.5 text-[9px] font-bold text-slate-400">سجل الاختبارات اليومية</div>
              <div className="max-h-28 overflow-y-auto rounded-sm border border-[#1a2540]">
                {journal.slice(0, 7).map((e) => (
                  <div key={e.date} className="border-b border-[#101828] px-2 py-1 text-[9px] last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-300" dir="ltr">{e.date}</span>
                      <span className="font-mono text-slate-600" dir="ltr">أساس {e.baselineExp}R</span>
                      <span className={`mr-auto font-mono font-bold ${e.topExp >= e.baselineExp ? 'text-emerald-300' : 'text-slate-400'}`} dir="ltr">
                        الأفضل {e.topExp}R
                      </span>
                    </div>
                    <p className="mt-0.5 text-[8.5px] leading-relaxed text-slate-500">{e.verdict}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
