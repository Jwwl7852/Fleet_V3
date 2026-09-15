# Veyro rettelsesrunde 14. september 2026

Statusdokumentet er den sporbare arbejdsliste for rettelsesrunden bestilt i
`14-9-2026. Veyro rettelser..docx`. Skærmbillederne i Word-dokumentet er læst
sammen med teksten og bruges som fejl- og designreferencer; dokumentet er ikke
en ny datakilde eller en tilladelse til produktionsændringer.

## Grundlag og afgrænsning

- Start-HEAD: `7313eac39a0e8b55dbbb0f59b60f31c9753a67d`
- Branch: `codex/veyro-integration-v1`
- Lokal, utracked `functions/.env.demo-veyro-warehouse-integration-test`
  bevares og medtages ikke i commits.
- Ingen push, deployment, produktionsmigration, rigtig mail, eksterne AI-kald
  eller aktivering af OBD indgår.
- Syntetiske data skal mærkes; lokale fixtures må ikke beskrives som
  serverlagring eller eksternt modtagne data.

## Afklarede produktvalg

- Fakturacenterets beløbsgrænse beregnes ekskl. moms.
- Ekstra godkendelse skal foretages af en anden person end første kontrollant.
- Kunden udpeger tilladte ekstra kontrollanter i Opsætning før aktivering.
- Trækkrog, hængertræk, kran og lift er fire separate udstyrsvalg.
- Den tomme overskrift "Under administration" giver ingen opgaver.

## Kravregister

Statusværdier: `åben`, `i gang`, `implementeret`, `blokeret`, `ikke relevant`.
Et krav er først `implementeret`, når den angivne kontrol er gennemført på det
aktuelle kodegrundlag.

