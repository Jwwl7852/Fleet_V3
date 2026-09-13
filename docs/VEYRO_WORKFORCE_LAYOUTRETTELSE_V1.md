# WORKFORCE integreret layoutrettelse V1

Dato: 13. september 2026

Branch: `codex/veyro-integration-v1`

Start-HEAD: `e4a201a89e66d9df4e241d89232a5f3914babd22`

## Faktisk årsag

WORKFORCEs standalone-app bruger et grid med to kolonner: en intern sidebar på
230 px og et fleksibelt arbejdsområde. I den integrerede variant blev den
interne sidebar korrekt udeladt, men griddefinitionen blev stående. Det eneste
barn, `<main class="wf-main">`, blev derfor placeret i den første tomme
sidebar-kolonne på 230 px, mens den fleksible anden kolonne stod ubrugt.

Målingen i den faktiske åbne integrationsbrowser før rettelsen var:

| Led | Beregnet bredde |
| --- | ---: |
| Fælles `.fc-main` | 1.729 px |
| `.fc-slot` | 1.729 px |
| Zoom-wrapper `.fc-workspace-zoom` | 1.677 px |
| WORKFORCE-rod `.wf-app` | 1.677 px |
| WORKFORCE-grid | `230 px + 1.447 px` |
| WORKFORCE-indhold `.wf-main` | **230 px** |

Fejlen lå således ikke i en gemt zoomværdi, en `max-width` eller manglende
plads i AppShell. Zoom var beregnet til 1, og wrapperne havde den fulde bredde.

## Rettelse

Den allerede eksisterende markør `.wf-app--embedded` har nu en eksplicit
indlejringskontrakt:

- Modulroden udfylder sin container og kan krympe korrekt som flex-/gridbarn.
- Det indlejrede WORKFORCE-grid har én `minmax(0, 1fr)`-kolonne.
- `.wf-main` ligger i hele denne kolonne og har ingen indlejret maksimumsbredde.

Standalone-layoutets interne sidebar og `230 px + fleksibel`-grid er uændret.
AppShellens sidebar, zoom-wrapper, zoomværdier og mobile breakpoints er også
uændrede. Der er ikke tilføjet skjult overflow eller en vilkårlig fast
arbejdsbredde. Den tilsigtede `max-width: 1000px` på "Min arbejdsdag" er
bevaret som læselængde og centreres nu i det fulde arbejdsområde.

## Målinger efter rettelsen

Alle værdier nedenfor er målt i en isoleret headless Edge-profil mod den
faktiske integrerede app på `http://127.0.0.1:5197`. Zoom var 100 %.

| Viewport og menu | Sidebar | AppShell-slot | WORKFORCE-rod/main | Demobesked | Første kort |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1440×900, normal | 216 px | 1.193 px | 1.141 px | 1.057 px | 520 px |
| 1920×1080, normal | 216 px | 1.673 px | 1.621 px | 1.537 px | 760 px |
| 390×844, responsiv menu | 359 px | 359 px | 327 px | 303 px | 303 px |
| 360×800, responsiv menu | 329 px | 329 px | 297 px | 273 px | 273 px |
| 1440×900, kompakt | 72 px | 1.337 px | 1.285 px | 1.201 px | 592 px |
| 1920×1080, kompakt | 72 px | 1.817 px | 1.765 px | 1.681 px | 832 px |

På mobil erstatter AppShellens eksisterende responsive vandrette navigation
desktopmenuen, og den fælles kompaktknap er bevidst skjult ved højst 900 px.
Normal/kompakt blev derfor kontrolleret på begge desktopbredder; alle syv
visninger blev desuden kontrolleret ved begge mobilbredder.

Ingen af de 42 målte sidekombinationer havde vandret dokumentoverflow.
Medarbejder-, kompetence- og plantabeller beholder deres udpegede interne
scrollområder på mobil, så brede datatabeller ikke gør hele siden bredere.

## Gemte visningsvalg og nulstilling

