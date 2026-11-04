import { settings } from './settings';

/**
 * Sonidos cortos sintetizados con Web Audio (nada que descargar: funcionan sin
 * conexión). Se pueden quitar en los ajustes.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!settings.sonido) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', volume = 0.18): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export const sfx = {
  /** Respuesta correcta: dos notas que suben. */
  ok: () => (tone(660, 0, 0.14, 'triangle'), tone(990, 0.09, 0.22, 'triangle')),
  /** Respuesta incorrecta: grave y corto. */
  mal: () => (tone(220, 0, 0.18, 'square', 0.08), tone(165, 0.1, 0.25, 'square', 0.08)),
  /** Toque en un botón. */
  toque: () => tone(880, 0, 0.05, 'sine', 0.06),
  /** Fin de lección, cofre, logro: arpegio. */
  fanfarria: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.16)),
  /** Racha: chispazo. */
  racha: () => [392, 523, 784].forEach((f, i) => tone(f, i * 0.07, 0.25, 'sawtooth', 0.07)),
  /** El gato: maullido cuántico (sube y baja). */
  miau: () => {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.linearRampToValueAtTime(900, t + 0.15);
    osc.frequency.linearRampToValueAtTime(420, t + 0.45);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.55);
  },
};
