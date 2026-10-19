import pytest

from app.simulation.engine import SimulationEngine
from app.simulation.metrics import compute_metrics, jain_index, max_min_fair_shares, mean, percentile, ratio

from conftest import make_config, make_flow


def test_empty_inputs_are_safe():
    assert mean([]) is None
    assert percentile([], 95) is None
    assert ratio(5, 0) == 0.0
    assert jain_index([]) is None
    assert jain_index([0.0, 0.0]) is None


def test_percentile_linear_interpolation():
    assert percentile([5.0], 95) == 5.0
    assert percentile([1, 2, 3, 4, 5], 50) == 3
    assert percentile(list(range(1, 101)), 95) == pytest.approx(95.05)


def test_jain_index_values():
    assert jain_index([3.0, 3.0, 3.0]) == pytest.approx(1.0)
    assert jain_index([1.0, 0.0]) == pytest.approx(0.5)  # 1/n when one flow gets everything
    assert jain_index([2.0, 1.0]) == pytest.approx(9 / 10)


def test_max_min_fair_shares():
    assert max_min_fair_shares([12, 4], 10) == pytest.approx([6, 4])
    assert max_min_fair_shares([15, 8], 10) == pytest.approx([5, 5])
    assert max_min_fair_shares([2, 3], 10) == pytest.approx([2, 3])
    assert max_min_fair_shares([0, 20], 10) == pytest.approx([0, 10])


def test_metrics_with_no_traffic_are_safe():
    cfg = make_config(flows=[make_flow("a", rate=0)])
    metrics, per_flow, note = compute_metrics(SimulationEngine(cfg).run())
    assert metrics["packets_generated"] == 0
    assert metrics["mean_queueing_delay_ms"] is None
    assert metrics["drop_ratio"] == 0.0
    assert metrics["jain_fairness_index"] is None
    assert per_flow[0]["loss_ratio"] == 0.0


def test_throughput_and_budget_metrics():
    # Under capacity, constant rate: throughput ~ offered rate, no queueing.
    cfg = make_config(flows=[make_flow("a", rate=4, size=1000, stop=2000)], duration=2000, prop=0, budget=1)
    metrics, per_flow, _ = compute_metrics(SimulationEngine(cfg).run())
    assert metrics["throughput_mbps"] == pytest.approx(4.0, rel=0.01)
    assert metrics["link_utilization"] == pytest.approx(0.4, rel=0.01)
    assert metrics["p95_queueing_delay_ms"] == 0.0
    assert metrics["delay_budget_violation_ratio"] == 0.0
    assert metrics["drop_ratio"] == 0.0


def test_jain_is_one_for_equal_flows():
    flows = [make_flow("a", rate=3, stop=2000), make_flow("b", rate=3, stop=2000)]
    metrics, _, _ = compute_metrics(SimulationEngine(make_config(flows=flows, duration=2000)).run())
    assert metrics["jain_fairness_index"] == pytest.approx(1.0, abs=1e-3)


def test_jain_null_for_single_flow():
    metrics, _, note = compute_metrics(SimulationEngine(make_config()).run())
    assert metrics["jain_fairness_index"] is None
    assert "two flows" in note


def test_budget_violation_counts_queueing_delay():
    # Heavy overload builds a long queue, so most packets exceed a 5 ms budget.
    cfg = make_config(flows=[make_flow("a", rate=20, size=1000, stop=2000)], queue_kb=200, duration=2000, budget=5)
    metrics, _, _ = compute_metrics(SimulationEngine(cfg).run())
    assert metrics["delay_budget_violation_ratio"] > 0.8
    assert metrics["p95_queueing_delay_ms"] > 5
