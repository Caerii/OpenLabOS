import {
  RECORD_STREAM_PROFILES,
  recordStreamLabSettings,
  resolveRecordStreamProfile,
  type RecordStreamProfile,
  type RecordStreamProfileId,
} from "@openlabos/preview";
import { updateLabosSettings } from "../lib/labos-settings.js";

let appliedRecordStreamKey: string | null = null;

export function getDefaultRecordStreamProfile(): RecordStreamProfile {
  return RECORD_STREAM_PROFILES.recordAndStreamSustained;
}

export function listRecordStreamProfiles() {
  return Object.entries(RECORD_STREAM_PROFILES).map(([id, profile]) => ({
    id,
    label: profile.label,
    description: profile.description,
    previewProfileId: profile.previewProfileId,
    video: profile.video,
    config: profile.config,
  }));
}

export async function applyRecordStreamProfile(
  profileId: RecordStreamProfileId | string = "recordAndStreamSustained",
  reason = "record-stream",
) {
  const profile = resolveRecordStreamProfile(profileId) ?? getDefaultRecordStreamProfile();
  const settings = recordStreamLabSettings(profile);
  const key = JSON.stringify({ profileId, settings });
  if (appliedRecordStreamKey === key) return profile;
  await updateLabosSettings(settings, 500);
  appliedRecordStreamKey = key;
  console.log(`[RecordStream] Applied profile ${profileId} for ${reason}: ${key}`);
  return profile;
}

export function resetRecordStreamProfileCacheForTests() {
  appliedRecordStreamKey = null;
}
