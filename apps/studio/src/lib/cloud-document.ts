import { DomainError } from "@tre/contracts";
import {
  assertProject,
  assertProjectUpdate,
  createProject,
  projectSchema,
  type Project,
} from "./model";

// Database metadata is authoritative. It is never duplicated inside the app document.
const contentSchema = projectSchema
  .omit({
    id: true,
    name: true,
    revision: true,
    createdAt: true,
    archivedAt: true,
  })
  .strict();
const metadata = {
  id: "server-validation",
  name: "Server document",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
};
export function projectDocument(project: Project) {
  const {
    id: _id,
    name: _name,
    revision: _revision,
    createdAt: _created,
    archivedAt: _archived,
    ...content
  } = project;
  return contentSchema.parse(content);
}
export function newProjectDocument(name: string) {
  return projectDocument(createProject(name));
}
export function validateProjectDocument(value: unknown) {
  const content = contentSchema.parse(value);
  try {
    assertProject({ ...content, ...metadata });
  } catch (error) {
    throw new DomainError(
      "INVALID_DOCUMENT",
      error instanceof Error ? error.message : "Projektet er ugyldigt.",
      400,
    );
  }
  return content;
}
export function validateProjectDocumentUpdate(
  previous: unknown,
  next: unknown,
) {
  try {
    assertProjectUpdate(
      { ...validateProjectDocument(previous), ...metadata },
      { ...validateProjectDocument(next), ...metadata },
    );
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(
      "IMMUTABLE_VERSION",
      error instanceof Error
        ? error.message
        : "Historiske versioner kan ikke ændres.",
      409,
    );
  }
}
