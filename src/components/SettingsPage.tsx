// ============================================================
// صفحة الإعدادات — كل المفاتيح في مكان واحد داخل المنصة
// MetaApi + Databento + ربط TradingView/Telegram
// كل شيء يُحفظ في متصفح المستخدم فقط ولا يُرسل لأي جهة ثالثة
// ============================================================

import { useState } from 'react';
import { ConnectionPanel } from './Panels';
import { loadDbKey, saveDbKey, checkDbKey } from '../lib/databento';
import type { MetaApiCreds } from '../lib/metaapi';

const LS_TV = 'xau_tv_hook';
const LS_TGBOT = 'xau_tg_bot';
const LS_TGCHAT = 'xau_tg_chat';
const lsGet = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* تجاهل */ } };

const inputCls = 'mt-0.5 w-full rounded-sm border border-[#1a2540] bg-[#080c16] px-2 py-1.5 font-mono text-[10.5px] text-white outline-none focus:border-amber-400/50';

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
      <div className="rounded-md border border-[#1a2540] bg-[#0c1220] p-3">
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

      {/* ٣) ربط TradingView ← Telegram */}
      <div className="rounded-md border border-[#1a2540] bg-[#0c1220] p-3">
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
          <code dir="ltr" className="mt-1 block rounded-sm bg-[#080c16] p-1.5 font-mono text-[9px] text-cyan-300">
            https://اسم-مشروعك.vercel.app/api/tv-hook?key={tv || 'مفتاحك'}
          </code>
        </div>
      </div>

      {/* ٤) الخصوصية */}
      <div className="rounded-md border border-[#1a2540] bg-[#0c1220] p-3">
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
