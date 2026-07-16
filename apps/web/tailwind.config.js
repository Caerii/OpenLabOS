/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        subtle: "rgb(var(--subtle) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        accentText: "rgb(var(--accent-text) / <alpha-value>)",
        accentFg: "rgb(var(--accent-fg) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        bg2: "rgb(var(--surface-3) / <alpha-value>)",
        surface: {
          0: "rgb(var(--surface-0) / <alpha-value>)",
          1: "rgb(var(--surface-1) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
          3: "rgb(var(--surface-3) / <alpha-value>)",
          4: "rgb(var(--surface-4) / <alpha-value>)",
        },
        overlay: {
          DEFAULT: "rgb(var(--overlay) / <alpha-value>)",
          hover: "rgb(var(--overlay-hover) / <alpha-value>)",
        },
        highlight: {
          DEFAULT: "rgb(var(--highlight) / <alpha-value>)",
          bg: "rgb(var(--highlight-bg) / <alpha-value>)",
          border: "rgb(var(--highlight-border) / <alpha-value>)",
        },
        good: {
          fg: "rgb(var(--good-fg) / <alpha-value>)",
          bg: "rgb(var(--good-bg) / <alpha-value>)",
          border: "rgb(var(--good-border) / <alpha-value>)",
        },
        warn: {
          fg: "rgb(var(--warn-fg) / <alpha-value>)",
          bg: "rgb(var(--warn-bg) / <alpha-value>)",
          border: "rgb(var(--warn-border) / <alpha-value>)",
          400: "#facc15",
        },
        bad: {
          fg: "rgb(var(--bad-fg) / <alpha-value>)",
          bg: "rgb(var(--bad-bg) / <alpha-value>)",
          border: "rgb(var(--bad-border) / <alpha-value>)",
          400: "#f87171",
        },
        info: {
          fg: "rgb(var(--info-fg) / <alpha-value>)",
          bg: "rgb(var(--info-bg) / <alpha-value>)",
          border: "rgb(var(--info-border) / <alpha-value>)",
        },
        ink: {
          high: "#e6f1ec",
          mid: "#9bb1aa",
          low: "#5d7370",
          muted: "#3a4a47",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#38bda7",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 60px -10px rgba(56,189,167,0.45)",
        ring: "inset 0 0 0 1px rgba(56,189,167,0.18)",
      },
      animation: {
        pulseGlow: "pulseGlow 2.4s ease-in-out infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(56,189,167,0.45)" },
          "50%": { boxShadow: "0 0 0 14px rgba(56,189,167,0)" },
        },
      },
    },
  },
  plugins: [],
};
