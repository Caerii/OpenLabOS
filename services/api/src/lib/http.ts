import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function badRequest(message: string): never {
  throw new HttpError(400, message);
}

export function forbidden(message: string): never {
  throw new HttpError(403, message);
}

export function notFound(message: string): never {
  throw new HttpError(404, message);
}

export function badGateway(message: string): never {
  throw new HttpError(502, message);
}

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch((error: any) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      const status = error instanceof HttpError ? error.status : 500;
      res.status(status).json({ error: error?.message || "Internal server error" });
    });
  };
}
