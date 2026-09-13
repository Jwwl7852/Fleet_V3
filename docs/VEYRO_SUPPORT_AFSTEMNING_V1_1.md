# Veyro Support – afstemning V1.1

Dato: 13. september 2026. Lokal udvikling; ingen push, merge eller deployment.

## Faktisk grundlag

| Spor | Branch | Relevant checkpoint | Senest læste HEAD | Status |
| --- | --- | --- | --- | --- |
| Kunde/fælles support | `codex/support-kundeplatform-development` | `aa269edc0e757ff6b5c2f2beddd628c643057c71` | samme | produktkode committet; kun brugerens urelaterede reviewfiler er untracked |
| Ejer V8.1 | `codex/ejer-integrated-development` | `2c25c196ae980995849a12b06f805551c98f9f63` | `7fa23cdd7f189e9adec8e56fb36168ad2d547fc3` | read-only; nyere commits er dokumentation og mobilhistorik, ikke en ny serveradapter |

Ejerens nyeste kontraktinput blev læst fra
`docs/VEYRO_EJER_SUPPORT_KONTRAKT_INPUT_V1_1.md`. Ejerens V8.1-præsentation
forbliver ejerchattens ansvar og er ikke ændret i denne leverance.

## Kanonisk model

| Emne | Autoritativt felt/sted | Læsevisning | Eneste skrivevej |
| --- | --- | --- | --- |
| Portalsagsidentitet | `support/sager/<sagId>`, `traadId === sagId` | kunde `sag`; ejer V8 `traad` | fælles `support*`-Functions |
| Kunde/tenant | signerede claims + verificeret kundeindeks | `links.tenantId`, evt. `links.virksomhedId` | serveren |
| Status/ansvar | portalsagen | V8-statusmapping | overtag/status-endpoints |
| Kundedialog | `support/beskeder/<sagId>` | kunde-array; V8 `beskeder` | kunde-/AI-/transport-endpoints |
| Intern note | `support/interneNoter/<sagId>` | kun V8 | `supportEjerNoteSkriv` |
| Intern AI | `support/internAi/<sagId>` | V8 `aiArbejdsrum` | `supportEjerAiForslagGem` |
| Intern baggrund | `support/sagsOplysninger/<sagId>` | V8 `sagsOplysninger` | `supportEjerBaggrundGem` |
| Svarudkast | `support/svarKladder/<sagId>` | V8 `svarKladder` | kladde → godkend → transport |
| Videnskilde | `udbyder/vidensbase/poster` | konkret kilde/version | ejerens vidensarbejdsflade |
| Eksisterende mailtråd | `udbyder/salgsindbakke/traade` | eksisterende V8-adapter | eksisterende ejerendpoints; ingen migration |

Der oprettes ingen portalsagskopi under ejerens salgstråde. `supportEjerKoelist`
og `supportEjerSagHent` danner en read-projektion fra den ene sag.

## Endelig adaptergrænse

Ejeradapteren vælger portaltransport, når
`traad.kilde.adapter === "veyro.support.v1.1"`.

| V8-metode | Fælles callable | Payloadmapping |
| --- | --- | --- |
| `hentPlatform` | `supportEjerKoelist` | endpointets `{ traade }` |
| hent én tråd | `supportEjerSagHent` | `traadId → sagId` |
| `overtag` | `supportEjerOvertag` | nyt `anmodningId`, forventet sagsrevision |
| `opdaterStatus` | `supportEjerStatusOpdater` | portalstatusmapping + forventet revision |
| `noteSkriv` | `supportEjerNoteSkriv` | nyt `anmodningId` |
| intern AI | `supportEjerAiForslagGem` | instruktion, sags-/AI-revision, aktivitet og kladdegrundlag |
| intern baggrund | `supportEjerBaggrundGem` | værdi, sagsrevision og oplysningsrevision |
| `kladdeGem` | `supportEjerSvarKladdeGem` | kanal `portal`; sags- og kladderevision |
| `svarGodkend` | `supportEjerSvarGodkend` | kladderevision |
| `svarSend` | `supportEjerSvarTransporter` | aldrig legacy `supportEjerSvarSend` |

Adapteren normaliserer til `{ ok, data, besked }`. Functions-fejl må ikke
omdannes til succes. `aborted` udløser genindlæsning, men lokal usendt tekst
bevares; V8.1's lokale kladdestate ryddes kun efter en vellykket operation.
`permission-denied` fejler lukket og må ikke genprøves med bredere adgang.
Automatisk retry er kun gyldigt med samme operation, payload og
`anmodningId`.

Den fulde, indsættelige ejerhandoff findes i
`VEYRO_SUPPORT_EJERADAPTER_OVERLEVERING_V1_1.md`.

## Afstemt status, viden og svartransport

- Portalstatus: `aiDialog → ny`, `afventerSupport → triage`,
  `underBehandling → afventer_os`, `afventerKunde → afventer_kunden`,
  `loest → loest`.
- Kun `vidensstatus: godkendt`, `publikum: kunde_godkendt`, aktuel revision,
  kilde, titel og indhold kan skabe kundevendt AI-svar.
- Interne videnskilder kan bruges i ejerens interne analyse, men returneres
  aldrig til kunden.
- Intern baggrund hæver sagsrevisionen og gør en tidligere godkendt kladde
  stale.
- Portaltransport kræver overtaget sag, uændret sagsgrundlag, godkendt kladde
  og identisk indholdshash. Signaturen samles præcis én gang.

## Lokal backend og UI-bevis

| Del | Værdi |
| --- | --- |
| Projekt | `demo-veyro-support-samling` |
| Auth | `127.0.0.1:9198` |
| Realtime Database | `127.0.0.1:9290` |
| Functions | `127.0.0.1:5099` |
| Kunde-UI under prøven | `127.0.0.1:5216/support` |
| Ejer-UI under prøven | `127.0.0.1:5215/main/support` |
| Fælles sag | `-P1Pq9RWrwESVAb79EhO` / `SUP-2026-00001` |
| Runtime | Node `24.19.0` for Rules, Node `20.20.2` for Functions-prøven, Temurin JDK `21.0.11+10`, Firebase CLI `15.29.0` |

Faktiske UI'er viste samme sag gennem kundeoprettelse, lokal kunde-AI,
eskalering, ejerens kø, overtagelse, intern AI, intern baggrund, kladde,
godkendelse, portaltransport og kundens genindlæsning. Den midlertidige
ejerkomposit var et lokalt forbindelsesbevis; ingen ejerfiler blev committet.
Testidentiteter var syntetiske `*.invalid`-brugere, og credentials er ikke
gemt i dokumentationen.

## Ejerskab ved næste ændring

Support-/integrationssporet ejer `functions/support-endpoints.js`, eksporten i
`functions/index.js`, `src/fleet/support.js`, `src/fleet/support-ai.js`, de
kontrollerede `functions/delt`-kopier, kontrakten og Rules. Ejerchatten ejer
V8.1-komponenter og `ejer-support-adapter.js`. Ændringsbehov i fælles filer
afleveres med felt, operation, begrundelse, commit og testbevis.

Ekstern AI, rigtig mail, vedhæftninger, deployment og produktionsdata er ikke
aktiveret.