| ID | Område | Krav / faktisk årsag | Berørt kode | Status | Kontrol / bevis | Afhængighed eller beslutning |
| --- | --- | --- | --- | --- | --- | --- |
| UX-01 | Zoom | Første besøg 100 %, genindlæs af bruger-/kontekst-/skærmafgrænset valg og fungerende nulstilling. | `src/fleet/useVisningsvalg.js`, `src/fleet/AppShell.jsx` | implementeret | Design/navigationstest, build og browser ved 100 % samt nulstilling | Ingen |
| UX-02 | Sidebar | Menu/topbjælke påvirkes ikke af arbejdsområdezoom; menutekst flytter sig ikke ved scrollbar. | `src/fleet/fleet.css` | implementeret | Synlig Windows-scrollbar skjult; menuen måltes fortsat scrollbar fra 0 til 89,55 px (`1059/970 px`) og teksten er énlinjet | Ingen |
| UX-03 | Navigation | Hele moduloverskriften folder uden samtidig navigation; underpunkter navigerer. | `src/fleet/AppShell.jsx` | implementeret | Fakturacenter foldet på Dashboard uden URL-skift; underlinks eksponeret semantisk | Ingen |
| UX-04 | Kompakt menu | Flyout bevares fra ikon til menu, ligger over indhold, håndterer kanter/lange lister, ESC/udenfor, mus/tastatur/touch. ESC-fokus genåbnede tidligere straks flyoutet via containerens `onFocus`. | `src/fleet/AppShell.jsx`, `src/fleet/fleet.css` | implementeret | Integreret Playwright: hover fra ikon til undermenu, ESC med fokusretur uden genåbning, Enter-genåbning og navigation; `1440x900-kompakt-hovermenu-fleet.png` | Ingen |
| UX-05 | Foldeknap | Variant B, afrundet flig ca. 30×34 med mindst 44×44 klikmål, tokens og korrekt chevron/aria. | `src/fleet/AppShell.jsx`, `src/fleet/fleet.css` | implementeret | Beregnet klikmål 43,98×43,98 px; synlig pseudo-flig 30×34; titel, aria og korrekt chevron | Ingen |
| UX-06 | Navigation | Meningsfuld tilbagefunktion med bevaret visningstilstand; direkte åbning har fallback. | Fælles route-/visningskomponenter og `fleet-v2/src/data/navigationHistory.js` | implementeret lokalt | 18 berørte filer; 4/4 historiktests; 31 FLEET-testfiler og 198/198 tests; faktisk browser 15/9 fra overblik, arbejdskø, indberetninger, enhedsprofil og sagsmappe samt direkte URL/reload | Integreret browserbevis afventer normal login-tjeneste |
| UX-07 | Dialog | ESC, X, Annuller, ugemte data, fokusretur, bekræft Gem/Slet og fejlbevaring. | Fælles og berørte moduldialoger | i gang | Ny FLEET-rutedialog har fokusfælde, ESC/X/baggrund, fokusretur og dirty-bekræftelse; Manuel sag bevarer input ved fejl. 10/10 berørte komponenttests og browserforløb består. | Øvrige moduldialoger skal fortsat auditeres; domæner må bruge arkivering, hvor hard delete er forbudt |
| FC-01 | Navigation | Synligt forløb er Indbakke, betinget Ekstra kontrol og Arkiv; gamle dybe links mappes uden historiktab. | `src/fleet/fakturacenter-intake.js`, `src/moduler/oekonomi/Fakturacenter.jsx`, `src/fleet/nav.js` | implementeret | 100/100 målrettede tests; browser viste kun Indbakke og Arkiv, mens Ekstra kontrol er korrekt skjult før aktivering | Interne domænestatusser er bevaret |
| FC-02 | Kontrol | Succes fjerner posten fra arbejdsliste, bliver i Indbakke og vælger næste; fejl bevarer posten. | Fakturacenter UI/domæne | implementeret | Domænetest og browserwiring; succes flytter til intern kontrolleret/Arkiv-status uden sektionsskift | Lokal prototype, ikke serverlagring |
| FC-03 | Ekstra kontrol | Tilstande ingen/alle/over beløbsgrænse ekskl. moms; anden person; kundestyret allowlist; serveraudit. | Opsætning, fælles kontrakt, Functions/Rules | implementeret, men ikke verificeret | Opsætningen lagres tenantafgrænset; serverlisten viser ekstra kontrol betinget af opsætning/poster; godkendelse og tilbagesendelse går gennem callable med nettogrænse, anden person, allowlist, revision og audit; 12/12 adapter/domænetests og 21 callable-assertions består | Integreret browserbevis med to normale brugersessioner udestår, fordi den lokale app kræver manuel autentificering |
| FC-04 | Massekontrol | Checkbox, synligt omfang, én bekræftelse, adgang/revision/gates pr. faktura, delsvar og idempotent genforsøg. | Fakturacenter UI/domæne/Functions | implementeret, men ikke verificeret | Checkbox og én bekræftelse sender kun synlige valgte serverposter med deres kontrolrevision; serveren kontrollerer permission og grundlag pr. faktura og returnerer delsvar; genforsøg er idempotent; 21 callable-assertions består | Integreret browserbevis med autentificeret serverdatasæt udestår |
| FC-05 | Filtre | Matchkategori bevares; standard nyeste først erstattes som kontrol af modul inkl. uafklaret/flere fordelinger. | Fakturacenter UI | implementeret | Filtertest dækker FLEET, flere moduler og uafklaret; browser viste modulfilter og fast nyeste rækkefølge | Ingen |
| FC-06 | Upload | Filnavn, modtaget/behandler/fejlet, tydelig fremdrift, dubletværn og idempotent genforsøg; demo mærkes. | Fakturacenter intake/UI | i gang | Integreret browsertest viste filnavn, lokal `ikke gemt`-kvittering og samme SHA-256 på dublethold; `1440x900-fakturacenter-uploadfeedback.png` | Permanent modtagelse/pipeline og backendkvittering mangler; UI påstår ikke varig lagring |
| FC-07 | Layout | Kompakt top og tre selvscrollende, justerbare, huskede paneler; demospecifik tekst fjernes fra normal struktur. Den ruteisolerede CSS ramte tidligere ikke den indskudte zoom-wrapper, så arbejdsbordet voksede til ca. 2.086 px i stedet for at give panelerne en viewportshøjde. | Fakturacenter workspace/CSS og AppShell zoom-wrapper | implementeret | Ved 1440×900: workspace 1.172×642 px; paneler 280/423/450 px; scrollHeight/clientHeight 1874/440, 824/566 og 1106/566. Tastaturbredde 22→24 % bestod reload. | Forretningsdata er fortsat lokal prototype; panelpræferencens scope gennemgås igen i samlet regression |
| FC-08 | Opsætning | Mail og forbindelser flyttes ud af arbejdsnavigationen til fælles Opsætning uden at aktivere transport. | Nav, routes, opsætning | implementeret | Produktionsbuild indeholder lazy chunk; gammelt mail-link redirecter. Den lokale kontraktformular giver ikke i sig selv en serverrettighed. | Ekstern mail forbliver deaktiveret; serverstyret opsætning etableres under FC-03 |
| FL-01 | Overblik | KPI-kort og handlingsposter/Se alle åbner relevante filtre; optællinger og udsnit forklares. | `fleet-v2/src/components/Overview.jsx`, FleetV2App og UnitCatalog | implementeret lokalt | Komponenttest og faktisk browserroute/filter | Handlingslisten forklarer nu, at den viser 5 af det samlede antal. |
| FL-02 | Drift | De tidligere søjler genbrugte aktuelle optællinger med en kunstig variation og opfandt dermed fortid. Dag/uge/måned/kvartal/år aflæser nu daterede statusobservationer og ændrer både prøvetidspunkter og akser. | `fleet-v2/src/data/overviewWorkflow.js`, `unitSelectors.js`, `Overview.jsx` | implementeret lokalt | 5/5 beregningstests; fuld FLEET-suite 170/170; integreret browser ved 1920×1080 viste 7 dagsprøver for Uge og 3 månedsprøver for Kvartal | Produktionshistorik kræver en autoritativ serverkilde; demoen er eksplicit syntetisk registreret historik |
| FL-03 | Omkostning/nedetid | De tidligere grafer brugte hardkodede omkostninger og nedetidsprocenter. Månedsskiftet bruger nu registrerede faktiske omkostningsposter og daterede statusintervaller; manglende måneder er `Mangler data`, nul er nul, og samme måned sidste år vises kun med grundlag. | `fleet-v2/src/data/overviewWorkflow.js`, `unitSelectors.js`, `OverviewCharts.jsx` | implementeret lokalt | 5/5 beregningstests; browserens martsvalg viste DKK 79.803, manglende sidste-årsomkostning og 11,7 % registreret nedetid med sidste-årsdifference | Serverkilde og produktionsdatadækning mangler; ingen værdi opfindes ved manglende poster |
| FL-04 | Livekort | Kort-wheel og +/−, ingen dobbeltzoom, popup pr. enhed, cluster/samme position kan vælges, tydelig kilde/friskhed. | FLEET LiveMap/GeoMap | delvist implementeret | 9/9 LiveMap-tests; faktisk browser 15/9 på desktop og 390×844 viste marker-/klyngepopup og profilnavigation | Flydende popup er implementeret; valideret autoritativ OBD/GPS-kilde mangler fortsat, og ingen ekstern tjeneste er aktiveret. |
| FL-05 | Enhedsregister | Moderne FLEET-kartotek bliver primær skærm i Opsætning med autoritativ mapping og gamle dybe links. | Root-routes/nav, FLEET repository/adapters | implementeret lokalt | Route-, permission- og referenceprøver med PLANNING | Moderne kartotek åbner på `/opsaetning/enheder`; `/fleet-v2/enheder` bevares som kompatibelt dybt link. UNIT/WAREHOUSE-unit er fortsat et særskilt domæneobjekt. |
| FL-06 | Enhedsformular | Typefaner fjernes; typefilter bevares; indvendige mål, fire udstyrsvalg og energikilde med ukendt/ikke relevant. | UnitCatalog, UnitFormDialog, UnitProfile, unitSelectors | implementeret lokalt | 18/18 målrettede komponenttests og integreret browserverifikation | Trækkrog, hængertræk, kran og lift er separate værdier. Eksisterende ukendte drivmiddelværdier bevares ved redigering. |
| FL-07 | Indberetninger | Stabil trepanelstruktur, fuld bredde, justering/hukommelse/scroll og semantiske statustokens. | ReportTriage, ThreePanelWorkspace og CSS | implementeret lokalt på desktop; mobil regression består | Faktisk browsermåling, tastatur-resize/nulstil og ReportFlow | Bredder er rene bruger-/tenantafgrænsede visningsvalg, ikke forretningsdata. |
| FL-08 | Manuel sag | Læsbar dialog med enhed, beskrivelse, prioritet, validering, lukning og inputbevaring ved fejl. | ManualCaseDialog og CSS | implementeret lokalt | Integreret browsertest viste validering og oprettede en syntetisk højprioritetssag; `1440x900-manuel-sag-validering.png`; komponenttest bevarer input ved lagringsfejl | Lokal prototype, ikke serverlagring |
| FL-09 | Arbejdskø | Nye indberetninger åbner flytbar detaljedialog; under vurdering åbner genbrugt sagsmappe; mobil stabil. | WorkQueue, `DraggableDialog`, CaseFolder og CSS | implementeret lokalt | 1920×1080 drag flyttede dialogen 65×37 px og holdt X inden for workspace; fuld sagsmappe genbruges. 390×844 og 360×800 har fuldskærmsdialog uden dokumentoverflow. | Autorisation følger eksisterende lokale repository/route; serverpersistens mangler |
| FL-10 | Sagsmappe | Godkendt samlet design uden fanebjælke, kompakt enhedsrække, foldesektioner og tilstands-/permissionstyret næste handling. | CaseFolder, CaseActionPanel og CSS | implementeret lokalt | Ingen tabs; kompakt enhedsrække; `Problem og næste handling`; foldbare indberetning, medier, enhedsdata, økonomi og historik; sticky højre infokolonne. Browserbevis ved 1920, 1440/125 %, 390 og 360. | Autoritative statusser og fakturaafklaring er bevaret; data er lokal prototype |
| FL-11 | Kompakt kø | Permanent Flyt sag fjernes; statusændring bevares i sagsmappe/diskret menu; kolonner ruller. | WorkQueue og CSS | implementeret lokalt | Kolonne-/statusregression | Tabelvisning og sagsmappe bevarer lovlige statushandlinger; workflowstadier er uændrede |
| FL-12 | Leverandører | FLEET v2 brugte sit lokale `relations.workshops` som en parallel leverandørstamme. Eksterne værksteder læses nu fra fælles `leverandoerer`; interne ressourcer og historiske referencer bevares uden at kopiere fælles stamdata til IndexedDB. Autoriseret oprettelse går til samme register med værksted forvalgt og sikker retur til den bevarede sagskladde. | `FleetV2Module`, `supplierWorkshopAdapter`, `supplierReturn`, `WorkshopAssignment`, fælles leverandører | implementeret og verificeret | 7/7 adapter-/returtests; fuld FLEET-suite 179/179; integreret browser ved 1919×1080 CSS-pixel/100 % arbejdsområdezoom | Ekstern portal får ingen intern adgang. Produktlagring er fortsat det eksisterende tenantafgrænsede leverandørregister; mailafsendelse er ikke aktiveret. |
| FL-13 | Service | Dateret seneste service/måler, kalender/km/timer, varsler, faste hændelser og forklarlig næste grænse. | Service domain/UI og `fleet-service-client.js` | delvist implementeret | Servicevisningen læser nu serverkrav og fælles enheder; serveren bevarer formularfelterne og vælger den først nåede kalendergrænse. FLEET 192/192 og 13/13 fokuserede klient-/motortests | Planlægning og historisk gennemførsel fra den integrerede UI afventer serveradapter; tallet `500` er målerinterval i den viste enheds km eller driftstimer |
| FL-14 | Serviceautomatik | Én indberetning pr. krav/cyklus, idempotens/samtidighed, manglende grundlag, gennemførsel og ændring/deaktivering. | `functions/fleet-service-automation.js`, callables/scheduler, Rules og integreret serviceklient | delvist implementeret | Integreret UI bruger servernoder/callables uden lokal fallback og starter ikke browsertimeren; fuld gate 4.613/4.613 består | UI-rute til serveroprettet indberetning/sag samt kontrolleret håndtering af åbne forekomster ved kravændring/deaktivering mangler |
| FL-15 | Kategorier | Indberetninger brugte fri tekst, mens økonomi brugte en separat hardkodet liste. Der er nu én tenantafgrænset kategori-stamdata med opret/redigér/sortér/deaktivér, anvendelsesmapping og historiske snapshots. | `src/moduler/opsaetning/FleetKategorier.jsx`, `fleetCategories`, `categoryAdapter`, Reports/Økonomi, Rules | delvist implementeret | 5/5 kategoridomænetests; fuld FLEET-suite 184/184; fuld Rules-/platformsgate 4.599/4.599; browser desktop/mobil og begge forbrugere | Kategoristamdata lagres serverstyret. Selve indberetningerne og økonomiposterne er fortsat lokal FLEET-prototype og skal flyttes til den autoritative servergrænse, før kravet lukkes samlet. |
| FL-16 | OBD-statistik | Kun registrerede og understøttede målinger vises/filtreres/eksporteres; kilde/periode/enhed mærkes; manglende forbindelse er tydelig. | `fleet-v2/src/data/fleetStatistics.js`, `FleetStatistics.jsx`, route/nav og CSS | delvist implementeret lokalt | 4/4 statistikdomænetests; fuld FLEET-suite 191/191; lint/build. Integreret browserbevis afventer autentificeret emulator, som ved kontrol svarede `Der er ikke forbindelse til login-tjenesten`. | Der findes kun daterede km-observationer samt position/hastighed i prototypen. Ingen valideret OBD-kilde er tilsluttet, og UI'et opfinder derfor ikke øvrige målinger. |
| FL-17 | Økonomi | Per enhed/samlet, periode/kategori, faste/enkeltstående poster, kr./km, historik og sporbarhed uden dobbeltoptælling. | `fleet-v2/src/data/economyWorkflow.js`, `FleetEconomy.jsx` og CSS | delvist implementeret lokalt | 8/8 økonomidomænetests; fuld FLEET-suite 191/191; lint/build | Manuelle, kontrollerede, bogførte, foreløbige, estimerede og kontraktlige beløb er særskilt. Månedlige kontrakter materialiseres inden for start/slut, samme økonomiske hændelse deduplikeres, og kreditnotaens negative fortegn bevares. Autoritativ Fakturacenter-/bogføringsadapter mangler. |
| FL-18 | Eksport | Dansk CSV/Excel-visning uden mojibake og med entydige beløbs-/momskolonner. | FLEET statistik-/økonomieksport | delvist implementeret lokalt | Domænetest af danske tegn, decimaler, UTF-8 BOM og kendt/ukendt moms; 15/9 importeret og visuelt kontrolleret som Excel-kompatibel projektmappe | Økonomieksporten har særskilt beløbsgrundlag, netto, moms og brutto uden antaget sats. Manuel åbning i Microsoft Excel udestår. Produktionskilden skal levere eksplicit momsbeløb for fuld udfyldning. |
| REG-01 | Sikkerhed | Tilladt/afvist rolle, tenant, revision, samtidighed, idempotens og ingen demo-fallback. | Rules, Functions og modultests | i gang | Fuld lokal Rules-/platformsgate 4.605/4.605 grøn i isoleret emulator. Service: 16/16 integrationassertions, samtidighed, gentagelse, fremmed tenant og afvist læser; direkte skrivning til seks servernoder afvist. Fakturacenter, UNIT/WAREHOUSE, tenant og kategorier er fortsat grønne. | Kommende økonomi-/statistikserverfunktioner kræver egne emulatorbeviser før den samlede sikkerhedsgate kan lukkes. |
| REG-02 | Samlet regression | WORKFORCE–PLANNING, UNIT–WAREHOUSE og Support–Ejerforbindelser bevares. | Hele integrationen | i gang | Root lint, design 11/11, produktionsbuild og fuld Rules-/platformsgate 4.605/4.605 grøn efter Etape 14 | Endelig tværmodul- og browserregression gentages efter de resterende backend-etaper. |
| REG-03 | Visuel gate | 1440×900, 1920×1080, 390×844, 360×800; normal/kompakt menu og flere arbejdszoomniveauer. | Berørte brugerflader | i gang | Ny Etape-7-pakke dækker sagsmappe/dialog ved alle fire viewports, normal/kompakt menu, 100/125 % og Nulstil; Fakturacenter/menu/manuel sag ved 1440×900 | Samme matrix skal fortsat køres på resterende FLEET-, service-, kategori- og økonomiskærme |

## Baseline

- Root `npm run lint`: bestået på start-HEAD.
- Root build og direkte Node-testkørsel blev ved første forsøg blokeret af
  køremiljøets `spawn EPERM`; genprøve i den godkendte proceskontekst bestod.
- Word-dokumentets 22 billeder er visuelt gennemgået. De viser blandt andet
  flyout-overlap, menutekst der skifter linje, Fakturacenterets lange demo-top,
  FLEETs indsnævrede triage, den ulæselige manuelle sag, den godkendte
  sagsmappereference, serviceformularens uklare `500`-felt og CSV-mojibake.

