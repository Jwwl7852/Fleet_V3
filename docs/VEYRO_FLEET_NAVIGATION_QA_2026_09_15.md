# FLEET-navigation og integreret browser-QA — 15. september 2026

## Faktisk prøvet app og miljø

Den afsluttende prøve blev kørt fra
`C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-integration` på branch
`codex/veyro-integration-v1` og produktcommits
`97858a5fc9375af5eb6256beb6a9ecb2b868655d`,
`167d93706891543beb8a4d627b80e0632be2d3d7`,
`c14e52dcb62549fba841468711a09dc539d11d34`,
`c5bb8613aea6c5cc39221464b732ecda5622a082`,
`c03f64c118688f0d9b9d05cdd65742568c604516`,
`ff8c03aabf62b827aae3afbc62d1465a8b73642d` og
`adc63b7dedc812011f2af25e813c59726629ec21`. Sidstnævnte commit fastholder
også den endelige QA-harness og Warehouse-regressionen.

Det var den byggede **samlede root-app med indlejret FLEET**, ikke FLEETs
standalone-app:

- build: `npm run build`;
- server: `npm run preview -- --host 127.0.0.1 --port 5197 --strictPort`;
- app: `http://127.0.0.1:5197/`;
- FLEET: `http://127.0.0.1:5197/fleet-v2`;
- arbejdskø: `http://127.0.0.1:5197/fleet-v2/arbejdsko`;
- indberetninger: `http://127.0.0.1:5197/fleet-v2/indberetninger`;
- Livekort: `http://127.0.0.1:5197/fleet-v2/livekort`;
- sagsmappe: `http://127.0.0.1:5197/fleet-v2/sager/case-demo-001`;
- Fakturacenter: `http://127.0.0.1:5197/oekonomi/fakturacenter`.

Serveren brugte den isolerede Firebase Emulator Suite for projekt
`demo-veyro-owner`: Auth `127.0.0.1:9099`, Realtime Database
`127.0.0.1:9000`, Functions `127.0.0.1:5001` og Storage
`127.0.0.1:9199`. `scripts/seed-integration-v2-pilot.mjs` oprettede fem
syntetiske brugere/claims, tenant `procure-auth-a`, moduladgang og syv
syntetiske fælles enheder samt fem syntetiske serverfakturaer. Seedet nægter
at køre mod andet end demo-projektet og de fire localhost-porte. Root-buildet
blev eksplicit bygget med samme `demo-veyro-owner`-namespace som seed og
Functions; den almindelige `.env.local` blev ikke ændret.

Normal Firebase Auth, aktivt abonnement, tenant-claims og modulpermissions var
aktive. Der blev ikke indført loginomgåelse, claims-fallback eller skjult
demodata. Bruger-, tenant-, modul- og fælles enhedsdata kom fra emulatoren.
FLEET og PLANNING læste samme `tenants/<tenant>/koeretoejer`-post, og FLEET
skrev sin profil tilbage til denne fælles kilde uden IndexedDB-fallback.
FLEETs eksisterende sags-/indberetnings-/værkstedsposter kom fra en isoleret lokal IndexedDB med
tydeligt syntetiske fixtures; Livekortets popup angav kilden
`fleet-v2-demo-fixture`. Ingen ekstern GPS/OBD-, bogførings-, mail- eller
produktionstjeneste var aktiveret.

Den tidligere prøve mod `http://127.0.0.1:5197/arbejdsko`, `/livekort` og
`/sager/case-demo-001` var FLEET-standalone. Den bevares kun som historisk
modulbevis og tæller ikke som integreret browserbevis.

## Adgangs- og shellbevis

- Anonym direkte åbning af `/fleet-v2/livekort` endte på `/login`.
- En normal autentificeret læsebruger uden FLEET-adgang blev på den beskyttede
  route og fik `Ingen adgang til FLEET`; FLEET-indhold blev ikke monteret.
- En normal autentificeret administrator åbnede root-appens FLEET-route.
  DOM-kontrollen fandt én AppShell, ét FLEET-modul, én embedded markør og nul
  standalone-shells.
- Arbejdsområdezoom gik 100 % → 105 % med knap → 110 % med Shift+hjulet.
  Sidebarbredden forblev 216 px, og topbjælken 83,546875 px.
- Kompakt navigation blev aktiveret med label `Kompakt navigation`; den
  afrundede flig sad geometrisk centreret på sidebjælkens højre kant.
