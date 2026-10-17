# FlowLab: varige lokale serverjobs

FlowLabs normale brugerflade kører stadig lokalt i browseren. Den nye, valgfrie serverprofil har en faktisk PostgreSQL-kø og en separat Node-worker. Ingen browserdata flyttes automatisk, og hosted login eller cloud-synkronisering er ikke tilsluttet.

## Hvad der faktisk kører

`flow.compare` bruger præcis den samme `@tre/flow-engine` som browseren. Baseline, alternativ, 30 forskellige uint32-seeds, motorversion og PRNG-version låses i jobinput. Workeren sammenligner alle 30 seedpar i en separat native Node Worker-tråd, kontrollerer rapportens fuldstændighed og gemmer ét immutable resultat med SHA-256 af både de normaliserede input og sammenligningen. Databasens `input_hash` omfatter desuden projekt, app, jobtype og reservation; de to hashes har derfor forskellige formål.

Der er ingen eksterne modelkald og ingen udførelse af indsendt kode. Det eneste udførte program er den medfølgende simulationsmotor. Reservation og faktisk eksternt forbrug er altid nul.

Serverprofilen `flow-local-bounded/1` afviser arbejde over følgende grænser. Den ændrer eller forkorter ikke en accepteret model:

| Grænse                                 | Maksimum pr. model/job        |
| -------------------------------------- | ----------------------------- |
| Noder / ressourcepuljer / forbindelser | 20 / 10 / 60                  |
| Sager, inklusive initial backlog       | 2.000                         |
| Events / kalenderintervaller i alt     | 250.000 / 100                 |
| Simulationsperiode                     | 31 dage                       |
| Låst input / færdigt resultat          | 500 KB / 8 MB UTF-8 JSON      |
| Seedpar                                | Præcis 30 forskellige seeds   |
| Kørsel i native tråd                   | 90 sekunder inklusive opstart |

Baseline og alternativ skal have samme periode og warm-up. Graf, ressourcehenvisninger, routing og begrænsede cykler valideres semantisk. Tråden får V8-grænser på 256 MiB old generation, 32 MiB young generation og 4 MiB stack. Det er V8-heapgrænser, ikke en hård grænse for hele processens RSS; en driftssat container kræver sin egen ressourcepolitik.

Annullering og tidsfrist kalder `terminate()` og venter på, at den native tråd er stoppet, før jobbet afregnes. Et ufuldstændigt eller for stort resultat bliver ikke offentliggjort. Fremdrift logges som antal fuldførte seedpar; delresultater er ikke varige checkpoints.

## Nedbrud og genstart

Den normale worker har en 120-sekunders app-lease og opdaterer den hvert sekund. pg-boss har sin egen 120-sekunders heartbeat med 30-sekunders opdatering. Hvis køen genleverer før app-leasen er udløbet, venter processoren på den aktive operation eller på leaseudløb; den kvitterer ikke et afbrudt job væk.

Genkørsel er kun tilladt, når en registreret serverhandler eksplicit garanterer en ren, gratis beregning for den rigtige app, der ikke har nogen providerreference, og reservationen stadig er nul og holdt. Klientinput kan ikke give denne tilladelse. Migration 0005 beskytter også overgangen fra afbrudt validering til genkørsel. Ukendte eksterne udfald beholder `reconcile_required` og deres reservation.

En afbrudt FlowLab-beregning genstarter alle 30 seedpar fra de samme input. Der er højst tre forsøg. Annullering, udløbet deadline eller opbrugt forsøgsgrænse afsluttes uden ny beregning og afregnes én gang til nul. Gamle leases kan ikke offentliggøre et resultat efter en ny workers overtagelse.

## Valgfri API

Brug de adskilte databaseprincipaler og migrationer i [backendprofilen](backend-profile.md). FlowLabs Next-proces læser `TRE_BACKEND_ENABLED=1`, `APP_DATABASE_URL` og `SUPABASE_URL` fra sit servermiljø. Identiteten skal være en gyldig asymmetrisk signeret brugertoken fra den konfigurerede HTTPS-issuer. Uden konfiguration returneres en eksplicit frakoblet tilstand. Secrets må aldrig være `NEXT_PUBLIC_*`.

Start workeren med de tre begrænsede forbindelser `APP_WORKER_DATABASE_URL`, `DISPATCHER_DATABASE_URL` og `QUEUE_DATABASE_URL` i miljøet:

```bash
pnpm --filter @tre/worker start
```

API'en har samme autentificering, origin-kontrol, RLS, revisionskrav, job-/resultatendpoints og private uploadprotokol som [Studio API'en](backend-api.md). FlowLabs projektdokument er `{ schemaVersion: 1, kind: "flow.models", baseline, scenario, context }`; det er et separat serverformat med modeller, ikke hele browserens data- og resultathistorik.

`POST /api/backend/projects/:id/jobs` modtager:

```ts
{
  idempotencyKey: "en-stabil-nøgle-for-dette-forsøg",
  kind: "flow.compare",
  input: {
    schemaVersion: 1,
    profile: "flow-local-bounded/1",
    engineVersion: ENGINE_VERSION,
    prngVersion: PRNG_VERSION,
    baseline, scenario,
    seeds: seedList(2026, 30)
  }
}
```

Konstanter og `seedList` kommer fra `@tre/flow-engine`. Et gentaget request med samme nøgle og samme input får det samme logiske job. Ændrede input kræver en ny nøgle. Et request kan ikke fastsætte sin egen pris eller aktivere en betalt adapter. `GET /api/backend/jobs/:id/result` returnerer kun det verificerede, færdige resultat i den samme app og med aktuel læseadgang.

## Udførte prøver

- Unit-fixturen sammenligner det faktiske native resultat med motorens normale resultat for alle 30 seedpar, inklusive komplet numerisk lighed. Den afprøver annullering under arbejdet, virkelig tråddeadline, semantisk ugyldige modeller og et ufuldstændigt eventbegrænset resultat.
- PostgreSQL-fixtures dækker samtidige leveringer, naturligt udløb af en kort lease, afbrudt `running`/`validating`, nulreservation, appadskillelse, providerreference, annullering, forsøgsgrænse og venten på faktisk teardown.
- `tests/integration/worker-process.test.ts` dræber den rigtige separate worker med SIGKILL efter et reelt seedpar. En ny proces færdiggør jobbet efter pg-boss' og app-leasens naturlige udløb. Ingen SQL-tidsstempler ændres i denne prøve. Rapport: [flow-worker-crash-recovery.json](../reports/database/flow-worker-crash-recovery.json).
- `pnpm test:http --app=flowlab` starter den faktiske produktionsbuild, en certifikatvalideret HTTPS-JWKS-fixture, begrænsede logins og den separate worker. Det verificerer 30 seedpar og hashes gennem HTTP samt privat upload, faktisk Next-SIGKILL, genoptaget afslutning og download. Rapport: [flowlab-http-proof.json](../reports/backend/flowlab-http-proof.json).

Fixtures er syntetiske og lokale. De dokumenterer implementerede forbindelser mellem rigtige processer; de er ikke en tilkoblet hosted tjeneste eller et løfte om produktions-RTO.
