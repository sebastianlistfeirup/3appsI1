import type { Distribution } from "./model";
/** FNV-1a stream derivation + Mulberry32. Versioned; never replace without an engineVersion bump. */
export function randomStream(seed: number, stream: string): () => number {
  let hash = 2166136261;
  for (const char of `${seed >>> 0}:${stream}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function sampleDuration(d: Distribution, random: () => number): number {
  if (d.type === "fixed") return d.value;
  const u = random();
  if (d.type === "exponential")
    return Math.max(1, Math.round(-Math.log(1 - u) * d.mean));
  if (d.min === d.max) return d.min;
  const fraction = (d.mode - d.min) / (d.max - d.min);
  return Math.max(
    1,
    Math.round(
      u < fraction
        ? d.min + Math.sqrt(u * (d.max - d.min) * (d.mode - d.min))
        : d.max - Math.sqrt((1 - u) * (d.max - d.min) * (d.max - d.mode)),
    ),
  );
}
export function seedList(seed = 2026, count = 30): number[] {
  const random = randomStream(seed, "replications");
  return Array.from({ length: count }, () => Math.floor(random() * 4294967296));
}
