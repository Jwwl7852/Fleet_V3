# OLD → CURRENT → TARGET: Fleet, Facility, Procure, Unitbooking

**Status: ANALYSE — INGEN KODEÆNDRING. Venter på produktejer-review før videre
implementering.**

Bestilt efter at V1 visuel konsolidering (commits `eeea990`, `f84fe9b`,
`ed7da7d`) blev vurderet at ligne "den eksisterende FleetControl-version med
mindre gaps/cards og drawers" — ikke masterbriefens egentlige mål: at
kombinere de GAMLE modulers arbejdsstruktur og informationshierarki med
CURRENTs nye sikkerhedsarkitektur, permissions, tenant-isolation, delte
komponenter og sag/faktura/mail/document-arkitektur.

## Kildegrundlag og metode

Det Word-dokument masterbriefen refererer til (`docs/v1-user-feedback-implementation/00_MASTER_STATUS.md`:
*"FLEETCONTROL — MASTER IMPLEMENTATION BRIEF (Word-dokument + chat-instruktion
2026-08-31)"*) findes ikke i git-repoet. Det blev fundet lokalt som
`FleetControl_V1_TEST 1a.docx` i brugerens Downloads-mappe (dateret
2026-08-31, redigeret samme dag som chat-instruktionen). Dokumentet er et
Google Docs-eksport til .docx og indeholder 44 indlejrede skærmbilleder af
"version 1" (de gamle moduler) plus løbende skreven kommentar.

Billederne er ikke navngivet efter modul i selve filen — de ligger som
rå `image5.png`…`image30.png` i dokumentets ZIP-struktur. Rækkefølgen er
rekonstrueret ved at læse `word/document.xml`'s `r:embed`-referencer i
dokumentrækkefølge og bryde dem op ved de tekstuelle sektionsoverskrifter
("FLEET:", "PROCURE:", "Facility:", "Unitbooking:"), som selv stod i
dokumentet. Facit: 15 billeder til Fleet, 13 til Procure, 10 til Facility,
6 til Unitbooking — nøjagtigt de 44 der findes i filen. En kurateret
delmængde (26 billeder) er kopieret til
`docs/product-redesign-v1/old-reference-screenshots/` i dette repo, så de
fremover kan refereres uden adgang til den oprindelige .docx. Ét billede
(`fleet-current-planlaeg-dialog.png`) er IKKE et gammelt skærmbillede — det
er et skærmbillede af CURRENT (lys DEV-bjælke), indsat af brugeren midt i
Fleet-sektionen som et direkte sammenligningspunkt, og er markeret som
sådan.

CURRENT-kolonnen er bygget på `docs/product-audit/_dossiers/04-fleet.md`,
`05-facility.md`, `06-procure-indkoeb.md`, `07-unitbooking.md` (læst og
verificeret som del af denne analyse) samt egen kode-læsning hvor
dossiererne var tvetydige.

---

## Fleet

### OLD

Hizkias eget "FleetManagement"-produkt, én flad fanebjælke øverst — **ingen
sidebar, ingen kalender som forside**:

`Overblik | Opgaver (24) | Udgifter | Service | Lastbiler | Statistik | Kontakter | Brugere | Opsætning`

- **Overblik** ([fleet-old-overblik-fuld.png](old-reference-screenshots/fleet-old-overblik-fuld.png)):
  otte KPI-felter (indberetninger, udgifter i år, dyreste bil, km/l
  bedste/dårligste, skader i år, skadefri dage, forfaldne serviceeftersyn,
  snart til service — 30 dage), **en indbygget rentabilitetsberegner**
  (indtast omsætning/overskud pr. km → udregnet km-til-break-even og
  omsætning-ved-break-even, både for hele flåden og pr. lastbil i
  gennemsnit — findes slet ikke i CURRENT), og **ét kronologisk
  aktivitetsfeed** på tværs af alle biler (lastbil / beskrivelse / type /
  beløb / dato).
- **Opgaver (24)** ([fleet-old-opgaver.png](old-reference-screenshots/fleet-old-opgaver.png)):
  ÉN flad, søgbar/filtrerbar tabel med **hver** indberetning/opgave
  nogensinde — dato, lastbil, type (pille), beskrivelse, chauffør,
  værksted, km, anslået beløb, planlagt dato, status, forsikring,
  fotoantal. "+ Ny opgave", redigér-blyant pr. række, "Print oversigt".
  Tal-badge på selve fanen (24).
- **Udgifter** ([fleet-old-udgifter.png](old-reference-screenshots/fleet-old-udgifter.png)):
  ÉN flad tabel over alle omkostningslinjer (brændstof/service/reparation/
  andet), anslået vs. faktureret beløb + difference, CSV-eksport,
  "+ Ny udgift".
