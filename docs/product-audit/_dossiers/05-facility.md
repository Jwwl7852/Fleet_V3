# Dossier 05 — Facility

Kilder læst: `src/moduler/facility/Oversigt.jsx`,
`src/moduler/facility/Servicekalender.jsx`, `src/moduler/facility/Klima.jsx`,
`src/moduler/facility/Servicedialog.jsx`, `src/fleet/facility.js`,
`src/fleet/nav.js` (facility-grenen), `src/fleet/moduler.js` (`MODUL`,
`NODE_MODUL`, `MODUL_KRAEVER`, `modulerFor()`), `src/fleet/permissions.js`
(`PERM.facilitySkriv`, `ROLLE_PERMS`, `ROLLE_LABEL`), `src/fleet/opgaveplan.js`
(`planlaegFacilityopgave`, `valideFacilityopgave`, `PLANLAEGBAR_STATUS`),
`src/fleet/Modulfakturaer.jsx`, `firebase.rules.json` (facility-blokken,
`opgaver`, `fakturaer`), samt stikprøve i `functions/index.js` for
`facilityplanlaeg`.

---

## Modul-resumé

**navn:** Facility (bygninger, anlæg, klima og servicekalender).

**formål:** Registrere og overvåge virksomhedens egne bygninger og
tekniske anlæg (porte, køl/ventilation, vaskehal, ladestandere, alarm,
truckoplader) — fejlmelding, planlægning af eksterne/interne servicebesøg,
klima- og energiovervågning. Ejer INGEN kunderelateret data: "Facility er
fælles" gentages i alle fire filer — porten er den samme uanset om Gods- eller
Busdivisionen kører igennem den.

**primær brugertype:** Ingen særskilt facility-rolle findes i de syv faste
roller. Skrivning (`facility.skriv`, samt `opgaver.skriv` for servicebesøg)
ligger hos **casehandler, disponent, koordinator og admin** (alle arver
`BASIS_DATA` i `permissions.js`). **Lagermedarbejder, chauffør og revisor har
ikke facility.skriv/opgaver.skriv** — de kan læse (facility har ingen
`facilityLaes`-permission, så læsning følger blot modul + tenant-medlemskab),
men ikke melde fejl eller planlægge service. Der er ingen "facility manager"
eller "vicevært"-rolle i kataloget.

**vigtigste opgave:** Vide om en bygning eller et anlæg er driftsklart, melde
og følge fejl, booke tid hos eksterne leverandører uden dobbeltbooking af
samme fysiske rum, og dokumentere klima/energi.

**vigtigste funktioner:**
- Fejlmelding pr. anlæg med alvorsgrad (`hoej`/`mellem`/`lav`), som en person
  vælger — ikke systemet udleder.
- Afledt lokationsstatus (Normal/Advarsel/Kritisk) beregnet af anlæg + åbne
  fejl + klimaalarmer, aldrig gemt som felt.
- Servicekalender (delt gitterkomponent med Fleets Driftskalender og
  Disponering) der binder enten et enkelt anlæg eller hele lokationen.
- Klimaovervågning pr. zone med afledt alarm (grænse på zonen, måling på
  sensoren) og gennemsnit PR. zoneart (aldrig ét samlet gennemsnit).
- Bygningsomkostninger: fem navngivne komponenter (el, varme, vand,
  ventilation, alarm), to afledte totaler (el&varme, hele bygningen) — ingen
  af totalerne gemmes.
- Fakturavisning (samme delte `fakturaer/`-node som Fakturacenter/Procure,
  filtreret på `destinationArt: "facility"`).

**undermoduler:** Overblik & fejl (`/facility`), Servicekalender
(`/facility/servicekalender`), Klima & energi (`/facility/klima`).
Servicedialog er en dialog/formular inde i Servicekalender, ikke en egen rute.

**afhænger af (andre moduler):** `MODUL_KRAEVER` nævner ikke `facility` —
formelt kræver Facility intet andet modul. Funktionelt læser skærmene:
`personale` (base, ansvarlig-vælger, med fallback til demo-sæt), `opgaver`
(base, delt med Fleet via `art`-feltet), `leverandoerer` (ejet af `indkoeb`,
filtreret på `kategori: "facility"`), `reservationer` (base, fjerde kilde),
`fakturaer` (base, filtreret på `destinationArt: "facility"`). Ingen af disse
er formaliseret i `MODUL_KRAEVER`, så en kunde kan i princippet have Facility
uden Procure — leverandørvælgeren viser da bare en tom liste.

**afhænges af (hvem læser dette modul):** `facility/aktiver` læses af
Fakturacenter (matchsignal "anlægget på fakturaen", jf. dossier 01).
`opgaver` med `art: "facility"` læses af Modulfakturaer (sagsnavn på
fakturalinjer) og af Fakturacenter. Ingen andet modul kræver Facility formelt.

