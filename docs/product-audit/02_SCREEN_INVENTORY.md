# 02 — Skærmoversigt

Dette dokument er en komplet oversigt over samtlige 62 brugervendte skærme/ruter i FleetControl v3, samlet fra de 11 module-dossierer (`docs/product-audit/_dossiers/01–11`). Hver skærm er listet med alle 14 felter fra dossierernes "Skærme"-sektioner: route, sidenavn, hvem bruger den, primært formål, primær handling, sekundære handlinger, data vist, data der kan ændres, kommer typisk fra, går typisk til, overlap med anden side, status, demo-data, og om skærmen er nødvendig for daglig drift eller admin/opsætning. Status-labels (BUILT/PARTIAL/MOCK/DEMO/PLANNED/NOT_BUILT) er bevaret uændret fra dossiererne — der er ikke føjet noget til eller taget noget fra.

**Total: 62 skærme**, fordelt på 11 moduler:

1. Dashboard & Økonomi — 4 skærme
2. Planning / Booking — 6 skærme
3. Workforce / Bemanding — 4 skærme
4. Fleet — 4 skærme
5. Facility — 4 skærme (heraf 1 dialog uden egen route)
6. Procure / Indkøb — 7 skærme
7. Unitbooking — 5 skærme
8. Warehouse — 11 skærme
9. Kunder & Priser + Opsætning — 6 skærme
10. Support & Ejerkonsol — 5 skærme
11. Chaufførapp & Login — 6 skærme

Efter modulgennemgangen følger tre tværgående afsnit: gentaget information, gentagne handlinger, og administrative funktioner blandt daglige arbejdsfunktioner (og omvendt).

---

## 1. Dashboard & Økonomi

Ét operativt overbliksbillede bygget af et tværmodulært KPI-aggregat, plus to fakturaflows (indgående i Fakturacenter, udgående i Fakturering). Kildedossier: `01-dashboard-oekonomi.md`.

### 1.1 Dashboard — `/`
- **sidenavn:** Dashboard
- **hvem bruger den:** Alle roller — eneste altid-synlige modul.
- **primært formål:** Operativt + økonomisk overblik på tværs af moduler.
- **primær handling:** Vælge dashboard (Samlet, Fleet, Facility, Procure, Warehouse, Unitbooking, Workforce) via `?db=`.
- **sekundære handlinger:** "Tilpas forside" — redigér eget widget-layout (tilføj/fjern/flyt, "Nulstil", "Gem layout", "Annullér").
- **data vist:** KPI-rækker (åbne opgaver, nedetid, driftsomkostninger, omkostning pr. km, planlagt/akut vedligehold, ikke-faktureret), "Prioriterede handlinger", statusfordelings-donut, omkostningsgraf (6 mdr.), "Største afvigelser", ét modulkort pr. modul, tabel over åbne opgaver.
- **data der kan ændres:** Kun brugerens eget widget-layout (`brugerlayout/<uid>/<dashboard>`).
- **kommer typisk fra:** `kpi/current/<domæne>` (aggregeret af server/job), brugerlayout og dashboardvisning via `usePost`.
- **går typisk til:** `/booking`, `/oekonomi`, hvert modulkorts egen sti.
- **overlap med anden side:** "Største afvigelser" = samme felt som Økonomi (bevidst). "Åbne opgaver"-tabellen viser altid hardkodet demo-data uafhængigt af backend.
- **status:** PARTIAL. Layout (læs/skriv) er BUILT. De fleste viste økonomital er null i produktion. "Åbne opgaver der kræver opfølgning" er permanent MOCK.
- **demo-data:** JA for opgavetabellen (permanent, ikke kun offline-fallback). KPI-kort bruger demo-kpi kun uden Firebase.
- **nødvendig for:** Daglig drift (forside).

### 1.2 Økonomi & Rapporter — `/oekonomi`
- **sidenavn:** Økonomi & Rapporter
- **hvem bruger den:** Roller med `grundlag.laes`/`indkoeb.laes` (KPI-tallene er gatede via `KPI_PERM`, selve menupunktet ikke).
- **primært formål:** Rapportering af driftsøkonomi: omkostninger vs. budget, dækningsgrad, afvigelser, omkostning pr. enhed, faktureringsklare opgaver.
- **primær handling:** Vælge rapporttype (Samlet drift/Værksted/Brændstof/Dæk/Forsikring/Øvrige).
- **sekundære handlinger:** "Eksportér rapport" — permanent deaktiveret ("Eksport er ikke bygget endnu").
- **data vist:** KPI-kort (driftsomkostninger, ikke-faktureret, budgetafvigelse, dækningsgrad), grafer (12 mdr.), "Største afvigelser", nøgletalstabel pr. kategori, omkostning pr. km/driftstime/opgave, "Opgaver klar til fakturering" (top 5, demo).
- **data der kan ændres:** Intet — ren rapportside.
- **kommer typisk fra:** `kpi/current/oekonomi`, `demo-oekonomi.js` for kategori-nedbrydning.
- **går typisk til:** `/oekonomi/fakturering`, `/booking/opsaetning`, `/opsaetning/kunder`, Dashboard.
- **overlap med anden side:** Samme `k.afvigelser`-felt som Dashboard. "Opgaver klar til fakturering" overlapper begrebsmæssigt med Fakturering-skærmen.
- **status:** PARTIAL/MOCK-hybrid. Kategori-nedbrydning og faktureringsklar-liste kommer permanent fra demo-data; totalrækken bruger ægte men delvist null KPI-felter.
- **demo-data:** JA, permanent for kategori-tabel, dækningsgrad-historik og faktureringsklar-liste.
- **nødvendig for:** Daglig drift (rapportering) for kunder med Økonomi-modulet.

### 1.3 Fakturacenter — `/oekonomi/fakturacenter`
- **sidenavn:** Fakturacenter
- **hvem bruger den:** Brugere med `indkoeb.laes`/`indkoeb.skriv`/`PERM_GODKEND`.
- **primært formål:** Fælles sted til at placere, godkende og bogføre indgående fakturaer på tværs af Fleet, Facility og Procure.
- **primær handling:** Vælge faktura → vælge foreslået destination → "Godkend match".
- **sekundære handlinger:** "Ingen destination" (kræver begrundelse); "Godkend faktura" (betalingsgodkendelse); "Bogfør/eksportér".
- **data vist:** KPI-kort (nye/manglende match/afventer godkendelse/godkendt), fakturaliste med foreslået destination + matchscore, detaljepanel.
- **data der kan ændres:** `fakturaer/<id>.destinationArt/destinationId`, `.status`.
- **kommer typisk fra:** `fakturaer` (delt node), `leverandoerer`, `indkoebsordrer`, `opgaver`, `forbrugsvarer`, `koeretoejer`, `facility/aktiver`.
- **går typisk til:** Henvisning til "Procure → Fakturaer" (samme data).
- **overlap med anden side:** Fuldstændigt overlap i datakilde med Procure → Fakturaer (`/indkoeb/fakturaer`) — samme `fakturaer/`-node, bevidst delt.
- **status:** BUILT for match/godkendelse/bogføring. MOCK/NOT_BUILT for indgangskanaler ("Ingen af indgangene er bygget endnu") — kun kilden `registreret` er reel.
- **demo-data:** JA som ren offline/`demo:`-fallback for alle seks lister.
- **nødvendig for:** Daglig drift, for kunder med Procure-modulet.

### 1.4 Fakturering — `/oekonomi/fakturering`
- **sidenavn:** Fakturering
- **hvem bruger den:** Brugere med `grundlag.laes`/`grundlag.godkend`.
- **primært formål:** Godkende, låse og eksportere fakturagrundlag.
- **primær handling:** Vælge grundlag → "Godkend" → skriv eksportreference → "Lås mod reference".
- **sekundære handlinger:** "Hent CSV"/"Hent Neutral (JSON)".
- **data vist:** KPI-kort (kladder, spærret af åbne etaper, mangler momssats), grundlagsliste, detaljepanel med linjetabel og historik.
- **data der kan ændres:** Grundlagets tilstand (kladde→godkendt→låst) og `eksportReference`. Ingen "opret"-handling findes på skærmen.
- **kommer typisk fra:** `grundlag` (`.write: false` for alle), `etaper`, `kunder`.
- **går typisk til:** Downloadet fil (CSV/JSON) — intet link videre i appen.
- **overlap med anden side:** Ingen direkte; komplementær til Fakturacenter.
- **status:** BUILT for godkend/lås/eksport. Ingen UI-vej til at oprette et forløbsbaseret (booking-tur) grundlag fundet — kun Warehouses Afregning kalder reelt `opretGrundlag()`.
- **demo-data:** JA som ren offline/`demo:`-fallback.
- **nødvendig for:** Daglig drift, for kunder med Økonomi-modulet.

---

## 2. Planning / Booking

Fra transportforespørgsel til udført arbejde, med håndhævet fire-øjne-kontrol mellem forslag og godkendelse. Kildedossier: `02-planning-booking.md`.

### 2.1 Oversigt ("Alle opgaver") — `/booking`
- **hvem bruger den:** Alle med `booking.laes`; primært disponent/koordinator/casehandler.
- **primært formål:** Arbejdsliste — hvad kræver handling i dag.
- **primær handling:** Filtrere (enhed/status), skifte faner "Opgaver"/"Bookinger", klikke videre til en booking.
- **sekundære handlinger:** "Vis N afsluttede"; inline etapeskifte-knapper i "Hvad du må lige nu".
- **data vist:** KPI (nye bookinger, i gang i dag, forsinkede, ikke-faktureret), opgave-/booking-tabel, "Kræver handling", dagens plan, stopoversigt.
- **data der kan ændres:** Etapetilstand via ikke-forslagsbærende overgange (`skiftEtape()` → `etapeskift`).
- **kommer typisk fra:** Ny forespørgsel, Disponering, Forslag.
- **går typisk til:** `/booking/forslag/:id`, `/booking/disponering`, `/oekonomi/fakturering`, `/indkoeb`.
- **overlap med anden side:** Samme KPI-kilder som Dashboard; faktureringstal deles med Økonomi.
- **status:** BUILT.
- **demo-data:** JA, kun som fallback.
- **nødvendig for:** Daglig drift.

### 2.2 Ny forespørgsel — `/booking/ny`
- **hvem bruger den:** Casehandler (kræver `booking.opret`); også koordinator og admin.
- **primært formål:** Oprette ny transportforespørgsel som kladde.
- **primær handling:** "Opret forespørgsel" → `opretBooking()` → Cloud Function `bookingopret`.
- **sekundære handlinger:** Ingen — at sende kladden videre til planlægning er bevidst et separat trin.
- **data vist:** Kundevælger, transporttype, rutepræference, afhentning/levering, omsætning, udstyrs-/kundekrav.
- **data der kan ændres:** Opretter en helt ny booking+etape.
- **kommer typisk fra:** KPI-kortet "Nye bookinger".
- **går typisk til:** Oversigt.
- **overlap med anden side:** Ingen væsentligt.
- **status:** BUILT.
- **demo-data:** JA, kun for kundelisten.
- **nødvendig for:** Daglig drift.

