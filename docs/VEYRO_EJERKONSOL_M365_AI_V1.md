# Veyro ejerkonsol — Microsoft 365 og OpenAI aktiveringskontrakt v1

Opdateret: 2026-09-10

## Sikker standard

Begge integrationer starter som `ikke_tilsluttet`. Repositoryet indeholder
ingen produktionshemmeligheder, og isolerede tests må kun bruge syntetiske
mails og eksplicitte emulatoradaptere. En testadapter må ikke kunne aktiveres i
et andet projekt eller uden alle lokale emulatorslutpunkter.

## Microsoft 365

Før aktivering skal en administrator dokumentere, om
`info@veyrosystems.com` er delt postkasse, selvstændig postkasse eller alias,
og registrere den faktiske underliggende postkasses stabile Graph-id. Der
oprettes ikke en ny postkasse alene for integrationen.

Entra-applikationen skal have mindst mulige rettigheder afgrænset til den
valgte postkasse. Den konkrete delegated/application-model besluttes sammen
med driftsformen; mailbox-scoped application access skal bruges, hvis
application permissions vælges. Hemmeligheder opbevares som Functions-secrets.

Dokumenterede Graph-kontrakter:

- Mappebaseret delta: `GET /users/{id}/mailFolders/{id}/messages/delta`.
  Gem hele den returnerede `@odata.deltaLink`, og behandl oprettelser,
  opdateringer og sletninger idempotent.
- Mailoversigt/shared mailbox: `GET /users/{id}/messages`.
- Kladde: `POST /users/{id}/messages` med `Mail.ReadWrite`.
- Svarudkast: `POST /users/{id}/messages/{id}/createReply`.
- Afsendelse: `POST /users/{id}/sendMail` med `Mail.Send`.
  HTTP 202 er kun accepteret anmodning; den må ikke vises som dokumenteret
  sendt før afstemning mod Sendt post/providerhændelse.

Kilder:

- https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/user-post-messages?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview?view=graph-rest-1.0

## OpenAI

Integrationen bruger Responses API på serveren. Aktivering kræver et
Functions-secret, et eksplicit godkendt modelnavn og en atomisk månedlig
request-/tokenramme. Der sendes aldrig data fra andre sager, hele CRM'et eller
ikke-godkendt fælles viden. `store: false` bruges, så responsen ikke lagres hos
API'et via standardindstillingen.

Analysen returnerer struktureret JSON og lagres separat fra bekræftede
kundedata. Brugerens interne AI-samtale er heller ikke mailindhold. Hverken
analyse eller samtale kan ændre pipeline, aftaler, tenant, pris, rabat, moms
eller total automatisk.

Officiel kontrakt:

- `POST /v1/responses`
- `instructions` holder systemregler adskilt fra ubetroet maildata.
- struktureret JSON-output begrænser analyseformen.
- `max_output_tokens` og svarfeltet `usage` bruges til budgethåndhævelse og
  afstemning.

Kilde:

- https://developers.openai.com/api/reference/cli/resources/responses/methods/create

## Aktiveringstjekliste

1. Verificér postkassetype, underliggende mailbox-id og ejer-/send-as-rettigheder.
2. Opret/afgræns Entra-applikation og Graph-rettigheder; registrér tenant- og
   client-id som konfiguration og credentials som secrets.
3. Etablér webhook/delta-job med valideret callback, checkpointovervågning og
   alarmering. Kør først en syntetisk end-to-end-afprøvning.
4. Vælg OpenAI-model og månedlige request-/input-/outputgrænser. Tilføj secret
   uden for repositoryet og aktiver først på en ikke-produktionssag.
5. Godkend vidensbasens kilder og leveringsstatus før AI-forslag anvendes.
6. Aktivér ingen virkelig afsendelse eller AI-overførsel som del af merge,
   migration eller deployment; aktivering er en separat driftsbeslutning.
