from __future__ import annotations

from collections import deque

from ..packet import Packet
from .base import DROP_OVERFLOW, QueueStrategy


class FifoStrategy(QueueStrategy):
    """Single shared first-in, first-out queue with tail drop on overflow."""

    key = "fifo"
    label = "FIFO (tail drop)"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._queue: deque[Packet] = deque()
        self._bytes = 0

    def enqueue(self, packet: Packet, now_ms: float) -> bool:
        if self._bytes + packet.size_bytes > self.capacity_bytes:
            self._drop(packet, DROP_OVERFLOW, now_ms)
            return False
        self._queue.append(packet)
        self._bytes += packet.size_bytes
        return True

    def dequeue(self, now_ms: float) -> Packet | None:
        if not self._queue:
            return None
        packet = self._queue.popleft()
        self._bytes -= packet.size_bytes
        return packet

    @property
    def bytes_queued(self) -> int:
        return self._bytes

    @property
    def packets_queued(self) -> int:
        return len(self._queue)
