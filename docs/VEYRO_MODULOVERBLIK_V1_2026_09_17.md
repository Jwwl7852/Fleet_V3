# VEYRO Version 1 – fælles moduloverblik

Dato: 17. september 2026

Branch: `codex/veyro-integration-v1`

Oprindeligt moduloverblik: `f51173ae4fd75830e3fd68a7aafb9701e7f62fa2`

UNITBOOKING-rettelse: `5c1ee181c6a0e675093e37540b25194495780a1a`

WORKFORCE-testopsætning: `874e24c9856c5616339be043b8efad4f0e13c35f`

Udgangspunkt før overbliksrettelsen: `4568dd1964c9f0c02a36c8f9149d6c51e063f928`

## Resultat

FLEET, FACILITY, PROCURE, WORKFORCE, UNITBOOKING og WAREHOUSE bruger den fælles Version 1-struktur. Denne rettelsesrunde ændrer kun UNITBOOKINGs belægningskort og den lokale, autentificerede testopsætning for WORKFORCE. PLANNING og Design V2 er uændrede.

WORKFORCE-overblikket er nu verificeret gennem normal emulatorlogin med tenantlagrede syntetiske data. UNITBOOKINGs kassekartotek viser igen samme belægningsberegning som udlånsvisningen. Ingen demo-fallback, loginbypass eller svækkelse af tenant-, abonnements-, claims- eller permissionkontrol er indført.

## WORKFORCE – fejlårsag og rettelse

Den observerede fejl var `WORKFORCE-data kunne ikke hentes. Tenant findes ikke.`

Den normale Version 1-app, Auth-emulatoren og Functions-emulatoren kørte på Firebase-projektet `demo-veyro-integration`. Den tidligere WORKFORCE-fixture var imidlertid seedet i et andet Realtime Database-emulator-namespace. Den autentificerede bruger havde gyldig tenantclaim `procure-auth-a`, men Functions kunne korrekt ikke finde tenantroden i det projekt, som browseren faktisk anvendte.

Produktets tenantkontrol var derfor ikke fejlbehæftet. Rettelsen er et lokalt testseed, som:

- er låst til localhost og det præcise projekt `demo-veyro-integration`;
- logger normalt ind mod Auth-emulatoren og verificerer tenantclaim samt claims-version;
- skriver tenantmarkør, aktivt WORKFORCE-modul, brugerbinding og tydeligt syntetiske poster med en flersti-PATCH;
- bevarer øvrige tenantnoder og andre modulers data;
- indeholder ingen credentials og aktiverer ingen ekstern tjeneste.

Efter seed returnerede det autentificerede Functions-kald:

| Felt | Resultat |
|---|---|
| Tenant | `procure-auth-a` |
| Aktør/medarbejder | `wf-review-admin` |
| WORKFORCE aktiveret | Ja |
| Medarbejdere | 3 |
| Vagter | 1 |
| Fravær | 2 |
| Kompetencer | 1 |
| Tidsregistreringer | 2 |

## UNITBOOKING – isoleret sammenligning

De tre fejl blev kørt med samme Node-version, samme testkommando og samme isolerede testforhold på udgangspunktet og på den aktuelle version:

| Grundlag | Commit | Resultat |
|---|---|---|
| Før overbliksrettelsen | `4568dd1964c9f0c02a36c8f9149d6c51e063f928` | 174/177 bestået, 3 fejl |
| Efter rettelsen | `5c1ee181c6a0e675093e37540b25194495780a1a` og senere | 177/177 bestået |

De tre oprindelige fejl var:

1. Begge visninger skal kalde `kassebelaegning()`.
2. Begge skal skrive `ude af drift` ved siden af tallet.
3. Tallet skal formateres med den fælles `pct()`-funktion.

