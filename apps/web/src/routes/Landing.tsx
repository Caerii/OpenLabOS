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
            <motion.p
              {...reveal(0)}
              className="text-xs uppercase font-mono tracking-[0.18em] text-accent-300"
            >
              OpenLabOS · pre-1.0 research software
            </motion.p>

            <motion.h1
              {...reveal(0.05)}
              className="mt-5 text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[1.05] text-ink-high"
            >
              OpenLabOS
            </motion.h1>

            <motion.p
              {...reveal(0.1)}
              className="mt-5 text-2xl sm:text-3xl font-medium tracking-tight text-ink-high max-w-2xl leading-snug"
            >
              Run a versioned protocol.{" "}
              <span className="text-accent-400 glow-emerald">
                Leave an inspectable record.
              </span>
            </motion.p>

            <motion.p
              {...reveal(0.15)}
              className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-mid"
            >
              An open-source protocol runner for camera-assisted lab work. One
              instruction at a time, tied to an append-only session — not a
              chat transcript. Optional devices and local models can add frames
              and structured step checks.
            </motion.p>

            <motion.div
              {...reveal(0.25)}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
              <Link
                to="/operate/kitchen"
                className="group relative inline-flex items-center gap-2 px-5 py-3 rounded-md bg-accent-400 text-surface-0 font-medium hover:bg-accent-300 transition shadow-glow"
              >
                Open the guided demo
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
                to="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-ink-high border border-white/10 hover:border-accent-400/40 hover:text-accent-300 transition"
              >
                Inspect the system
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-ink-mid hover:text-accent-300 transition"
              >
                See what it records
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      <CurrentScopeSection />
      <RunRecordSection />
      <QuickstartSection />
    </div>
  );
}

function RunRecordSection() {
  const stages = [
    {
      title: "Load a versioned protocol",
      body: "The run binds to a protocol ID and version. You see the current instruction, expected objects, success criteria, and safety notes — the same document the session will cite later.",
    },
    {
      title: "Append what happened",
      body: "Starting or completing a step writes an event. A configured device can add frames and clips. The log is append-only; replaying it reconstructs session state.",
    },
    {
      title: "Optionally request a step check",
      body: "When enabled, the API forwards the step and available evidence to the step-check service. Ollama, LM Studio, or the deterministic mock returns a structured verdict with a named source.",
    },
    {
      title: "Close the session",
      body: "The store keeps the protocol reference and event history. Media and review data from the legacy kitchen path are still being consolidated into the shared RunManifest contract.",
    },
  ];
  return (
    <section id="how" className="relative py-28 px-6">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight max-w-3xl">
            The unit of work is a recorded run
          </h2>
          <p className="mt-4 max-w-3xl text-ink-mid leading-relaxed">
            Video alone does not say which instruction was active, why a step
            advanced, or which producer returned a verdict. OpenLabOS keeps
            those facts in one session so you do not reconstruct them after the
            fact.
          </p>
        </motion.div>

        <ol className="mt-14 grid gap-x-12 gap-y-10 md:grid-cols-2">
          {stages.map((stage, i) => (
            <motion.li
              key={stage.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{
                duration: 0.55,
                delay: i * 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="grid gap-3 sm:grid-cols-[3rem_1fr] sm:gap-5"
            >
              <span className="font-mono text-sm text-accent-300/90 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-xl font-medium text-ink-high">{stage.title}</h3>
                <p className="mt-2 text-sm text-ink-mid leading-relaxed">{stage.body}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function CurrentScopeSection() {
  const items = [
    {
      label: "Works without hardware",
      title: "Docker demonstration",
      body: "Compose serves the console, API, step-check service, and mock object detection. It can finish the kitchen protocol and keep the session after an API restart — no camera or cloud account.",
    },
    {
      label: "Hardware-dependent",
      title: "Live camera capture",
      body: "The Android adapter and reference app support the device path when hardware is set up. The webcam adapter is a scaffold; ROS 2 and serial are not implemented.",
    },
    {
      label: "Optional",
      title: "Local step checks",
      body: "Ollama or LM Studio can return structured judgments from a step and a frame. The mock provider proves the contract in tests; it does not look at the scene. Judgments are observations, not guaranteed recomputations.",
    },
    {
      label: "Experimental",
      title: "Detection and learning",
      body: "A GPU overlay can run Grounded SAM 2 with separate NVIDIA setup. Dataset prep, evaluation, and training utilities exist as offline research workflows, not as the live run path.",
    },
  ];
  return (
    <section className="relative py-28 px-6 border-t border-white/5">
      <div className="mx-auto max-w-5xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-3xl md:text-4xl font-semibold tracking-tight"
        >
          What works today
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 max-w-3xl text-ink-mid leading-relaxed"
        >
          Start with the software-only demonstration. Cameras, local models,
          GPU detection, and offline learning need extra setup and remain
          optional or experimental. This is research software — not validated
          for clinical, diagnostic, or regulated use.
        </motion.p>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{
                duration: 0.6,
                delay: i * 0.04,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="rounded-xl border border-white/5 bg-surface-1/60 p-6"
            >
              <p className="text-[11px] uppercase tracking-[0.18em] font-mono text-accent-300">
                {item.label}
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink-high">
                {item.title}
              </h3>
              <p className="mt-3 text-sm text-ink-mid leading-relaxed">{item.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuickstartSection() {
  return (
    <section className="relative py-32 px-6 border-t border-white/5">
      <div className="mx-auto max-w-2xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-4xl md:text-5xl font-semibold tracking-tight"
        >
          Try the software-only path
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 text-ink-mid leading-relaxed"
        >
          Bring up Compose, then open the guided kitchen console. Mock object
          detection is enough for the demo. Add Ollama on the host only if you
          want interactive model judgments.
        </motion.p>
        <motion.pre
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 overflow-x-auto rounded-lg border border-white/10 bg-surface-1 px-5 py-4 text-sm font-mono text-accent-300"
        >
          docker compose up --build --wait
        </motion.pre>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-wrap gap-3"
        >
          <Link
            to="/operate/kitchen"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-accent-400 text-surface-0 font-medium hover:bg-accent-300 transition shadow-glow"
          >
            Open /operate/kitchen
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-ink-high border border-white/10 hover:border-accent-400/40 hover:text-accent-300 transition"
          >
            Inspect the dashboard
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
