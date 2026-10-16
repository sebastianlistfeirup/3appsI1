/** Stable engine codes remain machine-readable; this text explains their practical consequence. */
export const engineDiagnostics: Record<string, string> = {
  cancelled:
    "Kørslen blev afbrudt. Kun afsluttede par kan bruges som delresultat.",
  event_limit:
    "Modellens grænse for hændelser blev nået før periodens slutning. Afgræns modellen eller hæv den eksplicitte grænse.",
  rework_truncated:
    "En sag overskred det tilladte antal besøg. Undersøg genarbejde og routing; dette er ikke et fuldført driftsresultat.",
  routing_no_match:
    "En sagstype har ingen matchende udgang på en beslutningsnode. Tilføj den manglende regel.",
  zero_capacity:
    "Mindst én ressourcepool har nul kapacitet. Dens sager kan blive i restkøen; udnyttelse uden kapacitet vises som ikke tilgængelig.",
  trace_limit:
    "Hændelsessporet er begrænset i størrelse. Samlede resultatmål er stadig beregnet fra hele kørslen.",
  timeline_limit:
    "Detaljer om ressourcetidslinjer er begrænset i størrelse. Samlede resultatmål og kapacitetsregnskabet er stadig komplette.",
  engine_conservation_error:
    "Kontrollen af sager og ressourcepladser stemte ikke. Kørslen er stoppet og kan ikke bruges som komplet rapport.",
  engine_capacity_error:
    "Kapacitetsregnskabet overskred en fysisk grænse. Kørslen er stoppet og kan ikke bruges som komplet rapport.",
};
export const describeEngineCode = (code: string) =>
  engineDiagnostics[code] ?? `Motoren returnerede en ukendt status: ${code}.`;
