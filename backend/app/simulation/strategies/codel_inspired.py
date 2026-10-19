"""CoDel-inspired active queue management.

Educational approximation of the control logic in RFC 8289 (Controlled Delay).
It follows the RFC's dequeue-side state machine:

* Each packet's sojourn time (now - enqueue time) is checked when it is
  dequeued for transmission.
* A single packet above ``target`` is tolerated. Only when sojourn time has
  stayed above ``target`` for at least ``interval`` does the queue enter the
  dropping state (persistent-delay detection, not a per-packet threshold).
* In the dropping state the next drop is scheduled with the control law
  ``drop_next = t + interval / sqrt(count)``, so drops become more frequent
  the longer delay stays high, and the state is left as soon as sojourn time
  falls below ``target``.
* If the dropping state is re-entered soon after leaving it, ``count`` resumes
  from the number of drops in the previous episode instead of restarting at 1.

Simplifications (why it is "inspired", not standards-compliant): no ECN
marking (packets are dropped, never marked), floating-point millisecond
clock, byte-based tail drop when the shared buffer is full, and no validation
against the reference implementation.
"""

from __future__ import annotations

import math
from collections import deque

from ..packet import Packet
from .base import DROP_AQM, DROP_OVERFLOW, DropCallback, QueueStrategy


class CoDelQueue:
    """One packet queue governed by the CoDel-inspired control law."""

    def __init__(self, target_ms: float, interval_ms: float, drop_cb: DropCallback):
        self.target_ms = target_ms
        self.interval_ms = interval_ms
        self._drop_cb = drop_cb
        self.packets: deque[Packet] = deque()
        self.bytes = 0
        self.max_packet_bytes = 0
        # Control state (names follow RFC 8289).
        self.first_above_time: float | None = None
        self.drop_next = 0.0
        self.count = 0
        self.lastcount = 0
        self.dropping = False

    def __len__(self) -> int:
        return len(self.packets)

    def push(self, packet: Packet) -> None:
        self.packets.append(packet)
        self.bytes += packet.size_bytes
        self.max_packet_bytes = max(self.max_packet_bytes, packet.size_bytes)

    def drop_head(self, reason: str, now_ms: float) -> Packet | None:
        """Remove and discard the head packet (used for buffer-overflow drops)."""
        if not self.packets:
            return None
        packet = self.packets.popleft()
        self.bytes -= packet.size_bytes
        packet.drop_reason = reason
        self._drop_cb(packet, reason, now_ms)
        return packet

    def _control_law(self, t_ms: float) -> float:
        return t_ms + self.interval_ms / math.sqrt(self.count)

    def _do_dequeue(self, now_ms: float) -> tuple[Packet | None, bool]:
        if not self.packets:
            self.first_above_time = None
            return None, False
        packet = self.packets.popleft()
        self.bytes -= packet.size_bytes
        sojourn_ms = now_ms - packet.enqueue_at_ms
        ok_to_drop = False
        # Below target, or less than one packet left queued: delay is fine.
        if sojourn_ms < self.target_ms or self.bytes <= self.max_packet_bytes:
            self.first_above_time = None
        elif self.first_above_time is None:
            # Sojourn just went above target: start the persistence timer.
            self.first_above_time = now_ms + self.interval_ms
        elif now_ms >= self.first_above_time:
            # Above target for at least one interval.
            ok_to_drop = True
        return packet, ok_to_drop

    def _aqm_drop(self, packet: Packet, now_ms: float) -> None:
        packet.drop_reason = DROP_AQM
        self._drop_cb(packet, DROP_AQM, now_ms)

    def dequeue(self, now_ms: float) -> Packet | None:
        packet, ok_to_drop = self._do_dequeue(now_ms)
        if packet is None:
            self.dropping = False
            return None

        if self.dropping:
            if not ok_to_drop:
                # Sojourn time fell below target: leave the dropping state.
                self.dropping = False
            else:
                while self.dropping and now_ms >= self.drop_next:
                    self._aqm_drop(packet, now_ms)
                    self.count += 1
                    packet, ok_to_drop = self._do_dequeue(now_ms)
                    if packet is None or not ok_to_drop:
                        self.dropping = False
                    else:
                        self.drop_next = self._control_law(self.drop_next)
        elif ok_to_drop:
            # Enter the dropping state: drop this packet, send the next one.
            self._aqm_drop(packet, now_ms)
            packet, ok_to_drop = self._do_dequeue(now_ms)
            self.dropping = True
            delta = self.count - self.lastcount
            if delta > 1 and now_ms - self.drop_next < 16 * self.interval_ms:
                self.count = delta
            else:
                self.count = 1
            self.lastcount = self.count
            self.drop_next = self._control_law(now_ms)
        return packet


class CoDelStrategy(QueueStrategy):
    """Single shared queue with the CoDel-inspired control law at dequeue."""

    key = "codel"
    label = "CoDel-inspired AQM"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._queue = CoDelQueue(self.aqm.target_ms, self.aqm.interval_ms, self.drop_cb)

    def enqueue(self, packet: Packet, now_ms: float) -> bool:
        # Tail drop still applies when the finite buffer is full.
        if self._queue.bytes + packet.size_bytes > self.capacity_bytes:
            self._drop(packet, DROP_OVERFLOW, now_ms)
            return False
        self._queue.push(packet)
        return True

    def dequeue(self, now_ms: float) -> Packet | None:
        return self._queue.dequeue(now_ms)

    @property
    def bytes_queued(self) -> int:
        return self._queue.bytes

    @property
    def packets_queued(self) -> int:
        return len(self._queue)

    @property
    def codel_state(self) -> CoDelQueue:
        return self._queue