## Afleveringslog

### Etape 1 — fælles menu, zoom og grundlayout

- Root `npm run lint`: bestået.
- `npm run build`: bestået; eksisterende chunk-størrelsesadvarsel består.
- `node --test test/design-tokens.test.mjs test/skive1-navigation.test.mjs
  test/skive2a-navigation.test.mjs test/skive2b-navvisning.test.mjs`: 33/33
  bestået.
- Browser: moduloverskrift foldede uden URL-skift; kompakt FLEET-menu viste
  alle tilladte underpunkter og blev lukket med ESC med fokusretur.
- Beregnede desktopmål: kompakt sidebar 71,99 px, foldeknappens klikmål
  43,98×43,98 px og workspacezoom `1` ved 100 %.
- Mobil: underpunkterne kan åbnes med klik og ligger i en scrollbar, uden at
  ændre browserens zoom. Den visuelle slutmatrix køres igen efter de øvrige
  etaper, hvor navigationsteksterne er endelige.

### Etape 2 — Fakturacenter

- Synlig navigation er Indbakke, betinget Ekstra kontrol og Arkiv. Gamle
  sektionlinks mappes; mailopsætning er flyttet til
  `/opsaetning/fakturacenter`.
- Indbakken er fast sorteret nyeste først og kan filtreres på match og modul.
  Massevalg angiver det præcise synlige omfang og kræver en samlet
  bekræftelse; den eksisterende domænefunktion kontrollerer hver faktura og
  returnerer delsvar.
- Ekstra-kontrolkontrakten bruger nettobeløb ekskl. moms og afviser første
  kontrollant. Aktivering er bevidst blokeret, indtil autoritativ serverlagring,
  audit, brugerallowlist og Rules/Functions findes; en lokal formular må ikke
  give rettigheder.
- `npm run lint`: bestået. `node --test
  test/fakturacenter-intake-v1.test.mjs`: 100/100 bestået. `npm run build`:
  bestået med den kendte chunk-størrelsesadvarsel.
- Browser: 19 syntetiske fakturaer i Indbakke, én i Arkiv, modulfilter og
  bekræftelsesdialog for alle 19 synlige poster blev kontrolleret. Dialogen
  blev annulleret, så browserens prototypetilstand ikke blev ændret.

### Etape 3 — fælles FLEET-enhedsregister

- Det moderne FLEET v2-kartotek er monteret som den primære
  enhedsregistrering under Opsætning på `/opsaetning/enheder`. Det bruger
  fortsat FLEETs tenantafgrænsede repository; flytningen opretter ikke en
  parallel datakopi.
- Det tidligere dybe link `/fleet-v2/enheder` og profilerne under begge
  routefamilier virker fortsat. Det ældre kartotek er fjernet fra
  navigationen, men ingen lokale data er slettet eller migreret.
- Typefanerne over kartoteket er fjernet. Det eksisterende typefilter er
  bevaret.
- Formularen understøtter indvendig længde, bredde og højde i cm,
  energikilde/drivmiddel samt særskilte valg for trækkrog, hængertræk, kran
  og lift. Værdierne vises på enhedsprofilen.
- Nye indvendige mål valideres med samme positive danske talregel som
  udvendige mål. Eksisterende ikke-standardiserede drivmiddelværdier bevares
  som en synlig eksisterende værdi ved redigering.
- `npm run lint` bestod. `UnitEnhancements.test.jsx` og
  `UnitCatalogProfile.test.jsx` bestod samlet 18/18 med syntetisk
  memory-repository.
- Den faktiske integrerede app blev kontrolleret på `/opsaetning/enheder`:
  alle nye felter var synlige, og dialogen blev annulleret uden lagring.
  `/fleet-v2/enheder` blev derefter åbnet direkte og viste samme moderne
  kartotek.
- PLANNINGs læseadapter til de fælles FLEET-enhedsreferencer ændres ikke i
  denne etape. En fuld serverautoritativ fælles stamdatakilde er fortsat
  senere Milepæl B-arbejde.

### Etape 4 — FLEET-overblik og Livekort

- Alle fire nøgletalskort er nu semantiske knapper. Enheder åbner
  enhedsregisteret, I drift åbner registeret med `status=operation`, På
  værksted åbner værkstedsforløbene, og Kræver handling åbner arbejdskøen.
- Handlingslistens rækker åbner indberetningen eller arbejdskøen. `Se alle`
  viser det samlede antal, mens hjælpeteksten forklarer det viste udsnit og
  de to medtagne sagsstatusser.
- Livekortets egne plus/minus-knapper virker gennem den integrerede app.
  Almindeligt musehjul ændrer kortzoom; Shift-hjul overlades til den fælles
  arbejdsområdezoom, og Ctrl/Cmd overtages ikke.
- En markørklynge åbner en tastaturbetjent liste over de enkelte enheder og
  en særskilt mulighed for at zoome ind. Kortets drag-funktion ignorerer
  knapper og links, så kontrollerne ikke længere opsluges af pointer capture.
- Den eksisterende højre detaljeside viser valgt enheds registrering,
  positionstid, kontakt, datakilde, friskhed og profillink. Der er ikke
  tilføjet en konkurrerende flydende popup.
- `LiveMapFlow.test.jsx` og `FleetV2App.test.jsx` bestod 14/14 før den ekstra
  KPI-filterprøve blev tilføjet; hele målgruppen genkøres ved commit-gaten.
- Browsermåling i den aktuelle lokale IndexedDB viste 20 enheder, 13 i
  drift, 3 på værksted og 6 kræver handling; listen viste 5 af 6. Klik på I
  drift åbnede `/fleet-v2/enheder?status=operation` med 13 af 20 synlige.
  Kortets zoomknap ændrede tile-zoom, og en klynge åbnede en liste med de
  individuelle enheder.
- Periodehistorik, sidste-år-sammenligning og beregnet historisk nedetid er
  ikke afsluttet. Den nuværende prototypehistorik må derfor ikke bruges som
  produktionsbevis for FL-02/FL-03.

### Etape 5 — FLEET-indberetninger og manuel sag

- Indberetningernes liste, dokumentation og vurdering bruger nu et faktisk
  trepanelslayout med to synlige håndtag. Håndtagene understøtter træk,
  venstre/højre piletast, Home og dobbeltklik til standard.
- Bredder gemmes via platformens fælles visningsnøgle med miljø, autentificeret
  bruger, tenant og skærm. `Nulstil visning` nulstiller dem på både liste- og
  detalje-URL'er.
- Hvert panel har uafhængig lodret scrolling og stabile minimumsbredder. Ved
  smalle desktop/tabletbredder flyttes vurderingspanelet ned; på mobil bruges
  det eksisterende liste/detalje-forløb, og trækhåndtag skjules.
- Faktisk browsermåling ved den aktuelle brede viewport viste standardbredder
  436/748/470 px. En tastaturjustering ændrede dem til 403/781/470 px, og
  `Nulstil visning` gendannede 436/748/470 px.
- Dialogen Ny manuel sag har nu en dækkende hvid overflade, tydelig header,
  kontrast, lagorden, navngivet X, Annuller og ESC. Ugemte ændringer advares
  før lukning, og en lagringsfejl lader dialog og input stå.
- Tom sagstitel giver en synlig valideringsfejl før repository-kald. Browseren
  viste `Angiv en sagstitel.`, hvorefter dialogen blev annulleret uden at
  oprette data.
- `ReportFlow.test.jsx`, `CaseFolderFlow.test.jsx` og
  `CaseFolderWorkflow.test.js` bestod 15/15. Root lint bestod.

### Etape 6 — kompakt arbejdskø, eksport og serviceinventar

- Kanbankortenes permanente `Flyt sag`-felt er fjernet. Kortet åbner fortsat
  sagen, mens tabelvisningen og sagsmappens kontroller bevarer de eksisterende
  lovlige statusændringer og bekræftelsen ved tilbageførsel til Ny.
- Browserens faktiske kanban viste otte kompakte sagskort uden hurtigvælger.
  De ni autoritative workflowkolonner og deres optællinger er uændrede.
- Økonomi-CSV starter nu med de faktiske UTF-8 BOM-bytes
  `EF BB BF`; danske overskrifter og decimal-komma kontrolleres i domænetesten.
  Manuel åbning i dansk Excel og mere detaljerede moms-/kildesøjler udestår.
- Serviceformularens tidligere uklare `500`-værdi er
  `Serviceinterval måler`; label og hjælpetekst skifter konkret mellem km og
  driftstimer efter den valgte enhed. Grunddato/-måler, kalenderinterval,
  årlig dato og varslingsgrænser findes allerede.
- Serviceberegningen bruger den først nåede registrerede dato- eller
  målergrænse. Manglende grundlag vises som manglende og bliver ikke nul eller
  en opfundet frist. Gennemført værkstedsservice flytter grundlaget; booking
  eller sagslukning gør ikke.
- Den lokale automatik reserverer én stabil forekomst og opretter højst én
  indberetning/sag pr. cyklus, også ved samtidige repositorykald. Den er
  eksplicit en browserprototype: uden en serverstyret scheduler sker der intet,
  når appen er lukket.
- `EconomyWorkflow.test.js`, `ReportFlow.test.jsx`,
  `CaseFolderFlow.test.jsx` og `StageCompletionFlow.test.jsx`: 17/17 bestået.
  `ServiceWorkflow.test.js`, `ServiceAutomation.test.js` og
  `ServiceFlow.test.jsx`: 24/24 bestået. Root lint, designkontrol og
  produktionsbuild bestod; buildens kendte store-chunk-advarsel består.

### Etape 7 — færdig synlig sagsmappe, dialoger og Fakturacenter-layout

- Auditgrundlag før ændringer: branch `codex/veyro-integration-v1`, HEAD
  `ae9a2a6a844fd222a69d8cd3470fde37c459a256`. Den eksisterende utracked
  `functions/.env.demo-veyro-warehouse-integration-test` er fortsat urørt.
- Sagsmappens syv faner er fjernet. Den samme `CaseFolder` bruges nu i den
  direkte route og i Arbejdskøens dialog. Enheden vises i en kompakt række;
  problem, vurdering, leverandør/bestilling og næste handling står samlet;
  indberetning, medier, enhedsdata, økonomi og historik er foldbare sektioner;
  ansvarlig, prioritet, frist, aktivitet og afslutningsgate står i højre kolonne.
