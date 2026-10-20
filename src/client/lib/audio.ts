// Audio para "Nombres al revés": invertir, reproducir y grabar con el micrófono del celular.

let ctx: AudioContext | null = null;

/** Hay que llamarlo desde un toque del usuario (Safari no deja reproducir sin interacción). */
export function audioContext(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') void ctx.resume();
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

/** Reproduce un buffer; devuelve una función para cortarlo. */
export function play(buf: AudioBuffer, onEnd?: () => void): () => void {
  const ac = audioContext();
  const node = ac.createBufferSource();
  node.buffer = buf;
  node.connect(ac.destination);
  node.onended = () => onEnd?.();
  node.start();
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

export interface Recording {
  stop: () => Promise<AudioBuffer>;
  cancel: () => void;
}

export async function startRecording(): Promise<Recording> {
  audioContext();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];
  const mimeType = types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t));
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise<AudioBuffer>((resolve, reject) => {
        rec.onstop = async () => {
          release();
          try {
            const blob = new Blob(chunks, { type: rec.mimeType || mimeType });
            resolve(await decode(await blob.arrayBuffer()));
          } catch (e) {
            reject(e);
          }
        };
        rec.stop();
      }),
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* nada */
      }
      release();
    }
  };
}