### 2.3 Forslag & reservation — `/booking/forslag/:id` (skjult i sidebar)
- **hvem bruger den:** Disponent (laver forslag), koordinator (`booking.godkend` — godkender/returnerer/afviser).
- **primært formål:** Koordinatoren tager stilling til 1–3 forslag og godkender ét.
- **primær handling:** Vælg forslag → "Godkend valgt forslag" → `etapeskift`.
- **sekundære handlinger:** "Returnér til disponent", "Afvis alle" (kræver begrundelse).
- **data vist:** Booking-header, etapevælger, forslagstabel, de fem disponeringstjek.
- **data der kan ændres:** Etapetilstand + reservationer + bookingens afledte tilstand.
- **kommer typisk fra:** Oversigt, Disponerings detaljepanel.
- **går typisk til:** Oversigt/Disponering.
- **overlap med anden side:** Disponering viser samme etaper og kalder samme `tjekDisponering()` — bevidst delt.
- **status:** BUILT.
- **demo-data:** JA, kun fallback for booking-opslaget.
- **nødvendig for:** Daglig drift (fire-øjne-godkendelse).

### 2.4 Disponering — `/booking/disponering`
- **hvem bruger den:** Disponent (`opgaver.skriv`/`booking.foreslaa`).
- **primært formål:** Dag (`opgaver`, art vaerksted) og uge (`etaper`, langture) i to gitre.
- **primær handling:** Dag — klik ledigt felt åbner Planlaegdialog; uge — "Foreslå tur" åbner Forslagsdialog.
- **sekundære handlinger:** `Statusskifte`; "Træk tilbage" på aktivt forslag; link til Forslag.
- **data vist:** KPI, to gitre, konflikter/advarsler, "Uplanlagt", detaljepanel.
- **data der kan ændres:** Værkstedsopgaver (opret/flyt/status) og etape-forslag (opret/træk). Ugesgitteret flytter IKKE etaper.
- **kommer typisk fra:** Oversigt, Dashboard.
- **går typisk til:** `/booking/forslag/:id`, `/booking/opsaetning`.
- **overlap med anden side:** Dagsgitteret deler node/skrivefunktioner/komponenter med Flådens Driftskalender og Facilitys Servicekalender — kun `art`-feltet adskiller dem.
- **status:** BUILT for dagsgitteret. Ugesgitteret bevidst view-only. Ingen ruteoptimering.
- **demo-data:** JA, kun fallback.
- **nødvendig for:** Daglig drift.

### 2.5 Rute & status ("Live-kort") — `/booking/live-kort`
- **hvem bruger den:** Disponent/koordinator/casehandler.
- **primært formål:** Vise planlagt rute og chaufførens meldinger — ingen GPS/sporing.
- **primær handling:** Vælge en tur → tidslinje med rute og meldingshistorik.
- **sekundære handlinger:** Ingen — ren visning.
- **data vist:** KPI (undervejs, ikke meldt, forsinket, "Positioner" = "—"), turliste, tidslinje.
- **data der kan ændres:** Intet.
- **kommer typisk fra:** Oversigt/Disponering, gammelt `/tracking`.
- **går typisk til:** `/booking/disponering`.
- **overlap med anden side:** Ingen i dag.
- **status:** BUILT som ren visning.
- **demo-data:** JA, kun fallback.
- **nødvendig for:** Daglig drift/opfølgning.

### 2.6 Bookingopsætning — `/booking/opsaetning`
- **hvem bruger den:** Koordinator/admin (kræver `satser.laes`).
- **primært formål:** Vedligeholde omkostningssatser (bil-km, færge/bro, agent-parkering) og eksempelberegning.
- **primær handling:** Skifte mellem fem faner.
- **sekundære handlinger:** "Tilføj sats"/"Tilføj agent"/"Redigér sats"/"Gem ændringer" — **skriver ikke**, kun lokal state.
- **data vist:** Satsark fra `omkostninger`, eksempelberegning.
- **data der kan ændres:** Reelt ingenting. Fanerne "Generelt"/"Prisregler" er ikke tegnet.
- **kommer typisk fra:** Disponerings detaljepanel.
- **går typisk til:** Intet videre.
- **overlap med anden side:** Kunder & Priser (bevidst adskilt — driftsomkostning vs. salgspris).
- **status:** PARTIAL — læsning/beregning BUILT, satsvedligehold har ingen skrivevej.
- **demo-data:** JA, kun fallback.
- **nødvendig for:** Admin/opsætning.

---

## 3. Workforce / Bemanding

Overblik over bemanding, medarbejderstamdata, kompetence-/certifikatgyldighed og ferie/fravær. Kildedossier: `03-workforce-bemanding.md`.

### 3.1 Bemanding — `/bemanding`
- **sidenavn:** "Workforce" (nav-label "Bemandingsplan")
- **hvem bruger den:** Disponent/koordinator.
- **primært formål:** Ugeoverblik over planlagt vs. disponeret bemanding pr. funktion, kompetenceudløb, "åbne vagter".
- **primær handling:** Ingen skrivehandling — ren visning.
- **sekundære handlinger:** Link til Kompetencer/Fravær; "Tildel" på åbne vagter — permanent deaktiveret ("Kræver en vagtnode i datamodellen").
- **data vist:** KPI-kort (fra `useKpi()`), ugetabel bygget af demo-data, "Kapacitet pr. funktion", kompetenceliste (rigtige noder).
- **data der kan ændres:** Intet.
- **kommer typisk fra:** Sidebar/dashboard-link (er selv landingsskærm).
- **går typisk til:** `/bemanding/kompetencer`, `/bemanding/fravaer`, `/opsaetning/medarbejdere`.
- **overlap med anden side:** Dashboard viser samme tre tal (kapacitetsgrad, disponeret/planlagt, chauffør-tal) — nu fælles kilde efter tidligere uenighed (84% vs 83%).
- **status:** MOCK/DEMO for selve bemandingsplanen (ingen vagtnode findes). KPI-kort og kompetenceliste er BUILT.
- **demo-data:** JA, og IKKE kun som fallback — ugeplanen er strukturelt permanent demo-data.
- **nødvendig for:** Tiltænkt daglig drift, men reelt ubrugelig til drift.

### 3.2 Kompetencer — `/bemanding/kompetencer`
- **sidenavn:** "Kompetencer & certifikater"
- **hvem bruger den:** Disponent, koordinator, admin.
- **primært formål:** Vise udløbne/snart udløbende kompetencer, skelne blokerer vs. advarer.
- **primær handling:** Vælge medarbejder for detaljer.
- **sekundære handlinger:** "Overrul med begrundelse" — permanent deaktiveret.
- **data vist:** Medarbejderliste med gyldighedstilstand; detaljepanel; "Udløber eller er udløbet"-arbejdsliste.
- **data der kan ændres:** Intet.
- **kommer typisk fra:** Bemanding- og Medarbejdere-skærmens links.
- **går typisk til:** Ingen udgående navigation ud over tilbage.
- **overlap med anden side:** Samme `tjekKompetencer()`/`serviceTone()`-tærskler som Disponering/Flåde/Facility.
- **status:** BUILT for læsning. Override-handlingen har ingen skrivevej.
- **demo-data:** Kun som fallback.
- **nødvendig for:** Daglig drift-relevant (disponeringsstøtte); reel håndhævelse ligger i Cloud Function.

### 3.3 Ferie & fravær — `/bemanding/fravaer`
- **sidenavn:** "Ferie & fravær"
- **hvem bruger den:** Disponent/koordinator/kontor; kun admin (standard) ser årsag (`fravaerSensitiveLaes`).
- **primært formål:** Vise fravær pr. medarbejder og forhindre disponering af en fraværende.
- **primær handling:** Vælge medarbejder for periode og den reservation fraværet ville skrive.
- **sekundære handlinger:** "Registrér fravær" — permanent deaktiveret; "Vis årsag" (gated, reel); søgning/funktionsfilter.
- **data vist:** Fraværsperioder, hængelåst "Årsag"-kolonne for alle rækker.
- **data der kan ændres:** Intet fra denne skærm (skrivning sker fra chauffør-appens Frihed.jsx).
- **kommer typisk fra:** Bemanding-skærmens link.
- **går typisk til:** `/opsaetning/medarbejdere`.
- **overlap med anden side:** Reservationen der "ville blive skrevet" bruger samme kilde/prioritet som den rigtige fraværsreservation.
- **status:** PARTIAL. Læsning BUILT. Kontorside-oprettelse ikke bygget fra denne skærm, men fraværspost kan skrives fra chauffør-appen. Reservations-skrivning ved godkendelse ikke bygget.
- **demo-data:** Kun som fallback.
- **nødvendig for:** Daglig drift, men uden oprettelses-/godkendelsesknapper kun et udstillingsvindue.

### 3.4 Medarbejdere — `/opsaetning/medarbejdere`
- **sidenavn:** "Medarbejdere" (menu-placeret under Opsætning, `kraeverModul: "bemanding"`)
- **hvem bruger den:** Admin (kun admin har `personale.skriv`).
- **primært formål:** Medarbejderkartotek — stamdata-oprettelse, adskilt fra login-oprettelse.
- **primær handling:** "Ny medarbejder" — GEMMER reelt (`gem()` mod `personale/<id>`).
- **sekundære handlinger:** "Redigér" og "Registrér fratrædelse" — begge PERMANENT deaktiverede.
- **data vist:** Navn, funktion(er), status, ansættelsesform, kontakt, stationering, login-status, kan-disponeres-status, egne kompetencer.
- **data der kan ændres:** Kun ved oprettelse (navn, status, ansættelsesform, funktion(er), stationering, kontakt, ansættelses-/fratrædelsesdato). `division`, `cpr`, `privatAdresse` forbudte.
- **kommer typisk fra:** Opsætnings-menuen; linket fra Bemanding/Fravær.
- **går typisk til:** `/bemanding`, `/bemanding/kompetencer`.
- **overlap med anden side:** Opsætning → Brugere & roller (login-oprettelse) — se admin-afsnittet nedenfor.
- **status:** PARTIAL. Oprettelse BUILT. Redigering/fratrædelse ikke bygget.
- **demo-data:** Kun som fallback.
- **nødvendig for:** Admin/opsætning — engangsindtastning, ikke løbende vedligehold.

---

## 4. Fleet

Ejer flådens stamdata og daglige drift: værksteds-/serviceopgaver, indberetninger, disponeringsgrundlag. Kildedossier: `04-fleet.md`.

### 4.1 Enheder — `/opsaetning/enheder`
- **sidenavn:** "Enheder" (internt "Flådeoversigt")
- **hvem bruger den:** Admin/den der vedligeholder stamdata.
- **primært formål:** Stamdataregister for flådens enheder, art-styret feltskema.
- **primær handling:** Oprette/redigere en enhed.
- **sekundære handlinger:** Søgning/filtrering; se disponeringsstatus, kompetencekrav, seneste indberetninger, de tre dyreste enheder pr. km.
- **data vist:** `koeretoejer`-node, aggregerede KPI'er, afledte tal (åbne fejl, nedetid).
- **data der kan ændres:** Enhedens fulde stamdata. Skrivevejen er reel (`gem()` mod RTDB), selvom filens egen kommentar (uafklaret/stale) hævder skrivning ikke er bygget.
- **kommer typisk fra:** Opsætning-menuen; Driftskalenderens "Enhed"-opslag.
- **går typisk til:** Disponering, Indberetninger, Økonomi.
- **overlap med anden side:** Driftskalenderen viser også enheder (kun udsnit med aktivitet).
- **status:** BUILT (klientside skrivevej reel), med uafklaret forbehold om regelfilens faktiske svar (ikke efterprøvet).
- **demo-data:** JA — `DEMO_KOERETOEJER` (fallback) og `DEMO_BESOEG` (bruges direkte, ikke fallback, for nedetidsberegning).
- **nødvendig for:** Admin/opsætning (stamdata), ikke daglig drift.

