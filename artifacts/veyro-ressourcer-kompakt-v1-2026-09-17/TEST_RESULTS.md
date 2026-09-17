# Testresultater

Testgrundlag: `4fcd7989e64ffaf1ee006ac4c645f42537c3ec1a`

| Kontrol | Resultat |
| --- | --- |
| Relevante Node-tests: design tokens, moduloverblik, ressourcestruktur, UNITBOOKING, tom KPI og emulator-seed | 215/215 bestået, 46 suites |
| Afgrænset seed-/Procure-kontrol | 31/31 bestået |
| Root lint | Bestået |
| FLEET lint | Bestået |
| FACILITY lint | Bestået |
| Root produktionsbuild | Bestået, 777 moduler |
| FLEET produktionsbuild | Bestået, 195 moduler |
| FACILITY produktionsbuild | Bestået, 102 moduler |
| Whitespace (`git diff --check`) | Bestået; kun LF/CRLF-normaliseringsadvarsler |
| Integreret responsive browsermatrix | 24/24 uden dokumentoverflow |
| Moduloverblik-smoke | 6/6 rendret uden dokumentoverflow |
| Varekatalog-fixture | 12 varer, 3 leverandører, 8 kategorier og 9 enhedsværdier valideret |
| Varekatalog-browserhandlinger | Søgning, kategori, leverandør, faner, rækkeåbning og Tilføj bestået |

Buildkommandoerne ramte først `esbuild spawn EPERM` i den begrænsede proceskontekst. Uændrede builds bestod i den tilladte lokale proceskontekst. Der blev ikke ændret globale Java-, Windows- eller sikkerhedsindstillinger.

Der er ingen backend-, Functions- eller rules-ændringer i produktcommit. Derfor blev sikkerhedsgaten ikke genkørt som del af denne rent visuelle/strukturelle opgave.

Suppleringen ændrer kun isoleret emulatorseed, captureværktøj og reviewbevis. Produktbuilds fra layoutcommit `f93e0f1fe62f63de6723a242c7f58d8e3d4d03ca` er fortsat det relevante buildgrundlag.
