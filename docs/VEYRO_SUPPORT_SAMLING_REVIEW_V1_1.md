# Veyro Support – samlingsreview V1.1

Dato: 13. september 2026. Lokal udvikling; ingen push, merge eller deployment.

## Resultat

Den fælles supportkontrakt, kundedelen og serverforbindelsen er afsluttet på
produktcheckpoint `aa269edc0e757ff6b5c2f2beddd628c643057c71`.
Kontrakten er afstemt mod ejerens V8.1-produkt
`2c25c196ae980995849a12b06f805551c98f9f63` og seneste branch-HEAD
`7fa23cdd7f189e9adec8e56fb36168ad2d547fc3`.

Et isoleret browserforløb gennem begge faktiske arbejdsflader viste én
autoritativ sag fra kunde til ejer og tilbage. Ejerens permanente V8.1-
adapterændring er fortsat ejerchattens ansvar; forbindelsesprøven brugte en
midlertidig, ikke-committet komposit og ændrede ikke ejer-worktreeet.

## Samlet bevis

Syntetisk sag: `-P1Pq9RWrwESVAb79EhO`, supportnummer `SUP-2026-00001`.

1. Kunden loggede ind og oprettede en FLEET-sag i `/support`.
2. Kundens lokale AI brugte kun en kundegodkendt videnskilde.
3. Kunden eskalerede samme sag.
4. Ejerens `/main/support` viste samme id i den fælles kø.
5. Ejeren overtog sagen, anvendte intern AI og gemte intern sagsbaggrund.
6. Ejeren lavede kladde, gennemså, godkendte og transporterede via portal.
7. Kunden genindlæste samme sag og så det samme ejersvar.
8. DOM-kontrol fandt hverken intern baggrund, intern viden eller intern
   AI-instruktion i kundens payload. Der var ingen nye konsolfejl.

Afslutningstilstanden i begge UI'er blev visuelt optaget i den lokale
Codex-testsession. Repositoriebeviset er bevidst tekstligt og maskinlæsbart;
det indeholder ikke browserprofil, tokens eller credentials. Resultaterne
ligger i `browser-observation.md`, `browser-result.json` og
`emulator-result.json` i evidensmappen.

## Sikkerheds- og kontraktkontrol

| Kontrol | Resultat |
| --- | --- |
| Isoleret Auth/Database/Functions-forløb | Bestået på projekt `demo-veyro-support-samling`, porte 9198/9290/5099 |
| Identitet | `sagId === traadId`; ingen parallel salgstråd |
| Ejergrænse | `udbyder`-claim og ansvarlig ejer kræves for writes |
| Tenant/kunde | anden tenant, kollega i samme tenant og anonym bruger afvist |
| Intern datagrænse | noter, intern AI og baggrund ikke returneret til kunde |
| Stale godkendelse | afvist efter ændret sagsgrundlag |
| Idempotens | transport, intern AI og baggrund gav samme resultat ved identisk retry |
| Forsinket kunde-AI | bortfaldt efter menneskelig overtagelse |
| Signatur | emulatorprøven beviste præcis én samling af separat signatur |

## Kørte kontroller

| Lag | Kommando | Resultat |
| --- | --- | --- |
| Målrettede tests | `node --test test/support.test.mjs test/support-kontrakt-v1.test.mjs test/firebase-emulator-guard.test.mjs test/functions-delt.test.mjs` | 78/78 bestået, 6 suites |
| Fuld Rules-gate | `npm run test:rules` med Node 24, JDK 21 og Firebase CLI 15.29 | 4.304/4.304 bestået, 878 suites, 0 fejl |
| Functions-syntaks | `node --check functions/support-endpoints.js` og `functions/index.js` | Bestået |
| Delte kopier | `npm run delt:kopier` og paritetskontrol i tests | Bestået |
| Lint | `npm run lint` | Bestået |
| Produktionsbuild | `npm run build` | Bestået; Vite 5.4.21, 570 moduler |
| Midlertidig ejerkomposit | `npm run build` | Bestået; 540 moduler |
| Whitespace | `git diff --check` før produktcommit | Bestået |

Første fulde Rules-kørsel på Node 20 gav én miljøfejl i PLANNINGs brug af
`Map.groupBy`; uændret kode bestod på repositoryets aktuelle Node 24-miljø.
Det var ikke en support-, Rule- eller adgangsfejl. Firebase-emulatorens linje
om `JAVA_TOOL_OPTIONS` var misvisende; emulatorerne fortsatte, og hele suiten
sluttede grønt.

## Begrænsninger og resterende afhængigheder

- Ejerchatten skal committe den dokumenterede V8.1-adaptermapping på sin egen
  branch. Den fulde kontrakt står i
  `VEYRO_SUPPORT_EJERADAPTER_OVERLEVERING_V1_1.md`.
- Den faktiske UI-prøve havde ikke en separat mail-signaturservice; præcis én
  signatur er derfor bevist i serverens emulatorflow, ikke visuelt med en
  konfigureret ejersignatur.
- Ekstern AI, rigtig mail, vedhæftninger, fælles filupload, produktionsdata,
  historisk migration og deployment er ikke aktiveret.
- Den kendte CSS-minifieradvarsel og rapporterede dependency-advisories er ikke
  ændret i denne afgrænsede opgave.
- Browserporte 5215/5216 og de isolerede emulatorer var midlertidige. Den
  eksisterende port 5214 og andre servere blev ikke ændret.
