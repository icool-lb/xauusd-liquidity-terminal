// ============================================================
// الماسح المجدول: يُستدعى كل 15 دقيقة (GitHub Actions أو أي cron خارجي)
// GET /api/scan?key=SCAN_KEY        ← يفحص آخر شمعة مغلقة ويرسل الجديد إلى Telegram
// GET /api/scan?key=SCAN_KEY&dry=1  ← نفس الشيء بلا إرسال (للتجربة)
// المفتاح يقبل أيضاً Authorization: Bearer CRON_SECRET (Vercel Cron)
// ============================================================
import { fetchM15, mtEnv } from './_lib/metaapi.js';
import { applyServerConfig, scan } from './_lib/desk.js';
import { tgSend } from './_lib/telegram.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  const key = String(req.query?.key ?? '');
  const auth = String(req.headers?.authorization ?? '');
  const okKey = (process.env.SCAN_KEY && key === process.env.SCAN_KEY) || (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`);
  if (!okKey) { res.status(401).json({ ok: false, error: 'invalid key' }); return; }
  const env = mtEnv();
  if (!env) { res.status(500).json({ ok: false, error: 'METAAPI_TOKEN / METAAPI_ACCOUNT_ID not set' }); return; }

  // الذهب مغلق من الجمعة 21:00 حتى الأحد 22:00 UTC
  const now = new Date(Date.now());
  const wd = now.getUTCDay(), h = now.getUTCHours();
  if (wd === 6 || (wd === 5 && h >= 21) || (wd === 0 && h < 22)) { res.status(200).json({ ok: true, skipped: 'market closed' }); return; }

  try {
    applyServerConfig();
    const candles = await fetchM15(env, 1);
    const out = scan(candles);
    const dry = String(req.query?.dry ?? '') === '1';
    const sent: { type: string; ok: boolean; err?: string }[] = [];
    if (!dry) for (const e of out.events) {
      const r = await tgSend(e.text);
      sent.push({ type: e.type, ok: r.ok, err: r.ok ? undefined : r.description });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true, candles: candles.length, lastClosed: new Date(out.lastClosed * 1000).toISOString(), price: out.price,
      events: dry ? out.events : out.events.map((e) => e.type), sent,
    });
  } catch (e) {
    const status = (e as { status?: number }).status;
    res.status(502).json({ ok: false, error: status === 401 ? 'MetaApi token rejected' : status === 404 ? 'MetaApi account/symbol not found' : String((e as Error).message ?? e).slice(0, 200) });
  }
}
