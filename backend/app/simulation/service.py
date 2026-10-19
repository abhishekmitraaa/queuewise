"""High-level entry points: run one simulation or a comparison."""

from __future__ import annotations

import csv
import io
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from . import SIMULATOR_VERSION
from .config import SimulationConfig
from .engine import DEFAULT_MAX_EVENTS, SimulationEngine
from .findings import comparison_findings, run_findings
from .metrics import compute_metrics
from .strategies import STRATEGY_LABELS

ROUND_DIGITS = 4


def _round(value: Any) -> Any:
    if isinstance(value, float):
        return round(value, ROUND_DIGITS)
    if isinstance(value, dict):
        return {k: _round(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_round(v) for v in value]
    return value


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def run_simulation(config: SimulationConfig, max_events: int = DEFAULT_MAX_EVENTS) -> dict[str, Any]:
    started = time.perf_counter()
    raw = SimulationEngine(config, max_events=max_events).run()
    metrics, per_flow, fairness_note = compute_metrics(raw)
    metrics["fairness_note"] = fairness_note
    series = raw.samples
    findings = run_findings(config, metrics, per_flow, series)
    runtime_ms = (time.perf_counter() - started) * 1000.0
    return {
        "run_id": uuid.uuid4().hex[:12],
        "simulator_version": SIMULATOR_VERSION,
        "created_at": _now_iso(),
        "strategy": config.strategy,
        "strategy_label": STRATEGY_LABELS[config.strategy],
        "configuration": config.to_dict(),
        "metrics": _round(metrics),
        "time_series": _round(series),
        "per_flow": _round(per_flow),
        "findings": findings,
        "runtime_ms": round(runtime_ms, 1),
    }


def _flatten(prefix: str, value: Any, out: dict[str, Any]) -> None:
    if isinstance(value, dict):
        for k, v in value.items():
            _flatten(f"{prefix}.{k}" if prefix else k, v, out)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            _flatten(f"{prefix}.{i}", v, out)
    else:
        out[prefix] = value


def config_differences(configs: list[dict[str, Any]], labels: list[str]) -> list[dict[str, Any]]:
    """Parameters (other than strategy) whose values differ between configurations."""
    flat = []
    for cfg in configs:
        f: dict[str, Any] = {}
        _flatten("", {k: v for k, v in cfg.items() if k != "strategy"}, f)
        flat.append(f)
    keys = sorted(set().union(*flat))
    diffs = []
    for key in keys:
        values = [f.get(key) for f in flat]
        if any(v != values[0] for v in values):
            diffs.append({"parameter": key, "values": dict(zip(labels, values))})
    return diffs


def build_comparison(runs: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    differences = config_differences([r["configuration"] for r in runs], [r["run_id"] for r in runs])
    keys = [
        "mean_queueing_delay_ms",
        "p95_queueing_delay_ms",
        "mean_end_to_end_delay_ms",
        "p95_end_to_end_delay_ms",
        "throughput_mbps",
        "link_utilization",
        "drop_ratio",
        "delay_budget_violation_ratio",
        "jain_fairness_index",
    ]
    lower_is_better = {
        "mean_queueing_delay_ms",
        "p95_queueing_delay_ms",
        "mean_end_to_end_delay_ms",
        "p95_end_to_end_delay_ms",
        "drop_ratio",
        "delay_budget_violation_ratio",
    }
    best: dict[str, list[str]] = {}
    for key in keys:
        vals = [(r["run_id"], r["metrics"].get(key)) for r in runs if r["metrics"].get(key) is not None]
        if not vals:
            continue
        target = min(v for _, v in vals) if key in lower_is_better else max(v for _, v in vals)
        best[key] = [rid for rid, v in vals if v == target]
    return {
        "comparison_id": uuid.uuid4().hex[:12],
        "simulator_version": SIMULATOR_VERSION,
        "created_at": _now_iso(),
        "mode": mode,
        "controlled": not differences,
        "parameter_differences": differences,
        "best": best,
        "runs": runs,
        "findings": comparison_findings(runs, differences),
    }


def run_controlled_comparison(base: SimulationConfig, strategies: list[str]) -> dict[str, Any]:
    """Clone the base configuration and change only the strategy."""
    runs = [run_simulation(base.with_strategy(s)) for s in strategies]
    return build_comparison(runs, "controlled")


# ---------------------------------------------------------------- CSV export

BASE_COLUMNS = [
    "time_ms",
    "queue_occupancy_bytes",
    "queue_occupancy_packets",
    "mean_queueing_delay_ms",
    "max_queueing_delay_ms",
    "mean_end_to_end_delay_ms",
    "throughput_mbps",
    "cumulative_drops",
    "cumulative_overflow_drops",
    "cumulative_aqm_drops",
]


def _series_rows(run: dict[str, Any]) -> tuple[list[str], list[list[Any]]]:
    flow_ids = [f["flow_id"] for f in run["configuration"]["flows"]]
    cwnd_ids = [f["flow_id"] for f in run["configuration"]["flows"] if f["traffic_type"] == "tcp_like"]
    header = (
        BASE_COLUMNS
        + [f"throughput_mbps__{fid}" for fid in flow_ids]
        + [f"queueing_delay_ms__{fid}" for fid in flow_ids]
        + [f"cwnd_packets__{fid}" for fid in cwnd_ids]
    )
    rows = []
    for s in run["time_series"]:
        row = [s.get(c) for c in BASE_COLUMNS]
        row += [s["per_flow_throughput_mbps"].get(fid) for fid in flow_ids]
        row += [s["per_flow_queueing_delay_ms"].get(fid) for fid in flow_ids]
        row += [s.get("per_flow_cwnd_packets", {}).get(fid) for fid in cwnd_ids]
        rows.append(["" if v is None else v for v in row])
    return header, rows


def run_to_csv(run: dict[str, Any]) -> str:
    header, rows = _series_rows(run)
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["run_id", "strategy"] + header)
    for row in rows:
        writer.writerow([run["run_id"], run["strategy"]] + row)
    return buf.getvalue()


def comparison_to_csv(comparison: dict[str, Any]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    headers = [_series_rows(r)[0] for r in comparison["runs"]]
    # Union of columns, preserving order (runs in a comparison may differ in flows).
    columns: list[str] = []
    for h in headers:
        for c in h:
            if c not in columns:
                columns.append(c)
    writer.writerow(["run_id", "strategy"] + columns)
    for run, header in zip(comparison["runs"], headers):
        _, rows = _series_rows(run)
        for row in rows:
            by_col = dict(zip(header, row))
            writer.writerow([run["run_id"], run["strategy"]] + [by_col.get(c, "") for c in columns])
    return buf.getvalue()
