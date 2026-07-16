import { motion, useReducedMotion } from "framer-motion";
import { Suspense, lazy } from "react";
import { Link } from "react-router-dom";

// Defer the R3F hero until idle: its bundle is ~half the page weight
// and the rest of the landing reads cleanly without it.
const Hero3D = lazy(() =>
  import("../three/Hero3D").then((m) => ({ default: m.Hero3D })),
);

function HeroBackdrop() {
  const reduced = useReducedMotion();
  if (reduced) {
    // Static gradient stand-in honours the OS-level "reduce motion" flag
    // and saves the WebGL compositor cost on low-power hardware.
    return (
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 35%, rgba(56,189,167,0.18), transparent 70%)",
        }}
      />
    );
  }
  return (
    <Suspense fallback={null}>
      <Hero3D />
    </Suspense>
  );
}

const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] },
});

export function Landing() {
  return (
    <div className="relative">
      <section className="relative h-[88vh] min-h-[640px] overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30" aria-hidden />
        <div className="absolute inset-0">
          <HeroBackdrop />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface-0/40 to-surface-0 pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-7xl h-full px-6 flex items-center">
          <div className="max-w-3xl">
            <motion.span
              {...reveal(0)}
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-accent-300 font-mono"
            >
              <span className="block w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulseGlow" />
              Open lab operating system
            </motion.span>

            <motion.h1
              {...reveal(0.05)}
              className="mt-6 text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[1.05] text-ink-high"
            >
              Augmented science,{" "}
              <span className="text-accent-400 glow-emerald">measurably</span>{" "}
              done.
            </motion.h1>

            <motion.p
              {...reveal(0.15)}
              className="mt-6 max-w-xl text-lg leading-relaxed text-ink-mid"
            >
              OpenLabOS turns sensor-equipped devices into protocol-aware
              scientific instruments. Capture the bench. Judge the step. Train
              on what you learn. Local-first, vendor-neutral, fully open.
            </motion.p>

            <motion.div
              {...reveal(0.25)}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
              <Link
                to="/dashboard"
                className="group relative inline-flex items-center gap-2 px-5 py-3 rounded-md bg-accent-400 text-surface-0 font-medium hover:bg-accent-300 transition shadow-glow"
              >
                Open the dashboard
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                >
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <Link
                to="/operate"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-ink-high border border-white/10 hover:border-accent-400/40 hover:text-accent-300 transition"
              >
                Operator console
              </Link>
              <a
                href="#why"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-ink-mid hover:text-accent-300 transition"
              >
                Why OpenLabOS
              </a>
            </motion.div>

            <motion.div
              {...reveal(0.35)}
              className="mt-12 flex items-center gap-8 text-xs font-mono text-ink-low"
            >
              <Spec label="Schema" value="Zod / JSON-Schema" />
              <Spec label="API" value="Hono · OpenAPI 3.1" />
              <Spec label="Local model" value="Ollama · LM Studio" />
            </motion.div>
          </div>
        </div>
      </section>

      <PlanesSection />
      <Differentiators />
      <CTASection />
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="uppercase tracking-[0.18em] text-ink-muted">{label}</span>
      <span className="mt-1 text-ink-mid">{value}</span>
    </div>
  );
}

function PlanesSection() {
  const planes = [
    {
      title: "Presentation",
      body: "Web app and reference glasses surface the next step and capture the bench.",
      foot: "apps/web · apps/device-reference",
    },
    {
      title: "Coordination",
      body: "A small Hono API owns sessions, protocols, and routes by capability.",
      foot: "services/api",
    },
    {
      title: "Reasoning",
      body: "An inference gateway picks providers; a perception sidecar prepares evidence.",
      foot: "services/inference · services/perception",
    },
    {
      title: "Learning",
      body: "Frozen datasets, manifested runs, SFT/DPO/GRPO and judgment LoRA.",
      foot: "services/training · services/eval",
    },
  ];
  return (
    <section id="why" className="relative py-28 px-6">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Four planes, one repository.
          </h2>
          <p className="mt-4 text-ink-mid">
            Each plane talks to the next through a small, documented contract.
            Never by reaching across.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {planes.map((plane, i) => (
            <motion.div
              key={plane.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{
                duration: 0.55,
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="relative rounded-xl border border-white/5 bg-surface-1/60 backdrop-blur p-5 hover:border-accent-400/40 transition group"
            >
              <span className="absolute top-4 right-4 text-[10px] font-mono uppercase tracking-widest text-ink-muted">
                0{i + 1}
              </span>
              <h3 className="text-ink-high text-lg font-medium">{plane.title}</h3>
              <p className="mt-3 text-sm text-ink-mid leading-relaxed">{plane.body}</p>
              <div className="mt-6 text-[11px] font-mono text-accent-300/80">
                {plane.foot}
              </div>
              <div
                aria-hidden
                className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-accent-400/40 to-transparent opacity-0 group-hover:opacity-100 transition"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Differentiators() {
  const items = [
    {
      kicker: "Schema as truth",
      title: "One Zod schema generates everything.",
      body: "Protocols, sessions, judgments, run manifests — declared once in TypeScript, exported as JSON Schema, regenerated as Pydantic. No hand-typed wires.",
    },
    {
      kicker: "Capability routing",
      title: "Devices are adapters, not assumptions.",
      body: "A webcam, a Mentra Live, a ROS 2 station — they all plug into the same DeviceAdapter contract. The API doesn't know or care which.",
    },
    {
      kicker: "Replay-as-test",
      title: "Every captured run is a regression test.",
      body: "Commit a RunManifest, replay it against a future build, and a single key-set diff fails CI before anything ships.",
    },
    {
      kicker: "Local-first",
      title: "It works without the cloud.",
      body: "Ollama, LM Studio, vLLM — provider keys are opt-in. The default path runs offline against the bench you have today.",
    },
  ];
  return (
    <section className="relative py-28 px-6 border-t border-white/5">
      <div className="mx-auto max-w-7xl grid gap-16 lg:grid-cols-2">
        {items.map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{
              duration: 0.6,
              delay: i * 0.06,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent-300 font-mono">
              {item.kicker}
            </span>
            <h3 className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight text-ink-high">
              {item.title}
            </h3>
            <p className="mt-4 text-ink-mid leading-relaxed">{item.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative py-32 px-6 border-t border-white/5">
      <div className="mx-auto max-w-4xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-4xl md:text-5xl font-semibold tracking-tight"
        >
          Bring your bench. Start in five minutes.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 text-ink-mid max-w-xl mx-auto"
        >
          Connect a device, pick a protocol, hit run. The dashboard takes it
          from there.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10"
        >
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-accent-400 text-surface-0 font-medium hover:bg-accent-300 transition shadow-glow"
          >
            Open dashboard →
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
