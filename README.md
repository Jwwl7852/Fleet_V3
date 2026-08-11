# FleetControl 3.0

Multi-tenant TMS for danske vognmænd. Én shell, én informationsarkitektur, én
talkilde.

Udgangspunktet var 20 mockups fordelt på tre uforenelige designretninger og en
deployet v1.4. v3.0 samler dem. Alt der stod i konflikt er afgjort — de 31
beslutninger står i **[BESLUTNINGER.md](BESLUTNINGER.md)**, så du kan omgøre
dem enkeltvis i stedet for at skulle finde ud af hvorfor noget ser ud som det
gør.

| Fil | Hvad |
|---|---|
| **README.md** | Hvor projektet står, og hvordan du kommer i gang. Den her. |
| **[BESLUTNINGER.md](BESLUTNINGER.md)** | De 35 beslutninger med begrundelser. Læs den før du bryder med noget |
| **[EJERKONSOL.md](EJERKONSOL.md)** | Ejerkonsollen: datamodel, funktioner og de fire beslutninger bag |
| **[ABONNEMENT.md](ABONNEMENT.md)** | Abonnementsfakturering — priser, rabat og frosne fakturagrundlag. Prismodellen er **bygget**; noden og skærmen mangler |
| **[ARKITEKTUR.md](ARKITEKTUR.md)** | Datamodellen: noder, konventioner, adgang, egress |
| **[CLAUDE.md](CLAUDE.md)** | Arbejdsregler hvis du bruger Claude Code |

## Kom i gang

```bash
npm install
cp .env.example .env.local          # DEV-nøgler. Ikke prod.
git config core.hooksPath .githooks # kører regel- og designtesten før commit
npm run dev
npm test                            # 915 tests. Starter emulatoren.
npm run test:design                 # kun designtokens. Ingen emulator, ~0,1 s.
npm run regler:tjek                 # håndhæver databasen den regelfil du har?
npm run delt:kopier                 # laegger audit-politikken ind i functions/delt/
npm run kunde:opret -- --id x --navn "X ApS"   # opretter en TOM kunde
npm run funktioner:udrul            # udruller Cloud Functions og aabner dem
```

`core.hooksPath` skal sættes **én gang pr. klon** — hooks følger ikke med i
git. Uden den kan man committe en ændring i `firebase.rules.json` uden at have
kørt testen, og det er præcis sådan reglerne kunne ligge ugyldige fra
fundamentet i månedsvis uden at nogen opdagede det.

**Der er to Firebase-projekter.** `fleetcontrol-dev-1ac1c` er til at smide
væk; `fleetcontrol-98e11` er rigtige kunders data. Som ny udvikler peger du på
**DEV** — det gør `.env.example` allerede.

### Provisionér DEV, én gang pr. maskine

```bash
# .serviceaccount-dev.json fra Firebase-konsollen (DEV → Projektindstillinger
# → Tjenestekonti). Gitignored. Og VITE_DEV_BRUGER_KODE i .env.local.
npm run provisioner:dev
```

Scriptet sætter `tenants/demo/_findes`, opretter **seks brugere — én pr. rolle**
(plus din egen, hvis `VITE_DEV_EJER_MAIL` er sat)
med rigtige custom claims, og seeder demo-datasættene ind under de noder
skærmene læser. Uden det afviser hver eneste regel alt: `_findes` er en
forudsætning i hver `.read`, og en indlogget bruger ville se "afvist" overalt.

⚠ **To spærringer, begge mekaniske.** Scriptet afbryder hvis nøglen peger på
produktion, og hvis nøglefilen ikke er dækket af `.gitignore` — nøglen giver
fuld admin og går uden om alle regler, og en committet nøgle ligger i
historikken bagefter. Der er ikke noget `--force`. Se beslutning 27.

Rollerne afprøves ved at **skifte session**, ikke ved at skifte en dropdown:
claims kommer fra tokenet, og en klient kan ikke ændre sit eget token
(beslutning 28).

**Produktionsnøglerne findes kun i Netlify.** Appen udleder miljøet af
projekt-id'et og viser en bjælke i toppen, når du ikke er på produktion.
Havner produktionsnøgler et sted de ikke hører hjemme, bliver bjælken rød og
stribet.

Uden `.env.local` kører appen i demo-mode med datasættene i `fleet/demo-*.js`.
Ingen hvide skærme, ingen crash.

Deploy: Netlify, `npm run build` → `dist`. `netlify.toml` har SPA-fallback —
uden den giver et direkte hit på `/booking/disponering` en 404.

**Cloud Functions kører.** DEV er på **Blaze**, og den første funktion —
auditloggen i `functions/index.js` — er udrullet i `europe-west1`. Udrul med
`npm run funktioner:udrul`; den kopierer den delte politik ind i
`functions/delt/` først.

⚠ **Budgetalarmen kom FØR opgraderingen, og rækkefølgen var med vilje.** Mellem
opgradering og alarm er der et vindue hvor en løkke i en funktion kan koste
penge uden at nogen får besked. Der er alarm på **både DEV og PROD** på 50 kr,
og en oprydningspolitik på containerbillederne (3 dage) — uden den vokser
Artifact Registry stille og roligt ind i budgettet.

⚠ **Skrivning uden auditlog er ulogget skrivning.** `audit.log()` tæller fejlen
og går videre, så en skærm ikke går ned når loggen er nede. Det er rigtigt for
en læseskærm og forkert for en pilot: kunden skal kunne få svar på hvem der
ændrede hvad.

⚠ **DEV har ingen Storage-bucket** (kræver Blaze; DEV står på Spark). Skal en
skærm uploade filer, skal bucket'en oprettes i `europe-west1` sammen med en
budgetalarm. Regionen kan ikke ændres bagefter — se ARKITEKTUR.

## Beslutninger

Kort form. Begrundelserne — hvad der gik galt uden hver enkelt — står i
**[BESLUTNINGER.md](BESLUTNINGER.md)**. Et brud skal være bevidst, ikke
tilfældigt.

