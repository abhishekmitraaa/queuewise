import { useState } from "react";
import { Download } from "lucide-react";
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
    <section className="panel flex flex-wrap items-center gap-3 p-4" aria-label={label}>
      <div className="mr-auto">
        <div className="font-display text-[15px] font-semibold text-ink">{label}</div>
        <div className="text-xs text-ink-3">
          JSON: configuration, seed, metrics, findings and simulator version. CSV: one row per time-series sample.
        </div>
      </div>
      <button type="button" className="btn-secondary" onClick={() => run("json")}>
        <Download size={15} aria-hidden="true" /> Export JSON
      </button>
      <button type="button" className="btn-secondary" onClick={() => run("csv")}>
        <Download size={15} aria-hidden="true" /> Export CSV
      </button>
      <p role="status" aria-live="polite" className={`w-full text-xs ${state.status === "error" ? "text-danger" : "text-positive"}`}>
        {state.status === "idle" ? "" : state.message}
      </p>
    </section>
  );
}
