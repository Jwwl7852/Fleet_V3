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
| UX-04 | Kompakt menu | Flyout bevares fra ikon til menu, ligger over indhold, håndterer kanter/lange lister, ESC/udenfor, mus/tastatur/touch. | `src/fleet/AppShell.jsx`, `src/fleet/fleet.css` | implementeret | FLEET-flyout vist over workspace; alle 11 tilladte underlinks; ESC lukkede og returnerede fokus; mobilklik eksponerede underlinks | Ingen |
| UX-05 | Foldeknap | Variant B, afrundet flig ca. 30×34 med mindst 44×44 klikmål, tokens og korrekt chevron/aria. | `src/fleet/AppShell.jsx`, `src/fleet/fleet.css` | implementeret | Beregnet klikmål 43,98×43,98 px; synlig pseudo-flig 30×34; titel, aria og korrekt chevron | Ingen |
| UX-06 | Navigation | Meningsfuld tilbagefunktion med bevaret visningstilstand; direkte åbning har fallback. | Fælles route-/visningskomponenter | åben | Browser frem/tilbage, reload og direkte URL | Skærmspecifik tilpasning |
| UX-07 | Dialog | ESC, X, Annuller, ugemte data, fokusretur, bekræft Gem/Slet og fejlbevaring. | Fælles og berørte moduldialoger | åben | Tastatur- og fejlforløb | Domæner må fortsat bruge arkivering, hvor hard delete er forbudt |
| FC-01 | Navigation | Synligt forløb er Indbakke, betinget Ekstra kontrol og Arkiv; gamle dybe links mappes uden historiktab. | `src/fleet/fakturacenter-intake.js`, `src/moduler/oekonomi/Fakturacenter.jsx`, `src/fleet/nav.js` | implementeret | 100/100 målrettede tests; browser viste kun Indbakke og Arkiv, mens Ekstra kontrol er korrekt skjult før aktivering | Interne domænestatusser er bevaret |
| FC-02 | Kontrol | Succes fjerner posten fra arbejdsliste, bliver i Indbakke og vælger næste; fejl bevarer posten. | Fakturacenter UI/domæne | implementeret | Domænetest og browserwiring; succes flytter til intern kontrolleret/Arkiv-status uden sektionsskift | Lokal prototype, ikke serverlagring |
| FC-03 | Ekstra kontrol | Tilstande ingen/alle/over beløbsgrænse ekskl. moms; anden person; kundestyret allowlist; serveraudit. | Opsætning, fælles kontrakt, Functions/Rules | blokeret | Ren kontrakttest for netto og anden udpeget kontrollant; opsætningsrute viser afstemt kontrakt uden aktivering | Autoritativ brugeradapter, serverlagring, audit og Rules/Functions mangler; UI-værdier giver ikke adgang |
| FC-04 | Massekontrol | Checkbox, synligt omfang, én bekræftelse, adgang/revision/gates pr. faktura, delsvar og idempotent genforsøg. | Fakturacenter UI/domæne | implementeret | 100/100 målrettede tests; browser viste 19 synlige valg og bekræftelsesdialog med per-faktura-gates | Lokal prototype, ikke serverlagring |
| FC-05 | Filtre | Matchkategori bevares; standard nyeste først erstattes som kontrol af modul inkl. uafklaret/flere fordelinger. | Fakturacenter UI | implementeret | Filtertest dækker FLEET, flere moduler og uafklaret; browser viste modulfilter og fast nyeste rækkefølge | Ingen |
| FC-06 | Upload | Filnavn, modtaget/behandler/fejlet, tydelig fremdrift, dubletværn og idempotent genforsøg; demo mærkes. | Fakturacenter intake/UI | åben | Upload- og fejlforløb | Permanent lagring må kun oplyses efter datakildekvittering |
| FC-07 | Layout | Kompakt top og tre selvscrollende, justerbare, huskede paneler; demospecifik tekst fjernes fra normal struktur. | Fakturacenter workspace/CSS | i gang | Tre interne scrollområder og panelbredder består test; top og liste er komprimeret | Bruger-/tenantafgrænsning af ældre panelnøgle mangler endnu |
| FC-08 | Opsætning | Mail og forbindelser flyttes ud af arbejdsnavigationen til fælles Opsætning uden at aktivere transport. | Nav, routes, opsætning | implementeret | Produktionsbuild indeholder lazy chunk; gammelt mail-link redirecter; adgang filtreres på `fakturaer.godkend` | Ekstern mail forbliver deaktiveret |
| FL-01 | Overblik | KPI-kort og handlingsposter/Se alle åbner relevante filtre; optællinger og udsnit forklares. | `fleet-v2/src/components/Overview.jsx`, FleetV2App og UnitCatalog | implementeret lokalt | Komponenttest og faktisk browserroute/filter | Handlingslisten forklarer nu, at den viser 5 af det samlede antal. |
| FL-02 | Drift | Dag/uge/måned/kvartal/år ændrer registreret datagrundlag og akser. | FLEET overblik/domæne | åben | Periodeprøver mod syntetisk registreret historik | Ingen opfundet fortid |
| FL-03 | Omkostning/nedetid | Måneder virker; datadækning, nul/mangler, sidste år og sammensmeltede tidsintervaller håndteres. | FLEET overblik/økonomidomæne | åben | Beregningstests og UI | Sammenligning kun når data findes |
| FL-04 | Livekort | Kort-wheel og +/−, ingen dobbeltzoom, popup pr. enhed, cluster/samme position kan vælges, tydelig kilde/friskhed. | FLEET LiveMap/GeoMap | delvist implementeret | 8/8 LiveMap-tests og faktisk browserprøve af kortknap/klyngeliste | Markørvalg bruger den eksisterende detaljeside frem for en flydende popup. Ingen ekstern OBD aktiveres. |
| FL-05 | Enhedsregister | Moderne FLEET-kartotek bliver primær skærm i Opsætning med autoritativ mapping og gamle dybe links. | Root-routes/nav, FLEET repository/adapters | implementeret lokalt | Route-, permission- og referenceprøver med PLANNING | Moderne kartotek åbner på `/opsaetning/enheder`; `/fleet-v2/enheder` bevares som kompatibelt dybt link. UNIT/WAREHOUSE-unit er fortsat et særskilt domæneobjekt. |
| FL-06 | Enhedsformular | Typefaner fjernes; typefilter bevares; indvendige mål, fire udstyrsvalg og energikilde med ukendt/ikke relevant. | UnitCatalog, UnitFormDialog, UnitProfile, unitSelectors | implementeret lokalt | 18/18 målrettede komponenttests og integreret browserverifikation | Trækkrog, hængertræk, kran og lift er separate værdier. Eksisterende ukendte drivmiddelværdier bevares ved redigering. |
| FL-07 | Indberetninger | Stabil trepanelstruktur, fuld bredde, justering/hukommelse/scroll og semantiske statustokens. | ReportTriage, ThreePanelWorkspace og CSS | implementeret lokalt på desktop; mobil regression består | Faktisk browsermåling, tastatur-resize/nulstil og ReportFlow | Bredder er rene bruger-/tenantafgrænsede visningsvalg, ikke forretningsdata. |
| FL-08 | Manuel sag | Læsbar dialog med enhed, beskrivelse, prioritet, validering, lukning og inputbevaring ved fejl. | ManualCaseDialog og CSS | implementeret lokalt | Browserprøve uden lagring og ReportFlow/CaseFolder-tests | Eksplicit fælles gem-bekræftelse mangler fortsat. |
| FL-09 | Arbejdskø | Nye indberetninger åbner flytbar detaljedialog; under vurdering åbner genbrugt sagsmappe; mobil stabil. | WorkQueue, case components | åben | Drag-grænser, fokus, mobil og permissions | Ingen |
| FL-10 | Sagsmappe | Godkendt samlet design uden fanebjælke, kompakt enhedsrække, foldesektioner og tilstands-/permissionstyret næste handling. | CaseFolder og CSS | åben | Sagsflow, billeder/dokumenter/historik, afslutningsgate | Autoritative statusser og fakturaafklaring bevares |
| FL-11 | Kompakt kø | Permanent Flyt sag fjernes; statusændring bevares i sagsmappe/diskret menu; kolonner ruller. | WorkQueue og CSS | implementeret lokalt | Kolonne-/statusregression | Tabelvisning og sagsmappe bevarer lovlige statushandlinger; workflowstadier er uændrede |
| FL-12 | Leverandører | Værksteder læses fra fælles leverandørregister; autoriseret oprettelse bevarer sagskladde. | FLEET vendor adapter, fælles leverandører | åben | Opret/vælg og afvist rolle | Ekstern portal må ikke få intern adgang |
| FL-13 | Service | Dateret seneste service/måler, kalender/km/timer, varsler, faste hændelser og forklarlig næste grænse. | Service domain/UI | implementeret som lokal prototype | 24/24 Service-domæne-/komponenttests | Den først nåede dato- eller målergrænse udløser behovet; tallet `500` er målerinterval i den viste enheds km eller driftstimer |
| FL-14 | Serviceautomatik | Én indberetning pr. krav/cyklus, idempotens/samtidighed, manglende grundlag, gennemførsel og ændring/deaktivering. | Service automation, Functions/Rules | lokalt implementeret; serverdel blokeret | ServiceAutomation dækker gentagelse, samtidige fanekald, manglende grundlag, deaktivering og ny cyklus | Den aktuelle kontrol kører kun ved appstart/hvert minut i browseren; varig serverstyret scheduler og emulatorbevis mangler |
| FL-15 | Kategorier | Kundestyret opret/redigér/sortér/deaktivér med historiske referencer og eksplicit rapportmapping. | Opsætning, category repository/adapter | åben | Permission, historik og mobil/desktop | Én autoritativ kategori pr. formål |
| FL-16 | OBD-statistik | Kun faktiske målinger vises/filtreres/eksporteres; kilde/periode/enhed mærkes; manglende forbindelse er tydelig. | FLEET statistik | åben | Datafeltinventar og syntetisk UI-test | Ekstern OBD er ikke del af opgaven |
| FL-17 | Økonomi | Per enhed/samlet, periode/kategori, faste/enkeltstående poster, kr./km, historik og sporbarhed uden dobbeltoptælling. | FLEET economy domain/UI | åben | Beregnings-/drilldowntests | Estimat, kontrolleret og bogført holdes adskilt |
| FL-18 | Eksport | Dansk CSV/Excel-visning uden mojibake og med entydige beløbs-/momskolonner. | FLEET economy export | delvist implementeret lokalt | Domænetest af dansk indhold og UTF-8-rundtur | Download har nu UTF-8 BOM; manuel åbning i dansk Excel og udvidede momskolonner udestår |
| REG-01 | Sikkerhed | Tilladt/afvist rolle, tenant, revision, samtidighed, idempotens og ingen demo-fallback. | Rules, Functions og modultests | åben | Isolerede emulatorer med proceslokal JDK 21 | Svæk ikke regler |
| REG-02 | Samlet regression | WORKFORCE–PLANNING, UNIT–WAREHOUSE og Support–Ejerforbindelser bevares. | Hele integrationen | åben | Kontrakt-, browser- og sikkerhedsgate | Ingen |
| REG-03 | Visuel gate | 1440×900, 1920×1080, 390×844, 360×800; normal/kompakt menu og flere arbejdszoomniveauer. | Berørte brugerflader | åben | Nummererede før/efter-billeder og mål | Ingen |

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
