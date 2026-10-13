# التشغيل: الماسح وبوت Telegram

## متغيّرات Vercel (Settings ← Environment Variables)
| المتغيّر | إلزامي | الوصف |
|---|---|---|
| `METAAPI_TOKEN` · `METAAPI_ACCOUNT_ID` | ✔ | حساب MT4/MT5 بحالة DEPLOYED |
| `METAAPI_SYMBOL` | | رمز الذهب عند الوسيط (افتراضي `XAUUSD`) |
| `METAAPI_REGION` | | `new-york` افتراضياً |
| `TELEGRAM_BOT_TOKEN` | ✔ | من @BotFather |
| `TELEGRAM_CHAT_ID` | ✔ | البوت لا يجيب غيره (أرسل `/id` لمعرفته) |
| `TELEGRAM_WEBHOOK_SECRET` | ✔ | 8+ أحرف `A-Z a-z 0-9 _ -` |
| `SCAN_KEY` | ✔ | يحمي `/api/scan` و`?setup=1` |
| `ACCOUNT_BALANCE` · `RISK_PCT` | | لحساب اللوت (10000 و1%) |
| `ENGINE_CFG` | | JSON بإعدادات المحرّك، مثال `{"sweepVol":1.5,"momMinLeg":10}` |
| `SESSION_WINDOWS` | | JSON لنوافذ الجلسات إن عدّلتها في الواجهة |
| `CRON_SECRET` | | إن استعملت Vercel Cron بدل GitHub Actions |

## خطوات أول تشغيل
1. أضف المتغيّرات ثم أعد النشر.
2. من المنصة: الإعدادات ← «مكتب التداول على الخادم» ← أدخل SCAN_KEY ← «تسجيل البوت»
   (أو افتح `https://<app>/api/telegram?setup=1&key=SCAN_KEY`).
3. في GitHub ← Settings ← Secrets ← Actions: `SCAN_URL` = رابط المنصة، `SCAN_KEY`. شغّل workflow «gold-scan» يدوياً مرة.
4. أرسل `/status` للبوت.

## كيف يتجنّب التكرار
كل تشغيل يحلّل الشموع المغلقة فقط ويُرسل ما وقع على **آخر شمعة مغلقة**. التشغيل كل 15 دقيقة عند الدقيقة 2 يرى
شمعة مختلفة كل مرة ⇒ لا تكرار ولا تخزين حالة. تأخّر GitHub Actions أكثر من 15 دقيقة قد يُفوّت شمعة؛ لهذا
`/scan` في البوت يعطي الصورة الكاملة عند الحاجة.

## أعطال شائعة
| العَرَض | السبب |
|---|---|
| `401 invalid key` | SCAN_KEY مختلف بين الرابط/GitHub و Vercel |
| `MetaApi token rejected` | التوكن منتهٍ — أنشئ جديداً من app.metaapi.cloud/token |
| `account/symbol not found` | Account ID خطأ أو الرمز بلاحقة الوسيط (`XAUUSD.m`، `GOLD`) ⇒ `METAAPI_SYMBOL` |
| البوت صامت | `TELEGRAM_CHAT_ID` لا يطابق المحادثة، أو لم يُسجَّل الـ webhook |
| `skipped: market closed` | الجمعة 21:00 ← الأحد 22:00 UTC |
| فلتر الحجم لا يؤثّر | الوسيط لا يرسل `tickVolume` ⇒ يُتخطّى عمداً |
