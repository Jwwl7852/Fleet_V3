<title>Screenshot Index</title>

# 09 — Screenshot-indeks

Screenshot-automation VAR tilgængelig (Chrome-browserautomation mod den
lokale dev-server, `npm run dev` på `localhost:5174`, forbundet til
DEV-Firebase `fleetcontrol-dev-1ac1c`). **13 repræsentative skærmbilleder**
er derfor rent faktisk taget, logget ind som seedede DEV-testkonti (ingen
rigtig kundedata) — ét pr. modul plus to fra chaufførappen. De resterende
~49 af de 62 skærme (detaljepaneler, dialoger, sekundære skærme og
rollespecifikke visninger) er **ikke** skærmbilledet i denne omgang og er
listet nedenfor som rutekort til manuel opfølgning.

## Taget (13 stk., i `09_SCREENSHOTS/`)

| Fil | Route | Modul | Kort beskrivelse |
|---|---|---|---|
| `dashboard__samlet-dashboard.jpg` | `/` | Dashboard | Samlet dashboard, logget ind som admin. Bekræfter dossier 01's fund live: "Klimaalarmer i dag", "Ledig kapacitet", "Driftsomkostninger", "Ikke-faktureret" viser alle `—` (null i produktion). |
| `planning__oversigt.jpg` | `/booking` | Planning | Alle opgaver-listen, KPI-rækken øverst (Nye bookinger, I gang i dag, Forsinkede, Ikke-faktureret). |
| `workforce__bemandingsplan.jpg` | `/bemanding` | Workforce | Ugevisning af bemandingsplan — **bemærk**: dette er den skærm dossier 03 bekræftede er 100 % demo-data uden en rigtig vagtnode; billedet viser derfor demo-tal, ikke produktionsdata. |
| `fleet__driftskalender.jpg` | `/flaade` | Fleet | Driftskalenderens fem "kasser" plus ugegitteret med reelle værkstedsopgaver. |
| `facility__overblik-fejl-klima.jpg` | `/facility` | Facility | Anlægsoversigt, lokationsliste med afledt tilstand (Normal/Kritisk), aktivtabel. |
| `procure__vareforbrug-overblik.jpg` | `/indkoeb` | Procure | De fem trin i indkøbsprocessen som et flow-diagram øverst, indbakke for behov. |
| `unitbooking__kalender.jpg` | `/unitbooking` | Unitbooking | Kasser × dage-gitteret, belægningsgrad, kommende klargøringer/returneringer. |
| `warehouse__varer.jpg` | `/warehouse` | Warehouse | Varekartotek pr. kunde, sporingstype-kolonne (Ingen/Batch/Serienummer). |
| `oekonomi__overblik.jpg` | `/oekonomi` | Økonomi & Rapporter | KPI-kortene der (bekræftet live) viser "0 kr."/"—" for stort set alle felter undtagen det der reelt er beregnet — matcher dossier 01's fund præcist. |
| `support__hjaelp-og-support.jpg` | `/support` | Support | Oprettelsesformular ("Opret supportsag" synlig) plus "Jeres sager"-listen — hele skærmen viser demo-data, jf. dossier 10's fund om at modulet er fase 0. |
| `opsaetning__generelt.jpg` | `/opsaetning` | Opsætning | Virksomhedskort, modultal, lokationsliste — bevidst read-only skærm. |
| `chaufforapp__forside.jpg` | `/app` | Chaufførapp | De fire genvejskort, logget ind som `chauffoer@dev.fleetcontrol.invalid` — bekræfter LIVE at beslutning 117's adgangsbegrænsning virker (chaufføren lander direkte her, ingen sidebar). |
| `chaufforapp__turplan.jpg` | `/app/tur` | Chaufførapp | Dagens stop med "Naviger"-knap og meldingsstatus ("Meldt" / "mangler melding"). |

