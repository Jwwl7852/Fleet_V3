# Veyro UNIT Booking V2 — integrationsresultat V1

Dato: 13. september 2026

## Konklusion

Det præcise UNIT Booking-checkpoint
`77c3ccabed2b342b067e45ed15a3927c63e74dce` er integreret med bevaret
historik i merge-commit
`4f9bdf46cbc2cb2c7f3bf1542a364204b6f2254d`. Mergecommittets første
forælder er integrations-HEAD
`a85cc23099ffe63cf8d415155e7dfa35587fea9d`, og anden forælder er det
udpegede UNIT-checkpoint. Det tidligere UNIT-checkpoint `81c0fb09…` er en del
af leverancens historik og er ikke integreret en ekstra gang.

UNIT er samlet i den fælles AppShell med WAREHOUSE, og de fælles kontrakter,
callables, regler, importfunktioner, klientadaptere og UI-ruter er kombineret.
Produktionsbuild, lint og de emulatoruafhængige UNIT-/WAREHOUSE-tests består.

Integrationen kan **ikke** markeres samlet backend-verificeret eller
produktionsklar. Den afsluttende Database-/Storage-Rules-gate og de
efterfølgende Auth-/Functions-/browserforløb blev blokeret, før regler eller
produktkode blev kørt, fordi Database-emulatorens Java/Netty-proces ikke kan
etablere en lokal loopback-forbindelse på denne Windows-session. Det er en
miljøfejl, ikke en konstateret regel- eller produktfejl, men en manglende
sikkerhedsgate må ikke tælles som bestået.

## Udgangspunkt og kilder

- Integrationsbranch: `codex/veyro-integration-v1`.
- Start-HEAD: `a85cc23099ffe63cf8d415155e7dfa35587fea9d`.
- UNIT-kilde: `codex/unitbooking-integrated-development` ved
  `77c3ccabed2b342b067e45ed15a3927c63e74dce`.
- WAREHOUSE-reference:
  `37bba72ec73e33369479b236454a1a1e913a208c`, allerede indeholdt i
  integrationshistorikken før UNIT-mergen.
- Den utrackede kildeartefaktmappe
  `artifacts/unitbooking-v2/VEYRO_UNITBOOKING_REVIEW_V2/` og den tilsvarende
  `unitbooking-v2-fix`-mappe i kildeworktreeet er ikke læst ind som produktkode,
  flyttet, slettet eller committet.
- Den lokalt utrackede
  `functions/.env.demo-veyro-warehouse-integration-test` er bevaret uændret
  og indgår ikke i commits.

## Merge- og konfliktbeslutninger

Konflikterne blev løst fil for fil ud fra begge leverancers hensigt:

- `src/App.jsx`: de nyere platform- og WAREHOUSE-ruter samt `ModulRute`-
  adgangsgates er bevaret; UNITs lazy-loadede import- og scannerruter er
  tilføjet under `/unitbooking/*`. Ingen separat shell, iframe eller port er
  indført.
- `src/fleet/unitlager.js`: WAREHOUSEs fælles unitoprettelse og fysiske
  lagerhandlinger er bevaret sammen med UNITs bookingorienterede adapter.
- `functions/index.js`: den nyere WAREHOUSE-implementering af
  `unitlagerhandling` er autoritativ. Den kontrollerer idempotens før den
  forældede placerings-precondition, kræver `forventetPladsId` og opdaterer
  unit, bookingreference og append-only bevægelse i samme tenanttransaktion.
  UNIT-importens callables og dokumentudtræk er tilføjet uden en parallel
  fysisk lagerfunktion.
- `firebase.rules.json`: WAREHOUSEs strengere beskyttelse af `pladsId`, fysisk
  status og bevægelseshistorik er bevaret. UNIT-importkladder er læsbare med
  den eksisterende claims-v2-, revocation-, tenant-, modul- og permissiongate;
  hash- og operationsregistre er direkte klientlukkede.
- `functions/package.json` og lockfil: begge leverancers nødvendige pakker er
  bevaret. UNIT-importen tilføjer blandt andet `mailparser`, `pdf-parse` og
  XLSX-understøttelsen, mens eksisterende Functions-pakker bevares. Der er
  ikke lavet en bred opgradering eller kørt `npm audit fix`.
- `test/design-tokens.test.mjs` og øvrige fælles kontrakttests er kombineret,
  så de fortsat kontrollerer platformen og de nye UNIT-skærme.

Efter mergen blev den synlige bookingdetalje gjort enig med den leverede
kontrakttest ved eksplicit at vise, at der endnu ikke er relaterede mails eller
fotos. Importvisningen fik en lille lint-neutral oprydning. Målte
sikkerhedskontrakter og README-skærmtal blev opdateret til det faktiske samlede
træ; adgang eller regler er ikke lempet for at få tests grønne.

## Fælles model og tværgående forløb

Den normative grænse er fortsat
`docs/VEYRO_UNIT_WAREHOUSE_CONTRACT_V1.md`:

- én stabil `unitId` i `tenants/{tenantId}/kasser/{unitId}`;
- rå QR-værdi er samme `unitId` i begge moduler;
- `pladsId` peger på den fælles strukturerede lokation;
- fysiske ændringer går gennem den fælles serverfunktion;
- bevægelseshistorik er append-only;
- UNIT ejer bookingstatus, mens fysisk placering og bookingstatus vises som
  forskellige oplysninger.

Det aftalte syvtrinsforløb — oprettelse i WAREHOUSE, opslag i UNIT,
reservation/klargøring/udlevering, WAREHOUSE-kontrol, UNIT-retur til
modtagelse, WAREHOUSE-slutplacering med idempotent retry og slutkontrol i UNIT
— er dækket af den leverede kontrakt, kode og emulatoruafhængige tests. Det er
**ikke genkørt end-to-end mod den endelige samlings backend**, fordi den lokale
Database-emulator ikke starter. Samme begrænsning gælder bevis for UNIT-only,
WAREHOUSE-only, begge moduler, fremmed tenant, manglende permission, direkte
fysisk skriveforsøg og samtidige modstridende UI-handlinger på slut-HEAD.

## Importformaters faktiske status

| Format | Verificeret nu | Begrænsning |
|---|---|---|
| Indsat tekst | UI afprøvet i den samlede app til gennemgang og validering | Gem/bekræft kræver lokal backend |
| `.eml` | Udtræk og domæneflow består i automatiske tests | Endelig browser-upload mod samlet Functions-emulator blokeret |
| `.msg` | Reel MSG-fixture udtrækkes i automatiske tests | Samme backendblokering |
| Tekst-PDF | Udtræk består i automatiske tests | Scannet PDF kræver OCR og er ikke afprøvet |
| `.xlsx` | Udtræk består i automatiske tests | Browser-upload mod samlet backend blokeret |
| `.csv` | Udtræk består i automatiske tests og leverede reviewbilleder | Endelig samlet browserbekræftelse blokeret |
| PNG/JPEG/scannet PDF | Klassificeres korrekt som OCR-krævende | Ingen OCR-/AI-tjeneste er tilsluttet |

Importen opretter kun et gennemgåeligt udkast. Den reserverer ikke stiltiende
en unit, og den færdige reservation kræver de eksisterende servergates.

## Testresultater på den samlede kode

Bestået:

- `npm run lint`: bestået; den tidligere rapporterede root-/FACILITY-
  `@eslint/js`-blokering er ikke til stede i den aktuelle installation.
- `npm run build`: bestået med Vite 5.4.21, 732 transformerede moduler og egne
  lazy chunks for `UnitScanner` og `ImportBooking`. Den eksisterende advarsel
  om en stor PROCURE-chunk består.
- Målrettet UNIT/Warehouse/domæne/rute-suite:
  `node --test test/unitbooking.test.mjs test/unitbooking-import.test.mjs
  test/unitbooking-document-extraction.test.mjs test/warehouse-unit.test.mjs
  test/moduler.test.mjs test/rutedeling.test.mjs`: 248/248 bestået.
- Fokuseret platform-/sikkerhedskontraktregression for claims-v2,
  forslagform, læseadgang, navigation, referencer, tenantprovisionering og
  statustal: 57/57 bestået.
- Emulatoruafhængig regression: 180 testfiler, 4.458 beståede checks og ingen
  fejl. Emulatorafhængige filer blev udtrykkeligt ikke talt med.
- `node --check functions/index.js` samt Functions-kopi-/paritetstests:
  29/29 bestået; `functions/delt/unitbooking-import.js` svarer til kilden.
- `git diff --check`: bestået.

Blokeret og derfor ikke bestået:

- `npm run test:rules` mod det isolerede projekt
  `demo-fleetcontrol-rules-test`. Tre forsøg med proceslokal Temurin
  `21.0.12.1+1` — standard, IPv4-præference og separat TEMP/TMP — samt et
  kontrolforsøg med den eksisterende Temurin `21.0.11+10` stopper før
  testindlæsning med `failed to create a child event loop`,
  `Unable to establish loopback connection` og
  `java.net.SocketException: Invalid argument: connect` i Netty/
  `WEPollSelectorImpl`.
- Derfor er `npm test` som helhed ikke grøn, fordi scriptet med vilje kræver
  Rules-gaten.
- `node scripts/unitbooking-auth-functions-qa.mjs
  artifacts/unitbooking-v2/runtime`, det tværgående backend-browserforløb og
  samtidigheds-/tenantprøverne kunne ikke køres mod slutproduktet.
- Belastningsmålingen med 5.000 units, 500 lokationer, 25.000 bookinger,
  100.000 bevægelser og 40 samtidige workers kunne ikke starte. Der findes
  derfor ingen nye p50/p95/p99-, retry- eller duplikatmålinger, og risikoen ved
  transaktioner på hele tenant-roden er fortsat åben.

