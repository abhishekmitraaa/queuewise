# Test plan

## Automated backend tests (`backend/tests`, run with `python -m pytest -q`)

| Blueprint requirement | Test(s) |
|---|---|
| FIFO preserves arrival order | `test_fifo.py::test_fifo_preserves_arrival_order` |
| Overflow drops at the configured capacity | `test_fifo.py::test_fifo_tail_drops_when_capacity_would_be_exceeded`, `test_fifo_overflow_in_engine_matches_capacity` |
| Serialization uses correct units | `test_engine.py::test_serialization_time_units`, `test_single_packet_delay_components` |
| No delivery before service + propagation | `test_engine.py::test_no_packet_delivered_before_service_and_propagation` |
| Queueing delay uses the defined timestamps | `test_engine.py::test_queueing_delay_matches_backlog` |
| AQM responds to persistent delay, not one slow packet | `test_aqm.py::test_single_slow_packet_is_not_dropped`, `test_no_drop_until_delay_persists_for_an_interval`, `test_timer_resets_when_delay_falls_below_target`, `test_drop_rate_increases_while_delay_stays_high` |
| Per-flow queues keep packet identity; fair scheduling | `test_aqm.py::test_fq_keeps_flows_separate_and_round_robins`, `test_fq_drr_is_byte_fair_with_different_packet_sizes`, `test_fq_serves_new_sparse_flow_first`, `test_fq_overflow_drops_from_fattest_flow` |
| Empty arrays and zero denominators are safe | `test_metrics.py::test_empty_inputs_are_safe`, `test_metrics_with_no_traffic_are_safe` |
| Jain = 1.0 for equal throughputs | `test_metrics.py::test_jain_index_values`, `test_jain_is_one_for_equal_flows` |
| Fixed seed + config gives identical results | `test_reproducibility.py::test_same_seed_and_config_give_identical_results` (all strategies) |
| Packet accounting is conserved | `test_engine.py::test_packet_accounting_is_conserved` (3 strategies × 4 traffic types) |
| API rejects invalid input with field-level 422 | `test_api.py::test_validation_errors_are_field_level` (negative capacity, zero packet size, bad time ranges, excessive duration and samples, duplicate ids, unknown strategy), `test_rejects_excessive_flows`, `test_rejects_excessive_compute` |
| JSON parses; CSV headers and rows match the time series | `test_api.py::test_export_json_and_csv`, `test_controlled_comparison_and_export` |
| Controlled comparison holds shared parameters constant | `test_reproducibility.py::test_controlled_comparison_holds_shared_parameters_constant` |
| Mismatched runs are reported | `test_api.py::test_compare_stored_runs_reports_differences`, `test_compare_configs_mode_reruns_each_configuration` |
| Re-simulating a saved configuration reproduces the run exactly | `test_api.py::test_compare_configs_mode_reruns_each_configuration` |
| `/compare` configs-mode validation points at the right field | `test_api.py::test_compare_configs_validation_points_at_config` |
| Large responses are compressed | `test_api.py::test_responses_are_gzip_compressed` |
| Every preset runs under every strategy | `test_reproducibility.py::test_every_preset_runs_under_every_strategy`, `test_api.py::test_every_scenario_config_is_valid_api_input` |

Last run: **82 passed**.

## Frontend checks

- `npm run build` runs `tsc --noEmit` (strict TypeScript) and a production Vite build.
- Manual QA, done in a real browser against the running backend:
  - [x] Select a preset, edit a field, run a simulation, and see the results (cards, charts, per-flow table, findings).
  - [x] Validation errors appear beneath the relevant input and in a summary banner (for example, capacity −5).
  - [x] Loading state while a run is in progress; a "Simulator backend unavailable" banner with retry when the backend is down.
  - [x] Charts show axis units, legends, tooltips, budget and capacity reference lines, and an empty state.
  - [x] A controlled comparison shows "Only the queue strategy differs"; comparing runs with different settings lists the mismatched parameters.
  - [x] Export JSON/CSV downloads the file and shows "Downloaded …"; the browser-built CSV matches the backend `/export` CSV (same header, all 201 rows equal).
  - [x] Comparing two saved runs (256 KB vs 24 KB buffer) flags `link.queue_capacity_kb` as the only difference; Replay restores the run's settings and seed in the Lab.
  - [x] The "Simulated data" label is always visible in the top bar.
  - [x] Layout works at 1440 px and 1040 px, and at 390 px (phone; the diagram and wide tables scroll inside their own panels).
  - [x] No chart shows hard-coded data; everything comes from `/api/v1`.
