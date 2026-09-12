# Veyro Support Contract V1

Status: kanonisk lokal integrationskontrakt, 12. september 2026. Kontrakten er
fastlagt i `codex/support-kundeplatform-development` fra base
`6e164c9a0987096f1491a1d64c1846535b14683a`. Den er ikke deployet.

Ejerchattens planlagte inputfil
`docs/VEYRO_EJER_SUPPORT_KONTRAKT_INPUT_V1.md` findes ikke på den kontrollerede
ejer-HEAD `47c06020af5e00c302ea9b01ef316b10cbbd74fe`. Felter mærket
**ejeradapter** skal derfor bekræftes mod det input før en senere samling.

## Formål og ejerskab

Kontrakten forbinder én kundesamtale med én supportsag. Eskalering, reload,
modulskift og kanalskift opretter ikke en ny sag. Mail er en alternativ kanal,
ikke identiteten; mailadresse eller virksomhedsnavn må aldrig bruges som sikker
sagskobling.

| Område | Eneste kodeejer |
| --- | --- |
| Kontrakten, `src/fleet/support.js`, delte serverkopier, support-endpoints og regler for `support/` | Integrations-/supportsporet |
| Kundens `/support`, kundevendt lokal AI-adapter og kundeprøver | Integrations-/supportsporet |
| Ejerkonsollens Support, interne noter, intern AI og svararbejdsflade | Ejerchatten |
| Fælles AppShell, login, claims, tema og root-dependencies | Integrationschatten |

Ejerchatten må implementere en adapter mod denne kontrakt, men opretter ikke
parallelle offentlige endpoints eller en anden fælles sagsnode. Ændringsbehov i
de fælles filer afleveres med konkret commit, felt og begrundelse.

## Identitet og lagring

Den autoritative sag ligger i `support/sager/<sagId>` og bærer `tenantId` og
`oprettetAfUid`. Kundens liste findes gennem
`tenants/<tenantId>/supportsager/<sagId>`. Kundesynlige beskeder ligger i
`support/beskeder/<sagId>/<beskedId>`. Interne noter og intern AI ligger i hver
sin serverbeskyttede samling og returneres aldrig fra kundeoperationer.

```text
support/sager/<sagId>
support/beskeder/<sagId>/<beskedId>
support/interneNoter/<sagId>/<noteId>
support/internAi/<sagId>/<postId>
support/idempotens/<uid>/<anmodningId>
tenants/<tenantId>/supportsager/<sagId>
```

En sag har mindst:

```js
{
  kontraktVersion: "veyro.support.v1",
  id, tenantId, oprettetAfUid,
  status, ansvarstype, ansvarligUid,
  emne, problemResume, modul, programversion, side,
  afproevedeTrin: [], anvendteKilder: [], eskaleringsaarsag,
  mailTraadId: null, // ejeradapter; kun verificeret intern id-kobling
  revision, oprettetMs, opdateretMs, eskaleretMs, overtagetMs, loestMs
}
```

V1-kundeadgang er bevidst **egne sager**: både tenant og
`oprettetAfUid === auth.uid` skal passe. Administratorrollen giver ikke i sig
selv adgang til kollegers sager. En senere virksomhedsdelt visning kræver en
ny, serverhåndhævet kontraktversion og kan ikke udledes af rollen i klienten.
Ejere har ingen tenant og må kun bruge ejeroperationerne med det signerede
`udbyder === true`-claim.

## Beskedtyper og synlighed

Kundens tråd indeholder kun `synlighed: "kunde"` og en afsender af typen
`kunde`, `ai` eller `ejer`. En AI-besked bærer den anvendte kundegodkendte
kilde og vidensversion. Interne noter og intern AI har ingen kundesynlig
variant og må ikke dukke op i kundelæsning, kundesøgning eller notifikationer.

Vedhæftninger refereres med serverudstedt id, navn, MIME-type, størrelse og
status. Filindhold må ikke ligge i samtaleposten. Download kræver samme
tenant-/brugerprøve som sagen og en kortlivet serverudstedt URL. Den lokale V1
viser filvalget og metadata, men den fælles Storage-transport er en åben
afhængighed og må ikke foregive upload.

Kontekst filtreres servermæssigt gennem allowlisten i `support.js`: aktuel
side, modul, programversion, browser/app-version, bruger-id, tidspunkt og
eventuelt fejl-id. Tokens, passwords, automatisk skærmoptagelse og vilkårlige
feltværdier er forbudt. Kunden skal kunne se konteksten før afsendelse.

## Status og ansvar

