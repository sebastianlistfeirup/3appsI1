import { describe, expect, it } from "vitest";
import { createProject } from "./model";
import {
  newProjectDocument,
  projectDocument,
  validateProjectDocument,
  validateProjectDocumentUpdate,
} from "./cloud-document";

describe("Studio server document contract", () => {
  it("separates database-owned identity/revision/archival metadata from validated content", () => {
    const content = newProjectDocument("Mit projekt");
    expect(validateProjectDocument(content)).toEqual(content);
    for (const key of ["id", "name", "revision", "createdAt", "archivedAt"]) {
      expect(content).not.toHaveProperty(key);
      expect(() =>
        validateProjectDocument({ ...content, [key]: "client-owned" }),
      ).toThrow();
    }
  });
  it("allows appended brief versions but refuses rewriting or removing history", () => {
    const project = createProject("Immutable history");
    const previous = projectDocument(project);
    const next = {
      ...previous,
      briefVersions: [
        ...previous.briefVersions,
        {
          ...previous.briefVersions[0]!,
          id: "brief-second",
          version: 2,
          goal: "Et nyt mål",
        },
      ],
    };
    expect(() => validateProjectDocumentUpdate(previous, next)).not.toThrow();
    const rewritten = structuredClone(previous);
    rewritten.briefVersions[0]!.goal = "Overskrevet";
    expect(() => validateProjectDocumentUpdate(previous, rewritten)).toThrow(
      "Historiske",
    );
    expect(() => validateProjectDocumentUpdate(next, previous)).toThrow(
      "Historiske",
    );
  });
  it("validates relationships before admitting a document to the API", () => {
    const content = newProjectDocument("Broken relationships");
    expect(() =>
      validateProjectDocument({
        ...content,
        edges: [{ from: "absent", to: "also-absent" }],
      }),
    ).toThrow();
  });
});
