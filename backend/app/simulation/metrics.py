"""Metric definitions.

* Queueing delay: service start - enqueue time, over delivered packets.
* End-to-end delay: delivery time - arrival time
  = queueing delay + serialization delay + propagation delay (no other
  processing delay is modelled).
* Throughput: delivered packet bits / full simulation duration (s), in Mbps.
  The window is always the full configured duration, including warm-up.
* Link utilization: bits whose transmission completed / (capacity * duration).
* Drop ratio: dropped packets / generated packets (overflow and AQM drops are
  also reported separately).
* Delay-budget violation ratio: share of delivered packets whose queueing
  delay is strictly greater than the delay budget.
* Jain's fairness index: computed on each flow's delivered throughput divided
  by its max-min fair share of the link (so 1.0 means every flow got the
  share it was entitled to given its demand; TCP-like flows' demand is their
  configured maximum rate). The raw index on throughput
  alone is reported too. Both are null with fewer than two flows offering
  traffic or when nothing was delivered.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from .config import RESPONSIVE_TRAFFIC_TYPES
from .engine import RawResult


def mean(values: Sequence[float]) -> float | None:
    return (sum(values) / len(values)) if values else None


def percentile(values: Sequence[float], pct: float) -> float | None:
    """Percentile with linear interpolation between closest ranks (NumPy default)."""
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (pct / 100.0) * (len(ordered) - 1)
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return float(ordered[lo])
    frac = rank - lo
    return ordered[lo] + (ordered[hi] - ordered[lo]) * frac


def ratio(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def jain_index(values: Sequence[float]) -> float | None:
    """(sum x)^2 / (n * sum x^2); None if undefined (empty or all zero)."""
    if not values or any(v < 0 or not math.isfinite(v) for v in values):
        return None
    sq = sum(v * v for v in values)
    if sq == 0:
        return None
    return (sum(values) ** 2) / (len(values) * sq)


def max_min_fair_shares(demands_mbps: Sequence[float], capacity_mbps: float) -> list[float]:
    """Water-filling allocation: no flow gets more than it asks for, spare goes to the rest."""
    shares = [0.0] * len(demands_mbps)
    remaining = capacity_mbps
    active = [i for i, d in enumerate(demands_mbps) if d > 0]
    while active and remaining > 1e-12:
        equal = remaining / len(active)
        satisfied = [i for i in active if demands_mbps[i] - shares[i] <= equal]
        if not satisfied:
            for i in active:
                shares[i] += equal
            break
        for i in satisfied:
            remaining -= demands_mbps[i] - shares[i]
            shares[i] = demands_mbps[i]
        active = [i for i in active if i not in satisfied]
    return shares


def _mbps(bits: float, duration_ms: float) -> float:
    return bits / (duration_ms / 1000.0) / 1_000_000


def _demands_mbps(cfg, offered_mbps: Sequence[float]) -> list[float]:
    """Demand used for max-min fair shares, averaged over the full duration.

    Open-loop flows: their measured offered load. TCP-like flows adapt their
    rate to the network, so their demand is their configured maximum rate
    over the time they are active.
    """
    duration_ms = cfg.simulation.duration_ms
    demands = []
    for flow, offered in zip(cfg.flows, offered_mbps):
        if flow.traffic_type in RESPONSIVE_TRAFFIC_TYPES:
            active_ms = max(0.0, min(flow.stop_ms, duration_ms) - flow.start_ms)
            demands.append(flow.offered_rate_mbps * active_ms / duration_ms)
        else:
            demands.append(offered)
    return demands


def compute_metrics(raw: RawResult) -> tuple[dict, list[dict], str | None]:
    cfg = raw.config
    duration_ms = cfg.simulation.duration_ms
    budget_ms = cfg.simulation.delay_budget_ms
    capacity_mbps = cfg.link.capacity_mbps

    all_q: list[float] = []
    all_e2e: list[float] = []
    for fs in raw.flows:
        all_q.extend(fs.queueing_delays_ms)
        all_e2e.extend(fs.end_to_end_delays_ms)

    generated = sum(fs.generated for fs in raw.flows)
    delivered = sum(fs.delivered for fs in raw.flows)
    dropped_overflow = sum(fs.dropped_overflow for fs in raw.flows)
    dropped_aqm = sum(fs.dropped_aqm for fs in raw.flows)
    dropped = dropped_overflow + dropped_aqm
    delivered_bits = sum(fs.delivered_bytes for fs in raw.flows) * 8
    generated_bits = sum(fs.generated_bytes for fs in raw.flows) * 8
    violations = sum(1 for d in all_q if d > budget_ms)

    offered_mbps = [_mbps(fs.generated_bytes * 8, duration_ms) for fs in raw.flows]
    throughput_mbps = [_mbps(fs.delivered_bytes * 8, duration_ms) for fs in raw.flows]
    fair_shares = max_min_fair_shares(_demands_mbps(cfg, offered_mbps), capacity_mbps)

    # Fairness: only flows that offered traffic are comparable.
    included = [i for i, o in enumerate(offered_mbps) if o > 0]
    jain = jain_raw = None
    fairness_note: str | None = None
    if len(included) < 2:
        fairness_note = "Jain's index needs at least two flows offering traffic; this run has fewer."
    elif delivered == 0:
        fairness_note = "No packets were delivered, so throughput-based fairness is undefined."
    else:
        normalized = [throughput_mbps[i] / fair_shares[i] for i in included if fair_shares[i] > 0]
        jain = jain_index(normalized)
        jain_raw = jain_index([throughput_mbps[i] for i in included])
        demand_values = _demands_mbps(cfg, offered_mbps)
        demands = {round(demand_values[i], 3) for i in included}
        if len(demands) > 1:
            fairness_note = (
                "Flows offer different loads, so the index is computed on throughput relative to each "
                "flow's max-min fair share (1.0 = every flow received its fair share)."
            )
        else:
            fairness_note = "Flows offer equal load; the index compares their delivered throughput directly."

    samples = raw.samples
    occupancy = [s["queue_occupancy_bytes"] for s in samples]

    metrics = {
        "mean_queueing_delay_ms": mean(all_q),
        "p95_queueing_delay_ms": percentile(all_q, 95),
        "max_queueing_delay_ms": max(all_q) if all_q else None,
        "mean_end_to_end_delay_ms": mean(all_e2e),
        "p95_end_to_end_delay_ms": percentile(all_e2e, 95),
        "throughput_mbps": _mbps(delivered_bits, duration_ms),
        "offered_load_mbps": _mbps(generated_bits, duration_ms),
        "offered_load_ratio": ratio(_mbps(generated_bits, duration_ms), capacity_mbps),
        "link_utilization": ratio(_mbps(raw.transmitted_bytes * 8, duration_ms), capacity_mbps),
        "packets_generated": generated,
        "packets_delivered": delivered,
        "packets_dropped": dropped,
        "packets_dropped_overflow": dropped_overflow,
        "packets_dropped_aqm": dropped_aqm,
        "packets_queued_at_end": raw.packets_queued_at_end,
        "packets_in_flight_at_end": raw.packets_in_flight_at_end,
        "drop_ratio": ratio(dropped, generated),
        "overflow_drop_ratio": ratio(dropped_overflow, generated),
        "aqm_drop_ratio": ratio(dropped_aqm, generated),
        "delay_budget_ms": budget_ms,
        "delay_budget_violation_ratio": ratio(violations, len(all_q)),
        "mean_queue_occupancy_bytes": mean(occupancy) or 0.0,
        "peak_queue_occupancy_bytes": raw.peak_queue_bytes,
        "queue_capacity_bytes": cfg.link.queue_capacity_bytes,
        "jain_fairness_index": jain,
        "jain_fairness_index_raw": jain_raw,
        "events_processed": raw.events_processed,
    }

    per_flow = []
    for i, (flow, fs) in enumerate(zip(cfg.flows, raw.flows)):
        flow_violations = sum(1 for d in fs.queueing_delays_ms if d > budget_ms)
        per_flow.append(
            {
                "flow_id": flow.flow_id,
                "name": flow.name,
                "traffic_type": flow.traffic_type,
                "configured_rate_mbps": flow.offered_rate_mbps,
                "offered_load_mbps": offered_mbps[i],
                "throughput_mbps": throughput_mbps[i],
                "fair_share_mbps": fair_shares[i],
                "share_of_fair_share": ratio(throughput_mbps[i], fair_shares[i]) if fair_shares[i] > 0 else None,
                "packets_generated": fs.generated,
                "packets_delivered": fs.delivered,
                "packets_dropped": fs.dropped,
                "packets_dropped_overflow": fs.dropped_overflow,
                "packets_dropped_aqm": fs.dropped_aqm,
                "loss_ratio": ratio(fs.dropped, fs.generated),
                "mean_queueing_delay_ms": mean(fs.queueing_delays_ms),
                "p95_queueing_delay_ms": percentile(fs.queueing_delays_ms, 95),
                "mean_end_to_end_delay_ms": mean(fs.end_to_end_delays_ms),
                "p95_end_to_end_delay_ms": percentile(fs.end_to_end_delays_ms, 95),
                "delay_budget_violation_ratio": ratio(flow_violations, len(fs.queueing_delays_ms)),
                "cwnd_reductions": raw.cwnd_reductions.get(flow.flow_id),
            }
        )
    return metrics, per_flow, fairness_note
