import { motion, useReducedMotion } from "motion/react";
import type { RunResult, SimulationConfig } from "../types";
import { fmtKB, fmtMs, fmtPct } from "../lib/format";
import { flowColor } from "../lib/series";

interface Props {
  config: SimulationConfig;
  run: RunResult | null;
  stale: boolean;
  running?: boolean;
}

const W = 780;
const ROW = 48;
const TOP = 64;

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Packets travelling along a path: shows the direction of traffic. Hidden under reduced motion. */
function Packets({ path, color, count, dur, active }: { path: string; color: string; count: number; dur: number; active: boolean }) {
  if (!active || count === 0) return null;
  return (
    <g aria-hidden="true">
      {Array.from({ length: count }, (_, k) => (
        <circle key={k} r={3.2} fill={color} opacity={0.9}>
          {/* Negative begin = already mid-flight, so no packet waits parked at the SVG origin. */}
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`-${((k * dur) / count).toFixed(2)}s`} path={path} />
        </circle>
      ))}
    </g>
  );
}

export function QueueTopology({ config, run, stale, running = false }: Props) {
  const reduce = useReducedMotion();
  const animate = !reduce;
  const flows = config.flows;
  const n = Math.max(flows.length, 1);
  const midY = TOP + ((n - 1) * ROW) / 2 + 19;
  const isFq = config.strategy === "fq_codel";
  const capBytes = config.link.queue_capacity_kb * 1024;
  const totalOffered = flows.reduce((a, f) => a + (Number.isFinite(f.offered_rate_mbps) ? f.offered_rate_mbps : 0), 0);
  const hasTcp = flows.some((f) => f.traffic_type === "tcp_like");
  const loadRatio = config.link.capacity_mbps > 0 ? totalOffered / config.link.capacity_mbps : 0;

  // Measured values are shown only when the run matches the strategy drawn.
  const r = run && run.strategy === config.strategy ? run : null;
  const meanFrac = r ? Math.min(1, r.metrics.mean_queue_occupancy_bytes / r.metrics.queue_capacity_bytes) : 0;
  const peakFrac = r ? Math.min(1, r.metrics.peak_queue_occupancy_bytes / r.metrics.queue_capacity_bytes) : 0;

  const qx0 = 282;
  const qx1 = 552;
  const qh = 46;
  const H = Math.max(TOP + n * ROW + (isFq ? 50 : 16), midY + qh / 2 + 76);
  const avgPacket = flows.length ? flows.reduce((a, f) => a + (f.packet_size_bytes || 1000), 0) / flows.length : 1000;
  const slots = Math.max(4, Math.min(28, Math.round(capBytes / Math.max(avgPacket, 1))));
  const linkX0 = 596;
  const linkX1 = 668;
  const flowY = (i: number) => TOP + i * ROW;
  const runKey = r?.run_id ?? "none";
  // Faster packets while a simulation is running; a calm drift otherwise.
  const dur = running ? 1.1 : 2.6;
  const springFill = { type: "spring", stiffness: 70, damping: 18 } as const;

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[580px]" role="img" aria-labelledby="topo-title topo-desc">
          <title id="topo-title">Bottleneck topology</title>
          <desc id="topo-desc">
            {`${flows.length} flow(s) offering ${totalOffered.toFixed(2)} Mbps feed ${isFq ? "per-flow queues" : "one shared queue"} of ${
              config.link.queue_capacity_kb
            } KB in front of a ${config.link.capacity_mbps} Mbps link to the receiver.${
              r ? ` Measured mean queue occupancy ${fmtKB(r.metrics.mean_queue_occupancy_bytes)} KB, peak ${fmtKB(r.metrics.peak_queue_occupancy_bytes)} KB.` : ""
            }`}
          </desc>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--color-ink-2)" />
            </marker>
          </defs>

          <g fontSize="12" fill="var(--color-ink-3)">
            <text x={12} y={18}>Senders</text>
            <text x={qx0} y={18}>
              {isFq ? "Per-flow queues (DRR + AQM each)" : config.strategy === "codel" ? "Shared queue with AQM" : "Shared FIFO queue"}
            </text>
            <text x={linkX0 - 6} y={18}>Bottleneck link</text>
            <text x={690} y={18}>Receiver</text>
          </g>

          {flows.map((f, i) => {
            const y = flowY(i);
            const path = isFq ? `M208 ${y + 19} L${qx0} ${y + 19}` : `M208 ${y + 19} C 245 ${y + 19}, 245 ${midY}, ${qx0} ${midY}`;
            const rate = Number.isFinite(f.offered_rate_mbps) ? f.offered_rate_mbps : 0;
            return (
              <g key={i}>
                <rect x={12} y={y} width={196} height={38} rx={10} fill="var(--color-raised)" stroke="var(--color-line)" />
                <circle cx={28} cy={y + 19} r={5} fill={flowColor(i)} />
                <text x={40} y={y + 16} fontSize="12.5" fill="var(--color-ink)" fontWeight={550}>
                  {truncate(f.name || f.flow_id, 25)}
                </text>
                <text x={40} y={y + 31} fontSize="11" fill="var(--color-ink-3)">
                  {`${f.traffic_type === "tcp_like" ? "up to " : ""}${Number.isFinite(f.offered_rate_mbps) ? f.offered_rate_mbps : "?"} Mbps, ${
                    f.traffic_type === "tcp_like" ? "TCP-like" : f.traffic_type === "constant_rate" ? "constant" : f.traffic_type
                  }`}
                </text>
                <path d={path} fill="none" stroke="var(--color-line-strong)" strokeWidth={1.5} />
                <Packets path={path} color={flowColor(i)} count={rate > 0 ? Math.min(3, 1 + Math.round(rate / 6)) : 0} dur={dur} active={animate} />
              </g>
            );
          })}

          {!isFq && (
            <g>
              <rect x={qx0} y={midY - qh / 2} width={qx1 - qx0} height={qh} rx={8} fill="var(--color-canvas)" stroke="var(--color-line-strong)" />
              {r && meanFrac > 0 && (
                <motion.rect
                  key={runKey}
                  x={qx1 - (qx1 - qx0) * meanFrac}
                  y={midY - qh / 2 + 3}
                  width={Math.max(0, (qx1 - qx0) * meanFrac - 3)}
                  height={qh - 6}
                  rx={5}
                  fill="var(--color-accent)"
                  style={{ originX: 1, transformBox: "fill-box" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1, opacity: stale ? 0.4 : 0.9 }}
                  transition={springFill}
                />
              )}
              {Array.from({ length: slots - 1 }, (_, k) => {
                const x = qx0 + ((qx1 - qx0) * (k + 1)) / slots;
                return <line key={k} x1={x} x2={x} y1={midY - qh / 2 + 7} y2={midY + qh / 2 - 7} stroke="var(--color-line)" strokeWidth={1} />;
              })}
              {r && peakFrac > 0 && (
                <motion.g key={`peak-${runKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.4 }}>
                  <line
                    x1={qx1 - (qx1 - qx0) * peakFrac}
                    x2={qx1 - (qx1 - qx0) * peakFrac}
                    y1={midY - qh / 2 - 8}
                    y2={midY + qh / 2 + 8}
                    stroke="var(--color-ink)"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                  <text x={qx1 - (qx1 - qx0) * peakFrac} y={midY - qh / 2 - 12} fontSize="11" fill="var(--color-ink-2)" textAnchor="middle">
                    peak {fmtKB(r.metrics.peak_queue_occupancy_bytes)} KB
                  </text>
                </motion.g>
              )}
              <text x={qx0} y={midY + qh / 2 + 20} fontSize="11.5" fill="var(--color-ink-3)">
                tail: drops arrivals when full
              </text>
              <text x={qx1} y={midY + qh / 2 + 36} fontSize="11.5" fill="var(--color-ink-3)" textAnchor="end">
                {config.strategy === "codel" ? `head: AQM drops (target ${config.aqm.target_ms} ms)` : "head: next to send"}
              </text>
              <text x={(qx0 + qx1) / 2} y={midY + qh / 2 + 60} fontSize="12" fill="var(--color-ink-2)" textAnchor="middle">
                {r
                  ? `mean ${fmtKB(r.metrics.mean_queue_occupancy_bytes)} KB of ${config.link.queue_capacity_kb} KB, p95 wait ${fmtMs(r.metrics.p95_queueing_delay_ms)} ms`
                  : `${config.link.queue_capacity_kb} KB buffer`}
              </text>
              <path d={`M${qx1} ${midY} L${linkX0} ${midY}`} stroke="var(--color-line-strong)" strokeWidth={1.5} />
            </g>
          )}

          {isFq && (
            <g>
              {flows.map((f, i) => {
                const y = flowY(i) + 19;
                const pf = r?.per_flow.find((p) => p.flow_id === f.flow_id);
                const delay = pf?.p95_queueing_delay_ms ?? null;
                return (
                  <g key={i}>
                    <rect x={qx0} y={y - 13} width={qx1 - qx0 - 46} height={26} rx={7} fill="var(--color-canvas)" stroke="var(--color-line-strong)" />
                    <rect x={qx0} y={y - 13} width={4} height={26} rx={2} fill={flowColor(i)} />
                    <text x={qx0 + 14} y={y + 4} fontSize="11.5" fill="var(--color-ink-2)">
                      {r ? `p95 wait ${fmtMs(delay)} ms, loss ${fmtPct(pf?.loss_ratio ?? null)}` : "own queue + CoDel-inspired AQM"}
                    </text>
                    <path d={`M${qx1 - 46} ${y} C ${qx1 - 24} ${y}, ${qx1 - 24} ${midY}, ${qx1 - 4} ${midY}`} fill="none" stroke="var(--color-line-strong)" strokeWidth={1.5} />
                  </g>
                );
              })}
              <circle cx={qx1 + 12} cy={midY} r={17} fill="var(--color-raised)" stroke="var(--color-accent)" strokeWidth={1.5} />
              <text x={qx1 + 12} y={midY + 4} fontSize="11" fill="var(--color-ink)" textAnchor="middle" fontWeight={600}>
                DRR
              </text>
              <path d={`M${qx1 + 29} ${midY} L${linkX0} ${midY}`} stroke="var(--color-line-strong)" strokeWidth={1.5} />
              {r && (
                <g>
                  <rect x={qx0} y={H - 30} width={qx1 - qx0 - 46} height={10} rx={5} fill="var(--color-canvas)" stroke="var(--color-line)" />
                  <motion.rect
                    key={runKey}
                    x={qx0 + 1}
                    y={H - 29}
                    width={Math.max(0, (qx1 - qx0 - 48) * meanFrac)}
                    height={8}
                    rx={4}
                    fill="var(--color-accent)"
                    style={{ originX: 0, transformBox: "fill-box" }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1, opacity: stale ? 0.4 : 0.9 }}
                    transition={springFill}
                  />
                  <text x={qx0} y={H - 36} fontSize="11" fill="var(--color-ink-3)">
                    {`shared buffer: mean ${fmtKB(r.metrics.mean_queue_occupancy_bytes)} KB, peak ${fmtKB(r.metrics.peak_queue_occupancy_bytes)} KB of ${config.link.queue_capacity_kb} KB`}
                  </text>
                </g>
              )}
            </g>
          )}

          <g>
            <path d={`M${linkX0} ${midY} L${linkX1} ${midY}`} stroke="var(--color-ink-2)" strokeWidth={4} markerEnd="url(#arrow)" />
            <Packets path={`M${linkX0} ${midY} L${linkX1 - 8} ${midY}`} color="var(--color-accent)" count={totalOffered > 0 ? 2 : 0} dur={dur * 0.6} active={animate} />
            <text x={(linkX0 + linkX1) / 2} y={midY - 14} fontSize="12.5" fill="var(--color-ink)" textAnchor="middle" fontWeight={600}>
              {config.link.capacity_mbps} Mbps
            </text>
            <text x={(linkX0 + linkX1) / 2} y={midY + 24} fontSize="11" fill="var(--color-ink-3)" textAnchor="middle">
              {config.link.propagation_delay_ms} ms prop.
            </text>
          </g>

          <g>
            <rect x={680} y={midY - 26} width={88} height={52} rx={10} fill="var(--color-raised)" stroke="var(--color-line)" />
            <text x={724} y={midY - 2} fontSize="12.5" fill="var(--color-ink)" textAnchor="middle" fontWeight={550}>
              Receiver
            </text>
            <text x={724} y={midY + 14} fontSize="11" fill="var(--color-ink-3)" textAnchor="middle">
              {r ? `${r.metrics.throughput_mbps.toFixed(2)} Mbps` : "delivered"}
            </text>
          </g>
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
        <span>
          Offered {hasTcp ? "up to " : ""}
          <strong className="font-semibold text-ink-2">{totalOffered.toFixed(2)} Mbps</strong> into {config.link.capacity_mbps} Mbps (
          <span className={loadRatio > 1 ? "font-medium text-caution" : "text-ink-2"}>{(loadRatio * 100).toFixed(0)}% of capacity</span>)
        </span>
        {r ? (
          <span>
            Buffer fill shows the measured mean occupancy{!isFq && "; the dashed line marks the peak"}
            {stale && " (from the last run; settings have changed since)"}.
          </span>
        ) : (
          <span>Run the simulation to fill the buffer with measured occupancy.</span>
        )}
      </figcaption>
    </figure>
  );
}
