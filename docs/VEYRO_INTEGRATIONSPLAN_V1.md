# Veyro integrationsplan V1

Status: forberedelse, ingen modulmerge udført

Dato: 9. september 2026

Integrationsbranch: `codex/veyro-integration-v1`

Base: `e62093b3722aa114dd46d0380847e638334660ab`

## 1. Verificeret Git-grundlag

Efter `git fetch origin --tags` peger lokale branches og `origin/*` på samme
commit for master og alle fire checkpoints. Ingen af de sikrede branches er
rykket.

| Område | Branch | Verificeret checkpoint | Worktree-status |
|---|---|---|---|
| FLEET | `codex/fleet-v2-development` | `3725ac0553ad711a1d52a8d24fad3f14977d8e8e` | Ren |
| FACILITY | `codex/facility-v2-development` | `1b755defb49e17aec0282427737c40bcb4a29004` | Ren |
| PLANNING | `codex/planning-ui-reference-v1` | `550a19c70684b123715e656d7d171a0d4992fed7` | To untracked visningsområder: `planning-screenshots-assets/` og `planning-screenshots.html`; checkpointet selv er uændret |
| FAKTURACENTER | `codex/fakturacenter-intake-v1-dev` | `deb1615f58926bb0857714c40b62037fb6c1414e` | Ren |

Reference Contract V1 er verificeret som commit
`e66a75108f1d6e46eb365db9bc2d90cb246cd61b`, der er direkte forælder til
FAKTURACENTER-checkpointet. Den rapporterede master er fortsat
`8f6cb930797ae448eaa3f3e04f7db011a2ab685d` lokalt og på origin.

Den primære checkout er ikke en integrationsbase: den står på
`codex/planning-optimization-v1` ved
`6082e56b15bcd5c9d3e82540e2cbef0d610b5042` og har omfattende lokale,
committede og ucommittede PLANNING-ændringer. Den skal forblive urørt.

`git diff --check` viser de fire allerede kendte Markdown-linjer med hårde
linjeskift i den fælles Planning-produktspecifikation på FLEET-, FACILITY- og
PLANNING-historikken. PLANNING-checkpointet har derudover de fem rapporterede
afsluttende whitespace-linjer i `PlanningFlexibleScheduling.jsx` og
`PlanningScheduling.jsx`. FLEET/FACILITY arver altså fire dokumentfund fra den
fælles historik; de fem kodefund er alene i det senere PLANNING-checkpoint.

## 2. Historik og valgt base

Alle fire checkpoints har master
`8f6cb930797ae448eaa3f3e04f7db011a2ab685d` som fælles forfader. Master er
forfader til hvert checkpoint og har ingen egne commits, som mangler på
modulbranchene.

- FLEET og FACILITY deler historik frem til
  `e9be941dd6ffd1d63f88cd4526988523a343761f`.
- FLEET, FACILITY og PLANNING deler Planning-historik frem til
  `6082e56b15bcd5c9d3e82540e2cbef0d610b5042`.
- FAKTURACENTER følger en anden linje fra master og indeholder den komplette
  custom-claims-v2-hærdning frem til
  `e62093b3722aa114dd46d0380847e638334660ab` før selve Fakturacenterarbejdet.

Den valgte base er
`e62093b3722aa114dd46d0380847e638334660ab` (`origin/codex/firebase-custom-claims-v2`).
Den er master plus fem sammenhængende platformcommits, som indfører og prøver:

- kanoniske, kompakte permission-claims med `pv: 2` og fail-closed decoding;
- en tidsbegrænset legacy-allowlist;
- refresh-token-revocation med `authRevocations`-gate i RTDB-reglerne;
- samme permission-/claimlogik i klient, Functions, scripts og test-fixtures;
- størrelsesgrænse og afvisning af ukendte eller reserverede claims.

