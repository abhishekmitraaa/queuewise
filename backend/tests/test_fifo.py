from app.simulation.config import AqmParams
from app.simulation.engine import SimulationEngine
from app.simulation.strategies.fifo import FifoStrategy

from conftest import make_config, make_flow, make_packet


def test_fifo_preserves_arrival_order(drop_log):
    q = FifoStrategy(100_000, AqmParams(), drop_log)
    for i in range(10):
        assert q.enqueue(make_packet(i, flow_id="ab"[i % 2], t=float(i)), float(i))
    order = [q.dequeue(20.0).packet_id for _ in range(10)]
    assert order == list(range(10))
    assert q.dequeue(21.0) is None
    assert q.bytes_queued == 0


def test_fifo_tail_drops_when_capacity_would_be_exceeded(drop_log):
    q = FifoStrategy(2500, AqmParams(), drop_log)  # room for two 1000-byte packets
    assert q.enqueue(make_packet(0), 0.0)
    assert q.enqueue(make_packet(1), 0.0)
    assert not q.enqueue(make_packet(2), 0.0)
    assert drop_log.drops == [(2, "overflow", 0.0)]
    assert q.bytes_queued == 2000 and q.packets_queued == 2
    # Space frees up after a dequeue.
    q.dequeue(1.0)
    assert q.enqueue(make_packet(3), 1.0)


def test_fifo_engine_delivers_in_order_with_shared_queue():
    cfg = make_config(
        flows=[make_flow("a", rate=6, start=0, stop=500), make_flow("b", rate=6, start=0, stop=500)],
        queue_kb=1000,
        duration=2000,
    )
    raw = SimulationEngine(cfg).run()
    # Overloaded (12 Mbps into 10 Mbps) with a huge buffer: nothing dropped, everything delivered.
    assert sum(f.dropped for f in raw.flows) == 0
    assert sum(f.delivered for f in raw.flows) == sum(f.generated for f in raw.flows)


def test_fifo_overflow_in_engine_matches_capacity():
    # 20 Mbps into 10 Mbps for 1 s with a 10 KB buffer: about half must be dropped.
    cfg = make_config(flows=[make_flow("a", rate=20, size=1000, stop=1000)], queue_kb=10, duration=1000)
    raw = SimulationEngine(cfg).run()
    fs = raw.flows[0]
    assert fs.dropped_overflow > 0
    assert 0.4 < fs.dropped / fs.generated < 0.6
    assert raw.peak_queue_bytes <= cfg.link.queue_capacity_bytes
