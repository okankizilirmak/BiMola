// Küçük WebAudio efektleri; ses dosyası indirilmez. Bağlam ilk kullanıcı etkileşiminde açılır.
export function createAudio() {
  let context = null, enabled = true;
  const ready = () => {
    if (!enabled) return null;
    try { context ??= new AudioContext(); if (context.state === 'suspended') context.resume(); return context; } catch { return null; }
  };
  function tone(freq, duration = .12, {type = 'sine', gain = .08, slide = 0, delay = 0} = {}) {
    const ctx = ready(); if (!ctx) return;
    const t = ctx.currentTime + delay, osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + duration);
    amp.gain.setValueAtTime(gain, t); amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(amp).connect(ctx.destination); osc.start(t); osc.stop(t + duration + .02);
  }
  return {
    unlock: ready,
    get enabled() { return enabled; },
    set enabled(value) { enabled = value; if (!value) context?.suspend?.(); },
    select: () => tone(660, .06, {type: 'triangle', gain: .05}),
    tick: () => tone(1200, .04, {type: 'square', gain: .025}),
    correct: streak => { tone(523, .12, {type: 'triangle'}); tone(784 + Math.min(streak, 5) * 40, .2, {type: 'triangle', delay: .1}); },
    wrong: () => { tone(140, .35, {type: 'sawtooth', gain: .07, slide: -80, delay: .6}); },
    close() { try { context?.close(); } catch { /* zaten kapalı */ } context = null; },
  };
}
