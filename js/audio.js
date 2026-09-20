let ctx;

function getCtx() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function tone(ac, freq, startTime, duration, type, gainPeak) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.03);
}

// Тихий двойной "клик" при удачной стыковке кусочков.
export function playSnap() {
  try {
    const ac = getCtx();
    if (!ac) return;
    const t = ac.currentTime;
    tone(ac, 660, t, 0.09, "sine", 0.12);
    tone(ac, 900, t + 0.035, 0.08, "sine", 0.08);
  } catch {
    /* звук — не критичная часть игры */
  }
}

// --- Платные эффекты стыковки из магазина ------------------------------

// Пузырьки — короткий восходящий "поп".
export function playBubble() {
  try {
    const ac = getCtx();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.09);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  } catch {
    /* звук — не критичная часть игры */
  }
}

// Колокольчик — высокий тон с долгим затуханием и лёгким обертоном.
export function playBell() {
  try {
    const ac = getCtx();
    if (!ac) return;
    const t = ac.currentTime;
    tone(ac, 1318.5, t, 0.7, "sine", 0.14);
    tone(ac, 2637, t, 0.5, "sine", 0.05);
  } catch {
    /* звук — не критичная часть игры */
  }
}

// Пёрдёж/отрыжка — пилообразный осциллятор с падающей частотой и лёгким
// дрожанием тона (LFO по частоте) для комичного "буээ" без внешних файлов.
export function playFart() {
  try {
    const ac = getCtx();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.35);

    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.value = 26;
    lfoGain.gain.value = 16;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);

    osc.connect(gain);
    gain.connect(ac.destination);

    lfo.start(t);
    osc.start(t);
    lfo.stop(t + 0.42);
    osc.stop(t + 0.42);
  } catch {
    /* звук — не критичная часть игры */
  }
}

// Короткая победная мелодия при полной сборке пазла.
export function playWin() {
  try {
    const ac = getCtx();
    if (!ac) return;
    const t = ac.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => tone(ac, freq, t + i * 0.11, 0.3, "triangle", 0.14));
  } catch {
    /* звук — не критичная часть игры */
  }
}
