import {
  calendarTemplate,
  caseRoutingTemplate,
  reworkTemplate,
} from "@tre/flow-engine";
import { initialDocument, type FlowDocument } from "./document";

export type TemplateKey = "membership" | "routing" | "rework" | "calendar";
export const EXAMPLE_TEMPLATES = [
  {
    id: "routing",
    title: "Sagsfordeling",
    eyebrow: "SAGSTYPER & FÆLLES KAPACITET",
    description:
      "Et fælles team eller én medarbejder til hver sagstype? Samme bemanding kan give forskellige køer.",
    facts: "12 sager · 2 sagstyper · 2 timer",
    change:
      "Alternativet deler de to medarbejdere i hver sin pulje. Løn og varigheder er uændrede.",
    watch:
      "Sammenlign restkø og sagstyper. En lavere median blandt afsluttede sager kan skjule komplekse sager i restkøen.",
    icon: "route",
  },
  {
    id: "rework",
    title: "Ansøgninger og genarbejde",
    eyebrow: "GENARBEJDE & PLANLAGT VENT",
    description:
      "En sag kan vende tilbage uden at blive en ny sag. Følg besøg, vent på afklaring og arbejdet i teamet.",
    facts: "20 sager · 2 medarbejdere · 6 timer",
    change:
      "Alternativet antager 10 % genarbejde mod 30 %. Hvert aktivitetsbesøg koster 5 kr.; planlagt vent optager ingen medarbejder.",
    watch:
      "Undersøg både antal afsluttede sager og antal besøg. Omkostningen ved at opnå den lavere genarbejdsandel er ikke lagt ind.",
    icon: "rework",
  },
  {
    id: "calendar",
    title: "Arbejdsdag med pause",
    eyebrow: "ARBEJDSPLAN & AFBRYDELSER",
    description:
      "Hvad sker der, når pausen falder midt i et besøg? Arbejdet fortsætter med den samme restvarighed bagefter.",
    facts: "4 sager · 1 medarbejder · 8 timer",
    change:
      "Alternativet flytter en times pause fra minut 180–240 til 120–180. Begge planer reserverer syv medarbejdertimer.",
    watch:
      "Se, om tiderne ændrer sig, selv når samlet løn og throughput er ens. De fire syntetiske sager er et lille eksempel.",
    icon: "calendar",
  },
] as const;

/** Every open gets fresh objects; editing a template cannot change later examples. */
export function createExampleTemplate(key: TemplateKey): FlowDocument {
  const doc = initialDocument();
  if (key === "membership") return doc;
  const baseline =
    key === "routing"
      ? caseRoutingTemplate()
      : key === "rework"
        ? reworkTemplate()
        : calendarTemplate();
  doc.baseline = baseline;
  doc.scenario = structuredClone(baseline);
  if (key === "routing") {
    doc.scenario.resources[0] = {
      ...doc.scenario.resources[0],
      label: "Team til enkle sager",
      capacity: 1,
    };
    doc.scenario.resources.push({
      id: "complex-team",
      label: "Team til komplekse sager",
      capacity: 1,
      hourlyCost: 285,
      calendar: [],
    });
    doc.scenario.nodes.find((node) => node.id === "complex")!.resourceId =
      "complex-team";
    doc.scenarioName = "Ét team pr. sagstype";
    doc.hypothesis =
      "Opdeling efter sagstype ændrer konkurrencen om kapacitet. Undersøg kø og afsluttede sager, selv om der stadig er to medarbejdere med samme samlede løn.";
  } else if (key === "rework") {
    doc.scenario.edges.find((edge) => edge.id === "accepted")!.weight = 0.9;
    doc.scenario.edges.find((edge) => edge.id === "needs-rework")!.weight = 0.1;
    doc.scenarioName = "Antaget 10 % genarbejde";
    doc.hypothesis =
      "En lavere genarbejdsandel kan reducere ekstra besøg, planlagt vent og omkostninger. Faldet fra 30 % til 10 % er en antagelse; årsag og eventuel indsatspris skal dokumenteres separat.";
  } else {
    doc.scenario.resources[0].calendar = [
      { start: 0, end: 120 * 60000 },
      { start: 180 * 60000, end: 480 * 60000 },
    ];
    doc.scenarioName = "En time tidligere pause";
    doc.hypothesis =
      "Pausens placering kan ændre gennemløbstid uden at ændre den samlede lønkapacitet. Et aktivt besøg pauser og genoptager sit resterende arbejde; der trækkes ingen ny varighed.";
  }
  return doc;
}
