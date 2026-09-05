# Planning Basic etape 3 – dashboard og livekalender

## Formål og afgrænsning

Etape 3 er en isoleret, klikbar React-prototype for disponenten. Den åbnes som en separat Vite-side og er ikke føjet til Veyros fælles navigation. Den opretter ingen persistence eller alternativ skrivevej og ændrer ingen Booking-, Fleet-, Workforce-, Facility- eller sikkerhedsfunktion.

Prototypen indeholder fire lokale visninger:

1. **Dagens overblik** med nøgletal, handlingskø, rutetabel, filtre og et skematisk ruteområde.
2. **Livekalender** med samme dagsdata grupperet efter rute, medarbejder eller køretøj samt en skærmfyldende modaltilstand.
3. **Faste ruter** med lokal redigering af stop, rækkefølge, varighed og standardtildelinger.
4. **Mobilvisning** med deterministisk registrering af ankomst, afgang og offline synkronisering.

## Start og lokal URL

Repositoryets eksisterende dependencies skal allerede være installeret. Start udviklingsserveren fra repositoryets rod:

```text
npm run dev -- --host 127.0.0.1
```

Åbn derefter:

```text
http://127.0.0.1:5173/planning-demo.html
```

Hvis Vite vælger en anden ledig port, anvendes den port, som terminalen viser. `planning-demo.html` er en separat Vite-entry til lokal udvikling og kræver ingen ændring af `src/App.jsx`, navigation eller Vite-konfiguration. Prototypen indlæser kun `planning-demo.css`; den importerer ikke det fælles `fleet.css`.

## Syntetiske data

UI-fixturen indeholder 8 ruter, 6 medarbejdere, 7 køretøjer, 40 planlagte stop og 1 ikke-tildelt opgave. Alle navne er markeret med “Demo” eller “Fiktiv”, registreringsnumrene starter med `DEMO`, og adresserne bruger `Testvej`, `Prøveallé`, postnummer `0000` og byen `Demoby`.

Dato, klokkeslæt, mobilpositioner og OBD-positioner er deterministiske. Koordinaterne er ikke geokodede, vejberegnede eller hentet fra en enhed. Genindlæsning af siden gendanner altid de oprindelige fixtures.

## Genbrug af etape 1–2

Den lokale UI-model importerer den offentlige facade `planning-basic-v2.js`. Den bruger blandt andet:

- Typed references for medarbejdere og køretøjer.
- `beregnFremdrift` til at holde mobilstatus, fysisk OBD-position og forventet fremdrift adskilt.
- Ruteskabelonoperationerne til tilføjelse, deaktivering, fjernelse, flytning og ændring af stopvarighed.
- `opretDagsruteFraSkabelon`, `koeretidssegmenterForRute` og `beregnRutetid` til skabelonens tidsresume.
- `validerSkabelonTildeling` til kompetence-, certifikat-, fraværs-, arbejdstids-, køretøjs- og udstyrskrav.
- `validerLoesningsforslag` før et lokalt forslag kan godkendes.

Kalenderens visningsgruppering, dashboardfiltre og lokale formularstate er UI-adfærd fra etape 3. De ændrer ikke domænekontrakterne.

## Fremdrift og datakvalitet

Mobilhændelser dokumenterer medarbejderens registrerede arbejdshandling. OBD-observationer dokumenterer køretøjets fysiske observation. Begge spor vises og bevares separat.

- **Live OBD** kræver en eksplicit frisk observation.
- **OBD ikke opdateret** viser observationen historisk og kalder den ikke live.
- **Estimeret efter mobilstatus** forskyder forventningen efter seneste bekræftede mobilevent og viser ingen kunstig GPS-position mellem hændelser.
- En rute uden OBD fungerer fortsat som almindelig planlægning og er ikke en fejltilstand.

Uoverensstemmelser mærkes som “Mobilstatus og OBD afviger”. Mærket beskriver en datakonflikt og er ikke automatisk bevis på en fejl fra medarbejderen.

## Afvigelser og forslag

Demokunden kan vælge fælles advarsels- og kritikgrænser eller separate grænser for Service, Hjemmepleje, Transport og Renovation. Indstillingerne ændrer straks lokal fremhævning, men gemmes ikke.

Løsningspanelet indeholder to håndskrevne, deterministiske fixtures. De er ikke output fra en solver, en heuristik eller automatisk optimering. Disponenten kan redigere målrute, forventet tidsændring og begrundelse. Et forslag anvendes først efter eksplicit lokal godkendelse. Et forslag med et `HARD`-regelbrud kan ikke godkendes; panelet viser i stedet et gyldigt alternativ.

## Skematisk kort

Dashboardets ruteområde er en abstrakt SVG-tegning med syntetiske punkter. Linjerne følger ingen veje, og visningen bruger ingen kortleverandør, geokodning, afstandsmatrix, map matching eller vejbaseret rejsetid.

## Faste ruter

Skabelonredigering arbejder på en dyb lokal kopi. Stop kan tilføjes, deaktiveres, fjernes, flyttes og få ændret varighed. Medarbejder og køretøj kan hver især sættes til `INGEN`, `FORETRUKKET` eller `FAST`. Den eksisterende domænevalidering vises fortsat, så en fast tildeling aldrig omgår hårde ressourcekrav.

