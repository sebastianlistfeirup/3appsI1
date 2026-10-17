"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  CloudOff,
  History,
  LoaderCircle,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { z } from "zod";
import { downloadFile, type SaveState } from "@tre/persistence";
import {
  briefDraftFields,
  briefDraftFieldsSchema,
  briefDraftIssue,
  briefSchema,
  idSchema,
  latestBrief,
  publishBriefDraft,
  saveBriefDraft,
  sha256,
  type BriefDraftFields,
} from "../lib/model";
import { Badge, Modal, Notice, formatDate } from "./primitives";
import type { ProjectActions } from "./studio-app";

type Props = ProjectActions & { storage: { saveState: SaveState } };
const transferSchema = z
  .object({
    app: z.literal("studio-brief-draft"),
    schemaVersion: z.literal(1),
    projectId: idSchema,
    baseBriefId: idSchema,
    baseBriefSha256: z.string().regex(/^[a-f0-9]{64}$/),
    fields: briefDraftFieldsSchema.strict(),
  })
  .strict();
export function BriefPanel(props: Props) {
  const { project, storage } = props,
    brief = latestBrief(project);
  const [editing, setEditing] = useState(false),
    [version, setVersion] = useState(brief.version);
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const selected =
    project.briefVersions.find((item) => item.version === version) ?? brief;
  const versions = [...project.briefVersions]
    .reverse()
    .filter((item) =>
      `${item.version} ${item.goal} ${item.audience}`
        .toLocaleLowerCase("da")
        .includes(search.trim().toLocaleLowerCase("da")),
    );
  const pages = Math.max(1, Math.ceil(versions.length / 8)),
    currentPage = Math.min(page, pages - 1);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EN KLAR RETNING</div>
          <h1>Den gode bestilling.</h1>
          <p>Færdigt arbejde begynder med en fælles forståelse.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setEditing(true)}
          disabled={Boolean(project.archivedAt) && !project.briefDraft}
        >
          <Plus size={16} />
          {project.briefDraft
            ? project.archivedAt
              ? "Se bestillingskladde"
              : "Fortsæt bestillingskladde"
            : brief.goal
              ? "Ny briefversion"
              : "Skriv din bestilling"}
        </button>
      </div>
      {project.briefDraft && (
        <section
          className="brief-draft-callout"
          aria-label="Din ufærdige bestilling"
        >
          <div className="brief-draft-symbol">
            <History size={22} />
          </div>
          <div>
            <strong>Din næste bestilling venter her.</strong>
            <p>
              Kladden fra v
              {
                project.briefVersions.find(
                  (item) => item.id === project.briefDraft!.baseBriefId,
                )!.version
              }{" "}
              ændrer først produktionen, når du gemmer en ny briefversion.
            </p>
            <small>
              {storage.saveState === "saved"
                ? "Gemt lokalt"
                : "Lagring ikke bekræftet"}{" "}
              · {formatDate(project.briefDraft.updatedAt)}
            </small>
          </div>
          <Badge kind="purple">KLADDE</Badge>
        </section>
      )}
      <div className="detail-columns">
        <section className="paper-card">
          <div className="paper-header">
            <Badge kind="purple">BRIEF V{selected.version}</Badge>
            <span>{formatDate(selected.createdAt)}</span>
          </div>
          <div className="paper-section">
            <span className="small-label">DET VIL VI OPNÅ</span>
            <h2 className="preserve-lines">
              {selected.goal ||
                "Hvad skal være anderledes, når arbejdet er færdigt?"}
            </h2>
          </div>
          <div className="paper-section">
            <span className="small-label">FOR HVEM</span>
            <p className="preserve-lines">
              {selected.audience || "Beskriv, hvem der får glæde af ændringen."}
            </p>
          </div>
          <div className="paper-section">
            <span className="small-label">FÆRDIG BETYDER</span>
            {selected.acceptance.length ? (
              <ol className="numbered-criteria">
                {selected.acceptance.map((text, index) => (
                  <li key={`${index}-${text}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Tilføj konkrete, efterprøvelige acceptkrav.</p>
            )}
          </div>
          <div className="paper-section">
            <span className="small-label">RAMMER OG BEGRÆNSNINGER</span>
            <p className="preserve-lines">
              {selected.constraints || "Ingen begrænsninger beskrevet endnu."}
            </p>
          </div>
        </section>
        <aside>
          <div className="info-card">
            <History size={21} />
            <h3>Historien bliver her.</h3>
            <p>
              En ny bestilling opretter en ny version. Igangværende leverancer
              beholder deres oprindelige input.
            </p>
            <label className="search-field brief-history-search">
              <Search size={15} />
              <input
                aria-label="Søg i bestillingshistorik"
                placeholder="Find version eller mål"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <div className="version-list">
              {versions
                .slice(currentPage * 8, (currentPage + 1) * 8)
                .map((item) => (
                  <button
                    key={item.id}
                    className={
                      item.version === selected.version ? "selected" : ""
                    }
                    onClick={() => setVersion(item.version)}
                    aria-pressed={item.version === selected.version}
                  >
                    <span>Bestilling v{item.version}</span>
                    {item.version === brief.version ? (
                      <Badge kind="purple">Aktuel</Badge>
                    ) : (
                      <span>{formatDate(item.createdAt)}</span>
                    )}
                  </button>
                ))}
            </div>
            {!versions.length && <p>Ingen bestillinger matcher søgningen.</p>}
            {pages > 1 && (
              <nav
                className="brief-history-pages"
                aria-label="Sider i bestillingshistorik"
              >
                <button
                  className="text-button"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Forrige
                </button>
                <span>
                  {currentPage + 1} / {pages}
                </span>
                <button
                  className="text-button"
                  disabled={currentPage === pages - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Næste
                </button>
              </nav>
            )}
          </div>
          <div className="tip-card">
            <span className="small-label">ET GODT ACCEPTKRAV</span>
            <p>
              “Spilleren kan se sin aktive quest og næste handling direkte i
              menuen.”
            </p>
            <small>Beskriv det observerbare resultat.</small>
          </div>
        </aside>
      </div>
      {editing && (
        <BriefEditor
          {...props}
          onClose={() => setEditing(false)}
          onPublished={(nextVersion) => {
            setVersion(nextVersion);
            setPage(0);
            setEditing(false);
          }}
        />
      )}
    </>
  );
}
function BriefEditor({
  project,
  update,
  notify,
  storage,
  onClose,
  onPublished,
}: Props & { onClose: () => void; onPublished: (version: number) => void }) {
  const brief = latestBrief(project),
    stored = project.briefDraft;
  const [baseBriefId, setBaseBriefId] = useState(
    stored?.baseBriefId ?? brief.id,
  );
  const [fields, setFields] = useState<BriefDraftFields>(() =>
    stored ? briefDraftFieldsSchema.parse(stored) : briefDraftFields(brief),
  );
  const [ack, setAck] = useState(false),
    [draftError, setDraftError] = useState(false),
    [importing, setImporting] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    submitted = useRef(false),
    reloading = useRef(false);
  const baseBrief =
    project.briefVersions.find((item) => item.id === baseBriefId) ?? brief;
  const dirty = stored
    ? baseBriefId !== stored.baseBriefId ||
      JSON.stringify(fields) !==
        JSON.stringify(briefDraftFieldsSchema.parse(stored))
    : JSON.stringify(fields) !== JSON.stringify(briefDraftFields(baseBrief));
  const writable = !project.archivedAt && storage.saveState !== "loading",
    stale = brief.id !== baseBriefId;
  const latest = useRef({ update, fields, baseBriefId, dirty, writable });
  latest.current = { update, fields, baseBriefId, dirty, writable };
  function commit(showError = true) {
    const current = latest.current;
    if (!current.dirty || !current.writable || submitted.current) return true;
    const accepted = current.update((p) =>
      saveBriefDraft(p, current.baseBriefId, current.fields),
    );
    if (showError) setDraftError(!accepted);
    return accepted;
  }
  useEffect(() => {
    setAck(false);
  }, [brief.id, baseBriefId]);
  useEffect(() => {
    if (!dirty || !writable || importing || draftError) return;
    const timer = setTimeout(() => commit(), 450);
    return () => clearTimeout(timer);
  }, [fields, baseBriefId, dirty, writable, importing, draftError]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.dirty && !submitted.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      commit(false);
    };
  }, []);
  useEffect(() => {
    if (storage.saveState === "loading") reloading.current = true;
    else if (reloading.current && storage.saveState === "saved") {
      reloading.current = false;
      setBaseBriefId(stored?.baseBriefId ?? brief.id);
      setFields(
        stored ? briefDraftFieldsSchema.parse(stored) : briefDraftFields(brief),
      );
      setAck(false);
      setDraftError(false);
    }
  }, [storage.saveState, stored, brief]);
  function edit(key: keyof BriefDraftFields, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setDraftError(false);
  }
  async function exportDraft() {
    try {
      const snapshot = {
        app: "studio-brief-draft",
        schemaVersion: 1,
        projectId: project.id,
        baseBriefId,
        fields,
      };
      const baseBriefSha256 = await sha256(
        new TextEncoder().encode(JSON.stringify(briefSchema.parse(baseBrief))),
      );
      downloadFile(
        `bestillingskladde-${project.id}.json`,
        JSON.stringify({ ...snapshot, baseBriefSha256 }, null, 2),
      );
      notify(
        "Din bestillingskladde er hentet. Den er endnu ikke en ny briefversion.",
      );
    } catch {
      notify(
        "Kladden kunne ikke eksporteres. Teksten er stadig åben her.",
        true,
      );
    }
  }
  async function importDraft(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 2_500_000)
        throw new Error("Bestillingskladden må højst fylde 2,5 MB.");
      const value = transferSchema.parse(JSON.parse(await file.text()));
      const base = project.briefVersions.find(
        (item) => item.id === value.baseBriefId,
      );
      if (
        value.projectId !== project.id ||
        !base ||
        value.baseBriefSha256 !==
          (await sha256(
            new TextEncoder().encode(JSON.stringify(briefSchema.parse(base))),
          ))
      )
        throw new Error(
          "Kladden tilhører et andet projekt eller en anden oprindelig bestilling. Åbn den tilhørende projektpakke.",
        );
      saveBriefDraft(project, value.baseBriefId, value.fields);
      setFields(value.fields);
      setBaseBriefId(value.baseBriefId);
      setAck(false);
      setDraftError(false);
      notify(
        "Bestillingskladden er indlæst. Gennemgå den, før du gemmer en ny version.",
      );
    } catch (error) {
      notify(
        error instanceof z.ZodError
          ? "Filen er ikke en gyldig bestillingskladde."
          : error instanceof Error
            ? error.message
            : "Kladden kunne ikke læses.",
        true,
      );
    } finally {
      setImporting(false);
      if (input.current) input.current.value = "";
    }
  }
  const issue = briefDraftIssue(fields),
    count = fields.criteria.split("\n").filter((line) => line.trim()).length;
  const failed =
      draftError || ["error", "conflict"].includes(storage.saveState),
    saved = !dirty && storage.saveState === "saved" && !draftError;
  return (
    <Modal
      title="Giv arbejdet en tydelig retning"
      description={`Din kladde bygger på bestilling v${baseBrief.version}. Gem en ny version, når den er klar.`}
      onClose={() => {
        if (!importing && commit()) onClose();
      }}
    >
      <form
        onBlurCapture={(event) => {
          if (
            event.relatedTarget &&
            event.currentTarget.contains(event.relatedTarget)
          )
            return;
          if (!importing) commit();
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!writable || importing || issue || (stale && !ack)) return;
          submitted.current = true;
          if (!update((p) => publishBriefDraft(p, baseBriefId, fields, ack))) {
            submitted.current = false;
            return;
          }
          onPublished(brief.version + 1);
          notify("Ny briefversion oprettet. Tidligere versioner er bevaret.");
        }}
      >
        <div className="draft-status" role="status" aria-live="polite">
          <span className={saved ? "draft-saved" : "draft-pending"}>
            {failed ? (
              <CloudOff size={15} />
            ) : saved ? (
              <Check size={15} />
            ) : (
              <LoaderCircle size={15} />
            )}{" "}
            {failed
              ? "Kladde bevaret her · ikke gemt"
              : saved
                ? stored
                  ? "Bestillingskladde gemt lokalt"
                  : "Ingen ugemte ændringer"
                : "Gemmer bestillingskladde…"}
          </span>
          <span>Grundlag v{baseBrief.version}</span>
        </div>
        <p className="draft-help">
          Du kan lukke og fortsætte senere. Kladden ændrer hverken den aktuelle
          bestilling eller igangværende leverancer.
        </p>
        {failed && (
          <Notice danger>
            Browserlagringen er ikke bekræftet. Hent kladden, før du genindlæser
            eller lukker siden.
          </Notice>
        )}
        {stale && (
          <Notice>
            Der findes nu en nyere bestilling, v{brief.version}. Din kladde
            bygger stadig på v{baseBrief.version}. Den nyere bestilling bevares
            også, hvis du opretter v{brief.version + 1}.
          </Notice>
        )}
        {project.archivedAt && (
          <Notice>
            Projektet er arkiveret. Kladden kan læses og hentes; gendan
            projektet for at redigere.
          </Notice>
        )}
        <fieldset className="delivery-fields" disabled={!writable || importing}>
          <label>
            Hvad vil du opnå?
            <textarea
              value={fields.goal}
              onChange={(event) => edit("goal", event.target.value)}
              required
              rows={3}
              maxLength={100000}
            />
          </label>
          <label>
            Hvem er det til?
            <input
              value={fields.audience}
              onChange={(event) => edit("audience", event.target.value)}
              maxLength={100000}
            />
          </label>
          <label>
            Acceptkrav <span>Ét krav pr. linje</span>
            <textarea
              value={fields.criteria}
              onChange={(event) => edit("criteria", event.target.value)}
              required
              rows={4}
              maxLength={32000}
              placeholder="Resultatet kan åbnes på mobil…"
              aria-describedby="brief-criteria-help"
            />
          </label>
          <p id="brief-criteria-help" className="draft-help">
            {count} / 30 krav · Højst 1.000 tegn pr. krav.
          </p>
          <label>
            Rammer og begrænsninger
            <textarea
              value={fields.constraints}
              onChange={(event) => edit("constraints", event.target.value)}
              rows={3}
              maxLength={100000}
            />
          </label>
          {stale && (
            <label className="brief-stale-check">
              <input
                type="checkbox"
                checked={ack}
                onChange={(event) => setAck(event.target.checked)}
              />
              <span>
                Jeg har gennemgået den nyere bestilling og vil gemme denne
                kladde som en ny version.
              </span>
            </label>
          )}
        </fieldset>
        {issue && (
          <p className="brief-draft-issue" role="status">
            {issue}
          </p>
        )}
        <div className="draft-tools">
          <button
            type="button"
            className="text-button"
            onClick={() => void exportDraft()}
          >
            <ArrowDownToLine size={15} />
            Hent bestillingskladde
          </button>
          <button
            type="button"
            className="text-button"
            disabled={!writable || importing}
            onClick={() => input.current?.click()}
          >
            <Upload size={15} />
            {importing ? "Kontrollerer…" : "Indlæs bestillingskladde"}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="Indlæs bestillingskladde"
          disabled={!writable || importing}
          onChange={(event) => void importDraft(event.target.files?.[0])}
        />
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={importing}
            onClick={() => {
              if (commit()) onClose();
            }}
          >
            Luk kladde
          </button>
          <button
            className="button primary"
            disabled={
              !writable || importing || Boolean(issue) || (stale && !ack)
            }
          >
            Gem ny version <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
