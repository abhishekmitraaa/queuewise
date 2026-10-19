import pytest

from app.simulation.engine import SimulationEngine, SimulationLimitError
from app.simulation.link import serialization_time_ms
from app.simulation.traffic import flow_arrivals, packet_interval_ms

from conftest import make_config, make_flow


def test_serialization_time_units():
    # 1500 bytes at 10 Mbps = 12000 bits / 10e6 bit/s = 1.2 ms
    assert serialization_time_ms(1500, 10) == pytest.approx(1.2)
    # 1000 bytes at 1 Mbps = 8 ms
    assert serialization_time_ms(1000, 1) == pytest.approx(8.0)
    assert packet_interval_ms(1000, 1) == pytest.approx(8.0)


def test_single_packet_delay_components():
    # One packet on an idle link: no queueing, e2e = serialization + propagation.
    flow = make_flow("a", rate=0.008, size=1000, start=5, stop=1000)  # one packet per second
    cfg = make_config(flows=[flow], prop=25, duration=1000)
    raw = SimulationEngine(cfg).run()
    fs = raw.flows[0]
    assert fs.generated == 1 and fs.delivered == 1
    assert fs.queueing_delays_ms == [0.0]
    assert fs.end_to_end_delays_ms[0] == pytest.approx(0.8 + 25)


def test_no_packet_delivered_before_service_and_propagation():
    cfg = make_config(flows=[make_flow("a", rate=15, size=1200, stop=1000)], prop=20, duration=1000)
    raw = SimulationEngine(cfg).run()
    tx = serialization_time_ms(1200, 10)
    fs = raw.flows[0]
    assert fs.delivered > 0
    for q, e2e in zip(fs.queueing_delays_ms, fs.end_to_end_delays_ms):
        assert q >= 0
        assert e2e == pytest.approx(q + tx + 20)


def test_queueing_delay_matches_backlog():
    # Two packets arrive together; the second waits exactly one serialization time.
    cfg = make_config(
        flows=[make_flow("a", rate=0.008, size=1000, start=0), make_flow("b", rate=0.008, size=1000, start=0)],
        duration=500,
    )
    raw = SimulationEngine(cfg).run()
    delays = sorted(raw.flows[0].queueing_delays_ms + raw.flows[1].queueing_delays_ms)
    assert delays == pytest.approx([0.0, 0.8])


@pytest.mark.parametrize("strategy", ["fifo", "codel", "fq_codel"])
@pytest.mark.parametrize("traffic", ["constant_rate", "poisson", "bursty", "tcp_like"])
def test_packet_accounting_is_conserved(strategy, traffic):
    flows = [make_flow("a", rate=14, size=1200, traffic=traffic, stop=3000), make_flow("b", rate=1, size=300, start=200, stop=3000)]
    cfg = make_config(flows=flows, strategy=strategy, queue_kb=32, duration=3000)
    raw = SimulationEngine(cfg).run()
    generated = sum(f.generated for f in raw.flows)
    delivered = sum(f.delivered for f in raw.flows)
    dropped = sum(f.dropped for f in raw.flows)
    assert generated == delivered + dropped + raw.packets_queued_at_end + raw.packets_in_flight_at_end
    for f in raw.flows:
        assert f.delivered == len(f.queueing_delays_ms) == len(f.end_to_end_delays_ms)


def test_flows_respect_start_stop_and_duration():
    flow = make_flow("a", rate=5, size=1000, start=100, stop=5000)
    times = list(flow_arrivals(flow, seed=1, duration_ms=400))
    assert times[0] == pytest.approx(100)
    assert all(100 <= t < 400 for t in times)
    assert all(b > a for a, b in zip(times, times[1:]))


def test_bursty_flow_has_on_off_structure():
    flow = make_flow("v", rate=20, size=1200, traffic="bursty", stop=10_000, burst_on_ms=100, burst_off_ms=400)
    times = list(flow_arrivals(flow, seed=3, duration_ms=10_000))
    gaps = [b - a for a, b in zip(times, times[1:])]
    peak_gap = packet_interval_ms(1200, 20)
    assert min(gaps) == pytest.approx(peak_gap)
    assert max(gaps) > 50 * peak_gap  # OFF periods exist
    average_rate = len(times) * 1200 * 8 / 10.0 / 1e6
    assert average_rate < 20 * 0.5


def test_samples_cover_duration_at_fixed_interval():
    cfg = make_config(duration=1000, interval=100)
    raw = SimulationEngine(cfg).run()
    assert [s["time_ms"] for s in raw.samples] == [i * 100.0 for i in range(11)]


def test_event_limit_raises():
    cfg = make_config(flows=[make_flow("a", rate=50, size=100, stop=1000)])
    with pytest.raises(SimulationLimitError):
        SimulationEngine(cfg, max_events=1000).run()


def test_tcp_like_flow_backs_off_and_fills_link():
    cfg = make_config(flows=[make_flow("t", rate=50, size=1200, traffic="tcp_like", stop=5000)], queue_kb=64, duration=5000)
    raw = SimulationEngine(cfg).run()
    fs = raw.flows[0]
    assert raw.cwnd_reductions["t"] > 0  # reacted to losses
    # Sender is limited by the bottleneck, not by its 50 Mbps access rate.
    offered_mbps = fs.generated_bytes * 8 / 5.0 / 1e6
    assert offered_mbps < 12
    throughput_mbps = fs.delivered_bytes * 8 / 5.0 / 1e6
    assert throughput_mbps > 8
    cwnds = [s["per_flow_cwnd_packets"]["t"] for s in raw.samples]
    assert max(cwnds) > min(cwnds[1:])