- Musen kunne flyttes fra Fleet-ikonet ind i flyoutet uden lukning. Fokus på
  Fleet-knappen åbnede flyoutet, Tab flyttede til `Overblik`, og ESC lukkede
  med fokusretur. Touch åbnede flyoutet, og touch udenfor lukkede det.

## Navigation, dialoger og berørte skærme

- Arbejdskøens filter `Knirkende`, tabelvisning, valgte sag og scrollposition
  212 px blev bevaret gennem sagsmappe og tilbage-navigation.
- Indberetningernes filter blev bevaret gennem sagsmappen.
- Enhedskatalogets filter blev bevaret gennem enhedsprofil, genindlæsning af
  profilen og tilbage-navigation.
- Livekortets valgte enhed blev bevaret gennem enhedsprofil og retur.
- Direkte åbning og genindlæsning af sagsmappen brugte den sikre interne
  fallback `/fleet-v2/arbejdsko` og forlod ikke programmet.
- Sagsmappen havde nul af de gamle syv faner og viste problem/næste handling,
  sagsarbejde, historik og en separat infokolonne.
- En dirty manuel-sag-dialog blev ikke lukket af ESC uden den fælles
  bekræftelse. Bekræftet X-lukning lukkede den, og fokus kom tilbage til
  åbneren.
- En `wide` arbejdskødialog blev ved 1920×1080 flyttet 100 px med mus og
  forblev inden for arbejdsfladen. Ved 1440 px udfylder den den tilladte
  bredde og klemmes derfor korrekt mod kanten; ved 390×844 bliver den
  fuldskærm med intern lodret scroll.
- Fakturacenterets `Matchet`, `Flere moduler` og `Mangler match` blev afprøvet
  mod fem serverposter. `Flere moduler` viste kun den syntetiske
  `FC-FILTER-FLERE`.
- Fakturalistens panelbredde blev ændret med separatorens ArrowRight fra 22
  til 23 %, skrevet i visningslageret og genfundet uændret efter reload.
- En syntetisk enhed blev oprettet i FLEET, fundet direkte i emulatorens
  `koeretoejer/<id>` med `fleetProfil` og derefter vist i PLANNINGs Ressourcer.
- Fra sagsbestillingen blev et syntetisk værksted oprettet i det fælles
  leverandørregister. Returforløbet valgte værkstedet og bevarede både
  arbejdsbeskrivelse og mailtekst præcist.
- Fakturacenter viste Indbakke, aktiv betinget Ekstra kontrol og Arkiv.
  Første administrator kontrollerede `FC-ENKELT-OVER` og blev i Indbakke;
  fakturaen flyttede til Ekstra kontrol. Samme brugers ekstra godkendelse blev
  afvist af serveren, mens en ny normal session som den udpegede godkender
  flyttede posten til Arkiv.
- Nettogrænsen var 100.000 øre ekskl. moms. I massekontrollen blev posten på
  90.000 øre netto/22.500 øre moms arkiveret, posten på 125.000 øre netto
  sendt til Ekstra kontrol, og posten uden destination bevaret i Indbakke med
  serverens konkrete afvisningsgrund. UI viste `2 lykkedes, 1 blokeret` og ét
  præcist resultat pr. faktura. Alle fire fakturaers betalingsstatus forblev
  `modtaget`; ingen handling blev præsenteret som betaling eller bogføring.
- Service viste først permanent `Indlæser servicekrav …`, selv efter alle seks
  serverprojektioner var færdige og tomme. Browserfundet blev rettet ved at
  medtage indberetnings-, sags- og historikprojektionernes loading-/fejltilstand
  i memoiseringsgrænsen. Den efterfølgende integrerede prøve viste den tomme,
  færdigindlæste servervisning uden lokal fallback.

## Viewports og artefakter

Den automatiserede matrix dækkede ti routes ved 1920×1080, 1440×900,
390×844 og 360×800: FLEET-overblik, arbejdskø, indberetninger, Livekort,
sagsmappe, Fakturacenter, Service, kategoristamdata, FLEET-økonomi og
FLEET-statistik. Alle 40 route-/viewportkombinationer havde `maxScrollX = 0`.
Mobilnavigationens aktive undermenu blev gjort til en vandret intern scroller.
Efter den nye komprimering og fjernelse af den dobbelte root-/moduloverskrift
begyndte hovedindholdet ved 125 px for FLEET-ruter og 126 px for Fakturacenter
i både 390×844 og 360×800. TEST-bjælken og den syntetiske datamærkning
forblev synlige. På 360×800 vises arbejdskøens fire nøgletal nu i et kompakt
2×2-gitter, så både filtre og den første sag er synlige i den første
arbejdsflade. På 390×844 blev en filtreret sag åbnet og lukket igen; retur til
arbejdskøen bevarede filteret `Knirkende` og den synlige sag.

