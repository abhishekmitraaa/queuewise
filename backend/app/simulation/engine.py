"""Discrete-event engine for one bottleneck link.

Event ordering
--------------
Events live in a ``heapq`` keyed by ``(time_ms, kind, sequence)``:

1. earlier time first;
2. at equal times, by kind: PACKET_DELIVERY (0), TRANSMISSION_COMPLETE (1),
   ACK (2), LOSS_SIGNAL (3), PACKET_ARRIVAL (4), SAMPLE (5);
3. at equal time and kind, in the order the events were scheduled.

So when several things happen at the same instant, deliveries are recorded
first, then the link frees up and starts its next packet, then senders react
to feedback, then new arrivals are queued, and finally the periodic sample
observes the resulting state.

Responsive (tcp_like) feedback
------------------------------
The bottleneck is the sender's first hop (no delay before the queue) and the
reverse path is uncongested. An ACK reaches the sender one propagation delay
after the packet is delivered. A dropped packet is noticed (as if by
duplicate ACKs) after the packets queued behind it would have been ACKed:
``drop time + queued bytes ahead / capacity + packet serialization + 2 x
propagation delay``. Head drops (AQM) are therefore signalled sooner than
tail drops behind a long queue, as in real networks.

Termination
-----------
Flows generate packets only in [start_ms, min(stop_ms, duration_ms)). The
engine processes every event with ``time_ms <= duration_ms`` and then stops
without draining. Packets still queued, being transmitted or propagating at
that moment are reported as ``queued_at_end`` / ``in_flight_at_end`` and are
not counted as delivered or dropped, so

    generated == delivered + dropped + queued_at_end + in_flight_at_end.
"""

from __future__ import annotations

import heapq
import itertools
import math
from dataclasses import dataclass, field

from .config import RESPONSIVE_TRAFFIC_TYPES, SimulationConfig
from .link import BottleneckLink, serialization_time_ms
from .packet import Packet
from .strategies import DROP_AQM, DROP_OVERFLOW, create_strategy
from .traffic import ResponsiveSender, flow_arrivals

EV_DELIVERY = 0
EV_TX_COMPLETE = 1
EV_ACK = 2
EV_LOSS = 3
EV_ARRIVAL = 4
EV_SAMPLE = 5

DEFAULT_MAX_EVENTS = 5_000_000


class SimulationLimitError(RuntimeError):
    """Raised when a run would exceed the configured event budget."""


@dataclass
class FlowStats:
    flow_id: str
    generated: int = 0
    generated_bytes: int = 0
    delivered: int = 0
    delivered_bytes: int = 0
    dropped_overflow: int = 0
    dropped_aqm: int = 0
    queueing_delays_ms: list[float] = field(default_factory=list)
    end_to_end_delays_ms: list[float] = field(default_factory=list)

    @property
    def dropped(self) -> int:
        return self.dropped_overflow + self.dropped_aqm


@dataclass
class RawResult:
    config: SimulationConfig
    flows: list[FlowStats]
    samples: list[dict]
    transmitted_bytes: int
    packets_queued_at_end: int
    packets_in_flight_at_end: int
    peak_queue_bytes: int
    events_processed: int
    cwnd_reductions: dict[str, int] = field(default_factory=dict)


