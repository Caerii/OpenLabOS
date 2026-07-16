import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import buttonRoutes from "../routes/buttons.js";

async function main() {
  const app = express();
  app.use("/api/buttons", buttonRoutes);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("button test server did not bind");

  try {
    const response = await fetch(`http://127.0.0.1:${(address as AddressInfo).port}/api/buttons/actions`);
    assert.equal(response.status, 200);
    const body = await response.json() as { actions: string[] };
    assert.ok(body.actions.includes("protocol_confirm_step"));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  console.log("[button-actions] all checks passed");
}

void main();
