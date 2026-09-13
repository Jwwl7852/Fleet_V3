# Veyro Support – afstemning V1.1

Dato: 13. september 2026. Lokal udvikling; ingen push eller deployment.

## Faktisk grundlag

| Spor | Branch | Læst commit | Status ved læsning |
| --- | --- | --- | --- |
| Kunde/support | `codex/support-kundeplatform-development` | `404b20b43fbd690429c19224988af797d41e30cd` | ren før V1.1-arbejdet |
| Ejer V8 | `codex/ejer-integrated-development` | `29b8b0252384cc111e58b3bfe279a18e56046642` | tracked ren; lokale, ikke-sporede reviewartefakter urørt |

Ejerens input er læst fra
`docs/VEYRO_EJER_SUPPORT_KONTRAKT_INPUT_V1.md`. V8-præsentationen forbliver
ejerchattens ansvar og er ikke ændret i denne leverance.

## Afstemt model

| Emne | Autoritativt felt/sted | Læsevisning | Eneste skrivevej |
| --- | --- | --- | --- |
| Portalsagsidentitet | `support/sager/<sagId>`, `traadId === sagId` | kunde `sag`; ejer V8 `traad` | fælles `support*`-functions |
| Kunde/tenant | signerede claims + verificeret kundeindeks | `links.tenantId`, evt. `links.virksomhedId` | serveren |
| Status/ansvar | portalsagen | V8-mapping i kontrakten | overtag/status-endpoints |
| Kundedialog | `support/beskeder/<sagId>` | kunde-array; V8 `beskeder` | kunde-/AI-/transport-endpoints |
| Intern note | `support/interneNoter/<sagId>` | kun V8-projektion | `supportEjerNoteSkriv` |
| Intern AI | `support/internAi/<sagId>` | V8 `aiArbejdsrum` | ikke færdigkoblet i denne runde |
| Svarudkast | `support/svarKladder/<sagId>` | V8 `svarKladder` | kladde → godkend → transport |
| Videnskilde | `udbyder/vidensbase/poster` | konkret kilde/version på AI-besked | ejerens vidensarbejdsflade |
| Eksisterende mailtråd | `udbyder/salgsindbakke/traade` | eksisterende V8-adapter | eksisterende ejerendpoints; ingen migration |

Der oprettes ingen portalsagskopi under ejerens salgstråde. For en ny
portalsag er V8-objektet en ren, serverberegnet projektion.

## Adaptergrænse til ejerchatten

Ejerens `ejerSupportAdapter` skal vælge transport ud fra
`traad.kilde.adapter === "veyro.support.v1.1"`. Eksisterende tråde fortsætter
på den nuværende V8-adapter; portalprojektioner bruger nedenstående mapping.

| V8-metode | Fælles callable | Payloadmapping |
| --- | --- | --- |
| `hentPlatform` | `supportEjerKoelist` | returnér endpointets `{ traade }` direkte |
| hent én tråd | `supportEjerSagHent` | `traadId → sagId` |
| `overtag` | `supportEjerOvertag` | `traadId → sagId`, tilføj nyt `anmodningId` |
| `opdaterStatus` | `supportEjerStatusOpdater` | `traadId → sagId`; brug statusmappingen |
| `noteSkriv` | `supportEjerNoteSkriv` | `traadId → sagId`, tilføj `anmodningId` |
| `kladdeGem` | `supportEjerSvarKladdeGem` | kanal er `portal`; send både sags- og kladderevision |
| `svarGodkend` | `supportEjerSvarGodkend` | `traadId → sagId` og kladderevision |
| `svarSend` | `supportEjerSvarTransporter` | må aldrig kalde `supportEjerSvarSend` |

V8's nuværende `gemSvar` sender ikke eksplicit `forventetSagRevision`. Den
konkrete ejeradapter/komponent skal derfor tilføje
`forventetSagRevision: valgt.revision` ved portalprojektioner. Det er en
bevidst, nødvendig klientændring og må ikke erstattes af en skjult seneste-
værdi i browseren.

Eksempel uden credentials:

```js
await kaldFunktion("supportEjerSvarKladdeGem", {
  sagId: traad.id,
  anmodningId: `kladde_${crypto.randomUUID().replaceAll("-", "_")}`,
  id: kladde?.id || "portal",
  kanal: "portal",
  tekst,
  signatur,
  vedhaeftninger: [],
  forventetSagRevision: traad.revision,
  forventetRevision: kladde?.revision || 0,
});
```

Resultater normaliseres til V8's `{ ok, data, besked }` i ejerens adapter.
Functions-fejl må ikke omdannes til succes; `aborted` udløser genindlæsning,
og `permission-denied` må ikke genprøves med bredere adgang.

## Lokal backend til fælles prøve

| Del | Værdi |
| --- | --- |
| Projekt | `demo-veyro-support-samling` |
| Auth | `127.0.0.1:9198` |
| Realtime Database | `127.0.0.1:9290` |
| Functions | `127.0.0.1:5099` |
| Region | `europe-west1` |
| Runtime | Node `20.20.2`, Temurin JDK `21.0.11+10`, Firebase CLI `15.29.0` |

Offentlige Vite-navne er dokumenteret i `.env.example`:
`VITE_USE_FIREBASE_EMULATORS`, `VITE_FIREBASE_AUTH_PORT`,
`VITE_FIREBASE_DATABASE_PORT` og
`VITE_FIREBASE_FUNCTIONS_PORT`. Lokale værdier og testidentiteter må
ligge i `.env.local`, som ikke committes. Emulatorprøven opretter udelukkende
syntetiske `*.invalid`-brugere; ingen passwords eller tokens gemmes i docs.

## Ejerskab ved næste ændring

Support-/integrationssporet ejer `functions/support-endpoints.js`, eksport i
`functions/index.js`, `src/fleet/support.js`, `src/fleet/support-ai.js`, de
kontrollerede `functions/delt`-kopier, den kanoniske kontrakt og Rules.
Ejerchatten ejer `EjerSupportV2.jsx`, `EjerMailV71Samtale.jsx` og
`ejer-support-adapter.js`. Ændringsbehov i fælles filer afleveres med felt,
operation, begrundelse, commit og testbevis.

## Milepæle

- **Kontrakt klar til ejeradapter:** indholdet i dette dokument og
  `VEYRO_SUPPORT_KONTRAKT_V1.md` er konkret i
  `1ba18d529093322f4442b04791aeb97a219eb0f4`.
- **Fælles backend klar til browserprøve:** serverforløbet er bevist i den
  isolerede emulator på samme commit.
- **Ejeradapter klar:** afventer ejerchattens klientcommit mod ovenstående
  mapping.
- **Fælles forløb gennem begge faktiske UI'er:** kan først markeres bestået,
  når dette ejercommit er tilgængeligt og begge byggede apps peger på samme
  emulatorer. To lokale demo-lagre tæller ikke.
