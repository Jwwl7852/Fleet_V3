<title>Authoritative Product Rules</title>

# 00 — Autoritative produktregler (V1-oprydning)

**Status:** Låst. Denne fil er den ENESTE kilde til produktretningen for
V1-oprydningen. Kilde: `FleetControl_V1_product_blueprint.md` (vedlagt af
ejeren/Dennis, dateret 24.08.2026), krydsrefereret mod
`docs/product-audit/` (den faktuelle kodeaudit, samme dag).

⚠ **Denne runde er kun planlægning og verifikation. 0 ændringer i
produktkode, Firebase-regler, Cloud Functions eller data er foretaget for
at producere dette dokumentsæt.**

## Målet

En første salgsbar og brugbar V1 til mindre og mellemstore
transport-/servicevirksomheder. Ikke en omskrivning — en oprydning. De
stærkeste tekniske flows (booking/etape-motoren, Warehouse, Unitbooking,
chaufførappens offline-kø) bevares uændret. Det der strammes er
informationsarkitekturen, navigationen, dashboardet og de parallelle
indgange, samt at ufærdige flader stopper med at udgive sig for færdige.

## Produktgrundlov (10 regler, ordret fra blueprintet)

1. Hver skærm har ét primært formål og én tydelig hovedhandling.
2. Hver forretningshandling har ét kanonisk hjem; andre steder må kun være
   genveje eller filtrerede views.
3. Moduler ejer deres faglige objekter: Planning=transport, Fleet=enheder/
   drift, Facility=bygning/anlæg, Procure=indkøb, Warehouse=kundegods,
   Unitbooking=udlejningsenheder, Workforce=personale.
4. Fælles objekter er platformfunktioner: kunder, leverandører,
   fakturaer/bilag, brugere, reservationer, audit og notifikationer.
5. Opsætning er administration, ikke daglig drift.
6. Et produktions-UI viser enten ægte data, en ærlig tomtilstand eller
   ingenting — aldrig permanente demo-rækker forklædt som kundedata.
7. Navigation følger brugerens arbejde og købte moduler; serverpermissions
   er fortsat den egentlige sikkerhed.
8. Dashboardet viser undtagelser, beslutninger og næste handling — ikke
   alle tilgængelige KPI'er.
9. Kun én primær blå handling pr. arbejdsområde; grøn/gul/rød bruges kun
   til status og risiko.
10. Ufærdige funktioner skjules eller markeres tydeligt som beta; de
    præsenteres ikke som færdige gennem deaktiverede attrapknapper.

**Regel 7 kræver et præcist skel, som resten af dokumentsættet
respekterer:** navigationssynlighed (hvad der TEGNES i menuen — en
kommerciel/UX-beslutning) er en ANDEN mekanisme end permissions (hvad
serveren FAKTISK tillader — sikkerhedskontrollen). Det er samme skel som
`kraeverModul`/`kraeverPerm` i dagens `nav.js` allerede håndhæver for et
mindretal af skærme — V1-oprydningen udvider princippet, den opfinder det
ikke.

## Ny hovednavigation (målbillede — se 02_TARGET_NAVIGATION.md for detaljer)

**Fælles:** Dashboard · Kunder (kun når relevant) · Fakturaer & bilag ·
Økonomi / Fakturagrundlag
**Driftsmoduler efter abonnement:** Planning · Fleet · Facility · Procure ·
Warehouse · Unitbooking · Workforce
**Administration:** Opsætning
**Hjælp:** Enkel hjælp/kontakt i V1; fuldt supportsagssystem senere

## Dashboard-reglen

- Én aktivt købt modul: ingen Samlet-vælger; brugeren lander direkte på
  modul-dashboardet.
- To eller flere moduler: vælgeren viser Samlet + de moduler brugeren må
  se.
- Samlet dashboard viser 3–6 handlingskort og én prioriteret
  arbejdslistesektion — ikke alle modul-KPI'er.
- Brugerens ekstra widgets ligger i en sekundær, sammenklappelig sektion;
  der indføres ikke et vilkårligt dataloft.

## Beslutningsfordeling (62 skærme)