- **Service** ([fleet-old-service.png](old-reference-screenshots/fleet-old-service.png)):
  kortgitter PR. SERVICETYPE (Condair, Datalogger, Klima, Lifteftersyn,
  Snekæder, Syn af vogntog, Tachograf, Vinterdæk — admin-konfigurerbar
  liste), hvert kort viser "N planlagt / lastbiler" og næste dato pr.
  køretøj med en advarselsfrist ("Advarsel 45 dage før").
- **Lastbiler** ([fleet-old-lastbiler.png](old-reference-screenshots/fleet-old-lastbiler.png)):
  kortgitter pr. køretøj, hvert kort viser udgift-i-alt + opgaveantal;
  rød kant = kræver opmærksomhed.
- **Statistik** ([fleet-old-statistik.png](old-reference-screenshots/fleet-old-statistik.png)):
  udgift pr. type, pr. lastbil, pr. chauffør, chauffør-skadeoversigt.
- **Kontakter** ([fleet-old-kontakter.png](old-reference-screenshots/fleet-old-kontakter.png)):
  chauffør- og værkstedskort (telefon/email), søg + aktiv/alle-filter —
  den efterspurgte "kontaktbog".
- **Brugere** ([fleet-old-brugere.png](old-reference-screenshots/fleet-old-brugere.png)):
  simpel brugeradministration + egen adgangskodeskift.
- **Opsætning** ([fleet-old-opsaetning.png](old-reference-screenshots/fleet-old-opsaetning.png)):
  lastbiler og chauffører redigeres **inline i tabellen** (ingen dialog pr.
  post).
