# Dossier 01 — Dashboard & Økonomi

Kilder læst: `src/moduler/Dashboard.jsx`, `src/moduler/Oekonomi.jsx`,
`src/moduler/oekonomi/Fakturacenter.jsx`, `src/moduler/Fakturering.jsx`,
`src/fleet/dashboards.js`, `src/fleet/widgets.js`, `src/fleet/dashboardvisning.js`,
`src/fleet/useKpi.js`, `src/fleet/kpi-aggregering.js`, `src/fleet/fakturacenter.js`,
`src/fleet/faktura.js`, `src/fleet/fakturering.js`, `src/fleet/grundlag.js`,
`src/fleet/grundlagseksport.js`, `src/fleet/omkostninger.js`, `src/fleet/nav.js`,
`src/fleet/moduler.js`, samt stikprøver i `functions/index.js` for
`grundlagskriv`, `fakturamatch`, `fakturastatus`, `fakturadestination`.

---

## Modul-resumé

**navn:** Dashboard & Økonomi (fire skærme: Dashboard, Økonomi & Rapporter,
Fakturacenter, Fakturering).

**formål:** (1) ét operativt overbliksbillede bygget udelukkende af et
tværmodulært KPI-aggregat (`kpi/`), aldrig af rådata; (2) et fælles,
modul-uafhængigt sted for indgående fakturaer (Fakturacenter — modtagelse,
destinationsmatch, godkendelse, bogføring); (3) et sted for udgående
fakturagrundlag (Fakturering — godkendelse, låsning, eksport til
regnskabssystem).

**primær brugertype:** Dashboard er alles forside (alle 7 roller lander der).
Økonomi-undersiderne er reelt begrænset til dem med `grundlag.laes` og/eller
`indkoeb.laes` (typisk disponent, koordinator, admin, revisor) — menupunkterne
selv er ikke permission-gatede (`fakturacenter` og `fakturering` er det,
`oekonomi`-toppunktet og `dashboard` er det ikke), men KPI-tallene under dem
er det, via `KPI_PERM`.

**vigtigste opgave:** Give ledelsen/disponenten ét sted at se drift +
økonomi uden at skulle besøge hvert modul, og ét sted at behandle fakturaer
ind og ud.

**vigtigste funktioner:**
- Dashboard: valgbart modul-dashboard (`?db=`), brugerens eget widget-layout
  (læg til/fjern/flyt, gem via `skriv.js`), "Prioriterede handlinger"-liste,
  modulkort pr. modul, statusfordelings-donut, omkostningsgraf, "Åbne
  opgaver der kræver opfølgning"-tabel.
- Økonomi: KPI-kort (driftsomkostninger, ikke-faktureret, budgetafvigelse,
  dækningsgrad), rapporttype-filter, omkostnings- vs. budgetgraf,
  dækningsgrad-mod-mål-graf, "Største afvigelser", nøgletalstabel pr.
  omkostningskategori, omkostning pr. km/driftstime/opgave, "Opgaver klar til
  fakturering".
- Fakturacenter: KPI-kort (nye/manglende match/til godkendelse/godkendt),
  fakturaliste med foreslået destination + matchscore, detaljepanel med
  forslagsvalg, godkend-match, "ingen destination"-dialog, to-trins
  godkendelse (placering vs. betalingsgodkendelse), bogføring.
- Fakturering: KPI-kort (kladder, spærret af åbne etaper, mangler momssats),
  grundlagsliste med gennemstreget erstattet-nummer, detaljepanel med
  linjetabel, godkend-knap, lås-mod-eksportreference, eksportknapper
  (Neutral JSON, CSV).

**undermoduler:** Dashboard (`/`), Økonomi Oversigt (`/oekonomi`),
Fakturacenter (`/oekonomi/fakturacenter`), Fakturering
(`/oekonomi/fakturering`).

**afhænger af (andre moduler):** Ingen formelt (`MODUL_KRAEVER` indeholder
kun `booking → kunder` og `warehouse → kunder`; `oekonomi` og `dashboard`
optræder ikke som krævende noget). Funktionelt er begge skærme dog
fuldstændig afhængige af data fra andre moduler: Dashboard og Økonomi læser
**kun** det aggregerede `kpi/`-domæne (aldrig moduldata direkte); Fakturacenter
læser `opgaver`, `indkoebsordrer`, `forbrugsvarer`, `koeretoejer`,
`facility/aktiver` for at kunne foreslå destinationer; Fakturering læser
`grundlag`, `etaper`, `kunder`.