| Beslutning | Antal | Betyder |
|---|---:|---|
| KEEP | 21 | Uændret placering og formål, mindre finish/verifikation |
| FINISH | 18 | Beholdes, men et reelt hul lukkes før V1 |
| MERGE | 8 | Funktionen bevares, men ophører som selvstændig menu-skærm |
| MOVE | 8 | Skærmen består, men flytter menuplacering |
| HIDE | 3 | Fjernes fra V1-navigationen, kode bevares |
| LATER | 4 | Skjules til datakilden/mekanismen er reel, kode bevares |

Se `01_ROUTE_DISPOSITION.md` for alle 62 rækker med change-type-tags.

## De to verificerede konflikter — nu FAKTA, ikke længere åbne

Blueprintets §"To konflikter der skal verificeres før kodeændringer" er
hermed lukket. Verificeret direkte mod kørende kode og DEV-miljøet
`fleetcontrol-dev-1ac1c` d. 24.08.2026, som en del af denne planlægningsrunde
(ingen mutation):

### A. Fleet/Facility `sager`-backend — FINDES OG ER DEPLOYET

- **Kildekode:** `functions/index.js` definerer `sagOpret` (linje 5300),
  `sagBeskedSkriv` (5381), `sagKarantaeneFrigiv` (5451), `sagAftaleBekraeft`
  (5498) — alle fire som `onCall`-funktioner.
- **Regler:** `firebase.rules.json` har en fuldt specificeret `sager`-node
  (under `tenants/<t>/sager`) med `.write: false` for alle klienter (kun
  de fire Cloud Functions kan skrive), `.read` gated på permission
  `sag.laes`, og fuld feltvalidering (nummer-format `FLT|FAC-ÅÅÅÅ-NNNNN`,
  `art` ∈ {fleet, facility}, `tilstand` ∈ {aaben, afventerSvar, afsluttet},
  polymorf `objektType`/`objektId`-reference, `parter`-adgangsliste,
  `securityLevel`).
- **Deployment:** `firebase functions:list --project dev` bekræfter alle
  fire funktioner som `v2 callable` i `europe-west1`, aktivt deployeret.
- **Konklusion:** Backend er REEL, ikke kun dokumenteret. Det tidlige
  auditmateriale (dossier 04/05, Fleet/Facility) tog fejl ved kun at læse
  en forældet frontend-kommentar ("fase 0") uden selv at slå
  `firebase.rules.json`/`functions/index.js` op — den senere syntese
  (dossier 10/`04_DATA_OWNERSHIP.md`) havde ret. **Hullet ligger
  udelukkende i frontend:** `Sagsvisning.jsx` har stadig alle handlinger
  deaktiveret og viser en forældet "fase 0"-tekst, selvom backend kan
  bruges i dag.
- **Betydning for V1-planen:** Fleets og Facilitys kanoniske arbejdsgange
  ("kommunikation" med leverandør/værksted) kan lukkes ved at koble
  `Sagsvisning.jsx` til det eksisterende, virkende backend-lag — dette er
  et `VIEW_COMPOSITION`+`BACKEND_REQUIRED`-hybridarbejde i det forstand at
  backend'en allerede findes, men *modtagevejen* (indgående mail →
  `sagOpret`, skive 2 i beslutning 20/112's egen plan) mangler stadig og
  ER et reelt `BACKEND_REQUIRED`-hul. Se detaljer i
  `03_CANONICAL_WORKFLOWS.md` og `05_IMPLEMENTATION_SLICES.md` (Skive 3).

### B. `kompetencer` — ER MODUL-GATET TIL BEMANDING I PRAKSIS

- **`NODE_MODUL` (src/fleet/moduler.js):** koden sætter eksplicit
  `kompetencer: "bemanding"`.
- **Deployede regler (firebase.rules.json, linje 863-872):** `.read`
  kræver `moduler/bemanding === true`; `.write` kræver derudover
  `kompetencer.skriv`-permission. Begge er reelt håndhævet i DEV.
- **Modsigelsen:** `moduler.js`'s egen forklarende kommentar (nær
  `NODE_MODUL`'s hoved) hævder "personale, kompetencer og kpi er heller
  ikke gatede" — denne sætning er FORÆLDET/forkert. Koden og de deployede
  regler er autoriteten, ikke kommentaren.
- **Konklusion:** `kompetencer` er en almindelig, korrekt modul-gatet Fleet
  … nej, Bemanding-node, præcis som `fravaer` og `stemplinger`. Der er intet
  sikkerhedshul og intet akut behov for en kodeændring her — kun en
  fremtidig oprydning af den vildledende kommentar i `moduler.js` (uden for
  scope for V1-navigationsoprydningen, nævnes for fuldstændighedens skyld i
  `04_DATA_AND_PERMISSION_IMPACT.md`).