- En ny portalbaseret rutedialog ligger over zoom-wrapperen uden at blive
  klippet. Nye indberetninger kan flyttes fra overskriften på desktop og
  begrænses til det reelle arbejdsområde; mobil bruger en stabil fuldskærmsdialog.
  Interaktive felter starter ikke drag. ESC, X og baggrundslukning deler samme
  dirty-beskyttelse, fokus holdes i dialogen og returneres til udgangspunktet.
- AppShells kompakte menu havde en konkret ESC-fejl: fokusretur udløste samme
  containers `onFocus` og genåbnede flyoutet. En fokussuppression for netop
  returhændelsen lukker nu menuen, mens næste Enter åbner den normalt.
- Fakturacenterets tre paneler havde korrekte overflow-regler, men de blev ikke
  aktive: route-CSS'en forventede `.fic-shell` som direkte barn af `.fc-slot`,
  mens den fælles zoom-wrapper nu ligger imellem. Selektoren og flex-højdekæden
  omfatter nu wrapperen. Ved 1440×900 er arbejdsbordet 1.172×642 px; panelerne
  er ca. 280/423/450 px og har henholdsvis `1874/440`, `824/566` og `1106/566`
  i scrollHeight/clientHeight. Alle tre kunne scrolles uafhængigt.
- Panelbredden blev ændret med tastatur fra 22 til 24 procent og genfundet efter
  reload. Lokal filkontrol viste både filnavn/`ikke gemt` og samme SHA-256 som
  mulig dublet. En blandet massekontrol gav 1 kontrolleret og 1 afvist med
  resultat pr. faktura.
- Før-reference: auditbilledet
  `artifacts/veyro-rettelsesrunde-audit-2026-09-14/browser/09-case-folder-current.png`
  på audit-HEAD viser fanebjælken. Nye efterbeviser ligger i
  `docs/screenshots/veyro-rettelsesrunde-2026-09-14/etape-1/`:
  `1920x1080-arbejdsko-aaben-sagsmappe.png`,
  `1920x1080-arbejdsko-ny-indberetning-dialog.png`,
  `1440x900-kompakt-menu-zoom-125-sagsmappe.png`,
  `390x844-arbejdsko-aaben-sagsmappe.png` og
  `360x800-arbejdsko-aaben-sagsmappe.png`.
- Supplerende beviser: `1440x900-kompakt-hovermenu-fleet.png`,
  `1440x900-manuel-sag-validering.png`,
  `1440x900-fakturacenter-uploadfeedback.png` og
  `1440x900-fakturacenter-massekontrol.png`. JSON-målinger ligger ved siden af.
- Test på etapens slutindhold før commit: FLEET lint bestået; fuld FLEET
  unit-/komponentsuite 165/165; browserregression for sagsmappe og service
  6/6; integreret Playwright-gate 7/7 ved 1920×1080, 1440×900, 390×844 og
  360×800. Root lint og produktionsbuild bestod. Builden har fortsat den
  kendte advarsel om en stor chunk.
- Værkstedsregressionens tidligere test forventede den fjernede permanente
  arbejdskøknap `Opret værkstedsopgave`. Den eksplicitte oprettelse er fortsat
  tilgængelig fra Værksted, mens sagsmappen som bestilt bruger tildeling og
  bestilling under `Problem og næste handling`. Testen følger nu dette reelle
  forløb og bekræfter fortsat, at samme sag ikke får en dubletopgave.

#### Delstatus efter Etape 7

Statusserne nedenfor skelner mellem synlig UI, logik, lagring, adgang og bevis.
Et samlet krav markeres ikke færdigt, hvis en relevant serverdel mangler.

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| UX-04 | Implementeret og verificeret | Ikke relevant | Ikke relevant | Implementeret og verificeret via eksisterende navfiltrering | Implementeret og verificeret | Implementeret og verificeret |
| UX-07 | Delvist implementeret | Delvist implementeret | Delvist implementeret | Delvist implementeret | Implementeret og verificeret for de nye FLEET-dialoger | Delvist implementeret |
| FC-04 | Implementeret og verificeret | Implementeret og verificeret lokalt | Ikke implementeret servermæssigt | Delvist implementeret lokalt | Implementeret og verificeret med blandet resultat | Delvist implementeret |
| FC-06 | Implementeret og verificeret for lokal filkontrol | Implementeret og verificeret for lokal SHA-256/dubletkontrol | Ikke implementeret servermæssigt | Ikke implementeret servermæssigt | Implementeret og verificeret lokalt | Delvist implementeret |
| FC-07 | Implementeret og verificeret | Ikke relevant | Implementeret og verificeret som browserpræference | Ikke relevant | Implementeret og verificeret | Implementeret og verificeret |
| FL-08 | Implementeret og verificeret | Implementeret og verificeret lokalt | Ikke implementeret servermæssigt | Delvist implementeret via eksisterende route/repository | Implementeret og verificeret | Delvist implementeret |
| FL-09 | Implementeret og verificeret | Implementeret og verificeret lokalt | Ikke implementeret servermæssigt | Delvist implementeret via eksisterende route/repository | Implementeret og verificeret | Delvist implementeret |
| FL-10 | Implementeret og verificeret | Implementeret og verificeret lokalt | Ikke implementeret servermæssigt | Delvist implementeret via eksisterende handlinger | Implementeret og verificeret | Delvist implementeret |
| REG-03 | Delvist implementeret | Ikke relevant | Ikke relevant | Ikke relevant | Delvist implementeret | Delvist implementeret |

## Kontrolhistorik

### FLEET-regression

- Første fulde FLEET-kørsel gav 147/148. Den eneste fejl var
  `WorkshopFlow.test.jsx`: den syntetiske booking var fastlåst til
  8. september 2026 og lå derfor ikke længere i den aktuelle kalenderuge.
- Den berørte test fejlede også isoleret. Fejlen var dermed ikke en af de
  kendte belastningsafhængige timeouts.
- Test-fixturen placerer nu den samme syntetiske booking i morgen, mens
  produktkode og assertion er uændret. Isoleret genkørsel bestod 4/4, og den
  efterfølgende fulde FLEET-suite bestod 148/148.
- Root lint, designtokenkontrol 11/11 og produktionsbuild bestod på det
  aktuelle produktgrundlag. Builden har fortsat den kendte advarsel om en stor
  chunk.

### Rules- og sikkerhedsgate — første auditkørsel

- Emulatorerne blev startet mod det syntetiske projekt
  `demo-fleetcontrol-rules-test`. Der var ingen produktionsfallback.
- Den allerede installerede, portable Temurin JDK blev anvendt proceslokalt:
  `C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.12.1+1\jdk-21.0.12.1+1`
  (`21.0.12.1+1`). Maskinens globale `JAVA_HOME` og `PATH` blev ikke ændret.
- Første emulatorstart ramte den kendte Windows/Netty-fejl
  `WEPollSelectorImpl` / `Unable to establish loopback connection`. Den
  dokumenterede proceslokale løsning blev brugt: arvede `TEMP` og `TMP` blev
  fjernet alene for emulatorprocessen. Firebase CLI 15.29.0 startede derefter
  Database- og Storage-emulatorerne og kørte den fulde Rules-suite.
- Sikkerhedsgaten **bestod ikke**. Den første audittekst placerede fejlen på
  den første assertion i testen
  “åbner ikke direkte WAREHOUSE-skrivning til den kanoniske unit”. En målrettet
  genkørsel viste, at dette var upræcist: den direkte opdatering af
  `kasser/UNIT-101.pladsId` blev allerede afvist. Fejlen lå på den efterfølgende
  assertion: WAREHOUSE kunne oprette `kassetyper/ny` direkte.
- Følgende øvrige fejl blev også registreret i den fulde kørsel:
  - Fakturacenterets statiske kontrakttest mangler den tidligere synlige tekst
    om, at kontrol ikke er betalingsgodkendelse eller bogføring.
  - Navigationsparitet mangler for det nye enhedslink, og Fakturacenterets
    opsætningslink er menu-gatet med en permission, som Rules-inventaret ikke
    genfinder som serverhåndhævet.
  - Modulreglen fejler for mindst ét legacy-tenant-scenarie uden `moduler`-node.
  - `unitbookingImportHashes` mangler eksplicit klassifikation i Rules-testens
    inventar, selv om reglen selv er lukket med `.read: false` og `.write: false`.
  - Navigationens dokumenterede statustal er nu én for lavt efter det nye
    enhedslink under Opsætning.
- Ingen test eller negativ adgangskontrol blev slået fra. Denne blok beskriver
  alene den historiske første auditkørsel; løsningen og den grønne genkørsel
  står i Etape 8 nedenfor.

### Resterende arbejde efter auditten

Følgende krav er fortsat åbne eller kun delvist gennemført: UX-06/UX-07,
FC-03/FC-04/FC-06/FC-07, serverdelen af FL-02/FL-03, FL-04's flydende popup, FL-08's fælles
gem-bekræftelse, FL-09/FL-10/FL-12, serverdelen af FL-14,
FL-15/FL-16/FL-17, manuel dansk Excel-kontrol under FL-18 samt hele den
nummererede visuelle viewportmatrix i REG-03. Etape 7 indeholder dog nye
før/efter-beviser for de prioriterede synlige fejl.

### Etape 8 — emulatorgrundlag og WAREHOUSE-regler

- Den aktuelle Java-loopback/WEPoll-fejl blev reproduceret med Database- og
  Storage-emulatorerne. Den dokumenterede proceslokale løsning virker fortsat:
  portable JDK 21 vælges kun i processen, og arvede `TEMP`/`TMP` fjernes kun
  for emulatorprocessen. Ingen global miljøvariabel eller installation blev
  ændret.
- Den præcise WAREHOUSE-fejl lå ikke i den første `pladsId`-assertion. Denne
  fysiske ændring blev allerede afvist. Den næste assertion viste, at en
  WAREHOUSE-klient kunne oprette en fælles kassetype direkte. Samme brede
  skrivegren tillod også direkte unitoprettelse.
- Kontrakten i `src/fleet/moduler.js`, klientforløbet og
  `unitlageropret`-callablen viser den autoritative grænse: UNIT Booking ejer
  type-/unitstamdata, mens WAREHOUSE opretter atomisk gennem servercallablen og
  får bevægelseshistorikken med. Rules tillader derfor fortsat læsning og
  ikke-fysiske rettelser for WAREHOUSE, men ikke direkte type-/unitoprettelse
  eller fysisk placering/status.
- Negative tests dækker nu særskilt direkte `pladsId`, ny unit, ny type og
  append-only bevægelse. En positiv test bevarer WAREHOUSEs lovlige
  ikke-fysiske noterettelse, så løsningen ikke gør registeret unødigt
  skrivebeskyttet.
