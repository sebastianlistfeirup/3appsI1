# Samlet lokal backup i Studio One

Under **Indstillinger → En kopi af hele din produktion** kan man vælge projekter og hente dem i én ZIP. Bestillinger, opgaver, filversioner, låste leveringer, reviews, afleveringskladder, reviewkladder og arkiveret status følger med. Oversigten viser filindholdets størrelse, ikke browserens diskforbrug eller ledige lagerkvote.

**Åbn backupfil** kontrollerer hele filen, før man vælger de projekter, der skal indlæses. Et eksisterende projekt overskrives aldrig: samme projektidentitet bliver til en selvstændig kopi med en importhændelse, mens oprindelige filversioner og leverancer bevares. Arkiverede projekter forbliver arkiverede. Modtagerens workspace-navn og eksisterende projekter ændres ikke. Der er plads til 100 lokale projekter; en indlæsning, der overskrider grænsen, afvises samlet.

En kopi hentes fra den aktuelle session og er også tilgængelig, når IndexedDB ikke kan gemme. Ved en fejlet indlæsning i browserlagringen viser appen tydeligt, at projekterne kun er åbne i sessionen. Handlingen kan ikke gentages og skabe dubletter med endnu et klik. Hent en ny backup, før siden lukkes eller den sidst gemte version genindlæses.

## Format og grænser

`workspace.json` indeholder formatet `studio-workspace`, version 1, tidspunkt, workspace-metadata og en oversigt med projekt-id, navn, revision, filstørrelse og SHA-256. Hvert projekt ligger i en selvstændig `projects/001.zip` osv. Disse er de eksisterende [Studio-projektpakker](studio-project-packages.md) og kan også importeres separat. Filnavne udledes af et løbenummer, ikke af brugerens projektnavn.

En samlet backup kan indeholde højst 100 projekter, 96 MB filversioner og 8 MB projektmetadata. Inputfilen må højst fylde 128 MB; den ydre ZIP og indholdet af alle indre ZIP-filer må hver højst udvide sig til 120 MB. Manifestet er begrænset til 100 KB. De enkelte projektpakkers strengere grænser gælder også. Vælg færre projekter, hvis en samlet pakke bliver for stor. Eksisterende arbejde bliver ikke slettet eller beskåret for at få det til at passe.

Kontrolsummer, faktiske bytes, provenance og versionsreferencer kontrolleres i en separat browser-worker. Ukendte ydre filstier, dubletter og overskydende filer afvises. Indre ZIP-størrelser kontrolleres før dekomprimering, så en komprimeringsbombe ikke får lov at omgå totalgrænsen. Kontrolsummer opdager ændringer; de er ikke en digital signatur eller en uafhængig verificering af ophav.

Operationen kan afbrydes, har en frist på to minutter og lukker sin worker ved afslutning, fejl, afbrydelse og navigation. Overførslen til workeren er også begrænset, og projekter uden for valget bliver ikke kopieret til den. Projekter vises otte ad gangen med søgning; eksporten omfatter alle valgte projekter på tværs af sider.

Dette er en lokal, manuelt hentet kopi. Der er ingen automatisk cloudbackup, og appen kan ikke kontrollere, hvor downloadfilen opbevares. Funktionen sletter ikke projekter eller filer.
