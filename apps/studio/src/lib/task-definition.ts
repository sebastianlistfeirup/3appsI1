import { z } from "zod";

export const taskAcceptanceSchema = z
  .array(z.string().trim().min(1).max(1000))
  .min(1)
  .max(30)
  .refine(
    (criteria) => new Set(criteria).size === criteria.length,
    "Hvert færdigkrav skal være forskelligt.",
  );
export const taskOwnerSchema = z.string().trim().min(1).max(100);
export const taskDefinitionSchema = z.object({
  owner: taskOwnerSchema,
  acceptance: taskAcceptanceSchema,
});
export type TaskDefinition = z.infer<typeof taskDefinitionSchema>;
// A run records the admitted task verbatim. Normalization belongs to editing,
// never to reading or locking a historical definition from an older package.
const present = (limit: number) =>
  z
    .string()
    .min(1)
    .max(limit)
    .refine((value) => Boolean(value.trim()));
export const taskSnapshotSchema = z.object({
  title: present(300),
  owner: present(100),
  acceptance: z
    .array(present(1000))
    .min(1)
    .max(30)
    .refine(
      (criteria) =>
        new Set(criteria.map((item) => item.trim())).size === criteria.length,
    ),
  description: z.string().max(100000),
  revision: z.number().int().positive(),
});
export function taskCriteria(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
export function taskDefinitionIssue(
  owner: string,
  raw: string,
): string | undefined {
  if (!owner.trim()) return "Angiv den ansvarlige for opgaven.";
  if (owner.trim().length > 100)
    return "Den ansvarliges navn må højst være 100 tegn.";
  const criteria = taskCriteria(raw);
  if (!criteria.length) return "Beskriv mindst ét konkret færdigkrav.";
  if (criteria.length > 30)
    return "Brug højst 30 færdigkrav. Din tekst er bevaret.";
  if (criteria.some((item) => item.length > 1000))
    return "Et færdigkrav må højst være 1.000 tegn. Din tekst er bevaret.";
  if (new Set(criteria).size !== criteria.length)
    return "Hvert færdigkrav skal være forskelligt.";
}
