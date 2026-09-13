# Veyro – afslutningsrapport for integrationsrunde V2

Dato: 13. september 2026

Arbejdsspor: `codex/veyro-integration-v1`

Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-integration`

## 1. Resultat og afgrænsning

Den lokale samling indeholder nu PROCURE, kundens Support og hele
Ejerkonsollen sammen med den tidligere fælles base: FLEET, FACILITY, PLANNING,
Fakturacenter, UNIT, WAREHOUSE og WORKFORCE. Kundesiden bruger én AppShell.
Ejerkonsollen bruger fortsat sin egen EjerRamme og den tenantløse
`udbyder`-grænse.

Dette er Milepæl A med isoleret emulatorafprøvning af de afleverede
serverfunktioner. Det er ikke en produktionsrelease. Microsoft 365, rigtig
mail, OpenAI, Dinero, OBD, webshop og øvrige eksterne transporter er ikke
tilsluttet. FLEET, FACILITY og Fakturacenter har fortsat de dokumenterede
lokale prototypegrænser, hvor der endnu ikke findes et fælles serverflow.

Start-HEAD var `9a3c507fa61383323fc41089b31718d9e5519d6f`. Produkt- og testkode før denne
rapport ender på `096f77becccc4a35f9515c5c5f3bb9ae0eb1785b`; det endelige lokale HEAD med
rapporten aflæses af Git og angives i afleveringsteksten.

## 2. Sporbar historik

| Etape | Commit | Forældre / hensigt |
|---|---|---|
| PROCURE merge | `0e3cad9744eb81e3d8c3e87a39e518d8aa800a9b` | Start-HEAD + præcist overleveringscheckpoint |
| PROCURE gatefix | `a0a5414214b0c212e99eff8f00182b1b61339e0e` | Windows-sti og linjeskift i kontroller; ingen adgangskontrol svækket |
| Support merge | `7d9476dbe0e74db987c21c83cb9ffe951956cc2b` | PROCURE-resultat + præcist Support-checkpoint |
| Ejerkonsol merge | `75c7396feeff95be5188404d7ea17bb70fb5175a` | Support-resultat + hele ejerleverancen |
| Ejer-typografi | `f25a2e74e43532accb022b403afb407757b74648` | Ejerfladen koblet til fælles typografitokens |
| Fælles UX | `284922048b9e0601e26f5c40c571bf047b07ae7b` | Menu, zoom, paneler og sikre klikbare rækker |
| Slutregressioner | `bf5f0b2084b833f838b1ee58a4d1df16162b2cb4` | Semantiske testforventninger afstemt med den samlede ejer-/Support-model |
| Emulatorgrundlag | `096f77becccc4a35f9515c5c5f3bb9ae0eb1785b` | Isoleret samlet konfiguration, pilotseed og ikke-destruktiv Support-prøve |

Git har verificeret følgende som forfædre til slutproduktet:

- PROCURE-overlevering `eef500ae834d159c8aaf5a3e6b878170bf2571e5`
  og produkt `4f613bdd41632629717e93247f8d9dc7a3ea534b`.
- Support-overlevering `aae761d18e8835cc2c572316068f8f51e50aaee8`
  og produkt `aa269edc0e757ff6b5c2f2beddd628c643057c71`.
- Ejerkonsol-overlevering `f4683049a68fac5265e31ceafb22d6684f736a34`
  og permanent adapter `f7325ea94044a577a9660b323270f965ae4ac8a7`.
- De fire tidligere modulcheckpoints: FLEET `3725ac0553ad711a1d52a8d24fad3f14977d8e8e`,
  FACILITY `1b755defb49e17aec0282427737c40bcb4a29004`, PLANNING
  `550a19c70684b123715e656d7d171a0d4992fed7` og Fakturacenter
  `deb1615f58926bb0857714c40b62037fb6c1414e`.

Afstande fra start-HEAD til checkpoint før merge var henholdsvis 3/22 commits
for PROCURE, 1/6 for Support og 3/70 for Ejerkonsollen (venstre/højre). Fælles
forfader var den sikrede firemodulbase `989dbb87...` for PROCURE og ejer;
Support delte `6e164c9a...` med modtagersiden. Ingen nyere branchspids blev
automatisk taget med.

## 3. Rækkefølge og konfliktbeslutninger

Rækkefølgen blev PROCURE → Support → hele Ejerkonsollen. PROCURE blev taget
først, fordi det udvider tenantens ordre-, lager-, faktura- og Function/Rules-
flader. Support kom derefter for at etablere én autoritativ `support/`-model.
Ejerkonsollen kom sidst, så dens permanente adapter kunne afprøves mod den
allerede samlede Support-kontrakt.

Følgende fælles områder blev kombineret semantisk:

- `functions/index.js`: eksisterende sikkerhed/claims, PROCURE-callables,
  Support V1.1 og hele ejerens CRM-, tilbud-, økonomi-, mail- og
  adapterfunktioner. Der er kun én Supporttransport.
- `functions/package.json` og lockfil: PROCUREs credentialbehov og ejerens
  præcise `pdf-lib`/`qrcode`-behov blev bevaret uden bred opgradering.
- `src/firebase.js`: én klient, fail-closed emulatorværn, Auth/Database/
  Functions aliases og ejer-/tenantgrænser.
- Database- og Storage Rules: PROCUREs tenantressourcer, Supportens projektion
  og ejerens signeret-URL-/økonomiforløb blev kombineret uden en generel
  `ours`/`theirs`-løsning.
- Routing/AppShell/EjerRamme: `/indkoeb/*`, `/support` og `/main/*` er
  sideordnede sikkerhedsgrænser; tenantadministratorer får ikke ejeradgang.
- CSS/tokens: Inter, Veyro-logo og `src/fleet/fleet.css` er fælles autoritet.
  Ejerens særskilte geometri bevares, mens skriftstørrelser bruger fælles
  tokens. Scoped modul-CSS er bevaret.
- Fakturacenterets Reference Contract V1 er bevaret. PROCURE kan åbne den
  faktiske Fakturacenter-rute med PO-kontekst, men Fakturacenterets viste
  dokumenter/match er fortsat lokale fixtures og er hverken bogføring eller
  betaling.

Support bruger kontrakten `veyro.support.v1.1` og de fem autoritative
callables `supportEjerAiForslagGem`, `supportEjerBaggrundGem`,
`supportEjerSvarKladdeGem`, `supportEjerSvarGodkend` og
`supportEjerSvarTransporter`. Legacy `supportEjerSvarSend` er ikke i
brugerfladens transportvej.

## 4. Fælles design og betjening

Den normative standard og statusmatrix findes i
`VEYRO_FAELLES_UX_STANDARD_V1.md`. Implementeringen tilføjer:

- Normal/Kompakt sidebar med én kantknap og tilladelsesfiltrerede flyouts.
- Arbejdsområdezoom 75–130 % via Shift+musehjul og synlige kontroller; sidebar
  og topbjælke skaleres ikke, og Ctrl/Cmd overtages ikke.
- Præferencenøgler afgrænset efter miljø, bruger, tenant/ejer, skærm og valg,
  med nulstilling til dokumenterede standarder.
- Fælles tastaturbetjent panelseparator med minimumsbredder og mobilstakning;
  den er anvendt på kundens Support og kan genbruges af specialflader.
- Fælles tabelrækker, som ikke åbnes ved handling på indre knapper, links,
  checkboxes, menuer eller formularfelter.
- Ejer-Supportens permanente adapter og mobilrettelse er bevaret.

Matrixen bruger bevidst `Delvis`, hvor en ældre specialflade endnu ikke er
flyttet til alle fælles primitiver. UNIT-, WAREHOUSE- og WORKFORCE-visningerne
er regressionstestet gennem den fælles shell, men deres sideløbende redesign
er ikke importeret.

## 5. Isoleret testmiljø

| Tjeneste | Værdi |
|---|---|
| Projekt | `demo-veyro-owner` |
| Auth | `127.0.0.1:9099` |
| Realtime Database | `127.0.0.1:9000` |
| Functions | `127.0.0.1:5001` |
| Storage | `127.0.0.1:9199` |
| Eventarc / Tasks | `9300` / `9500` (standardporte var optaget og blev bevaret) |
| Java | Eclipse Temurin `21.0.12.1`, proceslokal `JAVA_HOME` |
| Node | `24.19.0` |
| Firebase CLI | `15.29.0` |
| Preview | `http://127.0.0.1:5197/`, produktionsbuild med `strictPort` |

`firebase.integration-v2.json` og pilotseedet nægter andre end eksplicitte
localhostporte og `demo-veyro-owner`. Javas midlertidige mappe blev sat
proceslokalt til `C:\Users\DennisChristensen\jtmp`; global Java 8,
`JAVA_HOME` og PATH er ikke ændret. Previewet er bygget med eksplicit
`VITE_FIREBASE_EMULATOR_PREVIEW=true`, localhost og `demo-*`; et almindeligt
produktionsbuild med emulatorflag fejler lukket.

Windows viste under opstart to signerede netværks-/administratorforespørgsler
med udgiveren Eclipse Foundation. De blev afvist. Proces- og logkontrol bandt
dem til den allerede installerede, gyldigt signerede
`C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.12.1+1\jdk-21.0.12.1+1\bin\java.exe`,
som Firebase startede til Database-emulatoren og Storage Rules-runtime. Den
loggede Database-kommando anvendte
`firebase-database-emulator-v4.11.2.jar`, `--host 127.0.0.1` og `--port 9000`.
Der blev ikke startet eller gennemført en JDK-installation, og forespørgslerne
var ikke nødvendige for den lokale gate.

Pilotgrundlaget har fem PROCURE-roller, Supportens kunde/ejer/andre
tenantbrugere samt ejer-reviewbrugere (samlet cirka 14 syntetiske Auth-konti)
og seks syntetiske enheder. Dataene findes kun i den isolerede suite.

## 6. Testresultater på det samlede kodegrundlag

### Slutgate

- `npm run lint`: bestået.
- `npm run test:design`: 11/11 bestået; én autoritativ farvekilde.
- `node --check functions/index.js`: bestået.
- `git diff --check`: bestået; Git varsler kun om forventet lokal
  LF→CRLF-konvertering på enkelte dokumenter/scripts.
- `npm run test:rules`: 4.512/4.512 tests i 887 suites, 0 fejl og 0
  annullerede, med Database og Storage emulatorer på JDK 21. Dette er den
  faktiske slutkode efter alle tre merges og fælles UX.
- `npm run build`: 707 moduler transformeret, bestået. Alle moduler findes i
  buildets lazy chunks. PROCURE-chunken er cirka 1,409 MB minificeret og giver
  den kendte Vite >500 kB-advarsel.

### Moduler og kontrakter

- PROCUREs målrettede gate efter merge: 171/171 bestået. Den fulde slutgate
  inkluderer det efterfølgende samlede regelsæt.
- Supportens kontrakt-/adaptergate: 41/41 bestået; ejer-/Supportens målrettede
  suite: 180/180 bestået. Den afsluttende emulatorprøve bestod på samme
  samlede suite.
- FACILITY: lint bestået, 38/38 tests bestået, standalone-build (98 moduler)
  bestået. `@eslint/js` findes i FACILITYs manifest og lockfil; den rapporterede
  installationsfejl kunne ikke reproduceres, og ingen lintregel blev slået fra.
- FLEET: fuld kørsel 142/143; én kendt belastningsafhængig 5-sekunders-timeout
  i `ReportFlow.test.jsx`. Samme fil bestod isoleret 4/4 på 10,19 sekunder,
  heraf den berørte test på 1,82 sekunder. Standalone-build bestod.
- Planning, Fakturacenter og Reference Contract V1 indgår i de 4.512
  sluttests; de tidligere integrerede ruter og chunks blev desuden åbnet i
  den byggede app.

### Emulatorflow

Den afsluttende Support V1.1-prøve oprettede `SUP-2026-00001` med id
`-P1QPfZjFjygFxxSplDn` og dokumenterede:

- kunde → lokal deterministisk AI → eskalering → ejerprojektion → overtagelse
  → intern AI/baggrund → gemt kladde → godkendelse → portaltransport → samme
  kundesamtale;
- én kundesignatur, stabilt anmodnings-ID og retry uden dobbeltlevering;
- afvist forældet godkendelse og fail-closed legacy direkte send;
- ingen intern note, AI-baggrund eller intern kilde i kundepayloaden;
- kundebesked efter ejerovertagelse starter ikke kunde-AI igen;
- anden bruger i samme tenant, fremmed tenant og anonym bruger blev prøvet,
  og forbudte læsninger blev afvist.

Ejerens CRM/tilbud/PDF/aftale/tenant/kundekonto/invitationer samt reviewseed
bestod mod de samme lokale tjenester. Reviewintegrationerne endte eksplicit i
`ikke_tilsluttet`, så ingen ekstern transport blev udført.

## 7. Browserbeviser fra den byggede app

Browserkontrollen brugte previewet på port 5197, ikke Vite-devserveren.

- Login/logout, anonym direkte `/indkoeb`, direkte URL, reload, frem/tilbage
  og modulskift blev afprøvet.
- FLEET `/fleet-v2/livekort`, FACILITY `/facility-v2`, PLANNING
  `/planning-v2/planlaegning`, Fakturacenter, PROCURE, WAREHOUSE, UNIT,
  WORKFORCE og `/support` blev åbnet med én kundeshell og ét logo.
- En bruger med kun `indkoeb.laes` kunne åbne PROCURE, men FACILITY viste
  `Ingen adgang til FACILITY` i modulområdet og ingen lokale prototypedata.
  Samme tenantbruger blev afvist fra `/main`. Anonym direkte URL gik til
  `/login`.
- Ejerbrugeren med tenantløst `udbyder`-claim gik til `/main`. Overblik, mail,
  salgsindbakke, kunder/CRM, tilbud, fakturaer, bilag, rapporter og
  integrationer blev åbnet. `/main/kunder` og `/main/indstillinger` er ikke
  selvstændige indeksruter og videresender aktuelt til ejerens overblik;
  de konkrete undersider findes via navigationen.
- PROCUREs ordreoversigt, ordre `BST-2026-00042`, godkendelser,
  delmodtagelsesformular, lager, forbrug og Fakturacenter med PO-kontekst blev
  åbnet. Et klik på den klientgenererede PDF gav ingen observerbar
  download-event i browserværktøjet; PDF-bytes er dækket af tests, men den
  faktiske lokale filåbning er derfor en manuel restkontrol.
- Den samme `SUP-2026-00001` viste kundens fire beskeder og ejersvaret på
  `/support`; `/main/support` viste samme fire beskeder samt den interne note,
  interne AI-chat og revisionsmarkeringen, som ikke fandtes på kundesiden.
- Kompakt menu ændrede sidebar fra cirka 216 til 72 CSS-px. Arbejdsområdezoom
  ændrede kun indholdet til 105 %, mens sidebar og topbjælke beholdt målene;
  nulstilling gendannede Normal og 100 %.
- Viewport-capability blev kørt ved 360×800, 390×844, tablet, 899/900,
  1440×900 og 1920×1080. Browserens skalering gav CSS-viewport 537×1194 ved
  det anmodede 360×800 og 582×1259 ved 390×844. På ejerens faktiske mobile
  Svar-og-AI-visning målte historikken henholdsvis 743 og 828 CSS-px; komposer
  og historik overlappede ikke, og der var ingen vandret dokumentoverflow.
  Fysisk skærmtastatur er ikke afprøvet.
- Ingen nye runtime exceptions opstod efter det korrekte emulatorbyggede
  artifact. Firebase advarede om manglende indeks for enkelte syntetiske
  queries (`personale`, ejerens invitationer/aftaler samt dele af PROCURE);
  de er registreret som performance-/pilotarbejde.

## 8. Dependency- og sikkerhedsstatus

Der er ikke kørt `npm audit fix` eller foretaget brede opgraderinger. Aktuel
read-only audit viser:

| Område | Resultat |
|---|---|
| Root | 21 fund: 18 moderate, 3 high, 0 critical |
| Functions | 11 moderate |
| FLEET standalone | 5 fund: 3 moderate, 1 high, 1 critical, primært gamle Vite/Vitest-devværktøjer |
| FACILITY standalone | 0 |

Fundene skal triageres i en separat, testet dependencyrunde før pilot. De
ændrer ikke Rules-gatens resultat, men især FLEETs gamle devserver/vitest må
ikke eksponeres på et ubeskyttet netværk. Functions-emulatoren advarer også om
at manifestet erklærer Node 20, mens den lokale vært kører Node 24; dette skal
afstemmes før deployment.

## 9. Resterende pilotarbejde frem mod 1. oktober

- **PROCURE:** indeks, fuld browserverifikation af PDF-download/visning,
  transportpolitik, idempotens-/driftsalarmer og aftalt kobling til
  Fakturacenterets servermodel. Match er ikke bogføring eller betaling.
- **FACILITY:** flyt lokal IndexedDB/Blob-prototype til tenantafgrænset
  serverrepository, Rules, samtidighed og dokumentretention; behold
  standalone-grænsen.
- **FLEET:** serverrepository, bilags-/billedlagring, migrerings- og
  rollbackplan, samt stabilisering af den belastningsafhængige komponenttest.
  OBD er fortsat valgfri.
- **Fakturacenter:** autoritativ serverlagring/modtagelse, malware/OCR-policy,
  fælles adapteraftaler, bogførings-/betalingsgrænse og auditspor.
- **Fælles:** audit-triage, nødvendige databaseindeks, fysisk mobil/touch/
  tastatur/PDF-test, stagingdeployment med claims-/revocation-gate, overvågning,
  backup/restore og ekstern kontrol af Netlify/webhooks før et senere push.

## 10. Modulspor efter denne samling

De sideløbende modulbranches ændres ikke her. Før næste leverance skal hvert
modulspor sammenligne sin branch med dette integrations-HEAD, bevare lokalt
arbejde og indarbejde den nye fælles base kontrolleret. Modulchatten ejer
komponenter, domænelogik, adaptere og modultests. Integrationschatten ejer
routing, AppShell/EjerRamme-grænser, login, Rules/Functions, fælles kontrakter,
tokens og root-dependencies. En aflevering skal give præcist commit-ID,
ændringsbeskrivelse, berørte fælles filer og testresultater; integrationen
optager én leverance ad gangen.

## 11. Lokal adgang

Kundeside: `http://127.0.0.1:5197/`

Kundesupport: `http://127.0.0.1:5197/support`

Ejerområde: `http://127.0.0.1:5197/main`

Syntetiske credentials står ikke i denne versionsstyrede rapport. De oplyses
kun i den lokale afleveringstekst og må ikke kopieres til en deployment.
