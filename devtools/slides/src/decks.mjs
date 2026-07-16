export const DECKS = [
  {
    id: "openlabos-system-overview",
    title: "OpenLabOS System Overview",
    subtitle: "A local-first operating layer for guided laboratory and kitchen work on smart glasses.",
    slides: [
      {
        title: "What The System Is",
        kicker: "Operator workflow",
        points: [
          "A local API, web operator, desktop shell, and Android reference stack working as one field system.",
          "Protocols define the work; the operator console supervises execution; device modules capture evidence.",
          "Kitchen workflows are treated as high-signal, repeatable physical procedures rather than demo-only content.",
        ],
        evidence: [
          "apps/web exposes /operate.",
          "services/api owns sessions, kitchen runs, VQA, power, and perception contracts.",
          "apps/device-reference builds core, camera, dashboard-device, and devtools APKs.",
        ],
      },
      {
        title: "Local Agent And Operator",
        kicker: "Bring-up path",
        points: [
          "The local agent runs on port 3847 and the operator on port 5174.",
          "The tunnel path appends localBackend to the operator URL for remote browser sessions.",
          "Windows can register openlabos://start-agent for one-click local stack launch.",
        ],
        evidence: [
          "pnpm local-agent:up",
          "pnpm local-agent:tunnel",
          "pnpm local-agent:register-protocol",
        ],
      },
      {
        title: "Kitchen Protocol Depth",
        kicker: "Recipes as physical procedures",
        points: [
          "The protocol catalog covers tea, ramen, pasta, stir-fry, pancakes, salad, cookies, and safety-sensitive setup.",
          "Each protocol step carries verification prompts, evidence hooks, and guidance copy.",
          "The same run model supports live coaching, step confirmation, post-run VQA, and replayable manifests.",
        ],
        evidence: [
          "services/api/src/ai/kitchen/recipe-protocols.ts",
          "services/api/src/tests/kitchen-protocol-catalog.test.ts",
          "services/api/src/ai/kitchen/session-manifest.ts",
        ],
      },
      {
        title: "Perception And Evidence",
        kicker: "Make guidance auditable",
        points: [
          "Frame evidence, native video artifacts, segmentation results, and VQA annotations feed the same run history.",
          "The perception service exposes a mockable segmentation contract for local tests and RunPod deployment.",
          "Power profiling records the energy cost of capture density and preview settings.",
        ],
        evidence: [
          "services/perception/app.py",
          "pnpm sidecar:smoke",
          "pnpm power:matrix",
        ],
      },
      {
        title: "Device Reference",
        kicker: "Buildable Android stack",
        points: [
          "The reference device stack builds four debug APKs: core app, camera, dashboard-device, and devtools.",
          "Prebuilt artifacts are packaged with SHA-256 hashes and source APK paths.",
          "AIDL contracts are package-aligned so satellite modules can bind to the core service cleanly.",
        ],
        evidence: [
          "pnpm device:build",
          "pnpm device:prebuild",
          "apps/device-reference/prebuilt/openlabos-debug/manifest.json",
        ],
      },
      {
        title: "Release Readiness",
        kicker: "Desktop and checks",
        points: [
          "The Tauri shell packages the web client and API sidecar into a local desktop app.",
          "Doctor runs API typecheck, web typecheck, and the offline API test suite with temp data roots.",
          "Release artifacts and APK prebuilts are hashable, repeatable outputs rather than loose build folders.",
        ],
        evidence: [
          "pnpm desktop:build",
          "pnpm doctor",
          "pnpm desktop:hash-artifacts",
        ],
      },
    ],
  },
];
