/**
 * Opt-in OpenTelemetry bootstrap stub. When OTEL_EXPORTER_OTLP_ENDPOINT is set,
 * this records intent and reserves the shutdown hook for a future full SDK wiring.
 */
export interface OtelHandle {
  shutdown(): Promise<void>;
}

export async function initOtel(): Promise<OtelHandle | null> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) return null;

  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || "openlabos-api";
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      msg: "otel_stub_enabled",
      serviceName,
      endpoint,
      note: "Full OTLP exporter wiring is deferred; endpoint is acknowledged.",
    }),
  );

  return {
    async shutdown() {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "info",
          msg: "otel_stub_shutdown",
          serviceName,
        }),
      );
    },
  };
}
