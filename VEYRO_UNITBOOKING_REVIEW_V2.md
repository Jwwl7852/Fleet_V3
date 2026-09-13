# Veyro Systems – UNIT Booking review V2

Dato: 13. september 2026
Status: Implementeret og lokalt verificeret i isoleret worktree. Ingen push,
merge, deployment eller produktionsdataændring.

## Arbejdsgrundlag

- Worktree:
  `C:\Users\DennisChristensen\.codex\visualizations\2026\09\13\01a09b3e-301f-7a41-9c28-198962368531\Fleet_V3-unitbooking`
- Branch: `codex/unitbooking-integrated-development`
- Basis-HEAD: `a0a5414214b0c212e99eff8f00182b1b61339e0e`
- Hovedcheckoutet på `codex/planning-optimization-v1` var urent med andre
  arbejdsændringer og er ikke ændret af UNIT-sporet.
- Læst grundlag: `CLAUDE.md`, `README.md`, `ARKITEKTUR.md`,
  `docs/VEYRO_MODULUDVIKLINGSSPOR_V1.md` og
  `VEYRO_UNITBOOKING_STATUS_V1.md` fra status-worktree.

## Leveret

### Bookingassistent

- Ny tydelig handling og route: **Importér booking**.
- Drag-and-drop, normal filvælger og indsat mailtekst.
- Tilladte filer: `.eml`, `.msg`, PDF, `.xlsx`, `.csv`, PNG og JPEG, højst
  25 MB. Filnavn/type, størrelse, hash og kendt filsignatur valideres.
- Serverlagrede, brugerbundne importudkast med bevaret originalmateriale,
  kildehenvisninger, dubletadvarsel og idempotente operationer.
- Lokal deterministisk aflæsning af tekst, `.eml` og `.csv`. Ekstern extractor-
  grænseflade for `.msg`, PDF, `.xlsx` og billeder.
- Redigerbar side-om-side-gennemgang med særskilte objektlinjer. Mangler,
  tvetydige datoer, ukendt enhed og modstrid fremhæves.
- Fire trin: Import → Gennemgang → Forslag → Bekræftelse. Udkastet skaber ingen
  reservation. Endelig bekræftelse genkontrollerer match og konflikt på serveren.
- Dokumenttekst behandles kun som data. En indlejret instruks er vist inert i
  browser-QA.

### Mål, orientering og match

- Historiske/udvendige mål og brugbare indvendige mål er separate felter.
- Eksisterende mål omfortolkes ikke. Ukendt semantik og manglende indvendige mål
  kan ikke give et bekræftet størrelsesmatch.
- Polstring angives pr. side for længde, bredde og højde. 100 × 60 × 80 cm med
  5 cm pr. side vises og testes som 110 × 70 × 90 cm.
- Standardorientering bevarer højden; længde/bredde kan byttes. Andre akser
  kræver et udtrykkeligt valg, og “må ikke vendes” begrænser dem igen.
- Match er deterministisk: plads, orientering, type/undertype, driftstilstand,
  hele den inklusive periode og eksisterende bookinger. Gyldige enheder sorteres
  efter mindst overskydende indvendig volumen.
- Intet match forklares pr. afvisningsgrund; alternativer vælges ikke automatisk.

### Fælles enheder, QR og fysisk flow

- Samme `kasser/<unitId>`, rå QR-kode, `reolpladser` og `pladsId` bruges i UNIT
  og Warehouse. Der er ikke oprettet et ekstra register eller QR-format.
- UNIT har direkte adgang til det fælles enhedsregister samt ny mobil scanner
  med kamera, tastaturscanner og manuel fallback.
- Returnering kræver valgt modtagelseslokation. Bookingen afsluttes og faktisk
  placering samt append-only bevægelse skrives samlet.
- Senere placering er en ny scan/flytning; hjemplacering er kun et valgfrit
  forslag og flytter aldrig enheden.
- Reservation og klargøring flytter ikke enheden. Faktisk udlevering fjerner
  `pladsId`, men bevarer id og historik.
- Gentagelser sammenlignes på `operationId` og payload. Samme handling
  genafspilles uden ny bevægelse; ændret payload afvises.
