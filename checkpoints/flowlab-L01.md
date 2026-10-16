# FlowLab L01 — engine foundation

Written: pure TypeScript DES engine, validated graph schema, fixed/triangular/exponential distributions, independently derived Mulberry32 streams, FCFS resource queues, calendar pause/resume, bounded rework, SLA/cost/cohort metrics, event limits, paired comparison and streaming CSV parser.

Executed and verified: `pnpm --filter @tre/flow-engine typecheck`; `pnpm exec vitest run packages/flow-engine/src`: 24 passing tests. Exact source fixtures cover FL-AT01 to FL-AT07; cancellation FL-AT08, negative duration FL-AT09 and 30 paired seeds/full diff FL-AT10 are verified.

Connected: no cloud service. This is a pure local engine. No claims of tenant/RLS or billing verification.

Rules: completion at horizon counts; arrivals at horizon do not. Empty pool calendar means always open. Paused activities retain their allocated slot. Cost uses scheduled salary capacity, explicit activity variable cost charged at start, and fixed automation cost. Percentiles linearly interpolate between adjacent ordered observations. Input schema and engine version are explicit. Reports reject partial runs and require at least 30 seeds.

Next: polished editor, browser worker, persisted versions, charts from engine outputs, data workshop, reproducible PDF/JSON exports and responsive browser evidence.