**afhænges af (hvem læser dette modul):** Ingen modul kræver `oekonomi` eller
`dashboard` (jf. `MODUL_KRAEVER`). Fakturacenteret peger dog tilbage til
"Procure → Fakturaer" som den samme node set gennem en anden linse — de to
skærme deler samme `fakturaer/`-node uden modulklausul.

**samlet status:** BLANDET. UI-infrastrukturen (KPI-kort, gates,
fejltilstande, layout) er fuldt bygget og konsekvent på tværs af alle fire
skærme. Men:
- Dashboard/Økonomis økonomital er for størstedelens vedkommende **null i
  produktion** — se Implementation-status.
- Fakturacenter har ingen fungerende indgangskanal (ingen fillagring).
- Fakturering har en fuldt håndhævet godkend/lås/eksport-kæde, men **ingen
  UI-vej til at oprette et forløbsbaseret (booking-tur) grundlag** — kun
  Warehouse's periodeafregning (`Afregning.jsx`) kalder rent faktisk
  `opretGrundlag()` fra `fakturering.js`.

**overlap-mistanke:** Se "Mulige overlap" nedenfor — Fakturacenter/Procure →
Fakturaer (samme node, to linser); Dashboard "Største afvigelser" og
Økonomi "Største afvigelser" (samme felt, bevidst).

---

## Skærme

### Dashboard (`/`)
- **sidenavn:** Dashboard
- **hvem bruger den:** Alle roller — eneste altid-synlige modul (`altid: true`
  i `moduler.js`).
- **primært formål:** Operativt + økonomisk overblik på tværs af moduler.
- **primær handling:** Vælge dashboard (`<select>`: Samlet, Fleet, Facility,
  Procure, Warehouse, Unitbooking, Workforce) via `?db=`.
- **sekundære handlinger:** "Tilpas forside" (redigér eget widget-layout: tilføj/
  fjern/flyt widgets med mus eller piletaster, "Nulstil", "Gem layout",
  "Annullér").
- **data vist:** KPI-rækker (åbne opgaver, nedetid, driftsomkostninger,
  omkostning pr. km, planlagt/akut vedligehold, ikke-faktureret), "Prioriterede
  handlinger"-liste, statusfordelings-donut, omkostningsgraf (6 mdr.), "Største
  afvigelser", ét modulkort pr. modul med 3 tal hver, tabel over åbne opgaver.
- **data der kan ændres:** Kun brugerens eget widget-layout
  (`brugerlayout/<uid>/<dashboard>`, skrevet via `gem()`/`skriv.js`,
  `auth.uid === $uid`). Intet nøgletal er redigerbart herfra.
- **kommer typisk fra:** `kpi/current/<domæne>` (aggregeret nedefra af en
  Cloud Function/job, ikke af klienten); brugerlayout og dashboardvisning fra
  `usePost`.
- **går typisk til:** Links til `/booking`, `/oekonomi`, samt hvert modulkorts
  egen sti.
- **overlap med anden side:** "Største afvigelser" er samme `k.afvigelser`-felt
  som Økonomi viser (bevidst, samme kilde). "Åbne opgaver"-tabellen bruger
  hardkodet demo-data (`DEMO_DASHBOARD_OPGAVER`) uafhængigt af backend — se
  status nedenfor.
- **status:** PARTIAL. Layoutfunktionen (læs/skriv) er BUILT (rigtig
  Firebase-læsning og -skrivning via `usePost`/`gem()`). Men langt de fleste
  viste tal er reelt null i produktion (se Implementation-status), og
  "Åbne opgaver der kræver opfølgning"-tabellen viser **altid**
  `DEMO_DASHBOARD_OPGAVER` — den er ikke koblet til nogen `useListe()`-læsning
  overhovedet; det er ikke en `demo:`-fallback, det er den eneste kilde
  skærmen har for den tabel.
- **demo-data (ja/nej+note):** JA for opgavetabellen (permanent, ikke kun i
  demo-tilstand — importeret direkte fra `demo-dashboard.js`, ikke via
  `useListe(..., {demo:})`). KPI-kortene bruger `demo-kpi.js` kun når appen
  kører uden Firebase-nøgler.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift (forside).

