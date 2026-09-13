# Veyro – integrationsforberedelse V2

> **Opdatering 13. september 2026:** Afsnittene om manglende checkpoints er
> historisk forberedelsesstatus. De præcise leverancer er nu modtaget og
> lokalt integreret: PROCURE `eef500ae834d159c8aaf5a3e6b878170bf2571e5`,
> Support `aae761d18e8835cc2c572316068f8f51e50aaee8` og hele Ejerkonsollen
> `f4683049a68fac5265e31ceafb22d6684f736a34`, inklusive permanent adapter
> `f7325ea94044a577a9660b323270f965ae4ac8a7`. Afstande og slutgate fremgår af
> `VEYRO_INTEGRATION_AFSLUTNING_V2.md`; denne fil omskrives ikke bagud, fordi
> den dokumenterer beslutningsgrundlaget før sammenlægningen.

Dato: 13. september 2026

Modtagerside: `codex/veyro-integration-v1`

Formål: verificeret baseline og fælles acceptgrundlag for en senere, separat integration af PROCURE og Ejerkonsol.

## 1. Konklusion og afgrænsning

Integrationsworktreeet er en ren og sporbar modtagerside. Den aktuelle fælles
version indeholder FLEET, FACILITY, PLANNING og Fakturacenter med deres hidtil
godkendte integrationstilpasninger. Den indeholder også platformens ældre
PROCURE-ruter og en basal ejerflade, men **ikke** de nye leverancer fra
`codex/procure-integrated-development` eller
`codex/ejer-integrated-development`.

PROCURE har afleveret en særskilt rapport på sin lokale branch. Ejerkonsollen
har nu et afgrænset V8.1-supportprodukt, men den fulde ejerleverance mangler
stadig ét entydigt overleveringscheckpoint. Det tværgående kundesupportspor har
desuden færdiggjort fælles supportendpoints og et lokalt forbindelsesbevis;
denne kode er ikke indarbejdet i integrationsbranchen. Endelig
integrationsrækkefølge og konfliktløsning fastlægges derfor ikke endnu.

Denne opgave har ikke ændret produktkode, andre worktrees, lokale browserdata,
emulatorindhold, backend eller deployment. Der er ikke foretaget merge,
synkronisering, push eller datamigration.

## 2. Verificeret Git-grundlag

Målingen blev foretaget efter `git fetch origin --prune` uden ændring af lokale
arbejdsbranches.

| Punkt | Verificeret værdi før dette dokumentationscommit |
| --- | --- |
| Worktree | `C:/Users/DennisChristensen/Documents/GitHub/Fleet_V3-integration` |
| Branch | `codex/veyro-integration-v1` |
| HEAD før denne opdatering | `6e164c9a0987096f1491a1d64c1846535b14683a` |
| Upstream | `origin/codex/veyro-integration-v1` |
| Remote HEAD, read-only verificeret 13. september | `39963337a52d4464f619077683d1f39aa81eff1e` |
| Ahead/behind før denne opdatering | `1/0` |
| Origin | `https://github.com/Jwwl7852/Fleet_V3.git` |
| Arbejdsstatus før dokumentet | Ren |
| Sikret fælles produktbase | `989dbb87db639efed0ba1b5a1e271560f7659a0c` |

Commit `39963337…` ligger ét dokumentationscommit foran produktbasen og tilføjer
kun `docs/VEYRO_MODULUDVIKLINGSSPOR_V1.md`. Commit `6e164c9…` tilføjer første
version af denne integrationsforberedelse. Ingen af dem ændrer produktkode.

Følgende styrende dokumenter er læst som grundlag:

- `docs/VEYRO_INTEGRATIONSPLAN_V1.md`.
- `docs/VEYRO_MODULUDVIKLINGSSPOR_V1.md`.
- Repositoryets gældende arbejds- og sikkerhedsinstruktioner.

## 3. Hvad den fælles version allerede indeholder

| Modul | Sikret checkpoint i historikken | Integreret route | Status i modtagersiden |
| --- | --- | --- | --- |
| FLEET | `3725ac0553ad711a1d52a8d24fad3f14977d8e8e` | `/fleet-v2/*` | Integreret og efterfølgende godkendt visuelt |
| FACILITY | `1b755defb49e17aec0282427737c40bcb4a29004` | `/facility-v2/*` | Integreret og efterfølgende godkendt funktionelt |
| PLANNING | `550a19c70684b123715e656d7d171a0d4992fed7` | `/planning-v2/*` | Alle 74 checkpointfiler kontrolleret; fortsat under udvikling |
| FAKTURACENTER | `deb1615f58926bb0857714c40b62037fb6c1414e` | `/oekonomi/fakturacenter` | Integreret og efterfølgende godkendt visuelt |

Reference Contract V1 er bevaret som
`docs/FAKTURACENTER_REFERENCE_CONTRACT_V1.md`. Filens aktuelle Git-blob er
`c09c0535eb2e09b0e74efd4aa8d933b2f6b182ad`, oprindeligt indført ved
`e66a75108f1d6e46eb365db9bc2d90cb246cd61b`.

