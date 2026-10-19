import type {
  Comparison,
  FieldError,
  RunResult,
  ScenarioResponse,
  SimulationConfig,
  StrategyInfo,
  StrategyKey,
} from "../types";

const BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  errors: FieldError[];

  constructor(message: string, status: number, errors: FieldError[] = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }

  get isOffline() {
    return this.status === 0;
  }
}

const OFFLINE_MESSAGE =
  "Can't reach the QueueWise simulator API. If you are running it locally, start the backend (see README: uvicorn app.main:app --port 8000) and try again.";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }
  if (response.ok) {
    return (await response.json()) as T;
  }
  let body: { message?: string; detail?: string; errors?: FieldError[] } = {};
  try {
    body = await response.json();
  } catch {
    // Non-JSON error (e.g. proxy error when the backend is down).
    if (response.status === 502 || response.status === 503 || response.status === 504 || response.status === 500) {
      throw new ApiError(OFFLINE_MESSAGE, 0);
    }
  }
  throw new ApiError(body.message ?? body.detail ?? `Request failed (HTTP ${response.status}).`, response.status, body.errors ?? []);
}

export const api = {
  health: () => request<{ status: string; service: string; version: string }>("/health"),
  scenarios: () => request<ScenarioResponse>("/scenarios"),
  strategies: () => request<StrategyInfo[]>("/strategies"),
  runSimulation: (config: SimulationConfig) =>
    request<RunResult>("/simulations", { method: "POST", body: JSON.stringify(config) }),
  compareStrategies: (base: SimulationConfig, strategies: StrategyKey[]) =>
    request<Comparison>("/compare", { method: "POST", body: JSON.stringify({ base_config: base, strategies }) }),
  /** Re-simulates each saved configuration (results are deterministic, so they match the original runs). */
  compareConfigs: (configs: SimulationConfig[]) =>
    request<Comparison>("/compare", { method: "POST", body: JSON.stringify({ configs }) }),
};
