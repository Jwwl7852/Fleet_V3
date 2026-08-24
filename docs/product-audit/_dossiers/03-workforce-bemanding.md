# Modul 03 — Workforce / Bemanding

Kilder læst: `src/moduler/Bemanding.jsx`, `src/moduler/Kompetencer.jsx`,
`src/moduler/Fravaer.jsx`, `src/moduler/Medarbejdere.jsx`,
`src/fleet/personale.js`, `src/fleet/fravaer.js`, `src/fleet/koerehviletid.js`,
`src/fleet/stempling.js`, `src/fleet/nav.js`, `src/fleet/moduler.js`,
`src/fleet/permissions.js`, `firebase.rules.json` (uddrag), samt
`src/moduler/app/Timeregistrering.jsx` og `src/moduler/app/Frihed.jsx` (kun for
datalinjen — dækkes ellers af chauffør-app-dossieret).

## Modul-resumé

- **navn:** Workforce / Bemanding (menu-label "Workforce"; modulnøgle `bemanding`)
- **formål:** Overblik over bemanding og kapacitet, medarbejderstamdata,
  kompetence-/certifikatgyldighed og ferie/fravær der skal blokere
  disponeringen. Ifølge `moduler.js`: "Vagtplan, medarbejdere, kompetencer og
  fravær."
- **primær brugertype:** Disponent/koordinator (bemandingsoverblik og
  fraværskonsekvens), admin (medarbejderkartotek, da kun admin har
  `personale.skriv`), kontor generelt (godkendelse af fraværsansøgninger).
  Chaufføren selv rammer to af de underliggende data-noder (`stemplinger`,
  `fravaer`) via chauffør-app-skærmene, ikke via dette modul.
- **vigtigste opgave:** Vise hvem der er til rådighed, hvem der mangler et
  gyldigt kørekort/certifikat, og hvem der er væk — og sørge for at de tre
  billeder stemmer overens med Dashboard.
- **vigtigste funktioner:**
  - Ugevisning af planlagt vs. disponeret bemanding pr. funktion (kun
    demo-data, ingen rigtig vagtnode)
  - Kompetence-/certifikatregister med "blokerer vs. advarer"-skel og
    udløbsvarsling
  - Fraværsliste med adgangsstyret årsagsfelt (sensitive-node) og en simuleret
    "reservation der ville blive skrevet"
  - Medarbejderkartotek (stamdata: navn, funktion(er), status,
    ansættelsesform, stationering, kontakt) med reelt oprettelses-flow
- **undermoduler (nav.js `bemanding.born`):** Bemandingsplan (`/bemanding`),
  Kompetencer (`/bemanding/kompetencer`), Ferie & fravær
  (`/bemanding/fravaer`). Medarbejdere ligger MENU-mæssigt under Opsætning
  (`/opsaetning/medarbejdere`), men er datamæssigt en del af dette modul (se
  "Mulige overlap").
