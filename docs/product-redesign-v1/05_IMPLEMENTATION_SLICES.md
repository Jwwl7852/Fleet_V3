<title>05 — Implementeringsskiver</title>

# 05 — Implementeringsskiver

**Status:** Planlægning. 0 kodeændringer er foretaget for at producere dette
dokument. Kilder: `FleetControl_V1_product_blueprint.md`,
`docs/product-redesign-v1/00_AUTHORITATIVE_PRODUCT_RULES.md`,
`docs/product-audit/02_SCREEN_INVENTORY.md`,
`docs/product-audit/06_IMPLEMENTATION_STATUS.md`,
`docs/product-audit/10_DUPLICATION_AND_OVERLAP_REPORT.md`,
`docs/product-audit/04_DATA_OWNERSHIP.md`, samt direkte læsning af
`src/App.jsx`, `src/fleet/nav.js` og `src/fleet/AppShell.jsx`.

Hvor kilderne ikke giver et entydigt svar (typisk om en skrivevej findes for
en node der i dag kun har læsning), er det markeret **IKKE PÅVIST** fremfor
gættet — i overensstemmelse med reglen der gælder resten af
`docs/product-redesign-v1/`.

De 7 change-type-tags bruges konsekvent:
`NAVIGATION_ONLY` · `VIEW_COMPOSITION` · `ROUTE_REDIRECT` ·
`PERMISSION_MODEL` · `DATA_MODEL` · `BACKEND_REQUIRED` · `HIDE_ONLY`.

**Stående verifikationsregel (Korrektion 8, `00_AUTHORITATIVE_PRODUCT_RULES.md`):**
før noget i denne fil mærkes `BACKEND_REQUIRED`, skal det være verificeret at
(a) ingen eksisterende `.write`-regel i `firebase.rules.json` allerede
tillader en direkte klient-skrivning til handlingen, OG (b) ingen
eksisterende ren funktion (fx en `byggX()`-byggefunktion) allerede
bygger/validerer den nødvendige datastruktur. Denne runde fandt tre
elementer der var fejltagget efter denne regel — Kompetencer, Medarbejdere
(Skive 6) og Leverandører (Skive 4B) — alle retagget fra `BACKEND_REQUIRED`
til `VIEW_COMPOSITION` nedenfor. Enhver fremtidig skive skal anvende samme
tjek før noget mærkes `BACKEND_REQUIRED`.

---

## Skive 0 — Lås produktplanen

**✅ Afsluttet af denne planlægningsrunde.**

- `docs/product-redesign-v1/` er oprettet, med `00_AUTHORITATIVE_PRODUCT_RULES.md`
  som den låste kilde til produktretningen, krydsrefereret mod
  `FleetControl_V1_product_blueprint.md` og `docs/product-audit/`.
