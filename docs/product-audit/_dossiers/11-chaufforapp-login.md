# Modul 11 — Chaufførapp / Login

Kilder læst: `src/App.jsx` (Chauffoerramme, /app/* ruteblok, harAdgang,
erChauffoer, EfterLogin, TilLogin), `src/moduler/app/Forside.jsx`,
`src/moduler/app/Turplan.jsx`, `src/moduler/app/Indberetning.jsx`,
`src/moduler/app/Timeregistrering.jsx`, `src/moduler/app/Frihed.jsx`,
`src/moduler/Login.jsx`, `src/fleet/meldingskoe.js`, `src/fleet/Brugervaelger.jsx`,
`src/fleet/dev-brugere.js`, `src/fleet/permissions.js` (uddrag: `BASIS_LAES`,
`ROLLE_PERMS.chauffoer`, `ROLLE_LABEL.chauffoer`), `src/fleet/moduler.js`
(uddrag: `NODE_MODUL` for `etaper`, `statushaendelser`, `stemplinger`,
`fravaer`, `indberetninger`), `firebase.rules.json` (uddrag: `fravaer`,
`stemplinger`, `statushaendelser`, `indberetninger`), `functions/index.js`
(funktionen `statusmelding`), `src/fleet/AppShell.jsx` (uddrag: sidebar,
Brugervaelger-visning, MiljoeBjaelke).

## Modul-resumé

### Chaufførapp

- **navn:** Chaufførapp (route-præfiks `/app/*`; ikke et modul i `nav.js`, ikke
  en `modulnøgle` — den findes uden for modulsystemet).
- **formål:** Mobilvenlig, minimalistisk grænseflade til den enkelte chauffør:
  se dagens tur, melde status pr. stop, stemple ind/ud, indberette fra vejen,
  søge frihed. Ifølge kommentarerne i `App.jsx`: en chauffør har seks
  permissions, "elleve af tolv menupunkter ville føre til en afvist læsning."
- **primær brugertype:** Bruger med `rolle === "chauffoer"` — siden beslutning
  117 den ENESTE bruger der ender her, og den ENESTE rute han kan nå
  overhovedet (se Implementation-status).
- **vigtigste opgave:** Vise chaufføren hvad han skal i dag, og lade ham melde
  det tilbage til kontoret uden en computer.
- **vigtigste funktioner (bullets):**
  - Fire-korts forside med genveje til de fire skærme (kortet vises kun hvis
    tenanten har det underliggende modul — se `Forside.jsx`)
  - Turplan: dagens stop i rækkefølge, med statusmelding pr. stop og en
    klient-side offline-kø for meldinger
  - Indberetning: otte fliser/ti arter (skade, service, tankning m.m.),
    direkte skrivning til `indberetninger`
  - Timeregistrering: ind/ud-stempling med ugeoversigt
  - Frihed: ansøgning om ferie/feriefridag/afspadsering, med svar i appen
- **undermoduler:** Ingen (flad rutestruktur: index, `tur`, `tid`,
  `indberetning`, `frihed`).
- **afhænger af (andre moduler):** Læser data der ejes af `booking`
  (`etaper`, `statushaendelser`), `bemanding` (`fravaer`, `stemplinger`),
  `flaade` (`indberetninger`) — men appen selv er ikke gatet af noget modul;
  den vises altid for en chauffør uanset tenantens modulsammensætning. De
  fire forsidekort filtreres derimod pr. modul (`Forside.jsx`: `harModul`).
- **afhænges af:** Ingen andre skærme — chaufførappen er en selvstændig gren,
  sideordnet AppShell, ikke en del af det øvrige modulnav.
- **samlet status:** PARTIAL/BUILT — se Implementation-status pr. funktion;
  ingen skærm er MOCK/DEMO i drift (demo-data findes kun som `useListe`-
  fallback), men Timeregistrering/Turplan/Frihed afhænger alle af en
  `personId`-kobling der kan mangle, og appen har ingen mail-notifikation
  (bevidst udskudt, se Frihed.jsx-kommentar).
- **overlap-mistanke:** Turplan/Indberetning/Timeregistrering/Frihed skriver
  til noder som Workforce/Bemanding- og Booking/Planning-dossieret også
  dokumenterer fra kontorsiden (`stemplinger`, `fravaer`, `etaper`,
  `statushaendelser`) — se Data-entiteter for hvem der ejer hvad.

### Login

- **navn:** Login (`src/moduler/Login.jsx`, rute `/login`).
- **formål:** Autentificering før en session findes. Ligger uden for
  `AppShell`, `Udbyderramme` og `Chauffoerramme`, fordi ingen af de tre rammer
  giver mening uden en session (kommentar i toppen af filen).
- **primær brugertype:** Enhver ikke-logget-ind bruger — kontor, chauffør,
  ejer bruger samme login-skærm; hvilken ramme man ender i, afgøres bagefter
  af `bruger.udbyder`/`bruger.rolle` i `App.jsx`.
- **vigtigste opgave:** E-mail/adgangskode-login mod Firebase Auth, og en
  klar besked når kontoen findes men mangler et tenant-claim
  ("uprovisioneret").
- **vigtigste funktioner (bullets):**
  - `auth.signInWithEmailAndPassword` — ingen egen navigation efter succes
    (App.jsx's `onAuthStateChanged` overtager)
  - Fejltekst-oversættelse pr. Firebase-fejlkode (`FEJLTEKST`), med en bevidst
    fælles generel besked for "forkert kode"/"ukendt bruger" (Firebase
    samler dem selv i `auth/invalid-credential`)
  - "Uprovisioneret"-tilstand: logget ind, men intet tenant-claim → egen
    besked + log ud-knap, intet forsøg på at gætte sig til adgang
  - KUN i `miljoe === "dev"`: felterne forudfyldes med den seedede ejerkonto
    fra `.env.local` (`DEV_UDFYLD`)
- **undermoduler:** Ingen.
- **afhænger af (andre moduler):** Ingen — Login er den eneste eager-loaded
  skærm i hele appen (ikke `lazy()`), fordi den ligger uden for enhver
  Suspense-grænse (se `App.jsx`, beslutning 97-kommentaren).
- **afhænges af:** `App.jsx` (renderer den for `!harAdgang`), indirekte hele
  produktet — der er ingen anden indgang.
- **samlet status:** BUILT — reelt Firebase Auth-kald, ingen mock. Det
  "uprovisionerede" spor er en veldefineret fejltilstand, ikke en placeholder.
- **overlap-mistanke:** DEV-autofyld-felterne og `Brugervaelger.jsx`
  (dev/demo-only rollevælger, teknisk en del af `AppShell`/sidebaren, ikke af
  Login selv) — se Mulige overlap.

## Skærme

### Forside (`/app` index)

- **route:** `/app` (index) · **sidenavn:** ingen egen titel i skærmen (kun
  "Hej {fornavn}"-hilsen); forsidekortene selv fungerer som navigation.
- **hvem bruger den:** Chaufføren, som landingsskærm efter login.
- **primært formål:** Genvej til de fire undermenuer.
- **primær handling:** Klik på et af de (op til) fire kort.
- **sekundære handlinger:** Ingen.
- **data vist:** `bruger.navn` (fornavn); ingen liste-data hentes her.
- **data der kan ændres:** Intet.
- **kommer typisk fra:** Login (direkte), eller catch-all-redirect fra en
  ikke-eksisterende `/app`-sti.
- **går typisk til:** `/app/tid`, `/app/tur`, `/app/indberetning`,
  `/app/frihed`.
- **overlap med anden side:** Ingen direkte; se dog Mulige overlap om
  "Turplan" vs. kontorets Disponering-visning af samme etaper.
- **status:** BUILT. Ren visning, ingen data-afhængighed der kan fejle ud
  over `moduler` (til kort-filtrering).
- **demo-data (ja/nej+note):** Nej — ingen `useListe`-kald i denne fil.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift (eneste
  indgang til de øvrige tre skærme).

### Turplan (`/app/tur`)

- **route:** `/app/tur` · **sidenavn:** "Turplan".
- **hvem bruger den:** Chaufføren.
- **primært formål:** Vise dagens (eller en valgt dags) stop i rækkefølge,
  med adresse, tidsvindue, kontakt, ordrelinjer, og lade ham melde status pr.
  stop (afgang, ankomst-læsning, afgang-læsning, pause, ankomst-losning,
  afsluttet, forsinkelse, grænse).
- **primær handling:** Trykke en statusmelding-knap på et stop
  (`foreslaaedeMeldinger()` bestemmer hvilke fire der vises).
- **sekundære handlinger:** Dag-frem/-tilbage-navigation, "Naviger"
  (åbner Google Maps-søgning i ny fane), ring op (`tel:`-link), "Prøv igen
  nu" for ventende meldinger.
- **data vist:** Egne etaper for den valgte dag (filtreret på `personId`,
  ikke `uid`), planlagte stop (`planlagteStop()`), tidligere meldinger
  (`meldingerFor()`), køretøjsnavn, kundenavn, sum af håndteringer.
- **data der kan ændres:** Statusmeldinger (`statushaendelser` via Cloud
  Function `statusmelding`) — ingen anden skrivning fra denne skærm.
- **kommer typisk fra:** Forside-kortet "Turplan".
- **går typisk til:** Ekstern kort-app (Google Maps), telefon-opkald; internt
  kun tilbage til `/app`.
- **overlap med anden side:** Samme underliggende `etaper`/`statushaendelser`
  som kontorets Disponering/Rute & status-visning (Booking/Planning-modulet)
  — set fra to vinkler (kontor: alle ture; chauffør: kun sine egne, filtreret
  på `personId`).
- **status:** BUILT. Reel læsning (`useListe("etaper")`,
  `useListe("statushaendelser")`, `useListe("brugere")` for `personId`-
  opslag) og reel skrivning (`kaldFunktion("statusmelding", …)` → Cloud
  Function `statusmelding` i `functions/index.js`), med en klientside
  offline-kø (`meldingskoe.js`) foran skrivningen. Ingen sporing/GPS
  (bevidst, jf. beslutning 22 — teksten på skærmen siger det eksplicit).
- **demo-data (ja/nej+note):** Ja, som `useListe`-fallback (`DEMO_ETAPER`,
  `DEMO_STATUS_POSTER`, `DEMO_KOERETOEJER`, `DEMO_KUNDER`) — bruges kun uden
  databaseforbindelse (`demoMode`), ikke i normal drift.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift — dette
  er chaufførens kerneskærm.

### Indberetning (`/app/indberetning`)

- **route:** `/app/indberetning` · **sidenavn:** "Indberetning".
- **hvem bruger den:** Chaufføren.
- **primært formål:** Registrere driftshændelser (skade, service, dæk m.m.)
  og udgiftsregistreringer (tankning, parkering, truckwash, kvittering) fra
  vejen.
- **primær handling:** Vælge flise → (evt. vælge art) → udfylde felter → Send.
- **sekundære handlinger:** Fane-skift til "Indberettet" (egen historik),
  Fortryd.
- **data vist:** Køretøjsliste (til dropdown), egne tidligere indberetninger
  med status/forløb-pille, tilhørende værkstedsbesøg (`opgaver`, matchet på
  `indberetningId`) med dato og sted/værkstedsnavn.
- **data der kan ændres:** Ny post i `indberetninger` (direkte skrivning via
  `gem()`, IKKE via en Cloud Function — se Data-entiteter).
- **kommer typisk fra:** Forside-kortet "Indberetning".
- **går typisk til:** Egen "Indberettet"-fane efter afsendelse.
- **overlap med anden side:** Samme `indberetninger`-node som Flåde →
  Indberetninger (kontorets arbejdskø) — chaufførens visning er filtreret til
  `oprettetAf === bruger?.uid`.
- **status:** BUILT. Reel læsning (`useListe("indberetninger")`,
  `useListe("koeretoejer")`, `useListe("opgaver")`, `useListe("leverandoerer")`)
  og reel skrivning (`gem()` fra `src/fleet/skriv.js`, direkte til
  `sti("indberetninger/{id}")`).
- **demo-data (ja/nej+note):** Ja, som `useListe`-fallback (`DEMO_INDBERETNINGER`,
  `DEMO_KOERETOEJER`, `DEMO_OPGAVER`, `DEMO_LEVERANDOERER`) — kun uden
  databaseforbindelse.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift.

### Timeregistrering (`/app/tid`)

- **route:** `/app/tid` · **sidenavn:** "Timeregistrering".
- **hvem bruger den:** Chaufføren.
- **primært formål:** Stemple ind/ud, se ugens timer.
- **primær handling:** Én knap: "Stempl IND" / "Stempl UD" (skifter afhængigt
  af åben vagt).
- **sekundære handlinger:** Uge-frem/-tilbage-navigation (frem er spærret for
  fremtidige uger).
- **data vist:** Aktuel status (ind/ud), seneste udstempling, ugetabel med
  dag-for-dag minutter og ugesum.
- **data der kan ændres:** Egen `stemplinger/{personId}/{id}`-post (start
  eller afslutning af en vagt).
- **kommer typisk fra:** Forside-kortet "Timeregistrering".
- **går typisk til:** Ingen udgående navigation.
- **overlap med anden side:** Samme `stemplinger`-node som Workforce/
  Bemanding-dossieret dokumenterer fra kontorsiden (Ferie & fravær-skærmen
  læser ikke stemplinger direkte, men noden er en del af `bemanding`-modulet).
- **status:** BUILT. Reel læsning (`useListe("stemplinger/{personId}")`,
  `useListe("brugere")`) og reel skrivning (`gem()` direkte til
  `stemplinger/{personId}/{id}` — ingen Cloud Function, se Data-entiteter).
- **demo-data (ja/nej+note):** Nej — ingen `demo:`-fallback i denne fil (kun
  `brugere`- og `stemplinger`-opslag, uden demo-array angivet).
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift.

### Frihed (`/app/frihed`)

- **route:** `/app/frihed` · **sidenavn:** "Anmod om frihed".
- **hvem bruger den:** Chaufføren.
- **primært formål:** Ansøge om ferie/feriefridag/afspadsering, og se svar på
  tidligere ansøgninger.
- **primær handling:** Udfylde art + fra/til-dato + valgfri note → "Send
  ansøgning".
- **sekundære handlinger:** Ingen (ingen redigering/annullering af en
  indsendt ansøgning fra denne skærm).
- **data vist:** Egne fraværsansøgninger med status (ansøgt/godkendt/afvist)
  og evt. kontorets svartekst; et fravær uden `ansoegning` vises som
  "Registreret" (kontorets egen registrering).
- **data der kan ændres:** Ny post i `fravaer/{id}` — kun en selvbetjenings-
  gren (`oensket` ∈ {ferie, feriefridag, afspadsering}, status altid `ansoegt`
  ved oprettelse).
- **kommer typisk fra:** Forside-kortet "Anmod om frihed".
- **går typisk til:** Ingen udgående navigation.
- **overlap med anden side:** Samme `fravaer`-node som Workforce/Bemanding →
  Ferie & fravær (kontorets godkendelsesskærm).
- **status:** BUILT for ansøgningsflowet. Reel læsning (`useListe("fravaer")`,
  `useListe("brugere")`) og reel skrivning (`gem()` direkte til
  `fravaer/{id}`, håndhævet af en selvbetjenings-gren i
  `firebase.rules.json` — se Data-entiteter). Mail-underretning nævnt i
  specifikationen er eksplicit IKKE bygget (fase 0 af sagsbaseret mail,
  beslutning 20) — teksten på skærmen er rettet til at sige "her i appen"
  i stedet.
- **demo-data (ja/nej+note):** Ja, som `useListe`-fallback (`DEMO_FRAVAER`) —
  kun uden databaseforbindelse.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift (om end
  lavfrekvent i praksis).

### Login (`/login`)

- **route:** `/login` · **sidenavn:** ingen (kortet hedder "FleetControl").
- **hvem bruger den:** Enhver bruger uden aktiv session — kontor, chauffør,
  ejer.
- **primært formål:** Autentificering.
- **primær handling:** Indtaste e-mail + adgangskode → "Log ind".
- **sekundære handlinger:** "Log ud" (kun i uprovisioneret-tilstand).
- **data vist:** Ingen forretningsdata. Projekt-id i bunden (`projektId`).
- **data der kan ændres:** Ingenting i databasen — kun Firebase Auth-
  sessionstilstand.
- **kommer typisk fra:** `TilLogin`-redirect (`App.jsx`) for enhver ikke-
  matchende rute uden session.
- **går typisk til:** `EfterLogin`-redirect til `state.fra` eller `/` efter
  succesfuldt login (App.jsx afgør derefter chauffør vs. AppShell vs.
  udbyder-gren).
- **overlap med anden side:** Ingen skærm-overlap; se Mulige overlap for
  forholdet til `Brugervaelger`/dev-autofyld.
- **status:** BUILT.
- **demo-data (ja/nej+note):** Nej i drift. I `miljoe === "dev"` forudfyldes
  felterne med en seedet kontos e-mail/kode fra `.env.local`
  (`DEV_UDFYLD`) — det er ikke et mock-login, det er samme
  `signInWithEmailAndPassword`-kald med forudfyldte felter.
- **nødvendig for daglig drift eller admin/opsætning:** Forudsætning for alt
  andet.

## Data-entiteter

| Entitet | RTDB-node(r) | Ejes af (jf. NODE_MODUL) | Bruges også af | Kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| Chauffør/personale (app-siden) | `brugere/{uid}` (kobling), `personale` (læses via BASIS_LAES) | `brugere` er `.write: false` (provisionering); `personale` er ikke modul-gatet | Workforce/Bemanding (kartotek), Booking (dispatcher-visning) | Chaufførappen læser kun; `personId`-koblingen skrives aldrig fra appen selv (den er `.write: false`) |
| Tur/etape | `etaper` | ejes af `booking` (jf. `NODE_MODUL` i `moduler.js`) — se Booking/Planning-dossieret for fuldt ejerskab | Turplan (filtreret på `personId`), Disponering, Rute & status | Chaufførappen skriver ALDRIG etapen selv — kun statusmeldinger på den |
| Statusmelding/statushaendelse | `statushaendelser/{etapeId}/{klientId}` | ejes af `booking` | Rute & status (kontor), evt. en fremtidig sags-udtræk | `.write: false` på noden; eneste skrivevej er Cloud Function `statusmelding` (se Implementation-status) |
| Indberetning | `indberetninger` | ejes af `flaade` (jf. `NODE_MODUL`) — se Fleet/Vaerksted-dossieret for fuldt ejerskab | Flåde → Indberetninger (kontorets arbejdskø) | Chaufførappen skriver DIREKTE (ingen Cloud Function) via `gem()`; ejerskab håndhæves i reglen på `oprettetAf === auth.uid` |
| Stempling | `stemplinger/{personId}/{id}` | ejes af `bemanding` (jf. `NODE_MODUL`) — kanonisk ejerskab dokumenteres i Workforce/Bemanding-dossieret | (ingen anden skærm fundet der læser samme node i denne læsning) | Chaufføren skriver DIREKTE via `gem()`; reglen slår `brugere/{uid}/personId` op og sammenligner mod stien `$personId` — en lukket vagt (med `udMs`) er frosset (`.write` afvises) |
| Fraværsansøgning | `fravaer/{id}` (feltet `ansoegning`, samt `oensket` på basisposten) | ejes af `bemanding` (jf. `NODE_MODUL`) — kanonisk ejerskab dokumenteres i Workforce/Bemanding-dossieret | Ferie & fravær (kontorets godkendelsesskærm) | Chaufføren skriver DIREKTE via `gem()`, men kun via en snæver selvbetjenings-gren i `firebase.rules.json`: ny post, egen `personId`, `oensket` ∈ {ferie, feriefridag, afspadsering}, status altid `ansoegt`, ingen af kontorets svarfelter (`afgjortAf`/`afgjortMs`/`svar`) sat. Feltet `art` (helbredsoplysning) og `division` er `.validate: false` for alle — chaufføren kan ikke sætte dem |

## Implementation-status

- **Dagens ture (Turplan/Forside):** BUILT. Persistens: læsning direkte fra
  RTDB (`etaper`, `statushaendelser`, `brugere`, `koeretoejer`, `kunder`),
  filtreret på `personId`. Kendt kompromis: skærmen viser "Din bruger er ikke
  koblet til et medarbejderkort" hvis `personId`-koblingen mangler i
  `brugere/{uid}` — det er en forudsætning appen ikke selv kan opfylde
  (noden er `.write: false`). Brugbar end-to-end når koblingen findes.
- **Statusmelding pr. stop, inkl. offline-kø:** BUILT. Skrivevej: Cloud
  Function `statusmelding` (`functions/index.js`), som slår `personId` op
  server-side, tjekker `booking.laes` + ejerskab (eller `booking.udfoer` for
  en disponent der melder på vegne af chaufføren), og afviser ukendte felter.
  Offline: `src/fleet/meldingskoe.js` lægger meldingen i `localStorage` under
  en forbindelsesfejl (skelnet fra en reel serverafvisning via en
  fejlkode-liste, `SERVER_AFVIST`) og gensender med samme `klientId` ved
  `online`-event eller manuelt "Prøv igen nu". Ingen server-side reaktion ud
  over selve skrivningen — ingen auditpost (bevidst, jf. kommentaren i
  `statusmelding`), ingen fundet trigger/notifikation til kontoret; kontoret
  ser meldingen først når nogen åbner Rute & status og genindlæser.
- **Indberetning fra bilen:** BUILT. Skrivevej: direkte `gem()` til
  `indberetninger/{id}`, ingen Cloud Function (ejerskab håndhæves i reglen på
  `oprettetAf`). Ingen offline-kø for denne skrivning (kun statusmeldinger
  har `meldingskoe.js`) — IKKE PÅVIST hvorvidt en indberetning tabes ved
  manglende forbindelse, ud over den generelle fejlbesked fra `gem()`.
- **Klokke ind/ud:** BUILT. Skrivevej: direkte `gem()` til
  `stemplinger/{personId}/{id}`, håndhævet af regel (ejerskab på sti,
  frossen lukket vagt). Ingen offline-kø.
- **Fraværsansøgning:** BUILT for selve ansøgningen (skriv/læs, med den
  snævre selvbetjenings-gren i reglerne). Svar/godkendelse sker udelukkende
  fra kontorsiden (Workforce/Bemanding-dossieret). Mail-notifikation nævnt i
  specifikationen er PLANNED (fase 0 af beslutning 20 — `sager/` findes ikke
  i `firebase.rules.json`), erstattet i UI-teksten af "svar her i appen."
- **Login/adgangsbegrænsning til kun /app:** BUILT og — ifølge opgavens
  baggrundsinfo — testet (beslutning 117). `App.jsx`: `erChauffoer =
  bruger?.rolle === "chauffoer"`; når sand udelades AppShell-ruteblokken
  helt, og et catch-all sender enhver anden sti under `harAdgang` tilbage til
  `/app`. Adgangsvejen (`harAdgang = Boolean(bruger?.tenant)`) er uændret for
  chaufføren — kun hvad der TEGNES filtreres client-side; håndhævelsen af
  hvad han rent faktisk kan LÆSE/SKRIVE ligger i `firebase.rules.json` via
  hans seks permissions (`BASIS_LAES` + `indberetningerSkriv`).

## Workflow-observationer

Chaufførens dag, sporet gennem koden:

1. **Login** (`/login`) — BUILT. `auth.signInWithEmailAndPassword`. Fil:
   `src/moduler/Login.jsx`.
2. **App.jsx afgør rammen** — BUILT. `onAuthStateChanged` henter
   brugerkontekst; `erChauffoer` sand ⇒ kun `/app/*`-blokken renderes;
   `EfterLogin` sender ham til `/app` (eller `state.fra` hvis det var en
   `/app`-sti). Fil: `src/App.jsx`.
3. **Ser dagens tur** (Forside → Turplan) — BUILT. Forsiden viser fire kort
   (filtreret pr. modul); Turplan henter `etaper` filtreret på `personId` for
   valgt dag og udleder stop via `planlagteStop()`. Filer:
   `src/moduler/app/Forside.jsx`, `src/moduler/app/Turplan.jsx`.
4. **Melder status pr. stop** — BUILT, inkl. offline. `meld()` kalder Cloud
   Function `statusmelding`; ved forbindelsesfejl lægges meldingen i
   `meldingskoe.js` (localStorage, nøglet på `klientId`) og markeres i UI som
   "gemt — sendes automatisk", ikke som en fejl. Gensendes ved `online`-event
   eller manuelt. En server-afvisning (fx ugyldigt `stopId`) fjernes derimod
   fra køen med en synlig fejlbesked — den prøves ikke igen. Filer:
   `src/moduler/app/Turplan.jsx`, `src/fleet/meldingskoe.js`,
   `functions/index.js` (`statusmelding`). Server-side reaktion: INGEN
   fundet ud over selve skrivningen til `statushaendelser` — ingen
   notifikation, ingen auditpost, ingen trigger. Kontoret opdager en melding
   ved selv at genindlæse Rute & status.
5. **Evt. indberetning** (`/app/indberetning`) — BUILT. Direkte `gem()` til
   `indberetninger`. Fil: `src/moduler/app/Indberetning.jsx`.
6. **Evt. klokker ind/ud** (`/app/tid`) — BUILT. Direkte `gem()` til
   `stemplinger/{personId}/{id}`. Fil: `src/moduler/app/Timeregistrering.jsx`.
7. **Evt. søger fravær** (`/app/frihed`) — BUILT for selve ansøgningen; svar
   kommer fra kontoret, ikke fra appen. Fil: `src/moduler/app/Frihed.jsx`.

Alle syv trin har en fungerende data-vej. Det eneste gennemgående
forudsætningskrav er `brugere/{uid}/personId` — mangler den, stopper
Turplan, Timeregistrering og Frihed alle med samme forklarende tomtilstand
("Kontakt kontoret — det rettes i Opsætning") i stedet for at fejle stille.

## UI-mønstre

- **To adskilte shells, ikke ét tema med en mobil-variant.** `Chauffoerramme`
  (i `App.jsx`) er en selvstændig komponent, sideordnet `AppShell` og
  `Udbyderramme` — ikke en `AppShell`-variant. Den har ingen sidebar, ingen
  tenant-vælger, ingen periodevælger; kun en topbar med mærke, tenant-
  kortnavn, brugernavn og en log ud-knap (`<header className="fc-top">`), og
  et `<main className="fc-main fc-app-main">`. `AppShell` derimod bygger
  `<aside>` med `NAV`-genereret sidebar, miljøbjælke, evt. demo-rollevælger
  og evt. `Brugervaelger`. De to renderes aldrig samtidig — `App.jsx` vælger
  gren FØR routing (`erUdbyder` → Udbyderramme, `erChauffoer` → kun
  Chauffoerramme, ellers AppShell).
- **Klassekonvention:** alle chaufførapp-skærme bruger `fc-app-*`-klasser
  (`fc-app-kort`, `fc-app-titel`, `fc-app-knapper`, `fc-app-felt`,
  `fc-app-tilbage`, `fc-app-fod`, `fc-app-fejl`, `fc-app-kvittering`) frem for
  de `fc-card`/`fc-tabel`-mønstre kontorskærmene bruger — et separat, mere
  kort-baseret, mobil-orienteret formsprog.
- **Kort som primær navigationsenhed:** Forsiden er fire trykbare
  `fc-app-kort fc-app-genvej`-links; Turplan tegner ét kort pr. stop
  (`fc-app-kort`, med `fc-app-stop-naaet`-modifier når meldt).
  Grænseovergange tegnes bevidst IKKE som kort, men som en enkelt tekstlinje
  ("— grænse: … —"), fordi de ikke er handlingspunkter.
  Statusknapper er sorteret efter relevans (`foreslaaedeMeldinger()`), ikke
  spærret — teksten i koden fremhæver eksplicit at "virkeligheden kommer ikke
  i rækkefølge."
- **Terminologi:** dansk gennemgående ("Stempl IND/UD", "Anmod om frihed",
  "Indberet", "Naviger"). Konsekvent brug af "melding" for statusopdatering
  pr. stop og "ansøgning" for fraværsanmodning — samme ord som kontorets
  skærme bruger om de samme entiteter.
- **Fejl/venter-tilstande skelnes visuelt:** en ventende (offline-gemt)
  melding får sin egen klasse (`fc-app-koe`) og tekst ("venter på
  forbindelse"), adskilt fra en reel fejl (`fc-app-fejl`) — koden bemærker
  eksplicit at farven "ikke må ligne fejl, for der er intet at rette."
- **Ingen kortvisning, ingen GPS.** "Naviger"-knappen åbner Google Maps i en
  ekstern fane i stedet for at tegne et kort i appen; ingen skærm viser
  position eller sporing (gennemgående kommentar-tema, henvist til
  beslutning 22).

## Mulige overlap

- **Login's `uprovisioneret`-tilstand vs. et tenant-løst login generelt.**
  Enhver bruger uden tenant-claim (chauffør, kontor, eller en fejlprovisioneret
  ejerkonto) rammer samme uprovisioneret-skærm i `Login.jsx` — der er ingen
  rolle-specifik variant. En ekstern reviewer der forventer en tydelig
  "chauffør uden konto"-besked kunne læse den generiske tekst som mindre
  specifik end den er.
- **Dev-autofyld i Login.jsx vs. `Brugervaelger.jsx`.** To forskellige
  mekanismer løser delvist overlappende problemer: `DEV_UDFYLD` i
  `Login.jsx` forudfylder login-formularen med ÉN seedet konto (ejeren,
  hentet fra `VITE_DEV_EJER_MAIL`); `Brugervaelger` (renderet fra `AppShell`,
  kun når `miljoe === "dev"`) lader man logge ud og ind som en HVILKEN SOM
  HELST af de seks seedede dev-roller (`DEV_BRUGERE` fra
  `dev-brugere.js`), inkl. `chauffoer`. Begge er ægte
  `signInWithEmailAndPassword`-kald, ikke mocks — men en reviewer der kun ser
  Login-skærmen, kunne overse at der findes en helt anden, mere vidtgående
  rollevælger inde i selve produktet (uden for chaufførappen).
- **Demo-rollevælgeren i AppShell (`"Se platformen som"`, `rolleskifte`) vs.
  `Brugervaelger.jsx`.** To visuelt lignende dropdowns i sidebaren løser
  forskellige ting og er gensidigt udelukkende (`demo` render-betingelse mod
  `miljoe === "dev"`): den ene (`demo`) ændrer KUN client-side visning
  (`effektivBruger`, ingen tokenskift, meningsløs uden for demo — jf.
  CLAUDE.md), den anden (`Brugervaelger`) skifter en RIGTIG Firebase Auth-
  session og dermed et rigtigt token. Begge er dokumenteret i koden som
  bevidst adskilt (beslutning 28), men set udefra — to lister af rollenavne i
  samme sidebar-område, kun den ene reelt sikker — er en oplagt kilde til
  forveksling af "hvad er reel adgangsstyring" for en ekstern reviewer. Ingen
  af de to hører til chaufførappen selv (Chauffoerramme tegner hverken).
- **Turplan (`/app/tur`) vs. kontorets Rute & status/Disponering.** Samme
  `etaper`/`statushaendelser`-noder, to visninger med forskelligt filter
  (personId vs. alle) og forskellig handlingsradius (chauffør: melde status;
  kontor: skifte etapetilstand). Ikke et datamæssigt overlap i betydningen
  "to kilder til samme tal" — men en reviewer der sammenligner de to skærmes
  skærmbilleder, kunne fejlagtigt tro de var to uafhængige moduler.
- **Indberetning fra appen vs. Flåde → Indberetninger (kontor).** Samme
  `indberetninger`-node, filtreret modsat vej (chauffør: `oprettetAf ===
  eget uid`; kontor: alle). Ejerskabet i `NODE_MODUL` ligger hos `flaade`,
  ikke hos chaufførappen — bekræftet, ikke redefineret her.

IKKE PÅVIST: om en indberetning tabes (i stedet for at fejle synligt) ved en
reel netværksafbrydelse under `send()` i `Indberetning.jsx` — filen har ingen
`meldingskoe.js`-lignende mekanisme, og der er ikke fundet kode der
skelner en forbindelsesfejl fra en serverafvisning for denne skrivning
specifikt (kun `gem()`'s generelle `r.ok`/`r.besked`-svar).
