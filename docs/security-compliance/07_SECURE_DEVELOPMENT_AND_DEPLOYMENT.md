# 07 — Secure Development, Web Attack Surface &amp; Software Supply Chain

Read-only evidensgennemgang. Dækker session 7 (authentication/session/web
attack surface), 8 (secrets/environments) og 9 (secure development/supply
chain) fra opgavebeskrivelsen samlet, da de deler kildemateriale.

## A. Callable/HTTP-angrebsflade

**47 eksporterede funktioner: 44 `onCall`, 3 `onSchedule`. Nul
`onRequest` (rå HTTP).** Al ekstern indgang går gennem Firebases
callable-protokol. **VERIFIED.**

**Auth-tjek-dækning: 44/44 — VERIFIED.** Enten direkte
`if (!auth) throw unauthenticated`, eller via en af 7 delte
guard-hjælpere (`kraevBrugeradmin`, `kraevUdbyder`, `kraevKundeId`,
`kraevUdlaansskriv`, `kraevBevaegelsesskriv`, `kraevGrundlag`,
`procureDoer`). Ingen funktion fundet uden auth-gate.

**Inputvalidering**: konsekvent brug af `kortStreng(s, maks)` — trimmer og
længdebegrænser hvert strengfelt før brug, bredt og konsekvent anvendt.

- **Gap (MEDIUM, afgrænset)**: `kortStreng()` afviser ikke RTDB-forbudte
  stitegn (`. # $ [ ] /`) når en klient-leveret værdi bruges som
  STI-SEGMENT frem for en gemt værdi. En klient-leveret `sagId` med `/` i
  sig kunne teoretisk navigere til en søskendenode INDEN FOR SAMME TENANTS
  eget træ (`rod` er altid forankret på `tenants/${tenantId}` — dette er
  IKKE en krydstenant-vej). De fleste sådanne id'er eksistenstjekkes
  efterfølgende, hvilket begrænser udnyttelsen. Ingen test dækker
  sti-tegn-sanering specifikt. **PARTIAL/NOT BUILT** for
  karakter-niveau-sanering af sti-segment-input.

**XSS**: `dangerouslySetInnerHTML` — præcis ét træf i `src/`, og det er en
kommentar der eksplicit dokumenterer at det ALDRIG bruges. **Nul reelle
anvendelser.** React's standard JSX-escaping er den eneste kontrol, og
intet omgår den. **VERIFIED clean.**

**App Check: NOT BUILT.** Ingen reference nogen steder i `src/firebase.js`
eller `functions/index.js`. Bekræftet af denne sessions egne live
Cloud Function-logs under DEV-test:
`{"verifications":{"app":"MISSING","auth":"VALID"}}` — callable-pipelinen
logger eksplicit at intet App Check-token blev fremvist, og accepterer
alligevel kaldet på auth alene. **Severity: MEDIUM-HIGH** for
før-enterprise-eksponering: enhver med et gyldigt brugerlegitimation (ikke
kun den officielle app) kan kalde enhver funktion.

**Rate limiting: NOT BUILT på applikationsniveau.** Kun PLATFORM-niveau
Cloud Run/Functions-kvoter findes — direkte illustreret af denne sessions
eget deploy der ramte `"Quota exceeded for ... Write requests per minute
per region"`. Det er en DEPLOY-TIDS-infrakvote, ikke en per-bruger
API-drossel. **PARTIAL** (kun infra-niveau).

**Idempotens/replay: NOT BUILT.** Oprettelsesfunktioner bruger
`push().key` — hvert kald minter en frisk nøgle, så et gentaget/duplikeret
klientkald opretter en ANDEN post, ikke en afvist duplikat. Nogle veje har
tilfældige værn (fx "opgave har allerede en sagId" forhindrer en anden sag
i at blive KNYTTET, men ikke en forældreløs sag i at blive OPRETTET
først — fundet og delvist illustreret af denne sessions egen
sagOpret-fejlsøgning). Intet idempotensnøgle-mønster findes nogen steder.

## B. Hosting / browser-sikkerhedsheadere

