# Veyro rettelsesrunde 14. september 2026

Statusdokumentet er den sporbare arbejdsliste for rettelsesrunden bestilt i
`14-9-2026. Veyro rettelser..docx`. Skærmbillederne i Word-dokumentet er læst
sammen med teksten og bruges som fejl- og designreferencer; dokumentet er ikke
en ny datakilde eller en tilladelse til produktionsændringer.

## Grundlag og afgrænsning

- Start-HEAD: `7313eac39a0e8b55dbbb0f59b60f31c9753a67d3`
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
| UX-06 | Navigation | Meningsfuld tilbagefunktion med bevaret visningstilstand; direkte åbning har fallback. | Fælles route-/visningskomponenter | åben | Browser frem/tilbage, reload og direkte URL | Skærmspecifik tilpasning |
| UX-07 | Dialog | ESC, X, Annuller, ugemte data, fokusretur, bekræft Gem/Slet og fejlbevaring. | Fælles og berørte moduldialoger | i gang | Ny FLEET-rutedialog har fokusfælde, ESC/X/baggrund, fokusretur og dirty-bekræftelse; Manuel sag bevarer input ved fejl. 10/10 berørte komponenttests og browserforløb består. | Øvrige moduldialoger skal fortsat auditeres; domæner må bruge arkivering, hvor hard delete er forbudt |
| FC-01 | Navigation | Synligt forløb er Indbakke, betinget Ekstra kontrol og Arkiv; gamle dybe links mappes uden historiktab. | `src/fleet/fakturacenter-intake.js`, `src/moduler/oekonomi/Fakturacenter.jsx`, `src/fleet/nav.js` | implementeret | 100/100 målrettede tests; browser viste kun Indbakke og Arkiv, mens Ekstra kontrol er korrekt skjult før aktivering | Interne domænestatusser er bevaret |
| FC-02 | Kontrol | Succes fjerner posten fra arbejdsliste, bliver i Indbakke og vælger næste; fejl bevarer posten. | Fakturacenter UI/domæne | implementeret | Domænetest og browserwiring; succes flytter til intern kontrolleret/Arkiv-status uden sektionsskift | Lokal prototype, ikke serverlagring |
| FC-03 | Ekstra kontrol | Tilstande ingen/alle/over beløbsgrænse ekskl. moms; anden person; kundestyret allowlist; serveraudit. | Opsætning, fælles kontrakt, Functions/Rules | delvist implementeret | Opsætningen lagres nu tenantafgrænset gennem callable; beløbsgrænsen bruger beløbet ekskl. moms, egen godkendelse afvises, udpegede brugere valideres mod effektiv permission, og 21 callable-assertions samt fuld gate 4.597/4.597 består | Den nuværende syntetiske arbejdsflade er endnu ikke koblet til de serverlagrede fakturaer; den præcise kundearbejdsgang skal derfor browserverificeres efter adapterkoblingen |
| FC-04 | Massekontrol | Checkbox, synligt omfang, én bekræftelse, adgang/revision/gates pr. faktura, delsvar og idempotent genforsøg. | Fakturacenter UI/domæne/Functions | delvist implementeret | Serveren kontrollerer permission, revision og hvert fakturagrundlag, bruger tenantafgrænset idempotens og returnerer resultat pr. faktura; 21 callable-assertions og fuld gate 4.597/4.597 består | Checkbox-/bekræftelsesforløbet kører fortsat på den lokale syntetiske prototype og skal kalde den nye masse-callable, før kravet kan lukkes |
| FC-05 | Filtre | Matchkategori bevares; standard nyeste først erstattes som kontrol af modul inkl. uafklaret/flere fordelinger. | Fakturacenter UI | implementeret | Filtertest dækker FLEET, flere moduler og uafklaret; browser viste modulfilter og fast nyeste rækkefølge | Ingen |
| FC-06 | Upload | Filnavn, modtaget/behandler/fejlet, tydelig fremdrift, dubletværn og idempotent genforsøg; demo mærkes. | Fakturacenter intake/UI | i gang | Integreret browsertest viste filnavn, lokal `ikke gemt`-kvittering og samme SHA-256 på dublethold; `1440x900-fakturacenter-uploadfeedback.png` | Permanent modtagelse/pipeline og backendkvittering mangler; UI påstår ikke varig lagring |
| FC-07 | Layout | Kompakt top og tre selvscrollende, justerbare, huskede paneler; demospecifik tekst fjernes fra normal struktur. Den ruteisolerede CSS ramte tidligere ikke den indskudte zoom-wrapper, så arbejdsbordet voksede til ca. 2.086 px i stedet for at give panelerne en viewportshøjde. | Fakturacenter workspace/CSS og AppShell zoom-wrapper | implementeret | Ved 1440×900: workspace 1.172×642 px; paneler 280/423/450 px; scrollHeight/clientHeight 1874/440, 824/566 og 1106/566. Tastaturbredde 22→24 % bestod reload. | Forretningsdata er fortsat lokal prototype; panelpræferencens scope gennemgås igen i samlet regression |
| FC-08 | Opsætning | Mail og forbindelser flyttes ud af arbejdsnavigationen til fælles Opsætning uden at aktivere transport. | Nav, routes, opsætning | implementeret | Produktionsbuild indeholder lazy chunk; gammelt mail-link redirecter. Den lokale kontraktformular giver ikke i sig selv en serverrettighed. | Ekstern mail forbliver deaktiveret; serverstyret opsætning etableres under FC-03 |
| FL-01 | Overblik | KPI-kort og handlingsposter/Se alle åbner relevante filtre; optællinger og udsnit forklares. | `fleet-v2/src/components/Overview.jsx`, FleetV2App og UnitCatalog | implementeret lokalt | Komponenttest og faktisk browserroute/filter | Handlingslisten forklarer nu, at den viser 5 af det samlede antal. |
| FL-02 | Drift | Dag/uge/måned/kvartal/år ændrer registreret datagrundlag og akser. | FLEET overblik/domæne | åben | Periodeprøver mod syntetisk registreret historik | Ingen opfundet fortid |
| FL-03 | Omkostning/nedetid | Måneder virker; datadækning, nul/mangler, sidste år og sammensmeltede tidsintervaller håndteres. | FLEET overblik/økonomidomæne | åben | Beregningstests og UI | Sammenligning kun når data findes |
| FL-04 | Livekort | Kort-wheel og +/−, ingen dobbeltzoom, popup pr. enhed, cluster/samme position kan vælges, tydelig kilde/friskhed. | FLEET LiveMap/GeoMap | delvist implementeret | 8/8 LiveMap-tests og faktisk browserprøve af kortknap/klyngeliste | Markørvalg bruger den eksisterende detaljeside frem for en flydende popup. Ingen ekstern OBD aktiveres. |
| FL-05 | Enhedsregister | Moderne FLEET-kartotek bliver primær skærm i Opsætning med autoritativ mapping og gamle dybe links. | Root-routes/nav, FLEET repository/adapters | implementeret lokalt | Route-, permission- og referenceprøver med PLANNING | Moderne kartotek åbner på `/opsaetning/enheder`; `/fleet-v2/enheder` bevares som kompatibelt dybt link. UNIT/WAREHOUSE-unit er fortsat et særskilt domæneobjekt. |
| FL-06 | Enhedsformular | Typefaner fjernes; typefilter bevares; indvendige mål, fire udstyrsvalg og energikilde med ukendt/ikke relevant. | UnitCatalog, UnitFormDialog, UnitProfile, unitSelectors | implementeret lokalt | 18/18 målrettede komponenttests og integreret browserverifikation | Trækkrog, hængertræk, kran og lift er separate værdier. Eksisterende ukendte drivmiddelværdier bevares ved redigering. |
| FL-07 | Indberetninger | Stabil trepanelstruktur, fuld bredde, justering/hukommelse/scroll og semantiske statustokens. | ReportTriage, ThreePanelWorkspace og CSS | implementeret lokalt på desktop; mobil regression består | Faktisk browsermåling, tastatur-resize/nulstil og ReportFlow | Bredder er rene bruger-/tenantafgrænsede visningsvalg, ikke forretningsdata. |
| FL-08 | Manuel sag | Læsbar dialog med enhed, beskrivelse, prioritet, validering, lukning og inputbevaring ved fejl. | ManualCaseDialog og CSS | implementeret lokalt | Integreret browsertest viste validering og oprettede en syntetisk højprioritetssag; `1440x900-manuel-sag-validering.png`; komponenttest bevarer input ved lagringsfejl | Lokal prototype, ikke serverlagring |
| FL-09 | Arbejdskø | Nye indberetninger åbner flytbar detaljedialog; under vurdering åbner genbrugt sagsmappe; mobil stabil. | WorkQueue, `DraggableDialog`, CaseFolder og CSS | implementeret lokalt | 1920×1080 drag flyttede dialogen 65×37 px og holdt X inden for workspace; fuld sagsmappe genbruges. 390×844 og 360×800 har fuldskærmsdialog uden dokumentoverflow. | Autorisation følger eksisterende lokale repository/route; serverpersistens mangler |
| FL-10 | Sagsmappe | Godkendt samlet design uden fanebjælke, kompakt enhedsrække, foldesektioner og tilstands-/permissionstyret næste handling. | CaseFolder, CaseActionPanel og CSS | implementeret lokalt | Ingen tabs; kompakt enhedsrække; `Problem og næste handling`; foldbare indberetning, medier, enhedsdata, økonomi og historik; sticky højre infokolonne. Browserbevis ved 1920, 1440/125 %, 390 og 360. | Autoritative statusser og fakturaafklaring er bevaret; data er lokal prototype |
| FL-11 | Kompakt kø | Permanent Flyt sag fjernes; statusændring bevares i sagsmappe/diskret menu; kolonner ruller. | WorkQueue og CSS | implementeret lokalt | Kolonne-/statusregression | Tabelvisning og sagsmappe bevarer lovlige statushandlinger; workflowstadier er uændrede |
| FL-12 | Leverandører | Værksteder læses fra fælles leverandørregister; autoriseret oprettelse bevarer sagskladde. | FLEET vendor adapter, fælles leverandører | åben | Opret/vælg og afvist rolle | Ekstern portal må ikke få intern adgang |
| FL-13 | Service | Dateret seneste service/måler, kalender/km/timer, varsler, faste hændelser og forklarlig næste grænse. | Service domain/UI | implementeret som lokal prototype | 24/24 Service-domæne-/komponenttests | Den først nåede dato- eller målergrænse udløser behovet; tallet `500` er målerinterval i den viste enheds km eller driftstimer |
| FL-14 | Serviceautomatik | Én indberetning pr. krav/cyklus, idempotens/samtidighed, manglende grundlag, gennemførsel og ændring/deaktivering. | Service automation, Functions/Rules | lokalt implementeret; serverdel blokeret | ServiceAutomation dækker gentagelse, samtidige fanekald, manglende grundlag, deaktivering og ny cyklus | Den aktuelle kontrol kører kun ved appstart/hvert minut i browseren; varig serverstyret scheduler og emulatorbevis mangler |
| FL-15 | Kategorier | Kundestyret opret/redigér/sortér/deaktivér med historiske referencer og eksplicit rapportmapping. | Opsætning, category repository/adapter | åben | Permission, historik og mobil/desktop | Én autoritativ kategori pr. formål |
| FL-16 | OBD-statistik | Kun faktiske målinger vises/filtreres/eksporteres; kilde/periode/enhed mærkes; manglende forbindelse er tydelig. | FLEET statistik | åben | Datafeltinventar og syntetisk UI-test | Ekstern OBD er ikke del af opgaven |
| FL-17 | Økonomi | Per enhed/samlet, periode/kategori, faste/enkeltstående poster, kr./km, historik og sporbarhed uden dobbeltoptælling. | FLEET economy domain/UI | åben | Beregnings-/drilldowntests | Estimat, kontrolleret og bogført holdes adskilt |
| FL-18 | Eksport | Dansk CSV/Excel-visning uden mojibake og med entydige beløbs-/momskolonner. | FLEET economy export | delvist implementeret lokalt | Domænetest af dansk indhold og UTF-8-rundtur | Download har nu UTF-8 BOM; manuel åbning i dansk Excel og udvidede momskolonner udestår |
| REG-01 | Sikkerhed | Tilladt/afvist rolle, tenant, revision, samtidighed, idempotens og ingen demo-fallback. | Rules, Functions og modultests | i gang | Fuld lokal Rules-/platformsgate 4.597/4.597 grøn i isoleret emulator. Målrettet Fakturacenter-callable 21 assertions, UNIT/WAREHOUSE/modul 48/48 og tenant 24/24. | FL-14 og øvrige kommende serverfunktioner kræver egne emulatorbeviser før deres samlede krav kan lukkes. |
| REG-02 | Samlet regression | WORKFORCE–PLANNING, UNIT–WAREHOUSE og Support–Ejerforbindelser bevares. | Hele integrationen | i gang | Root lint og build grøn; Rules-/platformsgate 4.586/4.586 grøn | Endelig tværmodul- og browserregression gentages efter de resterende backend-etaper. |
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
FC-03/FC-04/FC-06/FC-07, FL-02/FL-03, FL-04's flydende popup, FL-08's fælles
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
