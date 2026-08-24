# 08 — UI-konsistens-audit

**Metode:** Dette dokument er en syntese af "## UI-mønstre"-afsnittene i de
11 modul-dossierer (`_dossiers/01` til `_dossiers/11`), suppleret med én
runde direkte verifikation mod de delte UI-primitiver i
`src/fleet/ui.jsx` og et sæt målrettede `grep`-stikprøver over
`src/moduler/` for at se hvor konsekvent primitiverne faktisk bruges i
praksis, frem for kun i dossierernes beskrivelse. Der er ikke foretaget
nogen visuel/skærmbillede-gennemgang — hvor det ville have krævet det, er
det skrevet eksplicit.

Dette dokument identificerer mønstre. Det foreslår ingen løsning eller
redesign af noget af det, der beskrives.

---

## Konsistente mønstre

Alle 11 dossierer bekræfter uafhængigt af hinanden, at skærmene bygger på
det samme lille sæt primitiver fra `src/fleet/ui.jsx`, og stikprøven
bekræfter at det ikke kun er en påstand i kommentarer: `Knap` bruges i 51
filer under `src/moduler/`, `KpiKort` i 43, `Pille` i 57, `Dialog` i 7.
`ui.jsx`'s egen indledende kommentar sætter formålet eksplicit:
"Modulerne definerer ikke egne kort, tabeller, statuschips eller tomme
tilstande — så kan de heller ikke se forskellige ud fra skærm til skærm."

- **Navigation:** Ingen modul bygger sin egen sidebar, tenant-vælger eller
  periodevælger — det er forbudt i CLAUDE.md og bekræftet fraværende i alle
  11 dossierer. Sidebaren genereres ét sted, af `nav.js`. Tre dossierer
  (02, 06, 09) bemærker desuden at menurækkefølgen selv kommunikerer et
  workflow (Behov → Bestillinger → Godkendelser → Fakturaer i Procure), ikke
  kun en liste af sider.
- **Topnavigation/breadcrumbs:** Ingen dossier nævner en selvstændig
  breadcrumb-komponent — navigation sker via sidebar plus inline links
  ("kommer typisk fra"/"går typisk til" i hver skærmbeskrivelse), aldrig en
  brødkrumme-linje foroven.
- **Kort/KPI-design:** `Kort`, `KpiKort` og `KpiRaekke` er det mest
  konsekvent citerede mønster i samtlige 11 dossierer — runde ikoner med
  `ikon-N`/`tone`-farve, valgfrit `rund` og `til=` (hele kortet som link
  med chevron), og `afvigelse` bygget udelukkende via `deviation()`
  (`format.js`), aldrig en håndskrevet streng. Det er samme mekanisme, der
  forhindrer at et plus er rødt på én skærm og grønt på en anden
  (kommentar i `ui.jsx`).
- **Tabeller:** `Tabel`-komponenten (`kolonner`/`raekker`/`tom`) går igen i
  alle 11 dossierer, med `paaRaekke`/`erValgt` for klikbare hele rækker
  (ikke kun en lille radioknap) og `noegle` for stabile React-nøgler på
  nøglede (ikke-array) RTDB-strukturer. Paginering sker konsekvent via den
  delte `Sider`-komponent, aldrig en skærmspecifik løsning.
- **Filtre:** Modulerne bygger `.fc-filtre`/`.fc-felt`-blokke selv, men
  ALDRIG en periode- eller tenant-vælger — de ejes af shellen. Flere
  dossierer (02, 05) bemærker eksplicit at et filter er UDELADT med vilje
  og forklaret hvorfor, frem for enten at gentage shellens filtre eller
  tie om fraværet.
- **Modaler/dialoger:** `Dialog`-komponenten (`role="dialog"`,
  Escape-lukning, klik-på-baggrund-der-startede-der lukker, ingen
  fokusfælde) bruges konsekvent til begrundelseskrav (afvis behov/ordre/
  faktura, "ingen destination passer") og til planlægningsdialoger
  (`Planlaegdialog`, `Servicedialog`, `Forslagsdialog`). Se dog "Hvor samme
  komponent ser forskellig ud" for de moduler, der bevidst IKKE bruger den.