- **afhænger af (andre moduler):** Ingen — `MODUL_KRAEVER` nævner ikke
  `bemanding` som afhængig af noget. `personale`, `kompetencer` og `kpi` er
  ifølge kommentar i `moduler.js` linje 296-298 bevidst IKKE gatede noder ("enhver
  abonnementskombination har medarbejdere"). `fravaer`, `sensitive/fravaer` og
  `stemplinger` ER gatede til modulet `bemanding` i `NODE_MODUL`.
- **afhænges af (hvem læser dette modul):** Dashboard (deler
  kapacitetsgrad/ledig-kapacitet-tal via `dashboards.js`), Disponering/
  `tjekDisponering()` (kompetencetjek og fraværsblokering ved etapedisponering,
  håndhævet server-side i Cloud Function, ikke i skærmen), Flåde/Facility
  (deler `serviceTone()`-tærskler for "udløber snart" med kompetencer).
- **samlet status:** PARTIAL / blandet. Kompetencer og Fravær er læseskærme
  bygget mod rigtige data (Fase 0 = visning), Medarbejdere har et reelt
  oprettelses-skriveflow men intet redigerings-/fratrædelsesflow, og
  Bemandingsplanen er ren demo-data uden en vagtnode i datamodellen overhovedet.
- **overlap-mistanke:** Medarbejdere (`/opsaetning/medarbejdere`) vs. Opsætning
  → Brugere & roller — to forskellige begreber (person vs. login) som
  filens egen kommentar fremhæver som en bevidst håndteret forvekslingsrisiko.
  Se "Mulige overlap".

## Skærme

### Bemanding (`/bemanding`)

- **route:** `/bemanding` · **sidenavn:** "Workforce" (nav-label
  "Bemandingsplan")
- **hvem bruger den:** Disponent/koordinator, der skal se dagens/ugens
  dækningsgrad.
- **primært formål:** Ugeoverblik over planlagt vs. disponeret bemanding pr.
  funktion (chauffør, buschauffør, mekaniker osv.), samt kompetenceudløb og
  "åbne vagter".
- **primær handling:** Ingen skrivehandling — ren visning.
- **sekundære handlinger:** Link til Kompetencer og til Fravær; en "Tildel"-
  knap på åbne vagter, som er permanent deaktiveret ("Kræver en vagtnode i
  datamodellen").
- **data vist:** KPI-kort (Disponeret/Planlagt/Ledig/Underbemandede/
  Kompetencer udløber — fra `useKpi()`), en ugetabel bygget af
  `DEMO_BEMANDINGSPLAN` (demo-only, ingen node), en "Kapacitet pr. funktion"-
  tabel udledt af samme demo-data, kompetenceliste fra rigtige noder
  (`personale`, `kompetencer` via `demoKompetencerMedNavn()`, som selv læser de
  rigtige noder når de er seedet).
- **data der kan ændres:** Intet. Alt er skrivebeskyttet/deaktiveret.
- **kommer typisk fra:** Sidebar/dashboard-link; er selv landingsskærmen for
  "Workforce" i menuen.
- **går typisk til:** `/bemanding/kompetencer`, `/bemanding/fravaer`,
  `/opsaetning/medarbejdere` (linket eksplicit i bundteksten).
- **overlap med anden side:** Dashboard viser de samme tre tal
  (kapacitetsgrad, disponeret/planlagt, chauffør-tal) — filens egen
  overskrift-kommentar dokumenterer i detalje hvordan de to skærme historisk
  har regnet dem forskelligt (84 % vs. 83 %) og hvordan `dashboards.js`s
  `kapacitetsgrad()`/`ledig()` nu er den fælles kilde.
- **status:** MOCK/DEMO for selve bemandingsplanen (ugeplan, "åbne vagter",
  "kapacitet pr. funktion" — al fra `DEMO_BEMANDINGSPLAN`, ingen vagtnode
  findes overhovedet i datamodellen). KPI-kortene øverst og
  kompetencelisten er BUILT (rigtig læsning via `useKpi()`/`useListe`).
- **demo-data (ja/nej+note):** JA, og IKKE kun som fallback — ugeplanen er
  strukturelt permanent demo-data, fordi der ingen "vagt"-node findes i
  arkitekturen endnu. Filens egen kommentar: "Bemandingsplanen er demo-data:
  der findes ingen vagtnode i datamodellen endnu."
- **nødvendig for daglig drift eller admin/opsætning:** Tiltænkt daglig drift
  (disponent-overblik), men reelt ubrugelig til drift fordi tallene ikke er
  ægte og intet kan skrives/tildeles.

### Kompetencer (`/bemanding/kompetencer`)

- **route:** `/bemanding/kompetencer` · **sidenavn:** "Kompetencer &
  certifikater"
- **hvem bruger den:** Disponent, koordinator, admin — alle der skal vide om
  en chauffør/mekaniker må sættes på en tur.
- **primært formål:** Vise hvilke medarbejdere har udløbne eller snart
  udløbende kompetencer, og skelne mellem dem der BLOKERER disponering og dem
  der kun ADVARER.
- **primær handling:** Vælge en medarbejder i listen for at se detaljer.
- **sekundære handlinger:** "Overrul med begrundelse" på en advarende
  (ikke-blokerende) udløbet kompetence — permanent deaktiveret
  ("Fase 0: en override kræver en begrundelse og skrives af en Cloud
  Function").
- **data vist:** Medarbejderliste med status, antal kompetencer, samlet
  gyldighedstilstand; detaljepanel med hver enkelt kompetence, dens virkning
  (Blokerer/Advarer) og udløbsfrist; en samlet "Udløber eller er udløbet"-
  arbejdsliste sorteret efter dato.
- **data der kan ændres:** Intet — ingen skrivning nogen steder i filen.
- **kommer typisk fra:** Bemanding-skærmens "Se alle"-link, Medarbejdere-
  skærmens "Se alle og varslinger"-link.
- **går typisk til:** Ingen udgående navigation ud over tilbage til de to
  ovenstående.
- **overlap med anden side:** Bruger samme `tjekKompetencer()`-funktion og
  samme `serviceTone()`-tærskler som Disponering/Flåde/Facility — eksplicit
  nævnt for at undgå to skærme der er uenige om hvad der haster.
- **status:** BUILT for læsning (rigtig `useListe("personale")` og
  `useListe("kompetencer")` mod RTDB, med korrekt tomtilstands-/afvisnings-
  håndtering). PARTIAL/ikke bygget for skrivning: override-handlingen findes
  som deaktiveret knap uden nogen skrivevej (ingen `gem()`, ingen Cloud
  Function fundet i `functions/index.js` til formålet).
- **demo-data (ja/nej+note):** Kun som `useListe`-fallback
  (`demo: DEMO_PERSONALE` / `DEMO_KOMPETENCER`) — bruges kun hvis der ingen
  Firebase-forbindelse er, ikke i normal drift.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift-relevant
  (disponeringsstøtte), men den reelle håndhævelse ligger andetsteds
  (`tjekKompetencer()` kaldt fra Cloud Function `etapeskift`, jf. CLAUDE.md) —
  skærmen er en visning, ikke en kontrol i sig selv.

### Ferie & fravær (`/bemanding/fravaer`)

- **route:** `/bemanding/fravaer` · **sidenavn:** "Ferie & fravær"
- **hvem bruger den:** Disponent/koordinator/kontor der skal vide hvem der er
  utilgængelig, og (med `fravaerSensitiveLaes`, kun admin i standardpresettet)
  hvorfor.
- **primært formål:** Vise igangværende/kommende fravær pr. medarbejder (alle
  funktioner, ikke kun chauffører) og forhindre at en fraværende disponeres.
- **primær handling:** Vælge en medarbejder for at se periode og den
  reservation fraværet VILLE skrive.
- **sekundære handlinger:** "Registrér fravær" — permanent deaktiveret
  ("Registrering er ikke bygget endnu" fra denne skærm); "Vis årsag" — en reel
  gated visning der slår `sensitive/fravaer/<id>` op ved klik (kun med
  `fravaer.sensitiveLaes`, serversiden er autoritet, ikke skjult ved manglende
  ret); søgning og funktionsfilter.
- **data vist:** Liste af fraværsperioder med medarbejdernavn, funktion,
  periode (vist inklusivt, gemt eksklusivt), varighed, tilstand
  (kommende/igangværende/afsluttet), en hængelåst "Årsag"-kolonne for alle
  rækker uanset art (for ikke at lække sygdom gennem selektiv skjuling).
- **data der kan ændres:** Intet fra denne skærm (skrivning sker i stedet fra
  chauffør-appens Frihed.jsx, se nedenfor).
- **kommer typisk fra:** Bemanding-skærmens "Ferie & fravær"-link.
- **går typisk til:** `/opsaetning/medarbejdere` (linket i bundtekst).
- **overlap med anden side:** Reservationen der "ville blive skrevet" bruges
  samme `RESSOURCE.medarbejder`/`KILDE.fravaer`/prioritet 30 som den rigtige
  fraværsreservation i disponeringsmodellen (`reservations.js`).
- **status:** PARTIAL. Læsning er BUILT (rigtig `useListe("fravaer")` +
  `useListe("personale")` + et gated ekstra-opslag på `usePost("sensitive/fravaer", …)`
  ved klik). Den kontorside-oprettelse ("Registrér fravær") er IKKE bygget fra
  DENNE skærm — men fraværsposten kan reelt skrives fra chauffør-appens
  ansøgningsflow (se Workflow-observationer), og selve fraværs-/reservations-
  logikken (`reservationFraFravaer()`) er ren visning her ("Reservationen
  skrives ikke endnu … hører i en Cloud Function").
- **demo-data (ja/nej+note):** Kun som `useListe`-fallback
  (`DEMO_FRAVAER`/`DEMO_FRAVAER_SENSITIVE`), samme mønster som ovenfor.
- **nødvendig for daglig drift eller admin/opsætning:** Daglig drift
  (disponeringsstøtte og GDPR-korrekt visning af fravær), men uden
  kontorets oprettelses-/godkendelsesknapper er skærmen kun en
  udstillingsvindue for data der skrives et andet sted.

### Medarbejdere (`/opsaetning/medarbejdere`)

- **route:** `/opsaetning/medarbejdere` (menu-placeret under Opsætning,
  `kraeverModul: "bemanding"` — se "Mulige overlap" for dokumentationen af
  dette menu-vs-ejerskab-split) · **sidenavn:** "Medarbejdere"
- **hvem bruger den:** Admin (kun admin har `personale.skriv` i
  standardpresettet).
- **primært formål:** Medarbejderkartotek — stamdata-oprettelse og -oversigt,
  adskilt fra login-oprettelse.
- **primær handling:** "Ny medarbejder" — åbner en formular og GEMMER reelt
  (kalder `gem()` fra `skriv.js` mod `personale/<id>`).
- **sekundære handlinger:** "Redigér" og "Registrér fratrædelse" på en valgt
  medarbejder — begge PERMANENT deaktiverede knapper ("Redigering er ikke
  bygget endnu.", "Fratrædelse er ikke bygget endnu.") — selvom
  `Medarbejderformular`-komponenten teknisk understøtter redigering (samme
  komponent, `gemNu()` sætter `AUDIT.aendre` når `person` er givet), er der
  ingen UI-vej til at åbne den i redigeringstilstand, fordi den knap der ville
  gøre det, er slået fra.
- **data vist:** Navn, funktion(er) (map, katalogrækkefølge), status,
  ansættelsesform, telefon, e-mail, stationering, login-status
  ("Ja"/"Intet login" udledt af `uid`-feltet), kan-disponeres-status,
  personens egne kompetencer (fra `kompetencer`-noden).
- **data der kan ændres:** Kun ved oprettelse: navn, status,
  ansættelsesform, funktion(er) (min. 1 påkrævet), stationering, telefon,
  e-mail, ansættelsesdato, fratrædelsesdato (kun hvis status=fratrådt).
  `division`, `cpr`, `privatAdresse` er eksplicit forbudte/valideret væk;
  `uid` sendes aldrig fra formularen.
- **kommer typisk fra:** Opsætnings-menuen; linket fra Bemanding- og
  Fravær-skærmene.
- **går typisk til:** `/bemanding` (linket i bundtekst), `/bemanding/kompetencer`
  (kortlink "Se alle og varslinger").
- **overlap med anden side:** Opsætning → Brugere & roller (login-oprettelse)
  — se "Mulige overlap".
- **status:** PARTIAL. Oprettelse er BUILT (reel skrivning til `personale/<id>`
  via `gem()`, med `valideMedarbejder()`-validering der spejler
  `firebase.rules.json`). Redigering og fratrædelse er ikke bygget (knapperne
  er deaktiverede med forklaring, ingen skrivevej udover oprettelse er
  tilgængelig via UI).
- **demo-data (ja/nej+note):** Kun som `useListe`-fallback (`DEMO_PERSONALE`,
  `DEMO_KOMPETENCER`); listen tæller eksplicit sig selv som "udsnit", ikke en
  total (ingen KPI-felt for antal medarbejdere findes endnu).
- **nødvendig for daglig drift eller admin/opsætning:** Admin/opsætning —
  dette ER stedet en medarbejder oprettes, men uden redigering/fratrædelse er
  det kun en engangsindtastning, ikke løbende vedligehold.

## Data-entiteter

| Entitet | RTDB-node(r) | Ejes af (jf. NODE_MODUL) | Bruges også af | Kilde-til-sandhed-bemærkning |
|---|---|---|---|---|
| Personale (stamdata) | `personale/<personId>` | **Ingen modulklausul** — base-node ("personale, kompetencer og kpi er heller ikke gatede", `moduler.js` linje 296-298: "enhver abonnementskombination har medarbejdere") | Bemanding, Kompetencer, Fravær, Disponering (`tjekDisponering()`), chauffør-app (`brugere/<uid>/personId`-kobling), Dashboard | Eneste kilde for medarbejdernavn/funktion/status; `Medarbejdere.jsx` er stedet den skrives fra (kun oprettelse) |
| Kompetencer | `kompetencer/<id>` (felt `personId`) | Ingen modulklausul (samme base-undtagelse som personale) | Kompetencer.jsx, Medarbejdere.jsx (persondetalje-panel), Disponering (`tjekDisponering()`/`kraevedeKompetencer()`), Flåde (samme `serviceTone()`) | To separate noder (`personale`, `kompetencer`) med vilje — "hvilke kompetencer udløber inden for 30 dage" kan ikke besvares under `personale/<id>/kompetencer/` |
| Fravær (general) | `fravaer/<id>` (felt `personId`, `fra`, `til`, evt. `ansoegning`) | `bemanding` (`NODE_MODUL.fravaer`) | Fravaer.jsx, `app/Frihed.jsx` (chauffør-app, skriver hertil), Disponering (fraværsreservation) | `art` er `.validate: false` her — årsagen må aldrig lande i denne node |
| Fravær (følsomt) | `sensitive/fravaer/<id>` (felt `art`, `note`) | `bemanding` (`NODE_MODUL["sensitive/fravaer"]`) | Fravaer.jsx (kun ved klik + `fravaer.sensitiveLaes`) | Læsning kræver `auditerSom: "fravaerSensitive"` — selve læsningen er en logget hændelse |
| Stempling/timeregistrering | `stemplinger/<personId>/<id>` (felt `indMs`, `udMs`, `note`) | `bemanding` (`NODE_MODUL.stemplinger`) | **Ingen skærm i dette modul** — kun `app/Timeregistrering.jsx` (chauffør-app) læser og skriver den | Ejes datamæssigt af Workforce-modulet, men der findes ingen kontor-/admin-visning af den i de fire filer læst her; kun chaufførens egen visning findes |

## Implementation-status

- **Bemandingsplan (ugeplan/kapacitet pr. funktion/åbne vagter):** STATUS
  MOCK/DEMO. Persistence: ingen — `DEMO_BEMANDINGSPLAN` er et modul-lokalt
  array, ingen RTDB-node findes overhovedet for en "vagt". Kendt blokerer:
  filens egen kommentar siger eksplicit at der "ingen vagtnode [findes] i
  ARKITEKTUR", og at det hænger sammen med at skærmen skal kunne SKRIVE noget
  først. "Tildel"-knappen er deaktiveret af netop denne grund. Ikke brugbar
  end-to-end til reel vagtplanlægning; kun KPI-kortene og kompetencelisten på
  samme side er ægte.
- **Kompetence-tracking / udløb-påmindelser:** STATUS BUILT for visning
  (rigtig data, korrekt blokerer/advarer-skel, samme kilde som
  Disponering bruger til faktisk håndhævelse). STATUS PARTIAL/ikke bygget for
  override-handlingen (deaktiveret knap, ingen Cloud Function fundet for
  `byggOverride()`/kompetence-override i `functions/index.js`). Håndhævelsen
  ved selve disponeringen ligger korrekt i serverkode (`tjekDisponering()`
  ifølge CLAUDE.md/beslutningerne), ikke i denne skærm.
- **Fraværsansøgning + godkendelse:** STATUS PARTIAL, men med et reelt
  overraskende BUILT-element: selve SKRIVNINGEN af en ansøgning er ægte og
  server-håndhævet — `firebase.rules.json` linje ~2247 tillader enten
  `fravaer.skriv` (kontor) ELLER at en bruger skriver sin EGEN
  `personId`-matchede post med `ansoegning.status === "ansoegt"` og ingen
  `afgjortAf`/`afgjortMs`/`svar` (chauffør kan ikke selv godkende). Denne vej
  bruges fra chauffør-appens `Frihed.jsx`, IKKE fra Workforce-modulets egen
  `Fravaer.jsx`, hvor "Registrér fravær" er deaktiveret. Godkendelsessiden
  (kontorets svar/`afgjortAf`) er ikke bygget nogen steder i de læste filer —
  ingen skærm sætter `ansoegning.status = "godkendt"`. Selve
  reservations-skrivningen ved godkendelse er heller ikke bygget (Fase 0,
  eksplicit kommentar: "Reservationen skrives ikke endnu … hører i en Cloud
  Function").
- **Medarbejderkartotek:** STATUS PARTIAL. Oprettelse er BUILT
  (ægte write-path via `gem()` → `personale/<id>`, med klient- og
  server-validering der spejler hinanden). Redigering og fratrædelse er ikke
  bygget — knapperne findes, er deaktiverede, med forklarende `title`. Ingen
  slet-funktion findes med vilje (reglerne afviser sletning via
  `newData.exists()`).
- **Køre-hviletid-check:** Findes som ren funktion (`koerehviletid.js`,
  `tjekKoerehviletid()`), men ingen af de fire skærme i dette modul kalder den
  eller viser dens resultat. Den er dokumenteret som hørende hjemme i
  Disponerings-flowet (Cloud Function der skriver etapen), ikke i Workforce-
  skærmene. Funktionen bærer altid et eksplicit forbehold
  ("planen overtræder ikke reglen — vi kan ikke se tachografen"), fordi den
  kun kan se PLANEN, ikke tachografdata. IKKE PÅVIST om nogen skærm i det
  bredere kodebase faktisk viser dette forbehold for slutbrugeren — det er
  uden for de fire filer der er læst til dette dossier.

## Workflow-observationer

Sporing af "hvordan opstår et fravær":

1. **Ansøgning (chaufførapp):** `src/moduler/app/Frihed.jsx` lader en chauffør
   ansøge om `ferie`, `feriefridag` eller `afspadsering` (ALDRIG sygdom —
   `ANSOEGBARE_ARTER` er eksplicit udledt til at udelukke helbredsoplysninger).
   Skriver direkte til `fravaer/<nytId>` via `gem()` — reelt, server-håndhævet
   (rules-uddrag ovenfor). Ansøgningen har status `ansoegt` og bærer intet
   `afgjortAf`/`afgjortMs`/`svar`, så en chauffør ikke selv kan godkende.
2. **Kontorets registrering (alternativ vej):** `Fravaer.jsx`s kommentarer og
   `erAftalt()`-funktionen i `fravaer.js` viser at et fravær UDEN
   `ansoegning`-felt er "kontorets egen registrering" og betragtes som
   allerede aftalt — men den faktiske oprettelses-UI for denne vej
   ("Registrér fravær"-knappen i `Fravaer.jsx`) er deaktiveret/ikke bygget.
   IKKE PÅVIST hvor (om noget sted) kontoret reelt kan indtaste et fravær
   direkte i de fire filer, der er læst her.
3. **Godkendelse:** IKKE PÅVIST/IKKE BYGGET i de læste filer. Ingen skærm i
   dette modul sætter `ansoegning.status = "godkendt"` eller skriver
   `afgjortAf`/`svar`. `Frihed.jsx` viser kun kvitteringen "Du får svar her i
   appen" og læser `ansoegning.svar` hvis det findes — men intet sted skrives
   det derfra.
4. **Blokerer det disponeringen?** Endnu ikke automatisk. Både `Fravaer.jsx`
   og `fravaer.js` er eksplicitte om at reservationen (som ville forhindre
   disponering af den fraværende medarbejder) BEREGNES men IKKE SKRIVES:
   `reservationFraFravaer()` bygger formen, og kommentaren siger "Konflikt-
   frihed kan ikke afgøres i klienten … den hører i en Cloud Function sammen
   med de øvrige. Indtil da er det her en visning af formen, ikke en
   handling." Dette er samme "reservationer i basen, fire kilder" -mønster
   som `moduler.js` beskriver ved beslutning 4 (booking, værksted, facility-
   sag og fravær skal dele `reservationer`-noden) — men for fravær specifikt
   er skrive-siden af den reservation IKKE fundet implementeret i nogen af de
   Cloud Functions der blev grep'et i `functions/index.js` for dette dossier.
   Konsekvens: en godkendt fraværsansøgning blokerer i dag IKKE automatisk
   disponeringen af den pågældende medarbejder, medmindre en Cloud Function
   uden for de undersøgte nøgleord gør det — IKKE PÅVIST med sikkerhed uden
   fuld gennemgang af `functions/index.js` (5800+ linjer, kun grep'et targeteret).

## UI-mønstre

- **Navigation:** Standard `<Kort>`/`<Gitter>`-layout fra `ui.jsx` på alle fire
  skærme; ingen egen sidebar eller periodevælger (i overensstemmelse med
  CLAUDE.md's forbud — shellen ejer dem).
- **KPI-kort:** `KpiKort`/`KpiRaekke` med runde ikoner (`rund`), farvede
  "ikon-N"-toner som accent (aldrig eneste bærer af betydning — tal og tekst
  står altid ved siden af). Bruges på Bemanding og Kompetencer, IKKE på
  Fravær eller Medarbejdere (begge med eksplicit begrundelse: intet felt i
  `kpi/` findes endnu for disse, og at tælle rækker i en hentet liste ville
  bryde beslutning 6 om ikke at forveksle et udsnit med en total).
- **Tabeller:** `Tabel`-komponent gennemgående, med `render`-funktioner pr.
  kolonne, `midt`/`num`-justering, `noegle`/`paaRaekke`/`erValgt` for
  master-detail-mønsteret (liste til venstre, detaljepanel til højre — samme
  layout på Kompetencer, Fravær og Medarbejdere: `Gitter kolonner="minmax(0,2fr) minmax(0,1fr)"` el. lign.).
- **Status/farve:** `Pille`-komponent med `tone` (`ok`/`warn`/`bad`/`info`) —
  bl.a. `PERSONALE_STATUS`, `TILSTAND` (fravær), `serviceTone()`
  (kompetenceudløb), samt cellefarver i bemandingsgitteret
  (`fc-celle-ok/-warn/-bad`, med både farvet flade OG tal/procent i cellen for
  ikke at bære betydning på farve alene).
- **Filtre:** Tekstsøgning + funktions-dropdown (`ALLE_FUNKTIONER`) gentaget
  identisk på Fravaer.jsx og Medarbejdere.jsx; fane-toggle
  (`role="tablist"`) for "aktive/alle" hhv. "igangværende/alle" perioder.
- **Modaler/formularer:** Ingen modal — formularen (`Medarbejderformular` i
  Medarbejdere.jsx) vises inline OVER listen ("så man ser den man netop har
  oprettet"), bygget med `Felt`/`Feltraekke`/`Formular`-komponenter fra
  `ui.jsx`.
- **Knapper med forklarende disabled-state:** Gennemgående mønster —
  deaktiverede knapper bærer altid en `title`-forklaring ("Kræver en
  vagtnode…", "Fase 0…", "Redigering er ikke bygget endnu…") frem for at
  skjule knappen; eksplicit designbeslutning nævnt flere steder ("En knap der
  ikke gør noget uden at sige hvorfor, er værre end ingen knap").
  Rolle-baserede knapper viser desuden hvorfor de er slået fra af
  permissions-grunde, ikke kun byggegrunde (fx "Kræver personale.skriv, som
  kun admin har.").
- **Terminologi:** "Funktioner" bruges konsekvent i stedet for "roller" for
  chauffør/mekaniker/lager (Bemanding.jsx's åbningskommentar forklarer
  navnesammenstødet med adgangsmodellens `roller`). "Medarbejder" (ikke
  "chauffør") som ressourcenavn i fraværs- og reservationskonteksten, for
  ikke at usynliggøre ikke-chauffør-personale.
- **Kalender/datovælgere:** Ingen dedikeret kalenderkomponent i disse fire
  skærme; Bemanding bygger sin egen 7-kolonners ugetabel manuelt med
  `Date`-baseret ugestart (mandag), IKKE Gitterkalender-komponenten som andre
  moduler (Driftskalender m.fl.) bruger.

## Mulige overlap

- **Site A: Medarbejdere (`/opsaetning/medarbejdere`)** / **Site B: Opsætning
  → Brugere & roller.** Grund: To forskellige entiteter der ligner hinanden —
  en `personale`-post (nøglet på `personId`) repræsenterer PERSONEN og hans
  stamdata; en `brugere`-post (nøglet på `uid`) repræsenterer et LOGIN.
  Filens egen kommentar fremhæver dette som en bevidst dokumenteret risiko:
  "DE TO ER NU NABOER I MENUEN … og forvekslingen er dermed LETTERE end før,
  ikke sværere. Derfor siger begge punkters undertekst hvad forskellen er."
  En chauffør har måske aldrig et login (`uid`); en admin har begge.
  `uid` bruges til "hvem gjorde noget" (audit, `oprettetAf`), `personId`
  bruges til "hvem det handler om" (reservationer, fravær, opgaver, etaper,
  kompetencer). Risiko: en fremtidig udvikler der forveksler de to felter i
  en ny funktion, ville ifølge CLAUDE.md bryde ejerskabstjek i
  `firebase.rules.json` ("personId matcher aldrig et uid").
- **Site A: Bemanding (`/bemanding`) kapacitetstal** / **Site B: Dashboard.**
  Grund: Begge viser "kapacitetsgrad", "disponeret/planlagt" og
  "chauffør disponeret/planlagt" fra samme `kpi/`-node. Historisk regnede de
  to skærme tallet forskelligt (84 % vs. 83 %), nu samlet i
  `dashboards.js`s `kapacitetsgrad()`/`ledig()`. Risiko: enhver fremtidig
  ændring der genindfører en lokal beregning i én af skærmene, splitter
  tallene igen — filens kommentarer dokumenterer dette som "beslutning 71" og
  fremhæver det gentagne gange som en kendt fælde.
- **Site A: Bemandingsplanens "funktioner"-begreb** / **Site B:
  adgangsmodellens `roller`-node (`tenants/<t>/roller/`).** Grund: Begge ord
  ville naturligt hedde "roller" på dansk; filen navngiver dem eksplicit
  "funktioner" for at undgå navnesammenstød med permission-rollerne
  (chauffoer, casehandler, disponent, koordinator, lagermedarbejder, revisor,
  admin). Ren navnerisiko, ingen data deles.
- **Site A: Fravaer.jsx (kontorets fraværsvisning)** / **Site B:
  app/Frihed.jsx (chaufførens ansøgningsskærm).** Grund: Begge læser/skriver
  samme `fravaer`-node, men Fravaer.jsx's egen "Registrér fravær"-knap er
  deaktiveret, mens Frihed.jsx reelt kan skrive til noden via en anden
  regelgren (self-service ansøgning). En bruger der kun kender kontorsiden,
  ville tro fraværsregistrering slet ikke er bygget — den er, bare ikke fra
  den skærm de kigger på.
- **Site A: `stemplinger`-noden (ejet af `bemanding`)** / **Site B: ingen
  skærm i dette modul viser den.** Grund: `NODE_MODUL` placerer
  `stemplinger` under Workforce/Bemanding, men ingen af de fire undersøgte
  skærme (Bemanding, Kompetencer, Fravaer, Medarbejdere) læser eller viser
  timeregistreringsdata — kun chauffør-appens egen `Timeregistrering.jsx`
  gør. IKKE PÅVIST om en administrativ/kontor-visning af stemplinger findes
  andetsteds i kodebasen (uden for de otte filer der er læst til dette
  dossier); hvis ikke, er dette et modul-ejet datasæt uden noget
  modul-internt vindue ind i det for kontorpersonale.
