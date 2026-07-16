import {
  HOST_PREVIEW_PATHS,
  PREVIEW_PROFILES,
  PREVIEW_TRANSPORTS,
  type PreviewPathTier,
  type PreviewProtocolConfig,
  type PreviewTransport,
  normalizePreviewConfig,
  parsePreviewProtocolConfig,
  pickDisplayedLatencyMs,
} from "@openlabos/preview/browser";

export type PreviewTransportClientOptions = {
  tier?: PreviewPathTier;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  healthLite?: boolean;
};

export class PreviewTransportClient {
  private config: PreviewProtocolConfig;
  private readonly tier: PreviewPathTier;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly healthLite: boolean;

  constructor(
    config: PreviewProtocolConfig = normalizePreviewConfig({}),
    opts: PreviewTransportClientOptions = {},
  ) {
    this.config = normalizePreviewConfig(config);
    this.tier = opts.tier ?? "host";
    this.baseUrl = (opts.baseUrl ?? "").replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.healthLite = opts.healthLite ?? true;
  }

  getConfig() {
    return this.config;
  }

  setConfig(config: PreviewProtocolConfig) {
    this.config = normalizePreviewConfig(config);
  }

  applyProfile(profileId: keyof typeof PREVIEW_PROFILES) {
    this.config = normalizePreviewConfig(PREVIEW_PROFILES[profileId].config);
    return this.config;
  }

  streamUrl(): string {
    const transport = PREVIEW_TRANSPORTS[this.config.transport];
    const path = transport.streamPath(this.tier);
    return `${this.baseUrl}${path}`;
  }

  frameUrl(cacheBust = true): string {
    const path = PREVIEW_TRANSPORTS[this.config.transport].framePath(this.tier);
    const url = `${this.baseUrl}${path}`;
    if (!cacheBust) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}t=${Date.now()}`;
  }

  healthUrl(): string {
    const path = PREVIEW_TRANSPORTS[this.config.transport].healthPath(this.tier);
    const url = `${this.baseUrl}${path}`;
    if (!this.healthLite) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}lite=1`;
  }

  configUrl(): string {
    return `${this.baseUrl}${HOST_PREVIEW_PATHS.config}`;
  }

  metricsUrl(): string {
    return `${this.baseUrl}${HOST_PREVIEW_PATHS.metrics}`;
  }

  async fetchHealth() {
    const response = await this.fetchImpl(this.healthUrl(), { cache: "no-store" });
    if (!response.ok) throw new Error(`Preview health HTTP ${response.status}`);
    return response.json();
  }

  async measureLatencyMs(): Promise<number | null> {
    const health = await this.fetchHealth();
    const displayed = pickDisplayedLatencyMs(health);
    if (displayed !== null) return displayed;

    if (this.config.transport === "frame-poll-http" || this.config.transport === "mjpeg-http") {
      const start = performance.now();
      const response = await this.fetchImpl(this.frameUrl(), { cache: "no-store" });
      if (!response.ok) return null;
      await response.arrayBuffer();
      return Math.round(performance.now() - start);
    }
    return null;
  }

  describe() {
    return {
      config: this.config,
      streamUrl: this.streamUrl(),
      frameUrl: this.frameUrl(false),
      healthUrl: this.healthUrl(),
      transport: PREVIEW_TRANSPORTS[this.config.transport],
    };
  }
}

export function createPreviewTransportClient(
  transport: PreviewTransport,
  patch: Partial<PreviewProtocolConfig> = {},
  opts?: PreviewTransportClientOptions,
) {
  return new PreviewTransportClient(
    normalizePreviewConfig({ ...patch, transport }),
    opts,
  );
}

export {
  PREVIEW_PROFILES,
  PREVIEW_TRANSPORTS,
  parsePreviewProtocolConfig,
  normalizePreviewConfig,
  resolveAdaptivePreviewConfig,
  selectOperatorPreviewProfile,
  detectPreviewClientCapabilities,
} from "@openlabos/preview/browser";
export { H264AnnexBPlayer, webCodecsH264Supported } from "./H264AnnexBPlayer.js";
