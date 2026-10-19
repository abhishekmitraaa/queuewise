import type { StrategyKey } from "../types";

// Fixed categorical order (validated palette). Colour follows the entity, never rank.
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

// Dash patterns are a second, non-colour channel so series stay distinguishable.
export const SERIES_DASHES = ["", "6 4", "2 3", "10 3 2 3", "", "6 4", "2 3", "10 3 2 3"];

export const STRATEGY_ORDER: StrategyKey[] = ["fifo", "codel", "fq_codel"];

export const STRATEGY_SHORT: Record<StrategyKey, string> = {
  fifo: "FIFO",
  codel: "CoDel-inspired",
  fq_codel: "FQ-CoDel-inspired",
};

export function strategyColor(key: StrategyKey): string {
  return SERIES_COLORS[STRATEGY_ORDER.indexOf(key)];
}

export function strategyDash(key: StrategyKey): string {
  return SERIES_DASHES[STRATEGY_ORDER.indexOf(key)];
}

export function flowColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export function flowDash(index: number): string {
  return SERIES_DASHES[index % SERIES_DASHES.length];
}
