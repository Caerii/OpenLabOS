import assert from "node:assert/strict";
import {
  DEFAULT_DASHBOARD_API_PORT,
  DEFAULT_DASHBOARD_CLIENT_PORT,
  dashboardApiHost,
  dashboardApiPort,
  dashboardApiProxyTarget,
  dashboardClientPort,
} from "../runtime-config.js";

function main() {
  assert.equal(dashboardApiPort({}), DEFAULT_DASHBOARD_API_PORT);
  assert.equal(dashboardClientPort({}), DEFAULT_DASHBOARD_CLIENT_PORT);

  assert.equal(dashboardApiPort({ OPENLABOS_API_PORT: "3890", LABOS_DASHBOARD_API_PORT: "3900" }), 3890);
  assert.equal(dashboardApiPort({ LABOS_DASHBOARD_API_PORT: "3900", PORT: "9999" }), 3900);
  assert.equal(dashboardApiPort({ DASHBOARD_API_PORT: "3901", PORT: "9999" }), 3901);
  assert.equal(dashboardApiPort({ PORT: "3902" }), 3902);
  assert.equal(dashboardApiPort({ LABOS_DASHBOARD_API_PORT: "nope" }), DEFAULT_DASHBOARD_API_PORT);

  assert.equal(dashboardClientPort({ OPENLABOS_CLIENT_PORT: "5177", LABOS_DASHBOARD_CLIENT_PORT: "5174" }), 5177);
  assert.equal(dashboardClientPort({ LABOS_DASHBOARD_CLIENT_PORT: "5174", VITE_PORT: "5173" }), 5174);
  assert.equal(dashboardClientPort({ DASHBOARD_CLIENT_PORT: "5175" }), 5175);
  assert.equal(dashboardClientPort({ VITE_PORT: "5176" }), 5176);
  assert.equal(dashboardClientPort({ PORT: "3902" }), DEFAULT_DASHBOARD_CLIENT_PORT);

  assert.equal(dashboardApiHost({}), "0.0.0.0");
  assert.equal(dashboardApiHost({ OPENLABOS_API_HOST: "127.0.0.2", LABOS_DASHBOARD_API_HOST: "127.0.0.1" }), "127.0.0.2");
  assert.equal(dashboardApiHost({ LABOS_DASHBOARD_API_HOST: "127.0.0.1" }), "127.0.0.1");
  assert.equal(dashboardApiProxyTarget({ OPENLABOS_API_PORT: "3903" }), "http://localhost:3903");

  console.log("[runtime-config] all checks passed");
}

main();
