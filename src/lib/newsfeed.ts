// ============================================================
// جلب جدول الأخبار تلقائياً — لينا حداد لا تنتظر إدخالاً يدوياً
// المصدر الأساسي تقويم اقتصادي عام مجاني، مع سلسلة بدائل إن منع المتصفح الوصول
// ============================================================

import type { NewsEvent, NewsImpact } from './engine';

interface FfEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
}

const SOURCE = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// سلسلة مصادر: مباشرة ثم عبر مرحّلات CORS عامة (أيهما ينجح أولاً)
async function fetchJson(): Promise<FfEvent[]> {
  const attempts: string[] = [
    SOURCE,
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(SOURCE),
    'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(SOURCE),
  ];
  let lastErr = '';
  for (const url of attempts) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) { lastErr = 'HTTP ' + r.status; continue; }
      const j = (await r.json()) as unknown;
      if (Array.isArray(j) && j.length) return j as FfEvent[];
      lastErr = 'صيغة غير متوقعة';
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'خطأ شبكة';
    }
  }
  throw new Error(lastErr || 'كل المصادر فشلت');
}

// توحيد الأثر حسب طبيعة الخبر لا التصنيف الخام فقط
function classifyImpact(title: string, raw: string): NewsImpact {
  if (/FOMC|NFP|CPI| payrolls |interest rate|powell/i.test(title)) return 'high';
  if (raw === 'High') return 'high';
  if (raw === 'Medium') return 'medium';
  return 'low';
}

export async function fetchWeekCalendar(): Promise<NewsEvent[]> {
  const raw = await fetchJson();
  const now = Date.now() / 1000;
  const out: NewsEvent[] = [];
  for (const e of raw) {
    if (e.country !== 'USD') continue; // الذهب يرد أساساً على الدولار
    const t = Math.floor(new Date(e.date).getTime() / 1000);
    if (!Number.isFinite(t) || t + 7200 < now) continue; // تجاهل المنتهي قبل ساعتين
    const impact = classifyImpact(e.title, e.impact);
    if (impact === 'low') continue;
    out.push({
      id: 'ff-' + e.title + '-' + t,
      time: t,
      title: e.title,
      currency: 'USD',
      impact,
      forecast: e.forecast ?? '',
      previous: e.previous ?? '',
    });
  }
  // مراقبة جيوسياسية دائمة تضبطها لينا ضمن مجالها
  out.push({
    id: 'geo-watch-' + Math.floor(now / 86400),
    time: Math.floor(now / 3600) * 3600 + 4 * 3600,
    title: 'مراقبة التصعيد الجيوسياسي (الشرق الأوسط/أوكرانيا/الحرب التجارية)',
    currency: 'ALL',
    impact: 'high',
    forecast: 'متابعة البيانات والتصريحات الرسمية',
    previous: '',
  });
  return out.sort((a, b) => a.time - b.time).slice(0, 40);
}
