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
