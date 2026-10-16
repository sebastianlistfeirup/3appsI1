import artifacts from "./sample-artifacts.json";
import { validateStudio, type Studio } from "./model";
const createdAt = "2026-10-16T18:00:00.000Z";
export function createSample(): Studio {
  return validateStudio({
    schemaVersion: 1,
    workspace: {
      id: "local-demo",
      name: "Mit kreative studio",
      mode: "MANUAL",
      budgetLimitMinor: 0,
    },
    projects: [
      {
        id: "realmread",
        name: "Realmread",
        description: "En lille spilverden. En bedre vej ind i historien.",
        profile: "web",
        revision: 4,
        archivedAt: null,
        createdAt,
        briefVersions: [
          {
            id: "brief-1",
            version: 1,
            goal: "Gør den aktive quest synlig i spilmenuen, så spilleren kan genfinde sin næste handling uden at forlade stemningen.",
            audience:
              "Spillere, der vender tilbage til deres fortælling efter en pause.",
            constraints:
              "Bevar det rolige udtryk og den eksisterende navigation. Ingen eksterne services. Understøt telefon og desktop.",
            acceptance: [
              "Aktiv quest har titel og næste handling",
              "Eksisterende menupunkter er bevaret",
              "Questpanelet er læsbart på mobil",
            ],
            createdAt,
          },
        ],
        artifacts,
        tasks: [
          {
            id: "task-design",
            title: "Find den rigtige visuelle retning",
            description: "Landskab, farver og rolig typografi.",
            state: "done",
            briefVersion: 1,
            acceptance: [],
            owner: "Mig",
            revision: 1,
            createdAt,
          },
          {
            id: "task-menu",
            title: "Gør den aktive quest synlig",
            description: "Tilføj et roligt questpanel til menuen.",
            state: "review",
            briefVersion: 1,
            acceptance: [
              "Aktiv quest har titel og næste handling",
              "Eksisterende menupunkter er bevaret",
              "Questpanelet er læsbart på mobil",
            ],
            owner: "Mig",
            revision: 2,
            createdAt,
          },
          {
            id: "task-polish",
            title: "Gennemgå den færdige oplevelse",
            description:
              "Afprøv den accepterede version med en rigtig spiller.",
            state: "ready",
            briefVersion: 1,
            acceptance: ["Observeret brugerforløb dokumenteret"],
            owner: "Mig",
            revision: 1,
            createdAt,
          },
        ],
        edges: [
          { from: "task-design", to: "task-menu" },
          { from: "task-menu", to: "task-polish" },
        ],
        runs: [
          {
            id: "run-sample",
            taskId: "task-menu",
            briefVersion: 1,
            inputVersionIds: ["menu-v1", "design-v1"],
            adapterId: "manual",
            idempotencyKey: "sample-request-1",
            state: "review",
            startedAt: createdAt,
            completedAt: createdAt,
            costMinor: 0,
          },
        ],
        deliveries: [
          {
            id: "delivery-sample",
            title: "En tydelig vej tilbage til eventyret",
            runId: "run-sample",
            outputVersionIds: ["menu-v2", "notes-v1"],
            checks: [
              {
                id: "check-quest",
                label: "Aktiv quest har titel og næste handling",
                passed: true,
                source: "sample",
                evidence: "Åbn den nye version og gennemgå questpanelet.",
              },
              {
                id: "check-menu",
                label: "Eksisterende menupunkter er bevaret",
                passed: true,
                source: "sample",
                evidence: "Sammenlign med før-versionen.",
              },
              {
                id: "check-mobile",
                label: "Questpanelet er læsbart på mobil",
                passed: true,
                source: "sample",
                evidence: "Brug mobilpreview og gennemgå teksten.",
              },
            ],
            summary:
              "Et diskret questpanel samler titel, næste handling og fremdrift. Landskabet og menuens rolige rytme er bevaret.",
            createdAt,
          },
        ],
        reviews: [],
        activity: [
          {
            id: "e1",
            type: "project.created",
            title: "Sampleproduktion oprettet med syntetiske data",
            createdAt,
            revision: 1,
          },
          {
            id: "e2",
            type: "brief.created",
            title: "Bestilling v1 · tre acceptkrav",
            createdAt,
            revision: 2,
          },
          {
            id: "e3",
            type: "artifact.created",
            title: "Quest-menu v2 tilføjet manuelt",
            createdAt,
            revision: 3,
          },
          {
            id: "e4",
            type: "delivery.ready",
            title: "En leverance er klar til dit review",
            createdAt,
            revision: 4,
          },
        ],
      },
    ],
  });
}
