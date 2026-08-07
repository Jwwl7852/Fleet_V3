# Kontekst til Claude Code

FleetControl 3.0 — multi-tenant TMS for danske vognmænd. React + Vite +
React Router, Firebase Realtime Database (compat SDK), Netlify. Dansk UI,
danske variabelnavne i domænelogikken.

## Arbejdsregel

**Analyse før kode.** Læs `README.md` og `ARKITEKTUR.md` først. Foreslå en plan
og få den godkendt, før du skriver. Der er 15 trufne beslutninger i README —
brud på dem skal være bevidste, ikke tilfældige.

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
- Tilføje en `audit.skriv`-permission, eller flytte `audit/` ind under
  `tenants/`. Loggen er append-only og har sin egen læseregel — begge dele
  ville ophæve det. Skal du logge, så kald `audit.log()`.
- Skrive fritekst i en auditpost. Kun felter på allowlisten i
  `audit-regler.js` må få deres værdi med.
- **Røre `firebase.rules.json` uden at køre `npm run test:rules` bagefter.**
  Ingen undtagelser, heller ikke for en kommentar. Reglerne var ugyldige fra
  fundamentet og kunne slet ikke indlæses — det overlevede gennemlæsning og
  flere redigeringer, og blev først fundet da de blev kørt.
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
- Disponering skal have `art` (vaerksted|langtur) på opgaver, før skærmen bygges.
- **Disponering skal bygges med etapemodellen i tankerne** (beslutning 16).
  Det man disponerer, er en *etape* — ikke en booking. Etaper ligger i
  `etaper/<etapeId>`, har deres egen tilstand, og `aaben` betyder at etapen
  venter på en passende tur. Skærmen skal kunne vise åbne etaper ved siden af
  planlagte, og den skal læse to noder: `etaper` og `opgaver`. Bygger du den
  med én booking = én tur, er det en migrering bagefter.
- 9 skærme har ingen mockup. Byg dem ikke på gæt — spørg.
