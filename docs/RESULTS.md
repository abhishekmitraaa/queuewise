# QueueWise results from actual simulator runs

Generated 2026-10-20 by `backend/scripts/run_presets.py` with simulator v0.1.0.
Every value below is simulated (not measured on a real network) and reproducible: each preset uses seed 42.
Queueing delays are over delivered packets; throughput is averaged over the full 10 s run.

## Bufferbloat: Large Buffer

Offered load exceeds capacity, so a large queue builds up and adds delay.

Link 10 Mbps, 20 ms propagation, 256 KB buffer; delay budget 20 ms. Flows: Bulk transfer (TCP-like) (tcp_like, 15 Mbps).

| Strategy | Mean queue delay (ms) | p95 queue delay (ms) | p95 end-to-end (ms) | Throughput (Mbps) | Drop ratio | Over budget | Jain's index |
|---|---:|---:|---:|---:|---:|---:|---:|
| FIFO (tail drop) | 155.3 | 208.6 | 229.6 | 9.92 | 2.21% | 98.7% | n/a |
| CoDel-inspired AQM | 5.8 | 37.4 | 58.4 | 8.76 | 0.22% | 6.2% | n/a |
| FQ-CoDel-inspired | 5.8 | 37.4 | 58.4 | 8.76 | 0.22% | 6.2% | n/a |

Findings from the comparison:

- **Lowest p95 queueing delay: CoDel-inspired AQM and FQ-CoDel-inspired.** CoDel-inspired AQM and FQ-CoDel-inspired tied for the lowest p95 queueing delay at 37.4 ms.
- **CoDel-inspired AQM vs FIFO (tail drop).** p95 queueing delay went from 208.6 ms with FIFO (tail drop) to 37.4 ms; drop ratio from 2.2% to 0.2%; throughput from 9.92 Mbps to 8.76 Mbps. Lower delay came with lower throughput: with a short queue the link sometimes idled after the TCP-like senders backed off.
- **FQ-CoDel-inspired vs FIFO (tail drop).** p95 queueing delay went from 208.6 ms with FIFO (tail drop) to 37.4 ms; drop ratio from 2.2% to 0.2%; throughput from 9.92 Mbps to 8.76 Mbps. Lower delay came with lower throughput: with a short queue the link sometimes idled after the TCP-like senders backed off.

## Small Buffer

Illustrates the trade-off between queueing delay and packet drops.

Link 10 Mbps, 20 ms propagation, 24 KB buffer; delay budget 20 ms. Flows: Bulk transfer (TCP-like) (tcp_like, 15 Mbps).

| Strategy | Mean queue delay (ms) | p95 queue delay (ms) | p95 end-to-end (ms) | Throughput (Mbps) | Drop ratio | Over budget | Jain's index |
|---|---:|---:|---:|---:|---:|---:|---:|
| FIFO (tail drop) | 7.8 | 18.6 | 39.5 | 9.54 | 0.47% | 0.0% | n/a |
| CoDel-inspired AQM | 2.1 | 6.1 | 27.0 | 8.68 | 0.56% | 0.0% | n/a |
| FQ-CoDel-inspired | 2.0 | 6.1 | 27.0 | 8.68 | 0.56% | 0.0% | n/a |

Findings from the comparison:

- **Lowest p95 queueing delay: CoDel-inspired AQM and FQ-CoDel-inspired.** CoDel-inspired AQM and FQ-CoDel-inspired tied for the lowest p95 queueing delay at 6.1 ms.
- **CoDel-inspired AQM vs FIFO (tail drop).** p95 queueing delay went from 18.6 ms with FIFO (tail drop) to 6.1 ms; drop ratio from 0.5% to 0.6%; throughput from 9.54 Mbps to 8.68 Mbps. Lower delay came with lower throughput: with a short queue the link sometimes idled after the TCP-like senders backed off.
- **FQ-CoDel-inspired vs FIFO (tail drop).** p95 queueing delay went from 18.6 ms with FIFO (tail drop) to 6.1 ms; drop ratio from 0.5% to 0.6%; throughput from 9.54 Mbps to 8.68 Mbps. Lower delay came with lower throughput: with a short queue the link sometimes idled after the TCP-like senders backed off.

## Mixed Traffic

Shows whether one flow's backlog affects another flow's latency and how per-flow scheduling changes that.

