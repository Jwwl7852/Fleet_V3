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
| UX-01 | Zoom | Første besøg 100 %, genindlæs af bruger-/kontekst-/skærmafgrænset valg og fungerende nulstilling. | `src/fleet/useVisningsvalg.js`, `src/fleet/AppShell.jsx` | i gang | Enhedstest samt browser ved flere zoomniveauer | Ingen |
| UX-02 | Sidebar | Menu/topbjælke påvirkes ikke af arbejdsområdezoom; menutekst flytter sig ikke ved scrollbar. | `src/fleet/fleet.css` | åben | Før/efter ved åbne/lukkede grupper, 1440 og 1920 px | Ingen |
| UX-03 | Navigation | Hele moduloverskriften folder uden samtidig navigation; underpunkter navigerer. | `src/fleet/AppShell.jsx` | åben | Mus, Enter/Space, direkte URL og frem/tilbage | Ingen |
| UX-04 | Kompakt menu | Flyout bevares fra ikon til menu, ligger over indhold, håndterer kanter/lange lister, ESC/udenfor, mus/tastatur/touch. | `src/fleet/AppShell.jsx`, `src/fleet/fleet.css` | åben | Browserbevis normal/kompakt og mobil | Ingen |
| UX-05 | Foldeknap | Variant B, afrundet flig ca. 30×34 med mindst 44×44 klikmål, tokens og korrekt chevron/aria. | `src/fleet/AppShell.jsx`, `src/fleet/fleet.css` | åben | Fokus, tooltip og beregnede mål | Ingen |
| UX-06 | Navigation | Meningsfuld tilbagefunktion med bevaret visningstilstand; direkte åbning har fallback. | Fælles route-/visningskomponenter | åben | Browser frem/tilbage, reload og direkte URL | Skærmspecifik tilpasning |
| UX-07 | Dialog | ESC, X, Annuller, ugemte data, fokusretur, bekræft Gem/Slet og fejlbevaring. | Fælles og berørte moduldialoger | åben | Tastatur- og fejlforløb | Domæner må fortsat bruge arkivering, hvor hard delete er forbudt |
| FC-01 | Navigation | Synligt forløb er Indbakke, betinget Ekstra kontrol og Arkiv; gamle dybe links mappes uden historiktab. | `src/fleet/fakturacenter-intake.js`, `src/moduler/oekonomi/Fakturacenter.jsx`, `src/fleet/nav.js` | åben | Kontrakt-/route-tests og browser | Bevar interne domænestatusser |
| FC-02 | Kontrol | Succes fjerner posten fra arbejdsliste, bliver i Indbakke og vælger næste; fejl bevarer posten. | Fakturacenter UI/domæne | åben | Enkeltkontrol med/uden næste post | Ingen |
| FC-03 | Ekstra kontrol | Tilstande ingen/alle/over beløbsgrænse ekskl. moms; anden person; kundestyret allowlist; serveraudit. | Opsætning, fælles kontrakt, Functions/Rules | åben | Rolle-, revision-, tenant- og auditprøver i emulator | Roller/personer udpeges af kunden; eksisterende beskyttelse må ikke svækkes |
| FC-04 | Massekontrol | Checkbox, synligt omfang, én bekræftelse, adgang/revision/gates pr. faktura, delsvar og idempotent genforsøg. | Fakturacenter UI/domæne | åben | Blandede syntetiske resultater og afvisninger | Ingen |
| FC-05 | Filtre | Matchkategori bevares; standard nyeste først erstattes som kontrol af modul inkl. uafklaret/flere fordelinger. | Fakturacenter UI | åben | Filter- og sorteringstest | Ingen |
| FC-06 | Upload | Filnavn, modtaget/behandler/fejlet, tydelig fremdrift, dubletværn og idempotent genforsøg; demo mærkes. | Fakturacenter intake/UI | åben | Upload- og fejlforløb | Permanent lagring må kun oplyses efter datakildekvittering |
| FC-07 | Layout | Kompakt top og tre selvscrollende, justerbare, huskede paneler; demospecifik tekst fjernes fra normal struktur. | Fakturacenter workspace/CSS | åben | Bredder, scroll og mobile visninger | Ingen |
| FC-08 | Opsætning | Mail og forbindelser flyttes ud af arbejdsnavigationen til fælles Opsætning uden at aktivere transport. | Nav, routes, opsætning | åben | Permission- og route-test | Ekstern mail forbliver deaktiveret |
| FL-01 | Overblik | KPI-kort og handlingsposter/Se alle åbner relevante filtre; optællinger og udsnit forklares. | `fleet-v2/src/components/Overview.jsx` og afledninger | åben | Klik, tastatur og talparitet | Ingen |
| FL-02 | Drift | Dag/uge/måned/kvartal/år ændrer registreret datagrundlag og akser. | FLEET overblik/domæne | åben | Periodeprøver mod syntetisk registreret historik | Ingen opfundet fortid |
| FL-03 | Omkostning/nedetid | Måneder virker; datadækning, nul/mangler, sidste år og sammensmeltede tidsintervaller håndteres. | FLEET overblik/økonomidomæne | åben | Beregningstests og UI | Sammenligning kun når data findes |
| FL-04 | Livekort | Kort-wheel og +/−, ingen dobbeltzoom, popup pr. enhed, cluster/samme position kan vælges, tydelig kilde/friskhed. | FLEET LiveMap/GeoMap | åben | Mus, tastatur, popup/fokus og marker-klynger | Ingen ekstern OBD aktiveres |
| FL-05 | Enhedsregister | Moderne FLEET-kartotek bliver primær skærm i Opsætning med autoritativ mapping og gamle dybe links. | Root-routes/nav, FLEET repository/adapters | åben | Route-, permission- og referenceprøver med PLANNING | UNIT/WAREHOUSE-unit er et særskilt domæneobjekt |
| FL-06 | Enhedsformular | Typefaner fjernes; typefilter bevares; indvendige mål, fire udstyrsvalg og energikilde med ukendt/ikke relevant. | UnitCatalog, UnitFormDialog, datamodel | åben | Opret/redigér/profil uden datatab | Trækkrog og hængertræk er separate |
| FL-07 | Indberetninger | Stabil trepanelstruktur, fuld bredde, justering/hukommelse/scroll og semantiske statustokens. | ReportTriage og CSS | åben | Før/efter valg/reload; mus/tastatur | Ingen |
| FL-08 | Manuel sag | Læsbar dialog med enhed, beskrivelse, prioritet, validering, lukning og inputbevaring ved fejl. | ManualCaseDialog | åben | Opret + fejlforløb desktop/mobil | Ingen |
| FL-09 | Arbejdskø | Nye indberetninger åbner flytbar detaljedialog; under vurdering åbner genbrugt sagsmappe; mobil stabil. | WorkQueue, case components | åben | Drag-grænser, fokus, mobil og permissions | Ingen |
| FL-10 | Sagsmappe | Godkendt samlet design uden fanebjælke, kompakt enhedsrække, foldesektioner og tilstands-/permissionstyret næste handling. | CaseFolder og CSS | åben | Sagsflow, billeder/dokumenter/historik, afslutningsgate | Autoritative statusser og fakturaafklaring bevares |
| FL-11 | Kompakt kø | Permanent Flyt sag fjernes; statusændring bevares i sagsmappe/diskret menu; kolonner ruller. | WorkQueue og CSS | åben | Kolonne-/statusregression | Workflowstadier omdefineres ikke |
| FL-12 | Leverandører | Værksteder læses fra fælles leverandørregister; autoriseret oprettelse bevarer sagskladde. | FLEET vendor adapter, fælles leverandører | åben | Opret/vælg og afvist rolle | Ekstern portal må ikke få intern adgang |
| FL-13 | Service | Dateret seneste service/måler, kalender/km/timer, varsler, faste hændelser og forklarlig næste grænse. | Service domain/UI | åben | Domæne- og browserprøver | Kombinationsregel skal følge eksisterende domæne; ellers dokumenteres beslutningsbehov |
| FL-14 | Serviceautomatik | Én indberetning pr. krav/cyklus, idempotens/samtidighed, manglende grundlag, gennemførsel og ændring/deaktivering. | Service automation, Functions/Rules | åben | Scheduler-/emulatorprøve | Varig automatik skal være serverstyret |
| FL-15 | Kategorier | Kundestyret opret/redigér/sortér/deaktivér med historiske referencer og eksplicit rapportmapping. | Opsætning, category repository/adapter | åben | Permission, historik og mobil/desktop | Én autoritativ kategori pr. formål |
| FL-16 | OBD-statistik | Kun faktiske målinger vises/filtreres/eksporteres; kilde/periode/enhed mærkes; manglende forbindelse er tydelig. | FLEET statistik | åben | Datafeltinventar og syntetisk UI-test | Ekstern OBD er ikke del af opgaven |
| FL-17 | Økonomi | Per enhed/samlet, periode/kategori, faste/enkeltstående poster, kr./km, historik og sporbarhed uden dobbeltoptælling. | FLEET economy domain/UI | åben | Beregnings-/drilldowntests | Estimat, kontrolleret og bogført holdes adskilt |
| FL-18 | Eksport | Dansk CSV/Excel-visning uden mojibake og med entydige beløbs-/momskolonner. | FLEET economy export | åben | Åbning i relevant dansk Excel-forløb | Ingen |
| REG-01 | Sikkerhed | Tilladt/afvist rolle, tenant, revision, samtidighed, idempotens og ingen demo-fallback. | Rules, Functions og modultests | åben | Isolerede emulatorer med proceslokal JDK 21 | Svæk ikke regler |
| REG-02 | Samlet regression | WORKFORCE–PLANNING, UNIT–WAREHOUSE og Support–Ejerforbindelser bevares. | Hele integrationen | åben | Kontrakt-, browser- og sikkerhedsgate | Ingen |
| REG-03 | Visuel gate | 1440×900, 1920×1080, 390×844, 360×800; normal/kompakt menu og flere arbejdszoomniveauer. | Berørte brugerflader | åben | Nummererede før/efter-billeder og mål | Ingen |

## Baseline

- Root `npm run lint`: bestået på start-HEAD.
- Root build og direkte Node-testkørsel blev ved første forsøg blokeret af
  køremiljøets `spawn EPERM`; dette er en miljøblokering og genprøves i en
  proceskontekst, hvor Vite/esbuild og Node-testarbejdere må starte.
- Word-dokumentets 22 billeder er visuelt gennemgået. De viser blandt andet
  flyout-overlap, menutekst der skifter linje, Fakturacenterets lange demo-top,
  FLEETs indsnævrede triage, den ulæselige manuelle sag, den godkendte
  sagsmappereference, serviceformularens uklare `500`-felt og CSV-mojibake.

## Afleveringslog

Udfyldes efter hver etape med commit, testgrundlag og billedbevis.