- Legacy-modulfejlen var et for bredt testgrundlag. Originale importmails og
  bilag kræver fortsat et eksplicit UNIT-modul, og de to idempotensindekser er
  altid serverinterne. Testen kræver nu fail-closed for disse tre noder i
  stedet for at åbne dem for tenants uden `moduler`-node.
- Fakturacenterets forklaring siger igen præcist, at Arkiv er afsluttet
  Veyro-kontrol og ikke betalingsgodkendelse eller bogføring. Det nye
  enhedslink er koblet til den eksisterende FLEET-routegate. Den lokale,
  ikke-lagrende Fakturacenter-opsætning bærer ikke længere en misvisende
  menugate, som Rules ikke kunne håndhæve; controls er fortsat deaktiverede
  uden den eksisterende godkendelsespermission.
- Målrettede resultater: tenant-inventar 21/21; UNIT Booking, WAREHOUSE og
  modulgrænser 48/48. Den fulde isolerede Rules-/platformsgate bestod
  4.586/4.586. Root lint og produktionsbuild bestod; kun den kendte
  chunk-størrelsesadvarsel består.

#### Delstatus efter Etape 8

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FC-08 | Implementeret og verificeret | Implementeret og verificeret for den lokale kontrakt | Ikke implementeret for ekstra-kontrolopsætning | Ingen falsk menugate; serverpermission etableres med FC-03 | Implementeret og verificeret | Delvist implementeret |
| FL-05 | Implementeret og verificeret | Implementeret og verificeret for fælles FLEET-reference og særskilt UNIT-identitet | Delvist implementeret; WAREHOUSE-oprettelse går gennem eksisterende callable | Implementeret og verificeret for direkte Rules-grænse | 48/48 målrettede emulatorprøver | Delvist implementeret |
| REG-01 | Ikke relevant | Implementeret og verificeret for eksisterende sikkerhedskontrakter | Implementeret og verificeret for eksisterende Rules/callables | Implementeret og verificeret for eksisterende Rules-grænser | 4.586/4.586 | Delvist implementeret, fordi kommende serverfunktioner kræver nye beviser |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | Root lint/build og fuld platformsgate grøn | Delvist implementeret |

### Etape 9 — serverstyret ekstra fakturakontrol og massehandling

- Den autoritative kontroltilstand er adskilt fra betaling og bogføring:
  `indbakke`, `ekstra-kontrol` og `arkiveret` beskriver alene Veyros
  kontrolforløb. Arkiv fremstilles fortsat ikke som betalt eller bogført.
- Kundens opsætning lagres nu tenantafgrænset gennem Functions og kan være
  ingen ekstra kontrol, alle fakturaer eller fakturaer over en beløbsgrænse.
  Grænsen beregnes af fakturaens beløb ekskl. moms. De udpegede kontrollanter
  skal findes i kunden, må ikke være blokerede og skal via deres effektive
  rolle have `fakturaer.godkend`, før opsætningen kan aktiveres.
- Første kontrol, ekstra godkendelse og tilbagesendelse kører gennem samme
  delte domænemaskine. Serveren afviser egen ekstra godkendelse, kræver en
  udpeget anden person og kræver begrundelse ved tilbagesendelse.
- Enkelt- og massekald kontrollerer tenant, modul, permission, forventet
  revision og det aktuelle fakturagrundlag. Operationer er idempotente pr.
  bruger og tenant; masseforløbet returnerer et selvstændigt resultat for hver
  faktura, så en blokeret post ikke skjuler de øvrige resultater.
- Klienter kan hverken læse eller skrive opsætnings- og operationsledgeren
  direkte. Rules validerer samtidig, at ledgerens faktura-id findes i samme
  tenant. Ingen negativ test eller permission er fjernet eller svækket.
- Testbevis på dette kodegrundlag: delte domænetests og Functions-kopiparitet
  37/37; isoleret callable-integration 21 assertions; målrettet Rules- og
  tenantinventar 24/24; fuld lokal Rules-/platformsgate 4.597/4.597. Rules-filen
  er 469.907 normaliserede UTF-8-byte og ligger under den målte grænse.
- Restarbejde: `/oekonomi/fakturacenter` viser stadig den eksplicit mærkede,
  lokale syntetiske prototype. Dens checkbox-, kontrol- og uploadhandlinger er
  ikke skjult serverlagring. Arbejdsfladen skal kobles til de nye callables og
  autoritative fakturaposter, før FC-03 og FC-04 kan markeres samlet færdige.

#### Delstatus efter Etape 9

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FC-03 | Implementeret og verificeret for opsætningsskærmen; arbejdslistekobling mangler | Implementeret og verificeret | Implementeret og verificeret | Implementeret og verificeret | 37/37 domæne/kopiparitet, 21 callable-assertions og fuld gate 4.597/4.597 | Delvist implementeret |
| FC-04 | Implementeret og verificeret i den lokale prototype; serveradapteren er endnu ikke koblet til knappen | Implementeret og verificeret | Implementeret og verificeret | Implementeret og verificeret | 21 callable-assertions med blandede resultater, revision og genafspilning | Delvist implementeret |
| REG-01 | Ikke relevant | Implementeret og verificeret for Fakturacenter-kontrollen | Implementeret og verificeret for Fakturacenter-kontrollen | Implementeret og verificeret for Fakturacenter-kontrollen | Fuld gate 4.597/4.597 | Delvist implementeret, fordi de resterende serveretaper endnu ikke er afsluttet |

### Etape 10 — FLEET-perioder, månedsskift og sandfærdigt datagrundlag

- Den faktiske årsag til FL-02 var, at overblikket beregnede historiske søjler
  ved at genbruge dagens statusoptælling med en indeksbaseret variation. Det
  lignede historik, men var ikke registreret historik. `overviewWorkflow.js`
  vælger nu daterede observationer pr. time, dag, uge eller måned og markerer
  manglende observationer som ukendte i stedet for at udfylde dem.
- Den faktiske årsag til FL-03 var to hardkodede omkostningsbeløb og en fast
  liste af nedetidsprocenter. Omkostninger summeres nu alene fra registrerede
  poster med faktisk DKK-beløb. Nedetid afledes af daterede statusintervaller;
  samtidig status for én enhed tælles ikke flere gange. Måneder uden poster er
  `Mangler data`, mens en registreret sum på 0 fortsat er nul.
- Demo-fixturen har en særskilt, dateret og eksplicit syntetisk
  `unitStatusHistory`. Datasetversion 15 migrerer relationen ind uden at
  overskrive brugerens eksisterende enheder, sager eller økonomiposter.
- Browserbevis i den aktuelle integrerede devserver på port 5297, der serverer
  integrationsworktreeets `src/main.jsx`, blev udført ved 1920×1080 og 100 %
  arbejdsområdezoom. Uge viste 6.–12. marts som syv dagsmålinger. Skift til
  Kvartal viste januar, februar og marts som tre andre datapunkter; datadækning
  og syntetisk kilde var synlige. Marts viste DKK 79.803, manglende
  sidste-årsomkostning og 11,7 % nedetid med +6,4 procentpoint mod samme måned
  året før.
- Teknisk gate: root lint bestod; root produktionsbuild bestod med den kendte
  chunk-størrelsesadvarsel; hele FLEET unit-/komponentsuiten bestod 170/170 i
  27 filer. Den første sandboxkørsel af Vitest/build ramte `spawn EPERM`;
  samme kommandoer bestod i den godkendte proceskontekst uden kodeændring.

#### Delstatus efter Etape 10

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FL-02 | Implementeret og verificeret | Implementeret og verificeret mod registrerede observationer | Delvist implementeret; lokal IndexedDB-fixture, ingen produktionshistorik | Ikke relevant for den lokale read-model; serverkilden mangler | 5/5 målrettede, 170/170 FLEET og browser ved 1920×1080 | Delvist implementeret |
| FL-03 | Implementeret og verificeret | Implementeret og verificeret for faktiske poster, manglende data og statusintervaller | Delvist implementeret; lokal repository, ingen produktionskilde | Ikke relevant for den lokale read-model; serverkilden mangler | 5/5 målrettede, 170/170 FLEET og browser ved 1920×1080 | Delvist implementeret |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | Root lint/build, FLEET 170/170 og seneste fulde Rules-gate 4.597/4.597 | Delvist implementeret |

### Etape 11 — fælles leverandørkilde i FLEET

- Den faktiske årsag til parallelle værkstedsdata var, at FLEET v2 alene
  indlæste `relations.workshops` fra sit tenantafgrænsede IndexedDB-datasæt.
  Det fælles, Rules-beskyttede `leverandoerer`-register blev allerede brugt af
  de ældre FLEET-skærme, men var ikke ført ind over v2-grænsen.
- `FleetV2Module` læser nu `leverandoerer` gennem den eksisterende
  tenantsti og kræver `leverandoerer.laes`. Kun poster med kategorien
  `vaerksted` bliver eksterne værksteder. Navn, kontaktmail og telefon kommer
  fra samme autoritative objekt som Administration/Procure bruger.
- Interne værksteder og deres ressourcer forbliver interne FLEET-objekter.
  De er ikke leverandørkopier. Deaktiverede fælles leverandører bevares i
  historiske valg, men kan ikke vælges til en ny opgave.
- Fælles leverandører tilføjes alene som en runtime-relation. Alle lokale
  mutationer validerer mod runtime-listen, men repositorylaget sætter den
  oprindelige lokale værkstedsliste tilbage før IndexedDB-skrivning. Dermed
  opstår der ikke en ny redigerbar leverandørkopi i FLEET.
- Historiske lokale eksterne værksteds-ID'er bevares kun, når en sag,
  værkstedsopgave, booking eller et servicekrav fortsat refererer til dem. De
  mærkes som historiske og kan ikke vælges til nyt arbejde.
- Den eksterne leverandørportal er ikke ændret og får ingen intern
  tenantpermission som følge af denne mapping.
- Teknisk gate på etapegrundlaget: adaptertest 4/4; fuld FLEET-suite 174/174;
  FLEET-lint og root lint bestod; root produktionsbuild bestod med den kendte
  chunk-størrelsesadvarsel.
- Restarbejde: knappen “Opret leverandør” fra sagsmappen, kontrol af
  `leverandoerer.skriv` og tilbagekomst uden tab af sagskladde skal stadig
  implementeres og browserverificeres, før FL-12 kan lukkes samlet.