Den valgte Java er kun sat i testprocessens miljø:
`C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.12.1+1\jdk-21.0.12.1+1`.
Maskinens globale `JAVA_HOME`, PATH og Java 8 er ikke ændret. Node i denne
session er v24.19.0; Functions-manifestet målretter fortsat Node 20, så en
senere emulator-/deploygate skal køres med den understøttede Node-runtime.
Firebase CLI-versionen i den låste testkommando er 15.29.0.

Dependency-audit er registreret uden automatisk rettelse:

- root: 21 kendte forhold — 18 moderate og 3 high, 0 critical;
- Functions: 12 moderate, 0 high/critical.

## Browserkontrol og billeder

Den faktiske samlede dev-app blev kontrolleret på port 5197 med syntetisk
demoindhold og uden Firebase-konfiguration:

- én AppShell og ét Veyro-logo viser WAREHOUSE og UNIT ved siden af hinanden;
- skift UNIT → WAREHOUSE → UNIT virker med de integrerede ruter;
- `/unitbooking`, `/unitbooking/import` og `/unitbooking/scan` åbner direkte;
- scannerens direkte URL tåler reload, tilbage og frem;
- tekstimport går til trin 2 med kildevisning, valideringsfejl og uændret
  brugerinput;
- browserkonsollen havde ingen errors; kun React Routers to eksisterende v7-
  future-flag warnings blev observeret.

De nummererede leverancebilleder ligger i
`../artifacts/unitbooking-v2-fix/screenshots/`, blandt andet:

- [01 – kalender og dagens arbejde](../artifacts/unitbooking-v2-fix/screenshots/01-desktop-kalender-og-dagens-arbejde.png)
- [02 – fælles enhedsregister](../artifacts/unitbooking-v2-fix/screenshots/02-desktop-faelles-enhedsregister.png)
- [03 – retur før scanning](../artifacts/unitbooking-v2-fix/screenshots/03-desktop-scanning-retur-foer.png)
- [04 – retur på modtagelse](../artifacts/unitbooking-v2-fix/screenshots/04-desktop-retur-paa-modtagelse.png)
- [05 – efterfølgende flytning](../artifacts/unitbooking-v2-fix/screenshots/05-desktop-efterfoelgende-flytning.png)
- [07 – importgennemgang](../artifacts/unitbooking-v2-fix/screenshots/07-desktop-gennemgang-original-og-felter.png)
- [10 – reservation gemt](../artifacts/unitbooking-v2-fix/screenshots/10-desktop-reservation-gemt.png)
- [14 – mobil scanning](../artifacts/unitbooking-v2-fix/screenshots/14-mobile-390x844-scanning-og-flytning.png)

Disse billeder er checkpointets lokale reviewbevis. De må ikke udlægges som
nyt backendbevis for samlingens slut-HEAD. Nye visuelle skærmbilleder af den
samlede kalender, importgennemgang og scanner blev kontrolleret under denne
runde, men et gyldigt nyt billedsæt af hele det tværgående flow kan først
produceres, når emulatorgaten og de faktiske mutationer kan gennemføres.

## Lokal adgang og databeskyttelse

Den samlede app kører med `strictPort` på:

- platform: `http://127.0.0.1:5197/`
- UNIT: `http://127.0.0.1:5197/unitbooking`
- import: `http://127.0.0.1:5197/unitbooking/import`
- scanner: `http://127.0.0.1:5197/unitbooking/scan`
- WAREHOUSE: `http://127.0.0.1:5197/warehouse`

Den kørende 5197-version bruger bevidst den lokale demo-/UI-tilstand uden
Firebase API key og uden produktionstilslutning. Den er egnet til visuel
afprøvning, ikke til bevis for backend-, sikkerheds- eller flerbrugeradfærd.
Eksisterende browserdata, tidligere emulatorindhold, andre servere og alle
andre worktrees er bevaret.

## Resterende arbejde før produktion

1. Løs Windows Java/Netty-loopbackmiljøet, og genkør hele Rules-gaten på det
   uændrede sluttræ.
2. Kør derefter UNIT Auth/Functions-runtime-QA og det syvtrins tværgående
   WAREHOUSE/UNIT-forløb i faktiske, separate autentificerede sessioner.
3. Kør og dokumentér samtidighed, idempotent retry, tenant-/permission-
   afvisninger og direkte fysisk skrivebeskyttelse på slutproduktet.
4. Kør det beskrevne realistiske belastningsscenarie og træf en fælles
   arkitekturbeslutning, hvis tenantrodstransaktionen giver høj retry-rate eller
   utilstrækkelig p95.
5. Afprøv fysisk kamera/håndscanner og rigtig mobil browser.
6. Tilslut og afprøv OCR/AI særskilt, hvis scannede PDF'er og billeder skal
   kunne importeres. Ingen ekstern tjeneste er aktiveret nu.
7. Kør senere med den understøttede Node 20 Functions-runtime og håndtér
   dependencyforholdene kontrolleret; ingen af delene løses med en bred
   opgradering i denne integration.

Resultatet er derfor **klart til fortsat lokal integration og visuel
afprøvning**, men **ikke klart til produktion**.
