# FleetControl 3.0

Multi-tenant TMS for danske vognmænd. Én shell, én informationsarkitektur, én
talkilde.

Udgangspunktet var 20 mockups fordelt på tre uforenelige designretninger og en
deployet v1.4. v3.0 samler dem. Alt der stod i konflikt er afgjort — de 21
beslutninger står i **[BESLUTNINGER.md](BESLUTNINGER.md)**, så du kan omgøre
dem enkeltvis i stedet for at skulle finde ud af hvorfor noget ser ud som det
gør.

| Fil | Hvad |
|---|---|
| **README.md** | Hvor projektet står, og hvordan du kommer i gang. Den her. |
| **[BESLUTNINGER.md](BESLUTNINGER.md)** | De 21 beslutninger med begrundelser. Læs den før du bryder med noget |
| **[ARKITEKTUR.md](ARKITEKTUR.md)** | Datamodellen: noder, konventioner, adgang, egress |
| **[CLAUDE.md](CLAUDE.md)** | Arbejdsregler hvis du bruger Claude Code |

## Kom i gang

```bash
npm install
cp .env.example .env.local          # DEV-nøgler. Ikke prod.
git config core.hooksPath .githooks # kører regeltesten før commits der rører reglerne
npm run dev
npm test                            # 406 tests. Starter emulatoren.
```

`core.hooksPath` skal sættes **én gang pr. klon** — hooks følger ikke med i
git. Uden den kan man committe en ændring i `firebase.rules.json` uden at have
kørt testen, og det er præcis sådan reglerne kunne ligge ugyldige fra
fundamentet i månedsvis uden at nogen opdagede det.

**Der er to Firebase-projekter.** `fleetcontrol-dev-1ac1c` er til at smide
væk; `fleetcontrol-98e11` er rigtige kunders data. Som ny udvikler peger du på
**DEV** — det gør `.env.example` allerede.

**Produktionsnøglerne findes kun i Netlify.** Appen udleder miljøet af
projekt-id'et og viser en bjælke i toppen, når du ikke er på produktion.
Havner produktionsnøgler et sted de ikke hører hjemme, bliver bjælken rød og
stribet.

Uden `.env.local` kører appen i demo-mode med datasættene i `fleet/demo-*.js`.
Ingen hvide skærme, ingen crash.

Deploy: Netlify, `npm run build` → `dist`. `netlify.toml` har SPA-fallback —
uden den giver et direkte hit på `/booking/disponering` en 404.

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

## Struktur

```
src/
  App.jsx              alle 27 ruter, genereret efter nav.js
  firebase.js          ÉN initialisering. Moduler importerer db herfra.
  fleet/               kernen — modulerne må ikke duplikere noget herfra
    nav.js             sidebar + ruter, én kilde
    AppShell.jsx       layout: sidebar, topbar, Outlet
    FleetContext.jsx   tenant, periode, Gods/Bus
    useKpi.js          nøgletal fra kpi/. Demo-sættet ligger i demo-kpi.js
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
  moduler/             27 skærme
```

## Status

Opdateret 9. august 2026. **Start her efter en pause.**

**Kernen er på plads.** Sytten byggeklodser i `fleet/` er i brug på tværs af
skærme, og **406 tests** er obligatoriske før commit via `.githooks/pre-commit`.
**Sikkerhedsrækkefølgen punkt 0–6 er lukket** — se Låst rækkefølge nedenfor.

### Skærmene: 16 af 27 har indhold

| | Skærme |
|---|---|
| **Bygget (16)** | Dashboard *(referencemodul — start her når du skriver et nyt)*, Bookingopsætning, Kunder & Priser, Økonomi & Rapporter, Bemanding, Medarbejdere, Flåde, Ferie & fravær, Værkstedskalender, Disponering, Facility ×3, Booking-oversigt, Ny forespørgsel, Forslag |
| **Skelet med mockup (2)** | Indkøb ×2 |
| **Skelet uden mockup (9)** | Live-kort, Kompetencer, Indberetninger, Leverandører, Fakturering, Opsætning ×4 |

Hver skeletfil har en kommentar i toppen med hvad der skal bygges og hvilke
fejl fra mockuppen der skal undgås. **Læs den før du rører filen.** De ni uden
mockup må ikke bygges på gæt — spørg.

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
| `facility.klimaalarmerIDag` | Alarmer udløst i døgnet. Kræver historik — modsat *aktive* alarmer, som beregnes |
| `facility.sensorerAktive` | Sensorer der leverer målinger |
| `facility.eksterneLeverandoerer` | Leverandører med aftale |
| `facility.facilityOmkostningOere` | Facility-omkostning i perioden |
| `facility.anslaaetServiceOere` | Estimat på planlagte servicebesøg |
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
