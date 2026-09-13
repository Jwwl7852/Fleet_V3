# Veyro Systems – UNIT Booking review V2

Dato: 13. september 2026
Status: Målrettet rettelsesrunde implementeret og lokalt verificeret i isoleret
worktree. Ingen push, merge, deployment eller produktionsdataændring.

## Arbejdsgrundlag

- Worktree:
  `C:\Users\DennisChristensen\.codex\visualizations\2026\09\13\01a09b3e-301f-7a41-9c28-198962368531\Fleet_V3-unitbooking`
- Branch: `codex/unitbooking-integrated-development`
- Kontrolleret start-HEAD:
  `81c0fb09a4d8e9217028bd7604149607a3d47b0d`
- Læst: `CLAUDE.md`, `README.md`, `ARKITEKTUR.md`,
  `docs/VEYRO_MODULUDVIKLINGSSPOR_V1.md`, denne reviewrapport,
  `docs/VEYRO_UNIT_WAREHOUSE_CONTRACT_V1.md` og
  `docs/VEYRO_UNITBOOKING_MIGRATION_V2.md`.
- Warehouse er fortsat navnet på modulet. Reference for den afstemte
  Warehouse-leverance:
  `37bba72ec73e33369479b236454a1a1e913a208c`.
- Den eksisterende ikke-versionerede, udpakkede mappe
  `artifacts/unitbooking-v2/VEYRO_UNITBOOKING_REVIEW_V2/` er bevaret urørt.

## Rettelser

### Entydig reservationskvittering

Efter succes erstattes hele bekræftelsesfladen af én kvittering med kunde,
reference, dansk periode, objekt, valgte enheder og booking-id'er. Den gamle
“Der er endnu ikke oprettet en reservation”-advarsel og bekræftelsesknappen
findes ikke længere efter succes. Der er direkte handlinger til booking og
kalender. Samme operation-id genbruges ved retry, og backend-testen viser én
reservation ved gentagelse.

### AL-102 og de tre statusbegreber

Årsagen var inkonsistente syntetiske seed-data: bookingen `dag-ud` var
`klargjort`, mens AL-102 var seedet som `ledig`. Seedet sætter nu begge dele
konsistent. UI benævner bookingens fase **Bookingstatus**, enhedens egnethed/
drift **Enhedstilstand** og lagerfeltet **Aktuel placering**.

Browser-QA verificerede AL-102 som klargjort i kalender, register og
bookingdetalje, derefter udleveret via udlånslisten, returneret via scanner til
modtagelse og vist ledig på den faktiske modtagelsesplacering i registeret.

### Kompakt kalender og mobil

- Dagens arbejde står før statistik og har direkte opgavelinks.
- Donutdiagrammet er fjernet; fem lave nøgletalskort frigør lodret plads.
- Kalenderfunktioner, filtre, kontrolleret intern gitterrulning og liste er
  bevaret.
- Kommende klargøringer og udlån skifter til mobilkort med alle oplysninger og
  handlinger.
- 390×844 og 360×800 er kontrolleret med fulde sidescreenshots, hele feltnavne,
  ombrudte lokationer, synlige handlinger og navnet på aktivt importtrin.
- Importens gennemgang, match, intet match og kvittering er kontrolleret på
  mobil; der skjules ikke side-overflow for at bestå kontrollen.

### Gennemgang og intet match

Originalmaterialet vises sammen med redigerbare oplysninger. Detaljerede
kildehenvisninger er sammenfoldelige, og uafklarede mål beskrives som aflæste
værdier, hvis måleenhed/akse skal bekræftes — ikke som helt manglende.
Objektmål, type, polstring og orientering er samlet pr. objektlinje.

“Intet match” viser en kort kategorisammenfatning og en udfoldelig liste pr.
enhed med konkrete krav, der ikke opfyldes. Bookingkonflikt viser reference og
periode, når brugeren kan se den. For lille, optaget, ude af drift og ukendte
indvendige mål adskilles. Alternativer vælges aldrig automatisk.

### Lokal dokumentudtrækning

Functions har nu lokal, reel udtrækning for:

- `.eml`: mailtekst og relevante understøttede vedhæftninger;
- `.msg`: mailtekst og relevante understøttede vedhæftninger;
- tekst-PDF: tekst med sidenumre;
- `.xlsx`: relevante ark, tabeller og cellereferencer;
- `.csv`: rækker/celler, danske separatorer og fuldt browseruploadforløb.

Den deterministiske fortolkning udfylder kun entydige, kendte felter. Original,
hash, udtræk og kilder bevares, og medarbejderen skal gennemgå før reservation.
Formatstøtten vises før upload. Scannede PDF'er og billeder kræver fortsat den
aftalte eksterne OCR/AI-extractor; ingen tjeneste eller betaling er oprettet.
Se `docs/VEYRO_UNITBOOKING_IMPORT_FORMATMATRIX_V2.md`.

### Tekst og fælles shell

Kundeskærme viser ikke længere “atomisk”, “servervalideret reservation”, interne
serverkontroller eller miljøvariabel-/README-anvisninger. Testbanneret er
bevaret. Datoer i de ændrede skærme vises dansk.

Den eneste fælles AppShell-nære ændring er tekst i
`src/fleet/Brugervaelger.jsx`; adgangslogik, claims og navigation er uændret.

## Warehouse-afstemning

UNIT genbruger `kasser/{unitId}`, rå QR-id, `reolpladser`, `pladsId` og fælles
bevægelseshistorik. Der er ikke oprettet en alternativ identitet eller
placeringsmodel. UNIT-adapteren sender `forventetPladsId` ved bevægelse, i tråd
med Warehouse-sporets optimistic-concurrency-aftale. Den fælles
transaktionsarkitektur er ikke ændret ensidigt.