Den fælles version har desuden ældre, platformhistoriske indkøbsfunktioner på
`/indkoeb/*` og den basale ejergrænse `/main` og `/main/priser`. De må ikke
forveksles med de nye PROCURE- og Ejerkonsol-leverancer.

### 3.1 De fire eksisterende modulspor

Alle fire spor er rene, står på den sikrede produktbase, har ingen upstream og
har ingen commits efter den fælles produktbase. Sammenlignet med det aktuelle
integrations-HEAD er de alene ét integrationsdokumentationscommit bagud.

| Spor | Lokal branch | HEAD | Integration vs. spor |
| --- | --- | --- | --- |
| FLEET | `codex/fleet-integrated-development` | `989dbb87db639efed0ba1b5a1e271560f7659a0c` | 1 / 0 |
| FACILITY | `codex/facility-integrated-development` | `989dbb87db639efed0ba1b5a1e271560f7659a0c` | 1 / 0 |
| PLANNING | `codex/planning-integrated-development` | `989dbb87db639efed0ba1b5a1e271560f7659a0c` | 1 / 0 |
| FAKTURACENTER | `codex/fakturacenter-integrated-development` | `989dbb87db639efed0ba1b5a1e271560f7659a0c` | 1 / 0 |

Ingen af disse branches blev sammenlagt, opdateret eller på anden måde ændret.

### 3.2 PROCURE-sporet

| Punkt | Aktuel read-only observation |
| --- | --- |
| Worktree | `C:/Users/DennisChristensen/Documents/GitHub/Fleet_V3-procure-integrated` |
| Branch | `codex/procure-integrated-development` |
| HEAD | `eef500ae834d159c8aaf5a3e6b878170bf2571e5` |
| Produktcheckpoint i rapporten | `4f613bdd41632629717e93247f8d9dc7a3ea534b` |
| Fælles forfader | `989dbb87db639efed0ba1b5a1e271560f7659a0c` |
| Divergens fra integration | Integration 1 commit / PROCURE 22 commits |
| Upstream/origin-ref | Ingen |
| Lokal status | 11 ikke-sporede review/output-poster; ingen af dem er med i checkpointet |
| Overleveringsrapport | `docs/VEYRO_PROCURE_INTEGRATIONSOVERLEVERING_V1.md` på `eef500ae…` |

PROCURE-branchen flyttede under denne forberedelse fra produktcheckpointet
`4f613bdd…` til det separate rapportcommit `eef500ae…`. Det er forventet
modularbejde og er kun registreret; integrationsworktreeet blev ikke
synkroniseret.

Rapporten beskriver 147 ændrede filer og 33.840 tilføjelser mod den fælles
forfader. Modulindgangen er `src/moduler/indkoeb/ProcureModule.jsx`, og det nye
modul ligger primært i `src/fleet/procure-v2/**`. Ruterne fortsætter under det
eksisterende `/indkoeb/*`, hvilket gør router- og kompatibilitetsreview
obligatorisk frem for at oprette et parallelt route-prefix.

Leverancen berører også fælles router, AppShell, navigation, tokens/CSS,
Firebase-klient, Functions, Database/Storage Rules, faktura-, leverandør-, mail-
og indkøbskontrakter samt Functions-dependencies. Den må derfor ikke integreres
som en blind filkopi eller ved generelt valg af `ours`/`theirs`.

### 3.3 Ejerkonsol-sporet

| Punkt | Aktuel read-only observation |
| --- | --- |
| Worktree | `C:/Users/DennisChristensen/Documents/GitHub/Fleet_V3-ejer-integrated` |
| Branch | `codex/ejer-integrated-development` |
| HEAD | `7fa23cdd7f189e9adec8e56fb36168ad2d547fc3` |
| Afgrænset V8.1-supportprodukt | `2c25c196ae980995849a12b06f805551c98f9f63` |
| Fælles forfader | `989dbb87db639efed0ba1b5a1e271560f7659a0c` |
| Divergens fra fælles produktbase | Ejerkonsolens nyere V8/V8.1-historik ligger kun lokalt |
| Upstream/origin-ref | Ingen |
| Lokal status | Tracked ren; ikke-sporede reviewarkiver og screenshots er bevaret |
| Endelig overleveringsrapport/checkpoint | Mangler endnu |

Den committede branch udvider ejerområdet under `/main/*` med egen lazy-loadet
`EjerRamme`, salg, kunder, tilbud, mail, support, økonomi, rapporter,
integrationer og ejerindstillinger. `2c25c196…` er det afgrænsede V8.1-
supportprodukt. De efterfølgende commits dokumenterer review og udvider den
mobile AI-historik; de ændrer ikke den fælles supportserver. Den fulde
Ejerkonsol kan først integreres, når ejerchatten udpeger ét samlet checkpoint
og en komplet overleveringsrapport.

### 3.4 Tværgående Support V1.1

