# VEYRO Version 1 – samlet visuel gennemgang

Dato: 18. september 2026

Branch: `codex/veyro-integration-v1`

Miljø: lokal emulator på `http://127.0.0.1:5197` med normal emulator-login og tenantlagrede syntetiske data

Design V2: ikke ændret

## Resultat

Der er inventariseret 80 synlige Version 1-ruter. Alle 80 blev åbnet og målt ved både 1440 × 900 og 390 × 844, 100 % zoom og samme menutilstand. Det gav 160 captures før og 160 captures efter rettelserne, uden capturefejl og uden vandret rulning på hele siden.

72 ruter viste deres egentlige brugerflade og indgår i den visuelle gennemgang. Otte PLANNING-ruter viste korrekt adgangsskærmen `Ingen adgang til PLANNING` for den aktuelle tenant/rolle. De er kontrolleret frem til adgangsskærmen, men er ikke markeret som visuelt gennemgået bag denne.

Derudover blev 17 interaktionsscenarier forsøgt. 15 detalje-, opret- eller redigeringsvisninger blev åbnet og dokumenteret uden fejl. To valgfrie scenarier kunne ikke åbnes, fordi det isolerede testmiljø ikke havde syntetiske poster i PROCURE-bestillinger og Kunder.

## Reference og anvendte mål

Ressourcer → Enheder er målt som reference for de kompakte dimensioner. FACILITY-overblikkets faktiske designværdier er genbrugt som reference for lyse paneler, diskrete kanter, afrunding og skygge.

| Element | Målt/referenceværdi | Anvendt fælles værdi |
|---|---:|---:|
| Standardkontrol | 36 px | 36 px |
| Input/select | 36 px | 36 px |
| Tabeloverskrift | 38 px | 38 px |
| Minimum datarække | 47 px | 47 px |
| Ressourcetitel | 20 px / 22 px linjehøjde | uændret |
| Ressourcepanel | 12 px padding, 12 px radius, 1 px kant | uændret |

Enhedernes målte række er 51,1 px, fordi den indeholder nødvendig flerlinjet tekst. Varekatalogets målte række er 49,6 px. Begge følger minimumshøjden på 47 px uden at skjule oplysninger.

## Fundne og rettede afvigelser

### Fælles Version 1-dimensioner

- De målte Ressourcer-værdier er gjort til fælles Version 1-designværdier for kontroller, inputs og tabeller.
- Sammenlignelige inputs og selects er ensrettet til 36 px.
- Tabeloverskrifter er ensrettet til 38 px med diskret kontrast og vandrette skillelinjer.
- Kompakte datarækker har 47 px minimumshøjde; nødvendige flerlinjede rækker kan fortsat være højere.
- Tekstfelter er ikke tvunget ned til kontrolhøjden og bevarer en brugbar minimumshøjde på 84 px.

### FACILITY – Arbejdskø

Der blev fundet en reel stilkollision: FLEET og FACILITY brugte begge globale klassenavne som `.kanban-board`, `.kanban-column` og `.case-card`, men med forskellige definitioner. FACILITY fik derfor et afvigende Kanban-udseende afhængigt af indlæsningsrækkefølgen.

Rettelsen isolerer FACILITYs arbejdskø med egne klassenavne og giver siden samme kompakte struktur som FLEETs arbejdskø:

- fire nøgletal,
- fælles værktøjslinje med søgning og relevante filtre,
- tydeligt valg mellem Kanban og tabel,
- kompakte kort og statuskolonner,
- bevaret data, filtre, sortering, oprettelse og eksisterende workflows,
- mobiltilpasning uden at ændre FLEET.

FACILITY-kontrollerne gik fra ca. 39 px til den fælles højde på 36 px.

### WORKFORCE og Opsætning

Kun de indlejrede Version 1-visninger er ensrettet; selvstændige modulspor berøres ikke.

- WORKFORCE Fravær: kontrol 38,3 → 36 px, tabelhoved 37,9 → 38 px og standardrække 63,3 → 47 px.
- Opsætning → Priser: kontrol 38,3 → 36 px, input 41 → 36 px, tabelhoved 26,9 → 38 px og standardrække 57,3 → 47 px.

### Ressourcer

De konkrete Ressourcer-krav fra opgaven er bevaret og efterkontrolleret:

- Varekataloget har ikke lodrette gitterlinjer og bruger samme lyse panel/tabelprincip som de øvrige registre.
- Søgning og filtre bruger de fælles mål og kanter.
- Units-belægningsoplysningen er kompakt og ligger ved værktøjslinjen.
- Enheder, Ejendomme, Medarbejdere, Units, Varekatalog, Lagerlokationer og Certifikater bruger `Åbn ›` som primær rækkehandling.
- Rækkeklik og `Åbn ›` fører til samme visningstilstand; redigering og ekstra handlinger findes i detaljevisningen.
- Varekatalogets detalje blev åbnet i browseren, og redigering viste den eksisterende leverandørvælger korrekt.
- Ingen funktioner, rettigheder eller dataflows blev fjernet.

## Gennemgåede ruter

### Dashboard

- `/`

### Ressourcer

- `/ressourcer/enheder`
- `/facility-v2/ejendomme`
- `/ressourcer/medarbejdere`
- `/ressourcer/units`
- `/ressourcer/varekatalog`
- `/ressourcer/lagerlokationer`
- `/ressourcer/certifikater`

### Kunder, Leverandører og Fakturacenter

- `/opsaetning/kunder`
- `/indkoeb/leverandoerer`
- `/oekonomi/fakturacenter`

