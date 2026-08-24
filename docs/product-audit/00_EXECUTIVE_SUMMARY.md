<title>Executive Summary</title>

# 00 — Executive Summary

Dette er et **indeks** til de ni øvrige dokumenter i `docs/product-audit/`,
ikke en erstatning for dem. Alt heri er destilleret fra 11 modul-dossierer
(`_dossiers/01–11`), som hver blev skrevet ved at læse den faktiske kildekode
— ikke README, ikke BESLUTNINGER.md, ikke mockups. Hvor dokumentation og kode
er uenige, er koden lagt til grund, og uoverensstemmelsen er noteret. Ingen
kode, UI, navigation, datamodel eller funktionalitet er ændret som del af
denne opgave.

## Hvad findes

**14 modul-resuméer** (01_PRODUCT_MAP.md), fordi tre af de 11 dossierer hver
dækker to selvstændige moduler: Dashboard & Økonomi, Planning/Booking,
Workforce/Bemanding, Fleet, Facility, Procure/Indkøb, Unitbooking, Warehouse,
Kunder & Priser, Opsætning, Support, Ejerkonsol/Udbyder, Chaufførapp, Login.

**62 brugervendte skærme/ruter** (02_SCREEN_INVENTORY.md), fordelt: Dashboard
& Økonomi 4, Planning/Booking 6, Workforce/Bemanding 4, Fleet 4, Facility 4,
Procure/Indkøb 7, Unitbooking 5, Warehouse 11 (det største modul), Kunder &
Priser + Opsætning 6, Support & Ejerkonsol 5, Chaufførapp & Login 6.

**7 faste roller** (05_ROLES_AND_PERMISSIONS.md): chauffør, sagsbehandler,
disponent, koordinator, lagermedarbejder, revisor, administrator — ingen af
brugerens eksempel-personaer ("Fleet-ansvarlig", "Indkøber", "Godkender",
"Økonomi", "Read-only") findes som egne roller; de nærmeste faktiske match er
listet i dokumentet.

**118 beslutninger** (07_DECISIONS_AND_OPEN_QUESTIONS.md), heraf 2 med
eksplicit "midlertidig" status (retention, audit-log-frister) og 14 stadig
åbne produktspørgsmål.

## Implementation-status: hovedtal

Af ca. 85 sporede features på tværs af de 11 moduler (06_IMPLEMENTATION_STATUS.md):

| Status | Ca. andel | Betyder |
|---|---|---|
| BUILT | ~55–60 | Rigtig Firebase-læse-/skrivevej, bruges |
| PARTIAL | ~12 | Skærmen findes, men noget i kæden persisterer ikke eller mangler en integration |
| MOCK/DEMO | ~12 | Data kommer permanent fra en demo-fil, uafhængigt af Firebase |
| NOT_BUILT | ~10 | Intet spor findes |
| PLANNED | ~4 | Nævnt/designet, ingen skærm/node findes |

**Mest komplette spor:** Warehouse og Unitbooking — hele kernekæden i begge
er BUILT gennem transaktionsbaserede Cloud Functions, ingen skærm er
MOCK/DEMO. Chaufførappen er tæt bagefter: alle syv sporede trin i
"chaufførens dag" har en fungerende data-vej.

**Mindst komplette spor:** Support-modulet er **fase 0 fra ende til anden**
— ingen skærm har en reel læse- eller skrivevej, og de fire
`support.*`-permissions findes slet ikke i `permissions.js`, så **ingen
rolle, heller ikke admin, kan nogensinde bruge det**. Tæt efter: Fakturacenters
indgangskanaler (mail/upload/OCR findes ikke) og enhver regnskabsintegration
(indgående såvel som udgående fakturering stopper ved en intern statusændring
— ingen af dem sender noget til et rigtigt regnskabssystem).

**Et lag-gab værd at fremhæve særskilt:** den sagsbaserede mail-tråd for
Fleet/Facility har en **fuldt bygget backend** (fire Cloud Functions,
verificeret direkte i `firebase.rules.json` — `sager`-noden findes reelt,
linje 679 og 1920), men frontend'en (`Sagsvisning.jsx`) er stadig markeret
"fase 0" med alle knapper deaktiverede. To af dossiererne (Fleet, Facility)
antog fejlagtigt at noden slet ikke fandtes, fordi de kun læste den
forældede frontend-kommentar — en påmindelse om at "ikke bygget" i en
kodekommentar ikke altid er ajour.

## De vigtigste arbejdsgange (03_WORKFLOWS.md)

Ni end-to-end-kæder er sporet trin for trin. Planning/Booking har det bedst
udbyggede KERNEflow (opret → forslag → håndhævet fire-øjne-godkendelse →
disponering → udførelse), men mangler helt ruteoptimering og
koordinator-notifikation. Procure og Fakturacenter fungerer end-til-ende med
to bevidste, MENNESKELIGE brud (leverandørmail sendes manuelt; bogføring sker
uden for systemet). Facility og Fleet deler samme mønster: solid
planlægning/udførelse, men ingen udgående mail til eksterne leverandører
overhovedet (begge eksplicit "fase 0" i kildekoden, beslutning 20).

