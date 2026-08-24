# Dossier 08 — Warehouse

Kilder: `src/moduler/warehouse/*.jsx` (11 skærme), `src/fleet/warehouse.js`,
`lager.js`, `volumen.js`, `qrkode.js`, `stregkode128.js`, `transportlabel.js`,
`reolplads.js`, `unitbooking.js` (delt `reolpladser`), `pricing.js`,
`fakturering.js`, `src/fleet/nav.js`, `moduler.js`, `permissions.js`,
`functions/index.js` (Cloud Functions `bevaegelseskriv`, `plukordreafsend`,
`optaellingskriv`), `App.jsx`.

---

## Modul-resumé

**Navn:** Warehouse (3PL-lagerhotel — modulnøgle `warehouse`).

**Formål:** Opbevare ANDRES gods (kundens, ikke vognmandens eget) og afregne
for håndtering ind, opbevaring og håndtering ud. Adskilt fra Indkøbs `lagre`
(reservedele, vores eget, en omkostning) — se gennemgående kommentarer i
`warehouse.js` og `moduler.js`.

**Primær brugertype:** lagermedarbejder (rollen har `varer.skriv`,
`bevaegelser.skriv`, `carriers.skriv`, `reolpladser.skriv` — se
`permissions.js` linje ~512-536); disponent/koordinator/admin for
afregning/volumen (kræver `satser.laes`); revisor/admin for indsyn.

**Vigtigste opgave:** modtag kundens gods ind, placér det, flyt/pluk/afsend
det efter ordre, hold styr på hvor det er (sporbarhed), og afregn kunden for
håndteringen.

**Vigtigste funktioner:**
- Varekartotek pr. kunde med enhed, sporingsniveau (ingen/batch/serie) og mål
- Reolpladser (DELT node med Unitbooking) — zone, type, status, temperatur
- Bevægelsesregistrering (modtag/placér/flyt/pluk/afsend/retur/optæl/justér)
  gennem én Cloud Function
- Plukordrer med udledt fremdrift og server-styret afsendelse
- Cycle count / optælling med serverberegnet afvigelse og allowlistet årsag
- Transit & placering (Modtagelse) med forslået ledig plads
- Carrier-overblik (beholdere: indhold, placering, status)
- Transportlabels (QR + Code 128, ægte stregkodealgoritmer, ingen node)
- Afregning (hvad der kan faktureres) og Volumen (salgsestimat)
- Sporbarhed (parti- og enhedsopslag, ren visning)

**Undermoduler/skærme (11):** Varer, Pluk & afsend, Bevægelser, Optælling,
Modtagelse, Beholdere (Carriers), Transportlabels, Afregning, Volumen,
Sporbarhed, Lokationer.

**Afhænger af (andre moduler):** Kunder — `MODUL_KRAEVER.warehouse = ["kunder"]`
fordi `varer`, `enheder` og `plukordrer` alle har et påkrævet `kundeId`
(`moduler.js`). Transportlabels kræver derudover Booking (`etaper`/`bookinger`)
for at kunne udlede en transporttype — uden Booking er skærmen aktiv, men
skriver "Transportlabels kræver Booking" og henter slet ikke etaper/bookinger
(`hent: harBooking`). `reolpladser` er en DELT node med Unitbooking (begge
moduler kan skabe lokationer selvstændigt; ingen af dem "kræver" det andet
modul, men har man begge, deler man reolstruktur — se `moduler.js` linje 382).

**Afhænges af (hvem læser dette modul):** Indkøb → Fakturaer / Økonomi →
Fakturering godkender de fakturagrundlag Afregning opretter som kladde
(beslutning 12); Unitbooking deler `reolpladser`-noden og dens belægning
(`belaegningPrPlads()` tæller begge moduler ind); Booking leverer etapedata
til Transportlabels.

**Samlet status:** Kerneflowet — vare → bevægelse → beholdning → pluk →
afsendelse, og optælling → afvigelse — er **BUILT**: alle skrivninger går
gennem tre rigtige Cloud Functions (`bevaegelseskriv`, `plukordreafsend`,
`optaellingskriv`, bekræftet i `functions/index.js`), aldrig direkte til
noden. Transportlabels er **BUILT** som visning/udskrift (ingen node — bevidst,
se nedenfor), med to felter (kundens ref.nr., fra/til-adresse) der bevidst
IKKE kan redigeres fra skærmen fordi de tilhørende noder er `.write: false`.
Afregning er **BUILT** som visningsberegning + kladdeoprettelse, men opretter
aldrig en faktura selv (godkendelse ligger i Indkøb/Økonomi, jf. beslutning
12). Volumen er **BUILT** som ren beregner — opretter bevidst intet tilbud
(nodeform for `tilbud` er ikke besluttet). Der findes ingen MOCK/DEMO-skærme
i modulet i traditionel forstand — alle 11 skærme bruger `useListe()` mod
rigtige noder, med `demo-lager.js`/`demo-kunder.js`/`demo-unitbooking.js` kun
som fallback når appen kører uden Firebase-nøgler.

**Overlap-mistanke:** Carriers (Warehouse) vs. Kasser (Unitbooking) — fysisk
samme koncept (en beholder på en hylde), bevidst adskilte noder
(`carriers` vs. `kasser`) og adskilte tilstandsmaskiner, men de deler
`reolpladser` og tælles sammen i belægningsopgørelsen. Warehouse `varer`/
`beholdning` vs. Indkøbs `lagre` — kundens gods vs. vognmandens egne
reservedele, bevidst adskilt (se "Mulige overlap").

---

## Skærme

