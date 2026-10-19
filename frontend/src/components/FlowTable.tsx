import type { PerFlowResult } from "../types";
import { TRAFFIC_LABELS, fmtInt, fmtMbps, fmtMs, fmtPct } from "../lib/format";
import { flowColor } from "../lib/series";

interface Props {
  flows: PerFlowResult[];
  budgetMs: number;
}

export function FlowTable({ flows, budgetMs }: Props) {
  return (
    <section className="panel min-w-0 p-4" aria-labelledby="flow-table-title">
      <div className="mb-3">
        <h3 id="flow-table-title" className="font-display text-[15px] font-semibold text-ink">
          Per-flow outcomes
        </h3>
        <p className="mt-0.5 text-xs text-ink-3">
          Offered load and throughput are averaged over the full run. Fair share is each flow's max-min share of the link given its demand.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-3">
              <th scope="col" className="py-2 pr-3 font-medium">Flow</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Offered (Mbps)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Throughput (Mbps)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Fair share (Mbps)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Mean queue delay (ms)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">p95 queue delay (ms)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">p95 end-to-end (ms)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Over {budgetMs} ms</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Loss</th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">Delivered / generated</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((f, i) => (
              <tr key={f.flow_id} className="border-b border-line/60 last:border-0">
                <th scope="row" className="max-w-[220px] py-2.5 pr-3 font-normal">
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: flowColor(i) }} aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="break-words font-medium text-ink">{f.name}</div>
                      <div className="text-xs text-ink-3">
                        {TRAFFIC_LABELS[f.traffic_type]}
                        {f.cwnd_reductions !== null && ` · ${fmtInt(f.cwnd_reductions)} window cuts`}
                      </div>
                    </div>
                  </div>
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{fmtMbps(f.offered_load_mbps)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtMbps(f.throughput_mbps)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{fmtMbps(f.fair_share_mbps)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{fmtMs(f.mean_queueing_delay_ms)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtMs(f.p95_queueing_delay_ms)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{fmtMs(f.p95_end_to_end_delay_ms)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{fmtPct(f.delay_budget_violation_ratio)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{fmtPct(f.loss_ratio)}</td>
                <td className="py-2.5 pl-3 text-right tabular-nums text-ink-3">
                  {fmtInt(f.packets_delivered)} / {fmtInt(f.packets_generated)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
