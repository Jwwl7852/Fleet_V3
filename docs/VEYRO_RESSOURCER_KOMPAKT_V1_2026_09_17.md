# VEYRO Ressourcer – kompakt Version 1

Dato: 17. september 2026

## Version og afgrænsning

- Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-integration`
- Branch: `codex/veyro-integration-v1`
- Udgangspunkt: `be2399dcd0dd5d1ecd2b28876222321e4df7236f`
- Produktcommit: `f93e0f1fe62f63de6723a242c7f58d8e3d4d03ca`
- Version: VEYRO Version 1. Design V2 og PLANNING er ikke ændret.
- `AGENTS.md` findes ikke i worktreeet eller de kendte overordnede projektmapper; der var derfor ingen projektlokal AGENTS-instruks at læse.

## Gennemført

De otte Ressourcer-sider bruger nu samme kompakte visuelle struktur: én overskrift, handlinger på samme række, filtre direkte over tabellen og resultattal under tabellen. Overskriften er 20 px på desktop og 18 px på mobil. Kontroller er cirka 36 px, og enkeltlinjerækker cirka 40 px.

Den fælles React-struktur ligger i `src/moduler/RessourceLayout.jsx`, mens fælles, Ressourcer-afgrænset styling ligger i `src/fleet/fleet.css`. Enheder, Ejendomme og Varekatalog har tilsvarende scoped styling i deres eksisterende modul-CSS, så moduloverblik og øvrige skærme ikke påvirkes.

Konkrete ændringer:

- Ressourcer-overblikket viser kun navn, kort brugerbeskrivelse og Åbn for de syv registre.
- "Enhedskartotek" er ændret til "Enheder".
- FACILITY-mærkatet over Ejendomme er fjernet.
- Det generelle unitregister bruger "Units" og "Opret unit". Kassetyper og datamodel er uændret.
- Den store belægningsboks er erstattet af en kompakt metrik i værktøjslinjen; den eksisterende beregning er bevaret.
- Oprettelseshandlinger følger "Opret …"-formen.
- Tekniske implementeringsforklaringer om transaktioner, datatyper og modulsynkronisering er fjernet fra arbejdsskærmene.
- Testmiljø og syntetiske data er fortsat tydeligt markeret.

Ingen rettigheder, ressource-ID'er, registre, filtre, sortering, dokumentfunktioner eller modulgenveje er fjernet. Den lokale browserfixture aktiverer de nødvendige moduler for den eksisterende syntetiske testtenant; den omgår ikke login eller adgangskontrol.

## Browserkontrol

Browserprøven blev kørt gennem den samlede root-app på `http://127.0.0.1:5197` med normal emulator-login som syntetisk administrator i tenant `procure-auth-a`. Data kommer fra tenantlagrede syntetiske data i lokale Auth-/Realtime Database-emulatorer. Ingen ekstern tjeneste var aktiv.

Alle otte routes blev kontrolleret ved 1440×900, 1280×800 og 390×844 med 100 % zoom. De 24 aktuelle originalbilleder og den maskinlæsbare måling findes i `artifacts/veyro-ressourcer-kompakt-v1-2026-09-17/screenshots-after/`.

Resultat:

- Ingen af de 24 kombinationer havde vandret rulning på hele dokumentet.
- Brede tabeller bruger lokal vandret rulning på små viewports.
- Titler målte 20 px på desktop og 18 px på mobil.
- Primære handlinger var synlige; brede tabelhandlinger forbliver tilgængelige via lokal tabelrulning på mobil.
- Klikbare rækker havde tastaturfokus (`tabIndex=0`). Enter på Ressourcer-rækken "Enheder" åbnede Enheder, og Enter på en unitrække åbnede enhedsprofilen.
- Ressourcer-overblikket havde præcis én aktiv navigationstilstand.
- Tom liste blev kontrolleret på Varekatalog uden layoutbrud.
- Lange ID'er og e-mailværdier blev kontrolleret i de synlige fixtures.
- De seks eksisterende moduloverblik FLEET, FACILITY, PROCURE, WORKFORCE, UNITBOOKING og WAREHOUSE blev smoke-testet uden dokumentoverflow efter CSS-ændringerne.

## Automatiske kontroller

Kørt på produktcommitets kodegrundlag:

- Relevante kontrakt- og designtests: 214/214 bestået i 46 suites.
- Root lint: bestået.
- FLEET lint: bestået.
- FACILITY lint: bestået.
- Root produktionsbuild: bestået, 777 moduler.
- FLEET produktionsbuild: bestået, 195 moduler.
- FACILITY produktionsbuild: bestået, 102 moduler.
- `git diff --check`: bestået; kun informative LF/CRLF-normaliseringsadvarsler.

Builds fejlede først i den begrænsede proceskontekst med `esbuild spawn EPERM`. De samme builds blev derefter kørt uændret i den tilladte lokale proceskontekst og bestod. Der blev ikke ændret globale sikkerheds- eller Windows-indstillinger.

Rules-/Functions-gaten blev ikke genkørt, fordi produktrettelsen ikke ændrer backend-, Functions- eller sikkerhedsregler. Den ændrede seedfil er kun lokal syntetisk testopsætning.

## Beviser

- Billedmanifest: `artifacts/veyro-ressourcer-kompakt-v1-2026-09-17/SCREENSHOT_MANIFEST.md`
- Maskinlæsbar billedmåling: `artifacts/veyro-ressourcer-kompakt-v1-2026-09-17/screenshots-after/capture-manifest.json`
- Browserobservationer: `artifacts/veyro-ressourcer-kompakt-v1-2026-09-17/browser-report.json`
- Testoversigt: `artifacts/veyro-ressourcer-kompakt-v1-2026-09-17/TEST_RESULTS.md`

## Konkrete rester

- Den aktuelle testtenant har ingen varer. Varekatalogets tomtilstand er browserkontrolleret, mens klik på en varerække ikke kunne browserprøves med denne fixture. Den eksisterende funktion og tests er bevaret.
- Der blev ikke indlæst et særskilt datasæt med hundredvis af poster. Eksisterende sideskift og tests er bevaret, men en ekstrem belastningsprøve med meget mange poster er ikke en del af denne aflevering.
- De tre før-billeder er historiske referencefiler fra det eksisterende artefaktmateriale. De er ikke genoptaget efter produktændringen og tæller ikke som aktuelt browserbevis.
