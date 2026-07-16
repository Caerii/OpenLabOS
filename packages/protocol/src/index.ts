/**
 * @openlabos/protocol — canonical schema for protocols, sessions, and judgments.
 *
 * Two design rules govern this package:
 *   1. Anything that crosses a service boundary is defined here, once.
 *   2. The schema is closed-by-default but extensible by registration:
 *      domain modules add success-criterion variants without forking the core.
 */
export * from "./vocabulary.js";
export * from "./protocol.js";
export * from "./session.js";
export * from "./judgment.js";
export * from "./run.js";
export * from "./parse.js";