| Punkt | Aktuel read-only observation |
| --- | --- |
| Worktree | `C:/Users/DennisChristensen/Documents/GitHub/Fleet_V3-support-kundeplatform` |
| Branch | `codex/support-kundeplatform-development` |
| Produktcheckpoint | `aa269edc0e757ff6b5c2f2beddd628c643057c71` |
| Fælles forfader med integration | `6e164c9a0987096f1491a1d64c1846535b14683a` |
| Upstream/origin-ref | Ingen; `git ls-remote` viste ingen publiceret supportbranch |
| Lokal status | Produktet er committet; urelaterede UNIT/Warehouse/Workforce-reviewfiler er untracked og bevaret |

Supportsporet tilføjer kundens `/support`, én autoritativ `support/`-model,
kundevendt lokal AI, ejerprojektion samt endpoints til kø, overtagelse, intern
AI, intern baggrund, note, kladde, godkendelse og portaltransport. Et isoleret
bevis viste samme sag gennem begge faktiske UI'er. Ejerens permanente
V8.1-adapterændring er fortsat ejerchattens ansvar. Supportkoden er **ikke**
indeholdt i den aktuelle integrationsbranch og må integreres som en selvstændig
leverance, ikke skjult i PROCURE- eller Ejerkonsol-mergen.

Read-only GitHub-kontrol viste kun
`origin/codex/veyro-integration-v1 = 39963337…` og den historiske
`origin/codex/fakturacenter-intake-v1-dev = deb1615f…` blandt de relevante
navne. Support-, PROCURE- og Ejerbranches er ikke publiceret under deres lokale
branch-navne. Der blev ikke fundet en nyere publiceret Fakturacenterleverance.

De ældre Fakturacenter-spor er også afklaret lokalt:
`codex/fakturacenter-intake-v1` står på
`375531f39bd46f9e964a9643ec2432a2a8aeeca6`, mens
`codex/fakturacenter-intake-v1-dev` og dens origin-ref står på det integrerede
checkpoint `deb1615f58926bb0857714c40b62037fb6c1414e`. Checkpointet ligger to
commits foran den ældre branch: Reference Contract V1
`e66a75108f1d6e46eb365db9bc2d90cb246cd61b` og selve workflowcheckpointet.
Der er således ingen nyere Fakturacenter-commit, som bør indarbejdes før den
fulde Ejerkonsol; fremtidigt Fakturacenterarbejde skal komme fra det
integrerede udviklingsspor med et nyt eksplicit checkpoint.

## 4. Modtagersidens platformbaseline

### 4.1 Router, rammer og navigation

- `src/main.jsx` monterer React og importerer den fælles stilkilde
  `src/fleet/fleet.css`.
- `src/App.jsx` ejer login-, claim- og topniveaurouting. Hver aktiv
  sikkerhedsgrænse har én `BrowserRouter`; der tegnes ikke flere platformrammer
  oven i hinanden.
- Den almindelige tenantbruger går gennem `FleetProvider` og den fælles
  `AppShell` i `src/fleet/AppShell.jsx`.
- Fælles navigation og modulmetadata ligger i `src/fleet/nav.js`,
  `src/fleet/moduler.js` og `src/fleet/modulfaner.js`.
- FLEET, FACILITY og PLANNING er lazy-loadede moduler under AppShell;
  Fakturacenter er lazy-loadet på den fælles økonomirute.
- Ejerkontoen afgøres før tenant-adgangen og bruger en sideordnet ejergrænse.
  Den almindelige AppShell må ikke genbruges på en måde, der giver ejeren en
  tenant eller viser kundens navigation.
- Ekstern leverandørportal og chaufførflade er ligeledes sideordnede grænser og
  må ikke svækkes af de kommende merges.

### 4.2 Tema, logo og typografi

- `src/fleet/fleet.css` er den fælles token- og farvekilde og har præcis ét
  `:root`-katalog.
- `src/fleet/VeyroLogo.jsx` bruger det fælles aktiv
  `src/assets/veyro/veyro-systems-logo.png`.
- Standardskriften er `Inter`, med systemfallbacks som kun anvendes, hvis Inter
  ikke er tilgængelig.
- `test/design-tokens.test.mjs` håndhæver, at JS/JSX ikke indfører rå farver,
  at andre CSS-filer ikke opretter egne globale tokenkilder, og at PLANNINGs
  nødvendige standalone-fallback er låst.
- PROCURE og Ejerkonsol skal genbruge disse kilder. Modulspecifik CSS skal være
  scoperet, og ændringer i globale selectors kræver tværmodulreview.

### 4.3 Login, claims, tenant og rettigheder

- Firebase Auth-status læses i `src/App.jsx`; kundeadgang kræver et autentisk
  `tenant`-claim. En almindelig indlogget bruger uden tenant får ikke adgang til
  kundeshellen.
- Den centrale rettighedskilde er `src/fleet/permissions.js`; den identiske
  serverkopi ligger i `functions/delt/permissions.js`.
- Claims-versionen er `pv: 2`. Permissionkataloget har 58 værdier med frosne,
  kompakte koder; samlet budget er 750 byte under Firebase-grænsen på 1.000
  byte.
- Kun de boolske ekstra claims `udbyder` og `devTester` er allowlistet. De kan
  ikke udstedes af browseren.
- Database Rules håndhæver revocation via `authRevocations`, tenantmatch,
  aktivt abonnement, modulvalg og permissions. Den tidsbegrænsede legacyvej
  kræver serverstyret `legacyClaimsAllowlist` med matchende tenant og udløbstid.
