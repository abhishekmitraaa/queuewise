import { useId } from "react";
import { useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  dash?: string;
  /** Fill the area under the line (used for single-series charts). */
  area?: boolean;
}

export interface ChartReference {
  y: number;
  label: string;
}

interface Props {
  title: string;
  description?: string;
  unit: string;
  data: Record<string, number | null>[];
  series: ChartSeries[];
  references?: ChartReference[];
  height?: number;
  digits?: number;
  stepped?: boolean;
}

const MAX_POINTS = 800;

/** Keep charts responsive on very long runs by striding (the CSV export keeps every sample). */
function thin<T>(rows: T[]): T[] {
  if (rows.length <= MAX_POINTS) return rows;
  const stride = Math.ceil(rows.length / MAX_POINTS);
  return rows.filter((_, i) => i % stride === 0 || i === rows.length - 1);
}

function ChartTooltip({ active, payload, label, unit, digits }: TooltipProps<number, string> & { unit: string; digits: number }) {
  if (!active || !payload?.length) return null;
  const seen = new Set<string>();
  const rows = payload.filter((p) => {
    const k = String(p.dataKey);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <div className="rounded-xl border border-line bg-panel/95 px-3 py-2 text-xs shadow-[0_12px_32px_-12px_rgb(15_16_19/0.35)] backdrop-blur">
      <div className="num mb-1 font-medium text-ink">t = {Number(label).toFixed(2)} s</div>
      {rows.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="flex-1">{p.name}</span>
          <span className="num font-medium text-ink">
            {p.value === null || p.value === undefined ? "no packets" : `${Number(p.value).toFixed(digits)} ${unit}`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TimeSeriesChart({ title, description, unit, data, series, references = [], height = 240, digits = 2, stepped }: Props) {
  const reduce = useReducedMotion();
  const gid = useId().replace(/:/g, "");
  const rows = thin(data);
  const empty = rows.length === 0;
  const anim = { isAnimationActive: !reduce, animationDuration: 700, animationEasing: "ease-out" as const };
  return (
    <figure className="panel m-0 min-w-0 p-5">
      <figcaption className="mb-3">
        <div className="font-semibold tracking-tight text-ink">{title}</div>
        {description && <div className="mt-0.5 text-xs text-ink-3">{description}</div>}
      </figcaption>
      {empty ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-3" style={{ height }}>
          No samples yet. Run a simulation to draw this chart.
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`${title}. ${series.map((s) => s.label).join(", ")} over time in ${unit}.`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
              <defs>
                {series
                  .filter((s) => s.area)
                  .map((s) => (
                    <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
              </defs>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => `${Number(v).toFixed(v % 1 === 0 ? 0 : 1)}`}
                stroke="var(--color-ink-3)"
                tick={{ fontSize: 11, fill: "var(--color-ink-3)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-line-strong)" }}
                label={{ value: "Time (s)", position: "insideBottomRight", offset: -2, fontSize: 11, fill: "var(--color-ink-3)" }}
                height={34}
              />
              <YAxis
                stroke="var(--color-ink-3)"
                tick={{ fontSize: 11, fill: "var(--color-ink-3)" }}
                tickLine={false}
                axisLine={false}
                width={52}
                label={{ value: unit, angle: -90, position: "insideLeft", offset: 12, fontSize: 11, fill: "var(--color-ink-3)" }}
              />
              <Tooltip content={<ChartTooltip unit={unit} digits={digits} />} cursor={{ stroke: "var(--color-ink-3)", strokeDasharray: "3 3" }} />
              {series.length > 1 && (
                <Legend
                  verticalAlign="top"
                  align="left"
                  height={28}
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12, paddingBottom: 4 }}
                  formatter={(value) => <span style={{ color: "var(--color-ink-2)" }}>{value}</span>}
                />
              )}
              {references.map((r) => (
                <ReferenceLine
                  key={r.label}
                  y={r.y}
                  stroke="var(--color-ink-2)"
                  strokeDasharray="5 4"
                  ifOverflow="extendDomain"
                  label={{ value: r.label, position: "insideTopRight", fontSize: 11, fill: "var(--color-ink-2)" }}
                />
              ))}
              {series
                .filter((s) => s.area)
                .map((s) => (
                  <Area
                    key={`area-${s.key}`}
                    dataKey={s.key}
                    name={s.label}
                    type={stepped ? "stepAfter" : "monotone"}
                    stroke="none"
                    fill={`url(#${gid}-${s.key})`}
                    legendType="none"
                    tooltipType="none"
                    connectNulls={false}
                    {...anim}
                  />
                ))}
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type={stepped ? "stepAfter" : "monotone"}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dash || undefined}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-panel)" }}
                  connectNulls={false}
                  {...anim}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

/** Tiny axis-free trend line for metric tiles. */
export function Sparkline({ data, color, budget }: { data: { t: number; v: number | null }[]; color: string; budget?: number }) {
  const reduce = useReducedMotion();
  const gid = useId().replace(/:/g, "");
  return (
    <div className="h-20 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
          <YAxis hide domain={[0, "auto"]} />
          {budget !== undefined && <ReferenceLine y={budget} stroke="var(--color-ink-3)" strokeDasharray="4 4" ifOverflow="extendDomain" />}
          <Area
            dataKey="v"
            type="monotone"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gid})`}
            connectNulls
            isAnimationActive={!reduce}
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
