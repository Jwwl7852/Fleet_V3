# VEYRO WORKFORCE v2 — integrationsresultat V1

- Dato: 13. september 2026
- Integrationsbranch: `codex/veyro-integration-v1`
- Modtaget checkpoint: `86e3c5e66af6a3678e1d119833bac27970a01f8c`
- Start-HEAD: `ad018619ee6664839a6e6ff2e5766f2428f819cb`
- Merge-commit: `cfab078dc43f3ea6ad72211ece743542460e5a41`

## Afgrænsning

WORKFORCE v2 er monteret lazy-loadet under `/workforce-v2/*` i den fælles
AppShell. Den tidligere `/bemanding/*`-funktion er bevaret som en skjult
legacy-rute. Integrationen bruger fælles login, claims-v2, tenant, abonnement,
navigation, logo og tokens. Der er ikke deployet, pushet eller tilsluttet
eksterne tjenester.

Fælles medarbejderstamdata er tilgængelige for autoriserede personaleforløb,
selv om tenantens abonnement ikke omfatter WORKFORCE. Vagter, fravær,
kompetencer, timer og WORKFORCE-projektioner er derimod gated server-side på
aktivt WORKFORCE-abonnement og relevante permissions. Den lokale
produktvælger giver ingen rettigheder.

## Server- og datagrænse

De nye callable Functions er `workforceprojektionhent`, `workforcekommando` og
`workforceplanningtjek`. De håndhæver autentifikation, tenant, claims-version,
revocation, abonnement, permission, følsom projektion, optimistisk version og
idempotente anmodnings-id'er. Direkte klientadgang til vagter og de interne
WORKFORCE-noder er lukket i Realtime Database Rules.

Fraværsreservationer opdateres og fjernes sammen med godkendt fravær.
Flytning eller annullering genberegner tilgængeligheden, og samtidige
modstridende afgørelser accepterer højst én version. PLANNING spørger den
samme serverprojektion før lokal placering og får kun tilgængelighed — ikke
fraværsårsag. Chaufførens eksisterende Frihed-side skriver nu gennem den
samme callable kontrakt; den skriver ikke længere note eller fysisk fravær
direkte til en bredere klientnode.

Godkendelsesomfang og egen godkendelse er fortsat en produktbeslutning.
Indtil den er truffet, kræver serveren et eksplicit godkendelsesomfang og
afviser egen godkendelse. Certifikat-upload er ikke implementeret i
checkpointet; kun dokumentreference findes, og det er derfor ikke markeret
som verificeret Storage-upload.

## Isoleret miljø

Backendbeviset er kørt mod Firebase Emulator Suite med projekt
`demo-veyro-workforce-test`: Auth `9119`, Database `9020`, Functions `5022`
og Storage `9229`. Database-URL'en peger eksplicit på namespace
`demo-veyro-workforce-test-default-rtdb`. `functions/index.js` accepterer kun
den proceslokale override, når Functions-emulatoren er aktiv, værten er
localhost, og namespace matcher `demo-*-default-rtdb`; produktionskørsel
ignorerer den.

Rules-gaten brugte den allerede installerede portable Eclipse Temurin
OpenJDK `21.0.12.1` fra
`C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.12.1+1\jdk-21.0.12.1+1`.
`JAVA_HOME`, `PATH`, `TEMP`, `TMP` og `JAVA_TOOL_OPTIONS` blev kun sat for den
enkelte testproces. Ingen installation eller global Java-indstilling er ændret.

## Verifikation

- `npm run test:rules`: 4.512/4.512 bestået mod det isolerede
  `demo-fleetcontrol-rules-test`; Database- og Storage Rules, login,
  claims-v2, revocation, tenant- og permissionsgrænser indgår.
- `node --test workforce-v2/tests/*.test.js`: 22/22 bestået.
- `npm run lint` og målrettet ESLint af integrationsfilerne: bestået.
- `npm run test:design`: 11/11 bestået.
- `npm run build`: bestået, 723 transformerede moduler og særskilt lazy
  `WorkforceV2Module`-chunk. Den kendte chunkstørrelsesadvarsel består.
- `scripts/workforce-auth-functions-qa.mjs`: bestået med separate
  autentificerede medarbejder- og ledersessioner. Beviset ligger i
  `artifacts/workforce-v2/runtime/WORKFORCE_AUTH_FUNCTIONS_BEVIS.json`.
- Backend-QA dokumenterer ansøgning, idempotent genforsøg, lederafgørelse,
  svar tilbage til medarbejderen, fraværsreservation, ændring/annullering,
  samtidighed, tenant-isolation, permission-afvisning og PLANNING-blokering.
- Faktisk browser: medarbejder oprettede ansøgning fra `/app/frihed`; leder
  så og godkendte samme sag på `/workforce-v2/fravaer`; medarbejderen så
  svaret efter nyt login. Lederen så ikke medarbejderens følsomme note.
- Faktisk browser: PLANNING afviste placering af den samme medarbejder i et
  godkendt fraværsinterval og bevarede den lokale plan uændret.
- Faktisk browser: anonym direkte URL blev sendt til login; en autentificeret
  bruger uden medarbejderkobling/lederpermission fik fail-closed
  adgangssiden uden WORKFORCE-data. Ingen nye konsolfejl blev fundet; kun de
  eksisterende React Router v7-future-flag-advarsler blev observeret.

## Begrænsninger

Resultatet er lokal emulatorverificeret integration, ikke produktionsdrift.
Eksterne løn-, mail-, certifikat- eller planlægningssystemer er ikke
tilsluttet. Certifikat-upload, den endelige beslutning om lederomfang/egen
godkendelse og fysisk mobilafprøvning er åbne punkter. Kendte dependency-
sårbarheder er ikke ændret; der er ikke kørt `npm audit fix` eller en bred
opgradering.
