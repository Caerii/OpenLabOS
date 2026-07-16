import assert from "node:assert/strict";
import { runEntitySegmentation } from "../ai/kitchen/entity-segmentation.js";

async function main() {
  const previousMode = process.env.LABOS_ENTITY_SEGMENTATION_MODE;
  const previousUrl = process.env.LABOS_SEGMENTATION_SIDECAR_URL;
  const previousToken = process.env.LABOS_SEGMENTATION_SIDECAR_TOKEN;
  const originalFetch = globalThis.fetch;

  try {
    process.env.LABOS_ENTITY_SEGMENTATION_MODE = "mock";
    delete process.env.LABOS_SEGMENTATION_SIDECAR_URL;

    const mock = await runEntitySegmentation({
      prompts: ["mug", "tea bag"],
      includeMasks: true,
      includeTracks: true,
      frameId: "test-frame",
      timestampMs: 123,
    });
    assert.equal(mock.provider, "mock");
    assert.equal(mock.configured, false);
    assert.equal(mock.observations.length, 2);
    assert.equal(mock.tracks.length, 2);
    assert.equal(mock.summary.hasMasks, true);
    assert.equal(mock.summary.missingPrompts.length, 0);

    process.env.LABOS_ENTITY_SEGMENTATION_MODE = "disabled";
    const disabled = await runEntitySegmentation({ prompts: ["mug"] });
    assert.equal(disabled.provider, "disabled");
    assert.equal(disabled.observations.length, 0);
    assert.deepEqual(disabled.summary.missingPrompts, ["mug"]);

    let requestedUrl = "";
    let requestedBody: any = null;
    let requestedAuth = "";
    process.env.LABOS_ENTITY_SEGMENTATION_MODE = "sidecar";
    process.env.LABOS_SEGMENTATION_SIDECAR_URL = "http://segmentation.local";
    process.env.LABOS_SEGMENTATION_SIDECAR_TOKEN = "sidecar-test-token";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(String(init?.body || "{}"));
      requestedAuth = String((init?.headers as Record<string, string>)?.authorization || "");
      return new Response(JSON.stringify({
        observations: [
          {
            class_name: "mug",
            score: 0.91,
            bbox: [10, 20, 110, 220],
            segmentation: { size: [480, 640], counts: "abc123" },
          },
        ],
        tracks: [
          { track_id: "mug-1", label: "mug", observationIds: ["mug-observation"], confidence: 0.91 },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const sidecar = await runEntitySegmentation({
      imageUrl: "http://example.com/frame.jpg",
      prompts: ["mug"],
      includeMasks: true,
      includeTracks: true,
    });
    assert.equal(requestedUrl, "http://segmentation.local/segment");
    assert.deepEqual(requestedBody.prompts, ["mug"]);
    assert.equal(requestedBody.imageUrl, "http://example.com/frame.jpg");
    assert.equal(requestedAuth, "Bearer sidecar-test-token");
    assert.equal(sidecar.provider, "sidecar");
    assert.equal(sidecar.configured, true);
    assert.equal(sidecar.observations[0].label, "mug");
    assert.equal(sidecar.observations[0].mask?.encoding, "coco_rle");
    assert.equal(sidecar.summary.hasTracks, true);

    console.log("[kitchen-entity-segmentation] all checks passed");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousMode === undefined) delete process.env.LABOS_ENTITY_SEGMENTATION_MODE;
    else process.env.LABOS_ENTITY_SEGMENTATION_MODE = previousMode;
    if (previousUrl === undefined) delete process.env.LABOS_SEGMENTATION_SIDECAR_URL;
    else process.env.LABOS_SEGMENTATION_SIDECAR_URL = previousUrl;
    if (previousToken === undefined) delete process.env.LABOS_SEGMENTATION_SIDECAR_TOKEN;
    else process.env.LABOS_SEGMENTATION_SIDECAR_TOKEN = previousToken;
  }
}

void main();
