import copy
import csv
import io
import json

import pytest
from fastapi.testclient import TestClient

from app.api import store
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_store():
    store.runs.clear()
    store.comparisons.clear()


def test_health():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "queuewise", "version": "0.1.0"}


def test_scenarios_and_strategies():
    data = client.get("/api/v1/scenarios").json()
    ids = [s["id"] for s in data["scenarios"]]
    assert {"bufferbloat", "small_buffer", "mixed_traffic", "bursty", "below_capacity"} <= set(ids)
    assert [s["key"] for s in client.get("/api/v1/strategies").json()] == ["fifo", "codel", "fq_codel"]


def test_every_scenario_config_is_valid_api_input():
    for s in client.get("/api/v1/scenarios").json()["scenarios"]:
        r = client.post("/api/v1/simulations", json=s["config"])
        assert r.status_code == 200, (s["id"], r.json())


def test_run_simulation_and_fetch(api_request_body):
    r = client.post("/api/v1/simulations", json=api_request_body)
    assert r.status_code == 200
    run = r.json()
    for key in ("run_id", "simulator_version", "configuration", "metrics", "time_series", "per_flow", "findings"):
        assert key in run
    assert run["configuration"]["simulation"]["seed"] == 7
    assert len(run["per_flow"]) == 2
    assert run["metrics"]["jain_fairness_index"] is not None
    assert client.get(f"/api/v1/simulations/{run['run_id']}").json()["run_id"] == run["run_id"]
    assert client.get("/api/v1/simulations").json()[0]["run_id"] == run["run_id"]


def test_unknown_run_is_404():
    assert client.get("/api/v1/simulations/nope").status_code == 404
    assert client.get("/api/v1/simulations/nope/export?format=csv").status_code == 404


def _errors(response):
    assert response.status_code == 422
    return {e["field"] for e in response.json()["errors"]}


@pytest.mark.parametrize(
    "mutate, field",
    [
        (lambda b: b["link"].update(capacity_mbps=-5), "link.capacity_mbps"),
        (lambda b: b["flows"][0].update(packet_size_bytes=0), "flows.0.packet_size_bytes"),
        (lambda b: b["flows"][0].update(start_ms=500, stop_ms=400), "flows.0.stop_ms"),
        (lambda b: b["flows"][1].update(stop_ms=999_999), "flows.1.stop_ms"),
        (lambda b: b["simulation"].update(duration_ms=10_000_000), "simulation.duration_ms"),
        (lambda b: b["simulation"].update(sampling_interval_ms=0.5), "simulation.sampling_interval_ms"),
        (lambda b: b["flows"][1].update(flow_id="bulk"), "flows.1.flow_id"),
        (lambda b: b.update(strategy="red"), "strategy"),
        (lambda b: b["flows"][0].update(offered_rate_mbps=-1), "flows.0.offered_rate_mbps"),
    ],
)
def test_validation_errors_are_field_level(api_request_body, mutate, field):
    body = copy.deepcopy(api_request_body)
    mutate(body)
    assert field in _errors(client.post("/api/v1/simulations", json=body))


def test_rejects_excessive_flows(api_request_body):
    body = copy.deepcopy(api_request_body)
    body["flows"] = [dict(body["flows"][1], flow_id=f"f{i}") for i in range(9)]
    assert "flows" in _errors(client.post("/api/v1/simulations", json=body))


def test_rejects_excessive_compute(api_request_body):
    body = copy.deepcopy(api_request_body)
    body["simulation"]["duration_ms"] = 60_000
    body["flows"] = [dict(body["flows"][0], offered_rate_mbps=1000, packet_size_bytes=64, stop_ms=60_000)]
    r = client.post("/api/v1/simulations", json=body)
    assert "flows" in _errors(r)
    assert "packets" in r.json()["errors"][0]["message"]


def test_export_json_and_csv(api_request_body):
    run = client.post("/api/v1/simulations", json=api_request_body).json()
    rj = client.get(f"/api/v1/simulations/{run['run_id']}/export?format=json")
    assert rj.status_code == 200
    assert "attachment" in rj.headers["content-disposition"]
    exported = json.loads(rj.text)
    assert exported["metrics"] == run["metrics"] and exported["configuration"] == run["configuration"]
    assert exported["simulator_version"] == "0.1.0" and exported["findings"] == run["findings"]

    rc = client.get(f"/api/v1/simulations/{run['run_id']}/export?format=csv")
    assert rc.status_code == 200 and rc.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(rc.text)))
    assert len(rows) == len(run["time_series"])
    assert "throughput_mbps__bulk" in rows[0] and "queue_occupancy_bytes" in rows[0]
    assert float(rows[-1]["time_ms"]) == run["time_series"][-1]["time_ms"]


