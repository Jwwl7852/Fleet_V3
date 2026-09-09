# Etape 5A – visuel tilretning af Dagens drift og Livekalender

## Formål og afgrænsning

Etape 5A ombygger den isolerede Planning-prototypes to driftsflader efter de godkendte referencebilleder. Ændringen er alene en lokal UI-tilretning. Etape 5-optimeringsmotoren, Planning Basic-kontrakterne, Firebase, fælles navigation, permissions og persistence ændres ikke.

Prototypen åbnes lokalt på `http://127.0.0.1:5190/planning-demo.html` med:

```text
npm run dev -- --host 127.0.0.1 --port 5190 --strictPort
```

## Bindende designkilder og farver

Layout, proportioner og tæthed følger de to godkendte referencebilleder. Farverne kommer ikke fra skærmbillederne, men fra `VEYRO_THEME.md` samt de to særskilt godkendte semantiske tokens. Planning har én afgrænset tokenblok i `planning-demo.css`; `test/design-tokens.test.mjs` låser både navne og normaliserede værdier og afviser ekstra tokens, rå farver uden for blokken, farver i andre CSS-filer og import af `fleet.css`.

| Formål | Token | Værdi | Klasse og kilde |
| --- | --- | --- | --- |
| Platformsidebar | `--veyro-deep-navy` | `#061A2A` | Grundfarve, `VEYRO_THEME.md` |
| Mørk sekundær flade | `--veyro-navy-dark` | `#03131F` | Grundfarve, `VEYRO_THEME.md` |
| Primær accent | `--veyro-teal` | `#087F8F` | Grundfarve, `VEYRO_THEME.md` |
| Sekundær accent | `--veyro-cyan` | `#22C2CF` | Grundfarve, `VEYRO_THEME.md` |
| Lys accentflade | `--veyro-teal-light` | `#E8F7F8` | Grundfarve, `VEYRO_THEME.md` |
| Hvid | `--veyro-white` | `#FFFFFF` | Grundfarve, `VEYRO_THEME.md` |
| Applikationsbaggrund | `--veyro-app-background` | `#F5F7F9` | Grundfarve, `VEYRO_THEME.md` |
| Kant | `--veyro-border` | `#DCE3E8` | Grundfarve, `VEYRO_THEME.md` |
| Primær tekst | `--veyro-primary-text` | `#102235` | Grundfarve, `VEYRO_THEME.md` |
| Sekundær tekst | `--veyro-secondary-text` | `#667687` | Grundfarve, `VEYRO_THEME.md` |
| Stærk sekundær tekst | `--veyro-secondary-text-strong` | `#5F6F7F` | Grundfarve, `VEYRO_THEME.md` |
| Succes | `--veyro-success` | `#2EAD72` | Grundfarve, `VEYRO_THEME.md` |
| Advarsel | `--veyro-warning` | `#D99A28` | Grundfarve, `VEYRO_THEME.md` |
| Kritisk | `--veyro-danger` | `#D95C5C` | Grundfarve, `VEYRO_THEME.md` |
| Tilgængeligt link | `--veyro-link-accessible` | `#087484` | Semantisk token, særskilt godkendt Planning-kontrakt |
| Kortflade | `--veyro-card-surface` | `#F7F8F9` | Semantisk token, særskilt godkendt Planning-kontrakt |
| Status-tekst og -flader | `--veyro-*-text`, `--veyro-*-surface` | afledt af statusgrundfarverne | Semantiske tokens, FLEET v2-temaets dokumenterede kontrastprincip |

## Fælles Veyro-ramme

Den isolerede demo har en mørk Veyro-sidebar, lys arbejdsflade, kompakt topbar og det lokale, godkendte Veyro Systems-logo. Planning er et manuelt foldbart modul med Dagens drift, Livekalender, Opgaver, Optimering, Faste ruter, Ressourcer, Rapporter og Mobilvisning. Andre platformmoduler vises kun som deaktiveret kontekst.