### 4.2 Driftskalender — `/flaade`
- **sidenavn:** "Driftskalender" (filnavn historisk "Værkstedskalender")
- **hvem bruger den:** Disponent/koordinator, dagligt.
- **primært formål:** Overblik og planlægning af flådens driftsopgaver (værkstedsbesøg).
- **primær handling:** "Planlæg aktivitet" (→ `opgaveplanlaeg`); trække blok for at flytte (→ `opgaveflyt`).
- **sekundære handlinger:** Statusskifte (→ `opgavestatus`), hændelsespanel, kommunikation/filer-faner (fase 0/attrap), "Åbn i nyt vindue".
- **data vist:** `opgaver` (art vaerksted), `indberetninger`, `koeretoejer`, `leverandoerer`, fem afledte tal.
- **data der kan ændres:** Driftsopgaver (reelt via Cloud Functions). Modulfakturaer (kontekst-registrering).
- **kommer typisk fra:** Hovedmenuen.
- **går typisk til:** Arbejdskø, Indberetninger, Indkøb → Fakturaer.
- **overlap med anden side:** Samme gitterkomponent som Facility → Servicekalender og Disponering; samme `opgaver`-node som Facility, filtreret på art.
- **status:** PARTIAL/BUILT for kerneflowet (oprettelse/flytning/statusskift ægte). Mail/sag-faner MOCK/DEMO (fase 0).
- **demo-data:** JA som fallback for alle fire hovednoder, plus `demoSagerFor("flaade")` altid for sagspanelet.
- **nødvendig for:** Daglig drift.

### 4.3 Indberetninger — `/flaade/indberetninger`
- **sidenavn:** "Indberetninger"
- **hvem bruger den:** Værkfører/disponent.
- **primært formål:** Se og vurdere indberetninger fra chaufførappen.
- **primær handling:** "Afslut" en indberetning — deaktiveret ("Fase 0: skrives ikke fra klienten endnu").
- **sekundære handlinger:** Se sensitive felter (gated), tidsregistrering, materialeforbrug, brændstofforbrug.
- **data vist:** `indberetninger` (ægte, ingen demo-fallback), `sensitive/indberetninger` (gated), `koeretoejer`.
- **data der kan ændres:** Intet — ingen skriveknap virker.
- **kommer typisk fra:** Driftskalenderens link, hovedmenuen.
- **går typisk til:** Ingen videre handling.
- **overlap med anden side:** "Åbne fejl pr. bil" vises også i Enheder-tabellen.
- **status:** MOCK/DEMO for skrivning, BUILT for læsning. "APPEN ER IKKE BYGGET — FELTERNE ER."
- **demo-data:** Delvist — hovedlisten ægte, brændstofberegning bruger `demoTankninger()` direkte.
- **nødvendig for:** Daglig drift (triage), men uden skrivning kun et vinduessystem.

### 4.4 Arbejdskø — `/flaade/koe` (skjult i nav)
- **sidenavn:** "Arbejdskø"
- **hvem bruger den:** Disponent/værkfører, som arbejdslistemål.
- **primært formål:** Vise ét udsnit ad gangen (nye/afventer/planlagt/kommende/forsinkede).
- **primær handling:** Ingen skrivning — "Planlæg"/"Flyt"-knapper deaktiverede.
- **sekundære handlinger:** Filtrere på prioritet, skifte udsnit, sidenummerering.
- **data vist:** Samme `opgaver`/`indberetninger`/`koeretoejer`/`leverandoerer` som Driftskalenderen.
- **data der kan ændres:** Intet.
- **kommer typisk fra:** Driftskalenderens fem kasser.
- **går typisk til:** "Tilbage til driftskalenderen".
- **overlap med anden side:** Filteret er bevidst identisk med Driftskalenderens kasser — ikke et overlap-problem.
- **status:** MOCK/DEMO for skrivning, BUILT for læsning/navigation.
- **demo-data:** JA, samme fire fallback-sæt.
- **nødvendig for:** Daglig drift (arbejdsliste), rent visnings-værktøj.

---

## 5. Facility

Registrere og overvåge bygninger og tekniske anlæg — fejlmelding, servicebesøg, klima/energi. Kildedossier: `05-facility.md`.

### 5.1 Overblik & fejl — `/facility`
- **sidenavn:** "Overblik & fejl"
- **hvem bruger den:** Alle med adgang til Facility (læsning ugated); skrivning kræver `facility.skriv` (casehandler/disponent/koordinator/admin).
- **primært formål:** Samlet driftsbillede — lokationer/anlæg, åbne fejl, klima lige nu.
- **primær handling:** Klikke en lokation; "Nyt anlæg"/"Meld fejl".
- **sekundære handlinger:** Redigere anlæg, paginering, links til Servicekalender og Klima.
- **data vist:** KPI-række, lokationsliste med afledt status, aktivfordelings-donut, driftsforhold-kort, aktivtabel med estimeret omkostning, åbne-fejl-tabel, "Klima nu"-status, Modulfakturaer.
- **data der kan ændres:** Anlæg (`facility/aktiver`) og fejl (`facility/fejl`), begge via `gem()`.
- **kommer typisk fra:** `useKpi()`, `useListe` på lokationer/aktiver/fejl/zoner/sensorer, `personale`.
- **går typisk til:** `/facility/servicekalender`, `/facility/klima`.
- **overlap med anden side:** "Klima nu" = samme udtræk som Klima-skærmen (bevidst, rettet mockup-fejl). "Estimeret omkostning" overlapper begrebsmæssigt med Servicekalenderens "Anslået omkostning".
- **status:** BUILT for anlægs-/fejlregistrering. KPI-række/aktivfordeling PARTIAL i praksis hvor felter ikke er aggregeret.
- **demo-data:** JA som fallback for personale; aktiv-/lokations-/fejl-lister har ingen demo-parameter (kun estimatberegningen bruger demo-data direkte).
- **nødvendig for:** Daglig drift.

### 5.2 Servicekalender — `/facility/servicekalender`
- **sidenavn:** "Servicekalender"
- **hvem bruger den:** Samme som Overblik; planlægning kræver `opgaver.skriv` (IKKE `facility.skriv`).
- **primært formål:** Booke tid til servicebesøg på et anlæg eller en hel lokation.
- **primær handling:** Trække-og-slippe et besøg; "Planlæg service" → Servicedialog.
- **sekundære handlinger:** Vælge besøg for "Reservationen der ville blive skrevet"-panel, statusskifte, navigation til flåde-sagsvisning.
- **data vist:** KPI-række, gitterkalender (10-dages vindue), tabel over facility-opgaver, reservationspanel.
- **data der kan ændres:** Nye servicebesøg (→ `facilityplanlaeg`), flytning (→ `opgaveflyt`), statusskifte (→ `opgavestatus`). Skærmen opretter ikke direkte.
- **kommer typisk fra:** `facility/lokationer`, `facility/aktiver`, `leverandoerer`, `opgaver` (art facility).
- **går typisk til:** Cloud Functions (server-skrivning atomisk med reservation).
- **overlap med anden side:** Deler `Gitterkalender.jsx` med Fleets Driftskalender/Værkstedskalender og Disponering; deler `opgaver`-noden med Fleets Værkstedskalender.
- **status:** BUILT. Klienten kan IKKE oprette en facility-opgave uden om funktionen.
- **demo-data:** JA, ren offline-fallback for alle fire lister.
- **nødvendig for:** Daglig drift.

### 5.3 Klima & energi — `/facility/klima`
- **sidenavn:** "Klima & energi"
- **hvem bruger den:** Samme læseadgang som resten af modulet. Ingen skrivehandling overhovedet.
- **primært formål:** Overvåge temperatur/fugt pr. zone og bygningsomkostninger.
- **primær handling:** Ingen — ren visning.
- **sekundære handlinger:** Ingen.
- **data vist:** KPI-række, zonetabel med afledt alarmstatus, gennemsnit pr. zoneart, bygningsomkostninger + to afledte totaler, søjlegraf.
- **data der kan ændres:** Intet.
- **kommer typisk fra:** `facility/zoner`, `facility/sensorer`, `facility/omkostning`.
- **går typisk til:** Ingen udgående skrivning; link til Overblik.
- **overlap med anden side:** Zonetabellen og "Klima nu" på Overblik er bevidst ét datasæt vist to steder.
- **status:** BUILT for LÆSNING. MOCK/hul for SKRIVNING af bygningsomkostninger — regel tillader skrivning, men ingen skærm skriver til noden.
- **demo-data:** NEJ direkte i skærmen (ingen `demo:`-parameter).
- **nødvendig for:** Daglig drift (overvågning); opsætning af energitallene har intet synligt administrationssted.

### 5.4 Servicedialog (dialog i Servicekalender, ingen egen route)
- **sidenavn:** "Planlæg service" (dialogtitel)
- **hvem bruger den:** Samme som Servicekalender, betinget af `opgaver.skriv`.
- **primært formål:** Oprette ét nyt servicebesøg (anlæg ELLER hel lokation).
- **primær handling:** Udfylde ressource/dato/tid/varighed/beskrivelse → "Planlæg service".
- **sekundære handlinger:** Vælge leverandør (kategori facility) eller "Eget personale"; prioritet.
- **data vist:** Live-udkast af reservationen der ville blive skrevet, feltfejl.
- **data der kan ændres:** Opretter en ny opgave (art facility, sat af serveren) via `planlaegFacilityopgave()`.
- **kommer typisk fra:** Props fra Servicekalender.jsx.
- **går typisk til:** Cloud Function `facilityplanlaeg`.
- **overlap med anden side:** Bevidst IKKE delt med Fleets `Planlaegdialog.jsx` (andet feltskema).
- **status:** BUILT. Ingen mail sendes ("beslutning 20 er fase 0").
- **demo-data:** Ingen egen; arver fra Servicekalender. Fejler synligt i demo-tilstand ("intet blev gemt").
- **nødvendig for:** Daglig drift.

---

## 6. Procure / Indkøb

Styrer indkøbsprocessen fra behov til fakturaafstemning, med eget reservedelslager. Kildedossier: `06-procure-indkoeb.md`.

