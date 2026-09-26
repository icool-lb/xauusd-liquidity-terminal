// مستقبل Webhook من TradingView — يحوّل التنبيه إلى رسالة Telegram
// يعمل على Vercel كدالة serverless: التنبيه يُطلق من خوادم TradingView 24/7
// المتغيرات البيئية المطلوبة في Vercel:
//   TELEGRAM_BOT_TOKEN  — توكن بوت Telegram (من @BotFather)
//   TELEGRAM_CHAT_ID    — معرف محادثتك مع البوت
//   TV_HOOK_KEY         — كلمة سر يختارها المستخدم وتضعها في رابط الـ webhook
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  try {
    const key = String(req.query?.key ?? '');
    const expected = process.env.TV_HOOK_KEY ?? '';
    if (!expected || key !== expected) {
      res.status(401).json({ ok: false, error: 'invalid key' });
      return;
    }
    const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
    const chatId = process.env.TELEGRAM_CHAT_ID ?? '';
    if (!token || !chatId) {
      res.status(500).json({ ok: false, error: 'Telegram env vars not set' });
      return;
    }
    const body: unknown = req.body;
    let msg = '';
    if (typeof body === 'string') {
      try { msg = format(JSON.parse(body)); } catch { msg = '📈 TradingView: ' + body.slice(0, 300); }
    } else if (body && typeof body === 'object') {
      msg = format(body as Record<string, unknown>);
    } else {
      msg = '📈 TradingView: تنبيه جديد (بلا تفاصيل)';
    }
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }),
    });
    if (!tg.ok) {
      res.status(502).json({ ok: false, error: 'telegram ' + tg.status });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}

function format(o: Record<string, unknown>): string {
  const side = String(o.side ?? o.action ?? '').toLowerCase();
  const emoji = side.includes('buy') || side.includes('long') ? '🟢 شراء' : side.includes('sell') || side.includes('short') ? '🔴 بيع' : '⚡ تنبيه';
  const lines = [`<b>${emoji}</b> XAUUSD`];
  if (o.price) lines.push(`السعر: <b>${escape(String(o.price))}</b>`);
  if (o.sl || o.stop) lines.push(`وقف: ${escape(String(o.sl ?? o.stop))}`);
  if (o.tp) lines.push(`هدف: ${escape(String(o.tp))}`);
  if (o.note) lines.push(`ملاحظة: ${escape(String(o.note))}`);
  if (o.ticker) lines.push(`<code>${escape(String(o.ticker))}</code>`);
  if (lines.length === 1) lines.push(`<code>${escape(JSON.stringify(o)).slice(0, 200)}</code>`);
  return lines.join('\n');
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
