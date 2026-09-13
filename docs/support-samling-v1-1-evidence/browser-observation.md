# Browserobservation – Support V1.1

Dato: 13. september 2026.

## Kunde

Den byggede arbejdsflade på `http://127.0.0.1:5214/support` blev åbnet. Den
viste Veyros fælles Hjælp og support-design og en sag i kundedialogen. Siden
markerede selv datakilden som lokal supportprototype.

## Ejer

Den faktiske V8-arbejdsflade på `http://127.0.0.1:5213/main/support` blev åbnet
gennem dens normale lokale login. Den viste V8 Support og ejerens eksisterende
syntetiske tråde. Ejerens adapter på det læste commit havde
`portalForbundet: false`.

## Konklusion

De to UI'er er individuelt tilgængelige, men viste ikke den samme sag og brugte
ikke den samme backend. Et screenshotpar ville derfor kun dokumentere to
separate demoer og er bevidst ikke præsenteret som K2/K4-bevis. Når ejerchatten
har koblet sin adapter til V1.1-endpoints, skal samme syntetiske `sagId` vises i
begge byggede apps, hvorefter screenshots kan tilføjes uden auth-data.
