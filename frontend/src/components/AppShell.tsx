import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FlaskConical, Moon, Sun } from "lucide-react";
import type { Route } from "../lib/useHashRoute";
import { useTheme } from "../lib/theme";
import { EASE_OUT } from "../lib/motion";

export type BackendStatus = "checking" | "online" | "offline";

interface Props {
  route: Route;
  onNavigate: (r: Route) => void;
  status: BackendStatus;
  version: string | null;
  children: ReactNode;
}

const NAV: { route: Route; label: string }[] = [
  { route: "lab", label: "Simulation Lab" },
  { route: "compare", label: "Compare" },
  { route: "methodology", label: "Methodology" },
];

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--color-ink)" />
      <rect x="6" y="9" width="4" height="14" rx="2" fill="var(--color-accent)" />
      <rect x="12" y="12" width="4" height="11" rx="2" fill="var(--color-accent)" opacity=".7" />
      <rect x="18" y="15" width="4" height="8" rx="2" fill="var(--color-accent)" opacity=".45" />
      <path d="M24 19h3" stroke="var(--color-canvas)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-line bg-panel text-ink-2 transition-colors hover:text-ink"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 40 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          className="grid place-items-center"
        >
          {dark ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function AppShell({ route, onNavigate, status, version, children }: Props) {
  const statusText =
    status === "online" ? `Simulator online${version ? ` v${version}` : ""}` : status === "offline" ? "Simulator offline" : "Connecting";
  const dot = status === "online" ? "bg-positive" : status === "offline" ? "bg-danger" : "bg-ink-3";
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-1.5 focus:text-accent-ink"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:h-16 lg:flex-nowrap lg:py-0">
          <a href="#/lab" className="flex items-center gap-2.5" onClick={() => onNavigate("lab")}>
            <Logo />
            <span className="text-lg font-semibold tracking-tight">QueueWise</span>
          </a>
          <nav aria-label="Main" className="order-3 w-full sm:order-none sm:w-auto">
            <ul className="flex gap-1 rounded-full border border-line bg-panel p-1">
              {NAV.map((n) => {
                const active = route === n.route;
                return (
                  <li key={n.route} className="relative flex-1 sm:flex-none">
                    {active && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-full bg-ink"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <a
                      href={`#/${n.route}`}
                      aria-current={active ? "page" : undefined}
                      className={`relative block whitespace-nowrap rounded-full px-2.5 py-1.5 text-center text-[13px] font-medium transition-colors sm:px-3.5 sm:text-sm ${
                        active ? "text-canvas" : "text-ink-2 hover:text-ink"
                      }`}
                    >
                      {n.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2.5 text-sm">
            <span className="hidden items-center gap-2 text-ink-2 md:flex" role="status" aria-live="polite">
              <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
              {statusText}
            </span>
            <span
              className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent"
              title="Every number in QueueWise comes from a software simulation, not from a real network or packet capture."
            >
              <FlaskConical size={13} aria-hidden="true" />
              Simulated data
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1360px] flex-1 px-4 pb-20 pt-10 sm:px-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={route}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-ink-3 sm:px-6">
          <span className="flex items-center gap-2">
            <Logo className="h-5 w-5" />
            QueueWise. Every result is simulated on a single bottleneck link.
          </span>
          <a href="#/methodology" className="text-ink-2 underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent">
            Assumptions and algorithm limitations
          </a>
          <span className="flex items-center gap-2 md:hidden" role="status">
            <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
            {statusText}
          </span>
        </div>
      </footer>
    </div>
  );
}
