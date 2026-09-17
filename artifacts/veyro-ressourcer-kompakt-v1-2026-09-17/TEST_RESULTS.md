# Testresultater

Produktcommit: `f93e0f1fe62f63de6723a242c7f58d8e3d4d03ca`

| Kontrol | Resultat |
| --- | --- |
| Relevante Node-tests: design tokens, moduloverblik, ressourcestruktur, UNITBOOKING, tom KPI og emulator-seed | 214/214 bestået, 46 suites |
| Root lint | Bestået |
| FLEET lint | Bestået |
| FACILITY lint | Bestået |
| Root produktionsbuild | Bestået, 777 moduler |
| FLEET produktionsbuild | Bestået, 195 moduler |
| FACILITY produktionsbuild | Bestået, 102 moduler |
| Whitespace (`git diff --check`) | Bestået; kun LF/CRLF-normaliseringsadvarsler |
| Integreret responsive browsermatrix | 24/24 uden dokumentoverflow |
| Moduloverblik-smoke | 6/6 rendret uden dokumentoverflow |

Buildkommandoerne ramte først `esbuild spawn EPERM` i den begrænsede proceskontekst. Uændrede builds bestod i den tilladte lokale proceskontekst. Der blev ikke ændret globale Java-, Windows- eller sikkerhedsindstillinger.

Der er ingen backend-, Functions- eller rules-ændringer i produktcommit. Derfor blev sikkerhedsgaten ikke genkørt som del af denne rent visuelle/strukturelle opgave.
