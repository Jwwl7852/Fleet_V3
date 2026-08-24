# 07 — Unitbooking

Kilder læst: `src/moduler/unitbooking/{Kalender,Udlaan,Historik,Kasser,Reolpladser}.jsx`,
`src/fleet/{unitbooking.js,udlaan.js,udlaan-regler.js,reolplads.js}`,
`src/fleet/nav.js` (nøgler `unitbooking`, `unitbookingKasser` under `opsaetning`),
`src/fleet/moduler.js` (MODUL, NODE_MODUL, MODUL_KRAEVER),
`src/fleet/permissions.js` (PERM, ROLLE_PERMS, ROLLE_LABEL),
`functions/index.js` (`kasseudlaanskriv`, linje ~1559–1749).

## Modul-resumé

- **navn:** Unitbooking (modulnøgle `"unitbooking"`)
- **formål (moduler.js):** "Udlejning af transportkasser: kasser, reolpladser og udlån pr. sag."
- **primær brugertype:** rollen `lagermedarbejder` — ifølge `ROLLE_LABEL.lagermedarbejder.hvorfor`: "Den eneste rolle ud over admin der må røre udlån. En chauffør kører; den der står med kassen i hånden, er en anden person." Rollen deler også `reolpladser.skriv`/`varerSkriv`/`bevaegelserSkriv` med Warehouse — samme person kan stå på begge moduler ("Samme mand, to moduler — ikke en ottende rolle", permissions.js linje ~524).
- **vigtigste opgave:** styre transportkasser (fysiske udlejningskasser, fx til museumsudstillinger) gennem cyklussen reservation → klargøring → udlån → retur, og holde styr på hvilken reolplads hver kasse hører hjemme på og står på nu.
- **vigtigste funktioner:**
  - Kalender som modulets forside — kasser/sager × tid, med et hændelsesorienteret "hvad skal ud/hjem" liste
  - Søg ledige kasser i en periode og reservér
  - Ét-klik statusskift: klargør, udlevér, modtag retur, annullér
  - Historik pr. kasse og pr. sagsnummer, med målt-vs-planlagt varighed
  - Stamdata: reolpladser (hal/reol/fag/hylde/plads) og kassetyper/undertyper
- **undermoduler:** ingen formelle undermoduler; fem skærme under én modulnøgle (Kalender, Udlån, Historik, Reolpladser, og Kasseliste flyttet til Opsætning).
- **afhænger af (MODUL_KRAEVER):** ingen indgang for `unitbooking` blev fundet i det læste udsnit af `MODUL_KRAEVER`-tabellen — modulet ser ikke ud til at kræve noget andet modul (kasseudlån har intet påkrævet `kundeId` i modellen, kunde-koblingen i Udlån.jsx er eksplicit valgfri). IKKE PÅVIST med sikkerhed uden fuld visning af `MODUL_KRAEVER`-objektet.
- **afhænges af:** Warehouse deler `reolpladser`-noden (se Overlap nedenfor). Ingen andre moduler set til at læse Unitbookings egne noder (`kasser`, `kassetyper`, `kasseudlaan`).
- **samlet status: BUILT.** Alle fem skærme har reelle læse- og skrivestier. Skrivning af selve udlånet går udelukkende gennem Cloud Function `kasseudlaanskriv` (transaktionsbaseret, med konflikttjek inde i transaktionen) — dette er en bevidst arkitekturbeslutning, ikke en mangel (`kasseudlaan` er `.write: false` netop fordi klienten ikke kan garantere atomisk skrivning af to poster + konflikttjek med samtidighed).
- **overlap-mistanke:** `reolpladser` er en bevidst, dokumenteret to-modul-node (Unitbooking + Warehouse). Se "Mulige overlap" for detaljer om hvorvidt UI'et duplikerer begrebet.

## Skærme

