import { Request, Response, Router } from "express";
import { deleteProtocol, listProtocols, saveProtocol } from "../../ai/kitchen/index.js";
import { summarizeProtocol } from "../../ai/kitchen/protocol-domain.js";
import { asyncRoute, notFound } from "../../lib/http.js";
import { getProtocolOrThrow, parseCustomProtocolOrThrow } from "./shared.js";

export function registerKitchenProtocolRoutes(router: Router) {
  router.get("/protocols", (_req: Request, res: Response) => {
    const protocols = listProtocols();
    res.json({
      protocols: protocols.map(summarizeProtocol),
    });
  });

  router.get("/protocols/:id", asyncRoute(async (req, res) => {
    res.json(getProtocolOrThrow(req.params.id));
  }));

  router.post("/protocols", asyncRoute(async (req, res) => {
    const protocol = parseCustomProtocolOrThrow(req.body);
    const filepath = saveProtocol(protocol);
    res.json({ success: true, id: protocol.id, filepath });
  }));

  router.delete("/protocols/:id", asyncRoute(async (req, res) => {
    const protocolId = req.params.id;
    if (!deleteProtocol(protocolId)) {
      notFound(`Cannot delete "${protocolId}" (built-in or not found)`);
    }
    res.json({ success: true, id: protocolId });
  }));
}
