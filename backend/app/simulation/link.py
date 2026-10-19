from __future__ import annotations

from dataclasses import dataclass

from .packet import Packet


def serialization_time_ms(size_bytes: int, capacity_mbps: float) -> float:
    """Time to put ``size_bytes`` on a link of ``capacity_mbps``.

    (S bytes * 8 bit/byte) / (C Mbps * 1,000,000 bit/s) gives seconds; * 1000 for ms.
    """
    return (size_bytes * 8) / (capacity_mbps * 1_000_000) * 1000.0


@dataclass
class BottleneckLink:
    """A single server that transmits one packet at a time."""

    capacity_mbps: float
    propagation_delay_ms: float
    current: Packet | None = None

    @property
    def busy(self) -> bool:
        return self.current is not None

    def serialization_time_ms(self, size_bytes: int) -> float:
        return serialization_time_ms(size_bytes, self.capacity_mbps)
