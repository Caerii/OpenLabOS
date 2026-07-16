import { describe, expect, it } from "vitest";
import { paretoFrontier, previewQualityScore, scorePreviewConfig, bestQualityAtLatency } from "../src/metrics/pareto.js";
import { PREVIEW_PARETO_DEEP_CANDIDATES, resolveParetoCandidates } from "../src/config/pareto-grid.js";

describe("pareto frontier", () => {
  it("scores quality as megapixel-fps", () => {
    expect(previewQualityScore(640, 480, 15)).toBe(4.61);
    expect(previewQualityScore(1280, 720, 30)).toBe(27.65);
  });

  it("finds non-dominated points", () => {
    const points = paretoFrontier([
      { id: "slow-hq", latencyMs: 200, qualityScore: 20 },
      { id: "fast-lq", latencyMs: 50, qualityScore: 5 },
      { id: "mid", latencyMs: 120, qualityScore: 10 },
      { id: "fast-mid", latencyMs: 60, qualityScore: 12 },
    ]);
    expect(points.map((p) => p.id).sort()).toEqual(["fast-lq", "fast-mid", "slow-hq"].sort());
  });

  it("combines device stage summaries into end-to-end latency", () => {
    const scored = scorePreviewConfig(
      "test",
      { width: 640, height: 480, fps: 15 } as never,
      {
        deviceFrameAge: { p95Ms: 40 },
        captureToEncode: { p95Ms: 12 },
        encodeToPublish: { p95Ms: 2 },
      },
      40,
      14.5,
    );
    expect(scored.latencyMs).toBe(54);
    expect(scored.qualityScore).toBeCloseTo(4.46, 1);
  });

  it("picks best quality under a latency ceiling", () => {
    const best = bestQualityAtLatency(
      [
        { id: "a", latencyMs: 45, qualityScore: 20 },
        { id: "b", latencyMs: 90, qualityScore: 30 },
        { id: "c", latencyMs: 40, qualityScore: 18 },
      ],
      50,
    );
    expect(best?.id).toBe("a");
  });

  it("expands deep lattice beyond baseline", () => {
    expect(resolveParetoCandidates(false).length).toBe(7);
    expect(resolveParetoCandidates(true).length).toBe(PREVIEW_PARETO_DEEP_CANDIDATES.length);
    expect(PREVIEW_PARETO_DEEP_CANDIDATES.length).toBeGreaterThan(20);
  });
});
