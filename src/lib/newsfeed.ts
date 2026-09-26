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

const WEEKS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

// سحب ملف أسبوع عبر سلسلة بدائل (مباشرة ثم مرحّلات CORS عامة)
async function fetchWeekJson(source: string): Promise<FfEvent[]> {
  const attempts: string[] = [
    source,
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(source),
    'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(source),
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

// الأسبوعان الحالي والقادم معاً — نجاح أحدهما لا يعوّض فشل الآخر
async function fetchJson(): Promise<FfEvent[]> {
  const settled = await Promise.allSettled(WEEKS.map(fetchWeekJson));
  const ok = settled.filter((s): s is PromiseFulfilledResult<FfEvent[]> => s.status === 'fulfilled');
  if (!ok.length) {
    const err = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult | undefined;
    throw new Error(err?.reason?.message ?? 'كل المصادر فشلت');
  }
  return ok.flatMap((s) => s.value);
}

// توحيد الأثر حسب طبيعة الخبر لا التصنيف الخام فقط
function classifyImpact(title: string, raw: string): NewsImpact {
  if (/FOMC|NFP|CPI| payrolls |interest rate|powell/i.test(title)) return 'high';
  if (raw === 'High') return 'high';
  if (raw === 'Medium') return 'medium';
  return 'low';
}

// هيكل الأسبوع القادم: الأحداث المتكررة مواعيدها معروفة هيكلياً —
// يُعلَّم بوضوح ويُستبدل تلقائياً بالتقويم الرسمي فور نشره
function nextWeekSkeleton(): NewsEvent[] {
  const now = new Date();
  const day = now.getUTCDay(); // 0 أحد
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + ((8 - day) % 7 || 7)); // أسبوع قادم يبدأ الاثنين
  const at = (d: Date, hm: string) => Math.floor(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +hm.slice(0, 2), +hm.slice(3, 5))).getTime() / 1000);
  const mk = (title: string, d: Date, hm: string, impact: NewsImpact): NewsEvent => ({
    id: 'skel-' + title + '-' + d.toISOString().slice(0, 10),
    time: at(d, hm), title, currency: 'USD', impact, forecast: '', previous: '',
  });
  const out: NewsEvent[] = [];
  const thu = new Date(monday); thu.setUTCDate(monday.getUTCDate() + 3); // الخميس
  const fri = new Date(monday); fri.setUTCDate(monday.getUTCDate() + 4); // الجمعة
  out.push(mk('[هيكلي] مطالبات البطالة الأسبوعية', thu, '12:30', 'medium'));
  // NFP: أول جمعة من الشهر إن وقعت في الأسبوع القادم
  const firstFriNextMonth = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth() + 1, 1));
  while (firstFriNextMonth.getUTCDay() !== 5) firstFriNextMonth.setUTCDate(firstFriNextMonth.getUTCDate() + 1);
  if (firstFriNextMonth >= monday && firstFriNextMonth <= fri) {
    out.push(mk('[هيكلي] تقرير التوظيف NFP', firstFriNextMonth, '12:30', 'high'));
  }
  // CPI/PPI: منتصف الشهر تقريباً إن وقعا في الأسبوع القادم
  const midMonth = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth() + 1, 12));
  if (midMonth >= monday && midMonth <= fri) {
    out.push(mk('[هيكلي] CPI — مؤشر أسعار المستهلك (تاريخ تقريبي)', midMonth, '12:30', 'high'));
    const ppi = new Date(midMonth); ppi.setUTCDate(midMonth.getUTCDate() - 1);
    out.push(mk('[هيكلي] PPI — مؤشر أسعار المنتجين (تاريخ تقريبي)', ppi, '08:30', 'medium'));
  }
  return out;
}

export async function fetchWeekCalendar(): Promise<NewsEvent[]> {
  let raw: FfEvent[];
  let usedSkeleton = false;
  try {
    raw = await fetchJson();
  } catch {
    raw = [];
    usedSkeleton = true;
  }
  const now = Date.now() / 1000;
  const out: NewsEvent[] = [];
  for (const e of raw) {
    if (e.country !== 'USD') continue; // الذهب يرد أساساً على الدولار
    const t = Math.floor(new Date(e.date).getTime() / 1000);
    // نحتفظ بأخبار آخر 7 أيام (لتحليل ربط الأخبار بالحركة) — العرض القادم يفلتر نفسه
    if (!Number.isFinite(t) || t < now - 7 * 86400) continue;
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
  // الأسبوع القادم: نكمل بالهيكل المعتاد عندما لا يغطيه المصدر بعد
  const coveredUntil = raw.length ? Math.max(...raw.map((e) => Math.floor(new Date(e.date).getTime() / 1000))) : 0;
  const nextWeekStart = Math.floor((now + (8 - new Date().getUTCDay()) % 7 * 86400) / 86400) * 86400;
  if (usedSkeleton || coveredUntil < nextWeekStart + 86400) {
    out.push(...nextWeekSkeleton());
  }
  return out.sort((a, b) => a.time - b.time).slice(-50); // الأحدث 50 (الأقدم تُهمَل)
}
