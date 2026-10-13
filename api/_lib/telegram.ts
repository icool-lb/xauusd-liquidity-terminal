// إرسال رسائل Telegram — التوكن من TELEGRAM_BOT_TOKEN فقط
export const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function tgEnv() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chat = process.env.TELEGRAM_CHAT_ID ?? '';
  return token ? { token, chat } : null;
}

export async function tgCall(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const env = tgEnv();
  if (!env) return { ok: false, description: 'TELEGRAM_BOT_TOKEN not set' };
  const r = await fetch(`https://api.telegram.org/bot${env.token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try { return await r.json() as { ok: boolean }; } catch { return { ok: false, description: 'HTTP ' + r.status }; }
}

// الرسائل الطويلة تُقسم عند 3900 حرف (حدّ Telegram 4096)
export async function tgSend(text: string, chatId?: string | number) {
  const env = tgEnv();
  const chat = chatId ?? env?.chat;
  if (!env || !chat) return { ok: false, description: 'TELEGRAM_CHAT_ID not set' };
  let last: { ok: boolean; description?: string } = { ok: true };
  for (let i = 0; i < text.length; i += 3900) {
    last = await tgCall('sendMessage', { chat_id: chat, text: text.slice(i, i + 3900), parse_mode: 'HTML', disable_web_page_preview: true });
    if (!last.ok) break;
  }
  return last;
}
