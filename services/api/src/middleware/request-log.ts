import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export function requestLogMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header("x-request-id")?.trim() || randomUUID();
    const started = process.hrtime.bigint();

    res.setHeader("x-request-id", requestId);
    (req as Request & { requestId?: string }).requestId = requestId;

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "info",
          msg: "http_request",
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        }),
      );
    });

    next();
  };
}