- Ejeradgang er et sideordnet `udbyder === true`-claim uden tenant. Ejerens
  serverfunktioner kontrollerer claimet som første handling; ejerclaimet må ikke
  blive en genvej til kundens almindelige tenanttræ.
- Auth-inventering, legacy-allowlist og claims-v2-deployment er fortsat
  deploymentforberedelse og er ikke udført her.

### 4.4 Functions, Rules og kontrakter

| Artefakt | Aktuel Git-blob / egenskab |
| --- | --- |
| `firebase.rules.json` | `e7f835c8c4b8dd8f305e328359d7f15060dbbae4` |
| `storage.rules` | `fc26cd1f0ff96c55c4ad62199759764370e7cfd1` |
| `functions/index.js` | Callables/schedules med fælles auth-, tenant-, audit- og domænehåndhævelse |
| `functions/delt/**` | Genererede, identiske kopier af delte domæneregler |
| `docs/FAKTURACENTER_REFERENCE_CONTRACT_V1.md` | Uændret kontraktblob `c09c0535…` |
| PLANNING-kontrakter | `src/fleet/planning-basic-v2-kontrakt.js` og `src/fleet/planning-optimization/kontrakt.js` |

Functions kører som `nodejs20`. `firebase.json` har kun manuelle deploymål og
en predeploy-kopi af delte filer; konfigurationen udgør ikke i sig selv et
automatisk deployment.

### 4.5 Dependencies og lockfiler

| Område | Manifest / faktisk låst version |
| --- | --- |
| React | `^18.3.1` / `18.3.1` |
| React Router DOM | `^6.26.2` / `6.30.4` |
| Firebase Web SDK | `^10.12.2` / `10.14.1` |
| Vite | `^5.4.8` / `5.4.21` |
| ESLint | `^10.8.1` / `10.8.1` |
| Rules Unit Testing | `^3.0.4` / `3.0.4` |
| Functions firebase-admin | `^12.7.0` / `12.7.0` |
| Functions firebase-functions | `^6.1.0` / `6.6.0` |

Begge lockfiler bruger lockfileversion 3. Integrationen skal undgå en bred
router-, Vite- eller dependencyopgradering. En nødvendig ny dependency skal
forklares, låses og testes i både root og Functions, hvor relevant.

Kontrolhashes:

| Fil | Git-blob |
| --- | --- |
| `package.json` | `c9a4f2af7ea1427769391cc733b5cf5105a24805` |
| `package-lock.json` | `53cde3e7aefd489db16c3f4e1c5c4f613b863242` |
| `functions/package.json` | `8380b1c1bbfe0be810c80a60932afa36bc06ff6c` |
| `functions/package-lock.json` | `2bd3df83347c45746c881d2c226087c39b458c0a` |
| `firebase.json` | `985381b6336c9af7986bab35fe59d401a0d6eb11` |
| `firebase.rules-test.json` | `2343f57aeb5242cb2d76d00e7b7a31464dd0b83b` |

## 5. Aktuel værktøjs- og testbaseline

### 5.1 Faktisk anvendte versioner

| Værktøj | Målt version / placering |
| --- | --- |
| Lokal Node | `v24.19.0` |
| Lokal npm | `11.17.0` |
| CI/Functions Node | Node 20 i workflow og Functions-runtime |
| Firebase CLI | `15.29.0`, låst i `test:rules` via `npx --yes firebase-tools@15.29.0` |
| Global Java på PATH | Temurin JRE `1.8.0_502` |
| Java til Rules-test | Temurin JDK `21.0.11+10-LTS` i `C:/Users/DennisChristensen/Tools/Adoptium/jdk-21.0.11+10/jdk-21.0.11+10` |
| Database Emulator | Cachebinær `firebase-database-emulator-v4.11.2.jar` |
| Storage Rules runtime | Cachebinær `cloud-storage-rules-runtime-v1.1.3.jar` |

JDK 21 blev kun valgt i testprocessens `JAVA_HOME` og `PATH`. Global Java 8 og
globale miljøvariabler blev ikke ændret. På denne Windows-maskine kræver Java
desuden den allerede dokumenterede processlokale indstilling
`JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Temp\veyro-jdk21-sockets`.

### 5.2 Kontroller kørt på `39963337…`

| Kontrol | Resultat |
| --- | --- |
| `npm run lint` | Bestået |
| `npm run test:design` | 11/11 bestået |
| `npm run build` | Bestået; Vite 5.4.21 transformerede 565 moduler |
| `npm run test:rules` på integrations-HEAD | 4.289/4.289 bestået, 877 suites, 0 fejl |
| `node --check functions/index.js` | Bestået |
| `node --test test/functions-delt.test.mjs` | 29/29 bestået |
| `git diff --check` | Bestået |

Rules-suiten kørte Database og Storage på de isolerede porte 9200/9399 mod
demo-projektet `demo-fleetcontrol-rules-test`. Firebase CLI bekræftede, at
ikke-emulerede tjenester for demo-projektet ville fejle. Der blev kun anvendt
syntetiske data.