- Eksisterende `pladsId` kan ikke længere ændres direkte fra klienten. Stamdata
  samt egnethed `ledig`/`udeAfDrift` kan fortsat rettes.
- UNIT-only, Warehouse-only og begge moduler er dækket af fælles læse-/skrive-
  gates uden at give Warehouse adgang til UNIT-bookinger.

Den normative aftale står i `docs/VEYRO_UNIT_WAREHOUSE_CONTRACT_V1.md`, og den
additive vej i `docs/VEYRO_UNITBOOKING_MIGRATION_V2.md`. Warehouse-sporets
afstemte rettelsescommit er
`37bba72ec73e33369479b236454a1a1e913a208c`. Samlingssporet skal bevare én
implementation af de delte callables og løse overlap i fælles filer.

### Daglig betjening og mobil

- Kompakte KPI-kort og en synlig “Dagens arbejde”-flade med klargøringer,
  udleveringer, returer og forsinkelser.
- Kortere brugerrettet hjælpetekst; tekniske detaljer er flyttet til kode og
  dokumentation.
- Mobilvisning ved 390 × 844 er kontrolleret uden vandret side-overflow.
  Kalenderens brede gitter og mobilnavigation bevarer kontrolleret intern rulning.
- Browser-QA fandt og førte til rettelser af både kalenderkontrollernes overflow,
  scannerdetaljens for smalle værdikolonne og en race mellem lokal og
  serverbaseret importaflæsning.

## Server- og dataintegritet

- `kasseudlaanskriv`, importbekræftelse og `unitlagerhandling` bruger en
  transaktion på hele `tenants/<tenantId>` for at holde booking, unit og historik
  atomisk. Callbacken tåler null ved første lokale cacheforsøg og alle
  forudsætninger evalueres igen ved retry.
- Fordelen er en enkel tværnode-garanti. Ulempen er, at enhver samtidig skrivning
  under samme tenant kan udløse retry, og hele tenant-roden læses/skrives i
  transaktionen. Før arkitekturen ændres skal samlingssporet måle tenantstørrelse,
  callbackforsøg, varighed og abort-rate. En smallere grænse kræver en fælles
  låse-/kommandomodel og ændres ikke ensidigt her.
- Originalmateriale og importindeks kan ikke skrives direkte af klienten.
- Endelig reservation kører samme almindelige bookingvalidering og den
  inklusive konfliktregel på serveren.

## Verifikation

### Automatiske tests

| Kontrol | Resultat |
|---|---:|
| UNIT-domæne | 177/177 bestået |
| Import, parsing og match | 14/14 bestået |
| Realtime Database Rules, bevaret + V2 | 29/29 bestået |
| Auth + Functions + Database + Storage runtime-QA | Bestået |
| Vite produktionsbuild | Bestået |
| Afgrænset ESLint på ændrede filer | Bestået |
| `node --check` på Functions og QA-scripts | Bestået |

Runtime-QA dokumenterer:

- UNIT-only, Warehouse-only og begge moduler;
- forkert tenant og manglende permission;
- tekstimport, gemt udkast uden reservation og serverbekræftet booking;
- rigtig `.eml`-upload via Storage-emulator med hash/signaturkontrol og bevaret
  original;
- dubletadvarsel og idempotent genbekræftelse;
- to samtidige reservationer af samme enhed: præcis én commit og én afvisning;
- idempotent retur til modtagelse og senere flytning;
- samme QR-id og fælles placering/historik.

Maskinlæsbar evidens:

- `artifacts/unitbooking-v2/runtime/UNITBOOKING_AUTH_FUNCTIONS_QA.json`
- `artifacts/unitbooking-v2/screenshots/UNITBOOKING_BROWSER_QA.json`

### Browserforløb

Browser-QA kørte mod lokal Vite samt Auth, Functions, Realtime Database og
Storage-emulatorer med syntetiske tenants og brugere. Alle 15 full-page captures
bestod kontrol for side-overflow og handlinger uden for viewport, bortset fra
de tilsigtede interne scrollområder.