| # | Beslutning | Fil |
|---|---|---|
| 1 | Flad sidebar med undermenuer. Ingen topfaner | `fleet/nav.js` |
| 2 | Beløb i hele **øre**, altid ekskl. moms. `momsOere` separat | `fleet/format.js` |
| 3 | Afvigelser gemmes som (faktisk − budget). Farven følger `betterWhen` | `fleet/format.js` |
| 4 | **Én reservationsnode.** Booking, værksted, facility og fravær skriver alle til den | `fleet/reservations.js` |
| 5 | Booking er en tilstandsmaskine. Disponenten godkender ikke sit eget forslag | `fleet/booking-state.js` |
| 6 | **Nøgletal fra én aggregeret node.** Afledte tal beregnes hos forbrugeren | `fleet/useKpi.js` |
| 7 | Satser versioneres med `gyldigFra` og overskrives aldrig | `fleet/pricing.js` |
| 8 | Ét nummerformat: `PRÆFIKS-ÅÅÅÅ-NNNNN` fra counter i en transaction | `fleet/booking-state.js` |
| 9 | Gods/Bus gælder hele platformen | `fleet/AppShell.jsx` |
| 10 | Accent er `#125bec` | `fleet/fleet.css` |
| 11 | Driftsomkostning pr. km ≠ kalkulationspris pr. km | `moduler/flaade/Oversigt.jsx` |
| 12 | De to Flåde-værkstedsskærme er slået sammen | `moduler/flaade/Vaerkstedskalender.jsx` |
| 13 | Live-kort er beholdt — det findes deployet, men i ingen mockup | `moduler/booking/LiveKort.jsx` |
| 14 | `indkoebsprisafvigelse` og `salgsprisafvigelse` — aldrig bare "prisafvigelse" | `fleet/useKpi.js` |
| 15 | **Division er et felt, ikke en sti.** `gods` \| `bus` \| `faelles` | `fleet/useListe.js` |
| 16 | Kombi-transport: en booking er et forløb med N etaper. Tilstanden ligger på **etapen** | `fleet/booking-state.js` |
| 17 | **`securityLevel` + klassificerede søskendenoder** (`sensitive/`, `vaerdi/`) | `fleet/permissions.js` |
| 18 | Personale og flåde er entiteter. `personId` er ikke `uid` | `fleet/personale.js`, `fleet/flaade.js` |
| 19 | Stamdata har ikke en division. Forbudt på `personale/` og `koeretoejer/` | `firebase.rules.json` |
| 20 | **Sagsbaseret mail:** nummeret i emnefeltet er hele integrationen | `fleet/sager.js` |
| 21 | **`opgaver.art` er `vaerksted` \| `facility`** — ikke `langtur`. En langtur *er* en etape. Køre-hviletid blokerer, men med forbehold | `fleet/opgaver.js`, `fleet/koerehviletid.js` |
| 22 | **De ni skærme uden mockup er afgjort.** Fakturering hedder **Fakturagrundlag** — FleetControl laver ikke den juridiske faktura. Live-kort hedder **Rute & status** — ingen GPS. Indberetninger deles i **driftshændelser** og **udgiftsregistreringer**. Kompetencer har **lovkritiske** (blokerer) og **virksomhedskrav** (advarer med begrundet override). Leverandører får **objektive tal, ingen stjerner**. Integrationer viser **kun det der findes**. Idébank ud af kundens installation | `fleet/integrationer.js`, `fleet/rutestatus.js` |
| 23 | **Supportadgang er tidsbegrænset og kundestyret.** FleetControl-personale har som standard **ingen** adgang. Kundens administrator giver adgang med varighed, type, formål og sagsnummer; den **udløber automatisk**, ikke ved at nogen husker det. En supportsag bærer kontekst — aldrig passwords, tokens eller feltværdier. **Ikke besluttet:** AI-diagnose og systemstatusside | *ikke bygget — efter fase 1* |
| 24 | **Support krydser tenant-grænsen — én gang, og kun her.** Sagen ligger i `support/sager/<id>` i toppen med et `tenantId`; hver tenant har en **indeksnode** til at liste sine egne. **Retter beslutning 23:** auditloggen vises som et bundet **udtræk** på sagen, ikke som adgang. ±5 minutter, højst 50 poster, ikke konfigurerbart | `fleet/support.js` |
| 25 | **De fire sidste skærme — og det er antagelser, ikke afgjorte krav.** Skal valideres hos første kunde. Et fakturagrundlag er en **opgørelse**, ikke en faktura; det **erstattes** frem for at rettes, med referencen **begge veje**, og kun grundlag uden `erstattetAfId` tæller med. **Momssatsen står pr. linje og gættes ikke** — eksport nægtes uden. En indberetning **har** en sag, den **er** ikke en sag. Materialeforbrug er **én hændelse med to posteringer**: et salg og et lagertræk. Kompetencekravet **kommer fra enheden** — alt udledt blokerer, resten advarer med begrundet override. Leverandørtal står **med deres grundlag**; under tre observationer vises ingen procent | `fleet/grundlag.js`, `fleet/indberetninger.js`, `fleet/leverandoerer.js` |
| 26 | **En afvist læsning er ikke et netværksproblem.** `permission-denied` blev oversat til demo-data og "ingen forbindelse". Tre tilstande er skilt: manglende database, manglende bruger (kendt **før** forespørgslen — den sendes ikke) og afvist af reglerne. **Opdigtede tal følger aldrig en afvisning.** Demo-data ved `auth == null` er et **stillads** gated på dev, og skal fjernes når login lander | `fleet/datatilstand.js` |
| 27 | **Dev bruger rigtige DEV-brugere mod DEV-projektet.** Claims-kæden var uprøvet i browseren — emulatoren lader dig minte et token med hvilke claims du vil, og tester derfor reglerne mod claims du selv har opfundet. Den bliver til rules-testene. Seks seedede brugere, én pr. rolle, med `perms` udledt af presettet. `_findes` er trin 1: uden markøren afviser hver regel alt. Scriptet **nægter at køre mod andet end DEV**, ikke konfigurerbart | `scripts/provisioner-dev.mjs` |
| 28 | **Rollevælgeren er en brugervælger.** Perms kommer fra tokenets claims, og en klient kan ikke ændre sit eget token — en dropdown kan derfor ikke ændre adgang, kun hvad UI'et tegner. I dev skiftes **session**: log ud, log ind som en anden seedet bruger, nyt token. I demo bevares overstyringen, hvor der ingen server er at være uenig med. Adgangsvejen selv (`harAdgang`) er **miljøuafhængig** og kræver et tenant-claim | `fleet/Brugervaelger.jsx`, `App.jsx` |
| 29 | **En udrulning er ikke færdig, før den er efterprøvet.** `firebase.rules.json` var aldrig udrullet: DEV kørte en ældre version med en kaskaderende `.read` på `tenants/$tenantId`, så hele beslutning 17 var sat ud af kraft. **Prøverne havde ret om filen og sagde intet om databasen.** `npm run regler:udrul` udruller OG sammenligner. Læsetjekket arver bevidst ikke provisioneringens produktionsspærring — mod prod er det mere værd | `scripts/tjek-regler.mjs` |
| 30 | **Kategorifarver er ikke statusfarver.** `GRAF_TONE` havde fem toner, og det så ud som om de rakte til Dashboards fem opgavestatusser — men statusfarver siger *hvor slemt det er*, kategorifarver siger *hvilken ting det er*. Genbruges de, betyder rød både "kritisk" og "den femte kategori". Fem `--fc-serie-*`, **valideret** med dataviz-validatoren, ikke skønnet | `fleet/fleet.css`, `fleet/ui.jsx` |
| 31 | **Roller er faste. Man tildeler dem — man ændrer dem ikke.** En vognmand der fjernede `booking.godkend` fra sin egen adminrolle havde lukket sig ude af sit eget system, og adgangen til at rette det var selv en permission. Beslutningen var **allerede håndhævet** — `roller` er `.write: false` — den var bare ikke skrevet ned. Idébanken røg ud i samme ombæring: rute, skærm, permission og node, som beslutning 22 lovede | `fleet/permissions.js`, `firebase.rules.json` |
| 32 | **Et lukket abonnement lukker tenanten — ikke kontoen.** At spærre kundens logins er en fælde: nogle konti er spærret *individuelt*, og ved genåbning ville man **genåbne folk der var fyret**. Statussen ligger på tenanten, hver regel kræver `aktiv`, og genåbning er ét felt. Tre noder bliver læsbare, så låseskærmen kan forklare sig — en spærring der ikke kan forklare sig selv, ligner en fejl | `firebase.rules.json`, `fleet/abonnement.js`, `App.jsx` |
| 33 | **Et fravalgt modul lukker sine noder — læsning og skrivning.** Afkrydsningen var en kommerciel kontrol; det holdt kun så længe listen tegnede en sidebar. Kan et modul **fratages**, har kunden ellers stadig data og API. ⚠ Prisen: kunden kan ikke hente sine egne data ud gennem appen, så et fravalg skal **aftales, ikke klikkes**. `opgaver`, `satser` og `fakturaer` står i basen — de hører hver til to moduler | `fleet/moduler.js`, `firebase.rules.json` |
| 34 | **Ejerkonsollen skriver ikke — den beder om det.** Fire Cloud Functions med `udbyder === true` som **første** handling; alle ejer-noder er `.write: false`. ⚠ Her — og kun her — kommer tenanten fra nyttelasten, fordi en ejerkonto **ingen** har. Prøver holder kundens og ejerens tjek adskilt, og `kundeadmin` og `opretbruger` deler ÉN oprettelse | `functions/index.js` |
| 35 | **Ejerskab tildeles ikke fra konsollen.** `udbyder`-claim'et sættes kun med servicekontonøglen (`npm run ejer:giv`). Vi er to: kunne den ene fjerne den andens claim, kunne den ene lukke den anden ude — og adgangen til at rette det var selv ejerskabet. En ejerkonto har **ingen tenant**, så spærringen er ikke en betingelse i en skærm, men fraværet af en nøgle | `scripts/ejer.mjs`, `App.jsx` |