`firebase.json` har ingen `hosting`-nøgle — frontend deployes via
**Netlify**, ikke Firebase Hosting. `netlify.toml` læst i fuld bredde:
build-config, tre `[context.*.environment]`-blokke til VITE-miljø-mapping,
og én SPA-fallback-redirect. **Ingen `[[headers]]`-blok findes overhovedet.**
Ingen CSP, ingen `X-Frame-Options`, ingen `Strict-Transport-Security`,
ingen `X-Content-Type-Options` konfigureret. Netlify tilføjer ikke disse
som standard uden eksplicit konfiguration. **NOT BUILT. Severity: MEDIUM**
(clickjacking-/CSP-hærdning helt fraværende; intet bevis for aktiv
udnyttelse, men dette er standard baseline-hærdning der mangler helt).

## C. Secrets-scan — RENT, ingen fund

Gennemsøgt hele det sporede repo for: Google API-nøgler, PEM private
nøgler, Stripe-lignende `sk_live_`/`sk_test_`, AWS `AKIA...`, generiske
`password/secret/apikey = "..."`-tildelinger. **Nul træf på alle
mønstre.**

- `.gitignore` udelukker `.env`/`.env.local` korrekt; `git ls-files` viser
  kun `.env.example` (en blank skabelon) sporet.
- DEV-seed-adgangskoden brugt gennem hele denne sessions live-test: `git
  grep` for den bogstavelige streng på tværs af hele det sporede repo:
  **nul træf.** Den lever kun i det git-ignorerede `.env.local`.
- `src/firebase.js`: klientkonfigurationen henter alt fra `VITE_*`-
  miljøvariabler; det ene hardkodede literal er PROD-projekt-ID-strengen,
  brugt kun til miljødetektion — ikke en hemmelighed (Firebase
  klient-API-nøgler er offentlige by design; projekt-ID'er er ikke
  hemmeligheder).
- `functions/index.js`: `initializeApp()` kaldes UDEN argumenter — Googles
  Application Default Credentials-mønster; Cloud Functions-runtimen
  leverer selv servicekontoen. Ingen service-account-JSON,
  ingen legitimationsfil, fundet nogen steder i sporede filer.

**Konklusion: intet hemmeligt materiale fundet i repoet. Ingen
CRITICAL/blokerende secrets-fund.**

## D. Secure development / software-forsyningskæde

- **Lockfiles: findes for begge.** `package-lock.json` (rod) og
  `functions/package-lock.json`, begge sporet. **VERIFIED.**
