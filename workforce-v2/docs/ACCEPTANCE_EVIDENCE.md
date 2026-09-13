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
