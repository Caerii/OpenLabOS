import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  configureProviders,
  getProviderStatuses,
  listAvailableModels,
} from "../ai/providers.js";

async function listen(server: http.Server) {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function main() {
  let seenAuthHeader = "";
  const server = http.createServer((req, res) => {
    if (req.url === "/v1/models") {
      seenAuthHeader = String(req.headers.authorization || "");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        object: "list",
        data: [{ id: "Qwen/Qwen3.5-9B", object: "model" }],
      }));
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  const baseUrl = await listen(server);
  try {
    configureProviders({
      ollama: { baseUrl },
      lmstudio: { baseUrl },
      runpod: { baseUrl, apiKey: "runpod-test" },
    });

    const statuses = await getProviderStatuses();
    const runpod = statuses.find((status) => status.name === "runpod");
    assert.equal(runpod?.configured, true);
    assert.equal(runpod?.available, true);
    assert.deepEqual(runpod?.models, ["Qwen/Qwen3.5-9B"]);
    assert.equal(seenAuthHeader, "Bearer runpod-test");

    const models = await listAvailableModels();
    assert.equal(models.includes("runpod:Qwen/Qwen3.5-9B"), true);
  } finally {
    await close(server);
  }

  console.log("[runpod-provider] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
