/* Meditation Timer
 *
 * A self-contained React app (loaded via Babel standalone). All audio is
 * synthesized in real time with the Web Audio API, so the app has no binary
 * sound assets and works fully offline once the page is cached.
 *
 * Sound engines:
 *   - Binaural beats  : two detuned oscillators panned hard left/right.
 *   - Healing tones   : Solfeggio frequencies played as a soft sine drone.
 *   - Nature ambience : filtered noise shaped into rain / ocean / wind.
 *   - Bells           : additive FM-ish chime for start and end of a session.
 */

const { useState, useEffect, useRef, useCallback } = React;

/* ------------------------------------------------------------------ */
/* Audio engine                                                       */
/* ------------------------------------------------------------------ */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.nodes = [];       // active source nodes for the current ambience
    this.volume = 0.6;
  }

  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  // Create a looping noise buffer source. `type` controls the spectral colour.
  _noiseSource(type) {
    const ctx = this.ctx;
    const seconds = 4;
    const length = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    } else {
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  _fadeIn(gainNode, target, time = 1.2) {
    const now = this.ctx.currentTime;
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(target, now + time);
  }

  // Start a sound mode. Returns nothing; call stop() to tear down.
  start(mode, options) {
    this.ensureContext();
    this.stop();           // never stack two ambiences
    const ctx = this.ctx;

    if (mode === 'binaural') {
      const { carrier = 200, beat = 6 } = options;
      const merger = ctx.createChannelMerger(2);
      const gain = ctx.createGain();

      const left = ctx.createOscillator();
      const right = ctx.createOscillator();
      left.type = right.type = 'sine';
      left.frequency.value = carrier;
      right.frequency.value = carrier + beat;
      left.connect(merger, 0, 0);
      right.connect(merger, 0, 1);

      merger.connect(gain).connect(this.master);
      this._fadeIn(gain, 0.5);
      left.start();
      right.start();
      this.nodes.push(left, right, gain, merger);

    } else if (mode === 'healing') {
      const { freq = 528 } = options;
      const gain = ctx.createGain();
      // Fundamental + a quiet fifth for warmth.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 1.5;
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;

      osc.connect(gain);
      osc2.connect(g2).connect(gain);
      gain.connect(this.master);
      this._fadeIn(gain, 0.45);
      osc.start();
      osc2.start();
      this.nodes.push(osc, osc2, g2, gain);

    } else if (mode === 'nature') {
      const { ambience = 'rain' } = options;
      const gain = ctx.createGain();
      gain.connect(this.master);

      if (ambience === 'rain') {
        const src = this._noiseSource('white');
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1000;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 8000;
        src.connect(hp).connect(lp).connect(gain);
        src.start();
        this._fadeIn(gain, 0.7);
        this.nodes.push(src, hp, lp, gain);

      } else if (ambience === 'ocean') {
        const src = this._noiseSource('brown');
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 600;
        // Slow LFO swells the cutoff to mimic rolling waves.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.1;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 400;
        lfo.connect(lfoGain).connect(lp.frequency);
        src.connect(lp).connect(gain);
        src.start();
        lfo.start();
        this._fadeIn(gain, 1.5);
        this.nodes.push(src, lp, lfo, lfoGain, gain);

      } else { // wind
        const src = this._noiseSource('white');
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 500;
        bp.Q.value = 0.7;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.15;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 300;
        lfo.connect(lfoGain).connect(bp.frequency);
        src.connect(bp).connect(gain);
        src.start();
        lfo.start();
        this._fadeIn(gain, 1.5);
        this.nodes.push(src, bp, lfo, lfoGain, gain);
      }
    }
  }

  // Fade out and disconnect everything currently playing.
  stop() {
    if (!this.ctx || this.nodes.length === 0) return;
    const now = this.ctx.currentTime;
    const stopping = this.nodes;
    this.nodes = [];
    stopping.forEach((n) => {
      if (n.gain) {
        try {
          n.gain.cancelScheduledValues(now);
          n.gain.setValueAtTime(Math.max(n.gain.value, 0.0001), now);
          n.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        } catch (e) { /* not a gain node */ }
      }
    });
    setTimeout(() => {
      stopping.forEach((n) => {
        try { if (n.stop) n.stop(); } catch (e) {}
        try { n.disconnect(); } catch (e) {}
      });
    }, 500);
  }

  // A soft bell chime — used to mark the start and end of a session.
  bell() {
    this.ensureContext();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const partials = [
      { f: 440, g: 0.5, d: 3.0 },
      { f: 660, g: 0.3, d: 2.4 },
      { f: 880, g: 0.2, d: 1.8 },
      { f: 1320, g: 0.1, d: 1.2 },
    ];
    partials.forEach(({ f, g, d }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(g, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + d);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + d + 0.1);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Sound option metadata                                              */
/* ------------------------------------------------------------------ */

const BRAINWAVES = [
  { id: 'delta', label: 'Delta', beat: 2.5, desc: 'Deep sleep' },
  { id: 'theta', label: 'Theta', beat: 6, desc: 'Meditation' },
  { id: 'alpha', label: 'Alpha', beat: 10, desc: 'Relaxation' },
  { id: 'beta', label: 'Beta', beat: 18, desc: 'Focus' },
];

const SOLFEGGIO = [
  { id: 396, label: '396 Hz', desc: 'Release fear' },
  { id: 432, label: '432 Hz', desc: 'Harmony' },
  { id: 528, label: '528 Hz', desc: 'Transformation' },
  { id: 639, label: '639 Hz', desc: 'Connection' },
  { id: 741, label: '741 Hz', desc: 'Awakening' },
  { id: 852, label: '852 Hz', desc: 'Intuition' },
];

const AMBIENCES = [
  { id: 'rain', label: 'Rain', icon: '🌧️' },
  { id: 'ocean', label: 'Ocean', icon: '🌊' },
  { id: 'wind', label: 'Wind', icon: '🍃' },
];

const SOUND_MODES = [
  { id: 'off', label: 'Silent' },
  { id: 'binaural', label: 'Binaural' },
  { id: 'healing', label: 'Healing' },
  { id: 'nature', label: 'Nature' },
];

const DURATIONS = [3, 5, 10, 15, 20, 30, 45, 60];

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function ProgressRing({ progress, children }) {
  const size = 280;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div className="ring-wrap">
      <svg width={size} height={size} className="ring">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="url(#ringGrad)" strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s linear' }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

function Segmented({ options, value, onChange, getLabel }) {
  return (
    <div className="segmented">
      {options.map((opt) => {
        const id = opt.id !== undefined ? opt.id : opt;
        const label = getLabel ? getLabel(opt) : (opt.label || opt);
        return (
          <button
            key={id}
            className={'seg-btn' + (id === value ? ' active' : '')}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function App() {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  const [duration, setDuration] = useState(10);        // minutes
  const [remaining, setRemaining] = useState(10 * 60); // seconds
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const [soundMode, setSoundMode] = useState('nature');
  const [brainwave, setBrainwave] = useState('theta');
  const [solfeggio, setSolfeggio] = useState(528);
  const [ambience, setAmbience] = useState('rain');
  const [volume, setVolume] = useState(0.6);

  const intervalRef = useRef(null);

  // Keep the countdown in sync when the user changes the duration (and the
  // timer isn't running).
  useEffect(() => {
    if (!running) {
      setRemaining(duration * 60);
      setFinished(false);
    }
  }, [duration]); // eslint-disable-line

  useEffect(() => {
    engine.setVolume(volume);
  }, [volume]); // eslint-disable-line

  const optionsForMode = useCallback(() => {
    if (soundMode === 'binaural') {
      const bw = BRAINWAVES.find((b) => b.id === brainwave);
      return { carrier: 200, beat: bw ? bw.beat : 6 };
    }
    if (soundMode === 'healing') return { freq: solfeggio };
    if (soundMode === 'nature') return { ambience };
    return {};
  }, [soundMode, brainwave, solfeggio, ambience]);

  // Restart the ambience live if the user tweaks the sound while running.
  useEffect(() => {
    if (running && soundMode !== 'off') {
      engine.start(soundMode, optionsForMode());
    }
    if (running && soundMode === 'off') {
      engine.stop();
    }
  }, [soundMode, brainwave, solfeggio, ambience]); // eslint-disable-line

  const tick = useCallback(() => {
    setRemaining((r) => {
      if (r <= 1) {
        clearInterval(intervalRef.current);
        setRunning(false);
        setFinished(true);
        engine.stop();
        engine.bell();
        return 0;
      }
      return r - 1;
    });
  }, [engine]);

  const start = () => {
    engine.ensureContext();
    if (finished || remaining === 0) {
      setRemaining(duration * 60);
      setFinished(false);
    }
    engine.bell();
    if (soundMode !== 'off') {
      // Slight delay so the start bell isn't masked by the drone fade-in.
      setTimeout(() => engine.start(soundMode, optionsForMode()), 250);
    }
    setRunning(true);
    intervalRef.current = setInterval(tick, 1000);
  };

  const pause = () => {
    clearInterval(intervalRef.current);
    setRunning(false);
    engine.stop();
  };

  const reset = () => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setFinished(false);
    setRemaining(duration * 60);
    engine.stop();
  };

  useEffect(() => () => {
    clearInterval(intervalRef.current);
    engine.stop();
  }, []); // eslint-disable-line

  const total = duration * 60;
  const progress = total > 0 ? (total - remaining) / total : 0;

  return (
    <div className="app">
      <header className="header">
        <h1>Meditation</h1>
        <p className="subtitle">Breathe. Be still. Begin.</p>
      </header>

      <ProgressRing progress={progress}>
        <div className={'time' + (running ? ' pulsing' : '')}>
          {formatTime(remaining)}
        </div>
        <div className="time-label">
          {finished ? 'Complete' : running ? 'remaining' : `${duration} min`}
        </div>
      </ProgressRing>

      <div className="controls">
        {!running ? (
          <button className="btn primary" onClick={start}>
            {finished ? 'Again' : remaining < total ? 'Resume' : 'Begin'}
          </button>
        ) : (
          <button className="btn" onClick={pause}>Pause</button>
        )}
        <button className="btn ghost" onClick={reset}>Reset</button>
      </div>

      <section className="panel">
        <label className="panel-label">Duration</label>
        <Segmented
          options={DURATIONS}
          value={duration}
          onChange={(d) => !running && setDuration(d)}
          getLabel={(d) => `${d}`}
        />
      </section>

      <section className="panel">
        <label className="panel-label">Sound</label>
        <Segmented options={SOUND_MODES} value={soundMode} onChange={setSoundMode} />

        {soundMode === 'binaural' && (
          <div className="sub">
            <Segmented
              options={BRAINWAVES}
              value={brainwave}
              onChange={setBrainwave}
              getLabel={(b) => b.label}
            />
            <p className="hint">
              {BRAINWAVES.find((b) => b.id === brainwave).desc} ·{' '}
              {BRAINWAVES.find((b) => b.id === brainwave).beat} Hz beat ·
              {' '}use headphones
            </p>
          </div>
        )}

        {soundMode === 'healing' && (
          <div className="sub">
            <Segmented
              options={SOLFEGGIO}
              value={solfeggio}
              onChange={setSolfeggio}
              getLabel={(s) => s.label}
            />
            <p className="hint">{SOLFEGGIO.find((s) => s.id === solfeggio).desc}</p>
          </div>
        )}

        {soundMode === 'nature' && (
          <div className="sub">
            <Segmented
              options={AMBIENCES}
              value={ambience}
              onChange={setAmbience}
              getLabel={(a) => `${a.icon} ${a.label}`}
            />
          </div>
        )}
      </section>

      <section className="panel">
        <label className="panel-label">Volume</label>
        <input
          type="range" min="0" max="1" step="0.01" value={volume}
          className="slider"
          onChange={(e) => setVolume(parseFloat(e.target.value))}
        />
      </section>

      <footer className="footer">All sounds generated live · works offline</footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mount + styles                                                     */
/* ------------------------------------------------------------------ */

const STYLE = `
  body {
    background:
      radial-gradient(1200px 600px at 50% -10%, #1f2347 0%, transparent 60%),
      radial-gradient(900px 500px at 90% 110%, #2a1f47 0%, transparent 55%),
      #07070d;
    color: #e8e8f0;
    min-height: 100vh;
  }
  .app {
    max-width: 460px;
    margin: 0 auto;
    padding: 32px 20px 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 22px;
  }
  .header { text-align: center; }
  .header h1 {
    font-size: 28px; font-weight: 600; letter-spacing: 0.5px;
    background: linear-gradient(120deg, #34d399, #8b5cf6);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .subtitle { color: #8a8aa0; font-size: 14px; margin-top: 4px; }

  .ring-wrap { position: relative; width: 280px; height: 280px; }
  .ring-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
  }
  .time {
    font-size: 52px; font-weight: 300; font-variant-numeric: tabular-nums;
    letter-spacing: 1px;
  }
  .time.pulsing { animation: breathe 6s ease-in-out infinite; }
  @keyframes breathe {
    0%, 100% { opacity: 0.65; transform: scale(0.98); }
    50%      { opacity: 1;    transform: scale(1.02); }
  }
  .time-label { color: #8a8aa0; font-size: 13px; text-transform: lowercase; letter-spacing: 1px; }

  .controls { display: flex; gap: 12px; }
  .btn {
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(255,255,255,0.04);
    color: #e8e8f0;
    padding: 13px 30px; border-radius: 999px;
    font-size: 15px; font-weight: 500; cursor: pointer;
    transition: transform 0.12s ease, background 0.2s ease;
  }
  .btn:hover { background: rgba(255,255,255,0.09); }
  .btn:active { transform: scale(0.96); }
  .btn.primary {
    background: linear-gradient(120deg, #34d399, #8b5cf6);
    border: none; color: #0b0b14; font-weight: 600;
  }
  .btn.ghost { background: transparent; }

  .panel { width: 100%; display: flex; flex-direction: column; gap: 10px; }
  .panel-label {
    font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px;
    color: #6f6f88;
  }
  .segmented {
    display: flex; flex-wrap: wrap; gap: 8px;
  }
  .seg-btn {
    flex: 1 1 auto; min-width: 56px;
    padding: 10px 12px; border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(255,255,255,0.03);
    color: #c8c8d8; font-size: 14px; cursor: pointer;
    transition: all 0.18s ease; white-space: nowrap;
  }
  .seg-btn:hover { background: rgba(255,255,255,0.07); }
  .seg-btn.active {
    background: rgba(139,92,246,0.22);
    border-color: rgba(139,92,246,0.7);
    color: #fff;
  }
  .sub { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .hint { color: #7a7a94; font-size: 12.5px; }

  .slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 6px; border-radius: 999px;
    background: rgba(255,255,255,0.12); outline: none;
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 20px; height: 20px; border-radius: 50%;
    background: linear-gradient(120deg, #34d399, #8b5cf6);
    cursor: pointer; border: 2px solid #07070d;
  }
  .slider::-moz-range-thumb {
    width: 20px; height: 20px; border-radius: 50%;
    background: #8b5cf6; cursor: pointer; border: 2px solid #07070d;
  }
  .footer { color: #50506a; font-size: 12px; margin-top: 8px; text-align: center; }
`;

const styleTag = document.createElement('style');
styleTag.textContent = STYLE;
document.head.appendChild(styleTag);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
