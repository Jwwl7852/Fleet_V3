# VEYRO Version 1 – fælles Ressourcer og oprydning i Opsætning

Dato: 17. september 2026

Branch: `codex/veyro-integration-v1`

Udgangspunkt: `d1356cd71cc1606b49fb2e142e960bf01fe6e26a`
Ressourceimplementering: `e9d932d`
Underskriftstest-isolering: `9b77607ad75bc00413c253377ded19f323d3876d`
Navnekontrakt: `04434dd78afe069ff781290bb420c28b121a3b1b`

## Resultat

Version 1 har nu ét hovedområde, **Ressourcer**, til konkrete fælles registre og én indgang, **Opsætning → Ressourcer**, til kategorier, typer og indstillinger. Den tidligere overlappende navigation er fjernet, mens gamle URL'er fortsat viderestilles internt.

Ressourcer indeholder Enheder, Ejendomme, Medarbejdere, Units, Varekatalog, Lagerlokationer og Certifikater. FLEET og PLANNING peger på samme `koeretoejer`-register. PROCURE og WAREHOUSE peger på det fælles `forbrugsvarer`-katalog, mens WAREHOUSEs fysiske kundegods i `varer` fortsat er en separat datatype.

OBD- og GPS-hardware kan registreres internt under Opsætning → Ressourcer. Tilknytning sker i en servertransaktion, fører historik og afviser samme hardware på to ressourcer. Ingen ekstern OBD-/GPS-tjeneste er aktiveret.

## Før/efter: hele Opsætning

| Tidligere indgang | Indhold / brugere | Type | Fremtidig placering | Status |
|---|---|---|---|---|
| Generelt | Virksomhed, afdelinger og generelle valg | Indstillinger | Opsætning → Generelt | **Beholdt**, ryddet for ressource-/pris-/godkendelsesfunktioner |
| Enheder | Konkrete køretøjer, maskiner og udstyr; FLEET/PLANNING | Register | Ressourcer → Enheder | **Flyttet**; gamle links viderestilles |
| FLEET-kategorier | Kategorier til enheder | Indstillinger | Opsætning → Ressourcer → Enheder | **Samlet**; gammelt menupunkt fjernet |
| Medarbejdere | Konkrete medarbejdere; WORKFORCE/PLANNING | Register | Ressourcer → Medarbejdere | **Flyttet**; login er fortsat separat |
| Medarbejderindstillinger | Medarbejdertyper/kategorier | Indstillinger | Opsætning → Ressourcer → Medarbejdere | **Samlet** |
| Brugere & roller | Login, roller og adgang | Indstillinger/sikkerhed | Opsætning → Brugere & roller | **Beholdt særskilt** |
| Standardpriser | Fælles satser | Register/indstillinger | Opsætning → Priser → Standardpriser | **Samlet** |
| Kundepriser | Kundeafvigelser og rabatter | Register/indstillinger | Opsætning → Priser → Kundepriser | **Samlet**; gamle links viderestilles |
| Godkendelsesregler | Ekstra fakturakontrol pr. modul | Indstillinger | Opsætning → Godkendelsesregler → Fakturakontrol | **Beholdt og tydeligt adskilt** |
| PROCURE-ordregodkendelse | Beløbsgrænse/godkender for ordrer | Indstillinger | Opsætning → Godkendelsesregler → Ordregodkendelse | **Samlet**; gammel separat indgang fjernet |
| Kasseliste | Konkrete transportkasser | Register | Ressourcer → Units | **Flyttet** |
| Kassetyper | Typer/undertyper | Indstillinger | Opsætning → Ressourcer → Units | **Flyttet** |
| Reolpladser/lagerlokationer | Konkrete pladser og struktur; UNITBOOKING/WAREHOUSE | Register + indstillinger | Ressourcer → Lagerlokationer samt Opsætning → Ressourcer → Units/Warehouse | **Fordelt efter funktion** |
| Integrationer | Konfiguration af eksisterende integrationer | Indstillinger | Direkte kompatibilitetsrute | **Beholdt**, fortsat ikke dubleret i menuen |

