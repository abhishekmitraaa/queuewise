from __future__ import annotations

from ..config import AqmParams
from .base import DROP_AQM, DROP_OVERFLOW, DropCallback, QueueStrategy
from .codel_inspired import CoDelStrategy
from .fifo import FifoStrategy
from .fq_codel_inspired import FqCoDelStrategy

STRATEGY_CLASSES: dict[str, type[QueueStrategy]] = {
    FifoStrategy.key: FifoStrategy,
    CoDelStrategy.key: CoDelStrategy,
    FqCoDelStrategy.key: FqCoDelStrategy,
}

STRATEGY_INFO: list[dict[str, str]] = [
    {
        "key": "fifo",
        "label": FifoStrategy.label,
        "short_label": "FIFO",
        "description": "One shared first-in, first-out queue. Arriving packets are dropped only when the buffer is full (tail drop). Baseline.",
    },
    {
        "key": "codel",
        "label": CoDelStrategy.label,
        "short_label": "CoDel-inspired",
        "description": "One shared queue. Drops packets at dequeue when queueing (sojourn) delay stays above a target for a full interval, then drops more often until delay falls. Educational approximation of RFC 8289.",
    },
    {
        "key": "fq_codel",
        "label": FqCoDelStrategy.label,
        "short_label": "FQ-CoDel-inspired",
        "description": "A queue per flow served by deficit round robin, with new/sparse flows served first and the CoDel-inspired rule applied to each flow queue. Educational approximation of RFC 8290.",
    },
]

STRATEGY_LABELS = {info["key"]: info["label"] for info in STRATEGY_INFO}


def create_strategy(key: str, capacity_bytes: int, aqm: AqmParams, drop_cb: DropCallback) -> QueueStrategy:
    try:
        cls = STRATEGY_CLASSES[key]
    except KeyError as exc:
        raise ValueError(f"unknown strategy: {key}") from exc
    return cls(capacity_bytes, aqm, drop_cb)


__all__ = [
    "DROP_AQM",
    "DROP_OVERFLOW",
    "QueueStrategy",
    "STRATEGY_CLASSES",
    "STRATEGY_INFO",
    "STRATEGY_LABELS",
    "create_strategy",
]
