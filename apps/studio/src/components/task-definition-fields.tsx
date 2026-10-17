"use client";
import { taskCriteria, taskDefinitionIssue } from "../lib/task-definition";

export function TaskDefinitionFields({
  owner,
  criteria,
  briefCriteria,
  onOwner,
  onCriteria,
}: {
  owner: string;
  criteria: string;
  briefCriteria: string[];
  onOwner: (value: string) => void;
  onCriteria: (value: string) => void;
}) {
  const issue = taskDefinitionIssue(owner, criteria);
  return (
    <div className="task-definition-fields">
      <label>
        Ansvarlig
        <input
          value={owner}
          onChange={(event) => onOwner(event.target.value)}
          maxLength={100}
          required
          autoComplete="off"
        />
      </label>
      <p className="field-help">
        Et navn til overblikket. Det sender ingen invitation og ændrer ikke
        adgang.
      </p>
      <label>
        Færdig betyder <span>Ét efterprøveligt krav pr. linje</span>
        <textarea
          value={criteria}
          onChange={(event) => onCriteria(event.target.value)}
          rows={3}
          maxLength={32000}
          required
          aria-describedby="task-definition-help"
        />
      </label>
      <div className="task-definition-tools">
        <span>{taskCriteria(criteria).length} / 30 krav</span>
        <button
          type="button"
          className="text-button"
          onClick={() => onCriteria(briefCriteria.join("\n"))}
          disabled={!briefCriteria.length}
        >
          Erstat med briefets krav
        </button>
      </div>
      <p
        id="task-definition-help"
        className={issue ? "task-definition-issue" : "field-help"}
      >
        {issue ??
          "Denne opgave vurderes mod sine egne krav. De låses, når leveringen starter."}
      </p>
    </div>
  );
}
