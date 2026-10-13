# منصة سيولة الذهب — XAUUSD Liquidity Terminal

لكل ما يخصّ الاستراتيجيات والتنبيهات وTelegram والباك-تيست: استعمل المهارة **gold-desk** (`.claude/skills/gold-desk`).

- محرّك واحد `src/lib/engine.ts` للواجهة والخادم. لا منطق تداول مكرّر في `api/` أو المكوّنات.
- الإشارات على الشموع المغلقة فقط؛ الحجم من `tickVolume`.
- اللوحات الثانوية داخل `<Fold>`؛ اللوحات التي تُطلق تنبيهات (الأخبار، الحيتان، التوقيت) بـ `keep` كي تبقى تعمل مطويّة.
- استيرادات `api/` بامتداد `.js` (ESM على Vercel).
- قبل الدفع: `npx tsc -b && npx tsc -p tsconfig.api.json && node scripts/test-server.mjs && npm run build`.
