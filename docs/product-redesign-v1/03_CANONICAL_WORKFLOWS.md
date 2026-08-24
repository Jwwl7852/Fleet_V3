<title>Canonical Workflows V1</title>

# 03 — Kanoniske arbejdsgange (V1-målbillede)

**Status:** Planlægning. Ingen kode, Firebase-regler, Cloud Functions eller
data er ændret for at producere dette dokument.

**Kilder:**
- `FleetControl_V1_product_blueprint.md` (blueprintet) — §"Kanoniske
  arbejdsgange" definerer de 8 trin-kæder nedenfor ordret; beslutningsmatrixens
  62 rækker (numre i parentes, fx `#8`) leverer "hvad ÆNDRER blueprintet".
- `docs/product-redesign-v1/00_AUTHORITATIVE_PRODUCT_RULES.md` — de to
  verificerede fakta (Fleet/Facility `sager`-backend er reel og deployet;
  `kompetencer` er korrekt modul-gatet) bruges som afgjorte, ikke gættede.
- `docs/product-audit/03_WORKFLOWS.md` — den faktuelle "hvad findes i dag"-
  sporing pr. trin, med BUILT/PARTIAL/MOCK/PLANNED/NOT_BUILT-status og
  filhenvisninger. Genbruges ordret hvor muligt.

**Change-type-taksonomi** (samme 7 tags som resten af dokumentsættet):
`NAVIGATION_ONLY` · `VIEW_COMPOSITION` · `ROUTE_REDIRECT` ·
`PERMISSION_MODEL` · `DATA_MODEL` · `BACKEND_REQUIRED` · `HIDE_ONLY`

Hvor et trin ikke kræver nogen ændring for at nå V1-målbilledet (det er
allerede BUILT og blueprintet ikke rører det), er dette skrevet eksplicit
frem for at udelade trinnet.

---

## 1. Planning

Forespørgsel → forslag → godkendelse → disponering → udførelse/status →
fakturagrundlag.

### Trin 1 — Forespørgsel oprettes
- **I dag:** BUILT. `NyForespoergsel.jsx` → `opretBooking()` → Cloud Function
  `bookingopret`. Skriver booking + én etape + to stop atomisk med
  `BKG-ÅÅÅÅ-NNNNN` fra en counter-transaction. Starter altid i tilstand
  `kladde`. Kun ét `TRANSPORTTYPE`-dropdown findes; ingen UI til flere
  strækninger direkte, selvom `post.straekninger` understøtter det
  datamæssigt. Tidsvinduer for afhentning/levering er BUILT; kundens
  generelle åbningstider er IKKE PÅVIST.
