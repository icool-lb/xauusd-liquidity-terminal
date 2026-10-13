// ============================================================
// بوت Telegram للإدارة: /status /levels /scan /bt /settings /crew /id
// Webhook: POST /api/telegram   (يتحقّق من X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET)
// إعداد:   GET  /api/telegram?setup=1&key=SCAN_KEY  ← يسجّل الـ webhook والأوامر تلقائياً
// لا يجيب إلا المحادثة TELEGRAM_CHAT_ID (عدا /id لمعرفة المعرّف أول مرة)
// ============================================================
import { fetchM15, mtEnv } from './_lib/metaapi.js';
import { applyServerConfig, btText, cfgText, CREW_TEXT, HELP_TEXT, levelsText, scan, statusText } from './_lib/desk.js';
import { tgCall, tgSend } from './_lib/telegram.js';

const COMMANDS = [
  ['status', 'السعر والانحياز وصفقات اليوم'], ['levels', 'مستويات اليوم وقوتها'], ['scan', 'فحص الآن'],
  ['bt', 'باك-تيست 20 يوماً'], ['settings', 'الإعدادات'], ['crew', 'طاقم الخبراء'], ['id', 'معرّف المحادثة'], ['help', 'المساعدة'],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  // ---- الإعداد لمرة واحدة ----
  if (req.method === 'GET') {
    if (!process.env.SCAN_KEY || String(req.query?.key ?? '') !== process.env.SCAN_KEY) { res.status(401).json({ ok: false }); return; }
    if (String(req.query?.setup ?? '') !== '1') { res.status(200).json({ ok: true, hint: 'add &setup=1' }); return; }
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
    if (!/^[A-Za-z0-9_-]{8,256}$/.test(secret)) { res.status(500).json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET missing (8+ chars A-Z a-z 0-9 _ -)' }); return; }
    const url = `https://${req.headers.host}/api/telegram`;
    const a = await tgCall('setWebhook', { url, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
    const b = await tgCall('setMyCommands', { commands: COMMANDS.map(([command, description]) => ({ command, description })) });
    res.status(200).json({ ok: a.ok && b.ok, webhook: a.description ?? a.ok, commands: b.ok, url });
    return;
  }
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(401).end(); return;
  }
  // Telegram يعيد المحاولة إن لم نردّ 200 — نردّ 200 دائماً بعد المعالجة
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const msg = body?.message;
    const chatId = msg?.chat?.id;
    const text = String(msg?.text ?? '').trim();
    if (!chatId || !text.startsWith('/')) { res.status(200).json({ ok: true }); return; }
    const cmd = text.split(/[\s@]/)[0].slice(1).toLowerCase();
    const allowed = String(chatId) === String(process.env.TELEGRAM_CHAT_ID ?? '');
    if (cmd === 'id' || cmd === 'start' && !allowed) {
      await tgSend(`معرّف هذه المحادثة: <code>${chatId}</code>${allowed ? '' : '\nضعه في Vercel باسم TELEGRAM_CHAT_ID لتفعيل البوت.'}`, chatId);
      res.status(200).json({ ok: true }); return;
    }
    if (!allowed) { res.status(200).json({ ok: true }); return; } // صمت تام مع الغرباء

    const reply = (t: string) => tgSend(t, chatId);
    if (cmd === 'start' || cmd === 'help') await reply(HELP_TEXT);
    else if (cmd === 'crew') await reply(CREW_TEXT);
    else if (cmd === 'settings') { applyServerConfig(); await reply(cfgText()); }
    else if (['status', 'levels', 'scan', 'bt'].includes(cmd)) {
      const env = mtEnv();
      if (!env) { await reply('⚠️ METAAPI_TOKEN و METAAPI_ACCOUNT_ID غير مضبوطين في Vercel.'); }
      else {
        applyServerConfig();
        const candles = await fetchM15(env, cmd === 'bt' ? 3 : 1);
        if (cmd === 'status') await reply(statusText(candles));
        else if (cmd === 'levels') await reply(levelsText(candles));
        else if (cmd === 'bt') await reply(btText(candles, 20));
        else {
          const out = scan(candles);
          if (!out.events.length) await reply(`🔎 لا جديد على آخر شمعة مغلقة (${new Date(out.lastClosed * 1000).toISOString().slice(11, 16)} UTC).\n\n` + statusText(candles));
          for (const e of out.events) await reply(e.text);
        }
      }
    } else await reply('أمر غير معروف.\n\n' + HELP_TEXT);
  } catch (e) {
    try { const chat = process.env.TELEGRAM_CHAT_ID; if (chat) await tgSend('⚠️ خطأ: ' + String((e as Error).message ?? e).slice(0, 200), chat); } catch { /* تجاهل */ }
  }
  res.status(200).json({ ok: true });
}