### 6.1 Procure & vareforbrug (Oversigt) — `/indkoeb`
- **hvem bruger den:** Alle med `indkoeb.laes`; indkøbsansvarlig/disponent primært.
- **primært formål:** Modulets forside — procesbånd (5 trin), KPI-række, indbakke, leverandørkartotek, prisudvikling.
- **primær handling:** "Registrér indkøb".
- **sekundære handlinger:** Filtrér leverandør/status/kategori; redigér linje; links til hvert procestrin.
- **data vist:** `indkoeb` (400 dages vindue), `leverandoerer`, `koeretoejer`, `facility/lokationer`, `fakturaer`, `indkoebsbehov`, `indkoebsordrer`, `godkendelsesregler`, `brugere`, KPI.
- **data der kan ændres:** En `indkoeb`-linje via `gem()`.
- **kommer typisk fra:** Landingsside for modulet.
- **går typisk til:** Behov, Bestillinger, Godkendelser, Fakturaer, Leverandører, Varelager.
- **overlap med anden side:** Ingen direkte; samme `indkoeb`-node læses også af Bestillinger.
- **status:** BUILT.
- **demo-data:** JA, kun som `useListe`/`usePost`-fallback (demoMode).
- **nødvendig for:** Daglig drift.

### 6.2 Indkøbsbehov — `/indkoeb/behov`
- **hvem bruger den:** Enhver medarbejder med `indkoeb.skriv`; casehandler/admin til at afvise.
- **primært formål:** Indmeld hvad man mangler, grupperet på kilde.
- **primær handling:** "Send melding" (→ `behovskriv`).
- **sekundære handlinger:** "Afvis" med obligatorisk begrundelse; filtrér på kilde.
- **data vist:** `indkoebsbehov`, `personale`.
- **data der kan ændres:** Opret/afvis behov via Cloud Function `behovskriv`.
- **kommer typisk fra:** Procesbåndet trin 1.
- **går typisk til:** Bestillinger.
- **overlap med anden side:** Ingen.
- **status:** BUILT. Billede/lydoptagelse eksplicit ikke bygget (kræver fillagring).
- **demo-data:** JA, fallback.
- **nødvendig for:** Daglig drift.

### 6.3 Bestillinger (Bestillingskladder & leverandørforslag) — `/indkoeb/bestillinger`
- **hvem bruger den:** Indkøbsansvarlig/disponent med `indkoeb.skriv`.
- **primært formål:** Omdanne åbne behov til bestillinger, grupperet pr. leverandør med automatisk forslag.
- **primær handling:** "Bestil valgte" pr. leverandørgruppe → `opretBestilling()`.
- **sekundære handlinger:** Ret antal/pris; kopiér mailudkast; markér som sendt (sker på Godkendelser).
- **data vist:** `indkoebsbehov`, `indkoebsordrer`, `indkoeb` (historik), `leverandoerer`.
- **data der kan ændres:** Opretter `indkoebsordrer`-post (kladde) via `ordreskriv`.
- **kommer typisk fra:** Behov (trin 1).
- **går typisk til:** Godkendelser (trin 3).
- **overlap med anden side:** Samme "e-mailudkast"-koncept som senere markeres sendt på Godkendelser.
- **status:** BUILT for kladdeoprettelse. PARTIAL for afsendelse — "Systemet sender ikke udkastene", ingen SMTP/afsenderadresse; "Markér som sendt" er kun et statusskifte.
- **demo-data:** JA, fallback.
- **nødvendig for:** Daglig drift.

### 6.4 Godkendelser (Godkendelse af indkøb) — `/indkoeb/godkendelser`
- **hvem bruger den:** Godkender (`indkoeb.godkend`); admin (regelopsætning kræver `brugere.skriv`).
- **primært formål:** Afgøre ventende ordrer, opsætte to godkendelsesregler (beløbsgrænse, fakturagodkendelse).
- **primær handling:** "Godkend"/"Afvis" → `skiftOrdre()`.
- **sekundære handlinger:** Gem godkendelsesregler; se alle bestillinger og næste skridt.
- **data vist:** `indkoebsordrer`, `leverandoerer`, `godkendelsesregler`, `brugere`.
- **data der kan ændres:** Ordrestatus (→ `ordrestatus`), godkendelsesregler (→ `godkendelsesregelskriv`).
- **kommer typisk fra:** Bestillinger.
- **går typisk til:** Fakturaer (trin 4).
- **overlap med anden side:** Ingen.
- **status:** BUILT. Selvgodkendelse bevidst tilladt (markeret, ikke blokeret).
- **demo-data:** JA, fallback.
- **nødvendig for:** Daglig drift (godkendelse) og admin/opsætning (reglerne).

### 6.5 Fakturaer (Fakturaer, match & kontantkøb) — `/indkoeb/fakturaer`
- **hvem bruger den:** Indkøbsansvarlig/godkender (`indkoeb.skriv`/`indkoeb.godkend`).
- **primært formål:** Matche modtagne fakturaer mod bestillinger, godkende, bogføre, registrere kontantkøb.
- **primær handling:** "Bekræft match" (→ `matchFaktura()`); "Godkend"/"Afvis"/"Bogfør" (→ `skiftFaktura()`).
- **sekundære handlinger:** "Markér som ikke-matchbar"; "Fjern match"; registrér kontant køb.
- **data vist:** `fakturaer`, `indkoeb`, `leverandoerer`, `indkoebsordrer`, `godkendelsesregler`, `brugere`, KPI.
- **data der kan ændres:** Faktura-match/status/kontantkøb via `fakturamatch`, `fakturastatus`, `kontantkoebskriv`.
- **kommer typisk fra:** Godkendelser (trin 3→4).
- **går typisk til:** Ingenting videre — slutstation i Procure-processen.
- **overlap med anden side:** Direkte — `oekonomi/Fakturacenter.jsx` læser og skriver samme `fakturaer`-node.
- **status:** BUILT for match/godkend/afvis/bogfør/kontantkøb. PARTIAL/MOCK for upload ("ikke bygget endnu") og for Afstemnings-kortet (bruger `demoAfstemning()` ubetinget — reel MOCK-visning, ikke kun fallback). Ingen betaling og ingen afsendelse til regnskabssystem.
- **demo-data:** JA for lister; Afstemning altid demodata.
- **nødvendig for:** Daglig drift.

### 6.6 Leverandører — `/indkoeb/leverandoerer`
- **hvem bruger den:** Indkøbsansvarlig, admin.
- **primært formål:** Leverandørkartotek med performance (seks objektive nøgletal, ingen samlet score), prisliste-historik.
- **primær handling:** Ingen skrivehandling — ren visning ("FASE 0: VISNING").
- **sekundære handlinger:** Vælg leverandør for detaljer.
- **data vist:** `leverandoerer`, `indkoeb`, `fakturaer` (fallback), KPI.
- **data der kan ændres:** Intet.
- **kommer typisk fra:** Oversigt eller nav-link.
- **går typisk til:** Ingen videre navigation.
- **overlap med anden side:** Deler leverandørkartoteket med alle andre Procure-skærme.
- **status:** MOCK/DEMO for skrivning (bevidst, ingen skrivning findes), BUILT for læsning.
- **demo-data:** JA, kun for `fakturaer`.
- **nødvendig for:** Daglig drift (performance-opslag); leverandøroprettelse IKKE PÅVIST.

### 6.7 Varelager — `/indkoeb/varelager`
- **hvem bruger den:** Lagermedarbejder/indkøbsansvarlig med `indkoeb.skriv`.
- **primært formål:** Procures eget reservedelslager (`forbrugsvarer`) — IKKE Warehouses kundegods.
- **primær handling:** "Ny vare"/"Ret" (→ `forbrugsvareskriv`), "Bevægelse" (→ `forbrugsvarebevaegelse`).
- **sekundære handlinger:** "Meld som behov" for lav vare; "Tæl op" på negativ beholdning.
- **data vist:** `forbrugsvarer`, `forbrugsvarebevaegelser`, `leverandoerer`, afvigelse mellem gemt beholdning og bevægelsessum.
- **data der kan ændres:** Vare-stamdata og lagerbevægelser.
- **kommer typisk fra:** Oversigt (KPI "Lav lagerbeholdning").
- **går typisk til:** Behov.
- **overlap med anden side:** Risiko for forveksling med `lagre` (Fleet/værksted reservedelslager) og Warehouses `varer`/`beholdning`.
- **status:** BUILT.
- **demo-data:** JA, fallback.
- **nødvendig for:** Daglig drift.

---

## 7. Unitbooking

Udlejning af transportkasser: kasser, reolpladser og udlån pr. sag. Kildedossier: `07-unitbooking.md`.

### 7.1 Kalender — `/unitbooking`
- **sidenavn/titel:** "Kalender"
- **hvem bruger den:** Lagermedarbejder primært.
- **primært formål:** Modulets forside — ressourcer × tid, 1/2/4 ugers vindue, klargøring/udlån/retur som blokke.
- **primær handling:** Klik på blok åbner detaljekort (redigér/annullér); "Kommende klargøringer" har direkte klargør-knap.
- **sekundære handlinger:** Gruppering, filtrering, "udvid til 2 skærme", fuldskærm, redigér/annullér booking.
- **data vist:** `kasseudlaan`, `kasser`, `kassetyper`, `reolpladser`, afledte KPI'er.
- **data der kan ændres:** Udlånstilstand (→ `skiftUdlaan`), booking-felter (→ `retUdlaan`, kun mens `booket`).
- **kommer typisk fra:** Disponent/lagermedarbejder; direkte via URL-parametre.
- **går typisk til:** Udlån-skærmen (samme funktion `skiftUdlaan`).
- **overlap med anden side:** Deler gitterkomponent med Driftskalender/Servicekalender/Disponering, men eget svævekort.
- **status:** BUILT.
- **demo-data:** JA, kun fallback.
- **nødvendig for:** Daglig drift (forside).

### 7.2 Udlån — `/unitbooking/udlaan`
- **sidenavn/titel:** "Udlån"
- **hvem bruger den:** Lagermedarbejder.
- **primært formål:** Søge ledige kasser, reservere, og skifte status fremad.
- **primær handling:** "Søg ledige" → "Reservér" (→ `opretUdlaan`); "Næste handling"-knap pr. række.
- **sekundære handlinger:** Filtrering, søgning, undtagelses-handlinger (annullér, fortryd klargøring).
- **data vist:** Samme fire noder som Kalender plus `kunder` (valgfri).
- **data der kan ændres:** Ny reservation, tilstandsskift.
- **kommer typisk fra:** Telefonopkald/bestilling.
- **går typisk til:** Kalender, Historik.
- **overlap med anden side:** Belægningsgrad-tal bevidst identisk med Kasser-skærmens (samme funktion).
- **status:** BUILT.
- **demo-data:** JA, samme mønster.
- **nødvendig for:** Daglig drift.

### 7.3 Historik — `/unitbooking/historik`
- **sidenavn/titel:** "Historik"
- **hvem bruger den:** Lagermedarbejder.
- **primært formål:** To opslagsveje — pr. kasse og pr. sagsnummer.
- **primær handling:** Søgning/valg → "Vis historik".
- **sekundære handlinger:** Ingen skrivehandlinger (bevidst read-only).
- **data vist:** `kasseudlaan`, `kasser`, `kassetyper`, `reolpladser`, KPI'er, varighed "målt" vs. "planlagt".
- **data der kan ændres:** Intet.
- **kommer typisk fra:** Kundeforespørgsel, opfølgning.
- **går typisk til:** Ingenting videre — slutpunkt.
- **overlap med anden side:** Eksplicit IKKE audit-loggen (ligger i `audit/` med egen adgang).
- **status:** BUILT (ren visning).
- **demo-data:** JA, samme fire noder.
- **nødvendig for:** Daglig drift (kundeservice/opfølgning).