## Struktur

```
src/
  App.jsx              alle 30 ruter, genereret efter nav.js
  firebase.js          ÉN initialisering. Moduler importerer db herfra.
  fleet/               kernen — modulerne må ikke duplikere noget herfra
    nav.js             sidebar + ruter, én kilde
    AppShell.jsx       layout: sidebar, topbar, Outlet
    FleetContext.jsx   tenant, periode, Gods/Bus
    useKpi.js          nøgletal fra kpi/. Demo-sættet ligger i demo-kpi.js
    datatilstand.js    hvorfor en skærm ikke viser rigtige tal (beslutning 26)
    useListe.js        listeopslag med division og auditering
    format.js          øre, datoer, ugenr, fortegnskonvention
    pricing.js         prismotor: satsopslag, beregning, snapshot
    reservations.js    reservationer + konfliktdetektion
    permissions.js     permission-katalog + rolle-presets. Ingen imports:
                       samme kilde som den Cloud Function der udsteder claims
    audit-regler.js    auditpolitik: vokabular, feltallowliste, retention.
                       Ingen imports — samme grund
    audit.js           audit.log() / audit.laes(). Kaster aldrig
    booking-state.js   tilstande, overgange, nummerserier
    sager.js           sagsbaseret mail: genkendelse + afsendervalidering
    personale.js       personer som entiteter
    flaade.js          arter, feltskema pr. art, kapacitet, kompetencekrav
    fravaer.js         årsager (sensitive), afledt tilstand, reservationen
    opgaver.js         art (vaerksted|facility), feltskema pr. art, status
    etaper.js          transportfelter, grænseovergange, reservationerne
    rutestatus.js      Rute & status: planlagte stop, chaufførens meldinger.
                       INGEN GPS — en melding er ikke en måling
    integrationer.js   kun det der findes. Listen er tom, og det er indholdet
    support.js         maaLaeseSag() er reglen skrevet een gang. Kontekst-
                       allowliste, auditudtrækkets faste grænse, supportadgang
    leverandoerer.js   kategorier, aftaler, afstemning. Division er tilladt her —
                       den beskriver leverandørens forretning, ikke vores
    facility.js        lokationer, aktiver, zoner. Grænsen på zonen, målingen
                       på sensoren — alarmen er afledt og gemmes aldrig
    koerehviletid.js   reglen, ikke et felt. Blokerer — med forbehold, fordi
                       vi kun kan se planen og ikke tachografen
    gitter.js          kalendergitterets regnestykke: slots, udlægning,
                       pile ved vinduets kant, overlap som konflikt
    Gitterkalender.jsx ressourcer × tid — delt af tre skærme
    demo-kpi.js        demo-nøgletal. Rent data, ingen React — så demo-filernes
                       selvkontrol også kan køres af en test
    demo-*.js          personale, flåde, fravær, sager, etaper, bookinger,
                       facility, kunder. Nodens form, ikke skærmens. Hver med
                       en selvkontrol. ⚠ Et demo-datasæt hører HER, ikke i en
                       modulfil — test/demo-kilder.test.mjs fejler på det
    Sagsvisning.jsx    sagen med faner — delt mellem Fleet og Facility
    ui.jsx             Kort, KpiKort, Tabel, Pille, Tom, Fejl, Knap, Soejlegraf
    fleet.css          tokens (udvider de eksisterende --bc-*)
  moduler/             30 skærme
```