- **Betydning for V1-planen:** Blueprintets "Workforce > Kompetencer
  (FINISH)"-beslutning kræver INGEN permission-modelændring for selve
  visningen — den er allerede korrekt spærret. Det der mangler, er en
  kanonisk SKRIVE-vej for kompetence-/bevisvedligehold (i dag kun læsning
  + en deaktiveret "Overrul"-knap, jf. `06_IMPLEMENTATION_STATUS.md`) — det
  er et `BACKEND_REQUIRED`+`VIEW_COMPOSITION`-arbejde, ikke et
  `PERMISSION_MODEL`-arbejde.

## Definition of Done for hele oprydningsprogrammet

(Ordret fra blueprintet, gengivet her som den overordnede accept-test hele
skive-planen til sidst skal bestå — se `06_TEST_AND_ROLLBACK_PLAN.md` for
hvordan hver enkelt skive verificeres undervejs.)

- En bruger ser kun købte moduler og relevante arbejdsområder.
- Ingen produktionssynlig komponent viser permanente demo-rækker som
  kundedata.
- Samme handling har ét kanonisk hjem; dubletter er redirects, filtre
  eller kontekstpaneler.
- Alle V1-flows kan gennemføres end-to-end uden deaktiverede kerneknapper.
- Hver skærm følger én af fem sidetyper: modul-forside, kalender,
  arbejdskø, proces eller stamdata.
- Alle 7 roller og relevante modulkombinationer er valideret i DEV.
- Fuld test-suite er grøn, og der findes en dokumenteret rollback pr.
  skive.

## Hvad denne plan IKKE gør

- Foreslår ingen funktion ud over blueprintet.
- Ændrer ingen kode, Firebase-regler, Cloud Functions eller data.
- Begynder ikke på Skive 1 uden en ny, eksplicit besked fra ejeren.
- Erstatter ikke `docs/product-audit/` — det dokumentsæt forbliver den
  faktuelle "hvad findes i dag"-kilde; `docs/product-redesign-v1/` er "hvad
  skal der ske"-planen bygget ovenpå det.

---

## Rettelser efter pre-implementation review (10 punkter)

Ejeren gennemgik planpakken og fandt indbyrdes modstridigheder samt steder
hvor planen ikke havde verificeret den faktiske kode dybt nok. De ti
punkter nedenfor er nu **autoritative rettelser** — de øvrige seks
dokumenter er opdateret til at stemme overens med dem. Hvert punkt er
verificeret direkte mod kørende kode/regler d.d., ikke antaget.

### 1. Navigationssynlighed — ny, permission-uafhængig mekanisme

**Problemet:** 02 og 05 modsagde hinanden om hvorvidt permissions kan bære
navigationssynlighed. De kan ikke: en permission siger hvad en ROLLE må;
en lagermedarbejder har `satser.laes`/`indkoeb.laes`, fordi hans EGNE
skærme (Warehouse Afregning/Volumen) kræver prisopslag — det giver ham
ikke automatisk et menupunkt for hele Procure eller Bookingopsætning.

**Løsningen — ikke en ny opfindelse, en udvidelse af et allerede bygget
mønster:** `dashboardvisning/<uid>` (`src/fleet/dashboardvisning.js`,
Cloud Function `dashboardvisningskriv`) er PRÆCIS denne mekanisme, bare
afgrænset til dashboards i dag. Den har fire egenskaber en fremtidig
navigationssynlighed skal genbruge uændret:

1. Standard = alt tenanten har købt (ingen indstilling = vist).
2. Kun et eksplicit `false` skjuler noget.
3. Kan ikke skjule det hele (`skjulerAlt()`-vagten).
4. **Læses ALDRIG af nogen firebase-regel** — mekanisk garanteret af en
   dedikeret prøve (`test/dashboardvisning.test.mjs`) der fælder enhver
   regel som refererer noden. Filens egen overskrift siger det direkte:
   *"DET ER EN VISNING, IKKE EN ADGANG."*

Kodens egen kommentar i `dashboards.js` bekræfter desuden at dette ER den
planlagte næste etape: *"MODULET AFGØR DET, IKKE BRUGEREN — endnu... en
afkrydsning pr. bruger kommer i sin egen etape sammen med rollemodellen."*

