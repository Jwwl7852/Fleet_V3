# Dossier 06 — Procure / Indkøb

Kilder: `src/moduler/indkoeb/*.jsx` (Oversigt, Behov, Bestillinger, Godkendelser,
Fakturaer, Leverandoerer, Varelager), `src/fleet/{behov,bestilling,godkendelse,
procure,leverandoerer,forbrugsvarer,varelager,faktura,moduler,permissions,nav}.js`,
`functions/index.js`.

## Modul-resumé

- **navn:** Procure (`MODUL.indkoeb`, navKey `"indkoeb"`)
- **formål (moduler.js):** "Indkøb, fakturaafstemning og leverandører."
- **primær brugertype:** casehandler/disponent/koordinator/admin (bestiller og
  godkender er bevidst forskellige personer — fire-øjne-princippet, se
  `permissions.js` og `procure.js` note ved `kanSkifteIndkoebsordre()`); enhver
  medarbejder (snedkeri/lager/kontor) kan indmelde et behov fra telefonen.
- **vigtigste opgave:** styre hele indkøbsprocessen fra behov til
  fakturaafstemning, med et adskilt reservedelslager (`forbrugsvarer`) til
  vognmandens egne dele.
- **vigtigste funktioner:**
  - Indmeld indkøbsbehov (fra telefon, uden app)
  - Automatisk leverandørforslag ud fra indkøbshistorik (varenummer/navn-match)
  - Bestillingskladde grupperet pr. leverandør, med kopierbart mailudkast
  - To slåes-fra-regler for godkendelse (beløbsgrænse, fakturagodkendelse)
  - Fakturamatch mod bestilling med gennemsigtig scoring (signaler vist)
  - Kontantkøb/udlæg som en almindelig indkøbslinje
  - Tre-vejs afstemning (registreret / modtaget / bogført) — vist med demodata
  - Leverandørperformance på seks objektive nøgletal, hver med sit grundlag
  - Eget reservedelslager (`forbrugsvarer`) med bevægelseshistorik og
    drift-kontrol mod gemt beholdningstal
- **undermoduler/skærme:** Oversigt, Indkøbsbehov, Bestillinger, Godkendelser,
  Fakturaer, Leverandører, Varelager (7 skærme, alle med rute og fil).
- **afhænger af (andre moduler):** ingen (`MODUL_KRAEVER` lister intet krav for
  `indkoeb`); leverandørens e-mail kan blive part på en Sag (fase 0,
  beslutning 20), men det er ikke et hårdt modulkrav.
