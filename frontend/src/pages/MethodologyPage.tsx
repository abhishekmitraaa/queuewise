import type { ReactNode } from "react";
import { METRIC_DEFINITIONS } from "../components/RunResults";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-8">
      <h2 id={id} className="font-display text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-4 max-w-[75ch] space-y-3 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

function BufferbloatDiagram() {
  // Two buffers in front of the same 10 Mbps link. Delay = queued bits / link rate.
  const rows = [
    { kb: 24, label: "Small buffer, 24 KB", y: 30 },
    { kb: 256, label: "Large buffer, 256 KB", y: 110 },
  ];
  const scale = 300 / 256;
  return (
    <figure className="panel m-0 p-5">
      <svg viewBox="0 0 640 170" className="w-full min-w-[480px] max-w-[700px]" role="img" aria-labelledby="bb-title">
        <title id="bb-title">
          A full 24 KB buffer on a 10 Mbps link adds about 20 ms of queueing delay; a full 256 KB buffer adds about 210 ms, while the link rate stays 10 Mbps.
        </title>
        {rows.map((r) => {
          const w = r.kb * scale;
          const ms = (r.kb * 1024 * 8) / 10e6 * 1000;
          return (
            <g key={r.kb}>
              <text x={0} y={r.y - 10} fontSize="13" fill="var(--color-ink-2)">
                {r.label}
              </text>
              <rect x={0} y={r.y} width={320} height={30} rx={5} fill="var(--color-canvas)" stroke="var(--color-line-strong)" />
              <rect x={320 - w} y={r.y + 3} width={w - 3} height={24} rx={3} fill="var(--color-accent)" opacity={0.9} />
              <path d={`M322 ${r.y + 15} L420 ${r.y + 15}`} stroke="var(--color-ink-2)" strokeWidth={4} />
              <text x={371} y={r.y + 6} fontSize="12" fill="var(--color-ink)" textAnchor="middle">
                10 Mbps
              </text>
              <text x={440} y={r.y + 20} fontSize="15" fill="var(--color-ink)" fontWeight={600}>
                ≈ {ms.toFixed(0)} ms wait when full
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-sm text-ink-3">
        The link sends 10 Mbps either way. A larger full buffer only makes each packet wait longer: delay = queued bytes × 8 ÷ link rate.
      </figcaption>
    </figure>
  );
}

export function MethodologyPage() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">Methodology</h1>
        <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-ink-2">
          How QueueWise models a bottleneck, what each strategy does, how every metric is defined, and where the model stops. QueueWise is an educational
          simulator: its numbers are simulated, not measured on a real network.
        </p>
      </header>

      <div className="overflow-x-auto">
        <BufferbloatDiagram />
      </div>

      <Section id="m-model" title="Simulation model">
        <p>
          A deterministic discrete-event simulation of one bottleneck link. Traffic flows send packets into a queue; the link transmits one packet at a time at its
          capacity. Serialization time is packet bits ÷ (capacity × 1,000,000 bit/s). A packet is delivered one propagation delay after its transmission ends.
          Time is in milliseconds (floating point) throughout; rates are in Mbps; 1 KB = 1024 bytes.
        </p>
        <p>
          <strong className="text-ink">Event ordering.</strong> Events are processed by time. At equal times the order is: deliveries, transmission
          completions (the link starts its next packet), ACKs and loss signals to TCP-like senders, packet arrivals, then the periodic sample. Ties within a kind
          follow the order the events were scheduled. Samples therefore show the state after everything at that instant.
        </p>
        <p>
          <strong className="text-ink">Termination.</strong> Flows only generate packets before their stop time and before the end of the run. The simulation
          stops at the configured duration without draining. Packets still queued or in flight are reported separately, so generated = delivered + dropped +
          queued at end + in flight at end, and no packet is counted twice.
        </p>
        <p>
          <strong className="text-ink">Reproducibility.</strong> Every random choice comes from a per-flow generator seeded with the run seed and the flow id.
          The same settings and seed always produce identical results.
        </p>
      </Section>

      <Section id="m-traffic" title="Traffic models">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-ink">Constant rate:</strong> evenly spaced packets at the configured rate (UDP-like, ignores drops).
          </li>
          <li>
            <strong className="text-ink">Poisson:</strong> random, exponentially distributed gaps with the configured mean rate.
          </li>
          <li>
            <strong className="text-ink">Bursty ON/OFF:</strong> sends at the configured peak rate during random ON periods and is silent during random OFF
            periods.
          </li>
          <li>
            <strong className="text-ink">TCP-like (responsive):</strong> a simplified AIMD sender. It keeps at most a congestion window of unacknowledged
            packets, grows the window by one per ACK in slow start and by 1/window per ACK afterwards, and halves it (once per window) when it learns of a drop.
            ACKs return one propagation delay after delivery. A drop is noticed after the packets queued behind it would have been acknowledged, so drops at
            the head of a queue (AQM) are noticed sooner than tail drops behind a long queue. No retransmissions, timeouts or ECN are modelled.
          </li>
        </ul>
        <p>
          Open-loop traffic does not slow down when packets are dropped, so dropping cannot shrink the arrival rate; the Unresponsive Overload preset shows this
          limit. TCP-like flows are what allow AQM to keep delay low.
        </p>
      </Section>

      <Section id="m-strategies" title="Queue strategies and what is simplified">
        <p>
          <strong className="text-ink">FIFO (tail drop).</strong> One shared first-in, first-out queue. An arriving packet is dropped if it would exceed the
          buffer capacity in bytes.
        </p>
        <p>
          <strong className="text-ink">CoDel-inspired AQM.</strong> Follows the control logic of RFC 8289. The sojourn time of each packet is checked as it
          leaves the queue. One slow packet is tolerated; only when sojourn time stays above the target (default 5 ms) for a full interval (default 100 ms) does
          the queue start dropping. While delay stays high, the next drop is scheduled at interval ÷ √count, so drops become more frequent, and dropping
          stops as soon as delay falls below the target. Simplified: drops only (no ECN marking), floating-point clock, byte-based tail drop when the buffer is
          full, and not validated against the reference implementation.
        </p>
        <p>
          <strong className="text-ink">FQ-CoDel-inspired.</strong> Follows RFC 8290 in outline: one queue per flow, deficit round robin with a byte quantum, new
          flows served before old flows (which favours sparse, interactive traffic), and the CoDel-inspired rule applied to each flow queue. When the shared
          buffer is full, packets are dropped from the head of the flow with the largest backlog. Simplified: flows are separated exactly by id (no hashing or
          collisions), drops happen one at a time instead of in batches, and no ECN.
        </p>
        <p>These strategies are educational approximations. They are labelled "inspired" because they are not validated, standards-compliant implementations.</p>
      </Section>

      <Section id="m-metrics" title="Metric definitions">
        <dl className="space-y-3">
          {METRIC_DEFINITIONS.map((d) => (
            <div key={d.term}>
              <dt className="font-medium text-ink">{d.term}</dt>
              <dd>{d.definition}</dd>
            </div>
          ))}
          <div>
            <dt className="font-medium text-ink">Measurement window</dt>
            <dd>Throughput, offered load and utilization are averaged over the full configured duration, including the start-up period.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Fair share</dt>
            <dd>
              Max-min fair share by water-filling: no flow is given more than it asks for, and leftover capacity is split among the rest. The demand of a
              TCP-like flow is its maximum send rate; for other flows it is their measured offered load.
            </dd>
          </div>
        </dl>
      </Section>

      <Section id="m-findings" title="How findings are generated">
        <p>
          Findings are produced by fixed rules applied to measured values. No AI model writes them. Thresholds: offered load above 105% of capacity counts as
          overload and below 90% as uncongested; utilization of 90% or more with p95 queueing delay above the budget is reported as the bufferbloat signature; a
          sample counts as a near-full buffer at 90% of capacity; Jain's index of 0.95 or more counts as close to fair; p95 values within 1 ms or 10% count as
          similar. Comparison findings describe measured trade-offs between strategies and never assume a winner.
        </p>
      </Section>

      <Section id="m-limits" title="Limitations">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>This is a software simulation, not a physical network experiment or packet capture.</li>
          <li>The TCP-like sender is a simplified AIMD model and does not capture full TCP dynamics (retransmissions, timeouts, SACK, pacing, CUBIC/BBR).</li>
          <li>CoDel-inspired and FQ-CoDel-inspired strategies can behave differently from production implementations such as Linux fq_codel.</li>
          <li>A single bottleneck with an uncongested reverse path does not represent every topology.</li>
          <li>Results depend on the workload, capacity, buffer size, seed and measurement rules chosen. Runs are stored in memory only and disappear when the backend restarts.</li>
        </ul>
      </Section>

      <Section id="m-refs" title="References">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>K. Nichols, V. Jacobson, A. McGregor, J. Iyengar. RFC 8289: Controlled Delay Active Queue Management. IETF, 2018.</li>
          <li>T. Høiland-Jørgensen, P. McKenney, D. Taht, J. Gettys, E. Dumazet. RFC 8290: The Flow Queue CoDel Packet Scheduler and Active Queue Management Algorithm. IETF, 2018.</li>
          <li>R. Jain, D. Chiu, W. Hawe. A Quantitative Measure of Fairness and Discrimination for Resource Allocation in Shared Computer Systems. DEC-TR-301, 1984.</li>
          <li>J. Gettys, K. Nichols. Bufferbloat: Dark Buffers in the Internet. ACM Queue, 2011.</li>
        </ul>
      </Section>
    </div>
  );
}