## Status

Opdateret 9. august 2026. **Start her efter en pause.**

**Kernen er på plads.** Nitten byggeklodser i `fleet/` er i brug på tværs af
skærme, og **915 tests** kører via `npm test`. `.githooks/pre-commit` gør dem
obligatoriske dér hvor de hører til: regeltestene når `firebase.rules.json`
ændres, designtestene når `src/` ændres.
**Sikkerhedsrækkefølgen punkt 0–6 er lukket** — se Låst rækkefølge nedenfor.
Det gælder **filen**. Databasen er først dækket når `npm run regler:tjek` er grøn:
reglerne var aldrig udrullet til DEV, og prøverne kunne ikke se det (beslutning 29).

### Skærmene: 27 af 30 har indhold

| | Skærme |
|---|---|
| **Bygget (29)** | Dashboard *(referencemodul — start her når du skriver et nyt)*, Bookingopsætning, Kunder & Priser, Økonomi & Rapporter, Bemanding, Medarbejdere, Flåde, Ferie & fravær, Værkstedskalender, Disponering, Facility ×3, Booking-oversigt, Ny forespørgsel, Forslag, Indkøb ×2, Rute & status, Integrationer, Support ×3, **Fakturagrundlag**, **Indberetninger**, **Kompetencer**, **Leverandører**, **Opsætning → Generelt**, **Opsætning → Brugere & roller** |
| **Bygget som LÆSESKÆRME** | De to Opsætning-skærme viser hvad der findes — tenant, divisioner, lokationer, roller og permissions — og har **al skrivning deaktiveret med en begrundelse**. De åbne spørgsmål i `FleetControl-spoergsmaal.md` handler alle om at ændre, og de blokerer ikke en visning. Spørgsmålene står **på skærmen**, ikke kun i en fil |
| **Fjernet** | Idébank. Beslutning 22 afgjorde at den ikke hører i kundens installation; rute, skærm, `idebank.skriv` og noden i regelfilen er væk (beslutning 31) |

Hver skeletfil har en kommentar i toppen med hvad der skal bygges og hvilke
fejl fra mockuppen der skal undgås. **Læs den før du rører filen.** De tre der
venter, har fået deres produktvalg i beslutning 22 — men detaljerne mangler,
og de må ikke bygges på gæt. Se afsnittet nedenfor.

⚠ **De fire fra beslutning 25 er bygget på ANTAGELSER.** Fakturagrundlag,
Indberetninger, Kompetencer og Leverandører står på hvordan vi *tror* en
vognmand arbejder. Det står i toppen af hver fil, og det er ikke en
forsigtighedsfloskel: forløbet i `indberetninger.js`, linjearterne i
`grundlag.js` og de seks nøgletal i `leverandoerer.js` er de tre steder hvor
en forkert antagelse koster mest at rette bagefter. **Valider dem hos første
kunde, før der bygges skrivning ovenpå.**

### Beslutning 20 står i fase 0

Sagsvisningen er bygget som **visning**: fanerne Oversigt / Kommunikation /
Dokumenter / Aktiviteter med en demo-tråd på Værkstedskalender. Komponenten
ligger i `fleet/Sagsvisning.jsx`, fordi Facility skal bruge nøjagtig den samme.

Ikke bygget: modtagevej, parsing, afsendelse, scanning, Cloud Functions.
`sager/` findes ikke i `firebase.rules.json`, og derfor står `sag.laes`,
`sag.sensitiveLaes`, `sag.skriv`, `sag.karantaeneFrigiv` og
`sag.aftaleBekraeft` heller ikke i `permissions.js`. Tilføj dem i samme
ombæring som reglerne og deres tests — ikke før.

`test/sager.test.mjs` kører politikken frem for at læse den. De 39 tests fandt
straks en fejl: mønstret var versalfølsomt, så et håndtastet
`flt-2026-00381` ikke ville være blevet genkendt.

### Næste skridt, i den rækkefølge

1. **Trin 3 af beslutning 18 — længdeintervaller i `satsPaa()`.** Det eneste
   udestående af personale/flåde-arbejdet. Uden det er `laengdeMm` et felt
   ingen læser, og færgetaksten er forkert med over tusind kroner: 10 m koster
   1.338 kr på Rødby–Puttgarden, 18 m koster 2.530 kr.
2. **Modulabonnement.** Uafklaret: skal reglerne håndhæve abonnementet, eller
   er det kun navigation? En kommerciel grænse og en sikkerhedsgrænse giver
   meget forskellige regelfiler.
3. **Kundeportal.** ⚠ **RTDB kan ikke filtrere en forespørgsel med regler.** En
   kunde kan ikke *liste* sine egne bookinger — `.read` på `bookinger` er alt
   eller intet. Det kræver en indeksnode pr. kunde, og den beslutning skal
   træffes før portalen bygges.
4. **Disponering.** Den lå sidst med vilje: den læser de reservationer som
   fravær og værksted skriver, og bygget først ville den disponere på en
   kalender der ikke vidste noget om syge chauffører eller biler på værksted.
   Nu ved den det, og **den sidste datamodelbeslutning er truffet** —
   se beslutning 21. Skærmen læser **to noder**: `opgaver` med art `vaerksted`
   i dagsvisningen, `etaper` i ugesvisningen.

### Disponering står i fase 0 — de fem tjek kaldes, men blokerer ikke

Skærmen er bygget som **visning**. To faner, to noder: dagsvisningen læser
`opgaver` med art `vaerksted` (timer, 06–18), ugesvisningen læser `etaper`
(døgn, syv dage, ETA over døgngrænser og grænseovergange).

**Det er første gang de fem tjek faktisk kaldes.** De har været bygget og
testet uden at nogen kaldte dem — `kanDisponeres()`, `kraevedeKompetencer()` +
`tjekKompetencer()`, `kanBaere()`, `tjekLedigMod()` og `tjekKoerehviletid()`.
⚠ **Men de blokerer ikke.** At de kaldes betyder at man kan *se* hvad de siger,
ikke at de er håndhævet. Håndhævelsen hører i den Cloud Function der skriver
etapen; ligger den i skærmen, kan en direkte skrivning gå uden om den.

Der er **ingen drag-and-drop og ingen skrivning**. "Træk opgave hertil" er en
attrap der siger hvorfor i sin `title`. Bygger man det interaktive før Cloud
Functions, bygger man det to gange — og anden gang er en migrering af data der
blev skrevet forkert i mellemtiden.