Den tidligere betydning af Kasseliste er dermed afklaret: konkrete kasser er ressourcer; typer og lokationsstruktur er opsætning; priser hører under Priser. Der er ikke slettet kundedata, ID'er eller historik.

## Datakilder og adgang

- Enheder: tenantens `koeretoejer`; fælles for FLEET og PLANNING.
- Medarbejdere: tenantens `personale`; login/uid administreres fortsat under Brugere & roller.
- Units: `kasser`; typer i `kassetyper`; placeringer i `reolpladser`.
- Varekatalog: `forbrugsvarer`; WAREHOUSE-varer i `varer` forbliver en særskilt fysisk datatype.
- Certifikater: eksisterende kompetence-/certifikatdata.
- Ressourcekategorier: `ressourceKategorier/<gruppe>` med deaktivering i stedet for sletning.
- Hardware: `ressourceHardware/obd` og `ressourceHardware/gps`; link og historik håndhæves af `ressourcehardwaretilknyt`.

Læsning og skrivning er fortsat tenant-, abonnements-, modul- og permissionbegrænset i Rules/Functions. Menuskjulning er ikke sikkerhedsgrænsen.

## Browserbevis

Miljø: bygget root-app på `http://127.0.0.1:5197/`, normal emulator-login som syntetisk administrator. Auth `9099`, RTDB `9000`, Functions `5001`. Data er syntetiske emulatorposter; der er ingen demofallback eller ekstern forbindelse.

- `/ressourcer` viser de syv fælles registre.
- `/ressourcer/enheder` viser det fælles emulatorregister og den syntetiske enhed `QA-MU4E1ZK7`.
- Enhedsformularen viser kundekategori og den gemte OBD-enhed `REVIEW-OBD-20260917`.
- `/opsaetning` viser kun Generelt, Ressourcer, Priser, Brugere & roller og Godkendelsesregler.
- `/opsaetning/ressourcer` viser kategorier/typer uden dublering af konkrete registre.
- `/opsaetning/ressourcer/units` viser den syntetiske GPS-enhed og dens tilknytning til `REVIEW-UNIT-20260917`.
- Et forsøg på at knytte samme OBD til `NB-001` blev afvist med `ALREADY_EXISTS`. I formularen for `NB-001` vises den allerede anvendte OBD ikke som valgmulighed.
- Samme dubletprøve blev gennemført for GPS mod en anden syntetisk unit og blev afvist med `ALREADY_EXISTS`.

Se `artifacts/veyro-ressourcer-v1-2026-09-17/browser-report.json` og `screenshot-manifest.md`. Browserbillederne er optaget på Ressourcer-implementeringen før den efterfølgende ændring af én hjælpetekst fra “køretøjs-” til “enhedsregister”. Strukturen, ruterne og testdataene er uændrede; billedmanifestet markerer versionsforskellen præcist.

## Underskriftstestens seks fejl

De seks fejl kunne reproduceres på det isolerede før-ressourcegrundlag `d1356cd71cc1606b49fb2e142e960bf01fe6e26a` ved at køre samme fokustest to gange mod den samme emulatorproces. Første kørsel var 34/34 grøn; anden kørsel var 28/34 og fejlede i netop disse scenarier:

1. Første underskrift skrives én gang.
2. Ikke ét felt i underskriften kan rettes.
3. En underskrift kan ikke slettes og skrives om.
4. Den klassificerede post kan ikke slettes for at omgå låsen.
5. En underskrevet post er frosset, også i sidefelterne.
6. En underskrevet indberetning kan ikke slettes.

Årsagen var testtilstand, ikke en svækket eller defekt produktregel. Testen brugte faste ID'er i tenant `tenantInd`, men seedningen fjernede ikke tenantens data fra en varm emulator. Den allerede eksisterende, write-once underskrift gjorde derfor de forventet tilladte “første” skrivninger til reelle anden-skrivninger. Produktreglen afviste dem korrekt.

Rettelsen rydder kun testens egen tenant med sikkerhedsregler slået fra før seedning. Produktregler og negative assertions er uændrede. På rettelsen bestod samme test 34/34 ved første kørsel og 34/34 ved anden kørsel i samme emulatorproces. Betydningen er derfor:

- En faktisk første underskrift på en ren post kan fortsat skrives.
- En eksisterende underskrift kan fortsat ikke rettes, overskrives eller slettes.
- En underskrevet post/indberetning kan fortsat ikke ændres eller slettes for at omgå beviset.
- Fejlen gav et falsk negativt testsignal ved genbrug af emulatoren; den viste ikke tab af adgangskontrol i produktet.

## Teststatus

- Før-ressourcegrundlag i isoleret worktree, ren emulator: `rules.indberetninger.test.mjs` 34/34 bestået.
- Samme før-ressourcegrundlag, anden kørsel mod samme emulator: 28/34; de seks fejl ovenfor reproduceret.
- Rettet slutgrundlag, to kørsler mod samme emulatorproces: 34/34 + 34/34 bestået.
- Fokuseret Ressourcer-/navnekontrakt: 11/11 bestået.
- Root lint: bestået.
- Designkontrol: 11/11 bestået.
- Functions syntaks (`node --check functions/index.js`): bestået.
- Root produktionsbuild: bestået, 775 moduler; kendt Vite-advarsel om store chunks, ingen buildfejl.
- Whitespace-kontrol (`git diff --check`): bestået; kun Git-advarsler om linjeslutninger.
- Fuld Rules-/platformgate på `04434dd78afe069ff781290bb420c28b121a3b1b`: **4.656/4.656 bestået**, 905 suites, 0 fejl. Både Database- og Storage-emulator blev lukket normalt efter testen.

En indledende fuld kørsel med Node 20 gav 4.654/4.656, fordi PLANNING-testen bruger `Map.groupBy`, som ikke findes i den runtime. Tests blev derefter kørt med projektets normale Node 24.19.0; det gav én reel navnekontraktfejl (4.655/4.656), som blev rettet i `04434dd78afe069ff781290bb420c28b121a3b1b`. Den efterfølgende slutgate var helt grøn.

Java/Netty-loopback er undersøgt separat. Inde i den begrænsede Windows-proceskontekst fejlede JDK 11-emulatoren med `failed to create a child event loop` / `Unable to establish loopback connection` / `SocketException: Invalid argument: connect`. Den samme proceslokale JDK 11 og Firebase CLI 13.35.1 startede uden for sandboxen og gennemførte både fokusprøver og den fulde gate. Det peger på proces-/loopback-isolation i testmiljøet og ikke på Rules-koden. Ingen globale Java-, Windows- eller sikkerhedsindstillinger er ændret.

Windows-sandboxen afviste desuden test/build-procesoprettelse med `spawn EPERM`. Kontrollerne blev kørt uden for sandboxen efter eksplicit tilladelse. Hverken test eller adgangsregel er sprunget over eller svækket.

## Bevidste afgrænsninger og rester

- Rigtig OBD/GPS-integration er **udskudt efter aftale**. Kun internt register, validering, tilknytning og syntetiske emulatorprøver er leveret. Kollegaens separate OBD-testprojekt er ikke integreret.
- Der er ikke kørt migration af produktions- eller kundedata. Syntetiske poster demonstrerer kontrakten; eventuel kundemigration skal designes og prøves særskilt.
- Facility V2's ejendomsregister er fortsat den eksisterende tenantspecifikke prototype og er ikke gjort til en ny autoritativ serveradapter i denne opgave.
- PLANNINGs visuelle prototype er ikke omskrevet; dens Enheder-genvej bruger nu samme serverregister som FLEET.
- Permanent billedlagring for enheder afventer den særskilte Storage-adapter og markeres sådan i formularen.
- En ressourceformular gemmer stamdata før den særskilte atomiske hardwarefunktion. Hvis hardwarekaldet afvises, bevares formularinput og brugeren får en præcis fejl; stamdata og hardwarelink udgør ikke én fælles transaktion.

## Rettelser fra `17-9-2026, Ressourcer.docx`

Implementeret i lokalt commit `126d10b3586b6dbe93b2b6e5c31f5ad64b97568b` på `codex/veyro-integration-v1`.

