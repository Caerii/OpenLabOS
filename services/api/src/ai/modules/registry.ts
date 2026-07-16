/**
 * Module Registry — manages available scientific pipeline modules.
 *
 * Simple Map-based registry with static imports. Each module registers itself
 * at import time. The "general" module is always the default fallback.
 */

import type { ScientificModule, ScientificModuleInfo } from "./types.js";

// ── Import all built-in modules ────────────────────────
import { generalModule } from "./general.js";
import { biotechModule } from "./biotech.js";
import { nanotechModule } from "./nanotech.js";
import { materialsModule } from "./materials.js";
import { chemistryModule } from "./chemistry.js";
import { fieldBiologyModule } from "./field-biology.js";
import { kitchenDemoModule } from "./kitchen-demo.js";

// ── Registry ───────────────────────────────────────────

const modules = new Map<string, ScientificModule>();
const quietStartupLogs = Boolean(process.env.LABOS_TEST_SUITE);

export function registerModule(mod: ScientificModule): void {
  if (modules.has(mod.id)) {
    console.warn(`[Modules] Overwriting existing module "${mod.id}"`);
  }
  modules.set(mod.id, mod);
  if (!quietStartupLogs) {
    console.log(`[Modules] Registered: ${mod.id} — ${mod.name}`);
  }
}

export function getModule(id: string): ScientificModule | undefined {
  return modules.get(id);
}

export function getDefaultModule(): ScientificModule {
  return modules.get("general")!;
}

export function listModules(): ScientificModule[] {
  return Array.from(modules.values());
}

/** Get serializable module info for API responses (strips functions + Zod objects) */
export function listModuleInfos(): ScientificModuleInfo[] {
  return listModules().map(moduleToInfo);
}

export function moduleToInfo(mod: ScientificModule): ScientificModuleInfo {
  return {
    id: mod.id,
    name: mod.name,
    description: mod.description,
    version: mod.version,
    pipelineDefaults: mod.pipelineDefaults,
    requiredSensors: mod.requiredSensors,
    cocoCategories: mod.cocoCategories,
  };
}

// ── Register all built-in modules ──────────────────────

const builtins = [
  generalModule,
  biotechModule,
  nanotechModule,
  materialsModule,
  chemistryModule,
  fieldBiologyModule,
  kitchenDemoModule,
];

for (const mod of builtins) {
  registerModule(mod);
}
