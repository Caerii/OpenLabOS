import { useEffect, useState, type ReactNode } from "react";
import { fetchSettings, updateSettings, type LabOsSettingsData } from "../api";
import { AlertBanner, Btn, Card, ConnectionRequiredState, EmptyState, Input, LoadingState } from "./ui";

interface Props {
  connected: boolean;
}

type SettingsKey = keyof LabOsSettingsData;

type BaseField = {
  key: SettingsKey;
  label: string;
  hint?: string;
  visible?: (settings: LabOsSettingsData) => boolean;
};

type FieldConfig =
  | (BaseField & { kind: "number"; min?: number; max?: number; step?: number; width?: number })
  | (BaseField & { kind: "toggle" })
  | (BaseField & { kind: "text"; width?: number })
  | (BaseField & { kind: "select"; width?: number; options: { value: string | number; label: string }[] })
  | (BaseField & { kind: "readonly" });

type SectionConfig = {
  id: string;
  title: string;
  fields: FieldConfig[];
};

const SETTINGS_SECTIONS: SectionConfig[] = [
  {
    id: "audio",
    title: "Audio",
    fields: [
      { key: "audio_volume", kind: "number", label: "Volume", hint: "0.0 (silent) to 1.0 (max)", min: 0, max: 1, step: 0.05 },
      { key: "i2s_keep_open_ms", kind: "number", label: "I2S Keep-Open", hint: "ms to keep speaker path open after sound", min: 500, max: 10000 },
      { key: "mic_enabled", kind: "toggle", label: "Microphone" },
      { key: "vad_enabled", kind: "toggle", label: "Voice Activity Detection" },
    ],
  },
  {
    id: "camera",
    title: "Camera",
    fields: [
      {
        key: "photo_resolution",
        kind: "select",
        label: "Photo Resolution",
        hint: "Capture preset used for still images",
        options: [
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
        ],
        width: 120,
      },
      { key: "jpeg_quality", kind: "number", label: "JPEG Quality", hint: "10-100", min: 10, max: 100 },
      { key: "camera_keep_alive_ms", kind: "number", label: "Camera Keep-Alive", hint: "ms before closing after photo", min: 1000, max: 60000 },
      {
        key: "camera_fov",
        kind: "select",
        label: "Camera FOV",
        hint: "Sensor crop in degrees",
        options: [
          { value: 82, label: "82 degrees" },
          { value: 92, label: "92 degrees" },
          { value: 102, label: "102 degrees" },
          { value: 118, label: "118 degrees" },
        ],
        width: 140,
      },
      { key: "camera_led_on_capture", kind: "toggle", label: "LED Flash on Capture" },
      { key: "video_width", kind: "number", label: "Video Width", hint: "pixels", min: 640, max: 3840 },
      { key: "video_height", kind: "number", label: "Video Height", hint: "pixels", min: 480, max: 2160 },
      { key: "video_fps", kind: "number", label: "Video FPS", min: 1, max: 60 },
      {
        key: "video_bitrate",
        kind: "number",
        label: "Video Bitrate",
        hint: "bps (10000000 = 10 Mbps)",
        min: 1000000,
        max: 50000000,
        step: 1000000,
        width: 140,
      },
      {
        key: "max_recording_time_seconds",
        kind: "number",
        label: "Max Recording Time",
        hint: "seconds",
        min: 10,
        max: 3600,
      },
      { key: "stream_width", kind: "number", label: "Stream Width", hint: "px (320-1920)", min: 320, max: 1920 },
      { key: "stream_height", kind: "number", label: "Stream Height", hint: "px (240-1080)", min: 240, max: 1080 },
      {
        key: "stream_jpeg_quality",
        kind: "number",
        label: "Stream JPEG Quality",
        hint: "10-100 (lower = less bandwidth)",
        min: 10,
        max: 100,
      },
      { key: "stream_fps", kind: "number", label: "Stream FPS", hint: "1-30 (target frame rate)", min: 1, max: 30 },
    ],
  },
  {
    id: "mcu",
    title: "MCU / UART",
    fields: [
      { key: "serial_port", kind: "text", label: "Serial Port", hint: "Requires reconnect", width: 140 },
      {
        key: "baud_rate",
        kind: "select",
        label: "Baud Rate",
        hint: "Requires reconnect",
        options: [
          { value: 115200, label: "115200" },
          { value: 230400, label: "230400" },
          { value: 460800, label: "460800" },
          { value: 921600, label: "921600" },
        ],
        width: 140,
      },
      { key: "normal_poll_ms", kind: "number", label: "Normal Poll Interval", hint: "ms (idle)", min: 1, max: 100 },
      { key: "fast_poll_ms", kind: "number", label: "Fast Poll Interval", hint: "ms (active data)", min: 1, max: 50 },
      {
        key: "mcu_firmware_version",
        kind: "readonly",
        label: "MCU Firmware",
        visible: (settings) => Boolean(settings.mcu_firmware_version),
      },
    ],
  },
  {
    id: "led",
    title: "LED",
    fields: [
      { key: "photo_flash_ms", kind: "number", label: "Photo Flash Duration", hint: "ms", min: 50, max: 2000 },
      { key: "led_brightness", kind: "number", label: "RGB Brightness", hint: "0-255", min: 0, max: 255 },
    ],
  },
  {
    id: "system",
    title: "System",
    fields: [
      { key: "boot_chime_delay_ms", kind: "number", label: "Boot Chime Delay", hint: "ms after MCU connect", min: 0, max: 10000 },
      { key: "camera_warmup_delay_ms", kind: "number", label: "Camera Warmup Delay", hint: "ms after boot", min: 0, max: 15000 },
      { key: "low_battery_threshold", kind: "number", label: "Low Battery Threshold", hint: "% to trigger warning", min: 5, max: 50 },
      { key: "low_battery_reset", kind: "number", label: "Low Battery Reset", hint: "% to clear warning", min: 10, max: 60 },
      { key: "gallery_mode", kind: "toggle", label: "Gallery Mode", hint: "Save captures to gallery" },
    ],
  },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-accent" : "bg-border/60"}`}
      onClick={() => onChange(!value)}
    >
      <div
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
          value ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-sm text-muted">{label}</span>
        {hint && <p className="text-xs text-subtle">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingsSection({
  title,
  dirty,
  saving,
  onSave,
  children,
}: {
  title: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-accentText">{title}</h3>
        {dirty && (
          <Btn variant="primary" size="xs" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Btn>
        )}
      </div>
      <div className="divide-y divide-border/20">{children}</div>
    </Card>
  );
}

function editableKeys(section: SectionConfig): SettingsKey[] {
  return section.fields.filter((field) => field.kind !== "readonly").map((field) => field.key);
}

export default function SettingsPanel({ connected }: Props) {
  const [settings, setSettings] = useState<LabOsSettingsData | null>(null);
  const [draft, setDraft] = useState<Partial<LabOsSettingsData>>({});
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [message, setMessage] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!connected) return;
    void loadSettings();
  }, [connected]);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await fetchSettings();
      setSettings(data);
      setDraft({});
      setMessage(null);
    } catch (e: any) {
      setMessage({ variant: "error", text: `Failed to load settings: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }

  function getValue<K extends SettingsKey>(key: K): LabOsSettingsData[K] {
    return (draft[key] ?? settings?.[key]) as LabOsSettingsData[K];
  }

  function setValue<K extends SettingsKey>(key: K, value: LabOsSettingsData[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function isDirty(keys: SettingsKey[]) {
    return keys.some((key) => key in draft);
  }

  async function saveSection(section: SectionConfig) {
    const keys = editableKeys(section);
    const updates: Partial<LabOsSettingsData> = {};
    for (const key of keys) {
      if (key in draft) {
        (updates as Record<typeof key, (typeof draft)[typeof key]>)[key] = draft[key]!;
      }
    }
    if (Object.keys(updates).length === 0) return;

    setSavingSection(section.id);
    setMessage(null);
    try {
      const result = await updateSettings(updates);
      if (result.settings) setSettings(result.settings);
      setDraft((current) => {
        const next = { ...current };
        for (const key of keys) delete next[key];
        return next;
      });
      setMessage({ variant: "success", text: `${section.title} settings saved` });
    } catch (e: any) {
      setMessage({ variant: "error", text: e.message });
    } finally {
      setSavingSection(null);
    }
  }

  function renderField(field: FieldConfig, currentSettings: LabOsSettingsData) {
    if (field.visible && !field.visible(currentSettings)) return null;

    const widthStyle = "width" in field && field.width ? { width: `${field.width}px` } : undefined;
    const controlClassName = "font-mono";
    const value = getValue(field.key);

    if (field.kind === "readonly") {
      return (
        <FieldRow key={field.key} label={field.label} hint={field.hint}>
          <span className="text-sm font-mono text-muted">{String(value || "N/A")}</span>
        </FieldRow>
      );
    }

    if (field.kind === "toggle") {
      return (
        <FieldRow key={field.key} label={field.label} hint={field.hint}>
          <Toggle value={Boolean(value)} onChange={(next) => setValue(field.key, next as LabOsSettingsData[typeof field.key])} />
        </FieldRow>
      );
    }

    if (field.kind === "select") {
      return (
        <FieldRow key={field.key} label={field.label} hint={field.hint}>
          <select
            className="rounded border border-border/20 bg-surface-2 px-2 py-1 text-sm font-mono text-fg focus:border-highlight-border/50 focus:outline-none"
            style={widthStyle}
            value={String(value)}
            onChange={(e) => {
              const option = field.options.find((candidate) => String(candidate.value) === e.target.value);
              if (option) setValue(field.key, option.value as LabOsSettingsData[typeof field.key]);
            }}
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldRow>
      );
    }

    if (field.kind === "text") {
      return (
        <FieldRow key={field.key} label={field.label} hint={field.hint}>
          <Input
            className={controlClassName}
            style={widthStyle}
            value={String(value ?? "")}
            onChange={(e) => setValue(field.key, e.target.value as LabOsSettingsData[typeof field.key])}
          />
        </FieldRow>
      );
    }

    return (
      <FieldRow key={field.key} label={field.label} hint={field.hint}>
        <Input
          className={controlClassName}
          style={widthStyle}
          type="number"
          value={Number(value ?? 0)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => setValue(field.key, Number(e.target.value) as LabOsSettingsData[typeof field.key])}
        />
      </FieldRow>
    );
  }

  if (!connected) {
    return <ConnectionRequiredState message="Connect to glasses to manage settings" />;
  }

  if (loading) return <LoadingState />;

  if (!settings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <EmptyState
          title="Failed to load settings"
          action={
            <Btn variant="primary" size="sm" onClick={loadSettings}>
              Retry
            </Btn>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <AlertBanner variant={message.variant === "error" ? "error" : "success"} onDismiss={() => setMessage(null)}>
          {message.text}
        </AlertBanner>
      )}

      <div className="flex justify-end">
        <Btn variant="secondary" size="sm" onClick={loadSettings}>
          Refresh
        </Btn>
      </div>

      {SETTINGS_SECTIONS.map((section) => {
        const keys = editableKeys(section);
        return (
          <SettingsSection
            key={section.id}
            title={section.title}
            dirty={isDirty(keys)}
            saving={savingSection === section.id}
            onSave={() => void saveSection(section)}
          >
            {section.fields.map((field) => renderField(field, settings))}
          </SettingsSection>
        );
      })}
    </div>
  );
}