- **`npm audit`-resultater (kørt live, denne session, read-only):**
  - Rod: **12 sårbarheder (11 moderate, 1 high)** — high er `undici`
    ("Use of Insufficiently Random Values") plus en klynge
    undici/WebSocket/HTTP-smuggling-advarsler trukket ind transitivt via
    `firebase`/`@firebase/*`. Moderate inkluderer `react-router`
    (open-redirect/SSR-hydration-CVE'er), version 6.0.0–7.17.0.
  - `functions/`: **8 moderate** sårbarheder, transitivt via
    `@google-cloud/firestore` → `google-gax` → `teeny-request`/
    `retry-request` → sårbar `uuid`.
  - Alle markeret rettelige via `npm audit fix` per npm's egen output;
    **ikke forsøgt** (read-only scope). **Severity: MEDIUM** (moderat/
    transitivt, intet direkte bevist udnyttelsesspor, men reelt og
    uafhjulpet).
- **Afhængigheds-scanningsautomatisering: NOT BUILT.** Ingen `.github/`-
  mappe overhovedet — ingen Dependabot, ingen Renovate, ingen GitHub
  Actions af nogen art.
- **Pre-commit-gate: VERIFIED, aktiv.** `core.hooksPath` peger på
  `.githooks`. `.githooks/pre-commit` kører betinget `npm run test:design`
  (hvis `src/` rørt), `npm run lint` (hvis JS/JSX/MJS rørt),
  `npm run test:rules` (hvis `firebase.rules.json` rørt) — hver blokerer
  commit ved fejl, kun omgåeligt via eksplicit `git commit --no-verify`.
  Denne sessions egen commit (`93c24b0`) udløste demonstrativt
  lint-gaten. **Gap**: hooken kører IKKE den fulde testsuite (3269 tests)
  ved hver commit — kun de tre betingede udsnit. Fuld-suite-verifikation
  er manuel udviklerdisciplin, ikke håndhævet.
- **CI/CD: NOT BUILT/ORGANIZATIONAL.** Ingen `.github/workflows/`. Deploys
  er manuelle, via `npm run funktioner:udrul`/`regler:udrul` — begge
  observeret og brugt direkte af denne session. Præcist for et lille
  team; ikke i sig selv en defekt, men betyder ingen uafhængig
  server-side-gate mellem "udviklerens lokale testkørsel bestod" og
  "deployet til DEV/PROD" ud over pre-commit-hooken (som udvikleren
  kører på egen maskine og kan omgå).
- **DEV/PROD-adskillelse: VERIFIED, reel.** `.firebaserc`: `dev` →
  `fleetcontrol-dev-1ac1c`, `prod` → `fleetcontrol-98e11` — to HELT
  ADSKILTE Firebase-projekter, ikke en flag-/miljøvariabel-distinktion.
  `netlify.toml` mapper produktionskontekst til PROD-nøgler og
  deploy-previews/branch-deploys udelukkende til DEV-nøgler, sat i
  Netlify-UI'et (aldrig i repoet). Miljøet udledes desuden af
  `VITE_FB_PROJECT_ID` alene (`src/firebase.js:35`, `miljoe = ... :
  projektId === PROD_PROJEKT ? "prod" : "dev"`) — en mekanisk, ikke en
  manuelt sat, detektion, med en synlig rød advarselsbjælke hvis
  produktionsnøgler dukker op uden for et produktionsdeploy.
- **Rollback: NOT BUILT ud over platformstandarder.** Ingen
  rollback-script i `scripts/`. Cloud Functions v2 bevarer tidligere
  revisioner (synlig/reverterbar via GCP-konsollen — platformfunktion,
  ikke app-værktøj); RTDB-regler har tilsvarende versionshistorik i
  Firebase-konsollen. Intet app-niveau versions-pinning eller
  ét-kommando-rollback.

## Fund

| # | Fund | Klassifikation | Severity |
|---|---|---|---|
| 1 | 100% auth-tjek-dækning på 44 callables via konsistente delte hjælpere | VERIFIED (styrke) | — |
| 2 | Nul rå HTTP-endepunkter, nul reel XSS-flade | VERIFIED (styrke) | — |
| 3 | Intet hemmeligt materiale i repoet; DEV/PROD-nøgler korrekt adskilt | VERIFIED (styrke) | — |
| 4 | App Check ikke slået til — enhver med gyldigt brugertoken kan kalde enhver funktion | NOT BUILT | MEDIUM-HIGH |
| 5 | Ingen applikationsniveau rate limiting | PARTIAL (kun infra) | MEDIUM |
| 6 | Ingen idempotensbeskyttelse på oprettelseskald | NOT BUILT | MEDIUM |
| 7 | Ingen Netlify/Hosting-sikkerhedsheadere (CSP m.v.) | NOT BUILT | MEDIUM |
| 8 | 12+8 kendte, uafhjulpne afhængighedssårbarheder (moderate/high, transitive) | PARTIAL | MEDIUM |
| 9 | Ingen CI/CD eller automatiseret afhængighedsscanning | NOT BUILT/ORGANIZATIONAL | MEDIUM |
| 10 | Sti-segment-input er ikke karaktersaneret (afgrænset til egen tenant) | PARTIAL | MEDIUM |
| 11 | Pre-commit-hook dækker ikke fuld testsuite, kun betingede udsnit | PARTIAL | LOW |

Fund 4, 5, 6 og 10 er direkte relevante for `08_EMAIL_SECURITY_GATE.md`s
"BLOCKER BEFORE 3D"-liste og er krydsrefereret der.
