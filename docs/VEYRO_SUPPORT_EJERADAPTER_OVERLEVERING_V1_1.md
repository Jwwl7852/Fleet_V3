# Overlevering til ejerchatten – Support V1.1

Dato: 13. september 2026. Lokal kontrakt; ingen push eller deployment.

## Checkpoints og ejerskab

- Fælles supportprodukt: `aa269edc0e757ff6b5c2f2beddd628c643057c71` på
  `codex/support-kundeplatform-development`.
- Læst ejerprodukt: `2c25c196ae980995849a12b06f805551c98f9f63`.
- Senest læst ejer-HEAD: `7fa23cdd7f189e9adec8e56fb36168ad2d547fc3`.
- Support-/integrationssporet ejer `support/`-modellen, alle `support*`-
  callables, Rules og den kanoniske kontrakt.
- Ejerchatten ejer `EjerSupportV2.jsx`, `EjerMailV71Samtale.jsx` og
  `src/fleet/ejer-support-adapter.js` samt den eksisterende V8.1-præsentation.

Der må ikke oprettes en redigerbar portalsagskopi under
`udbyder/salgsindbakke/traade`. For portalsager er `sagId === traadId`, og V8
viser den serverberegnede projektion fra `supportEjerKoelist`/
`supportEjerSagHent`.

## Adaptermapping

| V8-handling | Callable | Nødvendig mapping |
| --- | --- | --- |
| Kø | `supportEjerKoelist` | brug `{ traade }` |
| Enkeltsag | `supportEjerSagHent` | `traadId → sagId` |
| Overtag/status/note | tilsvarende `supportEjer*` | nyt `anmodningId`; send forventet revision |
| Intern AI | `supportEjerAiForslagGem` | send instruktion, sags-/AI-revision, aktivitet og kladdegrundlag |
| Intern baggrund | `supportEjerBaggrundGem` | send værdi samt sags- og oplysningsrevision |
| Kladde | `supportEjerSvarKladdeGem` | kanal `portal`; send `forventetSagRevision` og kladderevision |
| Godkend | `supportEjerSvarGodkend` | bind til præcis kladderevision |
| Send | `supportEjerSvarTransporter` | map V8 `svarSend`; kald aldrig legacy `supportEjerSvarSend` |

Alle resultater normaliseres i klienten til `{ ok, data, besked }`. Ved
`aborted` hentes sagen igen, men lokale `lokaleKladder` og usendt AI-input må
ikke nulstilles. Ved `permission-denied` fejles lukket. Automatisk retry må kun
genbruge nøjagtig samme operation, payload og `anmodningId`.

## Bevist lokal forbindelsesform

En midlertidig, ikke-committet komposit af ejerens V8.1 UI og de fælles
endpoints blev kun brugt som forbindelsesbevis. Den nødvendige permanente
ejerændring er afgrænset til:

1. miljøstyrede emulatorporte i ejerens Firebase-klient;
2. ovenstående portal-callables og payloadmapping i ejeradapteren;
3. `forventetSagRevision` fra den valgte portaltråd ved kladdegemning;
4. fail-closed håndtering, hvis irrelevante private mailendpoints ikke er med i
   en isoleret supportemulator.

Beviset anvendte `demo-veyro-support-samling`, Auth `9198`, Database `9290` og
Functions `5099`. Det viste samme sag `-P1Pq9RWrwESVAb79EhO`/
`SUP-2026-00001` gennem kundeoprettelse, lokal kunde-AI, eskalering, ejerens kø,
overtagelse, intern AI, intern baggrund, kladde, godkendelse, portaltransport og
kundens genindlæsning. Ingen ejerfiler blev ændret eller committet.

## Ikke aktiveret

Ekstern AI, mailtransport, filupload, produktionsdata og deployment er ikke
aktiveret. Ejerchatten skal implementere adaptermappingen på sin egen branch og
aflevere ét præcist commit med tests; support-/integrationssporet må ikke tage
ejerskab over V8.1-arbejdsfladen.