#### Delstatus efter Etape 11

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FL-12 | Delvist implementeret; fælles værkstedsvalg er koblet, oprettelsesretur mangler | Implementeret og verificeret for mapping, aktive valg og historik | Implementeret og verificeret: fælles RTDB-kilde læses, ingen IndexedDB-kopi | Implementeret for læsning via eksisterende `leverandoerer.laes`; skriveforløb mangler | 4/4 adaptertests og fuld FLEET-suite 174/174 | Delvist implementeret |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | Root lint/build, FLEET 174/174 og seneste fulde Rules-gate 4.597/4.597 | Delvist implementeret |

### Etape 12 — leverandøroprettelse fra sagsmappen

- “Opret leverandør” i værkstedstildelingen åbner det fælles
  leverandørregister på `/indkoeb/leverandoerer`. Kategorien “Værksted og
  reparation” er forvalgt; der oprettes ikke et nyt FLEET-register.
- Knappen er kun aktiv med `leverandoerer.skriv`. En bruger uden skriveadgang
  får en konkret forklaring og kan ikke aktivere oprettelsesformularen via
  query-parametre.
- Returdestinationen accepterer kun den konkrete integrerede rute
  `/fleet-v2/sager/<id>/bestilling`. Eksterne adresser og andre interne ruter
  afvises. Den oprettede leverandør føres tilbage som et kodet forvalg.
- Den endnu ikke gemte værkstedsbestilling bevares kun i `sessionStorage`,
  afgrænset af tenant og sag, mens brugeren er i leverandørregisteret. Den
  lokale kladde slettes efter en vellykket gemning af værkstedsbestillingen.
  Der påstås ikke serverlagring af sagskladden.
- Browserbevis blev taget fra den integrerede devserver på port 5297 med
  arbejdsområdezoom 100 %. Displaykalibreringen gav 1919×1080 CSS-pixel.
  Med kompakt menu målte `.fc-slot` 1.809 px og `.fc-workspace-zoom` 1.757 px.
  Ruten viste den fælles leverandørliste, den nye knap og den bevarede tekst
  “Bremsekontrol – kladdebevis etape 12” efter retur.
- Billedbevis:
  `docs/beviser/etape-12/fleet-vaerkstedsvalg-1920x1080.png` og
  `docs/beviser/etape-12/leverandoerformular-1920x1080.png`.
- Teknisk gate på etapegrundlaget: målrettede tests 13/13; hele FLEET-suiten
  179/179 i 29 filer; FLEET-lint og FLEET-produktionsbuild bestod. Den kendte
  chunk-størrelsesadvarsel består.

#### Delstatus efter Etape 12

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FL-12 | Implementeret og verificeret i den integrerede app | Implementeret og verificeret for mapping, aktive valg, historik og retur | Implementeret og verificeret: fælles RTDB-kilde; kun midlertidig sagskladde i tenant-/sagsafgrænset sessionlager | Implementeret og verificeret med `leverandoerer.laes`/`leverandoerer.skriv` og afvist usikker retur | 7/7 adapter-/returtests, 6/6 sagsflowtests, 179/179 FLEET og to nye browserbilleder | Implementeret og verificeret |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | FLEET 179/179; root lint og produktionsbuild grøn | Delvist implementeret |

### Etape 13 — fælles FLEET-kategorier

- Den faktiske årsag var to konkurrerende modeller: indberetninger gemte
  kategorinavnet som fri tekst, mens økonomi brugte en separat hardkodet
  kategoriliste. Begge forløb bruger nu et stabilt kategori-ID og gemmer et
  navn-/anvendelsessnapshot på forretningsposten, så senere omdøbning eller
  deaktivering ikke ændrer historikken.
- Den fælles Opsætning-rute er `/opsaetning/fleet-kategorier`. En autoriseret
  bruger kan oprette, redigere, sortere, deaktivere og genaktivere. Hard delete
  er afvist i Rules. Oprettelses- og ændringsaudit samt anvendelserne
  `reports`/`economy` valideres servermæssigt.
- FLEET læser stamdata fra `fleetKategorier` under den aktuelle tenant. Kun
  kategorier med relevant anvendelse vises i henholdsvis indberetningsguiden
  og økonomifiltret. Kategorier, der stadig refereres af historiske lokale
  poster, bevares som inaktive snapshots i adapterlaget og tilbydes ikke til
  nye poster.
- Demoen bruger mærkede standardkategorier, når der ikke findes en Firebase-
  forbindelse. En autentificeret tom eller afvist serverkilde skifter ikke
  skjult til demodata.
- Mobilkontrollen fandt først en reel breddefejl: tabelrækken var 533,56 px i
  et 389 px viewport. Tabellen skifter nu til semantiske kort på små skærme.
  Efter rettelsen måltes dokumentets `scrollWidth` til 367 px og selve tabellen
  til 288,2 px ved 389×843 CSS-pixel. Ved desktop måltes dokumentet til
  1.897 px og kategorikortet til 1.757,07 px i et 1.919×1.080 CSS-viewport.
- Browserbevis ved arbejdsområdezoom 100 %:
  `docs/beviser/etape-13/fleet-kategorier-1920x1080.png`,
  `docs/beviser/etape-13/fleet-kategorier-390x844.png`,
  `docs/beviser/etape-13/fleet-indberetning-kategorier-390x844.png` og
  `docs/beviser/etape-13/fleet-oekonomi-kategorier-1920x1080.png`.
- Teknisk gate på etapegrundlaget: 5/5 nye kategoridomænetests; hele
  FLEET-suiten 184/184 i 30 filer; root lint og produktionsbuild grøn; fuld
  isoleret Auth/Database/Functions/Storage-gate 4.599/4.599 grøn. Database-
  emulatoren startede med den dokumenterede proceslokale `TEMP`/`TMP`-
  håndtering; ingen Rules eller negative tests blev fjernet eller svækket.

#### Delstatus efter Etape 13

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FL-15 | Implementeret og verificeret på desktop og mobil; samme kilde ses i Opsætning, indberetning og økonomi | Implementeret og verificeret for stabile ID'er, anvendelsesmapping, sortering, deaktivering og historiske snapshots | Delvist implementeret: kategori-stamdata er tenantafgrænset RTDB; de forbrugende FLEET-forretningsposter er fortsat lokal prototype | Implementeret og verificeret med `koeretoejer.laes`/`koeretoejer.skriv`, tenant-/modulgate, auditvalidering og afvist hard delete | 5/5 kategoritests, FLEET 184/184, fuld gate 4.599/4.599 og fire nye browserbilleder | Delvist implementeret |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | Root lint/build, FLEET 184/184 og fuld gate 4.599/4.599 | Delvist implementeret |

### Etape 14 — serverstyret FLEET-serviceautomatik

- Der er tilføjet en servermotor, som beregner dato- og målerforfald ud fra
  tenantens autoritative `koeretoejer`-post. Den gætter ikke en manglende
  måling og skriver i så fald ingen indberetning.
- En stabil cyklusnøgle af servicekrav, næste dato og næste målergrænse
  afleder ID'erne til forekomst, indberetning og sag. Hele tenantroden ændres
  i én RTDB-transaktion, så samtidige scheduler-/manuelle kald ikke kan
  oprette dubletter.
- `fleetServiceKravGem` håndhæver revision og idempotens, validerer enheden
  mod den fælles enhedsstamme og gemmer audit. `fleetServiceGennemfoer`
  opdaterer servicegrundlaget, men flytter sagen til fakturaafklaring frem
  for at kalde den afsluttet. En genafspilning med ændret dato eller
  målerstand afvises som konflikt.
- `fleetServiceKontrolPlanlagt` kører servermæssigt hver time i tidszonen
  Europe/Copenhagen. Den browserbaserede prototype er dermed ikke længere
  den eneste motor, men UI'et er endnu ikke koblet til servernoderne.
- De seks serviceområder er serverejede: klienter med FLEET-læseadgang kan
  læse dem, mens direkte skrivning afvises selv for en bruger med alle
  permissions. Mutationer går gennem callables med aktivt abonnement,
  FLEET-modul og `koeretoejer.skriv`.
- Den isolerede Database-emulator brugte demo-projektet
  `demo-fleetcontrol-rules-test`, den allerede installerede portable Temurin
  21.0.12.1 og den cachede Firebase CLI 15.29.0. `TEMP`/`TMP` blev kun fjernet
  for emulatorprocessen. Der blev ikke installeret noget eller kontaktet
  produktion.
- Testbevis: 5/5 rene service-tests; 16/16 integrationassertions for callable,
  revision, idempotens, to samtidige kontroller, tenantadskillelse,
  permissionafvisning og gennemførsel; 49/49 målrettede Rules-/domænetests;
  designgate 11/11, produktionsbuild og fuld lint-/Rules-/platformsgate
  4.605/4.605.
- Etapen ændrer ingen synlig brugerflade. Derfor er der ikke fremstillet et
  misvisende nyt browserbillede som backendbevis; de eksisterende
  servicebilleder dokumenterer fortsat kun den lokale prototype.

#### Delstatus efter Etape 14

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FL-14 | Delvist implementeret: den eksisterende lokale service-UI forklarer beregningen, men kalder endnu ikke serveren | Delvist implementeret: dato/km/timer, manglende grundlag, cyklus, idempotens, gennemførsel og fakturaafklaring er implementeret; åbne forekomster ved kravændring/deaktivering mangler | Delvist implementeret: callables, RTDB-transaktion og scheduler er emulatorverificeret; UI-adapter og kontrolleret overgang af lokale poster mangler | Implementeret og verificeret for tenant, aktivt abonnement, FLEET-modul, `koeretoejer.skriv`, læseadgang og afvist direkte skrivning | 5/5 enhedstests, 16/16 integrationassertions, 49/49 målrettet Rules og 4.605/4.605 fuld gate | Delvist implementeret |
| REG-01 | Ikke relevant | Implementeret og verificeret for serviceetapen | Implementeret og verificeret for serviceetapen | Implementeret og verificeret for serviceetapen | 16/16 serviceintegration og 4.605/4.605 fuld gate | Delvist implementeret, fordi kommende serveretaper endnu mangler |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | Root lint, design 11/11, produktionsbuild og fuld gate 4.605/4.605 | Delvist implementeret |

### Etape 15 — FLEET-statistik og økonomisk afgrænsning

- En ny integreret rute `/fleet-v2/statistik` viser kun de felter, som den
  aktuelle FLEET-datakilde faktisk indeholder: daterede kilometer- og
  driftstimeobservationer samt validerede position-/hastighedsfelter. Den
  lokale fixture har aktuelt ingen driftstimeobservationer, og visningen
  opfinder derfor ikke en graf eller nulværdi for dem.
