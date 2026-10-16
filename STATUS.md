# Tre apps — arbejdsstatus

Aktiv udvikling fra 16. oktober 2026 kl. 19.30 UTC. Brugerens tidsbudget: op til otte timer. Profil: **DEMO**, syntetiske data og lokal browserlagring. Ingen nye betalte eksterne kald.

| Produkt    | Faktisk opnået                                                                                                                                                                                                                                               | Næste arbejde                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Studio One | Bestilling, opgaveafhængigheder, præcis versionsdiff, review, baggrunds-ZIP og vedvarende afleveringskladder. Filinspektøren viser konkrete anvendelser, og tekstredigering bevarer ophav/licens/MIME. 69 produktionsforløb i tre browsere er grønne lokalt. | Hele det seneste filforløb i næste GitHub-kørsel.             |
| FlowLab    | Motor 1.3/PRNG 2, samme seeds, holdout, udfaldsfordelinger, p90/observationsantal, planlagt vent, sagsforløb, scenariebibliotek, datahistorik, CSV-grænser og redigerbare forsøgsrammer. Komplet filtrerbar inputdiff; rigtige PDF/CSV/ZIP.                  | Manuel ankomstliste og sagstyper uden JSON-redigering.        |
| Director   | Faktisk 60s 720p H.264/AAC, PDF/ZIP, genstart, 59,5s crossfade og lyd. Shot-/sekvenshistorik, selektiv kameraopdatering, tre scenetyper og begrænsede biblioteksforhåndsvisninger. Storyboard verificerer det præsenterede videobillede ved trim.            | Projektpakker i baggrundsworker med deduplikerede mediefiler. |

Fælles: 48 grønne integrationstests i isoleret PostgreSQL/pg-boss. En rigtig separat worker overlever afbrudte databaseforbindelser og fortsætter uden duplikerede resultater. En faktisk backup/restore har gendannet 26 app-/køtabeller og to filversioner med RLS, idempotens og budgetreservationer kontrolleret efter gendannelse. Prøven er også grøn på GitHub; et par hundrede millisekunder ind i en allerede provisioneret, lille syntetisk database er ikke et produktionsløfte om RPO/RTO.

Private lokale filer har atomisk offentliggørelse uden overskrivning, kontrol af størrelse/SHA-256 og korte downloadlinks med fornyet medlemskontrol. En ny prøve kører den faktiske Next-produktionsserver over HTTP, henter JWT-signeringens offentlige nøgle over verificeret HTTPS, bruger begrænsede databasekonti, får den separate worker til at færdiggøre et job og henter en rigtig privat fil. En bevidst fejlet prøve bevarer exitkode 1 og rydder op. Identitetstjenesten i denne prøve er en lokal fixture.

GitHub-kørsel **38978012084** på **23d0bdc**: fælles type-, unit-, database- og restorekontrol samt hele Studio- og Director-jobbet er grønne. FlowLab kører stadig. Studios nyere filinspektør, FlowLabs komplette inputdiff og den nye HTTP-prøve kommer med i næste push. Director-fejlen fra den foregående kørsel er konkret løst: WebKit kunne melde korrekt tidsposition, mens et gammelt billede stadig var præsenteret; den nye kontrol af native videoframes består også på GitHub.

Seneste lokale kontrol: 226 unit-tests, 48 databaseintegrationer, typechecks, produktionsbuilds og 69 Studio-browserforløb. De tilhørende checkpoints beskriver præcist omfang og begrænsninger.

Hosted Cloud/Auth, cloudobjektlager, betalt generation og betaling er ikke tilkoblet. Der er ingen baggrundsdæmon lovet eller aktiveret; fremdriften sker i den aktive session og dokumenteres her.
