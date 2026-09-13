# WORKFORCE v2 — korrektionsstatus

Dato: 13. september 2026
Modulbranch: `codex/workforce-integrated-development`

## De seks visuelle korrektioner

| Punkt | Årsag | Rettelse | Regressionstest og bevis |
|---|---|---|---|
| Nattevagt | Ugecellen brugte overlap med kalenderdagen. En vagt 20.00–04.00 blev derfor vist både på start- og slutdagen, selv om ugetotalen allerede kun repræsenterede én vagt. | En vagt placeres på sin lokale startdag, og input deduplikeres på vagt-id før både rendering og summering. 20.00–04.00 med 45 minutters pause er 435 minutter = 7,25 timer og vises afrundet som 7,3 t ét sted. | `nattevagt vises på startdagen og samme vagt-id tælles kun én gang`; `en nattevagt beregnes på den gemte periode og pause`. Screenshot `screenshots-correction/01-bemanding-nattevagt-desktop.png`. |
| Offentliggjorte timer kontra kladder | Lederens sammenligning summerede alle ikke-annullerede vagter og blandede dermed kladden med den plan, medarbejderen kunne se. | `timeRegistrationSummary` beregner planlagte timer alene fra deduplikerede, offentliggjorte vagter. Kladdeminutter beregnes og vises separat. | `timeoverblik sammenligner kun med offentliggjort plan og opgør kladder separat`. Screenshot `screenshots-correction/02-timer-status-desktop.png`. |
| Planlagt pause og nettoarbejdstid | Mobilteksten kaldte vagtens planlagte pause en registreret pause og sammenblandede plan med faktisk tidsregistrering. | Vagtvisningen viser tidsrum, `Planlagt pause … min` og `Nettoarbejdstid …` som tre entydige oplysninger. Faktisk pause findes kun på tidsregistreringen. | Domænetesten `en nattevagt beregnes på den gemte periode og pause` verificerer nettoberegningen; UI-teksten og mobil-layoutet er verificeret i `screenshots-correction/05-medarbejder-plan-mobil.png`. |
| Ingen, åben og afsluttet registrering | Status blev afledt som afsluttet, når der ikke var en åben stempling, også når medarbejderen slet ingen registrering havde. | Status har tre eksplicitte værdier: `none`, `open` og `completed`. Afsluttede registreringer skjuler ikke planlagte vagter uden registrering; de vises som mangler. | `tidsstatus skelner ingen registrering, åben stempling og afsluttet registrering`. Screenshot `screenshots-correction/02-timer-status-desktop.png`. |
| Dagens bemanding | Planstatus og faktisk fremmøde blev samlet i ét mål, så kladder kunne ligne offentliggjort bemanding og plan kunne ligne fremmøde. | Dagens snapshot og KPI'er har separate mængder for offentliggjorte vagter, kladder og medarbejdere med en faktisk åben indstempling. | `dagens bemanding holder offentliggjort, kladde og faktisk indstempling adskilt`. Screenshot `screenshots-correction/04-overblik-bemanding-desktop.png`. |
| Heldags- og delvist fravær | Det halvåbne dataintervals eksklusive slut ved næste dags kl. 00.00 blev formateret som en almindelig brugerdato. | Heldagsfravær formateres med inklusive kalenderdatoer ved at vise sidste dækkede dag. Delvist fravær viser start- og sluttid. | `heldagsfravær vises med inklusive datoer, mens deltid viser klokkeslæt`. Screenshot `screenshots-correction/03-fravaer-perioder-desktop.png`. |

## Fraværsoplysninger på tværs af visninger

Årsagen til inkonsistensen var, at anmodningskortet læste `requestedType` og
`employeeNote` direkte fra ansøgningen, mens tabellen læste den særskilte,
følsomme og først ved godkendelse registrerede årsag fra `sensitiveLeave`.
Det gav Benjamin “Feriefridag” og “Familieaftale” på kortet, men “Skjult” i
tabellen, selv for en lokal preview-bruger med følsom læseret.

Den lokale repositoryprojektion er nu ensartet:

- En læser med `workforce.leave.sensitive` kan se ansøgt kategori og note.
  Tabellen kalder samtidig den endelige værdi **Registreret årsag** og viser
  **Ikke fastlagt** for en afventende ansøgning, hvor den endnu ikke findes.
- En godkender uden følsom læseret modtager periode, omfang, status,
  konflikter og id, men får hverken `requestedType`, `type`, `employeeNote`,
  `sensitiveNote` eller `sensitiveLeave` i resultatet. Kort og detalje bruger
  da de neutrale værdier “Frihedsanmodning” og “Skjult”.
- Medarbejderen kan fortsat se egen ansøgte kategori, egen kommentar og
  lederens svar. Medarbejderen får ikke den separate følsomme årsagssamling.

Regressionstesten
`fraværsårsag og medarbejdernote projiceres efter følsom læseret` kontrollerer
både en godkender uden følsom læseret og medarbejderens egen adgang.
Screenshots `screenshots-final/01-fravaer-adgang-desktop.jpg` og
`screenshots-final/02-fravaer-detalje-desktop.jpg` viser liste, kort og
detalje i den rettighedsberettigede ledervisning efter rettelsen.

Dette er en lokal UI- og repositorykontrol. IndexedDB er ikke en
sikkerhedsgrænse. Serverkontrol, feltprojektion og regler for den fælles
backend udestår og er specificeret i `INTEGRATION_HANDOFF.md`.

## Teststatus

- Modulens Node-tests: 22/22 bestået.
- WORKFORCE ESLint: bestået.
- Veyro designtoken-tests: 11/11 bestået.
- Vite-produktionsbuild: bestået.
- Root-lint kan ikke startes i det delte miljø, fordi
  `facility-v2/eslint.config.js` importerer en ikke-installeret `@eslint/js`.
  Fejlen er uden for WORKFORCE-sporets ejerskab.
- Buildet viser den eksisterende advarsel om rå dokumentationstekst i
  `src/fleet/fleet.css`; filen er ikke ændret i dette spor.

## Resterende acceptpunkter

### Lokalt modul

- De aftalte WORKFORCE-flows er implementeret og testet mod det lokale
  repository med syntetiske data.
- Browserbeviset dækker gemning i IndexedDB, men er ikke bevis for Firebase,
  Cloud Functions, claims eller reel flerbrugerkonflikt.
- Dokumentupload for kompetencecertifikater viser metadata, men fælles
  storage-upload og adgangskontrol udestår.

### Fælles integration

- Fælles autentificeret medarbejderidentitet, tenant-isolation og serverens
  feltprojektion for følsomt fravær.
- Serverkommandoer og transaktioner for vagter, fravær, reservationer og
  timerettelser, inklusive samtidige modstridende ændringer.
- Autoritativ genberegning af tilgængelighed ved ændring og annullering.
- Fastlagt og håndhævet godkendelsesomfang samt beslutning om egen
  godkendelse.
- Faktisk PLANNING-integration og det krævede forløb i to separate,
  autentificerede sessioner.
- Root-navigation, modulclaims, Firebase-regler og relevante valg i FLEET,
  WAREHOUSE, FACILITY, UNITBOOKING, PROCURE og Fakturacenter.
- Serverhåndhævelse af kompetencekrav på opgavens tidspunkt og sikker
  dokumentadgang.