- **Arbejdskø-popup** ([fleet-old-arbejdskoe-popup.png](old-reference-screenshots/fleet-old-arbejdskoe-popup.png)):
  Overblikkets KPI-felter åbner en modal med præcis de fem kategorier
  "Nye/Afventer/Planlagte/Kommende/Forsinkede" — samme koncept som
  CURRENTs fem "kasser", men **allerede i OLD kritiseret af brugeren for
  ikke at kunne planlægge derfra** ("Herinde kan man ikke få lov til at
  planlægge").

**Skreven kritik/ønsker fra brugeren (uddrag, oversat fra brief-teksten,
gælder også CURRENT hvor intet andet er nævnt):**

- Indberetning → vurdering → planlægning er reelt brudt: den valgte
  aktivitetstype fra indberetningen følger ikke med til
  planlægningsdialogen — man skal vælge den igen.
- Status skal kunne sættes til "planlagt"/"udført"; en udført opgave skal
  **forsvinde fra oversigten** men forblive opslåelig ("ligge bagved").
- En opgave skal have en sag **ved oprettelsen**, ikke først når den
  planlægges.
- En annulleret opgave skal kunne genoptages.
- Drag & drop-fakturaupload og filimport findes slet ikke.
- KPI-felterne øverst på Driftkalenderen er for store — "forestil dig en
  kunde med 140 enheder."
- Selve kalenderen kan kun vise én linje ad gangen og bør kunne
  trækkes/udvides i højden.
- "Åbn i nyt vindue" åbnede det forkerte indhold (opgaver i stedet for
  kalenderen) — se fejlfundet i [fleet-current-planlaeg-dialog.png](old-reference-screenshots/fleet-current-planlaeg-dialog.png),
  som er et CURRENT-skærmbillede brugeren selv indsatte som eksempel.
- Fakturaer-sektionen skal kunne minimeres.
- Multi-tenant/ejerkonsol er en hård forudsætning — **allerede løst i
  CURRENT**, nævnes for fuldstændighedens skyld.

### CURRENT

(Kilde: `docs/product-audit/_dossiers/04-fleet.md`, verificeret.)

4 skærme: **Enheder** (flyttet til Opsætning), **Driftskalender** (Fleets
forside — fem KPI-lignende "kasser" ovenpå en gitterkalender),
**Indberetninger** (ren visning — "Afslut" er deaktiveret, "Fase 0: skrives
ikke fra klienten endnu"), **Arbejdskø** (`skjulINav: true` — nås KUN via et
klik på en af de fem kasser eller "Åbn i nyt vindue"; indeholder faktisk de
samme fem kategorier nye/afventer/planlagt/kommende/forsinkede som OLD's
popup, bare begravet ét niveau dybere og uden sit eget menupunkt).

Sammenlignet med OLD mangler CURRENT:
- Et **Opgaver**-fane-ækvivalent som PRIMÆR, altid-synlig arbejdsliste —
  arbejdet er i stedet spredt over kalenderens synlige tidsvindue + den
  skjulte Arbejdskø + den handlingsløse Indberetninger-visning.
- **Kontakter** (kontaktbog) — findes slet ikke som skærm.
- **Statistik** for Fleet specifikt — findes slet ikke.
- **Service** (servicebog: tilbagevendende, admin-konfigurerbare
  service-/synstyper pr. enhed med intervaller og varsel) — findes slet
  ikke; CURRENT har kun ad-hoc værkstedsopgaver, ingen recurring-logik.
- **Udgifter** som egen flad liste — omkostninger vises kun indirekte via
  den delte `Modulfakturaer`-visning og enkelte KPI-tal.
- Mail/sag-integration er fase 0 (kun demo) — det er nu et **bevidst,
  dokumenteret** trin (beslutning 20), ikke en overset fejl som i OLD's
  kritik, men resultatet for brugeren er det samme: ingen reel afsendelse.

Hvad CURRENT har og OLD ikke havde (skal bevares):
- Ægte Cloud Functions for planlægning/flytning/statusskift
  (`opgaveplanlaeg`/`opgaveflyt`/`opgavestatus`) med atomar opgave +
  reservation, server-håndhævede permissions og tenant-isolation.
- Delt `Gitterkalender.jsx` (samme komponent som Facility/Disponering).
- Multi-tenant fra bunden (OLD's hårde krav er allerede opfyldt).

### TARGET

Fleet forbliver ÉN modul-rute (`/flaade`), men opdelt i faner der matcher
OLD's informationsarkitektur — kalenderen bliver ÉN fane blandt flere, ikke
hele forsiden:

`Overblik | Driftskalender | Indberetninger | Udgifter | Service | Kontakter | Statistik`

(Enheder/Opsætning rører vi ikke — allerede korrekt placeret i Opsætning
per en tidligere beslutning.)

**Tekst-wireframe, fane "Overblik" (ny standardfane, erstatter dagens
"fem kasser + kalender som ét skærmbillede"):**

```
┌──────────────────────────────────────────────────────────────────┐
│ Fleet                                       [+ Planlæg aktivitet]│
├──────────────────────────────────────────────────────────────────┤
│ [Nye (3)] [Afventer (5)] [Planlagt (12)] [Kommende (2)] [Forsinkede (4)]│  ← segmenteret filter, IKKE separate ruter
├──────────────────────────────────────────────────────────────────┤
│ START      ENHED      BESKRIVELSE          TYPE   UDFØRES AF   PRIORITET  [Handling]│
│ 29.08 08   V1T Bil 2   Skal laves inden…    Skade  V1 Tyre&Svc  Mellem    [Vurdér →]│
│ …(samme sortering/data som dagens Arbejdskoe.jsx)…                        │
├──────────────────────────────────────────────────────────────────┤
│ ▸ Omkostninger denne måned (mini)      ▸ Kommende service (mini)  │
└──────────────────────────────────────────────────────────────────┘
```

**Genbrugte komponenter/funktioner (uændrede):** `Tabel`, `Pille`, `Knap`,
`Kpiadgang`, `Datatilstand`, det segmenterede filter-mønster (`.fc-seg`,
allerede brugt til dag/uge/måned), `driftstal()`/`sorterKoe()` fra
`driftskalender.js`.

**Flyttet visuelt, ikke teknisk:** hele `Arbejdskoe.jsx`s indhold og data —
samme funktion, samme kilde, ny placering: **forsiden** i stedet for en
skjult underside nået via et KPI-klik. `skjulINav` fjernes fra ruten (eller
ruten lægges helt ind under Overblik-fanen).

**Ny funktionalitet krævet (ikke kun flytning):**
1. En reel skrivevej for indberetningens forløbstilstand ("vurdér" →
   "planlagt"), som i dag mangler helt (bekræftet MOCK/DEMO i dossieret).
2. Forudfyldning af aktivitetstype fra indberetningens `art`, når "Planlæg"
   trykkes fra denne liste (retter OLD's dokumenterede fejl, som stadig
   gælder i CURRENT, da samme Planlaegdialog bruges).
3. Fanen **Udgifter**: ny SAMLENDE visning (genbruger `indkoeb`/
   `fakturaer`-data filtreret `art:"fleet"`, samme `Tabel`-komponent) —
   ingen ny datamodel, kun en manglende visning af data der allerede findes.
4. Fanen **Service** (servicebog): reelt NY datamodel — en
   admin-konfigurerbar liste af tilbagevendende servicetyper pr. enhed med
   interval og varselsfrist. Findes ikke i dag i nogen form.
5. Fanen **Kontakter** (kontaktbog): ny skærm, men genbruger eksisterende
   data 1:1 — chauffører fra `personale`, værksteder/leverandører fra
   `leverandoerer` (kategorifiltreret). Ren ny visning.
6. Fanen **Statistik**: ny skærm, genbruger `useKpi()`-infrastrukturen;
   kræver muligvis nye aggregerede felter (udgift pr. chauffør fandtes ikke
   før).
7. Driftkalender-fanen: behold `Gitterkalender.jsx` uændret, men gør
   KPI-headeren mindre/sammenklappelig og kalenderens højde trækbar — dette
   ER et reelt layout-arbejde (ikke kun tokens), adresserer OLD's "for
   store felter"/"kan kun se 1 linje"-kritik.

---

## Procure

### OLD

`Overblik | Ordrer | Fakturaer (5) | Arkiv (3) | Leverandører | Varer | Statistik | Opsætning`

- **Overblik** ([procure-old-overblik.png](old-reference-screenshots/procure-old-overblik.png)):
  fire tælletal (Oprettet/Bestilt/Modtaget/Faktura modtaget), én
  advarselslinje ("5 ordrer afventer faktura"), og **ÉN** tabel "Alle
  aktive ordrer" — status som PILLE i én kolonne, ikke tre separate sider.
  En ordre er ÉN post der bevæger sig gennem statusser, ikke tre forskellige
  poster på tre forskellige skærme.
- **Ny ordre** ([procure-old-ny-ordre.png](old-reference-screenshots/procure-old-ny-ordre.png)):
  ordretitel, leverandør, dato, oprettet af, bemærkning, varelinjer, total
  — ét enkelt trin, intet synligt separat "behov"-godkendelsestrin for den
  almindelige bruger.
- **Arkiv** ([procure-old-arkiv.png](old-reference-screenshots/procure-old-arkiv.png)):
  færdigfakturerede/afsluttede ordrer med løbende sum ("I alt: 23.692,57 kr
  faktureret (3 poster)") — adskilt fra den AKTIVE liste.
- **Varer** ([procure-old-varer.png](old-reference-screenshots/procure-old-varer.png)):
  **global varemaster** — varenr., navn, to-niveau kategori ("Snedkeri /
  Skruer", "Lager / Emballage" osv.), leverandør, **seneste pris**, enhed —
  søgbar/filtrérbar, "+ Ny vare".
- **Statistik** ([procure-old-statistik.png](old-reference-screenshots/procure-old-statistik.png)):
  periodevalg (3/6/12 mdr/1 år/custom), fire KPI (forbrug i periode / samme
  periode sidste år / ændring / antal fakturaer), graf over tid (år-over-år
  overlejret), forbrug pr. leverandør, forbrug pr. kategori, fuld
  fakturaliste.

**Skreven kommentar (kort, ingen funktionel kritik):** *"Ligesom Fleet
modulet, så er det meget nemt at arbejde i. Vi har brug for at den nye
version også bliver ligeså let at arbejde i som den gamle."* — dvs. kravet
er at BEVARE letheden, ikke at rette konkrete fejl.

### CURRENT

(Kilde: `docs/product-audit/_dossiers/06-procure-indkoeb.md`.)

7 skærme: Oversigt, Behov, Bestillinger, Godkendelser, Fakturaer,
Leverandører, Varelager. Sammenlignet med OLD:

- Pipelinen (behov → bestilling → godkendelse) er spredt over **tre
  separate sider** i stedet for OLD's ÉN liste med statuspil.
- **Ingen global varemaster.** README bekræfter selv at dette er
  `NOT STARTED` (§7.2–7.5). CURRENTs "Varelager" er noget andet:
  Procures EGET reservedelslager (`forbrugsvarer`), ikke en prisliste over
  alt hvad der er købt hos alle leverandører.
- **Ingen Arkiv-skærm** — afsluttede ordrer/fakturaer forsvinder ikke
  lige så rent fra de aktive lister.
- **Ingen Statistik-skærm.**

Hvad CURRENT har og OLD ikke havde (skal bevares uændret):
- Ægte fire-øjne-godkendelse (kan slås fra), server-håndhævet
  (`ordrestatus`, `godkendelsesregelskriv`).
- Delt `fakturaer/`-node med Økonomi → Fakturacenter (bevidst arkitektur).
- Transparent fakturamatch-scoring (`matchForslag()`).
- Permissions/tenant-isolation/audit på hele kæden.
- Mailudkast (kopiér, ikke send) — samme begrænsning som OLD havde reelt
  (ingen af versionerne sender mail), men CURRENT er ærlig om det.

### TARGET

`Overblik | Fakturaer | Arkiv | Varer | Leverandører | Statistik`

**Tekst-wireframe, fane "Overblik" (erstatter Oversigt+Behov+Bestillinger+Godkendelser som fire separate sider):**

```
┌────────────────────────────────────────────────────────────────┐
│ Procure                                             [+ Nyt behov]│
├────────────────────────────────────────────────────────────────┤
│ [Nyt behov (2)] [Bestilt (4)] [Afventer godkendelse (1)] [Modtaget (5)]│  ← klikbare filter-tiles, ikke separate ruter
├────────────────────────────────────────────────────────────────┤
│ STATUS              DATO    ORDRE            LEVERANDØR  OPRETTET AF [Åbn]│
│ ● Afventer godkend.  27/08   Skruer Snedkeri  Würth       Anton S    [Åbn]│
│ …                                                                          │
└────────────────────────────────────────────────────────────────┘
```

**Genbrugte funktioner (uændrede backend):** `behovskriv`, `ordreskriv`,
`ordrestatus`, `godkendelsesregelskriv` — kun tre skærme samles visuelt til
én liste med en statuskolonne; ingen af de tre Cloud Functions eller deres
permissions ændres.

**Flyttet visuelt, ikke teknisk:** Behov, Bestillinger og Godkendelsers
indhold — samme data, samme skrivefunktioner, ny fælles tabel i stedet for
tre sider man skal klikke sig igennem i rækkefølge.

**Ny funktionalitet krævet:**
1. **Arkiv-fane:** ren visning (filtrér eksisterende `indkoebsordrer`+
   `fakturaer` på afsluttet status) — ingen ny datamodel, men en manglende
   VISNING.
2. **Varer-fane udvidet til reel global varemaster:** dette ER nyt arbejde
   — README's allerede identificerede, ubyggede §7.2–7.5
   (leverandørvarer-relation, kategorier, seneste-pris-opslag på tværs af
   leverandører). Bør designes som sin egen skive, ikke klemmes ind her.
3. **Statistik-fane:** ny skærm, genbruger `useKpi()` + den eksisterende
   `indkoeb`-historik som Leverandoerer.jsx allerede regner
   leverandørperformance af.
4. Godkendelsesreglerne flyttes til den generelle Opsætning-sektion,
   konsistent med README §15's igangværende "globalt Opsætnings-hjem".

---

## Facility

### OLD

`Overblik | Inventar | Service & reparation | Planlagt (2) | Statistik`

(Note: dette er **ordret** den struktur brugeren selv efterspurgte i sit
seneste svar til mig — bekræftet at stamme direkte fra brief-teksten.)

- **Overblik** ([facility-old-overblik.png](old-reference-screenshots/facility-old-overblik.png)):
  fire KPI (aktivt inventar / samlet værdi / service inden 30 dage / service
  overskredet), **"Kommende & overskredne services"**-tabel med **et
  "+ Opret opgave"-knap direkte på hver række**, og "Seneste
  serviceaktivitet" (status/dato/type/inventar/udgift).
- **Inventar** ([facility-old-inventar.png](old-reference-screenshots/facility-old-inventar.png)):
  flad tabel over alt inventar, med **et "+ Service"-knap direkte på hver
  række** — igen, handling ligger ved objektet.
- **Service & reparation** ([facility-old-service-reparation.png](old-reference-screenshots/facility-old-service-reparation.png)):
  fire KPI (planlagt/i gang/udført i år/serviceudgift i år) + ÉN flad
  tabel over ALLE opgaver, med **status som en inline-redigérbar
  dropdown** direkte i tabellen.
- **Planlagt** ([facility-old-planlagt.png](old-reference-screenshots/facility-old-planlagt.png)):
  to lister — "Inventar der snart skal serviceres" (afledt af
  næste-service-dato, med samme "+ Opret opgave"-genvej) og "Åbne opgaver
  (planlagt/i gang)".
- **Statistik** ([facility-old-statistik.png](old-reference-screenshots/facility-old-statistik.png)):
  samme mønster som Procures Statistik — periodevalg, KPI, graf over tid,
  forbrug pr. inventar/type/kategori/leverandør.

**Skreven kommentar:** *"Syntes jeg også vi skal lave samme princip som i
det gamle modul blandet med det nye vi har udviklet."*

### CURRENT

(Kilde: `docs/product-audit/_dossiers/05-facility.md`.)

3 skærme: Overblik & fejl, Servicekalender, Klima & energi (skjult).
Sammenlignet med OLD:

- Servicekalenderen er en **gitterkalender-first** side (delt komponent med
  Fleet/Disponering) — ingen flad "alle opgaver"-tabel svarende til OLD's
  "Service & reparation". (Efter dagens `ed7da7d`-commit har den nu en
  drawer for et valgt besøg, men selve kalenderen er stadig den PRIMÆRE
  overflade, ikke en liste.)
- **Ingen** "+ Service"-knap direkte på en anlægsrække i Overblik/Inventar
  — Overblikkets aktivtabel viser status og næste service, men opretter
  ikke en opgave derfra.
- **Ingen** Planlagt-fane.
- **Ingen** Statistik-fane.
- Dokumenteret, aktivt hul: "Estimeret omkostning" (Overblik) og "Anslået
  omkostning" (Servicekalender) er to overlappende tal, hvor
  `estimatForAktiv()` i Overblik rent faktisk slår op i `DEMO_SERVICEBESOEG`
  i stedet for den rigtige, hentede opgaveliste — en reel driftrisiko der
  bør rettes samtidig med restruktureringen, ikke separat.

Hvad CURRENT har og OLD ikke havde (skal bevares):
- Ægte, server-håndhævet reservationskonflikt inkl. "hallen og porten er ét
  rum" (`indeslutninger()`/`tjekLedigIndesluttet()`), atomar opgave +
  reservation via `facilityplanlaeg`/`opgaveflyt`/`opgavestatus`.
- Delt `Gitterkalender.jsx`.

### TARGET

`Overblik | Inventar | Service & reparation | Planlagt | Statistik`

**Tekst-wireframe, fane "Overblik" (udvidet med rigtig handling-ved-objektet):**

```
┌───────────────────────────────────────────────────────────────┐
│ Facility                                                        │
├───────────────────────────────────────────────────────────────┤
│ [Aktivt inventar 15] [Service <30 dage 6] [Overskredet 0] [Åbne fejl 4]│
├───────────────────────────────────────────────────────────────┤
│ Kommende & overskredne services                                  │
│ ANLÆG        LOKATION       NÆSTE SERVICE     INTERVAL  [+Opret opgave]│
│ Port 3       Hal B, Kolding 30.08 (om 2 dg)    12 mdr    [+Opret opgave]│
├───────────────────────────────────────────────────────────────┤
│ Seneste serviceaktivitet (status/dato/type/anlæg/udgift)          │
└───────────────────────────────────────────────────────────────┘
```

**Genbrugte funktioner (uændrede backend):** `facilityplanlaeg`,
`opgaveflyt`, `opgavestatus`, `gem()`/`byggAktiv()`/`valideAktiv()` for selve
anlægsredigeringen. Den nye "+ Opret opgave"-knap på en Overblik/Inventar-
række åbner den EKSISTERENDE `Servicedialog`, forudfyldt med anlægget —
ingen ny Cloud Function.

**Flyttet visuelt, ikke teknisk:** ingen større flytning her — Facility
manglede reelt de to nye faner (Planlagt, Statistik) og de to
knap-på-række-genveje, snarere end at have data spredt forkert.

**Genbrugt fra i går:** `Besoegspanel`-draweren (`ed7da7d`) genbruges
UÆNDRET som detaljepanelet for "Service & reparation"-fanens tabel — samme
Overblik/Sag-faneopdeling, samme delte `Sagsvisning`.

**Ny funktionalitet krævet:**
1. "+ Opret opgave"/"+ Service"-genveje direkte på en anlægsrække i
   Overblik og Inventar (kalder eksisterende `Servicedialog`, kun en ny
   UI-indgang).
2. **Rettelse af `estimatForAktiv()`-hullet** som en del af denne
   restrukturering — den skal læse den rigtige `opgaver`-liste, ikke
   `DEMO_SERVICEBESOEG`. Anbefales gjort SAMTIDIG, fordi den nye
   Overblik-tabel ellers ville arve den samme fejl synligt for første gang.
3. **Inventar-fane:** ny visning af data Oversigt.jsx allerede henter
   (`facility/aktiver`+`facility/lokationer`) som en dedikeret, filtrerbar
   fane frem for kun en tabel nederst på Overblik.
4. **Planlagt-fane:** ny, ren afledt visning (filtrér samme opgaveliste på
   status + sortér efter næste-service-dato) — ingen ny datamodel.
5. **Statistik-fane:** ny skærm, genbruger `useKpi()` + historisk
   `opgaver`(art=facility)-data. Kan for første gang også vise
   `facility/omkostning` (bygningsomkostninger), som i dag har en fuld
   skriveregel men ingen skærm der bruger den — et bekræftet, uafklaret hul.

---

## Unitbooking

### OLD (Turtlebooking — Hizkias eget produkt)

`Dashboard | Bookinger | Reolpladser | Historik | Kalender | Opsætning`

- **Dashboard** ([unitbooking-old-dashboard.png](old-reference-screenshots/unitbooking-old-dashboard.png)):
  fire lifecycle-tal (Ledige kasser/Bookede/Klargjorte/Udlånte — samme fire
  tilstande som CURRENT bruger), **"Hurtighandlinger"**: fem ét-klik-knapper
  (+ Ny booking, Kasse retur, + Ny kunde, Flyt kasse, Kasseoversigt), og
  **"Bookede kasser"**-tabel med handling direkte på hver række (Print
  seddel / Markér klargjort / Annullér).
- **Reolpladser** ([unitbooking-old-reolpladser.png](old-reference-screenshots/unitbooking-old-reolpladser.png)):
  to-kolonne CRUD — "Flyt kasse"-hurtigformular + forklarende
  opbygningseksempel (Hal→Reol→Fag→Hylde→Plads) i venstre spalte,
  pallereol-liste med optælling + "Opret reolplads"-formular i højre. **Ingen
  kalender her** — bekræftet eksplicit i brief-teksten: *"Denne del har
  ingen visuel kalender i det gamle."*
- **Opsætning** ([unitbooking-old-opsaetning.png](old-reference-screenshots/unitbooking-old-opsaetning.png)):
  otte-flise launcher-grid: Kasser / Kunder / Kassetyper / Reolpladser /
  Brugere / Rapporter / Excel-import / QR-koder.

**Skreven kommentar:** *"Jeg kan godt lide vores nye version, men vi kan
også rigtig godt lide den gamle mere simple version. Vi vil derfor gerne
have lavet en kombi af de 2 versioner. Denne version [den nye] kan selv
regne ud om unit er ledig eller ej."* — dvs. brugeren vil eksplicit BEHOLDE
CURRENTs ledighedsberegning, kombineret med OLD's enklere,
handling-først-forside. Samt: *"Placering: denne del skal jo arbejde sammen
med warehouse modulet… Man skal jo selvfølgelig kunne vælge reolen manuelt,
men også scanne placering med scanne enhed."*

### CURRENT

(Kilde: `docs/product-audit/_dossiers/07-unitbooking.md`.)

5 skærme: Kalender (forside), Udlån, Historik, Reolpladser, Kasseliste
(Opsætning). Sammenlignet med OLD:

- **Kalenderen ER forsiden** — modsat OLD, hvor et tal+handling-Dashboard
  var forsiden og en kalender ikke fandtes overhovedet.
- **Ingen "Hurtighandlinger"** på forsiden — man skal ind på Udlån-skærmen
  for at søge/reservere.
- **Ingen** Excel-import, QR-kode-skærm/-scanning eller dedikeret
  Rapporter-side.
- Ledighedsberegningen er reelt BEDRE end OLD (transaktionsbaseret
  konflikthåndtering server-side i `kasseudlaanskriv`) — dette er præcis
  det brugeren selv sagde skal bevares.
- `reolpladser` delt med Warehouse er allerede korrekt, bevidst arkitektur
  (bekræftet i `moduler.js`) — matcher brugerens eget krav om at Placering
  skal arbejde sammen med Warehouse.

### TARGET

`Dashboard | Kalender | Udlån | Historik | Reolpladser`

(Kasseliste/Opsætning rører vi ikke unødigt — evt. samles den senere med
Kunder/Kassetyper i et flise-launcher-mønster som README §15 allerede
arbejder mod for hele appen.)

**Tekst-wireframe, ny fane "Dashboard" (kombinerer OLD's enkelhed med
CURRENTs ledighedslogik):**

```
┌─────────────────────────────────────────────────────────────────┐
│ Unitbooking          [Dashboard] [Kalender] [Udlån] [Historik] [Reolpladser]│
├─────────────────────────────────────────────────────────────────┤
│ [Ledige 64] [Bookede 23] [Klargjorte 3] [Udlånte 75]              │
├─────────────────────────────────────────────────────────────────┤
│ Hurtighandlinger: [+ Ny booking] [Kasse retur] [+ Ny kunde] [Flyt kasse]│
├─────────────────────────────────────────────────────────────────┤
│ Bookede kasser (klar til klargøring)                               │
│ KASSE  KUNDE   SAG   PERIODE   [Print seddel][Klargjort][Annullér] │
└─────────────────────────────────────────────────────────────────┘
```

**Genbrugte funktioner (uændrede backend):** `kasseudlaanskriv` (hele
tilstandsmaskinen: reservér/klargør/udlevér/modtag retur/annullér),
`ledigeKasser()`, `KpiKort`/`KpiRaekke`-mønsteret allerede brugt på Kalender.

**Flyttet visuelt, ikke teknisk:** de fire lifecycle-tal findes allerede
som KPI'er på Kalender-fanen i dag — de flyttes til at være den nye
forsides primære indhold i stedet for et sekundært element ved siden af
gitteret. "Bookede kasser der venter på klargøring" er allerede en
delmængde af data Kalenderen henter (`kasseudlaan` filtreret på status) —
ingen ny node.

**Ny funktionalitet krævet:**
1. **Hurtighandlinger-rækken:** fire genveje der åbner de EKSISTERENDE
   dialoger (Reservationsformular → `opretUdlaan`, statusskift →
   `skiftUdlaan`, kundeoprettelse) direkte fra forsiden — ingen ny
   forretningslogik, kun nye indgangspunkter.
2. **Excel-import** af stamdata (kasser/reolpladser) — findes ikke i nogen
   form i dag.
3. **QR-kode-generering og -scanning** til kasser — et gennemgående tema i
   HELE masterbriefen (Fleet-indberetning efterspørger det samme). Bør
   overvejes som en delt, fremtidig kapacitet frem for en unitbooking-egen
   løsning, men er IKKE bygget i dag nogen steder.
4. En dedikeret **Rapporter**-side — OLD havde en, CURRENT har ingen samlet
   rapport-/statistikvisning for Unitbooking.

---

## Hvilke dele af de seneste designcommits stadig passer ind

- **`eeea990`** (fleet.css-fundamentet: `.fc-card`, `.fc-dialog`,
  `.fc-kpi`, `.fc-table` osv. strammet): **Modul-uafhængigt.** Gælder
  uanset hvordan skærmene omstruktureres til faner ovenfor — bevares 100 %.
- **`f84fe9b`** (samme fundament udvidet til Facility + `Dialog
  variant="drawer"` tilføjet): CSS-tokens bevares. Selve
  drawer-VARIANTEN er nu et bekræftet, genanvendeligt princip i TARGET
  (bruges som detaljepanel i Fleets "Service"-fane og Facilitys "Service &
  reparation"-fane) — men Servicekalender.jsx, som fik den først, bliver
  selv omstruktureret ovenpå (fra egen skærm til én fane blandt flere).
- **`ed7da7d`** (drawer taget i brug: Fleets `Haendelsespanel`, Facilitys
  nye `Besoegspanel`): Selve MEKANIKKEN og Overblik/Sag-faneopdelingen i
  begge paneler er PRÆCIS det mønster TARGET foreslår genbrugt som
  detaljepanel for "Service & reparation"-listerne i begge moduler.
  Implementeringerne overlever i store træk — de kommer bare til at sidde
  i en anden overordnet sidestruktur (en fane-bjælke i stedet for
  kalenderen som eneste forside).

**Konklusion:** Intet af det byggede CSS-/drawer-arbejde skal rulles
tilbage. Det var korrekt retning på et for snævert lag (mellemrum og
paneler) uden at røre det lag brugeren faktisk reagerede på
(sideinddeling, informationshierarki, hvor handling ligger). TARGET
ovenfor er det manglende lag ovenpå det allerede byggede fundament.

---

## Åbne spørgsmål til produktejer

1. **Fane-bjælke vs. sidebar-underpunkter:** Denne analyse foreslår en
   horisontal fane-bjælke øverst i hvert modul (som begge referenceapps
   konsekvent brugte), fordi den bedre synliggør "dette er ét fladt modul,
   vælg din linse" end en sammenklappelig sidebar-undertræ gør. Det er dog
   et sekundært designvalg, ikke et krav fra brief-teksten — bekræft før
   implementering.
2. **Rækkefølge:** ingen af de fire moduler blokerer hinanden teknisk.
   Forslag: Fleet først (størst brugerkritik, mest konkret nyt arbejde:
   servicebog + kontaktbog + vurdér-skrivevej), derefter Facility (mindst
   ny funktionalitet, mest ren omstrukturering + ét bug-fix), derefter
   Procure og Unitbooking parallelt (begge kræver en afgrænset ny
   funktionsblok — global varemaster hhv. Excel-import/QR — der med fordel
   kan scopes som egne skiver).
3. **§9 (Fleet-konsolidering, 12 delpunkter)** i `00_MASTER_STATUS.md` er
   stadig ikke delt i fuld tekst i nogen tilgængelig kilde. Flere af denne
   analyses Fleet-forslag (servicebog, kontaktbog, sag-ved-oprettelse,
   annulleret-opgave-genoptagelse) matcher ordret §9's stikordsliste
   ("servicebog, kontaktbog" nævnes eksplicit) — men det bør bekræftes at
   der ikke er yderligere detaljer i §9 som ikke fremgår af denne analyse.

**Ingen kodeændringer foretaget i denne analyse. Afventer godkendelse før
implementering genoptages.**