Link 10 Mbps, 20 ms propagation, 128 KB buffer; delay budget 20 ms. Flows: Bulk transfer (TCP-like) (tcp_like, 12 Mbps), Interactive (voice/game) (constant_rate, 1 Mbps).

| Strategy | Mean queue delay (ms) | p95 queue delay (ms) | p95 end-to-end (ms) | Throughput (Mbps) | Drop ratio | Over budget | Jain's index |
|---|---:|---:|---:|---:|---:|---:|---:|
| FIFO (tail drop) | 71.8 | 104.0 | 124.9 | 9.92 | 0.79% | 98.5% | 1.000 |
| CoDel-inspired AQM | 3.6 | 8.0 | 28.8 | 8.92 | 0.16% | 3.1% | 0.996 |
| FQ-CoDel-inspired | 3.1 | 7.6 | 28.6 | 8.91 | 0.16% | 3.1% | 0.996 |

Per-flow p95 queueing delay (ms) / throughput (Mbps) / loss:

| Strategy | Bulk transfer (TCP-like) | Interactive (voice/game) |
|---|---:|---:|
| FIFO (tail drop) | 104.0 / 9.03 / 1.1% | 103.5 / 0.89 / 0.0% |
| CoDel-inspired AQM | 17.6 / 8.02 / 0.2% | 7.5 / 0.90 / 0.0% |
| FQ-CoDel-inspired | 17.6 / 8.02 / 0.2% | 0.9 / 0.90 / 0.0% |

Findings from the comparison:

- **Lowest p95 queueing delay: FQ-CoDel-inspired.** FQ-CoDel-inspired had the lowest p95 queueing delay at 7.6 ms.
- **CoDel-inspired AQM vs FIFO (tail drop).** p95 queueing delay went from 104.0 ms with FIFO (tail drop) to 8.0 ms; drop ratio from 0.8% to 0.2%; throughput from 9.92 Mbps to 8.92 Mbps. Lower delay came with lower throughput: with a short queue the link sometimes idled after the TCP-like senders backed off.
- **FQ-CoDel-inspired vs FIFO (tail drop).** p95 queueing delay went from 104.0 ms with FIFO (tail drop) to 7.6 ms; drop ratio from 0.8% to 0.2%; throughput from 9.92 Mbps to 8.91 Mbps. Lower delay came with lower throughput: with a short queue the link sometimes idled after the TCP-like senders backed off.
- **Fairness lens.** Per-flow scheduling did not improve Jain's index here (1.000 with FIFO (tail drop) vs 0.996).
- **Impact on Interactive (voice/game).** For Interactive (voice/game) (the lowest-rate flow), p95 queueing delay was FIFO (tail drop): 103.5 ms, CoDel-inspired AQM: 7.5 ms, FQ-CoDel-inspired: 0.88 ms.

## Bursty Traffic

Compares short bursts against persistent overload; randomness is fixed by the seed.

Link 10 Mbps, 20 ms propagation, 128 KB buffer; delay budget 20 ms. Flows: Bursty video (bursty, 20 Mbps), Steady background (poisson, 3 Mbps).

| Strategy | Mean queue delay (ms) | p95 queue delay (ms) | p95 end-to-end (ms) | Throughput (Mbps) | Drop ratio | Over budget | Jain's index |
|---|---:|---:|---:|---:|---:|---:|---:|
| FIFO (tail drop) | 54.9 | 104.6 | 125.5 | 6.63 | 26.81% | 68.2% | 0.982 |
| CoDel-inspired AQM | 53.0 | 102.6 | 123.5 | 6.58 | 27.31% | 67.3% | 0.982 |
| FQ-CoDel-inspired | 32.4 | 115.5 | 136.5 | 6.58 | 26.45% | 45.9% | 0.934 |

Per-flow p95 queueing delay (ms) / throughput (Mbps) / loss:

| Strategy | Bursty video | Steady background |
|---|---:|---:|
| FIFO (tail drop) | 104.6 / 4.02 / 34.5% | 104.2 / 2.61 / 13.8% |
| CoDel-inspired AQM | 102.9 / 3.99 / 35.0% | 101.1 / 2.59 / 14.4% |
| FQ-CoDel-inspired | 127.7 / 3.55 / 42.1% | 2.6 / 3.03 / 0.0% |

Findings from the comparison:

- **Strategies performed similarly.** p95 queueing delay ranged only from 102.6 ms to 115.5 ms across strategies.
- **CoDel-inspired AQM vs FIFO (tail drop).** p95 queueing delay went from 104.6 ms with FIFO (tail drop) to 102.6 ms; drop ratio from 26.8% to 27.3%; throughput from 6.63 Mbps to 6.58 Mbps. CoDel-inspired AQM did not reduce p95 queueing delay in this scenario.
- **FQ-CoDel-inspired vs FIFO (tail drop).** p95 queueing delay went from 104.6 ms with FIFO (tail drop) to 115.5 ms; drop ratio from 26.8% to 26.5%; throughput from 6.63 Mbps to 6.58 Mbps. FQ-CoDel-inspired did not reduce p95 queueing delay in this scenario.
- **Fairness lens.** Per-flow scheduling did not improve Jain's index here (0.982 with FIFO (tail drop) vs 0.934).
- **Impact on Steady background.** For Steady background (the lowest-rate flow), p95 queueing delay was FIFO (tail drop): 104.2 ms, CoDel-inspired AQM: 101.1 ms, FQ-CoDel-inspired: 2.6 ms.

## Fairness Duel

Fairness lens: in a shared queue the flow that backs off loses capacity; per-flow scheduling targets max-min fairness.

Link 10 Mbps, 20 ms propagation, 128 KB buffer; delay budget 20 ms. Flows: Responsive transfer (TCP-like) (tcp_like, 15 Mbps), Unresponsive flood (UDP-like) (constant_rate, 8 Mbps).

| Strategy | Mean queue delay (ms) | p95 queue delay (ms) | p95 end-to-end (ms) | Throughput (Mbps) | Drop ratio | Over budget | Jain's index |
|---|---:|---:|---:|---:|---:|---:|---:|
| FIFO (tail drop) | 87.1 | 103.9 | 124.9 | 9.98 | 2.16% | 98.9% | 0.757 |
| CoDel-inspired AQM | 18.7 | 86.4 | 107.4 | 9.95 | 2.61% | 21.4% | 0.760 |
| FQ-CoDel-inspired | 60.8 | 128.4 | 149.4 | 9.98 | 20.51% | 54.7% | 0.993 |

Per-flow p95 queueing delay (ms) / throughput (Mbps) / loss:

| Strategy | Responsive transfer (TCP-like) | Unresponsive flood (UDP-like) |
|---|---:|---:|
| FIFO (tail drop) | 104.0 / 2.16 / 5.2% | 103.7 / 7.82 / 1.3% |
| CoDel-inspired AQM | 88.6 / 2.18 / 2.7% | 85.4 / 7.77 / 2.6% |
| FQ-CoDel-inspired | 50.9 / 4.57 / 2.6% | 129.1 / 5.41 / 31.0% |

Findings from the comparison:

- **Lowest p95 queueing delay: CoDel-inspired AQM.** CoDel-inspired AQM had the lowest p95 queueing delay at 86.4 ms.
- **CoDel-inspired AQM vs FIFO (tail drop).** p95 queueing delay went from 103.9 ms with FIFO (tail drop) to 86.4 ms; drop ratio from 2.2% to 2.6%; throughput from 9.98 Mbps to 9.95 Mbps. Lower delay was obtained by dropping more packets: the AQM trade-off.
- **FQ-CoDel-inspired vs FIFO (tail drop).** p95 queueing delay went from 103.9 ms with FIFO (tail drop) to 128.4 ms; drop ratio from 2.2% to 20.5%; throughput from 9.98 Mbps to 9.98 Mbps. FQ-CoDel-inspired did not reduce p95 queueing delay in this scenario.
- **Fairness lens.** Per-flow scheduling raised Jain's index from 0.757 to 0.993, so one flow was less able to dominate service.
- **Impact on Unresponsive flood (UDP-like).** For Unresponsive flood (UDP-like) (the lowest-rate flow), p95 queueing delay was FIFO (tail drop): 103.7 ms, CoDel-inspired AQM: 85.4 ms, FQ-CoDel-inspired: 129.1 ms.

## Unresponsive Overload

Shows the limit of AQM: dropping packets only reduces delay when senders respond to drops.

Link 10 Mbps, 20 ms propagation, 256 KB buffer; delay budget 20 ms. Flows: Constant-rate sender (UDP-like) (constant_rate, 15 Mbps).