### Kalender (`/unitbooking`)
- **sidenavn/titel:** "Kalender" / "Unitbooking – kalender"
- **hvem bruger den:** lagermedarbejder (primært), evt. andre roller med `kasseudlaan.skriv` eller læseadgang
- **primært formål:** modulets forside — ressourcer (kasser eller sager) × tid, fremadrettet vindue (1/2/4 uger), viser klargøring/udlån/returnering som tre separate blokke pr. udlån
- **primær handling:** klik på en blok åbner et detaljekort (Udlaanskort) med redigér/annullér; "Kommende klargøringer"-panel har en direkte klargør-knap
- **sekundære handlinger:** gruppering pr. kasse/pr. sag, filtrering på type/undertype, fremhæv art (klargøring/udlån/retur), "udvid til 2 skærme" (nyt vindue, deler URL-state), fuldskærm, redigér booking (kun mens `booket`), annullér booking
- **data vist:** `kasseudlaan`, `kasser`, `kassetyper`, `reolpladser` (via `useListe`), afledte KPI'er (belægningsgrad, kommende klargøringer, aktive udlån, kommende returneringer, kasser i spil)
- **data der kan ændres:** udlånstilstand (klargør/udlevér/modtag retur/annullér via `skiftUdlaan`), booking-felter (sagsnummer, periode, klargøringsfrist, beskrivelse) via `retUdlaan` — kun mens tilstand er `booket`
- **kommer typisk fra:** disponent/lagermedarbejder der planlægger ugen; kan linkes direkte via URL-parametre (skub, uger, type, undertype, gruppering, fuld)
- **går typisk til:** Udlån-skærmen (samme handling, samme funktion `skiftUdlaan`) — kortets note siger eksplicit at klargøringsknappen her er "den samme handling" som på Udlån
- **overlap med anden side:** deler gitterkomponent (`fleet/Gitterkalender.jsx`) med Driftskalender, Servicekalender og Disponering — men har sit eget svævekort (bevidst ikke-delt, se kommentar i Kalender.jsx linje ~832)
- **status: BUILT**
- **demo-data:** ja — `DEMO_KASSER`, `DEMO_KASSETYPER`, `DEMO_KASSEUDLAAN`, `DEMO_REOLPLADSER`, alle kun som `useListe(..., { demo: … })`-fallback, ikke som primær kilde
- **nødvendig for daglig drift eller admin/opsætning:** daglig drift — dette er modulets forside

### Udlån (`/unitbooking/udlaan`)
- **sidenavn/titel:** "Udlån" / "Unitbooking – udlån"
- **hvem bruger den:** lagermedarbejder
- **primært formål:** den operationelle kerne — søg ledige kasser i en periode, reservér, og skift status fremad (klargør → udlevér → modtag retur)
- **primær handling:** "Søg ledige" → "Reservér" (åbner Reservationsformular → `opretUdlaan`); i udlånslisten: "Næste handling"-knap pr. række, drevet af `naesteSkift()`/`UDLAAN_SKIFT` (samme tabel som serveren håndhæver)
- **sekundære handlinger:** filtrering på type/undertype/tilstand, søgning på sagsnummer/kasse/beskrivelse, undtagelses-handlinger (fx annullér, fortryd klargøring)
- **data vist:** samme fire noder som Kalender plus `kunder` (valgfri, kobler udlån til kundekartotek — udelades pænt hvis `kunder`-læsning afvises)
- **data der kan ændres:** ny reservation (`opretUdlaan`), tilstandsskift (`skiftUdlaan`)
- **kommer typisk fra:** telefonopkald/bestilling der skal reserveres
- **går typisk til:** Kalender (for oversigt), Historik (efter afslutning)
- **overlap med anden side:** belægningsgrad-tal er bevidst identisk med Kasser-skærmens (samme funktion `kassebelaegning()`), kommenteret eksplicit for at undgå et "beslutning 6"-brud
- **status: BUILT**
- **demo-data:** ja, samme mønster som Kalender
- **nødvendig for daglig drift eller admin/opsætning:** daglig drift

