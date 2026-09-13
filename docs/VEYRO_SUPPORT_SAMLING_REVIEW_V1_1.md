# Veyro Support – samlingsreview V1.1

Dato: 13. september 2026. Lokal udvikling; ingen push, merge eller deployment.

## Resultat

Den kanoniske supportkontrakt og den fælles serverbro er afstemt mod ejerens
aktuelle V8-input og lokalt checkpointet i
`1ba18d529093322f4442b04791aeb97a219eb0f4`.

Functions-emulatoren beviser et samlet, autoritativt tekstforløb fra kunde til
ejer og tilbage i samme sag. Det faktiske browserforløb gennem begge UI'er er
**ikke afsluttet**: ejerens læste V8-adapter på
`29b8b0252384cc111e58b3bfe279a18e56046642` har fortsat
`portalForbundet: false` og læser ejerens eksisterende salgstråde. Det ville
være forkert at bruge to adskilte localStorage-demoer som bevis for en fælles
forbindelse.

## Læst grundlag og ejerskab

| Del | Branch/commit | Resultat |
| --- | --- | --- |
| Kunde/support | `codex/support-kundeplatform-development` fra `404b20b43fbd690429c19224988af797d41e30cd` | ændret lokalt |
| Fælles V1.1-kontrakt/backend | `1ba18d529093322f4442b04791aeb97a219eb0f4` | klar til ejeradapter |
| Ejer V8 | `codex/ejer-integrated-development` på `29b8b0252384cc111e58b3bfe279a18e56046642` | kun læst |

Support-/integrationssporet ejer kontrakt, `support/`-model, fælles Functions,
Rules og delte supportpolitikker. Ejerchatten ejer fortsat
`EjerSupportV2.jsx`, `EjerMailV71Samtale.jsx` og
`src/fleet/ejer-support-adapter.js`. Der er ikke skrevet i ejer-worktreeet.

## Afstemt forbindelse

- Nye portalsager har `sagId === traadId` og lever kun autoritativt under
  `support/`.
- Ejerens V8 får en serverberegnet read-projektion. Der skrives ingen parallel
  kopi i `udbyder/salgsindbakke/traade`.
- Kundeidentitet og tenant kommer fra signerede claims. En eventuel
  virksomhedsrelation verificeres server-side.
- Portalstatus mappes til V8-status som dokumenteret i den kanoniske kontrakt.
- Ejersvar følger `kladdeGem → svarGodkend → svarTransporter`. Det gamle
  `supportEjerSvarSend` fejler lukket.
- Kladdehashen binder saggrundlag, modtager, portal, tekst, separat signatur og
  vedhæftningsliste. Nyt kundeinput forælder godkendelsen.
- Kun ejerens faktiske metadata
  `vidensstatus: godkendt` + `publikum: kunde_godkendt` + aktuel revision,
  kilde, indhold og relevant produktversion kan bruges kundevendt.

Den præcise klientmapping og fejlkontrakt findes i
`docs/VEYRO_SUPPORT_AFSTEMNING_V1_1.md`.

## K1–K8

| ID | Backend/domæne | Faktiske UI'er | Samlet status |
| --- | --- | --- | --- |
| K1 | Functions-prøven hentede kendt kilde `godkendt`, revision 3, filtrerede tokenfelt og bevarede samme sag gennem eskalering | Kundens `/support` er visuelt kontrolleret, men kører fortsat den lokale supportprototype og ikke den fælles emulatorbro | Delvis |
| K2 | Ejerens kø og enkeltsag returnerede samme `sagId`/`traadId`; databasen havde ingen parallel salgstråd | V8 UI'et er kontrolleret, men dets adapter har `portalForbundet: false`; Mail/Support har derfor ikke åbnet emulatorens sag | Blokeret på ejeradapter |
| K3 | Domænetesten beviser revisions-/ansvarsgaten for et forsinket AI-resultat | Et reelt forsinket generationskald er ikke kørt; ekstern AI er bevidst deaktiveret | Delvis |
| K4 | Intern note var usynlig for kunden; kladde blev gemt, godkendt og transporteret én gang med én signatur | Ejerens faktiske kladde-/godkendelsesknapper har ikke kaldt de nye portalendpoints; intern AI for portalprojektionen mangler endelig klientafstemning | Delvis |
| K5 | Direkte svar blev afvist; ændret saggrundlag gjorde godkendelsen ugyldig; retry gav samme `beskedId` | UI-delen afventer ejeradapter | Backend bestået, UI blokeret |
| K6 | Kundeopfølgning genstartede ikke AI; løsning og genåbning beholdt samme sag | Kundens aktuelle lokale UI er kontrolleret, men ikke mod det fælles emulatorforløb | Backend bestået, UI delvis |
| K7 | To tenants, to kunder i samme tenant, anonym bruger og to ejere blev prøvet. Kollegas, anden tenants og anonym læsning blev afvist; anden ejer kunne læse fælleskøen, men ikke ændre overtaget sag | Private mailtrådes eksisterende grænse er bevaret, men er ikke koblet til portalsagen | Backend bestået, samlet delvis |
| K8 | Godkendt, kundepublikum, aktuel artikelrevision og versionsmatch er prøvet; intern, kladde, forældet, utilgængelig og modstridende metadata udelukkes i målrettede tests | Kundens nuværende lokale demo er ikke bevis for ejerens levende vidensarbejdsflade | Kontrakt/test bestået, UI delvis |

