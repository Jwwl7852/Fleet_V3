<title>Test- og rollback-plan</title>

# 06 — Test- og rollback-plan

**Status:** Planlægning. 0 ændringer i kode, Firebase-regler, Cloud
Functions eller data er foretaget for at producere dette dokument. Kilder:
`FleetControl_V1_product_blueprint.md`, `00_AUTHORITATIVE_PRODUCT_RULES.md`,
`docs/product-audit/05_ROLES_AND_PERMISSIONS.md`, `package.json`, og en
fuldstændig gennemlæsning af de faktiske filer i `test/` (129 testfiler).
`05_IMPLEMENTATION_SLICES.md` fandtes ikke på skrivetidspunktet — planen her
bygger derfor direkte på blueprintets eget Skive 0–8-afsnit.

## Nuværende testbasis

Fra `package.json`:

| Kommando | Hvad den kører |
|---|---|
| `npm test` | `npm run lint && npm run test:rules` — den fulde accepttest. |
| `npm run lint` | `eslint .` — statisk kontrol af hele `src/`, `test/`, `functions/`, `scripts/`. Fanger bl.a. `no-undef` (en variabel der ikke findes — hvid skærm i browseren) og `no-unused-vars`. |
| `npm run test:rules` | `firebase emulators:exec --only database --project fleetcontrol-rules-test "node --test"` — starter en RTDB-emulator, kører **hele** `node:test`-suiten (alle 129 filer i `test/`, ikke kun regelprøver, navnet er historisk) mod den, og lukker emulatoren ned igen. |
| `npm run test:design` | `node --test test/design-tokens.test.mjs` — kun designtoken-snapshottet; kører også separat via pre-commit-hooken når `src/` ændres. |
| `npm run regler:tjek` | Sammenligner `firebase.rules.json` byte-for-byte med de **udrullede** regler i det angivne Firebase-projekt (kræver `.serviceaccount-dev.json` og netværk — er IKKE en del af `npm test` og blev ikke kørt i denne runde). |
| `npm run regler:udrul` | `delt:kopier` → `firebase deploy --only database --project dev` → `regler:tjek`. Udruller OG efterprøver i samme kommando. |
| `npm run funktioner:udrul` | Tilsvarende for Cloud Functions. |
| `npm run provisioner:dev`, `kunde:opret`, `kunde:moduler`, `ejer:*` | Skriver til en rigtig Firebase-database (DEV eller den `--project`, der angives). **Ikke kørt** i denne planlægningsrunde — de er skriveoperationer og falder uden for "kun læse-/analyseværktøjer".

**Baseline målt i denne runde** (læse-only, `npm test`, kørt 2026-08-24):

```
tests 3027
suites 582
pass 3027
fail 0
cancelled 0
skipped 0
duration_ms ≈ 19 000
```

Alle 3027 test er grønne før oprydningen påbegyndes. Dette er den baseline
hver skive skal vende tilbage til. `npm run regler:tjek` er IKKE kørt i
denne runde (kræver netværk og skriverettigheder til DEV-projektet) — før
Skive 0's kodefrysning låses endeligt, bør en efterfølgende (implementerings-)
session bekræfte at de udrullede DEV-regler stadig matcher filen, jf.
`scripts/tjek-regler.mjs`'s egen begrundelse for hvorfor det er en separat
kontrol fra `test:rules`.

## Testklasser relevante for oprydningen

### Navigation/menu-tests

- **`test/navadgang.test.mjs`** — den centrale fil for regel 7 (navigation ≠
  permission). Tester: (a) hver `kraeverPerm` på et nav-punkt peger på en
  permission der faktisk findes i `ROLLE_PERMS`; (b) hver `kraeverPerm` er
  en permission skærmen **faktisk** bruger (skjuler intet der virker); (c)
  hvert punkt der læser en spærret node **enten** har `kraeverPerm` **eller**
  står i en begrundet undtagelsesliste (`UDEN_KRAEVERPERM`); (d) ingen rolle
  ser mere end 3 punkter der åbner en afvist læsning; (e) chaufføren ser ikke
  en tom Procure-overskrift; (f) admin mister intet; (g) hver `kraeverPerm`
  er reelt håndhævet i `firebase.rules.json` (ellers er det en "pæn knap");
  (h) ruten fjernes ALDRIG samtidig med menupunktet (dybe links skal ende i
  en forklaring, ikke en 404).
  **For denne oprydning:** filen dækker permission-baseret skjul allerede
  solidt. Den dækker **ikke** modul-baseret skjul (`kraeverModul`) — se
  hul nedenfor.