| Strategy | Mean queue delay (ms) | p95 queue delay (ms) | p95 end-to-end (ms) | Throughput (Mbps) | Drop ratio | Over budget | Jain's index |
|---|---:|---:|---:|---:|---:|---:|---:|
| FIFO (tail drop) | 202.3 | 209.3 | 230.2 | 9.98 | 31.94% | 99.4% | n/a |
| CoDel-inspired AQM | 164.1 | 199.0 | 220.0 | 9.98 | 31.94% | 99.4% | n/a |
| FQ-CoDel-inspired | 135.9 | 139.2 | 160.2 | 9.98 | 31.94% | 99.4% | n/a |

Findings from the comparison:

- **Lowest p95 queueing delay: FQ-CoDel-inspired.** FQ-CoDel-inspired had the lowest p95 queueing delay at 139.2 ms.
- **CoDel-inspired AQM vs FIFO (tail drop).** p95 queueing delay went from 209.3 ms with FIFO (tail drop) to 199.0 ms; drop ratio from 31.9% to 31.9%; throughput from 9.98 Mbps to 9.98 Mbps. CoDel-inspired AQM did not reduce p95 queueing delay in this scenario.
- **FQ-CoDel-inspired vs FIFO (tail drop).** p95 queueing delay went from 209.3 ms with FIFO (tail drop) to 139.2 ms; drop ratio from 31.9% to 31.9%; throughput from 9.98 Mbps to 9.98 Mbps. Delay fell without a higher drop ratio or a notable throughput loss in this scenario.

## Below Capacity

Shows that strategy differences are small when the link is not persistently congested.

Link 10 Mbps, 20 ms propagation, 256 KB buffer; delay budget 20 ms. Flows: Bulk transfer (poisson, 5 Mbps), Interactive (voice/game) (poisson, 1 Mbps).

| Strategy | Mean queue delay (ms) | p95 queue delay (ms) | p95 end-to-end (ms) | Throughput (Mbps) | Drop ratio | Over budget | Jain's index |
|---|---:|---:|---:|---:|---:|---:|---:|
| FIFO (tail drop) | 0.6 | 2.4 | 23.1 | 5.81 | 0.00% | 0.0% | 1.000 |
| CoDel-inspired AQM | 0.6 | 2.4 | 23.1 | 5.81 | 0.00% | 0.0% | 1.000 |
| FQ-CoDel-inspired | 0.5 | 2.0 | 23.0 | 5.81 | 0.00% | 0.0% | 1.000 |

Per-flow p95 queueing delay (ms) / throughput (Mbps) / loss:

| Strategy | Bulk transfer | Interactive (voice/game) |
|---|---:|---:|
| FIFO (tail drop) | 2.4 / 4.91 / 0.0% | 2.4 / 0.91 / 0.0% |
| CoDel-inspired AQM | 2.4 / 4.91 / 0.0% | 2.4 / 0.91 / 0.0% |
| FQ-CoDel-inspired | 2.6 / 4.91 / 0.0% | 1.5 / 0.91 / 0.0% |

Findings from the comparison:

- **Strategies performed similarly.** p95 queueing delay ranged only from 2.0 ms to 2.4 ms across strategies. Offered load was 58% of capacity, so the queue is not persistently congested in this scenario.
- **CoDel-inspired AQM vs FIFO (tail drop).** p95 queueing delay went from 2.4 ms with FIFO (tail drop) to 2.4 ms; drop ratio from 0.0% to 0.0%; throughput from 5.81 Mbps to 5.81 Mbps. CoDel-inspired AQM did not reduce p95 queueing delay in this scenario.
- **FQ-CoDel-inspired vs FIFO (tail drop).** p95 queueing delay went from 2.4 ms with FIFO (tail drop) to 2.0 ms; drop ratio from 0.0% to 0.0%; throughput from 5.81 Mbps to 5.81 Mbps. FQ-CoDel-inspired did not reduce p95 queueing delay in this scenario.
- **Fairness lens.** Per-flow scheduling did not improve Jain's index here (1.000 with FIFO (tail drop) vs 1.000).
- **Impact on Interactive (voice/game).** For Interactive (voice/game) (the lowest-rate flow), p95 queueing delay was FIFO (tail drop): 2.4 ms, CoDel-inspired AQM: 2.4 ms, FQ-CoDel-inspired: 1.5 ms.
