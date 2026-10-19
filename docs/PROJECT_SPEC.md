# QueueWise project specification (as implemented)

The source of truth is the original blueprint, *QueueWise — Delay-Aware Queue Management Lab*. This file records how each part was implemented and every place the implementation deliberately differs from the blueprint.

## Aim

Build an interactive simulator that demonstrates bufferbloat and compares baseline FIFO queueing with delay-aware AQM and per-flow fair queueing under repeatable workloads.

## Distinctive contribution: Delay Budget + Fairness Lens

| Feature | Where |
|---|---|
| Delay budget: share of packets over the budget, p95 delay | `metrics.py` (`delay_budget_violation_ratio`), metric cards, budget line on the delay chart |
| Fairness lens: Jain's index against max-min fair share | `metrics.py`, metric card, per-flow table (fair share column), Fairness Duel preset |
| Explainable run summary from threshold rules | `findings.py`, Findings panel |
| Reproducible scenario cards (configuration + seed) | `scenarios.py`, seed in Advanced options, seed shown in results and exports, session runs with **Replay** (loads a run's exact settings and seed) |
| Before/after lab with identical workload | `POST /api/v1/compare` controlled mode, Compare page |

## Functional requirements status

| ID | Status |
|---|---|
| FR-01 dashboard explains bufferbloat with a diagram and run action | Done: hero text, live "full buffer = X ms" card, bottleneck diagram, Run simulation |
| FR-02 presets or custom scenario | Done: 7 presets, every field editable |
| FR-03 choose FIFO / CoDel-inspired / FQ-CoDel-inspired | Done |
| FR-04 configure link, buffer, duration, packet size, flows, seed within limits | Done, with server-side validation |
| FR-05 run returns id, configuration, time series, metrics, findings | Done |
| FR-06 comparisons show which parameters differ; controlled mode | Done |
| FR-07 charts: occupancy, queueing delay, end-to-end delay, throughput, drops | Done: separate charts for each, plus per-flow lines and a congestion-window chart for TCP-like flows |
| FR-08 per-flow panel | Done |
| FR-09 delay-budget violations and Jain's index | Done |
| FR-10 JSON and CSV export | Done: built in the browser from the returned results (identical format to the backend `/export` endpoints, verified) |
| FR-11 human-readable errors | Done: field-level 422s, offline banner, 500 handler |
| FR-12 reset | Done: "Reset to preset" |
| FR-13 "Simulated data" disclosure | Done: top bar, footer, methodology |
| FR-14 reproducible for fixed seed + config | Done and tested |

## Deviations from the blueprint (and why)

1. **Added a `tcp_like` responsive traffic type.** AQM controls delay by making senders slow down. With only open-loop traffic, CoDel-style dropping cannot reduce the arrival rate, and the demo would hide the main lesson. The open-loop overload case is kept as a preset (*Unresponsive Overload*) to show that limit explicitly.
2. **Mixed Traffic** bulk flow is 12 Mbps max (the blueprint said 8 Mbps). 8 + 1 Mbps on a 10 Mbps link never builds a persistent queue, so the per-flow scheduling effect would not appear. *Below Capacity* covers the uncongested case.
3. **Two extra presets:** *Fairness Duel* (TCP-like vs unresponsive flood) and *Unresponsive Overload*.
4. **Jain's index is normalized by max-min fair share**, as the blueprint asks ("use equal-demand flows or clearly state the demand differences"). The raw index is also returned.
5. **Pages:** Simulation Lab (configuration + results on one page), Compare, Methodology. The blueprint's `ResultsPage` is the results section of the Lab page.

## API: `/compare` modes (§13)

The blueprint asks `/compare` to accept "either multiple validated strategy configurations or a shared base configuration plus a list of strategies". Both are implemented (`configs` and `base_config` + `strategies`), plus `run_ids` for runs stored in the same process.

## Out of scope (as the blueprint requires)

No router configuration, packet capture, administrator privileges, ML, accounts, database or payment. Runs live in memory only. Cloud hosting on Vercel was added later at the user's request; the app stays stateless there (see the README).

## Blueprint audit (second pass, before hosting)

The build was re-checked against every section of the blueprint. Gaps found and fixed:

1. FR-07: added an end-to-end delay over time chart.
2. §2D: added Replay for saved runs (settings and seed loaded back into the Lab).
3. §13: `/compare` now accepts multiple full configurations.
4. §12 Comparison page: added side-by-side metric cards above the table.
5. §23 / §24: README now lists future work and the versions used.
6. Acceptance criterion 6: README setup verified on a clean copy (fresh venv, `npm install`, tests, build).
7. §2A: quick picks for 5 / 20 / 50 ms delay budgets.
