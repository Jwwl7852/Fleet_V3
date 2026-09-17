# VEYRO Version 1 – fælles moduloverblik

Dato: 17. september 2026  
Branch: `codex/veyro-integration-v1`  
Implementeringscommit: `f51173ae4fd75830e3fd68a7aafb9701e7f62fa2`  
Udgangspunkt: `4568dd1964c9f0c02a36c8f9149d6c51e063f928`

## Resultat

FLEET, FACILITY, PROCURE, WORKFORCE, UNITBOOKING og WAREHOUSE bruger nu samme genanvendelige Version 1-struktur: tre beregnede KPI-kort, én eksisterende primær handling hvor en reel handling findes, og to prioriterede tabeller med højst fem rækker. Klikbare rækker har tastaturfokus og åbnes med Enter eller mellemrum. Brede tabeller ruller inde i kortet uden at skabe vandret scroll på hele siden.

PLANNING er ikke ændret til den nye struktur. `/planning-v2` blev åbnet i browseren, og `.fc-operational-overview` forekom ikke.

Den fælles præsentation ligger i `src/fleet/OperationalOverview.jsx`, mens hvert modul fortsat ejer sine beregninger, repositories, permissions og ruter. Der er ikke oprettet en ny global datakilde.

## KPI-definitioner og datakilder

Alle datoer vises i `Europe/Copenhagen`. KPI-totaler beregnes på hele det relevante datasæt; `slice(0, 5)` anvendes kun på tabeludsnittene.

| Modul | KPI | Definition | Kilde |
|---|---|---|---|
| FLEET | Enheder | Aktive enhedsposter fra `deriveOverview` | Fælles enhedsregister og FLEET-relationer |
| FLEET | Åbne sager | Sager hvor `isOpenCase` er sand; afsluttede og afviste er udeladt | FLEET-sager |
| FLEET | Service snart | Serviceevaluering med status `overdue`, `upcoming`, `planned` eller `missing_basis` | Serviceplaner og målergrundlag |
| FACILITY | Ejendomme | Antal ejendomme i FACILITY-repositoryet | FACILITY-repository |
| FACILITY | Åbne opgaver | Alle opgaver med status forskellig fra `completed` | FACILITY-opgaver |
| FACILITY | Eftersyn snart | Repositoryets planlagte serviceforekomster i de kommende 30 dage | FACILITY-service |
| PROCURE | Åbne bestillinger | Ordrer uden afsluttet/afvist/annulleret status | PROCURE-repository |
| PROCURE | Afventer godkendelse | Servergemte godkendelser med status `pending` | Godkendelseskø |
| PROCURE | Leverancer denne uge | Åbne ordrer med ønsket leveringsdato fra i dag til før dag 7 | PROCURE-ordrer |
| WORKFORCE | På arbejde i dag | Unikke medarbejdere som faktisk er indstemplet nu | WORKFORCE-repository |
| WORKFORCE | Fravær i dag | Godkendt fravær, der overlapper den lokale kalenderdag | WORKFORCE-fravær |
| WORKFORCE | Timer til godkendelse | Sum af afsluttede, ikke-godkendte registreringer minus pause; vist i timer | WORKFORCE-tidsregistreringer |
| UNITBOOKING | Ledige units | Brugbare kasser uden bindende reservationskonflikt de næste 24 timer | `kasser`, `kasseudlaan`, `ledigeKasser` |
| UNITBOOKING | Aktive bookinger | Udlån i en bindende tilstand | `kasseudlaan` |
| UNITBOOKING | Bestillinger til kontrol | Servergemte importudkast der ikke er bekræftet; parsergæt tælles ikke | `unitbookingImporter` |
| WAREHOUSE | Items på lager | Antal beholdningsposter; units og lokationer tælles ikke | `beholdning` |
| WAREHOUSE | Forventede modtagelser i dag | Carriers i transit med forventet dato i dag; `Mangler dato` vises, hvis grundlaget mangler | `carriers` |
| WAREHOUSE | Udleveringer i dag | Åbne plukordrer med registreret afgang i dag | `plukordrer` |

WAREHOUSE har ingen opdigtet projektmodel og derfor ingen død `Opret projekt`-knap. Manglende datoer og tomme repositories vises eksplicit.

## Navigation og handlinger

Browserprøven gav følgende eksisterende ruter:

| Fra | Handling | Til |
|---|---|---|
| `/fleet-v2` | Opret sag | `/fleet-v2/indberetninger/ny` |
| `/facility-v2` | Opret opgave | `/facility-v2/arbejdsko` |
| `/indkoeb` | Ny bestilling | `/indkoeb/bestillinger?ny=1` |
| `/workforce-v2` | Registrér fravær | `/workforce-v2/fravaer` |
| `/unitbooking` | Opret booking | `/unitbooking/import` |
| `/fleet-v2` | Første sag, Enter | `/fleet-v2/sager/case-demo-008`; rækken havde `tabindex="0"` |

UNITBOOKINGs eksisterende kalender er bevaret på `/unitbooking/kalender`; det nye overblik er modulindgangen `/unitbooking`.

## Browserbevis

### Autentificeret integreret app

- URL: `http://127.0.0.1:5197/`
- App: samlet Version 1-root-app med én AppShell.
- Login: normal lokal emulatorlogin; ingen bypass.
- Rolle/tenant: syntetisk administrator, `procure-auth-a`.
- Datakilde: lokale emulatorer, globalt mærket `TEST – Syntetiske testdata i demo-veyro-integration`.
- Resultat: FLEET, FACILITY, PROCURE, UNITBOOKING og WAREHOUSE viste fælles overblik uden vandret side-overløb. WORKFORCE viste den eksplicitte backendfejl `Tenant findes ikke` og anvendte ikke skjult demo-fallback.

### Isoleret modulbevis

- URL: `http://127.0.0.1:5199/` under prøven.
- Start: `npm run dev -- --host 127.0.0.1 --port 5199 --strictPort` med Firebase-variabler fjernet for processen.
- App: samme samlede Version 1-root-app og AppShell, men uden Firebase-forbindelse.
- Rolle: demo-administrator.
- Datakilde: tydeligt mærkede lokale syntetiske fixtures.
- Resultat: alle seks overblik blev vist ved 1440×900, 1280×800 og 390×844. Ingen af de seks havde vandret side-overløb. På 390×844 var KPI-layoutet én kolonne, og alle brede tabeller havde lokal vandret scroll.

Modulbeviset dokumenterer UI og lokale kontrakter; det tæller ikke som serverbevis. Det autentificerede WORKFORCE-forløb er fortsat blokeret af manglende tenantseed i den aktuelle emulatoropsætning.

## Testresultater

Kørt på implementeringsgrundlaget ovenfor:

- `node --test test/operational-overviews.test.mjs`: 5/5 bestået.
- Root `npm run lint`: bestået.
- `npm run test:design`: 11/11 bestået.
- Root `npm run build`: bestået, 776 moduler; kun eksisterende chunk-size-advarsel.
- FACILITY: 15/15 relevante repository-, selector- og apptests bestået.
- WORKFORCE: 29/29 tests bestået.
- FLEET/PROCURE/UNITBOOKING-import/WAREHOUSE: 51/51 relevante tests bestået.
- `git diff --check`: bestået; kun Git-advarsler om fremtidig LF→CRLF-normalisering.

Den brede `test/unitbooking.test.mjs` har fortsat 174/177 bestået og tre fejl i den eksisterende suite `belægningsgraden er den samme begge steder`. Fejlene forventer, at `Kasser.jsx` og `Kalender.jsx` begge kalder `kassebelaegning`, viser `ude af drift` og bruger `pct()`. De tre kilde-/testfiler er uændrede i denne rettelse (`git diff --exit-code` er grøn) og er derfor registreret som eksisterende restarbejde, ikke skjult eller rettet som del af moduloverblikket.

Rules-/Functions-gaten er ikke genkørt, fordi denne ændring ikke berører regler eller backendfunktioner. Tidligere resultater må fortsat betragtes som historiske.

## Resterende arbejde

1. Seed/kontrakt for WORKFORCE-tenant `procure-auth-a` skal afklares, før det autentificerede integrerede overblik kan godkendes som grønt.
2. De tre eksisterende UNITBOOKING-belægningsassertions skal afstemmes med den nuværende ressourceimplementering i en særskilt opgave.
3. Rigtig ekstern GPS/OBD-integration er fortsat udskudt efter aftale og er hverken nødvendig for dette modulreview eller markeret som gennemført.

Ingen Design V2-filer, produktionsdata, eksterne tjenester, deployment eller push er berørt.
