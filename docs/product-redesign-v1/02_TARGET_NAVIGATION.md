<title>Target Navigation</title>

# 02 — Målnavigation (modul- og rollebaseret)

**Status:** Planlægning. 0 kodeændringer foretaget for at producere dette
dokument. Kilder: `FleetControl_V1_product_blueprint.md` (§"Ny
hovednavigation", §"Dashboard-regel", 62-rækkers beslutningsmatrix),
`00_AUTHORITATIVE_PRODUCT_RULES.md`, `docs/product-audit/05_ROLES_AND_PERMISSIONS.md`,
og `src/fleet/nav.js` + `src/fleet/moduler.js` + `src/fleet/dashboardvisning.js`
+ `src/fleet/dashboards.js`, alle læst i fuld længde. `Dashboard.jsx` selv
(skærmkomponenten) er IKKE læst til dette dokument — hvor det betyder noget,
er det markeret IKKE PÅVIST.

---

## Navigationsmodel

### Mekanismen i dag (uændret af oprydningen)

`src/fleet/nav.js` er allerede den ENESTE kilde til sidebar OG ruter (`ALLE
= NAV.flatMap(...)`). `NAV` er i dag en FLAD liste af 11 topniveaupunkter
(`dashboard, booking, bemanding, flaade, facility, indkoeb, unitbooking,
warehouse, oekonomi, support, opsaetning`) uden nogen gruppeoverskrifter —
der findes ingen "Fælles/Driftsmoduler/Administration/Hjælp"-inddeling i
koden i dag. Hvert topniveaupunkt kan have `born` (undermenu). To
felter styrer synlighed pr. punkt:

- **`kraeverModul: "<modulnøgle>"`** — kommerciel kontrol. Skjuler punktet
  hvis tenanten ikke har købt modulet (`harModul()` i `moduler.js`). Bruges i
  dag på 8 punkter: `enheder` (flaade), `unitbookingKasser` (unitbooking),
  `medarbejdere` (bemanding), samt de fire `kunder*`-punkter under Opsætning
  (kunderOversigt, standardpriser, kundepriser, kundepriserEn) (kunder).
- **`kraeverPerm: "<permission>"`** — kommerciel/rolle-læsning. Skjuler
  punktet hvis brugerens rolle mangler en af de **tre** specifikke
  "kommercielle læsninger" (beslutning 104/105). De 9 punkter der bærer det
  i dag: `bookingopsaetning` (satser.laes), `indkoebOversigt`,
  `indkoebsbehov`, `bestillinger`, `godkendelser`, `fakturaer`,
  `leverandoerer`, `varelager` (alle indkoeb.laes), `fakturacenter`
  (indkoeb.laes), `fakturering` (grundlag.laes), `standardpriser`,
  `kundepriser`, `kundepriserEn` (alle satser.laes), `warehouseAfregning`,
  `warehouseVolumen` (begge satser.laes).
- **`skjulINav: true`** — punktet findes som rute, men tegnes aldrig i
  sidebaren (bruges i dag på `forslag`, `arbejdskoe`, `kundepriserEn`,
  `supportSag`).

Ingen af de øvrige ca. 45 punkter er rollefiltrerede. Det er en bevidst
beslutning citeret direkte i `nav.js`: *"en menu der mest består af døre der
ikke kan åbnes, er værre end ingen menu"* — men den sætning gælder kun de tre
kommercielle permissions, ikke resten (05_ROLES_AND_PERMISSIONS.md, §"Modulmenu
vs. permission").

### Hvad V1-oprydningen ændrer ved mekanismen

Den grupperede topmenu (Fælles / Driftsmoduler efter abonnement /
Administration / Hjælp) er et **NAVIGATION_ONLY**-lag oven på den eksisterende
flade `NAV`-liste — ikke en ny mekanisme. Konkret: hvert topniveaupunkt får et
nyt felt (fx `gruppe: "faelles" | "drift" | "admin" | "hjaelp"`), og sidebaren
render'er en overskrift pr. gruppe i en fast rækkefølge. `kraeverModul` og
`kraeverPerm` blive **uændrede** som mekanisme — de får blot flere/andre
punkter at stå på, jf. træet nedenfor.

**Der indføres ÉN ny mekanisme, og den er bevidst IKKE permission-baseret**
(Korrektion 1, `00_AUTHORITATIVE_PRODUCT_RULES.md`): en per-bruger
navigationssynlighed, sideordnet med den allerede byggede
`dashboardvisning/<uid>` (`src/fleet/dashboardvisning.js`, Cloud Function
`dashboardvisningskriv`), som i dag udelukkende styrer synligheden af
DASHBOARD-kort. Målbilledet er en søster-node, fx `navvisning/<uid>`, sat af
admin via samme Cloud-Function-mønster, med PRÆCIS de samme fire garantier:
(1) standard = alt tenanten har købt (ingen indstilling = vist), (2) kun et
eksplicit `false` skjuler noget, (3) kan ikke skjule det hele
(`skjulerAlt()`-vagten), (4) læses ALDRIG af nogen firebase-regel — mekanisk
garanteret på samme måde som `test/dashboardvisning.test.mjs` gør det i dag
("DET ER EN VISNING, IKKE EN ADGANG"). Dette er et TREDJE, uafhængigt lag ved
siden af købte moduler (`kraeverModul`: hvilke PRODUKTER tenanten
overhovedet har) og permissions (hvad en skrivning/læsning FAKTISK lykkes
med) — ikke en erstatning for nogen af de to, og **ikke afledt af rollens
permission-sæt**. En permission siger hvad en ROLLE må; en lagermedarbejder
har fx `satser.laes`/`indkoeb.laes` fordi hans EGNE skærme (Warehouse
Afregning/Volumen) kræver prisopslag — det giver ham IKKE automatisk et
menupunkt for hele Procure eller Bookingopsætning. Navigationsvisning er den
mekanisme der reelt afgør det, uafhængigt af hvad hans rolle må (se
§"Rolle × navigation-matrix" nedenfor for den konkrete konsekvens). Der
indføres fortsat **ingen** ny ROLLEBASERET filtreringsmekanisme (dvs. ingen
`nav.js`-logik der spørger "hvilken rolle har brugeren") — det ville
modsige den gennemgående linje i CLAUDE.md ("et rollefilter i
widgetvælgeren ville stadig være en pæn knap"). `navvisning` er per-BRUGER,
admin-redigerbar, og aldrig en sikkerhedsgrænse.

En reel undtagelse i selve `kraeverPerm`-mekanikken: **Fakturaer & bilag**
(det tidligere Fakturacenter, se matrix-punkt 3) mister sin nuværende
`kraeverPerm: "indkoeb.laes"`, men bliver IKKE permission-fri. Korrektion 2
indfører en ny, minimal permission-familie der DÆKKER BEGGE forbrugere
(Procure→Fakturaer og Økonomi→Fakturacenter): `fakturaer.laes` (læsning),
`fakturaer.skriv` og `fakturaer.godkend` (erstatter de nuværende
`indkoeb.skriv`/`indkoeb.godkend`-tjek i `fakturamatch`, `fakturadestination`
og `fakturastatus`). Punktet bliver dermed uafhængigt af `indkoeb.*`
SPECIFIKT — IKKE uafhængigt af permissions generelt. Rollefordelingen er
bevidst identisk med hvem der faktisk har adgang i dag under de gamle
`indkoeb.*`-navne (casehandler, disponent, koordinator, lagermedarbejder,
revisor, admin for `.laes`; casehandler, disponent, koordinator, admin for
`.skriv`; koordinator, admin for `.godkend`) — ingen mister eller får adgang
dag 1. Dette er et `PERMISSION_MODEL`-arbejde, se
`04_DATA_AND_PERMISSION_IMPACT.md`.

### Skellet der bærer hele dokumentet (produktregel 7)

Tre uafhængige lag, ikke to (Korrektion 1, se ovenfor):

- **Købte moduler** (`kraeverModul`, `harModul()` i `moduler.js`) afgør
  hvilke PRODUKTER findes for tenanten overhovedet. Uændret mekanik.
- **Navigationssynlighed** — to dele, begge kommercielle/UX-beslutninger,
  ingen af dem er sikkerhed:
  - `nav.js`s eksisterende `kraeverModul`/`kraeverPerm`/`skjulINav` +
    gruppeoverskrifter, som afgør hvad der **TEGNES** ens for ALLE brugere
    med en given rolle/modulkombination.
  - **NY (Korrektion 1):** en per-bruger `navvisning/<uid>`-node (søster til
    `dashboardvisning/<uid>`), som afgør hvilke af tenantens KØBTE
    arbejdsområder DENNE SPECIFIKKE bruger ser i menuen, admin-redigerbar,
    uafhængig af hans permission-sæt.
- **Permissions** (`firebase.rules.json` + Cloud Functions,
  `auth.token.perms`) afgør hvad serveren **TILLADER**. Det er den egentlige
  sikkerhed og er **UÆNDRET** af hele denne navigationsoprydning — hverken
  `kraeverModul`, `kraeverPerm`, `skjulINav` eller det nye `navvisning` må
  nogensinde erstatte et permission-tjek, og `navvisning` læses aldrig af
  nogen firebase-regel (samme garanti som `dashboardvisning`).

Enhver ændring i dette dokument er derfor tagget som en af:
**NAVIGATION_ONLY** (felt på et `NAV`-punkt), **VIEW_COMPOSITION** (hvad en
skærm viser/samler, ingen ny node/permission), eller **ROUTE_REDIRECT**
(gammel sti → ny sti via `REDIRECTS`-mønsteret). Ingen af de tre erstatter
nogensinde et permission-tjek. Hvor en ændring reelt kræver et
`PERMISSION_MODEL`- eller `BACKEND_REQUIRED`-arbejde (fx godkendelsespolicy
der flyttes til Opsætning, matrix-punkt 26), er det markeret eksplicit og
hører til `04_DATA_AND_PERMISSION_IMPACT.md`, ikke denne fil.

---

## Dashboard-regel — implementering

### Hvad der findes i dag (`dashboardvisning.js` + `dashboards.js`, læst i fuld længde)

- `DASHBOARDS` (dashboards.js) er kataloget: `samlet` (`altid: true`) +
  6 modul-dashboards (`flaade, facility, indkoeb, warehouse, unitbooking,
  bemanding`). **Korrektion 6 (`00_AUTHORITATIVE_PRODUCT_RULES.md`):
  kataloget mangler et 7. modul-dashboard for Planning/booking** — der
  findes allerede et ægte, ikke-null KPI-domæne `disponering` (modul
  `booking`, kilde `etaper`, beregnet af `disponeringstal()` i
  `kpi-aggregering.js`), men intet kort for det i `DASHBOARDS` i dag.
  Målplan: nyt `{ key: "booking", label: "Planning" }`-kort med kun ægte
  data (bookinger uden plan, forslag/godkendelser der kræver handling,
  `kpi.disponering`) — **NAVIGATION_ONLY**/`VIEW_COMPOSITION`
  katalogtilføjelse, ingen ny node. Kortet skal indgå i
  modul-dashboard-selektoren på lige fod med
  Fleet/Facility/Procure/Warehouse/Unitbooking/Workforce.
- `synligeDashboards(indstilling, harModulFn, kanSeFn)` filtrerer kataloget
  til (a) moduler tenanten har købt, (b) moduler brugerens permissions
  faktisk kan læse (`kanSeFn`, beslutning 105), og (c) hvad brugeren selv IKKE
  har slået fra i sin personlige `indstilling` — en **visning**, ikke en
  adgang (dokumentets egen pointe, §"DET ER EN VISNING, IKKE EN ADGANG").
  `samlet` kortslutter altid til synlig.
- `ekstraSamlet()` lader en bruger uden noget modul stadig få det samlede
  overblik tilbudt.
- `skjulerAlt()` forhindrer at en bruger ender uden en eneste synlig forside.
- `MODULKORT` (dashboards.js) er modulkortenes 3-tals-skema pr. modul
  (felt/afledt + form), allerede skåret til præcis "et par nøgletal, ikke
  alle KPI'er" — Warehouse og Unitbooking mangler stadig deres felter i
  `kpi/` (dokumenteret i filens egne kommentarer som et separat KPI-efterslæb,
  ikke et navigationsspørgsmål).
- `HANDLINGER` (dashboards.js) er ALLEREDE en prioriteret, modul- og
  tærskelfiltreret arbejdsliste (6 rækker i dag: `udeAfDrift, klimaalarm,
  forsinkede, fakturaer, service, nyeIndberetninger`), med `prioritet`,
  `graense` (nul rammer viser ingen række) og et link. Dette ligner allerede
  strukturelt blueprintets "3–6 handlingskort og én prioriteret
  arbejdslistesektion".
- Brugerens EGEN, valgfri widget-lagout (forskelligt fra `DASHBOARDS`/
  `MODULKORT`) er dokumenteret i `CLAUDE.md` (§"Sætte et loft på brugerens
  eget layout"): en `widgets.js`-katalog, `valideLayout()`, skrevet med
  `auth.uid === $uid`, loft på tolv widgets. Dette ER allerede mekanismen for
  "brugerens ekstra widgets i en sekundær sektion" — den mangler ikke at
  blive opfundet, kun at blive lagt i en **sammenklappelig** UI-sektion
  adskilt fra de 3–6 primære handlingskort.

### Hvad der SKAL bygges (grundet manglende bekræftelse i det læste)

Blueprintets kerneregel — *"Én aktivt købt modul: ingen Samlet-vælger;
brugeren lander direkte på modul-dashboardet. To eller flere moduler:
vælgeren viser Samlet + de moduler brugeren må se"* — er en betinget
LANDINGS-/routing-beslutning (hvilken URL brugeren ser først, og om en
vælger tegnes overhovedet). Hverken `dashboardvisning.js` eller
`dashboards.js` indeholder denne beslutningslogik i dag — de leverer kun
LISTEN af synlige dashboards, ikke en regel om hvornår listen skal
kortsluttes til automatisk landing. **IKKE PÅVIST:** om `Dashboard.jsx` (ikke
læst her) allerede implementerer en sådan auto-landing. Antag til
implementeringsplanlægningen at logikken mangler og skal bygges som ny
routing-beslutning: `if (synligeDashboards(...).filter(d => d.key !== SAMLET).length === 1 && !ekstraSamlet(...)) { landDirekte(detEneModul) }`. Dette er
**VIEW_COMPOSITION** (bygger oven på eksisterende `synligeDashboards`/
`ekstraSamlet`, ingen ny node eller permission).

### Sammenfatning: genbrug vs. nybyg

| Del af dashboard-reglen | Status |
|---|---|
| Katalog over dashboards, modulfiltrering, brugervisning | **Genbruges** — `dashboardvisning.js`/`dashboards.js` uændret |
| 3–6 handlingskort, prioriteret arbejdsliste | **Genbruges i struktur** — `HANDLINGER`/`MODULKORT` findes; indhold/antal justeres pr. matrix-punkt 1 (fjern permanente demo-widgets, fjern værksted/facility fra Planning-arbejdslisten) |
| Sekundær, sammenklappelig widget-sektion | **Genbruges** — `widgets.js`/`valideLayout()` findes; kun UI-placeringen (sammenklappelig) er ny, **VIEW_COMPOSITION** |
| Auto-landing ved præcis ét modul / vælger ved 2+ | **IKKE PÅVIST i det læste — antag ny routing-logik, VIEW_COMPOSITION** |
| Planning/booking-dashboardkort (Korrektion 6) | **Nyt katalogpunkt** — `{ key: "booking", label: "Planning" }` tilføjes til `DASHBOARDS`; data genbruges (`kpi.disponering`, Booking-oversigtens eksisterende "uden plan"/"kræver handling"-kilder), kun kataloget er nyt |

---

## Målmenu — komplet træ

Nedenstående følger blueprintets fire grupper. For hvert punkt: dagens
`nav.js`-nøgle/sti (hvor den findes), matrix-# fra blueprintet, og hvad der
sker. **"Uændret"** betyder ingen `nav.js`-ændring er nødvendig — dagens kode
matcher allerede målet.

### Fælles

| Punkt | Dagens nav.js | Matrix-# | Ændring |
|---|---|---|---|
| Dashboard | `dashboard` @ `/` | 1 | Uændret placering. Indhold: **VIEW_COMPOSITION** (maksimér handlingskø, fjern permanente demo-widgets, dashboard-regel ovenfor) |
| Kunder (kun når relevant) | `kunderOversigt` @ `/opsaetning/kunder` (i dag UNDER Opsætning) | 46 | **NAVIGATION_ONLY + ROUTE_REDIRECT**: flyttes ud af Opsætning-undermenuen til eget Fælles-topniveaupunkt. `kraeverModul: "kunder"` bevares uændret (samme kommercielle gate). "Kun når relevant" er IKKE PÅVIST udover den eksisterende modul-gate — se Rolle-matrix nedenfor |
| Fakturaer & bilag | `fakturacenter` @ `/oekonomi/fakturacenter` (i dag under Økonomi) | 3, +27, +41 | **NAVIGATION_ONLY + ROUTE_REDIRECT + PERMISSION_MODEL**: nyt Fælles-topniveaupunkt, ny kanonisk rute (forslag: `/fakturaer` — se rutetabel). Skifter `kraeverPerm: "indkoeb.laes"` ud med `kraeverPerm: "fakturaer.laes"` (ny permission, Korrektion 2 — se ovenfor); **IKKE permission-fri**. Procure-fakturaer (27) og Transportlabels (41) merges/redirectes hertil som filter/kontekst |
| Økonomi / Fakturagrundlag | `oekonomi` @ `/oekonomi`, barn `fakturering` | 2 (LATER), 4 | **NAVIGATION_ONLY**: topniveaupunktet omdøbes fra "Økonomi & Rapporter" til "Økonomi / Fakturagrundlag". Barnet `oekonomiOversigt` (Rapporter) **HIDE_ONLY** (`skjulINav: true`) indtil ægte KPI-kilder findes. Barnet `fakturering` bliver ENESTE synlige barn i V1, relabelt konsekvent "Fakturagrundlag" |

### Driftsmoduler efter abonnement

**Planning** (`booking` @ `/booking`) — matrix 5–10:

| Barn i dag | Matrix-# | Ændring |
|---|---|---|
| `bookingOversigt` "Alle opgaver" | 5 | Uændret rute. Relabel til "Overblik". **VIEW_COMPOSITION** (fjern værksted/facility fra arbejdsliste) |
| `nyForespoergsel` | 6 | Uændret. **VIEW_COMPOSITION/BACKEND_REQUIRED** (færdiggør direkte/dedikeret/kombi mv.) |
| `forslag` (allerede `skjulINav: true`) | 7 | **Allerede matcher målet** — skjult fra menu, kun deep link. Kræver **VIEW_COMPOSITION**: reelt integreres som panel/dialog i Disponering (ikke en nav-ændring, en skærm-ændring) |
| `disponering` | 8 | Uændret rute. **VIEW_COMPOSITION** (fjern værksteds-dagsgitter) |
| `livekort` "Rute & status" | 9 | Uændret — label er allerede "Rute & status" siden beslutning 22. Blueprintets alternative navn "Ture & status" er en **valgfri** yderligere relabel, ikke krævet |
| `bookingopsaetning` | 10 | **NAVIGATION_ONLY + ROUTE_REDIRECT**: flyttes UD af Planning-undermenuen, ind i Opsætning (se Administration nedenfor). `kraeverPerm: "satser.laes"` bevares uændret på den nye placering |

**Fleet** (`flaade` @ `/flaade`) — matrix 15–18, 22:

| Barn i dag | Matrix-# | Ændring |
|---|---|---|
| `vaerksted` "Driftskalender" | 16 | Uændret rute/plads. **VIEW_COMPOSITION** (kalender skal dominere, 5 handlingstal kompakte) |
| `indberetninger` | 17 | Uændret. **BACKEND_REQUIRED** (triage: prioritet/vurdering/planlæg/afvent/afslut + kobling til Fleet-sag — jf. 00-dokumentets konflikt A, `Sagsvisning.jsx` skal kobles til det allerede deployerede `sager`-backend) |
| `arbejdskoe` (allerede `skjulINav: true`) | 18 | **Allerede matcher målet** — åbnes fra Driftskalenderens fem kort, ingen nav-ændring |
| Enheder — se Opsætning | 15 | Allerede placeret i Opsætning (se nedenfor), kun "Fleet"-mærket i blueprintets Nyt hjem-kolonne er beskrivende, ikke en ny menuplacering |
| Servicedialog | 22 | Ikke et `nav.js`-punkt (kontekstuel dialog, ingen selvstændig rute). Ingen navigationsændring; **VIEW_COMPOSITION** for at standardisere knapper med Facility-dialogen |

**Facility** (`facility` @ `/facility`) — matrix 19–22:

| Barn i dag | Matrix-# | Ændring |
|---|---|---|
| `facilityOversigt` | 19 | Uændret. **VIEW_COMPOSITION** (reducér sekundære kort/demoestimater) |
| `servicekalender` | 20 | Uændret |
| `klima` | 21 | **HIDE_ONLY** (`skjulINav: true`) — skjules i V1 indtil zone-/sensoropsætning er reel. ⚠ Dashboardets `HANDLINGER`-post `klimaalarm` (dashboards.js, sti `/facility/klima`) peger på en side der bliver usynlig i menuen — den handlingsrække bør skjules i samme ombæring, ellers linker dashboardet ind til et menupunkt ingen kan finde igen. Flag til 04/05-dokumenterne |

**Procure** (`indkoeb` @ `/indkoeb`) — matrix 23–29:

| Barn i dag | Matrix-# | Ændring |
|---|---|---|
| `indkoebOversigt` | 23 | Uændret. **VIEW_COMPOSITION** (kun handlingskrævende rækker) |
| `indkoebsbehov` | 24 | Uændret. **BACKEND_REQUIRED** delvist (mobilvenlig) |
| `bestillinger` | 25 | Uændret. **BACKEND_REQUIRED** (reel mailafsendelse) |
| `godkendelser` | 26 | Uændret sti/plads for selve kø-skærmen. Beløbsgrænse/godkender-OPSÆTNING flyttes til Opsætning > Procure — se Administration. **Dette kræver et NYT `nav.js`-punkt der ikke findes i dag** |
| `fakturaer` "Fakturaer, match & kontantkøb" | 27 | **ROUTE_REDIRECT**: fjernes som selvstændigt Procure-punkt, redirectes til Fælles Fakturaer & bilag med et filter (`?modul=indkoeb`) |
| `leverandoerer` | 28 | **NAVIGATION_ONLY + ROUTE_REDIRECT + PERMISSION_MODEL**: flyttes ud af Procure-undermenuen til Fælles stamdata. Topniveau-placering **AFKLARET** (Korrektion 3; `01_ROUTE_DISPOSITION.md` §28's egen "Nyt hjem": Fælles stamdata > Leverandører) — eget Fælles-topniveaupunkt "Leverandører", ved siden af Kunder. Model B valgt: `leverandoerer` bliver en fuldt ugatet base-node + nye dedikerede permissions `leverandoerer.laes`/`leverandoerer.skriv` (samme rollefordeling som `fakturaer.laes`/`.skriv`, Korrektion 2) — IKKE Model A (inline modul-OR i regelteksten, reolpladser-mønstret). Fortsat nåbar i kontekst fra Fleet/Facility/Procure-skærmene der allerede læser kartoteket i dag (Disponering, Servicekalender, Arbejdskø, Driftskalender m.fl.) |
| `varelager` | 29 | Uændret rute. **NAVIGATION_ONLY** relabel til "Forbrugsvarer & eget lager" |

**Warehouse** (`warehouse` @ `/warehouse`) — matrix 35–45:

| Barn i dag | Matrix-# | Ændring |
|---|---|---|
| `warehouseVarer` "Varer" (i dag SELVE modulets landingsside, samme sti som forælder) | 35 | **NAVIGATION_ONLY + ROUTE_REDIRECT (blødt)**: `/warehouse` bliver en NY forside ("Overblik") sammensat af eksisterende dashboard-mønstre (**VIEW_COMPOSITION**, ingen ny node). Varer flytter til en ny understi, fx `/warehouse/varer`. ⚠ Et bogmærke til `/warehouse` viser fremover Overblik i stedet for Varekartoteket — ikke en 404, men et andet indhold på samme URL |
| `warehousePluk` | 36 | Uændret |
| `warehouseBevaegelser` | 37 | **NAVIGATION_ONLY**: grupperes under en ny "Mere"-undermenu i Warehouse. ⚠ Blueprintets ordlyd ("fjern fra den primære daglige menu for standardlagermedarbejdere") lyder rollestyret, men der findes ingen permission der skelner "standard" fra andre lagermedarbejdere, og et rent rollefilter uden en bagvedliggende permission ville være præcis den "pæne knap" CLAUDE.md/beslutning 43-44 forbyder. Læs derfor kravet som en **visuel demotion for ALLE roller** (flyttes ind i "Mere"), ikke en rollebaseret skjuling |
| `warehouseOptaelling` | 38 | Uændret |
| `warehouseModtagelse` | 39 | Uændret |
| `warehouseCarriers` "Beholdere" | 40 | Uændret. **VIEW_COMPOSITION** (konteksthandlinger: label, flyt, historik) |
| `warehouseLabels` "Transportlabels" | 41 | **NAVIGATION_ONLY** (`skjulINav: true`, samme mønster som `forslag`/`arbejdskoe`): fjernes fra topmenu, forbliver deep link, åbnes kontekstuelt fra Beholdere/Modtagelse |
| `warehouseAfregning` | 42 | **NAVIGATION_ONLY + ROUTE_REDIRECT**: flyttes ud af Warehouse til Økonomi > Fakturagrundlag > Warehouse. `kraeverPerm: "satser.laes"` bevares |
| `warehouseVolumen` | 43 | **NAVIGATION_ONLY + ROUTE_REDIRECT**: flyttes ud af Warehouse til Fælles Kunder-området, som "Lagerkalkulator". `kraeverPerm: "satser.laes"` bevares |
| `warehouseSporbarhed` | 44 | Uændret |
| `warehouseLokationer` "Lokationer" | 45 | **MERGE, mest NAVIGATION_ONLY**: se note nedenfor — datalaget er allerede fælles |

⚠ **Vigtig grundet-i-koden detalje for MERGE 33+45 (Unitbooking Reolpladser ↔
Warehouse Lokationer):** `moduler.js`' `NODE_MODUL`-tabel har ALLEREDE
`reolpladser: ["unitbooking", "warehouse"]` — noden er bevidst delt mellem de
to moduler (kommentaren: *"Unitbookings transportkasser og Warehouses
kundegods står på de samme hylder"*). De to skærme (`/unitbooking/reolpladser`
og `/warehouse/lokationer`) er derfor efter alt at dømme allerede to VISNINGER
af samme underliggende node — mergen er dermed primært **VIEW_COMPOSITION +
NAVIGATION_ONLY** (to skærme bliver til én, ét `nav.js`-punkt under Opsætning
med `kraeverModul: ["unitbooking", "warehouse"]`), IKKE en ny datamodel.
⚠ Bemærk at nav.js's `kraeverModul` i dag kun tager ÉN streng (jf. filens
egen kommentar ved `reolpladser`, som netop af den grund IKKE ligger under
Opsætning i dag). At lægge den fælles skærm under Opsætning kræver derfor at
`kraeverModul` udvides til at kunne evaluere en liste med ELLER-semantik —
en reel, lille mekanik-ændring i `nav.js`, ikke bare en flytning af et punkt.

**Unitbooking** (`unitbooking` @ `/unitbooking`) — matrix 30–34:

| Barn i dag | Matrix-# | Ændring |
|---|---|---|
| `unitbookingKalender` "Kalender" | 30 | Uændret rute. Relabel "Kalender & udlån". **VIEW_COMPOSITION** (samlet arbejdsflade) |
| `kasseudlaan` "Udlån" | 31 | **NAVIGATION_ONLY**: fjernes som topmenupunkt, indholdet flyttes ind som panel i Kalender. Rute kan forblive et deep link der åbner panelet |
| `unitbookingHistorik` | 32 | Uændret |
| `reolpladser` | 33 | **MERGE** → Opsætning > Lagerlokationer (se note ovenfor sammen med Warehouse Lokationer #45) |
| `unitbookingKasser` (allerede under Opsætning) | 34 | **Allerede matcher målet** — `sti: /opsaetning/kasser`, `kraeverModul: "unitbooking"`. Kun relabel til "Kasser & typer" |

**Workforce** (`bemanding` @ `/bemanding`) — matrix 11–14:

| Barn i dag | Matrix-# | Ændring |
|---|---|---|
| `bemandingPlan` (samme sti som forælder, `/bemanding`) | 11 | **HIDE_ONLY**: skjules i V1. ⚠ Fordi barnet i dag DELER rute med topniveaupunktet (`/bemanding`), skal Workforce have en ny landingsside når Bemandingsplan skjules — ellers peger topniveaupunktet "Workforce" på en side der ikke findes i menuen. Foreslået: Workforce lander på Kompetencer eller Fravær. **IKKE PÅVIST** i blueprintet hvilken af de to — afklares i implementeringsslicen |
| `kompetencer` | 12 | Uændret. **BACKEND_REQUIRED** (kanonisk skrivevej, jf. 00-dokumentets konflikt B — visningen er allerede korrekt modul-gatet til `bemanding`, kun skrivning mangler) |
| `fravaer` "Ferie & fravær" | 13 | Uændret rute. Relabel "Fravær". **BACKEND_REQUIRED** (godkend/afvis + automatisk reservationsblokering) |
| `medarbejdere` (allerede under Opsætning) | 14 | **Allerede matcher målet** — `sti: /opsaetning/medarbejdere`, `kraeverModul: "bemanding"`. Kun **BACKEND_REQUIRED** (redigering, fratrædelse) |

### Administration

**Opsætning** (`opsaetning` @ `/opsaetning`) — matrix 49–51, plus alt der MOVEs hertil (10, 14✓, 15✓, 26-delvist, 33/45, 34✓, 47✓):

| Barn i dag | Matrix-# | Ændring |
|---|---|---|
| `generelt` | 49 | Uændret rute. Relabel "Virksomhed". **BACKEND_REQUIRED** (navn, adresse, CVR, logo, standardlokation, fakturaoplysninger) |
| `enheder` | 15 | **Allerede matcher målet** — `kraeverModul: "flaade"` |
| `unitbookingKasser` | 34 | **Allerede matcher målet** |
| `medarbejdere` | 14 | **Allerede matcher målet** |
| `kunderOversigt` | 46 | Flyttes UD (se Fælles ovenfor) |
| `standardpriser` | 47 | **Allerede matcher målet** i placering (under Opsætning). Grupperes evt. under ny "Priser"-undersektion sammen med Kundepriser (kun visuel gruppering) |
| `kundepriser` / `kundepriserEn` | 48 | **NAVIGATION_ONLY**: fjernes som selvstændigt Opsætning-punkt, bliver fane på kundens profil under Fælles > Kunder. Deep link (`kundepriserEn`, allerede `skjulINav: true`) bevares som redirect ind i den nye fane |
| `brugere` | 50 | Uændret rute. Relabel "Brugere & adgang" |
| `integrationer` | 51 | **HIDE_ONLY** (`skjulINav: true`) indtil mindst én reel integration findes |
| **Nyt: Planning > Omkostninger & regler** | 10 | **NAVIGATION_ONLY** — modtager `bookingopsaetning` flyttet fra Planning. Ny sti, fx `/opsaetning/booking` |
| **Nyt: Procure-godkendelsespolicy** | 26 | **Nyt `nav.js`-punkt, ikke i koden i dag.** Beløbsgrænse/godkender-opsætningen findes formentlig i dag inde i selve Godkendelser-skærmen (`/indkoeb/godkendelser`) — præcis hvor er **IKKE PÅVIST** her (skærmens indre er ikke læst); kræver verifikation før implementering |
| **Nyt: Lagerlokationer** | 33, 45 | **Nyt `nav.js`-punkt** der erstatter både `reolpladser` og `warehouseLokationer` — se mekanik-note ovenfor om `kraeverModul` som liste |

### Hjælp

| Punkt | Dagens nav.js | Matrix-# | Ændring |
|---|---|---|---|
| Hjælp | `support` @ `/support`, barn `hjaelp` | 52 | **VIEW_COMPOSITION** (Korrektion 4: change-type rettet fra `HIDE_ONLY` til `VIEW_COMPOSITION` — punktet skjules IKKE i V1). Topniveaupunktet omdøbes "Hjælp" (fra "Support") og forbliver synligt. Den nuværende demo-prototype-skærm (med demo-supportsagsdata) erstattes af en simpel, ærlig, statisk side (guide + kontaktoplysninger: e-mail + telefon) — ingen demo-supportsagsdata vises, intet nyt backend-behov |
| Supportoverblik | `supportOverblik` @ `/support/overblik` | 53 | **HIDE_ONLY**: sættes til `skjulINav: true`, forbliver **HIDE** i V1 (Korrektion 4 bekræfter dette — kun `#52`/`/support` selv bliver synligt, Supportoverblik og Supportsag forbliver skjulte). ⚠ Nav.js's egen kommentar hævder punktet "Kræver `support.laes`", men feltet `kraeverPerm` er IKKE sat på det i koden, og ingen permission ved navn `support.laes` optræder i `05_ROLES_AND_PERMISSIONS.md`s gennemgang af de 7 roller. Dette er en kendt, PRÆ-EKSISTERENDE uoverensstemmelse mellem kommentar og kode — den løses ikke af denne plan (punktet forbliver HIDE uanset udfaldet), men noteres i `04_DATA_AND_PERMISSION_IMPACT.md` |
| Supportsag | `supportSag` (allerede `skjulINav: true`) | 54 | **Allerede matcher målet** — forbliver skjult |

### Uden for kunde-`nav.js` (ingen ændring i denne fil)

- **Ejerkonsol** (`/main`, matrix 55) og **Prisliste** (`/main/priser`,
  matrix 56) ligger i en separat udbyderramme, ikke i `NAV`. Ingen
  navigationsændring relevant for dette dokument.
- **Chaufførapp** (`/app/*`, matrix 57–61) er bevidst UDEN sidebar og UDEN
  `nav.js`-punkt (CLAUDE.md: *"Give chaufførappen en sidebar — eller lade den
  blive et modul"* er forbudt). Ingen ændring her.
- **Login** (`/login`, matrix 62) er eager-loaded uden for `AppShell`/
  `Suspense`, ikke et `nav.js`-punkt. Ingen ændring.

---

## Rolle × navigation-matrix

Navigationssynlighed via `nav.js`s `kraeverModul`/`kraeverPerm` er
**modul-købs-/permission-styret, ikke rollestyret i sig selv** (produktregel
7) — alle 7 roller ser i princippet de samme topniveaupunkter for et givet
tenant-modulsæt, modulo de tre `kraeverPerm`-permissions nedenfor. Chauffør
er en strukturel undtagelse: siden beslutning 117 når han slet ikke
`AppShell`/sidebaren og er begrænset til `/app/*` — kolonnen nedenfor
beskriver derfor kun de 6 øvrige roller for DETTE ene lag af mekanikken.

**Tabellen nedenfor viser kun `kraeverPerm`-laget, ikke det fulde billede
(Korrektion 1).** Den nye per-bruger `navvisning/<uid>` (se
§"Navigationsmodel" ovenfor) lægger sig OVEN PÅ disse permission-drevne
resultater, uafhængigt af dem: to brugere med identisk rolle og identiske
permissions kan derfor godt ende med at se forskellige topniveaupunkter,
fordi admin har sat en anden `navvisning`-preset for den ene. Standard er
stadig "vis alt tenanten har købt", så uden en eksplicit admin-handling
ændrer tabellen sig ikke.

| Rolle | `satser.laes` | `grundlag.laes` | `indkoeb.laes` | Ser i sidebar (ud over det alle ser) |
|---|:---:|:---:|:---:|---|
| Chauffør | — | — | — | Ingen AppShell-adgang (separat `/app`-skal) |
| Sagsbehandler (`casehandler`) | ✓ | ✓ | ✓ | Bookingopsætning, hele Procure, Fakturacenter/Fakturaer & bilag, Fakturagrundlag, Standardpriser, Kundepriser, Warehouse Afregning/Volumen — alt |
| Disponent (`disponent`) | ✓ | ✗ | ✓ | Alt UNDTAGEN Fakturagrundlag (`fakturering`, kræver `grundlag.laes`) |
| Koordinator (`koordinator`) | ✓ | ✓ | ✓ | Alt |
| Lagermedarbejder (`lagermedarbejder`) | ✓ | ✗ | ✓ | Alt UNDTAGEN Fakturagrundlag — **inkl. Bookingopsætning og hele Procure**, selvom hans arbejde er Unitbooking/Warehouse |
| Revisor (`revisor`) | ✓ | ✓ | ✓ | Alt (men enhver skrivning afvises server-side — permission-denied, ikke skjult knap) |
| Administrator (`admin`) | ✓ | ✓ | ✓ | Alt |

### Den kendte over-eksponering (lagermedarbejder) — ændrer V1-målnavigationen den?

`05_ROLES_AND_PERMISSIONS.md` (§ Lagermedarbejder) dokumenterer at han i dag
ser Bookingopsætning og hele Procure-menuen, fordi han har `satser.laes` og
`indkoeb.laes` som del af sit standardpermission-sæt, selvom intet i hans
rollebeskrivelse nævner booking- eller indkøbsadministration.

**Svar (rettet, Korrektion 1): JA — via det nye `navvisning`-lag, UDEN at
røre en eneste permission.** Den tidligere konklusion i dette dokument ("NEJ,
V1-målnavigationen ændrer IKKE denne eksponering... er et
PERMISSION_MODEL-arbejde") var netop den modsigelse ejeren fandt mod
`05_IMPLEMENTATION_SLICES.md`, og den er forkert efter Korrektion 1 — dette
afsnit er nu rettet til at stemme overens.

`kraeverPerm: "satser.laes"`/`"indkoeb.laes"` forbliver ganske rigtigt
UÆNDREDE permissions på Bookingopsætning og Procure-punkterne — matrix-punkt
10 flytter kun Bookingopsætnings MENUPLADS (fra Planning til Opsætning >
Planning > Omkostninger & regler), og lagermedarbejderens
`ROLLE_PERMS.lagermedarbejder` røres ikke af nogen beslutning i blueprintets
62-rækkers matrix. Permissionerne er fortsat korrekte og nødvendige: han
skal fortsat kunne slå priser op fra Warehouse Afregning/Volumen. Men de to
punkter afgør kun hvad serveren TILLADER — ikke hvad der bør TEGNES for ham
som standard.

Det er PRÆCIS det spørgsmål `navvisning/<uid>` findes for at besvare,
uafhængigt af permission-sættet: lagermedarbejderens STANDARD-`navvisning`-
preset kan sætte Bookingopsætning og hele Procure-grenen skjult i hans menu,
uden at ændre en eneste permission og uden at ændre `kraeverPerm` på et
eneste `nav.js`-punkt. Han beholder `satser.laes`/`indkoeb.laes` (så hans
EGNE skærme fortsat virker), men ser ikke længere Procure eller
Bookingopsætning i sidebaren, fordi admin har slået dem fra i hans
`navvisning`-post — akkurat som en `dashboardvisning`-post i dag kan skjule
et dashboardkort uden at røre adgangen til dets underliggende data.

Dette er derfor **VIEW_COMPOSITION/NAVIGATION_ONLY-arbejde på det nye
`navvisning`-lag** (Korrektion 1), IKKE et `PERMISSION_MODEL`-arbejde. Intet
i `firebase.rules.json`, `ROLLE_PERMS` eller de tre `kraeverPerm`-tjek skal
ændres for at lukke denne eksponering i V1's default-visning. Se
`04_DATA_AND_PERMISSION_IMPACT.md` og `05_IMPLEMENTATION_SLICES.md` for
implementeringen af selve `navvisning/<uid>`-noden.

---

## Breadcrumbs/rutestruktur

Følgende tabel lister de rute-ændringer "Nyt hjem"-kolonnen konkret medfører.
Mønsteret følger den eksisterende `REDIRECTS`-array i `nav.js` (fem
indgange i dag, alle som `<Navigate>` i `App.jsx`, se filens egen
dokumentation af hvorfor gamle links skal overleve en menuomlægning).

| Gammel rute | Ny kanonisk rute | Håndtering | Matrix-# |
|---|---|---|---|
| `/oekonomi/fakturacenter` | `/fakturaer` *(forslag — nøjagtig slug IKKE PÅVIST i blueprintet)* | **ROUTE_REDIRECT**, tilføjes til `REDIRECTS` | 3 |
| `/indkoeb/fakturaer` | `/fakturaer?modul=indkoeb` | **ROUTE_REDIRECT** med filterparameter, ikke en ren sti-til-sti redirect | 27 |
| `/warehouse/labels` | uændret (deep link) | **Ingen redirect** — punktet fjernes fra menu (`skjulINav: true`), ruten forbliver aktiv, åbnes kontekstuelt | 41 |
| `/booking/opsaetning` | `/opsaetning/booking` *(forslag)* | **ROUTE_REDIRECT**, tilføjes til `REDIRECTS` | 10 |
| `/unitbooking/udlaan` | uændret (deep link, åbner panel i Kalender) | **Ingen redirect nødvendig** — ruten kan forblive, panelet åbnes via state/query | 31 |
| `/unitbooking/reolpladser` | `/opsaetning/lagerlokationer` *(forslag)* | **ROUTE_REDIRECT** | 33 |
| `/warehouse/lokationer` | `/opsaetning/lagerlokationer` *(samme mål som ovenfor)* | **ROUTE_REDIRECT** | 45 |
| `/warehouse` (som variekartotek) | `/warehouse` (nu Overblik) + `/warehouse/varer` *(forslag)* | **Blødt skift, ingen redirect-fejl** — samme URL viser nyt indhold; Varer får ny understi | 35 |
| `/warehouse/afregning` | `/oekonomi/afregning/warehouse` *(forslag)* | **ROUTE_REDIRECT** | 42 |
| `/warehouse/volumen` | `/opsaetning/kunder/lagerkalkulator` *(forslag, hænger sammen med Kunder-flytningen)* | **ROUTE_REDIRECT** | 43 |
| `/opsaetning/aftalepriser`, `/opsaetning/aftalepriser/:kundeId` | fane på kundens profil, fx `/kunder/:kundeId?fane=priser` *(forslag)* | **ROUTE_REDIRECT**, ID skal med (samme disciplin som de eksisterende fem `REDIRECTS`, som allerede understreger at et ID ikke må tabes) | 48 |
| `/opsaetning/kunder` | `/kunder` *(forslag, følger af flytningen ud af Opsætning)* | **ROUTE_REDIRECT** | 46 |
| `/indkoeb/leverandoerer` | `/leverandoerer` *(forslag — afledt af `/kunder`s konvention; placering ved siden af Kunder er afklaret, Korrektion 3)* | **ROUTE_REDIRECT**, tilføjes til `REDIRECTS` | 28 |

Alle rutenavne markeret *"(forslag)"* er IKKE besluttet af blueprintet selv
(som kun angiver menuplacering, ikke URL-slugs) — de er forslag afledt af
nav.js's egne navngivningskonventioner (korte, danske, små bogstaver, jf.
`/booking`, `/flaade`, `/indkoeb`) og skal bekræftes i implementeringsslicen,
ikke opfattes som endelige.

Ruter der IKKE ændres og derfor ikke optræder i tabellen: alle punkter
markeret "Uændret" eller "Allerede matcher målet" i træet ovenfor (fx
Dashboard, Ny forespørgsel, Disponering, Rute & status, Driftskalender,
Indberetninger, Facility-skærmene, Procure-processkærmene minus
Leverandører, Pluk & afsend, Optælling, Modtagelse, Beholdere, Sporbarhed,
Historik, Enheder, Kasseliste, Medarbejdere, Standardpriser, Brugere &
roller, Generelt/Virksomhed).

---

## Ting der IKKE kunne fastslås fra kilderne (samlet liste)

1. Om `Dashboard.jsx` allerede implementerer auto-landing ved præcis ét
   købt modul (§"Dashboard-regel").
2. ~~Nøjagtig topniveau-placering af Leverandører i Fælles-gruppen~~ —
   **AFKLARET** (Korrektion 3 + `01_ROUTE_DISPOSITION.md` §28's egen "Nyt
   hjem": Fælles stamdata > Leverandører; Model B/base-node +
   `leverandoerer.laes`/`.skriv`, se Procure-tabellen ovenfor).
3. ~~Hvilken (om nogen) permission der skal gate det nye fælles Fakturaer &
   bilag-punkt~~ — **AFKLARET** (Korrektion 2: ny permission-familie
   `fakturaer.laes`/`.skriv`/`.godkend`, IKKE permission-fri).
4. Hvorvidt Workforce skal lande på Kompetencer eller Fravær når
   Bemandingsplan skjules (de deler i dag rute med topniveaupunktet).
5. Præcis nuværende placering af Procures beløbsgrænse/godkender-opsætning
   inde i Godkendelser-skærmen (kilde ikke læst).
6. Uoverensstemmelsen mellem `nav.js`'s kommentar om `support.laes` på
   Supportoverblik og fraværet af feltet i koden/permissions-dokumentet — en
   kendt, PRÆ-EKSISTERENDE kodeuoverensstemmelse, ikke noget denne plan skal
   løse (punktet forbliver HIDE uanset, se Hjælp-tabellen).
7. Alle rute-slugs markeret "(forslag)" i rutetabellen.
8. **Ny (Korrektion 6):** om Booking-forsiden (`bookingOversigt`) skal have
   et fast link ind til det nye Planning-dashboardkort ud over selve
   katalogtilføjelsen i `DASHBOARDS` — antaget nej, kun kataloget udvides.
