import { ENGINE_VERSION, PRNG_VERSION, parseModel, type FlowModel, type FlowNode, type ResourcePool } from './model';
import { randomStream, sampleDuration } from './random';
export type CaseStatus = 'waiting' | 'active' | 'planned_wait' | 'completed' | 'aborted';
export interface CaseResult { id: string; caseType: string; arrival: number; completedAt: number | null; status: CaseStatus; queueTime: number; plannedWait: number; visitCount: number; cohort: 'warmup' | 'observation' }
export interface TraceEvent { time: number; type: string; caseId: string; nodeId: string; visitId: string; duration?: number }
export interface QueueSample { time: number; waiting: number; active: number; plannedWait: number; completed: number; arrived: number; byNode: Record<string, number> }
export interface MetricSummary { mean: number | null; median: number | null; p90: number | null; count: number }
export interface SimulationResult {
  schemaVersion: 1; engineVersion: string; prngVersion: string; seed: number; modelId: string; modelRevision: number; status: 'completed' | 'partial' | 'failed'; horizon: number; observationStart: number; measuredUntil: number; eventCount: number;
  metrics: { throughput: number; throughputPerHour: number; backlog: number; arrived: number; active: number; waiting: number; plannedWait: number; aborted: number; leadTime: MetricSummary; queueTime: MetricSummary; plannedWaitTime: MetricSummary; utilization: number | null; cost: number; salaryCost: number; variableCost: number; slaMet: number; slaCompleted: number | null; slaKnownBacklogBreaches: number; slaUnknownBacklog: number };
  resources: { id: string; label: string; capacity: number; availableTime: number; busyTime: number; utilization: number | null; salaryCost: number }[];
  resourceTimelines: { resourceId: string; caseId: string; nodeId: string; start: number; end: number }[];
  queueSamples: QueueSample[]; cases: CaseResult[]; trace: TraceEvent[]; warningCodes: string[];
}
export interface SimulationInput { schemaVersion: 1; engineVersion: typeof ENGINE_VERSION; model: FlowModel; seed: number; trace?: boolean; traceLimit?: number }
type Event = { time: number; priority: number; sequence: number; kind: 'route' | 'complete' | 'wait_end' | 'dispatch' | 'open' | 'sample'; caseId?: string; nodeId?: string; resourceId?: string };
class Heap {
  private items: Event[] = [];
  get length() { return this.items.length; }
  private before(a: Event, b: Event) { return a.time < b.time || (a.time === b.time && (a.priority < b.priority || (a.priority === b.priority && a.sequence < b.sequence))); }
  push(e: Event) { const a = this.items; a.push(e); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.before(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } }
  pop() { const a = this.items, first = a[0], last = a.pop()!; if (a.length) { a[0] = last; let i = 0; while (true) { const l = i * 2 + 1, r = l + 1; let n = i; if (l < a.length && this.before(a[l], a[n])) n = l; if (r < a.length && this.before(a[r], a[n])) n = r; if (n === i) break; [a[i], a[n]] = [a[n], a[i]]; i = n; } } return first; }
}
export function percentile(values: number[], p: number): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), i = (sorted.length - 1) * p, low = Math.floor(i), high = Math.ceil(i); return sorted[low] + (sorted[high] - sorted[low]) * (i - low); }
export function summarize(values: number[]): MetricSummary { return { count: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, median: percentile(values, .5), p90: percentile(values, .9) }; }
const overlap = (a: number, b: number, start: number, end: number) => Math.max(0, Math.min(b, end) - Math.max(a, start));
function intervals(pool: ResourcePool, horizon: number) { return pool.calendar.length ? [...pool.calendar].sort((a, b) => a.start - b.start) : [{ start: 0, end: horizon }]; }
function isOpen(pool: ResourcePool, time: number, horizon: number) { return intervals(pool, horizon).some(i => i.start <= time && time < i.end); }
function workPlan(pool: ResourcePool, time: number, duration: number, horizon: number) { let remaining = duration; const segments: { start: number; end: number }[] = []; for (const slot of intervals(pool, horizon)) { const start = Math.max(time, slot.start); if (start >= slot.end || remaining === 0) continue; const used = Math.min(remaining, slot.end - start); segments.push({ start, end: start + used }); remaining -= used; } return { finish: remaining === 0 ? segments[segments.length - 1].end : Infinity, segments }; }
/** Pure discrete event simulation. All clock values are integer milliseconds. Window includes completions at horizon, excludes arrivals at horizon. */
export function simulate(input: SimulationInput, signal?: AbortSignal): SimulationResult {
  if (input.schemaVersion !== 1 || input.engineVersion !== ENGINE_VERSION || !Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('Ukendt schema, motorversion eller ugyldigt seed.');
  const model = parseModel(input.model), heap = new Heap(), nodes = new Map(model.nodes.map(n => [n.id, n])), pools = new Map(model.resources.map(r => [r.id, r])), edges = new Map(model.nodes.map(n => [n.id, model.edges.filter(e => e.source === n.id)]));
  const streams = new Map<string, () => number>(); const stream = (name: string) => { if (!streams.has(name)) streams.set(name, randomStream(input.seed, name)); return streams.get(name)!; };
  const cases = new Map<string, CaseResult>(), visits = new Map<string, number>(), queue: { caseId: string; nodeId: string; time: number; order: number }[] = [], occupied = new Map(model.resources.map(r => [r.id, 0]));
  const trace: TraceEvent[] = [], resourceTimelines: SimulationResult['resourceTimelines'] = [], queueSamples: QueueSample[] = [], warnings = new Set<string>();
  let sequence = 0, time = 0, eventCount = 0, variableCost = 0, status: SimulationResult['status'] = 'completed';
  const source = model.nodes.find(n => n.kind === 'source')!;
  const push = (e: Omit<Event, 'sequence'>) => { if (e.time <= model.horizon) heap.push({ ...e, sequence: sequence++ }); };
  const log = (type: string, c: CaseResult, nodeId: string, duration?: number) => { if (input.trace && trace.length < Math.min(input.traceLimit ?? 10000, 100000)) trace.push({ time, type, caseId: c.id, nodeId, visitId: `${c.id}:${nodeId}:${visits.get(`${c.id}\0${nodeId}`) ?? 0}`, ...(duration === undefined ? {} : { duration }) }); };
  const arrivals = model.arrivals.type === 'explicit' ? model.arrivals.cases : (() => { const a = Array.from({ length: model.arrivals.initialBacklog }, (_, i) => ({ id: `backlog-${String(i + 1).padStart(6, '0')}`, time: 0, caseType: 'standard' })); let t = 0; for (let i = 0; i < model.arrivals.maxCases; i++) { t += sampleDuration({ type: 'exponential', mean: model.arrivals.meanInterval }, stream('arrivals')); if (t >= model.horizon) break; a.push({ id: `case-${String(i + 1).padStart(6, '0')}`, time: t, caseType: 'standard' }); } return a; })();
  const arrivalMap = new Map(arrivals.map(a => [a.id, a]));
  for (const a of [...arrivals].sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) if (a.time < model.horizon) push({ time: a.time, priority: 2, kind: 'route', caseId: a.id, nodeId: source.id });
  for (const r of model.resources) for (const slot of intervals(r, model.horizon)) push({ time: slot.start, priority: 1, kind: 'open', resourceId: r.id });
  for (let i = 0; i <= 72; i++) push({ time: Math.round(model.horizon * i / 72), priority: 4, kind: 'sample' });
  const routeNext = (c: CaseResult, n: FlowNode) => {
    const outgoing = edges.get(n.id)!; let edge = outgoing[0];
    if (n.kind === 'decision') { if (outgoing.some(e => e.caseType !== undefined)) edge = outgoing.find(e => e.caseType === c.caseType)!; else { const u = stream(`routing:${n.id}`)(); let total = 0; edge = outgoing.find(e => { total += e.weight!; return u < total; }) ?? outgoing[outgoing.length - 1]; } }
    if (!edge) { warnings.add('routing_no_match'); c.status = 'aborted'; status = 'failed'; return; }
    push({ time, priority: 2, kind: 'route', caseId: c.id, nodeId: edge.target });
  };
  const capture = () => { const list = [...cases.values()], byNode: Record<string, number> = {}; for (const q of queue) byNode[q.nodeId] = (byNode[q.nodeId] ?? 0) + 1; const sample = { time, waiting: list.filter(c => c.status === 'waiting').length, active: list.filter(c => c.status === 'active').length, plannedWait: list.filter(c => c.status === 'planned_wait').length, completed: list.filter(c => c.status === 'completed').length, arrived: list.length, byNode }; if (sample.arrived !== sample.waiting + sample.active + sample.plannedWait + sample.completed + list.filter(c => c.status === 'aborted').length) { warnings.add('engine_conservation_error'); status = 'failed'; } if (queueSamples.at(-1)?.time === time) queueSamples[queueSamples.length - 1] = sample; else queueSamples.push(sample); };
  while (heap.length) {
    if (signal?.aborted) { status = 'partial'; warnings.add('cancelled'); break; }
    if (eventCount >= model.maxEvents) { status = 'partial'; warnings.add('event_limit'); break; }
    const e = heap.pop(); time = e.time; eventCount++;
    if (e.kind === 'sample') { capture(); continue; }
    if (e.kind === 'open') { push({ time, priority: 3, kind: 'dispatch' }); continue; }
    if (e.kind === 'dispatch') {
      queue.sort((a, b) => a.time - b.time || (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : a.order - b.order));
      for (let i = 0; i < queue.length;) { const q = queue[i], n = nodes.get(q.nodeId)!, pool = pools.get(n.resourceId!)!; if ((occupied.get(pool.id) ?? 0) >= pool.capacity || !isOpen(pool, time, model.horizon)) { i++; continue; }
        queue.splice(i, 1); const c = cases.get(q.caseId)!; c.status = 'active'; c.queueTime += time - q.time; occupied.set(pool.id, occupied.get(pool.id)! + 1); const duration = sampleDuration(n.duration!, stream(`activity:${n.id}`)), plan = workPlan(pool, time, duration, model.horizon); log('activity_start', c, n.id, duration); if (time >= model.observationStart) variableCost += n.variableCost;
        for (const segment of plan.segments) resourceTimelines.push({ resourceId: pool.id, caseId: c.id, nodeId: n.id, ...segment });
        push({ time: plan.finish, priority: 0, kind: 'complete', caseId: c.id, nodeId: n.id, resourceId: pool.id });
      } continue;
    }
    let c = cases.get(e.caseId!); const n = nodes.get(e.nodeId!)!;
    if (!c) { const a = arrivalMap.get(e.caseId!)!; c = { id: a.id, caseType: a.caseType, arrival: time, completedAt: null, status: 'waiting', queueTime: 0, plannedWait: 0, visitCount: 0, cohort: time < model.observationStart || a.id.startsWith('backlog-') ? 'warmup' : 'observation' }; cases.set(c.id, c); log('arrival', c, n.id); }
    if (e.kind === 'complete') { occupied.set(e.resourceId!, occupied.get(e.resourceId!)! - 1); log('activity_end', c, n.id); c.status = 'waiting'; routeNext(c, n); push({ time, priority: 3, kind: 'dispatch' }); }
    else if (e.kind === 'wait_end') { log('wait_end', c, n.id); c.status = 'waiting'; routeNext(c, n); }
    else {
      const key = `${c.id}\0${n.id}`, count = (visits.get(key) ?? 0) + 1; visits.set(key, count); c.visitCount++;
      if (count > n.maxVisits) { c.status = 'aborted'; warnings.add('rework_truncated'); status = 'failed'; log('truncated', c, n.id); break; }
      log('enter', c, n.id);
      if (n.kind === 'sink') { c.status = 'completed'; c.completedAt = time; log('completed', c, n.id); }
      else if (n.kind === 'activity') { c.status = 'waiting'; queue.push({ caseId: c.id, nodeId: n.id, time, order: sequence++ }); push({ time, priority: 3, kind: 'dispatch' }); }
      else if (n.kind === 'wait') { c.status = 'planned_wait'; const duration = sampleDuration(n.duration!, stream(`activity:${n.id}`)); c.plannedWait += duration; log('wait_start', c, n.id, duration); push({ time: time + duration, priority: 0, kind: 'wait_end', caseId: c.id, nodeId: n.id }); }
      else routeNext(c, n);
    }
    if (warnings.has('routing_no_match') || warnings.has('engine_conservation_error')) break;
  }
  const measuredUntil = status === 'completed' ? model.horizon : time;
  time = measuredUntil; capture();
  const all = [...cases.values()], completed = all.filter(c => c.status === 'completed' && c.completedAt! >= model.observationStart), unfinished = all.filter(c => c.status !== 'completed' && c.status !== 'aborted'), observed = Math.max(0, measuredUntil - model.observationStart);
  const resources = model.resources.map(pool => { const availableTime = intervals(pool, model.horizon).reduce((s, slot) => s + overlap(slot.start, slot.end, model.observationStart, measuredUntil), 0) * pool.capacity; const busyTime = resourceTimelines.filter(t => t.resourceId === pool.id).reduce((s, slot) => s + overlap(slot.start, slot.end, model.observationStart, measuredUntil), 0); return { id: pool.id, label: pool.label, capacity: pool.capacity, availableTime, busyTime, utilization: availableTime ? busyTime / availableTime : null, salaryCost: availableTime / 3600_000 * pool.hourlyCost }; });
  const totalAvailable = resources.reduce((s, r) => s + r.availableTime, 0), salaryCost = resources.reduce((s, r) => s + r.salaryCost, 0), slaMet = completed.filter(c => c.completedAt! - c.arrival <= model.sla).length, slaKnownBacklogBreaches = unfinished.filter(c => measuredUntil - c.arrival > model.sla).length;
  if (input.trace && trace.length >= Math.min(input.traceLimit ?? 10000, 100000)) warnings.add('trace_limit');
  if (model.resources.some(r => r.capacity === 0)) warnings.add('zero_capacity');
  return { schemaVersion: 1, engineVersion: ENGINE_VERSION, prngVersion: PRNG_VERSION, seed: input.seed, modelId: model.id, modelRevision: model.revision, status, horizon: model.horizon, observationStart: model.observationStart, measuredUntil, eventCount,
    metrics: { throughput: completed.length, throughputPerHour: observed ? completed.length * 3600_000 / observed : 0, backlog: unfinished.length, arrived: all.length, active: unfinished.filter(c => c.status === 'active').length, waiting: unfinished.filter(c => c.status === 'waiting').length, plannedWait: unfinished.filter(c => c.status === 'planned_wait').length, aborted: all.filter(c => c.status === 'aborted').length, leadTime: summarize(completed.map(c => c.completedAt! - c.arrival)), queueTime: summarize(completed.map(c => c.queueTime)), plannedWaitTime: summarize(completed.map(c => c.plannedWait)), utilization: totalAvailable ? resources.reduce((s, r) => s + r.busyTime, 0) / totalAvailable : null, cost: salaryCost + variableCost + model.fixedAutomationCost, salaryCost, variableCost, slaMet, slaCompleted: completed.length ? slaMet / completed.length : null, slaKnownBacklogBreaches, slaUnknownBacklog: unfinished.length - slaKnownBacklogBreaches },
    resources, resourceTimelines: resourceTimelines.filter(t => t.start < measuredUntil).map(t => ({ ...t, end: Math.min(t.end, measuredUntil) })), queueSamples, cases: all, trace, warningCodes: [...warnings].sort() };
}