### `/warehouse` — Varer
- **Hvem bruger den:** lagermedarbejder (skriv), alle med `varer.laes` for
  visning.
- **Primært formål:** varekartotek pr. kunde — varenummer, navn, enhed,
  sporingsniveau, mål, minimum.
- **Primær handling:** opret/redigér en vare (kræver en kunde valgt først).
- **Sekundære handlinger:** søg/filtrér på kunde og varegruppe; se "på lager"
  (summeret, ikke gemt) og "under minimum".
- **Data vist:** varer, beholdning (til summering), kunder.
- **Data der kan ændres:** varefelter via `gem()` (`src/fleet/skriv.js`) mod
  `varer/<id>`. `sporing` er låst efter oprettelse (kan ikke ændres bagud).
  Beholdningskolonnen ("På lager") er ren visning — skrives aldrig herfra.
- **Kommer typisk fra:** Kunder & Priser (kunden skal findes først).
- **Går typisk til:** Bevægelser/Modtagelse (varen skal bruges til at
  registrere en bevægelse), Pluk (til en ordrelinje).
- **Overlap med anden side:** ingen direkte; adskilt fra Indkøbs
  reservedelskartotek (`lagre`).
- **Status:** BUILT — læs (`useListe("varer")`) og skriv (`gem()` mod
  `varer/<id>`, `flet` ikke sat, dvs. hel skrivning) begge reelle.
- **Demo-data:** ja — `DEMO_VARER`/`DEMO_BEHOLDNING`/`DEMO_KUNDER` som
  `useListe`-fallback, kun aktiv uden Firebase-nøgler.
- **Nødvendig for:** daglig drift (stamdata-forudsætning for alt andet).

### `/warehouse/pluk` — Pluk & afsend
- **Hvem bruger den:** lagermedarbejder (pluk), disponent/koordinator/admin
  (oprette/frigive ordrer, kræver `bevaegelser.skriv`).
- **Primært formål:** oprette plukordrer, frigive dem, registrere pluk pr.
  linje, og afsende (server lukker ordren og skriver afsendelsesbevægelser i
  én funktion).
- **Primær handling:** "Registrér pluk" (kalder `skrivBevaegelse` med
  `art: "pluk"`), "Afsend" (kalder `afsendPlukordre()` → Cloud Function
  `plukordreafsend`).
- **Sekundære handlinger:** opret/redigér ordre (kladde), "Frigiv",
  "Tilbage til kladde" (kun hvis intet er plukket endnu,
  `kanFortrydeFrigivelse()`).
- **Data vist:** plukordrer, bevægelser (til udledt fremdrift via
  `ordreFremdrift()`), beholdning, varer, reolpladser, carriers, kunder.
- **Data der kan ændres:** ordrefelter (via `gem()`, `flet:true`, fordi
  serveren senere sætter `afsendtMs`); tilstandsskift kladde↔frigivet (via
  `gem()` direkte på `/tilstand` — client-writable for disse to tilstande
  ifølge `KLIENT_ORDRE_TILSTANDE`); selve plukket og afsendelsen går kun
  gennem Cloud Functions — `afsendt` kan IKKE sættes direkte af klienten
  (håndhævet i `firebase.rules.json`, jf. kommentarer i `warehouse.js`).
- **Kommer typisk fra:** Varer (linjer), Beholdere/Lokationer (hvor der kan
  plukkes fra).
- **Går typisk til:** Afregning (pluk-hændelser tælles som ydelsen "Pluk").
- **Overlap med anden side:** noden `plukordrer` er bevidst IKKE samme som
  Bookings `bookinger` (en booking siger hvem der kører hvorhen; en plukordre
  siger hvad der skal ud af lageret) — se kommentar i `warehouse.js`.
- **Status:** BUILT — læs + skriv (Cloud Functions `bevaegelseskriv` og
  `plukordreafsend` bekræftet i `functions/index.js`).
- **Demo-data:** ja for varer/reolpladser/carriers/kunder; plukordrer og
  bevægelser har `demo: []` (tomt fallback, ikke fiktive rækker).
- **Nødvendig for:** daglig drift.

### `/warehouse/bevaegelser` — Bevægelser
- **Hvem bruger den:** lagermedarbejder.
- **Primært formål:** registrere enhver lagerbevægelse (modtag, placér, flyt,
  pluk, afsend, retur, optæl, justér) i ét fælles skema der viser kun de
  felter arten bruger.
- **Primær handling:** "Registrér bevægelse" → `skrivBevaegelse()` → Cloud
  Function `bevaegelseskriv`.
- **Sekundære handlinger:** filtrér seneste bevægelser på art; se
  dækning/beholdning i fra-beholderen før man sender.
- **Data vist:** bevægelseshistorik (seneste 500), varer, reolpladser,
  beholdning, carriers; KPI'er (bevægelser i dag, ind/ud i dag, negative
  saldi).