Tidsresumeet viser samlet kørsel, service, pause, ventetid, rutetid og forventet sluttid. Køretidsværdierne er eksplicitte syntetiske provider-input. Manglende køretid eller stopvarighed markeres som ufuldstændig; UI’et gætter ikke.

## Ikke etableret i denne etape

- Fælles navigation, produktionstilstand eller rettigheder.
- Firebase, Database Rules, Cloud Functions, audittransport eller persistence.
- Rigtig mobilapp, browserlokation, GPS-tilladelse eller baggrundssporing.
- OBD-leverandør eller telematikforbindelse.
- Kort, geokodning, vejnet, afstands- eller køretidsmatrix.
- Solver, heuristik, optimering eller automatisk omplanlægning.
- Serverautoriseret godkendelse, idempotens og atomisk frigivelse.

## Reproducerbar lokal regressionstest

Det konservative etape 3-udsnit er den samlede Planning v1–v3-suite, begge importgrænsekontroller og unionen af de to historiske regressionsudsnit fra implementerings- og checkpointkontrollen. Derudover medtages de eksisterende Planning-oprydnings-, Planning/Fleet-grænse- og opgavestatusprøver. Kommandoen bruger ingen Firebase-emulator og kontakter ingen ekstern tjeneste:

```text
node --test --test-isolation=none test/planning-basic.test.mjs test/planning-basic-adapters.test.mjs test/planning-basic-v2.test.mjs test/planning-ui/planning-ui.test.mjs test/booking.test.mjs test/bookingopret.test.mjs test/disponering.test.mjs test/driftskalender.test.mjs test/etapeskift.test.mjs test/etapeskifte.test.mjs test/flaade.test.mjs test/flaade-bemanding.test.mjs test/forslag.test.mjs test/forslagform.test.mjs test/fravaer.test.mjs test/gitter.test.mjs test/gitter-uge.test.mjs test/godkendelse.test.mjs test/opgaveplan.test.mjs test/opgaver.test.mjs test/rutedeling.test.mjs test/statusmelding.test.mjs test/steder.test.mjs test/stop.test.mjs test/behov.test.mjs test/indeslutning.test.mjs test/referencetjek.test.mjs test/unitbooking.test.mjs test/hf1-planning-oprydning.test.mjs test/skive3a-planning-fleet.test.mjs test/opgavestatus.test.mjs
```

Den fulde filliste er:

- `test/planning-basic.test.mjs`
- `test/planning-basic-adapters.test.mjs`
- `test/planning-basic-v2.test.mjs`
- `test/planning-ui/planning-ui.test.mjs`
- `test/booking.test.mjs`
- `test/bookingopret.test.mjs`
- `test/disponering.test.mjs`
- `test/driftskalender.test.mjs`
- `test/etapeskift.test.mjs`
- `test/etapeskifte.test.mjs`
- `test/flaade.test.mjs`
- `test/flaade-bemanding.test.mjs`
- `test/forslag.test.mjs`
- `test/forslagform.test.mjs`
- `test/fravaer.test.mjs`
- `test/gitter.test.mjs`
- `test/gitter-uge.test.mjs`
- `test/godkendelse.test.mjs`
- `test/opgaveplan.test.mjs`
- `test/opgaver.test.mjs`
- `test/rutedeling.test.mjs`
- `test/statusmelding.test.mjs`
- `test/steder.test.mjs`
- `test/stop.test.mjs`
- `test/behov.test.mjs`
- `test/indeslutning.test.mjs`
- `test/referencetjek.test.mjs`
- `test/unitbooking.test.mjs`
- `test/hf1-planning-oprydning.test.mjs`
- `test/skive3a-planning-fleet.test.mjs`
- `test/opgavestatus.test.mjs`

De tidligere tal `677/677` og `578/578` kom fra forskellige filudvalg, ikke fra et testfilter eller ændrede testcases. Den første kørsel havde 19 filer. Checkpointkørslen udelod utilsigtet `driftskalender.test.mjs` (26 tests) og `unitbooking.test.mjs` (174 tests), men tilføjede `forslagform.test.mjs` (8), `statusmelding.test.mjs` (51), `behov.test.mjs` (15), `indeslutning.test.mjs` (19) og `referencetjek.test.mjs` (8). Regnestykket er derfor `677 - 200 + 101 = 578`. Det reproducerbare udvalg ovenfor bevarer begge historiske udvalgs union, så ingen af de relevante filer igen falder ud ved en ændret håndskrevet kommando.

## Kendte begrænsninger

- Tilstanden lever kun i den aktuelle browserhukommelse og nulstilles ved genindlæsning.
- Kalenderen viser én syntetisk dag og er ikke virtualiseret til produktionsvolumen.
- Det skematiske kort viser ikke geografisk nøjagtighed.
- Mobil- og OBD-friskhedsgrænser er faste demoværdier.
- Godkendelse er en lokal kontraktdemonstration og ikke en autoriseret serverskrivning.
- Den separate HTML-side indgår ikke automatisk som produktions-entry i repositoryets nuværende Vite-build; den er bevidst kun en lokal udviklingsside i denne etape.
- Importgrænsetestene klassificerer `planning-ui/` som et selvstændigt Planning-lag: UI'et må bruge React og den offentlige Planning-facade, mens `fleet.css`, Firebase, permissions, `booking-state`, skjulte skriveveje og importcyklusser fortsat afvises.
