// Web Audio ambient engine for SIOS
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let drones: OscillatorNode[] = [];
let running = false;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function startAmbient() {
  if (running) return;
  const ac = getCtx();
  if (ac.state === 'suspended') ac.resume();

  masterGain = ac.createGain();
  masterGain.gain.setValueAtTime(0, ac.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.06, ac.currentTime + 4);
  masterGain.connect(ac.destination);

  // Deep sub drone
  const freqs = [38, 41, 76, 82, 152];
  drones = freqs.map((f, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter();

    osc.type = i < 2 ? 'sine' : 'triangle';
    osc.frequency.value = f;

    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.Q.value = 0.8;

    gain.gain.value = i < 2 ? 0.7 : 0.15;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain!);
    osc.start();
    return osc;
  });

  // Subtle LFO modulation on first drone pitch
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 0.12;
  lfoGain.gain.value = 0.4;
  lfo.connect(lfoGain);
  lfoGain.connect(drones[0].frequency);
  lfo.start();

  running = true;
}

export function intensifyAmbient() {
  if (!masterGain || !ctx) return;
  masterGain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 2);
  drones.forEach((d, i) => {
    d.frequency.linearRampToValueAtTime(d.frequency.value * 1.02, ctx!.currentTime + 3);
  });
}

export function resetAmbient() {
  if (!masterGain || !ctx) return;
  masterGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2);
}

export function stopAmbient() {
  if (!masterGain || !ctx) return;
  masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
  setTimeout(() => {
    drones.forEach(d => d.stop());
    drones = [];
    running = false;
  }, 2000);
}

export function playTransitionTone() {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ac.currentTime + 0.3);
  gain.gain.setValueAtTime(0.12, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.2);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 1.3);
}
