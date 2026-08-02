import { z } from "zod";

/**
 * Identifiers are namespaced strings: `<domain>:<slug>`.
 *
 *   object:mug          — physical thing
 *   surface:counter     — supportive surface
 *   action:pour         — verb the operator performs
 *   tool:micropipette   — instrument used in actions
 *   reagent:tris-buffer — consumable
 *
 * Domains are open-ended; modules extend them. The core enforces only the
 * `<domain>:<slug>` shape so collisions stay namespaced.
 */
const NamespacedId = (domain: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${domain}:[a-z0-9][a-z0-9_-]*$`),
      `must look like "${domain}:something"`,
    );

export const ObjectIdSchema = NamespacedId("object");
export const SurfaceIdSchema = NamespacedId("surface");
export const ActionIdSchema = NamespacedId("action");
export const ToolIdSchema = NamespacedId("tool");
export const ReagentIdSchema = NamespacedId("reagent");

export type ObjectId = z.infer<typeof ObjectIdSchema>;
export type SurfaceId = z.infer<typeof SurfaceIdSchema>;
export type ActionId = z.infer<typeof ActionIdSchema>;
export type ToolId = z.infer<typeof ToolIdSchema>;
export type ReagentId = z.infer<typeof ReagentIdSchema>;

/**
 * Canonical measurement units. A closed set so that eval can compare
 * measurements without normalising free-string spellings ("C" vs "°C" vs
 * "celsius"). SI symbols where they exist; `pH` and `percent` and `count`
 * cover the common dimensionless cases. Extend this list by PR — do not
 * invent per-protocol spellings.
 */
export const MeasurementUnitSchema = z.enum([
  // time
  "s",
  "min",
  "h",
  // temperature
  "C",
  "K",
  // volume
  "uL",
  "mL",
  "L",
  // mass
  "ug",
  "mg",
  "g",
  "kg",
  // length
  "nm",
  "um",
  "mm",
  "cm",
  "m",
  // concentration
  "M",
  "mM",
  "uM",
  "mg_per_mL",
  // rotation / speed
  "rpm",
  "g_force",
  // pressure
  "Pa",
  "kPa",
  "bar",
  "psi",
  // dimensionless
  "percent",
  "pH",
  "count",
]);
export type MeasurementUnit = z.infer<typeof MeasurementUnitSchema>;

/**
 * Machine-readable quantity name for measurements: lowercase snake_case,
 * e.g. "hotplate_temperature", "spin_speed", "buffer_ph".
 */
export const QuantityNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'must be lowercase snake_case, e.g. "spin_speed"');
export type QuantityName = z.infer<typeof QuantityNameSchema>;