### 7.4 Reolpladser — `/unitbooking/reolpladser`
- **sidenavn/titel:** "Reolpladser"
- **hvem bruger den:** Lagermedarbejder (eller Warehouse-modstykke, delt node).
- **primært formål:** Stamdata for fysisk lagerstruktur (hal/reol/fag/hylde/plads) og kassetype-katalog.
- **primær handling:** "Ny plads"/"Redigér" (→ `gem()` med `flet: true`), "Ny type".
- **sekundære handlinger:** Filtrér på hal.
- **data vist:** `reolpladser`, `kassetyper`, `kasser` (optælling).
- **data der kan ændres:** Reolplads-felter, ny kassetype.
- **kommer typisk fra:** Opsætning af nyt lager/reol.
- **går typisk til:** Kasseliste.
- **overlap med anden side:** Eksplicit delt node med Warehouse — skriver med `flet: true` for ikke at overskrive Warehouse-felter.
- **status:** BUILT.
- **demo-data:** JA.
- **nødvendig for:** Admin/opsætning (stamdata, sjældent rørt).

### 7.5 Kasseliste / Kasser — `/opsaetning/kasser`
- **sidenavn/titel:** "Kasseliste"
- **hvem bruger den:** Lagermedarbejder — menuplaceringen er bevidst under Opsætning.
- **primært formål:** CRUD på transportkasserne.
- **primær handling:** "Ny kasse"/"Redigér" → `gem()`.
- **sekundære handlinger:** Filtrér på status/type/undertype, søg, sidedeling.
- **data vist:** `kasser`, `reolpladser`, `kassetyper`, `kasseudlaan` (kun for "Reserveret"-mærkat).
- **data der kan ændres:** Kassefelter (type, undertype, status begrænset til `ledig`/`udeAfDrift`), mål, hjemplads/nuværende plads, note. Ingen slet-knap.
- **kommer typisk fra:** Ny kasse indkøbt/mærket.
- **går typisk til:** Udlån, Kalender.
- **overlap med anden side:** Ingen direkte skærmoverlap, men konceptuelt nærliggende Warehouses Carriers.
- **status:** BUILT.
- **demo-data:** JA.
- **nødvendig for:** Admin/opsætning (bevidst flyttet dertil for at signalere det).

---

## 8. Warehouse

3PL-lagerhotel — opbevaring og afregning af kundens gods. Kildedossier: `08-warehouse.md`.

### 8.1 Varer — `/warehouse`
- **hvem bruger den:** Lagermedarbejder (skriv), alle med `varer.laes`.
- **primært formål:** Varekartotek pr. kunde.
- **primær handling:** Opret/redigér vare (kræver kunde valgt).
- **sekundære handlinger:** Søg/filtrér på kunde/varegruppe; se "på lager" og "under minimum".
- **data vist:** Varer, beholdning (summeret), kunder.
- **data der kan ændres:** Varefelter via `gem()`. `sporing` låst efter oprettelse.
- **kommer typisk fra:** Kunder & Priser.
- **går typisk til:** Bevægelser/Modtagelse, Pluk.
- **overlap med anden side:** Ingen direkte; adskilt fra Indkøbs `lagre`.
- **status:** BUILT.
- **demo-data:** JA, fallback.
- **nødvendig for:** Daglig drift (stamdata-forudsætning).

### 8.2 Pluk & afsend — `/warehouse/pluk`
- **hvem bruger den:** Lagermedarbejder (pluk); disponent/koordinator/admin (oprette/frigive, kræver `bevaegelser.skriv`).
- **primært formål:** Oprette plukordrer, frigive, registrere pluk, afsende.
- **primær handling:** "Registrér pluk" (art pluk); "Afsend" (→ `plukordreafsend`).
- **sekundære handlinger:** Opret/redigér ordre (kladde); "Frigiv"; "Tilbage til kladde".
- **data vist:** Plukordrer, bevægelser, beholdning, varer, reolpladser, carriers, kunder.
- **data der kan ændres:** Ordrefelter (`flet:true`), tilstandsskift kladde↔frigivet direkte af klient; selve pluk/afsend kun via Cloud Functions.
- **kommer typisk fra:** Varer, Beholdere/Lokationer.
- **går typisk til:** Afregning.
- **overlap med anden side:** `plukordrer` bevidst IKKE samme som Bookings `bookinger`.
- **status:** BUILT.
- **demo-data:** JA for referencelister; `demo: []` for plukordrer/bevægelser.
- **nødvendig for:** Daglig drift.

### 8.3 Bevægelser — `/warehouse/bevaegelser`
- **hvem bruger den:** Lagermedarbejder.
- **primært formål:** Registrere enhver lagerbevægelse i ét fælles skema.
- **primær handling:** "Registrér bevægelse" → `skrivBevaegelse()` → `bevaegelseskriv`.
- **sekundære handlinger:** Filtrér seneste bevægelser på art.
- **data vist:** Bevægelseshistorik (seneste 500), varer, reolpladser, beholdning, carriers, KPI'er.
- **data der kan ændres:** Intet direkte — kun via Cloud Function; append-only.
- **kommer typisk fra:** Varer/Lokationer/Carriers.
- **går typisk til:** Beholdning, Sporbarhed, Afregning.
- **overlap med anden side:** Delvist overlap med Modtagelse (guidet delmængde) og Pluk (guidet delmængde).
- **status:** BUILT.
- **demo-data:** `demo: []` for bevægelser; JA for referencelister.
- **nødvendig for:** Daglig drift — generisk indgang for alle andre skærme.

### 8.4 Optælling — `/warehouse/optaelling`
- **hvem bruger den:** Lagermedarbejder.
- **primært formål:** Cycle count — server beregner afvigelse.
- **primær handling:** "Registrér optælling" → `skrivOptaelling()` → `optaellingskriv`.
- **sekundære handlinger:** Angiv årsag (allowlistet); se lagernøjagtighed, forfaldne lokationer.
- **data vist:** Optællinger (append-only), beholdning, varer, reolpladser, carriers.
- **data der kan ændres:** Intet direkte — `.write: false` for enhver klient.
- **kommer typisk fra:** Lokationer/Bevægelser.
- **går typisk til:** Beholdning, Sporbarhed.
- **overlap med anden side:** Ingen.
- **status:** BUILT.
- **demo-data:** `demo: []` for optællinger; JA for referencelister.
- **nødvendig for:** Daglig/periodisk drift (lagerkontrol).

### 8.5 Modtagelse — `/warehouse/modtagelse`
- **hvem bruger den:** Lagermedarbejder.
- **primært formål:** Guidet 4-trins flow for at sætte en beholder på en hylde.
- **primær handling:** "Vælg foreslået plads"/"Placér på valgt plads" → art `putaway`.
- **sekundære handlinger:** Manuelt vælge anden plads; se seneste placeringer.
- **data vist:** Carriers (i transit/uden lokation), reolpladser, beholdning, varer, bevægelser, evt. `kasser`.
- **data der kan ændres:** Kun via `skrivBevaegelse()` (art putaway).
- **kommer typisk fra:** En beholder registreret i transit.
- **går typisk til:** Beholdere, Lokationer.
- **overlap med anden side:** DELVIST overlap med "Placering" i Bevægelser.
- **status:** BUILT. Bevidst IKKE bygget: separat "modtag"-trin, "Kundens faste område" (PLANNED), fysisk lagerkort.
- **demo-data:** JA for referencelister; `demo: []` for bevægelser.
- **nødvendig for:** Daglig drift.

### 8.6 Beholdere (Carriers) — `/warehouse/carriers`
- **hvem bruger den:** Lagermedarbejder, disponent/admin (indsyn).
- **primært formål:** Overblik over beholdere — indhold, placering, status.
- **primær handling:** Filtrere/søge; "Vis indhold".
- **sekundære handlinger:** Ingen skriv-handling; link til Lokationer.
- **data vist:** Carriers, reolpladser, beholdning, varer, bevægelser, KPI-tal.
- **data der kan ændres:** Intet — ren visningsskærm.
- **kommer typisk fra:** Modtagelse.
- **går typisk til:** Lokationer, Sporbarhed.
- **overlap med anden side:** Eksplicit IKKE samme som en (ikke-bygget) "Overblik"-planche. Se overlap-afsnit for Kasser (Unitbooking).
- **status:** BUILT (ren visning, tilsigtet).
- **demo-data:** JA.
- **nødvendig for:** Daglig drift (opslag).

### 8.7 Transportlabels — `/warehouse/labels`
- **hvem bruger den:** Lagermedarbejder.
- **primært formål:** Generere/printe fysisk mærkat (QR + Code 128) for en beholder knyttet til en transport.
- **primær handling:** Vælge beholder, "Print label" (kun aktiv hvis `label.kanTrykkes`).
- **sekundære handlinger:** "Redigér felter" (kolli, løse enheder, vægt, godsbeskrivelse, håndtering) → `gem()` med `flet:true`.
- **data vist:** Carriers, etaper/bookinger (kun med Booking-modulet), kunder, reolpladser, beholdning.
- **data der kan ændres:** Kun mærkatfelterne. Kundens ref.nr. og fra-/til-adresse kan IKKE redigeres her (hører på `.write: false`-noder).
- **kommer typisk fra:** Beholdere (skal have `etapeId`).
- **går typisk til:** Fysisk print — ingen efterfølgende skærm.
- **overlap med anden side:** Ingen; mærkatet er bevidst IKKE en gemt node.
- **status:** BUILT. Kræver Booking-modulet for transporttype.
- **demo-data:** JA for alle lister.
- **nødvendig for:** Daglig drift, kun relevant med Booking-modulet.

### 8.8 Afregning — `/warehouse/afregning`
- **hvem bruger den:** Disponent/koordinator/admin/revisor (kræver `satser.laes`; oprettelse kræver `grundlag.skriv`).
- **primært formål:** Vise hvad lageret kan faktureres for, pr. kunde; oprette fakturagrundlag.
- **primær handling:** Vælge kunde → se linjer → "Opret fakturagrundlag" → `opretGrundlag()`.
- **sekundære handlinger:** Ingen — periode kommer fra shellen.
- **data vist:** Kunder, bevægelser (periodefiltreret), standardsatser, afregningslinjer.
- **data der kan ændres:** Intet direkte — kun oprettelse af nyt grundlag (kladde).
- **kommer typisk fra:** Bevægelser.
- **går typisk til:** Indkøb → Fakturaer / Økonomi → Fakturering.
- **overlap med anden side:** Eksplicit IKKE "Fakturering" (bevidst navngivning).
- **status:** BUILT.
- **demo-data:** `demo: DEMO_KUNDER` for kunder; `demo: []` for bevægelser/satser.
- **nødvendig for:** Admin/opsætning-lignende periodisk arbejde (økonomi), ikke daglig drift for lagermedarbejderen.

