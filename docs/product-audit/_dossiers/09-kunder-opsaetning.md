# Dossier 09 — Kunder & Priser + Opsætning

Kilder læst: `src/moduler/Kunder.jsx`, `src/moduler/kunder/Standardpriser.jsx`,
`src/moduler/kunder/Kundepriser.jsx`, `src/moduler/opsaetning/Generelt.jsx`,
`src/moduler/opsaetning/Brugere.jsx`, `src/moduler/opsaetning/Integrationer.jsx`,
`src/fleet/priser.js`, `src/fleet/pricing.js`, `src/fleet/brugere.js`,
`src/fleet/brugere-regler.js`, `src/fleet/integrationer.js`, `src/fleet/steder.js`,
`src/fleet/moduler.js`, `src/fleet/permissions.js`, relevante `nav.js`-punkter
(`generelt`, `kunderOversigt`, `standardpriser`, `kundepriser`, `kundepriserEn`,
`brugere`, `integrationer`), samt stikprøver i `functions/index.js` for
`opretbruger`, `skiftrolle`, `rolleskriv`, `spaerlogin`, `dashboardvisningskriv`.

---

## Modul-resumé

### Kunder & Priser

**navn:** Kunder & Priser (modulnøgle `kunder`, `altid: true`).

**formål:** Kundekartotek (kunder, aftaler, prisgrupper) og de to lag af
prissætning — én fælles standardprisliste for platformens ydelser, og den
enkelte kundes afvigelse (egen pris eller rabat) fra den.

**primær brugertype:** Casehandler og admin (kundedialog, aftaler); admin
alene for standardpriser (`satser.skriv`); casehandler/disponent/koordinator
for kundeafvigelser (kræver BÅDE `kunder.skriv` OG `satser.skriv`, hvor kun
admin har det sidste i standardpresettet).

**vigtigste opgave:** Holde styr på hvem kunderne er, hvad deres aftaler
siger, og hvilken pris der gælder for hvilken ydelse på hvilket tidspunkt —
uden at en rettelse i dag ændrer en faktura fra sidste kvartal.

**vigtigste funktioner:**
- Kunder.jsx: KPI-kort (aktive kunder, udløbende aftaler, tilbud, dækningsbidrag),
  filtrerbar kundetabel (prisgruppe/aftaletype/ansvarlig), udfoldeligt
  detaljekort pr. kunde, salgsprisafvigelser-tabel, top-5-kunder, tilbud der
  kræver opfølgning (skrivebeskyttet — "Tilbudsskærmen er ikke bygget"),
  aftaler der udløber.
- Standardpriser.jsx: ydelseskatalog filtreret på tenantens moduler,
  pris pr. ydelse med gyldigFra-historik, "sæt ny pris"-formular (aldrig
  overskrivning, kun ny post).
- Kundepriser.jsx: pr.-kunde afvigelse (egen pris ELLER rabat, aldrig begge),
  forhåndsvisning af resultatpris, historik pr. ydelse.

**undermoduler:** Kunder (`/opsaetning/kunder`), Standardpriser
(`/opsaetning/priser`), Kundepriser (`/opsaetning/aftalepriser`,
`/opsaetning/aftalepriser/:kundeId`). Ingen topniveaupunkt — "det første modul
uden et topniveaupunkt" (moduler.js), nås kun via Opsætning-menuen.

**afhænger af (andre moduler):** Ingen (kunder er selv en grundnode). Kunder
læser desuden `kpi.oekonomi.daekningsgradPct`/`maalDaekningsgradPct` fra
Økonomi-domænet.

**afhænges af (hvem læser dette modul):** `booking` og `warehouse` kræver
`kunder` (`MODUL_KRAEVER`: `bookinger`, `varer`, `enheder`, `plukordrer` har
alle et påkrævet `kundeId`). Priserne (`satser/standard`) læses desuden af
Warehouses Afregning og Volumen (satsopslag for håndtering/opbevaring) og af
prismotoren (`pricing.js`) for booking-estimater.

**samlet status:** BLANDET. Kunder.jsx er en fuldt fungerende oversigts- og
rapporteringsskærm (BUILT read-side; ingen redigering af kundestamdata findes
på denne skærm i det hele taget — den redigerer intet, kun priser gøres
det på nabosiderne). Standardpriser og Kundepriser er begge BUILT
end-to-end (læs + skriv, med reel to-lags prislogik og versionering).
Tilbudsfunktionen er eksplicit ikke bygget (ingen node, knap deaktiveret).

**overlap-mistanke:** Kundens `prisgruppe`-felt filtrerer stadig i
Kunder.jsx/Kundepriser.jsx, men bærer ikke længere en pris (kun standard +
kundeafvigelse gør) — feltet er et levn der kan forveksles med et aktivt
prislag. Se Mulige overlap.

### Opsætning

