import { describe, expect, it } from "vitest";
import { avc1CodecStringFromSps, splitAnnexBNals } from "../src/wire/h264-annexb.js";

describe("Annex-B wire", () => {
  it("splits NAL units on 4-byte start codes", () => {
    const sps = new Uint8Array([0x67, 0x64, 0x00, 0x1f, 0xac]);
    const pps = new Uint8Array([0x68, 0xeb]);
    const chunk = new Uint8Array([
      0, 0, 0, 1, ...sps,
      0, 0, 0, 1, ...pps,
    ]);
    const nals = splitAnnexBNals(chunk);
    expect(nals.length).toBe(2);
    expect(nals[0]?.type).toBe(7);
    expect(nals[1]?.type).toBe(8);
  });

  it("builds avc1 codec string from SPS", () => {
    const sps = new Uint8Array([0x67, 0x64, 0x00, 0x1f]);
    expect(avc1CodecStringFromSps(sps)).toBe("avc1.64001F");
  });
});
