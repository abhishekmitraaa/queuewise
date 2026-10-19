import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, Download, TriangleAlert } from "lucide-react";
import { downloadText } from "../lib/exportData";

interface Props {
  filenameBase: string;
  json: () => unknown;
  csv: () => string;
  label?: string;
}

type State = { status: "idle" } | { status: "done"; message: string } | { status: "error"; message: string };

export function ExportControls({ filenameBase, json, csv, label = "Export this run" }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });

  const run = (format: "json" | "csv") => {
    const filename = `${filenameBase}.${format}`;
    try {
      if (format === "json") downloadText(filename, JSON.stringify(json(), null, 2), "application/json");
      else downloadText(filename, csv(), "text/csv");
      setState({ status: "done", message: `Downloaded ${filename}` });
    } catch (e) {
      setState({ status: "error", message: `Export failed: ${e instanceof Error ? e.message : "unknown error"}` });
    }
  };

  return (
    <section className="panel flex flex-wrap items-center gap-3 border-accent/30 bg-accent-soft/50 px-5 py-4" aria-label={label}>
      <div className="mr-auto">
        <div className="font-semibold tracking-tight text-ink">{label}</div>
        <div className="text-xs text-ink-2">JSON keeps configuration, seed, metrics, findings and simulator version. CSV has one row per sample.</div>
      </div>
      <button type="button" className="btn-primary" onClick={() => run("json")}>
        <Download size={15} aria-hidden="true" /> Export JSON
      </button>
      <button type="button" className="btn-secondary" onClick={() => run("csv")}>
        <Download size={15} aria-hidden="true" /> Export CSV
      </button>
      <div role="status" aria-live="polite" className={`w-full text-xs ${state.status === "error" ? "text-danger" : "text-positive"}`}>
        <AnimatePresence mode="wait">
          {state.status !== "idle" && (
            <motion.span
              key={state.message}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 opacity-90"
            >
              {state.status === "done" ? <CircleCheck size={13} aria-hidden="true" /> : <TriangleAlert size={13} aria-hidden="true" />}
              {state.message}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