### Historik (`/unitbooking/historik`)
- **sidenavn/titel:** "Historik" / "Unitbooking – historik"
- **hvem bruger den:** lagermedarbejder, evt. andre der skal svare "hvor har kassen været"
- **primært formål:** to opslagsveje — pr. kasse ("hvor har MDT-101 været?") og pr. sagsnummer ("hvilke kasser var med på sag 4260?")
- **primær handling:** søgning/valg af kasse eller sag, "Vis historik" åbner detaljetabel
- **sekundære handlinger:** ingen skrivehandlinger — skærmen er bevidst read-only ("Historik er dokumentation; kan den rettes fra en skærm, dokumenterer den ingenting")
- **data vist:** `kasseudlaan`, `kasser`, `kassetyper`, `reolpladser`; KPI'er (udlån i alt, afsluttede, andel med målt varighed, annullerede); varighed markeret "målt" vs. "planlagt" (`dageUde()`)
- **data der kan ændres:** intet — ren visning
- **kommer typisk fra:** kundeforespørgsel, opfølgning
- **går typisk til:** ingenting videre — slutpunkt
- **overlap med anden side:** eksplicit IKKE audit-loggen — tilstandsskiftene ligger i `audit/` med egen læseregel (`audit.laes`), som en lagermedarbejder ikke har
- **status: BUILT** (som ren visning — write-path er N/A per design)
- **demo-data:** ja, samme fire noder
- **nødvendig for daglig drift eller admin/opsætning:** daglig drift (kundeservice/opfølgning)

### Reolpladser (`/unitbooking/reolpladser`)
- **sidenavn/titel:** "Reolpladser" / "Unitbooking – reolpladser & kassetyper"
- **hvem bruger den:** lagermedarbejder (eller Warehouse-modstykke, da noden er delt)
- **primært formål:** stamdata for fysisk lagerstruktur (hal/reol/fag/hylde/plads) og kassetype-katalog
- **primær handling:** "Ny plads" / "Redigér" (Pladsformular → `gem()` med `flet: true`), "Ny type" (Typeformular → `gem()`)
- **sekundære handlinger:** filtrér på hal
- **data vist:** `reolpladser`, `kassetyper`, `kasser` (for optælling af hvor mange kasser der står på hver plads)
- **data der kan ændres:** reolplads-felter (hal/reol/fag/hylde/plads — navnet udledes, gemmes ikke), ny kassetype (kode + navn + beskrivelse)
- **kommer typisk fra:** opsætning af nyt lager/reol, ny kassetype før kasser kan oprettes
- **går typisk til:** Kasseliste (kasser kræver type + hjemplads at pege på)
- **overlap med anden side:** **eksplicit delt node med Warehouse** — skrivning bruger `flet: true` netop for ikke at overskrive Warehouse-felter (zone, type, status, temperatur) på samme plads-post. Se "Mulige overlap".
- **status: BUILT**
- **demo-data:** ja — `DEMO_REOLPLADSER` (fra `demo-lager.js`, delt fil-navngivning der antyder fælles oprindelse med Warehouse), `DEMO_KASSETYPER`/`DEMO_KASSER` fra `demo-unitbooking.js`
- **nødvendig for daglig drift eller admin/opsætning:** admin/opsætning (stamdata, sjældent rørt)

### Kasseliste / Kasser (`/opsaetning/kasser`, nav-nøgle `unitbookingKasser`)
- **sidenavn/titel:** "Kasseliste" / "Kasseliste" (nav.js) — komponentfil hedder `Kasser.jsx`
- **hvem bruger den:** lagermedarbejder — **menuplaceringen er bevidst under Opsætning** ("Kasselisten er flyttet til Opsætning", nav.js kommentar linje ~156/303–308): kasser er stamdata, oprettet én gang og sjældent rørt; det operationelle er udlånet, ikke kassen selv. `kraeverModul: "unitbooking"`.
- **primært formål:** CRUD på selve transportkasserne (fysiske mål, type/undertype, hjemplads, status)
- **primær handling:** "Ny kasse" / "Redigér" → Kasseformular → `gem()`
- **sekundære handlinger:** filtrér på status/type/undertype, søg på id/plads, sidedeling (12 pr. side)
- **data vist:** `kasser`, `reolpladser`, `kassetyper`, `kasseudlaan` (kun for at udlede "Reserveret"-mærkatet — ikke en gemt kassestatus)
- **data der kan ændres:** kassefelter (type, undertype, status begrænset til `ledig`/`udeAfDrift` — `klargjort`/`udlaant` er serverstyrede følger af udlånsskift), mål (længde/bredde/højde), hjemplads/nuværende plads, note. Ingen slet-knap (kassen slettes aldrig, jf. udlånshistorik).
- **kommer typisk fra:** ny kasse indkøbt/mærket fysisk
- **går typisk til:** Udlån (for at reservere kassen), Kalender (for at se den planlagt)
- **overlap med anden side:** ingen direkte skærmoverlap, men konceptuelt nærliggende Warehouses "Carriers" — se "Mulige overlap"
- **status: BUILT**
- **demo-data:** ja, samme mønster
- **nødvendig for daglig drift eller admin/opsætning:** admin/opsætning (bevidst flyttet dertil netop for at signalere det)

