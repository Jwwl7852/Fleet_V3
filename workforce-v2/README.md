# WORKFORCE v2

WORKFORCE v2 er det isolerede modulspor for medarbejdere, arbejds- og
vagtplaner, ferie/fravær, kompetencer, timer og medarbejderens egen adgang.
Modulet kan køre uden PLANNING, FLEET eller andre driftsmoduler.

## Lokal åbning

Fra repositoryroden:

```powershell
.\node_modules\.bin\vite.cmd --config workforce-v2\vite.config.js --host 127.0.0.1 --port 5205 --strictPort
```

Åbn `http://127.0.0.1:5205/`. Den lokale integrationsdatabase er IndexedDB
med navnet `veyro-workforce-v2-integration-v1`. Brug vælgeren “Vis som” til at
forhåndsvise leder- og medarbejderflader i den isolerede prototype. Vælgeren
ændrer ikke autentifikation eller rettigheder og må ikke indgå i den
integrerede version. Ændringer overlever genindlæsning.

## Kontroller

```powershell
node --test --test-isolation=none workforce-v2/tests/*.test.js
.\node_modules\.bin\vite.cmd build --config workforce-v2\vite.config.js
```

Screenshots og browserbevis ligger i `docs/screenshots/`. Den lokale database
er et modulrepository til udviklingssporet; Firebase-tilkoblingen koordineres
med samlings-Codex som beskrevet i `docs/INTEGRATION_HANDOFF.md`.