Basen vælges ikke på dato. Den vælges, fordi den er et rent, fælles
sikkerhedslag: den ændrer login/claims/permissions/rules/functions, men endnu
ikke Fakturacenterets UI, AppShell eller Veyro-tema. Master alene mangler denne
hærdning. `e9be941…` indeholder allerede tidlig PLANNING og FLEET, men mangler
claims-v2. FAKTURACENTER-checkpointet er heller ikke base, fordi det både
indeholder ét modul og ændrer fælles shell og tema; det skal medtages som et
eksplicit modulcheckpoint på samme vilkår som de øvrige.

Vigtigt: claims-v2-dokumentet kræver en fuld, menneskeligt godkendt Auth-
inventering og en korrekt legacy-allowlist, før dual-read-regler må deployes.
Denne integrationsforberedelse udfører hverken inventering, migration eller
deploy.

## 3. Historikken skal medtages sådan

Når integrationen godkendes, bruges rigtige merge-commits med de sikrede fulde
hashes. Checkpoint-historik må ikke rekonstrueres ved at kopiere mapper eller
cherry-picke et udvalg; det ville miste kontrakt-, migrations- og testhistorik.

Foreslået Git-rækkefølge:

1. Behold basen `e62093b3722aa114dd46d0380847e638334660ab` uændret og kør dens
   baseline-tests.
2. Merge FAKTURACENTER
   `deb1615f58926bb0857714c40b62037fb6c1414e`. Da basen er forfader, kommer
   præcis commits `375531f…`, `e66a751…` og `deb1615…` med: intake-arbejdsflade,
   Reference Contract V1, AppShell-montering, logo og semantisk Veyro-tema.
3. Merge FLEET `3725ac0553ad711a1d52a8d24fad3f14977d8e8e`. Det medtager den
   fælles tidlige Planning-historik, `e9be941…` og hele FLEET v2-checkpointet.
4. Merge FACILITY `1b755defb49e17aec0282427737c40bcb4a29004`. Git kender allerede
   den fælles forfader `e9be941…`; kun FACILITY-checkpointets egen historie
   kommer oveni.
5. Merge PLANNING `550a19c70684b123715e656d7d171a0d4992fed7`. Git kender
   `6082e56…` fra FLEET/FACILITY-historikken, så de senere stage-5/stage-6A-
   commits tilføjes uden at duplikere den tidlige Planning-historik.

Den eneste nuværende direkte sti-overlap mellem FAKTURACENTER-serien og de tre
øvrige checkpointdiffs er `test/design-tokens.test.mjs` i PLANNING. De store
risici er derfor semantiske integrationskonflikter, ikke mange tekstuelle
mergekonflikter.

Efter hver merge skal checkpointets fulde hash kunne findes som forfader til
integrationsbranchens HEAD. Ingen modulbranch flyttes eller rebases.

## 4. Målarkitektur for milepæl A

Milepæl A er ét program og én ramme med tydeligt afgrænsede testdata. Den er
ikke færdig dataintegration.

### Fælles platformejerskab

Integrationstråden ejer følgende fælles filer og kontrakter:

- `src/App.jsx`, `src/fleet/AppShell.jsx`, `src/fleet/nav.js`;
- `src/fleet/fleet.css`, fælles design-tokens, logo-komponent og logo-asset;
- root `package.json`, `package-lock.json`, `vite.config.js`, `netlify.toml`;
- `src/firebase.js`, `src/fleet/permissions.js`, modul-/nodekataloger,
  `firebase.rules.json`, `storage.rules` og fælles Functions-filer;
- tværgående adaptere, eventkontrakter, routing- og shelltests.

Modulchats må efter samlingen ændre deres egne komponenter, domænelogik,
fixtures og modultests. Ændringer i fælles filer leveres som en særskilt,
beskrevet integrationændring eller koordineres med integrationstråden; de må
ikke kopiere shell, tokens, auth eller router ind i modulet igen.

### Routing og AppShell

Der skal være præcis én `BrowserRouter`, én `AppShell`, én login-/tenantkontekst
og én miljøindikator. Modulerne monteres som lazy routes under den eksisterende
`harAdgang`-grænse. Et dybt link skal fortsat give login eller en forklaring på
manglende modul/permission, aldrig en offentlig prototype eller en tavs 404.