**samlet status:** BLANDET/overvejende BUILT for kerneflowet
(fejlmelding, anlægskartotek, klimaovervågning, servicebesøg-planlægning med
ægte reservationskonflikt-kontrol via Cloud Function), men **energi-/
bygningsomkostningerne (el, varme, vand, ventilation, alarm) har ingen
fundet skrivevej i UI'et** — kun læsning (se Implementation-status) — og
**leverandørkommunikation er ren visning, ingen udgående mail** (eksplicit
kommenteret som "fase 0" af beslutning 20).

**overlap-mistanke:** Servicekalenderen deler bogstaveligt den samme
gitterkomponent (`Gitterkalender.jsx`) og til dels den samme node (`opgaver`,
art-filtreret) som Fleets Driftskalender/Værkstedskalender og Disponering.
Se "Mulige overlap".

---

## Skærme

### Overblik & fejl (`/facility`)
- **route:** `/facility` (nav-key `facilityOversigt`)
- **sidenavn:** "Overblik & fejl" (menu) / titel "Facility – overblik, fejl &
  klima"
- **hvem bruger den:** Alle med adgang til Facility-modulet (læsning
  u-gatet på permission); skrivehandlinger (nyt anlæg, meld fejl) kræver
  `facility.skriv` → casehandler/disponent/koordinator/admin.
- **primært formål:** Ét samlet driftsbillede: hvilke lokationer/anlæg er i
  orden, hvilke fejl er åbne, hvordan ser klimaet ud lige nu.
- **primær handling:** Klikke en lokation for at se dens driftsforhold i
  højre kort; "Nyt anlæg" / "Meld fejl".
- **sekundære handlinger:** Redigere et eksisterende anlæg (klik i
  aktivtabellen — indirekte, via `setAktivform(id)`), paginering af
  aktivtabellen, links videre til Servicekalender og Klima.
- **data vist:** KPI-række (aktiver i drift, servicepunkter forfalder, åbne
  facility-sager, planlagt vedligehold — alle fra `kpi.facility`), lokations-
  liste med afledt status, aktivfordelings-donut (fra `kpi.facility.aktiverPrArt`,
  højst 5 slices + "Øvrige"), driftsforhold-kort for valgt lokation
  (koldeste zone, port-/ventilationsstatus, aktive klimaalarmer — alt afledt
  af rådata, intet af det er en gemt "kapacitets"-måling), aktivtabel med
  næste service + afledt estimeret omkostning (fra næste planlagte
  servicebesøg, aldrig et felt på anlægget), åbne-fejl-tabel, "Klima nu"-
  ministatus pr. zone, Modulfakturaer-kort nederst.
- **data der kan ændres:** Anlæg (`facility/aktiver/<id>`, via
  `gem()`/`byggAktiv()`/`valideAktiv()`), fejl (`facility/fejl/<id>`, via
  `gem()`/`byggFejl()`/`valideFejl()`). Ingen ⋮-menu bevidst udeladt — koden
  siger eksplicit at "skrivning [af slet/andet] ikke er bygget".
- **kommer typisk fra:** `useKpi()` (kpi.facility), `useListe` på
  `facility/lokationer`, `facility/aktiver`, `facility/fejl`,
  `facility/zoner`, `facility/sensorer`, samt `personale` (fallback til
  `DEMO_PERSONALE`).
- **går typisk til:** Links til `/facility/servicekalender` og
  `/facility/klima`; `gem()`-skrivninger til `tenants/<id>/facility/aktiver`
  og `.../fejl` (direkte RTDB-skrivning gennem `skriv.js`, ikke en Cloud
  Function — modsat servicebesøget).
- **overlap med anden side:** "Klima nu"-kortet viser nøjagtig samme
  `zonePar()`-udtræk som Klima-skærmen (bevidst, kommenteret eksplicit som en
  rettet mockup-fejl — de to skærme viste før forskellige temperaturer for
  samme zoner). "Estimeret omkostning" i aktivtabellen overlapper
  begrebsmæssigt med Servicekalenderens "Anslået omkostning"-KPI.
- **status:** BUILT for anlægs- og fejlregistrering (ægte
  `useListe`-læsning + ægte `gem()`-skrivning direkte til RTDB, klientside
  validering spejler `firebase.rules.json`). KPI-rækken og aktivfordelingen
  er PARTIAL i praksis der hvor `kpi.facility.*`-felter ikke er aggregeret
  hos en given tenant (skærmen håndterer det korrekt: "ikke aggregeret" i
  stedet for et falsk nul).
- **demo-data (ja/nej+note):** JA, som ren `useListe(..., {demo: ...})`-
  fallback for `personale`; **aktiv-/lokations-/fejl-nodernes egne
  `useListe`-kald har INGEN `demo:`-parameter** (kun `estimatForAktiv()`
  bruger `DEMO_SERVICEBESOEG` som opslagstabel for estimatet, hvilket er en
  reel afhængighed af demo-data selv i produktion — se Implementation-status).
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift.

