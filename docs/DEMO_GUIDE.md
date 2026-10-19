# QueueWise demo guide

A 10–12 minute live demonstration script. The numbers quoted are what the simulator produces with the presets' default seed (42). If you change any setting, your numbers will differ, which is part of the point.

## Before the demo

1. Start the app: double-click `start-demo.bat` (Windows) or run `sh start-demo.sh` (macOS/Linux).
2. Open http://127.0.0.1:8000 and check that the top bar shows **Simulator online** and the **Simulated data** label.
3. Optional: keep `docs/RESULTS.md` open as a backup in case anything goes wrong.

## 1. The problem (1 min)

Open **Methodology** and show the diagram: both buffers sit in front of the same 10 Mbps link. A full 24 KB buffer adds about 20 ms of waiting; a full 256 KB buffer adds about 210 ms. A bigger buffer does not make the link faster, it only makes packets wait. That is bufferbloat.

## 2. Bufferbloat with FIFO (2 min)

1. Go to **Simulation Lab**. The **Bufferbloat** preset is selected: a TCP-like bulk transfer that can send up to 15 Mbps into a 10 Mbps link with a 256 KB buffer.
2. Point at the summary card: "With the current settings, a full buffer holds 210 ms of waiting."
3. Keep **FIFO** and select **Run simulation**.
4. Show:
   - The bottleneck diagram fills with the measured mean occupancy (about 190 KB of 256 KB).
   - **Throughput 9.92 Mbps (99% utilization)**, yet **p95 queueing delay about 209 ms**, so 98.7% of packets exceeded the 20 ms budget.
   - The queue-occupancy chart: after the slow-start overshoot, the TCP-like sender keeps the buffer nearly full.
   - The finding "High utilization with a standing queue … the bufferbloat signature".

## 3. Same workload with CoDel-inspired AQM (2 min)

1. Select **CoDel-inspired** and run again (same seed, same traffic).
2. Show: **p95 queueing delay about 37 ms** (mean about 6 ms), and throughput **8.76 Mbps**.
3. Explain the trade-off honestly: AQM keeps the queue short by dropping early, the TCP-like sender backs off sooner, and with a short queue the link sometimes idles. Delay improved a lot; throughput fell somewhat.
4. Show the congestion-window chart: frequent small cuts instead of one huge overshoot.

## 4. A latency-sensitive flow and per-flow queueing (3 min)

1. Select the **Mixed Traffic** preset: a TCP-like bulk flow plus a 1 Mbps interactive (voice/game-like) flow that starts at 1 s.
2. Select **Compare all strategies**, then **Run controlled comparison**.
3. Point at the green banner: **Only the queue strategy differs** (same seed, link, buffer, duration).
4. Show the per-flow table, interactive flow p95 queueing delay:
   - FIFO **≈ 104 ms**: the interactive flow waits behind the bulk backlog.
   - CoDel-inspired **≈ 7.5 ms**.
   - FQ-CoDel-inspired **≈ 0.9 ms**: it has its own queue and is served first as a sparse flow.
5. Read out one comparison finding; each one lists its measured evidence.

## 5. Fairness lens (1–2 min)

1. Back in the Lab, select **Fairness Duel**: a responsive TCP-like transfer against an unresponsive 8 Mbps flood. Go to **Compare** and run the controlled comparison.
2. Jain's index: **FIFO ≈ 0.76** (the TCP-like flow gets about 2.2 Mbps against a fair share of 5 Mbps), **FQ-CoDel-inspired ≈ 0.99** (about 4.6 Mbps).
3. Note the honest cost: under FQ the flood's own queue is now the one that overflows (31% loss for the flood).

## 6. Limits and controls (1–2 min)

- **Unresponsive Overload:** a constant 15 Mbps sender that ignores drops. CoDel-inspired barely helps (p95 209 → 199 ms) because dropping cannot slow a sender that does not respond. AQM is not magic.
- **Small Buffer:** change only the buffer (24 KB): FIFO delay drops to about 19 ms p95, but throughput is 9.54 Mbps. Buffer size alone trades delay against utilization.
- **Below Capacity:** all strategies are nearly identical (p95 about 2 ms). With no persistent queue there is nothing for queue management to fix.

## 7. Reproducibility and export (1 min)

1. Open **Advanced** in the configuration panel and point at the **Random seed**: same seed + same settings = same result.
2. Select **Export JSON** (configuration, seed, metrics, findings, simulator version) and **Export CSV** (time series) for the run or the comparison.
3. Under **Compare saved runs**, select two runs with different settings (for example FIFO at 256 KB and FIFO at 24 KB). The comparison flags it as **not controlled** and lists the differing parameter.
4. Select **Replay** on a saved run: its exact settings and seed are loaded back into the Lab. Run it again and the numbers are identical.

## Likely questions

- *Is this real traffic?* No. It is a deterministic discrete-event simulation; the UI says so everywhere.
- *Is this real CoDel?* It follows the RFC 8289 control law but is labelled "inspired" (no ECN, simplified, not validated against the reference implementation).
- *Why is FIFO's Jain's index 1.000 in Mixed Traffic?* Both flows received about their max-min fair share; the problem there is delay, not throughput fairness. The findings say exactly this.
- *Where do the findings come from?* Fixed threshold rules over measured metrics, not an AI model (see `backend/app/simulation/findings.py`).