De eksisterende kanoniske hovedstier bevares:

- FLEET under `/flaade/*`;
- FACILITY under `/facility/*`;
- PLANNING under `/booking/*` — produktnavnet er Planning, men den eksisterende
  modulnøgle og route er fortsat `booking`;
- FAKTURACENTER under `/oekonomi/fakturacenter` og dets sektioner.

FLEET v2's nuværende topniveaupaths (`/enheder`, `/indberetninger`,
`/vaerksted`, `/leasing`, m.fl.) skal have en eksplicit crosswalk til
`/flaade/*`; de må ikke overtage globale paths. FACILITYs paths er allerede
prefixede. PLANNINGs interne view-state skal oversættes til beskyttede routes
eller query-parametre under `/booking/*`. FAKTURACENTER er allerede monteret og
skal være reference for route/Outlet-integration, ikke automatisk for alle
andre arkitekturvalg.

FLEETs manuelle `window.history.pushState`/`popstate`-router erstattes af hostens
routeradapter. FACILITYs interne `<BrowserRouter>`, `<Routes>` og
`PlatformShell` fjernes fra produktionsmonteringen; route-komponenterne bruges
under host-routeren. PLANNINGs særskilte `createRoot` i `planning-ui/main.jsx`
forbliver kun en lokal referenceindgang, mens produktionsruten importerer selve
workspace-komponenten med `lazy()`.

### Navigation, logo og topbar

`nav.js` er eneste kilde til sidebar og routemetadata. De tre lokale sidebars
og topbars må ikke ligge inde i modulerne efter montering. Modul-specifik søgning,
filtre og handlinger flyttes til modulernes content-header/toolbars; bruger,
tenant, miljø, logout og primær navigation bliver i AppShell.

Alle fire branches indeholder samme logo-blob
`b0c9fba3f35f92a431a110c4c6390277791d6adf`. Integrationen beholder én asset i
`src/assets/veyro/` og én delt `VeyroLogo`-komponent. Kopier i modulmapper
udfases først, når de lokale visuelle tests er opdateret.

### Designtokens og globale styles

FAKTURACENTER-seriens root-tema er udgangspunkt for fælles semantiske tokens,
fordi det allerede har tilgængelighedsjusterede aliaser og kompatibilitet med
de gamle `--bc-*`/`--fc-*`-navne. Den rå palette er den samme i alle moduler,
men betydningen er ikke altid ens: FLEET bruger blandt andet hvid kortflade,
FACILITY har `--veyro-navy-deep`/`--veyro-app-bg`, og PLANNING redefinerer både
`--bc-*` og `--fc-*`.

Modul-CSS kan ikke importeres globalt som den står. Konfliktområderne er
`:root`, `html`, `body`, `#root`, `*`, generiske `button/input/select/table`
og klasser som `.card`, `.topbar` og shellens viewport-/overflowregler.
Arbejdet skal derfor ske sådan:

1. fastlås fælles tokenkontrakt og opdater design-token-/kontrasttests;
2. map modulernes aliases til fælles tokens uden nye rå farver;
3. scope modulstyles under stabile modulrødder, fx.
   `.veyro-module--fleet`, `.veyro-module--facility` og
   `.veyro-module--planning`;
4. fjern kun modulejede shell-/body-regler; bevar arbejdsfladernes grid,
   dialoger, responsive layouts og tilstandsstyling;
5. kør visuel regression ved checkpointets eksisterende viewports.

PLANNINGs ændring af `test/design-tokens.test.mjs` skal flettes med den
tilgængelighedsjusterede Veyro-tokenliste; den ene snapshotversion må ikke bare
vælges. Den kendte CSS-kommentaradvarsel i `fleet.css` registreres som baseline
og må ikke skjules ved at svække buildkontrollen.

### Dependencies og build

Rootplatformen bruger React 18.3.1, React Router 6.26.2, Vite 5.4.8 og
`@vitejs/plugin-react` 4.3.1. FLEET matcher React/Vite-linjen og tilføjer især
`qrcode`. FACILITY deklarerer React Router 7.18.3, Vite 8.2.2,
plugin-react 6.1.1, Vitest 5 og jsdom 30.

