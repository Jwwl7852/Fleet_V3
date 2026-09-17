# VEYRO Ressourcer – kompakt Version 1

Dato: 17. september 2026

## Version og afgrænsning

- Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-integration`
- Branch: `codex/veyro-integration-v1`
- Udgangspunkt: `be2399dcd0dd5d1ecd2b28876222321e4df7236f`
- Produktcommit: `f93e0f1fe62f63de6723a242c7f58d8e3d4d03ca`
- Supplerende syntetisk varefixture: `4fcd7989e64ffaf1ee006ac4c645f42537c3ec1a`
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

### Supplerende Varekatalog-prøve

Den isolerede tenant blev suppleret med 12 tydeligt syntetiske varer, 3 syntetiske leverandører og 8 kategorier. Datasættet dækker ni enhedsværdier, priser fra 12,75 kr. til 1.299,95 kr. ekskl. moms samt et varenavn på over 80 tegn.

Browserprøven viste:

- Søgning efter `refleksmarkering`: 1 af 12 varer.
- Kategorien `El-materiel`: 2 af 12 varer.
- Leverandøren `Syntetisk Teknikpartner A/S`: 5 af 12 varer.
- Favoritter: 4 af 12 varer.
- Tidligere købt: 5 af 12 varer.
- Klik og Enter på en varerække åbnede vareopsætningen med korrekt varenummer og enhed.
- `Tilføj` lagde varen i kurven og viste én leverandør samt 1.299,95 kr.
- Siden har ingen sideskift; alle filtrerede poster vises direkte. Derfor er pagination ikke relevant for denne side.

Favoritknappen ændrede ikke tilstand i det normale emulatorforløb. Koden muterer kun favoritstatus i demo-state, så vedvarende favoritfunktion i den autentificerede app er et dokumenteret restpunkt og ikke markeret som bestået.

## Automatiske kontroller

Kørt på produktcommitets kodegrundlag:

- Relevante kontrakt- og designtests: 215/215 bestået i 46 suites.
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

- Favoritknappen ændrer ikke status i et normalt emulatorforløb, fordi den eksisterende handler kun muterer demo-state. Rækkeåbning og `Tilføj` er browserverificeret.
- Varekataloget har ingen sideskift, så der er ikke en paginationfunktion at afprøve. De 12 varierede poster er tilstrækkelige til den aftalte layoutkontrol.
- De tre før-billeder er historiske referencefiler fra det eksisterende artefaktmateriale. De er ikke genoptaget efter produktændringen og tæller ikke som aktuelt browserbevis.