### Servicekalender (`/facility/servicekalender`)
- **route:** `/facility/servicekalender` (nav-key `servicekalender`)
- **sidenavn:** "Servicekalender"
- **hvem bruger den:** Samme adgangsmønster som Overblik; planlægning kræver
  `opgaver.skriv` (bemærk: IKKE `facility.skriv` — se "⚠ Facilityopgave
  spørger opgaver.skriv" i koden), altså casehandler/disponent/koordinator/
  admin igen (samme fire via `BASIS_DATA`), plus dem der har `opgaver.skriv`
  af andre veje.
- **primært formål:** Booke/reservere tid til servicebesøg (internt personale
  eller ekstern leverandør) på et anlæg eller en hel lokation, uden at
  overbooke det fysiske rum.
- **primær handling:** Trække-og-slippe et besøg i gitteret, eller klikke et
  ledigt felt / "Planlæg service"-knappen for at åbne Servicedialog.
- **sekundære handlinger:** Vælge et besøg i tabellen for at se dets
  "Reservationen der ville blive skrevet"-panel, statusskifte
  (`Statusskifte.jsx`, delt komponent), navigation til flåde-sagsvisning.
- **data vist:** KPI-række (planlagte besøg, eksterne leverandører,
  reserveret fra sager, anslået omkostning), gitterkalender (10-dages vindue,
  rækker = lokationer/anlæg der har mindst ét besøg i vinduet, "skygger" for
  indesluttede ressourcer — en lukket hal skygger sine egne porte), tabel over
  alle facility-opgaver med status og estimat, reservationspanel med
  ressourcetype/-id/kilde/prioritet.
- **data der kan ændres:** Nye servicebesøg (via `Servicedialog` →
  `planlaegFacilityopgave()` → Cloud Function `facilityplanlaeg`), flytning
  af eksisterende besøg (træk i gitter → `flytOpgave()` → Cloud Function
  `opgaveflyt`), statusskifte (`Statusskifte.jsx` → `opgavestatus`).
  **Skærmen opretter ikke direkte** — al skrivning går gennem navngivne
  Cloud Functions, ikke `skriv.js`/`gem()` som Overblik-skærmen.
- **kommer typisk fra:** `facility/lokationer`, `facility/aktiver`,
  `leverandoerer` (alle med `demo:`-fallback), samt `opgaver` (base-node,
  delt med Fleet, filtreret client-side på `art === "facility"`, også med
  `demo:`-fallback).
- **går typisk til:** Cloud Functions `facilityplanlaeg`/`opgaveflyt`/
  `opgavestatus` (RTDB-skrivning server-side, atomisk med reservationen).
- **overlap med anden side:** Deler `Gitterkalender.jsx`-komponenten med
  Fleets Driftskalender, Værkstedskalender og Disponering (samme
  regnestykke i `gitter.js`, forskellig `raekker`/`blokke`-datakilde). Deler
  også selve `opgaver`-noden med Fleets Værkstedskalender (samme node, filtreret
  på `art`). Se "Mulige overlap".
- **status:** BUILT. Planlægning, flytning og statusskifte går alle gennem
  ægte Cloud Functions (`facilityplanlaeg`, `opgaveflyt`, `opgavestatus`,
  bekræftet i `functions/index.js` linje ~3586 ff.), som skriver opgaven OG
  dens reservation atomisk og håndhæver "hallen og porten er ét rum"
  (`indeslutninger()`/`tjekLedigIndesluttet()`). Klienten kan IKKE oprette en
  facility-opgave uden om funktionen (`opgaver` er `.write: false` for alle).
- **demo-data (ja/nej+note):** JA, ren offline-fallback for alle fire
  `useListe()`-kald (`DEMO_LOKATIONER`, `DEMO_AKTIVER`, `DEMO_LEVERANDOERER`,
  `DEMO_OPGAVER`) — ikke vist når Firebase er tilgængelig. Koden dokumenterer
  eksplicit en tidligere fejl hvor skærmen viste et helt andet, hardkodet
  demosæt (`DEMO_SERVICEBESOEG`) end det noden faktisk indeholdt — rettet.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift.

### Klima & energi (`/facility/klima`)
- **route:** `/facility/klima` (nav-key `klima`)
- **sidenavn:** "Klima & energi"
- **hvem bruger den:** Samme læseadgang som resten af modulet. Skærmen har
  **ingen skrivehandling overhovedet** — hverken knap, formular eller
  `gem()`-kald findes i filen.
- **primært formål:** Overvåge temperatur/fugt pr. zone og se
  bygningsomkostninger (el, varme, vand, ventilation, alarm) for indeværende
  måned.
- **primær handling:** Ingen interaktiv primær handling — ren visning.
- **sekundære handlinger:** Ingen (link tilbage til Overblik via zone-note).
- **data vist:** KPI-række (aktive sensorer, klimaalarmer nu [beregnet],
  klimaalarmer i dag [fra `kpi.facility`], el & varme denne måned), zonetabel
  (temperatur, grænse, fugt, målt-tidspunkt, afledt alarmstatus), gennemsnit
  PR. zoneart (aldrig ét samlet tal), bygningsomkostninger pr. komponent +
  to afledte totaler, søjlegraf "Forbrug pr. post".
- **data der kan ændres:** Intet fra denne skærm.
- **kommer typisk fra:** `facility/zoner`, `facility/sensorer` (samme
  `zonePar()`-funktion og samme to noder som Overblik), `facility/omkostning`
  (via `usePost("facility","omkostning")` — et navngivet objekt, ikke en
  liste).
- **går typisk til:** Ingen udgående skrivning. Link til `/facility`
  (Overblik) i en hint-tekst.
- **overlap med anden side:** Zonetabellen og "Klima nu" på Overblik er
  bevidst ÉT datasæt vist to steder.
- **status:** BUILT for LÆSNING (ægte `useListe`/`usePost`-læsning, ingen
  demo-fallback overhovedet på nogen af de tre kilder — hvis Firebase
  mangler, læser `useListe`/`usePost` internt fra deres respektive
  demo-moduler, men skærmen selv sender intet `demo:`-flag). **MOCK/hul for
  SKRIVNING af bygningsomkostninger:** `firebase.rules.json` har en fuld
  `.write`-regel for `facility/omkostning/$post` (kræver `facility.skriv`),
  men der findes **ingen skærm i `src/moduler/` (facility eller andet) der
  skriver til noden** — hverken en formular her eller andetsteds blev
  fundet. Tallene må enten stamme fra provisionering/seed eller fra en
  admin-vej der ikke er en del af dette moduls filsæt.
- **demo-data (ja/nej+note):** NEJ direkte i skærmen (ingen `demo:`-parameter
  på de tre `useListe`/`usePost`-kald) — demo-fallback ligger internt i
  `useListe`/`usePost`, uden for denne fils kontrol.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift
  (overvågning), men opsætning/opdatering af energitallene har intet synligt
  administrationssted.

### Servicedialog (dialog inde i Servicekalender, ingen egen route)
- **route:** Ingen — monteret betinget (`{planlaegger && <Servicedialog .../>}`)
  inde i `Servicekalender.jsx`, ikke i `nav.js`/`App.jsx`.
- **sidenavn:** "Planlæg service" (dialogtitel)
- **hvem bruger den:** Samme som Servicekalender, betinget af `opgaver.skriv`.
- **primært formål:** Oprette ét nyt servicebesøg — enten på ét anlæg eller
  på en hel lokation (ét felt, "enten-eller" bygget ind i vælgeren, ikke to
  felter der begge kunne udfyldes).
- **primær handling:** Udfylde ressource, dato/tid, varighed, beskrivelse →
  "Planlæg service".
- **sekundære handlinger:** Vælge leverandør (filtreret på
  `kategori: "facility"`) eller "Eget personale"; vælge prioritet
  ("Ikke vurderet" er en gyldig, meningsfuld værdi — ikke en mangel).
- **data vist:** Live-udkast af den reservation der ville blive skrevet
  (spærringsperiode for det valgte anlæg/lokation), feltfejl.
- **data der kan ændres:** Opretter en ny opgave (`art: "facility"`, sat af
  SERVEREN, ikke klienten) via `planlaegFacilityopgave()`.
- **kommer typisk fra:** Props sendt ned fra `Servicekalender.jsx`
  (`aktiver`, `lokationer`, `leverandoerer`) — henter intet selv.
- **går typisk til:** Cloud Function `facilityplanlaeg`.
- **overlap med anden side:** Bevidst IKKE delt med Fleets tilsvarende
  `Planlaegdialog.jsx` — koden begrunder eksplicit hvorfor (andet feltskema:
  ingen enhed, ingen arbejdstype, ressource er anlæg-ELLER-lokation).
  Delt valideringslogik ligger i `opgaveplan-regler.js`.
- **status:** BUILT. Ægte server-skrivning via `facilityplanlaeg` (bekræftet
  i `functions/index.js`), klientvalidering (`valideFacilityopgave()`)
  spejler serverens regler. **Ingen mail sendes** — kommentaren i filens hoved
  siger eksplicit "INGEN MAIL. Samme som Planlaegdialog: beslutning 20 er
  fase 0."
- **demo-data (ja/nej+note):** Ingen egen `useListe`; arver hvad
  Servicekalender sender ned. I demo-tilstand fejler `planlaegFacilityopgave()`
  synligt med "Demo-tilstand: der er ingen server, så intet blev gemt." —
  det er en ærlig fejlmelding, ikke en stille demo-skrivning.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift.

---

## Data-entiteter

| entity | RTDB-node(r) | ejes af (jf. NODE_MODUL) | bruges også af | kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| Lokation | `facility/lokationer` | Facility (`facility`, arvet af barnet) | Ingen andet modul direkte; navn slås op af Fakturacenter/opgave-visninger | Reserverbar ressourcetype `lokation` i `RESSOURCE`. `sted` er fritekst, ikke enum (multi-tenant, intet katalog). |
| Anlæg (aktiv) | `facility/aktiver` | Facility | Fakturacenter (matchsignal "anlæg på fakturaen") | Reserverbar ressourcetype `facilityAktiv`. `art` (udstyrstype) er IKKE `opgave.art` — samme feltnavn, to vokabularer, dokumenteret eksplicit for at forhindre sammenblanding. |
| Zone | `facility/zoner` | Facility | Kun Facility selv (Overblik + Klima) | Bærer temperaturgrænserne. Regel håndhæver `minC < maksC` — en byttet grænse ville aldrig alarmere, "den værste fejltilstand". |
| Sensor/måling | `facility/sensorer` | Facility | Kun Facility selv | Nøglet på ZONEN (ikke sensor-id) — én måling ad gangen pr. zone. `graenser` er eksplicit `.validate: false` her — grænsen må kun leve på zonen. |
| Fejl | `facility/fejl` | Facility | Fakturacenter (indirekte, via anlægsreferencen) | `alvor` er et MENNESKELIGT valg (aldrig udledt); `status` fire trin (ny/planlagt/igang/udbedret). Fritekst i `beskrivelse` er eksplicit UDELUKKET fra auditloggen. |
| Bygningsomkostning | `facility/omkostning` | Facility | Kun Klima-skærmen (læsning) | Fem navngivne komponenter (`el`,`varme`,`vand`,`ventilation`,`alarm`), øre som heltal. Reglen tillader skrivning med `facility.skriv`, men **ingen fundet UI-vej skriver til den** — se Implementation-status. |
| Servicebesøg (facility-opgave) | `opgaver` (base, filtreret `art === "facility"`) | Ingen ejer alene ("fire tvetydige noder") — Facility og Fleet deler noden via `art` | Fakturacenter, Modulfakturaer, Fleets Værkstedskalender/Driftskalender (de to arter deler samme node) | Bevidst IKKE i `NODE_MODUL`; klienten kan ikke skrive den direkte (`.write: false`), kun via `facilityplanlaeg`/`opgaveflyt`/`opgavestatus`. |
| Reservation | `reservationer` (base, fjerde kilde "facilitySag", prioritet 20) | Ingen ejer alene (fire kilder mødes her — beslutning 4/92) | Fleets Driftskalender/Disponering, Bemandings fraværskalender | Skrives atomisk MED opgaven af samme Cloud Functions. Aldrig skrevet direkte fra klienten. |
| Faktura (indgående) | `fakturaer` (base, filtreret `destinationArt: "facility"`) | Ingen (delt base-node) | Fakturacenter, Procure → Fakturaer | Samme kilde-til-sandhed-bemærkning som dossier 01: fælles node, ingen modulklausul, kun visning i Facility (`Modulfakturaer`). |
| Leverandør | `leverandoerer` (filtreret `kategori: "facility"`) | Indkøb (`indkoeb`) | Fakturacenter, Fleets Værkstedskalender (egen kategori) | Læst read-only i Facility. |

---

## Implementation-status

**Anlægskartotek (opret/redigér anlæg og lokation):** BUILT. Persistence:
real — `gem()` i `Oversigt.jsx` skriver direkte til
`facility/aktiver/<id>`/`facility/lokationer/<id>` via `skriv.js`, med
klientvalidering (`valideAktiv()`) der spejler `firebase.rules.json`. Kan
bruges end-to-end.

**Fejlindberetning:** BUILT. Persistence: real, samme mønster (`gem()` →
`facility/fejl/<id>`). Alvor er et eksplicit menneskeligt valg; feltet
`meldtMs` sættes ved oprettelsen og rører sig ikke. Fri tekst i `beskrivelse`
er bevidst udelukket fra audit-allowlisten.

**Vurdering (afledt lokationsstatus):** BUILT som ren beregning
(`lokationTilstand()`, `driftsforhold()` i `facility.js`) — intet gemt felt,
ingen persistence-risiko. Regnes af rådata skærmen allerede har hentet.

**Servicekalender-reservation (planlægning, flytning, status):** BUILT.
Alle tre skrivninger går gennem navngivne Cloud Functions
(`facilityplanlaeg`, `opgaveflyt`, `opgavestatus`), bekræftet eksisterende i
`functions/index.js`. Reservationskonflikt håndhæves server-side, inkl. den
særlige "hallen og porten er ét rum"-regel
(`indeslutninger()`/`tjekLedigIndesluttet()`) — en flytning fra et anlæg til
en hel lokation skifter ressourcetype server-side, ikke kun id. Klienten kan
ikke skrive `opgaver` eller `reservationer` direkte (begge `.write: false`).

**Leverandørkommunikation:** MOCK/PLANNED-hybrid, klart erkendt i koden.
Leverandøren VÆLGES i Servicedialog (reelt datakartotek, filtreret på
kategori), men **der sendes ingen mail, og ingen udgående kommunikationskanal
findes**. Kommentaren i `Servicedialog.jsx` siger direkte: *"INGEN MAIL. Samme
som Planlaegdialog: beslutning 20 er fase 0."* Beslutning 20 (sagsbaseret
mail) er dokumenteret i `README.md`'s "Kendte huller" som fase 0 — kun
visning, ingen modtagevej/parsing/afsendelse/scanning. `sager/` findes ikke i
`firebase.rules.json` overhovedet.

