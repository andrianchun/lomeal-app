let audioCtx = null;

export const initAudio = () => {
  try {
    if (!audioCtx) {
       audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {
    console.warn("AudioContext init blocked by browser:", e);
  }
};

export const playSoundEffect = (type, enabled) => {
    if (!enabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
    
    if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'timer') {
        // Tiga beep naik — harus kedengeran dari dapur sebelah, jadi lebih panjang
        // dan lebih keras dari 'click'. Dipakai saat timer masak habis.
        [0, 0.28, 0.56].forEach((offset, i) => {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g); g.connect(audioCtx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(880 + i * 220, now + offset);
          g.gain.setValueAtTime(0.0001, now + offset);
          g.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.22);
          o.start(now + offset);
          o.stop(now + offset + 0.24);
        });
        osc.disconnect(); gain.disconnect();
    } else if (type === 'swipe') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    }
  } catch (e) {
    console.warn("Sound effect playback blocked by browser:", e);
  }
};