Årsagen var én produktregression: `Kasser.jsx` havde mistet det fælles belægningskort, mens `Udlaan.jsx` fortsat brugte `kassebelaegning()`. Kassekartoteket bruger nu den samme beregning og formatering og viser altid grundlaget inklusive antal ude af drift. Testen er ikke ændret eller svækket.

Det aktuelle browserbevis på `/ressourcer/units` viser 50 % og `1 af 2 brugbare · 1 ude af drift` for tre tenantlagrede syntetiske units.

## Autentificeret browserbevis

- Base-URL: `http://127.0.0.1:5197/`
- App: samlet Version 1-root-app med én AppShell.
- Login: normal lokal emulatorlogin; ingen bypass.
- Rolle/tenant: syntetisk administrator, `procure-auth-a`.
- Datakilde: tenantlagrede syntetiske data i lokale Auth-, Realtime Database- og Functions-emulatorer.
- Mærkning: global TEST-markering i brugerfladen.
- Eksterne tjenester: ikke tilsluttet.

### WORKFORCE

`/workforce-v2` blev afprøvet ved 1440×900 og 390×844. Overblikket viste:

- 1 på arbejde i dag;
- 1 på fravær i dag;
- 7,5 timer til godkendelse;
- to kommende poster og to poster til behandling;
- ingen `Tenant findes ikke`-fejl og ingen vandret side-overløb.

### UNITBOOKING

`/unitbooking` og `/ressourcer/units` blev afprøvet ved 1440×900 og 390×844. Overblikket viste 1 ledig unit, 1 aktiv booking og 0 importer til kontrol. Kassekartoteket viste belægningsgrundlaget beskrevet ovenfor uden vandret side-overløb.

De seks aktuelle PNG-filer og det maskinlæsbare capturemanifest ligger i `artifacts/veyro-moduloverblik-v1-2026-09-17/screenshots-authenticated/`. Øvrige modulbilleder er bevaret som historiske og er markeret sådan i billedmanifestet.

## Testresultater

Kørt efter rettelserne:

- `node --test test/unitbooking.test.mjs`: 177/177 bestået.
- `node --test test/moduloverblik-v1-emulator-seed.test.mjs`: 4/4 bestået.
- Kombineret design-, overbliks-, seed- og UNITBOOKING-suite: 197/197 bestået fordelt på 43 suites.
- WORKFORCE-tests: 29/29 bestået.
- Root `npm run lint`: bestået.
- Root `npm run build`: bestået, 776 moduler; kun eksisterende chunk-size-advarsel.
- `git diff --check`: bestået; kun Git-advarsler om fremtidig LF→CRLF-normalisering.

En afsluttende start med Node-test-runnerens standardisolering fik `spawn EPERM` på alle fire worker-processer, før nogen testkode blev kørt. Den samme samlede suite blev straks kørt uden worker-spawn med `--test-isolation=none` og bestod 197/197. Processtartfejlen er dermed dokumenteret særskilt fra testresultatet; ingen global Java-, Windows- eller sikkerhedsindstilling blev ændret.

Rules-/Functions-gaten er ikke genkørt i denne rettelse, fordi ingen backendfunktion, adgangsregel eller sikkerhedsgrænse er ændret. Seed-scriptet er lokal testopsætning, og produktændringen er en klientvisning. Tidligere brede Rules-/Functions-resultater skal fortsat læses som historiske.

## Rester og afgrænsning

1. Rigtig ekstern GPS-/OBD-integration er fortsat udskudt efter aftale. Den blokerer ikke dette modulreview og er ikke markeret som gennemført.
2. FLEET-, FACILITY-, PROCURE- og WAREHOUSE-billederne er ikke genoptaget, fordi denne rettelse ikke ændrer dem. De er tydeligt markeret som historiske i pakken.
3. Reviewpakken indeholder kun syntetiske/anonymiserede data og ingen miljøfiler, credentials, tokens, emulator-databaseeksporter, browserdata, `node_modules` eller buildmapper.

Ingen push, deployment, produktionsdata eller ekstern aktivering er foretaget.
