import { motion } from "motion/react";
import type { PerFlowResult } from "../types";
import { TRAFFIC_LABELS, fmtInt, fmtMbps, fmtMs, fmtPct } from "../lib/format";
import { flowColor } from "../lib/series";
import { EASE_OUT } from "../lib/motion";

interface Props {
  flows: PerFlowResult[];
  budgetMs: number;
  capacityMbps: number;
}

export function FlowTable({ flows, budgetMs, capacityMbps }: Props) {
  return (
    <section className="panel min-w-0 p-5" aria-labelledby="flow-table-title">
      <h3 id="flow-table-title" className="font-semibold tracking-tight text-ink">
        Per-flow outcomes
      </h3>
      <p className="mt-0.5 text-xs text-ink-3">
        Averaged over the full run. Fair share is each flow's max-min share of the link given its demand.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="text-xs text-ink-3">
              <th scope="col" className="pb-3 pr-3 font-medium">Flow</th>
              <th scope="col" className="px-3 pb-3 text-right font-medium">Offered (Mbps)</th>
              <th scope="col" className="px-3 pb-3 font-medium">Throughput (Mbps)</th>
              <th scope="col" className="px-3 pb-3 text-right font-medium">Fair share (Mbps)</th>
              <th scope="col" className="px-3 pb-3 text-right font-medium">Mean queue delay (ms)</th>
              <th scope="col" className="px-3 pb-3 text-right font-medium">p95 queue delay (ms)</th>
              <th scope="col" className="px-3 pb-3 text-right font-medium">p95 end-to-end (ms)</th>
              <th scope="col" className="px-3 pb-3 text-right font-medium">Over {budgetMs} ms</th>
              <th scope="col" className="px-3 pb-3 text-right font-medium">Loss</th>
              <th scope="col" className="pb-3 pl-3 text-right font-medium">Delivered / generated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {flows.map((f, i) => {
              const share = capacityMbps > 0 ? Math.min(1, f.throughput_mbps / capacityMbps) : 0;
              return (
                <tr key={f.flow_id} className="transition-colors hover:bg-raised/60">
                  <th scope="row" className="max-w-[220px] py-3 pr-3 font-normal">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: flowColor(i) }} aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="break-words font-medium text-ink">{f.name}</div>
                        <div className="text-xs text-ink-3">
                          {TRAFFIC_LABELS[f.traffic_type]}
                          {f.cwnd_reductions !== null && `, ${fmtInt(f.cwnd_reductions)} window cuts`}
                        </div>
                      </div>
                    </div>
                  </th>
                  <td className="num px-3 py-3 text-right text-ink-2">{fmtMbps(f.offered_load_mbps)}</td>
                  <td className="px-3 py-3">
                    <div className="num text-ink">{fmtMbps(f.throughput_mbps)}</div>
                    <motion.div
                      className="mt-1 h-1 rounded-full"
                      style={{ background: flowColor(i), width: `${Math.max(2, share * 100)}%`, originX: 0 }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.1 + i * 0.05 }}
                      aria-hidden="true"
                      title={`${fmtPct(share)} of link capacity`}
                    />
                  </td>
                  <td className="num px-3 py-3 text-right text-ink-2">{fmtMbps(f.fair_share_mbps)}</td>
                  <td className="num px-3 py-3 text-right text-ink-2">{fmtMs(f.mean_queueing_delay_ms)}</td>
                  <td className="num px-3 py-3 text-right font-medium text-ink">{fmtMs(f.p95_queueing_delay_ms)}</td>
                  <td className="num px-3 py-3 text-right text-ink-2">{fmtMs(f.p95_end_to_end_delay_ms)}</td>
                  <td className="num px-3 py-3 text-right text-ink-2">{fmtPct(f.delay_budget_violation_ratio)}</td>
                  <td className="num px-3 py-3 text-right text-ink-2">{fmtPct(f.loss_ratio)}</td>
                  <td className="num py-3 pl-3 text-right text-ink-3">
                    {fmtInt(f.packets_delivered)} / {fmtInt(f.packets_generated)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">The bar under each throughput value shows its share of the {capacityMbps} Mbps link.</p>
    </section>
  );
}