### Økonomi & Rapporter — Overblik (`/oekonomi`)
- **sidenavn:** Økonomi & Rapporter
- **hvem bruger den:** Roller med `grundlag.laes`/`indkoeb.laes` (økonomidomænet
  er permissionsspærret via `KPI_PERM`); menupunktet selv er ikke
  perm-gatet.
- **primært formål:** Rapportering af driftsøkonomi: omkostninger vs. budget,
  dækningsgrad, afvigelser, omkostning pr. enhed, faktureringsklare opgaver.
- **primær handling:** Vælge rapporttype (Samlet drift / Værksted /
  Brændstof / Dæk / Forsikring / Øvrige) — filtrerer tabel og
  omkostningsgraf.
- **sekundære handlinger:** "Eksportér rapport"-knap — **permanent
  deaktiveret** med begrundelsen *"Eksport er ikke bygget endnu — formatet
  skal aftales med bogholderiet først."*
- **data vist:** Driftsomkostninger, ikke-faktureret, budgetafvigelse,
  dækningsgrad (KPI-kort); omkostnings- og dækningsgrad-grafer (12 mdr.);
  "Største afvigelser"; nøgletalstabel pr. kategori med afvigelse i kr/%,
  dækningsgrad, trend; omkostning pr. km/driftstime/opgave; "Opgaver klar til
  fakturering" (top 5 af `DEMO_KLAR_TIL_FAKTURERING`).
- **data der kan ændres:** Intet — ren rapportside, ingen skriv-handling
  overhovedet.
- **kommer typisk fra:** `kpi/current/oekonomi` (aggregat), samt
  `demo-oekonomi.js` for kategori-nedbrydning (`omkostningsserie()`) og
  `DEMO_KLAR_TIL_FAKTURERING`.
- **går typisk til:** Links til `/oekonomi/fakturering`, `/booking/opsaetning`,
  `/opsaetning/kunder`, Dashboard.
- **overlap med anden side:** Samme `k.afvigelser`-felt som Dashboard (bevidst,
  kommenteret eksplicit i koden som en rettet mockup-fejl). "Opgaver klar til
  fakturering" overlapper begrebsmæssigt med Fakturering-skærmen.
- **status:** PARTIAL/MOCK-hybrid. Skærmen selv er velbygget og læser
  konsekvent `useKpi()`, men **kategori-nedbrydningen
  (`omkostningsserie()`/`kategorier`) og "Opgaver klar til fakturering"
  (`DEMO_KLAR_TIL_FAKTURERING`) kommer permanent fra `demo-oekonomi.js`, ikke
  fra en node** — der findes ingen `omkostningskategorier`- eller lignende
  node i basen for dette. Kun totalrækken (`total`) bruger ægte
  `kpi.oekonomi`-felter, og de fleste af *dem* er selv null i produktion (se
  Implementation-status).
- **demo-data (ja/nej+note):** JA, permanent for kategori-tabellen,
  dækningsgrad-historikken og faktureringsklar-listen (ikke kun som
  offline-fallback).
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift
  (rapportering), for kunder med Økonomi-modulet.

### Fakturacenter (`/oekonomi/fakturacenter`)
- **sidenavn:** Fakturacenter
- **hvem bruger den:** Brugere med `indkoeb.laes` (læs) / `indkoeb.skriv`
  (destinationssætning) / `PERM_GODKEND` (betalingsgodkendelse).
- **primært formål:** Ét fælles sted til at placere (destinationsbestemme),
  godkende og bogføre indgående fakturaer på tværs af Fleet, Facility og
  Procure.
- **primær handling:** Vælge en faktura → vælge foreslået destination (radio
  blandt op til 4 scorede forslag) → "Godkend match".
- **sekundære handlinger:** "Ingen destination" (kræver begrundelse, dialog);
  "Godkend faktura" (betalingsgodkendelse, kræver `indkoeb.godkend`);
  "Bogfør/eksportér" (kun efter godkendt).
- **data vist:** KPI-kort (nye, manglende match, afventer godkendelse,
  godkendt+beløb); fakturaliste (nummer, leverandør, kilde, foreslået
  destination, matchscore %, status); detaljepanel med beløb ekskl./inkl.
  moms, forslag med signaler, afvigelse fra ventet beløb.
- **data der kan ændres:** `fakturaer/<id>.destinationArt/destinationId`
  (via `saetDestination()` → Cloud Function `fakturadestination`),
  `.status` (via `skiftFaktura()` → `fakturastatus`).
