#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const compose = fs.readFileSync("compose.yaml", "utf8");
const runbook = fs.readFileSync("docs/runbooks/docker-compose.md", "utf8");

const services = ["api", "inference", "perception"];
for (const svc of services) {
  if (!compose.includes(`${svc}:`)) {
    console.error(`compose.yaml missing service ${svc}`);
    process.exit(1);
  }
  if (!runbook.toLowerCase().includes(svc)) {
    console.error(`docker-compose.md missing mention of ${svc}`);
    process.exit(1);
  }
}

if (!runbook.includes("3847")) {
  console.error("docker-compose.md missing default port 3847");
  process.exit(1);
}

console.log("[check-compose-doc] compose.yaml and runbook are aligned.");
