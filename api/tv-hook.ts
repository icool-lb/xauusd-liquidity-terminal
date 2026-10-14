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
  const isBuy = side.includes('buy') || side.includes('long'), isSell = side.includes('sell') || side.includes('short');
  const setup = String(o.setup ?? '');
  const ev = String(o.event ?? '');
  const title = setup === 'momentum'
    ? (ev === 'pending' ? '⏳ أمر زخم معلّق (Limit)' : ev === 'filled' ? '✅ تفعّل أمر الزخم' : 'زخم')
    : setup === 'sweep' ? 'سحب سيولة + كسر هيكلي'
    : setup === 'manage' && ev === 'breakeven' ? '🛡 نقل الوقف إلى الدخول — الصفقة بلا مخاطرة' : 'تنبيه TradingView';
  const lines = [`${isBuy ? '🟢' : isSell ? '🔴' : '⚡'} <b>${title}</b> · ${escape(String(o.ticker ?? 'XAUUSD'))} ${isBuy ? 'شراء' : isSell ? 'بيع' : ''}`];
  if (o.price) lines.push(`${ev === 'pending' ? 'أمر محدد عند' : 'دخول'} <b>${escape(String(o.price))}</b>`);
  if (o.sl || o.stop) lines.push(`وقف <b>${escape(String(o.sl ?? o.stop))}</b>${o.price && (o.sl ?? o.stop) ? ` (${Math.abs(Number(o.price) - Number(o.sl ?? o.stop)).toFixed(2)}$)` : ''}`);
  if (o.tp) lines.push(`هدف <b>${escape(String(o.tp))}</b>${o.rr ? ` · R:R ${escape(String(o.rr))}` : ''}`);
  if (o.lot) lines.push(`📦 اللوت المحسوب: <b>${escape(String(o.lot))}</b>`);
  if (o.note) lines.push(`• ${escape(String(o.note))}`);
  if (lines.length === 1) lines.push(`<code>${escape(JSON.stringify(o)).slice(0, 200)}</code>`);
  lines.push('<i>من مؤشر iCOOL Gold على TradingView · التزم بالوقف · ليست نصيحة مالية</i>');
  return lines.join('\n');
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