`tjekLedig()` blev splittet for at gøre det muligt: logikken lå inde i en
`async` funktion der krævede en database, så den fjerde af de fem tjek kunne
ikke køre i demo-mode og kunne ikke testes. `tjekLedigMod()` er nu den rene
kerne, `tjekLedig()` henter og delegerer. Samme greb som `gitter.js` og
`demo-kpi.js`.

### Gitterkalenderen er en genbrugskontrakt

`fleet/Gitterkalender.jsx` tegner ressourcer som rækker og tid som kolonner.
**Tre skærme skal bruge den samme:** Værkstedskalender (køretøjer × dage),
Facility → Servicekalender (lokationer × dage) og Disponering (biler × timer,
`enhed: "time"`). Byg ikke et fjerde gitter — to gitre der læser det samme
interval forskelligt, opdages ikke ved at kigge på dem.

Regnestykket ligger i `fleet/gitter.js` uden React, så det kan testes. To ting
der skal blive stående, også når de ser grimme ud:

- **Blokke der rækker ud over vinduet får en pil.** En værkstedsblok på tre
  uger, klippet ved kanten, læses som et kort besøg — og så planlægger nogen
  en tur i en uge hvor bilen står på værksted. Samme fejlklasse som tavs
  afkortning i `useListe`.
- **Overlap i samme række tegnes som konflikt**, ikke stablet i hver sin bane.
  På en eksklusiv ressource er et overlap noget `reserver()` ville afvise.
  Ser det pænt ud, skjuler gitteret en fejl i data.

### Demo-data skal kontrollere sig selv

`demo-personale.js` virkede, fordi den sammenligner sig med `DEMO_KPI` i dev og
siger til, hvis en udløbsdato flyttes så Bemanding ville vise et nøgletal der
modsiger tabellen under det. **Den kontrol hører i hver ny demo-fil**, og den
skal skrives som en **test** og ikke kun som en `console.warn` — ellers fanges
den kun af en udvikler der tilfældigt har konsollen åben, og ikke af
pre-commit-hooken.

Datasættet lå før i `useKpi.js`, som importerer `FleetContext.jsx`. Det gjorde
det uindlæseligt for node, så kontrollen *kunne* ikke være en test. `DEMO_KPI`
ligger derfor nu i `fleet/demo-kpi.js` — rent data, ingen React — og
`useKpi.js` re-eksporterer det, så eksisterende importer er uberørte.

Flådens roster kan **ikke** ramme `kpi/` på samme måde: den er delt på division
(42 aktive i gods, 18 i bus), mens et køretøj ingen division har. Kontrollen er
derfor et **loft** — et udsnit må være mindre end totalen, aldrig større. Det er
beslutning 19's åbne spørgsmål der stikker op gennem demo-data.

## Det tungeste tilbage

**Cloud Functions er den reelle flaskehals.** Ni ting venter på samme
opsætning: bookingtilstandsskift, de tre tjek nedenfor, claim-udstedelse fra
`roller/`, skrivning af auditposter, nummerserier, reservationskonflikter,
KPI-aggregering og retention-sletning. De berørte noder er `.write: false`
indtil da — strengere end den kontrol der skal afløse det, men ikke granulært.

**Disponering dækker to forretninger.** Dagsvisningen er værkstedsopgaver med
varighed i timer; ugesvisningen er langtur med ETA over døgngrænser og
køre-hviletid. Det er ikke to zoomniveauer af samme datamodel — og
**beslutning 21 afgjorde hvordan de deles**: dagsvisningen læser `opgaver` med
art `vaerksted`, ugesvisningen læser `etaper`. Datamodellen er dermed på
plads; skærmen er ikke bygget.

### ⚠ Beslutning 21 rettede en modstrid i dette dokument

**README sagde i lang tid at `opgaver` skulle have en `art`
(`vaerksted` | `langtur`).** Den formulering er ældre end beslutning 16. Da
etaper kom som egen node, blev `langtur` en **dublet**: hvert felt en langtur
har brug for — `fraSted`, `tilSted`, `koeretoejId`, `personId`, `maengde`,
`senestMs`, `forslag[]` — står allerede på etapen, og `matchAabneEtaper()`
søger på **etaper**. To poster for én tildeling er præcis den fejl beslutning
16 lukkede: prototypens DE-QR 777 mod DE-KL 404.

Linjen blev båret videre uden at blive genlæst. **Beslutning 16 vandt**, og
arten er `vaerksted` | `facility`. Det står her, så man kan se at det var en
bevidst rettelse og ikke en drift — og reglerne afviser nu `langtur`, med en
test der fastholder det.

### Tre tjek der er bygget, men som intet kalder

Forudsætningerne for Disponering. Funktionerne findes og er testede;
**håndhævelsespunktet mangler**, fordi den Cloud Function der skriver en etape
ikke er skrevet. At en funktion findes er ikke det samme som at den håndhæves.

| Tjek | Funktion |
|---|---|
| Enhedskombination | `kanDisponeres()` — en trailer kan ikke køre alene |
| Kompetencer | `kraevedeKompetencer()` + `tjekKompetencer()` — en udløbet kompetence **blokerer** |
| Kapacitet | `kanBaere()` — m³ og kg hver for sig |

### ⚠ Beslutning 24 rettede beslutning 23

**Beslutning 23 sagde at supportsagen skulle "vise kundens auditlog".** Læst
som skrevet ville det have betydet at support kunne *læse* auditloggen — og
den er selv følsom: `ARKITEKTUR.md` siger udtrykkeligt at en log over hvem der
har set hvad, afslører hvilke kunder der bliver kigget på, og af hvem.

I praksis ville det være **permanent læseadgang til alle tenants' logge**,
altså det stik modsatte af hvad 23 skulle opnå.

**Rettelsen er at det er et udtræk og ikke en adgang.** En Cloud Function
henter posterne for *én bruger* i et fast vindue omkring fejltidspunktet og
skriver dem **på sagen**. Support læser sagen, aldrig `audit/`, og får aldrig
`audit.laes` på en kundes tenant.

| | |
|---|---|
| Vindue | ±5 minutter omkring fejltidspunktet |
| Loft | 50 poster. Rammes det, **siges det** — et udtræk skåret i stilhed læses som hele billedet |
| Konfigurerbart | **Nej.** Ikke af support, ikke på skærmen. Et loft der kan hæves af den der rammer det, er ikke et loft |