### 8.9 Volumen — `/warehouse/volumen`
- **hvem bruger den:** Sælger/disponent/admin (kræver `satser.laes`).
- **primært formål:** Salgsværktøj — regne månedsprisestimat.
- **primær handling:** Justere mængde/periode/håndteringer, se live beregning.
- **sekundære handlinger:** Vælge kunde vs. "emne"; rumfangsberegner.
- **data vist:** Kunder, standardsatser, varer.
- **data der kan ændres:** Intet — ren beregner.
- **kommer typisk fra:** Salgssamtale.
- **går typisk til:** Intet — opretter bevidst intet tilbud.
- **overlap med anden side:** Eksplicit IKKE "Tilbud".
- **status:** BUILT som beregner; PLANNED for tilbudsoprettelse (bevidst udskudt).
- **demo-data:** JA.
- **nødvendig for:** Admin/opsætning-lignende (salg), ikke daglig lagerdrift.

### 8.10 Sporbarhed — `/warehouse/sporbarhed`
- **hvem bruger den:** Lagermedarbejder, disponent/admin/revisor (indsyn ved tilbagekald).
- **primært formål:** Svare "hvor er det parti/den enhed nu, og hvor har det været".
- **primær handling:** Vælge opslagstype, se "Hvor er det nu" og "Sporet".
- **sekundære handlinger:** "Tal mod enhedsrækker" — uenighedspanel.
- **data vist:** Bevægelser (hele historikken), varer, beholdning, carriers, reolpladser, enheder, kunder.
- **data der kan ændres:** Intet — ren visning.
- **kommer typisk fra:** Tilbagekald/kundehenvendelse.
- **går typisk til:** Intet — informationsterminal.
- **overlap med anden side:** Eksplicit IKKE "Sporbarhed & optælling" (optælling er egen skærm).
- **status:** BUILT (ren visning over ægte data).
- **demo-data:** JA.
- **nødvendig for:** Admin/opsætning-lignende (compliance/tilbagekald), ikke daglig for de fleste.

### 8.11 Lokationer — `/warehouse/lokationer`
- **hvem bruger den:** Lagermedarbejder (kræver `reolpladser.skriv`).
- **primært formål:** Administrere reolpladser (zoner, hylder, belægning, status, temperatur) — DELT node med Unitbooking.
- **primær handling:** Opret/redigér lokation (`gem()` med `flet:true`).
- **sekundære handlinger:** Søg/filtrér på zone/status; se belægning (udledt fælles med Unitbooking).
- **data vist:** Reolpladser, beholdning, varer, carriers, evt. `kasser`.
- **data der kan ændres:** De fire Warehouse-ejede felter + adressen, aldrig hele posten.
- **kommer typisk fra:** Opsætning før første modtagelse.
- **går typisk til:** Modtagelse, Bevægelser, Carriers/Sporbarhed.
- **overlap med anden side:** DELT node med Unitbookings reolplads-skærm.
- **status:** BUILT.
- **demo-data:** JA.
- **nødvendig for:** Admin/opsætning (stamdata), forudsætning for daglig drift.

---

## 9. Kunder & Priser + Opsætning

Kundekartotek, to-lags prissætning (standardpris + kundeafvigelse), brugere/roller og øvrig opsætning. Kildedossier: `09-kunder-opsaetning.md`.

### 9.1 Kunder — `/opsaetning/kunder`
- **sidenavn:** "Kunder & Priser" (menupunkt "Kunder")
- **hvem bruger den:** Casehandler, disponent, koordinator, admin.
- **primært formål:** Overblik over kundebasen: aktive, udløbende aftaler, dækningsbidrag, salgsprisafvigelser.
- **primær handling:** Filtrere/gennemse kundetabellen; folde detaljekort ud.
- **sekundære handlinger:** Nulstil filtre; links til Bookingopsætning, Kundepriser, Økonomi, Ny forespørgsel.
- **data vist:** `kunder`, `kpi.kunder`, `DEMO_TILBUD` (hardkodet).
- **data der kan ændres:** INGEN — ren lister-og-rapportér-skærm; ingen redigering af kundestamdata findes overhovedet på denne skærm.
- **kommer typisk fra:** Opsætning-menuen.
- **går typisk til:** Kundepriser, Bookingopsætning, Økonomi.
- **overlap med anden side:** Deler `kunder`-noden med Kundepriser; `prisgruppe` vises som filter men bærer ikke pris.
- **status:** BUILT for læsning.
- **demo-data:** JA for `kunder`; `DEMO_TILBUD` læses direkte og ubetinget (knap "Åbn" deaktiveret — "Tilbudsskærmen er ikke bygget").
- **nødvendig for:** Daglig drift (kunderelation/salgsopfølgning), men fysisk placeret under Opsætning.

### 9.2 Standardpriser — `/opsaetning/priser`
- **sidenavn:** "Standardpriser"
- **hvem bruger den:** Alle med `satser.laes` kan se; kun admin (`satser.skriv`) kan skrive.
- **primært formål:** Definere den fælles prisliste for platformens ydelser.
- **primær handling:** Sætte ny pris for en ydelse fra given dato.
- **sekundære handlinger:** Filtrere på kategori; åbne/lukke prishistorik.
- **data vist:** `satser/standard/<ydelseId>/satser/<id>`, krydset med ydelseskatalog.
- **data der kan ændres:** Ny prispost pr. ydelse — ALDRIG overskrivning.
- **kommer typisk fra:** Opsætning-menuen.
- **går typisk til:** Ingen udgående navigation af betydning.
- **overlap med anden side:** Samme node læses af Bookingopsætning, Warehouses Afregning/Volumen, prismotoren.
- **status:** BUILT.
- **demo-data:** `demo: []` — ingen fiktive priser.
- **nødvendig for:** Admin/opsætning.

### 9.3 Kundepriser — `/opsaetning/aftalepriser` (+`/:kundeId`)
- **sidenavn:** "Kundepriser"
- **hvem bruger den:** Samme læseadgang som Standardpriser; skrivning kræver BÅDE `kunder.skriv` OG `satser.skriv` — kun admin har begge i standardpreset.
- **primært formål:** Sætte den enkelte kundes prisafvigelse (egen pris eller rabat, aldrig begge).
- **primær handling:** Vælge kunde, sætte/opdatere afvigelse pr. ydelse.
- **sekundære handlinger:** Skifte kunde; åbne aftalehistorik; live forhåndsvisning af resultatpris.
- **data vist:** `kunder/<id>/priser/<ydelseId>/satser/<id>`, krydset mod standardpriser.
- **data der kan ændres:** Ny afvigelsespost. INGEN sletteknap.
- **kommer typisk fra:** Kundeoversigten eller Opsætning-menuen.
- **går typisk til:** Tilbage til Kunder; til Standardpriser.
- **overlap med anden side:** Samme node-familie som Standardpriser.
- **status:** BUILT.
- **demo-data:** `DEMO_KUNDER` for kundeliste; `demo: []` for standardpriser.
- **nødvendig for:** Admin/opsætning.

### 9.4 Generelt — `/opsaetning`
- **sidenavn:** "Opsætning – generelt"
- **hvem bruger den:** Alle roller.
- **primært formål:** Vise hvad tenanten ER, og pege videre til hvor stamdata vedligeholdes.
- **primær handling:** Ingen — eksplicit LÆSESKÆRM. "Redigér virksomhedsoplysninger" deaktiveret ("Ikke besluttet endnu").
- **sekundære handlinger:** Navigere via "hvor rettes stamdata"-tabel.
- **data vist:** Tenant/id, aktive moduler, `facility/lokationer`, miljø.
- **data der kan ændres:** INTET.
- **kommer typisk fra:** Opsætning-menuens forsidepunkt.
- **går typisk til:** Medarbejdere, Kompetencer, Enheder, Kunder, Bookingopsætning, Leverandører, Facility, Brugere & roller.
- **overlap med anden side:** Ren henvisningsside; gør Opsætnings grab-bag-natur synlig.
- **status:** PARTIAL efter designs egen definition — bevidst tilstand ("Opsætning → Generelt og Brugere & roller er bygget som LÆSESKÆRME").
- **demo-data:** JA for `facility/lokationer`.
- **nødvendig for:** Admin/opsætning.

### 9.5 Brugere & roller — `/opsaetning/brugere`
- **sidenavn:** "Brugere & roller"
- **hvem bruger den:** Alle kan se; kun `brugere.skriv` (admin-presettet) kan oprette/redigere/spærre.
- **primært formål:** Administrere logins og redigere hvad en rolle indeholder.
- **primær handling:** Oprette login; skifte rolle; spærre/åbne login; redigere rolle-permission-sæt.
- **sekundære handlinger:** Rolle-vs-permission matrix; dashboardvisning pr. bruger; egne permissions/token-info.
- **data vist:** `brugere`-indeks, `roller`-node, `dashboardvisning`.
- **data der kan ændres:** Fem handlinger via Cloud Functions: `opretbruger`, `skiftrolle`, `spaerlogin`, `rolleskriv`, `dashboardvisningskriv`.
- **kommer typisk fra:** Opsætning-menuen.
- **går typisk til:** Medarbejdere (for personer uden login).
- **overlap med anden side:** Deler rollebegrebet med hele `permissions.js`-håndhævelsen.
- **status:** BUILT for de fem handlinger (verificeret ægte Cloud Functions med Admin SDK). Ingen e-mail-invitation findes — kodeord vises kun én gang.
- **demo-data:** `demo: []` for alle tre noder.
- **nødvendig for:** Admin/opsætning.

### 9.6 Integrationer — `/opsaetning/integrationer`
- **sidenavn:** "Integrationer"
- **hvem bruger den:** Alle.
- **primært formål:** Vise hvilke eksterne systemer der er forbundet.
- **primær handling:** Ingen — ren visning.
- **sekundære handlinger:** Ingen.
- **data vist:** `INTEGRATIONER`-konstant — tom array, hardkodet, ikke en node.
- **data der kan ændres:** INTET.
- **kommer typisk fra:** Opsætning-menuen.
- **går typisk til:** Ingen udgående navigation.
- **overlap med anden side:** Ingen.
- **status:** MOCK/DEMO i snæver forstand (hardkodet konstant), men bevidst designbeslutning — ikke en overset mangel. "FleetControl taler ikke med nogen fremmede systemer endnu."
- **demo-data:** Nej — det er den eneste, tomme datakilde.
- **nødvendig for:** Admin/opsætning (ville være det, hvis noget var bygget).

---

## 10. Support & Ejerkonsol

To adskilte områder: kunde-support-modulet (fase 0 på alle skærme) og FleetControls interne Ejerkonsol (fuldt bygget). Kildedossier: `10-support-ejerkonsol.md`.

### 10.1 Hjælp & Support — `/support`
- **sidenavn:** "Hjælp & Support"
- **hvem bruger den:** Enhver kunde-bruger med `support.opret` — men permissionen findes ikke i `ROLLE_PERMS`, så i praksis ingen.
- **primært formål:** Oprette en supportsag og se egne sagers status.
- **primær handling:** "Opret supportsag" — permanent deaktiveret ("Oprettelse er ikke bygget endnu (fase 0)").
- **sekundære handlinger:** Vælge kategori/prioritet; se hvilken kontekst der ville blive sendt med (`SUPPORT_KONTEKST`-allowlisten).
- **data vist:** `DEMO_SUPPORTSAGER` — altid demo-data, intet `support/`-node-opslag findes.
- **data der kan ændres:** Intet — kun lokal `useState`.
- **kommer typisk fra:** Hovedmenuen.
- **går typisk til:** Supportsag.
- **overlap med anden side:** Ingen direkte; "kontekst"-mekanisme adskilt fra Fleet/Facilitys `sager.js`-parter-mekanisme.
- **status:** MOCK/DEMO. Ren visning; ingen læse- eller skrivevej til rigtig database.
- **demo-data:** JA, altid.
- **nødvendig for:** Ville være daglig drift-relevant, men reelt ubrugelig — ingen kan oprette en sag herfra.

