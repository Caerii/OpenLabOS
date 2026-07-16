import { useState, useEffect } from "react";
import { usePolling } from "../hooks/usePolling";
import { buttonMappings, buttonActions, updateButtonMappings } from "../api";

interface Props {
  connected: boolean;
}

const BUTTON_LABELS: Record<string, string> = {
  camera_short: "Camera Short Press",
  camera_long: "Camera Long Press",
  power_short: "Power Button",
};

const DEFAULTS: Record<string, string> = {
  camera_short: "take_photo",
  camera_long: "toggle_video",
  power_short: "announce_battery",
};

function formatAction(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ButtonMapper({ connected }: Props) {
  const { data, refresh, loading } = usePolling(buttonMappings, 30000, connected);
  const [actions, setActions] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (connected) {
      buttonActions()
        .then((r) => setActions(r.actions))
        .catch(() => {});
    }
  }, [connected]);

  useEffect(() => {
    if (data?.mappings) {
      setDraft(data.mappings);
      setDirty(false);
    }
  }, [data]);

  function handleChange(button: string, action: string) {
    setDraft((d) => ({ ...d, [button]: action }));
    setDirty(true);
    setMsg("");
  }

  function handleReset() {
    setDraft({ ...DEFAULTS });
    setDirty(true);
    setMsg("");
  }

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      await updateButtonMappings(draft);
      setDirty(false);
      setMsg("Saved successfully");
      refresh();
    } catch (e: any) {
      setMsg(e.message);
    }
    setSaving(false);
  }

  if (!connected) {
    return <div className="flex items-center justify-center h-64 text-muted">Connect to glasses first</div>;
  }

  const buttonKeys = Object.keys(BUTTON_LABELS);
  // Include any extra keys from the device that we don't have labels for
  if (draft) {
    Object.keys(draft).forEach((k) => {
      if (!buttonKeys.includes(k)) buttonKeys.push(k);
    });
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-accentText font-semibold">Button Mapping</h2>
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary text-sm" onClick={handleReset}>Reset to Defaults</button>
            {dirty && (
              <button className="btn-primary text-sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            )}
          </div>
        </div>

        {loading && !data ? (
          <p className="text-muted">Loading mappings...</p>
        ) : (
          <div className="space-y-3">
            {buttonKeys.map((key) => (
              <div key={key} className="flex items-center justify-between gap-4 py-2 border-b border-border/20 last:border-0">
                <span className="text-sm text-muted">{BUTTON_LABELS[key] || key}</span>
                <select
                  className="input text-sm min-w-[200px]"
                  value={draft[key] || ""}
                  onChange={(e) => handleChange(key, e.target.value)}
                >
                  <option value="">-- None --</option>
                  {actions.map((a) => (
                    <option key={a} value={a}>{formatAction(a)}</option>
                  ))}
                  {/* Include current value if not in actions list */}
                  {draft[key] && !actions.includes(draft[key]) && (
                    <option value={draft[key]}>{formatAction(draft[key])}</option>
                  )}
                </select>
              </div>
            ))}
          </div>
        )}

        {msg && (
          <p className={`text-xs mt-3 ${msg.includes("success") ? "text-accentText" : "text-red-400"}`}>{msg}</p>
        )}
      </div>
    </div>
  );
}