Det står her af samme grund som rettelsen under beslutning 21: **en synlig
rettelse er ikke det samme som drift.** Man skal kunne se at nogen tog
stilling, ikke undre sig over hvorfor teksten ikke passer med koden.

### Indeksnoden er også svaret på kundeportalen

README har længe noteret problemet under næste skridt: *"RTDB kan ikke
filtrere en forespørgsel med regler. En kunde kan ikke liste sine egne
bookinger — `.read` på `bookinger` er alt eller intet."*

**Support løser det, og mønstret er portalens svar:**

```
support/sager/<sagId>            i toppen, med et tenantId på posten
tenants/<t>/supportsager/<id>    indeks — kun id'er. Det kunden kan LISTE
```

At læse **én** post er en regel pr. post: `data.child('tenantId').val() ===
auth.token.tenant`. At **liste** kræver `.read` på forælderen — og derfor
findes indeksnoden i kundens egen tenant.

Tenant-isolationen er urørt: en kunde kan stadig ikke læse en anden kundes
sag. Vi kan, men kun med `support.laes`, som ingen kunderolle har.

Skriver man portalen senere, er det den samme figur: **posten i toppen med et
ejerfelt, plus et indeks pr. tenant.** Det er billigt at skrive ned nu og dyrt
at genopdage.

### De fem skærme der venter — og hvad de venter på

**Alle skærme med mockup er bygget**, og de ni uden har fået deres produktvalg
i **beslutning 22**. Fire af dem er dermed bygget eller ude af fase 0:

| Skærm | Status |
|---|---|
| Opsætning → Integrationer | **Bygget.** Kun det der findes — og der findes ingen. Ingen "coming soon" |
| Booking → **Rute & status** | **Bygget.** Ingen GPS: planlagt rute, meldte stop, næste stop, forventede tidspunkter |
| Opsætning → Idébank | **Fjernet fra kundens installation** — rute, skærm, permission og node. Lever videre som selvstændig `idebank.html` hos os. Beslutning 22, udført i beslutning 31 |
| Indkøb → Leverandører | Kartoteket er bygget som del af Indkøb & vareforbrug. Kun performancetallene mangler |

De **fem** der venter, venter nu på at svarene skrives ind i
**[FleetControl-spoergsmaal.md](FleetControl-spoergsmaal.md)** — retningen er
afgjort, detaljerne ikke:

| Skærm | Afgjort i beslutning 22 | Hvad der stadig mangler |
|---|---|---|
| **Økonomi → Fakturagrundlag** | FleetControl laver **ikke** den juridiske faktura. Ingen nummerserie, kreditnotaer, betalingsregistrering eller rykkere. Den producerer et godkendt, **låst** grundlag der eksporteres. Neutral intern model med adaptere: e-conomic, Dinero, Business Central, CSV. `prepared_by` og `approved_by` findes **altid**, også når det er samme person | Feltskemaet i den neutrale model, og hvilken adapter der bygges først |
| **Flåde → Indberetninger** | To slags: **driftshændelser** (reparation, skade, dæk, service, andet) starter et forløb; **udgiftsregistreringer** (tankning, parkering, truckwash, kvittering) gør ikke. En driftshændelse **lukkes ikke** når den bliver et værkstedsbesøg — den er samme sag hele vejen til fakturaen. Skade får modpart, reg.nr., forsikringsselskab, policenr., skadenr. og ansvar | Om skadeforløbet er sin egen tilstandsmaskine |
| **Bemanding → Kompetencer** | **Lovkritiske** (C, CE, D1, D, ADR, tachograf) blokerer hårdt. **Virksomheds- og kundekrav** advarer med override der kræver begrundelse og logges. Chaufføren uploader dokumentation, kontoret godkender. Varsler konfigurerbare, default **90/30/14** dage | **Opdelingen er bygget** — `tjekKompetencer()` returnerer `{ ok, blokerende, advarende }`, og skærmen kalder den med objektformen. `ok` betyder KAN DISPONERES; advarsler gør den ikke falsk. Åbent: et foto af et ADR-kort hører i `sensitive/`, og det kræver en **Storage-bucket, som DEV ikke har** |
| **Indkøb → Leverandører** | **Ingen stjerner.** Objektive tal: leverance til tiden, fakturaafvigelse, gennemsnitlig leveringstid, prisændring 12 mdr., reklamationer, samlet køb. En score må **kun** findes hvis beregningen kan vises. Aftaler og prislister ligger på leverandøren, ét sted | **Afklaret:** fire af de seks kan beregnes af et opslag pr. leverandør — `leverandoerId` er allerede indekseret på `indkoeb` og `fakturaer`. **Svartid** kræver `sager`, som endnu ikke har regler. **Andel af indkøb** kræver en aggregering: nævneren er tenantens samlede indkøb, og summeres den af et hentet vindue, er det en total ud af et udsnit (beslutning 6). ⚠ `beregnNoegletal()` opdager det ikke — får den en liste der kun rummer én leverandør, returnerer den **100 %** med et grundlag der ser tilstrækkeligt ud |
| **Opsætning → Generelt** og **Brugere & roller** | ikke afgjort | Hvad kunden må ændre selv. Og: skal en kunde kunne ændre en rolles indhold? `roller/` er bygget til det — men en vognmand der fjerner `booking.godkend` fra sin egen rolle har lukket sig ude |

**Support hører efter fase 1** — se beslutning 23. Den er ikke en af de ni.

### Noder der er dokumenteret, men mangler regler

Entiteterne er afgjort og har form i `ARKITEKTUR.md` og et demo-sæt, men de
står **ikke** i `firebase.rules.json`. Det er bevidst: reglerne skrives når
skrivning bygges, så de kan testes mod noget der faktisk skriver. Uden en
regel afviser RTDB alt — der er ingen åben dør, kun en manglende.