| Fil | Dokumenterer |
|---|---|
| `01-desktop-kalender-og-dagens-arbejde.png` | Kalender, kompakte KPI'er og dagens arbejde |
| `02-desktop-faelles-enhedsregister.png` | Direkte adgang til fælles register og separate mål |
| `03-desktop-scanning-retur-foer.png` | Scannet enhed og valgt returplacering |
| `04-desktop-retur-paa-modtagelse.png` | Retur afsluttet på modtagelse |
| `05-desktop-efterfoelgende-flytning.png` | Senere flytning og historik |
| `06-desktop-importer-booking.png` | Drag/drop, upload og tekstalternativ |
| `07-desktop-gennemgang-original-og-felter.png` | Original, kilder, rettelser og 110 × 70 × 90 cm |
| `08-desktop-korrekt-match.png` | Korrekt, sorteret match med orientering/restplads/lokation |
| `09-desktop-bekraeftelse-foer-reservation.png` | Intet er reserveret før medarbejderens bekræftelse |
| `10-desktop-reservation-gemt.png` | Serverbekræftet reservation |
| `11-desktop-uklare-oplysninger.png` | Tvetydige datoer/mål og inert dokumentinstruks |
| `12-desktop-intet-match-med-forklaring.png` | Ingen egnet enhed og konkrete grunde |
| `13-mobile-kalender-listevisning.png` | Mobil kalender og daglig liste |
| `14-mobile-scanning-og-flytning.png` | Mobil opslag, QR, flytning og historik |
| `15-mobile-import.png` | Mobil import |

Alle ligger i `artifacts/unitbooking-v2/screenshots/`.

## Ikke markeret som færdigt

- Automatisk OCR/AI for `.msg`, PDF, `.xlsx` og billeder kræver
  `UNITBOOKING_EXTRACTION_URL` samt secret `UNITBOOKING_EXTRACTION_API_KEY`.
  Tilslutningspunktet er implementeret, men ingen tjeneste er konfigureret i
  testmiljøet. UI viser ærligt “ikke tilsluttet”, og manuel gennemgang virker.
- Den lokale parser aflæser tekst, `.eml` og `.csv`; kun `.eml`-filupload er
  kørt end-to-end. De øvrige filtyper er allowlist-/størrelsestestet, men deres
  eksterne ekstraktion er ikke erklæret verificeret.
- Direkte træk fra Outlook kan kun fungere, hvis browseren leverer en fil.
  Headlessmiljøet kan ikke simulere Outlooks native drag-payload. Gemt `.eml`
  og indsat tekst er verificerede alternativer.
- Kamera og fysisk håndscanner er ikke hardwareverificeret. Kamera-API,
  tastaturfelt og manuel indtastning er implementeret; manuel/scannet id-flow er
  verificeret i browseren.
- Fuld repository-`npm run lint` kan ikke starte i den delte baseline, fordi
  den linkede dependencyinstallation mangler `facility-v2`-afhængigheden
  `@eslint/js`. Afgrænset lint af alle ændrede UNIT-/Functions-/testfiler består.
- Ingen test er kørt mod produktionsdata eller rigtige eksterne tjenester.

## Reproduktion

Start emulatorerne med `firebase.unitbooking-test.json`, seed med
`scripts/unitbooking-auth-emulator-seed.mjs`, og kør:

```powershell
node scripts/unitbooking-auth-functions-qa.mjs artifacts/unitbooking-v2/runtime
node scripts/unitbooking-auth-browser-qa.mjs artifacts/unitbooking-v2/screenshots
```

Regeltests bruger `firebase.unitbooking-rules-test.json` på port 9001. De
syntetiske ids, tenants og brugere ligger i seed-scriptet; alle QA-scripts
afviser ikke-lokale hosts.

## Afleveringsfiler

- `VEYRO_UNITBOOKING_REVIEW_V2.md`
- `docs/VEYRO_UNIT_WAREHOUSE_CONTRACT_V1.md`
- `docs/VEYRO_UNITBOOKING_MIGRATION_V2.md`
- `artifacts/unitbooking-v2/screenshots/`
- `artifacts/unitbooking-v2/runtime/UNITBOOKING_AUTH_FUNCTIONS_QA.json`
- `artifacts/unitbooking-v2/VEYRO_UNITBOOKING_REVIEW_V2.zip`

ZIP-filen er dannet efter den endelige testkontrol og indeholder rapport,
grænsefladeaftale, migrationsvejledning, runtime-evidens og alle 15 screenshots.
