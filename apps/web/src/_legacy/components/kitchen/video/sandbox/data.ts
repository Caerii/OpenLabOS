import { kitchenDemoSamples } from "../../../../api";
import { loadStaticKitchenSamples, sourceKey } from "./model";
import type { DemoMode, KitchenDemoSampleWithFrames } from "./types";

export type LoadedKitchenSamples = {
  samples: KitchenDemoSampleWithFrames[];
  selectedSourceId: string;
  selectedId: string;
  selectedIds: string[];
  demoMode: DemoMode;
  error: string;
};

function initialSelection(samples: KitchenDemoSampleWithFrames[]) {
  const first = samples[0];
  return {
    selectedSourceId: first ? sourceKey(first) : "",
    selectedId: first?.sampleId || "",
    selectedIds: first?.sampleId ? [first.sampleId] : [],
  };
}

export async function loadKitchenDemoSamplesWithFallback(): Promise<LoadedKitchenSamples> {
  try {
    const data = await kitchenDemoSamples();
    if (!data.configured || !data.samples?.length) {
      throw new Error(data.error || "API demo samples unavailable.");
    }
    const samples = data.samples as KitchenDemoSampleWithFrames[];
    return {
      samples,
      ...initialSelection(samples),
      demoMode: "api",
      error: "",
    };
  } catch (apiError: any) {
    const data = await loadStaticKitchenSamples();
    return {
      samples: data.samples || [],
      ...initialSelection(data.samples || []),
      demoMode: "static",
      error: data.configured ? "" : apiError.message || "Using static demo samples.",
    };
  }
}