**navn:** Opsætning (modulnøgle `opsaetning`, `altid: true`).

**formål:** Samlested for stamdata, brugere/roller og integrationer — en
"grab-bag" med vilje: Enheder (Fleet), Kasseliste (Unitbooking), Medarbejdere
(Bemanding) og Kunder/Priser er alle flyttet hertil fra deres respektive
moduler, fordi Opsætning er den ene menu enhver kunde altid har adgang til.

**primær brugertype:** Admin (Brugere & roller kræver `brugere.skriv`, kun
admin-presettet har den); enhver rolle kan læse Generelt og Integrationer.

**vigtigste opgave:** Vise virksomhedens grundfakta (moduler, lokationer,
miljø), administrere logins/roller, og vise ærligt hvilke eksterne systemer
der er forbundet (i dag: ingen).

**vigtigste funktioner:**
- Generelt.jsx: KPI-kort (virksomhed, aktive moduler, lokationer, miljø),
  "hvor rettes stamdata"-henvisningstabel, eksplicit erklæret READ-ONLY med
  begrundede åbne spørgsmål.
- Brugere.jsx: brugerliste (fra indeks, ikke Auth direkte), opret bruger,
  skift rolle, spær/åbn login, rolle-editor (redigér hvad en rolle
  indeholder, med `NOEGLEPERM`-beskyttelse og `laaserUde()`), rolle-vs-perm
  matrix, dashboardvisning pr. bruger (visning, ikke adgang).
- Integrationer.jsx: liste over forbundne systemer — tom, med eksplicit
  begrundelse for hvorfor der ikke er et "kommer snart"-vejkort på skærmen.

**undermoduler (i denne dossiers scope):** Generelt (`/opsaetning`), Kunder
(dækket ovenfor), Standardpriser/Kundepriser (dækket ovenfor), Brugere &
roller (`/opsaetning/brugere`), Integrationer (`/opsaetning/integrationer`).
(Enheder, Kasseliste, Medarbejdere dækkes af andre dossierer.)

**afhænger af (andre moduler):** Generelt læser `facility/lokationer` (Facility)
og modulkataloget. Brugere & roller læser `roller/`, `brugere/` og
`dashboardvisning/` (alle base-noder uden modulklausul) og bygger på
`permissions.js`/`priser.js` (brugerarter til fakturering).

**afhænges af (hvem læser dette modul):** Alle moduler er implicit afhængige
af Brugere & roller, fordi tokenets `perms`-claim (mintet herfra) er hvad
firebase.rules.json håndhæver alle steder. Ingen modul kræver `opsaetning`
formelt (den er `altid: true` og optræder ikke i `MODUL_KRAEVER`).

**samlet status:** BLANDET, med Generelt bevidst PARTIAL/read-only og
Brugere & roller BUILT (læs + skriv, med reelle Cloud Functions bag hver
handling). Integrationer viser en ærlig tom liste — ikke MOCK, men reelt
"intet bygget endnu", eksplicit dokumenteret som en bevidst designbeslutning
(beslutning 22) frem for et "coming soon"-vindue.

**overlap-mistanke:** "Enheder", "Kasseliste" og "Medarbejdere" ligger fysisk
i samme menu som Kunder/Priser og Brugere/Integrationer, uden funktionel
sammenhæng — se UI-mønstre og Mulige overlap.

---

## Skærme

### Kunder
- **route:** `/opsaetning/kunder` (nav-key `kunderOversigt`; legacy `/kunder`
  redirecter hertil)
- **sidenavn:** "Kunder & Priser" (titel i nav.js), menupunkt "Kunder"
- **hvem bruger den:** Casehandler, disponent, koordinator, admin —
  alle med `kunder.laes`/`kunderSkriv` gennem `BASIS_DATA`/`BASIS_LAES`.
  Kræver `kraeverModul: "kunder"` (skjules for en kunde uden modulet).
- **primært formål:** Overblik over kundebasen: hvem er aktive, hvilke
  aftaler udløber, hvor stor er dækningsbidraget, hvor er salgsprisen
  afveget fra det aftalte.
- **primær handling:** Filtrere/gennemse kundetabellen; folde et
  detaljekort ud pr. kunde.
- **sekundære handlinger:** Nulstil filtre; link videre til Bookingopsætning
  (satser), til Kundepriser (pr.-kunde aftale), til Økonomi og til Ny
  forespørgsel.
- **data vist:** `kunder`-node (navn, aftale, prisgruppe, aftalestatus,
  omsætning, dækningsbidrag, aftalt/faktureret beløb) + `kpi.kunder`-domæne
  + `DEMO_TILBUD` (tilbud er hardkodet demo-data, ikke en rigtig node — se
  Implementation-status).