- Alle målinger bærer periode, enhed, kilde og datatype. Syntetiske rækker er
  mærket, og siden siger udtrykkeligt, at OBD ikke er tilsluttet. En manuel
  eller syntetisk kilde fortolkes aldrig som en tilsluttet telematikkilde.
- Økonomisiden opdeler nu manuelle/lokale, kontrollerede, bogførte,
  foreløbige, estimerede og kontraktlige beløb. Månedlige leasingydelser
  materialiseres kun mellem kontraktstart og -slut og inden for valgt periode.
- Et fælles økonomisk hændelses-ID forhindrer, at en bestilling og dens senere
  faktura tælles to gange; den mest autoritative status vinder. Kreditnotaer
  bevares som egne negative hændelser. Sammenligning bruger en lige lang
  foregående periode og vises kun, når begge perioder har poster i samme
  valuta.
- UI'et kalder tallene et registreret udsnit, ikke bilens fulde faktiske
  omkostning. Fakturacenter-/bogføringsadapteren er endnu ikke koblet til den
  lokale FLEET-prototype.
- Testbevis: 4/4 statistiktests, 8/8 økonomitests, fuld FLEET-suite 191/191,
  FLEET lint/build, root lint/build, designgate 11/11 og fuld isoleret
  Rules-/platformsgate 4.605/4.605. Integreret browserkontrol blev forsøgt mod den lokale
  integrationsserver på port 5297 uden at rydde browserdata; login blev
  konkret blokeret af den frakoblede login-tjeneste. Derfor er der endnu ikke
  afleveret et misvisende integreret screenshot for denne etape.

#### Delstatus efter Etape 15

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FL-16 | Implementeret, men ikke integreret browserverificeret: særskilt statistikside, filtre, datadækning og eksport | Implementeret og verificeret for de faktisk tilgængelige km-, time-, position- og hastighedsfelter; ingen målinger opfindes | Delvist implementeret: læser lokale/syntetiske FLEET-relationer; ingen OBD-adapter er tilsluttet | Delvist implementeret: ruten kræver eksisterende `koeretoejer.laes`; særskilt serverkilde findes ikke | 4/4 domænetests og FLEET 191/191; browser blokeret af login-tjenesten | Delvist implementeret |
| FL-17 | Implementeret og komponentverificeret for filtrering, særskilte statuskort, sporbarhed og datadækning | Delvist implementeret: periode, kategori, kontraktperioder, kr./km-gate, valuta, kreditnota og hændelsesdeduplikering er implementeret; periodisering og fuld livscyklusdækning kræver autoritativ kildemodel | Delvist implementeret: lokal IndexedDB-prototype; ingen fælles faktura-/bogføringsadapter | Delvist implementeret: eksisterende FLEET-rutepermission, men ingen servermutation for økonomiposter | 8/8 domænetests og FLEET 191/191 | Delvist implementeret |
| FL-18 | Implementeret og enhedstestet for downloadindhold | Implementeret for dansk separator/decimal, kilde/status/reference og BOM | Lokal filgenerering; ingen serverlagring nødvendig for selve eksporten | Arver læseadgang fra de to ruter | UTF-8-byteprøver i begge eksporttests; manuel dansk Excel-kontrol mangler | Delvist implementeret |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | Root lint/build, design 11/11, FLEET 191/191 og fuld gate 4.605/4.605 på Etape-15-grundlaget | Delvist implementeret |

### Etape 16 — integreret servergrænse for FLEET-service

- Den integrerede Service-visning læser nu de autoritative fælles enheder fra
  `koeretoejer` samt krav og forekomster fra `fleetServiceKrav` og
  `fleetServiceForekomster`. Adapteren bevarer det fælles enheds-ID; der
  oprettes ikke en ny redigerbar FLEET-kopi.
- Oprettelse og redigering går gennem `fleetServiceKravGem`, og manuel
  varslingskontrol går gennem `fleetServiceKontrolNu`. En callable-fejl
  medfører en synlig fejl og aldrig skjult skrivning til IndexedDB.
- Den lokale browserautomatik startes ikke i servertilstand. UI'et forklarer,
  at den timebaserede serverkørsel fortsætter uden en åben browser. En bruger
  uden `koeretoejer.skriv` kan læse krav, men får ingen opret-, rediger- eller
  manuel kontrolhandling.
- Servervalideringen bevarer nu de redigerbare kategori-, årshændelses-,
  ansvarlig-, leverandør-, dokument- og notefelter. Når både en fast dato og
  et månedsinterval gælder, anvendes den tidligste beregnede dato. Ved
  gennemført fast årshændelse beregnes næste kalendercyklus, inklusive sidste
  gyldige dag i februar.
- Serveren opretter allerede indberetning og sag atomisk, men den integrerede
  FLEET-prototype læser endnu ikke disse serverposter ind i sine generelle
  indberetnings- og sagslister. Derfor vises serverreferencen som tekst i
  Service i stedet for et dødt link. Planlægning, historisk service og
  mailopsætning er tilsvarende skjult i servertilstand, indtil deres
  serveradaptere findes.
- Browserbillede kunne ikke fremstilles fra den integrerede autentificerede
  app: den lokale loginvisning svarede fortsat, at login-tjenesten ikke var
  tilgængelig. Browserdata og lokale præferencer blev ikke ryddet, og et
  gammelt designreferencebillede er ikke genbrugt som bevis.
- Teknisk gate på etapegrundlaget: 13/13 fokuserede serviceklient-/motortests,
  servertilstandskomponenttesten, hele FLEET-suiten 192/192, root lint,
  produktionsbuild, designgate 11/11 og fuld isoleret Rules-/platformsgate
  4.613/4.613. Første fulde gate fandt alene det forventede dokumentationstal
  219 efter tilføjelsen af prøvefil nr. 220; tælleren blev rettet, og hele
  gaten blev kørt grønt igen. Ingen Rules eller negative tests blev svækket.

#### Delstatus efter Etape 16

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FL-13 | Implementeret, men ikke integreret browserverificeret: serverkrav og fælles enheder vises og redigeres i den eksisterende serviceflade | Implementeret for dato/km/timer, faste årshændelser og først nåede kalendergrænse | Delvist implementeret: krav gemmes servermæssigt; historisk service og planlægning af sag/opgave mangler adapter | Implementeret og komponentverificeret: læsning følger FLEET-adgang, skrivning kræver `koeretoejer.skriv` | 13/13 fokuserede tests, FLEET 192/192; browser blokeret af login-tjenesten | Delvist implementeret |
| FL-14 | Delvist implementeret: serverstatus og manuel serverkontrol er koblet; serveroprettede sager er endnu ikke åbne fra FLEET-listen | Delvist implementeret: idempotent cyklus, manglende grundlag, gennemførsel og næste årscyklus; ændring/deaktivering med åben forekomst mangler | Delvist implementeret: UI bruger callables/noder og ingen browsertimer; overgang af eksisterende lokale poster og sagsadapter mangler | Implementeret og verificeret for tenant, aktivt abonnement, FLEET-modul, `koeretoejer.skriv`, læseadgang og afvist direkte skrivning | 13/13 fokuserede tests, servertilstandskomponenttest og fuld gate 4.613/4.613 | Delvist implementeret |
| REG-01 | Ikke relevant | Implementeret og verificeret for denne serverkobling | Implementeret og verificeret uden lokal fallback | Implementeret og verificeret | Fuld gate 4.613/4.613 | Delvist implementeret, fordi kommende serveretaper fortsat mangler |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | Root lint/build, design 11/11, FLEET 192/192 og fuld gate 4.613/4.613 | Delvist implementeret |

### Etape 17 — serverprojektion i FLEETs indberetninger og sager

- De indberetninger og sager, som serviceautomatikken opretter på serveren,
  indlæses nu i de almindelige FLEET-flader med deres stabile server-ID'er.
  De kan åbnes på `/fleet-v2/indberetninger/<indberetnings-id>`,
  `/fleet-v2/arbejdsko/<sags-id>` og `/fleet-v2/sager/<sags-id>`.
- Projektionen flettes med den eksisterende lokale prototype ved ID, men
  serverposten vinder ved en kollision. Der oprettes ingen ekstra redigerbar
  kopi. Det fælles `koeretoejer`-ID bevares som enhedsreference.
- Serverposter er udtrykkeligt skrivebeskyttede i denne overgang. Sagsmappe,
  arbejdskø, vurdering og direkte værkstedslink skjuler eller afviser lokale
  ændringer. Datakonteksten håndhæver det samme værn, så en gammel eller
  skjult betjeningsvej heller ikke kan skrive en serverstyret sag til
  IndexedDB.
- Gennemført service kobles til indberetning og sag i tidslinjen. Serverens
  ukendte anvendelighed vises som `Uafklaret`; klienten opfinder ikke, at en
  enhed er i drift eller ude af drift. En læsefejl vises i de berørte flader
  og udløser ikke skjult fallback til demodata.
- Teknisk bevis på etapegrundlaget: 15/15 rene service-/adaptertests, 7/7
  målrettede serviceflowtests, hele FLEET-suiten 193/193 i 31 filer, root lint,
  produktionsbuild, designgate 11/11 og fuld isoleret Rules-/platformsgate
  4.615/4.615. Ingen Rules eller negative tests er fjernet eller svækket.
- Integreret browserkontrol nåede den lokale app på port 5297, men den
  autentificerede rute standsede på `/login`. Login blev ikke automatiseret,
  browserdata blev ikke ryddet, og der afleveres derfor ikke et gammelt eller
  uautentificeret billede som bevis for denne etape.
- Fortsat restarbejde: servermutationer til vurdering, sagsstatus,
  værkstedsbestilling og lukning; eksplicit håndtering af åben forekomst ved
  ændring/deaktivering af et servicekrav; samt en kontrolleret overgang for
  allerede eksisterende lokale poster.

#### Delstatus efter Etape 17

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FL-14 | Implementeret, men ikke integreret browserverificeret: servervarsler åbner i indberetning, arbejdskø og sagsmappe og er tydeligt skrivebeskyttede | Delvist implementeret: stabil cyklus, manglende grundlag, tidslinjereferencer og ærlig uafklaret anvendelighed; kravændring/deaktivering mangler | Delvist implementeret: serverkilden er autoritativ og uden lokal fallback; sagsmutationer og overgang af lokale poster mangler | Implementeret og teknisk verificeret for læsning og afvist direkte/lokal skrivning; de kommende servermutationers handlingspermissions mangler | 15/15 adaptertests, 7/7 serviceflow, FLEET 193/193 og fuld gate 4.615/4.615; integreret browserlogin blokerer billedbevis | Delvist implementeret |
| REG-01 | Ikke relevant | Implementeret og verificeret for den læsende serverprojektion | Implementeret og verificeret uden ny redigerbar kopi | Implementeret og verificeret for den læsende projektion | Fuld gate 4.615/4.615 | Delvist implementeret, fordi servermutationer og senere etaper mangler |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | Root lint/build, design 11/11, FLEET 193/193 og fuld gate 4.615/4.615 | Delvist implementeret |

