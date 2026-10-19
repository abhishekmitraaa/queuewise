"""In-memory result store.

Runs and comparisons live only in this process and are lost when the backend
restarts (no database by design). The oldest entries are evicted first.
"""

from __future__ import annotations

from collections import OrderedDict
from threading import Lock
from typing import Any


class BoundedStore:
    def __init__(self, max_items: int):
        self.max_items = max_items
        self._items: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._lock = Lock()

    def put(self, key: str, value: dict[str, Any]) -> None:
        with self._lock:
            self._items[key] = value
            self._items.move_to_end(key)
            while len(self._items) > self.max_items:
                self._items.popitem(last=False)

    def get(self, key: str) -> dict[str, Any] | None:
        with self._lock:
            return self._items.get(key)

    def values(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._items.values())

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


runs = BoundedStore(max_items=50)
comparisons = BoundedStore(max_items=20)
