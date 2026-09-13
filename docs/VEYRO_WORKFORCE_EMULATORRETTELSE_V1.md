# WORKFORCE emulatorrettelse V1

Dato: 13. september 2026

Branch: `codex/veyro-integration-v1`

Layoutcommit: `8e3607e23cabef393164e89dbd35994b5d9fde5b`

## Miljøfejl og afgrænsning

Den installerede JDK var ikke fejlen. Firebase Database Emulator fejlede på
Windows i Nettys `WEPollSelectorImpl`, når Java-processen arvede værtsprocessens
`TEMP` og `TMP`. Samme Temurin-binær startede korrekt, når de to værdier blev
ryddet kun for emulatorprocessen. Maskinens globale miljø, Java 8 og globale
`JAVA_HOME`/`PATH` er uændret; der blev ikke installeret software eller brugt
administratorrettigheder.

Den fungerende Java var:

```text
C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.12.1+1\jdk-21.0.12.1+1
openjdk version "21.0.12.1" 2026-08-18 LTS
OpenJDK Runtime Environment Temurin-21.0.12.1+1
```

Functions-discovery blev proceslokalt givet 60 sekunder via
`FUNCTIONS_DISCOVERY_TIMEOUT=60000`. Firebase CLI var 15.29.0. Testprojekt og
porte var:

| Del | Værdi |
| --- | --- |
| Projekt | `demo-veyro-workforce-test` |
| Auth | `127.0.0.1:9119` |
| Database | `127.0.0.1:9020` |
| Functions | `127.0.0.1:5022` |
| Storage | `127.0.0.1:9229` |
| Autentificeret Vite-prøve | `127.0.0.1:5220`, `strictPort` |

Alle data og identiteter var syntetiske. Demo-projektets værn gjorde kald til
ikke-emulerede tjenester fejlende, og browserkonfigurationen pegede eksplicit
på alle tre anvendte emulatorer. Ingen produktionstjeneste blev kontaktet.

## Namespace-fejl og rettelse

Da emulatorerne kunne starte, afslørede første callable en separat testharness-
fejl: seedet skrev til `demo-veyro-workforce-test-default-rtdb`, mens Functions'
Admin SDK brugte `demo-veyro-workforce-test` som runtime-namespace. Resultatet
var den misvisende produktfejl "Tenant findes ikke".

WORKFORCE-seedet bruger nu projekt-id'et som samme runtime-namespace som
Functions. Før syntetiske data skrives, installerer seedet repositoryets
uændrede `firebase.rules.json` eksplicit på dette namespace. Testen kan derfor
hverken læse en tom parallel database eller komme til at køre med åbne regler.
Produktionsreglerne blev ikke lempet.

## Server- og sikkerhedsgate

Kørt i den isolerede emulatorgruppe:

```text
npx --yes firebase-tools@15.29.0 emulators:exec --only auth,database,functions,storage --config firebase.workforce-test.json --project demo-veyro-workforce-test "node scripts/workforce-auth-functions-qa.mjs artifacts/workforce-v2/runtime"
```

Resultat: bestået. Beviset er opdateret i
`artifacts/workforce-v2/runtime/WORKFORCE_AUTH_FUNCTIONS_BEVIS.json`.

- Medarbejder ansøgte om fravær, leder godkendte, og medarbejderen så svaret.
- Genforsøg gav ingen dobbelt anmodning eller dobbelt afgørelse.
- Aflysning og ændret person/periode fjernede den gamle reservation og
  genberegnede overlap.
- PLANNING afviste bemanding i godkendt fravær uden at afsløre følsom årsag og
  kontrollerede kompetence på opgavens tidspunkt.
- Forkert tenant, manglende permission, manglende godkendelsesomfang og direkte
  læsning af interne noder blev afvist.
- Kun én af to samtidige afgørelser blev accepteret.
- Fælles medarbejderstamdata var tilgængelige uden WORKFORCE-abonnement, mens
  WORKFORCE-skrivning blev afvist.

Certifikat-upload er fortsat ikke implementeret i checkpointet; kun en
dokumentreference findes. Det er ikke rapporteret som bestået Storage-upload.

## Browserbevis mod backend

Den faktiske integrerede app blev startet særskilt på port 5220 med normal
Firebase-initialisering mod emulatorerne. Login blev gennemført med den
syntetiske lederkonto `workforce-manager@example.invalid`; adgangskoden blev
kun sat proceslokalt og er ikke skrevet i repositoryet.

Alle syv ruter indlæste data via `workforceprojektionhent` uden fejl eller
fastlåst spinner:

- `/workforce-v2`
- `/workforce-v2/medarbejdere`
- `/workforce-v2/bemanding`
- `/workforce-v2/fravaer`
- `/workforce-v2/kompetencer`
- `/workforce-v2/timer`
- `/workforce-v2/min-arbejdsdag`

Den syntetiske bruger uden WORKFORCE-adgang blev på en direkte URL stoppet af
"Ingen adgang til WORKFORCE", før forretningsdata blev indlæst. En anonym
direkte URL blev sendt til login og bevarede returstien. Browserkonsollen havde
ingen fejl.

Den samme 44-billeders matrix som layoutgaten blev derefter kørt i en ny,
isoleret browserprofil mod emulatorbackenden. Alle 42 kombinationer bestod ved
1440×900, 1920×1080, 390×844 og 360×800 samt normal/kompakt desktopmenu.
Gemte valg overlevede reload; "Nulstil visning" gendannede 100 % og normal
menu. Der var ingen dokumentoverflow eller konsolfejl.

Komplette mål og screenshots ligger i:

- `artifacts/workforce-emulator-layout-v1/measurements.json`
- `artifacts/workforce-emulator-layout-v1/screenshots/`

## Kendte ikke-blokerende forhold

- Functions-emulatoren oplyser, at manifestet ønsker Node 20, mens den lokale
  vært anvender Node 24 til emuleringen.
- Firebase Functions-pakken rapporteres som ældre. Der er ikke udført en bred
  dependencyopgradering.
- Den proceslokale rydning af `TEMP`/`TMP` er en lokal Windows-workaround og
  ændrer ikke platformkode eller maskinopsætning.