**Klimaovervågning:** BUILT for LÆSNING. Sensormålinger og zonegrænser læses
fra `facility/sensorer`/`facility/zoner` via `useListe`, alarm og gennemsnit
er rene, afledte beregninger fra samme data som vises (`zonePar()`,
`alarmTilstand()`, `gennemsnitPrZoneArt()` i `facility.js`) — ingen risiko
for at to skærme siger noget forskelligt, fordi de deler funktionen. Regler
tillader også SKRIVNING af sensormålinger og zonegrænser
(`facility.skriv`), men **ingen skærm i `src/moduler/facility/` skriver
zoner, grænser eller målinger** — hverken en "opret zone"-formular eller en
"registrér måling manuelt"-formular blev fundet. Sensordata må enten komme
fra en (ikke-set) IoT-integration eller fra provisionering.

**Energistatistik (bygningsomkostninger):** PARTIAL/hul. Klima-skærmen
LÆSER `facility/omkostning` (fem komponenter) og regner to totaler
(`elVarmeOere()`, `bygningsomkostningOere()`) korrekt afledt, aldrig gemt.
`firebase.rules.json` har en fuld skrivevalidering for noden. **Ingen
skærm skriver til den** — der er ingen "indtast denne måneds forbrug"-
formular nogen steder i `src/moduler/facility/`. Kan ikke bruges end-to-end
af en bruger; tallene, hvis de findes hos en rigtig kunde, må komme fra et
sted uden for dette moduls filsæt (fx en fremtidig integration eller manuel
seedning), hvilket ikke blev bekræftet.

