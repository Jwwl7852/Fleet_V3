# Kontekst til Claude Code

FleetControl 3.0 — multi-tenant TMS for danske vognmænd. React + Vite +
React Router, Firebase Realtime Database (compat SDK), Netlify. Dansk UI,
danske variabelnavne i domænelogikken.

## Arbejdsregel

**Analyse før kode.** Læs `README.md` og `ARKITEKTUR.md` først. Foreslå en plan
og få den godkendt, før du skriver. Der er **21 trufne beslutninger** — kort
form i README, begrundelserne i `BESLUTNINGER.md`. Brud på dem skal være
bevidste, ikke tilfældige, og begrundelsen er det eneste sted der står hvad
der gik galt uden beslutningen. Læs den relevante række, før du bryder noget.

Rækkefølgen for sikkerhedsarbejdet er også låst — se **Låst rækkefølge** i
README. Tag punkterne i orden, og spring ikke frem.

**Enhver ændring i `firebase.rules.json` kræver at `npm run test:rules` kører
grønt, før der committes.** Ingen undtagelser, heller ikke for en kommentar —
det var netop en kommentar der gjorde reglerne ugyldige fra fundamentet, og
fejlen overlevede i månedsvis, fordi ingen kørte dem. `npm test` kører samme
suite. Hooken i `.githooks/pre-commit` fanger det automatisk, hvis
`core.hooksPath` er sat.

## Det du ikke må gøre

- Kalde `firebase.initializeApp()` i et modul. Importér `db` fra `src/firebase.js`.
- Lave en sidebar, tenant-vælger eller periodevælger i et modul. Shellen ejer dem.
- Beregne nøgletal ud af rådata i et modul. Brug `useKpi()`.
- Skrive en afvigelse som streng. Brug `deviation()` fra `format.js`.
- Gemme beløb som float eller kroner. Øre som integer, ekskl. moms.
- Overskrive en sats. Ny post med `gyldigFra`.
- Skrive en reservation direkte. Brug `reservations.js`.
- Skifte bookingtilstand uden `kanSkifte()`.
- Definere egne farver. Brug tokens i `fleet.css`.
- Bruge `on()` hvor `once()` rækker.
- Hardslette regnskabsdata.
- Lægge division i stien. Det er et felt: `gods` | `bus` | `faelles`.
- **Bruge `uid` og `personId` i flæng.** `uid` er hvem der *gjorde* noget:
  `indberetninger.oprettetAf` og auditloggen. `personId` er hvem det *handler
  om*: reservationer, fravær, opgaver, etaper, kompetencer. Bytter du om,
  holder ejerskabstjekket i reglerne op med at virke —
  `data.child('oprettetAf').val() === auth.uid` sammenligner med et uid, og et
  personId matcher aldrig. En chauffør har måske slet intet login.
- Tilføje en `audit.skriv`-permission, eller flytte `audit/` ind under
  `tenants/`. Loggen er append-only og har sin egen læseregel — begge dele
  ville ophæve det. Skal du logge, så kald `audit.log()`.
- Skrive fritekst i en auditpost. Kun felter på allowlisten i
  `audit-regler.js` må få deres værdi med.
- **Røre `firebase.rules.json` uden at køre `npm run test:rules` bagefter.**
  Ingen undtagelser, heller ikke for en kommentar. Reglerne var ugyldige fra
  fundamentet og kunne slet ikke indlæses — det overlevede gennemlæsning og
  flere redigeringer, og blev først fundet da de blev kørt.
- **Give en langtur en plads i `opgaver`.** En langtur *er* en etape — alle
  dens felter står allerede der, og `matchAabneEtaper()` søger på `etaper`.
  To poster for én tildeling er prototypens DE-QR 777 mod DE-KL 404, som
  beslutning 16 lukkede. Reglerne afviser `art: "langtur"`.
- **Fjerne forbeholdet fra `tjekKoerehviletid()`.** Svaret bærer altid
  `forbehold`, også når `ok` er true, fordi vi kun kan se planen og ikke
  tachografen. Et grønt flueben ved siden af en bøde er værre end ingen
  kontrol. Forudsætningen for at fjerne det er tachografdata — se ARKITEKTUR.
- **Lade et af de fem disponeringstjek blokere i skærmen.** De kaldes nu i
  Disponering, men til VISNING. Håndhævelsen hører i den Cloud Function der
  skriver etapen — ligger den i skærmen, kan en direkte skrivning gå uden om
  den, og så er tjekket dekoration.
- **Bygge drag-and-drop i Disponering før Cloud Functions.** En reservation
  skal skrives atomisk sammen med etapens `koeretoejId`, og to disponenter kan
  ramme samme sekund. Bygger du det interaktive nu, bygger du det to gange.
- **Bygge et kalendergitter til.** `fleet/Gitterkalender.jsx` tegner
  ressourcer × tid og bruges af Værkstedskalender, Servicekalender og
  Disponering. Regnestykket ligger i `gitter.js`. To gitre der læser det samme
  interval forskelligt, opdages ikke ved at kigge på dem.
- **Bygge en fakturagodkendelse uden for Indkøb.** Værkstedskalender
  registrerer et **indkøb** i kontekst; godkendelse og afstemning sker ét sted:
  Indkøb → Fakturaer. `fakturaer/` er i øvrigt `.write: false`. To
  godkendelsesflows er beslutning 12 om igen.