Logoet og alle UI-imports er lokale i `planning-ui`. Prototypen importerer ikke `fleet.css` og har ingen runtime-afhængighed til andre worktrees.

## Dagens drift

Siden viser den faste syntetiske demodato og opdateringstid 09:42, segmentvalg, de fire reference-KPI'er 18, 14, 3 og 2, en kompakt liveoversigt, et lokalt SVG-rutekort samt tre forhold, der kræver handling. Desktopforholdet mellem tabel, kort og handlingsliste følger referencebilledet, mens 560-pixel-visningen skifter tabellen til læsbare rutekort uden vandret sidescroll.

KPI'er, søgning, statusfilter, pagination, rutevalg, kortzoom og forslag har lokal effekt. Rutevalg åbner den samme rute i Livekalender. Kortet er mærket `Demo – syntetiske ruter og positioner` og indeholder ingen korttiles eller vejberegning.

## Livekalender

Livekalenderen bruger det samme datasæt med otte ruter, medarbejdere, køretøjer og statusser som Dagens drift. Desktopfladen viser de første seks ruter samtidigt for at bevare referencebilledets tæthed og læsbarhed; resten er fortsat tilgængelige gennem den delte lokale tilstand og filtrering. Kalenderen har fast ressourcemetadata, vandret tidsakse, tidsmarkør ved 09:42, kørsel, stop, pauser, afvigelser og separate OBD-/estimatmarkører. De viste blokke er en rolig UI-projektion af de underliggende tidssegmenter; den rene tidsberegning ændres ikke.

OBD er markeret som syntetisk demo. En estimeret position kaldes ikke live. Kalenderen kan grupperes efter rute, medarbejder eller køretøj, filtreres, vise det lokale rutekort og åbnes i en skærmfyldende lokal visning. Ved 560 pixels erstattes desktopgitteret af en dedikeret dagsagenda; det er ikke en sammenpresset desktopkalender.

## Lokalt løsningsflow

Forslagene er deterministiske fixtures. Panelet kan åbnes fra både Dagens drift og Livekalender, redigeres, afvises eller godkendes lokalt. Et HARD-regelbrud kan fortsat ikke godkendes. En godkendelse opdaterer kun React-tilstanden og viser teksten `Demoplanen er opdateret lokalt – intet er sendt eller gemt.` Genindlæsning eller `Nulstil demodata` gendanner fixtures.

## Test og kontrol

Målrettet UI-kontrol:

```text
node --test test/planning-ui/planning-ui.test.mjs test/planning-ui/planning-ui-reference.test.mjs
```

Den samlede kontrol omfatter desuden Planning v1–v5, import- og arkitekturgrænser, det dokumenterede konservative regressionsudsnit, benchmark, lint, designkontrol, build og `git diff --check`.

Den afsluttende lokale kontrol omfatter mindst 41 målrettede UI-tests, 220 samlede Planning-tests, 64 import- og arkitekturtests, 986 konservative regressionstests, benchmark, designkontrol, ESLint, produktionsbuild og whitespacekontrol. Den udvidede designkontrol har 11 kontroller, fordi den lokale Planning-tokenkontrakt nu testes positivt og med fem negative regressionseksempler. Browserkontrollen udføres fysisk ved 1920 × 1080, 1440 × 900, 1294 × 900, 900 × 900 og 560 × 900.

## Kendte begrænsninger

- Alle data, positioner, ruter og statusser er syntetiske.
- SVG-kortet er skematisk og repræsenterer ikke et vejnet.
- OBD, GPS, geokodning, trafik og rute-API'er er ikke tilsluttet.
- Ændringer gemmes ikke og sendes ikke til medarbejdere eller servere.
- Ressourcer og Rapporter er synlige som afgrænsede, deaktiverede integrationspunkter i denne prototype.
- Det godkendte lokale logoaktiv er fuldt uigennemsigtigt. Der blev ikke fundet en verificerbar transparent variant, så den synlige logobaggrund er et åbent visuelt punkt og aktivet er ikke kunstigt redigeret.