## Data-entiteter

| Entitet | RTDB-node(r) | Ejes af (NODE_MODUL) | Bruges også af | Kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| Kasse (UnitBooking-enhed) | `kasser` | `unitbooking` (alene) | — | Status er sandhed (ikke dato); `pladsId` er `null` når kassen er ude — undgår "en reolplads optaget af en kasse der fysisk er i Paris" |
| Kassetype/undertype | `kassetyper` | `unitbooking` (alene) | — | Undertyper ligger indlejret under typen, ikke i egen node |
| Udlån/reservation | `kasseudlaan` | `unitbooking` (alene) | — | `.write: false` — al skrivning går via `kasseudlaanskriv` Cloud Function (transaktion + serverstemplede tidspunkter `udleveretMs`/`returneretMs`) |
| Reolplads | `reolpladser` | **delt: `["unitbooking", "warehouse"]`** — første og eneste node i kodebasen med bevidst to-modul-ejerskab (moduler.js kommentar linje ~373–382) | Warehouse (carriers står på samme hylder) | Navn er udledt af felter (`pladsnavn()`), aldrig gemt; skrivning bruger `flet: true` for at bevare det andet moduls felter på samme post |

Bemærk: `reolplads.js` (fleet-fil) indeholder delt belægnings-logik (`belaegningPaaPlads`, `belaegningPrPlads`) der tæller *både* kasser og carriers på en plads — men ingen af de fem Unitbooking-skærme importerer denne fil direkte (de bruger simplere lokale optællinger som `antalPaa()` i Reolpladser.jsx). Filens fulde forbrugerkreds (fx Warehouses Lokationer-skærm) er uden for dette moduls dossier og IKKE PÅVIST her.

## Implementation-status

| Feature | Status | Persistence | Kendte blokeringer/kompromiser | End-to-end brugbar |
|---|---|---|---|---|
| Reservation (opret udlån) | **BUILT** | `opretUdlaan()` → `kasseudlaanskriv` Cloud Function, transaktion med konflikttjek inde i transaktionen | Ingen — tilstand tvinges til `booket` server-side, kan ikke springes over | Ja |
| Klargøring | **BUILT** | `skiftUdlaan({til:"klargjort"})` → samme funktion, ét `update()` for udlån + kasse | Der er bevidst ingen genvej fra `booket` direkte til `udlaant` — klargøring er obligatorisk mellemtrin | Ja |
| Udlån (udlevering) | **BUILT** | samme vej, sætter `udleveretMs` server-side, rydder kassens `pladsId` | Ingen | Ja |
| Forventet retur | **BUILT** (visning) | Beregnet af `returneresSnart()` fra `til`-felt på `udlaant`-poster; ingen separat skrivning nødvendig | `til` er påkrævet på oprettelse, så der findes intet udlån uden forventet returdato | Ja |
| Retur | **BUILT** | `skiftUdlaan({til:"returneret"})`, sætter `returneretMs` server-side, kasse får `pladsId = hjemPladsId` | Ingen — ingen vej tilbage fra `returneret` (nyt udlån kræves for genudlån) | Ja |
| Frigivelse/ny reservation | **BUILT** | Håndteres implicit: returneret kasse bliver `ledig`, kan straks re-reserveres via samme flow | Kassen kan ikke "byttes" på et eksisterende udlån — kræver annullér + ny reservation | Ja |
| Reolplads-administration | **BUILT** | `gem()` med `flet: true` mod delt node | Ingen slet — pladser omdøbes, aldrig slettes | Ja |
| Kassetype-administration | **BUILT** | `gem()` — opret kun (ingen redigér/slet-UI observeret for eksisterende typer i Reolpladser.jsx) | Typer kan tilsyneladende kun oprettes, ikke redigeres eller slettes, fra denne skærm | Ja for oprettelse; redigering af eksisterende type IKKE PÅVIST i UI |

## Workflow-observationer

Sporing af Reservation → klargøring → udlån → forventet retur → retur → frigivelse/ny reservation:

1. **Reservation** — BUILT. Bruger søger ledige kasser i periode (Udlaan.jsx, `ledigeKasser()`), udfylder Reservationsformular, `opretUdlaan()` kalder `kasseudlaanskriv` (`functions/index.js` linje ~1565), som validerer med delt `valideUdlaan()`, tjekker kassen ikke er `udeAfDrift`, og skriver i en RTDB-transaktion der genlæser og konflikttjekker atomisk. Sagsnummer er påkrævet nøgle.
2. **Klargøring** — BUILT. Fra Udlån-listens "Næste handling"-knap eller Kalenderens "Kommende klargøringer"-panel, begge kalder samme `skiftUdlaan({til:"klargjort"})` (Kalender.jsx linje ~938–948, Udlaan.jsx linje ~241–248). Server sætter kassestatus til `klargjort`, kassen bliver stående på sin hylde.
3. **Udlån (udlevering)** — BUILT. Samme `skiftUdlaan({til:"udlaant"})`-mønster. Server stempler `udleveretMs` og rydder kassens `pladsId` (functions/index.js linje ~1669, 1672–1676).
4. **Forventet retur** — BUILT (som beregnet visning, ikke et separat trin). `returneresSnart()` i `unitbooking.js` (linje ~925) beregner ud fra `til`-feltet på alle `udlaant`-poster; vises som KPI-kort og i "Kommende klargøringer"-lignende liste. `til` er påkrævet ved oprettelse, så feltet findes altid.
5. **Retur** — BUILT. `skiftUdlaan({til:"returneret"})`. Server stempler `returneretMs`, sætter kasse til `status: "ledig"`, `pladsId: hjemPladsId` (unitbooking.js `virkningPaaKasse()` linje ~160–172, håndhævet server-side i functions/index.js linje ~1670–1676).
6. **Frigivelse/ny reservation** — BUILT (implicit). Kassen er nu `ledig` og fremkommer igen i `ledigeKasser()`-søgningen. Der er ingen "genåbn"-funktion fra `returneret` — et nyt udlån oprettes fra bunden (trin 1), med vilje, for at bevare historikkens integritet ("En genåbnet post ville betyde at historikken kunne skrives om bagefter", unitbooking.js linje ~110–112).

Hele kæden håndhæves dobbelt: klientsiden viser kun knapper for lovlige skift (`UDLAAN_SKIFT`/`naesteSkift()`), og serveren håndhæver den identiske tabel (`kanSkifteUdlaan()`, delt fil-logik importeret begge steder) — ingen observeret afvigelse mellem UI-tilbudte handlinger og server-tilladte handlinger.

## UI-mønstre

