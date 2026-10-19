"""FQ-CoDel-inspired per-flow scheduling with AQM.

Educational approximation of RFC 8290 (Flow Queue CoDel):

* One queue per configured flow (keyed directly by flow_id; real FQ-CoDel
  hashes the 5-tuple into a fixed number of buckets, so collisions cannot
  happen here).
* Deficit round robin (DRR) with a byte quantum. Flows that become active are
  placed on a "new flows" list that is served before the "old flows" list,
  which favours sparse, low-rate flows (e.g. interactive traffic).
* A flow that empties while on the new list moves to the end of the old list
  (so it cannot game the priority); one that empties on the old list becomes
  inactive.
* Every flow queue runs its own CoDel-inspired control law.
* The buffer limit is shared. When it is exceeded, packets are dropped from
  the head of the flow with the largest backlog ("fattest" flow), so one
  heavy flow cannot push others out of the buffer.
* A packet larger than the whole buffer is dropped on arrival.

Simplifications: no hashing/collisions, no ECN, a single drop at a time on
overflow (Linux drops a batch), byte-accurate shared limit.
"""

from __future__ import annotations

from collections import deque

from ..packet import Packet
from .base import DROP_OVERFLOW, QueueStrategy
from .codel_inspired import CoDelQueue

NEW = "new"
OLD = "old"


class _FlowQueue:
    __slots__ = ("flow_id", "codel", "deficit", "list_tag")

    def __init__(self, flow_id: str, codel: CoDelQueue):
        self.flow_id = flow_id
        self.codel = codel
        self.deficit = 0
        self.list_tag: str | None = None


class FqCoDelStrategy(QueueStrategy):
    key = "fq_codel"
    label = "FQ-CoDel-inspired"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.quantum_bytes = self.aqm.quantum_bytes
        self._flows: dict[str, _FlowQueue] = {}
        self._new_flows: deque[_FlowQueue] = deque()
        self._old_flows: deque[_FlowQueue] = deque()

    def _flow(self, flow_id: str) -> _FlowQueue:
        fq = self._flows.get(flow_id)
        if fq is None:
            fq = _FlowQueue(flow_id, CoDelQueue(self.aqm.target_ms, self.aqm.interval_ms, self.drop_cb))
            self._flows[flow_id] = fq
        return fq

    def enqueue(self, packet: Packet, now_ms: float) -> bool:
        if packet.size_bytes > self.capacity_bytes:
            self._drop(packet, DROP_OVERFLOW, now_ms)
            return False
        fq = self._flow(packet.flow_id)
        fq.codel.push(packet)
        if fq.list_tag is None:
            fq.deficit = self.quantum_bytes
            fq.list_tag = NEW
            self._new_flows.append(fq)

        accepted = True
        while self.bytes_queued > self.capacity_bytes:
            fattest = max(self._flows.values(), key=lambda q: q.codel.bytes)
            dropped = fattest.codel.drop_head(DROP_OVERFLOW, now_ms)
            if dropped is packet:
                accepted = False
        return accepted

    def dequeue(self, now_ms: float) -> Packet | None:
        while True:
            if self._new_flows:
                active = self._new_flows
            elif self._old_flows:
                active = self._old_flows
            else:
                return None
            fq = active[0]

            if fq.deficit <= 0:
                # Used up its quantum: top up and go to the back of the old list.
                fq.deficit += self.quantum_bytes
                active.popleft()
                fq.list_tag = OLD
                self._old_flows.append(fq)
                continue

            packet = fq.codel.dequeue(now_ms)
            if packet is None:
                active.popleft()
                if active is self._new_flows:
                    fq.list_tag = OLD
                    self._old_flows.append(fq)
                else:
                    fq.list_tag = None
                continue

            fq.deficit -= packet.size_bytes
            return packet

    @property
    def bytes_queued(self) -> int:
        return sum(q.codel.bytes for q in self._flows.values())

    @property
    def packets_queued(self) -> int:
        return sum(len(q.codel) for q in self._flows.values())

    def flow_backlog_bytes(self) -> dict[str, int]:
        return {fid: q.codel.bytes for fid, q in self._flows.items()}
