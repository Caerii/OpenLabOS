import {
  HOST_PREVIEW_PATHS,
  PREVIEW_PROFILES,
  PREVIEW_TRANSPORTS,
  listEnabledPreviewOptions,
  normalizePreviewConfig,
  type PreviewProfileId,
  type PreviewProtocolConfig,
} from "@openlabos/preview";

let activePreviewConfig: PreviewProtocolConfig = normalizePreviewConfig(PREVIEW_PROFILES.lowLatencySustained.config);
let activeProfileId: PreviewProfileId = "lowLatencySustained";

export function getPreviewProtocolConfig(): PreviewProtocolConfig {
  return activePreviewConfig;
}

export function getActivePreviewProfileId(): PreviewProfileId | undefined {
  return activeProfileId;
}

export function setPreviewProtocolConfig(input: unknown): PreviewProtocolConfig {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (typeof body.profileId === "string" && body.profileId in PREVIEW_PROFILES) {
    activeProfileId = body.profileId as PreviewProfileId;
    activePreviewConfig = normalizePreviewConfig({
      ...PREVIEW_PROFILES[activeProfileId].config,
      ...body,
    });
    return activePreviewConfig;
  }
  activePreviewConfig = normalizePreviewConfig(body);
  return activePreviewConfig;
}

export function applyPreviewProfile(profileId: PreviewProfileId): PreviewProtocolConfig {
  activeProfileId = profileId;
  activePreviewConfig = normalizePreviewConfig(PREVIEW_PROFILES[profileId].config);
  return activePreviewConfig;
}

export function previewProtocolCatalog() {
  const options = listEnabledPreviewOptions({ includeExperimental: true });
  return {
    ok: true,
    active: activePreviewConfig,
    activeProfileId,
    profiles: Object.entries(PREVIEW_PROFILES).map(([id, profile]) => ({
      id,
      label: profile.label,
      description: profile.description,
      config: profile.config,
    })),
    encodeModes: options.encodeModes,
    transports: options.transports,
    paths: HOST_PREVIEW_PATHS,
    transportsById: PREVIEW_TRANSPORTS,
  };
}

export function resetPreviewProtocolConfigForTests() {
  activePreviewConfig = normalizePreviewConfig(PREVIEW_PROFILES.lowLatencySustained.config);
  activeProfileId = "lowLatencySustained";
}