- **Statusfarver:** `Pille`-komponenten med det faste tone-katalog
  (`ok`/`warn`/`bad`/`info`) går igen i samtlige 11 dossierer, altid drevet
  af et navngivet katalog i domænekoden (`TILSTAND`, `OPGAVE_STATUS`,
  `HAENDELSE`, `PERSONALE_STATUS`, `CARRIER_STATUS`, `ORDRE_TILSTAND` osv.)
  — aldrig en friskrevet statusstreng i selve skærmen. `ui.jsx` bekræfter
  at seriefarver (kategorier) og statusfarver (toner) bevidst er to
  forskellige paletter (beslutning 30), for at rødt ikke både betyder
  "kritisk" og "femte kategori".
- **Knapper og deaktiveret-tilstand:** Det klart mest gentagne enkeltmønster
  på tværs af alle 11 dossierer: en deaktiveret knap bærer ALTID en `title`
  der forklarer hvorfor (manglende permission, "Fase 0", "ikke bygget
  endnu"), aldrig en stum grå knap. Formuleringen "en knap der ikke gør
  noget uden at sige hvorfor, er værre end ingen knap" (eller nær-identiske
  varianter) optræder i dossier 01, 02, 03, 04, 05, 06, 09, 10 og 11.
- **Formularer:** `Formular`/`Felt`/`Feltraekke`/`Formularsvar` bruges
  konsekvent til skrivende skærme (bekræftet i dossier 01, 02, 03, 06, 08,
  09), med samme adfærd: knappen deaktiveres mens skrivningen kører
  (`gemmer`), og et afvist skriv (`permission-denied`) vises med en anden
  tone end en nedbrudt forbindelse.
- **Tomme/fejl-/afviste tilstande:** `Tom`, `Fejl`, `Henter` og især
  `Datatilstand` bruges gennemgående i stedet for skærmspecifik fejltekst.
  `Datatilstand` skelner eksplicit mellem "ingen forbindelse",
  "uautentificeret", "nægtet" (regel afviste — systemet virker),
  "modulMangler" (intet spurgt, ingen fejl) og "ikkeAggregeret" (nul er
  ikke det samme som "endnu ikke regnet") — et skel flere dossierer (01,
  05, 06, 09) bekræfter bliver overholdt i praksis.
- **Terminologi:** Konsekvent dansk domænesprog gennem hele appen — samme
  ord for samme begreb på tværs af moduler, ikke kun inden for ét modul
  (fx "etape"/"forløb"/"forslag" i Booking, "håndteringer" ikke "paller",
  "omkostning" ikke "pris" for driftsomkostninger).

---

## Hvor samme komponent ser forskellig ud

