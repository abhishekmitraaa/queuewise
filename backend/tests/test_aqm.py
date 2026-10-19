from app.simulation.config import AqmParams
from app.simulation.engine import SimulationEngine
from app.simulation.strategies.codel_inspired import CoDelQueue, CoDelStrategy
from app.simulation.strategies.fq_codel_inspired import FqCoDelStrategy

from conftest import make_config, make_flow, make_packet


def _fill(q: CoDelQueue, n: int, t: float = 0.0, size: int = 1000):
    for i in range(n):
        q.push(make_packet(i, size=size, t=t))


def test_single_slow_packet_is_not_dropped(drop_log):
    # Sojourn above target for one packet only: CoDel must tolerate it.
    q = CoDelQueue(target_ms=5, interval_ms=100, drop_cb=drop_log)
    _fill(q, 5)
    assert q.dequeue(50.0) is not None  # 50 ms sojourn: starts the timer, no drop
    assert drop_log.drops == []
    assert q.first_above_time == 150.0


def test_no_drop_until_delay_persists_for_an_interval(drop_log):
    q = CoDelQueue(target_ms=5, interval_ms=100, drop_cb=drop_log)
    _fill(q, 50)
    for now in (10, 40, 80, 109):
        assert q.dequeue(float(now)) is not None
    assert drop_log.drops == []
    q.dequeue(110.0)  # >= first_above_time (10 + 100): enter dropping state
    assert drop_log.reasons() == ["aqm"]
    assert q.dropping and q.count == 1


def test_timer_resets_when_delay_falls_below_target(drop_log):
    q = CoDelQueue(target_ms=5, interval_ms=100, drop_cb=drop_log)
    q.push(make_packet(0, t=0.0))
    q.push(make_packet(1, t=0.0))
    q.push(make_packet(2, t=0.0))
    q.dequeue(50.0)  # above target, timer armed
    assert q.first_above_time is not None
    q.push(make_packet(3, t=57.0))
    q.push(make_packet(4, t=57.0))
    q.packets.popleft(); q.bytes -= 1000  # drop packet 1/2 manually to expose a fresh packet
    q.packets.popleft(); q.bytes -= 1000
    q.dequeue(58.0)  # packet 3 waited 1 ms < target
    assert q.first_above_time is None
    assert drop_log.drops == []


def test_drop_rate_increases_while_delay_stays_high(drop_log):
    q = CoDelQueue(target_ms=5, interval_ms=100, drop_cb=drop_log)
    _fill(q, 2000)
    drop_times = []
    now = 0.0
    while now < 1500 and len(q):
        before = len(drop_log.drops)
        q.dequeue(now)
        if len(drop_log.drops) > before:
            drop_times.append(now)
        now += 1.0
    gaps = [b - a for a, b in zip(drop_times, drop_times[1:])]
    assert len(gaps) >= 5
    assert gaps[-1] < gaps[0]  # control law: interval / sqrt(count)


def test_leaves_dropping_state_when_queue_empties(drop_log):
    q = CoDelQueue(target_ms=5, interval_ms=100, drop_cb=drop_log)
    _fill(q, 30)
    now = 0.0
    while len(q):
        q.dequeue(now)
        now += 10.0
    assert q.dequeue(now) is None
    assert not q.dropping


def test_codel_strategy_tail_drops_on_full_buffer(drop_log):
    s = CoDelStrategy(2000, AqmParams(), drop_log)
    assert s.enqueue(make_packet(0), 0.0)
    assert s.enqueue(make_packet(1), 0.0)
    assert not s.enqueue(make_packet(2), 0.0)
    assert drop_log.reasons() == ["overflow"]


def test_codel_reduces_delay_for_responsive_traffic():
    flows = [make_flow("t", rate=15, size=1200, traffic="tcp_like", stop=10_000)]
    fifo = SimulationEngine(make_config(flows=flows, queue_kb=256, duration=10_000, prop=20)).run()
    codel = SimulationEngine(make_config(flows=flows, strategy="codel", queue_kb=256, duration=10_000, prop=20)).run()
    fifo_mean = sum(fifo.flows[0].queueing_delays_ms) / fifo.flows[0].delivered
    codel_mean = sum(codel.flows[0].queueing_delays_ms) / codel.flows[0].delivered
    assert codel.flows[0].dropped_aqm > 0
    assert codel_mean < fifo_mean


# ------------------------------------------------------------ FQ-CoDel-inspired


def test_fq_keeps_flows_separate_and_round_robins(drop_log):
    s = FqCoDelStrategy(1_000_000, AqmParams(quantum_bytes=1000), drop_log)
    pid = 0
    for flow in ("a", "b"):
        for _ in range(4):
            s.enqueue(make_packet(pid, flow_id=flow, size=1000, t=0.0), 0.0)
            pid += 1
    served = [s.dequeue(1.0) for _ in range(8)]
    flows = [p.flow_id for p in served]
    # Each packet keeps its identity, and service alternates between flows.
    assert sorted(p.packet_id for p in served) == list(range(8))
    assert flows == ["a", "b", "a", "b", "a", "b", "a", "b"]
    assert all(p.packet_id < 4 for p in served if p.flow_id == "a")


def test_fq_drr_is_byte_fair_with_different_packet_sizes(drop_log):
    s = FqCoDelStrategy(10_000_000, AqmParams(quantum_bytes=1500), drop_log)
    pid = 0
    for _ in range(300):
        s.enqueue(make_packet(pid, flow_id="big", size=1500), 0.0); pid += 1
        s.enqueue(make_packet(pid, flow_id="small", size=300), 0.0); pid += 1
    sent = {"big": 0, "small": 0}
    for _ in range(200):
        p = s.dequeue(0.0)
        sent[p.flow_id] += p.size_bytes
    assert abs(sent["big"] - sent["small"]) <= 1500


def test_fq_serves_new_sparse_flow_first(drop_log):
    s = FqCoDelStrategy(1_000_000, AqmParams(quantum_bytes=1514), drop_log)
    for i in range(20):
        s.enqueue(make_packet(i, flow_id="bulk", size=1200), 0.0)
    for _ in range(5):
        s.dequeue(0.0)
    s.enqueue(make_packet(100, flow_id="voice", size=200), 1.0)
    assert s.dequeue(1.0).flow_id == "voice"


def test_fq_overflow_drops_from_fattest_flow(drop_log):
    s = FqCoDelStrategy(5000, AqmParams(), drop_log)
    for i in range(4):
        s.enqueue(make_packet(i, flow_id="heavy", size=1000), 0.0)
    assert s.enqueue(make_packet(10, flow_id="light", size=1000), 0.0)
    assert s.enqueue(make_packet(11, flow_id="light", size=1000), 0.0)  # forces an overflow drop
    assert drop_log.drops == [(0, "overflow", 0.0)]  # head of the heavy flow
    assert s.bytes_queued <= 5000
    assert s.flow_backlog_bytes() == {"heavy": 3000, "light": 2000}


def test_fq_drops_packet_larger_than_buffer(drop_log):
    s = FqCoDelStrategy(500, AqmParams(), drop_log)
    assert not s.enqueue(make_packet(0, size=1000), 0.0)
    assert drop_log.reasons() == ["overflow"]
    assert s.dequeue(0.0) is None


def test_fq_empty_flows_are_skipped(drop_log):
    s = FqCoDelStrategy(100_000, AqmParams(), drop_log)
    assert s.dequeue(0.0) is None
    s.enqueue(make_packet(0, flow_id="a"), 0.0)
    assert s.dequeue(0.0).packet_id == 0
    assert s.dequeue(0.0) is None
    assert s.packets_queued == 0
