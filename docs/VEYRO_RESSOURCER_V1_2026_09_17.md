# VEYRO Version 1 – fælles Ressourcer og oprydning i Opsætning

Dato: 17. september 2026

Branch: `codex/veyro-integration-v1`

Udgangspunkt: `d1356cd71cc1606b49fb2e142e960bf01fe6e26a`
Implementeringscommit: `e9d932d`

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

Se `artifacts/veyro-ressourcer-v1-2026-09-17/browser-report.json` og `screenshot-manifest.md`.

## Teststatus

- Fokuseret navigation-, adgang-, godkendelses-, Warehouse- og Ressourcer-suite: 197/197 bestået.
- Ressourcer-fokustest alene indgår i ovenstående og kontrollerer navigation, redirects, datakilder, Rules, indeks og transaktions-warm-start.
- Root lint: bestået.
- Designkontrol: 11/11 bestået.
- Functions syntaks: bestået.
- Delte filer: `npm run delt:kopier` er kørt; paritet indgår i den fulde platformgate.
- Root produktionsbuild: bestået; kendt Vite-advarsel om store chunks, ingen buildfejl.
- Fuld Rules-/platformgate: **ikke grøn på slutgrundlaget**. Standardstarten fejlede to gange før tests med Java/Netty `Unable to establish loopback connection`. En afgrænset genkørsel mod den allerede kørende lokale RTDB-emulator og en separat Storage-emulator gennemførte alle 4.656 tests, men endte 4.650 bestået / 6 fejlet. De seks fejl ligger alle i `rules.indberetninger.test.mjs` ved den forventet tilladte første skrivning af en underskrift; de vedrører ikke de nye Ressourcer-noder. Den senest grønne 4.656/4.656-gate er derfor kun historisk og er ikke brugt som slutbevis.

Windows-sandboxen afviste første test/build-procesoprettelse med `spawn EPERM`. Samme kontroller blev kørt uden for sandboxen efter eksplicit tilladelse og bestod. Det er holdt adskilt fra produkt-, emulator- og sikkerhedstestresultater.

Java-opstartsfejlen og de seks Rules-fejl er ligeledes registreret som to forskellige forhold: den første forhindrede standardemulatoren i at starte; den anden opstod efter at hele suiten faktisk kørte mod proceslokale emulatorer. Ingen test er sprunget over eller svækket.

## Bevidste afgrænsninger og rester

- Rigtig OBD/GPS-integration er **udskudt efter aftale**. Kun internt register, validering, tilknytning og syntetiske emulatorprøver er leveret. Kollegaens separate OBD-testprojekt er ikke integreret.
- Der er ikke kørt migration af produktions- eller kundedata. Syntetiske poster demonstrerer kontrakten; eventuel kundemigration skal designes og prøves særskilt.
- Facility V2's ejendomsregister er fortsat den eksisterende tenantspecifikke prototype og er ikke gjort til en ny autoritativ serveradapter i denne opgave.
- PLANNINGs visuelle prototype er ikke omskrevet; dens Enheder-genvej bruger nu samme serverregister som FLEET.
- Permanent billedlagring for enheder afventer den særskilte Storage-adapter og markeres sådan i formularen.
- En ressourceformular gemmer stamdata før den særskilte atomiske hardwarefunktion. Hvis hardwarekaldet afvises, bevares formularinput og brugeren får en præcis fejl; stamdata og hardwarelink udgør ikke én fælles transaktion.