- **`test/moduler.test.mjs`** — tester `kraeverModul`-mekanikken statisk:
  hvert modul har enten et hovedpunkt eller mindst ét barn med
  `kraeverModul`, hvert `kraeverModul` peger på et modul der findes i
  `moduler.js`, og et punkt under sit eget modul bærer ikke leddet
  overflødigt. Samme fil rummer også `REDIRECTS`-prøverne (se nedenfor).
  Den tester dog **konsistensen af tabellerne**, ikke det faktisk RENDEREDE
  menutræ for en given tenant.
- **`test/rutedeling.test.mjs`** — sikrer at alle skærme er `lazy()`-loaded
  (kun `Login` er eager), at hver dovne skærm har et `export default`, at
  ingen `Suspense` fejlagtigt omslutter `AppShell`, og at ejerkonsollen har
  sin egen `Suspense`-grænse. Relevant for enhver Skive der flytter/fjerner
  en rute: en fil der bliver stående uden en importlinje, opdages her.
- **`test/chaufforadgang.test.mjs`** — sikrer at `harAdgang` (server-siden
  af adgangskontrollen) forbliver rolleuafhængig, og at chaufføren kun kan
  nå `/app/*`. Relevant hver gang chaufførens rammer røres.
- **REDIRECTS-testen (bunden af `test/moduler.test.mjs`, describe "⚠ EN
  FLYTNING MÅ IKKE SLÅ ET LINK IHJEL")** — hver redirect peger på en
  eksisterende sti, den gamle sti er IKKE samtidig en rigtig rute, id-
  parametre bevares, og fem navngivne "gamle stamdatastier" skal fortsat
  redirecte. **Direkte genbrugelig mekanisme for hver MOVE/MERGE-beslutning
  i blueprintet** — men listen af påkrævede gamle stier skal UDVIDES manuelt
  for hver ny flytning (se Manglende testdækning).

### Rolle/permission-tests

- **`test/rules.permissions.test.mjs`** — kører mod en rigtig
  regel-emulator med rigtige custom claims; verificerer at SERVEREN afviser
  en bruger uden den nødvendige permission (ikke kun at UI'et skjuler en
  knap).
- **`test/rules.rollematrix.test.mjs`** — måler (ikke udleder) hvad hver af
  de 7 roller faktisk kan SKRIVE, kørt mod emulatoren med den udrullede
  regelfil. Filens egen historik (en fejlagtig udledning gjorde
  `indberetninger` "admin-only" i en tidligere version af dokumentationen)
  er selve begrundelsen for at måle frem for at antage.
- **`test/roller.test.mjs`** — de to spærringer omkring beslutning 31b
  (kunden må redigere rolleindhold, men kan ikke låse sig selv ude af
  `brugere.skriv`, og `roller/`-noden er en KILDE, aldrig et
  håndhævelsespunkt).
- **`test/laeseadgang.test.mjs`** — måler hvilke af de læsbare noder der
  IKKE har en permission-krav, og krydstjekker mod en dokumenteret
  undtagelsesliste. Direkte relevant hvis nogen skjult skærm (Skive 1)
  senere skal have sin læsning permission-låst i stedet for kun UI-skjult.
  ⚠ **Og direkte relevant for Korrektion 2 (Fakturaer & bilag):** de nye
  `fakturaer.laes`/`.skriv`/`.godkend`-permissions — der erstatter en
  `fakturaer`-node som i dag har SLET INGEN permission på `.read`, og
  erstatter `indkoeb.*` på de tre skrivende Cloud Functions
  (`fakturamatch`/`fakturadestination`/`fakturastatus`) — kræver samme
  slags testdækning `test/laeseadgang.test.mjs`s `LUKKET`-tabel allerede
  giver `satser.laes`/`grundlag.laes`/`indkoeb.laes` (beslutning 104).
  Filen nævner i dag slet ikke `fakturaer`, fordi noden bevidst har stået
  udenfor governance-testen som en af "de tre tvetydige noder". Dette er en
  ny `PERMISSION_MODEL`-testopgave for Skive 4A, ikke kun en
  navigationsopgave.
- **`test/dashboardvisning.test.mjs`** — det etablerede mønster for en
  permission-UAFHÆNGIG visnings-indstilling: `dashboardvisning/<uid>` har
  standard = alt tenanten har købt, kun et eksplicit `false` skjuler noget,
  kan ikke skjule det hele (`skjulerAlt()`-vagten), og — mekanisk
  håndhævet af netop denne fil — **læses ALDRIG af nogen firebase-regel**
  ("DET ER EN VISNING, IKKE EN ADGANG"). Jf. Korrektion 1 i
  `00_AUTHORITATIVE_PRODUCT_RULES.md`: en fremtidig sideordnet
  `navvisning/<uid>` skal genbruge PRÆCIS dette mønster, sat af admin via
  samme Cloud-Function-mønster — og den dag Skive 2 bygger den, skal dens
  testfil følge PRÆCIS samme model, inklusive regel-uafhængighedsprøven.
- **`test/kpiadgang.test.mjs`** — sikrer at et KPI-domæne der ikke blev
  HENTET (fordi modul/perm mangler eller serveren afviste), ikke ser ud som
  et der ikke kunne BEREGNES — tre grunde (`modul`, `perm`, `afvist`) skal
  stå adskilt.
- **`docs/product-audit/05_ROLES_AND_PERMISSIONS.md`** bekræfter i sig selv
  (ikke en testfil, men et validerende referencedokument) at ingen af de 7
  roller pt. har rolle-specifik nav-filtrering ud over de tre kommercielle
  `kraeverPerm`-punkter — hvilket er præcis den mekanisme Skive 2 skal
  UDVIDE, ikke opfinde.
**For denne oprydning:** solidt dækket for eksisterende permission-model.
Skive 2's nye "navigation følger modul, ikke rolle" -regel kræver ingen ny
PERMISSION_MODEL-ændring (permissions.js/rules rører ingen af disse filer),
kun NAVIGATION_ONLY-ændringer i `nav.js` — så disse tests forbliver den
rigtige regressionsvagt uden at skulle udvides i deres kerne.

### Modul-gating-tests

- **`test/rules.moduler.test.mjs`** — udleder i BEGGE retninger om
  `NODE_MODUL` (i `moduler.js`) stemmer med den faktiske modulklausul i
  `firebase.rules.json`: står en node i tabellen, SKAL reglen have
  klausulen; står den ikke, må reglen IKKE have den. De tre bevidste
  undtagelser (`opgaver`, `satser`, `fakturaer` — delt ejerskab mellem to
  moduler) er navngivet i filen.
- **`test/modulkrav.test.mjs`** — udleder `MODUL_KRAEVER` (hvilket modul
  kræver hvilket andet, fx `booking → kunder`) direkte af påkrævede
  referencefelter i regelfilen, så et modul aldrig kan sælges alene uden at
  kunne bruges.
- **`test/modulopslag.test.mjs`** og **`test/modulmangler.test.mjs`** —
  sikrer at `useListe` slet ikke SPØRGER om en node kunden ikke har modulet
  til (`hent: false`), og at en tom liste af den grund vises som "modulet
  mangler", ikke som en datafejl (`leverandoerNavn()`-eksemplet).
- **`test/moduler.test.mjs`** (samme fil som under Navigation) dækker også
  det rene modulkatalog: hvert modul peger på et gyldigt `navKey`, og et
  modul uden skærm (`UDEN_SKAERM`) tegnes bevidst ikke i sidebaren.
**For denne oprydning:** dette er den bedst dækkede kategori af de fire —
den blev bygget netop fordi et modul-gateringshul (`reservationer` på
DEV-kunden `nordvest`) blev fundet og rettet (beslutning 92, se nedenfor).
Ingen af Skive 0–8's ændringer kræver ny modul-gating-logik ifølge
blueprintet (kun navigations-omlægning af eksisterende gatede punkter), så
disse tests skal forblive grønne UÆNDREDE gennem hele programmet — bliver
en af dem rød under en skive, er det et signal om at skiven utilsigtet har
rørt en modulklausul, ikke kun en menuplacering.

### Demo-data-disciplin-tests

Direkte relevant for **Skive 1** ("Fjern vildledning"):

- **`test/demo-i-skaerm.test.mjs`** — tæller BRUG af et demo-datasæt uden
  for `useListe(node, { demo: … })`-faldbakken, for hver node der ER
  seedet. Loftet er **nul**: en skærm der viser et fast demo-sæt for en node
  kunden faktisk har data i, fejler her. ⚠ Filens egen dokumenterede
  begrænsning: den tæller **kun** sæt for noder der står i `SEED` —
  `demoHaendelser` er den ene navngivne, stående undtagelse, fordi dens node
  ikke findes endnu.
- **`test/demo-kilder.test.mjs`** — et demo-datasæt må kun defineres ét
  sted (i `fleet/demo-*.js`, ikke i en modulfil), og aldrig to gange for
  samme node. Genkendes nu på FORM (id-bærende array, min. 3 poster), ikke
  kun på `DEMO_`-præfiks — fordi navnekonventionen tidligere blev omgået
  (`TILBUD`, `OPGAVER`, `FUNKTIONER`).
- **`test/demo-drift.test.mjs`** — samme faktiske hændelse må ikke stå
  registreret forskelligt to steder (solgt køretøj med en åben
  værkstedsopgave osv.).
- **`test/demo-referencer.test.mjs`** — et demo-datasæts referencefelter
  (`lagerId`, `indkoebId` osv.) skal pege på poster der rent faktisk findes
  i det SAMME seedede datasæt.
**For denne oprydning:** disse fire filer prøver **om et demo-datasæt bruges
korrekt for en seedet node**. De prøver IKKE det blueprintets regel 6
faktisk kræver for Skive 1: at en skærm markeret HIDE/LATER
(Økonomi-overblik, Bemandingsplan, Klima & energi, Integrationer,
Supportoverblik, Supportsag — jf. Korrektion 4 i
`00_AUTHORITATIVE_PRODUCT_RULES.md`: `/support` selv (#52) er IKKE længere
på denne liste, den bliver en ærlig, statisk `VIEW_COMPOSITION`-side, ikke
skjult) rent faktisk er UDE af den RENDEREDE navigation, at dens rute
fortsat findes i `App.jsx` (kode bevares — der er intet krav om at routen
fjernes, jf. Korrektion 5), at et direkte URL-hit på den viser en ærlig
tilstand og ikke permanent demo-data, og at "erstat med en ærlig
tomtilstand"-kravet på øvrige sider er opfyldt. Se hul nedenfor.

### Route/redirect-tests

Dækket, se REDIRECTS-afsnittet under Navigation ovenfor. Ingen separat fil —
det ligger i bunden af `test/moduler.test.mjs`.

## Manglende testdækning for oprydningen

Vær ærlig: følgende findes IKKE i dag og skal skrives pr. skive, hvis
oprydningen skal have samme grad af mekanisk håndhævelse som resten af
kodebasen (jf. CLAUDE.md's gennemgående mønster: "en regel man har skrevet
ned, er ikke en regel man har håndhævet"):

1. **Ingen test dækker endnu den korrekte HIDE/LATER-adfærd for et
   nav-punkt (Skive 1).** ⚠ **Rettet efter Korrektion 5 i
   `00_AUTHORITATIVE_PRODUCT_RULES.md`:** en tidligere version af dette
   punkt foreslog at teste at en skjult/flyttet nøgle er FJERNET fra
   `nav.js`s `ALLE`-array. Det er faktuelt forkert mod den faktiske
   arkitektur — `ALLE = NAV.flatMap(...)` indeholder ALLEREDE elementer med
   `skjulINav: true` (fx "forslag", "arbejdskoe", "kundepriserEn"): de
   findes i `ALLE`, de er bare ikke i den RENDEREDE menu. `App.jsx`s routes
   er en HELT separat mekanisme fra `nav.js` — en rute fjernes ALDRIG fra
   `App.jsx` fordi et `nav.js`-punkt skjules.

   **Korrekt testkrav**, for hver `HIDE`/`LATER`-nøgle (`bemandingPlan`,
   `klima`, `integrationer`, `oekonomi`, `supportOverblik`, `supportSag` —
   jf. Korrektion 4: `support`/#52 er IKKE på denne liste, den bliver en
   ærlig, statisk `VIEW_COMPOSITION`-side, ikke skjult) skal en ny Skive
   1-test skrives, der verificerer:
   (a) routen findes fortsat og resolver i `App.jsx` (fjernes ikke),
   (b) punktet er markeret skjult (`skjulINav: true` eller tilsvarende) /
       indgår ikke i det RENDEREDE menutræ for den relevante
       tenant/modul/bruger-kombination,
   (c) et direkte URL-hit på den skjulte rute viser en ærlig tilstand — et
       rigtigt skærmbillede eller en ærlig tomtilstand jf.
       produktgrundlovens regel 6 — ALDRIG permanent demo-data,
   (d) **ingen test må nogensinde assertere at et skjult/flyttet nøgle er
       fjernet fra `ALLE`** — det ville modsige den arkitektur for bevarede
       deep links kodebasen allerede hviler på (`skjulINav` findes netop
       for at holde dybe links i live mens et menupunkt skjules, samme
       mønster som det eksisterende `REDIRECTS`-array i `nav.js`).
2. **Ingen test kobler et modul-afkrydsningssæt for en tenant til det
   FAKTISK rendrede menutræ.** `test/moduler.test.mjs` tester kun at
   `kraeverModul`-tabellen er intern konsistent (peger på et rigtigt modul,
   er ikke overflødig for eget modul osv.) — ingen test simulerer "tenant
   med kun {Planning, Kunder}" og asserter det RESULTERENDE synlige
   nav-træ. Samme hul gælder Dashboard-reglen (blueprint: "Én aktivt købt
   modul → ingen Samlet-vælger; 2+ moduler → vælgeren viser Samlet + de
   moduler brugeren må se") — der findes ingen automatiseret test af selve
   modulvælger-komponenten endnu, fordi den ikke er bygget. Dette bliver en
   Skive 2-testopgave.
   ⚠ **Og fra Korrektion 1: en komplet navigationstest for denne oprydning
   skal dække TRE uafhængige akser, ikke to.** Ud over modulkøb kommer en
   ny, permission-uafhængig `navvisning`-indstilling pr. bruger (søskende
   til `dashboardvisning`, se `test/dashboardvisning.test.mjs`-mønstret
   ovenfor under Rolle/permission-tests) som en TREDJE akse, ved siden af
   rolle-permission. En komplet Skive 2-testsuite skal verificere alle tre
   HVER FOR SIG: (1) tenanten mangler modulet → punktet er væk uanset
   brugerens `navvisning`; (2) tenanten har modulet, men brugerens
   `navvisning` skjuler punktet → punktet er væk fra MENUEN, men
   rute/permission virker uændret ved et direkte hit; (3) en
   permission-afvisning er upåvirket af begge ovenstående — et
   `<Datatilstand art="naegtet">` vises, ikke et fraværende menupunkt.
3. **Ingen test for "ærlig tomtilstand" som positiv kontrakt.** Regel 6
   ("ægte data, en ærlig tomtilstand, eller ingenting — aldrig permanente
   demo-rækker") er i dag håndhævet NEGATIVT (demo-i-skaerm forbyder brug af
   et fast sæt for en seedet node). Der er ingen test der positivt kræver at
   en tom liste render `<Datatilstand>` med en meningsfuld årsag frem for et
   helt tomt eller helt hvidt panel — `test/datatilstand.test.mjs` findes og
   tester selve `dataTilstand()`-funktionen og komponentens grene, men ikke
   pr.-skærm at HVER af de screens Skive 1 rydder op i, rent faktisk BRUGER
   komponenten på sin nye tomtilstand.
4. **`demo-i-skaerm.test.mjs`'s eget dokumenterede blinde punkt.** Filen
   tæller kun demo-brug for noder i `SEED`. En ny, permanent
   "eksempel"-illustration eller et statisk kort uden nogen bagvedliggende
   node (fx en hardcoded procentgraf, en fast liste af "typiske" varer) vil
   IKKE blive fanget af nogen eksisterende test — hverken demo-i-skaerm
   (ingen node at matche mod), demo-kilder (intet array med id-felter,
   hvis det er en ren illustration) eller kpi-efterslæbstesten (ikke et
   KPI-felt). Dette er den mest sandsynlige blinde vinkel for Skive 1's
   "erstat permanente demo-komponenter på øvrige sider" — den kræver
   manuel gennemgang af hver af de 62 skærme, ikke kun en automatisk lint.
5. **Ingen automatiseret rolle × modulkombination-matrix.** Se næste afsnit
   — blueprintets DoD-krav "Alle 7 roller og relevante modulkombinationer er
   valideret i DEV" er eksplicit et DEV-valideringskrav, ikke et
   `node:test`-krav, og der findes (bevidst, jf. `test/rules.rollematrix.md`'s
   egen begrundelse om at en emulator kan "smides væk") ingen automatiseret
   test der iterativt logger ind som hver af de 7×N kombinationer og
   sammenligner det rendrede nav-træ. Dette skal udføres manuelt i DEV pr.
   skive, med checklisten nedenfor som styringsredskab.
6. **`test/rules.rollematrix.test.mjs` og `test/laeseadgang.test.mjs` dækker
   ikke navigations-KONSEKVENSEN af en ny modulvælger.** Når Skive 2 bygger
   modulvælgeren, skal en ny test skrives der (a) for en tenant med præcis
   ét modul asserter at Samlet-visningen er UDE, og (b) for en tenant med 2+
   moduler asserter at Samlet ER der og lister netop de moduler brugerens
   permissions/tenantens køb tillader.

## Rolle × modulkombination valideringsmatrix

Blueprintets DoD kræver: *"Alle 7 roller og relevante modulkombinationer er
valideret i DEV."* De 7 roller (fra `docs/product-audit/05_ROLES_AND_PERMISSIONS.md`,
kildekode `src/fleet/permissions.js`):

1. `chauffoer` — begrænset til `/app/*`, ingen sidebar (blueprintets
   nye navigation er irrelevant for ham bortset fra at `/app/*`-rammen
   IKKE må vokse en sidebar-agtig struktur, jf. `test/chaufforadgang.test.mjs`).
2. `casehandler`
3. `disponent`
4. `koordinator`
5. `lagermedarbejder`
6. `revisor`
7. `admin`

**Minimalt, men fuldt dækkende sæt af DEV-testtenanter for
modulkombinationer** — princippet er at dække (a) 0-moduls/1-moduls
grænsetilfælde for Dashboard-reglen, (b) hver af de 7 driftsmoduler alene
mindst én gang, og (c) mindst én kombination der historisk har afsløret et
reelt hul (delt-node-fejlen, beslutning 92):

| Testtenant | Moduler | Formål |
|---|---|---|
| `dev` (eksisterende seed-tenant) | Alle 7 driftsmoduler + Kunder | Fuld Samlet-dashboard-visning; ALLE nav-punkter synlige; baseline for "admin mister intet" (allerede prøvet i navadgang.test.mjs, men kun for permission — modul-dimensionen mangler). |
| Ny, minimal: **kun Planning + Kunder** | Planning, Kunder | Dashboard-reglens "1 aktivt modul → intet Samlet-valg, direkte til modul-dashboard" — det MEST almindelige salgsscenarie for en lille vognmand. Verificerer at ALLE andre driftsmodul-menupunkter (Fleet, Facility, Procure, Warehouse, Unitbooking, Workforce) er væk, og at `modulkrav.test.mjs`'s `booking → kunder`-afhængighed er den man rent faktisk ser udfoldet. |
| **`nordvest`** (eksisterende DEV-tenant) | Fleet, Facility, Bemanding (Workforce), Procure — **ingen Planning** | ⚠ Genbrug direkte — CLAUDE.md dokumenterer at denne præcise kombination historisk afslørede at `reservationer` fejlagtigt var gatet som `"booking"`-ejet, hvilket spærrede 37 reservationer for en kunde uden Planning-modulet (beslutning 92, rettet). Den er den bedst egnede eksisterende tenant til at gen-verificere at ALLE fire kilder til `reservationer` (booking, værksted, facility-sag, fravær) fortsat virker for en Planning-løs kunde EFTER Skive 2's nav-omlægning — en regression her ville være usynlig i en ren "alle moduler"-tenant. |
| Ny: **kun Warehouse + Unitbooking** | Warehouse, Unitbooking, (+ Kunder pga. `warehouse → kunder`-kravet) | Dækker Skive 5's sammenlægninger (Reolpladser/Lokationer, Kalender/Udlån) i en tenant hvor lagermedarbejderens rolle er den primære bruger — verificerer at `lagermedarbejder` ikke ser Fakturering (mangler `grundlag.laes`, jf. audit) og at Procure/Fleet/Facility-menuerne er væk. |
| Ny: **alle moduler undtagen Planning og Kunder** | Fleet, Facility, Procure, Warehouse, Unitbooking, Workforce | Ekstremtilfælde for modulvælgeren: mange moduler, men INGEN af de to der har afhængige moduler (`booking→kunder`, `warehouse→kunder`) — skal afsløre om `manglendeKrav()` korrekt nægter en sådan kombination, eller om Warehouse alene uden Kunder reelt sælges (hvilket `modulkrav.test.mjs` allerede forbyder statisk, men som bør genverificeres end-to-end i DEV). |

For hver testtenant: log ind som hver af de 7 roller (chauffør kun for
`/app/*`-sporet) og verificér manuelt mod `02_TARGET_NAVIGATION.md`s
målbillede at (a) kun købte moduler er synlige, (b) ingen synligt punkt
fører til en permission-denied ud over de tre navngivne kommercielle
(`satser.laes`/`grundlag.laes`/`indkoeb.laes`) samt de i
`UDEN_KRAEVERPERM` navngivne undtagelser, og (c) Dashboard-reglens
1-modul/2+-modul-skel holder. Dette er en DEV-checkliste, ikke en
`node:test`-fil — konsistent med blueprintets egen formulering af
DoD-kravet.

## Rollback-strategi pr. skive-type

⚠ **Skive 3 og Skive 4 er ikke længere monolitiske.** Efter Korrektion 10 i
`00_AUTHORITATIVE_PRODUCT_RULES.md` er de splittet i selvstændige,
rollbackbare delskiver — 3A–3D og 4A–4D — hver med sin EGEN fulde
8-punkts struktur (inkl. egen Definition of Done, testcases og rollback).
Mønstrene nedenfor pr. change-type-tag gælder derfor PR. DELSKIVE, ikke for
et samlet, tidligere Skive 3 eller Skive 4: fx skal 3A
(`NAVIGATION_ONLY`/`VIEW_COMPOSITION`), 3B (`BACKEND_REQUIRED`), 3C
(`VIEW_COMPOSITION`) og 3D (`BACKEND_REQUIRED`) hver kunne rulles tilbage
uafhængigt af de andre — en rollback af 3B's Fleet-indberetningstriage må
ikke kræve en rollback af 3C's Sagsvisning-kobling. Samme gælder 4A
(`PERMISSION_MODEL`+`NAVIGATION_ONLY`/`ROUTE_REDIRECT`), 4B
(`PERMISSION_MODEL`+`VIEW_COMPOSITION`), 4C (`BACKEND_REQUIRED`, platformens
første fillagring, højeste risiko i hele planen) og 4D
(`BACKEND_REQUIRED`). Se `05_IMPLEMENTATION_SLICES.md` for den autoritative
per-delskive Definition of Done/testcases/rollback — dette dokument
gengiver den ikke, det sikrer kun at rollback-RAMMEN nedenfor ikke antager
én kombineret Skive 3 eller Skive 4.

Generisk mønster pr. change-type-tag (blueprintets egne 7 tags):

**NAVIGATION_ONLY / HIDE_ONLY / ROUTE_REDIRECT**
Ren `git revert` af commit(s). Ingen dataimplikation — disse ændrer kun
`nav.js` og evt. `REDIRECTS`/`App.jsx`-routing. Sikker at rulle tilbage når
som helst, også efter deploy, fordi der ikke er nogen server-side
tilstand at forsone: `firebase.rules.json` og Cloud Functions rører de ikke.
Eneste efterkontrol: kør `npm test` for at bekræfte at
`test/rutedeling.test.mjs`, `test/moduler.test.mjs` og
`test/navadgang.test.mjs` er grønne igen efter reverten (de er netop skrevet
til at fange en menu/rute der er kommet ud af sync).

**VIEW_COMPOSITION**
`git revert` af komponentændringen. ⚠ Risiko specifik for denne tag: hvis
komponenten der blev flyttet/indlejret ANDETSTEDS (fx Forslag ind i
Disponerings-panel, jf. blueprintets Skive 3) samtidig fik sin
STANDALONE-rute fjernet (et `HIDE_ONLY`/`ROUTE_REDIRECT`-skridt udført i
samme skive), er en ren revert af VIEW_COMPOSITION-delen ikke nok — den
gamle selvstændige rute skal også genindsættes, ellers mangler brugeren
begge veje ind midlertidigt. Rul derfor altid BEGGE dele af en sammensat
skive tilbage sammen, og bekræft med `test/rutedeling.test.mjs` at hver
`lazy()`-import stadig peger på en fil, der stadig eksporterer default.

**PERMISSION_MODEL**
`git revert` af `src/fleet/permissions.js`/`firebase.rules.json` er
**ikke tilstrækkeligt alene**, hvis ændringen allerede er udrullet OG
brugere allerede har fået deres token re-mintet med de nye claims. Reference:
CLAUDE.md dokumenterer eksplicit at "En permissions-ændring i kode … rammer
ikke eksisterende brugeres tokens automatisk" og omvendt — en ALLEREDE
udstedt claim overlever en kode-revert, fordi et Firebase Auth custom claim
er en separat, mintet tilstand (sat af `skiftrolle`, som også kalder
`auth.revokeRefreshTokens(maalUid)` — se `functions/index.js`). En
kode-rollback retter filen, men brugere der har logget ind (eller fået
`skiftrolle`/`opretbruger` kørt) EFTER den forkerte ændring blev udrullet,
sidder fortsat med det forkerte permission-sæt i deres token indtil de bliver
re-mintet. En reel PERMISSION_MODEL-rollback kræver derfor: (1) kode-revert,
(2) `npm run regler:udrul` for at få den rullede rules-fil ud, og (3) en
eksplicit re-mint (kald `skiftrolle` for hver berørt bruger, eller en dedikeret
"genudsted alle claims"-Cloud Function — som audit-dokumentet bemærker
IKKE findes i produktion i dag) for at tvinge tokens tilbage på linje med
den rullede kode. **Ifølge blueprintet kræver Skive 0–8 ingen
PERMISSION_MODEL-ændring** — de to konflikter (sager-backend, kompetencer)
er begge verificeret som ALLEREDE korrekt gatet — så denne risiko er reelt
kun aktuel, hvis en senere skive uventet viser sig at kræve et nyt
permission-preset.

**DATA_MODEL**
Sværest at rulle tilbage, hvis ægte data allerede er skrevet i den nye form.
Anbefaling, konsistent med kodebasens egen disciplin: migrationer skal være
**strengt additive** — tilføj nye felter/noder, fjern eller mutér ALDRIG
eksisterende felter i samme skridt. `src/fleet/skriv.js`'s egen dokumenterede
princip citeres direkte: *"DER HÅRDSLETTES ALDRIG. Der er ingen slet() i
denne fil… en post tages ud af drift med en status og en årsag."* Samme
disciplin skal gælde en skives DATA_MODEL-ændringer: et nyt felt lægges til
uden at det gamle felt fjernes i samme commit, så en kode-only rollback
altid er tilstrækkelig (den nye skrivning stopper, det gamle felt findes
stadig, ingen efterfølgende oprydning af data er nødvendig for selve
rollbacken). En destruktiv migration (fjernelse af et gammelt felt) udføres
først i en SENERE, selvstændig skive, når den nye form har stået uændret i
produktion længe nok til at være tillidsvækkende — aldrig i samme skive som
selve navigationsoprydningen. **Ifølge blueprintet indeholder Skive 0–8 ingen
eksplicit DATA_MODEL-ændring** ud over det der allerede er additivt
dokumenteret (fx `sager`-modtagevej, som er BACKEND_REQUIRED, se nedenfor) —
tagget er medtaget her for fuldstændighedens skyld, fordi enkelte
FINISH-beslutninger (fx Bookingopsætnings satspersistering, kompetence-
skrivevej) kan vise sig at kræve et nyt, additivt felt undervejs.

**BACKEND_REQUIRED**
Rollback via `firebase deploy --only functions --project dev` af en
tidligere Cloud Functions-version (`npm run funktioner:udrul` udruller den
aktuelle `functions/`-mappe — en rollback er den samme kommando kørt efter
et `git checkout` af den ønskede tidligere commit for `functions/`, fulgt af
`npm run delt:kopier` for at genskabe `functions/delt/`, som IKKE må
redigeres direkte, jf. CLAUDE.md). ⚠ Samme forbehold som DATA_MODEL: er
funktionen allerede blevet kaldt af brugere før rollbacken, kan den have
skrevet data i en ny form (fx en `sager`-post via `sagOpret`, hvis Skive 3
bygger den fulde mail-modtagevej). Samme additive-disciplin gælder: en ny
Cloud Function bør skrive til et NYT node-træ eller NYE felter, aldrig
omforme et eksisterende felts betydning, netop så en funktionsrollback ikke
efterlader inkonsistente poster.

## Deploy-rækkefølge og sikkerhedsnet

Projektets egen etablerede disciplin (fra CLAUDE.md, `.githooks/pre-commit`
og `scripts/tjek-regler.mjs`) gælder uændret for hver skive i denne
oprydning:

1. **Pre-commit-hook** kører automatisk (kræver `git config core.hooksPath
   .githooks`, én gang pr. klon): `test:design` hvis `src/` er rørt,
   `lint` hvis JS/JSX/MJS er rørt, `test:rules` (den fulde suite) hvis
   `firebase.rules.json` er rørt. Ingen af Skive 1–2's rene
   NAVIGATION_ONLY/HIDE_ONLY-ændringer rører `firebase.rules.json`, så kun
   `lint` og `test:design` udløses af dem — hvilket er korrekt, for de rører
   ikke sikkerhedsmodellen.
2. **`npm test` kører grønt lokalt FØR hver commit** i en skive (ikke kun
   ved commit-tidspunktet — kør det eksplicit efter hver skives ændringer er
   færdige, som en selvstændig kvalitetsport ud over hooken).
3. **Enhver ændring i `firebase.rules.json` kræver `npm run test:rules`
   grønt FØR commit, ingen undtagelser** — CLAUDE.md's eget, hårdeste krav,
   begrundet med at netop en kommentar-ændring engang gjorde hele regelfilen
   ugyldig i månedsvis uden at nogen opdagede det, fordi ingen kørte
   testene.
4. **DEV før PROD, altid.** `npm run regler:udrul` og
   `npm run funktioner:udrul` peger begge på `--project dev`. Der findes
   intet script i `package.json`, der udruller til et PROD-projekt — enhver
   PROD-udrulning ville kræve en eksplicit, separat kommando uden for det
   der er dokumenteret her.
5. **Efter DEV-udrulning: valider mod rolle × modulkombination-matrixen
   ovenfor**, manuelt i DEV, for netop den skive der lige blev udrullet
   (ikke nødvendigvis alle 5 testtenants for hver skive — brug den/de
   tenants der rammer de moduler/roller skiven faktisk rørte).
6. **`npm run regler:tjek` FØR den næste skive påbegyndes**, hvis den
   forrige skive rørte `firebase.rules.json` — for at bekræfte at det
   udrullede DEV-projekt reelt matcher filen, ikke kun at filens egne test
   er grønne (`scripts/tjek-regler.mjs`'s eksplicitte begrundelse: "De 591
   [nu 3027] prøver havde ret om FILEN og sagde intet om DATABASEN").
7. **PROD-deployment besluttes IKKE af denne plan.** Hver PROD-udrulning
   kræver separat, eksplicit godkendelse fra ejeren, skive for skive —
   konsistent med hvordan denne session hele vejen igennem kun har
   arbejdet mod DEV og kun med eksplicit bekræftelse før nogen
   brugervendt ændring. Definition of Done for PROGRAMMET (blueprintets
   §"Definition of Done for oprydningsprogrammet") kræver at "fuld
   test-suite er grøn, og der findes en dokumenteret rollback pr. skive" —
   dette dokument leverer rollback-mønstret; den faktiske grønne kørsel
   skal gentages efter HVER skive, ikke kun én gang til sidst.
