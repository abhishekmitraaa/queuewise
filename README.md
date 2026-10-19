# QueueWise: Delay-Aware Queue Management Lab

QueueWise is an interactive simulator for **bufferbloat**: the large queueing delay that builds up at a congested bottleneck when its buffer is too big, even while the link keeps delivering full throughput. You pick a traffic scenario and a queue strategy, run a deterministic discrete-event simulation, and see queue growth, delay, drops, throughput and fairness, with plain-language findings computed from the measured numbers.

It runs locally (a Python FastAPI backend and a React frontend) and can also be hosted on Vercel (see [Hosting on Vercel](#hosting-on-vercel)). There is no database and no account. **All results are simulated; nothing is captured from a real network.**

## What it does

- **Three queue strategies on one bottleneck link**
  - **FIFO (tail drop):** the baseline.
  - **CoDel-inspired AQM:** drops packets when the queueing delay stays above a target for a full interval (follows the RFC 8289 control law).
  - **FQ-CoDel-inspired:** one queue per flow, deficit round robin with new flows served first, and the CoDel-inspired rule on each flow queue (outline of RFC 8290).
- **Four traffic models:** constant rate, Poisson, bursty ON/OFF, and a responsive **TCP-like (AIMD)** sender that backs off when its packets are dropped.
- **Delay Budget + Fairness Lens:** the share of packets over your queueing-delay budget, p95 delay, and Jain's fairness index computed against each flow's max-min fair share.
- **Explainable findings:** rule-based statements such as "FIFO kept the link 99% utilized, but packets waited 155 ms on average". Every statement shows the measured values behind it.
- **Controlled comparison:** the same workload, seed, link and buffer are run once per strategy. When you compare earlier runs that differ, every mismatched parameter is highlighted.
- **Reproducible scenario cards:** seven presets; a fixed seed plus identical settings always gives identical results. Every run in a session keeps its settings and seed, and **Replay** loads them back into the Lab.
- **Export:** JSON (configuration, seed, metrics, findings, simulator version) and CSV (one row per time-series sample) for single runs and comparisons. The UI builds the files in the browser from the returned results; the backend's `/export` endpoints produce the same format.

## Quick start (demo mode, one command)

Prerequisites: **Python 3.11+** and **Node.js 18+** (with npm).

- **Windows:** double-click `start-demo.bat`, or run it from a terminal in this folder.
- **macOS / Linux:** `sh start-demo.sh`

The first run creates `backend/.venv`, installs the Python packages, and builds the frontend. After that it simply starts the server. Then open **http://127.0.0.1:8000**: the backend serves the built frontend and the API from the same address.

## Manual setup

### 1. Backend (FastAPI)

Windows (PowerShell):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

macOS / Linux:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --port 8000
```

Check it: http://127.0.0.1:8000/api/v1/health returns `{"status":"ok","service":"queuewise","version":"0.1.0"}`. The interactive API docs are at http://127.0.0.1:8000/docs.

### 2. Frontend (React + Vite)

Either **build once** and let the backend serve it (demo mode):

```bash
cd frontend
npm install
npm run build        # creates frontend/dist, served at http://127.0.0.1:8000
```

or run the **dev server** with hot reload in a second terminal (it proxies `/api` to port 8000):

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### 3. Tests

```bash
cd backend
.venv\Scripts\python -m pytest -q      # Windows
.venv/bin/python -m pytest -q          # macOS / Linux
```

The suite has 82 tests: queue behaviour, AQM persistence logic, DRR fairness, packet accounting, metrics edge cases, reproducibility, every preset under every strategy, API validation, comparison, and export. `npm run build` type-checks the frontend.

### 4. Regenerate the results table for the report

```bash
cd backend
.venv\Scripts\python scripts\run_presets.py --out ..\docs\RESULTS.md
```

## Using it (demo story)

See [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) for a step-by-step presentation script. In short:

1. **Bufferbloat** preset + FIFO → run: the link stays about 99% utilized while p95 queueing delay reaches about 200 ms.
2. Switch to **CoDel-inspired** → run: delay drops to tens of ms, with somewhat lower throughput (a trade-off, not a free win).
3. **Mixed Traffic** → **Compare all strategies** → **Run controlled comparison**: compare the interactive flow's delay under each strategy.
4. **Fairness Duel**: a TCP-like flow against an unresponsive flood; compare Jain's index under FIFO and FQ-CoDel-inspired.
5. **Unresponsive Overload**: AQM cannot fix overload from senders that ignore drops.
6. Export JSON/CSV and show the seed and configuration.

## Project structure

```
backend/
  app/
    main.py                 FastAPI app, error handlers, serves frontend/dist if built
    api/                    routes.py (REST endpoints), schemas.py (validation), store.py (in-memory runs)
    simulation/             engine-independent of FastAPI
      engine.py             discrete-event engine (heapq), accounting, sampling
      traffic.py            constant / Poisson / bursty generators, TCP-like AIMD sender
      link.py, packet.py    bottleneck link and packet model
      strategies/           fifo.py, codel_inspired.py, fq_codel_inspired.py, base.py
      metrics.py            metric definitions, percentiles, Jain's index, max-min shares
      findings.py           rule-based explainable findings
      scenarios.py          presets
      service.py            run / compare / CSV export
  tests/                    pytest suite
  scripts/run_presets.py    results table generator
frontend/
  src/
    App.tsx                 state, routing, API calls
    api/client.ts, types.ts typed API client mirroring the backend schemas
    pages/                  DashboardPage (Simulation Lab), ComparePage, MethodologyPage
    components/             ConfigurationPanel, QueueTopology, TimeSeriesChart, FlowTable, FindingsPanel, RunComparison, ...
docs/                       PROJECT_SPEC.md, ALGORITHM_NOTES.md, TEST_PLAN.md, DEMO_GUIDE.md, RESULTS.md
```

## API

Base path `/api/v1`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service status and version |
| GET | `/strategies` | Strategy keys, labels and descriptions |
| GET | `/scenarios` | Presets (full configurations) and input limits |
| POST | `/simulations` | Run one simulation; returns run id, echoed configuration, metrics, time series, per-flow results and findings |
| GET | `/simulations` | Summaries of runs kept in memory |
| GET | `/simulations/{run_id}` | A stored run (404 if unknown) |
| GET | `/simulations/{run_id}/export?format=json\|csv` | Download a run |
| POST | `/compare` | One of: `{"base_config": {...}, "strategies": [...]}` (controlled: base cloned, only the strategy changes), `{"configs": [{...}, {...}]}` (each full configuration simulated as given), or `{"run_ids": [...]}` (runs stored in this process). Returns every run, best values, parameter differences and comparison findings |
| GET | `/comparisons/{id}` and `/comparisons/{id}/export?format=json\|csv` | Stored comparison and its export |

Invalid input returns **HTTP 422** with field-level errors, for example `{"message": "...", "errors": [{"field": "flows.0.stop_ms", "message": "Stop time must be within the simulation duration (10000 ms)."}]}`.

Limits that protect the local service: at most 8 flows, 60 s simulated, 2000 samples, and about 600,000 generated packets per run.

Runs and comparisons are kept **in memory only** (the last 50 runs and 20 comparisons) and disappear when the backend restarts. The UI does not depend on that store: it compares saved runs by re-sending their configurations (results are deterministic, so they match) and builds exports in the browser. That is what lets it run on a stateless serverless host.

## Hosting on Vercel

The repository is ready for Vercel:

- `vercel.json` builds the frontend (`frontend/dist` is served as static files) and rewrites `/api/*` to one Python serverless function.
- `api/index.py` is that function. It imports the same FastAPI app from `backend/app/main.py`.
- The root `requirements.txt` lists the function's runtime dependencies (FastAPI, Pydantic).

The Vercel project is connected to the GitHub repository, so **every push to `main` deploys to production automatically** (live at https://queuewise-nine.vercel.app). Pushes to other branches create preview deployments.

To deploy manually instead, use the Vercel CLI from the project root:

```bash
vercel link          # first time only: create or select the Vercel project
vercel deploy --prod
```

On Vercel, each request may reach a different function instance, so `GET /simulations/{run_id}` and the `/export` endpoints only find runs created on the same instance. The UI does not use them (see above).

## Metric definitions

| Metric | Definition |
|---|---|
| Queueing delay | Service start minus enqueue time. Mean and p95 are over delivered packets (p95 uses linear interpolation). |
| End-to-end delay | Queueing + serialization (bits ÷ link rate) + propagation. No other processing delay is modelled. |
| Throughput | Delivered packet bits ÷ the **full** configured duration, in Mbps (1 Mbps = 10^6 bit/s). |
| Link utilization | Bits whose transmission completed ÷ (capacity × duration). |
| Drop ratio | Dropped ÷ generated packets; overflow and AQM drops are also shown separately. |
| Delay-budget violation ratio | Share of delivered packets whose **queueing** delay is strictly greater than the budget. |
| Queue occupancy | Bytes queued at each sample time (1 KB = 1024 bytes), sampled after all events at that instant. |
| Jain's fairness index | (Σx)² ÷ (n·Σx²), where x = flow throughput ÷ its max-min fair share. Null with fewer than two flows offering traffic or when nothing was delivered. The raw index on throughput is in the API too. |

## Design decisions and deviations from the blueprint

- **Units:** time in ms (float) everywhere, rates in Mbps, sizes in bytes, queue capacity in KB (1024 bytes).
- **Termination:** the run stops at the configured duration without draining; packets still queued or in flight are reported separately, so `generated = delivered + dropped + queued_at_end + in_flight_at_end`.
- **TCP-like traffic was added.** With only open-loop (UDP-like) traffic, AQM cannot reduce delay, because senders never slow down. Bulk-transfer presets therefore use the responsive TCP-like sender. The open-loop case is kept as the *Unresponsive Overload* preset to show that limit honestly.
- **Mixed Traffic** lets the bulk flow send up to 12 Mbps instead of 8 Mbps, because 8 + 1 Mbps on a 10 Mbps link builds no queue. *Below Capacity* covers that case.
- **Fairness Duel** and **Unresponsive Overload** are extra presets beyond the blueprint's five.
- **Fairness** is computed on throughput relative to max-min fair share, so flows with different demands can be compared meaningfully. The raw index is also returned.

## Limitations

- A software simulation of one bottleneck, not a physical network experiment.
- The TCP-like sender is a simplified AIMD model: no retransmissions, timeouts, SACK, pacing, or CUBIC/BBR.
- CoDel-inspired and FQ-CoDel-inspired are educational approximations, not validated, standards-compliant implementations, and may differ from Linux `fq_codel`.
- Results depend on the workload, buffer size, seed and measurement rules chosen.

More detail: [docs/ALGORITHM_NOTES.md](docs/ALGORITHM_NOTES.md) and the in-app **Methodology** page.

## Future work

- A fuller TCP model (retransmissions, timeouts, CUBIC/BBR) now that the base engine is validated.
- RED as another AQM baseline.
- A configurable multi-bottleneck path.
- Comparing simulator behaviour with a controlled Linux `tc` / Mininet experiment.
- Downloadable experiment bundles and report generation.
- Validating a full CoDel / FQ-CoDel implementation against RFC 8289 / RFC 8290 and the reference implementations.

## Versions used (for citing in the report)

| Component | Version |
|---|---|
| Python | 3.11.9 (local); Vercel's default Python 3 runtime when hosted |
| FastAPI / Starlette / Pydantic / Uvicorn | 0.115.12 / 0.46.2 / 2.11.4 / 0.34.2 |
| pytest / httpx | 8.3.5 / 0.28.1 |
| Node.js / npm | 22.18.0 / 10.9.3 |
| React / TypeScript / Vite | 18.3.1 / 5.8.3 / 6.4.4 |
| Tailwind CSS / Recharts / lucide-react | 4.3.3 / 2.15.4 / 0.511.0 |
| Motion (animations) | 12.43.0 |
| Font | Geist (bundled via @fontsource-variable/geist) |

References consulted: RFC 8289 (CoDel), RFC 8290 (FQ-CoDel), Jain, Chiu and Hawe (1984) on the fairness index, and the FastAPI, Pydantic, React, Vite and Recharts documentation.