## Maskin- og testbevis

| Lag | Kommando/miljø | Resultat |
| --- | --- | --- |
| Functions/Auth/RTDB | `firebase emulators:exec --only auth,functions,database --config firebase.support-samling-test.json --project demo-veyro-support-samling "node scripts/test-support-samling-v1-1-emulator.mjs"` | bestået, exit 0 |
| Samlet Rules/platform | `npm run test:rules` i isoleret `demo-fleetcontrol-rules-test` | 4.303/4.303 bestået |
| Målrettet uden emulator | `node --test test/support.test.mjs test/support-kontrakt-v1.test.mjs test/firebase-emulator-guard.test.mjs` | 48/48 bestået |
| Målrettet Rules alene | samme direkte kommando plus `test/rules.support-v1.test.mjs`, men uden emulator | miljøfejl som forventet: emulatorhost manglede; filen bestod i den fulde gate |
| Lint | `npm run lint` | bestået |
| Produktion | `npm run build` | bestået, 570 moduler |
| Whitespace | `git diff --check` før kodecommit | bestået |

Runtime for Functions-prøven var Node `20.20.2` fra
`C:\Users\DennisChristensen\Tools\Node\node-v20.20.2-win-x64`.
Rules-emulatoren brugte Temurin JDK `21.0.11+10` fra
`C:\Users\DennisChristensen\Tools\Adoptium\jdk-21.0.11+10\jdk-21.0.11+10`
og Firebase CLI `15.29.0`. Java-valget, `TEMP`/`TMP` og
`JAVA_TOOL_OPTIONS` var kun sat i testprocessen. Firebase CLI skrev en
misvisende `Unexpected rules runtime error`-linje med den valgte
`JAVA_TOOL_OPTIONS`; emulatoren kørte videre, og hele suiten sluttede grønt.

Produktionsbuilden har den allerede kendte CSS-minifieradvarsel om backticks i
en kommentar. Functions-emulatoren advarer desuden om en ældre
`firebase-functions`-version. Der er ikke foretaget bred dependencyopgradering.

Det syntetiske emulatorresultat er gemt uden tokens i
`docs/support-samling-v1-1-evidence/emulator-result.json`.

## Browserobservation

- Kunde: `http://127.0.0.1:5214/support` viste den byggede Hjælp og support-
  arbejdsflade og markerede sig som lokal supportprototype.
- Ejer: `http://127.0.0.1:5213/main/support` viste den faktiske V8 Support-
  arbejdsflade med ejerens separate syntetiske V8-datasæt.
- De viste sager var ikke den samme sag. Der er derfor ikke vedlagt et
  skærmbillede, der påstår en fælles browserforbindelse.

Observation og billedbegrænsning står i
`docs/support-samling-v1-1-evidence/browser-observation.md`.

## Konkret restarbejde i ejerchatten

1. Vælg portaltransport når `traad.kilde.adapter === "veyro.support.v1.1"`.
2. Hent køen med `supportEjerKoelist` og sagen med `supportEjerSagHent`.
3. Map `traadId` til `sagId` for overtagelse, status og note.
4. Send `forventetSagRevision: valgt.revision` ved kladdegemning og behold
   V8's eksisterende kladderevision.
5. Map V8-metoden `svarSend` til `supportEjerSvarTransporter`; kald aldrig
   `supportEjerSvarSend`.
6. Fail closed på `permission-denied`; genindlæs ved `aborted`; omdan aldrig
   Functions-fejl til succes.
7. Afstem V8's interne AI-/oplysningshandlinger for portalprojektionen uden at
   oprette en parallel salgstråd.
8. Kør K2 og K4 gennem begge byggede apps mod samme emulatorprojekt, og tag
   de manglende screenshots med samme id, commit og ikke-hemmelig konfiguration.

## Ikke aktiveret

Ekstern AI, rigtig mail, filupload/vedhæftning, deployment, produktionsdata og
historisk migration er ikke aktiveret. Serveren afviser fortsat
vedhæftninger. Denne leverance er en lokal tekstintegration og en adapterklar
kontrakt, ikke en driftsaktivering.
