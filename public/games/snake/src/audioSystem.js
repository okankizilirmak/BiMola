export function createAudioSystem() {
  let audioCtx = null;
  let masterGain = null;
  let sfxGain = null;
  let bgmGain = null;

  let isMuted = typeof window !== "undefined" && window.localStorage
    ? window.localStorage.getItem("snake_audio_muted") === "true"
    : false;
  let bgmEnabled = typeof window !== "undefined" && window.localStorage
    ? window.localStorage.getItem("snake_audio_bgm") !== "false"
    : true;
  let volume = typeof window !== "undefined" && window.localStorage && window.localStorage.getItem("snake_audio_volume") !== null
    ? Number(window.localStorage.getItem("snake_audio_volume"))
    : 0.7;

  let bgmTimer = null;
  let bgmStep = 0;

  const BGM_NOTES = [
    130.81, 155.56, 196.00, 233.08, // C3, Eb3, G3, Bb3
    261.63, 311.13, 392.00, 466.16  // C4, Eb4, G4, Bb4
  ];

  function initContext() {
    if (typeof window === "undefined") return;
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();
      masterGain = audioCtx.createGain();
      sfxGain = audioCtx.createGain();
      bgmGain = audioCtx.createGain();

      sfxGain.connect(masterGain);
      bgmGain.connect(masterGain);
      masterGain.connect(audioCtx.destination);

      updateVolumes();
      if (bgmEnabled) {
        startBGM();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function updateVolumes() {
    if (!masterGain) return;
    masterGain.gain.value = isMuted ? 0 : Math.max(0, Math.min(1, volume));
    bgmGain.gain.value = bgmEnabled ? 0.18 : 0;
  }

  function playToneSequence(notes, type = "sine", durationPerNote = 0.05, gainValue = 0.3) {
    if (!audioCtx || isMuted) return;
    try {
      const now = audioCtx.currentTime;
      notes.forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + index * durationPerNote);

        noteGain.gain.setValueAtTime(gainValue, now + index * durationPerNote);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + (index + 1) * durationPerNote);

        osc.connect(noteGain);
        noteGain.connect(sfxGain);
        osc.start(now + index * durationPerNote);
        osc.stop(now + (index + 1) * durationPerNote);
      });
    } catch (_) {}
  }

  function playEatSound(tier = "normal") {
    if (!audioCtx || isMuted) return;
    if (tier === "gold") {
      playToneSequence([523.25, 659.25, 783.99, 1046.50], "triangle", 0.05, 0.35);
    } else if (tier === "tier2") {
      playToneSequence([523.25, 659.25, 783.99], "sine", 0.05, 0.3);
    } else {
      playToneSequence([523.25, 659.25], "sine", 0.05, 0.25);
    }
  }

  function playHighScoreSound() {
    if (!audioCtx || isMuted) return;
    try {
      playToneSequence([523.25, 659.25, 783.99, 1046.50, 1318.51], "triangle", 0.06, 0.4);
    } catch (_) {}
  }

  function playPoisonSound() {
    if (!audioCtx || isMuted) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (_) {}
  }

  function playTurnSound() {
    if (!audioCtx || isMuted) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(850, now);
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.015);
    } catch (_) {}
  }

  function playShieldGainSound() {
    if (!audioCtx || isMuted) return;
    try {
      playToneSequence([440, 659.25, 880], "triangle", 0.06, 0.35);
    } catch (_) {}
  }

  function playShieldExplosion(isLocal = true) {
    if (!audioCtx || isMuted) return;
    try {
      const now = audioCtx.currentTime;
      const mult = isLocal ? 1.0 : 0.35;

      const bufferSize = Math.floor(audioCtx.sampleRate * 0.15);
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2000, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.15);

      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.4 * mult, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(sfxGain);

      const subOsc = audioCtx.createOscillator();
      const subGain = audioCtx.createGain();
      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(140, now);
      subOsc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      subGain.gain.setValueAtTime(0.5 * mult, now);
      subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      subOsc.connect(subGain);
      subGain.connect(sfxGain);

      noise.start(now);
      subOsc.start(now);
      noise.stop(now + 0.15);
      subOsc.stop(now + 0.15);
    } catch (_) {}
  }

  function playBoostSound() {
    if (!audioCtx || isMuted) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.12);
      g.gain.setValueAtTime(0.15, now);
      g.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (_) {}
  }

  function playDieSound() {
    if (!audioCtx || isMuted) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.4);
      g.gain.setValueAtTime(0.4, now);
      g.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch (_) {}
  }

  function playRivalDieSound() {
    if (!audioCtx || isMuted) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
      g.gain.setValueAtTime(0.15, now);
      g.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (_) {}
  }

  function startBGM() {
    if (bgmTimer) return;
    bgmTimer = setInterval(() => {
      if (!audioCtx || isMuted || !bgmEnabled) return;
      try {
        const now = audioCtx.currentTime;
        const freq = BGM_NOTES[bgmStep % BGM_NOTES.length];
        bgmStep++;

        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0.04, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(g);
        g.connect(bgmGain);
        osc.start(now);
        osc.stop(now + 0.12);
      } catch (_) {}
    }, 180);
  }

  function stopBGM() {
    if (bgmTimer) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
  }

  function setMuted(muted) {
    isMuted = Boolean(muted);
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("snake_audio_muted", String(isMuted));
    }
    updateVolumes();
  }

  function setBgmEnabled(enabled) {
    bgmEnabled = Boolean(enabled);
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("snake_audio_bgm", String(bgmEnabled));
    }
    updateVolumes();
    if (bgmEnabled) {
      startBGM();
    } else {
      stopBGM();
    }
  }

  function setVolume(vol) {
    volume = Math.max(0, Math.min(1, Number(vol)));
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("snake_audio_volume", String(volume));
    }
    updateVolumes();
  }

  return {
    initContext,
    playEatSound,
    playHighScoreSound,
    playPoisonSound,
    playTurnSound,
    playShieldGainSound,
    playShieldExplosion,
    playBoostSound,
    playDieSound,
    playRivalDieSound,
    startBGM,
    stopBGM,
    close: () => { stopBGM(); audioCtx?.close(); audioCtx = null; },
    setMuted,
    setBgmEnabled,
    setVolume,
    getState: () => ({ isMuted, bgmEnabled, volume })
  };
}
