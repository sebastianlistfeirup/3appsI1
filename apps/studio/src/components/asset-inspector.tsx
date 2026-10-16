"use client";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  FileClock,
  ShieldCheck,
} from "lucide-react";
import { downloadFile } from "@tre/persistence";
import Link from "./local-link";
import {
  artifactBytes,
  reviseArtifactMetadata,
  type Artifact,
  type Project,
} from "../lib/model";
import { sandboxDocument } from "../lib/preview";
import {
  Badge,
  DeliveryStatus,
  Modal,
  Notice,
  bytesLabel,
  formatDate,
} from "./primitives";
import type { ProjectActions } from "./studio-app";
const rightsLabels = {
  owned: "Eget indhold",
  licensed: "Licenseret",
  unknown: "Rettigheder uafklaret",
};
const runLabels = {
  awaiting_upload: "Afventer fil",
  review: "Til review",
  failed: "Fejlet",
  cancelled: "Annulleret",
  succeeded: "Afsluttet",
};
export function AssetInspector({
  project,
  selected,
  onSelect,
  onEdit,
  onMetadata,
  onClose,
}: {
  project: Project;
  selected: Artifact;
  onSelect: (artifact: Artifact) => void;
  onEdit: () => void;
  onMetadata: () => void;
  onClose: () => void;
}) {
  const family = project.artifacts
    .filter((a) => a.artifactId === selected.artifactId)
    .sort((a, b) => b.version - a.version);
  const source = project.artifacts.find((a) => a.id === selected.derivedFrom);
  const inputs = project.runs.filter((run) =>
    run.inputVersionIds.includes(selected.id),
  );
  const outputs = project.deliveries.filter((delivery) =>
    delivery.outputVersionIds.includes(selected.id),
  );
  return (
    <Modal
      title={selected.name}
      description={`Version ${selected.version} · ${bytesLabel(selected.bytes)} · ${formatDate(selected.createdAt)}`}
      onClose={onClose}
    >
      <div className="asset-version-bar">
        <label>
          Se filversion
          <select
            value={selected.id}
            onChange={(event) =>
              onSelect(family.find((a) => a.id === event.target.value)!)
            }
          >
            {family.map((a, index) => (
              <option key={a.id} value={a.id}>
                Version {a.version}
                {index === 0 ? " · nyeste" : ""} · {formatDate(a.createdAt)}
              </option>
            ))}
          </select>
        </label>
        <Badge kind={selected.rights === "unknown" ? "warning" : "neutral"}>
          {rightsLabels[selected.rights]}
        </Badge>
      </div>
      {selected.mime === "text/html" || selected.mime === "image/svg+xml" ? (
        <iframe
          className="asset-preview"
          title={`Preview af ${selected.name}`}
          srcDoc={sandboxDocument(
            selected.encoding === "utf8"
              ? selected.content
              : new TextDecoder().decode(artifactBytes(selected)),
          )}
          sandbox=""
        />
      ) : selected.mime.startsWith("image/") &&
        selected.encoding === "base64" ? (
        <img
          className="asset-image"
          src={`data:${selected.mime};base64,${selected.content}`}
          alt={selected.name}
        />
      ) : selected.encoding === "utf8" ? (
        <pre className="source-view">{selected.content}</pre>
      ) : (
        <Notice>
          Denne filtype kan hentes og versionsstyres, men har ikke et indbygget
          preview.
        </Notice>
      )}
      <section className="asset-provenance" aria-label="Filens ophav">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <h3>Ophav følger versionen</h3>
          <p>{selected.provenance || "Ophavet er ikke beskrevet."}</p>
          {source && (
            <p>
              Denne version bygger på{" "}
              <button className="inline-link" onClick={() => onSelect(source)}>
                version {source.version}
              </button>
              .{" "}
              {source.sha256 === selected.sha256
                ? "Filindholdet er identisk; metadata er ændret."
                : "Filindholdet er ændret."}
            </p>
          )}
          {!project.archivedAt && (
            <button className="inline-link" onClick={onMetadata}>
              Afklar ophav og rettigheder <ArrowUpRight size={13} />
            </button>
          )}
        </div>
      </section>
      <details className="hash-details">
        <summary>Kontrolsum og filtype</summary>
        <p>
          {selected.mime || "Ukendt filtype"} ·{" "}
          {selected.bytes.toLocaleString("da-DK")} bytes
        </p>
        <code>{selected.sha256}</code>
      </details>
      <section className="asset-usage" aria-label="Hvor bruges denne version?">
        <h3>
          <FileClock size={17} aria-hidden="true" /> Hvor bruges denne version?
        </h3>
        {!inputs.length && !outputs.length ? (
          <p className="asset-usage-empty">
            Versionen er klar til brug. Den er endnu ikke låst som input eller
            afleveret i en leverance.
          </p>
        ) : (
          <>
            {inputs.length > 0 && (
              <div>
                <h4>Låst input · {inputs.length}</h4>
                <ul>
                  {inputs.map((run) => (
                    <li key={run.id}>
                      <Link
                        href={`/projects/${project.id}/runs#run-${run.id}`}
                        onClick={onClose}
                      >
                        <span>
                          {project.tasks.find((t) => t.id === run.taskId)
                            ?.title ?? "Leveringsforløb"}
                        </span>
                        <ArrowUpRight size={14} />
                      </Link>
                      <Badge>{runLabels[run.state]}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {outputs.length > 0 && (
              <div>
                <h4>Afleveret output · {outputs.length}</h4>
                <ul>
                  {outputs.map((delivery) => (
                    <li key={delivery.id}>
                      <Link
                        href={`/projects/${project.id}/review/${delivery.id}`}
                        onClick={onClose}
                      >
                        <span>{delivery.title}</span>
                        <ArrowUpRight size={14} />
                      </Link>
                      <DeliveryStatus
                        project={project}
                        deliveryId={delivery.id}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
      <div className="modal-actions">
        {selected.encoding === "utf8" && !project.archivedAt && (
          <button className="button secondary" onClick={onEdit}>
            Opret ny version
          </button>
        )}
        <button
          className="button primary"
          onClick={() =>
            downloadFile(
              selected.name,
              artifactBytes(selected) as Uint8Array<ArrayBuffer>,
              selected.mime,
            )
          }
        >
          Hent fil <ArrowDownToLine size={16} />
        </button>
      </div>
    </Modal>
  );
}
export function AssetMetadataDialog({
  project,
  source,
  update,
  notify,
  onClose,
  onSaved,
}: ProjectActions & {
  source: Artifact;
  onClose: () => void;
  onSaved: (artifact: Artifact) => void;
}) {
  const [provenance, setProvenance] = useState(source.provenance);
  const [rights, setRights] = useState(source.rights);
  const changed =
    provenance.trim() !== source.provenance || rights !== source.rights;
  return (
    <Modal
      title="Afklar ophav og rettigheder"
      description={`${source.name} · med udgangspunkt i version ${source.version}`}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          let created: Artifact | undefined;
          if (
            update((current) => {
              const next = reviseArtifactMetadata(current, source.id, {
                provenance,
                rights,
              });
              created = next.artifacts.at(-1);
              return next;
            }) &&
            created
          ) {
            notify(
              `Ophav gemt i version ${created.version}. Tidligere versioner er bevaret.`,
            );
            onSaved(created);
          }
        }}
      >
        <Notice>
          Oplysningerne gemmes som en ny version med samme filindhold. Allerede
          låste input og leverancer beholder deres oprindelige oplysninger.
        </Notice>
        <label>
          Hvor kommer indholdet fra?
          <textarea
            rows={3}
            value={provenance}
            onChange={(event) => setProvenance(event.target.value)}
            maxLength={1000}
            required
          />
        </label>
        <label>
          Rettigheder
          <select
            value={rights}
            onChange={(event) =>
              setRights(event.target.value as Artifact["rights"])
            }
          >
            <option value="unknown">Ikke afklaret endnu</option>
            <option value="owned">Mit eget indhold</option>
            <option value="licensed">Jeg har en gyldig licens</option>
          </select>
        </label>
        <p className="asset-metadata-note">
          Angiv fx forfatter, kilde og licens. Studio registrerer din oplysning;
          appen verificerer ikke selve licensen.
        </p>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Fortryd
          </button>
          <button
            className="button primary"
            disabled={
              !changed || !provenance.trim() || Boolean(project.archivedAt)
            }
          >
            Gem som ny version
          </button>
        </div>
      </form>
    </Modal>
  );
}
