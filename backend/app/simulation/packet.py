from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Packet:
    """A packet travelling through the bottleneck. All times are in ms."""

    packet_id: int
    flow_index: int
    flow_id: str
    size_bytes: int
    # Arrival time at the bottleneck queue.
    created_at_ms: float
    # Time the packet entered its queue. Equal to created_at_ms in this model
    # (no processing delay before the queue), kept separate for clarity.
    enqueue_at_ms: float
    service_start_ms: float | None = None
    tx_end_ms: float | None = None
    delivered_at_ms: float | None = None
    drop_reason: str | None = None

    @property
    def queueing_delay_ms(self) -> float:
        """Time from entering the queue until transmission (service) starts."""
        if self.service_start_ms is None:
            raise ValueError("packet has not started service")
        return self.service_start_ms - self.enqueue_at_ms
