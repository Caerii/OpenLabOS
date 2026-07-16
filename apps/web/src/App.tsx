import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api, type ApiHealth } from "./lib/api";

export function App() {
  const location = useLocation();
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const h = await api.health();
        if (!cancelled) {
          setHealth(h);
          setHealthErr(null);
        }
      } catch (e) {
        if (!cancelled) setHealthErr(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const online = !!health && !healthErr;
  const operateRoute = location.pathname.startsWith("/operate");

  if (operateRoute) {
    return <Outlet />;
  }

  return (
    <div className="shell-chrome min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-surface-0/70 border-b border-white/5">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <motion.span
              aria-hidden
              className="block w-2.5 h-2.5 rounded-full bg-accent-400"
              animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="font-semibold tracking-tight text-ink-high">
              OpenLab<span className="text-accent-400">OS</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavTab to="/" label="Home" exact />
            <NavTab to="/dashboard" label="Dashboard" />
            <NavTab to="/operate" label="Operate" />
          </nav>
          <div
            className="flex items-center gap-2 text-xs font-mono text-ink-mid"
            title={healthErr ?? "API health"}
          >
            <span
              className={[
                "block w-1.5 h-1.5 rounded-full",
                online ? "bg-accent-400 animate-pulseGlow" : "bg-bad-400",
              ].join(" ")}
            />
            {online
              ? `api · ${health.adapters} adapter${health.adapters === 1 ? "" : "s"}`
              : "api offline"}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-white/5 py-6 text-xs text-ink-low">
        <div className="mx-auto max-w-7xl px-6 flex items-center justify-between">
          <span className="font-mono">openlabos · open-source lab OS</span>
          <a
            href="https://github.com/Caerii/OpenLabOS"
            className="hover:text-accent-400 transition"
            target="_blank"
            rel="noreferrer noopener"
          >
            github
          </a>
        </div>
      </footer>
    </div>
  );
}

function NavTab({
  to,
  label,
  exact,
}: {
  to: string;
  label: string;
  exact?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        [
          "relative px-3 py-1.5 rounded-md transition",
          isActive ? "text-ink-high" : "text-ink-mid hover:text-ink-high",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {isActive && (
            <motion.span
              layoutId="nav-indicator"
              className="absolute inset-0 rounded-md bg-accent-400/10 ring-1 ring-accent-400/40 -z-10"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
        </>
      )}
    </NavLink>
  );
}
