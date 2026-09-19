# VEYRO Version 1 · WORKFORCE Kalender

Dato: 19. september 2026

Branch: `codex/veyro-integration-v1`

Miljø: lokal Firebase-emulator med tenantlagrede, syntetiske data

## Gennemført

- “Bemanding” er omdøbt til “Kalender” i navigation, sidetitel og brugerrettede tekster.
- Den nye rute er `/workforce-v2/kalender`; den tidligere `/workforce-v2/bemanding` viderestilles kompatibelt.
- Kalenderen har Dag, Uge, Måned og År med bevaret ankerdato ved visningsskift.
- Dag, uge og måned bruger medarbejdere som rækker og viser vagter samt fravær tydeligt adskilt.
- Årsvisningen viser 12 kompakte måneder, som kan åbnes i månedsvisningen.
- Periodeværktøjslinjen har forrige, næste og “I dag” samt danske periodeetiketter, mandag som første ugedag og ISO-ugenumre.
- Periode-popup er tilpasset dag, uge, måned og år. Escape og klik udenfor lukker, og fokus returneres til periodeknappen.
- Afdelinger, personer og kalenderkategorier kan kombineres som flervalg. Personvalg afstemmes automatisk med valgte afdelinger.
- Kalenderkategorier læses fra `ressourceKategorier/kalenderkategorier` i Opsætning. Der er ikke oprettet et parallelt register eller en produktionsfallback.
- Eksisterende vagt-/fraværsdata, åbning, redigering og rettighedskontrol er bevaret.
- Design V2 er ikke ændret.

## Syntetisk reviewfixture

Den eksisterende lokale reviewfixture er udvidet med otte kalenderkategorier i tenantens autoritative Opsætning-register. Browserkontrollen bruger normal emulator-login og tre syntetiske medarbejdere med vagt og fravær. Der er ikke skrevet til produktion eller eksterne tjenester.

## Browserkontrol

Kontrolleret i lokal Edge ved 100 % zoom:

| Kontrol | Resultat |
| --- | --- |
| Dag, uge, måned og år ved 1440×900 | Godkendt |
| Månedsvisning ved 1280×800 | Godkendt |
| Uge og periode-popup ved 390×844 | Godkendt |
| Udfoldet og sammenklappet navigation | Godkendt |
| Valg i alle fire periodetyper | Godkendt |
| Gammel Bemanding-rute | Viderestiller til Kalender |
| ISO-uge 53 og årsskifte | Godkendt i målrettet datotest |
| Kategorier fra Opsætning | 8 indlæst |
| Kombinerede filtre og nulstilling | Godkendt |
| Escape, klik udenfor og fokusretur | Godkendt |
| Åbn/redigér eksisterende vagt | “Redigér denne vagt” åbnet |
| Vandret rulning på hele siden | Ingen ved de målte viewports |
| Lokal kalender-rulning | Bevidst bevaret i måned/mobil |

Detaljer og mål findes i `browserrapport.json`. `billedmanifest.json` indeholder alle ni screenshots.

## Automatiske kontroller

- Målrettede kalender-, navigations-, ressource- og functions-delt-tests: **46/46 bestået**.
- `npm run lint`: **bestået**.
- `npm run build`: **bestået**.
- Lokal browser-QA: **9 screenshots og 9 målinger bestået**.
- `npm run test:rules`: **ikke gennemført**. Firebase Database-emulatoren stoppede før testene med Java-fejlen `Unable to establish loopback connection` / `SocketException: Invalid argument: connect`. Den statiske regelsynkronisering, allowlisten og functions-delt-gaten er kontrolleret, men den fulde emulatorbaserede Rules-gate mangler fortsat på denne maskine.

## Screenshots

1. `screenshots/01-dag-1440x900.png`
2. `screenshots/02-uge-1440x900.png`
3. `screenshots/03-maaned-1440x900.png`
4. `screenshots/04-aar-1440x900.png`
5. `screenshots/05-uge-popup-1440x900.png`
6. `screenshots/06-maaned-1280x800.png`
7. `screenshots/07-uge-mobil-390x844.png`
8. `screenshots/08-uge-popup-mobil-390x844.png`
9. `screenshots/09-uge-mobil-kompakt-menu-390x844.png`

## Konkrete rester

- Den fulde emulatorbaserede Rules-gate skal genkøres i et miljø, hvor Java kan oprette sin lokale loopback-eventloop.
- Minimumsbemandingsregler er bevidst ikke implementeret, som angivet i opgaven.
