import { z } from 'zod';

export const ENGINE_VERSION = 'flow-des/1.0.0' as const;
export const PRNG_VERSION = 'mulberry32-fnv1a/1' as const;
const positiveMs = z.number().int().positive().max(365 * 24 * 3600_000);
export const distributionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixed'), value: positiveMs }),
  z.object({ type: z.literal('triangular'), min: positiveMs, mode: positiveMs, max: positiveMs }).refine(d => d.min <= d.mode && d.mode <= d.max, 'Fordelingen kræver min ≤ typisk ≤ max.'),
  z.object({ type: z.literal('exponential'), mean: positiveMs }),
]);
export type Distribution = z.infer<typeof distributionSchema>;
const intervalSchema = z.object({ start: z.number().int().nonnegative(), end: positiveMs });
export const poolSchema = z.object({ id: z.string().min(1).max(80), label: z.string().min(1).max(100), capacity: z.number().int().min(0).max(1000), hourlyCost: z.number().nonnegative().max(1_000_000), calendar: z.array(intervalSchema).max(1000) });
export const nodeSchema = z.object({ id: z.string().min(1).max(80), label: z.string().min(1).max(100), kind: z.enum(['source', 'activity', 'decision', 'wait', 'rework', 'sink']), position: z.object({ x: z.number().finite(), y: z.number().finite() }), duration: distributionSchema.optional(), resourceId: z.string().optional(), variableCost: z.number().nonnegative().max(1_000_000).default(0), maxVisits: z.number().int().min(1).max(20).default(20) });
export const edgeSchema = z.object({ id: z.string().min(1), source: z.string(), target: z.string(), weight: z.number().min(0).max(1).optional(), caseType: z.string().min(1).optional() });
export const arrivalSchema = z.object({ id: z.string().min(1).max(100), time: z.number().int().nonnegative(), caseType: z.string().default('standard') });
export const modelSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), revision: z.number().int().positive(), name: z.string().min(1).max(100), description: z.string().max(2000), evidence: z.enum(['synthetic', 'imported', 'calibrated']),
  horizon: positiveMs, observationStart: z.number().int().nonnegative().default(0), maxEvents: z.number().int().min(1).max(5_000_000), sla: positiveMs, fixedAutomationCost: z.number().nonnegative().default(0),
  arrivals: z.discriminatedUnion('type', [z.object({ type: z.literal('explicit'), cases: z.array(arrivalSchema).max(100_000) }), z.object({ type: z.literal('poisson'), meanInterval: positiveMs, maxCases: z.number().int().positive().max(100_000), initialBacklog: z.number().int().nonnegative().max(10_000).default(0) })]),
  nodes: z.array(nodeSchema).min(2).max(200), edges: z.array(edgeSchema).max(1000), resources: z.array(poolSchema).max(50),
});
export type FlowModel = z.infer<typeof modelSchema>;
export type FlowNode = FlowModel['nodes'][number];
export type ResourcePool = FlowModel['resources'][number];
export type ValidationIssue = { nodeId?: string; field: string; message: string };
export function validateModel(value: unknown): ValidationIssue[] {
  const parsed = modelSchema.safeParse(value);
  if (!parsed.success) return parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
  const m = parsed.data, issues: ValidationIssue[] = [];
  const add = (field: string, message: string, nodeId?: string) => issues.push({ field, message, nodeId });
  if (m.observationStart >= m.horizon) add('observationStart', 'Måleperioden skal begynde før vinduets slutning.');
  for (const [field, items] of [['nodes', m.nodes], ['edges', m.edges], ['resources', m.resources]] as const) if (new Set(items.map(i => i.id)).size !== items.length) add(field, 'Id’er skal være entydige.');
  if (m.nodes.filter(n => n.kind === 'source').length !== 1) add('nodes', 'Modellen skal have præcis én ankomstnode.');
  if (!m.nodes.some(n => n.kind === 'sink')) add('nodes', 'Tilføj mindst én afslutning.');
  const ids = new Set(m.nodes.map(n => n.id)), pools = new Set(m.resources.map(r => r.id));
  for (const r of m.resources) {
    const intervals = [...r.calendar].sort((a, b) => a.start - b.start);
    if (intervals.some((s, i) => s.end <= s.start || (i > 0 && s.start < intervals[i - 1].end))) add('calendar', `${r.label}: arbejdstider må ikke overlappe og skal slutte efter start.`);
  }
  for (const e of m.edges) if (!ids.has(e.source) || !ids.has(e.target)) add('edges', 'En forbindelse peger på en node, der mangler.', e.source);
  for (const n of m.nodes) {
    const outgoing = m.edges.filter(e => e.source === n.id);
    if (n.kind === 'sink' && outgoing.length) add('edges', 'Afslutningen må ikke have udgående forbindelser.', n.id);
    if (n.kind !== 'sink' && !outgoing.length) add('edges', 'Forbind noden til næste trin.', n.id);
    if (n.kind !== 'decision' && outgoing.length > 1) add('edges', 'Kun beslutningsnoder kan have flere udgående forbindelser.', n.id);
    if (n.kind === 'activity' && (!n.resourceId || !pools.has(n.resourceId))) add('resourceId', 'Vælg en eksisterende ressourcepool.', n.id);
    if (['activity', 'wait'].includes(n.kind) && !n.duration) add('duration', 'Angiv en positiv varighed.', n.id);
    if (n.kind === 'decision') {
      const byType = outgoing.some(e => e.caseType !== undefined);
      if (byType) { if (outgoing.some(e => !e.caseType || e.weight !== undefined) || new Set(outgoing.map(e => e.caseType)).size !== outgoing.length) add('routing', 'Brug entydige sagstyper uden sandsynlighed på alle udgange.', n.id); }
      else if (outgoing.some(e => e.weight === undefined) || Math.abs(outgoing.reduce((s, e) => s + (e.weight ?? 0), 0) - 1) > 1e-9) add('routing', 'Sandsynlighederne skal tilsammen give 100 %.', n.id);
    }
  }
  const source = m.nodes.find(n => n.kind === 'source');
  if (source) {
    const reachable = new Set<string>();
    const walk = (id: string) => { if (reachable.has(id)) return; reachable.add(id); m.edges.filter(e => e.source === id).forEach(e => walk(e.target)); }; walk(source.id);
    m.nodes.filter(n => !reachable.has(n.id)).forEach(n => add('edges', 'Noden kan ikke nås fra ankomsten.', n.id));
  }
  // Every cycle must cross an explicit bounded rework node. Remove those nodes and detect residual cycles.
  const visiting = new Set<string>(), visited = new Set<string>();
  const cycle = (id: string): boolean => { if (m.nodes.find(n => n.id === id)?.kind === 'rework') return false; if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); const found = m.edges.filter(e => e.source === id).some(e => cycle(e.target)); visiting.delete(id); visited.add(id); return found; };
  if (m.nodes.some(n => cycle(n.id))) add('edges', 'En cirkel skal indeholde en eksplicit, begrænset genarbejdsnode.');
  if (m.arrivals.type === 'explicit' && new Set(m.arrivals.cases.map(c => c.id)).size !== m.arrivals.cases.length) add('arrivals', 'Hver sag skal have et entydigt case_id.');
  return issues;
}
export class ModelValidationError extends Error { constructor(public issues: ValidationIssue[]) { super(issues.map(i => i.message).join(' ')); this.name = 'ModelValidationError'; } }
export function parseModel(value: unknown): FlowModel { const issues = validateModel(value); if (issues.length) throw new ModelValidationError(issues); return modelSchema.parse(value); }
