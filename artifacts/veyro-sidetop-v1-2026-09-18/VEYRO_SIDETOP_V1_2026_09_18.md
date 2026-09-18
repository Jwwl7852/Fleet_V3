# VEYRO Version 1 – fælles sidetop

Dato: 18.09.2026  
Branch: `codex/veyro-integration-v1`  
Miljø: lokal Firebase-emulator med syntetiske tenantdata; ingen deployment eller produktionsdata.

## Resultat

- AppShell ejer nu én kompakt sidetitel på alle Version 1-ruter.
- Titlen står på samme vandrette midterlinje som logoet; desktopmålingen er ens på alle 80 ruter (`-7,3 px` relativt til hele logobilledets geometriske centrum).
- Sidens eksisterende primære handling flyttes visuelt til højre på samme linje, når siden har en handling.
- Lokale titelkopier og den særskilte zoom-/nulstillingsbjælke er fjernet.
- Zoom og **Nulstil visning** ligger i **Visning** ved brugerprofilen. Den eksisterende lagring pr. bruger, tenant og side er bevaret.
- Visning er tilgængelig med udfoldet navigation, sammenklappet navigation og mobilnavigation.
- Mobilen viser først navigation/Visning og derefter én sidetitel; titel og handling ombrydes uden overlap.
- Fakturacenterets tidligere route-specifikke regel, der skjulte AppShell-toppen, er fjernet.
- Adgangsafvisninger bruger underoverskrift, så AppShell-titlen fortsat er sidens eneste `h1`.
- Design V2 er ikke ændret.

## Browserdækning

Auditten gennemgik alle 80 synlige Version 1-ruter fra navigationskataloget ved både 1440×900 og 390×844, 100 % zoom. Det gav 160 sammenlignelige screenshots.

| Område | Ruter | Status |
| --- | ---: | --- |
| Dashboard | 1 | Kontrolleret |
| Ressourcer | 7 | Kontrolleret, inkl. alle syv detaljevisninger |
| Opsætning | 5 | 4 kontrolleret; Brugere viste forventet adgangsafvisning |
| FLEET | 12 | Kontrolleret, inkl. Arbejdskø-detalje og opret-dialog |
| FACILITY | 11 | 10 kontrolleret; Mobil indberetning viste forventet adgangsafvisning |
| PLANNING | 8 | Kun fælles shell/sidetop kontrolleret; indholdet var adgangsafvist for den normale emulatorbruger |
| PROCURE | 7 | Kontrolleret; bestillingsdetalje ikke åbnet, fordi listen var tom |
| WAREHOUSE | 13 | Kontrolleret, inkl. vareoprettelse |
| WORKFORCE | 6 | Kontrolleret |
| UNITBOOKING | 6 | Kontrolleret |
| Fakturacenter | 1 | Kontrolleret |
| Kunder | 1 | Liste kontrolleret; detalje ikke åbnet, fordi listen var tom |
| Leverandører | 1 | Kontrolleret, inkl. detaljevisning |
| Hjælp | 1 | Kontrolleret |

Adgangsafvisningerne er beholdt og dokumenteret; der er ikke tilføjet demo-fallback eller svækket adgangskontrol.

## Målte resultater

- 160/160 captures gennemført.
- 0 browserfejl.
- 0 sider med mere eller mindre end én synlig `h1`.
- 0 fastlåste indlæsningstilstande efter den udvidede ventetid.
- 0 helsides vandret overflow.
- 0 sider uden den nye Visning-kontrol.
- 80/80 desktopruter med samme målte titel/logo-centerforskel.
- 15/15 tilgængelige interaktionsscenarier bestået.
- 2 valgfrie detaljescenarier kunne ikke køres på grund af tomme syntetiske lister: PROCURE-bestilling og Kunde.

Maskinlæsbar browserrapport: `visual-audit.json`.

## Screenshots

Hele rutegennemgangen ligger i `screenshots/` med desktop- og mobilbillede pr. rute. De vigtigste tværgående beviser er:

- `sidebar/menu-udfoldet-1440x900.png`
- `sidebar/menu-sammenklappet-1440x900.png`
- `sidebar/visning-udfoldet-1440x900.png`
- `sidebar/visning-sammenklappet-1440x900.png`
- `sidebar/visning-mobil-390x844.png`
- `screenshots/06-ressourcevarekatalog-1440x900.png`
- `screenshots/06-ressourcevarekatalog-390x844.png`
- `screenshots/10-fakturacenter-1440x900.png`
- `screenshots/20-fleetv2overblik-1440x900.png`
- `screenshots/35-facilityv2arbejdsko-1440x900.png`

Detalje- og dialogbeviser ligger i `interactions/`.

## Kontroller

- `npm run lint`: bestået.
- Relevante Node-integrationstests: 105/105 bestået.
- `npm run build`: bestået med Vites eksisterende chunk-size-advarsel.
- Browseraudit: 80 ruter, 160 captures, 0 fejl.

## Rester

- PLANNING-indholdet, FACILITY Mobil indberetning og Opsætning → Brugere kan ikke markeres som indholdskontrolleret med den aktuelle normale emulatorbruger, fordi adgangsreglerne afviser ruterne.
- PROCURE-bestillingsdetaljen og kundedetaljen mangler interaktionsbevis, fordi de aktuelle syntetiske lister er tomme.
- Vites kendte chunk-size-advarsel er ikke en del af denne visuelle opgave.
