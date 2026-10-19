"""Traffic generators.

Open-loop flows (constant_rate, poisson, bursty) yield packet arrival times
(ms) at the bottleneck regardless of what happens to earlier packets, like
UDP traffic. Generators are lazy so long runs do not materialise every packet
up front. Responsive "tcp_like" flows are driven by ``ResponsiveSender``
instead, which reacts to ACKs and losses.

Randomness comes from a per-flow ``random.Random`` seeded with the run seed and
the flow id, so flows never share random state and the same seed always
produces the same arrivals (Python seeds string inputs deterministically).
"""

from __future__ import annotations

import math
import random
from collections.abc import Iterator

from .config import FlowConfig


def packet_interval_ms(packet_size_bytes: int, rate_mbps: float) -> float:
    """Spacing between packets that produces ``rate_mbps`` of packet bits."""
    bits = packet_size_bytes * 8
    rate_bits_per_s = rate_mbps * 1_000_000
    return bits / rate_bits_per_s * 1000.0


def flow_rng(seed: int, flow_id: str) -> random.Random:
    return random.Random(f"queuewise:{seed}:{flow_id}")


def flow_arrivals(flow: FlowConfig, seed: int, duration_ms: float) -> Iterator[float]:
    """Yield strictly increasing arrival times in [start_ms, min(stop_ms, duration_ms))."""
    if flow.offered_rate_mbps <= 0:
        return
    end_ms = min(flow.stop_ms, duration_ms)
    if end_ms <= flow.start_ms:
        return
    interval_ms = packet_interval_ms(flow.packet_size_bytes, flow.offered_rate_mbps)
    rng = flow_rng(seed, flow.flow_id)

    if flow.traffic_type == "constant_rate":
        # Multiply instead of accumulating to avoid floating-point drift.
        k = 0
        while True:
            t = flow.start_ms + k * interval_ms
            if t >= end_ms:
                return
            yield t
            k += 1

    elif flow.traffic_type == "poisson":
        # Exponential inter-arrival times with the same mean rate.
        t = flow.start_ms + rng.expovariate(1.0 / interval_ms)
        while t < end_ms:
            yield t
            t += rng.expovariate(1.0 / interval_ms)

    elif flow.traffic_type == "bursty":
        # ON/OFF source: exponentially distributed ON and OFF periods; packets
        # are sent at the peak rate (offered_rate_mbps) while ON.
        period_start = flow.start_ms
        while period_start < end_ms:
            on_ms = rng.expovariate(1.0 / flow.burst_on_ms)
            period_end = min(period_start + on_ms, end_ms)
            k = 0
            while True:
                t = period_start + k * interval_ms
                # Always emit at least the first packet of a burst.
                if t >= end_ms or (k > 0 and t >= period_end):
                    break
                yield t
                k += 1
            last_sent = period_start + (k - 1) * interval_ms
            off_ms = rng.expovariate(1.0 / flow.burst_off_ms)
            # Next burst starts after the OFF period, never before the last packet.
            period_start = max(period_end, last_sent + interval_ms) + off_ms

    else:
        raise ValueError(f"unknown traffic type: {flow.traffic_type}")


INITIAL_CWND_PACKETS = 10.0
MAX_CWND_PACKETS = 100_000.0


class ResponsiveSender:
    """Simplified TCP-like (AIMD) sender, for flows with traffic_type "tcp_like".

    * Window-based: at most ``floor(cwnd)`` packets are unacknowledged.
    * The sender's own access link limits it to ``offered_rate_mbps``
      (packets are spaced at least one packet-time apart at that rate).
    * Slow start (+1 packet per ACK) until the first loss, then congestion
      avoidance (+1/cwnd per ACK).
    * On a loss notification: ssthresh = cwnd = max(cwnd / 2, 2), at most once
      per window (losses of packets sent before the last reduction are ignored,
      similar to NewReno fast recovery).
    * No retransmissions, timeouts, SACK or ECN; the engine decides when ACKs
      and loss notifications reach the sender.
    """

    def __init__(self, flow: FlowConfig, duration_ms: float):
        self.flow = flow
        self.interval_ms = packet_interval_ms(flow.packet_size_bytes, flow.offered_rate_mbps)
        self.end_ms = min(flow.stop_ms, duration_ms)
        self.cwnd = INITIAL_CWND_PACKETS
        self.ssthresh = math.inf
        self.inflight = 0
        self.next_send_ms = flow.start_ms
        self.send_pending = False
        self.last_reduction_ms = -math.inf
        self.reductions = 0

    def next_send_time(self, now_ms: float) -> float | None:
        """Time of the next send if the window allows one; marks it pending."""
        if self.send_pending or self.inflight >= int(self.cwnd):
            return None
        t = max(now_ms, self.next_send_ms)
        if t >= self.end_ms:
            return None
        self.send_pending = True
        return t

    def on_send(self, now_ms: float) -> None:
        self.send_pending = False
        self.inflight += 1
        self.next_send_ms = now_ms + self.interval_ms

    def on_ack(self) -> None:
        self.inflight -= 1
        if self.cwnd < self.ssthresh:
            self.cwnd += 1.0
        else:
            self.cwnd += 1.0 / self.cwnd
        self.cwnd = min(self.cwnd, MAX_CWND_PACKETS)

    def on_loss(self, sent_at_ms: float, now_ms: float) -> None:
        self.inflight -= 1
        if sent_at_ms >= self.last_reduction_ms:
            self.ssthresh = max(self.cwnd / 2.0, 2.0)
            self.cwnd = self.ssthresh
            self.last_reduction_ms = now_ms
            self.reductions += 1
