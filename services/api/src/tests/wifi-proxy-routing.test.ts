import assert from "node:assert/strict";
import { isHostLocalApiPath, sendProxyErrorIfPossible } from "../wifi-proxy.js";

function fakeResponse(state: { headersSent?: boolean; writableEnded?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    res: {
      headersSent: state.headersSent === true,
      writableEnded: state.writableEnded === true,
      end: () => {
        calls.push("end");
      },
      status: (code: number) => {
        calls.push(`status:${code}`);
        return {
          json: (payload: unknown) => {
            calls.push(`json:${JSON.stringify(payload)}`);
          },
        };
      },
      json: (payload: unknown) => {
        calls.push(`json:${JSON.stringify(payload)}`);
      },
    },
  };
}

function main() {
  assert.equal(isHostLocalApiPath("/api/device/status"), true);
  assert.equal(isHostLocalApiPath("/api/device/list"), true);
  assert.equal(isHostLocalApiPath("/api/kitchen/run/status"), true);
  assert.equal(isHostLocalApiPath("/api/preview/start"), true);
  assert.equal(isHostLocalApiPath("/api/preview/health"), true);
  assert.equal(isHostLocalApiPath("/api/preview/recording/status"), true);
  assert.equal(isHostLocalApiPath("/api/device/info"), false);
  assert.equal(isHostLocalApiPath("/api/preview/frame"), true);

  const open = fakeResponse();
  sendProxyErrorIfPossible(open.res as any, 504, { error: "Device request timed out" });
  assert.deepEqual(open.calls, ['status:504', 'json:{"error":"Device request timed out"}']);

  const started = fakeResponse({ headersSent: true });
  sendProxyErrorIfPossible(started.res as any, 504, { error: "Device request timed out" });
  assert.deepEqual(started.calls, ["end"]);

  const closed = fakeResponse({ writableEnded: true });
  sendProxyErrorIfPossible(closed.res as any, 502, { error: "Device unreachable" });
  assert.deepEqual(closed.calls, []);

  console.log("[wifi-proxy-routing] all checks passed");
}

main();
