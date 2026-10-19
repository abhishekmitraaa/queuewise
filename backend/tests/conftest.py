from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.simulation.config import (  # noqa: E402
    AqmParams,
    FlowConfig,
    LinkConfig,
    SimulationConfig,
    SimulationParams,
)
from app.simulation.packet import Packet  # noqa: E402


def make_flow(flow_id="a", rate=5.0, size=1000, start=0.0, stop=1000.0, traffic="constant_rate", **kw) -> FlowConfig:
    return FlowConfig(
        flow_id=flow_id,
        name=kw.pop("name", flow_id),
        traffic_type=traffic,
        offered_rate_mbps=rate,
        packet_size_bytes=size,
        start_ms=start,
        stop_ms=stop,
        **kw,
    )


def make_config(
    flows=None,
    strategy="fifo",
    capacity=10.0,
    prop=10.0,
    queue_kb=64.0,
    duration=1000.0,
    interval=50.0,
    budget=20.0,
    seed=1,
    aqm=None,
) -> SimulationConfig:
    return SimulationConfig(
        strategy=strategy,
        link=LinkConfig(capacity_mbps=capacity, propagation_delay_ms=prop, queue_capacity_kb=queue_kb),
        simulation=SimulationParams(duration_ms=duration, sampling_interval_ms=interval, delay_budget_ms=budget, seed=seed),
        flows=tuple(flows or [make_flow()]),
        aqm=aqm or AqmParams(),
    )


def make_packet(pid: int, flow_id="a", size=1000, t=0.0, flow_index=0) -> Packet:
    return Packet(packet_id=pid, flow_index=flow_index, flow_id=flow_id, size_bytes=size, created_at_ms=t, enqueue_at_ms=t)


class DropLog:
    def __init__(self):
        self.drops: list[tuple[int, str, float]] = []

    def __call__(self, packet, reason, now):
        self.drops.append((packet.packet_id, reason, now))

    def reasons(self):
        return [r for _, r, _ in self.drops]


@pytest.fixture
def drop_log():
    return DropLog()


@pytest.fixture
def api_request_body():
    return {
        "strategy": "fifo",
        "link": {"capacity_mbps": 10, "propagation_delay_ms": 20, "queue_capacity_kb": 64},
        "simulation": {"duration_ms": 2000, "sampling_interval_ms": 50, "delay_budget_ms": 20, "seed": 7},
        "flows": [
            {
                "flow_id": "bulk",
                "name": "Bulk",
                "traffic_type": "constant_rate",
                "offered_rate_mbps": 12,
                "packet_size_bytes": 1200,
                "start_ms": 0,
                "stop_ms": 2000,
            },
            {
                "flow_id": "interactive",
                "name": "Interactive",
                "traffic_type": "constant_rate",
                "offered_rate_mbps": 0.5,
                "packet_size_bytes": 300,
                "start_ms": 100,
                "stop_ms": 2000,
            },
        ],
    }