| Node | Bemærkning |
|---|---|
| `facility/lokationer` | |
| `facility/aktiver` | |
| `facility/zoner` | Bærer grænserne. `facility/sensorer` har regler i forvejen |
| `sager`, `sensitive/sager` | Beslutning 20. Permissions `sag.*` mangler af samme grund |
| `support/sager`, `support/beskeder` | ⚠ I **toppen**, ikke under `tenants/` — som `audit/`, fordi `.read` kaskaderer. Reglen pr. sag sammenligner `tenantId` med claim'et |
| `tenants/<t>/supportsager` | Indeks. Kun id'er |
| `support/countere` | Global counter — sagsnumre er vores, ikke kundens |
| `leverandoerer` | ⚠ `leverandoerId` er **allerede indekseret** på `indkoeb` og `fakturaer` — modellen regnede med noden, længe før den blev skrevet |
| `prislister/<leverandoerId>` | Beslutning 25. Ligger **for sig**, ikke på leverandøren: flere års historik skal ikke hentes med hver oversigt |
| `grundlag` | Beslutning 25. ⚠ Godkendelse, låsning og erstatning skal håndhæves i en Cloud Function — de tre regler i `grundlag.js` er i dag kun visning |
| `sensitive/indberetninger` | Beslutning 25. Skadebeskrivelse, modpart og **underskrift**. Permissionen `indberetninger.sensitiveLaes` mangler af samme grund som `sag.*` |
| `sensitive/indberetninger/<id>/underskrift` | ⚠ Skal have `".write": "!data.exists()"`. Write-once er en **regel**, ikke en konvention — en underskrift der kan redigeres bagefter, beviser ingenting |

Listen står her, så den ikke ligger spredt i tre dokumenter. Tilføjer du en
node, hører den enten i reglerne eller på denne liste.

### ⚠ `ikkeFaktureretOere` betyder noget andet efter beslutning 25

Feltet hed det samme før, men der stod ikke hvad det talte. Nu gør der:
**udført arbejde uden et låst fakturagrundlag.** Ikke "ufaktureret omsætning"
i almindelighed, og ikke summen af åbne bookinger.

Forskellen er ikke akademisk. Et forløb med en åben etape kan ikke godkendes,
og et grundlag der er erstattet, tæller ikke med — begge dele ville pynte på
tallet, hvis det blev regnet på bookinger frem for på grundlag. Aggregeringen
skal bruge `erGaeldende()` og `summer()` fra `grundlag.js`, ikke sin egen
optælling. En kopi uden det filter ser ud som en sum og er en
dobbeltfakturering.

### KPI-aggregeringens efterslæb — beslutning 6

**Reglen: et manglende KPI-tal defineres i `demo-kpi.js` — det hardkodes ikke
i en skærm.**

`demo-kpi.js` *er* formen på `kpi/`-noden. Definerer man feltet der, er
skærmen rigtig med det samme (`k.facility.aabneFejl`), og det eneste der
mangler er aggregeringen. Hardkoder man i stedet `num(24)` i en JSX-fil, har
man to opgaver senere: rette skærmen **og** skrive aggregeringen — og imens
står der et tal ingen kan spore.

Derfor er listen herunder **felter der skal beregnes**, ikke skærme der skal
rettes.

**Venter på aggregeringen.** Felterne er defineret, skærmene læser dem
korrekt, og demo-værdierne er konsistente med de øvrige demo-datasæt:

| Felt | Hvad det skal tælle |
|---|---|
| `bemanding.medarbejdereAktive` | Aktive medarbejdere. Medarbejdere skriver "af N hentede" indtil da — listen er et udsnit |
| `bemanding.fravaerIDag` | Fraværende i dag. Ferie & fravær har ingen KpiRække indtil da |
| `flaade.ikkeLinkedeFakturaer` | Indkøb uden matchet faktura. **Ikke** det samme som `indkoeb.fakturaerTilGodkendelse` — to tilstande, to tal |
| `facility.aabneFejl` | Fejlmeldinger der ikke er udbedret |
| `facility.aktiverPrArt` | Hele aktivbasen fordelt på art. **Summen skal være `facility.aktiver`** — ellers beskriver donutten og nøgletallet over den hver sin base. Selvkontrollen i `demo-facility.js` og `test/facility-drift.test.mjs` holder den |
| `facility.aktiverDeltaPct` | Ændring i aktivbasen mod forrige periode, i procent |
| `facility.servicepunkterDelta`, `.aabneSagerDelta`, `.planlagtVedligeholdDelta` | Periodeafvigelser i antal. De **kræver historik** og kan derfor ikke regnes af de hentede rækker — modsat åbne fejl og nedetid på Flåde, som er afledte og bevidst holdes ude af `kpi/` |
| `facility.klimaalarmerIDag` | Alarmer udløst i døgnet. Kræver historik — modsat *aktive* alarmer, som beregnes |
| `facility.sensorerAktive` | Sensorer der leverer målinger |
| `facility.eksterneLeverandoerer` | Leverandører med aftale |
| `facility.facilityOmkostningOere` | Facility-omkostning i perioden |
| `facility.anslaaetServiceOere` | Estimat på planlagte servicebesøg |
| `kunder.aktiveDeltaPct`, `.daekningsbidragDeltaPct` | Periodeafvigelser i **procent**. ⚠ Ikke det samme som dækningsgradens afvigelse mod **målet**, som er procentpoint og står under `oekonomi` — samme ord, to regnestykker, og de kan pege hver sin vej |
| `oekonomi.driftsomkostningerDeltaPct`, `.ikkeFaktureretDeltaPct` | Periodeafvigelser i **procent**. ⚠ Ikke budgetafvigelsen — den udledes af `driftsomkostningerOere − budgetOere` og må aldrig gemmes |
| `oekonomi.daekningsgradDeltaPoint` | ⚠ **Procentpoint** mod forrige periode. 68 % der bliver til 72 % er +4 point |
| `indkoeb.varerTilGodkendelse` | Varelinjer der afventer godkendelse |
| `indkoeb.aabneOrdrerDeltaPct`, `.fakturaerTilGodkendelseDeltaPct` | Periodeafvigelser i **procent** |
| `indkoeb.prisafvigelserDelta` | Nye prisafvigelser i **antal** |
| `indkoeb.leveranceTilTidenDeltaPoint` | ⚠ **Procentpoint**, ikke procent. 92 % der bliver til 97 % er +5 point. Feltnavnet siger hvilket — blandes de to, er tallet rigtigt på den ene læsning og forkert på den anden, og ingen kan se hvilken |
| `indkoeb.manglerFaktura` | Indkøb uden modtaget faktura |
| `opgaver.udenTidsregistrering` | Udførte opgaver uden registreret faktisk tid. Kan ikke faktureres på tid |
| `afvigelser` | **Top 5 på tværs af flåde, facility, indkøb og værksted.** Dashboards "Største afvigelser". Kan ikke udledes lokalt — den blander fire moduler |
| `flaade.braendstofOere` | Brændstofudgift i perioden. **Beslutning 25** — Indberetninger læser den. ⚠ AdBlue tæller ikke med: det er et additiv, ikke brændstof, og lagt til ville forbruget se ~5 % bedre ud end det er |
| `indkoeb.godkendtDenneMaaned` | Godkendte fakturaer i måneden |
| `indkoeb.maanedensForbrugOere` | Vareforbrug i perioden, ekskl. moms |
| `oekonomi.driftstimer` | Driftstimer i perioden. Nævner i omkostning pr. driftstime |
| `opgaver.udfoerteOpgaver` | Udførte opgaver i perioden. Nævner i omkostning pr. opgave |