Der må ikke installeres to React- eller BrowserRouter-instanslag i
produktionsappen. FACILITY bruger kun router-API'er, som også findes i v6 i den
nuværende kode (`Routes`, `Route`, `Navigate`, `Outlet`, `Link`, `useNavigate`,
`useLocation`, `useParams`, `useSearchParams`). Før rootplatformen opgraderes,
skal FACILITY derfor først bygges og testes mod rootens React Router 6 via en
kompatibilitetstest. Kun hvis et konkret v7-krav påvises, laves en særskilt
platformmigration med fuld regression; versionens nyere dato er ikke en grund.

Produktionsbuildet skal fortsat være rootens ene Vite-build. Under integration
kan submappernes egne package/config/testopsætninger bevares som
checkpoint-referencer, men deres `main.jsx`, Vite-config og `dist` er ikke
produktionsindgange. Rootdependencies får `qrcode` og de mindst nødvendige
testværktøjer med én låst version.

PLANNING kommer ikke i `vite build` blot fordi `planning-demo.html` findes.
Det skal importeres fra en lazy route i `src/App.jsx`; standalone-demoen er
sekundær og må ikke være den eneste buildvej. `window.open`-/BroadcastChannel-
forløb omskrives til beskyttede `/booking/*`-URL'er. Kundebekræftelsesflowet
forbliver DEV/test-only i milepæl A, indtil en autentificeret eller signeret
serverkontrakt findes.

### Bevaring af modulernes funktionalitet

- FLEET beholder hele repository-/contextgrænsen, enhedsprofiler, indberetning,
  arbejdskø, værksted, service, dokumenter/bilag, leasing, økonomi, mobilflow og
  de nuværende stabile lokale ID'er.
- FACILITY beholder repository-/contextgrænsen, ejendomme, installationer,
  triage, sager/opgaver, kalender, service, dokumentversioner/bilag, manuelt
  kort, mobilflow og de adskilte økonomikilder.
- PLANNING beholder de rene domænekerner, typed source references,
  envejsadaptere, import, optimering, ugeplan, confirmation og nuværende
  forklarlige lokale forslag. Den må ikke begynde at skrive i Booking/Fleet/
  Facility for at demonstrere forbindelser.
- FAKTURACENTER beholder hele intake-/match-/fordelings-/kontrolflowet og
  Reference Contract V1. `markérKontrolleret` er fortsat lokal UI-state;
  adapterne må ikke omtales som liveforbindelser.

Lokale testdata skal have en synlig “lokal/syntetisk testdata”-markering og
forblive i modulejede repositories. De må kun aktiveres i en eksplicit DEV-
testkontekst efter fælles login, tenant-, modul- og permissionkontrol. En
`permission-denied` må aldrig falde tilbage til lokale fixtures.

## 5. Testgate efter hvert integrationstrin

### Gate 0 — sikkerhedsbase

- ren status og korrekt HEAD;
- `npm ci`, lint, build og hele root-testsuiten;
- claims-v2 unit/preflight/emulatortests;
- login med gyldigt v2-claim, gyldigt tilladt legacy-claim, ukendt version,
  udløbet allowlist og revoked token;
- ingen regel- eller backenddeploy.

### Gate 1 — FAKTURACENTER og fælles visuel platform

- hele Gate 0 igen;
- Fakturacenterets unit-/contracttests og root build;
- browser-smoke for login, `/oekonomi/fakturacenter`, alle seks sektioner,
  back/forward, deep link og logout;
- verificér at manglende `fakturaer.laes` og manglende tenant/modul giver den
  eksisterende adgangsforklaring;
- visuel kontrol af logo, AppShell, responsiv sidebar og kendt CSS-advarsel.

### Gate 2 — FLEET

- FLEETs unit-, komponent- og buildtests før og efter shelladapteren;
- alle 36 kendte browsertests, og de fire belastningsfølsomme tests køres både
  samlet og isoleret; timeout accepteres ikke som funktionel grøn uden den
  isolerede evidens;
