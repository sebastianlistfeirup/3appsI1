# Fortsæt fra den verificerede udgave

Dette er arbejdsmetadata for udviklingen. Filerne starter ingen agent, scheduler eller baggrundsproces. Den aktuelle produkttilstand og de manglende forbindelser står i [STATUS](../STATUS.md) og [acceptkortet](../docs/acceptance-map.md).

1. Hent `main`, og læs [STATE.json](../STATE.json), [policy.json](policy.json) og [releaseplanen](../docs/release-readiness.md). Den eksisterende GitHub-standardgren kan hedde `task/F00-foundation-studio`; brug eksplicit `main` til videre arbejde.
2. Installér fra lockfilen. Brug Node/pnpm-versionerne i [versionsmatricen](../VERSION_MATRIX.md). Opstart og relevante kontroller står i [README](../README.md).
3. Find den konkrete task i [tasks.json](tasks.json), dens afhængigheder, acceptkrav og checkpoint. `verified-local` er ikke det samme som en tilsluttet cloudbrugerrejse. `attempts: null` betyder, at et samlet antal forsøg ikke blev registreret; konkrete kørsler og rettelser findes i rapporterne.
4. Opret en afgrænset gren/worktree med entydigt ejerskab, hvis arbejdet fortsætter. Fælles kontrakter har én writer. En ny integration skal have et specifikt miljø, et tilgængeligt bevis og en plan for fejl/genstart før den beskrives som tilsluttet.
5. Kør kun de kontroller, ændringen og repositoryets krav gør relevante. Gem faktisk udfald, commit og artefakter; et ændret `status`-felt er ikke et verifikationsbevis. Opdatér checkpoint, STATE og STATUS efter integration.

`priority` er en stabil numerisk rækkefølge for den registrerede backlog, med laveste værdi først når afhængighederne tillader det. Den er ikke en fejlalvorlighed, og færdige opgaver genstartes ikke af denne fil. `verification_profile` beskriver bevisets overordnede omfang; det konkrete checkpoint afgør kommandoer, browserudsnit og begrænsninger.

Den næste produktblok er hosted identitet og én samlet autentificeret kundesti. [Releaseplanen](../docs/release-readiness.md) beskriver rækkefølgen. Betalingstask F05 er udskudt, fordi der ikke er valgt eller tilsluttet en betalingsleverandør; der er ikke udført en fiktiv betalingsprøve.

Repositoryets kodeadgang kunne oprette og opdatere `main`, men GitHub afviste ændring af standardgren med HTTP 403. Overdragelsen holder derfor også den eksisterende standardgren opdateret. Det ændrer ikke hvilke filer, der er verificeret.
