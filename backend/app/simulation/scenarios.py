"""Scenario presets.

These are starting configurations, not expected outcomes. Each preset is a
complete simulation request (in the API's JSON shape) with strategy "fifo";
the UI lets the user switch strategy or run a controlled comparison.

Deviations from the original blueprint (all documented in docs/):
* Bulk transfers use the responsive "tcp_like" traffic type, because AQM only
  controls delay when senders react to drops. The open-loop 15 Mbps case is
  kept as the "Unresponsive Overload" preset to show that limit.
* In "Mixed Traffic" the bulk flow may send up to 12 Mbps instead of 8 Mbps;
  8 + 1 Mbps on a 10 Mbps link never builds a persistent queue, so the
  per-flow scheduling effect would not appear. "Below Capacity" covers that.
* "Fairness Duel" is an extra preset for the fairness lens.
"""

from __future__ import annotations

import copy
from typing import Any


def _flow(flow_id, name, rate, size, start=0, stop=10_000, traffic="constant_rate", **extra) -> dict[str, Any]:
    return {
        "flow_id": flow_id,
        "name": name,
        "traffic_type": traffic,
        "offered_rate_mbps": rate,
        "packet_size_bytes": size,
        "start_ms": start,
        "stop_ms": stop,
        "burst_on_ms": extra.get("burst_on_ms", 200),
        "burst_off_ms": extra.get("burst_off_ms", 300),
    }


def _config(queue_kb, flows, capacity=10, prop=20, duration=10_000, budget=20, seed=42) -> dict[str, Any]:
    return {
        "strategy": "fifo",
        "link": {"capacity_mbps": capacity, "propagation_delay_ms": prop, "queue_capacity_kb": queue_kb},
        "simulation": {
            "duration_ms": duration,
            "sampling_interval_ms": 50,
            "delay_budget_ms": budget,
            "seed": seed,
        },
        "aqm": {"target_ms": 5, "interval_ms": 100, "quantum_bytes": 1514},
        "flows": flows,
    }


SCENARIOS: list[dict[str, Any]] = [
    {
        "id": "bufferbloat",
        "label": "Bufferbloat: Large Buffer",
        "short_label": "Bufferbloat",
        "description": "A 15 Mbps bulk sender overloads a 10 Mbps link with a 256 KB buffer. Watch queueing delay climb while throughput stays at capacity.",
        "purpose": "Offered load exceeds capacity, so a large queue builds up and adds delay.",
        "config": _config(256, [_flow("bulk", "Bulk transfer (TCP-like)", 15, 1200, traffic="tcp_like")]),
    },
    {
        "id": "small_buffer",
        "label": "Small Buffer",
        "short_label": "Small Buffer",
        "description": "Same traffic and link as Bufferbloat, but only 24 KB of buffer. Lower delay, more drops: a trade-off, not a free win.",
        "purpose": "Illustrates the trade-off between queueing delay and packet drops.",
        "config": _config(24, [_flow("bulk", "Bulk transfer (TCP-like)", 15, 1200, traffic="tcp_like")]),
    },
    {
        "id": "mixed_traffic",
        "label": "Mixed Traffic",
        "short_label": "Mixed Traffic",
        "description": "A 12 Mbps bulk flow shares the link with a 1 Mbps interactive (voice/game-like) flow that starts at 1 s. Does the bulk flow's queue hurt the interactive flow?",
        "purpose": "Shows whether one flow's backlog affects another flow's latency and how per-flow scheduling changes that.",
        "config": _config(
            128,
            [
                _flow("bulk", "Bulk transfer (TCP-like)", 12, 1200, traffic="tcp_like"),
                _flow("interactive", "Interactive (voice/game)", 1, 300, start=1000),
            ],
        ),
    },
    {
        "id": "bursty",
        "label": "Bursty Traffic",
        "short_label": "Bursty Traffic",
        "description": "An ON/OFF video-like source bursts at 20 Mbps (about 6 Mbps on average) over a steady 3 Mbps Poisson background flow.",
        "purpose": "Compares short bursts against persistent overload; randomness is fixed by the seed.",
        "config": _config(
            128,
            [
                _flow("video", "Bursty video", 20, 1200, traffic="bursty", burst_on_ms=150, burst_off_ms=350),
                _flow("background", "Steady background", 3, 1000, traffic="poisson"),
            ],
        ),
    },
    {
        "id": "fairness_duel",
        "label": "Fairness Duel",
        "short_label": "Fairness Duel",
        "description": "A responsive TCP-like transfer competes with an unresponsive 8 Mbps flood that never slows down. How is the 10 Mbps link divided?",
        "purpose": "Fairness lens: in a shared queue the flow that backs off loses capacity; per-flow scheduling targets max-min fairness.",
        "config": _config(
            128,
            [
                _flow("tcp", "Responsive transfer (TCP-like)", 15, 1200, traffic="tcp_like"),
                _flow("flood", "Unresponsive flood (UDP-like)", 8, 1200),
            ],
        ),
    },
    {
        "id": "unresponsive_overload",
        "label": "Unresponsive Overload",
        "short_label": "Unresponsive",
        "description": "A 15 Mbps constant-rate (UDP-like) sender that ignores drops overloads a 10 Mbps link with a 256 KB buffer.",
        "purpose": "Shows the limit of AQM: dropping packets only reduces delay when senders respond to drops.",
        "config": _config(256, [_flow("bulk", "Constant-rate sender (UDP-like)", 15, 1200)]),
    },
    {
        "id": "below_capacity",
        "label": "Below Capacity",
        "short_label": "Below Capacity",
        "description": "About 6 Mbps of Poisson traffic on a 10 Mbps link. Queue-management choices should matter little here.",
        "purpose": "Shows that strategy differences are small when the link is not persistently congested.",
        "config": _config(
            256,
            [
                _flow("bulk", "Bulk transfer", 5, 1200, traffic="poisson"),
                _flow("interactive", "Interactive (voice/game)", 1, 300, start=1000, traffic="poisson"),
            ],
        ),
    },
]

DEFAULT_SCENARIO_ID = "bufferbloat"


def get_scenario(scenario_id: str) -> dict[str, Any] | None:
    for scenario in SCENARIOS:
        if scenario["id"] == scenario_id:
            return copy.deepcopy(scenario)
    return None


def list_scenarios() -> list[dict[str, Any]]:
    return copy.deepcopy(SCENARIOS)