| Status | Ansvar | Tilladt automatisk kundesvar |
| --- | --- | --- |
| `aiDialog` | `ai` | Ja, hvis revision og ansvar stadig matcher ved publicering |
| `afventerSupport` | `ejer` | Nej |
| `underBehandling` | én `ansvarligUid` | Nej |
| `afventerKunde` | én `ansvarligUid` | Nej |
| `loest` | ingen automatisk aktivitet | Nej; kunden kan genåbne samme sag |

`Kontakt support`, utilstrækkelig viden, manglende fremgang og alvorlig drift
fører til `afventerSupport`. Overtagelse kræver forventet revision og gør én
ejer ansvarlig. AI-publicering gentjekker på serveren, at sagen stadig står i
`aiDialog`, at `ansvarstype === "ai"`, og at revisionen er den samme som ved
genereringsstart. Ellers bortfalder svaret. En kundebesked efter overtagelse
går til samme sag og starter ikke botten igen.

`Det løste problemet` sætter `loest` efter en udtrykkelig kundehandling.
`Jeg har stadig brug for hjælp` genåbner samme sag til `afventerSupport`; det
opretter ikke en ny sag. Stilhed eller et AI-svar løser aldrig en sag.

## Operationer

Alle skriveoperationer kræver `anmodningId` og returnerer `sagId`, `revision`
og det effektive resultat. Et genforsøg med samme bruger, operation og
`anmodningId` returnerer samme resultat. Konkurrerende tilstandsændringer
kræver `forventetRevision` og afvises som `aborted` ved mismatch.

Kundeoperationer udleder tenant og uid fra den verificerede serversession:

- `supportSamtaleStart`: start en samtale eller returnér den allerede oprettede.
- `supportSamtalerList`: list kun den aktuelle brugers egne sager via tenantindekset.
- `supportSamtaleHent`: hent sag og kun kundesynlige beskeder.
- `supportBeskedSend`: tilføj kundebesked til samme sag.
- `supportAiSvarPublicer`: publicér kun efter ansvar/revisionskontrollen.
- `supportEskaler`: stop automatisk svar og overdrag samme sag.
- `supportSagLoes` og `supportSagGenaabn`: udtrykkelige kundeskift.
- `supportVedhaeftningInitier`, `supportVedhaeftningBekraeft` og
  `supportVedhaeftningHent`: kontraktfastlagt, men fælles Storage-transport er
  ikke implementeret i denne lokale runde.

Ejeroperationer kræver `udbyder === true`:

- `supportEjerKoelist` og `supportEjerSagHent`.
- `supportEjerOvertag` med forventet revision.
- `supportEjerSvarSend` med forventet revision og kundesynlig kanal `portal`.
- `supportEjerNoteSkriv` og `supportEjerAiSkriv`, som aldrig returneres til kunden.

**Ejeradapter:** `mailTraadId`, eksisterende ejerstatusnavne og den konkrete
transport fra ejerens godkendte svarhandling skal mappes, når ejerinputtet
foreligger. Portal er direkte dialog. Rigtig mail og dobbeltafsendelse er ikke
aktiveret.

## Kundevendt AI og vidensbase

Kundebotten er kun vejledning, fejlsøgning og eskalering. Den må ikke ændre
driftsdata, roller, licenser, betaling eller kode. Kundeinput og filer er data,
ikke instruktioner om at udvide adgang.

Den fælles læseadapter bruger ejerens eksisterende
`udbyder/vidensbase/poster`-model og medtager kun poster, der både er
`godkendt === true`, `kundeGodkendt === true`, har understøttet modul/version
og en synlig kilde. Manglende eller modstridende viden giver et
opklaringsspørgsmål eller eskalering, ikke et gæt. Den lokale prøve injicerer
mærkede syntetiske poster i samme kontraktform; ingen ekstern model kaldes.

## Sikkerhed og senere aktivering

Klient-SDK'et har ingen direkte skriveadgang til `support/`. De fælles Cloud
Functions er den eneste produktionsvej og ejes af integrationssporet. Hver
operation gentager identitets-, tenant-, ejer-, synligheds- og
revisionskontrollen. En ændret sag-id eller vedhæftnings-id må derfor ikke
udvide adgang. Mindst to syntetiske tenants prøves servermæssigt.

Denne kontrakt etablerer ikke drift: ingen functions/rules er deployet, ingen
ekstern AI er aktiveret, ingen mail sendes, og ingen produktionsdata bruges.
Før samling skal ejerinputtet afstemmes, Storage-transporten implementeres og
rules-/function-emulatorprøverne køres på det præcise samlede commit.