Første Rules-forsøg stoppede, fordi Java ikke kunne oprette Windows-loopback
til sin selector. Det var en miljøfejl, ikke en regel- eller produktfejl.
Genkørsel med den korte socketmappe bestod fuldt. De forventede
`permission_denied`-linjer i output er negative sikkerhedstests.

Den første design-/buildkørsel i den begrænsede proces-sandbox gav `spawn
EPERM`; de samme kommandoer bestod uden for sandboxens procesbegrænsning uden
kodeændringer.

Produktionsbuildet har fortsat den kendte CSS-minifieradvarsel om et backtick i
en kommentar i Fakturacenterets CSS. Det er ikke en buildfejl, men bør ryddes i
en separat, afgrænset ændring.

Der blev ikke startet browser- eller modulservere og derfor ikke udført en ny
browser-smoke i denne dokumentationsopgave. De tidligere browserbeviser og
brugerens manuelle godkendelser er historik, ikke en ny måling.

Supportproduktet blev senere prøvet separat uden at ændre integrationskoden:
78/78 målrettede tests, lint, build og en fuld Rules-gate på 4.304/4.304 tests
bestod. Det højere antal skyldes supporttestens nye kontrakt- og Rules-dækning;
det er ikke et testresultat på integrationsbranchen. Browserbeviset brugte
samme syntetiske sag i kunde- og ejer-UI og fandt ingen intern datalækage.

### 5.3 Dependency-sårbarheder

Read-only `npm audit --json` blev kørt uden `npm audit fix`:

- Root: 21 advisories — 3 high, 18 moderate, 0 critical.
- Functions: 11 advisories — 11 moderate, 0 high/critical.
- Flere automatiske forslag indebærer større versionstrin, blandt andet Vite 8
  og firebase-admin 14. De skal behandles som en særskilt opgave med
  regressions- og sikkerhedsreview, ikke skjules i en modulmerge.

## 6. Lokale servere, porte og dataområder der skal bevares

Ved den første procesmåling lyttede ingen Vite-, Node-, Java- eller
Firebaseprocesser på de relevante integrationsporte. Under den efterfølgende,
isolerede supportprøve var den allerede eksisterende port 5214 optaget og blev
ikke rørt. Supportprøven brugte midlertidigt kunde 5216, ejer 5215 samt Auth
9198, Database 9290 og Functions 5099. Disse porte er ikke fælles standarder,
og de midlertidige processer skal stoppes efter bevisindsamlingen.

| Formål | Port / område |
| --- | --- |
| Fælles integrationsapp | `127.0.0.1:5197`, altid med `strictPort` |
| Oprindelig FLEET-prototype | `127.0.0.1:5187` |
| Oprindelig FACILITY-prototype | `127.0.0.1:5189` |
| Oprindelig PLANNING-prototype | `127.0.0.1:5190` |
| Fælles lokale emulatorer | Auth 9099, Database 9000, Storage 9199, Functions 5001 |
| Isolerede Rules-tests | Hub 4410, logging 4510, Database 9200, Storage 9399 |
| Modulworktrees | 5201–5204 som dokumenteret i moduludviklingsvejledningen |

Den ignorerede `.env.local`, `node_modules`, `dist` og emulatorlogfiler blev
bevaret lokalt og er ikke læst ind i rapporten eller tilføjet til Git.

Browserdata må ikke nulstilles, migreres eller genbruges på tværs af origins:

- FLEET-integrationen bruger IndexedDB
  `veyro-fleet-v2-integration-v1`; automatiske tests bruger
  `veyro-fleet-v2-integration-tests-v1`. Den oprindelige prototypes
  `veyro-fleet-v2-prototype` og bilag på den gamle origin røres ikke.
- FACILITY-integrationen bruger
  `veyro-facility-v2-integration-v1`; E2E bruger
  `veyro-facility-v2-test-e2e`. Den oprindelige
  `veyro-facility-v2`, inklusive Blob-lager, røres ikke.
- PLANNINGs aktuelle forretningsdata er syntetisk React-hukommelsestilstand.
  BroadcastChannel-navnet er scoperet efter integrationsmiljø, tenant og
  bruger og skal lukkes ved unmount/skift.
- Fakturacenterets prototypeflow ligger i browserhukommelsen; panelbredden
  ligger lokalt under `veyro:fakturacenter:panel-layout:v1`.

Ingen fælles emulator må startes, seedes, importeres, eksporteres eller
nulstilles af et modulspor uden koordination. Lokale testservere skal bruge en
ledig port med `strictPort`, særskilte syntetiske databasenavne og må ikke
forbinde til en rigtig backend som utilsigtet standard.

## 7. Read-only kontrol af automatisk deployment

### Verificeret i repositoryet

- Den eneste GitHub Actions-fil er
  `.github/workflows/custom-claims-v2.yml`.
- Dens `push`-trigger omfatter kun `codex/firebase-custom-claims-v2` og
  `master`; pull requests mod `master` samt manuel `workflow_dispatch` er også
  omfattet.
- Et push til `codex/veyro-integration-v1` eller de nuværende modulbranch-navne
  udløser derfor ikke dette workflow ud fra den committede YAML.