- browserforløb: enheder/profil/billede, indberetning→sag→arbejdskø,
  værkstedskalender/opgave, dokumentversion, leasing og mobilkladde;
- direkte links, back/forward og refresh under `/flaade/*`;
- database- og Blob-data bevares over genindlæsning på den valgte testorigin.

### Gate 3 — FACILITY

- FACILITYs nuværende unit-, repository-, komponent-, build- og Playwright-
  suite først uændret, derefter mod host-router/dependencymatrixen;
- browserforløb: ejendom/installation, indberetning med bilag→sag→opgave,
  kalender, service catch-up, dokumentversion/download, mobil-QR og økonomi;
- direkte links og parametre under `/facility/*`, inklusive browserhistorik;
- kontrol af IndexedDB-migration v1→v8, `media-blobs` og BroadcastChannel uden
  at bruge eksisterende brugerdata som testfixture.

### Gate 4 — PLANNING og samlet produktionsbuild

- alle planning-basic, adapters, input, optimization, scheduling og UI-tests;
- `git diff --check` efter de fem kode-whitespacefund er rettet som en separat,
  mekanisk ændring;
- root `vite build`, og kontrol af at Planning har en lazy chunk og kan åbnes
  via en beskyttet `/booking/*`-route fra den byggede `dist`;
- browserforløb: import→pulje→planlægning→forslag, flyt/fjern, flerdagsrute,
  notifikation og kundeændringsønske i DEV/test;
- ingen persistence eller serverhandling må antydes af UI, når den ikke findes.

### Gate 5 — samlet regression

- root lint, design, kontrast, route-splitting, rules-emulator og build;
- login som hver relevant rolle og med forskellige modulabonnementer;
- skift FLEET→FACILITY→PLANNING→FAKTURACENTER uden ekstra shell/router eller
  nulstilling af modulstate;
- deep links, refresh, browser back/forward, mobilbredde og keyboard/fokus;
- én logoasset, én authkontekst, én navigation og ingen globale CSS-lækager;
- ingen netværkskald fra lokale prototype-adaptere og ingen fixturefallback på
  afvist adgang.

## 6. Milepæl B — varig data og reelle modulforbindelser

Milepæl B begynder først, når A er stabil. Den kræver særskilte
datamodel-/sikkerhedsbeslutninger og er ikke opnået ved at dele navigation.

1. Erstat FLEETs og FACILITYs IndexedDB-repositories med serveradaptere, men
   behold deres interfaces. Stable IDs skal mappes til tenantafgrænsede,
   autoritative noder; tenant og aktør udledes af signeret claim, aldrig af
   klientpayload.
2. Definér Planning-noder, versioner, optimistic concurrency og serverflows
   for forslag/godkendelse. Accept skal genvalidere permissions, planversion og
   fælles reservationer atomisk. Transportbooking ændres fortsat gennem det
   eksisterende bookingflow.
3. Implementér Fakturacenter Reference Contract V1 server-side. Autoriserede,
   read-only destination projections kommer fra ejermodulet. En kontrolleret
   fordeling bliver en idempotent, append-only hændelse; destinationsmodulet
   genberegner faktisk omkostning. Ingen direkte browserskrivning mellem
   moduler.
4. Gem bilag i det eksisterende lukkede Storage-mønster med serverkontrollerede,
   kortlivede URL'er. Metadata, Blob og domænereference skal opdateres med en
   dokumenteret konsistensstrategi.
5. Udvid permissions, Rules, Functions og audit samlet. Klientvalidering er kun
   feedback; serveren håndhæver tenant, modul, permission, status, idempotens
   og referencesammenhæng.
6. Kør emulator-, migrations-, race-/idempotens-, cross-tenant- og
   rollbacktests. Deploy følger claims-v2-migrationsplanen og kræver særskilt
   godkendelse.

Åbne krav før B omfatter blandt andet serverkontrakt for Planning,
Facility/Fleet-identitetsmapping, autoritativ ejer af tværgående referencer,
fire-øjnepolitik for generiske planer/fakturagrundlag, udstyrsreservationer,
retention og fuld liveimplementering af fakturaadapterne.