- **Data der kan ændres:** intet direkte — skærmen skriver udelukkende
  gennem `skrivBevaegelse()`; en bevægelse kan ikke rettes bagefter
  (append-only, jf. tekst i skærmen: "En bevægelse rettes ikke ... registreres
  en justering").
- **Kommer typisk fra:** Varer/Lokationer/Carriers (referencedata).
- **Går typisk til:** Beholdning (opdateres atomisk af samme funktion),
  Sporbarhed (bevægelserne er kilden til sporet), Afregning (bevægelser er
  fakturagrundlaget).
- **Overlap med anden side:** delvist overlap i formål med Modtagelse (som er
  en forenklet, guidet delmængde: kun placering) og Pluk (som er en
  guidet delmængde: kun pluk mod en ordre).
- **Status:** BUILT.
- **Demo-data:** `demo: []` for bevægelser (ingen fiktive rækker vises), ja
  for referencelister (varer/pladser/beholdning/carriers).
- **Nødvendig for:** daglig drift — er den generiske indgang alle andre
  skærme er specialiseringer af.

### `/warehouse/optaelling` — Optælling
- **Hvem bruger den:** lagermedarbejder.
- **Primært formål:** cycle count — tælle en beholder op, lade SERVEREN
  beregne afvigelsen mod sin egen forventning (klientens forventede tal
  sendes aldrig med).
- **Primær handling:** "Registrér optælling" → `skrivOptaelling()` → Cloud
  Function `optaellingskriv`.
- **Sekundære handlinger:** angiv årsag (allowlistet) hvis afvigelse; se
  lagernøjagtighed, forfaldne lokationer, afvigelser fordelt på årsag.
- **Data vist:** optællinger (append-only historik), beholdning, varer,
  reolpladser, carriers.
- **Data der kan ændres:** intet direkte — kun via `skrivOptaelling()`.
  `optaellinger`-noden er eksplicit `.write: false` for ENHVER klient
  (kommentar i skærmen: "noden er .write: false for enhver klient" — en
  optælling kan ikke rettes bagefter, kun en ny optælling registreres).
- **Kommer typisk fra:** Lokationer/Bevægelser (hvilken hylde/beholder der
  er forfalden).
- **Går typisk til:** Beholdning (rettes til det talte, af serveren);
  Sporbarhed (enhedsafvigelse sammenholdes separat).
- **Overlap med anden side:** ingen.
- **Status:** BUILT.
- **Demo-data:** `demo: []` for optællinger; ja for referencelister.
- **Nødvendig for:** daglig/periodisk drift (lagerkontrol), ikke strengt
  daglig for hver medarbejder.

### `/warehouse/modtagelse` — Modtagelse (transit & placering)
- **Hvem bruger den:** lagermedarbejder.
- **Primært formål:** guidet 4-trins flow for at sætte en ankommet/uplaceret
  beholder på en hylde — "Ankommet fra transport → Vælg beholder → Vælg
  lokation → Beholder placeret".
- **Primær handling:** "Vælg foreslået plads" eller "Placér på valgt plads" →
  `skrivBevaegelse({ art: "putaway", ... })`.
- **Sekundære handlinger:** manuelt vælge en anden ledig plads; se seneste
  placeringer.
- **Data vist:** carriers (køen: i transit eller uden lokation), reolpladser,
  beholdning, varer, bevægelser, evt. `kasser` (kun hvis tenanten har
  Unitbooking, `hent: harModul(...)`).
- **Data der kan ændres:** kun via `skrivBevaegelse()` (art `putaway`).
- **Kommer typisk fra:** en beholder registreret i transit (Bevægelser/
  ekstern proces).
- **Går typisk til:** Beholdere (den placerede beholder), Lokationer
  (belægning opdateres).
- **Overlap med anden side:** DELVIST overlap med "Placering" i Bevægelser —
  Modtagelse er en guidet, forenklet variant af netop den ene bevægelsesart
  (`putaway`), med et forslag om ledig plads oven på.
- **Status:** BUILT. Nav.js/kildekommentarer er eksplicitte om hvad der
  IKKE er bygget her: (a) et selvstændigt "modtag"-trin før placering findes
  ikke og er bevidst udeladt ("at sætte beholderen på en hylde ER
  ankomsten"); (b) "Kundens faste område" (reserveret kundezone med ledig m²/
  m³) er PLANLAGT/IKKE BYGGET — skærmen viser en forklarende tekst i stedet
  for en knap; (c) et fysisk lagerkort/gitter er IKKE BYGGET (`reolpladser`
  har ingen koordinater).
- **Demo-data:** ja for carriers/pladser/beholdning/varer/kasser;
  `demo: []` for bevægelser.
- **Nødvendig for:** daglig drift.

### `/warehouse/carriers` — Beholdere (Carriers)
- **Hvem bruger den:** lagermedarbejder, disponent/admin (indsyn).
- **Primært formål:** overblik over beholdere — indhold, placering, status,
  seneste bevægelse.
- **Primær handling:** filtrere/søge; "Vis indhold" for en valgt beholder.
- **Sekundære handlinger:** ingen skriv-handling på selve skærmen (ren
  visning); link videre til Lokationer.
- **Data vist:** carriers, reolpladser, beholdning, varer, bevægelser
  (seneste bevægelse pr. beholder, udledt); KPI-tal fra `carrieroverblik()`
  (afledt hos forbrugeren, ikke `kpi/`) + ét delta
  (`carriereUdenLokationDelta`) hentet via `useKpi()`.
- **Data der kan ændres:** intet — dette er en ren visningsskærm (ingen
  formular, ingen `gem()`-kald i filen).
- **Kommer typisk fra:** Modtagelse (nyplacerede beholdere).
- **Går typisk til:** Lokationer, Sporbarhed.
- **Overlap med anden side:** eksplicit IKKE samme som "Overblik" i
  WAREHOUSE.md punkt 1 (aktive lokationer/varelinjer/åbne modtagelser/
  opgavekø — den flade er IKKE bygget); nav.js/kildekommentar er tydelig om
  at kun carrier-overblikket findes. Se "Mulige overlap" for Carriers vs.
  Unitbookings Kasser.
- **Status:** BUILT (som ren visning — der er ingen skrivbar handling på
  denne skærm, hvilket er tilsigtet, ikke en mangel).
- **Demo-data:** ja, alle lister har `useListe(..., demo: DEMO_X)`.
- **Nødvendig for:** daglig drift (opslag), ikke en transaktionsskærm.

### `/warehouse/labels` — Transportlabels
- **Hvem bruger den:** lagermedarbejder.
- **Primært formål:** generere og printe et fysisk mærkat (QR + Code 128 +
  felter) for en beholder knyttet til en transport (etape).
- **Primær handling:** vælge en beholder, "Print label" (kun aktiv hvis
  `label.kanTrykkes`, dvs. ingen påkrævede felter mangler).
- **Sekundære handlinger:** "Redigér felter" (kolli, løse enheder, vægt,
  godsbeskrivelse, håndteringsmærker) → `gem()` mod `carriers/<id>` med
  `flet:true`.
- **Data vist:** carriers, etaper og bookinger (kun hvis Booking-modulet
  findes; ellers `hent: false` og skærmen forklarer hvorfor), kunder,
  reolpladser, beholdning (til serienr./batch).
- **Data der kan ændres:** kun mærkatfelterne (`kolli`, `loesEnheder`,
  `vaegtGram`, `godsbeskrivelse`, `haandtering`) på `carriers/<id>`. Tre
  planlagte felter kan IKKE redigeres her og er det bevidst ikke: kundens
  ref.nr. (hører på `bookinger`, `.write: false`), fra-/til-adresse (hører
  på `etaper`, `.write: false`) — begge kræver deres egen server-funktion,
  som filen selv dokumenterer.
- **Kommer typisk fra:** Beholdere (en beholder skal have en `etapeId`).
- **Går typisk til:** fysisk print (ingen efterfølgende skærm).
- **Overlap med anden side:** ingen; mærkatet er bevidst IKKE en gemt node
  ("Der gemmes intet her ... et gemt mærkat ville drive fra sin booking").
- **Status:** BUILT — labelen er beregnet/udledt (ingen node), men de
  redigerbare mærkatfelter skrives reelt via `gem()`. Kræver Booking-modulet
  for at kunne udlede en transporttype; uden det viser skærmen en forklarende
  spærring i stedet for en tom tabel.
- **Demo-data:** ja for alle lister, inkl. `DEMO_ETAPER`/`DEMO_BOOKINGER`
  (kun hentet hvis `harBooking`).
- **Nødvendig for:** daglig drift, kun relevant med Booking-modulet aktivt.

### `/warehouse/afregning` — Afregning
- **Hvem bruger den:** disponent/koordinator/admin/revisor (kræver
  `satser.laes`; oprettelse kræver `grundlag.skriv`).
- **Primært formål:** vise hvad lageret kan faktureres for i shell-perioden,
  pr. kunde, og oprette et fakturagrundlag som KLADDE.
- **Primær handling:** vælge kunde → se linjer → "Opret fakturagrundlag" →
  `opretGrundlag()` (server bygger dokumentet; `grundlag`-noden er
  `.write: false` for alle, også admin).
- **Sekundære handlinger:** ingen — periode kommer fra shellen, ikke fra
  modulet selv.
- **Data vist:** kunder, bevægelser (periodefiltreret), standardsatser
  (`satser/standard`); afregningslinjer bygget af `afregningslinjer()` +
  `satsopslag()`.
- **Data der kan ændres:** intet direkte på afregningsdata — kun oprettelse
  af et NYT grundlag (kladde) via serverkald.
- **Kommer typisk fra:** Bevægelser (kilden til alle fakturerbare
  hændelser).
- **Går typisk til:** Indkøb → Fakturaer / Økonomi → Fakturering
  (godkendelse sker der, beslutning 12 — eksplicit i skærmens egen tekst:
  "Et grundlag er ikke en faktura").
- **Overlap med anden side:** eksplicit IKKE "Fakturering" — navnet
  "Afregning" er bevidst for at undgå at antyde et andet godkendelsesflow.
- **Status:** BUILT — linjeberegning er ægte (afledt af rigtige
  bevægelser+satser), oprettelse går gennem en rigtig, låst server-node.
  En linje uden sats udelades ikke (vises som "mangler") og spærrer summen —
  ingen tavs underfakturering.
- **Demo-data:** `demo: DEMO_KUNDER` for kundeliste; `demo: []` for
  bevægelser og standardsatser.
- **Nødvendig for:** admin/opsætning-lignende periodisk arbejde (økonomi),
  ikke daglig drift for lagermedarbejderen.

### `/warehouse/volumen` — Volumen (volumenkalkulator)
- **Hvem bruger den:** sælger/disponent/admin (kræver `satser.laes`).
- **Primært formål:** salgsværktøj — regn et månedsprisestimat ud fra
  paller/m³/m² og forventet håndtering, med husets egne priser.
- **Primær handling:** justere mængde/periode/håndteringer, se beregningen
  live (`tilbudsberegning()`).
- **Sekundære handlinger:** vælge eksisterende kunde (bruger hans
  prisaftale) vs. "emne" (standardpris); se rumfangsberegner ud fra
  kundens egne varers mål (kun ved grundlag "kubik").
- **Data vist:** kunder, standardsatser, varer (til rumfangsberegneren).
- **Data der kan ændres:** intet — ren beregner, ingen `gem()`-kald i filen.
- **Kommer typisk fra:** salgssamtale (ingen forudgående skærm).
- **Går typisk til:** intet — der oprettes bevidst IKKE et tilbud herfra
  (nodeformen for `tilbud` er ikke besluttet; se `DEMO_TILBUD` i
  `demo-kunder.js`). Skærmens egen tekst: "Der oprettes intet tilbud herfra,
  og det er ikke en mangel i den her etape."
- **Overlap med anden side:** eksplicit IKKE "Tilbud" — den regner et tal,
  opretter intet dokument.
- **Status:** BUILT som beregner; PLANNED (ikke bygget) er selve
  tilbudsoprettelsen/-gemning, som er en bevidst udskudt beslutning, ikke en
  fejl.
- **Demo-data:** ja (`DEMO_KUNDER`, `DEMO_VARER`).
- **Nødvendig for:** admin/opsætning-lignende (salg), ikke daglig lagerdrift.

### `/warehouse/sporbarhed` — Sporbarhed
- **Hvem bruger den:** lagermedarbejder, disponent/admin/revisor (indsyn,
  fx ved et tilbagekald).
- **Primært formål:** svare "hvor er det parti/den enhed nu, og hvor har det
  været" — opslag på (vare+batch) eller (serienummer).
- **Primær handling:** vælge opslagstype, indtaste vare/batch eller
  serienummer, se "Hvor er det nu" og "Sporet" (ældste bevægelse først).
- **Sekundære handlinger:** se "Tal mod enhedsrækker" — uenighedspanel
  mellem beholdningssaldo og enhedsrækker for serie-sporede varer.
- **Data vist:** bevægelser (`vindue: "alle"`, hele historikken), varer,
  beholdning, carriers, reolpladser, enheder, kunder.
- **Data der kan ændres:** intet — skærmens egen kommentar: "Skærmen skriver
  ingenting. Den er ren visning."
- **Kommer typisk fra:** et tilbagekald eller en kundehenvendelse.
- **Går typisk til:** intet efterfølgende trin — informationsterminal.
- **Overlap med anden side:** eksplicit IKKE "Sporbarhed & optælling" —
  optælling er sin egen skærm siden etape 6; navnet er bevidst kortet.
- **Status:** BUILT som ren visning over ægte data (`enheder`-node læses
  fra en rigtig node, ikke afledt/mock).
- **Demo-data:** ja for alle lister (inkl. `DEMO_ENHEDER`).
- **Nødvendig for:** admin/opsætning-lignende (compliance/tilbagekald), ikke
  daglig for de fleste brugere.

### `/warehouse/lokationer` — Lokationer
- **Hvem bruger den:** lagermedarbejder (skriv, kræver `reolpladser.skriv`).
- **Primært formål:** administrere reolpladser (zoner, hylder, belægning,
  status, temperatur) — DELT node med Unitbooking.
- **Primær handling:** opret/redigér en lokation (`gem()` med `flet:true` —
  skærmen rører kun de fire felter den ejer: zone, type, status,
  temperatur, plus adressen).
- **Sekundære handlinger:** søg/filtrér på zone/status; se belægning
  (udledt, ikke gemt — tæller varer via carrier, plus Unitbookings kasser og
  Warehouses carriers i én fælles opgørelse `belaegningPrPlads()`).
- **Data vist:** reolpladser, beholdning, varer, carriers, evt. `kasser`
  (kun hvis tenanten har Unitbooking).
- **Data der kan ændres:** de fire Warehouse-ejede felter + adressen
  (hal/reol/fag/hylde/plads), aldrig hele posten (bevidst `flet:true` for
  ikke at slette Unitbookings felter og omvendt).
- **Kommer typisk fra:** opsætning før første modtagelse.
- **Går typisk til:** Modtagelse (forslag om ledig plads), Bevægelser
  (destinationsvalg), Carriers/Sporbarhed (visning af hvor noget står).
- **Overlap med anden side:** DELT node med Unitbookings reolplads-skærm —
  samme underliggende `reolpladser`, to skærme, felter opdelt efter ejerskab.
- **Status:** BUILT.
- **Demo-data:** ja (`DEMO_REOLPLADSER`, `DEMO_VARER`, `DEMO_BEHOLDNING`,
  `DEMO_CARRIERS`, `DEMO_KASSER`).
- **Nødvendig for:** admin/opsætning (stamdata), forudsætning for daglig
  drift.

---

## Data-entiteter

| Entitet | RTDB-node(r) | Ejes af (NODE_MODUL) | Bruges også af | Kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| Vare (kundens gods, kartotek) | `varer` | `warehouse` | — | Enkeltkilde. `kundeId` påkrævet. |
| Beholdning | `beholdning` | `warehouse` | — | SUMMERET/skrevet kun af `bevaegelseskriv`; intet gemt totaltal pr. vare — `beholdningPrVare()` summerer hver gang. |
| Bevægelse | `bevaegelser` | `warehouse` | — | Append-only, kun skrevet af `bevaegelseskriv`; kilden til beholdning, sporbarhed og afregning. |
| Plukordre | `plukordrer` | `warehouse` | — | `afsendt`-tilstand kun sat af `plukordreafsend`; fremdrift udledt af `bevaegelser`, ikke gemt. |
| Optælling | `optaellinger` | `warehouse` | — | `.write: false` for enhver klient; kun skrevet af `optaellingskriv`; append-only, forventet tal beregnes af serveren. |
| Carrier (beholder) | `carriers` | `warehouse` | — | Fysisk lignende Unitbookings `kasser`, men bevidst egen node/tilstandsmaskine. |
| Enhed (serienummer) | `enheder` | `warehouse` | — | Kun for serie-sporede varer; kan komme ud af trit med `beholdning` (viseligt via `enhedsafvigelse()`), ikke en fejl der rettes ved at overskrive et tal. |
| Reolplads / lokation | `reolpladser` | delt: `unitbooking` + `warehouse` | begge moduler | Én reolstruktur i huset; Warehouse-skærmen skriver kun sine egne felter (`flet:true`). Se dossier for Unitbooking for detaljer om den delte side. |
| Kunde (kartotek) | `kunder` | `kunder`-modulet | Warehouse, Booking m.fl. | Warehouse kræver Kunder-modulet (`MODUL_KRAEVER`). |
| Standardsats / kundepris | `satser/<gruppe>`, `kunder/<id>/priser` | `kunder`-modulet (prisdelen) | Afregning, Volumen | Ét opslag (`satsopslag()`/`prisFor()`), ikke duplikeret i Warehouse. |
| Fakturagrundlag | `grundlag` | fælles (`.write: false` for alle) | Indkøb/Økonomi | Oprettes fra Afregning som kladde; godkendelse ligger uden for Warehouse (beslutning 12). |
| Transportlabel | (ingen node) | — | — | Bevidst IKKE gemt — udledes hver gang af carrier + etapekæde + kunde + plads. |

---

## Implementation-status

**Modtagelse (transit & placering):** BUILT. Persistens via
`skrivBevaegelse({ art: "putaway" })` → Cloud Function `bevaegelseskriv`
(bekræftet server-side i `functions/index.js`, håndterer `putaway` særskilt
via `skrivPlacering()`). Kendte, bevidste udeladelser (jf. nav.js/kildens
egne kommentarer): intet separat "modtag"-trin før placering (arkitektonisk
valg, ikke en mangel), ingen kundezone-reservation ("Kundens faste område"
— PLANNED, ikke bygget, model mangler kapacitetsbegreb), intet fysisk
lagerkort (reolpladser har ingen koordinater). Brugbar end-to-end for det
den faktisk gør: sætte en ankommet/uplaceret beholder på en foreslået eller
valgt ledig hylde.

**Carrier/item (varekartotek + beholdere):** BUILT. Varer læses/skrives ægte
(`useListe`+`gem()`); Beholdere-skærmen er ren visning oven på ægte
`carriers`/`beholdning`-data, ingen skrivehandling på selve skærmen (ikke en
mangel — den anden skærm, Bevægelser/Modtagelse/Transportlabels, dækker
skrivning af carrier-felter).

**Transit:** BUILT — status `iTransit` håndteres i `carrieroverblik()`,
`udenLokation()`, og Modtagelse-køen. Ankomst og placering skrives atomisk
i samme funktionskald (`virkningPaaCarrier()` sætter status `paaLager`
samtidig med `pladsId`) — bevidst for at undgå et mellemtilstand-hul.

**Lokation:** BUILT (delt node, skrivning begrænset til Warehouse-ejede
felter via `flet:true`). Belægning udledes fælles på tværs af varer, kasser
og carriers via `belaegningPrPlads()` i `reolplads.js` — én kilde, ikke to
skærme der tæller forskelligt.

**Bevægelser (generisk):** BUILT. Al skrivning går gennem
`bevaegelseskriv`, som slår varen op server-side for at fastlægge kunde og
sporing (klienten kan ikke sende `kundeId` med — forhindrer krydsfakturering
af en fremmed kunde). Karantæne håndhæves server-side ved opslag på hyldens
status via beholderens `pladsId`.

**Delvis udtagning (pluk mod en linje, med overpluk synligt):** BUILT.
`ordreFremdrift()` udleder plukket/mangler/overplukket af de faktiske
`pluk`-bevægelser, ikke af et gemt felt. Overpluk klippes bevidst ikke væk
("En scanner kan læse den samme palle to gange, og det skal kunne ses").

**Pluk/afgang:** BUILT. "Afsend" er ikke et klient-sat felt — Cloud
Function `plukordreafsend` skriver afsendelsesbevægelser og tilstanden
atomisk; `afsendt` står eksplicit UDEN for `KLIENT_ORDRE_TILSTANDE`.

**Volumen/handling/rater:** Volumen-beregneren er BUILT (ren funktion,
ægte prisopslag), men opretter bevidst ikke noget dokument (tilbud er
PLANNED — nodeform ikke besluttet). Afregning er BUILT for
linjeberegning + kladdeoprettelse; selve fakturagodkendelsen ligger uden for
modulet per beslutning 12 (ikke en mangel i Warehouse, men en bevidst
modulgrænse). En selvstændig "Rater & afregning"-skærm nævnt i planchen
bygges eksplicit IKKE — priser sættes ét sted (Kunder & Priser), ikke i
Warehouse (kommentar i `warehouse.js`).

**Samlet:** Ingen af de 11 skærme er MOCK/DEMO i betydningen "kun demo-data
selv med rigtig backend" — alle bruger `useListe()` mod ægte noder med
`demo:` udelukkende som offline-fallback. De eneste PARTIAL/PLANNED-punkter
er bevidste, dokumenterede modelgrænser (kundezone-reservation, fysisk
lagerkort, tilbudsoprettelse, "Overblik"-planchen fra WAREHOUSE.md punkt 1,
"Varemodtagelse & putaway"-planchen med PO/kvalitetskontrol) — ikke uafsluttet
arbejde på det der ER bygget.

---

## Workflow-observationer

Sporet Warehouse-flow (Modtagelse → carrier/item → transit → lokation →
bevægelser → delvis udtagning → pluk/afgang → volumen/handling/rater):

1. **Vare og kunde oprettes** (`/warehouse`, Varer.jsx) — BUILT. Kræver
   kunde valgt først (`kundeId` påkrævet, håndhævet i `valideVare()` og i
   `firebase.rules.json`).
2. **Beholder (carrier) oprettes/scannes ind, status `iTransit`** — BUILT
   for scanning ind som en bevægelse; selve oprettelsen af en ny carrier-post
   sker gennem Transportlabels' `Maerkatformular` (flet-skrivning) eller
   direkte via en `modtag`-bevægelse. Kilde: `warehouse.js` `CARRIER_STATUS`.
3. **Transit → placering** (`/warehouse/modtagelse`) — BUILT. Cloud Function
   `bevaegelseskriv` art `putaway` sætter `pladsId` og (hvis relevant)
   status `paaLager` atomisk. Forslag om ledig plads er ægte belægningsdata
   (`belaegningPrPlads()`), ikke en gættet placering.
4. **Lokation (reolplads) forvaltes** (`/warehouse/lokationer`) — BUILT,
   delt node med Unitbooking, skrivning afgrænset til egne felter.
5. **Bevægelser registreres generisk** (`/warehouse/bevaegelser`) — BUILT,
   samme Cloud Function som trin 3, andre `art`-værdier (modtag, flyt, pluk,
   afsend, retur, optael, justering).
6. **Delvis udtagning (pluk mod en plukordrelinje)** (`/warehouse/pluk`,
   `Plukpanel`) — BUILT. `skrivBevaegelse({ art: "pluk" })`; fremdrift
   udledt live af bevægelserne, ikke af et lagret felt — mangler ingen
   opdateringsskridt der kan komme ud af trit.
7. **Pluk/afgang (afsendelse)** (`/warehouse/pluk`, knap "Afsend") — BUILT.
   `afsendPlukordre()` → Cloud Function `plukordreafsend`, som (efter
   kildekommentarer) afsender de FAKTISK plukkede mængder læst af
   bevægelserne — klienten sender ingen linjer med.
8. **Volumen/handling/rater** (`/warehouse/volumen`, `/warehouse/afregning`)
   — Volumen: BUILT som beregner, PLANNED for selve tilbudsoprettelsen.
   Afregning: BUILT for beregning + kladde, modulgrænse (ikke mangel) for
   selve fakturagodkendelsen (ligger i Indkøb/Økonomi).

**Er Sporbarhed en rigtig chain-of-custody, eller en computed view over
bevaegelser?** Begge dele, med et bevidst dobbeltspor: for BATCH-sporede
varer er sporet en ren beregnet visning (`spor()` filtrerer `bevaegelser` på
vare+batch, ældste først — ingen ny node, intet ekstra skrevet). For
SERIE-sporede varer findes derudover en EGEN node, `enheder/<serienummer>`,
som er en ægte, separat tilstandsholder (skrevet atomisk sammen med
bevægelsen og beholdningen af `bevaegelseskriv`, jf. `virkningPaaEnhed()`).
Warehouse.js er eksplicit om at dette er et bevidst valg med en kendt
risiko ("to repræsentationer af én kendsgerning ... samme klasse fejl som
`bemanding.ledig`"), og betaler prisen tre steder: atomisk fælles-skrivning,
antal låst til én enhed pr. bevægelse, og et synligt uenighedspanel
(`enhedsafvigelse()`, vist i Sporbarheds "Tal mod enhedsrækker"-kort). Så:
for serie-sporede varer er det en rigtig separat chain-of-custody-node, ikke
kun en visning — men skærmen selv er stadig 100 % læs, ingen skrivning.

**Forbinder Afregning til en rigtig faktura, eller viser den bare et tal?**
Den forbinder til et rigtigt, server-håndhævet DOKUMENT (fakturagrundlag,
`grundlag`-noden, `.write: false` for alle inkl. admin, nummereret af en
counter-transaktion server-side), men IKKE til en faktura. Grundlaget
oprettes som kladde; selve fakturagodkendelsen er en bevidst modulgrænse ud
af Warehouse (Indkøb → Fakturaer / Økonomi → Fakturering, beslutning 12).
Det er derfor hverken "bare et tal" (der er en ægte, låst node bag knappen)
eller en komplet faktureringsproces i sig selv.

---

## UI-mønstre

- **Layout:** hvert skærmrod er `<div className="fc-grid" style={{ gap: 16 }}>`
  med `KpiRaekke`/`KpiKort` øverst, dernæst `Kort`-blokke med `Tabel`.
  Gennemgående komponentimport fra `../../fleet/ui.jsx` (`Kort`, `Tabel`,
  `Pille`, `Knap`, `Felt`, `Feltraekke`, `Formular`, `Henter`,
  `Datatilstand`, `Tom`, `Ikon`, `Sider`, `KpiKort`, `KpiRaekke`,
  `Kpiadgang`, `MiniLinje`, `Gitter`).
- **Status-farver:** `Pille`-komponenten med `tone` — `ok` (grøn, fx
  "Klar"/"Aktiv"), `bad` (rød, fx "Karantæne"/"ingen lokation"/"over
  afgang"), `warn` (gul, fx "Frigivet"/"forfalden"), `info` (blå/neutral,
  fx "Lukket"/"Kladde"). Konsistent på tværs af alle 11 skærme via delte
  kataloger (`PLADS_STATUS`, `CARRIER_STATUS`, `ORDRE_TILSTAND`,
  `AFVIGELSESAARSAG` — hver med sin egen `pill`/`tone`-værdi i
  `warehouse.js`).
- **Tomme/afviste tilstande:** `<Tom>` for "ingen data endnu" (altid med
  forklarende tekst om HVORFOR, aldrig bare "ingen data"); `<Datatilstand>`
  for lister der er afvist/afkortet/tomme af en anden grund end "ingen
  rækker" (jf. CLAUDE.md-reglen om at aldrig vise demo-data oven på en
  afvist læsning).
- **Afkortning:** `mindst(n, afkortet)` fra `format.js` bruges konsekvent i
  KpiKort (fx Varer: "Varer i alt", Lokationer: "Lokationer", Sporbarhed:
  "Sporede enheder") — aldrig et rå `.length` der kan skjule en afkortet
  liste.
- **Formularmønster:** hver redigerbar skærm (Varer, Lokationer, Pluk,
  Transportlabels) bruger samme lokale state-mønster: `roert`/`visAlle` for
  fejlvisning-efter-berøring, `svar` for serverens returstatus via
  `<Formularsvar>`, og en `gemNu()` der kalder `gem()` fra `skriv.js` med
  eksplicit `flet`-valg (kun sat `true` hvor noden er delt/delvist ejet).
- **Barcode/QR:** `qrkode.js` og `stregkode128.js` er egen, importfri,
  zxing-verificeret implementering (ikke en tredjeparts-pakke) — tegnet som
  rå `<svg><rect>`-elementer i `Transportlabels.jsx` (`QrKode`/`Stregkode`-
  komponenterne), skaleret i "moduler" ikke pixels så mærkatet kan ændre
  størrelse uden at stregerne bliver ulæselige.
- **Terminologi:** konsekvent dansk domænesprog gennem hele modulet —
  "beholder"/"carrier" (aldrig "boks"), "pluk" (aldrig "picking"),
  "optælling"/"cycle count", "afregning" (aldrig "fakturering" i dette
  modul), "modtagelse" (aldrig "varemodtagelse", som er reserveret til en
  ikke-bygget planche).
- **Sidefodsnoter (⚠):** hver skærm har mindst én `<p className="fc-hint">`
  der eksplicit forklarer en systemgrænse til brugeren i almindeligt sprog
  (fx "På lager er en sum, ikke et gemt tal", "En bevægelse rettes ikke",
  "Et grundlag er ikke en faktura") — et gennemgående UI-mønster i hele
  modulet, ikke kun kodekommentarer.

---

## Mulige overlap

- **Carriers (Warehouse) vs. Kasser (Unitbooking):** fysisk samme
  grundkoncept — en beholder der står på en reolplads. Bevidst adskilte
  noder (`carriers` vs. `kasser`) og adskilte tilstandsmaskiner
  (Warehouse: `paaLager`/`iTransit`/`udeAfDrift`/`opbrugt`; Unitbooking:
  egen udlånsflow med klargøring/udlån/retur), begrundet eksplicit i
  `warehouse.js` ("Det er `kasse` én gang til, og svaret blev alligevel to
  noder"). Begge tælles dog sammen i den fælles belægningsopgørelse
  (`belaegningPrPlads()`) og vises begge i Lokationer-skærmens
  "Kasser/carriers"-kolonne — så en bruger med begge moduler SER dem side
  om side på samme hylde, hvilket i sig selv gør distinktionen synlig
  fremfor skjult, men betyder også at en bruger uden dyb kendskab til
  modulgrænserne kunne opfatte det som "det samme, bare to skærme".
- **Warehouse `varer`/`beholdning` vs. Indkøbs `lagre`:** navnene ligger tæt
  ("varer" vs. "lager(e)"), men repræsenterer bevidst forskellige
  forretninger — kundens gods (indtægt, 3PL) vs. vognmandens egne
  reservedele (omkostning). Ingen delt node, ingen delt skærm; adskillelsen
  er understreget gentagne gange i kildekommentarer
  ("FORVEKSL DEN IKKE MED `lagre`"). Risikoen er udelukkende terminologisk
  forveksling for en ny bruger/revisor, ikke et datamæssigt overlap.
- **Modtagelse vs. Bevægelser (art `putaway`):** Modtagelse er reelt en
  guidet, forenklet brugerflade oven på præcis én bevægelsesart fra det
  generiske Bevægelser-skema. Ingen datamæssig konflikt (samme Cloud
  Function, samme node), men to indgange til samme handling kan forvirre
  om hvilken skærm der er "den rigtige" for en placering.
- **Pluk (Plukpanel) vs. Bevægelser (art `pluk`):** samme forhold som
  ovenfor — Pluk-skærmens indbyggede plukpanel er en kontekst-bunden
  variant af samme `skrivBevaegelse({ art: "pluk" })`-kald som findes
  generisk i Bevægelser.
- **Warehouse-planchernes ikke-byggede koncepter vs. de byggede skærme med
  lignende navne:** dokumenteret risiko for forveksling i planlægning/salg,
  eksplicit adresseret i nav.js-kommentarer for tre par: "Overblik" (planche,
  IKKE bygget) vs. "Beholdere/Carriers" (bygget); "Varemodtagelse & putaway"
  (planche med PO/kvalitetskontrol, IKKE bygget) vs. "Modtagelse" (bygget,
  transit & placering); "Tilbud" (planche, IKKE bygget — intet
  dokument oprettes) vs. "Volumen" (bygget, kun en beregner). Ingen af disse
  er et overlap i selve produktet — det er en risiko for at LÆSE
  WAREHOUSE.md/planchen som beskrivelse af det byggede system.

IKKE PÅVIST: hvorvidt der findes automatiseret e2e-test-dækning specifikt
for de tre Cloud Functions (`bevaegelseskriv`, `plukordreafsend`,
`optaellingskriv`) ud over det der kunne observeres i `functions/index.js`
selv — dossieret har ikke gennemgået `test/`-mappen for dette modul.
