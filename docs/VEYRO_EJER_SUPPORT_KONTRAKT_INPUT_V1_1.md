# Ejeradapterens input til Veyro Support-kontrakt V1.1

Dato: 13. september 2026

Ejercommit: `2c25c196ae980995849a12b06f805551c98f9f63`

Kanonisk kontraktrevision: `veyro.support.v1.1`

Kanonisk kontrakt læst skrivebeskyttet fra supportsporets aktuelle commit
`42fba14dee63ee776b4ae3e76c34736737b181e6`. Ejerchatten har ikke ændret
supportsporets filer, Rules eller Functions.

## Implementeret mapping

| Ejeradapter | Fælles callable | Bemærkning |
|---|---|---|
| `hentPlatform` | `supportEjerKoelist` | Serverberegnede portalprojektioner flettes kun ind i læsevisningen. |
| hent sag | `supportEjerSagHent` | `traadId` mappes til kanonisk `sagId`. |
| `overtag` | `supportEjerOvertag` | Nyt `anmodningId` og forventet sagsrevision. |
| `opdaterStatus` | `supportEjerStatusOpdater` | Ingen ny serverstatus opfindes i UI. |
| `noteSkriv` | `supportEjerNoteSkriv` | Intern note sendes aldrig som kundebesked. |
| `kladdeGem` | `supportEjerSvarKladdeGem` | Kanal `portal`, `forventetSagRevision` og kladderevision. |
| `svarGodkend` | `supportEjerSvarGodkend` | Konkret kladde-id og revision. |
| `svarSend` | `supportEjerSvarTransporter` | Aldrig `supportEjerSvarSend`. |

Portal vælges kun ved
`traad.kilde.adapter === "veyro.support.v1.1"`. Eksisterende mailtråde bruger
fortsat deres eksisterende autoritative model. Adapteren opretter ikke en
portaltråd under `udbyder/salgsindbakke/traade`.

## Statusmapping i ejerfladen

- `triage` uden ansvarlig → **Skal fordeles**.
- `triage` med ansvarlig → **Faglig afklaring**.
- `afventer_os` → **Afventer os**.
- `afventer_kunden` → **Afventer kunden**.
- `loest`/`lukket` → **Løst**/**Lukket**.

Mappingen bruges i Supportkø, supportdetalje og Mail. Den ændrer ikke den
kanoniske serverstatus.

## Konkrete behov til samlingschatten

1. Gør ejerbuildens emulatorhosts/-porte konfigurerbare, så begge faktiske
   frontends kan bruge projekt `demo-veyro-support-samling` på Auth 9198,
   Database 9290 og Functions 5099. Ejerens integrationsfil `src/firebase.js`
   er ikke ændret i denne runde.
2. Lever en kanonisk V1.1-operation for intern AI og eventuelt intern
   sagsoplysning. Den nuværende kontrakt har `support/internAi/<sagId>` som
   model, men ingen afsluttet ejeroperation. Ejeradapteren fejler lukket og
   opretter ingen lokal kopi.
3. Bevar V8-resultatformatet `{ok,data,besked}`. `aborted` skal kunne udløse
   genindlæsning uden tab af usendt tekst; `permission-denied` må ikke føre til
   bredere genforsøg.
4. Samlingsprøven skal bevise kunde → eskalering → ejer → konkret godkendt
   portalsvar → samme kundesamtale samt afvisning efter ændret grundlag.
5. Serveren skal fortsat udelukke interne noter, intern AI og interne kilder
   fra kundepayloaden og samle personlig signatur præcis én gang.

## Lokal afgrænsning

Ejerens eksisterende e-mailflow er lokalt verificeret med konkret syntetisk
kundepayload, én signatur og uden intern tekst. Portaltransporten er adapterklar,
men ikke kaldt gennem begge faktiske UI'er mod den fælles backend. Ekstern AI,
mail, filtransport og drift er ikke aktiveret.