### Etape 18 — kontrolleret kravændring med åben serviceforekomst

- Et aktivt varsel låser nu enhed, dato-/målergrundlag, intervaller,
  varslingsgrænser og årlig kalenderregel på serveren. En bruger kan fortsat
  rette beskrivende metadata, men kan ikke flytte den aktuelle cyklus' grundlag
  under en eksisterende indberetning og sag.
- Deaktivering kræver et eksplicit valg om at bevare den eksisterende
  indberetning og sag åbne. Uden dette valg afviser både dialogen og serveren
  handlingen. Deaktivering sletter, lukker eller omklassificerer ikke den åbne
  forekomst; det stopper kun nye varslinger fra kravet.
- Det eksplicitte valg og udfaldet indgår i serverens revisionslåste,
  idempotente mutation. Historikken registrerer deaktiveringen med reference
  til den bevarede forekomst. En manglende forekomst bag en aktiv reference
  afvises som datakonflikt i stedet for at blive overskrevet.
- Teknisk bevis: 17/17 rene service-/klienttests, 8/8 målrettede
  serviceflowtests, hele FLEET-suiten 194/194, målrettet isoleret
  Database-emulatorintegration, root/FLEET-lint, produktionsbuild,
  designgate 11/11 og fuld isoleret Rules-/platformsgate 4.617/4.617.
  Rules og negative tests er uændrede.
- Den synlige bekræftelse er komponentverificeret. Et nyt integreret
  browserbillede udestår fortsat, fordi den normale lokale session står på
  `/login`; eksisterende browserdata er ikke ryddet, og login er ikke
  automatiseret.

#### Delstatus efter Etape 18

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FL-14 | Implementeret og komponentverificeret for eksplicit bevaring ved deaktivering; integreret browserbillede udestår | Implementeret og verificeret for ændring/deaktivering med åben forekomst, cykluslås og bevaret åben sag | Delvist implementeret: servertransaktionen håndhæver dette forløb; øvrige sagsmutationer og overgang af lokale poster mangler | Implementeret og verificeret gennem eksisterende callable-gate med tenant, FLEET-modul og `koeretoejer.skriv` | 17/17 rene tests, 8/8 serviceflow, FLEET 194/194, målrettet emulatorintegration og fuld gate 4.617/4.617 | Delvist implementeret, fordi den samlede service-/sagsgrænse fortsat mangler mutationer og overgang |
| REG-01 | Ikke relevant | Implementeret og verificeret for denne mutation | Implementeret og verificeret med revision, idempotens og serveraudit | Implementeret og verificeret | Målrettet emulatorintegration og fuld gate 4.617/4.617 | Delvist implementeret, fordi kommende serveretaper mangler |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | Root/FLEET-lint, build, design 11/11, FLEET 194/194 og fuld gate 4.617/4.617 | Delvist implementeret |

### Etape 19 — Fakturacenterets autoritative arbejdsliste og kontrolhandlinger

- Fakturacenterets autentificerede visning læser nu den fælles
  `tenants/{tenantId}/fakturaer`-node gennem `useListe`. En afvist eller fejlet
  læsning giver en synlig fejl og aldrig syntetiske erstatningsrækker. Den
  lokale demo beholder sine 20 scenarier i en særskilt tilstand.
- En ren adapter projicerer kun registrerede felter til trepanelvisningen.
  Manglende filnavn, beløb, dato eller destination står som ukendt. En
  destination omdannes ikke til en opdigtet finansiel fordeling, og
  dokumentpanelet kalder serverens felter metadata i stedet for at tegne
  syntetiske fakturalinjer.
- Serverens `indbakke`, `ekstra-kontrol` og `arkiveret` bestemmer de tre
  arbejdslister. Ekstra kontrol vises, når kundens serveropsætning er aktiv,
  eller der allerede findes ventende poster. Arkiv beskrives fortsat som
  afsluttet Veyro-kontrol, ikke betaling eller bogføring.
- Enkeltkontrol sender faktura-ID og forventet kontrolrevision til
  `fakturakontrolUdfoer`, bliver i Indbakke og vælger næste synlige post.
  Ekstra godkendelse og begrundet tilbagesendelse bruger samme servergrænse.
  UI'et skjuler eller deaktiverer handlingerne uden `fakturaer.godkend`.
- Massekontrol er kun tilgængelig i Indbakke. Den præciserer det filtrerede
  omfang, kræver én bekræftelse og sender hvert ID med sin revision til
  `fakturakontrolMasse`. Resultatlisten viser både gennemførte og blokerede
  poster, mens serveren håndhæver adgang, revisionskonflikt, kontrolgrundlag
  og idempotens.
- Uploadknappen er bevidst ikke vist i servertilstand endnu. Den lokale demo
  kan fortsat demonstrere filnavn, SHA-256 og dubletstatus, men der påstås
  ingen servermodtagelse før en faktisk modtage-/dubletkontrakt findes.
- Teknisk bevis på etapegrundlaget: 12/12 rene adapter-/kontroldomænetests,
  den samlede afgrænsede Fakturacenter-pakke 176/176, 21/21 isolerede callable-
  assertions, root lint, produktionsbuild og fuld lokal Rules-/platformsgate
  4.621/4.621. Buildets eneste melding er den
  kendte chunk-størrelsesadvarsel. Integreret screenshot udestår: den lokale
  app på port 5297 står på `/login`; browserdata er ikke ryddet, og login er
  ikke automatiseret.

#### Delstatus efter Etape 19

| ID | Brugerflade og betjening | Domænelogik | Lagring og backend | Adgangskontrol | Testbevis | Samlet |
| --- | --- | --- | --- | --- | --- | --- |
| FC-03 | Implementeret, men ikke integreret browserverificeret: betinget Ekstra kontrol, godkend og begrundet tilbagesendelse | Implementeret og verificeret: nettogrænse ekskl. moms, anden person, statusovergange og revision | Implementeret og emulatorverificeret: opsætning, kontrolhistorik og idempotente callables; ingen lokal fallback | Implementeret og verificeret for tenant, aktivt abonnement, udpeget kontrollant og `fakturaer.godkend` | 12/12 rene tests, 21/21 callable-assertions og fuld gate 4.621/4.621; browserbevis udestår | Implementeret, men ikke verificeret |
| FC-04 | Implementeret, men ikke integreret browserverificeret: checkboxes, filtreret omfang, én bekræftelse og delsvar | Implementeret og verificeret for revision, grundlag, delvis succes og idempotent genforsøg | Implementeret og emulatorverificeret gennem masse-callable; UI sender server-ID og revision | Implementeret og verificeret pr. faktura gennem callable-gaten | Fakturacenter 176/176, 21/21 callable-assertions og fuld gate 4.621/4.621; browserbevis udestår | Implementeret, men ikke verificeret |
| FC-06 | Implementeret og verificeret kun i lokal demo | Delvist implementeret: lokal SHA-256/dubletkontrol findes | Ikke implementeret servermæssigt; UI påstår ikke modtagelse | Ikke implementeret for serverupload | Eksisterende lokale intake-tests | Delvist implementeret |
| REG-01 | Ikke relevant | Implementeret og verificeret for Fakturacenter-kontrol | Implementeret og verificeret med revision og idempotens | Implementeret og verificeret | 21/21 emulatorassertions og fuld gate 4.621/4.621 | Delvist implementeret, fordi senere serveretaper mangler |
| REG-02 | Ikke relevant | Delvist implementeret | Delvist implementeret | Delvist implementeret | Root lint/build, Fakturacenter 176/176 og fuld gate 4.621/4.621 | Delvist implementeret |

### Etape 20 — FLEET-tilbage-navigation

- Alle relevante detaljeruter modtager en eksplicit, intern oprindelsesrute og
  bruger en sikker FLEET-fallback ved direkte URL eller genindlæsning.
- Liste-/arbejdsvisninger gemmer de relevante filtre, valgt række/fane og
  scrollposition i en skærm- og tenantafgrænset historikpost.
- Faktisk browserkontrol på den isolerede FLEET-build dækkede overblik,
  arbejdskø, indberetninger, enhedsprofil og sagsmappe. Direkte åbning af
  `/sager/case-demo-001`, genindlæsning og tilbagehandling endte på
  `/arbejdsko`, ikke uden for programmet.
- Dokumentation og fuld evidens ligger i
  `docs/VEYRO_FLEET_NAVIGATION_QA_2026_09_15.md`.

### Etape 21 — flydende enhedsdetaljer på Livekort

- Klik på en enkelt markør åbner nu en kortforankret popup med enhedsnummer,
  mærke/model, position, forbindelses-/bevægelsesstatus og dataktualitet.
- Popup'en kan lukkes med X, ESC eller klik på kortbaggrunden og kan åbne den
  fulde enhedsprofil. Valg fra en klynge åbner samme popup.
- Faktisk browserkontrol på `http://127.0.0.1:5197/livekort` viste NB-010 på
  desktop, SC-104 via klyngevalg og den korrigerede popup inden for kortet ved
  390×844. Browserkonsollen havde ingen fejl eller advarsler.
- Den visuelle rettelse ændrer ikke datakilden: kortet er fortsat tydeligt
  mærket som demodata og aktiverer ingen ekstern OBD/GPS-tjeneste.

Den tværgående, aktuelle 36-kravsvurdering er samlet i
`docs/VEYRO_RETTELSESRUNDE_STATUS_2026_09_15.md`.

### Etape 22 — eksplicit moms i økonomi-eksport

- Økonomi-CSV'en har nu separate kolonner for oprindeligt beløb,
  beløbsgrundlag, beløb ekskl. moms, momsbeløb og beløb inkl. moms.
- Eksporten udleder kun den tredje værdi, når to eksplicitte beløb gør den
  matematisk entydig. Den antager ikke en momssats; `Uafklaret` giver tomme
  netto-/moms-/bruttokolonner.
- En repræsentativ CSV med `ØKO-Æ01`, danske kategorier og alle tre
  momsforløb blev importeret til en Excel-kompatibel projektmappe. Visuel
  rendering viste 12 læsbare kolonner og korrekte danske tegn. Manuel åbning i
  Microsoft Excel er fortsat ikke gennemført og markeres derfor som restarbejde.
