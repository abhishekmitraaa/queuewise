import pytest

from app.simulation.config import SimulationConfig
from app.simulation.scenarios import SCENARIOS
from app.simulation.service import run_controlled_comparison, run_simulation

from conftest import make_config, make_flow


def _strip(run):
    return {k: v for k, v in run.items() if k not in ("run_id", "created_at", "runtime_ms")}


@pytest.mark.parametrize("strategy", ["fifo", "codel", "fq_codel"])
def test_same_seed_and_config_give_identical_results(strategy):
    flows = [
        make_flow("p", rate=6, traffic="poisson", stop=3000),
        make_flow("b", rate=15, traffic="bursty", stop=3000),
        make_flow("t", rate=20, traffic="tcp_like", stop=3000),
    ]
    cfg = make_config(flows=flows, strategy=strategy, duration=3000, seed=123)
    assert _strip(run_simulation(cfg)) == _strip(run_simulation(cfg))


def test_different_seed_changes_random_traffic():
    flows = [make_flow("p", rate=12, traffic="poisson", stop=2000)]
    a = run_simulation(make_config(flows=flows, duration=2000, seed=1))
    b = run_simulation(make_config(flows=flows, duration=2000, seed=2))
    assert a["metrics"]["packets_generated"] != b["metrics"]["packets_generated"] or a["time_series"] != b["time_series"]


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["id"])
def test_every_preset_runs_under_every_strategy(scenario):
    base = SimulationConfig.from_dict(scenario["config"])
    comparison = run_controlled_comparison(base, ["fifo", "codel", "fq_codel"])
    assert comparison["controlled"] is True
    assert [r["strategy"] for r in comparison["runs"]] == ["fifo", "codel", "fq_codel"]
    for run in comparison["runs"]:
        m = run["metrics"]
        assert m["packets_generated"] > 0
        assert m["packets_delivered"] > 0
        assert m["packets_generated"] == (
            m["packets_delivered"] + m["packets_dropped"] + m["packets_queued_at_end"] + m["packets_in_flight_at_end"]
        )
        assert run["findings"], "every run should produce findings"


def test_controlled_comparison_holds_shared_parameters_constant():
    base = SimulationConfig.from_dict(SCENARIOS[2]["config"])
    comparison = run_controlled_comparison(base, ["fifo", "fq_codel"])
    configs = [r["configuration"] for r in comparison["runs"]]
    for c in configs:
        c = dict(c)
        assert c.pop("strategy") in ("fifo", "fq_codel")
    a, b = ({k: v for k, v in c.items() if k != "strategy"} for c in configs)
    assert a == b
    assert comparison["parameter_differences"] == []
    # Same open-loop workload: the interactive flow generates identical packet counts.
    counts = [next(f for f in r["per_flow"] if f["flow_id"] == "interactive")["packets_generated"] for r in comparison["runs"]]
    assert counts[0] == counts[1]
