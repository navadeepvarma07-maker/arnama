// Sound utility — uses a singleton AudioContext.
// Reusing one context prevents "too many contexts" errors and
// keeps the audio pipeline warm (fixes intermittent sound).

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AC();
    } catch {
      return null;
    }
  }

  // Browsers suspend AudioContext until a user gesture.
  // Resume lazily — silent fail if it can't.
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Two-tone notification chime */
export function playDing() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.15, now + i * 0.08 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.08);
    osc.stop(now + i * 0.08 + 0.35);
  });
}

/** Short rising pop for UI interactions */
export function playPop() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.exponentialRampToValueAtTime(1400, now + 0.06);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.09);
}