### 10.2 Supportoverblik — `/support/overblik`
- **sidenavn:** "Supportoverblik"
- **hvem bruger den:** Tiltænkt FleetControls eget personale, kræver `support.laes`.
- **primært formål:** Kryds-tenant liste over alle supportsager med KPI'er.
- **primær handling:** Ingen skrivehandling — ren visning/navigation.
- **sekundære handlinger:** Filtrere på kunde/status.
- **data vist:** `DEMO_SUPPORTSAGER`, `DEMO_TENANTS`.
- **data der kan ændres:** Intet.
- **kommer typisk fra:** Support-undermenuen.
- **går typisk til:** Supportsag.
- **overlap med anden side:** Ingen. Eneste skærm tiltænkt at vise mere end én tenant ad gangen.
- **status:** MOCK/DEMO. `support.laes` findes ikke i `permissions.js`, så skærmen viser altid spærringsteksten for enhver rigtig bruger, inkl. admin.
- **demo-data:** JA, altid.
- **nødvendig for:** Ville være FleetControls interne driftsværktøj, men uden reel funktion i dag.

### 10.3 Supportsag — `/support/sag/:id` (skjult i nav)
- **sidenavn:** "Supportsag"
- **hvem bruger den:** Kunden (egen sag) eller FleetControl (`support.laes`).
- **primært formål:** Vise sagstråd, kontekst, tidsbegrænset aktivitetsudtræk og supportadgangs-panel.
- **primær handling:** Ingen fungerende — "Send svar" og "Giv midlertidig adgang" begge permanent deaktiverede.
- **sekundære handlinger:** Se auditudtræk (±5 min/maks 50 poster, ren funktion), løsnings-checkliste, supportadgangs-status.
- **data vist:** Alt fra `demo-support.js`, ingen ægte node.
- **data der kan ændres:** Intet reelt — kun en forhåndsvisning bygges.
- **kommer typisk fra:** Hjælp & Support eller Supportoverblik.
- **går typisk til:** Ingen videre skærm — slutpunkt.
- **overlap med anden side:** Se overlap-afsnit (sammenligning med Fleet/Facilitys Sagsvisning.jsx).
- **status:** MOCK/DEMO. Fire relevante permissions findes slet ikke i `permissions.js`.
- **demo-data:** JA, altid.
- **nødvendig for:** Tiltænkt daglig support-drift; reelt ubrugelig.

### 10.4 Konsol — `/main`
- **sidenavn:** "Ejerkonsol"
- **hvem bruger den:** Konto med `bruger.udbyder === true` — FleetControls eget personale.
- **primært formål:** Oprette nye kunder, styre moduler/rabatter/abonnementstilstand, oprette kundens første administrator.
- **primær handling:** "Opret kunde" (→ `kundeopret`), "Gem moduler" (→ `kundemoduler`), "Sæt til [status]" (→ `kundestatus`), "Opret administrator" (→ `kundeadmin`).
- **sekundære handlinger:** "Gem rabatter" (pr. modul, → `kundeabonnement`), "Gem rabat" (generel), se append-only abonnementshistorik.
- **data vist:** `udbyder/kunder`, `tenants/<id>/virksomhed`, `.../moduler`, `.../abonnement` (ægte RTDB-kald).
- **data der kan ændres:** Kundens moduler, rabat, abonnementstatus + årsag, første administrator — alt persisteret via Cloud Functions.
- **kommer typisk fra:** Login som udbyder-konto (egen renderingsgren, ikke via nav.js).
- **går typisk til:** Prisliste.
- **overlap med anden side:** Kundens egen låseskærm læser samme `abonnement`-node.
- **status:** BUILT. Ægte læsning + skrivning via ni navngivne Cloud Functions med server-side ejertjek.
- **demo-data:** Nej.
- **nødvendig for:** FleetControls interne salgs-/onboarding-/kontostyringsproces.

### 10.5 Prisliste — `/main/priser`
- **sidenavn:** "Priser & fakturagrundlag"
- **hvem bruger den:** Samme udbyder-konto som Konsol.
- **primært formål:** Lægge nye versionerede prislister og danne månedligt låst fakturagrundlag.
- **primær handling:** "Læg prislisten" (→ `prislisteopret`), "Dan fakturagrundlag" (→ `grundlagopret`).
- **sekundære handlinger:** "Mål alle kunder nu" (→ `maalnu`), "Slet" ubrugt prisliste (→ `prislisteslet`), CSV-eksport, print.
- **data vist:** `udbyder/prisliste`, `udbyder/fakturagrundlag`, `udbyder/kunder`.
- **data der kan ændres:** Nye prislister (aldrig rettelse), sletning af ubrugte kladder, dannelse af fakturagrundlag.
- **kommer typisk fra:** Link fra Konsol.
- **går typisk til:** Ingen videre skærm — resultatet vises direkte.
- **overlap med anden side:** Ingen i kundeappen.
- **status:** BUILT.
- **demo-data:** Nej.
- **nødvendig for:** FleetControls interne fakturerings-/regnskabsproces.

---

## 11. Chaufførapp & Login

Mobilvenlig grænseflade for den enkelte chauffør, plus den fælles login-skærm for alle brugertyper. Kildedossier: `11-chaufforapp-login.md`.

### 11.1 Forside — `/app` (index)
- **hvem bruger den:** Chaufføren, som landingsskærm efter login.
- **primært formål:** Genvej til de fire undermenuer.
- **primær handling:** Klik på et af (op til) fire kort.
- **sekundære handlinger:** Ingen.
- **data vist:** `bruger.navn`; ingen liste-data.
- **data der kan ændres:** Intet.
- **kommer typisk fra:** Login direkte, eller catch-all-redirect.
- **går typisk til:** `/app/tid`, `/app/tur`, `/app/indberetning`, `/app/frihed`.
- **overlap med anden side:** Ingen direkte; se Turplan vs. kontorets Disponering-visning.
- **status:** BUILT. Ren visning.
- **demo-data:** Nej.
- **nødvendig for:** Daglig drift (eneste indgang til de øvrige tre skærme).

### 11.2 Turplan — `/app/tur`
- **sidenavn:** "Turplan"
- **hvem bruger den:** Chaufføren.
- **primært formål:** Vise dagens stop i rækkefølge, med statusmelding pr. stop.
- **primær handling:** Trykke en statusmelding-knap på et stop.
- **sekundære handlinger:** Dag-frem/-tilbage; "Naviger" (Google Maps, ekstern); ring op; "Prøv igen nu" for ventende meldinger.
- **data vist:** Egne etaper (filtreret på `personId`), planlagte stop, tidligere meldinger, køretøjs-/kundenavn.
- **data der kan ændres:** Statusmeldinger (→ Cloud Function `statusmelding`).
- **kommer typisk fra:** Forside-kortet "Turplan".
- **går typisk til:** Ekstern kort-app, telefon; internt kun tilbage til `/app`.
- **overlap med anden side:** Samme `etaper`/`statushaendelser` som kontorets Disponering/Rute & status.
- **status:** BUILT, inkl. klientside offline-kø. Ingen GPS/sporing.
- **demo-data:** JA, kun fallback (demoMode).
- **nødvendig for:** Daglig drift — chaufførens kerneskærm.

### 11.3 Indberetning — `/app/indberetning`
- **sidenavn:** "Indberetning"
- **hvem bruger den:** Chaufføren.
- **primært formål:** Registrere driftshændelser og udgiftsregistreringer fra vejen.
- **primær handling:** Vælge flise → (evt. art) → udfylde → Send.
- **sekundære handlinger:** Fane "Indberettet" (egen historik), Fortryd.
- **data vist:** Køretøjsliste, egne tidligere indberetninger, tilhørende værkstedsbesøg.
- **data der kan ændres:** Ny post i `indberetninger` — direkte via `gem()`, IKKE Cloud Function.
- **kommer typisk fra:** Forside-kortet "Indberetning".
- **går typisk til:** Egen "Indberettet"-fane.
- **overlap med anden side:** Samme `indberetninger`-node som Flåde → Indberetninger (kontorets arbejdskø), filtreret på `oprettetAf === eget uid`.
- **status:** BUILT.
- **demo-data:** JA, kun fallback.
- **nødvendig for:** Daglig drift.

### 11.4 Timeregistrering — `/app/tid`
- **sidenavn:** "Timeregistrering"
- **hvem bruger den:** Chaufføren.
- **primært formål:** Stemple ind/ud, se ugens timer.
- **primær handling:** Én knap: "Stempl IND"/"Stempl UD".
- **sekundære handlinger:** Uge-frem/-tilbage (frem spærret for fremtidige uger).
- **data vist:** Aktuel status, seneste udstempling, ugetabel med dag-for-dag minutter og ugesum.
- **data der kan ændres:** Egen `stemplinger/{personId}/{id}`-post — direkte via `gem()`, ingen Cloud Function.
- **kommer typisk fra:** Forside-kortet "Timeregistrering".
- **går typisk til:** Ingen udgående navigation.
- **overlap med anden side:** Samme `stemplinger`-node som Workforce/Bemanding-modulet ejer — ingen kontor-skærm i det gennemgåede materiale viser den.
- **status:** BUILT.
- **demo-data:** Nej — ingen demo-fallback i denne fil.
- **nødvendig for:** Daglig drift.

### 11.5 Frihed — `/app/frihed`
- **sidenavn:** "Anmod om frihed"
- **hvem bruger den:** Chaufføren.
- **primært formål:** Ansøge om ferie/feriefridag/afspadsering, se svar på tidligere ansøgninger.
- **primær handling:** Udfylde art + fra/til-dato + note → "Send ansøgning".
- **sekundære handlinger:** Ingen (ingen redigering/annullering af indsendt ansøgning).
- **data vist:** Egne fraværsansøgninger med status og evt. kontorets svartekst.
- **data der kan ændres:** Ny post i `fravaer/{id}` — kun selvbetjenings-gren, status altid `ansoegt` ved oprettelse.
- **kommer typisk fra:** Forside-kortet "Anmod om frihed".
- **går typisk til:** Ingen udgående navigation.
- **overlap med anden side:** Samme `fravaer`-node som Workforce/Bemanding → Ferie & fravær (kontorets godkendelsesskærm).
- **status:** BUILT for ansøgningsflowet. Mail-notifikation eksplicit IKKE bygget (fase 0) — erstattet af "svar her i appen".
- **demo-data:** JA, kun fallback.
- **nødvendig for:** Daglig drift (om end lavfrekvent).