- **afhænges af (hvem læser dette modul):** Økonomi (`oekonomi`) læser
  `fakturaer/` gennem sit eget Fakturacenter (samme node, fælles ejerskab —
  se moduler.js: "fakturaer ligger i Indkøb, men Økonomi læser dem");
  Værkstedskalender/Facility registrerer indkøb i kontekst men al godkendelse
  sker i Indkøb → Fakturaer (CLAUDE.md-regel: "Bygg ikke en fakturagodkendelse
  uden for Indkøb").
- **samlet status:** BUILT for hele kerneprocessen (behov → bestilling →
  godkendelse → fakturamatch → kontantkøb → varelager), med tre bevidst
  ubyggede/manuelle led: mail-afsendelse til leverandør, filupload/OCR på
  fakturaer, og selve betalingen/regnskabsintegrationen.
- **overlap-mistanke:** `lagre` (Indkøbs eget reservedelslager, se
  moduler.js/NODE_MODUL) vs. `forbrugsvarer` (samme modul, en anden node — se
  note nedenfor) vs. Warehouses `varer`/`beholdning` (kundens 3PL-gods);
  `fakturaer/` delt mellem Procure → Fakturaer og Økonomi → Fakturacenter.

## Skærme

### `/indkoeb` — Procure & vareforbrug (Oversigt)
- **fil:** `Oversigt.jsx`
- **hvem bruger den:** alle med `indkoeb.laes`; indkøbsansvarlig/disponent primært
- **primært formål:** modulets forside — procesbånd (5 trin), KPI-række,
  indbakke over åbne behov, leverandørkartotek, prisudvikling
- **primær handling:** "Registrér indkøb" (åbner formular over tabellen)
- **sekundære handlinger:** filtrér på leverandør/status/kategori, redigér en
  eksisterende linje, links videre til hvert procestrin
- **data vist:** `indkoeb` (linjer, 400 dages vindue), `leverandoerer`,
  `koeretoejer`, `facility/lokationer`, `fakturaer`, `indkoebsbehov`,
  `indkoebsordrer`, `godkendelsesregler`, `brugere`, samt `kpi.indkoeb.*`
- **data der kan ændres:** en `indkoeb`-linje (registrér/redigér) via `gem()`
  fra `skriv.js`
- **kommer typisk fra:** landingsside for modulet (nav-link "Procure")
- **går typisk til:** Behov, Bestillinger, Godkendelser, Fakturaer, Leverandører, Varelager
- **overlap med anden side:** ingen direkte — men samme `indkoeb`-node læses
  også af Bestillinger (som historik/grundlag for leverandørforslag)
- **status:** BUILT (læsning: `useListe`; skrivning: `gem()` til `indkoeb/<id>`)
- **demo-data:** ja — `DEMO_FAKTURAER`, `DEMO_INDKOEBSBEHOV`,
  `DEMO_INDKOEBSORDRER`, `DEMO_GODKENDELSESREGLER`, `DEMO_KOERETOEJER`,
  `DEMO_LOKATIONER` — alle udelukkende som `useListe`/`usePost`
  faldback-parameter (`demo:`), aldrig direkte importeret data. Kun aktivt i
  demoMode uden Firebase.
- **nødvendig for:** daglig drift

### `/indkoeb/behov` — Indkøbsbehov
- **fil:** `Behov.jsx`
- **hvem bruger den:** enhver medarbejder med `indkoeb.skriv` (snedkeri, lager,
  kontor); casehandler/admin til at afvise
- **primært formål:** indmeld hvad man mangler, grupperet på kilde
- **primær handling:** "Send melding" (opretter et behov via `meldBehov()`)
- **sekundære handlinger:** "Afvis" et behov med obligatorisk begrundelse
  (`afvisBehov()`); filtrér på kilde
- **data vist:** `indkoebsbehov` (alle, ikke afviste/bestilte vises i indbakken),
  `personale` (navneopslag på anmoder)
- **data der kan ændres:** opret behov, afvis behov — begge via Cloud Function
  `behovskriv` (bekræftet i `functions/index.js` linje 4274)
- **kommer typisk fra:** procesbåndet trin 1, eller direkte nav-link
- **går typisk til:** Bestillinger (trin 2, samme behov vises der som kladdelinje)
- **overlap med anden side:** ingen
- **status:** BUILT
- **demo-data:** ja — `DEMO_INDKOEBSBEHOV`, `DEMO_PERSONALE` som `useListe`
  faldback
- **nødvendig for:** daglig drift
- **note:** billede/lydoptagelse til en behovsindmelding er eksplicit IKKE
  bygget ("Billede og taleoptagelse er ikke bygget endnu" — kræver fillagring
  som ikke findes); skrevet direkte på skærmen, ikke skjult.

### `/indkoeb/bestillinger` — Bestillingskladder & leverandørforslag
- **fil:** `Bestillinger.jsx`
- **hvem bruger den:** indkøbsansvarlig/disponent med `indkoeb.skriv`
- **primært formål:** omdanne åbne behov til bestillinger, grupperet pr.
  leverandør med automatisk forslag (seneste leverandør + pris for varen)
- **primær handling:** "Bestil valgte" pr. leverandørgruppe → `opretBestilling()`
- **sekundære handlinger:** ret antal/pris pr. linje før bestilling, kopiér
  mailudkast, markér en ordre som sendt (sker på Godkendelser-skærmen)
- **data vist:** `indkoebsbehov`, `indkoebsordrer`, `indkoeb` (historik som
  grundlag for forslag), `leverandoerer`
- **data der kan ændres:** opretter en `indkoebsordrer`-post (kladde) via
  Cloud Function `ordreskriv` (bekræftet, linje 4432)
- **kommer typisk fra:** Behov (trin 1) eller procesbåndet trin 2
- **går typisk til:** Godkendelser (trin 3)
- **overlap med anden side:** viser samme "e-mailudkast"-koncept som senere
  markeres sendt på Godkendelser
- **status:** BUILT for kladdeoprettelse. **PARTIAL for afsendelse:**
  "Systemet sender ikke udkastene" — mailudkastet kan kun kopieres, ingen reel
  SMTP/afsendelsesvej, ingen afsenderadresse pr. tenant, intet spor af hvad der
  blev sendt. Bekræftet: ingen mail-relateret Cloud Function fundet for Procure
  i `functions/index.js`. "Markér som sendt" er et rent statusskifte
  (`ordrestatus` → `sendt`), ikke en faktisk afsendelse.
- **demo-data:** ja — `DEMO_INDKOEBSBEHOV`, `DEMO_INDKOEBSORDRER`,
  `DEMO_INDKOEBSLINJER`, `DEMO_LEVERANDOERER` som faldback
- **nødvendig for:** daglig drift

### `/indkoeb/godkendelser` — Godkendelse af indkøb
- **fil:** `Godkendelser.jsx`
- **hvem bruger den:** godkender (`indkoeb.godkend`), admin (regelopsætning
  kræver `brugere.skriv`)
- **primært formål:** afgøre ordrer der venter på godkendelse, og opsætte de to
  godkendelsesregler (beløbsgrænse, fakturagodkendelse — begge kan slås fra)
- **primær handling:** "Godkend"/"Afvis" en ventende ordre → `skiftOrdre()`
- **sekundære handlinger:** gem godkendelsesregler (`gemGodkendelsesregler()`),
  se alle bestillinger og deres mulige næste skridt
- **data vist:** `indkoebsordrer`, `leverandoerer`, `godkendelsesregler`
  (single-post via `usePost`), `brugere`
- **data der kan ændres:** ordrestatus (Cloud Function `ordrestatus`, bekræftet
  linje 4668), godkendelsesregler (`godkendelsesregelskriv`, linje 4575)
- **kommer typisk fra:** Bestillinger (trin 2 → 3) eller nav-link
- **går typisk til:** Fakturaer (trin 4)
- **overlap med anden side:** ingen
- **status:** BUILT. Selvgodkendelse er en bevidst tilladt, men markeret
  tilstand (`selvgodkendt: true`), ikke en blokering — dokumenteret som en
  designbeslutning, ikke en mangel.
- **demo-data:** ja — `DEMO_INDKOEBSORDRER`, `DEMO_GODKENDELSESREGLER`,
  `DEMO_LEVERANDOERER` som faldback
- **nødvendig for:** daglig drift (godkendelse) og admin/opsætning (reglerne)

### `/indkoeb/fakturaer` — Fakturaer, match & kontantkøb
- **fil:** `Fakturaer.jsx`
- **hvem bruger den:** indkøbsansvarlig/godkender (`indkoeb.skriv`,
  `indkoeb.godkend`)
- **primært formål:** matche modtagne fakturaer mod bestillinger, godkende og
  bogføre dem, registrere kontantkøb/udlæg, vise tre-vejs afstemning
- **primær handling:** "Bekræft match" → `matchFaktura()`; "Godkend"/"Afvis"/
  "Bogfør" → `skiftFaktura()`
- **sekundære handlinger:** "Markér som ikke-matchbar" (med grund), "Fjern
  match", registrér kontant køb (`gemKontantkoeb()`)
- **data vist:** `fakturaer`, `indkoeb`, `leverandoerer`, `indkoebsordrer`,
  `godkendelsesregler`, `brugere`, `kpi.indkoeb.*`
- **data der kan ændres:** faktura-match/status/kontantkøb — alle tre via
  bekræftede Cloud Functions `fakturamatch` (4796), `fakturastatus` (4894),
  `kontantkoebskriv` (4983)
- **kommer typisk fra:** Godkendelser (trin 3 → 4) eller procesbåndet trin 4/5
- **går typisk til:** ingenting videre — er slutstationen i Procure-processen
  (bogføring); Økonomi → Fakturacenter viser samme `fakturaer`-node bredere
- **overlap med anden side:** **Ja, direkte** — `oekonomi/Fakturacenter.jsx`
  læser og skriver den samme `fakturaer`-node (se Mulige overlap nedenfor)
- **status:** BUILT for match/godkend/afvis/bogfør/kontantkøb. **PARTIAL/MOCK
  for to dele:**
  1. "Modtag faktura" (upload) er eksplicit ikke bygget — "Upload er ikke
     bygget endnu" (ingen Storage/fillagring); fakturaer må oprettes ad anden
     vej (ikke vist i UI hvordan).
  2. "Afstemning"-kortet (tre-vejs total) bruger `demoAfstemning()` fra
     `demo-indkoeb.js` **ubetinget** — dette er IKKE et `useListe`-faldback,
     men et direkte funktionskald uden nogen reel datakilde bag
     "bogført i regnskabet" (der er ingen regnskabsintegration). Dette er
     reel MOCK-visning, ikke bare demo-infrastruktur — kortet viser opdigtede
     tal for alle kunder, uanset Firebase-forbindelse.
  Der er **ingen betaling fra systemet** ("Der betales ikke fra systemet" —
  eksplicit på skærmen) og **ingen afsendelse til et regnskabssystem**
  ("Der sendes ikke noget til et regnskabssystem" ved Bogfør-knappen).
- **demo-data:** ja for lister (`DEMO_LEVERANDOERER`, `DEMO_INDKOEBSLINJER`,
  `DEMO_FAKTURAER`, `DEMO_INDKOEBSORDRER`, `DEMO_GODKENDELSESREGLER`), men
  Afstemnings-kortet (`demoAfstemning()`) er altid demodata — se ovenfor.
- **nødvendig for:** daglig drift

### `/indkoeb/leverandoerer` — Leverandører
- **fil:** `Leverandoerer.jsx`
- **hvem bruger den:** indkøbsansvarlig, admin (der findes ingen mockup for
  denne skærm — kommentaren siger det direkte)
- **primært formål:** leverandørkartotek med performance (seks objektive
  nøgletal, ingen stjerner/samlet score — bevidst valg, beslutning 22),
  prisliste-historik
- **primær handling:** ingen skrivehandling — ren visning ("FASE 0: VISNING.
  Der skrives ingenting.")
- **sekundære handlinger:** vælg leverandør i tabellen for at se detaljer
- **data vist:** `leverandoerer`, `indkoeb`, `fakturaer` (som `demo:`-faldback),
  `kpi.*`
- **data der kan ændres:** intet — skrivning ikke bygget på denne skærm
- **kommer typisk fra:** Oversigt eller nav-link
- **går typisk til:** ingen videre navigation
- **overlap med anden side:** deler leverandørkartoteket med alle andre
  Procure-skærme
- **status:** MOCK/DEMO for skrivning (ingen skrivning findes — dette er
  bevidst og oplyst, ikke et fejlfundet hul), men BUILT for læsning (reel
  `useListe` mod `leverandoerer`/`indkoeb`/`fakturaer`)
- **demo-data:** ja — kun `DEMO_FAKTURAER` som faldback for `fakturaer`
- **nødvendig for:** daglig drift (performance-opslag), men ikke oprettelse af
  leverandører (det findes ikke her — ukendt hvor leverandøroprettelse sker;
  ikke fundet i de læste filer — **IKKE PÅVIST**)

### `/indkoeb/varelager` — Varelager
- **fil:** `Varelager.jsx`
- **hvem bruger den:** lagermedarbejder/indkøbsansvarlig med `indkoeb.skriv`
- **primært formål:** Procures eget reservedelslager (`forbrugsvarer` node) —
  eksplicit IKKE Warehouses kundegods
- **primær handling:** "Ny vare" / "Ret" (`gemForbrugsvare()`), "Bevægelse"
  (`flytBeholdning()`)
- **sekundære handlinger:** "Meld som behov" for en lav vare (→ opretter et
  `indkoebsbehov` via `meldBehov(behovFraVare(...))`), "Tæl op" på en negativ
  beholdning
- **data vist:** `forbrugsvarer`, `forbrugsvarebevaegelser`, `leverandoerer`;
  viser afvigelse mellem gemt beholdning og bevægelsessum (drift-detektor)
- **data der kan ændres:** vare-stamdata og lagerbevægelser, begge via
  bekræftede Cloud Functions `forbrugsvareskriv` (5038),
  `forbrugsvarebevaegelse` (5121)
- **kommer typisk fra:** Oversigt (KPI "Lav lagerbeholdning")
- **går typisk til:** Behov (via "Meld som behov")
- **overlap med anden side:** se Mulige overlap — risiko for forveksling med
  `lagre` (Fleet/værksted reservedelslager) og Warehouses `varer`/`beholdning`
- **status:** BUILT
- **demo-data:** ja — `DEMO_FORBRUGSVARER`, `DEMO_FORBRUGSVAREBEVAEGELSER`,
  `DEMO_LEVERANDOERER` som faldback
- **nødvendig for:** daglig drift

## Data-entiteter

| Entitet | RTDB-node(r) | Ejes af (NODE_MODUL) | Bruges også af | Kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| Indkøbsbehov | `indkoebsbehov` | `indkoeb` | — | Trin 1 af processen (beslutning 78); `.write: false`, kun via `behovskriv` |
| Bestilling / PO | `indkoebsordrer` | `indkoeb` | — | Trin 2; `.write: false`, kun via `ordreskriv`; nummerserie `BST-ÅÅÅÅ-NNNNN` |
| Godkendelsesregler | `godkendelsesregler` | `indkoeb` | — | Single-post pr. tenant (`usePost(null, ...)`); standard er "ingen godkendelse" hvis noden mangler |
| Indkøbslinje (registreret køb) | `indkoeb` | `indkoeb` | Leverandørperformance-beregning på tværs af skærme | "Bagudrettet registrering" — IKKE processen før købet. Kontantkøb er samme node med `betalingsform: "kontant"` |
| Faktura | `fakturaer` | **BASE (ingen enkelt-modul-ejer)** — moduler.js: "fakturaer ligger i Indkøb, men Økonomi læser dem" | Økonomi → Fakturacenter (samme node, samme felter, `destinationArt`-baseret) | Delt sandhedskilde — `.write: false`; skrives kun via `fakturamatch`/`fakturastatus`/`fakturadestination`/`kontantkoebskriv` |
| Kreditnota | — | — | — | **IKKE PÅVIST** — ingen kreditnota-node eller -logik fundet i de læste filer |
| Kontant køb / kvittering | `indkoeb` (samme node, `betalingsform: "kontant"`) | `indkoeb` | — | Bevidst IKKE en egen node ("Et kontantkøb er ikke en ny node") for at undgå to kilder til samme beløb |
| Leverandør / kreditor | `leverandoerer` | `indkoeb` | Referencer fra `indkoeb`, `fakturaer`, `forbrugsvarer`, Fakturacenter (oekonomi), værkstedsopgaver | Node fandtes ikke oprindeligt selvom `leverandoerId` var indekseret to steder — rettet historisk (se leverandoerer.js kommentar) |
| Materiale / forbrugsvare | `forbrugsvarer` | `indkoeb` | — | Procures EGET reservedelslager — se overlap-note |
| Lagerbevægelse (forbrugsvarer) | `forbrugsvarebevaegelser` | `indkoeb` | — | Beholdning gemmes afledt sammen med bevægelsen (atomisk `update()`), men prøves løbende mod summen af bevægelser på skærmen (drift-detektor) |
| Reservedelslager (Fleet/værksted) | `lagre` | `indkoeb` | Værksted/Fleet-moduler ved reservedelsforbrug på en bil | **IKKE samme som `forbrugsvarer`** — ikke undersøgt i denne dossier (uden for scope: modul 06 dækker kun `indkoeb`s egne noder), men bekræftet i NODE_MODUL at også `lagre` ejes af `indkoeb`. Forholdet mellem `lagre` og `forbrugsvarer` som to reservedelslagre under samme modul er **IKKE PÅVIST** i de læste filer — fremstår som to parallelle koncepter, begge "vores egne dele" |
| Warehouse-gods (til sammenligning) | `varer`, `beholdning` | `warehouse` (IKKE indkoeb) | — | 3PL — kundens gods, påkrævet `kundeId`. Nævnes udelukkende for at markere grænsen, se Mulige overlap |

## Implementation-status

| Trin | Status | Persistens | Kendte blockers/kompromiser |
|---|---|---|---|
| Behov (indmeld) | BUILT | `behovskriv` Cloud Function | Billede/lyd-vedhæftning ikke bygget (ingen fillagring) |
| Leverandørforslag | BUILT | Ren funktion `foreslaaLeverandoer()`, regnes on-the-fly, gemmes ikke | Forslag kun ud fra egen indkøbshistorik — ingen ekstern prisdatabase |
| Antal (fastsættelse) | BUILT | Sat i bestillingsformularen, sendes til `ordreskriv` | Behovets antal er bevidst valgfrit — bestiller udfylder |
| Bestilling / PO (oprettelse) | BUILT | `ordreskriv` Cloud Function, skriver `indkoebsordrer` + opdaterer behovets status atomisk | — |
| Evt. godkendelse | BUILT | `ordrestatus` Cloud Function; regler i `godkendelsesregler` (kan slås fra) | Kun ÉN udpeget godkender pr. regel; selvgodkendelse tilladt men markeret |
| Mail til leverandør | **MOCK/PARTIAL** | Intet — kun tekstudkast genereret client-side, kopieres manuelt | "Systemet sender ikke udkastene" — ingen SMTP, ingen afsenderadresse, intet sendespor. "Markér som sendt" er kun et statusfelt |
| Varemodtagelse | BUILT (statusfelt) | `ordrestatus` → `modtaget` | Ingen linje-for-linje modtagekontrol fundet — hele ordren markeres modtaget som én handling (ikke verificeret i detalje — kun statusovergangen er set) |
| Faktura (modtagelse) | **PARTIAL** | Fakturaer skrives via server (`fakturamatch`/`fakturastatus`), men INTET UI for at oprette en faktura fra upload — "Upload er ikke bygget endnu" | Uklart hvordan en faktura overhovedet kommer ind i `fakturaer/` uden upload — mulig ekstern/manuel indtastningsvej, **IKKE PÅVIST** i de læste filer |
| Match | BUILT | `fakturamatch` Cloud Function; scoring er transparent (`matchForslag()`, viser signaler) | Kun bestillingsnummer giver 100% score; alt andet er en "slutning" markeret som sådan |
| Godkendelse (faktura) | BUILT | `fakturastatus` Cloud Function | — |
| Regnskabsgrundlag | **PARTIAL/MOCK** | "Bogfør"-knap sætter kun en intern status (`fakturastatus` → `bogfoert`); ingen regnskabsintegration ("Der sendes ikke noget til et regnskabssystem") | Tre-vejs afstemningskort bruger `demoAfstemning()` — hardkodet demodata uafhængigt af Firebase-tilstand, dette er reel MOCK-visning ikke kun demo-faldback |
| Kontant/betalt køb | BUILT | `kontantkoebskriv` Cloud Function, gemmes som almindelig `indkoeb`-linje med `betalingsform: "kontant"` | Kvittering/bilag kan ikke vedhæftes (ingen fillagring) — tælles i KPI som mangel, spærrer ikke |

**Kan bruges end-to-end:** Ja, for hele kæden behov → bestilling → godkendelse
→ (manuel mail) → fakturamatch → godkendelse — MED to manuelle brud:
leverandørmailen skal sendes af et menneske uden for systemet, og selve
bogføring/betaling sker uden for systemet. Afstemningskortet på Fakturaer-siden
viser fast demodata og bør ikke læses som en reel funktion.

## Workflow-observationer

1. **Behov** — BUILT. `Behov.jsx` → `meldBehov()` → Cloud Function `behovskriv`
   (`functions/index.js:4274`). Skriver `indkoebsbehov/<id>` med status `nyt`.
2. **Leverandørforslag** — BUILT (ren beregning). `foreslaaLeverandoer()` i
   `procure.js` slår op i `indkoeb`-historikken efter varenummer, dernæst navn;
   returnerer `null` (og siger "Leverandør mangler") hvis intet træf findes.
3. **Antal** — BUILT. Sættes på Bestillinger-skærmen (`antalFor()`), sendes
   til `opretBestilling()`.
4. **Bestilling/PO** — BUILT. `Bestillinger.jsx` → `opretBestilling()` →
   Cloud Function `ordreskriv` (`functions/index.js:4432`). Skriver
   `indkoebsordrer/<id>` med nummer `BST-ÅÅÅÅ-NNNNN` og opdaterer behovenes
   status atomisk.
5. **Evt. godkendelse** — BUILT. `Godkendelser.jsx` → `skiftOrdre()` → Cloud
   Function `ordrestatus` (`functions/index.js:4668`). Reglerne
   (`godkendelsesregler`) styres af `godkendelsesregelskriv`
   (`functions/index.js:4575`, kræver `brugere.skriv`). Kan slås helt fra.
6. **Mail til leverandør** — **MOCK/manuel, ikke sendt af systemet.**
   `mailudkast()` i `procure.js` bygger emne+brødtekst client-side.
   `Bestillinger.jsx` har en "Kopiér udkast"-knap (`navigator.clipboard`).
   Der er INGEN Cloud Function der sender mail for Procure (søgt i
   `functions/index.js`, ingen match). Ordren markeres "sendt" som et rent
   statusfelt (`ordrestatus` → `sendt`) af et menneske, ikke af systemet.
   Dette er eksplicit dokumenteret i koden som en bevidst fase 1-begrænsning
   (beslutning 20/81), ikke et overset hul.
7. **Varemodtagelse** — BUILT (som statusskifte). `ordrestatus` → `modtaget`.
   Ingen linje-niveau modtagekontrol observeret i de læste filer.
8. **Faktura (modtagelse)** — **PARTIAL.** Ingen upload-funktion findes
   ("Upload er ikke bygget endnu" — `Fakturaer.jsx` linje ~217-225). Hvordan
   `fakturaer/`-noden populeres i produktion (ekstern import? manuel
   admin-indtastning?) er **IKKE PÅVIST** i de læste filer.
9. **Match** — BUILT, reel logik. `matchFaktura()` → Cloud Function
   `fakturamatch` (`functions/index.js:4796`). Matchning bruger `matchForslag()`
   i `procure.js`: navngivne signaler (bestillingsnummer=100%, leverandør,
   beløb, beløb-nær, dato), vægtet score, minimum 40% for at vises. **Ikke
   OCR** — der er ingen billed-/tekstgenkendelse af fakturafiler, kun
   struktureret feltmatching mod allerede indtastede fakturafelter
   (fakturanummer, beløb, leverandørId, dato). Matchning er derfor
   regelbaseret felt-matching, ikke automatisk dokumentgenkendelse.
10. **Godkendelse (faktura)** — BUILT. `skiftFaktura()` → Cloud Function
    `fakturastatus` (`functions/index.js:4894`). Kræver `indkoeb.godkend`.
11. **Regnskabsgrundlag** — **PARTIAL/MOCK.** "Bogfør"-knappen sætter kun
    `fakturastatus` → `bogfoert` internt. Skærmens egen tekst: "Der sendes ikke
    noget til et regnskabssystem — der er ingen integration." Tre-vejs
    afstemningskortet (`Afstemning`-komponenten i `Fakturaer.jsx`) kalder
    `demoAfstemning()` fra `demo-indkoeb.js` **ubetinget for alle kunder** —
    dette er ikke et `useListe`-demo-faldback, men et direkte funktionskald,
    så tallene på dette kort er altid opdigtede uanset Firebase-forbindelse.
    Kontantkøb er BUILT (`kontantkoebskriv`, `functions/index.js:4983`),
    gemt som en `indkoeb`-linje.

**Konklusion:** Ingen reel OCR/dokumentgenkendelse findes noget sted i
Procure-fakturaflowet — matchning er felt-til-felt sammenligning af allerede
strukturerede data. "Send bestilling" ændrer udelukkende et statusfelt; selve
afsendelsen af mailen er en manuel handling uden for systemet, med et
kopierbart udkast som eneste systemstøtte.

## UI-mønstre

- **Navigation:** Sidemenu genereret fra `nav.js` under `indkoeb`-nøglen; alle
  syv menupunkter (`indkoebOversigt`, `indkoebsbehov`, `bestillinger`,
  `godkendelser`, `fakturaer`, `leverandoerer`, `varelager`) kræver
  `indkoeb.laes`. Menuens rækkefølge ER processen (Behov → Bestillinger →
  Godkendelser → Fakturaer), eksplicit dokumenteret i `nav.js`-kommentarer.
- **Procesbånd:** `<ol className="fc-trinbaand">` / `<ol className="fc-proces">`
  — nummererede trin med links, ikke en tilstandsmaskine ("Planchen tegner
  fem nummererede trin... det er FORLØBET — ikke hvor en bestemt post står").
- **KPI/card-design:** `KpiKort`/`KpiRaekke` — runde ikoner med `tone="ikon-N"`
  farveaccent, klikbare (`rund til="..."`) mod relevant underside. Hvert tal
  bærer sit "grundlag" i parentes når relevant (`MedGrundlag`/`Tal`-komponenter).
- **Tabeller:** `Tabel`-komponent med `kolonner`/`raekker`/`tom`-prop, paginering
  via `Sider` (`PR_SIDE = 5` på Oversigt).
- **Filtre:** `.fc-filtre` med `<select>`-elementer for leverandør/status/
  kategori/kilde; "Nulstil filtre"-knap.
- **Modaler/dialoger:** `Dialog`-komponent til begrundelseskrav (afvis behov,
  afvis ordre, afvis faktura, markér ikke-matchbar) — alle kræver fritekst
  gemt PÅ posten, ikke i auditloggen ("Fritekst hører ikke der").
- **Status/pill-farver:** `Pille tone={...}` — `ok` (grøn), `warn` (gul), `bad`
  (rød), `info` (blå/neutral). Statuskataloger (`BEHOVSTATUS`, `ORDRESTATUS`,
  `FAKTURASTATUS`, `MATCHTILSTAND`) definerer label+tone centralt.
  Ingen egendefinerede farver (CLAUDE.md-regel: kun `fc.css`-tokens).
  Kontantregisteret på Fakturaer bruger `fc-forslag`/`fc-forslag-valgt` for
  radio-valg af matchforslag.
  "Kontakt"-komponenten (custom checkbox/toggle) bruges til at slå
  godkendelsesregler til/fra: `fc-kontakt`/`fc-kontakt-til`.
- **Terminologi:** konsekvent dansk fagsprog — "behov", "bestilling"/"ordre",
  "godkendelse", "faktura", "afstemning", "kladde"; beløb altid vist ekskl.
  moms med moms som separat linje (aldrig ét inkl.-tal); alle beløb gemt som
  hele øre (`prisPrEnhedOere`, `beloebOere`) — aldrig float.

## Mulige overlap

- **`lagre` (Indkøb, reservedelslager) vs. `forbrugsvarer` (Indkøb, eget
  varelager) vs. Warehouse `varer`/`beholdning` (kundens 3PL-gods).**
  Alle tre er navnemæssigt "lagre", og `lagre` og `forbrugsvarer` ejes begge
  af samme modul (`indkoeb`) ifølge `NODE_MODUL` i moduler.js — men kun
  `forbrugsvarer` er dækket af en skærm i dette dossier (`Varelager.jsx`).
  Forholdet mellem `lagre` (der ifølge CLAUDE.md er "reservedelslageret under
  Fleet/værksted, med satser") og `forbrugsvarer` (Procures "handsker,
  strækfilm, papir, filtre") er **ikke afklaret i de læste filer** — de kan
  være to forskellige lagerbegreber (værkstedsreservedele med satser vs.
  generelle forbrugsvarer) der begge hører til Indkøb-modulet, men en læser
  kunne let tro Varelager-skærmen dækker `lagre`-noden — det gør den ikke.
  Warehouse (`varer`/`beholdning`) er derimod klart adskilt: kundens gods,
  krævet `kundeId`, en helt anden forretning (3PL-afregning). Risiko: en
  ekstern læser der ser "Varelager" i Procure-menuen kan antage det dækker
  ALT lager i systemet, inklusive kundegods eller værkstedsreservedele — det
  gør det ikke.
- **`fakturaer/` delt mellem Procure → Fakturaer og Økonomi → Fakturacenter.**
  Samme RTDB-node, samme skrivefunktioner (`fakturamatch`, `fakturastatus`,
  `fakturadestination`), bevidst uden modulklausul fordi to skærme ejer den.
  Procure → Fakturaer viser kun fakturaer med `destinationArt === "procure"`
  ("Procure-skærmen er én linse på de fælles fakturaer" — eksplicit i
  Fakturaer.jsx). Fakturacenter (Økonomi) viser den bredere, tværgående
  visning på tværs af destinationer (Procure, Fleet-sag, Facility-sag osv.).
  Risiko for en ekstern læser: at tro der er to separate faktura-systemer,
  eller at en faktura godkendt i Procure ikke tæller i Økonomi (den gør —
  samme post).
- **Afstemningskortet i Fakturaer.jsx bruger `demoAfstemning()` ubetinget.**
  I modsætning til alle andre demo-datasæt i modulet (som kun bruges som
  `useListe`/`usePost` faldback-parameter når Firebase mangler), kalder
  `Afstemning()`-komponenten `demoAfstemning()` direkte uden nogen betingelse.
  En ekstern gennemgang der kun tjekker "er der en `demo:`-prop" ville
  overse dette — her er der ingen `demo:`-prop involveret, funktionen kaldes
  råt. Dette bør ikke forveksles med den brede "demo-data er normal
  infrastruktur"-observation, som IKKE gælder her.
- **`STANDARD_GODKENDELSESREGLER` som fallback vs. faktisk `godkendelsesregler`-node.**
  Ikke et overlap i egentlig forstand, men et sted hvor to skærme
  (Godkendelser.jsx og Fakturaer.jsx) hver især kan vise "reglen" baseret på
  enten den gemte node eller standardværdien uden aktiv node — de læser
  begge samme kilde (`usePost(null, "godkendelsesregler")`) korrekt, så intet
  reelt driftrisiko fundet, men bemærkelsesværdigt at reglen for
  fakturagodkendelse ("Kræv fakturagodkendelse") styrer et flow
  (`indkoebGodkend`/`PERM_GODKEND`) hvis håndhævelse blev tilføjet sent
  (beslutning 83) — ifølge kommentaren i `Godkendelser.jsx` var kontakten
  låst indtil `fakturastatus`-funktionen fandtes, hvilket bekræfter at
  reglen nu er reelt håndhævet.

---

**IKKE PÅVIST (kunne ikke afgøres fra de læste filer):**
- Hvor/hvordan en faktura rent faktisk oprettes i `fakturaer/`-noden når
  upload ikke er bygget (mulig admin-/serverside vej ikke fundet).
- Om der findes en separat oprettelsesskærm/-vej for nye leverandører (ikke
  fundet i `Leverandoerer.jsx`, som er ren visning).
- Det præcise forhold mellem noden `lagre` og `forbrugsvarer` (begge under
  Indkøb-modulet) — ingen skærm for `lagre` blev læst i denne gennemgang, da
  den ligger uden for scope for de angivne filer.
- Om der findes en kreditnota-entitet/-flow i Procure (ingen fundet).