- De to konflikter blueprintet krævede verificeret, er nu FAKTA (se
  `00_AUTHORITATIVE_PRODUCT_RULES.md`, afsnit "De to verificerede
  konflikter"):
  - **A.** Fleet/Facility `sager`-backend (`sagOpret`, `sagBeskedSkriv`,
    `sagKarantaeneFrigiv`, `sagAftaleBekraeft`) er **reelt bygget og
    deployeret** (`functions/index.js`, `firebase.rules.json` linje
    863–872-området, bekræftet `v2 callable` i DEV) — hullet er udelukkende i
    `Sagsvisning.jsx`, som stadig viser en forældet "fase 0"-tekst.
  - **B.** `kompetencer` er **korrekt modul-gatet** til Bemanding
    (`NODE_MODUL.kompetencer = "bemanding"`, håndhævet i
    `firebase.rules.json`) — ingen permission-ændring krævet, kun en
    fremtidig oprydning af en vildledende kodekommentar i `moduler.js`
    (uden for scope for V1-navigationsoprydningen).
- Ingen kode, Firebase-regler, Cloud Functions eller data er ændret.

Skive 0 kræver ingen yderligere handling. De følgende otte skiver kan
igangsættes én ad gangen efter eksplicit godkendelse fra ejeren, som
blueprintets eget "Første besked til programmørrobotten" kræver.

---

## Skive 1 — Fjern vildledning

### Formål
Skjul permanente demo-/fase-0-flader fra produktionsnavigationen og erstat
de sidste permanente demo-komponenter på **skærme der bliver stående** med
ærlige tomtilstande, så produktgrundlovens §6 ("aldrig permanente
demo-rækker forklædt som kundedata") holder også for direkte URL-adgang.

### Berørte rækker (blueprint-#)
- **#2** Økonomi & Rapporter (`/oekonomi`) — LATER.
- **#11** Bemandingsplan (`/bemanding`) — LATER.
- **#21** Klima & energi (`/facility/klima`) — LATER.
- **#51** Integrationer (`/opsaetning/integrationer`) — LATER.
- **#52** Hjælp & Support (`/support`) — **rettet af Korrektion 4:** IKKE
  længere HIDE. `VIEW_COMPOSITION`: den nuværende `Hjaelp.jsx`s
  demo-supportsagsvisning erstattes af en ærlig, statisk hjælpeside (guide +
  kontaktoplysninger). Siden forbliver synlig i navigationen; intet nyt
  backend-behov.
- **#53/#54** Supportoverblik / Supportsag (`/support/overblik`,
  `/support/sag/:id`) — HIDE (uændret).
- **Permanente demo-komponenter på skærme der IKKE skjules** — den reelle
  liste, jf. `06_IMPLEMENTATION_STATUS.md`s "Integrationer der kun er UI" og
  det tilhørende MOCK-afsnit:
  - **Dashboard** (`/`, #1 FINISH, forbliver eneste indgang): tabellen "Åbne
    opgaver der kræver opfølgning" importerer `DEMO_DASHBOARD_OPGAVER`
    direkte og ubetinget — ikke via `useListe`s fallback-mekanisme. Dette er
    den ENESTE post i 06-dokumentet der eksplicit er mærket "permanent, ikke
    kun offline-fallback" for Dashboard.
  - **Kunder** (`/opsaetning/kunder`, #46 FINISH, forbliver i navigationen):
    kortet "Tilbud der kræver opfølgning" læser `DEMO_TILBUD` ubetinget; der
    findes ingen `tilbud`-node i datamodellen. Dossier 09/10 fremhæver denne
    som den ENESTE komponent i sit scope der viser demo-data også i en
    produktions-forbundet tilstand.
  - **Økonomi** (`demo-oekonomi.js`s kategori-nedbrydning +
    `DEMO_KLAR_TIL_FAKTURERING`) og **Bemanding** (`DEMO_BEMANDINGSPLAN`) er
    IKKE med på denne liste — begge skærme (`/oekonomi`, `/bemanding`) hører
    selv til LATER-gruppen ovenfor og skjules fra nav i denne skive. Koden
    bevares uændret ("Bevar koden som senere rapporthub" / "Genintroducér
    først med ægte plan"), og det er derfor billigere at skjule end at
    rette indholdet nu.
  - **Legitim offline-fallback, RØRES IKKE:** langt de fleste andre
    `demo:`-brug i kodebasen er `useListe(node, { demo: DEMO_X })` — kun
    aktiv når der ingen Firebase-forbindelse er (demoMode). Det er den
    tilsigtede mekanisme (jf. CLAUDE.md's "Vise et demo-datasæt for en node
    der ER seedet") og skal IKKE ændres i denne skive.

### Præcise filer og routes
**`src/fleet/nav.js`** — brug det eksisterende `skjulINav: true`-mønster
(allerede brugt på `forslag`- og `arbejdskoe`-børnene) på:
- `oekonomiOversigt`-barnet (sti `/oekonomi`) i `oekonomi`-gruppen.
  ⚠ Gruppens EGET `sti`-felt (linje ~239, `key: "oekonomi", sti: "/oekonomi"`)
  skal samtidig ændres til `/oekonomi/fakturacenter` — ellers klikker
  brugeren stadig ind på den skjulte rapportside via selve gruppens
  `NavLink`, fordi `Fakturacenter` og `Fakturering` forbliver synlige børn og
  gruppen derfor IKKE forsvinder fra sidebaren (se `AppShell.jsx` linje 149:
  et toppunkt tegnes, hvis mindst ét barn er synligt).
- `bemandingPlan`-barnet (sti `/bemanding`) i `bemanding`-gruppen.
  ⚠ Samme mekanik: gruppens eget `sti` (linje ~41) skal ændres til
  `/bemanding/kompetencer`, fordi `kompetencer` og `fravaer` forbliver
  synlige og gruppen ("Workforce") derfor stadig vises.
- `klima`-barnet (sti `/facility/klima`) i `facility`-gruppen. Intet
  repoint nødvendigt — `facility`-gruppens eget `sti` (`/facility`) peger på
  Overblik-siden, som IKKE skjules.
- `integrationer`-barnet (sti `/opsaetning/integrationer`) i
  `opsaetning`-gruppen. Intet repoint nødvendigt (gruppens `sti` er
  `/opsaetning`, Generelt-siden, KEEP).
- **Kun to af `support`-gruppens tre børn** (`supportOverblik`,
  `supportSag`) — **rettet af Korrektion 4.** `hjaelp`-barnet
  (`/support`) skjules IKKE og beholder `skjulINav` som i dag (usat/false);
  det er #52's ærlige erstatningsside, ikke et fjernet punkt. "Support"-
  toppunktet forsvinder derfor IKKE fra sidebaren — det forbliver synligt
  med kun "Hjælp"-barnet tilbage, hvilket matcher `00_AUTHORITATIVE_PRODUCT_RULES.md`s
  målnavigation ("**Hjælp:** Enkel hjælp/kontakt i V1; fuldt
  supportsagssystem senere").

**Route-laget i `src/App.jsx`** rører IKKE — alle seks ruter
(`/oekonomi`, `/bemanding`, `/facility/klima`, `/opsaetning/integrationer`,
`/support`, `/support/overblik`, `/support/sag/:id`) forbliver deklareret
uændret. Dette er ikke en forglemmelse: CLAUDE.md forbyder eksplicit at
`App.jsx` filtrerer ruter på `kraeverPerm`/nav-synlighed ("et dybt link skal
ende i en forklaring, ikke i en 404"), og `test/rutedeling.test.mjs` +
mønsteret i `test/navadgang.test.mjs` forudsætter at ruten stadig findes.

**Komponentfiler der får en ærlig tomtilstand-guard** (nyt, minimalt —
genbruger det eksisterende `dataTilstand()`/`<Datatilstand>`-mønster fra
`fleet/datatilstand.js`/`fleet/ui.jsx`, opfinder intet nyt):
- `src/moduler/Oekonomi.jsx` (`/oekonomi`)
- `src/moduler/Bemanding.jsx` (`/bemanding`)
- `src/moduler/facility/Klima.jsx` (`/facility/klima`)
- `src/moduler/opsaetning/Integrationer.jsx` (`/opsaetning/integrationer`)
  — laveste prioritet: skærmen er allerede bevidst tom (ingen `demo:`-brug),
  kræver reelt kun nav-skjul.
- `src/moduler/support/Overblik.jsx`, `src/moduler/support/Sag.jsx` (de to
  `/support/overblik` og `/support/sag/:id`)

  Begrundelse: uden guarden viser disse seks skærme fortsat
  `DEMO_BEMANDINGSPLAN` (`src/fleet/demo-bemanding.js`), Økonomis
  kategori-nedbrydning/`DEMO_KLAR_TIL_FAKTURERING` (`src/fleet/demo-oekonomi.js`)
  og `DEMO_SUPPORTSAGER`/`DEMO_TENANTS` (`src/fleet/demo-support.js`) for
  enhver bruger der taster URL'en direkte — hvilket er nøjagtigt den
  tilstand produktgrundlovens §6 forbyder, blot uden et menupunkt der fører
  derhen.

**Komponentfiler der får deres permanente demo-komponent fjernet/erstattet**
(disse skærme forbliver i nav og skal derfor være ærlige, ikke kun skjulte):
- `src/moduler/Dashboard.jsx` — fjern det ubetingede
  `DEMO_DASHBOARD_OPGAVER`-import (`src/fleet/demo-dashboard.js`) fra
  "Åbne opgaver der kræver opfølgning"-tabellen; erstat med en ærlig
  tomtilstand indtil en rigtig kilde findes (ingen ny aggregering bygges i
  denne skive — det er et separat, ubesluttet spørgsmål).
- `src/moduler/Kunder.jsx` — fjern det ubetingede `DEMO_TILBUD`-import
  (`src/fleet/demo-kunder.js`) fra "Tilbud der kræver opfølgning"-kortet;
  erstat med en ærlig tomtilstand eller fjern kortet helt, da ingen
  `tilbud`-node findes i datamodellen.
- `src/moduler/support/Hjaelp.jsx` (`/support`) — **Korrektion 4, den mest
  synlige ændring i denne skive:** siden fjernes IKKE fra nav og får IKKE en
  tomtilstand-guard. Dens `DEMO_SUPPORTSAGER`/`DEMO_TENANTS`-brug erstattes
  helt af en ærlig, statisk hjælpeside — en kort guide + reelle
  kontaktoplysninger, ingen live supportsagsdata, ingen "kommer snart"-attrap.
  `#53`/`#54` (Supportoverblik/Supportsag) forbliver skjulte og får den
  almindelige tomtilstand-guard som de øvrige seks routes ovenfor.

### Change-type tag(s) pr. berørt element
- `nav.js`-ændringerne (skjulINav + `sti`-repoint): **NAVIGATION_ONLY**
- Tomtilstand-guard på de seks skjulte routes (`/oekonomi`, `/bemanding`,
  `/facility/klima`, `/opsaetning/integrationer`, `/support/overblik`,
  `/support/sag/:id`): **VIEW_COMPOSITION**
- Dashboard.jsx / Kunder.jsx demo-fjernelse: **VIEW_COMPOSITION**
- Hjaelp.jsx demo-erstatning med ærlig statisk side (#52, forbliver
  synlig): **VIEW_COMPOSITION**
- Ingen `PERMISSION_MODEL`, `DATA_MODEL` eller `BACKEND_REQUIRED`-arbejde i
  denne skive.

### Migrationsbehov
Ingen. Ingen node, regel eller Cloud Function ændres. Ren frontend-
synlighed og -indhold.

### Risici
- **Den vigtigste risiko er præcis den `AppShell.jsx` allerede
  dokumenterer:** en skjult route findes stadig, og det er bevidst (regel 7:
  "Navigation følger... serverpermissions er fortsat den egentlige
  sikkerhed"). Risikoen er IKKE at ruten er nåbar — det er korrekt — men at
  den, hvis nået, viser demo-data som var det ægte kundedata. Det er derfor
  denne skive inkluderer tomtilstand-guards, ikke kun nav-skjul.
- Repoint af `oekonomi`- og `bemanding`-gruppernes eget `sti`-felt er let at
  overse, fordi det ikke er nævnt eksplicit i blueprintet — overses det,
  forbliver den skjulte rapport-/demoside reelt ét klik væk via
  gruppeoverskriften, og HIDE/LATER-beslutningen er reelt ikke effektueret.
- At fjerne `DEMO_DASHBOARD_OPGAVER`/`DEMO_TILBUD` uden erstatning efterlader
  et tomt kort på to skærme brugere ser dagligt — skal ledsages af en kort,
  forklarende tomtilstandstekst, ikke bare et hul.
- Enhver ny reference til `demo-bemanding.js`/`demo-oekonomi.js`/
  `demo-support.js` fra en KEPT/FINISH-skærm ville underminere arbejdet i
  denne skive — ingen sådan reference er fundet i det læste materiale, men
  bør bekræftes ved implementering (`grep` for filnavnene på tværs af
  `src/moduler/`).

### Testcases
- `test/demo-i-skaerm.test.mjs` — tæller `demo:`-brug for noder der ER
  seedet; skal forblive grøn (ingen af ændringerne rører seedede noders
  `useListe`-fallback-mønster).
- `test/demo-kilder.test.mjs` — fejler på to demo-sæt for samme node eller
  et demo-sæt defineret i en modulfil frem for `fleet/demo-*.js`; relevant
  fordi Dashboard/Kunder-guardene ikke må efterlade en lokal kopi af
  `DEMO_DASHBOARD_OPGAVER`/`DEMO_TILBUD` i selve skærmfilen.
- `test/demo-referencer.test.mjs` — hvis tomtilstand-guarden ved et uheld
  refererer et id fra et demosæt der ikke findes i den seedede base.
- `test/navadgang.test.mjs` — kræver en skreven grund for hvert
  `kraeverPerm`-punkt; nye `skjulINav`-flag ændrer ikke selve
  permission-kravene, men testen bør køres for at bekræfte at ingen
  utilsigtet permission-kobling er brudt.
- `test/rutedeling.test.mjs` — bekræfter at hver lazy-loaded rute stadig har
  et `export default`; kritisk efter enhver redigering af de syv
  komponentfiler.
- `test/datatilstand.test.mjs` — hvis den findes og dækker
  `<Datatilstand>`-mønsteret; bekræfter at guarden bruger den etablerede
  komponent og ikke en ny, lokal fejltekst (forbudt af CLAUDE.md: "skriv ikke
  din egen fejltekst i en skærm").

### Definition of Done
- [ ] `/oekonomi`, `/bemanding`, `/facility/klima`,
      `/opsaetning/integrationer`, `/support`, `/support/overblik`,
      `/support/sag/:id` er væk fra sidebaren for enhver rolle/modulkombination.
- [ ] "Økonomi & Rapporter"-gruppens og "Workforce"-gruppens `NavLink` peger
      på hhv. Fakturacenter og Kompetencer, ikke på de skjulte sider.
- [ ] "Support"-toppunktet forbliver synligt med kun "Hjælp" som barn;
      Supportoverblik og Supportsag er væk fra sidebaren.
- [ ] De seks skjulte routes (`/oekonomi`, `/bemanding`, `/facility/klima`,
      `/opsaetning/integrationer`, `/support/overblik`, `/support/sag/:id`)
      viser en ærlig, kort forklarende tomtilstand ved direkte URL-besøg —
      ikke `DEMO_BEMANDINGSPLAN`/`DEMO_SUPPORTSAGER`/etc.
- [ ] `/support` (Hjælp) viser en ærlig, statisk hjælpeside (guide +
      kontaktoplysninger) — ikke `DEMO_SUPPORTSAGER`/`DEMO_TENANTS`.
- [ ] Dashboard viser ikke længere `DEMO_DASHBOARD_OPGAVER` under nogen
      omstændighed; Kunder viser ikke længere `DEMO_TILBUD`.
- [ ] `npm test` er grøn, inkl. de fem testfiler nævnt ovenfor.
- [ ] Ingen ændring i `firebase.rules.json` eller `functions/`.

### Rollback-plan
Ren UI-synligheds- og -indholdsændring uden datamigration. Rollback =
`git revert` af skivens commit(s). Ingen node, regel eller Cloud Function er
rørt, så der er intet at rulle tilbage på databasesiden. De skjulte routes'
kode forbliver i repoet under hele skiven (blueprintets eget krav: "kode
bevares"), så en revert er triviel og risikofri.

---

## Skive 2 — Navigation og dashboard

### Formål
Indføre en ny, permission-uafhængig navigationssynlighedsmekanisme
(produktgrundlov §7, Korrektion 1), bygge modulvælgeren og
dashboard-standardlayoutet blueprintet kræver: én-modul-kunder lander
direkte på deres modul-dashboard, fler-modul-kunder kan vælge Samlet — samt
tilføje det manglende Planning/booking-dashboardkort (Korrektion 6).

### Berørte rækker (blueprint-#)
- **#1** Dashboard (`/`) — FINISH: modulvælger kun ved 2+ aktive moduler,
  maksimér handlingskøen; nyt `booking`-dashboardkort (se nedenfor).
- **#50** Brugere & roller (`/opsaetning/brugere`) — den nye
  navigationssynligheds-node (`navvisning/<uid>`) administreres herfra,
  parallelt med den eksisterende `dashboardvisning`-administration.
- Ny hovednavigation (blueprintets afsnit "Ny hovednavigation"): Fælles
  (Dashboard, Kunder når relevant, Fakturaer & bilag, Økonomi/
  Fakturagrundlag), Driftsmoduler efter abonnement, Administration
  (Opsætning), Hjælp.
- Dashboard-reglen (blueprintets afsnit "Dashboard-regel"): 1 modul → intet
  Samlet-valg; 2+ moduler → vælger med Samlet + tilladte moduler; Samlet
  viser 3–6 handlingskort + én arbejdsliste; brugerens ekstra widgets i
  sammenklappelig sekundær sektion, intet vilkårligt dataloft.
- **Korrektion 6 (Planning-dashboard):** `DASHBOARDS`-kataloget
  (`src/fleet/dashboards.js`) har i dag 7 indgange (Samlet, flaade, facility,
  indkoeb, warehouse, unitbooking, bemanding) — ingen for booking/Planning,
  selvom KPI-domænet `disponering` (modul `booking`, kilde `etaper`,
  `disponeringstal()` i `kpi-aggregering.js`) allerede er ægte og
  ikke-null. Denne skive tilføjer et nyt `{ key: "booking", label:
  "Planning" }`-kort.

### Præcise filer og routes
- `src/fleet/nav.js` — omdøb/omgruppér topniveauet til at matche den nye
  hovednavigation: `oekonomi`-gruppen opsplittes konceptuelt (Fakturacenter
  bliver reelt fælles i **Skive 4A**, men NAVIGATIONS-strukturen — gruppenavn
  "Fakturaer & bilag" for Fakturacenter, "Økonomi / Fakturagrundlag" for
  Fakturering — kan forberedes her). `kunder`-punktet ("Kunder & Priser",
  i dag kun nået via Opsætning, jf. `02_SCREEN_INVENTORY.md` §9.1) flyttes
  til et rigtigt topniveaupunkt under "Fælles", betinget af `kraeverModul:
  "kunder"` som i dag.
- **Ny node `navvisning/<uid>` (Korrektion 1) — IKKE en `permissions.js`-
  ændring.** Målbilledet er en sideordnet mekanisme til den allerede byggede
  `dashboardvisning/<uid>` (`src/fleet/dashboardvisning.js`, Cloud Function
  `dashboardvisningskriv`), ikke en ny opfindelse: samme fire garantier
  genbruges uændret — (1) standard = alt tenanten har købt, ingen
  indstilling = vist, (2) kun et eksplicit `false` skjuler noget, (3) kan
  ikke skjule det hele (`skjulerAlt()`-vagten), (4) læses ALDRIG af nogen
  firebase-regel, mekanisk garanteret af en dedikeret prøve svarende til
  `test/dashboardvisning.test.mjs`. Skrives via en ny Cloud Function
  (fx `navvisningskriv`), administreret fra `/opsaetning/brugere` (#50).
  **`src/fleet/permissions.js` rører IKKE** — en permission siger hvad en
  ROLLE må, ikke hvad der TEGNES i en enkelt brugers menu; de to må ikke
  sammenblandes (00's præcisering af §7-skellet).
- `src/fleet/AppShell.jsx` — udvid `synligeBorn`/topniveau-filtreringen
  (linje 108–149) med en ny lagdeling: den nye `navvisning`-baserede
  nav-synlighed **ud over** de eksisterende `kraeverModul`/`kraeverPerm`.
  Dette er den "separate navigation/dashboard-synlighed pr. bruger"
  blueprintets række **#50** (Brugere & roller) selv nævner som en
  tilføjelse, ikke en erstatning af serverpermissions.
- `src/moduler/Dashboard.jsx` — implementér dashboard-reglens
  betinget-visning: brug `moduler`-konteksten (allerede tilgængelig via
  `useFleet()`) til at afgøre 1-modul vs. 2+-modul-landing, og byg den
  sammenklappelige "ekstra widgets"-sektion oven på det eksisterende
  `brugerlayout/<uid>/<dashboard>`-lag (allerede BUILT, jf.
  `06_IMPLEMENTATION_STATUS.md` §01).
- `src/fleet/dashboards.js`/`src/fleet/widgets.js` — det eksisterende
  widget-katalog (CLAUDE.md: "der stod tolv widgets... i BÅDE `widgets.js`
  og regelfilen") er allerede den korrekte mekanisme for brugerens eget
  layout; "3–6 handlingskort"-reglen for Samlet-dashboardet er en ny,
  separat grænse der skal defineres ved siden af, IKKE ved at sætte et loft
  på `valideLayout()` (som CLAUDE.md eksplicit forbyder at bruge som
  adgangskontrol).
- `src/fleet/dashboards.js` (Korrektion 6) — tilføj `{ key: "booking",
  label: "Planning" }` til `DASHBOARDS`-kataloget. Kortet må kun vise ægte
  data: bookinger uden plan (samme kilde som Booking-oversigtens
  eksisterende læsning), forslag/godkendelser der kræver handling (samme
  kilde som Oversigtens "Kræver handling"-liste), og det allerede beregnede
  `kpi.disponering`-domæne. Ingen permanente demo-KPI'er — hverken nye eller
  genbrugte fra `demo-kpi.js`.

### Change-type tag(s) pr. berørt element
- Nav-omgruppering/omdøbning: **NAVIGATION_ONLY**
- Ny `navvisning/<uid>`-node + `navvisningskriv`-funktion (Korrektion 1):
  **BACKEND_REQUIRED** (ny, lille Cloud Function + regel, samme mønster som
  `dashboardvisningskriv`) + **DATA_MODEL** (ny additiv node)
- Nav-synlighedslag i `AppShell.jsx` der læser `navvisning`: **VIEW_COMPOSITION**
  (bemærk: dette er en UI-synlighedsmodel oven på eksisterende server-
  permissions, IKKE en ændring af `firebase.rules.json`s adgangslogik og
  IKKE en `permissions.js`-ændring — jf. 00's præcisering af §7-skellet og
  Korrektion 1)
- Dashboard modulvælger + Samlet-landing-logik: **VIEW_COMPOSITION**
- Nyt `booking`-dashboardkort (Korrektion 6): **VIEW_COMPOSITION** (kortet
  selv, kilderne findes allerede) — **IKKE PÅVIST** om `disponeringstal()`s
  output skal udvides for at dække "bookinger uden plan" og
  "forslag/godkendelser der kræver handling" som separate felter; hvis ja,
  er den udvidelse **DATA_MODEL**, ikke en ny KPI-motor.
- Ingen `PERMISSION_MODEL`-ændring af `src/fleet/permissions.js` i denne
  skive.

### Migrationsbehov
Ny, additiv RTDB-sti for `navvisning/<uid>` (Korrektion 1) — samme
skema/garantier som `dashboardvisning`, ingen eksisterende data at migrere.
Ingen migration for dashboard-reglen eller det nye Planning-kort (læser
eksisterende `etaper`/`kpi.disponering`-kilder).

### Risici
- At forveksle den nye NAV-synlighedsmodel med en adgangskontrol — CLAUDE.md
  er eksplicit: "Basere adgangskontrol på rollen, hvis det egentlig er en
  permission" er forbudt. Enhver ny nav-gating skal afspejle en reel
  server-permission eller et reelt modulkøb, aldrig omvendt.
  `test/navadgang.test.mjs`s princip ("et punkt må kun bære `kraeverPerm`
  hvis reglen faktisk kræver den") skal udvides til den nye lagdeling.
- Dashboard-reglens "3–6 handlingskort" er en UX-grænse uden datamæssig
  håndhævelse i dag — risiko for at den implementeres som et hårdt loft i
  `widgets.js`-kataloget, hvilket CLAUDE.md eksplicit advarer imod
  (beslutning 43/44: "en anbefaling... ikke en kendsgerning om systemet").
- Omdøbning af `oekonomi`-nav-gruppen før Skive 4A's reelle omlægning af
  Fakturacenter til fælles platformfunktion kan skabe et navn/indhold-gab
  (gruppen hedder "Fakturaer & bilag", men Fakturacenter er stadig
  `kraeverPerm: "indkoeb.laes"`-gated som i dag) — bør sekvenseres bevidst,
  eller udskydes til Skive 4A hvis det er enklere at gøre navn og
  funktionalitet i samme commit.
- Ny node uden ny sikkerhedstest er en reel risiko: `navvisning` SKAL have
  sin egen "læses aldrig af en regel"-prøve før den tages i brug, præcis
  som `dashboardvisning` har det — mangler den, er skellet fra §7 kun en
  hensigt, ikke en håndhævelse.
- Planning-dashboardkortet må ikke genindføre en hardkodet KPI, hvis
  "bookinger uden plan"/"kræver handling"-tallene viser sig at kræve en
  aggregeringsudvidelse der ikke er klar til tiden — CLAUDE.md's forbud mod
  at hardkode et tal fordi feltet mangler i `kpi/` gælder uændret her.

### Testcases
- `test/navadgang.test.mjs`
- `test/kpiadgang.test.mjs`, `test/laeseadgang.test.mjs` — bekræfter at
  KPI-/læse-adgang forbliver udledt af serverpermissions, uanset
  nav-lagdelingen.
- `test/dashboards.test.mjs`, `test/dashboardvisning.test.mjs`,
  `test/widgets.test.mjs` — dashboard-layoutmekanikken.
- `test/moduler.test.mjs`, `test/modulopslag.test.mjs`,
  `test/modulmangler.test.mjs`, `test/modulkrav.test.mjs` — modulgating
  generelt, da den nye nav-lagdeling bygger oven på `harModul()`.
- `test/rules.rollematrix.test.mjs` — sikrer at ingen af de 7 roller mister
  en reel serveradgang som utilsigtet sideeffekt af nav-ændringen.
- Ny testfil forventet for `navvisning` (findes ikke i dag), samme mønster
  som `test/dashboardvisning.test.mjs`: standard-visning, `skjulerAlt()`-
  vagten, og at ingen `firebase.rules.json`-regel refererer noden.
- `test/kpi-aggregering.test.mjs`, `test/kpi-efterslaeb.test.mjs` — hvis
  Planning-dashboardkortet kræver et nyt/udvidet felt i `disponeringstal()`.

### Definition of Done
- [ ] En kunde med ét aktivt modul lander direkte på modul-dashboardet, uden
      Samlet-vælger.
- [ ] En kunde med 2+ moduler ser en vælger med Samlet + de moduler brugeren
      må se (ikke alle kundens moduler, hvis brugerens rolle er begrænset).
- [ ] Samlet-dashboardet viser 3–6 handlingskort og én prioriteret
      arbejdslistesektion.
- [ ] Brugerens ekstra widgets ligger sammenklappet, uden hårdt dataloft.
- [ ] Navigationen matcher blueprintets "Ny hovednavigation"-struktur
      (Fælles/Driftsmoduler/Administration/Hjælp).
- [ ] `navvisning/<uid>` findes, har de samme fire garantier som
      `dashboardvisning`, og administreres fra `/opsaetning/brugere`.
- [ ] Dashboardvælgeren viser et Planning-kort med ægte data (bookinger uden
      plan, forslag/godkendelser der kræver handling, `kpi.disponering`) —
      ingen permanente demo-KPI'er.
- [ ] `npm test` grøn.

### Rollback-plan
Nav-omgruppering og dashboardlogik er ren frontend — `git revert`. Den nye
`navvisning/<uid>`-node er additiv (påvirker ingen eksisterende læsning), så
en kode-revert efterlader et ubrugt, men harmløst felt i basen — ingen
sletning nødvendig for en ren rollback. Hvis `firebase.rules.json` er
udvidet for `navvisning`, kræver rollback en ny `npm run test:rules` +
`npm run regler:udrul` af den tilbagerullede regelfil, ikke kun en
git-revert af filen. Planning-dashboardkortet fjernes ved at fjerne kortet
fra `DASHBOARDS`-kataloget — ingen datapåvirkning.

---

## Skive 3 — Planning/Fleet/Facility (delt i fire, Korrektion 10)

**Ejerens pre-implementation review fandt Skive 3 for stor til én
rollback-enhed.** Den deles i fire selvstændige delskiver, hver med sin
egen fulde 8-punkts struktur, egen Definition of Done og egen rollback —
ikke den samlede skives. De fire kan i praksis igangsættes i rækkefølge
(3A → 3B/3C parallelt → 3D), men hver kan også rulles tilbage uafhængigt
af de andre tre, fordi ingen af dem deler en ufærdig datamodel.

---

## Skive 3A — UI-omlægning Planning/Fleet/Facility

### Formål
Fjerne det duplikerede værkstedsdagsgitter fra Disponering, integrere
Forslag som panel/dialog i Disponering, merge Fleets Arbejdskø ind i
Driftskalenderen, og standardisere Servicedialogens knapper/
leverandørkontakt/næste handling med Fleets dialog. Ren UI-omlægning oven
på eksisterende, uændrede backend-flows (`forslagskriv`/`etapeskift`,
`driftstal()`) — laveste risiko af de fire Skive 3-delskiver, mest
`NAVIGATION_ONLY`/`VIEW_COMPOSITION`.

### Berørte rækker (blueprint-#)
- **#7** Forslag & reservation (`/booking/forslag/:id`) — MERGE ind i
  Disponerings højre panel/dialog; route bevares som deep link
  (`skjulINav: true`, allerede sat i `nav.js`).
- **#8** Disponering (`/booking/disponering`) — FINISH: fjern
  dagsgitteret for værkstedsopgaver.
- **#18** Arbejdskø (`/flaade/koe`) — MERGE ind i Driftskalenderens
  arbejdskø/drawer; route bevares som deep link (allerede `skjulINav: true`).
- **#22** Servicedialog — KEEP, standardisér knapper/leverandørkontakt/næste
  handling med Fleets dialog uden fælles feltskema.

### Præcise filer og routes
- `src/moduler/booking/Disponering.jsx` — fjern dagsgitter-fanen for
  værkstedsopgaver (art `vaerksted`); denne opgavetype vises fremover kun i
  Fleets Driftskalender (`src/moduler/flaade/Vaerkstedskalender.jsx`, route
  `/flaade`). Ugesgitteret (etaper/langture) bevares uændret — det er
  bevidst view-only i dag og påvirkes ikke.
- `src/moduler/booking/Forslag.jsx` (route `/booking/forslag/:id`, allerede
  `skjulINav: true` i `nav.js`) — indholdet flyttes til et panel/dialog der
  åbnes FRA Disponering (`src/moduler/booking/Disponering.jsx`); selve
  komponentfilen kan forblive som deep-link-mål, eller dens JSX udtrækkes
  til en delt komponent begge steder importerer. Ingen ny node eller
  Cloud Function — `forslagskriv`/`etapeskift` er allerede BUILT
  (`06_IMPLEMENTATION_STATUS.md` §02).
- `src/moduler/flaade/Arbejdskoe.jsx` (route `/flaade/koe`, allerede
  `skjulINav: true`) — samme mønster: indhold/filterlogik
  (`driftstal()`-funktionen, allerede bevidst delt med Driftskalenderens
  fem kasser jf. `10_DUPLICATION_AND_OVERLAP_REPORT.md`) flyttes ind i
  `src/moduler/flaade/Vaerkstedskalender.jsx` som en arbejdskø/drawer,
  åbnet fra de fem eksisterende handlingstal.
- Servicedialog (#22) — **IKKE PÅVIST** præcis komponentfil-sti i det læste
  materiale (auditten omtaler den funktionelt, ikke ved filnavn); skal
  lokaliseres (`grep -r "Servicedialog" src/`) som første skridt.
  Standardiseringen er UI-ren: samme knapsæt/leverandørkontakt/
  næste-handling-mønster som Fleets tilsvarende dialog, uden fælles
  feltskema mellem Fleet og Facility.

### Change-type tag(s) pr. berørt element
- Disponerings dagsgitter-fjernelse: **VIEW_COMPOSITION**
- Forslag-merge ind i Disponering: **VIEW_COMPOSITION** (route bevares som
  `ROUTE_REDIRECT`-lignende deep link, men er teknisk set allerede
  `skjulINav` — ingen ny redirect-mekanik nødvendig)
- Arbejdskø-merge ind i Driftskalender: **VIEW_COMPOSITION**
- Servicedialog-standardisering: **VIEW_COMPOSITION**
- Ingen `BACKEND_REQUIRED`, `PERMISSION_MODEL` eller `DATA_MODEL`-arbejde i
  denne delskive.

### Migrationsbehov
Ingen. Samme node, samme Cloud Functions, kun UI-omlægning.

### Risici
- Dagsgitter-fjernelse fra Disponering rører en komponent
  (`Gitterkalender.jsx`) der er **bevidst delt** med Driftskalender og
  Servicekalender (jf. `10_DUPLICATION_AND_OVERLAP_REPORT.md`, "Funktioner
  der måske burde være fælles platformfunktioner"). En ændring i den delte
  komponent for at fjerne KUN Disponerings værksteds-fane må ikke bryde de
  to andre kalenderes visning — CLAUDE.md's advarsel om "to gitre der
  læser samme interval forskelligt" gælder direkte her.
- Servicedialog-standardiseringens fil-sti er ikke bekræftet i denne
  planlægningsrunde — bør lokaliseres før arbejdet estimeres i timer.

### Testcases
- `test/gitter.test.mjs`, `test/gitter-uge.test.mjs` — den delte
  kalenderkomponents regnestykke.
- `test/disponering.test.mjs`, `test/forslag.test.mjs`,
  `test/forslagform.test.mjs` — Disponering/Forslag-flowet og det kendte
  `.forslag.length`-mønsterforbud (beslutning 76).
- `test/etapeskift.test.mjs`, `test/etapeskifte.test.mjs`,
  `test/opgaveflyt.test.mjs`, `test/opgaveplan.test.mjs`,
  `test/opgaver.test.mjs`, `test/opgavestatus.test.mjs` — de fire
  skriveveje ind i `opgaver` som gitter-omlægningen ikke må røre.
  `test/indeslutning.test.mjs` — "hallen og porten er ét rum"-tjekket.
- `test/facilityopgave.test.mjs`, `test/facility.test.mjs`,
  `test/facility-drift.test.mjs` — Facility-siden af den delte
  gitterkomponent, som IKKE må påvirkes af Disponerings dagsgitter-fjernelse.
- `test/flaade.test.mjs`, `test/flaade-bemanding.test.mjs`,
  `test/vaerksted.test.mjs`, `test/driftskalender.test.mjs` — Driftskalender
  efter Arbejdskø-mergen.

### Definition of Done
- [ ] Disponering viser ikke længere et separat dagsgitter for
      værkstedsopgaver; Driftskalenderen er eneste sted at se/redigere dem.
- [ ] Forslag & reservation nås kun fra Disponerings panel/dialog i normal
      brug; `/booking/forslag/:id` virker stadig som deep link.
- [ ] Arbejdskø nås kun fra Driftskalenderens fem kasser; `/flaade/koe`
      virker stadig som deep link.
- [ ] Servicedialogens knapper/leverandørkontakt/næste handling matcher
      Fleets dialog.
- [ ] `npm test` grøn. Ingen ændring i `firebase.rules.json` forventet.

### Rollback-plan
Ren UI-omlægning af eksisterende, uændrede backend-flows — `git revert`,
ingen datamigration.

---

## Skive 3B — Fleet indberetningstriage

### Formål
Bygge den manglende triage for Fleets indberetninger: prioritet, vurdering,
planlæg aktivitet, afvent, afslut, kobling til en Fleet-sag. Dette er det
**V1-blokerende hul** blueprintet selv navngiver (#17) — den eneste
delskive af Skive 3's fire hvor auditten fandt **ingen** eksisterende
skrivevej fra Fleets egne skærme (Korrektion 10 og Korrektion 8's
verifikationsregel begge anvendt: der er hverken en åben `.write`-regel
eller en færdig byggefunktion at genbruge her — modsat Kompetencer/
Medarbejdere i Skive 6). Reelt `BACKEND_REQUIRED`.

### Berørte rækker (blueprint-#)
- **#17** Indberetninger (`/flaade/indberetninger`) — FINISH: byg triage
  (prioritet, vurdering, planlæg aktivitet, afvent, afslut, kobling til
  Fleet-sag). Markeret i blueprintet som "V1-blokerende hul".

### Præcise filer og routes
- `src/moduler/flaade/Indberetninger.jsx` (route `/flaade/indberetninger`)
  — bygger den manglende triage: "Afslut"-knappen er i dag permanent
  deaktiveret ("Fase 0: skrives ikke fra klienten endnu",
  `06_IMPLEMENTATION_STATUS.md` §04). Kræver en NY Cloud Function (eller
  udvidelse af en eksisterende) til at skifte en indberetnings status og
  koble den til en Fleet-sag — ingen sådan funktion er fundet i
  `functions/index.js` i det læste materiale.

### Change-type tag(s) pr. berørt element
- Fleet indberetningstriage: **BACKEND_REQUIRED** (ny/udvidet Cloud
  Function for statusskift + sagskobling)

### Migrationsbehov
Ingen data-migration, men en NY Cloud Function skal deployes og dens
regler tilføjes til `firebase.rules.json`.

### Risici
Markeret "V1-blokerende hul" af blueprintet selv — det er reelt ny
backend-funktionalitet, ikke kun UI, og bør ikke undervurderes som en
"aktivér en deaktiveret knap"-opgave.

### Testcases
- `test/indberetninger.test.mjs`, `test/indberetningsarter.test.mjs`,
  `test/rules.indberetninger.test.mjs` — indberetningsmodellen den nye
  triage-funktion skal skrive imod.
- `test/referencetjek.test.mjs` — hvis triage-funktionen introducerer et nyt
  `...Id`-referencefelt (fx en kobling fra indberetning til Fleet-sag).

### Definition of Done
- [ ] Fleet Indberetninger har en fungerende "Afslut"-handling koblet til en
      Fleet-sag.
- [ ] `npm test` og `npm run test:rules` grønne (den sidste er obligatorisk
      pga. nye Cloud Function-regler).

### Rollback-plan
Den nye Cloud Function kan deaktiveres ved at fjerne dens klient-kald
(frontend-revert) uden at slette selve funktionen fra `functions/index.js`
med det samme — en udrullet, ubrugt Cloud Function er harmløs. Hvis
`firebase.rules.json` er udvidet, kræver rollback en ny
`npm run test:rules` + `npm run regler:udrul` af den tilbagerullede
regelfil, IKKE kun en git-revert af filen (jf. CLAUDE.md: "prøverne siger
noget om FILEN; databasen håndhæver det UDRULLEDE").

---

## Skive 3C — Sagsvisning → eksisterende backend

### Formål
Koble `Sagsvisning.jsx` til den allerede deployerede `sager`-backend
(`sagOpret`, `sagBeskedSkriv`, `sagKarantaeneFrigiv`, `sagAftaleBekraeft`),
jf. `00_AUTHORITATIVE_PRODUCT_RULES.md`s verificerede "Konflikt A":
backend'en er reel og deployeret, hullet ligger UDELUKKENDE i frontend.
**Ren `VIEW_COMPOSITION` — ingen ny backend i denne delskive.**

### Berørte rækker (blueprint-#)
- (Underliggende, ikke en selvstændig blueprint-række men eksplicit
  navngivet i `00_AUTHORITATIVE_PRODUCT_RULES.md`s Konflikt A:)
  `Sagsvisning.jsx`-kobling til den bekræftede `sagOpret`/`sagBeskedSkriv`/
  `sagKarantaeneFrigiv`/`sagAftaleBekraeft`-backend.

### Præcise filer og routes
- `src/moduler/support/Sag.jsx` findes IKKE — den relevante komponent er
  `Sagsvisning.jsx` (Fleet/Facility-modulet, jf.
  `10_DUPLICATION_AND_OVERLAP_REPORT.md`s eksplicitte adskillelse fra
  Support-modulets `Sag.jsx`). ⚠ **Præcis fil-sti for `Sagsvisning.jsx` er
  IKKE PÅVIST i det materiale der er læst i denne runde** (den optræder i
  `docs/product-audit/`-dossiererne og i `00_AUTHORITATIVE_PRODUCT_RULES.md`
  under navnet, men uden fuld sti) — skal lokaliseres (`grep -r
  "Sagsvisning" src/`) som allerførste skridt i denne skive, før
  ændringsomfanget kan estimeres præcist. Arbejdet: erstat de deaktiverede
  "Send besked"/"Frigiv karantæne"-knapper med reelle kald til
  `sagBeskedSkriv`/`sagKarantaeneFrigiv`, fjern "fase 0"-teksten.

### Change-type tag(s) pr. berørt element
- Sagsvisning.jsx-kobling til eksisterende `sager`-backend:
  **VIEW_COMPOSITION**. Eksplicit: ingen ny Cloud Function, ingen ny regel
  — backend'en for besked/frigivelse/aftalebekræftelse findes allerede og
  er deployeret (Skive 0's verifikation).

### Migrationsbehov
Ingen. `sager`-reglerne og de fire Cloud Functions findes allerede.

### Risici
Sagsvisning.jsx's nøjagtige fil-sti er ikke bekræftet i denne
planlægningsrunde — risiko for fejlestimering hvis filen viser sig at være
større/mere sammenflettet med andre skærme end antaget.

### Testcases
- `test/sager.test.mjs`, `test/sager-funktioner.test.mjs` — den allerede
  deployerede `sager`-backend, Sagsvisning.jsx skal kobles til.

### Definition of Done
- [ ] Sagsvisning.jsx's "Send besked"/"Frigiv karantæne" virker mod den
      rigtige backend; "fase 0"-teksten er fjernet.
- [ ] `npm test` grøn. Ingen ændring i `firebase.rules.json` forventet (kun
      klientkobling til eksisterende, deployerede funktioner).

### Rollback-plan
`git revert` — ingen datamigration, ingen ny backend at rulle tilbage.

---

## Skive 3D — Udgående mail

### Formål
Bygge en fælles UDGÅENDE mailfunktion for Fleet/Facility/Procure
(Korrektion 7, trin B — i dag kun mock/manuel kopiering) og logge den
sendte kommunikation på relevant sag/ordre (trin C, via `sagBeskedSkriv`
med retning "udgående"). **Eksplicit: INGEN indgående mail i V1.**
Korrektion 7's trin D (indgående reply-routing/webhook, `sagOpret` fra
modtaget mail) er en SENERE, separat sikkerhedsskive, uden for V1-kritisk
vej — denne delskives Definition of Done må IKKE kræve indgående mail →
`sagOpret`.

### Berørte rækker (blueprint-#)
- (Underliggende, del af #17/Sagsvisning-økosystemet men ikke en
  selvstændig blueprint-række — Korrektion 7's trin B+C.) Relevant også for
  **Skive 4D** (Procure ordre-mail): se Risici.

### Præcise filer og routes
- Ny, delt Cloud Function til udgående mailafsendelse (ingen SMTP-/
  mailudbyder-integration findes i `functions/index.js` i det læste
  materiale i dag) — kaldes fra `Sagsvisning.jsx` (Skive 3C) for
  leverandør-/værkstedskommunikation.
- Logning: kald `sagBeskedSkriv` med retning "udgående" ved hver afsendt
  mail, så kommunikationen står på sagens tråd (samme mønster som
  CLAUDE.md's regel om at en mail-aftale reserveres med `kilde.type:
  vaerksted`/`kilde.viaSagId` — sporet skal være sagen, ikke en løs kopi).

### Change-type tag(s) pr. berørt element
- Udgående mailfunktion: **BACKEND_REQUIRED**
- Logning på sag (`sagBeskedSkriv`, retning "udgående"): **BACKEND_REQUIRED**
  (genbrug af en eksisterende, allerede BUILT funktion — ikke en ny
  skrivevej, kun et nyt kaldemønster)

### Migrationsbehov
Ny infrastruktur (mailudbyder-/SMTP-konfiguration, afsenderdomæne). Ingen
datamigration.

### Risici
- Reel mailafsendelse er en ekstern integration med driftsrisiko
  (afsenderdomæne, SPF/DKIM, leveringsfejl) der ikke er dækket af den
  eksisterende testsuite.
- **Åbent designspørgsmål, delt med Skive 4D:** Procure ordre-mail (Skive
  4D) bør undersøge om den kan genbruge PRÆCIS denne udgående
  mailinfrastruktur i stedet for at bygge en anden, separat
  afsendelsesmekanisme. Rækkefølgen 3D → 4D (ikke omvendt eller parallelt)
  anbefales af netop den grund — se Skive 4D's egen Risici-sektion.
- Skal eksplicit IKKE bygge nogen del af indgående mail/webhook-modtagelse
  — det er Korrektion 7 trin D, en separat, senere sikkerhedsskive.

### Testcases
- `test/sager.test.mjs`, `test/sager-funktioner.test.mjs` — at en besked
  logget med retning "udgående" fremstår korrekt på sagstråden.
- Ny testfil forventet for den udgående mailfunktion (findes ikke i dag) —
  **IKKE PÅVIST**, men bør følge samme mønster som øvrige Cloud
  Function-tests: en ren afsendelsesfunktion, prøvet uden en reel
  SMTP-forbindelse (mock af transportlaget).

### Definition of Done
- [ ] Fleet/Facility/Procure kan sende en reel vendor-/værkstedsmail fra
      Sagsvisning (via Skive 3C's kobling).
- [ ] Den sendte mail logges på sagen/ordren via `sagBeskedSkriv`, retning
      "udgående".
- [ ] Ingen indgående mail-funktionalitet er en del af denne delskives DoD.
- [ ] `npm test` og `npm run test:rules` grønne (den sidste hvis nye
      Cloud Function-regler tilføjes).

### Rollback-plan
Deaktiver Cloud Function-kaldet i klienten (frontend-revert), lad selve
funktionen ligge udrullet men ubrugt — ingen datatab, sagsbeskeder der
allerede er logget som "udgående" forbliver gyldig historik.

---

## Skive 4 — Fakturaer, leverandører og Procure (delt i fire, Korrektion 10)

**Samme begrundelse som Skive 3:** for stor til én rollback-enhed. Deles i
fire delskiver, hver med egen fulde 8-punkts struktur, egen Definition of
Done og egen rollback. Anbefalet rækkefølge 4A → 4B → 4C, med 4D bevidst
sidst (se 4D's Risici for hvorfor den bør sekventeres efter Skive 3D).

---

## Skive 4A — Fælles Fakturaer & bilag + permission/routing

### Formål
Implementere Korrektion 2's nye permission-familie
`fakturaer.laes`/`.skriv`/`.godkend` (erstatter dagens åbne læsning +
`indkoeb.*`-gatede skrivninger), samt `nav.js`-routingændringen der gør
Fakturacenter modul-uafhængigt (Procure-fakturaer bliver en redirect).
Bundler også den lavrisiko-flytning af godkendelsespolicy (blueprint #26)
til Opsætning, da den er samme klasse arbejde (`NAVIGATION_ONLY`/
`VIEW_COMPOSITION`, ingen afhængighed af 4B/4C/4D). `PERMISSION_MODEL` +
`NAVIGATION_ONLY`/`ROUTE_REDIRECT`.

### Berørte rækker (blueprint-#)
- **#3** Fakturacenter (`/oekonomi/fakturacenter`) — kun
  permission-/routingdelen af FINISH i denne delskive; fillagring/
  drag-and-drop er Skive 4C.
- **#27** Procure-fakturaer (`/indkoeb/fakturaer`) — MERGE: redirect til
  Fakturacenter med Procure-filter.
- **#26** Godkendelsespolicy — flyt `Godkendelser.jsx`s beløbsgrænse-/
  godkender-opsætning til Opsætning; driftsskærmen viser fortsat den
  aktive regel.

### Præcise filer og routes
- **`firebase.rules.json`** — tilføj perm-tjek til `fakturaer`s `.read`
  (i dag ingen permission overhovedet, kun auth+tenant+aktivt abonnement,
  linje ~2916-2925); opdatér de tre Cloud Functions' interne perm-tjek:
  `fakturamatch`/`fakturadestination` (`indkoeb.skriv` → `fakturaer.skriv`),
  `fakturastatus` (`indkoeb.skriv` → `fakturaer.skriv` for statusskift,
  `indkoeb.godkend` → `fakturaer.godkend` for betalingsgodkendelse).
- **`functions/index.js`** — samme tre funktioners perm-tjek opdateres
  konsistent med rules-ændringen ovenfor (server og regel skal være enige,
  jf. CLAUDE.md: "en kontrol der kun findes i frontend... tillader før
  eller siden noget serveren skulle have stoppet" — gælder analogt for et
  perm-navn der er rettet ét sted og ikke det andet).
- **`src/fleet/permissions.js`** — tilføj `fakturaer.laes`/`.skriv`/
  `.godkend` til `PERM` og `ROLLE_PERMS`, med SAMME rollefordeling som de
  gamle `indkoeb.*`-navne havde (casehandler/disponent/koordinator/
  lagermedarbejder/revisor/admin for `.laes`; casehandler/disponent/
  koordinator/admin for `.skriv`; koordinator/admin for `.godkend`) — ingen
  mister eller får adgang dag 1, kun navnet ændres.
- **`test/laeseadgang.test.mjs`** — opdatér `LUKKET`-tabellen: `fakturaer`
  nævnes i dag slet ikke (stod bevidst uden for governance-testen som en af
  "de tre tvetydige noder", Korrektion 2); skal nu have en reel
  `.laes`-post.
- `src/moduler/indkoeb/Fakturaer.jsx` (route `/indkoeb/fakturaer`) — erstat
  skærmens indhold med en `ROUTE_REDIRECT` til
  `/oekonomi/fakturacenter?filter=procure` (eller tilsvarende
  querystring-filter). `src/fleet/nav.js`s `fakturaer`-barn i
  `indkoeb`-gruppen fjernes eller peges om. Ingen datamigration: begge
  skærme læser/skriver allerede samme `fakturaer/`-node
  (`10_DUPLICATION_AND_OVERLAP_REPORT.md` bekræfter "bevidst delt,
  u-gatet basenode").
- `src/fleet/nav.js` — flyt godkendelsespolicy (#26): `Godkendelser.jsx`s
  beløbsgrænse-/godkender-opsætning flyttes til Opsætning, siden viser
  fortsat den aktive regel (allerede delvist bygget, jf.
  `10_DUPLICATION_AND_OVERLAP_REPORT.md`: begge skærme læser samme
  `godkendelsesregler`-node).

### Change-type tag(s) pr. berørt element
- Ny `fakturaer.laes`/`.skriv`/`.godkend`-familie (regler + functions +
  permissions.js): **PERMISSION_MODEL**
- Procure-fakturaer → redirect: **ROUTE_REDIRECT**
- Godkendelsespolicy-flytning: **NAVIGATION_ONLY** + **VIEW_COMPOSITION**

### Migrationsbehov
Ingen datamigration af `fakturaer/`-noden selv (samme poster, nyt
adgangsnavn). Kræver `npm run test:rules` grønt før commit (regelfil
ændres), og `npm run regler:udrul` ved udrulning.

### Risici
- Perm-omdøbningen skal opdateres KONSISTENT tre steder samtidig (regler,
  functions, permissions.js) — en glemt fjerde plads (fx en anden skærm der
  stadig tjekker `indkoeb.laes` for at vise en fakturaknap) ville give en
  pæn knap uden reel adgang, eller omvendt en adgang uden en synlig knap.
- Procure-fakturaer-redirecten skal bevare eksisterende bogmærker/links
  (samme mønster som `REDIRECTS` i `nav.js` for tidligere flytninger) —
  overses dette, brydes eksterne links til siden.

### Testcases
- `test/laeseadgang.test.mjs` — `fakturaer` skal nu have en dækket
  `.laes`-post i `LUKKET`-tabellen.
- `test/rules.rollematrix.test.mjs` — bekræfter ingen rolle mister reel
  adgang under omdøbningen.
- `test/fakturacenter.test.mjs`, `test/faktura.test.mjs` — den delte
  `fakturaer/`-node og match/godkendelses-logikken.
- `test/rules.procure.test.mjs`, `test/godkendelse.test.mjs` —
  godkendelsespolicy-flytningen.

### Definition of Done
- [ ] `fakturaer.laes`/`.skriv`/`.godkend` findes i `PERM`/`ROLLE_PERMS`,
      håndhæves i `firebase.rules.json` og i de tre Cloud Functions.
- [ ] `test/laeseadgang.test.mjs`s `LUKKET`-tabel dækker `fakturaer`.
- [ ] `/indkoeb/fakturaer` redirecter til Fakturacenter med Procure-filter;
      ingen selvstændig fakturaskærm i Procure-menuen.
- [ ] Godkendelsespolicy er flyttet til Opsætning > Procure; driftsskærmen
      viser fortsat den aktive regel.
- [ ] `npm test` og `npm run test:rules` grønne.

### Rollback-plan
Redirect og nav-UI: `git revert`, ingen datatab (samme node som før).
Perm-omdøbningen kræver at en rollback af `firebase.rules.json` også køres
gennem `npm run test:rules` + `npm run regler:udrul` — en ren git-revert af
regelfilen alene rører ikke det udrullede.

---

## Skive 4B — Fælles Leverandører + CRUD

### Formål
Implementere Korrektion 3's Model B (`leverandoerer` flytter til basen som
et fuldt ugatet base-node + dedikeret `leverandoerer.laes`/`.skriv`), samt
bygge den faktiske opret/redigér-CRUD-formular. Per Korrektion 8's
verifikation: `.write`-vejen på `leverandoerer/$leverandoerId` findes
allerede — kun formularen mangler i UI'et. Derfor `VIEW_COMPOSITION` for
selve formularen, `PERMISSION_MODEL`/`DATA_MODEL` for node-ungatingen —
**ikke** `BACKEND_REQUIRED`.

### Berørte rækker (blueprint-#)
- **#28** Leverandører (`/indkoeb/leverandoerer`) — MOVE: fælles stamdata
  for Fleet, Facility og Procure; byg CRUD.

### Præcise filer og routes
- `firebase.rules.json` — flyt `leverandoerer` til basen (Model B, samme
  mønster som `satser`/`grundlag`/`indkoeb`/`fakturaer`); tilføj
  `leverandoerer.laes`/`leverandoerer.skriv`. **Ikke** Model A
  (inline-OR-mønstret fra `reolpladser`) — `moduler.js`s egen kommentar
  advarer eksplicit mod at udvide det ene, bevidste undtagelsesmønster.
- `src/fleet/permissions.js` — tilføj `leverandoerer.laes`/`.skriv` til
  `PERM`/`ROLLE_PERMS`, samme rollefordeling som Korrektion 2's
  `fakturaer.laes`/`.skriv` (Skive 4A).
- `src/moduler/indkoeb/Leverandoerer.jsx` (route `/indkoeb/leverandoerer`)
  — i dag "FASE 0: VISNING" (ingen skrivehandling,
  `06_IMPLEMENTATION_STATUS.md` §06). `.write`-vejen findes allerede
  (Korrektion 8) — arbejdet er **ren opret/redigér-formular**, ingen ny
  Cloud Function.
  Menuplacering flyttes samtidig fra kun `/indkoeb/leverandoerer` til en
  fælles stamdatasti (fx under Opsætning, ved siden af Enheder/Medarbejdere/
  Kasseliste-mønsteret i `nav.js`s `opsaetning`-gruppe), med `kraeverModul`
  fjernet (Model B gør noden modul-uafhængig, som `kunder`-punktet).

### Change-type tag(s) pr. berørt element
- Node-ungating (`leverandoerer` → basen) + ny permission-familie:
  **PERMISSION_MODEL** + **DATA_MODEL**
- Opret/redigér-CRUD-formular: **VIEW_COMPOSITION** (bekræftet INGEN
  `BACKEND_REQUIRED` — `.write`-vejen findes allerede, Korrektion 8)
- Menuflytning til fælles stamdata: **NAVIGATION_ONLY**

### Migrationsbehov
Ingen migration af selve `leverandoerer`-noden eller dens poster — kun en
regelændring (base-node + ny permission) og en ny formular. Kræver
`npm run test:rules` grønt før commit.

### Risici
- `leverandoerer` læses i dag allerede af **elleve** eksisterende skærme
  (Disponering, Servicekalender, Arbejdskø, Driftskalender m.fl., talt op i
  regelkommentaren selv) — ungatingen må ikke bryde deres adgang; den GØR
  dem tværtimod funktionelle for Fleet-/Facility-kunder uden Procure, som
  er hele pointen med Model B.
- CRUD-formularen skal respektere samme feltvalidering som den
  eksisterende `.write`-regel allerede håndhæver — en klientvalidering der
  ikke matcher regelfilen, er forbudt af CLAUDE.md ("skriv ikke en
  klientvalidering der ikke også står i `firebase.rules.json`").

### Testcases
- `test/leverandoerer.test.mjs`, `test/rules.leverandoerer.test.mjs` —
  leverandørnodens regler, nu inkl. skrivning.
- `test/laeseadgang.test.mjs`, `test/rules.rollematrix.test.mjs` — den nye
  permission-families fordeling og at de elleve eksisterende forbrugere
  ikke mister adgang.

### Definition of Done
- [ ] `leverandoerer` er en fuldt ugatet base-node med
      `leverandoerer.laes`/`.skriv` i `PERM`/`ROLLE_PERMS`.
- [ ] Leverandører har opret/redigér-CRUD og er nået som fælles stamdata,
      ikke kun fra Procure-menuen; tilgængelig for Fleet-/Facility-kunder
      uden Procure.
- [ ] De elleve eksisterende leverandørkartotek-forbrugere er uændret
      funktionelle.
- [ ] `npm test` og `npm run test:rules` grønne.

### Rollback-plan
CRUD-UI: `git revert`, ingen datatab (samme node som før). Node-ungatingen
kræver at en rollback af `firebase.rules.json` køres gennem
`npm run test:rules` + `npm run regler:udrul`, ikke kun en git-revert af
filen.

---

## Skive 4C — Fælles dokument-/fillagringslag + fakturaupload

### Formål
Bygge platformens FØRSTE fillagringslag, scopet til Fakturacenters behov
(drag-and-drop-upload af bilag). **Den enkeltopgave i hele skiveplanen med
størst risiko** — ingen eksisterende mønster at udvide, reelt nybyggeri.
`BACKEND_REQUIRED`.

### Berørte rækker (blueprint-#)
- **#3** Fakturacenter (`/oekonomi/fakturacenter`) — fillagrings-/
  drag-and-drop-delen af FINISH (permission-/routingdelen er Skive 4A).

### Præcise filer og routes
- `src/moduler/oekonomi/Fakturacenter.jsx` — match/godkendelse/bogføring
  er allerede BUILT (Cloud Functions `fakturadestination`/`fakturastatus`).
  Det manglende er **indgangskanalerne**: `06_IMPLEMENTATION_STATUS.md`
  §01 siger direkte "Ingen indgangskanal — kræver fillagring som ikke
  findes i platformen". Dette er en platform-bred mangel, ikke kun en
  skærmmangel: **ingen fillagring findes noget sted i FleetControl i dag**
  (bekræftet indirekte af gentagne "kræver fillagring"-noter for foto/
  kvittering i Procure Behov §6.2, chaufførindberetning §11.3, og
  Leverandørers prisliste-vedhæftning). At bygge drag-and-drop/fillagring
  til Fakturacenter er derfor reelt at bygge platformens FØRSTE
  fillagringslag — en arkitekturbeslutning (Firebase Storage vs. andet),
  ikke kun en UI-komponent.
- Ny sikkerhedsmodel: hvem må uploade/læse hvilke filer, hvordan spærres på
  tenant (analogt til RTDB's `auth.token.tenant === $tenantId`-mønster) —
  designes og implementeres som del af denne delskive.

### Change-type tag(s) pr. berørt element
- Fillagring/drag-and-drop (platformens første fillagringslag):
  **BACKEND_REQUIRED** — højeste risiko i hele skiveplanen.

### Migrationsbehov
Ny infrastruktur (Storage-bucket eller tilsvarende) — ingen eksisterende
data at migrere, men en ny sikkerhedsmodel skal designes.

### Risici
- Størst risiko for at blive undervurderet i hele planen — det ser ud som
  "tilføj en upload-knap", men er reelt platformens første
  fillagringsarkitektur, med konsekvenser for GDPR/retention (CLAUDE.md's
  `RETENTION_MAANEDER`-mønster gælder formentlig også filer, ikke kun
  RTDB-poster — **IKKE PÅVIST** om retentionsmodellen i dag dækker andet
  end RTDB).
- **Genbrugspotentiale, men bevidst ude af scope her:** samme lag kunne
  senere dække chaufførindberetningens fotos/kvitteringer (Skive 6) og
  Leverandørers prisliste-vedhæftning — men denne delskive scopes STRAMT
  til Fakturacenters behov. At forsøge at bygge et generisk lag i samme
  ombæring ville gøre den allerede højeste-risiko-opgave i planen endnu
  større.

### Testcases
Ny testfil forventet for fillagring (findes ikke i dag) — **IKKE PÅVIST**,
men bør følge samme mønster som `test/rules.*`-filerne: udled tilladte
stier af den nye Storage-sikkerhedsmodel, test dem i emulator.

### Definition of Done
- [ ] Mindst én reel indgangskanal (drag-and-drop-upload) virker end-to-end
      mod en rigtig fillagring, scopet til Fakturacenter.
- [ ] Storage-sikkerhedsmodellen er dokumenteret og testet (tenant-
      isolation mindst på niveau med RTDB-mønstret).
- [ ] `npm test` og `npm run test:rules` grønne.

### Rollback-plan
Hvis en Storage-bucket er oprettet, kan koden der uploader dertil rulles
tilbage uden at slette bucketen — uploadede filer forbliver, men bliver
utilgængelige fra UI'et igen (accepteret midlertidig tilstand, ikke
datatab).

---

## Skive 4D — Procure ordre-mail

### Formål
Reel udgående mailafsendelse i Bestillinger, der erstatter dagens
copy-paste-mock. `BACKEND_REQUIRED`. **Bør undersøges som samme fælles
mailinfrastruktur som Skive 3D**, ikke en anden, separat
afsendelsesmekanisme — se Risici for den anbefalede rækkefølge.

### Berørte rækker (blueprint-#)
- **#25** Bestillinger (`/indkoeb/bestillinger`) — FINISH: reel
  mailafsendelse med PO-nummer.

### Præcise filer og routes
- `src/moduler/indkoeb/Bestillinger.jsx` (route `/indkoeb/bestillinger`) —
  "Kopiér udkast"/"Markér som sendt" er i dag manuel
  (`06_IMPLEMENTATION_STATUS.md` §06: "Systemet sender ikke udkastene").
  Kræver en Cloud Function med reel SMTP/afsenderadresse-integration
  (ingen SMTP-kald findes i `functions/index.js` i det læste materiale).

### Change-type tag(s) pr. berørt element
- Reel ordre-mail: **BACKEND_REQUIRED**

### Migrationsbehov
Ingen datamigration. Hvis Skive 3D's udgående mailfunktion genbruges: ingen
ny infrastruktur, kun et nyt kaldemønster (PO-nummer i stedet for
sagsreference). Hvis en separat mekanisme bygges: samme
infrastrukturbehov som Skive 3D (afsenderdomæne/SMTP-konfiguration).

### Risici
- **Åbent designspørgsmål (delt med Skive 3D):** denne delskive bør
  UNDERSØGE om Skive 3D's udgående mailfunktion (Fleet/Facility/Procure)
  kan genbruges direkte i stedet for at bygge en anden, separat
  afsendelsesmekanisme. To parallelle mailmotorer ville gentage præcis den
  duplikeringsfejlklasse CLAUDE.md advarer mod flere steder ("et mønster
  der er dukket op seks gange"). **Anbefalet rækkefølge: 3D før 4D**, så
  4D kan bygges som et kaldemønster oven på en allerede eksisterende
  funktion frem for en ny.
- Reel mailafsendelse er en ekstern integration med driftsrisiko
  (afsenderdomæne, SPF/DKIM, leveringsfejl) der ikke er dækket af den
  eksisterende testsuite.

### Testcases
- `test/indkoeb.test.mjs`, `test/rules.procure.test.mjs`,
  `test/procure.test.mjs`, `test/bestilling.test.mjs`,
  `test/behov.test.mjs`, `test/godkendelse.test.mjs` — hele Procure-kæden,
  som ikke må brydes af mailafsendelsen.
- `test/priser.test.mjs`, `test/pricing-forloeb.test.mjs` — hvis
  PO-nummer-generering rører prismotoren.

### Definition of Done
- [ ] Bestillinger sender en reel mail til leverandøren med PO-nummer.
- [ ] Designspørgsmålet om delt mailinfrastruktur med Skive 3D er afgjort
      og dokumenteret (genbrugt eller bevidst separat, med begrundelse).
- [ ] `npm test` og `npm run test:rules` grønne.

### Rollback-plan
Deaktiver Cloud Function-kaldet i klienten (revert), lad selve funktionen
ligge udrullet men ubrugt.

---

## Skive 5 — Unitbooking og Warehouse

### Formål
Merge Unitbookings Kalender/Udlån til én arbejdsflade, samle reolpladser/
lokationer i én fælles stamdataskærm, skabe en ny Warehouse-forside, flytte
Bevægelser til et avanceret undermenupunkt, og gøre transportlabels
kontekstuelle.

### Berørte rækker (blueprint-#)
- **#30** Kalender (`/unitbooking`) — FINISH: samlet arbejdsflade.
- **#31** Udlån (`/unitbooking/udlaan`) — MERGE ind i Kalender.
- **#33** Reolpladser (`/unitbooking/reolpladser`) og **#45** Lokationer
  (`/warehouse/lokationer`) — MERGE til én fælles skærm under
  Opsætning > Lagerlokationer.
- **#35** Varer (`/warehouse`) — MOVE: ny Warehouse-forside, varekartotek
  flyttes til underside.
- **#37** Bevægelser (`/warehouse/bevaegelser`) — MOVE til Warehouse >
  Mere > Bevægelser.
- **#41** Transportlabels (`/warehouse/labels`) — MERGE: kontekstuel fra
  Beholdere/Modtagelse.

### Præcise filer og routes
- **#33/#45-mergen er allerede næsten gratis, bekræftet mod
  `04_DATA_OWNERSHIP.md`:** `reolpladser` er "den ENESTE node i kodebasen
  med eksplicit deling mellem to navngivne moduler
  (`NODE_MODUL.reolpladser = ["unitbooking", "warehouse"]`)", og begge
  skærme (`src/moduler/unitbooking/Reolpladser.jsx`,
  `src/moduler/warehouse/Lokationer.jsx`) skriver allerede med `flet:true`
  til den SAMME node, netop for at undgå at overskrive hinandens felter.
  Arbejdet er derfor reel UI-konsolidering (én skærm, modulbestemte felter
  vist betinget), ikke en datamodel-ændring — ingen ny node, ingen ny
  Cloud Function, ingen migration. Placeres under Opsætning som fælles
  stamdatasti, `kraeverModul` sættes til at acceptere ENTEN
  `"unitbooking"` ELLER `"warehouse"` (**IKKE PÅVIST** om `kraeverModul`
  i dag understøtter en array/OR-værdi som `nav.js`-feltet — kun
  `NODE_MODUL` i reglerne gør det per `04_DATA_OWNERSHIP.md`; skal
  verificeres eller nav.js-mekanikken udvides).
- `src/moduler/unitbooking/Kalender.jsx` (route `/unitbooking`) og
  `src/moduler/unitbooking/Udlaan.jsx` (route `/unitbooking/udlaan`) —
  flyt "Søg ledige"/"Reservér"/"Næste handling" fra Udlaan.jsx ind i
  Kalender.jsx som panel; `/unitbooking/udlaan` bevares som deep link
  (samme `skiftUdlaan`/`opretUdlaan`-funktioner genbruges uændret, begge
  allerede BUILT).
- `src/moduler/warehouse/Varer.jsx` (i dag route `/warehouse`, modulets
  forside) — en NY forsidekomponent oprettes (fx
  `src/moduler/warehouse/Oversigt.jsx`, route `/warehouse`), og Varer.jsx
  flyttes til en ny underside-route (fx `/warehouse/varer`). `src/App.jsx`
  og `src/fleet/nav.js` opdateres tilsvarende (ny `Route`, nyt
  `warehouseVarer`-sti-felt i nav.js). Bemærk: dette er den ENESTE ægte
  ROUTE-ændring (ikke kun nav) i denne skive, fordi `/warehouse` i dag
  PEGER på Varer.jsx direkte (`App.jsx` linje 508: `<Route path="warehouse"
  element={<Wmsvarer />} />`).
- `src/moduler/warehouse/Bevaegelser.jsx` (route
  `/warehouse/bevaegelser`) — bliver menuplaceret under et nyt "Mere"-
  undermenupunkt i `nav.js`s `warehouse`-gruppe, i stedet for på topniveau.
  Ingen ændring i selve komponenten eller dens Cloud Function
  (`bevaegelseskriv`, allerede BUILT).
- `src/moduler/warehouse/Transportlabels.jsx` (route `/warehouse/labels`)
  — indholdet bliver et kontekstuelt panel/dialog åbnet fra
  `src/moduler/warehouse/Carriers.jsx` (Beholdere) og
  `src/moduler/warehouse/Modtagelse.jsx`; `/warehouse/labels` bevares som
  deep link (samme mønster som Forslag/Arbejdskø i Skive 3A).

### Change-type tag(s) pr. berørt element
- Reolpladser/Lokationer-merge: **VIEW_COMPOSITION** (bekræftet ingen
  `DATA_MODEL`-ændring nødvendig — allerede samme node)
- Kalender/Udlån-merge: **VIEW_COMPOSITION**
- Ny Warehouse-forside: **VIEW_COMPOSITION** + **ROUTE_REDIRECT** (Varer
  flytter route)
- Bevægelser til "Mere": **NAVIGATION_ONLY**
- Transportlabels kontekstuel: **VIEW_COMPOSITION**
- Ingen `BACKEND_REQUIRED`- eller `PERMISSION_MODEL`-arbejde i denne skive —
  den billigste af de driftsmodul-specifikke skiver, fordi det
  underliggende datalag allerede er korrekt delt.

### Migrationsbehov
Ingen. Dette er den ene skive hvor `04_DATA_OWNERSHIP.md` selv bekræfter at
det tungeste punkt (reolpladser/lokationer) allerede er én node — hele
skiven er UI-konsolidering af eksisterende, korrekte data- og skrivelag.

### Risici
- Den eneste reelle route-ændring (`/warehouse` skifter fra Varer til en ny
  Oversigt-komponent) betyder at ALLE eksisterende bogmærker/interne links
  til `/warehouse` nu rammer noget andet end i dag — kræver en
  `REDIRECTS`-post (`{ fra: "/warehouse/varer-gammel-alias", ... }` er
  ikke nødvendig, men en INTERN sti til den nye Varer-underside skal
  vælges konsekvent og alle interne henvisninger til den gamle
  `/warehouse`-som-varekartotek skal opdateres, jf. samme mønster som da
  Driftskalenderen overtog `/flaade` fra Enheder).
- `kraeverModul`-mekanikkens evne (eller mangel på samme) til at udtrykke
  "ét AF to moduler" for det fælles Lokationer-punkt er ikke bekræftet —
  hvis mekanikken kun understøtter én streng, kræver dette en lille,
  isoleret udvidelse af `nav.js`/`AppShell.jsx`s `harModul()`-kald, som bør
  scopes stramt for ikke at blive en de-facto Skive 2-opgave.
- Labels-kontekstualisering rører to indgangspunkter (Carriers og
  Modtagelse) — risiko for at glemme det ene, så labelet kun kan printes
  fra det ene sted i praksis.

### Testcases
- `test/reolplads.test.mjs`, `test/rules.carriers.test.mjs` — den delte
  reolplads-node og dens `flet:true`-skrivemønster.
- `test/rules.unitbooking.test.mjs`, `test/unitbooking.test.mjs` —
  Kalender/Udlån-flowets underliggende regler.
- `test/warehouse.test.mjs`, `test/rules.warehouse.test.mjs` — Warehouse
  generelt, kritisk efter route-flytningen af `/warehouse`.
- `test/transportlabel.test.mjs`, `test/stregkode128.test.mjs`,
  `test/qrkode.test.mjs` — labelmotoren, som ikke må ændre sig ved at blive
  kontekstuel.
- `test/volumen.test.mjs`, `test/sporbarhed.test.mjs` — øvrige
  Warehouse-skærme, for at bekræfte de ikke er utilsigtet påvirket af
  forsidens omlægning.
- `test/rutedeling.test.mjs` — den nye Warehouse-forsidekomponent SKAL have
  `export default` og være `lazy()`-importeret, ellers fejler den først når
  ruten åbnes hos en kunde.

### Definition of Done
- [ ] `/unitbooking` er én samlet arbejdsflade for kalender + udlån.
- [ ] Reolpladser og Lokationer er én skærm under Opsætning, tilgængelig for
      kunder med enten Unitbooking eller Warehouse (eller begge).
- [ ] `/warehouse` viser en ny modulforside, ikke varekartoteket direkte;
      varekartoteket er nået via et tydeligt undermenupunkt.
- [ ] Bevægelser er flyttet til et "Mere"-undermenupunkt.
- [ ] Transportlabels printes kontekstuelt fra Beholdere og Modtagelse;
      `/warehouse/labels` virker stadig som deep link.
- [ ] `npm test` grøn, ingen ændring i `firebase.rules.json` forventet.

### Rollback-plan
Ren UI-omlægning af allerede korrekt delte noder — `git revert`. Den ene
route-ændring (`/warehouse`) kræver at en eventuel ny `REDIRECTS`-post også
rulles tilbage sammen med koden, så et link sat i produktion mellem
udrulning og rollback ikke ender som en 404 — inkludér `REDIRECTS`-ændringen
i samme commit/revert-enhed som route-flytningen.

---

## Skive 6 — Workforce og chaufførapp

### Formål
Lukke de reelle, dokumenterede huller i Workforce: fraværsgodkendelse med
automatisk reservationsblokering, medarbejderredigering/-fratrædelse, og
en kanonisk skrivevej for kompetencevedligehold — samt tilføje
offline-sikkerhed til chaufførindberetning, som i dag mangler den
offline-kø statusmeldinger allerede har.

### Berørte rækker (blueprint-#)
- **#13** Ferie & fravær (`/bemanding/fravaer`) — FINISH: kontorets
  godkend/afvis-svar + automatisk reservation der blokerer disponering.
- **#14** Medarbejdere (`/opsaetning/medarbejdere`) — MOVE (allerede rigtig
  placering) + FINISH: redigering, fratrædelse, tydelig person/login-kobling.
- **#12** Kompetencer (`/bemanding/kompetencer`) — FINISH: kanonisk
  vedligeholdelsesvej for kompetencer/beviser (override kan vente).
- **#59** Indberetning (`/app/indberetning`) — FINISH: offline-sikkerhed +
  materialeforbrug, fotos/kvittering når fillagring (Skive 4C) er klar.

### Præcise filer og routes
- `src/moduler/Fravaer.jsx` (route `/bemanding/fravaer`) — "Registrér
  fravær"-knappen er i dag permanent deaktiveret på kontorsiden (skrivning
  findes reelt kun via chaufførappens selvbetjenings-gren,
  `06_IMPLEMENTATION_STATUS.md` §03). Kræver TO nye, koblede stykker
  backend, begge `NOT_BUILT` i dag:
  1. Kontorets godkend/afvis-svar (skriv `ansoegning.status`, `afgjortAf`,
     `svar` på en `fravaer/{id}`-post) — ingen skærm gør dette i dag.
  2. Fravær → reservation ved godkendelse (**rettet af Korrektion 9**):
     `reservationFraFravaer()` er i dag "eksplicit kun en visning"
     (kildekodens egen kommentar, jf. `06_IMPLEMENTATION_STATUS.md`); skal
     blive en reel `reservationFraFravaer(post)`-byggefunktion, i SAMME
     mønster som de to allerede eksisterende `reservationFraOpgave()` og
     `reservationFraAftale()` — begge små byggefunktioner der kalder den
     samme delte `reserver(db, path, ny, opts)` fra
     `src/fleet/reservations.js` (spejlet i `functions/delt/reservations.js`).
     **Dette er IKKE en ny reservationsmekanisme** — det er en femte kilde
     ind i den samme, eksisterende motor. `PRIORITET.fravaer = 30` findes
     allerede i tabellen (mellem `vaerksted: 40` og `facilitySag: 20`) og
     kræver ingen ændring.
- `src/moduler/Medarbejdere.jsx` (route `/opsaetning/medarbejdere`) —
  **rettet af Korrektion 8:** "Redigér" og "Registrér fratrædelse" er begge
  permanent deaktiverede (`06_IMPLEMENTATION_STATUS.md` §03), men
  `.write` på `personale/$id` tillader ALLEREDE direkte klient-skrivning
  med `personale.skriv`, og `PERSONALE_STATUS` har allerede `fratraadt` som
  gyldig tilstand — fratrædelse er en almindelig feltopdatering via samme
  `gem()`-kald som oprettelse. Arbejdet er ren UI: aktivér knapperne, byg
  redigeringsformularen, ingen ny Cloud Function.
- `src/moduler/Kompetencer.jsx` (route `/bemanding/kompetencer`) —
  **rettet af Korrektion 8:** "Overrul med begrundelse" er permanent
  deaktiveret, men `.write` på `kompetencer/$kompetenceId` tillader
  ALLEREDE direkte klient-skrivning med kun `kompetencer.skriv`, og
  `byggOverride({personId, kompetence, begrundelse, bruger})` i
  `src/fleet/personale.js` er en FÆRDIG byggefunktion — den kastes kun
  fordi UI'et aldrig kalder den. Blueprintet nedskalerer selv ambitionen:
  "avanceret override kan vente" — V1-kravet er en KANONISK
  vedligeholdelsesVEJ for selve kompetence-/bevisdataen (dvs. mulighed for
  at opdatere en udløbsdato/tilføje et bevis), ikke override-mekanikken.
  Per Skive 0's verificerede fakta: læseadgangen er allerede korrekt
  modul-gatet. Arbejdet er ren UI: kald `byggOverride()` fra en ny knap/
  formular, INGEN `PERMISSION_MODEL`-ændring (kun admin har
  `kompetencer.skriv` i dag — en bredere rollefordeling er en separat,
  fremtidig `PERMISSION_MODEL`-tilføjelse, ikke en forudsætning for denne
  delskive).
- `src/moduler/app/Indberetning.jsx` (route `/app/indberetning`) — skriver
  i dag direkte til `indberetninger` via `gem()` UDEN Cloud Function og
  UDEN offline-kø (`06_IMPLEMENTATION_STATUS.md` §11: "Ingen offline-kø for
  denne skrivning — IKKE PÅVIST om data tabes ved reel netværksfejl").
  Chaufførappens Turplan (`src/moduler/app/Turplan.jsx`) har allerede en
  fungerende offline-kø (`meldingskoe.js`, jf. `test/meldingskoe.test.mjs`)
  — samme mønster/modul genbruges for Indberetning fremfor at bygge et nyt.
  Materialeforbrug/fotos afventer eksplicit fillagring (Skive 4C) og bør
  IKKE startes før Skive 4C er afsluttet, eller sekvenseres som en
  efterfølgende delskive.

### Change-type tag(s) pr. berørt element
- Fraværsgodkendelse (kontorsvar): **BACKEND_REQUIRED**
- Fravær → reservation ved godkendelse: **BACKEND_REQUIRED** (ny
  `reservationFraFravaer()`-byggefunktion + Cloud Function-kald af den
  eksisterende, delte `reserver()` — rører den delt-ejede
  `reservationer`-node, se Risici; IKKE en ny reservationsmekanisme,
  Korrektion 9)
- Medarbejderredigering/-fratrædelse: **VIEW_COMPOSITION** — **rettet fra
  `BACKEND_REQUIRED` af Korrektion 8** (`.write` + `PERSONALE_STATUS.fratraadt`
  findes allerede)
- Kompetencevedligehold (skrivevej): **VIEW_COMPOSITION** — **rettet fra
  `BACKEND_REQUIRED` af Korrektion 8** (`.write` + `byggOverride()` findes
  allerede). Eksplicit IKKE `PERMISSION_MODEL` (Skive 0's konklusion B).
- Offline-kø for Indberetning: **VIEW_COMPOSITION** (genbrug af
  eksisterende `meldingskoe.js`-mønster, ikke ny arkitektur)

### Migrationsbehov
Ingen datamigration for kompetence-/medarbejderskrivevejene. For
fravær→reservation: ingen migration af eksisterende fraværsposter
(reservationen skrives fremadrettet ved godkendelse, ikke bagudrettet —
samme princip som CLAUDE.md's "der er intet at fylde ud" for
opgave-reservationer, beslutning 68, gælder analogt: byg ikke en
bagudrettet udfyldning for allerede-godkendte fravær uden en eksplicit
beslutning om det).

### Risici
- **Den højeste datamodel-risiko i hele skiveplanen ligger her:**
  `reservationer` er den delt-ejede basenode med historisk dokumenteret
  skrøbelighed (CLAUDE.md/beslutning 92: en forkert gating udelukkede 37
  reservationer for én kunde). At tilføje en FEMTE reel skrivevej
  (fraværets, ved siden af booking/værksted/facility-sag) til en node der
  allerede har fire, øger overfladen for præcis den fejlklasse
  `10_DUPLICATION_AND_OVERLAP_REPORT.md` selv kalder "en tilbagevendende
  risikoklasse". Skal implementeres med samme `tjekDisponering()`-mønster
  (fem-tjek) som de øvrige tre kilder, ikke en femte, særskilt vej.
- Medarbejderredigering rører CLAUDE.md's eksplicitte advarsel om at
  `division`, `cpr`, `privatAdresse` er forbudte felter på `personale`-noden
  — enhver ny redigeringsformular skal respektere den samme feltbegrænsning
  som oprettelsesformularen allerede gør.
- Offline-kø for Indberetning skal ikke opfindes fra bunden — risikoen er
  at et nyt, parallelt kø-mønster bygges ved siden af `meldingskoe.js` i
  stedet for at genbruge det, hvilket ville gentage præcis den
  duplikeringsfejlklasse CLAUDE.md advarer mod flere steder ("et mønster
  der er dukket op seks gange").
- Materialeforbrug/fotos i Indberetning har en hård, ekstern afhængighed af
  Skive 4C's fillagring — sekventeres forkert, bygges der mod et lag der
  ikke findes endnu.
- Kompetencer/Medarbejdere er retagget til `VIEW_COMPOSITION`, men risikoen
  ved at SPRINGE verifikationstrinnet over ("er der virkelig ingen ny
  backend nødvendig her?") er reel nok til at være dokumenteret i
  Korrektion 8 — enhver implementering skal selv bekræfte `.write`-reglen
  og byggefunktionen mod den udrullede regelfil, ikke kun stole på denne
  plans citat af dem.

### Testcases
- `test/fravaer.test.mjs`, `test/rules.ansoegning.test.mjs` — den
  eksisterende selvbetjenings-gren fraværsgodkendelsen skal bygges oven på.
- `test/reservations.test.mjs` (eller tilsvarende, hvis det er filnavnet
  for `reservations.js`s egen prøve) — at `reservationFraFravaer()` kalder
  den delte `reserver()` korrekt og at `PRIORITET.fravaer = 30` respekteres
  mod de øvrige fire kilder.
- `test/rules.personale.test.mjs` — medarbejderredigeringens feltgrænser
  (`division`/`cpr`/`privatAdresse`-forbuddet).
- `test/flaade-bemanding.test.mjs` — den fælles kapacitetsgraf-kilde
  (`kapacitetsgrad()`/`ledig()`) der ikke må splitte sig igen (84% vs 83%-
  fælden, beslutning 71).
- `test/sensitivlaesning.test.mjs` — hvis fraværs-årsagsfeltet (allerede
  gated bag `fravaerSensitiveLaes`) berøres af den nye godkendelsesskærm.
- `test/statusmelding.test.mjs`, `test/meldingskoe.test.mjs`,
  `test/stop.test.mjs` — det eksisterende offline-kø-mønster fra Turplan,
  som Indberetning skal genbruge.
- `test/chaufforadgang.test.mjs` — chaufførens begrænsede rute-/
  permissionssæt, som Indberetning-ændringen ikke må udvide utilsigtet.
- `test/referencetjek.test.mjs` — hvis en ny reservation-fra-fravær
  indfører et nyt `...Id`-referencefelt.

### Definition of Done
- [ ] Kontoret kan godkende/afvise en fraværsansøgning fra
      `/bemanding/fravaer`.
- [ ] Et godkendt fravær skriver automatisk en reservation der blokerer
      disponering for den periode.
- [ ] Medarbejdere kan redigeres og fratrædes fra
      `/opsaetning/medarbejdere`.
- [ ] Kompetencer/beviser kan opdateres via en kanonisk skrivevej fra
      `/bemanding/kompetencer`.
- [ ] Chaufførens Indberetning har samme offline-sikkerhed som Turplan.
- [ ] `npm test` og `npm run test:rules` grønne.

### Rollback-plan
Medarbejderredigering/-fratrædelse og Kompetencevedligehold er ren
`VIEW_COMPOSITION` oven på allerede eksisterende `.write`-veje og
byggefunktioner — `git revert`, ingen Cloud Function at deaktivere, ingen
datamigration. Fraværsgodkendelsens nye Cloud Function (kontorsvar) kan
deaktiveres ved at fjerne klientkaldet uden at slette funktionen fra
`functions/index.js` med det samme. **Reservations-skrivningen fra fravær
kræver særlig opmærksomhed ved rollback:** hvis en fraværsreservation
allerede er skrevet til den delte `reservationer`-node før en rollback
besluttes, skal disse poster identificeres (fx via `kilde.type:
"fravaer"`) og enten bevares (hvis fraværet stadig gælder) eller eksplicit
fjernes — en ren kode-revert efterlader IKKE automatisk de allerede-skrevne
reservationer i en konsistent tilstand, i modsætning til de rene
UI-delene ovenfor.

---

## Skive 7 — Økonomi og stamdata

### Formål
Bygge den manglende UI-indgang til booking→fakturagrundlag (som serveren
allerede understøtter), give kundestamdata en reel CRUD, gøre
virksomhedsoplysninger redigerbare, og placere priser/afregning korrekt
ift. de nye modulgrænser.

### Berørte rækker (blueprint-#)
- **#4** Fakturering (`/oekonomi/fakturering`) — FINISH: kanonisk
  oprettelse fra afsluttet booking/tur, konsekvent navn "Fakturagrundlag".
- **#46** Kunder (`/opsaetning/kunder`) — FINISH: opret/redigér, gør
  kundeprofilen til hjem for kontakt/aftaler/priser.
- **#49** Generelt (`/opsaetning`) — FINISH: reelt admin-center
  (virksomhedsnavn, adresse, CVR/org.nr., logo, standardlokation,
  fakturaoplysninger).
- **#42** Afregning (`/warehouse/afregning`) — MOVE til Økonomi >
  Fakturagrundlag > Warehouse.
- **#43** Volumen (`/warehouse/volumen`) — MOVE til Kunder & Priser >
  Lagerkalkulator.
- **#47** Standardpriser (`/opsaetning/priser`) — MOVE (allerede korrekt
  placeret som adminfunktion, verificér kun).
- **#48** Kundepriser (`/opsaetning/aftalepriser`) — MERGE ind i
  kundeprofilens Priser-fane.

### Præcise filer og routes
- `src/moduler/Fakturering.jsx` (route `/oekonomi/fakturering`) — **dette
  er billigere end det ser ud:** `06_IMPLEMENTATION_STATUS.md` §01
  bekræfter at "Server understøtter (`opretGrundlag()`/`grundlagskriv`
  handling 'opret'), men ingen UI-knap for en booking-tur". Kun Warehouse
  Afregning (`src/moduler/warehouse/Afregning.jsx`) kalder i dag
  funktionen, altid med en periode, aldrig et `bookingId`. Arbejdet er at
  tilføje en "Opret fakturagrundlag"-knap til Fakturering.jsx (eller til
  Bookingoversigten/en afsluttet bookings detaljevisning) der kalder samme,
  allerede-BUILT `grundlagskriv`-handling med et `bookingId`. **Ingen ny
  Cloud Function nødvendig.**
- `src/moduler/Kunder.jsx` (route `/opsaetning/kunder`) — i dag ren
  lister-og-rapportér-skærm, "ingen redigering af kundestamdata fundet
  overhovedet" (`06_IMPLEMENTATION_STATUS.md` §09). Skrivevejen for
  `kunder`-noden er **IKKE PÅVIST** i det læste materiale ud over at
  `kunder/<id>/priser/<ydelseId>/...` allerede skrives fra
  `src/moduler/kunder/Kundepriser.jsx` (`gem()`, to-permission-gate). Om
  selve kundens grundfelter (navn, kontakt, CVR) kan skrives med samme
  `gem()`-mønster eller kræver en ny funktion, skal afklares mod
  `firebase.rules.json` ved skivens start — kundeprofilen skal desuden
  blive "hjem for kontakt, aftaler og priser", dvs. en ny detaljevisning
  (fx `/opsaetning/kunder/:kundeId`) der samler dagens spredte
  Standardpriser/Kundepriser-visninger for én kunde.
- `src/moduler/opsaetning/Generelt.jsx` (route `/opsaetning`) — bevidst
  bygget som ren læseskærm i dag ("Redigér virksomhedsoplysninger" er
  deaktiveret, "Ikke besluttet endnu",
  `06_IMPLEMENTATION_STATUS.md` §09). Kræver en ny Cloud Function eller
  udvidet skrivevej for `tenants/<id>/virksomhed`-noden (navn, adresse,
  CVR/org.nr., logo, standardlokation, fakturaoplysninger) — **IKKE PÅVIST**
  hvilken mekanisme, men noden læses i dag allerede af App.jsx (linje 308)
  og bruges direkte i UI (låseskærm, sidebar-tenant-navn), så en
  klientskrivning kræver særlig omhu for ikke at bryde disse
  afhængigheder (fx `update()`-fælden CLAUDE.md advarer imod: "Skrive en
  node som ÉN nøgle i en rod-opdatering" — skriv felt for felt, ikke hele
  `virksomhed`-noden på én gang).
- `src/moduler/warehouse/Afregning.jsx` (route `/warehouse/afregning`) —
  menuplaceres om til Økonomi > Fakturagrundlag > Warehouse (samme
  komponent, ny nav-sti); ingen ændring i selve `opretGrundlag()`-kaldet.
- `src/moduler/warehouse/Volumen.jsx` (route `/warehouse/volumen`) —
  menuplaceres om til Kunder & Priser > Lagerkalkulator; ren
  beregningsskærm, ingen datamodel-ændring. Bevidst stadig INGEN
  tilbudsoprettelse (blueprintet: "Et gemt tilbud er senere").
- `src/moduler/kunder/Kundepriser.jsx` (route
  `/opsaetning/aftalepriser(/:kundeId)`) — indholdet flyttes ind som en
  fane på den nye kundeprofil-detaljevisning (se Kunder.jsx ovenfor); den
  gamle route bevares som deep link (`REDIRECTS`-mønster, allerede delvist
  til stede — `/kunder/aftalepriser/:kundeId` → `/opsaetning/aftalepriser/
  :kundeId` findes allerede i `REDIRECTS`).

### Change-type tag(s) pr. berørt element
- Booking→fakturagrundlag UI-knap: **VIEW_COMPOSITION** (bekræftet INGEN
  `BACKEND_REQUIRED` — serveren understøtter det allerede)
- Kundestamdata-CRUD: **BACKEND_REQUIRED** (skrivevej uafklaret) +
  **VIEW_COMPOSITION** (ny kundeprofil-detaljevisning)
- Virksomhedsoplysninger-editing: **BACKEND_REQUIRED**
- Afregning/Volumen/Standardpriser-flytning: **NAVIGATION_ONLY**
- Kundepriser ind i kundeprofil: **VIEW_COMPOSITION**, gammel route som
  **ROUTE_REDIRECT** (delvist allerede på plads)

### Migrationsbehov
Ingen migration for booking→grundlag (samme funktion, ny kaldsflade). For
kundestamdata og virksomhedsoplysninger: ingen migration af eksisterende
data, men en ny skrivevej skal bygges og dens regler evt. tilføjes/
udvides i `firebase.rules.json` — kræver `npm run test:rules` før commit,
jf. CLAUDE.md's ufravigelige krav.

### Risici
- Kundestamdata (`kunder`-noden) er en af de mest refererede noder i hele
  systemet — `kundeId` optræder som påkrævet felt i `bookinger`, `varer`,
  `enheder`, `plukordrer` m.fl. (jf. CLAUDE.md's `MODUL_KRAEVER`-udledning:
  "booking → kunder" og "warehouse → kunder", fordi disse noder har et
  påkrævet `kundeId`). En ny CRUD-skrivevej for kunder skal derfor
  respektere `test/referencetjek.test.mjs`s eksistenstjek-krav og må ALDRIG
  tillade en kunde at blive slettet eller ugyldiggjort mens den er
  refereret — kun statusskift (samme mønster som CLAUDE.md forbyder
  hardsletning generelt: "En post tages ud af drift med en status og en
  årsag").
- Virksomhedsoplysninger-noden (`tenants/<id>/virksomhed`) er allerede
  læst flere steder i kritisk UI (låseskærm, sidebar) — en ny skrivevej
  der ved et uheld overskriver hele noden (`update()`-på-rod-fælden) ville
  potentielt fjerne data disse afhængige visninger stoler på.
- At antage booking→grundlag kræver ny backend, når den faktisk ikke gør,
  er en modsat risiko værd at italesætte eksplicit: uden denne
  verificerede viden (fra `06_IMPLEMENTATION_STATUS.md`) kunne skiven let
  overbudgetteres.

### Testcases
- `test/grundlag.test.mjs`, `test/grundlagseksport.test.mjs`,
  `test/bookingopret.test.mjs`, `test/booking.test.mjs` — den eksisterende,
  allerede-BUILT `grundlagskriv`-handling booking-knappen skal kalde.
- `test/rules.kundepriser.test.mjs`, `test/priser.test.mjs`,
  `test/pricing-forloeb.test.mjs` — prislaget, som kundeprofilens nye
  Priser-fane skal genbruge uændret.
- `test/referencetjek.test.mjs` — kundeId-referencer på tværs af noderne
  nævnt i Risici, kritisk for at en kunde-CRUD ikke introducerer et hængende
  referencescenarie.
- `test/kpi-efterslaeb.test.mjs`, `test/kpiadgang.test.mjs`,
  `test/afkortede-totaler.test.mjs`, `test/oekonomi-graf.test.mjs`,
  `test/tom-kpi.test.mjs` — KPI-laget der læser fra `kunder`, hvis noden
  ændres.
- `test/rules.grundlag.test.mjs`, `test/rules.kpi.test.mjs`,
  `test/kpi-aggregering.test.mjs` — hvis en ny CRUD-funktion for
  virksomhedsoplysninger rører reglerne omkring den læste
  `tenants/<id>/virksomhed`-node.

### Definition of Done
- [ ] En disponent kan oprette et fakturagrundlag direkte fra en afsluttet
      booking/tur.
- [ ] "Fakturagrundlag" bruges konsekvent som navn (ikke "Fakturering") på
      tværs af UI.
- [ ] Kundeprofilen er hjem for kontakt, aftaler og priser; kunder kan
      oprettes og redigeres.
- [ ] Opsætning > Virksomhed kan redigere navn, adresse, CVR/org.nr., logo,
      standardlokation, fakturaoplysninger.
- [ ] Afregning og Volumen er flyttet til deres nye menuplaceringer;
      gamle routes virker som deep links.
- [ ] Kundepriser er en fane på kundeprofilen; gammel route redirecter.
- [ ] `npm test` og `npm run test:rules` grønne.

### Rollback-plan
UI/nav-delen: `git revert`. Booking→grundlag-knappen: fjern knappen,
allerede-oprettede grundlag forbliver gyldige (samme datamodel som
Warehouse-oprettede grundlag, ingen særbehandling). Kundestamdata- og
virksomheds-CRUD: samme forsigtighed som Skive 6 — hvis nye skrivninger er
foretaget via de nye funktioner før en rollback, skal disse ændringer
vurderes individuelt (er den nye kundeadresse fx allerede brugt på en
udstedt faktura?) frem for en automatisk tilbagerulning af data.

---

## Skive 8 — Visuel konsolidering og release

### Formål
Anvende de fem sidetyper konsekvent, harmonisere spacing/toolbar/
sidepaneler på tværs af alle skærme, validere samtlige 7 roller ×
modulkombinationer i DEV, dokumentere de kanoniske arbejdsgange, og
opnå en grøn fuld testsuite som release-gate.

### Berørte rækker (blueprint-#)
Ingen enkeltstående blueprint-rækker — dette er den tværgående
afslutningsskive der dækker blueprintets "Definition of Done for
oprydningsprogrammet" i sin helhed:
- Fem sidetyper: modul-forside, kalender, arbejdskø, proces, stamdata.
- Kun én primær blå handling pr. arbejdsområde (produktgrundlov §9).
- Alle 7 roller og relevante modulkombinationer valideret i DEV.
- Fuld testsuite grøn, dokumenteret rollback pr. skive (denne fil).

### Præcise filer og routes
- Ingen ny funktionalitet, ingen nye routes. Arbejdet er en gennemgang af
  ALLE skærme berørt af Skive 1–2, 3A–3D, 4A–4D og 5–7 (samt de KEEP-skærme der ikke er rørt,
  for at bekræfte de allerede følger et af de fem mønstre) mod:
  - `src/fleet/fleet.css` — designtokens (CLAUDE.md: "Definere egne
    farver" og "Sætte en `font-size` i px" er begge forbudt uden for denne
    fil, håndhævet af `npm run test:design`).
  - Toolbar-/sidepanel-komponenter i `src/fleet/ui.jsx` (fælles UI-byggesten,
    jf. CLAUDE.md's "Lave en sidebar, tenant-vælger eller periodevælger i
    et modul" — forbudt, shellen ejer dem).
- `src/fleet/AppShell.jsx` — verificér modulvælger/sidebar-adfærd for hver
  af de 7 roller (jf. `docs/product-audit/05_ROLES_AND_PERMISSIONS.md`) i
  DEV-miljøet, inkl. Brugervælgeren (`fleet/Brugervaelger.jsx`) til
  sessionsskift mellem seedede DEV-brugere.
- `docs/product-redesign-v1/03_CANONICAL_WORKFLOWS.md` (produceres af en
  tidligere/parallel del af planlægningspakken, jf. blueprintets
  "Første besked"-liste) — verificeres mod den FAKTISKE tilstand efter
  Skive 1–2, 3A–3D, 4A–4D og 5–7, ikke kun mod planen.

### Change-type tag(s) pr. berørt element
- Sidetype-/spacing-harmonisering: **VIEW_COMPOSITION**
- Rolle×modul-DEV-validering: ingen kodeændring i sig selv — et
  test-/verifikationsarbejde, tags kun de rettelser det afdækker
  (typisk **VIEW_COMPOSITION** eller **NAVIGATION_ONLY**, afhængig af fund).
- Ingen `DATA_MODEL`, `BACKEND_REQUIRED` eller `PERMISSION_MODEL`-arbejde er
  planlagt i denne skive — finder rolle×modul-valideringen et reelt
  sikkerhedshul, hører rettelsen til i en NY, separat sikkerhedsskive, ikke
  i visuel konsolidering (jf. CLAUDE.md's låste rækkefølge for
  sikkerhedsarbejde).

### Migrationsbehov
Ingen.

### Risici
- Denne skive er den eneste der rører design-tokens/typografi på tværs af
  ALLE skærme — risiko for at røre en af de tre eksplicit dokumenterede
  undtagelser (CLAUDE.md: labels 100×200mm, donut-graf i viewBox-enheder)
  uden at bevare deres begrundelse i `test/skrift.test.mjs`.
- Rolle×modul-validering i DEV kan afdække reelle huller Skive 1–2, 3A–3D,
  4A–4D og 5–7 ikke fangede (fx en nav-gruppe der stadig peger forkert
  efter en flytning, jf. Skive 1's `sti`-repoint-risiko) — denne skive
  skal derfor have et
  rimeligt tidsbudget til RETTELSER, ikke kun verifikation, uden at blive
  en de-facto niende skive.
- At denne skive er sidst betyder den arver enhver uadresseret risiko fra
  Skive 1–2, 3A–3D, 4A–4D og 5–7 — den bør ikke startes før mindst Skive 1,
  2 og 3A–3D (de mest navigationstunge) er afsluttet og deres egne
  DoD-lister er krydset af.

### Testcases
- `test/design-tokens.test.mjs`, `test/kontrast.test.mjs`,
  `test/skrift.test.mjs`, `test/css-navne.test.mjs` — hele
  designtoken-/farve-/typografi-disciplinen.
- `test/navadgang.test.mjs`, `test/rules.rollematrix.test.mjs` — endelig,
  tværgående bekræftelse af nav/permission-sammenhæng for alle 7 roller.
- **Fuld suite:** `npm test` (inkl. alle ovenstående skivers testfiler) og
  `npm run test:rules` som release-gate, jf. blueprintets DoD ("Fuld
  test-suite er grøn").
- DEV-accepttest (manuel, ikke i `test/`): log ind som hver af de 7 seedede
  DEV-roller via `Brugervaelger.jsx` og gennemgå de kanoniske arbejdsgange
  fra `03_CANONICAL_WORKFLOWS.md` end-to-end.

### Definition of Done
- [ ] Hver skærm er klassificeret som én af de fem sidetyper, og afviger
      ikke fra dens mønster uden en skreven begrundelse.
- [ ] Ingen arbejdsområde har mere end én primær blå handling.
- [ ] Alle 7 roller er gennemgået i DEV mod relevante modulkombinationer;
      fund er enten rettet eller eksplicit accepteret og noteret.
- [ ] `03_CANONICAL_WORKFLOWS.md` afspejler den faktiske, byggede tilstand.
- [ ] `npm test` og `npm run test:rules` er begge grønne som release-gate.
- [ ] Denne fils rollback-planer for Skive 1–2, 3A–3D, 4A–4D og 5–7 er
      verificeret læsbare og brugbare (ikke kun skrevet, men afprøvet i det
      omfang det er risikofrit at gøre — fx en `git revert --no-commit`
      dry-run).

### Rollback-plan
Design-/spacing-ændringer: `git revert`, ingen datapåvirkning. Denne skive
introducerer ingen ny funktionalitet i sig selv og har derfor ingen egen
datamæssig rollback-risiko — dens rollback-ansvar er at have VERIFICERET at
Skive 1–2, 3A–3D, 4A–4D og 5–7's individuelle rollback-planer holder, ikke
at tilføje en ny.
Hvis release-gaten (fuld suite) ikke er grøn, er "rollback" for denne skive
reelt: udskyd release, fasthold koden på seneste grønne skive, og fortsæt
rettelser uden at skive-grænsen mellem 7 og 8 brydes.