- Workflowet verificerer og bygger, men indeholder ingen deploykommando.
- `firebase.json` og package-scripts har manuelle Firebase-deploykommandoer;
  ingen repositoryworkflow kalder dem automatisk.
- `netlify.toml` bygger med `npm run build`, publicerer `dist` og definerer
  miljøkonteksten `branch-deploy` med DEV-konfiguration. Filen angiver ikke,
  hvilke branches Netlify-webhooket vælger at bygge.

### Ikke verificerbart fra checkoutet

Netlify-siteindstillinger, branch-deploy-filtre, GitHub App/webhooks,
build-hooks og eventuelle eksterne CI-regler ligger ikke i repositoryet og er
ikke tilgængelige gennem den lokale checkout. Derfor kan rapporten ikke love,
at et fremtidigt push til en ny modul- eller integrationsbranch ikke udløser en
Netlify branch deploy. Dette skal kontrolleres read-only i Netlify/GitHub-admin
før næste push. Ingen hostingindstilling blev ændret, og intet push blev udført.

## 8. Fælles acceptkrav til næste integrationsrunde

Disse krav gælder både PROCURE og Ejerkonsol, med respekt for deres forskellige
sikkerhedsgrænser.

### 8.1 Visuelt grundlag og adgangsgrænser

- Genbrug Veyros fælles tema, Veyro-logo og Inter.
- PROCURE monteres i kundens eksisterende router/AppShell uden en ekstra shell.
- Ejerkonsollen beholder sin egen `udbyder`-claimgrænse og en separat
  ejer-ramme. Fælles tema betyder ikke fælles tenantadgang.
- Modulspecifik CSS scopes under en entydig modulrod. Globale selectors og
  fælles tokens ændres kun efter samlet review.

### 8.2 Klikbare rækker

- En klikbar række viser håndmarkør og tydelig hover/fokus-fremhævning.
- Den kan aktiveres med Enter og Space og har korrekt semantik eller tilsvarende
  tastaturadfærd.
- Indre links, knapper, menuer og checkboxes beholder deres egen fokus- og
  klikadfærd og må ikke via bubbling åbne rækken.
- Browserkontrollen skal dække mus, tastatur og de indre interaktive elementer.

### 8.3 Dialoger og ugemte ændringer

- Dialoger kan lukkes med ESC, X og Annuller.
- Hvis der findes ugemte forretningsændringer, kræver alle tre lukkeveje en
  ensartet beskyttelse mod tab.
- Fokus returnerer til det element, der åbnede dialogen.
- Gem holder dialogen åben under lagring og lukker først efter bekræftet succes.
  Fejl vises uden at kassere brugerens input.

### 8.4 Bekræftelse og automatisk lagring

- Eksplicit **Gem** for forretningsdata og enhver tilladt **Slet**-handling
  kræver bekræftelse. Hvor domænet kun tillader arkivering, deaktivering eller
  soft delete, må UI'et ikke introducere en ny hard-deletevej.
- Visningsindstillinger er en særskilt kategori: Normal/Kompakt menu,
  arbejdsområdezoom, panelbredder og seneste visning må gemmes automatisk og
  lydløst, så træk og layoutjustering ikke udløser gentagne dialoger.
- Ugemt-beskyttelsen gælder redigerede forretningsdata, ikke hver flytning af et
  panel eller hvert zoomtrin.
- **Nulstil visning** er en tydelig, særskilt handling, der gendanner
  dokumenterede standarder.

### 8.5 Paneler og scrolling

- Arbejdsflader med mindst to paneler har justerbare bredder, synligt og
  tastaturbetjent trækhåndtag samt dokumenterede minimumsbredder.
- Paneler har uafhængig lodret scrolling, så sidehoved og nabopanel ikke flyttes
  utilsigtet.
- Layoutet må ikke skabe skjult indhold, overlap eller dobbelte scrollfælder ved
  små bredder.

### 8.6 Menu og arbejdsområdezoom

- Venstremenuen tilbyder Normal og Kompakt visning.
- Skiftet vises som en centreret pileknap på menuens højre kant. I Kompakt
  visning åbnes undermenuer ved hover/fokus uden at udvide hele menuen.
- Arbejdsområdezoom må kun påvirke modulindholdet, aldrig sidebar, topbjælke,
  dialogportal eller browserens almindelige zoom.
- Shift + musehjul over arbejdsområdet samt synlige zoomknapper ændrer kun
  arbejdsområdezoom. Ctrl/Cmd + musehjul, browsergenveje og operativsystemets
  tilgængelighedsfunktioner bevares.
- Zoomkontrollerne er tastaturbetjente og viser den aktuelle værdi.

### 8.7 Brugerafgrænsede visningsvalg

- Menuvisning huskes pr. autentificeret bruger og sikkerhedskontekst på tværs
  af moduler.
- Zoom og panelbredder huskes pr. bruger, kunde/ejer-kontekst og konkret
  skærmbillede.
- Kundesiden scopes mindst med bruger + tenant + route/skærmnøgle.
- Ejersiden scopes med ejerbruger + ejer-kontekst + route/skærmnøgle og må ikke
  genbruge en kundetenants nøgle.