**Skal UD af aggregeringen.** Et afledt tal der er gemt, driver fra sit
grundlag:

| Felt | Hvorfor |
|---|---|
| `bemanding.ledig` | Kan beregnes af planlagt − disponeret. Beregnes hos forbrugeren |

Og tre tal er **bevidst holdt ude** af `kpi/`, fordi de er afledte:
klimaalarmer *nu* (måling + zonens grænse), gennemsnitstemperatur (regnes af
sensorlisten) og bygningsomkostningen (summen af sine komponenter). Gemte man
dem, kunne de modsige de data de beskriver — og det var netop de tre fejl
Facility-mockupsene havde.

### En opgave har ingen kunde — værkstedet servicerer egen flåde

Booking-mockuppen viste `Kunde` og `Fakturerbar: Ja` på hver værkstedsopgave.
**Det er afgjort: værkstedet servicerer kun egen flåde**, og begge felter er
derfor forkerte — ikke bare unødvendige.

En kunde på en opgave ville betyde at arbejdet kunne faktureres videre, og et
beløb der ser ud som en indtægt bliver læst som en indtægt. `beloebOere` på en
opgave er en **omkostning**. Det er samme skel som beslutning 11: to tal der
begge hedder "beløb" ender med at blive lagt sammen.

Det der faktureres, er **bookinger** — transportarbejde med egen omsætning, i
fanen ved siden af. `opgaver.klarTilFakturering` tæller derfor afsluttede
**forløb**, ikke opgaver; se rækkerne i Økonomi, som er BKG-numre.

Selvkontrollen i `demo-opgaver.js` advarer, hvis `kundeId` eller `fakturerbar`
dukker op igen. Kommer de tilbage, skal det være en bevidst modelændring.

## Uafklaret — blokerer fase 2

Fase 0 er visning. Fase 1 er skrivning bag Cloud Functions. **Fase 2 er det
der forlader systemet:** eksport til regnskabet, sletning efter retention,
mails ud af huset. Listen her er kort med vilje — det er de spørgsmål der
skal have et *menneskeligt* svar, ikke et teknisk, og de kan ikke besvares af
den der skriver koden.

| Spørgsmål | Hvem svarer | Hvad det blokerer |
|---|---|---|
| **Momssatserne pr. linjeart** — hvornår er det 25 %, hvornår 0, hvornår omvendt betalingspligt? | En bogholder, **før første eksport** | Eksport af fakturagrundlag. `grundlag.js` nægter i dag eksport uden en sats pr. linje, og det er det rigtige svar så længe reglen er ukendt — men det betyder også at ingen kan eksportere |
| **Retention på `sensitive/indberetninger`** — hvor længe skal en underskrift og en skadebeskrivelse gemmes? | Jurist eller DPO | Sletning. Underskriften er både en personoplysning og et **bevis**, og de to trækker i hver sin retning: databeskyttelsen siger slet, bevisbyrden siger gem. Forældelsesfristen på et erstatningskrav er formentlig det rigtige anker, men det er ikke et gæt vi skal tage |
| **Audit-retention** | Samme | Sletning af `audit/`. Se BESLUTNINGER — den har været uafklaret siden sikkerhedsarbejdet og er ikke blevet mere afklaret af beslutning 25 |
| **Fire-øjne på fakturagrundlag** — skal godkenderen være en anden end den der udarbejdede det? | Kunden | Ingenting endnu, men det ændrer `kanGodkende()`. Det er rigtigt i en stor virksomhed og forkert hos en vognmand med to på kontoret, hvor det ville betyde at grundlag aldrig blev godkendt. Hører som en indstilling pr. tenant — ikke som en regel vi vælger for dem |

⚠ **Ingen af de fire må besvares ved at gætte i koden.** Det er hele pointen
med at `grundlag.js` kaster frem for at sætte 25 %: et system der gætter
rigtigt ni gange ud af ti, lærer brugeren at stole på det tiende gæt.

## Låst rækkefølge

Sikkerhedsarbejdet er prioriteret én gang, og rækkefølgen ligger fast. Hvert
punkt gør det næste billigere; springer man frem, bygger man ovenpå noget der
endnu ikke holder. **Alle syv er lukket.**

| # | Punkt | Definition of done |
|---|---|---|
| 0 | `.validate` for beslutning 15 | Reglerne afprøvet i emulatoren — accept og afvisning demonstreret, ikke kun læst igennem |
| 1 | **Tenant-isolationstest** | Automatisk og permanent. Køres ved **hver** ændring i `firebase.rules.json` |
| 2 | DEV og PROD som to Firebase-projekter | Adskilte projekter, og Storage-regionen verificeret |
| 3 | **Permissions som liste frem for rolle-streng** | Håndhævet i `firebase.rules.json`, **ikke kun i frontend**. Testen skal vise at *serveren* afviser |
| 4 | Central audit-service | Append-only. En bruger med alle permissions kan hverken skrive, ændre eller slette en post |
| 5 | `securityLevel` som valideret enum | En liste kan vise en hængelås uden at hente noget klassificeret |
| 6 | Sensitive felter i separat RTDB-node | `booking.laes` alene giver hverken `sensitive/` eller `vaerdi/` |

Punkt 3 er værd at læse to gange. **En permission der kun findes i frontend, er
ikke adgangskontrol — det er en pæn knap.** Definition of done er en afvisning
fra serveren.

Tre forbehold hører til her, og de er skrevet ud i
**[BESLUTNINGER.md](BESLUTNINGER.md)** frem for at blive opdaget:
**læsningslogningen er klientside** (udløseren ligger i `useListe()`, så en
klient der ikke kalder, logger ikke), **audit-retention er ikke afgjort**
(24 mdr. er foreløbigt og skal afgøres juridisk før første betalende kunde),
og **fem af seks `restricted`-kontakter kan ikke håndhæves endnu**.

**Reglerne er deployet til DEV, ikke til PROD.** En samlet deploy til
produktion hører sammen med den første rigtige tenant-provisionering.