- **kommer typisk fra:** `fakturaer` (delt, u-gatet node), `leverandoerer`,
  `indkoebsordrer`, `opgaver`, `forbrugsvarer`, `koeretoejer`,
  `facility/aktiver` — alle via `useListe()` med `demo:`-fallback.
- **går typisk til:** Ingen udgående links ud over en henvisning til
  "Procure → Fakturaer" (samme data, anden linse).
- **overlap med anden side:** Fuldstændigt overlap i datakilde med
  "Procure → Fakturaer" (`/indkoeb/fakturaer`) — samme `fakturaer/`-node,
  bevidst delt (ingen modulklausul), forskellig visning/scope.
- **status:** BUILT for match/godkendelse/bogføring-arbejdsgangen (rigtige
  læsninger via `useListe`, rigtige skrivninger via `saetDestination()` og
  `skiftFaktura()` mod ægte Cloud Functions `fakturadestination` og
  `fakturastatus`, bekræftet i `functions/index.js`). MOCK/NOT_BUILT for
  indgangskanalerne: "Modtag bilag"-kortet viser bevidst ingen upload-UI —
  teksten siger eksplicit *"Ingen af indgangene er bygget endnu"* fordi der
  ikke findes nogen fillagring i systemet. Kun kilden `registreret` (manuel
  systemregistrering) er markeret `bygget: true` i `FAKTURAKILDE`; `mail`,
  `upload`, `mobil`, `sag` er alle `bygget: false`.
- **demo-data (ja/nej+note):** JA som ren offline/`demo:`-fallback for alle
  seks `useListe()`-kald — ikke vist når Firebase er tilgængelig.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift, for
  kunder med Procure-modulet (`indkoeb.laes`-gated).

### Fakturering (`/oekonomi/fakturering`)
- **sidenavn:** Fakturering
- **hvem bruger den:** Brugere med `grundlag.laes` (se) / `grundlag.godkend`
  (godkende/låse — samme permission bruges til begge i UI'et,
  `PERM.grundlagGodkend`).
- **primært formål:** Godkende, låse og eksportere fakturagrundlag
  (opgørelser der bliver til den faktura kundens eget regnskabssystem
  udsteder).
- **primær handling:** Vælge et grundlag → "Godkend" → skriv eksportreference
  → "Lås mod reference".
- **sekundære handlinger:** "Hent CSV"/"Hent Neutral (JSON)" (kan gøres
  gentagne gange, også på et låst grundlag).
- **data vist:** KPI-kort (kladder, spærret af åbne etaper, mangler
  momssats — sidstnævnte forventes altid 0 siden beslutning 98); grundlagsliste
  med nummer (gennemstreget hvis erstattet), kunde, tilstand, beløb, moms;
  detaljepanel med linjetabel, spærringsårsager, historik (append-only).
- **data der kan ændres:** Grundlagets tilstand
  (kladde→godkendt→låst) og `eksportReference`, via Cloud Function
  `grundlagskriv` (handlinger `godkend`/`laas`). **Ingen "opret"-handling
  findes i denne skærm** — se Workflow-observationer.
- **kommer typisk fra:** `grundlag` (rigtig node, `useListe`, `.write: false`
  for alle inkl. admin — kun `grundlagskriv` kan skrive), `etaper`, `kunder`.
- **går typisk til:** Downloadet fil (CSV/JSON) — intet link videre i appen.
- **overlap med anden side:** Ingen direkte; komplementær til
  Fakturacenter (indgående vs. udgående).
- **status:** BUILT for godkend/lås/eksport-kæden — ægte læsning og skrivning,
  server-side håndhævelse identisk med klientens kontrol (`grundlag.js`
  kopieret til `functions/delt/`), bekræftet i `functions/index.js`
  (`grundlagskriv`, transaction-baseret nummerserie, `kanGodkende`/`kanLaase`
  genbrugt server-side). Se dog Workflow-observationer for hullet i
  oprettelsesvejen.
- **demo-data (ja/nej+note):** JA som ren offline/`demo:`-fallback
  (`DEMO_GRUNDLAG`, `DEMO_ETAPER`, `DEMO_KUNDER`) — ikke vist når Firebase er
  tilgængelig.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift, for
  kunder med Økonomi-modulet.

---

## Data-entiteter

