"""Request schemas and validation limits.

Field-level checks live on the models; checks that span several fields
(flow times vs duration, sample count, packet budget) are done by
``cross_validate`` so each error can still point at a specific field.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..simulation.config import AqmParams, FlowConfig, LinkConfig, SimulationConfig, SimulationParams
from ..simulation.engine import estimate_packet_count

StrategyKey = Literal["fifo", "codel", "fq_codel"]
TrafficType = Literal["constant_rate", "poisson", "bursty", "tcp_like"]

MAX_FLOWS = 8
MAX_DURATION_MS = 60_000
MAX_SAMPLES = 2_000
MAX_ESTIMATED_PACKETS = 600_000
# Total across every run in one request (a comparison simulates several runs).
MAX_ESTIMATED_PACKETS_PER_REQUEST = 1_200_000


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class FlowIn(_Strict):
    flow_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$", description="Letters, digits, '-' or '_' (max 32)")
    name: str = Field(min_length=1, max_length=60)
    traffic_type: TrafficType = "constant_rate"
    offered_rate_mbps: float = Field(ge=0, le=1000)
    packet_size_bytes: int = Field(ge=64, le=9000)
    start_ms: float = Field(ge=0)
    stop_ms: float = Field(gt=0)
    burst_on_ms: float = Field(default=200, gt=0, le=60_000)
    burst_off_ms: float = Field(default=300, gt=0, le=60_000)


class LinkIn(_Strict):
    capacity_mbps: float = Field(gt=0, le=1000)
    propagation_delay_ms: float = Field(ge=0, le=1000)
    queue_capacity_kb: float = Field(gt=0, le=16_384)


class SimulationParamsIn(_Strict):
    duration_ms: float = Field(ge=100, le=MAX_DURATION_MS)
    sampling_interval_ms: float = Field(ge=1, le=10_000)
    delay_budget_ms: float = Field(gt=0, le=10_000)
    seed: int = Field(ge=0, le=2**31 - 1)


class AqmIn(_Strict):
    target_ms: float = Field(default=5, gt=0, le=1000)
    interval_ms: float = Field(default=100, ge=1, le=10_000)
    quantum_bytes: int = Field(default=1514, ge=64, le=65_535)


class SimulationRequest(_Strict):
    strategy: StrategyKey = "fifo"
    link: LinkIn
    simulation: SimulationParamsIn
    flows: list[FlowIn] = Field(min_length=1, max_length=MAX_FLOWS)
    aqm: AqmIn = Field(default_factory=AqmIn)

    def to_config(self) -> SimulationConfig:
        return SimulationConfig(
            strategy=self.strategy,
            link=LinkConfig(**self.link.model_dump()),
            simulation=SimulationParams(**self.simulation.model_dump()),
            flows=tuple(FlowConfig(**f.model_dump()) for f in self.flows),
            aqm=AqmParams(**self.aqm.model_dump()),
        )


class CompareRequest(_Strict):
    """Exactly one of three modes:

    * controlled: base_config + strategies (the base is cloned, only the strategy changes);
    * configs: a list of full configurations, each simulated as given;
    * run_ids: runs already stored in this backend process.
    """

    base_config: SimulationRequest | None = None
    strategies: list[StrategyKey] | None = Field(default=None, min_length=2, max_length=3)
    configs: list[SimulationRequest] | None = Field(default=None, min_length=2, max_length=6)
    run_ids: list[str] | None = Field(default=None, min_length=2, max_length=6)


def request_budget_errors(configs: list[SimulationRequest], field: str) -> list[dict[str, str]]:
    """Limit the total work of one request, so multi-run comparisons can't multiply the per-run cap."""
    total = sum(estimate_packet_count(c.to_config()) for c in configs)
    if total <= MAX_ESTIMATED_PACKETS_PER_REQUEST:
        return []
    return [
        {
            "field": field,
            "message": f"This comparison would simulate about {total:,} packets in total (limit {MAX_ESTIMATED_PACKETS_PER_REQUEST:,} "
            "per request). Compare fewer runs or reduce duration or offered rates.",
        }
    ]


def cross_validate(req: SimulationRequest, prefix: str = "") -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []

    def err(field: str, message: str) -> None:
        errors.append({"field": prefix + field, "message": message})

    duration = req.simulation.duration_ms
    samples = duration / req.simulation.sampling_interval_ms
    if samples > MAX_SAMPLES:
        err(
            "simulation.sampling_interval_ms",
            f"Too many samples ({samples:,.0f}); use an interval of at least {duration / MAX_SAMPLES:g} ms for this duration.",
        )
    if req.simulation.sampling_interval_ms > duration:
        err("simulation.sampling_interval_ms", "Sampling interval must not exceed the simulation duration.")

    seen: set[str] = set()
    for i, flow in enumerate(req.flows):
        if flow.flow_id in seen:
            err(f"flows.{i}.flow_id", f"Flow id '{flow.flow_id}' is used more than once.")
        seen.add(flow.flow_id)
        if flow.stop_ms <= flow.start_ms:
            err(f"flows.{i}.stop_ms", "Stop time must be greater than start time.")
        if flow.stop_ms > duration:
            err(f"flows.{i}.stop_ms", f"Stop time must be within the simulation duration ({duration:g} ms).")
        if flow.start_ms >= duration:
            err(f"flows.{i}.start_ms", "Start time must be before the end of the simulation.")
        if flow.packet_size_bytes > req.link.queue_capacity_kb * 1024:
            err(f"flows.{i}.packet_size_bytes", "Packet size is larger than the whole queue capacity.")

    if not errors:
        estimate = estimate_packet_count(req.to_config())
        if estimate > MAX_ESTIMATED_PACKETS:
            err(
                "flows",
                f"This configuration would generate about {estimate:,} packets (limit {MAX_ESTIMATED_PACKETS:,}). "
                "Reduce duration, offered rates, or use larger packets.",
            )
    return errors