def test_controlled_comparison_and_export(api_request_body):
    r = client.post("/api/v1/compare", json={"base_config": api_request_body, "strategies": ["fifo", "codel", "fq_codel"]})
    assert r.status_code == 200
    cmp = r.json()
    assert cmp["controlled"] is True and cmp["parameter_differences"] == []
    assert [run["strategy"] for run in cmp["runs"]] == ["fifo", "codel", "fq_codel"]
    assert cmp["findings"]
    rc = client.get(f"/api/v1/comparisons/{cmp['comparison_id']}/export?format=csv")
    rows = list(csv.DictReader(io.StringIO(rc.text)))
    assert len(rows) == sum(len(run["time_series"]) for run in cmp["runs"])
    rj = client.get(f"/api/v1/comparisons/{cmp['comparison_id']}/export?format=json")
    assert json.loads(rj.text)["comparison_id"] == cmp["comparison_id"]


def test_compare_stored_runs_reports_differences(api_request_body):
    a = client.post("/api/v1/simulations", json=api_request_body).json()
    body = copy.deepcopy(api_request_body)
    body["strategy"] = "fq_codel"
    body["link"]["queue_capacity_kb"] = 32
    b = client.post("/api/v1/simulations", json=body).json()
    cmp = client.post("/api/v1/compare", json={"run_ids": [a["run_id"], b["run_id"]]}).json()
    assert cmp["controlled"] is False
    assert [d["parameter"] for d in cmp["parameter_differences"]] == ["link.queue_capacity_kb"]
    assert cmp["findings"][0]["id"] == "not_controlled"


def test_compare_configs_mode_reruns_each_configuration(api_request_body):
    a = copy.deepcopy(api_request_body)
    b = copy.deepcopy(api_request_body)
    b["strategy"] = "codel"
    b["link"]["queue_capacity_kb"] = 32
    single = client.post("/api/v1/simulations", json=a).json()
    cmp = client.post("/api/v1/compare", json={"configs": [a, b]}).json()
    assert cmp["mode"] == "configs" and cmp["controlled"] is False
    assert [d["parameter"] for d in cmp["parameter_differences"]] == ["link.queue_capacity_kb"]
    # Deterministic: re-simulating a configuration reproduces the earlier run exactly.
    assert cmp["runs"][0]["metrics"] == single["metrics"]
    assert cmp["runs"][0]["time_series"] == single["time_series"]


def test_compare_configs_validation_points_at_config(api_request_body):
    bad = copy.deepcopy(api_request_body)
    bad["flows"][0]["stop_ms"] = 999_999
    fields = _errors(client.post("/api/v1/compare", json={"configs": [api_request_body, bad]}))
    assert "configs.1.flows.0.stop_ms" in fields
    mixed = client.post("/api/v1/compare", json={"configs": [api_request_body, api_request_body], "run_ids": ["a", "b"]})
    assert mixed.status_code == 422


def _heavy(body, rate_mbps):
    heavy = copy.deepcopy(body)
    heavy["simulation"]["duration_ms"] = 60_000
    heavy["flows"] = [dict(heavy["flows"][0], offered_rate_mbps=rate_mbps, packet_size_bytes=1200, stop_ms=60_000)]
    return heavy


def test_compare_total_work_is_capped_per_request(api_request_body):
    # ~437k packets each: under the per-run cap, but six of them exceed the per-request budget.
    heavy = _heavy(api_request_body, 70)
    r = client.post("/api/v1/compare", json={"configs": [heavy] * 6})
    assert "configs" in _errors(r)
    assert "per request" in r.json()["errors"][0]["message"]
    r = client.post("/api/v1/compare", json={"base_config": heavy, "strategies": ["fifo", "codel", "fq_codel"]})
    assert "strategies" in _errors(r)


def test_responses_are_gzip_compressed(api_request_body):
    r = client.post("/api/v1/simulations", json=api_request_body, headers={"Accept-Encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip"


def test_compare_validation(api_request_body):
    assert client.post("/api/v1/compare", json={"strategies": ["fifo", "codel"]}).status_code == 422
    assert client.post("/api/v1/compare", json={"base_config": api_request_body, "strategies": ["fifo", "fifo"]}).status_code == 422
    bad = copy.deepcopy(api_request_body)
    bad["link"]["capacity_mbps"] = 0
    fields = _errors(client.post("/api/v1/compare", json={"base_config": bad, "strategies": ["fifo", "codel"]}))
    assert "base_config.link.capacity_mbps" in fields