class SimulationEngine:
    def __init__(self, config: SimulationConfig, max_events: int = DEFAULT_MAX_EVENTS):
        self.config = config
        self.max_events = max_events

    def run(self) -> RawResult:
        cfg = self.config
        duration_ms = cfg.simulation.duration_ms
        interval_ms = cfg.simulation.sampling_interval_ms
        flow_ids = [f.flow_id for f in cfg.flows]
        stats = [FlowStats(fid) for fid in flow_ids]
        n_flows = len(flow_ids)

        heap: list[tuple[float, int, int, object]] = []
        seq = itertools.count()

        def push(time_ms: float, kind: int, payload: object) -> None:
            heapq.heappush(heap, (time_ms, kind, next(seq), payload))

        # Running counters for sampling (reset after each sample).
        drops = {DROP_OVERFLOW: 0, DROP_AQM: 0}
        acc_bits = [0] * n_flows
        acc_q_sum = [0.0] * n_flows
        acc_q_n = [0] * n_flows
        acc_q_max = 0.0
        acc_e2e_sum = 0.0
        acc_e2e_n = 0
        samples: list[dict] = []
        peak_queue_bytes = 0
        transmitted_bytes = 0

        capacity_mbps = cfg.link.capacity_mbps
        prop_ms = cfg.link.propagation_delay_ms

        def on_drop(packet: Packet, reason: str, now_ms: float) -> None:
            drops[reason] += 1
            fs = stats[packet.flow_index]
            if reason == DROP_AQM:
                fs.dropped_aqm += 1
            else:
                fs.dropped_overflow += 1
            if senders[packet.flow_index] is not None:
                notice_ms = (
                    serialization_time_ms(strategy.bytes_queued, capacity_mbps)
                    + serialization_time_ms(packet.size_bytes, capacity_mbps)
                    + 2 * prop_ms
                )
                push(now_ms + notice_ms, EV_LOSS, packet)

        senders: list[ResponsiveSender | None] = [
            ResponsiveSender(f, duration_ms) if f.traffic_type in RESPONSIVE_TRAFFIC_TYPES else None
            for f in cfg.flows
        ]
        strategy = create_strategy(cfg.strategy, cfg.link.queue_capacity_bytes, cfg.aqm, on_drop)
        link = BottleneckLink(capacity_mbps, prop_ms)

        def schedule_send(i: int, now_ms: float) -> None:
            t = senders[i].next_send_time(now_ms)
            if t is not None:
                push(t, EV_ARRIVAL, i)

        def start_next(now_ms: float) -> None:
            nonlocal acc_q_max
            packet = strategy.dequeue(now_ms)
            if packet is None:
                return
            packet.service_start_ms = now_ms
            qd = packet.queueing_delay_ms
            i = packet.flow_index
            acc_q_sum[i] += qd
            acc_q_n[i] += 1
            if qd > acc_q_max:
                acc_q_max = qd
            link.current = packet
            push(now_ms + link.serialization_time_ms(packet.size_bytes), EV_TX_COMPLETE, packet)

        arrivals = [
            None if senders[i] is not None else flow_arrivals(f, cfg.simulation.seed, duration_ms)
            for i, f in enumerate(cfg.flows)
        ]
        for i, it in enumerate(arrivals):
            if it is None:
                schedule_send(i, cfg.flows[i].start_ms)
                continue
            first = next(it, None)
            if first is not None:
                push(first, EV_ARRIVAL, i)

        n_samples = int(math.floor(duration_ms / interval_ms + 1e-9))
        for k in range(n_samples + 1):
            push(k * interval_ms, EV_SAMPLE, k)

        packet_ids = itertools.count()
        events = 0
        while heap:
            now_ms, kind, _, payload = heap[0]
            if now_ms > duration_ms:
                break
            heapq.heappop(heap)
            events += 1
            if events > self.max_events:
                raise SimulationLimitError(
                    f"simulation exceeded {self.max_events:,} events; reduce duration, offered load or flows"
                )

            if kind == EV_ARRIVAL:
                i = payload  # flow index
                flow = cfg.flows[i]
                packet = Packet(
                    packet_id=next(packet_ids),
                    flow_index=i,
                    flow_id=flow.flow_id,
                    size_bytes=flow.packet_size_bytes,
                    created_at_ms=now_ms,
                    enqueue_at_ms=now_ms,
                )
                fs = stats[i]
                fs.generated += 1
                fs.generated_bytes += packet.size_bytes
                sender = senders[i]
                if sender is not None:
                    sender.on_send(now_ms)
                if strategy.enqueue(packet, now_ms):
                    q = strategy.bytes_queued
                    if q > peak_queue_bytes:
                        peak_queue_bytes = q
                if sender is not None:
                    schedule_send(i, now_ms)
                else:
                    nxt = next(arrivals[i], None)
                    if nxt is not None:
                        push(nxt, EV_ARRIVAL, i)
                if not link.busy:
                    start_next(now_ms)

            elif kind == EV_ACK:
                packet = payload
                senders[packet.flow_index].on_ack()
                schedule_send(packet.flow_index, now_ms)

            elif kind == EV_LOSS:
                packet = payload
                senders[packet.flow_index].on_loss(packet.created_at_ms, now_ms)
                schedule_send(packet.flow_index, now_ms)

            elif kind == EV_TX_COMPLETE:
                packet = payload
                packet.tx_end_ms = now_ms
                transmitted_bytes += packet.size_bytes
                link.current = None
                push(now_ms + link.propagation_delay_ms, EV_DELIVERY, packet)
                start_next(now_ms)

            elif kind == EV_DELIVERY:
                packet = payload
                packet.delivered_at_ms = now_ms
                i = packet.flow_index
                fs = stats[i]
                fs.delivered += 1
                fs.delivered_bytes += packet.size_bytes
                fs.queueing_delays_ms.append(packet.queueing_delay_ms)
                e2e = now_ms - packet.created_at_ms
                fs.end_to_end_delays_ms.append(e2e)
                acc_bits[i] += packet.size_bytes * 8
                acc_e2e_sum += e2e
                acc_e2e_n += 1
                if senders[i] is not None:
                    push(now_ms + prop_ms, EV_ACK, packet)

            else:  # EV_SAMPLE
                k = payload
                total_q_n = sum(acc_q_n)
                bits = sum(acc_bits)
                denom = interval_ms * 1000.0  # bits / (interval_ms * 1000) = Mbps
                samples.append(
                    {
                        "time_ms": now_ms,
                        "queue_occupancy_bytes": strategy.bytes_queued,
                        "queue_occupancy_packets": strategy.packets_queued,
                        "mean_queueing_delay_ms": (sum(acc_q_sum) / total_q_n) if total_q_n else None,
                        "max_queueing_delay_ms": acc_q_max if total_q_n else None,
                        "mean_end_to_end_delay_ms": (acc_e2e_sum / acc_e2e_n) if acc_e2e_n else None,
                        "throughput_mbps": (bits / denom) if k > 0 else 0.0,
                        "cumulative_drops": drops[DROP_OVERFLOW] + drops[DROP_AQM],
                        "cumulative_overflow_drops": drops[DROP_OVERFLOW],
                        "cumulative_aqm_drops": drops[DROP_AQM],
                        "per_flow_throughput_mbps": {
                            flow_ids[j]: (acc_bits[j] / denom) if k > 0 else 0.0 for j in range(n_flows)
                        },
                        "per_flow_queueing_delay_ms": {
                            flow_ids[j]: (acc_q_sum[j] / acc_q_n[j]) if acc_q_n[j] else None
                            for j in range(n_flows)
                        },
                        "per_flow_cwnd_packets": {
                            flow_ids[j]: senders[j].cwnd for j in range(n_flows) if senders[j] is not None
                        },
                    }
                )
                acc_bits = [0] * n_flows
                acc_q_sum = [0.0] * n_flows
                acc_q_n = [0] * n_flows
                acc_q_max = 0.0
                acc_e2e_sum = 0.0
                acc_e2e_n = 0

        propagating = sum(1 for entry in heap if entry[1] == EV_DELIVERY)
        in_flight = propagating + (1 if link.busy else 0)
        cwnd_reductions = {
            flow_ids[j]: senders[j].reductions for j in range(n_flows) if senders[j] is not None
        }

        return RawResult(
            cwnd_reductions=cwnd_reductions,
            config=cfg,
            flows=stats,
            samples=samples,
            transmitted_bytes=transmitted_bytes,
            packets_queued_at_end=strategy.packets_queued,
            packets_in_flight_at_end=in_flight,
            peak_queue_bytes=peak_queue_bytes,
            events_processed=events,
        )


def estimate_packet_count(config: SimulationConfig) -> int:
    """Upper-bound estimate of generated packets, used for input validation."""
    total = 0.0
    for f in config.flows:
        if f.offered_rate_mbps <= 0:
            continue
        active_ms = max(0.0, min(f.stop_ms, config.simulation.duration_ms) - f.start_ms)
        bits = f.offered_rate_mbps * 1_000_000 * active_ms / 1000.0
        total += bits / (f.packet_size_bytes * 8)
    return int(math.ceil(total))
