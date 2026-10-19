export function fmtMs(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function fmtMbps(v: number | null | undefined): string {
  if (v === null || v === undefined) return "n/a";
  return v.toFixed(2);
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "n/a";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "n/a";
  return v.toLocaleString("en-US");
}

export function fmtKB(bytes: number): string {
  return (bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1);
}

export function fmtJain(v: number | null | undefined): string {
  return v === null || v === undefined ? "n/a" : v.toFixed(3);
}

export const TRAFFIC_LABELS: Record<string, string> = {
  constant_rate: "Constant rate",
  poisson: "Poisson (random)",
  bursty: "Bursty ON/OFF",
  tcp_like: "TCP-like (responsive)",
};

export const RATE_LABELS: Record<string, string> = {
  constant_rate: "Rate (Mbps)",
  poisson: "Mean rate (Mbps)",
  bursty: "Peak rate (Mbps)",
  tcp_like: "Max send rate (Mbps)",
};

/** Time to drain `kb` kilobytes (1 KB = 1024 bytes) at `mbps`, in ms. */
export function drainTimeMs(kb: number, mbps: number): number {
  if (!(mbps > 0)) return NaN;
  return (kb * 1024 * 8) / (mbps * 1_000_000) * 1000;
}

export function humanField(field: string): string {
  return field
    .replace(/^base_config\./, "")
    .replace(/^flows\.(\d+)\./, (_, i) => `Flow ${Number(i) + 1} › `)
    .replace(/^(link|simulation|aqm)\./, (_, s) => `${s[0].toUpperCase()}${s.slice(1)} › `)
    .replace(/_/g, " ");
}