På hver route og viewport blev layoutet desuden målt i normal og kompakt
sidebar ved 100 % og 125 % arbejdsområdezoom: 160/160 kombinationer viste den
forventede menu- og zoomtilstand uden vandret dokumentscroll. Dirty-dialogen
blev fotograferet separat ved alle fire viewports og forblev fuldt betjenelig.

Maskinlæsbar evidens og samtlige screenshots ligger i
`artifacts/veyro-rettelsesrunde-2026-09-15-v2/browser/`. Centrale billeder:

- `03-integreret-overblik-1440x900.png`;
- `10-livekort-popup-integreret-1440x900.png`;
- `11-sagsmappe-fra-indberetning-1440x900.png`;
- `12-fakturacenter-integreret-1440x900.png`;
- de 40 route-/viewportbilleder `04-*` til `09-*` og `13-*` til `16-*`;
- dirty-dialogbillederne `17-dirty-dialog-*` ved alle fire viewports;
- `18-ekstra-kontrol-egen-afvist-1440x900.png`;
- `19-ekstra-kontrol-anden-godkender-1440x900.png`;
- `20-massekontrol-bekraeftelse-1440x900.png`;
- `21-massekontrol-delvis-succes-1440x900.png`;
- `22-flytbar-dialog-1920x1080.png`;
- `23-arbejdsko-dialog-390x844.png`;
- `24-fakturacenter-match-modulfiltre-1440x900.png`;
- `25-faelles-enhed-i-planning-1440x900.png`;
- `26-leverandoer-retur-med-bevaret-sagskladde-1440x900.png`;
- `27-mobil-arbejdsko-sag-390x844.png`;
- `28-faelles-enhedsformular-1440x900.png`;
- `29-sidebar-warehouse-1440x900.png`, hvor menuetiketten vises som
  `Warehouse` med samme titelkapitalisering som de øvrige moduler;
- `RESULTAT.json` med alle målte assertions og nul runtimeproblemer.

Matrixen er et aktuelt slutgrundlagsbevis for de nævnte skærme og lukker
REG-03. UX-07 står fortsat delvist, fordi den resterende root-/ikke-FLEET-
dialogaudit og reelle save-/delete-fejlforløb ikke er fuldt browserprøvet.

## Tekniske kontroller på slutgrundlaget

- Root-lint: bestået.
- FLEET-lint: bestået.
- Designgate: 11/11 bestået.
- FLEET: 32 testfiler og 206/206 tests bestået.
- Root-produktionsbuild: bestået, 767 moduler transformeret.
- FLEET-produktionsbuild: bestået, 195 moduler transformeret.
- Functions-syntaks: bestået.
- Delte functions-filer: 29/29 tests bestået.
- Fuld Rules-/platformsgate: 4.629/4.629 tests bestået, 0 fejlet og 0
  sprunget over.
- Browser-QA: bestået, 40/40 route-/viewportkombinationer og 160/160
  layoutkombinationer uden vandret dokumentscroll og nul registrerede
  runtimeproblemer.
- `git diff --check`: bestået; Git viste kun repositoryets LF/CRLF-advarsler.

## Procesbegrænsninger

I den normale proces-sandbox kan Node-underprocesser fortsat fejle med
`spawn EPERM`, herunder esbuild og Node test-runneren. Skriveadgang og direkte
kørsel af binærerne er i orden; en selvstændig child-process-prøve reproducerede
fejlen. De nødvendige test- og buildprocesser blev kørt gennem den godkendte
procesgrænse og bestod. Det dokumenterer ikke, at sandboxens child-process-
begrænsning er ophævet.

Java-emulatorens tidligere opstartsfejl var en separat procesfejl. Den
afsluttende Rules-gate blev kørt med den proceslokale JDK
`C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.12.1+1\jdk-21.0.12.1+1`
og bestod 4.629/4.629.
Ingen sikkerhedstest blev sprunget over eller svækket.
