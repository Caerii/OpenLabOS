/**
 * Bundled example protocols. In a fuller deployment, these come from
 * `services/api`'s protocol registry; for the demo we keep the canonical
 * documents inline so the dashboard can drive a session without a
 * separate API roundtrip.
 *
 * `defaultProtocol` is what the dashboard's "Start" button kicks off.
 * Add new protocols here as JSON imports and surface them in a picker
 * once we have more than two.
 */
import spinCoatJson from "../../../../examples/protocols/spin-coat-photoresist.protocol.json" with { type: "json" };
import kitchenTeaJson from "../../../../examples/protocols/kitchen-tea.protocol.json" with { type: "json" };
import type { Protocol } from "@openlabos/protocol";

/** Canonical OpenLabOS demo: a 100 mm wafer through a spin-coat + soft-bake. */
export const spinCoatPhotoresist: Protocol = spinCoatJson as Protocol;

/** Minimal regression-only fixture from the project's earlier scaffolding. */
export const kitchenTea: Protocol = kitchenTeaJson as Protocol;

export const defaultProtocol: Protocol = spinCoatPhotoresist;

export const protocolCatalogue: Protocol[] = [spinCoatPhotoresist, kitchenTea];
