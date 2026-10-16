"use client";
import { ArrowRight, CalendarClock, GitBranch, RotateCcw } from "lucide-react";
import { EXAMPLE_TEMPLATES, type TemplateKey } from "../lib/templates";

export default function ExampleTemplates({
  onOpen,
}: {
  onOpen: (key: TemplateKey) => void;
}) {
  return (
    <section
      className="example-templates"
      aria-labelledby="example-templates-title"
    >
      <div className="section-title">
        <div>
          <h3 id="example-templates-title">Prøv en anden mekanisme.</h3>
          <p>
            Færdige sammenligninger med syntetiske input. Resultater beregnes,
            når du åbner dem.
          </p>
        </div>
      </div>
      <div className="example-template-grid">
        {EXAMPLE_TEMPLATES.map((template) => {
          const Icon =
            template.icon === "route"
              ? GitBranch
              : template.icon === "rework"
                ? RotateCcw
                : CalendarClock;
          return (
            <article
              className="panel example-template-card"
              key={template.id}
              aria-labelledby={`template-${template.id}-title`}
            >
              <span className={`example-template-icon ${template.id}`}>
                <Icon size={24} />
              </span>
              <span className="eyebrow">{template.eyebrow}</span>
              <h4 id={`template-${template.id}-title`}>{template.title}</h4>
              <p>{template.description}</p>
              <span className="example-template-facts">{template.facts}</span>
              <div className="example-template-notes">
                <p>
                  <strong>Det ændrer du</strong>
                  {template.change}
                </p>
                <p>
                  <strong>Hold øje med</strong>
                  {template.watch}
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => onOpen(template.id)}
                aria-label={`Åbn skabelon: ${template.title}`}
              >
                Åbn sammenligningen <ArrowRight size={16} />
              </button>
            </article>
          );
        })}
      </div>
      <p className="field-hint">
        Dit aktuelle udkast gemmes som et snapshot, hvis det ikke allerede er
        bevaret. Datahistorik og beslutningskladde følger arbejdsrummet. De nye
        skabeloner er ikke kalibrerede driftsmodeller.
      </p>
    </section>
  );
}