Den konkrete syvtrins integrationstest, fil-/domæneejerskab og et reproducerbart
belastningsscenarie for tenant-rodstransaktioner står i
`docs/VEYRO_UNITBOOKING_SAMLINGSHANDOFF_V2.md`.

## Verifikation

### Automatiske domænetests

Kommando:

```powershell
node --test test/unitbooking-import.test.mjs test/unitbooking-document-extraction.test.mjs
```

Resultat: **22 bestået, 0 fejlet**. Dækker blandt andet decimalkomma,
cm-normalisering, flere objektlinjer, uafklarede mål, indvendige mål,
polstring, orientering, inklusive datokonflikt, kandidatgrunde, EML/MSG/PDF/
XLSX/CSV og inert dokumenttekst.

### Auth/Functions/Database/Storage

Det isolerede runtimeforløb bestod:

- UNIT-only, Warehouse-only, begge moduler, tenantadskillelse og rettigheder;
- fem dokumentformater gennem uploadstart, lokal Storage, uploadslut og lagret
  udkast;
- originalmateriale, dubletadvarsel og idempotent bekræftelsesretry;
- to samtidige reservationer af samme enhed: 2 forsøg, 1 commit, 1 afvisning;
- klargjort → udlånt → returneret, modtagelsesplacering, senere flytning og
  genforsøg uden dobbeltbevægelse.

Evidens:
`artifacts/unitbooking-v2-fix/runtime/UNITBOOKING_AUTH_FUNCTIONS_QA.json`.

### Browser-QA

Browseren kørte mod lokal Vite og isolerede Auth, Functions, Realtime Database
og Storage-emulatorer — ikke demo-datasættet. Indhold og handlinger blev
assertet, ikke kun billedbredde. Resultat: **24 full-page screenshots**, alle
med `horizontalOverflow: false`; statusforløb, retur/flytning, CSV-upload,
reservation, inert dokumentinstruks og mobile importtrin er `true`.

Evidens:
`artifacts/unitbooking-v2-fix/screenshots/UNITBOOKING_BROWSER_QA.json`.

### Build og lint

- `npm run build`: bestået, 505 moduler. Kun repositoryets kendte
  chunk-størrelsesadvarsel.
- Afgrænset ESLint på alle ændrede klient-, Functions-, QA- og testfiler:
  0 fejl. Den genererede kopi under `functions/delt/` er ignoreret af
  lintkonfigurationen; kildefilen er lintet.
- Fuld `npm test` stopper i eksisterende baseline før testene, fordi
  `facility-v2/eslint.config.js` ikke kan importere `@eslint/js` fra den delte
  dependencyinstallation. Det er ikke ændret i UNIT-sporet.
- `npm audit --omit=dev` for Functions rapporterer 12 moderate fund i
  transitive `qs`/`uuid`-afhængigheder (bl.a. Firebase Admin og ExcelJS).
  Auto-fix med force ville opgradere Firebase Admin over en breaking major og
  er derfor ikke udført i denne afgrænsede rettelsesrunde.

## Screenshots

Alle ligger i `artifacts/unitbooking-v2-fix/screenshots/`.

| Nr. | Indhold |
|---|---|
| 01 | Kompakt desktopkalender og dagens arbejde |
| 02–05 | Register, bookingdetalje, scanning, retur og senere flytning |
| 06–10 | Import, CSV-gennemgang, korrekt match, bekræftelse og entydig kvittering |
| 11 | Uklare oplysninger og inert dokumenttekst |
| 12 | Intet match med kandidatspecifikke grunde |
| 13–18 | 390×844: kalender, scanner og hele importforløbet |
| 19–22 | 360×800: kalender, uklare oplysninger, intet match og scanner |

Skærmbillederne er full-page og beskærer ikke relevante formularer eller
handlinger. Den interne kalenderrulning er bevaret med vilje.

## Ikke markeret som færdigverificeret

- OCR/AI for scannede dokumenter og billeder: connectoren findes, men URL/
  secret og tjenesten mangler i testmiljøet.
- Direkte native Outlook-drag: afhænger af browserens payload og kan ikke
  simuleres troværdigt headless. Gemt mail og indsat tekst er alternativer.
- Fysisk kamera og håndscanner: browser-/tastaturflow er implementeret og
  kontrolleret, men hardware er ikke testet.
- Samlet Warehouse→UNIT→Warehouse UI-forløb: UNIT-siden og fælles kontrakt er
  testet; den tværgående rejse kræver samling med Warehouse-referencen.
- Ingen produktionsdata eller eksterne betalte tjenester er anvendt.

## Afleveringsfiler

- `VEYRO_UNITBOOKING_REVIEW_V2.md`
- `docs/VEYRO_UNITBOOKING_IMPORT_FORMATMATRIX_V2.md`
- `docs/VEYRO_UNITBOOKING_SAMLINGSHANDOFF_V2.md`
- `docs/VEYRO_UNIT_WAREHOUSE_CONTRACT_V1.md`
- `docs/VEYRO_UNITBOOKING_MIGRATION_V2.md`
- `artifacts/unitbooking-v2-fix/runtime/UNITBOOKING_AUTH_FUNCTIONS_QA.json`
- `artifacts/unitbooking-v2-fix/screenshots/`
- `artifacts/unitbooking-v2-fix/VEYRO_UNITBOOKING_REVIEW_V2_FIX.zip`
