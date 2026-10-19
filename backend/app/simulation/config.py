"""Plain configuration objects for the simulator.

Units are part of every field name. Time is always milliseconds (float),
rates are megabits per second (1 Mbps = 1,000,000 bit/s), sizes are bytes,
and the queue capacity is configured in KB where 1 KB = 1024 bytes.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

BYTES_PER_KB = 1024

TRAFFIC_TYPES = ("constant_rate", "poisson", "bursty", "tcp_like")
RESPONSIVE_TRAFFIC_TYPES = ("tcp_like",)


@dataclass(frozen=True)
class FlowConfig:
    flow_id: str
    name: str
    traffic_type: str
    offered_rate_mbps: float
    packet_size_bytes: int
    start_ms: float
    stop_ms: float
    # offered_rate_mbps meaning per traffic type:
    #   constant_rate / poisson: the average sending rate;
    #   bursty: the peak rate during ON periods;
    #   tcp_like: the sender's maximum (access-link) rate; the actual rate is
    #             set by its congestion window.
    # Bursty flows only: mean ON / OFF period lengths.
    burst_on_ms: float = 200.0
    burst_off_ms: float = 300.0


@dataclass(frozen=True)
class LinkConfig:
    capacity_mbps: float
    propagation_delay_ms: float
    queue_capacity_kb: float

    @property
    def queue_capacity_bytes(self) -> int:
        return int(round(self.queue_capacity_kb * BYTES_PER_KB))


@dataclass(frozen=True)
class SimulationParams:
    duration_ms: float
    sampling_interval_ms: float
    delay_budget_ms: float
    seed: int


@dataclass(frozen=True)
class AqmParams:
    target_ms: float = 5.0
    interval_ms: float = 100.0
    quantum_bytes: int = 1514


@dataclass(frozen=True)
class SimulationConfig:
    strategy: str
    link: LinkConfig
    simulation: SimulationParams
    flows: tuple[FlowConfig, ...]
    aqm: AqmParams = field(default_factory=AqmParams)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["flows"] = [asdict(f) for f in self.flows]
        return data

    def with_strategy(self, strategy: str) -> "SimulationConfig":
        return SimulationConfig(
            strategy=strategy,
            link=self.link,
            simulation=self.simulation,
            flows=self.flows,
            aqm=self.aqm,
        )

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SimulationConfig":
        aqm = data.get("aqm") or {}
        return cls(
            strategy=data["strategy"],
            link=LinkConfig(**data["link"]),
            simulation=SimulationParams(**data["simulation"]),
            flows=tuple(FlowConfig(**f) for f in data["flows"]),
            aqm=AqmParams(**aqm),
        )
