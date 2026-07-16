import { useState } from "react";
import { usePolling } from "../hooks/usePolling";
import { otaCurrent, otaUpload, otaInstall, type OtaUploadResult } from "../api";

interface Props {
  connected: boolean;
}

export default function OtaUpdate({ connected }: Props) {
  const { data: version, refresh } = usePolling(otaCurrent, 30000, connected);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<OtaUploadResult | null>(null);
  const [installing, setInstalling] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  async function handleUpload(file: File) {
    if (!file.name.endsWith(".apk")) {
      setError("File must be an APK");
      return;
    }
    setUploading(true);
    setError("");
    setOutput("");
    setUploaded(null);
    try {
      const result = await otaUpload(file);
      setUploaded(result);
    } catch (e: any) {
      setError(e.message);
    }
    setUploading(false);
  }

  async function handleInstall() {
    if (!uploaded) return;
    setInstalling(true);
    setError("");
    setOutput("");
    try {
      const result = await otaInstall(uploaded.tempPath);
      setOutput(result.output);
      if (result.success) {
        setUploaded(null);
        refresh();
      }
    } catch (e: any) {
      setError(e.message);
    }
    setInstalling(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }

  if (!connected) {
    return <div className="flex items-center justify-center h-64 text-muted">Connect to glasses first</div>;
  }

  return (
    <div className="space-y-4">
      {/* Current version */}
      <div className="card">
        <h2 className="text-accentText font-semibold mb-3">Current Version</h2>
        {version ? (
          <div className="space-y-1 text-sm">
            <p className="text-muted">Version: <span className="text-accentText">{version.versionName}</span></p>
            <p className="text-muted">Build: <span className="text-subtle">{version.versionCode}</span></p>
            <p className="text-muted">Last Update: <span className="text-subtle">{version.lastUpdate}</span></p>
          </div>
        ) : (
          <p className="text-muted">Loading...</p>
        )}
      </div>

      {/* Upload zone */}
      <div
        className={`card border-dashed border-2 text-center py-8 cursor-pointer transition-colors ${
          dragOver ? "border-labos-green bg-labos-green/5" : "border-labos-border"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".apk";
          input.onchange = () => input.files?.[0] && handleUpload(input.files[0]);
          input.click();
        }}
      >
        {uploading ? (
          <p className="text-labos-green">Uploading APK...</p>
        ) : (
          <p className="text-muted">Drop APK here or click to browse</p>
        )}
      </div>

      {/* Uploaded file info + install */}
      {uploaded && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <p className="text-muted">{uploaded.filename}</p>
              <p className="text-subtle">{(uploaded.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button
              className="btn-primary text-sm"
              onClick={handleInstall}
              disabled={installing}
            >
              {installing ? "Installing..." : "Install"}
            </button>
          </div>
        </div>
      )}

      {/* Output */}
      {output && (
        <div className="card bg-surface-1 border border-border/15">
          <pre className="text-xs text-muted whitespace-pre-wrap">{output}</pre>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-400 bg-surface-1 border border-red-500/20 p-2 rounded">{error}</p>}
    </div>
  );
}
