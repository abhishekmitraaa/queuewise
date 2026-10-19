import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import type { Route } from "../lib/useHashRoute";

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

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--color-raised)" />
      <rect x="6" y="9" width="4" height="14" rx="1.5" fill="var(--color-accent)" />
      <rect x="12" y="9" width="4" height="14" rx="1.5" fill="var(--color-accent)" opacity=".75" />
      <rect x="18" y="9" width="4" height="14" rx="1.5" fill="var(--color-accent)" opacity=".45" />
      <path d="M24 16h4" stroke="var(--color-ink)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function AppShell({ route, onNavigate, status, version, children }: Props) {
  const statusText =
    status === "online" ? `Simulator online${version ? ` · v${version}` : ""}` : status === "offline" ? "Simulator offline" : "Connecting…";
  const dot = status === "online" ? "bg-positive" : status === "offline" ? "bg-danger" : "bg-ink-3";
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1 focus:text-accent-ink">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <a href="#/lab" className="flex items-center gap-2.5" onClick={() => onNavigate("lab")}>
            <Logo />
            <span className="font-display text-xl font-semibold tracking-tight">QueueWise</span>
          </a>
          <nav aria-label="Main" className="order-3 flex w-full gap-1 sm:order-none sm:w-auto">
            {NAV.map((n) => (
              <a
                key={n.route}
                href={`#/${n.route}`}
                aria-current={route === n.route ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  route === n.route ? "bg-raised text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="flex items-center gap-2 text-ink-2" role="status" aria-live="polite">
              <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
              {statusText}
            </span>
            <span
              className="flex items-center gap-1.5 rounded-full border border-accent/50 px-2.5 py-0.5 text-xs text-accent"
              title="Every number in QueueWise comes from a software simulation, not from a real network or packet capture."
            >
              <FlaskConical size={13} aria-hidden="true" />
              Simulated data
            </span>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1320px] px-4 pb-16 pt-8 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-ink-3 sm:px-6">
          <span>QueueWise · Delay-aware queue management lab. All results are simulated on a single bottleneck link.</span>
          <a href="#/methodology" className="text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
            Assumptions and algorithm limitations
          </a>
        </div>
      </footer>
    </div>
  );
}