## 7. Bevaring af lokale browserdata før senere origin-/lagerændringer

Der røres ikke browserdata i denne forberedelse. Før en senere ændring af host,
port, origin, databasenavn, schema eller repository skal der laves en separat,
godkendt backupøvelse.

Eksisterende dataområder:

- FLEET: originens IndexedDB `veyro-fleet-v2-prototype`, version 1, store
  `tenant-datasets`, standardnøgle `tenant-demo-nordic`. Dokumenter og billeder
  kan ligge som `Blob`-værdier inde i datasættet. LocalStorage omfatter blandt
  andet `veyro-mobile-demo-user` og `veyro:fleet-v2:fleet-menu-open`.
- FACILITY på den dokumenterede origin `http://127.0.0.1:5189`: IndexedDB
  `veyro-facility-v2`, version 8, stores `tenant-datasets` og `media-blobs`,
  standardnøgle `tenant-veyro-demo-ejendomme`. LocalStorage indeholder
  pakkevalg, menutilstand, rapportkladder og kalenderpanelbredde.
- PLANNING: hovedtilstanden er React-memory og synkroniseres kun midlertidigt
  mellem åbne faner via `BroadcastChannel`; genindlæsning nulstiller den.
- FAKTURACENTER: hovedtilstanden er React-memory; Reference Contract V1 er ren
  domænelogik, ikke persistence.

Backupforløb før fremtidige ændringer:

1. Registrér browserprofil og præcis origin for hvert lokalt modul. IndexedDB
   er bundet til scheme + host + port; samme path er samme origin, ny port er et
   nyt dataområde.
2. Tilføj først et versionsstyret, read-only eksportværktøj til hver lokal
   repositoryadapter. Det skal læse alle stores i readonly-transaktioner,
   eksportere datasetmanifest, databasenavn/-version, tenantnøgler og alle Blobs
   med filnavn, MIME, størrelse og SHA-256. JSON alene er ikke tilstrækkeligt
   til bilag.
3. Gem eksporten uden for repositoryet og verificér checksums. Prøv import i en
   tom, disponibel browserprofil/origin med et andet databasenavn; verificér
   antal poster, relationer, dokumentversioner og at bilag kan åbnes.
4. Start milepæl A på en ny, fast DEV-origin/port eller med nye
   `-integration-v1`-databasenavne. Genbrug ikke en eksisterende origin og et
   eksisterende databasenavn, før en eksplicit, testet migrationsfunktion er
   godkendt.
5. Slet aldrig site data, unregister aldrig databaser, og overskriv ikke en
   højere datasetversion. Behold de gamle modulservere/origins som read-only
   fallback gennem hele A.
6. Når servermigration senere planlægges, uploades intet automatisk. Vis først
   dry-run med tenant, post-/blobtal, ID-kollisioner, uunderstøttede felter og
   destinationsmiljø. En eksplicit godkendelse kræves før skrivning.

En kopi af browserprofilens rå lager kan bruges som ekstra katastrofekopi, men
ikke som eneste backup: den er browser-/profil- og originbundet og er sværere at
validere end en repositoryeksport.

## 8. Ansvar og videre arbejde efter samlingen

Når den samlede kode er grøn, oprettes nye modulbranches/worktrees fra den
samme godkendte integrations-HEAD. De eksisterende branches beholdes som
historiske checkpoints.

- FLEET-chatten ejer FLEET-komponenter, domænefunktioner, lokal/server-
  repositoryadapter og FLEET-tests.
- FACILITY-chatten ejer tilsvarende FACILITY-områder.
- PLANNING-chatten ejer Planning-kerner, UI og egne tests, men ikke bookingens
  eksisterende servertilstandsmaskine eller fælles reservationshåndhævelse.
- FAKTURACENTER-chatten ejer intake, match, fordeling, kontrol og egne tests,
  men ikke ejermodulernes data eller serverautoritet.
