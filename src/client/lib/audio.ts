// Audio para "Nombres al revés": invertir, reproducir y grabar con el micrófono del celular.
//
// Detalles que importan en celulares:
// - Se graba el audio crudo (PCM) directamente desde Web Audio, sin MediaRecorder: así no
//   dependemos de qué formato (webm/mp4) sabe decodificar cada navegador.
// - En iPhone, el audio web respeta el modo silencio y, mientras el micrófono está abierto,
//   iOS manda el sonido al auricular de llamadas. Con navigator.audioSession (Safari 16.4+)
//   pedimos "playback" para que suene por el parlante aunque el celular esté en silencio.
// - La grabación se normaliza (se le sube el volumen) y se recortan los silencios de las puntas.

let ctx: AudioContext | null = null;

type SessionType = 'auto' | 'playback' | 'play-and-record' | 'ambient';
function setSession(type: SessionType) {
  try {
    const s = (navigator as any).audioSession;
    if (s && s.type !== type) s.type = type;
  } catch {
    /* navegador sin audioSession */
  }
}

/** Hay que llamarlo desde un toque del usuario (Safari no deja reproducir sin interacción). */
export function audioContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    setSession('playback');
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (ctx.state !== 'running') void ctx.resume();
  return ctx;
}

export async function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  return audioContext().decodeAudioData(data.slice(0));
}

export function reversed(buf: AudioBuffer): AudioBuffer {
  const ac = audioContext();
  const out = ac.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return out;
}

/** Reproduce un buffer por el parlante; devuelve una función para cortarlo. */
export function play(buf: AudioBuffer, onEnd?: () => void): () => void {
  setSession('playback');
  const ac = audioContext();
  const node = ac.createBufferSource();
  node.buffer = buf;
  node.connect(ac.destination);
  node.onended = () => onEnd?.();
  const start = () => {
    try {
      node.start();
    } catch {
      /* ya arrancó */
    }
  };
  if (ac.state === 'running') start();
  else ac.resume().then(start, start);
  return () => {
    try {
      node.stop();
    } catch {
      /* ya terminó */
    }
  };
}

/** Alturas normalizadas (0..1) para dibujar la onda. */
export function peaks(buf: AudioBuffer, bars = 40): number[] {
  const data = buf.getChannelData(0);
  const size = Math.floor(data.length / bars) || 1;
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    let max = 0;
    for (let i = b * size; i < Math.min(data.length, (b + 1) * size); i++) max = Math.max(max, Math.abs(data[i]));
    out.push(max);
  }
  const top = Math.max(...out, 0.01);
  return out.map((v) => v / top);
}

/** Recorta silencios de las puntas y lleva el pico a ~90% del volumen. */
export function tidy(samples: Float32Array, sampleRate: number): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 1e-4) return samples;
  const threshold = peak * 0.06;
  let start = 0;
  let end = samples.length - 1;
  while (start < end && Math.abs(samples[start]) < threshold) start++;
  while (end > start && Math.abs(samples[end]) < threshold) end--;
  const pad = Math.floor(sampleRate * 0.08);
  start = Math.max(0, start - pad);
  end = Math.min(samples.length - 1, end + pad);
  const gain = Math.min(12, 0.9 / peak);
  const out = new Float32Array(end - start + 1);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, samples[start + i] * gain));
  return out;
}

export interface Recording {
  stop: () => Promise<AudioBuffer>;
  cancel: () => void;
}

export async function startRecording(): Promise<Recording> {
  const ac = audioContext();
  setSession('play-and-record');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // Sin cancelación de eco: en iPhone activa el modo "llamada" y baja/desvía el audio.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }
    });
  } catch (e) {
    setSession('playback');
    throw e;
  }
  if (ac.state !== 'running') await ac.resume();

  const source = ac.createMediaStreamSource(stream);
  const proc = ac.createScriptProcessor(4096, 1, 1);
  const mute = ac.createGain();
  mute.gain.value = 0; // el procesador tiene que estar conectado para funcionar, pero sin que suene
  const chunks: Float32Array[] = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(proc);
  proc.connect(mute);
  mute.connect(ac.destination);

  const release = () => {
    proc.onaudioprocess = null;
    try {
      source.disconnect();
      proc.disconnect();
      mute.disconnect();
    } catch {
      /* ya desconectado */
    }
    stream.getTracks().forEach((t) => t.stop());
    setSession('playback');
  };

  return {
    stop: async () => {
      // Esperar un instante para no perder el último pedazo
      await new Promise((r) => setTimeout(r, 120));
      release();
      const total = chunks.reduce((n, c) => n + c.length, 0);
      if (total < ac.sampleRate * 0.2) throw new Error('Grabación muy corta');
      const all = new Float32Array(total);
      let off = 0;
      for (const c of chunks) {
        all.set(c, off);
        off += c.length;
      }
      const clean = tidy(all, ac.sampleRate);
      const buf = ac.createBuffer(1, clean.length, ac.sampleRate);
      buf.getChannelData(0).set(clean);
      return buf;
    },
    cancel: release
  };
}
