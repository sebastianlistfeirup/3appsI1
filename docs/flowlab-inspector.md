# Sikker feltredigering i modelværkstedet

Inspectoren viser den valgte nodes antagelser. Tekst- og talfelter anvendes med **Enter** eller ved at forlade feltet. Hele indtastningen er én ændring i Fortryd/Gentag, selv om du har skrevet flere tegn. **Escape** gendanner den tidligere værdi.

Mens du skriver, står **Kladde** ved feltet. Kladden er endnu ikke modelinput og er ikke gemt i IndexedDB. Browseren advares, hvis siden forlades med en uanvendt feltkladde. En import, der blev startet før en ny indtastning, får ikke lov at overskrive kladden med et sent workersvar.

Et tomt felt er ikke nul. Ugyldige værdier kan ikke anvendes med Enter. Hvis du forlader et ugyldigt felt, kommer den tidligere modelværdi tilbage sammen med en forklaring. Der anvendes ingen skjult minimumsværdi eller automatisk kapacitetsgrænse. Et eksplicit `0` er stadig tilladt, hvor modellen tillader det, fx kapacitet, løn, startkø og variabel aktivitetspris.

Komma og punktum er decimaltegn; undlad tusindtalsseparator og eksponentnotation. Medarbejdere, sagslofter og genbesøg kræver hele tal. Løn og variabel pris kan have decimaler. Navne og sagstyper kræver 1–100 tegn uden kontroltegn. Teksten erstattes ikke automatisk med et nyt standardnavn.

**Tid:** simulationsstop skal ligge efter målestart, og SLA/horisont skal være positive og højst 365 døgn. UI-tider omregnes til hele millisekunder med samme tydelige grænser som varighedseditoren. Brug **Forsøgets rammer** under Scenarier til at sætte samme målevindue på begge modeller; en parret sammenligning kræver samme vindue.

**Poisson:** feltet med forventede ankomster styrer gennemsnitsintervallet. Små forventninger vises som en positiv brøk i stedet for at blive afrundet til nul. Et ændret simulationsstop opdaterer denne afledte værdi. Loftet for nye sager og startkøen er særskilte; tilsammen må de højst være 100.000. En høj forventning kan godt ligge over det valgte loft, som begrænser antallet, motoren opretter. Ankomsteditoren giver direkte adgang til intervallet.

**Kapacitet:** plus/minus er stadig umiddelbare, enkelte ændringer. Hvis du først skriver et gyldigt antal og derefter vælger plus, anvendes indtastningen før plus-handlingen. Baseline og alternativ beholder hver deres værdier.

**Arbejdsplan:** inspectoren viser højst de første tre intervaller, så en stor kalender ikke fylder editoren med tusind felter. **Rediger arbejdsplan** åbner den eksisterende ressourceeditor med alle intervaller, sidevalg, overlapkontrol og samlet anvendelse. Den fulde model og eksport bevarer alle intervaller.

## Efterprøvet fejl

Den tidligere hurtigeditor ændrede `4` medarbejdere til `0`, når feltet blev tømt, og `8` timers horisont til `1 ms`. `reports/flowlab/inspector-empty-field-reproduction.json` dokumenterer den gamle produktionsbuild. De nye domænetests og `inspector-input-check.ts` kontrollerer kladde, validering, undo, scenarieskift, faktisk beregning, eksport og genindlæsning efter bekræftet lagring.
