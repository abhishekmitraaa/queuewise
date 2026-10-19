// Mirrors the backend API contract (backend/app/api/schemas.py and service.py).

export type StrategyKey = "fifo" | "codel" | "fq_codel";
export type TrafficType = "constant_rate" | "poisson" | "bursty" | "tcp_like";

export interface FlowConfig {
  flow_id: string;
  name: string;
  traffic_type: TrafficType;
  offered_rate_mbps: number;
  packet_size_bytes: number;
  start_ms: number;
  stop_ms: number;
  burst_on_ms: number;
  burst_off_ms: number;
}

export interface LinkConfig {
  capacity_mbps: number;
  propagation_delay_ms: number;
  queue_capacity_kb: number;
}

export interface SimulationParams {
  duration_ms: number;
  sampling_interval_ms: number;
  delay_budget_ms: number;
  seed: number;
}

export interface AqmParams {
  target_ms: number;
  interval_ms: number;
  quantum_bytes: number;
}

export interface SimulationConfig {
  strategy: StrategyKey;
  link: LinkConfig;
  simulation: SimulationParams;
  flows: FlowConfig[];
  aqm: AqmParams;
}

export interface Metrics {
  mean_queueing_delay_ms: number | null;
  p95_queueing_delay_ms: number | null;
  max_queueing_delay_ms: number | null;
  mean_end_to_end_delay_ms: number | null;
  p95_end_to_end_delay_ms: number | null;
  throughput_mbps: number;
  offered_load_mbps: number;
  offered_load_ratio: number;
  link_utilization: number;
  packets_generated: number;
  packets_delivered: number;
  packets_dropped: number;
  packets_dropped_overflow: number;
  packets_dropped_aqm: number;
  packets_queued_at_end: number;
  packets_in_flight_at_end: number;
  drop_ratio: number;
  overflow_drop_ratio: number;
  aqm_drop_ratio: number;
  delay_budget_ms: number;
  delay_budget_violation_ratio: number;
  mean_queue_occupancy_bytes: number;
  peak_queue_occupancy_bytes: number;
  queue_capacity_bytes: number;
  jain_fairness_index: number | null;
  jain_fairness_index_raw: number | null;
  fairness_note: string | null;
  events_processed: number;
}

export interface TimeSample {
  time_ms: number;
  queue_occupancy_bytes: number;
  queue_occupancy_packets: number;
  mean_queueing_delay_ms: number | null;
  max_queueing_delay_ms: number | null;
  mean_end_to_end_delay_ms: number | null;
  throughput_mbps: number;
  cumulative_drops: number;
  cumulative_overflow_drops: number;
  cumulative_aqm_drops: number;
  per_flow_throughput_mbps: Record<string, number>;
  per_flow_queueing_delay_ms: Record<string, number | null>;
  per_flow_cwnd_packets: Record<string, number>;
}

export interface PerFlowResult {
  flow_id: string;
  name: string;
  traffic_type: TrafficType;
  configured_rate_mbps: number;
  offered_load_mbps: number;
  throughput_mbps: number;
  fair_share_mbps: number;
  share_of_fair_share: number | null;
  packets_generated: number;
  packets_delivered: number;
  packets_dropped: number;
  packets_dropped_overflow: number;
  packets_dropped_aqm: number;
  loss_ratio: number;
  mean_queueing_delay_ms: number | null;
  p95_queueing_delay_ms: number | null;
  mean_end_to_end_delay_ms: number | null;
  p95_end_to_end_delay_ms: number | null;
  delay_budget_violation_ratio: number;
  cwnd_reductions: number | null;
}

export type FindingCategory = "info" | "positive" | "caution";

export interface Finding {
  id: string;
  title: string;
  description: string;
  category: FindingCategory;
  evidence: { label: string; value: string }[];
}

export interface RunResult {
  run_id: string;
  simulator_version: string;
  created_at: string;
  strategy: StrategyKey;
  strategy_label: string;
  configuration: SimulationConfig;
  metrics: Metrics;
  time_series: TimeSample[];
  per_flow: PerFlowResult[];
  findings: Finding[];
  runtime_ms: number;
}

export interface ParameterDifference {
  parameter: string;
  values: Record<string, unknown>;
}

export interface Comparison {
  comparison_id: string;
  simulator_version: string;
  created_at: string;
  mode: "controlled" | "configs" | "runs";
  controlled: boolean;
  parameter_differences: ParameterDifference[];
  best: Record<string, string[]>;
  runs: RunResult[];
  findings: Finding[];
}

export interface Scenario {
  id: string;
  label: string;
  short_label: string;
  description: string;
  purpose: string;
  config: SimulationConfig;
}

export interface ScenarioResponse {
  default_scenario_id: string;
  limits: { max_flows: number; max_duration_ms: number; max_samples: number; max_estimated_packets: number };
  scenarios: Scenario[];
}

export interface StrategyInfo {
  key: StrategyKey;
  label: string;
  short_label: string;
  description: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface SessionRun {
  run_id: string;
  strategy: StrategyKey;
  strategy_label: string;
  scenario_id: string | null;
  scenario_label: string;
  seed: number;
  created_at: string;
  p95_queueing_delay_ms: number | null;
  configuration: SimulationConfig;
}