Alle 13 er taget som administrator (`admin@dev.fleetcontrol.invalid`), undtagen de to chaufførapp-billeder (`chauffoer@dev.fleetcontrol.invalid`) — begge seedede DEV-konti med adgang kun til testdata i tenanten `demo`.

## Ikke taget — rutekort til manuel opfølgning

Screenshot-automation er til rådighed, men følgende kræver enten flere
rolle-logins (for at se en skærm som den fremstår for en anden rolle),
navigation til en specifik post (detaljepaneler har brug for et konkret
ID), eller en dialog/modal der skal udløses med et klik — for meget for
denne runde af auditten. Rutelisten følger 02_SCREEN_INVENTORY.md's
modulinddeling:

**Planning:** `/booking/ny` (Ny forespørgsel), `/booking/forslag/:id`
(Forslag & reservation — kræver et konkret id), `/booking/disponering`
(Disponering, dag+uge-faner), `/booking/live-kort` (Rute & status),
`/booking/opsaetning` (Bookingopsætning).

**Workforce:** `/bemanding/kompetencer`, `/bemanding/fravaer`.

**Fleet:** `/flaade/indberetninger`, `/flaade/koe` (Arbejdskø, skjult i
nav — kun nået via query-parameter fra Driftskalenderen), `/opsaetning/enheder`
(Enheder).

**Facility:** `/facility/servicekalender`, `/facility/klima`, samt
Servicedialog (åbnes som modal fra Servicekalender, ingen egen route).

**Procure:** `/indkoeb/behov`, `/indkoeb/bestillinger`,
`/indkoeb/godkendelser`, `/indkoeb/fakturaer`, `/indkoeb/leverandoerer`,
`/indkoeb/varelager`.

**Unitbooking:** `/unitbooking/udlaan`, `/unitbooking/historik`,
`/unitbooking/reolpladser`, `/opsaetning/kasser` (Kasseliste).

**Warehouse:** `/warehouse/pluk`, `/warehouse/bevaegelser`,
`/warehouse/optaelling`, `/warehouse/modtagelse`, `/warehouse/carriers`,
`/warehouse/labels`, `/warehouse/afregning`, `/warehouse/sporbarhed`,
`/warehouse/volumen`, `/warehouse/lokationer`.

**Kunder & Priser:** `/opsaetning/kunder`, `/opsaetning/priser`,
`/opsaetning/aftalepriser`.

**Opsætning (resten):** `/opsaetning/medarbejdere`,
`/opsaetning/brugere` (Brugere & roller), `/opsaetning/integrationer`.

**Økonomi & Rapporter:** `/oekonomi/fakturacenter`, `/oekonomi/fakturering`.

**Support & Ejerkonsol:** `/support/overblik` (kræver `support.laes`, som
ingen rolle reelt har — se dossier 10), `/support/sag/:id`. `/main`
(Konsol) og `/main/priser` (Prisliste) kræver login som en `udbyder`-konto
(fx `jwwl@fleetcontrol.dk`) — denne konto blev nulstillet tidligere i
sessionen og dens nye adgangskode er ikke kendt her; kræver et login med
den nye adgangskode for at skærmbillede.

**Chaufførapp (resten):** `/app/indberetning`, `/app/tid`, `/app/frihed`.

**Login:** `/login` (selve login-skærmen, ikke taget som separat billede —
den ses implicit i baggrunden af hele denne øvelse).

**Rollevarianter:** Ingen af de 13 tagne billeder viser hvordan en skærm
ser ud for en rolle uden fuld adgang (fx `<Datatilstand art="naegtet">`
for en disponent der rammer Fakturering, eller en revisor der forsøger at
gemme noget). Det kræver login som hver af de øvrige seedede DEV-roller
(`casehandler@dev.fleetcontrol.invalid`, `disponent@…`, `koordinator@…`,
`revisor@…` — alle med samme delte DEV-adgangskode) og er ikke gjort i
denne runde.
