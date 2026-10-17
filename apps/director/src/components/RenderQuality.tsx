import type { RenderState } from "../lib/server/local-render";
import type { Project } from "@tre/scene-format";
import { compareRenderSnapshot } from "../lib/render-state";
const number = (value: number) =>
  value.toLocaleString("da-DK", { maximumFractionDigits: 1 });
export function RenderQuality({
  job,
  project,
  snapshotHash,
  snapshotPending,
  snapshotError,
}: {
  job: RenderState;
  project: Project;
  snapshotHash?: string;
  snapshotPending?: boolean;
  snapshotError?: string;
}) {
  const audio = job.metadata;
  if (!audio) return null;
  const peakHigh = audio.truePeakDbfs !== undefined && audio.truePeakDbfs > -1;
  const comparison = compareRenderSnapshot(job, project, snapshotHash);
  return (
    <div className="render-quality">
      <strong>Målt på den færdige MP4</strong>
      {job.source && (
        <small>
          {job.source.title} · revision {job.source.revision}
        </small>
      )}
      {comparison === "different" && (
        <p className="caption-warning">
          Du har ændret filmen siden denne eksport. Downloaden bevarer den
          tidligere klipning.
        </p>
      )}
      {comparison === "same" && (
        <p className="snapshot-match">
          Denne eksport matcher din aktuelle projektversion.
        </p>
      )}
      {snapshotPending && <p>Kontrollerer projektversionen …</p>}
      {snapshotError && <p className="caption-warning">{snapshotError}</p>}
      <dl>
        <div>
          <dt>Lydformat</dt>
          <dd>
            {audio.audioCodec?.toUpperCase() ?? "AAC"} ·{" "}
            {number(audio.audioSampleRate / 1000)} kHz
          </dd>
        </div>
        <div>
          <dt>Loudness</dt>
          <dd>
            {audio.audioSilent
              ? "Stilhed"
              : audio.loudnessLufs !== undefined
                ? `${number(audio.loudnessLufs)} LUFS`
                : "Ikke målt i denne eksport"}
          </dd>
        </div>
        <div>
          <dt>True peak</dt>
          <dd>
            {audio.audioSilent
              ? "−∞ dBTP"
              : audio.truePeakDbfs !== undefined
                ? `${number(audio.truePeakDbfs)} dBTP`
                : "Ikke målt i denne eksport"}
          </dd>
        </div>
      </dl>
      {peakHigh && (
        <p className="caption-warning">
          Lydens peak overstiger −1 dBTP. Sænk niveauet og eksportér igen, hvis
          filen skal holde dette mål.
        </p>
      )}
      {!audio.audioSilent && (
        <p>
          Lydniveauet er målt efter AAC-kodning. Tale sigter typisk mod cirka
          −16 LUFS; dine valgte niveauer er bevaret.
        </p>
      )}
      {job.captions?.warningShots ? (
        <p className="caption-warning">
          {job.captions.warningShots} shot
          {job.captions.warningShots > 1 ? "s" : ""} har hurtige undertekster.
          Giv mere tid i næste klipning.
        </p>
      ) : null}
      <div className="render-artifacts">
        {job.artifacts?.["validation.json"] && (
          <a href={`/api/exports/${job.id}?artifact=validation.json`} download>
            Hent kvalitetsrapport
          </a>
        )}
        {job.artifacts?.["captions.srt"] && (
          <a href={`/api/exports/${job.id}?artifact=captions.srt`} download>
            Filmens SRT
          </a>
        )}
        {job.artifacts?.["captions.vtt"] && (
          <a href={`/api/exports/${job.id}?artifact=captions.vtt`} download>
            Filmens VTT
          </a>
        )}
      </div>
      <small>Rapport og undertekster tilhører denne låste eksport.</small>
    </div>
  );
}