- Logout, bruger- eller tenantskift må ikke efterlade indlæst tilstand fra den
  forrige kontekst. Serverlagring af præferencer skal følge de eksisterende
  serverhåndhævede bruger-/tenantgrænser; lokal fallback må ikke udvide adgang.

### 8.8 Responsivitet og specialindhold

- Mobilvisning, dropdowns, dialoger, PDF-visning og vandret/lodret scrolling
  skal fungere ved både ændrede panelbredder og arbejdsområdezoom.
- Test mindst 360/390 px mobilbredde, relevante tablet-breakpoints, 899/900 px
  grænsen samt 1440×900 og 1920×1080.
- PDF-indhold må kunne passes til panel, zoomes og scrolles uden at påvirke
  hele platformens zoom eller blokere dialoglukning.

## 9. Forventet kontrol efter hver senere integration

Kun én leverance integreres ad gangen. Efter hvert eksplicit merge-commit og
eventuelle separate integrationstilpasninger skal følgende gate gennemføres.

### 9.1 Før merge

1. Verificér præcis checkpoint-hash, branch, fælles forfader, komplet
   overleveringsrapport og ren/afgrænset modulstatus.
2. Kontroller at checkpointet er tilgængeligt for integrationsworktreeet, og at
   rapportens filinventar stemmer med Git-diffen.
3. Gennemgå secrets, kundedata, buildoutput, uploads, emulator-/browserdata og
   store reviewartefakter. Kun syntetiske, bevidst godkendte fixtures må følge
   med.
4. Lav semantisk konfliktkort for fælles filer og dependencylocks. Intet
   generelt `ours`/`theirs` på fælles filer.

### 9.2 Adgang og sikkerhed

- Tilladt bruger, bruger uden modulpermission og ikke-logget-ind bruger prøves
  gennem navigation og direkte URL.
- Tenant A må ikke læse/skrive tenant B; logout og bruger-/tenantskift rydder
  indlæst tilstand.
- PROCURE prøves med eksisterende `indkoeb.laes`, `indkoeb.skriv`,
  `indkoeb.godkend`, leverandør- og fakturapermissions; adgang må ikke opfindes
  ved at gøre alle til administratorer.
- Ejerkonsollen prøves med og uden `udbyder`-claim. En ejer uden tenant må ikke
  nå AppShell/kundedata; en almindelig tenantadmin må ikke nå ejerfunktioner.
- Claims-v2, revocation, legacy-allowlist, aktivt abonnement, Database Rules og
  Storage Rules genkøres i isolerede emulatorer.
- Alle nye callables udleder tenant/uid fra auth-konteksten, hvor det er et
  kundeflow, og har serverhåndhævet permission, validering, audit og
  idempotens/samtidighed efter behov.

### 9.3 Build og automatiske tests

- Root: lint, design-token-test, Functions-syntaks, delte kopiers paritet,
  fuld `test:rules`, produktionsbuild og whitespace-kontrol.
- Modulet: hele den afleverede domæne-, komponent-, adapter-, kontrakt- og
  browser-suite samt rapportens målrettede emulatorflows.
- Regression: FLEET, FACILITY, PLANNING, Fakturacenter og Reference Contract V1
  efter hver merge, ikke kun det nye modul.
- Dependency- og lockændringer kontrolleres eksplicit; auditresultatet
  sammenlignes med denne baseline uden automatisk fix.
- Den byggede app prøves med direkte route/reload, ikke kun Vite-devserveren.

### 9.4 Browserforløb på tværs af moduler

Pilotgrundlaget er cirka 10 syntetiske brugere og 6 syntetiske enheder. OBD er
ikke en obligatorisk forudsætning.

- Login, logout, direkte URL, reload og browserens frem/tilbage.
- Skift mellem PROCURE, FACILITY, FLEET og Fakturacenter uden dobbelt shell,
  tabt menuvalg, stilkollision eller nye konsolfejl.
- PROCURE: behov/mobil eller manuel intake → godkendelse → ordre → delmodtagelse
  → lager/forbrug → fakturareference og fælles Fakturacenter, med afviste roller
  og fremmed tenant som negative forløb.
- FACILITY/FLEET: vælg gyldig sag/enhed/reference og kontroller, at PROCURE-link
  eller adapter ikke antyder en forbindelse, som backend ikke håndhæver.
- Fakturacenter: Indbakke, Til kontrol og Kontrollerede samt uændret Reference
  Contract V1. Et PROCURE-match må ikke kaldes bogført eller betalt.
- Ejerkonsol: separat ejerlogin → overblik/kunde/salg/mail/support/økonomi og
  tilbage-navigation; ingen kundeshell, tenantvælger eller kundedata uden den
  konkrete serverfunktion.
- De fælles række-, dialog-, bekræftelses-, panel-, menu-, zoom-,
  visningspræference-, mobil- og PDF-acceptkrav i afsnit 8 prøves i berørte
  skærmbilleder.

## 10. Forventede konfliktområder og beslutningsprincip

Begge nye spor har bevæget sig langt fra den fælles forfader. De væsentligste
fælles konfliktområder er:

