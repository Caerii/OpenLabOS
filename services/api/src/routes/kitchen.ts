/**
 * Kitchen Demo Routes — composition root for the LabOS kitchen API.
 *
 * Route families are split semantically under `routes/kitchen/` so callers can
 * still import `routes/kitchen.js` while the implementation stays readable.
 */

import { Router } from "express";
import { resetKitchenRouteDepsForTests, setKitchenRouteDepsForTests } from "./kitchen/deps.js";
import { registerKitchenFeatureRoutes } from "./kitchen/feature-routes.js";
import { registerKitchenProtocolRoutes } from "./kitchen/protocol-routes.js";
import { registerKitchenRunRoutes } from "./kitchen/run-routes.js";
import { registerKitchenTeacherRoutes } from "./kitchen/teacher-routes.js";
import { registerKitchenAnalyzeRoutes } from "./kitchen/analyze-routes.js";
import { registerKitchenDemoRoutes } from "./kitchen/demo-routes.js";
import { registerKitchenValidationRoutes } from "./kitchen/validation-routes.js";
import { registerKitchenSessionRoutes } from "./kitchen/session-routes.js";
import { registerKitchenRealtimeSupervisorRoutes } from "./kitchen/realtime-supervisor.js";
import { registerKitchenHandsFreeRoutes } from "./kitchen/hands-free-routes.js";
import { registerKitchenButtonConfirmBridge } from "./kitchen/button-confirm-bridge.js";
import { registerKitchenOperatorRoutes } from "./kitchen/operator-routes.js";

const router = Router();

registerKitchenFeatureRoutes(router);
registerKitchenOperatorRoutes(router);
registerKitchenProtocolRoutes(router);
registerKitchenRunRoutes(router);
registerKitchenTeacherRoutes(router);
registerKitchenAnalyzeRoutes(router);
registerKitchenDemoRoutes(router);
registerKitchenValidationRoutes(router);
registerKitchenSessionRoutes(router);
registerKitchenRealtimeSupervisorRoutes(router);
registerKitchenHandsFreeRoutes(router);
registerKitchenButtonConfirmBridge();

export { setKitchenRouteDepsForTests, resetKitchenRouteDepsForTests };
export default router;