- **Navigation:** Unitbooking er en topniveau sidebar-sektion (nav.js nøgle `unitbooking`, sti `/unitbooking`) med fire børn (Kalender, Udlån, Historik, Reolpladser); Kasseliste er bevidst flyttet ud til Opsætnings sektion som `unitbookingKasser`.
- **Card/KPI-design:** `KpiRaekke` + `KpiKort` gennemgående (fem KPI'er på Kalender, seks på Udlån/Kasser, fire på Historik). Belægningsgrad vises med en `Donut`-komponent på Kalender.
- **Tabeller:** `Tabel`-komponent med kolonnedefinitioner (`key`, `label`, `render`), understøtter `raekker`, `tom` (tom-tilstand-tekst), `erValgt`, `noegle`. Sidedeling via `Sider`-komponent (Kasser.jsx, 12 pr. side).
- **Filtre:** ensartet `.fc-filtre` / `.fc-felt` klassenavne til søgefelter og dropdowns, gennemgående på alle fem skærme. Type→undertype er et to-trins kaskadefilter overalt (type-skift rydder undertype).
- **Modaler/formularer:** ingen modal-overlay — formularer (`Formular`, `Felt`, `Feltraekke`) vises inline som kort, der lukkes med "Annullér"/"Luk". `Formularsvar` viser server-svar direkte (fx serverens konfliktbesked ordret).
- **Statusfarver (Pille-komponent, tone-baseret):** `ok` (grøn, fx Ledig/Returneret), `warn` (gul, fx Klargjort), `bad` (rød, fx Udlånt/Ude af drift/Over tiden), `info` (blå/neutral, fx Booket/Annulleret).
- **Knapper:** `Knap` med `variant="primaer"` for hovedhandling, ellers sekundær; `disabled` + forklarende `title` når permission mangler (`Kræver kasseudlaan.skriv — reglerne afviser.`).
- **Kalenderdesign:** delt `Gitterkalender`-komponent (også brugt af Driftskalender/Servicekalender/Disponering) med ressourcer-som-rækker × dage/uger-som-kolonner; tre farvede blok-typer pr. udlån (klargøring/udlån/returnering) i forlængelse af hinanden; svævekort ved museover; "Fuld skærm"-tilstand og "Udvid til 2 skærme" (nyt vindue med delt URL-state).
- **Terminologi:** konsekvent dansk fagsprog — "kasse" (aldrig "container" i UI), "reolplads" (hal/reol/fag/hylde/plads), "sag"/"sagsnummer" som ekstern nøgle, "hjemplads" vs. "nuværende plads" som to distinkte felter.

## Mulige overlap

**Site A: Unitbooking Reolpladser · Site B: Warehouse (lokationsskærm, ikke læst i denne audit)**
Hvorfor: `reolpladser`-noden er eksplicit ejet af begge moduler (`NODE_MODUL.reolpladser = ["unitbooking", "warehouse"]`, moduler.js linje ~382). Dette er ifølge kodekommentarerne en bevidst, begrundet designbeslutning — ikke en tilfældig overlapning: "Unitbookings transportkasser og Warehouses kundegods står på de samme hylder; to reolnoder ville betyde at den vognmand der har begge moduler, skulle vedligeholde sit lager to gange." Reolpladser.jsx's skrivefunktion bruger eksplicit `flet: true` (merge, ikke overskriv) netop for at undgå at en unitbooking-bruger sletter Warehouse-felter (zone, type, status, temperatur) på samme plads-post ved en simpel rettelse af hyldenummer.
Risiko: Dette fremstår som et **rent, gennemtænkt shared-node-design** snarere end en UI-begrebsduplikering — Reolpladser.jsx i Unitbooking viser kun de fem strukturelle felter (hal/reol/fag/hylde/plads) og en simpel kasse-optælling; den kalder ikke den mere avancerede delte belægningslogik i `reolplads.js` (`belaegningPaaPlads`/`belaegningPrPlads`, som tæller varelinjer + kasser + carriers samlet). Om Warehouses egen Lokationer-skærm bruger den fulde delte logik korrekt er IKKE PÅVIST her (uden for modulets scope) — men risikoen fra Unitbooking-siden er lav, fordi permissionen (`reolpladserSkriv`) også er bevidst afkoblet fra `kasser.skriv` netop for at undgå at gate den delte node på ét moduls rettighed.

**Site A: Kasser (Unitbooking) · Site B: Carriers (Warehouse, ikke læst i denne audit)**
Hvorfor: moduler.js har en eksplicit note om netop denne forvekslingsrisiko (linje ~392–396): "En carrier og en transportkasse er fysisk den samme slags beholder, men de bærer hver sin forretning: kassen udlejes pr. sag, carrieren bærer kundens gods." De to noder (`kasser` vs. `carriers`) er bevidst adskilt, hver med sit eget modul-ejerskab og sin egen skrivepermission (`kasserSkriv` vs. `carriersSkriv`), netop for at forhindre at de to begreber smelter sammen i adgangsstyringen.
Risiko: Rent datamæssigt/adgangsmæssigt er dette allerede adskilt af udviklerne med en eksplicit begrundelse. Den resterende risiko er ren **brugerforvirring** hos en kunde der har begge moduler (fysisk identiske kasser/beholdere på samme hylder, to forskellige skærme til at administrere dem) — ikke en teknisk eller data-mæssig sammenblanding. Ingen Unitbooking-skærm refererer til eller viser Carrier-data, så der er ingen observeret kode-niveau-overlap ud over den delte `reolpladser`-node begge peger ind i.

**Ingen yderligere overlap observeret** mellem Unitbookings fem skærme og andre moduler (Fleet, Booking, Facility, osv.) — modulets øvrige tre noder (`kasser`, `kassetyper`, `kasseudlaan`) er entydigt og udelukkende ejet af `unitbooking` alene ifølge `NODE_MODUL`.
