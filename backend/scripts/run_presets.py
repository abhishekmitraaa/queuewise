"""Run every preset under every strategy and write a Markdown results table.

Usage (from the backend/ folder):
    .venv/Scripts/python scripts/run_presets.py            # Windows
    .venv/bin/python scripts/run_presets.py                # macOS / Linux
    ... scripts/run_presets.py --out ../docs/RESULTS.md

All numbers come from actual simulator runs (fixed seeds), so the table can be
regenerated at any time and used in a report.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.simulation import SIMULATOR_VERSION  # noqa: E402
from app.simulation.config import SimulationConfig  # noqa: E402
from app.simulation.scenarios import SCENARIOS  # noqa: E402
from app.simulation.service import run_controlled_comparison  # noqa: E402

STRATEGIES = ["fifo", "codel", "fq_codel"]


def fmt(v, digits=1, pct=False):
    if v is None:
        return "n/a"
    if pct:
        return f"{v * 100:.{digits}f}%"
    return f"{v:.{digits}f}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="write Markdown to this file instead of stdout")
    args = parser.parse_args()

    lines = [
        "# QueueWise results from actual simulator runs",
        "",
        f"Generated {date.today().isoformat()} by `backend/scripts/run_presets.py` with simulator v{SIMULATOR_VERSION}.",
        "Every value below is simulated (not measured on a real network) and reproducible: each preset uses seed 42.",
        "Queueing delays are over delivered packets; throughput is averaged over the full 10 s run.",
        "",
    ]
    for scenario in SCENARIOS:
        base = SimulationConfig.from_dict(scenario["config"])
        comparison = run_controlled_comparison(base, STRATEGIES)
        flows = ", ".join(f"{f.name} ({f.traffic_type}, {f.offered_rate_mbps:g} Mbps)" for f in base.flows)
        lines += [
            f"## {scenario['label']}",
            "",
            f"{scenario['purpose']}",
            "",
            f"Link {base.link.capacity_mbps:g} Mbps, {base.link.propagation_delay_ms:g} ms propagation, "
            f"{base.link.queue_capacity_kb:g} KB buffer; delay budget {base.simulation.delay_budget_ms:g} ms. Flows: {flows}.",
            "",
            "| Strategy | Mean queue delay (ms) | p95 queue delay (ms) | p95 end-to-end (ms) | Throughput (Mbps) | Drop ratio | Over budget | Jain's index |",
            "|---|---:|---:|---:|---:|---:|---:|---:|",
        ]
        for run in comparison["runs"]:
            m = run["metrics"]
            lines.append(
                f"| {run['strategy_label']} | {fmt(m['mean_queueing_delay_ms'])} | {fmt(m['p95_queueing_delay_ms'])} | "
                f"{fmt(m['p95_end_to_end_delay_ms'])} | {fmt(m['throughput_mbps'], 2)} | {fmt(m['drop_ratio'], 2, True)} | "
                f"{fmt(m['delay_budget_violation_ratio'], 1, True)} | {fmt(m['jain_fairness_index'], 3)} |"
            )
        if len(base.flows) > 1:
            lines += ["", "Per-flow p95 queueing delay (ms) / throughput (Mbps) / loss:", ""]
            lines.append("| Strategy | " + " | ".join(f.name for f in base.flows) + " |")
            lines.append("|---|" + "---:|" * len(base.flows))
            for run in comparison["runs"]:
                cells = [
                    f"{fmt(f['p95_queueing_delay_ms'])} / {fmt(f['throughput_mbps'], 2)} / {fmt(f['loss_ratio'], 1, True)}"
                    for f in run["per_flow"]
                ]
                lines.append(f"| {run['strategy_label']} | " + " | ".join(cells) + " |")
        lines += ["", "Findings from the comparison:", ""]
        lines += [f"- **{f['title']}.** {f['description']}" for f in comparison["findings"]]
        lines.append("")

    text = "\n".join(lines)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)


if __name__ == "__main__":
    main()