### 11.6 Login — `/login`
- **hvem bruger den:** Enhver bruger uden aktiv session — kontor, chauffør, ejer.
- **primært formål:** Autentificering.
- **primær handling:** Indtaste e-mail + adgangskode → "Log ind".
- **sekundære handlinger:** "Log ud" (kun i uprovisioneret-tilstand).
- **data vist:** Ingen forretningsdata; projekt-id i bunden.
- **data der kan ændres:** Intet i databasen — kun Firebase Auth-sessionstilstand.
- **kommer typisk fra:** `TilLogin`-redirect for enhver ikke-matchende rute uden session.
- **går typisk til:** `EfterLogin`-redirect til `state.fra` eller `/`.
- **overlap med anden side:** Se overlap-afsnit (dev-autofyld vs. Brugervaelger/demo-rollevælger).
- **status:** BUILT. Reelt Firebase Auth-kald.
- **demo-data:** Nej i drift. I `miljoe === "dev"` forudfyldes felterne (samme ægte login-kald, ikke et mock).
- **nødvendig for:** Forudsætning for alt andet.

---

## Steder hvor samme information findes flere steder

- **Fakturacenter (`/oekonomi/fakturacenter`) og Procure → Fakturaer (`/indkoeb/fakturaer`)**: Begge læser og viser samme `fakturaer/`-node (bevidst, u-gatet, "TRE TVETYDIGE NODER"). Fakturacenter er den brede tværgående linse, Procure er filtreret til `destinationArt: "procure"`. Risiko: to skærme, samme tal — lav i dag fordi de deler samme matchfunktion.
- **Dashboard "Største afvigelser" og Økonomi "Største afvigelser"**: Samme `k.afvigelser`-felt fra KPI-aggregatet — bevidst, rettet mockup-fejl. Feltet er dog permanent tomt i produktion, så begge kort altid viser "Ingen afvigelser i perioden", hvilket kan fejllæses som "der er ingen afvigelser" i stedet for "aggregeringen er ikke bygget".
- **Økonomi "Opgaver klar til fakturering" og Fakturering-skærmen**: Begge titler antyder samme koncept, men Økonomis liste er 100 % demo-data (`DEMO_KLAR_TIL_FAKTURERING`) mens Fakturering viser ægte `grundlag`-poster i kladdetilstand. Risiko for at en bruger tror det er samme datakilde vist to steder.
- **Dashboards modulkort for Warehouse/Unitbooking**: Ville i princippet vise samme nøgletal som modulernes egne dashboards, men viser i dag eksplicit "Tallene aggregeres ikke endnu" — intet reelt overlap før aggregeringen findes.
- **Facility "Klima nu" (Overblik) og zonetabellen (Klima)**: Bevidst ét datasæt vist to steder (`zonePar()` kaldt to gange, samme to noder) — rettet historisk mockup-uenighed.
- **Facility "estimeret omkostning" pr. anlæg (Overblik) og Servicekalenderens "Anslået omkostning"-KPI**: Beskriver samme underliggende tal, men Overblik-kolonnen slår i praksis op i `DEMO_SERVICEBESOEG` i stedet for den hentede opgaveliste — kan derfor vise et estimat der afviger fra Servicekalenderens aggregerede KPI. Middel risiko, IKKE PÅVIST hvorfor koden gør dette.
- **Fleets `Modulfakturaer art="fleet"` og Fakturacenteret/Procure → Fakturaer**: Eksplicit dokumenteret som samme fakturaer set gennem sagens linse, ikke duplikeret data.
- **Facility Servicekalender og Fleets Værkstedskalender/Driftskalender**: Samme `opgaver`-node og samme `Gitterkalender.jsx`-komponent, adskilt kun af `art`-feltet. Data er ikke duplikeret, men to selvstændige kalenderskærme viser begrebsmæssigt "book en reparationstid" for hver sin ressourcetype.
- **Bemanding (`/bemanding`) kapacitetstal og Dashboard**: Samme `kpi/`-kilde for kapacitetsgrad/disponeret/planlagt/chauffør-tal — historisk regnet forskelligt (84% vs 83%), nu samlet i én funktion.
- **Bookingoversigtens KPI-kort og Dashboard**: Begge læser samme `kpi/`-domæner via `useKpi()` — tilsigtet genbrug, men to steder med lidt forskellig ramme kan opfattes som uenige.
- **Kunder.jsx `prisgruppe`-filter og Kundepriser.jsx**: Samme felt vist på begge skærme; feltet bærer ikke længere en pris (kun standard+kundeafvigelse gør), men kan let læses som om det stadig gjorde.
- **Chaufførappens Turplan og kontorets Rute & status/Disponering**: Samme `etaper`/`statushaendelser`-noder, to visninger (personId-filtreret vs. alle) — ikke to kilder til ét tal, men kan forveksles med to uafhængige moduler ved en skærmbilledesammenligning.
- **Chaufførappens Indberetning og Flåde → Indberetninger (kontor)**: Samme `indberetninger`-node, filtreret modsat vej (egen uid vs. alle).
- **Chaufførappens Timeregistrering (`stemplinger`) og Workforce/Bemanding-modulet**: Noden ejes af `bemanding`, men ingen af de fire Workforce-kontorskærme (Bemanding, Kompetencer, Fravær, Medarbejdere) læser eller viser den — kun chaufførens egen skærm gør. IKKE PÅVIST om en administrativ visning findes andetsteds.

## Steder hvor samme handling kan udføres flere steder

- **Fakturacenter og Procure → Fakturaer**: Destinationssætning og godkendelse kan i praksis udføres fra begge skærme på samme underliggende fakturaposter (samme node, samme Cloud Functions). Lav risiko i dag fordi matchlogikken er delt, men risiko ved fremtidige ændringer i kun den ene fil.
- **Disponerings dagsgitter (`/booking/disponering`, fane Dag) og Flådens Driftskalender (`/flaade`)**: Begge læser/skriver samme `opgaver`-node (art `vaerksted`) via de samme Cloud Functions (`opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`) og genbruger bogstaveligt de samme komponenter. En bruger med adgang til begge moduler kan redigere præcis de samme værkstedsopgaver fra to steder.
- **Disponerings ugesgitter og Facilitys Servicekalender**: Samme mønster (delt skrivevej `facilityplanlaeg`, delt komponentsæt), mindre risiko fordi feltskemaerne er forskellige.
- **Warehouse Modtagelse (`/warehouse/modtagelse`) og Bevægelser (`/warehouse/bevaegelser`, art `putaway`)**: Modtagelse er en guidet, forenklet brugerflade oven på præcis samme Cloud Function-kald som findes generisk i Bevægelser. To indgange til samme handling — uklart for en bruger hvilken skærm der er "den rigtige".
- **Warehouse Pluk (Plukpanel på `/warehouse/pluk`) og Bevægelser (art `pluk`)**: Samme forhold som ovenfor — kontekst-bunden variant af samme `skrivBevaegelse({art:"pluk"})`-kald.
- **Fravaer.jsx (kontorets fraværsvisning) og app/Frihed.jsx (chaufførens ansøgningsskærm)**: Begge kan skrive til samme `fravaer`-node, men ad forskellige veje — kontorets "Registrér fravær"-knap er deaktiveret, mens chaufførens selvbetjenings-gren reelt virker. En bruger der kun kender kontorsiden, kan fejlagtigt tro fraværsregistrering slet ikke er bygget.
- **`reservationer`-noden skrevet fra fire kilder**: Booking (prioritet 10), Fleets værkstedsreservationer (prioritet 40), Facilitys facility-sag (prioritet 20) og Bemandings fravær (prioritet 30) skriver alle til samme base-node med hver sin prioritet — arkitektonisk bevidst delt skrivevej, men et sted hvor forkert gating historisk har afskåret hele reservationssæt for en kunde uden Planning-modulet.
- **Fleets `opgaver`-node med fire skriveveje**: `opgaveplanlaeg`, `facilityplanlaeg`, `opgaveflyt`, `opgavestatus` — alle skriver den samme node (art vaerksted/facility), fra hver sit modul (Fleet/Facility), atomisk med reservationen.

## Administrative funktioner blandt daglige arbejdsfunktioner

- **Enheder, Medarbejdere og Kasseliste er alle menuplaceret under Opsætning, selvom de er modul-ejet stamdata for henholdsvis Fleet, Workforce/Bemanding og Unitbooking.** Dette er en gennemgående, bevidst mønster ("grab-bag med vilje", dossier 09) — Opsætning er den ene menu enhver kunde altid har adgang til, så disse stamdata-skærme er flyttet dertil for synlighed, mens node/permission/modul-ejerskab er uændret. Dossier 03 fremhæver eksplicit risikoen for at forveksle Medarbejdere (`/opsaetning/medarbejdere`, personId — personen) med Opsætning → Brugere & roller (uid — loginet) som "nu naboer i menuen".
- **Kunder & Priser har intet topniveaupunkt overhovedet og nås kun via Opsætning-menuen**, selvom Kunder.jsx selv er en daglig drifts-/salgsopfølgningsskærm ("Daglig drift (kunderelation/salgsopfølgning) snarere end opsætning, men fysisk placeret under Opsætning-menuen som stamdata" — dossier 09).
- **Lagermedarbejderen ser Bookingopsætning- og hele Procure-menuen**, selvom intet i rollens arbejdsbeskrivelse (Unitbooking + Warehouse) nævner booking- eller indkøbsadministration. Årsagen er teknisk: rollen har `satser.laes` og `indkoeb.laes` (2 af 3 kommercielle læsninger, nødvendige for at se priser i eget lagerarbejde), og `kraeverPerm`-filtret i `nav.js` er permission-baseret, ikke rolle-baseret — så et administrativt/kommercielt menupunkt ligger fremme for en rolle hvis daglige arbejde er noget helt andet. Eksplicit dokumenteret i `docs/product-audit/05_ROLES_AND_PERMISSIONS.md` under rollen Lagermedarbejder ("⚠ Iagttagelse til 08/10 (UI/overlap)").
- **Revisor-rollen ser samtlige `kraeverPerm`-styrede menupunkter** (Bookingopsætning, hele Procure, Fakturacenter, Fakturering, Standardpriser, Kundepriser, Warehouse Afregning/Volumen), fordi rollen har alle tre kommercielle læse-permissions — men enhver skrive-handling afvises server-side. Roller-dokumentet flagger selv at dette bør testes i en UI-gennemgang: er fejlbeskeden ved en afvist "Gem"-handling tydelig nok til at forklare hvorfor?
- **Sidebar-menuen er generelt IKKE rollefiltreret for andet end de tre kommercielle permissions** (`satser.laes`, `grundlag.laes`, `indkoeb.laes`) — enhver rolle ser samtlige øvrige menupunkter og rammer i stedet en afvist-spærring ved klik. Dette betyder at daglige og administrative funktioner generelt blandes i navigationen for alle roller, ikke kun for enkelttilfælde — en bevidst designbeslutning ("en menu der mest består af døre der ikke kan åbnes, er værre end ingen menu"), men den er kun anvendt konsekvent for de tre kommercielle permissions, ikke resten.
- **Opsætning → Generelt har selv en "hvor rettes stamdata"-tabel** der linker videre til Medarbejdere, Kompetencer, Enheder, Kunder, Bookingopsætning, Leverandører, Facility og Brugere & roller — denne henvisningstabel er i sig selv et symptom på at stamdata er spredt over mange moduler og samlet administrativt ét sted, hvilket dossier 09 selv kalder en "erkendt navigationsudfordring".