**Målbillede:** en sideordnet node (fx `navvisning/<uid>`) med samme fire
garantier, sat af admin via samme Cloud-Function-mønster. Lagermedarbejderens
standardpreset kan sætte Procure/Bookingopsætning skjult uden at røre en
eneste permission. `02_TARGET_NAVIGATION.md`, `04_DATA_AND_PERMISSION_IMPACT.md`,
`05_IMPLEMENTATION_SLICES.md` og `06_TEST_AND_ROLLBACK_PLAN.md` skal alle
beskrive PRÆCIS denne model.

### 2. Fakturaer & bilag — nyt, minimalt permission-sæt

**Verificeret:** `fakturaer`-noden har i dag **ingen permission
overhovedet** på `.read` (kun auth+tenant+aktivt abonnement —
`firebase.rules.json` linje ~2916-2925). Kodens egen kommentar efterlyser
selv løsningen: *"Skal den gates, skal permissionen hedde noget der
DÆKKER BEGGE FORBRUGERE"* (Procure→Fakturaer og Økonomi→Fakturacenter).
Skrivning sker i dag via tre Cloud Functions, alle `indkoeb.*`-gated:
`fakturamatch`/`fakturadestination` (`indkoeb.skriv`), `fakturastatus`
(`indkoeb.skriv` for statusskift, `indkoeb.godkend` for
betalingsgodkendelse).

**Ny permission-familie** (samme navnekonvention som
`satser.laes`/`grundlag.laes`/`indkoeb.laes` fra beslutning 104):

| Permission | Erstatter | Foreslået rollefordeling |
|---|---|---|
| `fakturaer.laes` | (ingen — var åben) | casehandler, disponent, koordinator, lagermedarbejder, revisor, admin |
| `fakturaer.skriv` | `indkoeb.skriv` i `fakturamatch`/`fakturadestination` | casehandler, disponent, koordinator, admin |
| `fakturaer.godkend` | `indkoeb.godkend` i `fakturastatus` | koordinator, admin |

Rollefordelingen er bevidst identisk med hvem der FAKTISK har adgang i
dag under de gamle `indkoeb.*`-navne — ingen mister eller får adgang dag
1, kun navnet på hvad de har, afkobles fra Procure.

**Nødvendig rules-ændring (beskrevet, ikke udført):** tilføj perm-tjek til
`fakturaer`s `.read`; opdater de tre Cloud Functions' interne perm-tjek;
tilføj de tre permissions til `PERM`/`ROLLE_PERMS`; opdatér
`test/laeseadgang.test.mjs`s `LUKKET`-tabel (nævner i dag slet ikke
`fakturaer`, fordi den bevidst har stået udenfor governance-testen som en
af "de tre tvetydige noder").

### 3. Leverandører — Model B valgt (base-node + dedikeret permission)

**To modeller sammenlignet, begge verificeret i kørende regler:**

- **A — reolpladser-mønstret:** inline OR direkte i regelteksten
  (`moduler/unitbooking === true || moduler/warehouse === true`,
  `firebase.rules.json` linje ~3109-3110). Bruges præcis ét sted i hele
  kodebasen.
- **B — satser/grundlag/indkoeb/fakturaer-mønstret:** fuldt ugatet
  base-node + dedikeret kommerciel læse-permission, uafhængigt af
  modulkøb (beslutning 104, og nu Korrektion 2 ovenfor).

**Valgt: Model B**, af tre grunde: (1) den er allerede det etablerede
mønster for præcis denne klasse problem, snart brugt fire gange; (2)
Model A løser ikke problemet ALENE — semantisk uafhængighed af
`indkoeb.laes` kræver alligevel den samme permission-omdøbning Model B
giver gratis; (3) `moduler.js`s egen kommentar advarer eksplicit mod at
udvide "hører til mindst ét modul"-mønstret ud over dets ene, bevidste
undtagelse (reolpladser): *"en regel ingen kan læse sig til bagefter, og
den slags regler bliver forkert ændret."*

