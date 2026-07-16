export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function pcm16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-1, Math.min(1, pcm[i] / 32768));
  return out;
}

export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  let o = 0;
  let i = 0;
  while (o < outLen) {
    const nextI = Math.floor((o + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (; i < nextI && i < input.length; i++) {
      sum += input[i];
      count++;
    }
    out[o] = count ? sum / count : 0;
    o++;
  }
  return out;
}

export function float32ToPcm16Bytes(f: Float32Array): Uint8Array {
  const out = new Uint8Array(f.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    const v = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, v, true);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

type PlaybackState = {
  nextStartTime: number;
  sources: Set<AudioBufferSourceNode>;
};

const playbackState = new WeakMap<AudioContext, PlaybackState>();

function stateFor(ctx: AudioContext): PlaybackState {
  let state = playbackState.get(ctx);
  if (!state) {
    state = { nextStartTime: ctx.currentTime, sources: new Set() };
    playbackState.set(ctx, state);
  }
  return state;
}

export function playPcm24kBase64(ctx: AudioContext | null, b64: string) {
  if (!ctx) return;
  const bytes = base64ToBytes(b64);
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const f32 = pcm16ToFloat32(pcm);
  const buf = ctx.createBuffer(1, f32.length, 24000);
  buf.getChannelData(0).set(f32);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  const state = stateFor(ctx);
  const startAt = Math.max(ctx.currentTime + 0.02, state.nextStartTime);
  state.nextStartTime = startAt + buf.duration;
  state.sources.add(src);
  src.onended = () => state.sources.delete(src);
  src.start(startAt);
}

export function clearPcm24kPlayback(ctx: AudioContext | null) {
  if (!ctx) return;
  const state = stateFor(ctx);
  for (const source of state.sources) {
    try {
      source.stop();
    } catch {}
  }
  state.sources.clear();
  state.nextStartTime = ctx.currentTime;
}

export function speakStaticScript(text: string) {
  if (!("speechSynthesis" in window) || !text.trim()) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 1.05;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}
