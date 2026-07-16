import { getProtocol } from "../ai/kitchen/protocols.js";
import { generateProtocolVoicePlan } from "../live-coach/protocol-voice-assets.js";

function argValue(name: string, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

const protocolId = argValue("--protocolId", "kitchen-tea-v1");
const protocol = getProtocol(protocolId);

if (!protocol) {
  console.error(`Protocol not found: ${protocolId}`);
  process.exit(1);
}

process.stdout.write(JSON.stringify(generateProtocolVoicePlan(protocol), null, 2));