**Konkret:** `leverandoerer` flytter til basen. Nye `leverandoerer.laes`/
`leverandoerer.skriv`, samme rollefordeling som Korrektion 2's
`fakturaer.laes`/`.skriv`. Gør Fleet- og Facility-kunder UDEN Procure
fuldt funktionelle på de elleve skærme der allerede læser
leverandørkartoteket i dag (Disponering, Servicekalender, Arbejdskø,
Driftskalender m.fl. — talt op i regelkommentaren selv).

### 4. Hjælp/Support — `/support` bliver IKKE skjult

Blueprint-#52 ændres fra **HIDE** til en ny, minimal V1-erstatning: en
ærlig, statisk hjælpeside (guide + kontaktoplysninger), **ingen
demo-supportsagsdata vist**. Supportoverblik (#53) og Supportsag (#54)
forbliver **HIDE**. Change-type for #52: `HIDE_ONLY` → `VIEW_COMPOSITION`
(den nuværende `Hjaelp.jsx`s demo-visning erstattes af en ærlig, statisk
side — intet nyt backend-behov).

### 5. HIDE/LATER-test — rettet til den faktiske arkitektur

**Verificeret:** `nav.js`s `ALLE = NAV.flatMap(...)` indeholder ALLEREDE
elementer med `skjulINav: true` (fx "forslag", "arbejdskoe",
"kundepriserEn") — de findes i `ALLE`, de er bare ikke i den RENDEREDE
menu. `App.jsx`s routes er en helt separat mekanisme fra `nav.js`; en
rute forsvinder aldrig fra `App.jsx` fordi et `nav.js`-punkt skjules.

**Korrekt testkrav** (erstatter `06_TEST_AND_ROLLBACK_PLAN.md`s forslag):
(a) routen findes fortsat i `App.jsx`, (b) punktet er markeret skjult
(`skjulINav: true` eller tilsvarende) / indgår ikke i det RENDEREDE
menutræ, (c) et direkte URL-hit viser en ærlig tilstand — ikke permanent
demo-data, (d) **ingen test må kræve at et skjult element fjernes fra
`ALLE`.**

### 6. Planning-dashboard tilføjes til målplanen

**Verificeret:** `DASHBOARDS`-kataloget (`src/fleet/dashboards.js`) har 7
indgange (Samlet, flaade, facility, indkoeb, warehouse, unitbooking,
bemanding) — **ingen for booking/Planning**. Samtidig findes der allerede
et ægte, ikke-null KPI-domæne `disponering` (kortlagt til modulet
`booking`, kilde `etaper`, beregnet af `disponeringstal()` i
`kpi-aggregering.js`).

**Målplan (ikke kode):** et nyt `{ key: "booking", label: "Planning" }`-
kort i `DASHBOARDS`, med kun ægte data: bookinger uden plan (samme kilde
som Booking-oversigtens eksisterende læsning), forslag/godkendelser der
kræver handling (samme kilde som Oversigtens "Kræver handling"-liste), og
det allerede beregnede `kpi.disponering`-domæne. Ingen permanente
demo-KPI'er.

### 7. Mail — indgående er IKKE V1-blocking

Skive 3's Definition of Done må ikke kræve indgående mail → `sagOpret`.
Ny rækkefølge for Fleet/Facility-"kommunikation":

- **A.** Koble `Sagsvisning.jsx` til den allerede deployerede
  sager-backend (jf. Konflikt A ovenfor — dækker udgående tråd + intern
  visning).
- **B.** Byg en fælles UDGÅENDE mailfunktion for Fleet/Facility/Procure
  (i dag kun mock/manuel kopiering, jf. auditten).
- **C.** Log den sendte kommunikation på relevant sag/ordre (fx via
  `sagBeskedSkriv` med retning "udgående").
- **D.** Indgående reply-routing/webhook — en SENERE, separat
  sikkerhedsskive, uden for V1-kritisk vej.

### 8. Skriveveje verificeret FØR ny backend antages nødvendig

Regel tilføjet til hele dokumentsættet: før noget mærkes
`BACKEND_REQUIRED`, skal det være verificeret at (a) ingen eksisterende
`.write`-regel allerede tillader en direkte klient-skrivning til
handlingen, OG (b) ingen eksisterende ren funktion allerede
bygger/validerer den nødvendige datastruktur. Tre elementer er nu
retagget efter denne verifikation:

- **Kompetencer** ("Overrul med begrundelse"): `.write` på
  `kompetencer/$kompetenceId` tillader ALLEREDE direkte klient-skrivning
  med kun `kompetencer.skriv`. `byggOverride({personId, kompetence,
  begrundelse, bruger})` i `src/fleet/personale.js` er en FÆRDIG
  byggefunktion — den kastes kun fordi UI'et aldrig kalder den.
  **`BACKEND_REQUIRED` → `VIEW_COMPOSITION`.** (Kun admin har
  `kompetencer.skriv` i dag — en bredere rollefordeling er en separat
  `PERMISSION_MODEL`-tilføjelse, ikke en forudsætning.)
- **Medarbejdere** (redigering/fratrædelse): `.write` på `personale/$id`
  tillader allerede direkte klient-skrivning med `personale.skriv`.
  `PERSONALE_STATUS` har allerede `fratraadt` som gyldig tilstand —
  fratrædelse er en almindelig feltopdatering via samme `gem()`-kald som
  oprettelse. **`BACKEND_REQUIRED` → `VIEW_COMPOSITION`.**
- **Leverandører** (opret/redigér): `.write` på `leverandoerer/$leverandoerId`
  tillader allerede direkte klient-skrivning. Kun en opret/redigér-FORM
  mangler i UI'et. **`BACKEND_REQUIRED` → `VIEW_COMPOSITION`** (+
  `PERMISSION_MODEL`/`DATA_MODEL`-arbejdet fra Korrektion 3).

