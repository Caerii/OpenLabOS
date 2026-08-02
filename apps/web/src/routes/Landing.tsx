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
              Run lab protocols.{" "}
              <span className="text-accent-400 glow-emerald">
                Keep a record of every step.
              </span>
            </motion.h1>

            <motion.p
              {...reveal(0.15)}
              className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-mid"
            >
              OpenLabOS is an open-source protocol runner for camera-assisted
              laboratory work. It presents one instruction at a time and links
              the protocol version to an append-only session history. Configured
              hardware and model paths can add camera evidence and judgments.
            </motion.p>

            <motion.div
              {...reveal(0.25)}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
              <Link
                to="/operate"
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
      body: "Each run starts from a specific protocol ID and version. The operator sees the current instruction, required objects, success criteria, and safety notes.",
    },
    {
      title: "Record what the operator does",
      body: "Starting, completing, or skipping a step appends an event to the session. A configured device adapter can add frames, preview video, and short clips.",
    },
    {
      title: "Request a step judgment",
      body: "When model checks are enabled, the API sends the current step and available evidence to the inference service. That service selects Ollama, LM Studio, or the deterministic provider and returns a structured verdict.",
    },
    {
      title: "Close the session",
      body: "The session store preserves the protocol reference and event history. The legacy kitchen workflow also writes media and review data while those records are being consolidated into the shared RunManifest contract.",
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
            A run is more than a video
          </h2>
          <p className="mt-4 max-w-3xl text-ink-mid leading-relaxed">
            Video alone does not say which instruction was active, why a step
            advanced, or which model produced a verdict. OpenLabOS keeps those
            facts together as one session instead of reconstructing them after
            the experiment.
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
      body: "The default Compose stack serves the web console, API, inference service, and deterministic object-detection backend. It can complete the kitchen protocol and persist the session across an API restart.",
    },
    {
      label: "Hardware-dependent",
      title: "Live camera capture",
      body: "The implemented Android adapter supports the reference device path. Camera glasses require device setup. The webcam adapter is still a scaffold; ROS 2 and serial adapters are planned.",
    },
    {
      label: "Optional",
      title: "Model-assisted step checks",
      body: "Ollama and LM Studio can produce structured judgments from protocol steps and visual evidence. The deterministic provider verifies the contract in tests but does not inspect the scene.",
    },
    {
      label: "Experimental",
      title: "Object detection and learning",
      body: "A GPU overlay exists for Grounded SAM 2, but it requires separate NVIDIA setup and model downloads. Dataset preparation, evaluation, and training utilities are present and remain research workflows.",
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
          What is available today
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 max-w-3xl text-ink-mid leading-relaxed"
        >
          The software-only demonstration is the verified starting point.
          Hardware capture, local model judgments, GPU object detection, and
          offline learning require additional setup and remain experimental or
          hardware-dependent. OpenLabOS is not validated for clinical,
          diagnostic, safety-critical, or regulated laboratory use.
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
          Run the software-only demonstration
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 text-ink-mid leading-relaxed"
        >
          Start the Compose stack, then open the guided kitchen console. The
          demonstration uses deterministic object detection and does not
          require a camera or cloud credentials. Ollama is needed only for
          interactive model judgments.
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
