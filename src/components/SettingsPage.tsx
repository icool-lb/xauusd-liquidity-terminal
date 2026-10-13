// ============================================================
// صفحة الإعدادات — كل المفاتيح في مكان واحد داخل المنصة
// MetaApi + Databento + ربط TradingView/Telegram
// كل شيء يُحفظ في متصفح المستخدم فقط ولا يُرسل لأي جهة ثالثة
// ============================================================

import { useState } from 'react';
import { ConnectionPanel } from './Panels';
import { loadDbKey, saveDbKey, checkDbKey } from '../lib/databento';
import { getSessionWindows, setSessionWindows, DEFAULT_SESSIONS, type SessionWindows,
         getEngineCfg, setEngineCfg, type EngineCfg } from '../lib/engine';
import type { MetaApiCreds } from '../lib/metaapi';

const LS_TV = 'xau_tv_hook';
const LS_TGBOT = 'xau_tg_bot';
const LS_TGCHAT = 'xau_tg_chat';
const lsGet = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* تجاهل */ } };

const inputCls = 'mt-0.5 w-full rounded-sm border border-[#3e3e38] bg-[#262624] px-2 py-1.5 font-mono text-[10.5px] text-white outline-none focus:border-amber-400/50';

// تحويل ساعة عشرية ↔ نص "HH:MM"
const h2s = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const s2h = (s: string): number | null => {
  const m = s.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 24 || mi > 59) return null;
  return h + mi / 60;
};

function SessionWindowsCard() {
  const cur = getSessionWindows();
  const [f, setF] = useState<Record<keyof SessionWindows, string>>({
    asiaStart: h2s(cur.asiaStart), asiaEnd: h2s(cur.asiaEnd),
    londonStart: h2s(cur.londonStart), londonEnd: h2s(cur.londonEnd),
    nyStart: h2s(cur.nyStart), nyEnd: h2s(cur.nyEnd),
  });
  const [msg, setMsg] = useState('');

  const apply = () => {
    const w: SessionWindows = {
      asiaStart: s2h(f.asiaStart) ?? -1, asiaEnd: s2h(f.asiaEnd) ?? -1,
      londonStart: s2h(f.londonStart) ?? -1, londonEnd: s2h(f.londonEnd) ?? -1,
      nyStart: s2h(f.nyStart) ?? -1, nyEnd: s2h(f.nyEnd) ?? -1,
    };
    if (Object.values(w).some((v) => v < 0)) { setMsg('⚠️ صيغة غير صحيحة — استخدم HH:MM مثل 02:00'); return; }
    if (w.asiaStart === w.asiaEnd || w.londonStart === w.londonEnd || w.nyStart === w.nyEnd) { setMsg('⚠️ بداية النافذة لا يمكن أن تساوي نهايتها'); return; }
    setSessionWindows(w);
    setMsg('✅ حُفظت النوافذ — يُعاد تحميل المنصة لتوحيد كل المستويات والتحليلات…');
    setTimeout(() => location.reload(), 900);
  };

  const reset = () => {
    setF({
      asiaStart: h2s(DEFAULT_SESSIONS.asiaStart), asiaEnd: h2s(DEFAULT_SESSIONS.asiaEnd),
      londonStart: h2s(DEFAULT_SESSIONS.londonStart), londonEnd: h2s(DEFAULT_SESSIONS.londonEnd),
      nyStart: h2s(DEFAULT_SESSIONS.nyStart), nyEnd: h2s(DEFAULT_SESSIONS.nyEnd),
    });
  };

  const Row = ({ label, ks, ke }: { label: string; ks: keyof SessionWindows; ke: keyof SessionWindows }) => (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[10px] text-slate-400">{label}</span>
      <input value={f[ks]} onChange={(e) => setF({ ...f, [ks]: e.target.value })} className={inputCls} dir="ltr" placeholder="00:00" />
      <span className="text-[10px] text-slate-600">←</span>
      <input value={f[ke]} onChange={(e) => setF({ ...f, [ke]: e.target.value })} className={inputCls} dir="ltr" placeholder="08:00" />
    </div>
  );

  return (
    <div className="rounded-md border border-violet-400/30 bg-[#30302e] p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
        <h3 className="text-[11px] font-bold text-violet-300">نوافذ الجلسات (UTC) — توحيد قمم/قيعان الجلسات مع TradingView</h3>
      </div>
      <p className="mb-2 text-[9.5px] leading-relaxed text-slate-500">
        قمم وقيعان «آسيا/لندن/نيويورك» تُبنى عليها مستويات السيولة والسحب والإشارات — فأي اختلاف في التوقيت بين المنصة ومؤشرك في TradingView يغيّر الأرقام.
        انسخ هنا نفس أوقات الجلسات من إعدادات مؤشرك (حوّلها إلى UTC) لتتطابق المنصتان تماماً.
      </p>
      <div className="space-y-1.5">
        <Row label="آسيا 🌏" ks="asiaStart" ke="asiaEnd" />
        <Row label="لندن 🇬🇧" ks="londonStart" ke="londonEnd" />
        <Row label="نيويورك 🇺🇸" ks="nyStart" ke="nyEnd" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={apply} className="rounded-sm border border-violet-400/40 px-3 py-1.5 text-[10px] font-bold text-violet-300 transition hover:bg-violet-400/10">احفظ ووحّد</button>
        <button onClick={reset} className="rounded-sm border border-[#4d4c45] px-3 py-1.5 text-[10px] text-slate-500 transition hover:text-slate-300">إعادة للافتراضي</button>
        <span className="font-mono text-[8.5px] text-slate-600" dir="ltr">
          ICT NY: Asia 00:00-04:00 · London 06:00-10:00 · NY 12:30-15:00 UTC
        </span>
      </div>
      {msg && <p className="mt-1.5 text-[9.5px] text-amber-200/90">{msg}</p>}
    </div>
  );
}

