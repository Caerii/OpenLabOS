/**
 * Module registry — loads and serves ModuleManifest values.
 *
 * Modules are *data*, so this registry is intentionally boring: a Map keyed
 * by module id, plus indexes from criterion-kind to verifier and from
 * vocabulary id to contributing module.
 */
import {
  type CriterionContribution,
  type ModuleManifest,
  isModuleManifest,
} from "./manifest.js";

export class ModuleRegistry {
  private readonly modules = new Map<string, ModuleManifest>();
  private readonly criteriaByKind = new Map<string, CriterionContribution>();
  private readonly vocabularyOwner = new Map<string, string>();

  register(manifest: ModuleManifest): void {
    if (!isModuleManifest(manifest)) {
      throw new Error("Invalid module manifest");
    }
    if (this.modules.has(manifest.id)) {
      throw new Error(`Module "${manifest.id}" is already registered`);
    }
    this.modules.set(manifest.id, manifest);

    for (const c of manifest.criteria ?? []) {
      if (this.criteriaByKind.has(c.kind)) {
        throw new Error(
          `Criterion kind "${c.kind}" already provided by another module`,
        );
      }
      this.criteriaByKind.set(c.kind, c);
    }

    const v = manifest.vocabulary;
    if (v) {
      for (const list of [v.objects, v.surfaces, v.tools, v.reagents, v.actions]) {
        for (const entry of list ?? []) {
          if (this.vocabularyOwner.has(entry.id)) {
            throw new Error(
              `Vocabulary id "${entry.id}" already owned by ` +
                `module "${this.vocabularyOwner.get(entry.id)}"`,
            );
          }
          this.vocabularyOwner.set(entry.id, manifest.id);
        }
      }
    }
  }

  get(id: string): ModuleManifest | undefined {
    return this.modules.get(id);
  }

  list(): ModuleManifest[] {
    return [...this.modules.values()];
  }

  criterion(kind: string): CriterionContribution | undefined {
    return this.criteriaByKind.get(kind);
  }

  ownerOf(vocabularyId: string): string | undefined {
    return this.vocabularyOwner.get(vocabularyId);
  }
}

export const globalModuleRegistry = new ModuleRegistry();