- Integrationstråden ejer fælles shell, routing, nav, tokens/logo, auth/claims,
  permissions, build/dependencies, tværgående kontrakter/adapters, Rules,
  Functions-grænser og samlet regression.

Et modulbidrag må gerne foreslå en fælles ændring, men den fælles del skal være
et separat commit med påvirkede moduler og testgate angivet. Modulchats må ikke
merge den gamle checkpointbranch tilbage efter dette punkt; de arbejder fra den
samlede kode og får ændringer tilbage gennem integrationsbranchens normale
mergeflow.

## 9. Anbefalet første implementeringstrin

Efter gennemgang af denne plan er første implementeringstrin Gate 0 efterfulgt
af FAKTURACENTER-merge ved det fulde checkpoint. Verificér claims-v2-basens
tests først; merge derefter Fakturacenteret og fastlås den fælles
AppShell/logo/tokenkontrakt med route-, design- og browser-smoke. Monter endnu
ikke FLEET/FACILITY/PLANNING i samme ændring.

Det giver en grøn, sikker platformreference før de tre isolerede shells og
styles adapteres, og det holder “fælles navigation” klart adskilt fra den
senere milepæl B med varig data og live modulforbindelser.

## 10. Gate 0-kørselslog — 2026-09-09

Kørslen blev udført på `codex/veyro-integration-v1` efter det særskilte
plancommit `29b67e6` og med sikkerhedsbasen
`e62093b3722aa114dd46d0380847e638334660ab` som dens forælder.

- `npm ci`: gennemført; 388 pakker installeret. NPM rapporterede 21 kendte
  dependency-sårbarheder (18 moderate og 3 high). Der blev ikke kørt
  `npm audit fix`, så lockfilen blev ikke ændret.
- `npm run lint`: bestået.
- `npm run build`: bestået med den allerede kendte CSS-syntaksadvarsel fra en
  kommentar med backticks i `fleet.css`.
- Målrettet `node --test` for claims-v2, preflight, provisionering,
  chaufføradgang, leverandørportal, rutedeling og Functions-kopiparitet:
  98/98 bestået.
- `npm run test:rules`: ikke gennemført. Firebase CLI 15.29.0 kræver Java 21
  eller nyere, mens maskinens eneste fundne runtime er Temurin Java 8
  (`1.8.0_502`). Emulatorerne lukkede derfor ned, før rules-testene blev kørt.

Gate 0 er dermed **ikke bestået**. I overensstemmelse med stopkriteriet er
FAKTURACENTER-checkpointet ikke merget, og der er ikke startet en integreret
server eller udført browser-smoke. Næste forsøg skal bruge en lokalt tilgængelig
JDK 21+ og genkøre hele rules-suiten i det syntetiske
`demo-fleetcontrol-rules-test`-projekt, før merge må foretages.

## 11. Gate 0 afsluttet og FAKTURACENTER integreret — 2026-09-09

Dette afsnit fortsætter den historiske, blokerede kørsel i afsnit 10. Der er
fortsat ikke pushet, deployet, ændret backend eller integreret FLEET, FACILITY
eller PLANNING.

### Java- og sikkerhedsgate

- Maskinen er Windows x64. Den eksisterende globale Temurin Java 8 blev
  bevaret uændret.
- Officiel Eclipse Temurin `21.0.12.1+1-LTS` blev hentet som Windows x64 ZIP
  fra Adoptiums officielle API og pakket ud i
  `C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.12.1+1\jdk-21.0.12.1+1`.
  Udgiverens og den lokale fils SHA-256 var begge
  `f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e`.
- `JAVA_HOME`, `PATH`, `TEMP` og `TMP` blev kun sat i test-/emulatorprocessen.
  `java -version` og den levende Database-/Storage-emulator blev kontrolleret
  til at bruge netop JDK 21-stien. Et første forsøg ramte en Windows
  loopback/WEPoll-fejl i sandboxens TEMP-sti; en kort, proceslokal TEMP-sti
  (`C:\jtmp-veyro-gate0`) løste miljøfejlen uden ændringer i regler eller tests.