function SignalRulesCard() {
  const cur = getEngineCfg();
  const [maxSignals, setMaxSignals] = useState(cur.maxSignals);
  const [minRR, setMinRR] = useState(cur.minRR);
  const [openFilter, setOpenFilter] = useState(cur.openFilter);
  const [sweepVol, setSweepVol] = useState(cur.sweepVol);
  const [momOn, setMomOn] = useState(cur.momOn);
  const [momVol, setMomVol] = useState(cur.momVol);
  const [momBias, setMomBias] = useState(cur.momBias);
  const [momMinLeg, setMomMinLeg] = useState(cur.momMinLeg);
  const [msg, setMsg] = useState('');

  const apply = () => {
    const cfg: Partial<EngineCfg> = { maxSignals, minRR, openFilter, sweepVol, momOn, momVol, momBias, momMinLeg };
    setEngineCfg(cfg);
    setMsg('✅ حُفظت القواعد — يُعاد تحميل المنصة…');
    setTimeout(() => location.reload(), 900);
  };

  const chip = (active: boolean) => `rounded-sm border px-2.5 py-1 text-[10px] font-bold transition ${active ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200' : 'border-[#4d4c45] text-slate-500 hover:text-slate-300'}`;

  return (
    <div className="rounded-md border border-cyan-400/30 bg-[#30302e] p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
        <h3 className="text-[11px] font-bold text-cyan-300">قواعد الإشارة اليومية — صرامة الانضباط</h3>
      </div>
      <p className="mb-2 text-[9.5px] leading-relaxed text-slate-500">
        اختبار الأسبوع الماضي على بيانات CME الحقيقية: الانضباط الحالي خسر <b className="text-slate-300">−1R</b> في صفقة واحدة، بينما الدخول بلا فلاتر على 24 فرصة خسر <b className="text-red-300">−7.8R</b> — الفلاتر منعت 9 صفقات كلها خاسرة. خفّف القواعد فقط إذا قبلت هذا الثمن.
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-32 shrink-0 text-[10px] text-slate-400">عدد الإشارات/اليوم</span>
          {[1, 2, 3].map((n) => <button key={n} onClick={() => setMaxSignals(n)} className={chip(maxSignals === n)}>{n === 1 ? '1 (صارم)' : n === 2 ? '2' : '3'}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-32 shrink-0 text-[10px] text-slate-400">أدنى R:R مقبول</span>
          {[1.5, 1.2, 1.0].map((n) => <button key={n} onClick={() => setMinRR(n)} className={chip(minRR === n)} dir="ltr">{n.toFixed(1)}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-32 shrink-0 text-[10px] text-slate-400">فلتر الافتتاح اليومي</span>
          <button onClick={() => setOpenFilter(true)} className={chip(openFilter)}>مفعّل (موصى به)</button>
          <button onClick={() => setOpenFilter(false)} className={chip(!openFilter)}>معطّل ⚠</button>
        </div>
        <div className="mt-1 border-t border-[#3e3e38] pt-2 text-[10px] font-bold text-amber-300">استراتيجية السحب + الحجم</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-32 shrink-0 text-[10px] text-slate-400">حجم شمعة السحب ≥</span>
          {[0, 1.2, 1.5, 2].map((n) => <button key={n} onClick={() => setSweepVol(n)} className={chip(sweepVol === n)} dir="ltr">{n ? `×${n}` : 'off'}</button>)}
        </div>
        <div className="mt-1 border-t border-[#3e3e38] pt-2 text-[10px] font-bold text-orange-300">استراتيجية الزخم (BOS + ارتداد 50%)</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-32 shrink-0 text-[10px] text-slate-400">المحرك</span>
          <button onClick={() => setMomOn(true)} className={chip(momOn)}>مفعّل</button>
          <button onClick={() => setMomOn(false)} className={chip(!momOn)}>معطّل</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-32 shrink-0 text-[10px] text-slate-400">حجم شمعة الكسر ≥</span>
          {[0, 1.1, 1.3, 1.6].map((n) => <button key={n} onClick={() => setMomVol(n)} className={chip(momVol === n)} dir="ltr">{n ? `×${n}` : 'off'}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-32 shrink-0 text-[10px] text-slate-400">مع انحياز الافتتاح فقط</span>
          <button onClick={() => setMomBias(true)} className={chip(momBias)}>نعم</button>
          <button onClick={() => setMomBias(false)} className={chip(!momBias)}>لا</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-32 shrink-0 text-[10px] text-slate-400">أقل موجة كسر $</span>
          {[6, 8, 10, 12].map((n) => <button key={n} onClick={() => setMomMinLeg(n)} className={chip(momMinLeg === n)} dir="ltr">{n}</button>)}
        </div>
        <p className="text-[9px] leading-relaxed text-slate-600">قارن أثر كل خيار على بياناتك قبل الحفظ من لوحة «مختبر السحب والزخم» — إن لم يوفّر وسيطك حجماً يُتخطّى فلتر الحجم تلقائياً.</p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={apply} className="rounded-sm border border-cyan-400/40 px-3 py-1.5 text-[10px] font-bold text-cyan-300 transition hover:bg-cyan-400/10">احفظ القواعد</button>
        <span className="text-[8.5px] text-slate-600">الفرص المرفوضة تظهر دائماً في بطاقة صفقة اليوم مع سبب الرفض</span>
      </div>
      {msg && <p className="mt-1.5 text-[9.5px] text-amber-200/90">{msg}</p>}
    </div>
  );
}

const LS_SCANKEY = 'xau_scan_key';
function DeskCard() {
  const [key, setKey] = useState(() => lsGet(LS_SCANKEY));
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const call = async (path: string) => {
    setBusy(true); setOut('…');
    try {
      const r = await fetch(path + (path.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key), { cache: 'no-store' });
      const j = await r.json().catch(() => ({ ok: false, error: 'HTTP ' + r.status }));
      if (r.status === 401) setOut('❌ مفتاح الماسح غير مطابق لـ SCAN_KEY في Vercel');
      else if (path.startsWith('/api/scan')) setOut(j.ok
        ? (j.skipped ? '🏛️ السوق مغلق الآن — الماسح يتوقف تلقائياً' : `✅ يعمل · ${j.candles} شمعة · آخر شمعة مغلقة ${String(j.lastClosed).slice(11, 16)} UTC · السعر ${j.price} · أحداث الآن: ${(j.events ?? []).length}`)
        : `❌ ${j.error}`);
      else setOut(j.ok ? '✅ سُجّل البوت والأوامر — أرسل /status للبوت' : `❌ ${j.error ?? j.webhook ?? 'فشل'}`);
    } catch { setOut('❌ تعذّر الاتصال بالخادم — هل المنصة منشورة على Vercel؟'); }
    setBusy(false);
  };
  const env = ['METAAPI_TOKEN', 'METAAPI_ACCOUNT_ID', 'METAAPI_SYMBOL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_WEBHOOK_SECRET', 'SCAN_KEY', 'ACCOUNT_BALANCE', 'RISK_PCT'];
  return (
    <div className="rounded-md border border-orange-400/30 bg-[#30302e] p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
        <h3 className="text-[11px] font-bold text-orange-300">مكتب التداول على الخادم — تنبيهات وصفقات على Telegram 24/5</h3>
      </div>
      <p className="mb-2 text-[9.5px] leading-relaxed text-slate-500">
        يعمل بدون فتح المنصة: كل 15 دقيقة يقرأ آخر شمعة مغلقة من حسابك، يشغّل استراتيجيتي <b className="text-amber-300">السحب + الحجم</b> و<b className="text-orange-300">الزخم</b> بنفس محرّك المنصة،
        ويرسل كل صفقة أو أمر معلّق مع رأي طاقم الخبراء وقرار المدير وحجم اللوت. البوت يجيب أوامرك: /status /levels /scan /bt /settings /crew.
      </p>
      <ol className="mb-2 list-decimal space-y-0.5 pr-4 text-[9.5px] leading-relaxed text-slate-400">
        <li>أضف في Vercel ← Environment Variables: <span dir="ltr" className="font-mono text-[9px] text-cyan-300">{env.join(' · ')}</span></li>
        <li>اضغط «تسجيل البوت» أدناه مرة واحدة، ثم أرسل <b dir="ltr">/id</b> للبوت إن لم تعرف Chat ID.</li>
        <li>الجدولة: ملف <span dir="ltr" className="font-mono">.github/workflows/scan.yml</span> يستدعي الماسح كل 15 دقيقة — يحتاج سرّين في GitHub: <span dir="ltr" className="font-mono">SCAN_URL</span> و<span dir="ltr" className="font-mono">SCAN_KEY</span>.</li>
      </ol>
      <label className="mb-2 block text-[10px] text-slate-500">
        مفتاح الماسح (نفس SCAN_KEY) — يُحفظ في هذا المتصفح فقط
        <input type="password" value={key} onChange={(e) => { setKey(e.target.value); lsSet(LS_SCANKEY, e.target.value); }} className={inputCls} dir="ltr" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button disabled={!key || busy} onClick={() => call('/api/scan?dry=1')} className="rounded-sm border border-cyan-400/40 px-3 py-1.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-40">اختبر الماسح الآن (بلا إرسال)</button>
        <button disabled={!key || busy} onClick={() => call('/api/scan')} className="rounded-sm border border-orange-400/40 px-3 py-1.5 text-[10px] font-bold text-orange-300 hover:bg-orange-400/10 disabled:opacity-40">افحص وأرسل</button>
        <button disabled={!key || busy} onClick={() => call('/api/telegram?setup=1')} className="rounded-sm border border-emerald-400/40 px-3 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-40">تسجيل البوت</button>
      </div>
      {out && <p className="mt-2 text-[10px] leading-relaxed text-slate-300">{out}</p>}
    </div>
  );
}

export function SettingsPage({ creds, status, error, onSave, onTest, onDbStatus }: {
  creds: MetaApiCreds | null;
  status: 'idle' | 'loading' | 'ok' | 'error';
  error: string;
  onSave: (c: MetaApiCreds) => void;
  onTest: () => void;
  onDbStatus: (ok: boolean | null) => void;
}) {
  const [dbKey, setDbKey] = useState(loadDbKey);
  const [dbMsg, setDbMsg] = useState('');
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [tv, setTv] = useState(() => lsGet(LS_TV));
  const [tgBot, setTgBot] = useState(() => lsGet(LS_TGBOT));
  const [tgChat, setTgChat] = useState(() => lsGet(LS_TGCHAT));

  const verifyDb = async () => {
    saveDbKey(dbKey);
    setDbMsg('جارٍ التحقق…');
    const r = await checkDbKey(dbKey);
    setDbOk(r.ok);
    onDbStatus(r.ok);
    setDbMsg(r.msg);
  };

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div>
        <h2 className="text-[14px] font-black text-white">⚙️ الإعدادات — مفاتيح المنصة</h2>
        <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
          كل المفاتيح في مكان واحد. تُحفظ في متصفحك فقط (localStorage) ولا تُرسل لأي خادم سوى الجهة الرسمية التي تخصها (MetaApi / Databento).
        </p>
      </div>

      {/* ١) الاتصال بالبيانات */}
      <ConnectionPanel creds={creds} status={status} error={error} onSave={onSave} onTest={onTest} />

      {/* ٢) مفتاح Databento */}
      <div className="rounded-md border border-[#3e3e38] bg-[#30302e] p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          <h3 className="text-[11px] font-bold text-cyan-300">مفتاح Databento — تدفق المؤسسات (عقود GC / CME)</h3>
        </div>
        <div className="flex gap-1.5">
          <input
            type="password"
            placeholder="Databento API Key"
            value={dbKey}
            onChange={(e) => setDbKey(e.target.value)}
            className={inputCls}
            dir="ltr"
          />
          <button onClick={verifyDb} className="shrink-0 rounded-sm border border-cyan-400/40 px-3 py-1.5 text-[10px] font-bold text-cyan-300 transition hover:bg-cyan-400/10">تحقق واحفظ</button>
        </div>
        {dbMsg && (
          <p className={`mt-1.5 text-[9.5px] leading-relaxed ${dbOk ? 'text-emerald-400/90' : 'text-amber-300/90'}`}>
            {dbOk ? '✅ ' : '⚠️ '}{dbMsg}
          </p>
        )}
        <p className="mt-1.5 text-[9px] leading-relaxed text-slate-600">
          الاتصال يمر تلقائياً عبر وسيط خادمي داخل المنصة (api/db-proxy) فلا يمنعه حظر CORS في المتصفح — المفتاح يرافق الطلب في ترويسة مشفرة ولا يُحفظ على الخادم. بعد الحفظ يفحص خبير الحيتان وتأكيد الموجة تدفق شيكاغو تلقائياً كل 10 دقائق.
        </p>
      </div>

      {/* ٣) توحيد نوافذ الجلسات */}
      <SessionWindowsCard />

      {/* ٤) قواعد الإشارة */}
      <SignalRulesCard />

      {/* ٥) المكتب الخادمي: ماسح كل 15 دقيقة + بوت Telegram */}
      <DeskCard />

      {/* ٦) ربط TradingView ← Telegram */}
      <div className="rounded-md border border-[#3e3e38] bg-[#30302e] p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <h3 className="text-[11px] font-bold text-amber-300">تنبيهات TradingView على هاتفك — Webhook + Telegram</h3>
        </div>
        <label className="mb-2 block text-[10px] text-slate-500">
          مفتاح الربط السري (TV Hook Key) — أصنعه بنفسك (أحرف وأرقام عشوائية)
          <input type="password" value={tv} onChange={(e) => { setTv(e.target.value); lsSet(LS_TV, e.target.value); }} className={inputCls} dir="ltr" placeholder="مثال: aX9kQ27mZp31" />
        </label>
        <label className="mb-2 block text-[10px] text-slate-500">
          توكن بوت Telegram — من @BotFather
          <input type="password" value={tgBot} onChange={(e) => { setTgBot(e.target.value); lsSet(LS_TGBOT, e.target.value); }} className={inputCls} dir="ltr" placeholder="123456:ABC-DEF…" />
        </label>
        <label className="mb-2 block text-[10px] text-slate-500">
          معرّف المحادثة Chat ID — من @userinfobot
          <input type="text" value={tgChat} onChange={(e) => { setTgChat(e.target.value); lsSet(LS_TGCHAT, e.target.value); }} className={inputCls} dir="ltr" placeholder="مثال: 881234567" />
        </label>
        <div className="rounded-sm border border-amber-400/30 bg-amber-400/5 p-2 text-[9.5px] leading-relaxed text-amber-200/90">
          <b>خطوة إلزامية على خادم Vercel:</b> هذه القيم الثلاث يقرأها الخادم من متغيرات البيئة لا من المتصفح —
          افتح Vercel ← مشروعك ← Settings ← Environment Variables وأضف <b dir="ltr">TV_HOOK_KEY</b> و<b dir="ltr">TELEGRAM_BOT_TOKEN</b> و<b dir="ltr">TELEGRAM_CHAT_ID</b> بنفس القيم، ثم أعد النشر.
          بعدها أنشئ تنبيهاً في TradingView (خطة مدفوعة) بنفس مفتاح الربط في الرابط:
          <code dir="ltr" className="mt-1 block rounded-sm bg-[#262624] p-1.5 font-mono text-[9px] text-cyan-300">
            https://اسم-مشروعك.vercel.app/api/tv-hook?key={tv || 'مفتاحك'}
          </code>
        </div>
      </div>

      {/* ٤) الخصوصية */}
      <div className="rounded-md border border-[#3e3e38] bg-[#30302e] p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <h3 className="text-[11px] font-bold text-emerald-300">الخصوصية</h3>
        </div>
        <button
          onClick={() => { try { localStorage.clear(); } catch { /* تجاهل */ } location.reload(); }}
          className="rounded-sm border border-red-400/40 px-3 py-1.5 text-[10px] font-bold text-red-300 transition hover:bg-red-400/10"
        >
          🗑 مسح كل المفاتيح والبيانات المحفوظة من هذا المتصفح
        </button>
        <p className="mt-1.5 text-[9px] leading-relaxed text-slate-600">
          لا نجمع أي بيانات — كل المفاتيح والسجلات (باك-تيست، أخبار) تبقى في متصفحك. مفتاح MetaApi يُرسل حصرياً إلى خوادم MetaApi الرسمية.
        </p>
      </div>
    </div>
  );
}