| entity | RTDB-node(r) | ejes af (jf. NODE_MODUL) | bruges også af | kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| KPI-aggregat | `kpi/current/<domæne>` | Ingen (base/aggregat, ikke i `NODE_MODUL`) | Alle moduler der viser nøgletal | Skrives kun af et (ikke læst i denne runde) server-job; klienten læser aldrig rådata for at regne selv. Domænet `oekonomi` kræver `grundlag.laes`; `flaade`/`facility`/`indkoeb` kræver `indkoeb.laes`. |
| Fakturaer (indgående) | `fakturaer` | Ingen — bevidst u-gatet base-node ("tre tvetydige noder") | Procure → Fakturaer, Fakturacenter | Fælles node, ingen modulklausul. Skrevet kun via Cloud Functions `fakturamatch`/`fakturastatus`/`fakturadestination`. |
| Fakturagrundlag | `grundlag` | Ingen (base) | Kun Fakturering-skærmen (og Warehouse Afregning ved oprettelse) | `.write: false` for alle. Nummer fra transaction-counter. |
| Leverandører | `leverandoerer` | Indkøb (`indkoeb`) | Fakturacenter (navn-opslag), KPI facility/indkøb-domæner | Læst read-only i dette modul. |
| Indkøbsordrer | `indkoebsordrer` | Indkøb | Fakturacenter (destinationsforslag) | Læst read-only. |
| Forbrugsvarer | `forbrugsvarer` | Indkøb | Fakturacenter (lagerforslag), KPI indkøb-domæne | Læst read-only. |
| Opgaver | `opgaver` | Ingen (delt: flåde+facility, art-feltet skelner) | Fakturacenter (fleet/facility-forslag), KPI opgaver-domæne | Læst read-only. |
| Køretøjer | `koeretoejer` | Flåde (`flaade`) | Fakturacenter (matchsignal "enheden på fakturaen") | Læst read-only. |
| Facility-aktiver | `facility/aktiver` | Facility | Fakturacenter (matchsignal "anlægget på fakturaen") | Læst read-only. |
| Etaper | `etaper` | Ingen (base) | Fakturering (spærrer godkendelse ved åben etape), KPI oekonomi/disponering-domæner | Læst read-only i Fakturering; skrives ikke herfra. |
| Kunder | `kunder` | Kunder (`kunder`) | Fakturering (kundenavn), KPI kunder-domæne | Læst read-only. |
| Brugerlayout | `brugerlayout/<uid>/<dashboard>` | Ingen — brugerens egen | Kun Dashboard | Skrives af klienten selv via `gem()`, `auth.uid === $uid`. |
| Dashboardvisning | `dashboardvisning/<uid>` | Ingen — admins visningsvalg | Kun Dashboard | Kun en VISNING (skjuler), ikke en adgangskontrol — læses via `usePost`. |

---

## Implementation-status

**Dashboard — layout (læs/skriv brugerpræference):** BUILT. Persistence:
real (`gem()` → `brugerlayout/<uid>/<dashboard>`, valideret af `valideLayout()`
både klient- og (implicit) regelside). Kan bruges end-to-end.

**Dashboard — KPI-kort og modulkort:** PARTIAL. Persistence: real for
læsningen (ægte `kpi/`-node), men mange underliggende felter er selv `null` i
produktionsaggregeringen (se "Økonomi-KPI'er" nedenfor) — skærmen viser
korrekt INTET (`—`) for dem, men det betyder at fx "Driftsomkostninger",
"Planlagt vs. akut vedligehold" reelt aldrig viser et tal hos en rigtig
kunde i dag. Warehouse- og Unitbooking-modulkortene viser eksplicit "Tallene
aggregeres ikke endnu" — kendt, dokumenteret hul.

**Dashboard — "Åbne opgaver der kræver opfølgning"-tabel:** MOCK. Kilden er
`DEMO_DASHBOARD_OPGAVER` importeret direkte, ikke via `useListe()`. Denne
tabel viser samme opdigtede rækker uanset tenant eller Firebase-tilstand.

**Økonomi — KPI-kort (top):** PARTIAL, se detalje nedenfor.

**Økonomi — kategori-nedbrydning og faktureringsklar-liste:** MOCK. Kommer
fra `demo-oekonomi.js` (`omkostningsserie()`, `DEMO_DAEKNINGSGRAD_HISTORIK`,
`DEMO_KLAR_TIL_FAKTURERING`) uanset backend-tilstand — der findes ingen node
disse læses fra.

