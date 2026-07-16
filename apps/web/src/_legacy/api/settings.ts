import { putJson, request } from "./core";

export interface LabOsSettingsData {
  photo_resolution: string;
  video_width: number;
  video_height: number;
  video_fps: number;
  max_recording_time_seconds: number;
  video_bitrate: number;
  camera_fov: number;
  camera_led_on_capture: boolean;
  jpeg_quality: number;
  camera_keep_alive_ms: number;
  stream_width: number;
  stream_height: number;
  stream_jpeg_quality: number;
  stream_fps: number;
  audio_volume: number;
  i2s_keep_open_ms: number;
  mic_enabled: boolean;
  vad_enabled: boolean;
  serial_port: string;
  baud_rate: number;
  normal_poll_ms: number;
  fast_poll_ms: number;
  mcu_firmware_version: string;
  photo_flash_ms: number;
  led_brightness: number;
  boot_chime_delay_ms: number;
  camera_warmup_delay_ms: number;
  low_battery_threshold: number;
  low_battery_reset: number;
  gallery_mode: boolean;
}

export const fetchSettings = () => request<LabOsSettingsData>("/api/settings");
export const updateSettings = (settings: Partial<LabOsSettingsData>) =>
  putJson<{ success: boolean; settings: LabOsSettingsData }>("/api/settings", settings);
