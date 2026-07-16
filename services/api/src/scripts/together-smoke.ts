import { asyncStepAnalysisModel } from "../ai/kitchen/async-step-analysis.js";
import { labosGenerateObject, labosGenerateText } from "../ai/labos-inference.js";
import { loadProvidersFromEnv } from "../ai/providers.js";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const smokeSchema = z.object({
  ok: z.boolean(),
  provider: z.literal("together"),
  model_seen: z.string(),
  image_input: z.boolean(),
  visible_summary: z.string(),
});

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function parseTimeoutMs() {
  const raw = Number(argValue("--timeout-ms"));
  return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
}

function printHelp() {
  console.log([
    "Usage:",
    "  pnpm --filter @openlabos/api exec tsx --env-file=.env src/scripts/together-smoke.ts",
    "  pnpm --filter @openlabos/api exec tsx --env-file=.env src/scripts/together-smoke.ts --model together:Qwen/Qwen3.5-9B",
    "",
    "Options:",
    "  --model <model>        LabOS model id. Default: LABOS_ASYNC_STEP_ANALYSIS_MODEL or the code default.",
    "  --image <path>         Optional JPEG/PNG fixture to send as image evidence.",
    "  --timeout-ms <ms>      Request timeout. Default: 60000.",
    "  --text-only           Skip the tiny image part and test text generation only.",
    "  --freeform            Use generateText instead of structured generateObject.",
    "  --loose-schema        Send json_schema without OpenAI strict mode.",
    "  --raw-chat           Bypass AI SDK and print sanitized Together Chat Completions response.",
    "  --json-object        With --raw-chat, use older json_object mode instead of json_schema.",
  ].join("\n"));
}

function loadImageFixture() {
  const imagePath = argValue("--image");
  if (!imagePath) {
    throw new Error("Pass --image <path> for a multimodal Together smoke, or use --text-only.");
  }
  const resolved = path.resolve(imagePath);
  return fs.readFileSync(resolved);
}

function smokeJsonSchema() {
  return {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      provider: { type: "string", enum: ["together"] },
      model_seen: { type: "string" },
      image_input: { type: "boolean" },
      visible_summary: { type: "string" },
    },
    required: ["ok", "provider", "model_seen", "image_input", "visible_summary"],
    additionalProperties: false,
  };
}

async function runRawChatSmoke({
  modelId,
  userContent,
  textOnly,
}: {
  modelId: string;
  userContent: any;
  textOnly: boolean;
}) {
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey) throw new Error("TOGETHER_API_KEY is not configured.");
  const model = modelId.slice("together:".length);
  const body = {
    model,
    messages: [
      { role: "system", content: "You are a terse API smoke-test respondent. Return JSON only." },
      { role: "user", content: userContent },
    ],
    temperature: 0,
    max_tokens: 160,
    reasoning: { enabled: false },
    response_format: hasArg("--json-object")
      ? { type: "json_object" }
      : {
          type: "json_schema",
          json_schema: {
            name: "together_smoke",
            schema: smokeJsonSchema(),
            strict: !hasArg("--loose-schema"),
          },
        },
  };
  const startedAt = Date.now();
  const response = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(parseTimeoutMs()),
  });
  const json = await response.json().catch(async () => ({ raw: await response.text() }));
  const choice = (json as any)?.choices?.[0];
  console.log(JSON.stringify({
    ok: response.ok,
    status: response.status,
    modelId,
    multimodal: !textOnly,
    structuredMode: hasArg("--json-object") ? "json_object" : "json_schema",
    latencyMs: Date.now() - startedAt,
    finishReason: choice?.finish_reason,
    contentPreview: typeof choice?.message?.content === "string"
      ? choice.message.content.trim().slice(0, 500)
      : choice?.message?.content ?? null,
    reasoningPreview: typeof choice?.message?.reasoning === "string"
      ? choice.message.reasoning.trim().slice(0, 500)
      : null,
    textPreview: typeof choice?.text === "string" ? choice.text.trim().slice(0, 500) : null,
    usage: (json as any)?.usage ?? null,
    error: (json as any)?.error ?? undefined,
  }, null, 2));
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    printHelp();
    return;
  }

  loadProvidersFromEnv();

  const modelId = argValue("--model") || asyncStepAnalysisModel();
  if (!modelId.startsWith("together:")) {
    throw new Error(`Together smoke requires a together:<model> id. Received "${modelId}".`);
  }

  const textOnly = hasArg("--text-only");
  const freeform = hasArg("--freeform");
  const prompt = [
    "Return only compact JSON matching this schema:",
    JSON.stringify({
      ok: "boolean",
      provider: "together",
      model_seen: "string",
      image_input: "boolean",
      visible_summary: "short string describing the image evidence or text-only mode",
    }),
    `Model id: ${modelId}`,
    `Image input: ${textOnly ? "false" : "true"}`,
  ].join("\n");
  const userContent: any = textOnly
    ? prompt
    : [
        { type: "image", image: loadImageFixture() },
        { type: "text", text: prompt },
      ];

  if (hasArg("--raw-chat")) {
    const rawUserContent = textOnly
      ? prompt
      : [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${loadImageFixture().toString("base64")}`,
            },
          },
        ];
    await runRawChatSmoke({ modelId, userContent: rawUserContent, textOnly });
    return;
  }

  const startedAt = Date.now();
  const messages = [
    { role: "system" as const, content: "You are a terse API smoke-test respondent. Return JSON only." },
    { role: "user" as const, content: userContent },
  ];

  if (!freeform) {
    const result = await labosGenerateObject({
      modelId,
      schema: smokeSchema,
      schemaName: "together_smoke",
      schemaDescription: "A small structured JSON response proving Together hosted multimodal inference.",
      messages,
      temperature: 0,
      maxOutputTokens: 160,
      providerOptions: { openai: { strictJsonSchema: !hasArg("--loose-schema") } },
      abortSignal: AbortSignal.timeout(parseTimeoutMs()),
    });

    console.log(JSON.stringify({
      ok: true,
      provider: "together",
      modelId,
      multimodal: !textOnly,
      structured: true,
      latencyMs: Date.now() - startedAt,
      object: result.object,
      usage: (result as any).usage ?? null,
    }, null, 2));
    return;
  }

  const result = await labosGenerateText({
    modelId,
    messages,
    temperature: 0,
    maxOutputTokens: 128,
    abortSignal: AbortSignal.timeout(parseTimeoutMs()),
  } as any);
  console.log(JSON.stringify({
    ok: true,
    provider: "together",
    modelId,
    multimodal: !textOnly,
    structured: false,
    latencyMs: Date.now() - startedAt,
    textPreview: result.text.trim().slice(0, 500),
    contentPreview: Array.isArray((result as any).content)
      ? (result as any).content.map((part: any) => ({
          type: part?.type,
          textPreview: typeof part?.text === "string" ? part.text.trim().slice(0, 300) : undefined,
        }))
      : null,
    reasoningPreview: typeof (result as any).reasoningText === "string"
      ? (result as any).reasoningText.trim().slice(0, 500)
      : null,
    usage: (result as any).usage ?? null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