- **Driftskalenderens fem "kasser" er bevidst IKKE `KpiKort`** (dossier 04):
  de har en indbygget `Delknap`/`DELIKON`-funktion ("Åbn"/"Åbn i nyt
  vindue"), som et link-baseret `KpiKort` ikke kan rumme. Det er en
  dokumenteret, begrundet afvigelse — men betyder at to visuelt lignende
  KPI-agtige kortrækker i appen faktisk er to forskellige komponenter.
- **Chaufførappen (`/app/*`) bruger et helt separat klassesæt** (`fc-app-*`
  i stedet for `fc-card`/`fc-tabel`, dossier 11) og — bekræftet ved
  `grep`-stikprøve i denne runde — bruger rå `<button className="fc-btn …">`
  fire steder (`Frihed.jsx`, `Indberetning.jsx`, `Timeregistrering.jsx`,
  `Turplan.jsx`) i stedet for den delte `Knap`-komponent, som ellers bruges
  i 51 andre filer under `src/moduler/`. Det er konsistent med at
  chaufførappen er en bevidst separat, mobil-orienteret formsprog (se
  "Desktop/mobile patterns" nedenfor) — men det betyder også, at
  knap-mønsteret ikke er 100 % ét komponentkald i hele kodebasen, kun i
  kontorskærmene.
- **Bemandingsplanen bygger sin egen 7-kolonners ugetabel manuelt med
  `Date`-baseret ugestart** i stedet for at bruge den delte
  `Gitterkalender.jsx`-komponent, som Driftskalender, Servicekalender,
  Disponering og Unitbookings Kalender alle deler (dossier 03, bekræftet
  ved `grep`: `Gitterkalender` importeres i netop disse fire filer og ingen
  andre). Bemandingsplanen er desuden ren demo-data uden en rigtig
  vagtnode, så divergensen har ingen datamæssig konsekvens i dag — men det
  er den ene kalenderlignende skærm i appen, der IKKE deler komponenten med
  de øvrige.
- **Modaler vs. inline-formularer er ikke ét mønster på tværs af appen.**
  De fleste moduler (Booking, Fakturacenter, Facility, Fleet) bruger den
  delte `Dialog`-komponent til skrivende handlinger. Andre bruger bevidst
  INGEN modal: Workforce/Medarbejdere viser formularen inline over listen
  ("så man ser den man netop har oprettet", dossier 03), hele Unitbooking
  bruger inline-ekspansion i stedet for overlay (dossier 07), og både
  Support og Ejerkonsol gør det samme (dossier 10: "Ingen modal-dialoger —
  begge moduler bruger inline-ekspansion … i stedet for et overlay"). Dette
  er i hvert enkelt tilfælde en dokumenteret, begrundet beslutning — men
  summen er, at en bruger, der bevæger sig mellem fx Booking og
  Unitbooking, møder to forskellige interaktionsmønstre for "opret en ny
  post".
- **Grafkomponenterne (`Donut`, `Soejlegraf`, `Linjegraf`, `MiniKurve`) ser
  ud til at være reelt ensartede** — dossier 05 undersøgte dette specifikt
  for Facility → Klima og konkluderer eksplicit "Ingen stilistisk afvigelse
  fundet … Klima bruger ikke et separat chart-bibliotek eller egne farver."
  Ingen af de øvrige 10 dossierer flagger et modstridende fund. Dette er
  den ene kategori, hvor synteserunden IKKE fandt en afvigelse at
  rapportere.
- **Ejerkonsollen (`Udbyderramme`) genbruger de samme `Kort`/`KpiKort`/
  `Tabel`-primitiver som resten af appen**, selvom den renderes helt uden
  for den normale skal (dossier 10) — komponentbiblioteket er altså
  konsistent selv på tværs af de tre forskellige "rammer" (se
  "Desktop/mobile patterns"), kun selve skal-strukturen omkring det er
  forskellig.

---

## Hvor samme funktion har forskellige navne

Dossiererne fremhæver flere eksplicitte "X ≠ Y"-distinktioner, som
kildekoden selv advarer imod at forveksle:

- **`lagre` vs. `forbrugsvarer` vs. Warehouses `varer`/`beholdning`**
  (dossier 06, 08): tre lagerbegreber, hvoraf de to første begge ejes af
  Indkøb-modulet. Forholdet mellem `lagre` (reservedelslager, med satser)
  og `forbrugsvarer` (Procures eget "handsker, strækfilm, papir, filtre")
  er IKKE PÅVIST i de læste filer — begge dossierer flagger risikoen for at
  en ekstern læser tror "Varelager" i Procure-menuen dækker alt lager,
  inklusive kundegods.
- **`kasser` (Unitbooking) vs. `carriers` (Warehouse)** (dossier 07, 08):
  fysisk samme koncept (en beholder på en hylde), bevidst to adskilte
  noder, to adskilte tilstandsmaskiner og to adskilte skrivepermissions —
  begrundet eksplicit i kildekoden ("Det er `kasse` én gang til, og svaret
  blev alligevel to noder"). Modulnavnet `warehouse` selv har historisk
  skiftet to gange (Warehouse → Turtlebooking → Unitbooking, jf. CLAUDE.md)
  netop for at undgå denne kollision.
- **`personId` vs. `uid`** (dossier 03, 11, og CLAUDE.md): `uid` er hvem
  der GJORDE noget (audit, `oprettetAf`); `personId` er hvem det HANDLER
  OM (reservationer, fravær, opgaver, etaper, kompetencer). Dossier 03
  fremhæver dette som en bevidst dokumenteret forvekslingsrisiko, fordi
  `personale`- og `brugere`-posterne nu ligger side om side i menuen.
- **"Funktioner" (Bemanding) vs. "roller" (adgangsmodellen)** (dossier 03):
  Bemanding-modulet bruger bevidst ordet "funktioner" om chauffør/
  mekaniker/lager for at undgå navnesammenstød med de syv
  permission-roller, der også hedder noget i retning af roller på dansk.
- **`personale` (person, stamdata) vs. `brugere` (login)** (dossier 03,
  09): en `personale`-post repræsenterer PERSONEN; en `brugere`-post
  repræsenterer et LOGIN. En chauffør har måske aldrig et login.
  Menupunkterne "Medarbejdere" og "Brugere & roller" ligger nu som naboer i
  Opsætning-menuen, hvilket ifølge dossier 03's citat af kildekoden gør
  forvekslingen "LETTERE end før, ikke sværere" — begge skærmes undertekst
  siger derfor eksplicit hvad forskellen er.
- **"Sag" betyder to helt forskellige ting** (dossier 10): en supportsag
  (`support/sager`, ikke bygget i data-laget endnu) og en Fleet/Facility
  værksteds-/leverandørsag (`tenants/<t>/sager`, delvist bygget). Ingen
  delt node, ingen delt permission-familie — men dossieret flagger
  eksplicit risikoen for at en fremtidig opgavebeskrivelse forveksler "byg
  supportsager" med "byg Fleet/Facility-sager".
- **`MOMSSATS` vs. `MOMSSATS_SALG`** (jf. CLAUDE.md, nævnt i dossier 09):
  satsen på FleetControls faktura til vognmanden vs. satsen på vognmandens
  faktura til hans egen kunde — to næsten enslydende konstanter i hver sin
  fil, som ifølge kodens egne kommentarer allerede er blevet forvekslet én
  gang (beslutning 91).
- **Fakturaprocessens fire navne** (dossier 01, 06, 08): "Fakturacenter"
  (indgående fakturaer, tværmodulær linse), "Fakturering" (udgående
  fakturagrundlag), "Afregning" (Warehouses eget ord for det samme,
  bevidst IKKE kaldt "Fakturering" for ikke at antyde et andet
  godkendelsesflow) og "Bogfør" (kun et internt statusskift, ingen
  regnskabsintegration). De fire ord dækker reelt fire forskellige trin i
  to forskellige processer (indgående/udgående), men deler et fælles
  fagudtryk ("faktura") som en udenforstående let kan tro er ét begreb.
- **`kunde.prisgruppe`** (dossier 09): feltet hedder stadig "prisgruppe" og
  kunne let læses som om det stadig bærer en pris (dets historiske
  funktion), mens prislogikken i dag udelukkende er
  standardpris+kundeafvigelse. Begge skærme, der viser feltet, har
  kode-kommentarer, der advarer mod netop denne læsning.
- **"Reserveret" / "Booket"** (dossier 02): samme etapetilstand vises i
  data som `reserveret`, men pillens label siger "Reserveret / Booket" —
  ét sted med to ord for samme ting, dokumenteret som bevidst i selve
  labelen.

---

## For mange forskellige layouts

**IKKE TYDELIGT PÅVIST i dossiererne — kræver en visuel gennemgang af
skærmbilleder.** Ingen af de 11 dossierer rapporterer et fund af
layout-proliferation i betydningen "mange forskellige, uens skærmformer
frem for genbrugte skabeloner". Tværtimod konkluderer dossier 09
eksplicit for Opsætnings seks skærme: "Ingen visuel/interaktionsmæssig
inkonsistens blev fundet mellem skærmene i sig selv — alle seks følger
samme komponentbibliotek og layoutmønster." Det gennemgående ydre mønster,
som samtlige dossierer nævner, er `<div className="fc-grid">` som yderste
container med `KpiRaekke` øverst og `Kort`-blokke derunder — men om dette
i praksis giver en visuelt ensartet SIDESTRUKTUR (kortstørrelser,
mellemrum, informationstæthed) på tværs af alle ~59 skærme, kan ikke
afgøres af kildekode-læsning alene og er ikke undersøgt i denne opgave.

---

## Handlinger der ligger forskellige steder uden klar grund

Dette afsnit krydsrefererer specifikt de "Mulige overlap"-fund i
dossiererne, der handler om UI-PLACERING af en handling, ikke kun om delte
data:

- **Modtagelse vs. Bevægelser (art `putaway`), Warehouse** (dossier 08):
  Modtagelse er en guidet, forenklet brugerflade oven på præcis én
  bevægelsesart fra det generiske Bevægelser-skema. Ingen datamæssig
  konflikt, men dossieret bemærker eksplicit: "to indgange til samme
  handling kan forvirre om hvilken skærm der er 'den rigtige' for en
  placering."
- **Pluk (Plukpanel) vs. Bevægelser (art `pluk`), Warehouse** (dossier 08):
  samme mønster — plukskærmens indbyggede panel er en kontekst-bundet
  variant af det, der også findes generisk i Bevægelser.
- **Klargøringsknappen findes to steder i Unitbooking** (dossier 07):
  Kalenderens "Kommende klargøringer"-panel har en direkte klargør-knap,
  som er "den samme handling" (kildens egen note) som findes på
  Udlån-skærmen. Dokumenteret som bevidst, men er stadig samme handling
  tilgængelig fra to skærme.
- **Fakturacenter vs. Procure → Fakturaer** (dossier 01, 06): samme
  `fakturaer/`-node, samme underliggende matchfunktioner, men to
  selvstændige brugerflader for i praksis samme handling (destinationssæt,
  godkendelse) — bevidst arkitektur ("Procure er én linse; her ses alle
  destinationer"), men risikoen for at en bruger tror det er to
  faktura-systemer, er eksplicit navngivet i begge dossierer.
- **Driftskalender/Servicekalender/Disponerings dagsgitter** (dossier 02,
  04, 05): tre selvstændige kalenderskærme i tre moduler, der alle skriver
  til samme `opgaver`-node via samme Cloud Functions og samme
  `Gitterkalender.jsx`-komponent, adskilt kun af `art`-feltet. Dossier 05
  formulerer risikoen præcist: "en bruger med begge moduler skal vide
  hvilken kalender der gælder for hvad."
- **Fravaer.jsx (kontor) vs. app/Frihed.jsx (chauffør)** (dossier 03): en
  bruger, der kun kender kontorsiden (hvor "Registrér fravær"-knappen er
  deaktiveret), ville tro fraværsregistrering slet ikke er bygget — den
  er, bare ikke tilgængelig fra den skærm de kigger på; skrivningen sker
  reelt fra chauffør-appens ansøgningsflow via en anden regelgren.
- **To rollevælgere i samme sidebar-område** (dossier 11): demo-
  rollevælgeren i AppShell ("Se platformen som") og `Brugervaelger.jsx`
  (dev-only) løser forskellige ting (ren visning vs. reelt tokenskift) men
  ligger visuelt ved siden af hinanden — dossieret kalder det "en oplagt
  kilde til forveksling af 'hvad er reel adgangsstyring' for en ekstern
  reviewer", selvom begge er bevidst adskilt i koden (beslutning 28).

---

## Formulardesign, date pickers, kalenderdesign

Tre kalenderskærme deler eksplicit én komponent, og én kalenderlignende
skærm gør det bevidst ikke:

- **Delt komponent:** `src/fleet/Gitterkalender.jsx` (rækker = ressourcer,
  kolonner = tid, træk-og-slip, "skygge"-blokke for indesluttede
  ressourcer) genbruges af Fleets Driftskalender/Værkstedskalender,
  Facilitys Servicekalender, Booking/Disponering, og Unitbookings
  Kalender. Dette er bekræftet ved `grep` i denne runde
  (`Gitterkalender`-import findes i netop disse fire filer under
  `src/moduler/` og ingen andre) og af kommentaren i selve `ui.jsx`s
  søsterfil: "to tabeller/gitre der render det samme lidt forskelligt,
  opdages ikke ved at kigge på dem" — samme begrundelse som for
  `Tabel`-komponentens `paaRaekke`-prop.
- **Bevidst IKKE delt:** Facilitys `Servicedialog.jsx` deler IKKE
  planlægningsformularen med Fleets `Planlaegdialog.jsx`, selvom begge
  opretter et servicebesøg — begrundet eksplicit i kildekoden med at
  feltskemaet er reelt forskelligt (ingen enhed/arbejdstype på en
  facility-opgave). Delt valideringslogik ligger i stedet i
  `opgaveplan-regler.js`.
- **Bevidst IKKE brugt:** Bemandingsplanens ugetabel (se "Hvor samme
  komponent ser forskellig ud" ovenfor) er den ene kalenderlignende
  skærm, der bygger sin egen `Date`-baserede 7-kolonners tabel i stedet
  for at genbruge `Gitterkalender.jsx` — men skærmen er samtidig ren
  demo-data uden nogen rigtig vagtnode, så det er uklart om en fremtidig,
  rigtig implementering ville genbruge komponenten eller ej. IKKE PÅVIST i
  dossieret.
- **Faner/formularer:** `Faner`-komponenten (delt tab-liste med
  `role="tablist"`) ligger i `ui.jsx` af samme begrundelse som
  `Gitterkalender` — den stod oprindeligt inline i to forskellige skærme
  (Sagsvisning og Driftskalenderens hændelsespanel) med to forskellige
  aria-opmærkninger, en forskel der "kun ses med en skærmlæser". Bruges nu
  konsekvent, bekræftet i dossier 03, 04, 07 (Vaerkstedskalender.jsx,
  Kalender.jsx (unitbooking)).
- **Ingen selvstændig datovælger-komponent blev fundet nævnt** i nogen af
  de 11 dossierer ud over `<input type="...">`-felter i `Felt`-komponenten
  — der er ikke belæg for at afgøre om der findes flere parallelle
  datovælger-implementeringer end de rene HTML-inputs.

---

## Desktop/mobile patterns

Dette er det ene strukturelle skel, alle dossierer, der berører det, er
enige om, og det fremstår som en bevidst, gennemført arkitekturbeslutning
snarere end en inkonsistens:

Appen har **tre gensidigt udelukkende "rammer"**, valgt af `App.jsx` FØR
routing, og aldrig renderet samtidig:

1. **AppShell** — kontorets/den daglige drifts skal. Sidebar genereret fra
   `nav.js`, tenant- og periodevælger, miljøbjælke, evt. demo-rollevælger.
   Desktop-orienteret, bruger `fc-card`/`fc-tabel`-formsproget.
2. **Chauffoerramme** (`/app/*`) — chaufførens mobile skal. Ingen sidebar,
   ingen tenant-/periodevælger; kun en topbar med mærke, tenant-kortnavn,
   brugernavn og log ud. Egen `fc-app-*`-klassekonvention, kort som primær
   navigationsenhed (fire trykbare genvejskort på forsiden, ét kort pr.
   stop i Turplan). Dossier 11 formulerer det præcist: "To adskilte
   shells, ikke ét tema med en mobil-variant" — `Chauffoerramme` er en
   selvstændig komponent, sideordnet `AppShell`, ikke en `AppShell`-
   variant.
3. **Udbyderramme** (`/main`, `/main/priser`) — FleetControls interne
   ejerkonsol. Ingen sidebar, ingen tenant-/periodevælger; kun en minimal
   header med brand, "Ejerkonsol"-label, brugerens e-mail og log ud. Renset
   for enhver kunde-tenant-kontekst (brugeren har intet tenant-claim
   overhovedet). Genbruger dog de samme `Kort`/`KpiKort`/`Tabel`-
   primitiver som de to andre rammer.

Adgangsvejen (`harAdgang` i `App.jsx`) er uændret på tværs af de tre — kun
HVILKEN ramme der TEGNES, afgøres af `bruger.udbyder`/`bruger.rolle`.
Dossier 10 bemærker at Udbyderramme er "en strukturelt anden UI-skal end
samtlige andre skærme i appen (også chaufførappens `Chauffoerramme` og
kundeshellens AppShell er nærmere hinanden end nogen af dem er
Udbyderramme)" — dvs. graden af afvigelse fra AppShell er ikke ens for de
to andre rammer; chaufførappen ligner AppShell mere end Udbyderramme gør.

---

## Sammenfatning

Komponentdisciplinen er den klareste, mest konsekvent dokumenterede styrke
på tværs af alle 11 dossierer: ét sæt primitiver i `ui.jsx`, én
farvepalet med fast betydning, ét deaktiveret-knap-mønster, én delt
kalenderkomponent for fire kalenderlignende skærme. De afvigelser, der
findes, er i næsten alle tilfælde eksplicit begrundede i kildekoden selv
(Bemandingsplanens egen ugetabel, chaufførappens eget klassesæt, de
moduler der bevidst vælger inline-formular frem for Dialog) — men
begrundet betyder ikke usynlig for slutbrugeren, og flere dossierer
navngiver selv den resterende forvekslingsrisiko for en bruger, der møder
to forskellige mønstre for begrebsmæssigt samme handling.
