# Dossier 02 — Planning / Booking

Kilder: `src/moduler/booking/*.jsx`, `src/fleet/booking.js`, `booking-state.js`,
`disponer.js`, `disponering.js`, `opgaveplan.js`, `opgaveplan-regler.js`,
`rutestatus.js`, `reservations.js`, `etaper.js`, `stop.js`,
`src/fleet/Etapeskifte.jsx`, `Statusskifte.jsx`, `Planlaegdialog.jsx`,
`Stopoversigt.jsx`, `src/fleet/nav.js`, `moduler.js`, `permissions.js`,
`omkostninger.js`, `functions/index.js` (Cloud Functions), `App.jsx`.

---

## Modul-resumé

**Navn:** Planning (rute og RTDB-node hedder fortsat `booking`/`bookinger` —
navnet i UI'et er "Planning", jf. `nav.js`/`moduler.js`).

**Formål:** Fra transportforespørgsel til udført arbejde: opret en
forespørgsel, lav 1–3 forslag, godkend ét (fire-øjne), disponér køretøj/hænger/
chauffør, følg turen via chaufførens meldinger, og aflever et omkostnings- og
omsætningsgrundlag videre til Økonomi.

**Primær brugertype:** tre roller med hver sin opgave i samme flow —
casehandler (opretter), disponent (foreslår + disponerer værksted/langture),
koordinator (godkender/returnerer/afviser). Chaufføren optræder kun som
afsender af statusmeldinger (uden for dette moduls skærme).

**Vigtigste opgave:** booke og gennemføre transportforløb (etaper) med en
håndhævet fire-øjne-kontrol mellem "forslag" og "godkendelse" (beslutning 5).

**Vigtigste funktioner:**
- Arbejdsliste over åbne opgaver og bookinger, med KPI-overblik (Oversigt)
- Oprettelse af ny forespørgsel som kladde, med serverudstedt BKG-nummer
- Forslag & godkendelse pr. etape — disponenten foreslår, koordinatoren
  godkender, returnerer eller afviser
- Disponering: dagsgitter (værkstedsopgaver, træk/slip, opret) og ugesgitter
  (etaper/langture, kun visning — binding sker via forslag)
- Rute & status: planlagt rute og chaufførens meldinger — ingen GPS
- Bookingopsætning: omkostningssatser (bil/færge-bro/agent) + eksempelberegning

**Undermoduler/skærme:** Oversigt, Ny forespørgsel, Forslag & reservation
(skjult i nav, nås via link), Disponering, Rute & status (gammelt navn
"Live-kort"), Bookingopsætning.

**Afhænger af (andre moduler):** Kunder — `MODUL_KRAEVER.booking = ["kunder"]`
fordi `bookinger` har et påkrævet `kundeId`; uden Kunder kan ingen booking
oprettes.

**Afhænges af (hvem læser dette modul):** Økonomi/Fakturering (omsætning,
`ikkeFaktureretForloeb`, fakturagrundlag via etapens omsaetning); Flåde og
Facility deler den samme `reservationer`-node og `opgaver`-node (se
Data-entiteter); transportlabels (Warehouse) udleder typen af etapekæden.

**Samlet status:** Kerneflowet (opret → forslag → fire-øjne-godkendelse →
etapeskift/reservation → status/opfølgning) er **BUILT** med rigtige
Cloud Functions og RTDB-noder. Bookingopsætning (satsvedligehold) er
**PARTIAL** — visning og beregning er ægte, men "Tilføj/Redigér sats"-knapperne
skriver ikke. Ruteoptimering og koordinator-notifikation er **NOT_BUILT**.

**Overlap-mistanke:** Disponerings dagsgitter deler node (`opgaver`), skriveveje
(`opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`) og komponenter
(`Gitterkalender.jsx`, `Planlaegdialog.jsx`, `Statusskifte.jsx`) med Flådens
Driftskalender og Facilitys Servicekalender — kun `art`-feltet (`vaerksted` vs.
`facility`) adskiller dem. Se "Mulige overlap".

---

## Skærme

### `/booking` — Oversigt ("Alle opgaver")
- **Hvem bruger den:** alle med `booking.laes` (alle syv roller); primært
  disponent/koordinator/casehandler til daglig arbejdsliste.
- **Primært formål:** arbejdsliste — hvad kræver handling i dag, på tværs af
  værkstedsopgaver (egen flåde) og kundebookinger.
- **Primær handling:** filtrere (enhed/status), skifte mellem fanerne
  "Opgaver"/"Bookinger", klikke videre til en booking.
- **Sekundære handlinger:** "Vis N afsluttede" (skjuler færdige forløb som
  standard); inline etapeskifte-knapper i panelet "Hvad du må lige nu"
  (genereret af `tilgaengeligeEtapeHandlinger()` + `Etapeskifte`-komponenten;
  forslagsbærende overgange er ikke her, kun en henvisning).
- **Data vist:** KPI (nye bookinger, i gang i dag, forsinkede,
  ikke-faktureret), opgave-tabel, booking-tabel (nummer, kunde, rute, type,
  **afledt** tilstand fra etaperne, omsætning, antal/åbne etaper), "Kræver
  handling"-liste, dagens plan, stopoversigt (bynavne, ingen positioner).
- **Data der kan ændres:** etapetilstand via de ikke-forslagsbærende
  overgange (fx kladde→afventerPlan, annullér) — skriver via `skiftEtape()` →
  Cloud Function `etapeskift`.
- **Kommer typisk fra:** Ny forespørgsel (nye kladder lander her), Disponering
  og Forslag (opdaterede etaper).
- **Går typisk til:** `/booking/forslag/:id`, `/booking/disponering`,
  `/oekonomi/fakturering`, `/indkoeb`.
- **Overlap med anden side:** samme KPI-kilder som Dashboard;
  fakturerings-tallet deles med Økonomi.
- **Status:** BUILT — læser `bookinger`, `etaper`, `kunder`, `opgaver`,
  `koeretoejer`, `personale` direkte fra noderne; skriver via `etapeskift`.
- **Demo-data:** ja, men kun som `useListe(node, { demo: … })`-faldbakke —
  bruges ikke når en rigtig database findes.
- **Nødvendig for:** daglig drift.

### `/booking/ny` — Ny forespørgsel
- **Hvem bruger den:** casehandler (kræver `booking.opret`); også koordinator
  og admin har permissionen.
- **Primært formål:** oprette en ny transportforespørgsel som **kladde** (én
  booking + én etape + to stop).
- **Primær handling:** "Opret forespørgsel" → `opretBooking()` → Cloud
  Function `bookingopret`, som skriver booking+etape+stop atomisk og henter
  bookingnummeret (`BKG-ÅÅÅÅ-NNNNN`) fra en counter-transaction.
- **Sekundære handlinger:** ingen — at sende kladden videre til planlægning er
  et separat etapeskift, gjort andetsteds (fx Oversigt), bevidst ikke samlet i
  én knap ("kan ikke lægges sammen atomisk").
- **Data vist:** kundevælger (kun aktive kunder), transporttype,
  rutepræference, afhentning/levering med påkrævet fleksibilitetsspænd,
  omsætning (ekskl. moms, hele øre), udstyrskrav, kundekrav; et panel der
  forhåndsviser `kanSkifteEtape()`-svaret og hvad næste etapeskift ville sætte.
- **Data der kan ændres:** opretter en helt ny booking+etape (ingen
  redigering af eksisterende).
- **Kommer typisk fra:** KPI-kortet "Nye bookinger" på Oversigt/Dashboard.
- **Går typisk til:** Oversigt (den nye kladde vises der). Bemærk: hjælpeteksten
  linker til et hårdkodet eksempel-id (`/booking/forslag/bk-2026-00314`) som
  ikke nødvendigvis findes i en given database — en statisk demonstrations-
  reference, ikke en dynamisk henvisning.
- **Overlap med anden side:** ingen væsentligt.
- **Status:** BUILT — rigtig skrivning via `bookingopret`; ingen `id`,
  `nummer` eller `tilstand` sendes fra klienten (serveren sætter dem).
- **Demo-data:** ja, kun som fallback for kundelisten (`DEMO_KUNDER`).
- **Nødvendig for:** daglig drift.

### `/booking/forslag/:id` — Forslag & reservation (skjult i sidebar)
- **Hvem bruger den:** disponent (laver forslag — reelt via `Disponering` /
  `Forslagsdialog`, ikke direkte på denne skærm) og koordinator
  (`booking.godkend` — godkender/returnerer/afviser her).
- **Primært formål:** koordinatoren tager stilling til de 1–3 forslag
  disponenten har lavet på en etape, og godkender ét — det trin der reelt
  binder køretøj, hænger og chauffør.
- **Primær handling:** vælg et forslag (hele rækken er klikbar) → "Godkend
  valgt forslag" → `skiftEtape()` → Cloud Function `etapeskift`.
- **Sekundære handlinger:** "Returnér til disponent", "Afvis alle" (kræver
  begrundelse); se de fem disponeringstjek for det valgte forslag FØR man
  trykker; trukne forslag vises men kan ikke vælges.
- **Data vist:** booking-header, etapevælger ved flere etaper (forløbet
  godkendes etape for etape — "delvist" er den synlige konsekvens), forslags-
  tabel (enheder, chauffør, tider, transit, estimat, note), de fem
  disponeringstjek (samme funktion som serveren kører), "to slags nej"
  (manglende permission vs. manglende valg).
- **Data der kan ændres:** etapetilstand + reservationer + bookingens afledte
  tilstand, skrevet i én transaktion af `etapeskift`.
- **Kommer typisk fra:** Oversigt ("Se forslag"-link), Disponerings
  detaljepanel.
- **Går typisk til:** tilbage til Oversigt/Disponering.
- **Overlap med anden side:** Disponering viser de samme etaper og kalder den
  samme `tjekDisponering()` — bevidst delt, ikke en kopi.
- **Status:** BUILT — reel læsning af `etaper`, `reservationer`, `kunder`,
  `koeretoejer`, `personale`, `kompetencer`; reel skrivning via `etapeskift`
  (etaper/reservationer er `.write:false` for alle, kun Cloud Function skriver).
- **Demo-data:** ja, kun som fallback for booking-opslaget (`DEMO_BOOKINGER`).
- **Nødvendig for:** daglig drift (fire-øjne-godkendelse).

### `/booking/disponering` — Disponering
- **Hvem bruger den:** disponent (`opgaver.skriv` til dagsgitteret,
  `booking.foreslaa` til ugesgitteret).
- **Primært formål:** to adskilte visninger på to forskellige noder —
  dag (`opgaver`, art `vaerksted`, timegitter 06–18) og uge (`etaper`,
  døgngitter 7 dage, langture og grænseovergange).
- **Primær handling:** dag — klik et ledigt felt åbner `Planlaegdialog`
  (opretter opgave+reservation atomisk); træk en blok flytter den
  (`flytOpgave`). Uge — vælg en blok → detaljepanel → "Foreslå tur" åbner
  `Forslagsdialog` (skriver et forslag på etapen, spærrer intet selv).
- **Sekundære handlinger:** `Statusskifte` på valgt værkstedsopgave; "Træk
  tilbage" på et aktivt forslag (`traekForslag`); link videre til Forslag for
  selve godkendelsen.
- **Data vist:** KPI (planlagte opgaver, uplanlagte, "ledig kapacitet" —
  altid en streg, definitionen er bevidst ubesvaret, forsinkelsesrisiko,
  konflikter — hele platformen), to gitre, "Konflikter og advarsler i det
  viste vindue" (samme fem tjek som Forslag, kørt på det synlige udsnit),
  "Uplanlagt" (åbne etaper), detaljepanel (opgave eller etape).
- **Data der kan ændres:** værkstedsopgaver (opret/flyt/status) og etape-
  forslag (opret/træk). Ugesgitteret flytter IKKE etaper — det er bevidst:
  binding sker kun via godkendt forslag.
- **Kommer typisk fra:** Oversigt, Dashboard.
- **Går typisk til:** `/booking/forslag/:id` (fra en valgt etape),
  `/booking/opsaetning` ("Se satserne").
- **Overlap med anden side:** dagsgitteret deler node, skrivefunktioner og
  komponenter (`Gitterkalender`, `Planlaegdialog`, `Statusskifte`) med Flådens
  Driftskalender og Facilitys Servicekalender — kun `art`-feltet adskiller dem.
- **Status:** BUILT for dagsgitteret (reel skrivning via `opgaveplanlaeg`/
  `opgaveflyt`/`opgavestatus`, som hver skriver opgave+reservation atomisk).
  Ugesgitteret er bevidst view-only (etapebinding sker via Forslag), ikke et
  hul. Ingen ruteoptimering — al tildeling er manuel.
- **Demo-data:** ja, kun fallback for køretøjer/personale/kompetencer/
  leverandører/opgaver.
- **Nødvendig for:** daglig drift.

### `/booking/live-kort` — Rute & status (gammelt navn "Live-kort")
- **Hvem bruger den:** disponent/koordinator/casehandler der følger op på en
  igangværende tur. Ruten er uændret fra det gamle `/tracking`-bogmærke
  (redirect bevaret).
- **Primært formål:** vise den planlagte rute og chaufførens meldinger —
  **ingen GPS, ingen sporing** (beslutning 22, eksplicit i UI-teksten).
- **Primær handling:** vælge en tur i listen → tidslinje med planlagt rute
  og meldingshistorik.
- **Sekundære handlinger:** ingen — "FASE 0: VISNING. Ingen skrivning."
- **Data vist:** KPI (undervejs, ikke meldt begyndt, melder forsinkelse,
  "Positioner" = "—" med noten "ingen sporing"), turliste (bil, chauffør,
  afgang, forventet fremme, næste stop, afvigelse fra plan, "sidst hørt" —
  minutter siden sidste melding, ikke en position), tidslinje (planlagt rute
  + chaufførens meldinger, sorteret på meldingens eget tidsstempel).
  Afvigelse vises som "ukendt" når intet kan måles — aldrig "0 min." som
  ville påstå rettidighed.
- **Data der kan ændres:** intet fra denne skærm.
- **Kommer typisk fra:** Oversigt/Disponering, gammelt `/tracking`-bogmærke.
- **Går typisk til:** `/booking/disponering`.
- **Overlap med anden side:** ingen i dag.
- **Status:** BUILT som ren visning — læser `etaper`, `koeretoejer`,
  `personale`, `statushaendelser` fra rigtige noder; ingen skriveflade i denne
  skærm (chaufførens meldinger skrives via Cloud Function `statusmelding`,
  uden for dette moduls skærmfiler).
- **Demo-data:** ja, kun fallback.
- **Nødvendig for:** daglig drift/opfølgning.

### `/booking/opsaetning` — Bookingopsætning (kræver `satser.laes`)
- **Hvem bruger den:** koordinator/admin — opsætning, ikke daglig drift.
- **Primært formål:** vedligeholde omkostningssatser (bil-km, færge/bro-
  passager, agent-parkering) som prismotoren (`beregnBooking()`) bruger, samt
  vise en eksempelberegning med de samme satser en rigtig booking ville få.
- **Primær handling:** skifte mellem fem faner (Generelt, Omkostninger &
  satser, Agenter, Prisregler, Bilomkostninger).
- **Sekundære handlinger:** "Tilføj sats" / "Tilføj agent" / "Redigér sats" /
  "Gem ændringer" — **disse knapper skriver ikke**. De sætter kun en lokal
  `aendret`-state (`setAendret(true)`); "Gem ændringer" nulstiller blot samme
  flag (`onClick={() => setAendret(false)}`). Der findes intet kald til
  `gem()`/`skriv.js`/en Cloud Function i filen for at persistere en ny eller
  ændret sats.
- **Data vist:** satsark fra noden `omkostninger` (poster/agenter/biler),
  eksempelberegning for en Gods-rute København→Hamburg via Femern.
- **Data der kan ændres:** reelt ingenting — se ovenfor. Fanerne "Generelt"
  og "Prisregler" er eksplicit "ikke tegnet endnu" (`<Tom>`).
- **Kommer typisk fra:** Disponerings detaljepanel ("Se satserne").
- **Går typisk til:** intet videre.
- **Overlap med anden side:** Kunder & Priser (kundens salgspriser — bevidst
  adskilt fra denne skærms driftsomkostninger, jf. beslutning 11).
- **Status:** PARTIAL — læsning og beregning er BUILT (reel node, reel delt
  `beregnBooking()`-funktion), men satsvedligehold (oprettelse/redigering) har
  ingen skrivevej. Skærmen ser redigerbar ud (knapper, "Gem ændringer") men
  gemmer intet.
- **Demo-data:** ja, kun fallback (`DEMO_OMKOSTNINGER`).
- **Nødvendig for:** admin/opsætning.

---

## Data-entiteter

| Entitet | RTDB-node(r) | Ejes af (NODE_MODUL) | Bruges også af | Kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| Booking | `bookinger` | `booking` | Økonomi/Fakturering (omsætning, faktureringsstatus) | `tilstand` er **denormaliseret/afledt** af etaperne (`forloebstilstand()`); skrives kun af Cloud Function `etapeskift` i samme transaktion som et etapeskift. Ingen `kanSkifte()`/`byggSkifte()` findes længere på en booking (beslutning 40). |
| Etape | `etaper` | `booking` | Disponering (dags-/ugesgitter), Rute & status, transportlabels (Warehouse) | Etapens `tilstand` er den reelle tilstandsmaskine (`ETAPE_OVERGANGE`). Bærer `koeretoejIder` som liste (sættevogn = 2 enheder), ikke ét felt. |
| Forslag | `etaper/<id>/forslag/<forslagId>` (ikke egen node) | `booking` | Forslag.jsx, Disponering | Nøglet objekt, ikke array (beslutning 58); trukne forslag slettes ikke (`trukketMs`/`trukketAf`), loft på 3 aktive. |
| Reservation | `reservationer/<type>/<id>/<resId>` | **Delt/BASE** — ikke gated på ét modul (beslutning 92) | Flåde (værksted, prioritet 40), Facility (facilitySag, prioritet 20), Bemanding (fravær, prioritet 30) | Skrives af flere kilder; booking har den laveste prioritet (10) af de "rigtige" kilder — et værkstedsbesøg eller fravær vinder altid over en booking. |
| Omkostninger | `omkostninger` | `booking` | Bookingopsætning, prismotoren (`pricing.js`) | Tre arter i én node (bil/passage/agent) med hver sit nøgleformat; satser har `gyldigFra`, overskrives aldrig. |
| Statushændelser | `statushaendelser/<etapeId>/<klientId>` | `booking` | Rute & status | Menneskeligt meldt, ikke en måling; tidsstempel fra telefonen, ikke serveren; ingen position (beslutning 22). |
| sensitive/bookinger, vaerdi/bookinger | satellitnoder | `booking` | — | Gated separat med `bookingSensitiveLaes`/`bookingVaerdiLaes`; kun 4 objekter i hele systemet har denne finere adgang. |
| Opgaver (værksted) | `opgaver` (art=`vaerksted`) | **Delt** med Facility (art=`facility`) | Flådens Driftskalender | Samme node, samme skriveveje, forskelligt feltskema pr. art; Disponerings dagsgitter viser kun `art:"vaerksted"`. |
| Kunder | `kunder` | Kunder-modulet | Booking (påkrævet `kundeId`) | Booking kan ikke oprettes uden Kunder-modulet (`MODUL_KRAEVER`). |

---

## Implementation-status

**Booking-oprettelse:** BUILT. Reel skrivning via Cloud Function `bookingopret`
(booking+etape+stop atomisk, BKG-nummer fra transaction-counter). Kompromis:
kladden oprettes alene — at sende den videre til planlægning er et separat
etapeskift, "fordi de to ikke kan lægges sammen atomisk" (bevidst designvalg,
ikke en mangel).

**Forslag:** BUILT. `skrivForslag()` → Cloud Function `forslagskriv`, som
kører de samme fem disponeringstjek som godkendelsen. Loft på 3 aktive
forslag; trukne forslag bevares med spor.

**Godkendelse/fire-øjne (beslutning 5):** BUILT og håndhævet server-side.
Rollen `disponent` mangler bevidst `booking.godkend` i `permissions.js`
(`ROLLE_PERMS.disponent`), og Cloud Function `etapeskift` prøver den samme
`kanSkifteEtape()` som klienten viser — inkl. et eksplicit tjek for at et
trukket forslag ikke kan godkendes. `etaper`/`reservationer` er `.write:false`
for alle, også admin, så et direkte databaseskriv ikke kan omgå kontrollen.

**Disponering (tildeling af køretøj/hænger/chauffør):** Dagsvisning
(værkstedsopgaver) BUILT med reel læse-/skrivevej og træk/slip. Ugesvisning
(etaper/langture) er bevidst view-only — reel binding af enhed/chauffør sker
udelukkende via en godkendt forslag i Forslag-skærmen, ikke via gitteret.

**Direkte/dedikeret/kombi-booking:** Kun et `TRANSPORTTYPE`-katalog findes
(fuldlast, delparti, temperatur, farligtGods, "Kombineret transport") som
et enkelt dropdown-felt på Ny forespørgsel. Datamodellen (`bookingOpdatering`)
understøtter flere strækninger (`post.straekninger`) pr. booking, men
skærmen "Ny forespørgsel" bygger kun ÉT afhentnings-/leveringspar — der er
ingen UI til at oprette en booking med flere etaper direkte. IKKE PÅVIST
nogen yderligere logik der skelner "direkte" fra "dedikeret" transport ud
over selve transporttype-labelen.

**Tidsvinduer:** BUILT for ønsket afhentning/levering med påkrævet
fleksibilitetsspænd (`FLEKSIBILITET`: fast, ±2t, ±halvdag, ±dag) og for
per-stop-tidsvinduer (`stop.js`, `fraMs`/`tilMs`). Kunders generelle
åbningstider (uafhængigt af en konkret booking) er IKKE PÅVIST.

**Ruteoptimering:** NOT_BUILT. Ingen søgning efter rute/optimerings-/HERE-/
geokodningslogik gav træf i `etaper.js` eller andre gennemgåede filer.
`Bookingopsaetning.jsx` skriver eksplicit at broer/færger på en tur kommer fra
et fremtidigt "ruteopslag" og at geografisk validering er et "ÅBENT
SPØRGSMÅL", bundet til en HERE-integration der endnu ikke findes
(`ARKITEKTUR.md`). Al tildeling i Disponering er manuel.

**Planner-advarsler:** BUILT. `tjekDisponering()` i `disponering.js` samler
fem tjek (enhedskombination, kompetencer, kapacitet, reservationskonflikt,
køre-hviletid), vist identisk i Disponering (vindue-bredt) og Forslag (pr.
valgt forslag), med samme skel mellem blokerende ("bad") og advarende ("warn")
fund. Håndhævet server-side i `etapeskift`/`forslagskriv` med samme funktion.

**Koordinator-notifikation:** NOT_BUILT. Ingen mail- eller
notifikationslogik fundet i `functions/index.js` knyttet til booking-
godkendelse/-afvisning/-returnering (søgning efter mail/notifikation gav kun
træf i uafhængige funktioner som brugeroprettelse og supportsager). Den
eneste synlighed er in-app: Oversigtens "Kræver handling"-liste, Disponerings
detaljepanel og Forslag-skærmen selv — koordinatoren skal aktivt navigere dertil.
Etapens historik (`byggEtapeSkifte()`) registrerer hvem/hvornår/hvorfor, men
sender det ikke videre til nogen.

**Omkostning/CO2:** Omkostning BUILT (`omkostninger.js`, satsark med
gyldighedsperioder, `beregnBooking()`/`beregnForloeb()` i `pricing.js`, samme
funktion bruges i Bookingopsætnings eksempel og i selve bookingflowet).
CO2/emission: IKKE PÅVIST — ingen felt, beregning eller UI-reference til CO2
eller udledning fundet i moduler.js' beskrivelse af booking eller i de
gennemgåede filer.

**Samlet brugbarhed end-to-end:** Selve transportflowet (opret → forslag →
godkend → reserver → udfør, med fire-øjne og reelle tjek) er brugbart
end-to-end med rigtig backend. Satsvedligehold i Bookingopsætning er det
eneste sted i dette modul hvor UI'et lover en skrivning der ikke sker.

---

## Workflow-observationer

Fuld sporing af den tilsigtede pipeline, med hvad der reelt er bygget vs.
manuelt/manglende ved hvert trin:

1. **Forespørgsel oprettes** (`NyForespoergsel.jsx` → `opretBooking()` →
   Cloud Function `bookingopret`, `functions/index.js:3281`). BUILT. Skriver
   booking + én etape + to stop atomisk; tildeler `BKG-ÅÅÅÅ-NNNNN` fra en
   counter-transaction (`naesteBookingnummer()` i `booking-state.js`).
   Starter altid i tilstand `kladde`.

2. **Send til planlægning** — et separat etapeskift (`kladde → afventerPlan`,
   kræver `booking.opret`), udført fra fx Oversigtens "Hvad du må lige nu"-
   panel via `Etapeskifte.jsx` → `skiftEtape()` → Cloud Function `etapeskift`
   (`functions/index.js:2843`). BUILT, men et bevidst separat kald fra
   oprettelsen (kan ikke lægges atomisk sammen med trin 1).

3. **Match/forslag** (`Disponering.jsx` → `Forslagsdialog.jsx` →
   `skrivForslag()` → Cloud Function `forslagskriv`,
   `functions/index.js:3141`). BUILT. Disponenten (kræver `booking.foreslaa`)
   laver 1–3 forslag pr. etape (enhed(er), chauffør, tider, transit, estimat).
   Kører de samme fem disponeringstjek som godkendelsen, så et forslag der
   ikke kan godkendes, opdages med det samme. Forslaget binder INTET —
   ingen reservation skrives her.

4. **Reservation/godkendelse** (`Forslag.jsx` → koordinator vælger et forslag
   → `skiftEtape()` → Cloud Function `etapeskift`, gren `tilTilstand ===
   "reserveret"`). BUILT og håndhævet: koordinatoren (kræver
   `booking.godkend`, som disponenten IKKE har — beslutning 5) godkender.
   `etapeskift` kører de fem tjek igen server-side (`spaerringerFor()`),
   binder enheden/enhederne + chaufføren på etapen, og skriver én reservation
   pr. ressource i samme opdatering som tilstandsskiftet og bookingens
   afledte tilstand (`forloebstilstand()`).

5. **Disponering — dag (værksted) vs. uge (langture)**
   (`Disponering.jsx`). Dagsgitteret (opgaver, art `vaerksted`) er BUILT med
   reel træk/slip og oprettelse (`opgaveplanlaeg`/`opgaveflyt`). Ugesgitteret
   (etaper) er kun visning — trin 3–4 er den reelle bindingsmekanisme for en
   etape, ikke et træk i gitteret. Ingen automatisk/optimeret tildeling
   nogen steder — alt er manuelt valg af enhed og chauffør i
   `Forslagsdialog.jsx`.

6. **Transport / faktisk gennemførelse** — chaufføren melder status
   (`statusmelding`-funktion, uden for dette moduls skærmfiler) og etapen
   skiftes videre til `udfoert` via `Etapeskifte`/`etapeskift`. BUILT som
   skrivevej; INGEN GPS/sporing (beslutning 22, eksplicit i
   `LiveKort.jsx`/`rutestatus.js`).

7. **Rute & status-opfølgning** (`LiveKort.jsx`). BUILT som ren visning: den
   planlagte rute (`planlagteStop()`), chaufførens meldinger
   (`meldingerFor()`), afvigelse fra plan (kun når noget faktisk kan måles),
   og "sidst hørt" i minutter — den ærlige erstatning for en position.

8. **Omkostning/pris** — beregnes via `pricing.js`s `beregnBooking()`/
   `beregnForloeb()` mod satsarket i `omkostninger`-noden
   (`omkostninger.js`, læst i `Bookingopsaetning.jsx`). BUILT som beregning
   og læsning; satsvedligehold (oprette/redigere en sats) er IKKE bygget —
   se Bookingopsætning i "Skærme".

9. **Koordinator-feedback/notifikation** — NOT_BUILT. Ingen mail eller
   push-notifikation når en koordinator godkender/afviser/returnerer; kun
   in-app synlighed for den der selv navigerer til skærmen.

---

## UI-mønstre

- **Navigation:** `booking`-nøglen i `nav.js` genererer sidebar-gruppen
  "Planning" med fem synlige børn og ét skjult (`forslag`, nås kun via
  direkte link/detaljepanel — `skjulINav: true`). Gammel rute `/tracking`
  redirectes til `/booking/live-kort`, `/dispatch` til
  `/booking/disponering` (`REDIRECTS` i `nav.js`).
- **Card/KPI-design:** `<KpiKort>`/`<KpiRaekke>` gennemgående; runde ikoner på
  Planning-skærme (afrundede firkanter er Dashboards egen stil).
  Ikon-toner (`ikon-1`…`ikon-6`) forstærker, tal og tekst bærer.
- **Tabeller:** `<Tabel>`-komponenten bruges konsekvent, inkl. `paaRaekke`/
  `erValgt` for klikbare hele rækker (Forslagstabellen — ikke kun en lille
  radioknap) og `noegle`-prop for stabile React-nøgler på nøglede
  (ikke-array) RTDB-strukturer.
- **Filtre:** `.fc-filtre`/`.fc-felt` (Oversigt: enhed, status). Bevidst
  UDEN periode/afdeling — periodevælgeren ejes af shellens topbar, division
  findes ikke længere (beslutning 70).
- **Modaler/dialoger:** `<Dialog>`-komponent med `<Formular>` (fælles
  gem/annuller/fejlvisning-mønster) — `Forslagsdialog.jsx`,
  `Planlaegdialog.jsx`, `Skiftedialog` (i `Etapeskifte.jsx`),
  `Tidsdialog` (i `Statusskifte.jsx`).
- **Statusfarver:** `<Pille tone="...">` med toner `ok`/`warn`/`bad`/`info`,
  label OG farve hentet fra ét fælles katalog pr. domæne (`TILSTAND` for
  etaper/bookinger, `OPGAVE_STATUS` for opgaver, `HAENDELSE` for meldinger) —
  aldrig en friskrevet streng i selve skærmen.
- **Knapper:** `<Knap variant="primaer"|"sekundaer">`; kun én primær knap ad
  gangen pr. tilstand (`PRIMAER`-map i `Etapeskifte.jsx`/`Statusskifte.jsx`).
  Deaktiverede knapper bærer altid en `title` der forklarer hvorfor
  (manglende permission eller forudsætning) — aldrig en stum grå knap.
- **Kalender/gitter:** Fælles `<Gitterkalender>`-komponent (`gitter.js`) i
  Disponering, delt med Flådens Driftskalender og Facilitys Servicekalender;
  `ENHED.time`/`ENHED.dag` styrer kolonneopdeling.
- **Faner:** `.fc-faner`/`.fc-fane` med `role="tablist"`/`role="tab"` —
  Oversigt (Opgaver/Bookinger), Disponering (Dag/Uge), Bookingopsætning
  (fem faner).
- **Terminologi:** konsekvent dansk domænesprog — "forløb" (booking),
  "etape", "strækning", "forslag" (ikke reservation), "reserveret" (ikke
  "booket" i data, kun i pillens label "Reserveret / Booket"),
  "håndteringer" (ikke "paller" — se `stop.js`), "omkostning" (ikke "pris" —
  beslutning 11).

---

## Mulige overlap

- **Site A:** Disponerings dagsgitter (`/booking/disponering`, fane "Dag").
  **Suspected Site B:** Flådens Driftskalender.
  **Hvorfor:** begge læser/skriver den samme `opgaver`-node via de samme
  Cloud Functions (`opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`) og genbruger
  bogstaveligt de samme komponenter (`Gitterkalender.jsx`,
  `Planlaegdialog.jsx`, `Statusskifte.jsx`). Kun feltet `art:"vaerksted"`
  filtrerer Disponerings visning.
  **Risk:** en bruger med adgang til begge moduler ser og kan redigere
  præcis de samme værkstedsopgaver to steder — forvirring om "hvor hører
  dette hjemme", og enhver fremtidig UI-afvigelse mellem de to skærme (fx en
  ekstra kolonne) vil dele data uden at dele visning.

