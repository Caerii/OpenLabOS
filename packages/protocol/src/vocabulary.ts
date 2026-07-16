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