- **data der kan ændres:** INGEN. Skærmen skriver intet nogen steder — den er
  en ren lister-og-rapportér-skærm (bekræftet ved fravær af `gem()`/
  `kaldFunktion` i filen). Al skrivning af kundestamdata sker uden for denne
  dossiers scope (der findes ingen redigeringsformular for kundestamdata i
  de læste filer overhovedet — kun priser redigeres, på nabo-skærmene).
- **kommer typisk fra:** Opsætning-menuen, eller links fra fx dashboards.
- **går typisk til:** `/opsaetning/aftalepriser/:kundeId` (Kundepriser),
  `/booking/opsaetning` (satser/prisgrupper), `/oekonomi`.
- **overlap med anden side:** Deler `kunder`-noden med Kundepriser.jsx;
  "prisgruppe" vises her som filter men bærer ikke pris (se Mulige overlap).
- **status:** BUILT for læsning; der er intet skrivepunkt at vurdere som
  BUILT/PARTIAL — skærmen er per design en oversigt.
- **demo-data (ja/nej+note):** JA — `useListe("kunder", { demo: DEMO_KUNDER })`
  er standardmønsteret (falder kun tilbage i demoMode); `DEMO_TILBUD` derimod
  læses **direkte og ubetinget** (`[...DEMO_TILBUD].sort(...)`, ikke gennem
  `useListe`) fordi der slet ikke findes en `tilbud`-node endnu — knappen
  "Åbn" er eksplicit deaktiveret med begrundelsen "Tilbudsskærmen er ikke
  bygget — der findes ingen tilbudsnode endnu."
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift
  (kunderelation/salgsopfølgning) snarere end opsætning, men fysisk placeret
  under Opsætning-menuen som stamdata.

### Standardpriser
- **route:** `/opsaetning/priser` (nav-key `standardpriser`; legacy
  `/kunder/priser` redirecter hertil)
- **sidenavn:** "Standardpriser"
- **hvem bruger den:** Alle med `satser.laes` (disponent, koordinator,
  lagermedarbejder, casehandler, admin) kan SE; kun admin (`satser.skriv`)
  kan skrive. Kræver `kraeverPerm: "satser.laes"` og `kraeverModul: "kunder"`.
- **primært formål:** Definere den ene fælles prisliste for platformens
  ydelser (kørsel, passage, agent, ophold, lager, håndtering).
- **primær handling:** Sætte en ny pris for en ydelse fra en given dato.
- **sekundære handlinger:** Filtrere på kategori; åbne/lukke prishistorik pr.
  ydelse.
- **data vist:** `satser/standard/<ydelseId>/satser/<id>` (via `useListe`),
  krydset med `LAGERYDELSER`/`YDELSESKATEGORI` fra `pricing.js`, filtreret på
  tenantens moduler (`ydelserForModuler`).
- **data der kan ændres:** Ny prispost pr. ydelse (`gyldigFra`, `beloebOere`,
  `metode`, `valuta`) — ALDRIG en overskrivning af en eksisterende post
  (beslutning 7: ny post, gammel bliver stående).
  Skrives via `gem({ sti: path("satser/standard/.../satser/<nyId>"), flet: true, ...})`
  — reelt `skriv.js`-kald mod RTDB, med audit-logning
  (`objekt: "satser"`, `handling: AUDIT.opret`).
- **kommer typisk fra:** Opsætning-menuen.
- **går typisk til:** Ingen udgående navigation af betydning; historik åbnes
  inline.
- **overlap med anden side:** Samme `satser/standard`-node læses af
  Bookingopsætning (satsark for booking-priser), af Warehouses
  Afregning/Volumen (satsopslag for håndtering/lager) og af prismotoren
  (`pricing.js`) generelt — "ÉN opslagsvej for hele platformen".
- **status:** BUILT — reelt `useListe`-læsning og reelt `gem()`-skrivepunkt,
  bag en rigtig permission-gate (`satser.skriv`), med valideret input
  (`valideSats`).
- **demo-data (ja/nej+note):** `demo: []` (tomt array) — ingen demo-datasæt
  bruges for denne node; i demoMode ville skærmen simpelthen vise "ingen
  ydelser prissat" fremfor fiktive priser.
- **nødvendig for daglig drift eller admin/opsætning:** Admin/opsætning —
  klart en sjælden vedligeholdelsesopgave, ikke en daglig arbejdsgang.

### Kundepriser
- **route:** `/opsaetning/aftalepriser` (oversigt/kundevalg) og
  `/opsaetning/aftalepriser/:kundeId` (én kundes aftale)
- **sidenavn:** "Kundepriser"
- **hvem bruger den:** Samme læseadgang som Standardpriser (`satser.laes`);
  skrivning kræver BEGGE `kunder.skriv` OG `satser.skriv` samtidig —
  casehandler/disponent/koordinator har det første men ikke det andet, så
  kun admin kan reelt gemme en aftale i standard-rollepresettet.
- **primært formål:** Sætte den enkelte kundes prisafvigelse (egen pris ELLER
  rabat — aldrig begge) fra standardprislisten.
