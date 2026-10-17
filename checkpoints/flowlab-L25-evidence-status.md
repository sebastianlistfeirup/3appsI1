# L25 — Aktuel baselinevurdering med tydelig periode og afgrænsning

Udført 2026-10-17. Motoren ændres ikke; en bestået holdout bliver ikke til en påstand om automatisk kalibrering.

## Implementering

- En kompakt, udvidelig kvalitetsstatus viser baseline som ikke vurderet, utilstrækkeligt grundlag, uden for pilotmålet, inden for pilotmålet eller historisk. Aktuel status kræver præcist match mellem den frosne baseline og motorversionen. Et metadataflag, fx `calibrated`, kan ikke etablere vurderingen.
- Udvidelse viser testet periode, kildefil, observerede afslutninger, antal seeds, begrænsningen ved små stikprøver og at resultatet ikke er en garanti for fremtidig drift. ISO-perioder angiver UTC; numeriske perioder viser deres enhed og bevarer millisekunddetaljer.
- Manglende rensede kildedata fremgår også af den lukkede status. Det historiske resultat bevares, men datarækkerne kan ikke efterprøves fuldt. Gendannelse via undo fjerner den konkrete mangel.
- En ændret baseline fjerner den grønne aktuelle vurdering i både hovedstatus og holdout-panelet. Det tidligere resultat bevares tydeligt som historisk. Et ændret alternativ arver aldrig baselines holdout; teksten gør forskellen eksplicit.
- Rapportens status beregnes mod rapportens egne modelsnapshots og motorversion. PDF bevarer mærket Eksempeldata/Importeret grundlag, viser baselineforholdet i sidefoden og behandler historisk holdout som historisk også på kvalitetssiden. Det faktiske threshold bruges i forklaringen.
- Inspectoren påstår ikke længere altid syntetiske data, og dens tekst henviser til den særskilte baselinevurdering. Importeret grundlag eller bestået holdout bruges ikke som synonym for en udført kalibrering.

## Verifikation

141 motor-/apptests i 23 filer, typecheck og produktionsbuild. Fem nye domænetests bruger faktisk 30-seed-golden-holdout og dækker manglende vurdering trods metadataflag, aktuel/historisk status, ændret motor eller model, uafhængighed, afvigelse, tærskel og tidsenheder.

`evidence-status-check.ts` køres i Chromium, Firefox og WebKit ved desktop/tablet/mobil: reel CSV-validering, eksplicit uafhængighed/komplet periode, observeret 3 og 30 seeds, modelændring/undo, alternativ uden arvet vurdering, lagring/genåbning, kildefjernelse/undo og faktisk ZIP/PDF. En ny 30-seed-kørsel på ændret baseline eksporterer historisk holdout uden aktuel bestået-status; PDF og JSON bevarer både den nye baseline og den tidligere testede baseline. Axe WCAG2A/AA/21AA: 0. Ingen browserfejl eller dokumentoverflow. Skærmbilleder er visuelt inspiceret.

Eksisterende holdout- og journey-forløb samt faktiske touch-events i alle tre browsere er gentaget og grønne.

PDF-stressprøven bevarer 100 puljer, maksimale beløb og lange danske tekster på 25 sider uden ord uden for margenerne. Den almindelige rapport forbliver 5 sider; golden med holdout 6 sider.

Beviser: `reports/flowlab/engine-tests.txt`, `*-evidence-status-check.json`, `*-evidence-status.png`, `*-evidence-report.pdf`, `report-layout-check.json`.