**Økonomi-KPI'er i `kpi-aggregering.js` (domænet `oekonomi`):** Kritisk fund.
Af de felter Dashboard og Økonomi viser er kun to reelt beregnet af rigtige
data:
- `ikkeFaktureretOere` / `ikkeFaktureretForloeb` — ægte, regnet af
  `etaper` + `grundlag` (kun udført arbejde uden LÅST grundlag tæller).
- Alle øvrige felter er hardkodet `null` med en skreven begrundelse:
  `driftsomkostningerOere: null`, `budgetOere: null`,
  `maalDaekningsgradPct: null`, `daekningsgradPct: null`, `driftstimer: null`,
  `planlagtPct: null`, `akutPct: null`, `planlagtVedligeholdPct: null`, og
  deres tilhørende deltaer. Begrundelsen i koden: budget/dækningsgradsmål er
  beslutninger der ikke er indtastet nogen steder endnu, og
  driftsomkostninger/driftstimer mangler en defineret PERIODE at summere over.
  `afvigelser` er permanent en tom liste (`[]`) — ingen aggregering findes for
  den overhovedet, i modsætning til hvad README's KPI-efterslæb antyder for
  andre felter.
- Konsekvens: KPI-kortene "Driftsomkostninger", "Budgetafvigelse",
  "Dækningsgrad", "Planlagt vs. akut vedligehold" på **både** Dashboard og
  Økonomi vil i en rigtig, ikke-demo tenant vise `—` (INTET) for stort set
  alt undtagen ikke-faktureret-beløbet. Skærmene selv håndterer dette korrekt
  (ingen fejlvisning, ingen falsk nul) — men den forretningsmæssige nytte af
  "Økonomi & Rapporter" er i dag stærkt begrænset i produktion.

**Fakturacenter — match/placering/godkendelse/bogføring:** BUILT.
Persistence: real (`saetDestination()`/`skiftFaktura()` →
`fakturadestination`/`fakturastatus` Cloud Functions, bekræftet eksisterende
i `functions/index.js`). Kan bruges end-to-end for fakturaer der allerede
findes i `fakturaer/`-noden.

**Fakturacenter — indgangskanaler (drag & drop, invoice-mail,
mobilkvittering, "fra sag"):** NOT_BUILT, eksplicit erkendt i
kildekoden ("Ingen af indgangene er bygget endnu … kræver alle fillagring").
Kun `registreret` (manuel oprettelse et andet sted i systemet) er en reel
kilde i dag.

**Fakturering — godkend/lås/eksport:** BUILT. Persistence: real,
server-håndhævet med delt regelkode (`functions/delt/grundlag.js`), egen
nummerserie via transaction, momssats sat automatisk (25 %, beslutning 98).
Eksportadaptere: kun Neutral (JSON) og CSV findes — bevidst ingen
e-conomic/Dinero/Business Central-adapter (dokumenteret i
`grundlagseksport.js` som et åbent spørgsmål, ikke et hul).

**Fakturering — oprettelse af et forløbsbaseret (booking-tur) grundlag:**
PARTIAL/hul. `fakturering.js` eksporterer `opretGrundlag()`, og Cloud
Function `grundlagskriv` understøtter `handling: "opret"` fuldt ud
(inkl. validering af enten `bookingId` ELLER periode). Men i hele
`src/moduler/` er den eneste skærm der reelt kalder denne funktion
`warehouse/Afregning.jsx` — og den sender altid en **periode**, aldrig et
`bookingId`. Ingen skærm i Booking/Planning-modulet blev fundet der opretter
et grundlag for en afsluttet tur. Fakturering-skærmen selv har ingen
"opret grundlag"-knap. Konklusion: den kode-vej der understøtter almindelig
tur-fakturering (ikke lagerafregning) er bygget server-side, men mangler sin
UI-indgang — kan ikke bruges end-to-end af en disponent i dag uden en
skærm der ikke blev fundet i dette moduls filsæt.

---

## Workflow-observationer

**"Fakturacenter"-kæden (alle indgangskanaler → OCR/læsning → match →
modul/sag/ordre → godkendelse → eksport):**