- Medarbejderfunktioner er kundekategorier under Opsætning → Ressourcer → Medarbejdere. Ny/rediger medarbejder bruger en valgliste med valgte kategorier; den tidligere faste afkrydsningsliste er fjernet.
- Stationeret er koblet til en separat, kundedefineret afdelingskategori samme sted. Nye medarbejdere kræver en gyldig afdeling.
- Funktion- og afdelingsreferencer valideres mod samme tenant i Realtime Database Rules. Ældre `funktioner` og fritekststationering bevares for bagudkompatibilitet.
- PLANNING-adapteren modtager både ældre tekniske funktionskoder og de nye stabile kategori-id'er samt en stabil afdelingsreference.
- Medarbejdere er ændret til fuldbredde rækkeliste med søgning, funktions-/afdelingsfilter, sortering og nulstilling. Hele rækken åbner en centreret detaljedialog; det permanente højrepanel er fjernet.
- Ejendomme er ændret til fuldbredde rækkeliste uden permanent højrepanel. Hele rækken er klik- og tastaturåbnbar.
- Units, Lagerlokationer og Certifikater har ikke længere KPI-kortene markeret med rødt kryds. De viser kompakte filter-/sorteringslinjer og deres registre som rækker.
- Enheder har ikke længere den dobbelte hjælpetekst eller knappen “Gem visning”. AppShell skjuler den generiske ekstra overskrift på Ressourcer-ruterne, så hver side kun ejer sin egen titel.
- Den tydelige TEST-markering for syntetiske emulatorposter er bevaret.

### Aktuelt browserbevis

Integreret root-app på `http://127.0.0.1:5197/`, normal login og eksisterende isoleret emulatoropsætning. Prøven brugte den syntetiske administrator og data fra `demo-veyro-integration`; ingen skjult demofallback eller ekstern tjeneste blev aktiveret.

- `/opsaetning/ressourcer/medarbejdere`: separate registre for Funktioner og Afdelinger, begge med stabile ID'er og deaktivering frem for sletning.
- `/ressourcer/medarbejdere`: fuldbredde liste, fire filter-/sorteringskontroller, centreret Ny medarbejder-dialog, kategorivalg uden checkbokse og afdelingsvalg fra Opsætning. Den aktuelle emulator havde 0 medarbejdere og 0 kategorier, så tomtilstanden blev prøvet uden at skrive testdata.
- `/facility-v2/ejendomme`: fire eksisterende syntetiske ejendomme i fuldbreddetabel; klik på hele rækken `EJ-008` åbnede den korrekte ejendomsprofil.
- `/ressourcer`, `/ressourcer/enheder`, `/ressourcer/units`, `/ressourcer/varekatalog`, `/ressourcer/lagerlokationer` og `/ressourcer/certifikater`: ingen dokumentbredde-overløb, ingen dubletoverskrift og ingen fjernede KPI-rækker på de markerede sider.

### Aktuel teststatus for rettelsescommittet

- Root lint: bestået.
- Ressourcer-struktur: 8/8 bestået.
- PLANNING-/Workforce-adaptere og arkitekturgrænser: 15/15 bestået.
- Designkontrol: 11/11 bestået.
- Root produktionsbuild: bestået, 776 moduler; kun kendt Vite-advarsel om store chunks.
- Whitespace-kontrol: bestået; kun Git-advarsler om linjeslutninger.
- Fuld Rules-/platformgate: **ikke gennemført på dette commit**. Database-emulatoren stoppede før tests med `failed to create a child event loop` → `Unable to establish loopback connection` → `SocketException: Invalid argument: connect`. Portene 9200, 9399, 4410 og 4510 var ledige; fejlen er dermed fortsat Java/Netty-loopbackopstart og ikke dokumenteret som en fejlet sikkerhedsassertion. Den nye personnel-rules-regression er implementeret, men må genkøres, når emulatoren kan starte.

Rigtig OBD/GPS-integration er fortsat **udskudt efter aftale** og er ikke en blokering for denne visuelle Ressourcer-gennemgang.