- `src/App.jsx`: lazy imports, routehierarki, loginretur og de sideordnede
  sikkerhedsgrænser.
- `src/fleet/AppShell.jsx`, `src/fleet/nav.js`, `src/fleet/moduler.js` og
  `src/fleet/modulfaner.js`: én kundeshell, navigation, modulkrav,
  Normal/Kompakt og fælles visningsvalg.
- `src/fleet/fleet.css` og modulernes CSS: tokens, globale selectors,
  responsive breakpoints, paneler, zoom og ejerens særskilte ramme.
- `src/firebase.js`: emulatorvalg og miljøsikring må ikke skabe en skjult
  produktionsforbindelse.
- `src/fleet/permissions.js`, `functions/delt/permissions.js`,
  `firebase.rules.json` og `storage.rules`: claims-v2, ejergrænse, tenant,
  modul- og permissionhåndhævelse.
- `functions/index.js`, `functions/delt/**`, `functions/mail/**` og
  Functions-lockfilen: PROCURE- og ejerfunktioner, mail/PDF, audit,
  idempotens og runtime-dependencies.
- Fælles leverandør-, faktura-, dokument-, mail- og indkøbskontrakter samt
  Reference Contract V1.
- Root `package.json`/lock og build-/testscripts.
- Supportoverlap: `src/App.jsx`, `AppShell`, navigation, `src/firebase.js`,
  `functions/index.js`, Rules og fælles videns-/mailkontrakter. Den kanoniske
  `support/`-model må ikke erstattes af ejerens salgstråde, og PROCURE må ikke
  indføre en parallel support- eller beskedtransport.

Konflikter løses efter begge ændringers hensigt og med den aktuelle
integrationskode som sikkerhedsbaseline. Modulets egne filer kan normalt følge
checkpointet; fælles filer skal kombineres semantisk og testes. Endelig
integrationsrækkefølge besluttes først, når begge overleveringsrapporter,
checkpoints og filinventarer kan sammenlignes. Der er derfor bevidst ingen
anbefalet "PROCURE først" eller "Ejerkonsol først" i denne forberedelse.

## 11. Milepæle: samlet UI er ikke pilotklar dataintegration

### Milepæl A – sammenlagt brugerflade

- Begge moduler kan åbnes fra den fælles kodebase med korrekt shell eller
  særskilt ejergrænse.
- Tema, logo, routing, adgangsgates og de fælles interaktionskrav består.
- Syntetiske, tydeligt afgrænsede data kan anvendes til lokal og automatisk
  test.

Milepæl A dokumenterer ikke rigtig fakturamodtagelse, live fakturafordeling,
fælles serverlagring, mailtransport, webshop, betaling, OBD eller andre eksterne
forbindelser.

### Milepæl B – pilotdrift med varig og håndhævet sammenhæng

- Fælles varig lagring, serverhåndhævet adgang, Rules/Functions og nødvendige
  indeks er gennemgået og deployet som en koordineret version.
- PROCURE, FACILITY, FLEET og Fakturacenter udveksler de aftalte stabile
  referencer i virkelige serverflows; fejl, retry, samtidighed, audit og
  tenantadskillelse er prøvet.
- Ejerkonsollens tværtenantfunktioner er begrænset til de eksplicit godkendte
  serverfunktioner og dataudsnit.
- Pilotopsætningen for cirka 10 brugere og 6 enheder er valideret med roller,
  modulvalg, stamdata og driftsprocedurer. OBD er valgfri, ikke en startgate.

## 12. Mangler før konkret sammenlægningsinstruks

1. Ejerkonsollens separate, samlede overleveringsrapport med ét fuldt,
   committet checkpoint for hele modulet; V8.1-supportproduktet alene er ikke
   et komplet Ejerkonsol-checkpoint.
2. Ejerkonsollens komplette filinventar, migrations-/lagringsadfærd,
   dependencies, sikkerhedsgrænser, præcise testkommandoer/resultater og kendte
   begrænsninger.
3. Bekræftelse af at PROCUREs anbefalede overleveringscheckpoint er
   `eef500ae834d159c8aaf5a3e6b878170bf2571e5`, samt beslutning om de sporede
   syntetiske PDF/screenshot/outputartefakter skal indgå i fælles historik.
4. Sammenligning af begge rapporters præcise ændringer i `src/App.jsx`,
   AppShell/navigation/CSS, Firebase-klient, Functions, Rules, kontrakter og
   lockfiler, før rækkefølge fastlægges.
5. Read-only kontrol i Netlify/GitHub-admin af branch-deploy-filtre, webhooks og
   build-hooks før et fremtidigt push.
6. En særskilt godkendelse af, hvilke serverdele der kun skal med i Milepæl A,
   og hvilke der først må aktiveres/deployes som Milepæl B. Ingen login- eller
   sikkerhedsregel må omgås for at demonstrere UI'et.
7. Ejerchattens permanente implementering og checkpoint for Support V1.1-
   adapteren samt beslutning om supportleverancen integreres før eller efter
   Ejerkonsolens fulde checkpoint. Den fælles supportserver har ét ejerskab i
   integrations-/supportsporet.