- Den endelige `npm run test:rules` kørte Database og Storage isoleret mod
  demo-projektet `demo-fleetcontrol-rules-test`: 3.966/3.966 tests i 819 suites
  bestod. Det omfatter login, claims-v2/dual-read, revocation,
  tenantadskillelse, permissions og Rules-regression. Den tidligere målrettede
  Gate 0-kørsel på 98/98 sikkerhedstests gælder fortsat for den samme kode.
- `npm run lint`, `npm run build` og `git diff --check` bestod. Builden har den
  kendte CSS-kommentaradvarsel i `fleet.css`; browseren har de to eksisterende
  React Router v7-fremtidsadvarsler, men ingen nye konsolfejl.
- De 21 rapporterede dependency-sårbarheder (18 moderate, 3 high) er et åbent
  punkt. Der er ikke kørt `npm audit fix` eller foretaget brede opgraderinger.

Gate 0 er efter denne kørsel **bestået**. Claims-v2 er ikke deployet;
auth-inventering og legacy-allowlist forbliver senere deploymentforberedelse.

### Sporbar merge og nødvendige tilpasninger

FAKTURACENTER-checkpointet
`deb1615f58926bb0857714c40b62037fb6c1414e` blev merget med bevaret historik i
det eksplicitte merge-commit
`aef2b32979934daf3a1d82701f41b1a4b9b641ca`. Mergen ændrede ikke
`src/firebase.js`, permissions, Functions, Database Rules eller Storage Rules;
grundplatformens claims-v2, revocation og serverhåndhævelse blev derfor
bevaret.

Efter faglig gennemgang blev kun disse integrationstilpasninger nødvendige:

- Fakturacenter-ruten kontrollerer `fakturaer.laes` før prototypen tegnes. En
  direkte URL giver ikke en adgang, som navigationen skjuler.
- Login bruger samme `VeyroLogo`-komponent som AppShell. Fakturacenterets
  eksisterende submenuer, tællere, tre paneler, match, fordelinger og
  kontrolflow er ellers bevaret.
- Browser-smoke kan køre mod isolerede Auth- og Database-emulatorer. Vejen er
  fail-closed og kræver samtidig Vite DEV, localhost, eksplicit flag og et
  `demo-*`-projekt; produktionskonfiguration kan ikke bruge den ved et uheld.
  Den lokale `.env.local` er ignoreret og indeholder kun demo-konfiguration.
- En regressionstest fastholder route-gaten, fælles logo og emulatorværnet.
  README's automatisk kontrollerede testfilstal blev rettet fra 167 til 168.

Reference Contract V1 er uændret: Git-blobben for
`docs/FAKTURACENTER_REFERENCE_CONTRACT_V1.md` er fortsat
`c09c0535eb2e09b0e74efd4aa8d933b2f6b182ad`, identisk med checkpointet.

### Browser-smoke og lokal afprøvning

Browser-smoken brugte kun syntetiske emulatorbrugere og demo-tenantdata.
Adminforløbet bestod login, Indbakke, Til kontrol og Kontrollerede; submenuens
tællere var henholdsvis 19, 9 og 1, paneldelingerne var 24/48, og match,
fordeling og kontrol blev vist. Direkte åbning og genindlæsning af
Fakturacenter-ruten bevarede visningen. En bruger uden `fakturaer.laes` så
hverken menupunktet eller prototypen og blev afvist efter både direkte URL og
genindlæsning. Veyro-logo, navigation og paneler gav ingen konsolfejl.

Den integrerede Vite-server bruger strict port på
`http://127.0.0.1:5197/`. Auth/Database/Storage kører lokalt på henholdsvis
9099/9000/9199 under demo-projektet `demo-veyro-integration`. Emulatorindholdet
er disponibelt og nulstilles ved stop; der er ikke læst eller skrevet
produktionsdata eller eksisterende browserdata.

FAKTURACENTER er fortsat prototypefunktionalitet med lokal, syntetisk tilstand.
Dette trin etablerer hverken rigtig fakturamodtagelse, fælles serverlagring
eller live modulforbindelser; det hører til milepæl B.