**Udførelse (statusskifte på et servicebesøg):** BUILT. `Statusskifte.jsx`
(delt komponent) tegner knapper af `OPGAVE_OVERGANGE`, og server-funktionen
`opgavestatus` håndhæver den samme `kanSkifteOpgave()`. `faktiskMin` er
valgfrit, og `afkortet`-flaget bevares ved for-tidligt afsluttede besøg
(dokumenteret CLAUDE.md-regel, ikke set direkte i denne moduls filer, men
opgaven bærer feltet gennem den delte `opgaver`-node).

**Faktura:** BUILT for VISNING (samme mønster som dossier 01):
`Modulfakturaer art="facility"` viser fakturaer med
`destinationArt: "facility"` — ren læsning, ingen skrivehandling i Facility
selv. Godkendelse/placering sker udelukkende i Fakturacenteret
(`/oekonomi/fakturacenter`, dossier 01), som Facility-siden selv linker til.

**Historik:** IKKE undersøgt i dette dossiers filsæt ud over
append-only-mønstret der er dokumenteret generelt for opgaver/reservationer
i CLAUDE.md. Ingen dedikeret "facility-historik"-skærm blev fundet i
`src/moduler/facility/`.

---

## Workflow-observationer

Sporet flow: **indberetning → vurdering → leverandørbesøg → planlægning →
kommunikation → udførelse → faktura → historik**