- **Site A:** Disponerings ugesgitter (etaper/langture).
  **Suspected Site B:** Facilitys Servicekalender (samme `opgaver`-node,
  `art:"facility"`).
  **Hvorfor:** samme mønster som ovenfor — delt skrivevej
  (`facilityplanlaeg`), delt komponentsæt.
  **Risk:** samme som ovenfor, mindre alvorlig fordi de to arter har helt
  forskellige feltskemaer og derfor sjældnere forveksles i praksis.

- **Site A:** Bookingoversigtens KPI-kort ("Nye bookinger", "I gang i dag",
  "Ikke-faktureret").
  **Suspected Site B:** Dashboard (modulkort/widgets).
  **Hvorfor:** begge læser samme `kpi/`-domæner via `useKpi()`.
  **Risk:** lav — det er den tilsigtede genbrugsmekanisme (`AFLEDT`/`KPI_KILDER`
  i `dashboards.js`/`kpi-aggregering.js`), men to steder der viser "samme" tal
  med lidt forskellig ramme (fx "Ikke-faktureret" vs. et bredere
  økonomital) kan læses som uenige af en bruger der ikke kender kilden.

- **Site A:** Reservations-noden som Booking skriver til (`reservationer`,
  kilde `booking`, prioritet 10).
  **Suspected Site B:** Flådens værkstedsreservationer (prioritet 40) og
  Bemandings fraværsreservationer (prioritet 30).
  **Hvorfor:** samme delte node, forskellige moduler skriver til den, og en
  kunde uden Planning-modulet kan stadig have data i noden fra de andre tre
  kilder (dokumenteret i `moduler.js` som en bevidst, men skrøbelig,
  konstruktion — se beslutning 92 i CLAUDE.md).
  **Risk:** en fremtidig ændring i Booking-modulets del af koden (fx en ny
  gating-regel på `reservationer`) kan utilsigtet bryde Flåde/Facility/
  Bemandings læsning af deres egne data, fordi noden ikke "hører til" noget
  enkelt modul.
