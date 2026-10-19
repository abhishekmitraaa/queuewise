import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  return (
    <div className="rounded-md border border-line-strong bg-canvas/95 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">t = {Number(label).toFixed(2)} s</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block h-0.5 w-3" style={{ background: p.color }} aria-hidden="true" />
          <span className="flex-1">{p.name}</span>
          <span className="font-medium text-ink tabular-nums">
            {p.value === null || p.value === undefined ? "no packets" : `${Number(p.value).toFixed(digits)} ${unit}`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TimeSeriesChart({ title, description, unit, data, series, references = [], height = 230, digits = 2, stepped }: Props) {
  const rows = thin(data);
  const empty = rows.length === 0;
  return (
    <figure className="panel m-0 min-w-0 p-4">
      <figcaption className="mb-3">
        <div className="font-display text-[15px] font-semibold text-ink">{title}</div>
        {description && <div className="mt-0.5 text-xs text-ink-3">{description}</div>}
      </figcaption>
      {empty ? (
        <div className="flex items-center justify-center rounded-md border border-dashed border-line text-sm text-ink-3" style={{ height }}>
          No samples yet. Run a simulation to draw this chart.
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`${title}. ${series.map((s) => s.label).join(", ")} over time in ${unit}.`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--color-line)" strokeOpacity={0.6} vertical={false} />
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
              <Tooltip
                content={<ChartTooltip unit={unit} digits={digits} />}
                cursor={{ stroke: "var(--color-ink-3)", strokeDasharray: "3 3" }}
              />
              {series.length > 1 && (
                <Legend
                  verticalAlign="top"
                  align="left"
                  height={26}
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
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type={stepped ? "stepAfter" : "linear"}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dash || undefined}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-panel)" }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
