/** Annex-B start codes. */
export const ANNEXB_START_3 = new Uint8Array([0, 0, 1]);
export const ANNEXB_START_4 = new Uint8Array([0, 0, 0, 1]);

export type AnnexBNal = {
  type: number;
  data: Uint8Array;
  keyFrame: boolean;
};

function isStartCode(input: Uint8Array, index: number): number {
  if (index + 2 >= input.length) return 0;
  if (input[index] === 0 && input[index + 1] === 0) {
    if (input[index + 2] === 1) return 3;
    if (index + 3 < input.length && input[index + 2] === 0 && input[index + 3] === 1) return 4;
  }
  return 0;
}

/** Split Annex-B byte stream into NAL units (start-code delimited). */
export function splitAnnexBNals(input: Uint8Array): AnnexBNal[] {
  const nals: AnnexBNal[] = [];
  let i = 0;
  while (i < input.length) {
    const startLen = isStartCode(input, i);
    if (!startLen) {
      i++;
      continue;
    }
    const nalStart = i + startLen;
    i = nalStart;
    while (i < input.length && !isStartCode(input, i)) {
      i++;
    }
    if (nalStart >= i) continue;
    const data = input.subarray(nalStart, i);
    const type = data[0]! & 0x1f;
    nals.push({
      type,
      data,
      keyFrame: type === 5 || type === 7 || type === 8,
    });
  }
  return nals;
}

/** Index of last Annex-B start code in buffer, or 0. */
export function lastAnnexBStartIndex(input: Uint8Array): number {
  for (let i = input.length - 4; i >= 0; i--) {
    if (isStartCode(input, i)) return i;
  }
  return 0;
}

/** Build avc1 codec string from SPS NAL (RFC 6381). */
export function avc1CodecStringFromSps(sps: Uint8Array): string {
  if (sps.length < 4) return "avc1.42C01E";
  const profile = sps[1]!.toString(16).padStart(2, "0").toUpperCase();
  const compat = sps[2]!.toString(16).padStart(2, "0").toUpperCase();
  const level = sps[3]!.toString(16).padStart(2, "0").toUpperCase();
  return `avc1.${profile}${compat}${level}`;
}

/** Extract SPS/PPS from accumulated NAL list. */
export function extractParameterSets(nals: AnnexBNal[]): { sps: Uint8Array | null; pps: Uint8Array | null } {
  let sps: Uint8Array | null = null;
  let pps: Uint8Array | null = null;
  for (const nal of nals) {
    if (nal.type === 7) sps = nal.data;
    if (nal.type === 8) pps = nal.data;
  }
  return { sps, pps };
}

/** AVCC length-prefixed sample for MSE (future fMP4 path). */
export function annexBNalToAvccSample(nal: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + nal.length);
  out[0] = (nal.length >>> 24) & 0xff;
  out[1] = (nal.length >>> 16) & 0xff;
  out[2] = (nal.length >>> 8) & 0xff;
  out[3] = nal.length & 0xff;
  out.set(nal, 4);
  return out;
}