### 9. Fravær → reservation — genbrug den centrale motor

**Verificeret:** `src/fleet/reservations.js` (spejlet i
`functions/delt/reservations.js`) er allerede en fælles, generisk
reservationsmotor: `reserver(db, path, ny, opts)`,
`tjekLedig()`/`tjekLedigMod()`/`tjekLedigIndesluttet()`, og en
`PRIORITET`-tabel der **allerede indeholder** `fravaer: 30` (mellem
`vaerksted: 40` og `facilitySag: 20`) — fraværsprioriteten er allerede
designet ind i motoren. Mønsteret for at koble en ny kilde på er
etableret to gange: `reservationFraOpgave()` og `reservationFraAftale()`
— begge små byggefunktioner der kalder den SAMME delte `reserver()`.

**Krav til planen:** en fremtidig fraværsgodkendelses-funktion skal (1)
skrive en ny, tilsvarende `reservationFraFravaer(post)`-byggefunktion
(samme mønster som de to andre), og (2) kalde den EKSISTERENDE
`reserver()` — **ikke** opfinde en femte, selvstændig
reservationsmekanisme. `PRIORITET.fravaer = 30` kræver ingen ændring.

### 10. Skivestørrelse — Skive 3 og 4 splittes i rollbackbare delskiver

**Skive 3** deles i fire, hver med egen fulde 8-punkts struktur:
- **3A** — UI-omlægning Planning/Fleet/Facility (værkstedsdagsgitter
  fjernes, Forslag merges ind i Disponering-panel, Arbejdskø merges ind i
  Driftskalender). `NAVIGATION_ONLY`/`VIEW_COMPOSITION`.
- **3B** — Fleet indberetningstriage (det "V1-blokerende hul": vurdering/
  afslut-flow). `BACKEND_REQUIRED`.
- **3C** — Sagsvisning → eksisterende backend. `VIEW_COMPOSITION`, ingen
  ny backend.
- **3D** — Udgående mail (Korrektion 7's B+C). `BACKEND_REQUIRED`. Ingen
  indgående mail i V1.

**Skive 4** deles i fire:
- **4A** — Fælles Fakturaer & bilag + permission/routing (Korrektion 2).
  `PERMISSION_MODEL` + `NAVIGATION_ONLY`/`ROUTE_REDIRECT`.
- **4B** — Fælles Leverandører + CRUD (Korrektion 3 + 8). `PERMISSION_MODEL`
  + `VIEW_COMPOSITION`.
- **4C** — Fælles dokument-/fillagringslag + fakturaupload. Platformens
  FØRSTE fillagring — reelt nybyggeri, ingen genbrugelig kode fundet.
  `BACKEND_REQUIRED`, højeste risiko i hele planen.
- **4D** — Procure ordre-mail (rigtig afsendelse). `BACKEND_REQUIRED`; bør
  undersøges som samme fælles mailinfrastruktur som 3D, ikke to separate
  implementeringer.

Hver delskive har sin EGEN Definition of Done, testcases og rollback —
ikke den overordnede skives.