1. **Indberetning (fejlmelding):** BUILT. `Fejlformular` i
   `Oversigt.jsx` → `gem()` → `facility/fejl/<id>`. Alvor er et
   menneskeligt valg, ikke en udledning.
2. **Vurdering:** BUILT som ren afledning. `lokationTilstand()`/
   `driftsforhold()` i `facility.js` regner Normal/Advarsel/Kritisk af
   åbne fejl + anlægsstatus + klimaalarmer — intet gemt vurderingsfelt.
3. **Leverandørbesøg (valg af leverandør):** BUILT som datakartotek-opslag
   (Servicedialog filtrerer `leverandoerer` på `kategori: "facility"`), men
   det STOPPER ved valget — der er ingen bekræftelse tilbage til
   leverandøren.
4. **Planlægning (booking af tid/reservation):** BUILT.
   `planlaegFacilityopgave()` → Cloud Function `facilityplanlaeg`, atomisk
   opgave + reservation, server-håndhævet indeslutning (hal/port).
5. **Kommunikation (udgående mail/bekræftelse til ekstern leverandør):**
   **IKKE BYGGET.** Eksplicit kommentar i kildekoden: "INGEN MAIL … beslutning
   20 er fase 0." Der findes ingen mailafsendelse, ingen
   bekræftelsesskabelon, ingen `sager/`-node i `firebase.rules.json`, og
   dermed ingen permission for det (`sag.*` findes slet ikke i
   `permissions.js` endnu, jf. README's "Kendte huller"). **Svar på
   spørgsmålet i opgaven: Nej, der er ingen reel mail-afsendelse til en
   ekstern leverandør nogen steder i Facility-modulet.**
6. **Udførelse (status i felten):** BUILT. `Statusskifte.jsx` +
   `opgavestatus`-funktionen, samme mønster som Fleets værkstedsopgaver.
7. **Faktura:** PARTIAL/delt med Procure. Facility viser
   (`Modulfakturaer`), men godkender/placerer ikke selv — det sker i det
   fælles Fakturacenter (andet modul, dokumenteret i dossier 01).
8. **Historik:** IKKE PÅVIST i dette moduls filsæt — ingen dedikeret
   facility-historikskærm fundet; kun den generelle append-only-
   dokumentation i CLAUDE.md for opgaver/reservationer blev set, ikke en
   konkret skærm der viser den.

---

## UI-mønstre

- **Layout:** Alle tre skærme bruger `<div className="fc-grid">` som
  yderste container og de samme delte primitiver fra `fleet/ui.jsx`: `Kort`,
  `KpiKort`, `KpiRaekke`, `Tabel`, `Pille`, `Gitter`, `Henter`,
  `Datatilstand`, `MiniLinje`, `Knap`, `Felt`/`Feltraekke`/`Formular`,
  `Kpiadgang`.
- **Card/KPI-design:** Samme runde ikonkort-mønster som resten af appen
  (`KpiKort` med `ikon`, `tone="ikon-N"`, `rund`, `til=` for klikbart link,
  `deviation()`-farvet afvigelse). Bruges identisk i alle tre skærme.
- **Tabeller:** `Tabel`-komponenten med `kolonner`/`raekker`/`render`, samme
  klientside-paginering (`Sider`) som ses andre steder i appen (fx dossier
  01's Fakturering).
- **Filtre:** Ingen egne filtre på nogen af de tre skærme — periodevælger og
  tenant-vælger ejes af shellen, som reglen foreskriver; Servicekalenderen
  har et fast 10-dages rullende vindue, ikke en brugervalgt periode.
- **Modaler/dialoger:** `Servicedialog` bruger den delte `Dialog`-komponent
  fra `ui.jsx` — samme mønster som fx Fakturacenters "Ingen destination"-
  dialog (dossier 01).
- **Kalenderdesign:** Servicekalenderen genbruger 1:1 `Gitterkalender.jsx`
  (samme komponent som Fleets Driftskalender/Værkstedskalender og
  Disponering) — ressourcer som rækker, dage som kolonner, træk-og-slip,
  "skygge"-blokke for indesluttede ressourcer (en lukket hal skygger sine
  egne porte visuelt, ikke bare logisk).
- **Statusfarver:** `Pille`-komponent med `tone` (`ok`/`warn`/`bad`/`info`)
  gennemgående, samme tokens som resten af appen — ingen egen facility-
  farveskala. Alarm-toner bruger samme `tone`-værdier som
  `AKTIV_STATUS`/`FEJL_STATUS`/`OPGAVE_STATUS` andre steder.
- **Data-viz i Klima:** Bruger de SAMME delte primitiver som resten af appen
  — `Donut` (i Overblik, ikke i Klima) og `Soejlegraf` (i Klima, "Forbrug pr.
  post") er generiske komponenter fra `ui.jsx` med SVG-baseret donut
  (`viewBox 0 0 42 42`, `SERIE_FARVER`-palette) og CSS-højde-baserede
  søjler (`GRAF_TONE`). **Ingen stilistisk afvigelse fundet** — Klima
  bruger ikke et separat chart-bibliotek eller egne farver; nulpunktet er
  eksplicit altid 0 på søjlegrafen (kommenteret: en afkortet akse ville få
  "to procentpoint til at ligne en halvering").
- **Terminologi:** Konsekvent dansk fagsprog: "anlæg" (ikke "aktiv" i UI-
  tekst, selvom variabelnavnet er `aktiv`), "lokation" vs. "sted" (sted er
  fritekst-katalog, lokation er posten), "servicebesøg" (ikke "opgave" i
  UI-tekst, selvom det er en `opgave`-post), "meldt" (ikke "oprettet") for
  fejl.
- **Klassenavne set:** `fc-grid`, `fc-lokrk`/`fc-lokrk-nu`/`fc-lokrk-txt`/
  `fc-lokrk-m2` (lokationsrække), `fc-med-ikon`/`fc-med-ikon-svag`,
  `fc-hint`, `fc-tolinje`, `fc-bad`, `fc-neutral`, `fc-sum`/`fc-sum-v`,
  `fc-a`, `fc-row`, `fc-donut`/`fc-donut-fig`/`fc-donut-legende`,
  `fc-graf`/`fc-graf-kol`/`fc-graf-soejle`/`fc-graf-legend`,
  `fc-svar`/`fc-svar-fejl`.
- **Knapper:** Deaktiverede knapper bærer konsekvent en `title`-forklaring
  ("Kræver facility.skriv — serveren afviser.", "Ledigt tidsrum. At
  planlægge her kræver opgaver.skriv.") — samme mønster som resten af appen.

---

## Mulige overlap

- **Site A:** Facility Servicekalender (`/facility/servicekalender`)
  **suspected Site B:** Fleets Værkstedskalender (`/flaade/vaerksted` el.
  lign., ikke læst i dette dossier, men refereret som "værkstedets egen
  skærm på den samme node" i `Servicekalender.jsx`'s hoved-kommentar)
  **why:** Begge er bogstaveligt samme UI-komponent (`Gitterkalender.jsx`)
  over samme node (`opgaver`), adskilt kun af `art`-feltet
  (`vaerksted` vs. `facility`). Begge koncepter er "book en reparationstid"
  — samme fysiske idé (ressource × tid, ekstern leverandør, estimat),
  forskellig ressourcetype (køretøj vs. anlæg/lokation).
  **risk:** Lav for datauenighed (koden fremhæver eksplicit gentagne gange
  at de deler funktion og node med vilje, netop for at undgå den slags
  drift), men **produktmæssig risiko for brugerforvirring**: to selvstændige
  kalenderskærme for begrebsmæssigt samme handling ("planlæg et
  servicebesøg"), i to forskellige moduler, med hver sin planlægningsdialog
  (`Servicedialog.jsx` vs. Fleets `Planlaegdialog.jsx`) fordi feltskemaerne
  reelt er forskellige (ingen enhed/arbejdstype på en facility-opgave). En
  bruger med begge moduler skal vide hvilken kalender der gælder for hvad.

- **Site A:** Facility "sager" (fejl/anlæg)
  **suspected Site B:** Fleets sager (køretøjsskader/indberetninger)
  **why:** `moduler.js` dokumenterer eksplicit at `sager` (når/hvis den
  bygges) har `art: "fleet" | "facility"` — "samme snit som opgaver" — og
  deler samme node fremfor at have to. `opgaver` med `art: "facility"`
  fungerer allerede efter dette mønster i dag.
  **risk:** Lav for dataduplikering (arkitekturen er bevidst delt-node), men
  `sager/` findes IKKE i `firebase.rules.json` endnu (fase 0,
  dokumenteret i README's "Kendte huller") — så overlappet er i dag kun
  teoretisk/planlagt, ikke et aktivt risikopunkt.

- **Site A:** Facility "Klima nu" (på Overblik) og zonetabellen (på Klima)
  **suspected Site B:** Ingen — dette ER bevidst samme datasæt vist to
  steder (`zonePar()` kaldt to gange, samme to noder).
  **why:** Nævnes fordi koden selv dokumenterer at DETTE var en tidligere
  bug (to skærme viste forskellige temperaturer for samme zoner i
  mockuppen), rettet ved at samle regnestykket i `facility.js`.
  **risk:** Ingen i dag — medtaget for at vise at det IKKE er et overlap,
  men et bevidst delt udtræk.

- **Site A:** Facility "estimeret omkostning" pr. anlæg (Overblik)
  **suspected Site B:** Servicekalenderens "Anslået omkostning"-KPI
  **why:** Begge beskriver samme underliggende tal (næste planlagte besøgs
  `beloebOere`), men Overblik regner det pr. ENKELT anlæg
  (`estimatForAktiv()`, som slår op i **`DEMO_SERVICEBESOEG`** — se note
  nedenfor), mens Servicekalenderens KPI kommer fra `kpi.facility.anslaaetServiceOere`
  (aggregeret).
  **risk:** Middel. `estimatForAktiv()` i `Oversigt.jsx` er kommenteret som
  "afledt af det planlagte servicebesøg", men dens datakilde i praksis er
  `DEMO_SERVICEBESOEG` (importeret fra `demo-facility.js`) — IKKE den
  hentede `opgaver`-liste skærmen selv har til rådighed. Det er ikke en ren
  visuel demo-fallback (den bruges uanset Firebase-tilstand i denne ene
  kolonne), og den kan derfor vise et estimat der ikke svarer til et rigtigt
  kommende servicebesøg hos en rigtig kunde. Dette blev ikke undersøgt
  yderligere i dybden inden for denne opgaves afgrænsning — se IKKE PÅVIST.

---

## IKKE PÅVIST

- Hvorvidt `facility/omkostning` (bygningsomkostninger) rent faktisk
  udfyldes hos en rigtig kunde — ingen skærm i `src/moduler/` blev fundet
  der skriver til noden, men en fuld `grep` over `functions/index.js` for en
  eventuel skjult skrivevej (fx en periodisk import) blev ikke kørt som del
  af denne afgrænsede opgave.
- Hvorvidt `facility/zoner`/`facility/sensorer` kan oprettes/redigeres fra
  NOGEN skærm i systemet — ingen formular blev fundet i
  `src/moduler/facility/`, men resten af `src/moduler/` (fx en
  admin/opsætningsskærm) blev ikke gennemsøgt for det.
- Hvorfor kildekoden til `estimatForAktiv()` (`Oversigt.jsx`) rent faktisk
  slår op i `DEMO_SERVICEBESOEG` i stedet for den hentede opgaveliste. Om
  dette er en bevidst midlertidig løsning eller en overset rest af den fejl
  koden selv beskriver i `Servicekalender.jsx`s hoved (den historiske
  DEMO_SERVICEBESOEG-vs-opgaver-uenighed), blev ikke afklaret — kun
  observeret som kode.
- En dedikeret "facility-historik"-skærm eller -sektion — ingen blev fundet
  i de fire læste filer; om historik vises et andet sted (fx en generel
  auditlog-visning uden for dette modul) er ikke undersøgt her.
- Hvilken rolle der reelt "ejer" facility-driften i praksis hos en kunde —
  kataloget viser kun HVEM DER KAN skrive (casehandler/disponent/
  koordinator/admin via `BASIS_DATA`), ikke hvilken af dem der faktisk
  bruger modulet dagligt; der er ingen "facility manager"/"vicevært"-rolle,
  og det kan ikke afgøres fra koden alene hvem der reelt forventes at gøre
  det.
