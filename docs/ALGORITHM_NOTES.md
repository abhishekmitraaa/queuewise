# Algorithm notes

How the simulator works, and exactly what is simplified. Source files are under `backend/app/simulation/`.

## Units and conventions

- Time: milliseconds, Python `float`, used everywhere (`*_ms`). Floating-point precision is far below the time scales involved (µs–s).
- Rates: Mbps, 1 Mbps = 1,000,000 bit/s. Sizes: bytes. Queue capacity: KB, 1 KB = 1024 bytes.
- Serialization time of S bytes on C Mbps: `S × 8 / (C × 10^6) × 1000` ms (`link.py`).

## Discrete-event engine (`engine.py`)

- A `heapq` holds `(time_ms, kind, sequence, payload)`.
- **Tie-break rule** at equal times: `PACKET_DELIVERY (0) < TRANSMISSION_COMPLETE (1) < ACK (2) < LOSS_SIGNAL (3) < PACKET_ARRIVAL (4) < SAMPLE (5)`, then by scheduling order. Samples therefore observe the state after every other event at the same instant.
- The bottleneck is a single server: at most one packet is in transmission. When it finishes, it asks the strategy for the next packet.
- **Queueing delay** = service start − enqueue time, for every strategy.
- **End-to-end delay** = delivery time − arrival time = queueing + serialization + propagation.
- **Termination:** flows generate only in `[start_ms, min(stop_ms, duration_ms))`. Every event with `time ≤ duration` is processed, then the run stops without draining. `queued_at_end` and `in_flight_at_end` (being transmitted or propagating) are reported, so `generated = delivered + dropped + queued_at_end + in_flight_at_end`. This is tested for all strategies and traffic types.
- **Sampling:** one sample every `sampling_interval_ms` from 0 to the duration. A sample records the queue occupancy at that instant, the mean and max queueing delay of packets that started service during the interval, total and per-flow throughput during the interval, and cumulative drops.
- **Safety limits:** at most 5,000,000 events per run (engine) and about 600,000 estimated packets (API validation).

## Traffic (`traffic.py`)

Every flow gets its own `random.Random(f"queuewise:{seed}:{flow_id}")`, so flows never share random state and runs are reproducible. Python seeds string inputs deterministically, independent of `PYTHONHASHSEED`.

| Type | Behaviour | `offered_rate_mbps` means |
|---|---|---|
| `constant_rate` | Packets at `start + k × interval` | Average (= exact) rate |
| `poisson` | Exponential inter-arrival times | Mean rate |
| `bursty` | Exponential ON/OFF periods (means `burst_on_ms`, `burst_off_ms`); constant spacing while ON | Peak rate during ON |
| `tcp_like` | Responsive AIMD sender (below) | Maximum (access-link) rate |

### TCP-like sender (simplified AIMD)

- At most `floor(cwnd)` unacknowledged packets; initial cwnd = 10; packets are spaced at least one packet-time apart at the max rate.
- Slow start: +1 per ACK until the first loss; congestion avoidance: +1/cwnd per ACK.
- On a loss signal: `ssthresh = cwnd = max(cwnd/2, 2)`, at most once per window. Losses of packets sent before the last reduction are ignored, like NewReno.
- The ACK reaches the sender one propagation delay after delivery (reverse path uncongested).
- The loss signal arrives at `drop time + (bytes queued at drop) × 8 / capacity + serialization + 2 × propagation`. This approximates duplicate ACKs from the packets behind the lost one, so head drops (AQM) are signalled sooner than tail drops behind a long queue.
- Not modelled: retransmissions, RTO, SACK, ECN, pacing, delayed ACKs, CUBIC/BBR.

## FIFO (`strategies/fifo.py`)

One deque. Tail drop: an arriving packet is dropped if `queued_bytes + size > capacity_bytes`.

## CoDel-inspired AQM (`strategies/codel_inspired.py`)

Implements the dequeue-side state machine of RFC 8289:

```
dodequeue(now):
    pkt = pop head;  sojourn = now - pkt.enqueue_time
    if sojourn < target or queued_bytes <= max_packet_size: first_above_time = unset
    elif first_above_time unset:                            first_above_time = now + interval
    elif now >= first_above_time:                           ok_to_drop = true

dequeue(now):
    if dropping:
        if not ok_to_drop: dropping = false
        while dropping and now >= drop_next:
            drop(pkt); count += 1; pkt = dodequeue(now)
            if not ok_to_drop: dropping = false
            else: drop_next = drop_next + interval / sqrt(count)
    elif ok_to_drop:
        drop(pkt); pkt = dodequeue(now); dropping = true
        count = (count - lastcount) if (count - lastcount > 1 and now - drop_next < 16 × interval) else 1
        lastcount = count; drop_next = now + interval / sqrt(count)
    return pkt
```

Defaults: target 5 ms, interval 100 ms (configurable).

Why "inspired": no ECN marking (drops only), a floating-point clock, byte-based tail drop when the shared buffer is full, and no validation against the reference implementation.

Tests (`tests/test_aqm.py`) check that a single slow packet is not dropped, that no drop happens until delay persists for an interval, that the timer resets below target, that the drop rate increases while delay stays high, that the dropping state is left when the queue empties, and that the strategy reduces delay for responsive traffic.

## FQ-CoDel-inspired (`strategies/fq_codel_inspired.py`)

- One `CoDelQueue` per `flow_id`. No hashing, so no collisions; real FQ-CoDel hashes the 5-tuple into 1024 buckets.
- Deficit round robin with `quantum_bytes` (default 1514). A flow becoming active gets `deficit = quantum` and joins **new_flows**; new flows are served before **old_flows**.
- A flow that has used its quantum gets `deficit += quantum` and moves to the tail of old_flows.
- An empty flow on new_flows moves to old_flows (anti-gaming rule); an empty flow on old_flows becomes inactive.
- The shared byte limit: after an enqueue, while the total exceeds capacity, the head packet of the flow with the largest backlog is dropped (overflow). A packet larger than the whole buffer is dropped on arrival. Linux drops in batches; this drops one packet at a time.

Tests check flow separation and packet identity, round-robin alternation, byte fairness with unequal packet sizes, priority for new sparse flows, fattest-flow overflow drops, oversize packets, and empty-flow handling.

## Metrics (`metrics.py`)

- p95 uses linear interpolation between closest ranks (NumPy's default method).
- Throughput, offered load and utilization use the full configured duration as the window.
- Delay-budget violations: delivered packets with queueing delay strictly greater than the budget.
- **Max-min fair shares** by water-filling. Demand is the measured offered load for open-loop flows, and the configured maximum rate × active fraction for TCP-like flows.
- **Jain's index** on `throughput_i / fair_share_i`; it is null when fewer than two flows offer traffic or nothing is delivered. `jain_fairness_index_raw` is the plain index on throughput.

## Findings rules (`findings.py`)

| Rule | Condition | Category |
|---|---|---|
| Overload | offered load > 105% of capacity; adds "queue accumulated" if mean occupancy in the last third > 1.2 × the first third and > 10% of capacity | info |
| Not congested | load < 90% and p95 ≤ budget | positive |
| Budget exceeded / met | p95 queueing delay > budget / ≤ budget | caution / positive |
| Bufferbloat signature | utilization ≥ 90% and p95 > budget | caution |
| Overflow drops | any overflow drops; caution if ≥ 10% of samples have the buffer ≥ 90% full | caution / info |
| AQM activity | non-FIFO: AQM drops (notes when all flows are unresponsive) or "AQM never needed to drop" | info |
| Per-flow delay | ≥ 2 flows: similar (within 1 ms or 10%) or the lowest vs highest p95 | info |
| Fairness | Jain ≥ 0.95 positive; otherwise names the flow furthest below its fair share | positive / caution |
| Comparison: similar / lowest p95 | p95 values all within 1 ms or 10%, else the lowest (ties listed) | info |
| Comparison: vs baseline | delay, drop and throughput changes; trade-off sentence chosen by which metrics moved | info / positive |
| Comparison: fairness lens | FQ vs FIFO Jain change > 0.01 or "did not improve" | positive / info |
| Comparison: sensitive flow | p95 of the lowest-rate flow under each strategy | info |
| Not controlled | compared runs differ in more than the strategy | caution |
