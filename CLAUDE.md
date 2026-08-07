# Kontekst til Claude Code

FleetControl 3.0 — multi-tenant TMS for danske vognmænd. React + Vite +
React Router, Firebase Realtime Database (compat SDK), Netlify. Dansk UI,
danske variabelnavne i domænelogikken.

## Arbejdsregel

**Analyse før kode.** Læs `README.md` og `ARKITEKTUR.md` først. Foreslå en plan
og få den godkendt, før du skriver. Der er 13 trufne beslutninger i README —
brud på dem skal være bevidste, ikke tilfældige.

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
- 9 skærme har ingen mockup. Byg dem ikke på gæt — spørg.
