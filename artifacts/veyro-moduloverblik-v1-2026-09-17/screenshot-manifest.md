# Billedmanifest

Alle billeder er originale PNG-filer. Browserzoom og arbejdsområdezoom er 100 %. Der indgår ingen loginoplysninger, browserprofiler eller credentials.

## Aktuelle integrerede beviser

Version: `874e24c9856c5616339be043b8efad4f0e13c35f`. App: samlet Version 1-root-app med én AppShell. Rolle: syntetisk administrator. Tenant: `procure-auth-a`. Datakilde: tenantlagrede syntetiske data i projektet `demo-veyro-integration` via lokale Auth-, Realtime Database- og Functions-emulatorer. Den globale TEST-markering er synlig.

| Fil | Krav/forløb | Route | Viewport | Status |
|---|---|---|---|---|
| `screenshots-authenticated/1440x900-workforce.png` | WORKFORCE-overblik efter normalt login | `/workforce-v2` | 1440×900 | Aktuel |
| `screenshots-authenticated/390x844-workforce.png` | WORKFORCE-overblik efter normalt login | `/workforce-v2` | 390×844 | Aktuel |
| `screenshots-authenticated/1440x900-unitbooking.png` | UNITBOOKING-overblik | `/unitbooking` | 1440×900 | Aktuel |
| `screenshots-authenticated/390x844-unitbooking.png` | UNITBOOKING-overblik | `/unitbooking` | 390×844 | Aktuel |
| `screenshots-authenticated/1440x900-unitbooking-belaegning.png` | Belægningskort og kassekartotek | `/ressourcer/units` | 1440×900 | Aktuel |
| `screenshots-authenticated/390x844-unitbooking-belaegning.png` | Belægningskort og kassekartotek | `/ressourcer/units` | 390×844 | Aktuel |

WORKFORCE-billederne viser KPI'erne 1 på arbejde, 1 på fravær og 7,5 timer til godkendelse samt tenantlagrede rækker. Belægningsbillederne viser 50 %, grundlaget `1 af 2 brugbare · 1 ude af drift` og tre tenantlagrede units.

`screenshots-authenticated/capture-manifest.json` indeholder capturetidspunkt, fuld kodeversion, ruter, viewports og dataklassifikation for disse seks aktuelle billeder.

## Historiske, uændrede modulbeviser

Filerne i `screenshots/` er historiske UI-/kontraktbeviser fra commit `f51173ae4fd75830e3fd68a7aafb9701e7f62fa2`, optaget mod tydeligt mærkede lokale fixtures. De er ikke serverbevis. De øvrige autentificerede FLEET-, FACILITY-, PROCURE- og WAREHOUSE-billeder blev ikke genoptaget, fordi denne fejlretning ikke ændrer disse moduler; de skal derfor læses som historiske.

| Mappe/filer | Rolle | Datakilde | Klassifikation |
|---|---|---|---|
| `screenshots/*.png` | demo-administrator | lokale syntetiske fixtures | Historisk modulbevis |
| `screenshots-authenticated/*-fleet.png` | syntetisk administrator | lokale emulatorer | Historisk integreret bevis |
| `screenshots-authenticated/*-facility.png` | syntetisk administrator | lokale emulatorer | Historisk integreret bevis |
| `screenshots-authenticated/*-procure.png` | syntetisk administrator | lokale emulatorer | Historisk integreret bevis |
| `screenshots-authenticated/*-warehouse.png` | syntetisk administrator | lokale emulatorer | Historisk integreret bevis |
