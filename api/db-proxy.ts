// وسيط Databento الخادمي — يتجاوز حظر CORS من المتصفح
// المتصفح يتصل بـ /api/db-proxy (نفس موقع المنصة) وهذه الدالة تتصل بـ hist.databento.com
// المفتاح يمر في الترويسة x-db-key ولا يُحفظ على الخادم إطلاقاً
const ALLOWED = ['datasets.list', 'timeseries.get'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'GET/POST only' });
    return;
  }
  const key = String(req.headers['x-db-key'] ?? '');
  if (!key) {
    res.status(400).json({ ok: false, error: 'missing x-db-key header' });
    return;
  }
  const path = String(req.query?.path ?? '');
  if (!ALLOWED.includes(path)) {
    res.status(400).json({ ok: false, error: 'path not allowed' });
    return;
  }
  // إعادة بناء الاستعلام (بدون معامل path نفسه)
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (k === 'path') continue;
    qs.set(k, String(v));
  }
  try {
    const upstream = await fetch(`https://hist.databento.com/v0/${path}?${qs.toString()}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64') },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status).send(text);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'تعذر الوصول لخوادم Databento: ' + String(e) });
  }
}
