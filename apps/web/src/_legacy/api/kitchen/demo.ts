/**
 * Preloaded demo dataset discovery for keyless replay and clip sandbox flows.
 */

import { kitchenGet } from "./transport";
import type { KitchenDemoSample } from "./types";

export const kitchenDemoSamples = () => kitchenGet<{
  configured: boolean;
  manifestPath?: string;
  samples: KitchenDemoSample[];
  error?: string;
}>("demo/samples");