## De største dokumenterede overlap (10_DUPLICATION_AND_OVERLAP_REPORT.md)

**51 overlap-observationer** i alt, 19 markeret bevidst design og 32 som en
reel, om end ofte lav, risiko. De tre mest væsentlige:

1. **Fakturacenter (Økonomi) vs. Procure → Fakturaer** — samme
   `fakturaer/`-node, to selvstændige brugerflader for samme handling.
   Bevidst delt, men en ekstern bruger kan let tro det er to systemer.
2. **Driftskalender (Fleet) / Servicekalender (Facility) / Disponerings
   dagsgitter (Booking)** — tre kalenderskærme i tre moduler, samme
   `opgaver`-node, samme skrivefunktioner, samme delte
   `Gitterkalender.jsx`-komponent, kun adskilt af et `art`-felt.
3. **`reservationer`-noden** — delt af fire kilder (booking, værksted,
   facility-sag, fravær). Historisk **målt fejl**: da noden fejlagtigt var
   gatet til Booking-modulet alene, kunne en DEV-kunde med Fleet, Facility,
   Bemanding og Procure — men uden Planning — ikke læse 37 af sine egne
   reservationer. Rettet i beslutning 92, men et konkret eksempel på
   risikoklassen "et modul ejer data der burde være fælles".

## De største dokumenterede inkonsistenser (08_UI_CONSISTENCY_AUDIT.md)

Komponentdisciplinen er stærk og konsekvent: ét primitiv-bibliotek
(`ui.jsx`), én statusfarve-palet, ét "deaktiveret knap skal altid forklare
hvorfor"-mønster, og fire kalenderskærme der reelt deler samme
gitterkomponent. De reelle afvigelser er få og næsten alle eksplicit
begrundede i kildekoden selv: chaufførappen bruger sit eget klassesæt (bevidst
mobilt formsprog), Bemandingsplanen bygger sin egen ugetabel i stedet for at
genbruge kalenderkomponenten (men viser kun demo-data), og modaler-vs-inline
er ikke ét mønster på tværs af appen (Booking/Fakturacenter bruger `Dialog`,
Unitbooking/Support/Medarbejdere bruger bevidst inline-formularer). Ingen
visuel/skærmbillede-gennemgang er foretaget — "for mange forskellige
layouts" kunne derfor ikke bekræftes eller afkræftes af kildekode alene.

## De vigtigste åbne produktspørgsmål (07_DECISIONS_AND_OPEN_QUESTIONS.md)

Femten spørgsmål er eksplicit markeret ubesvarede i kildedokumenterne. De
fem README selv fremhæver som dem der "bør besvares først":

1. **Eksportformat og godkender-fordeling for fakturagrundlaget** — hvilket
   regnskabssystem, og skal udarbejder og godkender være to forskellige
   personer?
2. **Retention og kundesynlighed for Rute & status** — er sporing i tre uger
   medarbejderovervågning, der skal kunne slettes efter ønske?
3. **Chaufførappens næste prioritet** — hvad bygges efter det der allerede
   er der?
4. **Retention pr. datatype** — arkitekturen er på plads (beslutning 115),
   men hvert tal (hvor længe gemmes hvad) mangler stadig juridisk validering.
5. **Supportadgang** — modellen er designet (beslutning 23/24), men intet af
   det er bygget (bekræftet: hele Support-modulet er fase 0, se ovenfor).

Derudover: hvad `lagre` (Fleet/værksted reservedele) reelt er i forhold til
`forbrugsvarer` (Procures eget lager) er ikke afklaret i nogen af de 11
dossierer, og bør ses sammen med 04_DATA_OWNERSHIP.md's fund om at ingen
skærm for `lagre` selv blev fundet.

## Sådan bruges de øvrige dokumenter

| Dokument | Indhold |
|---|---|
| 01_PRODUCT_MAP.md | 14 modul-resuméer + afhængighedstabel |
| 02_SCREEN_INVENTORY.md | Alle 62 skærme, 14 felter hver |
| 03_WORKFLOWS.md | 9 end-to-end-kæder, trin for trin |
| 04_DATA_OWNERSHIP.md | 44 entiteter, ejerskab, dublerede modeller |
| 05_ROLES_AND_PERMISSIONS.md | 7 roller, hvad de kan og ikke kan |
| 06_IMPLEMENTATION_STATUS.md | Statusmatrix, kendte blockers |
| 07_DECISIONS_AND_OPEN_QUESTIONS.md | 118 beslutninger, konflikter, åbne spørgsmål |
| 08_UI_CONSISTENCY_AUDIT.md | Konsistente/inkonsistente UI-mønstre |
| 10_DUPLICATION_AND_OVERLAP_REPORT.md | 51 overlap-observationer |
| 09_SCREENSHOT_INDEX.md | Skærmbilleder (se separat status) |
