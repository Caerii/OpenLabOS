import { closedWorldStepIdForProtocol } from "../workflows/index.js";

export function toClosedWorldStepId(protocolId: string, stepNumber: number) {
  return closedWorldStepIdForProtocol(protocolId, stepNumber);
}
