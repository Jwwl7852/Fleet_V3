# Veyro Version 1 — fælles arbejdsbaggrund

Dato: 22. september 2026

## Designværdi

- Reference: den beregnede baggrund bag `FLEET / Arbejdskø`.
- Beregnet reference før ændringen: `rgb(233, 236, 239)`.
- Fælles værdi: `#e9ecef`.
- Token: `--veyro-v1-workspace-background`.
- Kompatibilitet: `--veyro-workspace-surface` peger på det nye token.

## Browserkontrol

Følgende aktive ruter blev åbnet og kontrolleret i den lokale V1-app på
`http://127.0.0.1:5197`:

| Modul | Rute | 1440×900 | 1280×800 | 390×844 |
| --- | --- | --- | --- | --- |
| FLEET | `/fleet-v2/arbejdsko` og `/fleet-v2/indberetninger` | Godkendt | Godkendt | Godkendt |
| FACILITY | `/facility-v2/indberetninger` | Godkendt | Godkendt | Godkendt |
| PLANNING | `/planning-v2` | Godkendt | Godkendt | Godkendt |
| PROCURE | `/indkoeb/bestillinger` | Godkendt | Godkendt | Godkendt |
| WAREHOUSE | `/warehouse` | Godkendt | Godkendt | Godkendt |
| WORKFORCE | `/workforce-v2` | Godkendt | Godkendt | Godkendt |
| UNITBOOKING | `/unitbooking` | Godkendt | Godkendt | Godkendt |
| Fakturacenter | `/oekonomi/fakturacenter` | Godkendt | Godkendt | Godkendt |
| Ressourcer | `/ressourcer/enheder` | Godkendt | Godkendt | Godkendt |
| Opsætning | `/opsaetning` | Godkendt | Godkendt | Godkendt |

På alle ruter var `.fc-app`, `.fc-main`, `.fc-sidehoved`, `.fc-slot` og
`.fc-workspace-zoom` beregnet til `rgb(233, 236, 239)`. Planning-layoutets
indlejrede `.pr-platform`, `main` og `.pr-page` blev kontrolleret særskilt med
samme resultat. `document.body.scrollWidth` oversteg ikke viewportens bredde i
nogen af kontrollerne.

## Visuel kontrol

Der blev optaget screenshots i browserkontrollen af:

- FLEET / Arbejdskø ved 1440×900, 1280×800 og 390×844.
- FLEET / Indberetninger ved 1440×900 og 390×844.
- FACILITY / Indberetninger ved 1440×900.
- PLANNING / Dagens drift ved 1280×800.
- PROCURE / Bestillinger ved 1440×900.
- WAREHOUSE / Overblik ved 1280×800.

De viste screenshots bekræfter, at topbjælken fortsat er mørkeblå, at kort og
paneler er hvide og afrundede, at statusfarver er bevaret, og at den fælles
grå arbejdsflade fortsætter mellem paneler og til vinduets bund.

## Automatiske kontroller

- `npm run lint`: bestået.
- `npm run test:design`: 11/11 bestået.
- `npm run build`: bestået. Vite rapporterede kun den eksisterende advarsel om
  store chunks.

## Afgrænsning

Reglerne er scoped til `.fc-app` og ændrer derfor ikke login eller selvstændige
Design V2-flader. Kortgrundlag, diagrammer og dialogoverlays er ikke overskrevet.
