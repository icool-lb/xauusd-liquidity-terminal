// ============================================================
// نظام الصوت والإعلام الصوتي
// قيد المتصفح: الصوت يشتغل بعد أول لمسة للمستخدم فقط، ووالصفحة مفتوحة
// ============================================================

let actx: AudioContext | null = null;
let voiceOn = true;
let unlocked = false;

// يجب استدعاؤها من تفاعل مستخدم (نقرة/لمسة) — نستدعيها تلقائياً عند أول نقرة في الصفحة
export function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (actx.state === 'suspended') void actx.resume();
    unlocked = true;
  } catch { /* المتصفح لا يدعم الصوت */ }
}

export function setVoice(on: boolean) { voiceOn = on; if (!on) try { speechSynthesis.cancel(); } catch { /* */ } }
export function isVoiceOn() { return voiceOn; }
export function isAudioUnlocked() { return unlocked; }

// نغمة تنبيه — تتخطى بهدوء إن لم يُفتح الصوت بعد (لن تفشل الصفحة)
export function beep(freq = 880, dur = 0.35, vol = 0.08) {
  if (!actx || actx.state !== 'running') return;
  try {
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.connect(gain); gain.connect(actx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    osc.stop(actx.currentTime + dur);
  } catch { /* */ }
}

// نغمة مميزة للإشارات: نغمتان متتاليتان
export function signalChime() {
  beep(880, 0.25);
  setTimeout(() => beep(1174, 0.4), 220);
}

let arVoice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    arVoice = vs.find((v) => v.lang.startsWith('ar')) ?? vs.find((v) => /arabic/i.test(v.name)) ?? null;
  } catch { /* */ }
}
if (typeof speechSynthesis !== 'undefined') {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

// نطق تنبيه عربي — يقطع النطق السابق لأن التنبيهات أولوية
export function speak(text: string) {
  if (!voiceOn || !unlocked) return;
  try {
    speechSynthesis.cancel();
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').replace(/[🔔⚡🐋🔮🧭💰➡️]/g, '').trim().slice(0, 220);
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'ar-SA';
    if (arVoice) u.voice = arVoice;
    u.rate = 1.02;
    u.pitch = 1;
    speechSynthesis.speak(u);
  } catch { /* */ }
}

// إعلام موحّد: نغمة + نطق مختصر
export function announce(shortText: string, chime = false) {
  if (chime) signalChime(); else beep(880);
  speak(shortText);
}