- **Skrive divisionsfilteret igen.** Det står i `useListe` — og reglen er
  ikke bare "valgt division plus fælles": en post **uden** division vises i
  **begge**, ikke i ingen. Bookingopsætning havde sin egen kopi uden det led,
  og fejlen var usynlig indtil beslutning 19 fjernede feltet fra bilerne —
  så ville biltabellen stå tom i både Gods og Bus, uden at nogen havde
  slettet en bil. Samme regel to steder, hvor den ene kopi driver.
- **Læse et sagsnummer ud af brødteksten i en mail.** Kun emnefeltet — en
  brødtekst bærer citerede tidligere mails med andre sagsnumre, og så kan en
  fremmed videresende en gammel tråd og lande på en sag han intet har med at
  gøre. `sagsnummerFraEmne()` i `sager.js`.
- **Vise en karantæneret besked i tråden.** Ikke gråtonet, ikke sammenklappet.
  Renderes den inline, læser mennesket den og handler på den — samme regel som
  at en udløbet kompetence blokerer frem for at advare.
- Tilføje `emne` til `LOGBARE_FELTER`. Det er fritekst fra internettet, og
  allowlisten findes for at holde fritekst ude af auditloggen.
- Give en mail-aftale sin egen `kilde.type` i reservationsnoden. Det man
  reserverer, er et **værkstedsbesøg** — `kilde.type: vaerksted`, prioritet 40.
  Ellers taber en bekræftet værkstedsaftale til en booking. Sporet er
  `kilde.viaSagId`.
- **Basere adgangskontrol på rollen, hvis det egentlig er en permission.**
  Spørg hvad handlingen kræver, ikke hvem brugeren er. Og håndhæv det i
  `firebase.rules.json` — en kontrol der kun findes i frontend, er ikke
  adgangskontrol, men en pæn knap.

## Sikkerhedsregler

```bash
npm run test:rules     # starter emulatoren, kører suiten, lukker den ned
```

Obligatorisk ved hver ændring i `firebase.rules.json`. Suiten dækker sig selv
ind: nodelisten i `test/rules.tenant.test.mjs` læses ud af regelfilen, så en ny
node med en for løs regel fejler uden at nogen har husket at skrive et
testtilfælde. Tilføjer du en ny node, skal du derfor forvente at suiten siger
noget om den.

Testene skal også kunne fejle. Vil du efterprøve det, så løsn `.read` på
`tenants/$tenantId` til `auth != null` og kør igen — fem tests skal falde.

## Når du bygger et modul

`src/moduler/Dashboard.jsx` er referencen. Kopiér mønsteret derfra:
`useKpi()` → `Henter`/`Fejl` → `KpiRaekke` med `KpiKort` → `Kort` med `Tabel`.

Hver skeletfil har en kommentar i toppen med hvad der skal bygges og hvilke
fejl fra mockuppen der skal undgås. Læs den før du rører filen.

## Tilføj en rute

Kun i `src/fleet/nav.js` og `src/App.jsx`. Sidebaren genereres fra nav.js, så de
kan ikke komme ud af sync.

## Kendte huller

- Cloud Functions mangler: reservationskonflikter, bookingtilstandsskift med
  rolletjek, nummerserier. Rules er `.write: false` på de noder.
- **Disponerings datamodel er på plads** (beslutning 21). `opgaver.art` er
  `vaerksted` | `facility` — **ikke** `langtur`. Skærmen læser to noder:
  `opgaver` med art `vaerksted` i dagsvisningen, `etaper` i ugesvisningen.
  Selve skærmen er ikke bygget.
- **Disponering har tre forudsætninger** — se ARKITEKTUR. `kanDisponeres()`,
  `kraevedeKompetencer()` + `tjekKompetencer()` og `kanBaere()` er bygget og
  testet, men **intet kalder dem**. De hører i den Cloud Function der skriver
  etapen, ikke i skærmen: ligger de i skærmen, omgår en direkte skrivning dem.
  En udløbet kompetence skal **blokere**, ikke advare.
- **Disponering skal bygges med etapemodellen i tankerne** (beslutning 16).
  Det man disponerer, er en *etape* — ikke en booking. Etaper ligger i
  `etaper/<etapeId>`, har deres egen tilstand, og `aaben` betyder at etapen
  venter på en passende tur. Skærmen skal kunne vise åbne etaper ved siden af
  planlagte, og den skal læse to noder: `etaper` og `opgaver`. Bygger du den
  med én booking = én tur, er det en migrering bagefter.
- **Sagsbaseret mail (beslutning 20) er fase 0 — kun visning.** Modtagevej,
  parsing, afsendelse og scanning mangler. `sager/` findes ikke i
  `firebase.rules.json`, og derfor står `sag.laes`, `sag.sensitiveLaes`,
  `sag.skriv`, `sag.karantaeneFrigiv` og `sag.aftaleBekraeft` heller ikke i
  `permissions.js`. Tilføj dem i samme ombæring som reglerne og deres tests —
  ikke før.
- 9 skærme har ingen mockup. Byg dem ikke på gæt — spørg.