1. **Indgangskanaler:** IKKE bygget. `FAKTURAKILDE` definerer fire tiltænkte
   kanaler (`mail`, `upload`, `mobil`, `sag`), alle markeret `bygget: false`.
   Skærmen viser bevidst intet upload-UI ("Ingen af indgangene er bygget
   endnu … ét felt med én begrundelse er ærligere" end fire attrap-knapper).
   Der findes ingen fillagringsløsning i platformen på tidspunktet for denne
   kode.
2. **OCR/læsning:** IKKE bygget, og intet spor i den læste kode af nogen
   OCR-pipeline. Fakturaer kommer ind som allerede strukturerede poster i
   `fakturaer/`-noden (kilden `registreret`) — dvs. en person taster dem ind
   et andet sted i systemet (Procure-modulet, ikke set i dette dossier).
3. **Match (destinationsforslag):** BUILT og relativt sofistikeret.
   `foreslaaDestination()` i `fakturacenter.js` scorer forslag mod
   Fleet-/Facility-opgaver, Procure-ordrer og eget forbrugslager, med
   eksplicitte, forklarlige signaler (`nummer`, `leverandoer`, `koeretoej`,
   `aktiv`, `vare`, `beloeb`, `beloebNaer`, `dato`). Kun et nummertræf giver
   100 %; loft på 95 % ellers, minimumscore 40 %. Filtreret på kundens
   moduler, så en kunde uden Facility aldrig ser en facility-destination.
4. **Modul/sag/ordre-tilknytning:** BUILT. `saetDestination()` skriver
   destinationen via ægte Cloud Function (`fakturadestination`), med
   klient-side og server-side identisk kontrol (`kanSaetteDestination()`).
   En bogført faktura kan ikke flyttes.
5. **Godkendelse:** BUILT, todelt med vilje. "Placering" (hvor hører
   fakturaen hen) og "betalingsgodkendelse" (`indkoeb.godkend`) er to
   forskellige handlinger/permissions — dokumenteret som bevidst skille
   (den der konterer, skal ikke nødvendigvis kunne betale).
6. **Eksport:** IKKE bygget for **indgående** fakturaer — skærmen siger
   eksplicit *"Der sendes ikke noget til et regnskabssystem. Bogføring
   sætter tilstanden her; der er ingen integration."* "Bogfør/eksportér"-
   knappen ændrer kun status internt.
   (Bemærk: **udgående** fakturagrundlag i Fakturering-skærmen HAR en ægte
   fileksport — CSV/JSON — det er en anden del af kæden.)

**Samlet vurdering af kæden:** Matching → destinationssætning → todelt
godkendelse er den bedst udbyggede del af hele modulet og fungerer
end-to-end på data der allerede er i basen. Indgang (mail/upload/OCR) og
udgående regnskabsintegration for indgående fakturaer mangler helt og er
tydeligt markeret som sådan i koden — ingen skjulte attrapper fundet.

---

## UI-mønstre

- **Layout:** Alle fire skærme bruger `<div className="fc-grid">` som
  yderste container og genbruger fælles primitiver fra `fleet/ui.jsx`:
  `Kort`, `KpiKort`, `KpiRaekke`, `Tabel`, `Pille`, `Gitter`, `Henter`,
  `Datatilstand`, `MiniLinje`, `Knap`, `Formularsvar`.
- **KPI-kort:** `KpiRaekke` af `KpiKort` er det gennemgående mønster for
  nøgletal øverst på alle fire skærme; `afvigelse`/`deviation()` bruges
  konsekvent for at farve stigning/fald korrekt afhængigt af `betterWhen`
  ("lower" for omkostninger, "higher" for dækningsgrad).
- **Grafer:** `Soejlegraf` (omkostning vs. budget-linje), `Linjegraf`
  (dækningsgrad vs. mål-serie), `Donut` (statusfordeling),
  `MiniKurve` (trend-sparkline i tabelceller).
- **Tabeller:** `Tabel`-komponent med `kolonner`/`raekker`, `paaRaekke` for
  rækkevalg (Fakturering), `render`-funktioner for sammensatte celler.
- **Filtre:** Kun ét rigtigt filter på Økonomi (`Rapporttype`) — bevidst
  begrænset, med en forklarende tekst om hvorfor virksomhed/periode/afdeling
  ikke gentages her (de ejes af shell'en).
- **Modaler/dialoger:** `Dialog`-komponent bruges i Fakturacenter til "Ingen
  destination passer"-begrundelse.
- **Statusfarver:** `Pille`-komponent med `tone` (`ok`/`warn`/`bad`/`info`)
  gennemgående for tilstande (fakturastatus, grundlagstilstand,
  centertilstand, alvor).
- **Terminologi:** Konsekvent dansk (Fakturacenter = modtagne fakturaer,
  Fakturering = det vi sender; "grundlag" ≠ "faktura"). CSS-klassenavne set:
  `fc-grid`, `fc-kal-top`, `fc-widget-red`, `fc-widget-vaerktoej`,
  `fc-permgitter`, `fc-afvig`, `fc-fakt`, `fc-trend`, `fc-filtre`,
  `fc-slipfelt`, `fc-forslag`, `fc-forslag-valgt`, `fc-med-ikon`,
  `fc-tolinje`, `fc-underoverskrift`, `fc-hint`, `fc-a`.
- **Knapper:** Deaktiverede knapper bærer altid en `title`-forklaring
  ("Kræver X", "Eksport er ikke bygget endnu …") frem for blot at være grå
  uden begrundelse — konsekvent mønster på tværs af alle fire skærme.

---

## Mulige overlap

- **Site A:** Fakturacenter (`/oekonomi/fakturacenter`)
  **suspected Site B:** Procure → Fakturaer (`/indkoeb/fakturaer`, ikke læst i
  dette dossier)
  **why:** Begge læser samme `fakturaer/`-node (bevidst, u-gatet,
  dokumenteret som "TRE TVETYDIGE NODER"). Fakturacenter selv beskriver
  forholdet som "Procure er én linse; her ses alle destinationer."
  **risk:** To brugergrænseflader for samme handling (destinationssætning,
  godkendelse) kan i praksis give forskellige matchforslag hvis de to
  skærmes matchlogik nogensinde driver fra hinanden (i dag deler de samme
  `matchForslag()`/`foreslaaDestination()`-funktioner, så risikoen er lav men
  til stede ved fremtidige ændringer i kun den ene fil).

- **Site A:** Dashboard "Største afvigelser"-kort
  **suspected Site B:** Økonomi "Største afvigelser"-kort
  **why:** Begge læser samme `k.afvigelser`-felt fra KPI-aggregatet. Koden
  dokumenterer eksplicit at dette er en RETTET mockup-fejl (før: to separate
  lister med forskellige navne for samme beløb).
  **risk:** Lav i dag (samme kilde), men feltet `afvigelser` er selv
  permanent tom (`[]`) i aggregeringen — begge kort viser derfor altid
  "Ingen afvigelser i perioden" i produktion, hvilket kan fejlagtigt tolkes
  som "ingen afvigelser findes" fremfor "afvigelsesaggregering er ikke
  bygget".

- **Site A:** Økonomi "Opgaver klar til fakturering"
  **suspected Site B:** Fakturering (`/oekonomi/fakturering`)
  **why:** Begge titler antyder samme koncept ("hvad venter på at blive
  faktureret"), men Økonomi-skærmens liste er 100 % demo-data
  (`DEMO_KLAR_TIL_FAKTURERING`) mens Fakturering viser ægte `grundlag`-poster
  i kladde-tilstand.
  **risk:** Middel — en bruger kan opfatte de to lister som samme
  datakilde vist to steder, når den ene reelt er statisk demo-indhold og den
  anden er live data.

- **Site A:** Dashboard modulkort for Warehouse/Unitbooking
  **suspected Site B:** de respektive modulers egne dashboards (ikke læst i
  dette dossier)
  **why:** Begge ville i princippet vise nøgletal for samme modul, men
  Dashboard-kortene her viser eksplicit "Tallene aggregeres ikke endnu" —
  intet overlap i praksis før aggregeringen er bygget.
  **risk:** Lav p.t. (ingen tal at være uenige om).

---

## IKKE PÅVIST

- Hvorvidt der findes en skærm uden for `src/moduler/` (fx i Booking/Planning,
  som ikke indgik i denne moduls filliste) der opretter et forløbsbaseret
  fakturagrundlag — kun fraværet af et sådant kald i de læste filer og i
  `src/moduler/warehouse/Afregning.jsx`/`udbyder/Prisliste.jsx` blev
  bekræftet. En fuld `grep` over hele `src/` blev ikke kørt som del af denne
  afgrænsede opgave.
- Hvilket job/hvilken Cloud Function der reelt skriver til `kpi/current/*` —
  kun forbrugersiden (`useKpi.js`, `kpi-aggregering.js`s rene beregningsfunktion)
  blev læst, ikke selve triggeren/schedule'en i `functions/index.js`.
