from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable

from ..config import AqmParams
from ..packet import Packet

# Called by a strategy whenever it discards a packet: (packet, reason, now_ms).
# Reasons: "overflow" (buffer full) or "aqm" (active queue management decision).
DropCallback = Callable[[Packet, str, float], None]

DROP_OVERFLOW = "overflow"
DROP_AQM = "aqm"


class QueueStrategy(ABC):
    """Interface shared by every queue discipline.

    The engine calls ``enqueue`` when a packet arrives and ``dequeue`` whenever
    the link is free and wants the next packet. A strategy may discard packets
    in either call; it must report every discard through ``drop_cb``.
    """

    key: str = ""
    label: str = ""

    def __init__(self, capacity_bytes: int, aqm: AqmParams, drop_cb: DropCallback):
        if capacity_bytes <= 0:
            raise ValueError("queue capacity must be positive")
        self.capacity_bytes = capacity_bytes
        self.aqm = aqm
        self.drop_cb = drop_cb

    @abstractmethod
    def enqueue(self, packet: Packet, now_ms: float) -> bool:
        """Accept or drop an arriving packet. Returns True if it was queued."""

    @abstractmethod
    def dequeue(self, now_ms: float) -> Packet | None:
        """Return the next packet to transmit, or None if nothing is queued."""

    @property
    @abstractmethod
    def bytes_queued(self) -> int: ...

    @property
    @abstractmethod
    def packets_queued(self) -> int: ...

    def _drop(self, packet: Packet, reason: str, now_ms: float) -> None:
        packet.drop_reason = reason
        self.drop_cb(packet, reason, now_ms)