### FLEET

- `/fleet-v2`
- `/fleet-v2/enheder`
- `/fleet-v2/indberetninger`
- `/fleet-v2/arbejdsko`
- `/fleet-v2/vaerksted`
- `/fleet-v2/service`
- `/fleet-v2/dokumenter`
- `/fleet-v2/leasing`
- `/fleet-v2/livekort`
- `/fleet-v2/mobil`
- `/fleet-v2/oekonomi`
- `/fleet-v2/statistik`

### FACILITY

- `/facility-v2`
- `/facility-v2/installationer`
- `/facility-v2/indberetninger`
- `/facility-v2/arbejdsko`
- `/facility-v2/opgaver`
- `/facility-v2/kalender`
- `/facility-v2/service`
- `/facility-v2/ejendomskort`
- `/facility-v2/dokumenter`
- `/facility-v2/mobil-indberetning`
- `/facility-v2/oekonomi`

### PROCURE

- `/indkoeb`
- `/indkoeb/bestillinger`
- `/indkoeb/katalog`
- `/indkoeb/godkendelser`
- `/indkoeb/modtagelser`
- `/indkoeb/lager`
- `/indkoeb/forbrug`

### WAREHOUSE

- `/warehouse`
- `/warehouse/scan`
- `/warehouse/units`
- `/warehouse/varer`
- `/warehouse/pluk`
- `/warehouse/bevaegelser`
- `/warehouse/optaelling`
- `/warehouse/modtagelse`
- `/warehouse/carriers`
- `/warehouse/labels`
- `/warehouse/afregning`
- `/warehouse/volumen`
- `/warehouse/sporbarhed`

### UNITBOOKING

- `/unitbooking`
- `/unitbooking/kalender`
- `/unitbooking/import`
- `/unitbooking/scan`
- `/unitbooking/udlaan`
- `/unitbooking/historik`

### WORKFORCE

- `/workforce-v2`
- `/workforce-v2/bemanding`
- `/workforce-v2/fravaer`
- `/workforce-v2/kompetencer`
- `/workforce-v2/timer`
- `/workforce-v2/min-arbejdsdag`

### Opsætning og hjælp

- `/opsaetning`
- `/opsaetning/ressourcer`
- `/opsaetning/priser`
- `/opsaetning/brugere`
- `/opsaetning/godkendelsesregler`
- `/support`

## Ikke kontrolleret bag adgangsskærmen

Følgende otte PLANNING-ruter viste `Ingen adgang til PLANNING` under normal login. Adgangskontrollen er ikke omgået, og der er ikke indført demo-fallback:

- `/planning-v2`
- `/planning-v2/livekalender`
- `/planning-v2/opgaver`
- `/planning-v2/optimering`
- `/planning-v2/planlaegning`
- `/planning-v2/faste-ruter`
- `/planning-v2/rapporter`
- `/planning-v2/mobilvisning`

## Kontrollerede interaktioner

Følgende blev faktisk åbnet i browseren og screenshot-dokumenteret:

- detaljevisning for alle syv Ressourcer-registre,
- opret vare i Ressourcer,
- FLEET arbejdskø: detalje og opret,
- FACILITY arbejdskø: detalje og opret,
- PROCURE: opret vare,
- WAREHOUSE: opret vare,
- Leverandørdetalje.

Ikke tilgængelige på grund af manglende syntetiske poster:

- PROCURE-bestillingsdetalje,
- Kundedetalje.

Ingen formular blev indsendt, og ingen produktionsdata blev ændret.

## Kontrolresultater

- Browseraudit før: 80 ruter × 2 viewports = 160 captures, 0 fejl, 0 side-overflows.
- Browseraudit efter: 80 ruter × 2 viewports = 160 captures, 0 fejl, 0 side-overflows.
- Interaktionsaudit: 15 gennemførte, 0 fejl, 2 ikke tilgængelige på grund af tomme testlister.
- `npm run lint`: bestået.
- `npm run build`: bestået. Vite viser den eksisterende advarsel om chunks over 500 kB.
- `node --test test/design-tokens.test.mjs test/ressource-struktur.test.mjs`: 21/21 bestået.
- `facility-v2 npm test`: 38/38 bestået i 6 testfiler.
- `git diff --check`: bestået.

Der er ikke ændret backend eller adgangsregler, så Rules-/Functions-gaten var ikke relevant for disse visuelle ændringer.

## Artefakter

- Før-captures: `artifacts/veyro-visuel-helhed-v1-2026-09-18/screenshots/`
- Efter-captures: `artifacts/veyro-visuel-helhed-v1-2026-09-18/after/screenshots/`
- Interaktioner: `artifacts/veyro-visuel-helhed-v1-2026-09-18/after/interactions/`
- Målerapport før: `artifacts/veyro-visuel-helhed-v1-2026-09-18/visual-audit.json`
- Målerapport efter: `artifacts/veyro-visuel-helhed-v1-2026-09-18/after/visual-audit.json`
- Interaktionsrapport: `artifacts/veyro-visuel-helhed-v1-2026-09-18/after/interaction-audit.json`

Auditværktøjet ligger i `scripts/audit-version1-visual.mjs` og kan gentage rute-, viewport- og DOM-målingerne i det isolerede lokale miljø.

## Afgrænsning

- Ingen ændringer i Design V2.
- Ingen ændringer i PLANNING.
- Ingen ændringer i backend, tenant- eller adgangsregler.
- Ingen push, deployment eller produktionsændringer.
- Screenshots og rapporter indeholder ikke credentials eller miljøfiler.