- **Blueprint-ændring (#6, FINISH):** Behold, men færdiggør direkte/
  dedikeret/kombi-booking, tidsvinduer, by før adresse, og flere etaper via
  transit/lager. Avanceret automatisk optimering er eksplicit IKKE et
  V1-krav.
- **Change-type:** `VIEW_COMPOSITION` (udbygning af eksisterende formular —
  ingen af de manglende dele kræver ny backend, da bookingens datamodel
  allerede bærer strækninger/tidsvinduer).

### Trin 2 — Send til planlægning
- **I dag:** BUILT, men et bevidst separat kald fra oprettelsen (kan ikke
  lægges atomisk sammen). Etapeskift `kladde → afventerPlan` via
  `Etapeskifte.jsx` → `skiftEtape()` → Cloud Function `etapeskift`.
- **Blueprint-ændring:** Ingen selvstændig beslutning ændrer selve
  mekanikken; #5 (Planning-overblik, FINISH) kræver at "manglende plan" vises
  tydeligt i arbejdslisten, hvilket er en synlighedskrav på dette trins
  output, ikke en ændring af selve overgangen.
- **Change-type:** Ingen ændring krævet (allerede BUILT og uændret af
  blueprintet).

### Trin 3 — Match/forslag
- **I dag:** BUILT. Disponenten laver 1–3 forslag pr. etape via
  `Disponering.jsx` → `Forslagsdialog.jsx` → `skrivForslag()` → Cloud
  Function `forslagskriv`. Kører de samme fem disponeringstjek som
  godkendelsen. Forslaget binder intet — ingen reservation skrives her.
- **Blueprint-ændring (#7, MERGE):** Forslag & reservation bevares
  funktionelt, men ophører som selvstændig arbejdsskærm/menupunkt. Åbnes som
  panel/dialog i kontekst fra Disponering; den nuværende route
  (`/booking/forslag/:id`) bevares som deep link.
- **Change-type:** `VIEW_COMPOSITION` (flyt UI ind i Disponerings
  højre panel/dialog) + `ROUTE_REDIRECT` (den selvstændige route skal
  fortsat kunne åbnes, men som deep link ind i den nye panelvisning, ikke
  som en fritstående skærm).

### Trin 4 — Reservation/godkendelse (fire-øjne)
- **I dag:** BUILT og håndhævet server-side. Koordinatoren (kræver
  `booking.godkend`, som disponenten bevidst ikke har) vælger et forslag →
  `skiftEtape()` → Cloud Function `etapeskift`. Kører de fem tjek igen
  server-side og binder enhed(er) + chauffør atomisk med etapens
  tilstandsskift.
- **Blueprint-ændring:** Samme MERGE-beslutning (#7) som trin 3 — godkendelse
  sker i kontekst fra Disponering, ikke på en separat skærm. Selve
  fire-øjne-kontrollen ændres ikke; den er allerede korrekt håndhævet
  server-side.
- **Change-type:** `VIEW_COMPOSITION` (samme panel/dialog-flytning som
  trin 3 — ingen backend- eller permission-ændring nødvendig).

### Trin 5 — Disponering
- **I dag:** Dagsgitteret (opgaver, art `vaerksted`) er BUILT med reel
  træk/slip og oprettelse. Ugesgitteret (etaper/langture) er bevidst
  view-only — reel binding sker udelukkende via godkendt forslag (trin 3–4).
  Ingen automatisk/optimeret tildeling nogen steder.
- **Blueprint-ændring (#8, FINISH):** Fjern dagsgitteret for
  værkstedsopgaver fra Planning. Fokusér skærmen på ruter, etaper, køretøj,
  chauffør og hænger. V1 kan være manuelt assisteret; fuld ruteoptimering
  ligger senere. (Dagsgitteret for værkstedsopgaver lever videre — det hører
  til Fleets Driftskalender, som allerede genbruger samme
  `Gitterkalender.jsx`-komponent.)
- **Change-type:** `VIEW_COMPOSITION` (fjern et UI-element fra Planning; den
  underliggende funktionalitet flytter ikke væk, den fjernes kun fra denne
  skærm, da den allerede findes i Fleet/Facility).

### Trin 6 — Udførelse/status
- **I dag:** Transport/faktisk gennemførelse er BUILT som skrivevej
  (chaufføren melder status via Cloud Function `statusmelding`, etapen
  skiftes videre via `etapeskift`). Ingen GPS/sporing (beslutning 22).
  Rute & status-opfølgning er BUILT som ren visning (planlagt rute,
  chaufførens meldinger, afvigelse, "sidst hørt" i minutter).
  Koordinator-feedback/notifikation er NOT_BUILT — ingen mail/push ved
  godkendelse/afvisning/retur, kun in-app synlighed for den der selv
  navigerer dertil.
- **Blueprint-ændring (#9, KEEP):** Behold som ærlig statusvisning uden GPS.
  Overvej navnet "Ture & status" for at undgå live-kort-forventning.
- **Change-type:** `NAVIGATION_ONLY` (omdøbning). Koordinator-notifikation
  forbliver NOT_BUILT — blueprintet stiller intet krav om at bygge det i
  denne beslutningsrække.

### Trin 7 — Fakturagrundlag
- **I dag:** Omkostning/pris er BUILT som beregning/læsning
  (`pricing.js`s `beregnBooking()`/`beregnForloeb()` mod satsarket).
  **Satsvedligehold er en UI-attrap** — "Tilføj/Redigér sats"/"Gem
  ændringer" på Bookingopsætning sætter kun lokal state, intet
  `gem()`/Cloud Function-kald findes. CO₂/emission er IKKE PÅVIST. Desuden
  (fra Fakturacenter-dossieret): der findes ingen UI-vej i Booking/Planning
  til at oprette et forløbsbaseret (booking-tur) fakturagrundlag — kun
  Warehouses periodeafregning kalder reelt `opretGrundlag()`.
- **Blueprint-ændring (#10, MOVE, og #4, FINISH):** Bookingopsætning fjernes
  fra den daglige Planning-menu til Opsætning > Planning > Omkostninger &
  regler; **satspersistering skal færdiggøres før V1**; ubyggede faner
  skjules. Parallelt kræver Fakturering (#4, FINISH) en kanonisk oprettelse
  af fakturagrundlag fra en afsluttet booking/tur, med navnet
  "Fakturagrundlag" konsekvent.
- **Change-type:** `ROUTE_REDIRECT` (Bookingopsætning flytter menuplacering)
  + `BACKEND_REQUIRED` (satsvedligehold — "Gem ændringer" skal reelt skrive;
  ingen Cloud Function/skrivevej findes i dag) + `VIEW_COMPOSITION` (kanonisk
  "opret fakturagrundlag fra booking/tur"-knap — `opretGrundlag()` findes
  allerede som funktion, så dette er UI-forbindelse, ikke ny backend).

**Samlet vurdering for V1:** Selve transportflowet (forespørgsel → forslag →
godkendelse → disponering → udførelse/status, med reelt håndhævet
fire-øjne-kontrol) er allerede brugbart end-til-ende med ægte backend — det
bedst udbyggede spor i hele produktet. Fire af de syv trin kræver kun
UI-omrokering (merge/flyt), ikke nyt ingeniørarbejde. De to reelle, reelt
blokerende huller før V1 er satsvedligehold og kanonisk booking→
fakturagrundlag-oprettelse (begge `BACKEND_REQUIRED`/`VIEW_COMPOSITION`);
koordinator-notifikation og ruteoptimering er bevidst uden for V1-scope.

---

## 2. Fleet

Chaufførindberetning → kontortriage → planlæg værksted → kommunikation →
udførelse → faktura/bilag → historik.

### Trin 1 — Chaufførindberetning
- **I dag:** Set fra Fleet-modulets EGNE skærme er oprettelsen IKKE PÅVIST
  — Fleet-modulets filer (`src/moduler/flaade/*.jsx`) har kun visning, ingen
  opret-vej blev fundet der. Chaufførapp-dossieret bekræfter separat en reel
  skrivevej derfra: direkte `gem()` til `indberetninger`, ingen Cloud
  Function, ejerskab håndhævet af reglen på `oprettetAf`. Ingen offline-kø
  for denne skrivning — IKKE PÅVIST om en indberetning tabes ved manglende
  forbindelse.
- **Blueprint-ændring:** Ingen af Fleet-rækkerne (#15–18) tilføjer en
  opret-skærm i Fleet-modulet selv. Chaufførappens indberetningsskærm
  (#59, FINISH, uden for denne workflow) skal have offline-sikkerhed og
  materialeforbrug, og "kontorets triage skal kobles på samme post" —
  dvs. blueprintet kobler trin 2 (triage) til den eksisterende post fra
  chaufførappen, uden at ændre selve oprettelsen i Fleet-modulet.
- **Change-type:** Ingen ændring krævet inden for Fleet-modulets scope; det
  reelle arbejde ligger i chaufførappens indberetningsskærm (`#59`, dækket i
  en separat workflow-tabel, ikke gentaget her).

### Trin 2 — Kontortriage
- **I dag:** MOCK/DEMO. `Indberetninger.jsx` viser forløbstilstand og
  prioritet, men "Afslut"-knappen er permanent deaktiveret med en forældet
  kommentar ("Fase 0: indberetninger skrives ikke fra klienten endnu" — selve
  kommentaren er nu forældet, jf. chaufførapp-fundet ovenfor, men triagens
  egne handlinger virker uanset stadig ikke).
- **Blueprint-ændring (#17, FINISH):** Byg triage: prioritet, vurdering,
  planlæg aktivitet, afvent, afslut, og kobling til Fleet-sag. Blueprintet
  markerer eksplicit dette som **"et V1-blokerende hul."**
- **Change-type:** `BACKEND_REQUIRED` (ingen skrivevej/Cloud Function findes
  i dag for nogen triage-handling) + `VIEW_COMPOSITION` (aktivér de
  deaktiverede knapper i `Indberetninger.jsx` og byg triage-flowet).

### Trin 3 — Planlæg værksted
- **I dag:** BUILT. Cloud Function `opgaveplanlaeg`, kaldt fra
  `Vaerkstedskalender.jsx` → `Planlaegdialog.jsx`. Tjekker permission,
  abonnement, modulaktivering, enhedens status, skriver opgave + reservation
  atomart. Leverandør/værksted tildeles som datafelt (`leverandoerId`), ingen
  selvstændig tildelingsworkflow ud over feltet. Kalenderreservation er
  BUILT, skrevet atomart med opgaven.
- **Blueprint-ændring (#16, KEEP, og #18, MERGE):** Driftskalender forbliver
  Fleets primære arbejdsflade — kalenderen skal dominere, fem kompakte
  handlingstal åbner samme arbejdskø/panel. Arbejdskø ophører som selvstændig
  skærm og åbnes i stedet som drawer/panel fra de fem kort i Driftskalenderen.
- **Change-type:** `VIEW_COMPOSITION` (flet Arbejdskø ind som drawer/panel i
  Driftskalenderen — selve planlægningsfunktionen `opgaveplanlaeg` er
  allerede BUILT og røres ikke).

### Trin 4 — Kommunikation
- **I dag:** Den ældre auditvurdering sagde "Mail (bekræftelse til værksted)
  — PLANNED/fase 0, ingen `sager`-node i reglerne." **Dette er nu korrigeret
  af den verificerede fakta i `00_AUTHORITATIVE_PRODUCT_RULES.md`:**
  backend'en (`sagOpret`, `sagBeskedSkriv`, `sagKarantaeneFrigiv`,
  `sagAftaleBekraeft`, alle `onCall` i `functions/index.js`) ER reel og
  deployeret til DEV, med en fuldt specificeret `sager`-node i
  `firebase.rules.json`. Hullet ligger i **frontend**: `Sagsvisning.jsx` har
  stadig alle handlinger deaktiveret og viser en forældet "fase 0"-tekst. Reel
  **udgående** mailafsendelse (til værksted/leverandør) er i dag kun
  mock/manuel kopiering — samme hul som Procures trin 5. Den **indgående
  mailkanal** (mail → `sagOpret`) er slet ikke bygget noget sted.
- **Blueprint-ændring:** Ingen af de 62 rækker navngiver dette trin direkte
  for Fleet, men det er den funktion #17's "kobling til Fleet-sag" refererer
  til, og er en forudsætning for at lukke det V1-blokerende hul i trin 2.
  **Rækkefølgen er nu fastlagt (Korrektion 7 i `00_AUTHORITATIVE_PRODUCT_RULES.md`):**
  (A) koble `Sagsvisning.jsx` til den allerede deployerede sager-backend —
  udgående tråd + intern visning; (B) byg en fælles UDGÅENDE mailfunktion for
  Fleet/Facility/Procure; (C) log den sendte kommunikation på sagen (fx via
  `sagBeskedSkriv` med retning "udgående"); (D) indgående reply-routing/
  webhook er en SENERE, separat sikkerhedsskive, uden for V1-kritisk vej.
  Definition of Done for dette trin må ikke kræve indgående mail → `sagOpret`.
- **Change-type:** `VIEW_COMPOSITION` (A — koble `Sagsvisning.jsx` til det
  eksisterende, virkende backend-lag — `sagBeskedSkriv`/`sagOpret`/
  `sagKarantaeneFrigiv`/`sagAftaleBekraeft` — så tråden bliver funktionel med
  det samme, ingen ny backend) **plus** `BACKEND_REQUIRED` (B+C — den fælles
  udgående mailfunktion og logning af sendt kommunikation på sagen; i dag kun
  mock/manuel kopiering, jf. auditten). Den **indgående** mailkanal (D) er
  IKKE V1-blocking — den er eksplicit en senere, separat sikkerhedsskive og
  indgår ikke i dette trins Definition of Done.

### Trin 5 — Udførelse
- **I dag:** BUILT. Cloud Function `opgavestatus`, kaldt fra
  `Statusskifte`-komponenten; accepterer valgfri, server-valideret
  `faktiskMin`.
- **Blueprint-ændring:** Ingen selvstændig beslutning ændrer dette trin ud
  over at det fortsat vises i Driftskalenderen (#16, KEEP).
- **Change-type:** Ingen ændring krævet.

### Trin 6 — Faktura/bilag
- **I dag:** BUILT, men bevidst uden for Fleet-modulet — godkendes i
  Indkøb → Fakturaer (fremtidigt Fakturaer & bilag); Fleet viser kun den
  delte visning `Modulfakturaer art="fleet"`. Faktisk omkostning: `faktiskMin`
  (tid) er BUILT; materialeforbrug-til-fakturagrundlag/lagertræk-logikken
  (`grundlagslinjeFraMateriale`, `lagertraekFraMateriale`) er BUILT som ren
  funktion, men **ingen bekræftet UI-trigger** blev fundet i de gennemgåede
  Fleet-skærme.
- **Blueprint-ændring:** Fleets egen fakturavisning ændres ikke af de 62
  rækker; den overordnede platformfunktion samles under Fakturaer & bilag
  (se workflow 8). Hvorvidt materialeforbrug-triggeren skal bygges i V1 er
  **IKKE PÅVIST** — ingen af de 62 rækker for Fleet nævner det eksplicit.
- **Change-type:** Ingen ændring krævet for selve faktura-visningen
  (arkitekturvalget om at holde godkendelse uden for Fleet er bevidst og
  uændret). Materialeforbrug-triggeren: `IKKE PÅVIST` om den er i
  V1-scope.

### Trin 7 — Historik
- **I dag:** BUILT. Ingen hardsletning af enheder; afgang registreres med
  årsag; nedetid/åbne fejl regnes afledt af historiske indberetninger/besøg.
- **Blueprint-ændring (#15, KEEP):** Enheder forbliver stamdata under
  Opsætning > Fleet > Enheder; "verificér rules/write-path og fjern
  forældede kommentarer" — ingen ændring af selve historikvisningen.
- **Change-type:** Ingen ændring krævet.

**Samlet vurdering for V1:** Planlægning → reservation → udførelse →
historik er en solid, server-håndhævet kæde og allerede brugbar end-til-ende.
To af de syv trin kræver reelt ingeniørarbejde før V1: kontortriage (trin 2,
eksplicit markeret V1-blokerende i blueprintet) mangler både backend og UI,
og kommunikation (trin 4) kræver frontend-forbindelse til en allerede
virkende backend PLUS en ny, fælles udgående mailfunktion (delt med
Facility/Procure) — begge dele V1-kritiske. Den separate indgående mailkanal
er IKKE V1-blocking (Korrektion 7): en senere, separat sikkerhedsskive. De
øvrige fem trin er enten uændrede eller ren UI-omrokering.

---

## 3. Facility

Fejl → vurdering → planlæg service → kommunikation → udførelse →
faktura/bilag → historik.

### Trin 1 — Fejl
- **I dag:** BUILT. `Fejlformular` i `Oversigt.jsx` → `gem()` →
  `facility/fejl/<id>`. Alvor er et menneskeligt valg, ikke en udledning.
- **Blueprint-ændring (#19, KEEP):** Behold som modul-forside. Prioritér
  åbne fejl og driftsstatus; reducér sekundære kort og
  **demoafhængige estimater**.
- **Change-type:** `HIDE_ONLY` (fjern demoafhængige estimater fra
  overbliksskærmen) + mindre `VIEW_COMPOSITION` (reducér sekundære kort).

### Trin 2 — Vurdering
- **I dag:** BUILT som ren afledning. `lokationTilstand()`/
  `driftsforhold()` regner Normal/Advarsel/Kritisk af åbne fejl +
  anlægsstatus + klimaalarmer — intet gemt vurderingsfelt.
- **Blueprint-ændring:** Ingen selvstændig ændring; dækket af samme #19.
- **Change-type:** Ingen ændring krævet.

### Trin 3 — Planlæg service
- **I dag:** Leverandørbesøg (valg af leverandør) er BUILT som
  datakartotek-opslag (Servicedialog filtrerer `leverandoerer` på
  `kategori: "facility"`), men **stopper ved valget** — ingen bekræftelse
  tilbage til leverandøren. Planlægning (booking af tid/reservation) er
  BUILT: `planlaegFacilityopgave()` → Cloud Function `facilityplanlaeg`,
  atomisk opgave + reservation, server-håndhævet indeslutning ("hallen og
  porten er ét rum").
- **Blueprint-ændring (#20, KEEP, og #22, KEEP):** Servicekalender behold,
  samme kalenderdesign som Fleet, men tydeligt med anlæg/lokation som
  ressourcer. Servicedialog behold som kontekstuel dialog; standardisér
  knapper, leverandørkontakt og næste handling med Fleet-dialogen uden at
  tvinge samme feltskema.
- **Change-type:** `VIEW_COMPOSITION` (standardisér Servicedialogens
  knapper/leverandørkontakt-mønster med Fleets tilsvarende dialog).
  Selve planlægningsfunktionen (`facilityplanlaeg`) er allerede BUILT og
  røres ikke.

### Trin 4 — Kommunikation
- **I dag:** Den ældre vurdering: "Kommunikation (udgående mail/bekræftelse
  til ekstern leverandør) — IKKE BYGGET. Eksplicit kildekode-kommentar:
  'INGEN MAIL … beslutning 20 er fase 0.'" Samme nuance som Fleet gælder
  her: den verificerede fakta i `00_AUTHORITATIVE_PRODUCT_RULES.md` viser at
  `sager`-backend'en er reel og deployeret, delt mellem Fleet og Facility
  (samme node, adskilt med `art` ∈ {fleet, facility}). Hullet ligger i
  **frontend** (`Sagsvisning.jsx`, deaktiveret), i **udgående** mailafsendelse
  (mock/manuel i dag) og i den **indgående mailkanal** (mangler helt for
  begge moduler).
- **Blueprint-ændring:** Ingen af Facility-rækkerne (#19–22) navngiver dette
  trin eksplicit, men det er samme underliggende platformkomponent som
  Fleets trin 4. Samme rækkefølge gælder her (Korrektion 7 i
  `00_AUTHORITATIVE_PRODUCT_RULES.md`): (A) koble `Sagsvisning.jsx` til
  backend'en, (B) den fælles udgående mailfunktion (delt med Fleet/Procure),
  (C) log sendt kommunikation på sagen, (D) indgående reply-routing er en
  SENERE, separat sikkerhedsskive — IKKE V1-blocking.
- **Change-type:** `VIEW_COMPOSITION` (A — koble `Sagsvisning.jsx`,
  art=facility, til det eksisterende backend-lag) **plus** `BACKEND_REQUIRED`
  (B+C — den fælles udgående mailfunktion, delt med Fleet/Procure, og logning
  af sendt kommunikation). Den **indgående** mailkanal (D) er et delt hul med
  Fleet, men er eksplicit uden for V1-kritisk vej — en senere, separat
  sikkerhedsskive, ikke en forudsætning for dette trins Definition of Done.

### Trin 5 — Udførelse
- **I dag:** BUILT. `Statusskifte.jsx` + Cloud Function `opgavestatus`,
  samme mønster som Fleets værkstedsopgaver.
- **Blueprint-ændring:** Ingen ændring ud over at den fortsat vises via
  Servicekalenderen (#20, KEEP).
- **Change-type:** Ingen ændring krævet.

### Trin 6 — Faktura/bilag
- **I dag:** PARTIAL/delt med Procure. Facility viser
  (`Modulfakturaer art="facility"`), men godkender/placerer ikke selv — det
  sker i det fælles Fakturacenter (Økonomi-modulet), samme bevidste
  arkitekturvalg som Fleet.
- **Blueprint-ændring:** Samles under Fakturaer & bilag (workflow 8);
  Facilitys egen visning ændres ikke af de 62 rækker.
- **Change-type:** Ingen ændring krævet i Facility-modulet selv.

### Trin 7 — Historik
- **I dag:** IKKE PÅVIST. Ingen dedikeret facility-historikskærm fundet i
  modulets filsæt.
- **Blueprint-ændring:** Ingen af de 62 rækker for Facility (#19–22)
  navngiver en historikskærm eksplicit — beslutningsmatrixen adresserer ikke
  dette trin. **IKKE PÅVIST** om en Facility-historikskærm er en del af
  V1-scope; det fremstår som et hul auditten fandt, som blueprintet ikke har
  taget stilling til.
- **Change-type:** `IKKE PÅVIST` (ingen beslutning at udlede et tag fra).

**Yderligere sporet hul (uden for de syv trin):** Energistatistik
(`facility/omkostning`) læses og vises, men ingen skærm skriver til noden —
tilsvarende for klimamålinger. Facility-rækken #21 (Klima & energi) er
**LATER** i blueprintet netop af denne grund — skjules fra V1-navigationen
indtil skrivevejen/integrationen er reel.

**Samlet vurdering for V1:** Fejlmelding → vurdering → planlægning →
udførelse er en solid, server-håndhævet kæde med ægte
reservationskonflikt-kontrol og allerede brugbar end-til-ende. Kommunikation
er det reelle blokerende hul (samme mønster som Fleet: frontend-forbindelse
plus en ny, delt udgående mailfunktion). Den manglende indgående mailkanal er
IKKE V1-blocking (Korrektion 7) — en senere, separat sikkerhedsskive. Historik
er hverken bygget eller besluttet af blueprintet — et åbent spørgsmål, ikke en
plan.

---

## 4. Procure

Behov → leverandør/antal → bestilling → evt. godkendelse → mail →
modtagelse → faktura → match/godkendelse.

### Trin 1 — Behov
- **I dag:** BUILT. `Behov.jsx` → `meldBehov()` → Cloud Function
  `behovskriv`. Skriver `indkoebsbehov/<id>` med status `nyt`.
- **Blueprint-ændring (#24, FINISH):** Behold og gør mobilvenlig. Understøt
  enkel melding fra snedkeri/lager/kontor; foto/lyd er senere, men tekst,
  vare og antal skal virke nu (allerede tilfældet).
- **Change-type:** `VIEW_COMPOSITION` (mobil-UX-polering af en allerede
  fungerende formular).

### Trin 2 — Leverandør/antal
- **I dag:** Leverandørforslag er BUILT (ren beregning) —
  `foreslaaLeverandoer()` slår op i egen indkøbshistorik, returnerer `null`
  uden træf, ingen ekstern prisdatabase. Antal er BUILT, sættes på
  Bestillinger-skærmen. Leverandørkartoteket selv bruges i dag kun som
  read-only opslag fra Fleet/Facility/Procure (jf. Facility-dossierets "det
  stopper ved valget").
- **Blueprint-ændring (#28, MOVE):** Leverandører gøres til fælles stamdata
  (Fælles stamdata > Leverandører) delt af Fleet, Facility og Procure.
  Procure kan tilføje performance, prislister og indkøbshistorik som faner.
  **"Byg CRUD."**
- **Permission-model (Korrektion 3):** `leverandoerer` flytter til basen
  (Model B — samme mønster som `satser`/`grundlag`/`fakturaer`), med nye,
  uafhængige `leverandoerer.laes`/`leverandoerer.skriv` i stedet for at være
  gated via `indkoeb.laes`. Gør Fleet-/Facility-kunder uden Procure fuldt
  funktionelle på de skærme der allerede læser leverandørkartoteket.
- **Change-type:** `DATA_MODEL` (leverandørnoden bliver formelt en delt
  platformnode i stedet for et Procure-lokalt kartotek) + `PERMISSION_MODEL`
  (ny `leverandoerer.laes`/`.skriv`-familie, Korrektion 3) + `ROUTE_REDIRECT`
  (skærmen flytter til fælles stamdata-menuen). **`BACKEND_REQUIRED` →
  `VIEW_COMPOSITION`** for selve opret/redigér (Korrektion 8, verificeret
  skriveveje): `.write` på `leverandoerer/$leverandoerId` tillader allerede
  direkte klient-skrivning — kun en opret/redigér-FORM mangler i UI'et, ingen
  ny Cloud Function.

### Trin 3 — Bestilling
- **I dag:** BUILT. `Bestillinger.jsx` → `opretBestilling()` → Cloud
  Function `ordreskriv`. Nummerserie `BST-ÅÅÅÅ-NNNNN`, opdaterer behovenes
  status atomisk.
- **Blueprint-ændring (#25, FINISH):** Behold leverandørforslag og
  gruppering (allerede BUILT); det reelle nye arbejde ligger i mail-trinnet
  (trin 4 nedenfor).
- **Change-type:** Ingen ændring krævet for selve oprettelsen.

### Trin 4 — Evt. godkendelse
- **I dag:** BUILT. `Godkendelser.jsx` → `skiftOrdre()` → Cloud Function
  `ordrestatus`. To slåes-fra-regler (beløbsgrænse/fakturagodkendelse) kan
  slås helt fra. Selvgodkendelse er bevidst tilladt, men markeret
  (`selvgodkendt: true`).
- **Blueprint-ændring (#26, KEEP):** Behold den operationelle kø uændret.
  Flyt kun opsætningen af beløbsgrænse/godkender til Opsætning > Procure,
  men vis den aktive regel på siden.
- **Change-type:** `ROUTE_REDIRECT` (kun opsætnings-delen flytter til
  Opsætning > Procure) + `VIEW_COMPOSITION` (vis aktiv regel på den
  operationelle kø-skærm). Selve godkendelsesmekanikken er uændret.

### Trin 5 — Mail
- **I dag:** MOCK/manuelt, ikke sendt af systemet. `mailudkast()` bygger
  emne+brødtekst client-side; "Kopiér udkast" (clipboard) er eneste
  systemstøtte. Ingen Cloud Function sender mail for Procure. "Markér som
  sendt" er et rent statusfelt sat af et menneske. Dokumenteret som bevidst
  fase 1-begrænsning i koden.
- **Blueprint-ændring (#25, FINISH):** Byg **reel mailafsendelse** med
  PO-nummer og bestiller, og et krav om PO-nummer på fakturaen (kobler til
  trin 8, match). **Rækkefølge (Korrektion 7):** dette er samme fælles,
  UDGÅENDE mailfunktion som Fleet/Facilitys trin 4(B), ikke en separat
  implementering — bygges én gang, bruges tre steder. Outbound-only for V1;
  der er intet indgående mail-krav for Procures ordremail.
- **Change-type:** `BACKEND_REQUIRED` (der findes ingen SMTP/mailudsendelses-
  mekanisme noget sted i `functions/index.js` — dette er reelt nyt
  backend-arbejde, ikke en udvidelse af en eksisterende funktion; bør
  undersøges/bygges som samme fælles mailinfrastruktur som Fleet/Facilitys
  trin 4, ikke to separate implementeringer) + `VIEW_COMPOSITION` (UI til at
  udløse afsendelse og vise PO-kravet).

### Trin 6 — Modtagelse
- **I dag:** BUILT som statusskifte (`ordrestatus` → `modtaget`). Ingen
  linje-niveau modtagekontrol observeret.
- **Blueprint-ændring:** Ingen af de 62 rækker adresserer linje-niveau
  modtagekontrol eksplicit. `IKKE PÅVIST` om dette er i V1-scope.
- **Change-type:** Ingen ændring krævet for det eksisterende statusskifte;
  `IKKE PÅVIST` for en eventuel udvidelse.

### Trin 7 — Faktura
- **I dag:** PARTIAL. "Upload er ikke bygget endnu" — ingen fillagring.
  IKKE PÅVIST hvordan en faktura reelt kommer ind i `fakturaer/`-noden i
  produktion i dag (kun via manuel `registreret`-indtastning).
- **Blueprint-ændring (#3, FINISH, fælles med workflow 8):** Løses som
  platformfunktion under Fakturaer & bilag — "Byg drag-and-drop/fillagring
  først." Se workflow 8 for det fulde ansvar; dette er samme underliggende
  hul, ikke et Procure-specifikt.
- **Change-type:** `BACKEND_REQUIRED` (delt med workflow 8 — filoplagring
  findes slet ikke i platformen i dag).

### Trin 8 — Match/godkendelse
- **I dag:** Match er BUILT, reel regelbaseret felt-matching (ikke OCR).
  `matchFaktura()` → Cloud Function `fakturamatch`. Kun bestillingsnummer
  giver 100 %-score. Godkendelse er BUILT: `skiftFaktura()` → Cloud Function
  `fakturastatus`, kræver `indkoeb.godkend` i dag — Korrektion 2 i
  `00_AUTHORITATIVE_PRODUCT_RULES.md` erstatter denne med en ny,
  fakturaer-uafhængig `fakturaer.godkend`, samme rollefordeling.
- **Blueprint-ændring (#27, MERGE):** Procure-fakturaer fjernes som parallel
  skærm; route redirecter til det fælles Fakturaer & bilag med
  `filter=Procure`. Match- og godkendelseslogikken ændres ikke.
- **Change-type:** `ROUTE_REDIRECT` (Procure-fakturaer → fælles skærm med
  Procure-filter).

**Yderligere ikke-adresseret hul:** Regnskabsgrundlag/bogføring (trin 11 i
kildens nummerering) — "Bogfør"-knappen sætter kun status internt, "der
sendes ikke noget til et regnskabssystem", og tre-vejs afstemningskortet
kalder `demoAfstemning()` ubetinget for alle kunder (reel MOCK-visning
uanset Firebase-tilstand). **Ingen af de 62 rækker adresserer dette
eksplicit — IKKE PÅVIST om det er i V1-scope.**

**Samlet vurdering for V1:** Kernekæden behov → bestilling → godkendelse →
fakturamatch → godkendelse fungerer allerede end-til-ende med to bevidste,
manuelle brud. Før V1 kræves reelt ingeniørarbejde på to punkter: rigtig
leverandørmail-afsendelse (`BACKEND_REQUIRED`, samme fælles udgående
mailfunktion som Fleet/Facility, outbound-only jf. Korrektion 7) og
fakturaupload/fillagring (delt platformhul, `BACKEND_REQUIRED`, se
workflow 8). At gøre Leverandører til delt stamdata er derimod kun
`DATA_MODEL`/`PERMISSION_MODEL` + `VIEW_COMPOSITION` — den underliggende
skrivevej findes allerede (Korrektion 8), kun opret/redigér-formen mangler.
Resten af kæden er allerede brugbar eller ren omrokering (MERGE/MOVE).

---

## 5. Warehouse

Modtagelse → placering → beholdning → pluk/afsend → optælling/sporbarhed →
fakturagrundlag.

### Trin 1 — Modtagelse
- **I dag:** BUILT. Vare og kunde oprettes med `kundeId` påkrævet. Beholder
  (carrier) oprettes/scannes ind, status `iTransit`, BUILT for scanning ind
  som en bevægelse.
- **Blueprint-ændring (#39, KEEP, og #35, MOVE):** Modtagelse forbliver den
  kanoniske vej ind for ankommet gods og putaway, uændret. Varer (varekartotek)
  flytter til en underside; en ny Warehouse-forside oprettes, så
  varekartoteket ikke længere er modulets landingsside.
- **Change-type:** `NAVIGATION_ONLY` (ny forside oprettes, Varer-skærmen
  flyttes til underside — selve modtagelseslogikken er BUILT og uændret).

### Trin 2 — Placering
- **I dag:** BUILT. Cloud Function `bevaegelseskriv` art `putaway` sætter
  `pladsId` og status `paaLager` atomisk. Forslag om ledig plads er ægte
  belægningsdata.
- **Blueprint-ændring (#40, KEEP, og #41, MERGE):** Beholdere behold, tilføj
  konteksthandlinger til label, flyt og historik. Transportlabels ophører som
  selvstændig skærm, bliver kontekstuel fra beholderen eller modtagelsen;
  route forbliver deep link.
- **Change-type:** `VIEW_COMPOSITION` (tilføj konteksthandlinger på
  Beholdere-skærmen; gør labelmotoren kontekstuel) + `ROUTE_REDIRECT`
  (Transportlabels' route bevares som deep link, ikke primært menupunkt).

### Trin 3 — Beholdning
- **I dag:** BUILT. Lokation (reolplads) forvaltes som en node der allerede
  er **delt med Unitbooking** (`flet:true`-skrivning bevarer det andet
  moduls felter) — delingen findes altså allerede på datamodel-niveau.
- **Blueprint-ændring (#45, MERGE):** Slå Lokationer sammen med Unitbookings
  Reolpladser til ét fælles stamdatavindue under Opsætning > Lagerlokationer,
  med modulbestemte felter.
- **Change-type:** `VIEW_COMPOSITION` (konsolidér to skærme til én) +
  `ROUTE_REDIRECT` (flyt under Opsætning). `DATA_MODEL`-delingen er allerede
  på plads i dag og kræver ingen ændring.

### Trin 4 — Pluk/afsend
- **I dag:** BUILT gennem hele kæden. Delvis udtagning (pluk) via
  `skrivBevaegelse({art:"pluk"})`, fremdrift udledt live af bevægelserne.
  Afsendelse via Cloud Function `plukordreafsend`, som afsender de FAKTISK
  plukkede mængder — `afsendt` kan ikke sættes direkte af klienten.
- **Blueprint-ændring (#36, KEEP):** Behold uændret som guidet daglig
  arbejdsgang.
- **Change-type:** Ingen ændring krævet.

### Trin 5 — Optælling/sporbarhed
- **I dag:** Optælling (cycle count) er BUILT — serveren beregner afvigelsen,
  klientens forventede tal sendes aldrig med. Sporbarhed er BUILT som ren
  visning med et bevidst dobbeltspor (batch-beregnet vs. serie-sporet
  chain-of-custody).
- **Blueprint-ændring (#38, KEEP, #44, KEEP, og #37, MOVE):** Optælling og
  Sporbarhed forbliver uændrede, særskilte flows. Bevægelser (den generiske
  historik/værktøj bag optælling/sporbarhed) flytter til "Mere >
  Bevægelser" — fjernes fra den primære daglige menu for standard
  lagermedarbejdere, men logikken er uændret.
- **Change-type:** `NAVIGATION_ONLY` (Bevægelser flytter menuplacering;
  Optælling og Sporbarhed er uændrede).

### Trin 6 — Fakturagrundlag
- **I dag:** Volumen er BUILT som ren beregner, men PLANNED for selve
  tilbudsoprettelsen (ingen nodeform besluttet, intet dokument oprettes med
  vilje). Afregning er BUILT for linjeberegning + kladdeoprettelse af
  fakturagrundlag; selve fakturagodkendelsen ligger bevidst uden for modulet
  (Indkøb/Økonomi).
- **Blueprint-ændring (#42, MOVE, og #43, MOVE):** Afregning flytter til
  Økonomi > Fakturagrundlag > Warehouse — behold logikken, men fjern
  økonomiarbejde fra lagermedarbejderens primære menu. Volumen flytter til
  Kunder & Priser > Lagerkalkulator — behold som salgs-/tilbudskalkulator,
  ikke som lagerdrift; **et gemt tilbud er eksplicit senere (uden for V1)**.
- **Change-type:** `ROUTE_REDIRECT`/`NAVIGATION_ONLY` for begge (logikken er
  allerede BUILT, kun menuplacering ændres). Tilbudsoprettelsen forbliver
  `IKKE i V1-scope` (blueprintet siger selv "senere").

**Samlet vurdering for V1:** Hele kernekæden (modtagelse → placering →
beholdning → pluk → afsendelse → optælling → sporbarhed) er allerede BUILT
og server-håndhævet — det mest komplette modul i hele auditgrundlaget.
Blueprintets ændringer her er næsten udelukkende navigations-/
menuomrokering (MOVE/MERGE) uden nyt backend-arbejde. Warehouse kræver
mindst reelt ingeniørarbejde af de otte kanoniske arbejdsgange for at nå
V1-målbilledet.

---

## 6. Unitbooking

Reservation → klargøring → udlevering → retur → historik.

### Trin 1 — Reservation
- **I dag:** BUILT. Bruger søger ledige kasser i periode (`ledigeKasser()`),
  udfylder Reservationsformular, `opretUdlaan()` kalder Cloud Function
  `kasseudlaanskriv`, som validerer og skriver i en RTDB-transaktion der
  genlæser og konflikttjekker atomisk. Sagsnummer er påkrævet nøgle.
- **Blueprint-ændring (#30, FINISH, og #31, MERGE):** Kalender bliver samlet
  arbejdsflade med ny reservation, ledighedssøgning, klargøring, udlevering
  og retur i paneler/dialoger. Udlån ophører som selvstændig skærm; søg
  ledige/reservér og næste handling flyttes ind i Kalenderen, route kan
  fortsat åbne kalenderen med udlånspanelet aktivt.
- **Change-type:** `VIEW_COMPOSITION` (konsolidér reservation/
  ledighedssøgning ind i Kalender-panelerne — `kasseudlaanskriv` er allerede
  BUILT og røres ikke).

### Trin 2 — Klargøring
- **I dag:** BUILT. `skiftUdlaan({til:"klargjort"})` fra Udlån- eller
  Kalender-skærmen, samme funktion begge steder. Server sætter kassestatus.
  Reolpladser (kassens hylde) forvaltes via samme lokationsnode som
  Warehouse deler med (jf. trin 3 i Warehouse ovenfor).
- **Blueprint-ændring:** Samme #30/#31-konsolidering som trin 1, plus #33
  (Reolpladser, MERGE) som flytter kassens hylde-stamdata ind i den fælles
  Opsætning > Lagerlokationer sammen med Warehouse.
- **Change-type:** `VIEW_COMPOSITION` (konsolidering i Kalender-panelet) —
  reolplads-delen dækkes af samme `ROUTE_REDIRECT`/`VIEW_COMPOSITION` som
  Warehouse trin 3.

### Trin 3 — Udlevering
- **I dag:** BUILT. Samme `skiftUdlaan`-mønster; server stempler
  `udleveretMs` og rydder kassens `pladsId`.
- **Blueprint-ændring:** Samme #30/#31-konsolidering.
- **Change-type:** `VIEW_COMPOSITION`.

### Trin 4 — Retur
- **I dag:** BUILT. `skiftUdlaan({til:"returneret"})`. Server stempler
  `returneretMs`, sætter kasse til `ledig`, `pladsId: hjemPladsId`.
- **Blueprint-ændring:** Samme #30/#31-konsolidering.
- **Change-type:** `VIEW_COMPOSITION`.

### Trin 5 — Historik
- **I dag:** BUILT (implicit frigivelse er også dækket her — kassen bliver
  `ledig` og fremkommer igen i søgningen; intet "genåbn" fra `returneret" —
  et nyt udlån oprettes fra bunden med vilje).
- **Blueprint-ændring (#32, KEEP):** Behold som read-only dokumentation pr.
  kasse og sag, uændret.
- **Change-type:** Ingen ændring krævet.

**Yderligere sporet hul (stamdata, ikke et af de fem trin):** Kasseliste
(#34, KEEP) — "færdiggør redigering af eksisterende typer" — i dag kan en
eksisterende kassetype kun oprettes, ikke redigeres/slettes fra UI.
Change-type: `BACKEND_REQUIRED`/`VIEW_COMPOSITION` for redigeringsvejen.

**Samlet vurdering for V1:** Samtlige fem trin i den kanoniske kæde er
allerede BUILT og end-til-ende brugbare gennem én transaktionsbaseret Cloud
Function (`kasseudlaanskriv`) med dobbelt håndhævelse (klient og server) —
intet reelt backend-arbejde mangler i selve arbejdsgangen. Blueprintets
ændringer er ren UI-konsolidering (MERGE Udlån ind i Kalender, MERGE
Reolpladser ind i fælles Lagerlokationer). Eneste reelle, isolerede hul er
redigering af en eksisterende kassetype.

---

## 7. Workforce

Medarbejder/kompetence → fraværsansøgning → kontorgodkendelse →
reservationsblokering.

### Trin 1 — Medarbejder/kompetence
- **I dag:** Kompetencer: læsning og varslinger er BUILT. **Permission-
  modellen er allerede korrekt** — verificeret fakta i
  `00_AUTHORITATIVE_PRODUCT_RULES.md`: `kompetencer` er reelt modul-gatet
  til Bemanding (`.read` kræver `moduler/bemanding === true`, `.write`
  kræver derudover `kompetencer.skriv`), håndhævet i deployede regler. Der er
  intet sikkerhedshul her. Det der mangler er en **skrivevej**: i dag kun
  læsning + en permanent deaktiveret "Overrul"-knap. Medarbejdere: findes som
  visning under Opsætning i dag; redigering, fratrædelse og login-kobling er
  ikke bekræftet bygget.
- **Blueprint-ændring (#12, FINISH, og #14, MOVE):** Kompetencer beholder
  oversigt/varslinger og får en kanonisk vedligeholdelsesvej for
  kompetencer/beviser (avanceret override kan vente). Medarbejdere flytter
  til Opsætning > Medarbejdere (allerede der) og skal have redigering,
  fratrædelse og tydelig kobling mellem person og login færdiggjort.
- **Change-type:** For Kompetencer: **`BACKEND_REQUIRED` → `VIEW_COMPOSITION`**
  (Korrektion 8, verificeret skrivevej): `.write` på `kompetencer/$kompetenceId`
  tillader allerede direkte klient-skrivning med kun `kompetencer.skriv`, og
  `byggOverride({personId, kompetence, begrundelse, bruger})` i
  `src/fleet/personale.js` er en færdig byggefunktion — den kastes kun fordi
  UI'et aldrig kalder den. Ingen ny Cloud Function nødvendig, kun aktivér UI.
  **Ikke** `PERMISSION_MODEL` — modellen for læsning er allerede korrekt og
  kræver ingen ændring (en bredere rollefordeling end kun admin på
  `kompetencer.skriv` er en separat `PERMISSION_MODEL`-tilføjelse, ikke en
  V1-forudsætning). For Medarbejdere: **`BACKEND_REQUIRED` →
  `VIEW_COMPOSITION`** (samme Korrektion 8-verifikation): `.write` på
  `personale/$id` tillader allerede direkte klient-skrivning med
  `personale.skriv`, og `PERSONALE_STATUS` har allerede `fratraadt` som gyldig
  tilstand — fratrædelse er en almindelig feltopdatering via samme `gem()`-kald
  som oprettelse. Plus `ROUTE_REDIRECT` (allerede placeret rigtigt
  administrativt, jf. blueprintet).

### Trin 2 — Fraværsansøgning
- **I dag:** BUILT for selve ansøgningen. Chaufførappens Frihed-skærm
  skriver/læser i en snæver selvbetjenings-gren i reglerne: ny post, egen
  `personId`, `oensket` ∈ {ferie, feriefridag, afspadsering}, status altid
  `ansoegt`.
- **Blueprint-ændring (#13, FINISH, dækker også #61 chaufførapp):** Behold
  ansøgningen; det reelle nye arbejde er at lukke kæden med kontorets svar
  og automatisk disponeringsblokering (trin 3 og 4 nedenfor).
- **Change-type:** Ingen ændring krævet for selve ansøgningstrinnet.

### Trin 3 — Kontorgodkendelse
- **I dag:** IKKE PÅVIST/IKKE BYGGET. Ingen skærm i det gennemgåede
  Bemanding-modul sætter `ansoegning.status = "godkendt"`.
- **Blueprint-ændring (#13, FINISH):** "Byg kontorets godkend/afvis-svar."
  Bevar følsom årsag separat (allerede modelleret i `sensitive/fravaer`).
- **Change-type:** `BACKEND_REQUIRED` (ingen Cloud Function/skrivevej findes
  til at sætte godkendt/afvist-status) + `VIEW_COMPOSITION` (ny
  kontor-skærm/panel i Workforce > Fravær til at behandle ansøgninger).

### Trin 4 — Reservationsblokering
- **I dag:** NOT_BUILT. Ingen `reservationFraFravaer()`-byggefunktion findes
  endnu — den skal skrives efter samme mønster som de to allerede
  eksisterende byggefunktioner `reservationFraOpgave()` og
  `reservationFraAftale()`, som begge kalder den samme delte `reserver()`.
- **Blueprint-ændring (#13, FINISH):** "Den automatiske reservation, der
  blokerer disponering."
- **Krav til implementeringen (Korrektion 9):** `src/fleet/reservations.js`
  (spejlet i `functions/delt/reservations.js`) er allerede en fælles,
  generisk reservationsmotor — `reserver(db, path, ny, opts)`,
  `tjekLedig()`/`tjekLedigMod()`/`tjekLedigIndesluttet()` — og
  `PRIORITET`-tabellen indeholder **allerede** `fravaer: 30` (mellem
  `vaerksted: 40` og `facilitySag: 20`); ingen ændring nødvendig dér. Den nye
  Cloud Function skal (1) skrive en ny, tilsvarende
  `reservationFraFravaer(post)`-byggefunktion (samme mønster som de to andre),
  og (2) kalde den EKSISTERENDE `reserver()` — **ikke** opfinde en femte,
  selvstændig reservationsmekanisme.
- **Change-type:** `BACKEND_REQUIRED` for selve godkendelseshandlingen (ny
  Cloud Function skal skrive reservationen atomisk ved godkendelse), men
  eksplicit afgrænset til "genbrug eksisterende motor, tilføj én
  byggefunktion" — ikke åbent nybyggeri af reservationsinfrastruktur.

**Samlet vurdering for V1:** Dette er det svageste spor blandt de otte
kanoniske arbejdsgange målt på BUILT/NOT_BUILT-status. Kun trin 1's
læsedel (kompetence-oversigt) og trin 2 (selve ansøgningen) er reelt
end-til-ende brugbare i dag. Efter Korrektion 8's verifikation af
skriveveje er kompetence-/medarbejdervedligehold (trin 1) reelt
`VIEW_COMPOSITION` — de nødvendige `.write`-regler og byggefunktioner findes
allerede, kun UI'et mangler. To af de fire trin kræver stadig reelt
`BACKEND_REQUIRED`-arbejde (nye Cloud Functions) før V1-målbilledet er nået:
kontorgodkendelse (trin 3, helt ny skrivevej) og reservationsblokering
(trin 4, ny Cloud Function — men eksplicit afgrænset til at genbruge den
eksisterende, delte reservationsmotor og tilføje én byggefunktion,
Korrektion 9, ikke ny infrastruktur).

---

## 8. Fakturaer & bilag

Upload/mail/mobil → dokumentlæsning → destination → match → godkendelse →
eksport.

Denne arbejdsgang samler i blueprintet det der i dag er splittet mellem
Fakturacenter (Økonomi) og Procure → Fakturaer (**#27, MERGE**) til én
fælles platformfunktion (**#3, FINISH**), uafhængig af Procure-abonnement.

### Trin 1 — Upload/mail/mobil (indgangskanaler)
- **I dag:** IKKE bygget. `FAKTURAKILDE` definerer fire tiltænkte kanaler
  (`mail`, `upload`, `mobil`, `sag`), alle markeret `bygget: false`. Skærmen
  viser bevidst intet upload-UI ("Ingen af indgangene er bygget endnu").
  **Ingen fillagringsløsning findes noget sted i platformen.**
- **Blueprint-ændring (#3, FINISH):** "Byg drag-and-drop/fillagring FØRST;
  invoice-mail og OCR kan følge som kanaler." Blueprintet prioriterer selv
  upload frem for de øvrige kanaler; mail-baseret fakturaindtag er
  eksplicit udskudt til efter den første kanal, ikke et hårdt V1-krav i
  samme takt.
- **Change-type:** `BACKEND_REQUIRED` (filoplagring/upload-pipeline er
  reelt nyt — ingen Storage-integration eller Cloud Function findes i dag)
  + `VIEW_COMPOSITION` (drag-and-drop-UI). Mail-kanalen til fakturaer er en
  **anden** mailkanal end den indgående sags-mail nævnt i Fleet/Facility
  (workflow 2 og 3) — de to må ikke forveksles; ingen af dem er bygget, men
  de er forskellige komponenter.

### Trin 2 — Dokumentlæsning (OCR)
- **I dag:** IKKE bygget, intet spor af nogen OCR-pipeline. Fakturaer
  kommer i dag ind som allerede strukturerede poster i `fakturaer/`-noden
  via kilden `registreret` (en person taster dem ind manuelt i Procure).
- **Blueprint-ændring (#3, FINISH):** OCR er eksplicit en kanal der "kan
  følge" efter drag-and-drop/fillagring — ikke krævet i V1's første version
  af Fakturaer & bilag.
- **Change-type:** Intet krav i V1 (blueprintet udskyder det selv). V1
  fortsætter med manuel/strukturet indtastning suppleret af den nye
  fil-vedhæftning fra trin 1.

### Trin 3 — Destination (match)
- **I dag:** BUILT og relativt sofistikeret. `foreslaaDestination()` scorer
  forslag mod Fleet-/Facility-opgaver, Procure-ordrer og eget forbrugslager,
  med eksplicitte, forklarlige signaler. Kun et nummertræf giver 100 %,
  loft på 95 % ellers, minimum 40 % for at vises. Filtreret på kundens
  moduler. Selve tilknytningen skrives af `saetDestination()` → Cloud
  Function `fakturadestination`; en bogført faktura kan ikke flyttes.
- **Blueprint-ændring (#27, MERGE):** Samme matchings-/destinationslogik skal
  også dække de fakturaer der i dag vises på den separate
  Procure-fakturaer-skærm.
- **Change-type:** Ingen ændring af selve match-/destinationslogikken
  (allerede BUILT); `ROUTE_REDIRECT` for at Procure-fakturaer-brugere lander
  i den samme, fælles skærm (se trin 5).

### Trin 4 — Godkendelse
- **I dag:** BUILT, todelt med vilje. "Placering" (hvor hører fakturaen hen)
  og "betalingsgodkendelse" (`indkoeb.godkend` i dag) er to forskellige
  handlinger/permissions — bevidst skille mellem den der konterer og den der
  kan betale. Korrektion 2 i `00_AUTHORITATIVE_PRODUCT_RULES.md` erstatter
  `indkoeb.skriv`/`indkoeb.godkend` på `fakturamatch`/`fakturadestination`/
  `fakturastatus` med en ny, fakturaer-uafhængig familie:
  `fakturaer.laes`/`fakturaer.skriv`/`fakturaer.godkend`, samme
  rollefordeling som i dag. Skillet mellem placering og betaling ændres ikke.
- **Blueprint-ændring (#4, FINISH):** Fakturering (udgående fakturagrundlag)
  beholder godkend/lås/eksport uændret, men får en kanonisk oprettelse fra en
  afsluttet booking/tur (se Planning trin 7 ovenfor — samme underliggende
  gap, `opretGrundlag()` findes allerede og bruges i dag kun af Warehouses
  Afregning).
- **Change-type:** Ingen ændring af selve godkendelsesmekanikken for
  indgående fakturaer, men `PERMISSION_MODEL` for gatingen (Korrektion 2 —
  `indkoeb.skriv`/`indkoeb.godkend` → `fakturaer.skriv`/`fakturaer.godkend`,
  plus ny `fakturaer.laes` da `fakturaer`s `.read` i dag slet ikke er
  permission-gated). For udgående fakturagrundlag: `VIEW_COMPOSITION`
  (tilføj "opret grundlag fra booking/tur"-knap — funktionen findes allerede,
  ikke `BACKEND_REQUIRED`).

### Trin 5 — Eksport
- **I dag:** For **udgående** fakturagrundlag (Fakturering-kæden): BUILT og
  reel — CSV/JSON-fileksport, server-håndhævet godkend/lås/eksport-kæde. For
  **indgående** fakturaer (Fakturacenter): IKKE bygget. "Der sendes ikke
  noget til et regnskabssystem. Bogføring sætter tilstanden her; der er
  ingen integration."
- **Blueprint-ændring:** #4 (FINISH) bekræfter den udgående eksport skal
  beholdes uændret. **Ingen af de 62 rækker forpligter sig eksplicit til at
  bygge en regnskabsintegration for indgående fakturaer i V1** — #3's
  V1-handling for Fakturacenter taler kun om intake (drag-and-drop/fillagring)
  og fremtidige kanaler (mail/OCR), ikke om bogføringseksport.
- **Change-type:** Ingen ændring for udgående eksport (allerede BUILT og
  KEEP). For indgående fakturaers regnskabseksport: `IKKE PÅVIST` om det er
  i V1-scope — flagges som et ubesluttet hul, ikke en plan.

**Samlet vurdering for V1:** Matching/destination og den todelte godkendelse
er allerede den bedst udbyggede del af hele kæden og fungerer end-til-ende på
data der allerede findes i basen — det eneste nye arbejde her er den rene
`ROUTE_REDIRECT` der samler Procure-fakturaer ind under samme skærm. Den
reelt blokerende mangel før V1 er selve indgangen: der findes **intet**
filuploadlag i hele platformen i dag, og "byg drag-and-drop/fillagring" er
derfor rent `BACKEND_REQUIRED`-arbejde. Mail og OCR er bevidst udskudt af
blueprintet selv. Booking→fakturagrundlag-oprettelse mangler kun sin
UI-udløser (funktionen findes allerede — `VIEW_COMPOSITION`).
Regnskabseksport for indgående fakturaer er ikke adresseret af blueprintets
beslutningstekst for V1 (`IKKE PÅVIST`).