- **primær handling:** Vælge en kunde, sætte/opdatere en afvigelse pr. ydelse.
- **sekundære handlinger:** Skifte kunde via dropdown; åbne aftalehistorik pr.
  ydelse; se live forhåndsvisning af resultatprisen mens man udfylder
  formularen.
- **data vist:** `kunder/<id>/priser/<ydelseId>/satser/<id>` (afvigelser,
  liggende PÅ kundeposten) krydset mod `satser/standard`; resultatpris via
  `prisFor()`.
- **data der kan ændres:** Ny afvigelsespost (egen pris eller rabat, aldrig
  begge — håndhævet både i UI og i `valideKundesats()`), skrevet via
  `gem({ sti: path(kundeprisSti(...)), flet: true, ...})`. INGEN sletteknap
  findes bevidst (dokumenteret: `.validate` kan ikke forhindre en sletning i
  RTDB, så skærmen undgår at tilbyde vejen).
- **kommer typisk fra:** Kundeoversigten (link "Se og sæt aftalepriser for
  X"), eller direkte via Opsætning-menuen.
- **går typisk til:** Tilbage til `/opsaetning/kunder`; til
  `/opsaetning/priser` (standardprisen).
- **overlap med anden side:** Samme mønster/node-familie som Standardpriser;
  `kunde.prisgruppe` vises som ren info-linje ("bærer ikke længere en pris,
  kun et filter").
- **status:** BUILT — reelt `useListe`-læsning (kunder + standardpriser) og
  reelt `gem()`-skrivepunkt med to-permission-gate, valideret input, og
  live-forhåndsvisning der bruger den samme `prisFor()`-funktion som selve
  visningen (ingen dobbelt-regnestykke).
- **demo-data (ja/nej+note):** `DEMO_KUNDER` som `useListe`-faldbakke for
  kundelisten (standardmønster); `demo: []` for standardpriserne.
- **nødvendig for daglig drift eller admin/opsætning:** Admin/opsætning —
  aftaleforhandling er sjælden sammenlignet med daglig drift.

### Generelt
- **route:** `/opsaetning` (nav-key `generelt`)
- **sidenavn:** "Opsætning – generelt"
- **hvem bruger den:** Alle roller (ingen `kraeverPerm`/`kraeverModul` på
  punktet).
- **primært formål:** Vise hvad tenanten ER (id, moduler, lokationer, miljø)
  og pege videre til hvor stamdata faktisk vedligeholdes.
- **primær handling:** Ingen — dette er eksplicit en LÆSESKÆRM. Al skrivning
  er deaktiveret ("Redigér virksomhedsoplysninger"-knappen er `disabled`
  med begrundelsen "Ikke besluttet endnu").
- **sekundære handlinger:** Navigere videre via "hvor rettes stamdata"-tabel
  (links til Medarbejdere, Kompetencer, Enheder, Kunder, Bookingopsætning,
  Leverandører, Facility, Brugere & roller).
- **data vist:** `tenant`/`tenantId` fra `useFleet()`, aktive moduler
  (`ALLE_MODULER.filter(harModul)`), `facility/lokationer` (grupperet efter
  `STED`-katalog), miljø (`prod`/`dev`/`demo`), valgt periode.
- **data der kan ændres:** INTET. Ingen `gem()` eller `kaldFunktion` i filen.
- **kommer typisk fra:** Opsætning-menuens forsidepunkt.
- **går typisk til:** Medarbejdere, Kompetencer, Enheder, Kunder,
  Bookingopsætning, Leverandører, Facility, Brugere & roller.
- **overlap med anden side:** Ren henvisningsside — overlapper med intet
  funktionelt, men dens "hvor rettes stamdata"-tabel gør eksplicit
  Opsætnings grab-bag-natur synlig for brugeren.
- **status:** PARTIAL efter designs egen definition — "Opsætning → Generelt
  og Brugere & roller er bygget som LÆSESKÆRME: de viser kun hvad der findes,
  al skrivning er deaktiveret med en begrundelse" (CLAUDE.md, "Kendte
  huller"). Dette er en bevidst, dokumenteret tilstand — ikke en overset
  mangel.
- **demo-data (ja/nej+note):** JA — `DEMO_LOKATIONER` som `useListe`-faldbakke
  for `facility/lokationer` (standardmønster, kun i demoMode).
- **nødvendig for daglig drift eller admin/opsætning:** Admin/opsætning.

### Brugere & roller
- **route:** `/opsaetning/brugere` (nav-key `brugere`)
- **sidenavn:** "Brugere & roller"
- **hvem bruger den:** Alle kan se (læsning af egen `/opsaetning/brugere`
  side har ingen `kraeverPerm`); kun `brugere.skriv` (kun admin-presettet)
  kan oprette/redigere brugere, roller eller spærre logins.
- **primært formål:** Administrere logins (oprettelse, rolletildeling,
  spærring) og redigere HVAD en rolle indeholder (beslutning 31b).
- **primær handling:** Oprette et login; skifte en brugers rolle; spærre/åbne
  et login; redigere en rolles permission-sæt.
- **sekundære handlinger:** Se rolle-vs-permission matrix (9 udvalgte
  permissions); sætte pr.-bruger dashboardvisning (skjuler, spærrer ikke);
  se egne permissions/token-info.
- **data vist:** `brugere`-indeks (IKKE Firebase Auth direkte — Auth har
  ingen `listUsers` på klientsiden), `roller`-node (tenantens egne
  rolledefinitioner, falder tilbage på `ROLLE_PERMS`-standarden),
  `dashboardvisning`-node.
- **data der kan ændres:** Fire reelle handlinger, ALLE som Cloud Function-kald
  (ikke direkte RTDB-skrivning): opret bruger (`opretbruger`), skift rolle
  (`skiftrolle`), spær/åbn login (`spaerlogin`), redigér en rolles
  permissions (`rolleskriv`); plus én femte, `dashboardvisningskriv`
  (visningsindstilling, minter ingen claims).
- **kommer typisk fra:** Opsætning-menuen.
- **går typisk til:** Medarbejdere (for personer uden login).
- **overlap med anden side:** Deler rollebegrebet med hele
  `permissions.js`-håndhævelsen (alle 59 skærme); "Din rolle"-KPI-kort
  overlapper konceptuelt med brugervælgeren i dev-miljø.
- **status:** BUILT for de fem handlinger — hver er verificeret som en reel
  Cloud Function med Admin SDK-kald (se Implementation-status). Skærmen selv
  er dokumenteret som "bygget som LÆSESKÆRM" i én forstand (ingen direkte
  RTDB-skrivning fra klienten — al skrivning går via funktioner), men det er
  IKKE det samme som ikke-fungerende: funktionerne er verificeret virkende
  kode, ikke stubs.
- **demo-data (ja/nej+note):** `demo: []` for både `brugere`, `roller` og
  `dashboardvisning` — ingen fiktive brugere vises; i demoMode ses en tom
  liste med "Ingen brugere med login endnu."
- **nødvendig for daglig drift eller admin/opsætning:** Admin/opsætning.

### Integrationer
- **route:** `/opsaetning/integrationer` (nav-key `integrationer`)
- **sidenavn:** "Integrationer"
- **hvem bruger den:** Alle (ingen `kraeverPerm`/`kraeverModul`).
- **primært formål:** Vise hvilke eksterne systemer (kort, brændstofkort,
  regnskab, løn) der er forbundet.
- **primær handling:** Ingen — ren visning.
- **sekundære handlinger:** Ingen.
- **data vist:** `INTEGRATIONER`-konstant fra `fleet/integrationer.js` —
  **tom array, hardkodet**, ikke en RTDB-node og ikke gennem `useListe`.
- **data der kan ændres:** INTET.
- **kommer typisk fra:** Opsætning-menuen.
- **går typisk til:** Ingen udgående navigation.
- **overlap med anden side:** Ingen.
- **status:** MOCK/DEMO i den snævre forstand at data-kilden er en hardkodet
  JS-konstant og ikke en database-node — MEN dette er en bevidst,
  dokumenteret designbeslutning (beslutning 22), ikke en overset mangel:
  konstanten er eksplicit tom fordi INGEN integrationer er bygget endnu, og
  skærmen siger det rent ud ("FleetControl taler ikke med nogen fremmede
  systemer endnu") fremfor at vise placeholder-logoer med "kommer snart".
  Der findes ingen RTDB-node `integrationer` at læse fra endnu overhovedet.
- **demo-data (ja/nej+note):** Nej — det er ikke et demo-datasæt der bruges i
  stedet for rigtig data; det er den ENESTE datakilde, og den er tom med
  vilje.
- **nødvendig for daglig drift eller admin/opsætning:** Admin/opsætning
  (ville være det, hvis noget var bygget).

---

## Data-entiteter

| Entitet | RTDB-node(r) | Ejes af (jf. NODE_MODUL) | Bruges også af | Kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| Kunde | `kunder`, `sensitive/kunder` | `kunder` | `booking` (påkrævet `kundeId`), `warehouse` (påkrævet `kundeId`), Kundepriser (afvigelser ligger PÅ kundeposten) | `kunder` ejes alene af modulet `kunder`; ingen anden node deler den. `sensitive/kunder` er den klassificerede satellit (kræver `kunderSensitiveLaes`). |
| Prisgruppe/standardpris | `satser/standard/<ydelseId>/satser/<id>` | Base-node (`satser` ejes ikke af ét modul — "prisgrupper hører til Kunder, kalkulationsprisen til Booking", jf. moduler.js) | Warehouse (Afregning/Volumen), Bookingopsætning, prismotoren (`pricing.js`) generelt | `satser` står bevidst uden for `NODE_MODUL`-tabellen fordi flere moduler læser den; adgang styres i stedet af permissions (`satserLaes`/`satserSkriv`), ikke af modulklausul. |
| Kundepris/aftale (afvigelse) | `kunder/<kundeId>/priser/<ydelseId>/satser/<id>` | `kunder` (ligger under kunde-noden) | Kundepriser.jsx, prismotoren via `prisFor()` | Ligger PÅ kunden af bekvemmelighed men er reelt et regnskabsobjekt — logges i audit som `objekt: "satser"`, ikke som `kunder`, netop for at få samme retention som satser. `.validate`-kravet om `satser.skriv` er lagt ind separat, fordi `.write` på `kunder` kaskaderer og ellers ville tillade flere roller at sætte priser end der har `satser.skriv`. |
| Bruger (login) | `brugere/<uid>` (indeks) + Firebase Auth (ægte kilde) | Base-node, ingen modulklausul | Alle 59 skærme indirekte via `auth.token.perms` | `brugere/`-noden er et INDEKS skrevet af Cloud Functions samtidig med Auth-kaldet — IKKE selve sandheden. Auth er sandheden; indekset findes kun fordi klienten ikke kan liste Auth-brugere direkte. |
| Rolle | `roller/<rolle>/perms` | Base-node, `.write: false` | Alle regelfiler indirekte (claims mintes herfra) | Kilde, ALDRIG et håndhævelsespunkt — `firebase.rules.json` læser aldrig `roller/`; adgang afgøres udelukkende af `auth.token.perms`. Mangler noden, falder man tilbage på `ROLLE_PERMS`-standarden i kode (beslutning 31b). |
| Integration | Ingen node — hardkodet `INTEGRATIONER`-array i `fleet/integrationer.js` | Ingen (findes ikke i databasen) | Kun Integrationer.jsx | Bevidst: der findes ingen database-repræsentation, fordi der endnu ikke findes noget at gemme (beslutning 22). |

---

## Implementation-status

**Kundekartotek (Kunder.jsx):** BUILT som oversigt/rapportering (reel
`useListe("kunder", ...)`-læsning, reelt KPI-domæne). INGEN redigering af
kundestamdata findes i de læste filer — hverken opret, ret eller slet kunde.
Om en sådan formular findes andetsteds i kodebasen kunne ikke fastslås inden
for denne dossiers scope (kun de angivne filer blev læst) — **IKKE PÅVIST**.

**To-lags prisstruktur (standardpris + kundeafvigelse):** BUILT
end-to-end. Standardprisen (`Standardpriser.jsx`) og kundeafvigelsen
(`Kundepriser.jsx`) deler samme underliggende mekanik i `pricing.js`
(`satsOpslag`, `prisFor`, `valideSats`/`valideKundesats`), begge skriver via
`gem()` til RTDB med `flet: true` og aldrig med overskrivning (hver rettelse
er en ny post med sin egen `gyldigFra`, jf. beslutning 7). Ingen kendte
blokkere — dette er et af de mest fuldt gennemførte skriveflows i den læste
kode: valideret input, permission-gates, live-forhåndsvisning der bruger
samme regnefunktion som selve visningen, og eksplicit håndtering af "ingen
sats"-tilfælde (viser "mangler" fremfor 0 kr.).

**Brugeroprettelse/rolletildeling via Cloud Function:** BUILT og verificeret.
`functions/index.js` indeholder reelle Admin SDK-kald: `auth.createUser(...)`
(linje 388), `auth.setCustomUserClaims(...)` (linjer 399, 437, 570),
`auth.revokeRefreshTokens(...)` (linjer 446, 577, 673). De fem callable
funktioner der eksporteres og bruges fra Brugere.jsx er alle til stede:
`opretbruger` (416), `skiftrolle` (422), `rolleskriv` (482),
`dashboardvisningskriv` (613), `spaerlogin` (655). Klientkoden i
`brugere.js` bekræfter at ALLE skrivninger går gennem disse funktioner —
ingen direkte RTDB-skrivning til `brugere/`, `roller/` eller Auth findes i
klientkoden. Kendt begrænsning (dokumenteret, ikke skjult): der findes ingen
måde at invitere en bruger via e-mail på — adgangskoden vises kun én gang på
skærmen og skal gives videre manuelt af administratoren; "Hvordan en bruger
SKAL inviteres" står stadig som et åbent spørgsmål i projektets
spørgsmålsliste.

**Rolleredigering "brugeren kan redigere sine roller" (beslutning 31b):**
BUILT. Rolle-editoren i Brugere.jsx bruger `laaserUde()` (fra
`permissions.js`, en DELT fil mellem klient og Cloud Function) til at vise
spærringen FØR man forsøger at gemme, og den samme funktion håndhæves
server-side i `rolleskriv`. To beskyttelser er verificeret i kode: (1)
`brugere.skriv` (NOEGLEPERM) kan ikke fjernes fra den sidste rolle der har
den, og (2) kan ikke fjernes fra ens egen rolle. Svaret fra `rolleskriv`
bærer `{ ramte, fornyet, fejlede }` så en delvist mislykket claims-fornyelse
er synlig i UI (ikke skjult som en generel succes).

**Integrationer mod kort/brændstofkort/regnskab/løn:** IKKE BYGGET —
bekræftet direkte i kildekoden. `INTEGRATIONER`-arrayet i
`fleet/integrationer.js` er tomt (`export const INTEGRATIONER = [];`), og
kommentaren i filen siger eksplicit: "Listen herunder er tom, og det er det
ærlige indhold: der er ingen integrationer bygget." Dette er ikke et
placeholder/toggle-UI der lader som om noget virker — der er ingen
API-nøglefelt, ingen "forbind"-knap, ingen logoer. Skærmen viser en tom
tilstand med forklaring og henviser eksplicit til at "vejkortet" for fremtidige
integrationer findes i projektdokumentation (README/FleetControl-spoergsmaal.md),
ikke på denne kundevendte skærm. Konklusion: hverken reelle API-forbindelser
eller reelle placeholders/toggles findes — kun et bevidst tomt, ærligt UI.

**Usable end-to-end:** Standardpriser og Kundepriser: JA. Brugeradministration:
JA (alle fem handlinger). Generelt: JA som visning (per design ingen
skrivning). Integrationer: N/A (intet at bruge). Kunder.jsx: JA som
rapportering, men ingen kundestamdata-redigering er påvist i det læste kodeomfang.

---

## Workflow-observationer

Dette modulpar er næsten udelukkende administrativ stamdata frem for en
arbejdsgang med egne tilstande/overgange. De væsentligste afhængigheder ud i
resten af systemet:

- **Booking kræver `kunder`.** `MODUL_KRAEVER: { booking: ["kunder"] }` — en
  kunde uden modulet `kunder` kan ikke oprette én eneste booking, fordi
  `bookinger` har et påkrævet `kundeId` der peger på en node kunden ikke har
  adgang til. Sælges Planning uden Kunder, afviser reglen enhver skrivning.
- **Warehouse kræver `kunder`** af samme grund (`varer`, `enheder`,
  `plukordrer` har alle påkrævet `kundeId`).
- **Booking/prismotoren læser standardpriser og kundeafvigelser** for at
  regne et estimat (`beregnBooking`/`beregnForloeb` i `pricing.js` går
  gennem samme `satsOpslag`-funktion).
- **Warehouses Afregning og Volumen** slår op i `satser/standard` for at
  prissætte håndtering ind/ud/opbevaring — bekræftet i `permissions.js`s
  begrundelse for hvorfor `lagermedarbejder`-rollen har `satserLaes`.
- **Alle 59 skærme afhænger indirekte af Brugere & roller**, fordi
  `auth.token.perms` (mintet af `opretbruger`/`skiftrolle`/`rolleskriv`) er
  den eneste mekanisme `firebase.rules.json` håndhæver adgang efter.
- **Generelt-skærmens "hvor rettes stamdata"-tabel** er selv en form for
  workflow-styring — den fungerer som et opslagsværk for "hvor gør jeg X",
  hvilket antyder at Opsætning-menuens spredning af stamdata på tværs af
  moduler (Enheder, Medarbejdere, Kunder, osv.) er en erkendt navigationsudfordring.

---

## UI-mønstre

- **Layout:** Gennemgående `<div className="fc-grid" style={{ gap: 16 }}>`
  som topcontainer på alle seks skærme.
- **KPI-rækker:** `<KpiRaekke>` med `<KpiKort>` (ikon, tone, label, værdi,
  valgfri afvigelse/note/link) — samme komponent bruges konsekvent på tværs
  af Kunder.jsx, Standardpriser.jsx, Kundepriser.jsx, Generelt.jsx, Brugere.jsx.
- **Tabeller:** `<Tabel kolonner={...} raekker={...} tom="..."/>`-mønster
  overalt, med `render`-funktioner pr. kolonne. Statusfarver via `<Pille
  tone="ok|warn|bad|info"/>`.
- **Formularer:** `<Formular onGem={...} kanGemme={...} gemLabel="..."
  onAnnuller={...} svar={...}>` med `<Feltraekke>`/`<Felt>`-komponenter,
  konsekvent brugt i Prisformular, Afvigelsesformular, Opretformular og
  Rolleeditor.
- **Fejl/tilstand:** `<Datatilstand tilstand={...} genprov={...}/>` og
  `<Henter hvad="..."/>` bruges konsekvent til loading/fejl-tilstande —
  aldrig en skærmspecifik fejltekst.
- **Terminologi:** Konsekvent dansk domænesprog ("standardpris",
  "kundeafvigelse", "gyldigFra", "rolle", "permission" (engelsk låneord,
  bevidst — katalogets nøgler er engelske strenge)).
- **Knap-mønster:** `<Knap variant="primaer" disabled={...} title="...">` —
  deaktiverede knapper bærer ALTID en forklarende `title`, aldrig en stum
  gråtone (fx "Kræver satser.skriv — reglerne afviser." i Standardpriser.jsx).
- **Inkonsistens fra Opsætnings grab-bag-natur:** Opsætning-menuen blander
  fire konceptuelt urelaterede stamdata-domæner (Enheder=Fleet,
  Kasseliste=Unitbooking, Medarbejdere=Bemanding, Kunder/Priser=egen modul)
  med de to egentlige opsætnings-skærme (Brugere & roller, Integrationer) og
  Generelt. Dette er eksplicit erkendt og forklaret i kildekoden selv
  (kommentarer i nav.js og Generelt.jsx), ikke et overset problem — men det
  betyder at "Opsætning" i UI ikke er ét sammenhængende modul, men en
  navigationssamling af stamdata fra flere moduler plus de to reelle
  opsætnings-emner. Ingen visuel/interaktionsmæssig inkonsistens blev fundet
  mellem skærmene i sig selv — alle seks følger samme komponentbibliotek og
  layoutmønster.

---

## Mulige overlap

- **Site A:** Kunder.jsx (`kunde.prisgruppe`, brugt som filter).
  **Suspected Site B:** Kundepriser.jsx (viser `kunde.prisgruppe` som en
  ren info-linje: "bærer ikke en pris, kun et filter").
  **Why:** Feltet hedder stadig "prisgruppe" og kunne let læses som om det
  stadig bar en pris (dets historiske funktion, jf. PRISER.md 4.1-kommentarer
  i koden), mens den faktiske prislogik nu udelukkende er
  standard+kundeafvigelse. Begge skærme har kode-kommentarer der advarer
  mod netop denne forveksling.
  **Risk:** Lav teknisk risiko (koden håndterer det korrekt begge steder),
  men reel UX-forvekslingsrisiko for en bruger der ikke læser hint-teksterne.

- **Site A:** Kunder.jsx's "Tilbud der kræver opfølgning"-kort (læser
  `DEMO_TILBUD` ubetinget, uafhængigt af demoMode).
  **Suspected Site B:** Booking → "Ny forespørgsel" (`/booking/ny`), som
  tilbudskortets "Åbn"-knap ville logisk føre til, hvis den var aktiv.
  **Why:** Der findes ingen `tilbud`-node i datamodellen endnu; skærmen
  viser fast demo-indhold som en slags "sådan ville det se ud"-forhåndsvisning
  fremfor rigtig data — det er den eneste komponent i denne dossiers scope
  der viser demo-data OGSÅ i en produktions-forbundet tilstand (i modsætning
  til det almindelige `useListe(..., {demo: X})`-mønster som kun rammer i
  demoMode).
  **Risk:** Lav (knappen er tydeligt deaktiveret med forklaring), men værd
  at bemærke som afvigelse fra platformens ellers konsekvente
  demo-data-disciplin (jf. CLAUDE.md's gentagne advarsler mod netop dette
  mønster — "Vise et demo-datasæt for en node der ER seedet" — omvendt her:
  et demo-datasæt for en node der slet IKKE findes endnu, hvilket er en
  anden og mindre alvorlig situation, men stadig værd at flagge).

- **Site A:** Integrationer.jsx (tomt, ingen data).
  **Suspected Site B:** Ingen konkret B — men konceptuelt overlapper
  "Integrationer" med fremtidige planer nævnt andre steder i kodekommentarer
  (fx tachografdata nævnt i CLAUDE.md ifm. `tjekKoerehviletid()`s forbehold,
  og regnskabseksport-adaptere i `grundlagseksport.js` for e-conomic/Dinero/
  Business Central — som IKKE er "integrationer" i denne skærms forstand,
  men filbaserede eksportformater).
  **Why:** `grundlagseksport.js` (nævnt i CLAUDE.md) producerer
  eksportfiler til regnskabssystemer — det er tættere på en "integration"
  end noget der står i `INTEGRATIONER`-arrayet, men vises slet ikke på
  Integrationer-skærmen.
  **Risk:** Lav/informativ — ingen funktionel fejl, men en begrebsmæssig
  gråzone mellem "fileksport" og "integration" som en ekstern auditør kan
  finde værd at afklare med produktejeren. **IKKE PÅVIST** om
  `grundlagseksport.js` var i denne dossiers læste scope i tilstrækkelig
  detalje til at afgøre — filen blev kun set omtalt i CLAUDE.md, ikke læst
  direkte i denne gennemgang.
