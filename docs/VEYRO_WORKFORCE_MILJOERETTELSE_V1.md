# WORKFORCE miljø- og fejltilstandsrettelse V1

Dato: 13. september 2026

Integrationsbranch: `codex/veyro-integration-v1`

Start-HEAD: `a6753bed36ac2ae42adedc920775f7ef8e65b3c4`

## Problem og årsag

Den integrerede WORKFORCE-rute oprettede altid Firebase-repositoryet, selv når
platformen var startet i eksplicit demo-mode uden en Firebase-app. Første kald
til `workforceprojektionhent` fejlede derfor. WORKFORCE brugte samtidig
`state === null` som eneste indlæsningssignal, så en fejl ved første læsning
efterlod teksten "Henter WORKFORCE…" permanent på skærmen.

## Rettet miljøvalg

- I eksplicit demo-mode vælges et tenantafgrænset memory-repository før første
  læsning. Det indeholder kun de syntetiske WORKFORCE-fixtures og markeres i
  brugerfladen med: "WORKFORCE viser syntetiske demodata i hukommelsen. Ingen
  backend er tilsluttet."
- I normalt lokalt miljø vælges Firebase-repositoryet. Fejl herfra vises til
  brugeren og udløser aldrig en skjult overgang til demodata.
- Hvis en konfigureret Firebase-app ikke kan initialiseres, stopper platformens
  globale indlæsningsvisning med en læsbar fejl og et genforsøg. Den tidligere
  misvisende logtekst om automatisk demo-mode er fjernet.
- I demo-mode bruges den eksplicitte fixtureidentitet `emp-dennis`. I backend-
  miljøet kommer medarbejderidentiteten fortsat fra den autentificerede
  brugers `brugere/{uid}.personId`; der opfindes ingen administratoradgang.

Den normale backendkæde er fortsat login i Auth Emulator, claims-v2 og
revocationkontrol i platformen, tenant-/moduladgang, opslag af brugerens
medarbejderidentitet og derefter WORKFORCE-callables med serverhåndhævede
permissions. Denne kæde er ikke erstattet af demoimplementeringen.

## Fejltilstand

WORKFORCE har nu et selvstændigt `loading`-signal. Det nulstilles i `finally`,
også når første læsning fejler. Brugeren får en læsbar fejl og knappen
"Prøv igen"; genforsøget viser kun indlæsning, mens det faktisk kører.

## Verifikation

Følgende målrettede suite blev kørt på det rettede kodegrundlag:

```text
node --test workforce-v2/tests/*.test.js test/moduler.test.mjs test/rutedeling.test.mjs test/navadgang.test.mjs test/firebase-emulator-guard.test.mjs
```

Resultat: 71/71 bestået. Den nye miljøtest kontrollerer eksplicit datakilde,
tenantadskillelse i syntetiske data, afslutning af spinneren, genforsøg og
fravær af skjult Firebase-til-demo-fallback.

Derudover:

- `npm run lint`: bestået.
- `npm run build`: bestået med Vite 5.4.21, 732 transformerede moduler. Kun den
  allerede kendte advarsel om den store PROCURE-chunk blev vist.
- `git diff --check`: ingen whitespacefejl; Git viste kun arbejdsplatformens
  eksisterende LF/CRLF-advarsler.

Den faktiske integrerede brugerflade på port 5197 blev afprøvet via AppShellens
WORKFORCE-navigation. Alle sider indlæste syntetiske demodata uden fejl eller
fastlåst spinner:

| Rute | Visning | Resultat |
| --- | --- | --- |
| `/workforce-v2` | Overblik | Bestået i browser |
| `/workforce-v2/medarbejdere` | Medarbejdere | Bestået i browser |
| `/workforce-v2/bemanding` | Bemanding | Bestået i browser |
| `/workforce-v2/fravaer` | Ferie & fravær | Bestået i browser |
| `/workforce-v2/kompetencer` | Kompetencer | Bestået i browser |
| `/workforce-v2/timer` | Timer | Bestået i browser |
| `/workforce-v2/min-arbejdsdag` | Min arbejdsdag | Bestået i browser |

Browserkonsollen havde ingen applikationsfejl. De to eksisterende React Router
v7 future-flag-advarsler var fortsat til stede.

## Autentificeret emulatorprøve og blokering

Der blev reserveret en særskilt syntetisk kontekst med projekt-ID
`demo-veyro-workforce-test` og porte 9119 (Auth), 9020 (Database), 5022
(Functions) og 9229 (Storage). Der var ingen lyttere på portene før forsøget.
Ingen produktionskonfiguration eller produktionsdata blev anvendt.

Temurin blev kun valgt for testprocessen:

```text
JAVA_HOME=C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.12.1+1\jdk-21.0.12.1+1
openjdk version "21.0.12" 2026-07-21 LTS
OpenJDK Runtime Environment Temurin-21.0.12+1
```

Firebase CLI 15.29.0 blev startet med proceslokal `JAVA_HOME`, `PATH`, de fire
loopback-emulatorværter og en tilfældig syntetisk testadgang. Den planlagte QA
var `node scripts/workforce-auth-functions-qa.mjs artifacts/workforce-v2/runtime`.
Den udførte emulatorindpakning var:

```text
npx --yes firebase-tools@15.29.0 emulators:exec --only auth,database,functions,storage --config firebase.workforce-test.json --project demo-veyro-workforce-test "node scripts/workforce-auth-functions-qa.mjs artifacts/workforce-v2/runtime"
```

Database Emulator afsluttede med kode 1, før Auth/Functions-QA eller et login
kunne begynde. `database-debug.log` viser:

```text
java.lang.IllegalStateException: failed to create a child event loop
java.io.IOException: Unable to establish loopback connection
java.net.SocketException: Invalid argument: connect
```

Fejlen kommer fra Nettys `NioEventLoop`/Java `WEPollSelectorImpl`. Det er en
lokal emulator-/værtsblokering før produktkode og Rules blev afprøvet. Den
autentificerede WORKFORCE-backendprøve, loginforløbet, tenantadskillelsen og
permissions i netop denne afsluttende kørsel er derfor **ikke bestået eller
visuelt verificeret**. Der var ingen fallback til produktion eller demodata.

## Restpunkt

Når loopbackproblemet er løst, skal den samme dedikerede emulatorgruppe startes
igen, og den normale autentificerede browserprøve skal dokumentere adgang for
tilladt bruger, afvisning uden WORKFORCE-permission, tenantadskillelse og alle
syv undermenuer mod den fælles backend. Fejlvisningen ved en utilgængelig
backend er kode- og testverificeret, men kunne ikke reproduceres gennem en
fuldt startet emulatorbrowser i denne runde.