Via de faktiske AppShell-kontroller blev zoom ændret til 110 % og menuen til
kompakt. Efter reload var begge valg bevaret. `Nulstil visning` gendannede
derefter zoom til 100 % og menuen til normal. WORKFORCE blev ved begge tilstande
liggende i hele den tilgængelige zoom-wrapper.

## Visuel kontrol

Den automatiserede kontrol genererede 44 nye screenshots og 42 komplette
DOM-målinger. Alle syv WORKFORCE-visninger blev åbnet ved 1440×900,
1920×1080, 390×844 og 360×800. De syv visninger blev desuden åbnet med
sammenfoldet menu ved begge desktopbredder.

Repræsentative billeder:

- [1440×900 – Overblik](../artifacts/workforce-layout-v1/screenshots/01-1440x900-normal-overblik.png)
- [1440×900 – Medarbejdere](../artifacts/workforce-layout-v1/screenshots/02-1440x900-normal-medarbejdere.png)
- [1440×900 – Bemanding](../artifacts/workforce-layout-v1/screenshots/03-1440x900-normal-bemanding.png)
- [1440×900 – Ferie og fravær](../artifacts/workforce-layout-v1/screenshots/04-1440x900-normal-fravaer.png)
- [1440×900 – Kompetencer](../artifacts/workforce-layout-v1/screenshots/05-1440x900-normal-kompetencer.png)
- [1440×900 – Timer](../artifacts/workforce-layout-v1/screenshots/06-1440x900-normal-timer.png)
- [1440×900 – Min arbejdsdag](../artifacts/workforce-layout-v1/screenshots/07-1440x900-normal-min-arbejdsdag.png)
- [390×844 – Overblik](../artifacts/workforce-layout-v1/screenshots/15-390x844-normal-overblik.png)
- [390×844 – Bemanding](../artifacts/workforce-layout-v1/screenshots/17-390x844-normal-bemanding.png)
- [360×800 – Min arbejdsdag](../artifacts/workforce-layout-v1/screenshots/28-360x800-normal-min-arbejdsdag.png)
- [1440×900 – kompakt menu](../artifacts/workforce-layout-v1/screenshots/29-1440x900-kompakt-overblik.png)
- [1920×1080 – kompakt menu](../artifacts/workforce-layout-v1/screenshots/36-1920x1080-kompakt-overblik.png)
- [Gemte valg: 110 % og kompakt](../artifacts/workforce-layout-v1/screenshots/43-1440x900-gemte-visningsvalg.png)
- [Nulstillet: 100 % og normal](../artifacts/workforce-layout-v1/screenshots/44-1440x900-nulstillet-visning.png)

Det komplette maskinlæsbare bevis ligger i
[`measurements.json`](../artifacts/workforce-layout-v1/measurements.json). Der
blev ikke registreret browserkonsolfejl. De eksisterende React Router
future-flag-advarsler blev gentaget ved navigation/reload, men er ikke nye
layoutfejl.

## Testresultater

- Målrettet WORKFORCE- og platformstest: 73/73 bestået.
- Ny statisk regressionskontrol verificerer embedded-markør, én kolonne og
  fravær af en skjult-overflow-løsning.
- Layout-browsergate: 42/42 sidekombinationer bestået, 44 screenshots.
- Root lint: bestået.
- Produktionsbuild: bestået med Vite 5.4.21 og 732 transformerede moduler.
  Kun den kendte advarsel om den store PROCURE-chunk blev vist.
- Whitespacekontrol: bestået; kun Git-platformens LF/CRLF-advarsler.

## Afgrænsning

Denne rettelse ændrer kun WORKFORCEs indlejrede layout og tilhørende tests og
beviser. Den tidligere dokumenterede Firebase Database Emulator-loopbackfejl
er uændret og er fortsat et separat miljørestpunkt. Ingen backendfallback,
permissions, emulatoropsætning eller produktionsforbindelse er ændret.
