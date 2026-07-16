import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";

export interface LiveKitSessionConfig {
  configured: boolean;
  url: string | null;
  apiKeyConfigured: boolean;
  apiSecretConfigured: boolean;
  agentName: string;
  tokenTtlSeconds: number;
}

export interface CreateLiveKitSessionOptions {
  roomName?: string;
  identity?: string;
  participantName?: string;
  protocolId?: string;
  dispatchAgent?: boolean;
  allowDispatchFailure?: boolean;
}

export interface LiveKitSessionResponse {
  provider: "livekit";
  url: string;
  token: string;
  roomName: string;
  identity: string;
  participantName: string;
  expiresInSeconds: number;
  agentName: string;
  dispatch: {
    attempted: boolean;
    created: boolean;
    id?: string;
    room?: string;
    agentName?: string;
    metadata?: string;
    error?: string;
  };
}

function trim(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || "";
}

function boolEnv(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function safeId(value: string, fallback: string) {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return safe || fallback;
}

function makeId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return safeId(`${prefix}-${random}`, prefix);
}

function requireLiveKitConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = trim(env.LIVEKIT_URL);
  const apiKey = trim(env.LIVEKIT_API_KEY);
  const apiSecret = trim(env.LIVEKIT_API_SECRET);
  const missing = [
    !url && "LIVEKIT_URL",
    !apiKey && "LIVEKIT_API_KEY",
    !apiSecret && "LIVEKIT_API_SECRET",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`LiveKit is not configured. Missing ${missing.join(", ")}.`);
  }
  return { url, apiKey, apiSecret };
}

export function getLiveKitSessionConfig(env: NodeJS.ProcessEnv = process.env): LiveKitSessionConfig {
  const url = trim(env.LIVEKIT_URL);
  const apiKey = trim(env.LIVEKIT_API_KEY);
  const apiSecret = trim(env.LIVEKIT_API_SECRET);
  return {
    configured: Boolean(url && apiKey && apiSecret),
    url: url || null,
    apiKeyConfigured: Boolean(apiKey),
    apiSecretConfigured: Boolean(apiSecret),
    agentName: trim(env.LIVEKIT_AGENT_NAME) || "livekit-labos-agent",
    tokenTtlSeconds: positiveInt(env.LIVEKIT_TOKEN_TTL_SECONDS, 15 * 60),
  };
}

export async function createLiveKitSession(
  options: CreateLiveKitSessionOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<LiveKitSessionResponse> {
  const { url, apiKey, apiSecret } = requireLiveKitConfig(env);
  const config = getLiveKitSessionConfig(env);
  const roomName = safeId(options.roomName || makeId("labos-live-coach"), "labos-live-coach");
  const identity = safeId(options.identity || makeId("operator"), "operator");
  const participantName = options.participantName?.trim() || "LabOS operator";
  const agentName = config.agentName;
  const metadata = JSON.stringify({
    source: "openlabos-live-coach",
    protocolId: options.protocolId || "kitchen-tea-v1",
    createdAt: new Date().toISOString(),
  });

  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity,
    name: participantName,
    metadata,
    ttl: config.tokenTtlSeconds,
  });
  accessToken.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const dispatchEnabled = boolEnv(env.LABOS_LIVEKIT_DISPATCH_ENABLED, true);
  const dispatchAgent = dispatchEnabled && options.dispatchAgent !== false;
  const response: LiveKitSessionResponse = {
    provider: "livekit",
    url,
    token: await accessToken.toJwt(),
    roomName,
    identity,
    participantName,
    expiresInSeconds: config.tokenTtlSeconds,
    agentName,
    dispatch: {
      attempted: dispatchAgent,
      created: false,
    },
  };

  if (!dispatchAgent) return response;

  try {
    const client = new AgentDispatchClient(url, apiKey, apiSecret, {
      requestTimeout: positiveInt(env.LIVEKIT_DISPATCH_TIMEOUT_SECONDS, 8),
    });
    const dispatch = await client.createDispatch(roomName, agentName, { metadata });
    response.dispatch = {
      attempted: true,
      created: true,
      id: dispatch.id,
      room: dispatch.room,
      agentName: dispatch.agentName,
      metadata: dispatch.metadata,
    };
  } catch (error: any) {
    response.dispatch.error = error?.message || String(error);
    if (!options.allowDispatchFailure) throw error;
  }

  return response;
}
