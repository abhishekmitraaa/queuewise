from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from ..simulation import SIMULATOR_VERSION
from ..simulation.engine import SimulationLimitError
from ..simulation.scenarios import DEFAULT_SCENARIO_ID, list_scenarios
from ..simulation.service import (
    build_comparison,
    comparison_to_csv,
    run_controlled_comparison,
    run_simulation,
    run_to_csv,
)
from ..simulation.strategies import STRATEGY_INFO
from . import store
from .schemas import (
    MAX_DURATION_MS,
    MAX_ESTIMATED_PACKETS,
    MAX_FLOWS,
    MAX_SAMPLES,
    CompareRequest,
    SimulationRequest,
    cross_validate,
    request_budget_errors,
)

router = APIRouter(prefix="/api/v1")


class ConfigValidationError(Exception):
    def __init__(self, errors: list[dict[str, str]]):
        self.errors = errors


def _run_summary(run: dict) -> dict:
    cfg = run["configuration"]
    m = run["metrics"]
    return {
        "run_id": run["run_id"],
        "created_at": run["created_at"],
        "strategy": run["strategy"],
        "strategy_label": run["strategy_label"],
        "seed": cfg["simulation"]["seed"],
        "flows": [f["name"] for f in cfg["flows"]],
        "capacity_mbps": cfg["link"]["capacity_mbps"],
        "queue_capacity_kb": cfg["link"]["queue_capacity_kb"],
        "p95_queueing_delay_ms": m["p95_queueing_delay_ms"],
        "throughput_mbps": m["throughput_mbps"],
        "drop_ratio": m["drop_ratio"],
    }


def _execute(fn, *args):
    try:
        return fn(*args)
    except SimulationLimitError as exc:
        raise ConfigValidationError([{"field": "flows", "message": str(exc)}]) from exc


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "queuewise", "version": SIMULATOR_VERSION}


@router.get("/strategies")
def strategies() -> list[dict]:
    return STRATEGY_INFO


@router.get("/scenarios")
def scenarios() -> dict:
    return {
        "default_scenario_id": DEFAULT_SCENARIO_ID,
        "limits": {
            "max_flows": MAX_FLOWS,
            "max_duration_ms": MAX_DURATION_MS,
            "max_samples": MAX_SAMPLES,
            "max_estimated_packets": MAX_ESTIMATED_PACKETS,
        },
        "scenarios": list_scenarios(),
    }


@router.post("/simulations")
def create_simulation(req: SimulationRequest) -> dict:
    errors = cross_validate(req)
    if errors:
        raise ConfigValidationError(errors)
    run = _execute(run_simulation, req.to_config())
    store.runs.put(run["run_id"], run)
    return run


@router.get("/simulations")
def list_simulations() -> list[dict]:
    return [_run_summary(r) for r in reversed(store.runs.values())]


def _get_run(run_id: str) -> dict:
    run = store.runs.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found. Runs are kept in memory and are cleared when the backend restarts.")
    return run


@router.get("/simulations/{run_id}")
def get_simulation(run_id: str) -> dict:
    return _get_run(run_id)


def _download(content: str, filename: str, media_type: str) -> Response:
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/simulations/{run_id}/export")
def export_simulation(run_id: str, format: Literal["json", "csv"] = Query("json")) -> Response:
    run = _get_run(run_id)
    if format == "csv":
        return _download(run_to_csv(run), f"queuewise-run-{run_id}.csv", "text/csv")
    return _download(json.dumps(run, indent=2), f"queuewise-run-{run_id}.json", "application/json")


@router.post("/compare")
def compare(req: CompareRequest) -> dict:
    modes = sum(
        [req.run_ids is not None, req.configs is not None, req.base_config is not None or req.strategies is not None]
    )
    if modes > 1:
        raise ConfigValidationError(
            [{"field": "body", "message": "Send only one of: base_config + strategies, configs, or run_ids."}]
        )
    if req.configs is not None:
        errors = [e for i, cfg in enumerate(req.configs) for e in cross_validate(cfg, prefix=f"configs.{i}.")]
        errors = errors or request_budget_errors(req.configs, "configs")
        if errors:
            raise ConfigValidationError(errors)
        runs = [_execute(run_simulation, cfg.to_config()) for cfg in req.configs]
        for run in runs:
            store.runs.put(run["run_id"], run)
        comparison = build_comparison(runs, "configs")
    elif req.run_ids is not None:
        if len(set(req.run_ids)) != len(req.run_ids):
            raise ConfigValidationError([{"field": "run_ids", "message": "Each run can only be selected once."}])
        runs = [_get_run(rid) for rid in req.run_ids]
        comparison = build_comparison(runs, "runs")
    else:
        if req.base_config is None or req.strategies is None:
            raise ConfigValidationError(
                [{"field": "base_config", "message": "A controlled comparison needs base_config and at least two strategies."}]
            )
        if len(set(req.strategies)) != len(req.strategies):
            raise ConfigValidationError([{"field": "strategies", "message": "Each strategy can only be selected once."}])
        errors = cross_validate(req.base_config, prefix="base_config.")
        errors = errors or request_budget_errors([req.base_config] * len(req.strategies), "strategies")
        if errors:
            raise ConfigValidationError(errors)
        comparison = _execute(run_controlled_comparison, req.base_config.to_config(), list(req.strategies))
        for run in comparison["runs"]:
            store.runs.put(run["run_id"], run)
    store.comparisons.put(comparison["comparison_id"], comparison)
    return comparison


def _get_comparison(comparison_id: str) -> dict:
    comparison = store.comparisons.get(comparison_id)
    if comparison is None:
        raise HTTPException(status_code=404, detail=f"Comparison '{comparison_id}' not found.")
    return comparison


@router.get("/comparisons/{comparison_id}")
def get_comparison(comparison_id: str) -> dict:
    return _get_comparison(comparison_id)


@router.get("/comparisons/{comparison_id}/export")
def export_comparison(comparison_id: str, format: Literal["json", "csv"] = Query("json")) -> Response:
    comparison = _get_comparison(comparison_id)
    if format == "csv":
        return _download(comparison_to_csv(comparison), f"queuewise-comparison-{comparison_id}.csv", "text/csv")
    return _download(json.dumps(comparison, indent=2), f"queuewise-comparison-{comparison_id}.json", "application/json")
