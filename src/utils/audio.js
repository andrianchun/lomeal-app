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
    } else if (type === 'swipe') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'timerStart') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'timerTick') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'timerEnd') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(800, now + 0.2);
        osc.frequency.setValueAtTime(1000, now + 0.4);
        osc.frequency.setValueAtTime(1200, now + 0.6);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.linearRampToValueAtTime(0.6, now + 1.5);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 2);
        osc.start(now);
        osc.stop(now + 2.0);
    }
  } catch (e) {
    console.warn("Sound effect playback blocked by browser:", e);
  }
};