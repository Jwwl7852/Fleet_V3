# WORKFORCE v2 — lokalt acceptbevis

Afprøvet 13. september 2026 på `http://127.0.0.1:5205/` med IndexedDB
`veyro-workforce-v2-integration-v1` og syntetiske data.

## Browserforløb

- Medarbejder “UI Testmedarbejder” blev oprettet uden login, vist i listen og
  genfundet efter browser-reload.
- To vagter blev oprettet fra ugegitteret og genfundet efter reload. Domænetest
  dækker særskilt nattevagt, gentagelse og ændring af én serieforekomst.
- Benjamin Holms anmodning blev godkendt fra UI. Efter reload stod den som
  “Godkendt”, med én berørt PLANNING-tildeling og registreret årsag.
- Ved viewport 390 × 844 så Anne sin offentliggjorte plan uden overlappende
  navigation. Hun stemplede ind, reloadede siden og så den åbne stempling.
- Anne sendte en ferieanmodning fra mobilfladen og så status “Afventer”.
- Lederens timeoverblik viste Annes og Benjamins åbne stemplinger separat fra
  de planlagte timer.
- Browserkonsollen blev kontrolleret: 0 errors/warnings fra WORKFORCE.

## Screenshots

- `01-overblik-desktop.png`
- `02-bemanding-desktop.png`
- `03-fravaer-desktop.png`
- `04-medarbejder-mobil.png`
- `05-medarbejder-tid-og-frihed.png`
- `06-timer-leder.png`

Screenshots viser modulrepositoryets gemte lokale integrationsdata. De er ikke
bevis for Firebase-regler eller Cloud Functions; de kontroller indgår i
samlingsarbejdet efter `INTEGRATION_HANDOFF.md`.

## Korrektionsrunde 13. september 2026

Afprøvet på en separat, ren browser-origin
`http://127.0.0.1:5206/` med modulrepositoryets syntetiske seed.

- Bemanding: Camillas gemte nattevagt `shift-c1` vises kun i startdagens
  celle. Den vises ikke igen næste dag, og ugetotalen er 7,3 t (435 min).
- Timer: Anne viser 22,5 t fra tre offentliggjorte vagter. Den ene kladde på
  7,5 t vises separat og indgår ikke i sammenligningen.
- Timer: ingen registrering, åben stempling og afsluttet registrering vises
  som tre forskellige tilstande. Afsluttede registreringer skjuler ikke
  offentliggjorte vagter uden registrering.
- Overblik: offentliggjort bemanding, kladder og faktisk indstemplede er tre
  selvstændige KPI'er og afledes uafhængigt.
- Fravær: heldagsperioden 10. september vises som “10. sep. 2026 · hele
  dagen”; det eksklusive sluttidspunkt 11. september kl. 00.00 vises ikke.
  Camillas delvise fravær vises med kl. 12.00–18.00.
- Mobil 390 × 844 CSS-pixels: offentliggjorte vagter viser tidsrum, “Planlagt
  pause 30 min” og “Nettoarbejdstid 7,5 t” uden layoutblokering.
- Browserens fejl-/advarselslog blev kontrolleret efter forløbene.

Opdaterede screenshots:

- `screenshots-correction/01-bemanding-nattevagt-desktop.png`
- `screenshots-correction/02-timer-status-desktop.png`
- `screenshots-correction/03-fravaer-perioder-desktop.png`
- `screenshots-correction/04-overblik-bemanding-desktop.png`
- `screenshots-correction/05-medarbejder-plan-mobil.png`

Korrektionsrunden dokumenterer fortsat ikke autentifikation eller den fælles
backend. Det påkrævede tværsessionsforløb er derfor eksplicit placeret i
`INTEGRATION_HANDOFF.md`.

## Afsluttende adgangskontrol 13. september 2026

- Den lokale repositoryprojektion er testet med en godkender, som har
  `workforce.leave.approve`, men ikke `workforce.leave.sensitive`.
  Godkenderen modtog periode, status og id, men ikke ansøgt kategori,
  medarbejdernote eller den følsomme årsagssamling.
- Benjamin kunne via sin egen medarbejderprojektion fortsat se sin egen
  ansøgte kategori og kommentar, men ikke `sensitiveLeave`.
- Lederens rettighedsberettigede UI skelner nu mellem “Ønsket frihed” og
  “Registreret årsag”. For den afventende ansøgning vises den registrerede
  årsag som “Ikke fastlagt” i stedet for “Skjult”.
- Screenshots: `screenshots-final/01-fravaer-adgang-desktop.jpg` og
  `screenshots-final/02-fravaer-detalje-desktop.jpg`.

Kontrollen er kørt mod modulrepositoryet. Den dokumenterer ikke, at felterne
filtreres før levering fra Firebase eller en Cloud Function. Den fælles
backendkontrol er fortsat et eksplicit acceptkrav i
`INTEGRATION_HANDOFF.md`.
