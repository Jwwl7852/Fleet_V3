# Veyro Support Contract V1.1

Status: kanonisk lokal kontrakt, 13. september 2026. Ikke deployet.

Dokumentrevision: `veyro.support.v1.1`. V1.1 erstatter V1 for nye portalsager,
fordi ejersvar nu er bundet til en konkret kladde, indholdshash, menneskelig
godkendelse og separat portaltransport. Eksisterende mail-/supportsager i
ejerens V8-model migreres ikke i denne runde.

Afstemt mod:

- supportsporets base `404b20b43fbd690429c19224988af797d41e30cd`;
- ejerens V8-input på `29b8b0252384cc111e58b3bfe279a18e56046642`;
- `docs/VEYRO_EJER_SUPPORT_KONTRAKT_INPUT_V1.md` i ejer-worktreeet.

## Ejerskab

| Område | Eneste kodeejer |
| --- | --- |
| Kontrakt, fælles supportmodel, serverfunktioner, Rules og delte supportpolitikker | Integrations-/supportsporet |
| Kundens `/support`, kundeadapter og kundevendt lokal AI | Integrations-/supportsporet |
| Ejerens V8 Support/Mail-præsentation, intern AI-arbejdsflade og klientadapter | Ejerchatten |
| AppShell, login, claims, fælles tema og root-dependencies | Integrationschatten |

Ejeradapteren må kun kalde de fælles `supportEjer*`-operationer for nye
portalsager. Den må ikke skrive direkte i `support/` eller vedligeholde en
redigerbar kopi under `udbyder/salgsindbakke/traade`.

## Identitet og autoritativ lagring

For en ny portalsag gælder altid `sagId === traadId`. Supportnummeret er kun
visning og må ikke bruges som fremmednøgle. Reload, eskalering, overtagelse,
modulskift, løsning og genåbning bevarer samme id.

```text
support/sager/<sagId>                    autoritativ sag, status og ansvar
support/beskeder/<sagId>/<beskedId>      kundesynlig dialog
support/interneNoter/<sagId>/<noteId>    kun ejer
support/internAi/<sagId>/...             kun ejer; V8-projektionens aiArbejdsrum
support/svarKladder/<sagId>/<kladdeId>   kladde, godkendelse og transportstatus
support/idempotens/<aktor>/<anmodningId> serverreservation
tenants/<tenantId>/supportsager/<sagId>  afledt minimalt kundeindeks
```

`supportEjerKoelist` og `supportEjerSagHent` beregner en V8-kompatibel
read-projektion. Projektionen har `id`, `traadId`, `sagstype: support`,
`beskeder`, `noter`, `aiArbejdsrum`, `svarKladder`, `support`, `links`,
`revision` og `senesteAktivitetMs`; den gemmes ikke som en salgstråd.

Eksisterende V8-mail-/supportsager forbliver autoritative i
`udbyder/salgsindbakke/traade`. De bruger deres eksisterende adapter og private
synlighedsregler. En senere migration eller entydig serverkobling er en separat
reviewopgave. `mailTraadId` oprettes ikke ud fra navn, mailadresse eller
kundepayload.

En portalsag indeholder mindst:

```js
{
  kontraktVersion: "veyro.support.v1.1",
  id, traadId, nummer,
  tenantId, oprettetAfUid,
  kontaktNavn, kontaktEmail, virksomhedsnavn,
  virksomhedId, // kun når udbyder/kunder/<tenantId> bekræfter relationen
  status, ansvarstype, ansvarligUid,
  emne, problemResume, modul, programversion, side,
  afproevedeTrin, anvendteKilder, eskaleringsaarsag,
  revision, oprettetMs, opdateretMs, eskaleretMs, overtagetMs, loestMs
}
```

## Adgang og indholdsgrænser

- Kunden identificeres kun fra serversessionens `uid` og `tenant`.
- V1.1-kunden kan kun læse egne sager, hvor både tenant og `oprettetAfUid`
  matcher. En administrator får ikke automatisk adgang til kollegers sager.
- Ejeroperationer kræver det signerede claim `udbyder === true`.
- Portalsager er delt i ejerens supportkø. De fælles endpoints åbner aldrig
  ejerens private mail-/salgstråde.
- Browser-SDK'et har ingen direkte læse- eller skriveadgang til `support/`.
- Kunden ser kun beskeder med `synlighed: kunde` og afsender `kunde`, `ai`
  eller `ejer`. Interne noter og intern AI returneres aldrig fra kunde-API'et.
- Kundepayload kan ikke markere tekst som AI-/ejersvar eller som godkendt viden.

Kontekst filtreres på serveren. Modul, version, side og ufølsomme tekniske
felter kan medtages. Tokens, passwords, vilkårlige objekter og automatisk
skærmoptagelse fjernes.

## Status og V8-mapping

| Portalstatus | Ansvar | V8-status |
| --- | --- | --- |
| `aiDialog` | lokal kundebot | `ny` |
| `afventerSupport` | fælles ejerkø | `triage` |
| `underBehandling` | én `ansvarligUid` | `afventer_os` |
| `afventerKunde` | én `ansvarligUid` | `afventer_kunden` |
| `loest` | ingen automatisk aktivitet | `loest` |

V8 må skrive `triage`, `afventer_os`, `afventer_kunden` og `loest` gennem
`supportEjerStatusOpdater`. `ny` og `lukket` er ikke skrivbare mappinger for en
portalsag. Overtagelse kræver forventet sagsrevision og sætter atomisk
`ansvarstype: ejer`, `ansvarligUid` og ny revision.

AI-publicering kontrollerer umiddelbart før write, at sagen fortsat er i
`aiDialog`, har AI-ansvar, ingen menneskelig ansvarlig og samme revision som
ved genereringsstart. Et forsinket resultat bortfalder efter eskalering eller
overtagelse. En kundebesked efter overtagelse fortsætter samme sag og starter
ikke kundebotten igen.

## Vidensgodkendelse

Kundeadapteren læser ejerens vedligeholdte model under
`udbyder/vidensbase/poster`. En post kan kun levere kundevendt løsningsindhold,
når alle følgende er sande:

```js
post.vidensstatus === "godkendt"
post.publikum === "kunde_godkendt"
post.aktuelVersion > 0
post.titel && post.indhold && post.kilde
post.leveringsstatus er tom eller "tilgaengelig"
```

Ældre `godkendt`/`kundeGodkendt`-booleans er ikke autoritative og giver aldrig
alene kundeadgang. Kladde, intern, forældet, utilgængelig eller modstridende
metadata udelukkes. AI-beskeden gemmer den konkrete kilde og version. En ny
artikelrevision skal gennemgås og mærkes igen; godkendelse arves ikke gennem
et ekstra lokalt flag.

## Kundeoperationer

Alle writes kræver et 8–80 tegn langt `anmodningId`.

- `supportSamtaleStart({ anmodningId, emne, tekst, kontekst })`
- `supportSamtalerList()`
- `supportSamtaleHent({ sagId })`
- `supportBeskedSend({ sagId, anmodningId, tekst, vedhaeftninger: [] })`
- `supportEskaler({ sagId, anmodningId, aarsag })`
- `supportSagLoes({ sagId, anmodningId })`
- `supportSagGenaabn({ sagId, anmodningId })`

Kundesvar er `{ sag, beskeder }`; `sag.id` og `sag.traadId` er identiske.
Servervedhæftninger afvises, indtil Storage-, scanning-, retention- og
downloadkontrakten er implementeret.

## Ejeroperationer og godkendelsesbinding

- `supportEjerKoelist()` → `{ traade: { [sagId]: V8Traad } }`
- `supportEjerSagHent({ sagId })` → `{ traad: V8Traad }`
- `supportEjerOvertag({ sagId, anmodningId, forventetRevision })`
- `supportEjerStatusOpdater({ sagId, anmodningId, status, forventetRevision })`
- `supportEjerNoteSkriv({ sagId, anmodningId, tekst })`
- `supportEjerSvarKladdeGem({ sagId, anmodningId, id, kanal: "portal",
  tekst, signatur, vedhaeftninger: [], forventetSagRevision,
  forventetRevision })`
- `supportEjerSvarGodkend({ sagId, anmodningId, id, forventetRevision })`
- `supportEjerSvarTransporter({ sagId, anmodningId, id,
  forventetRevision })`

Kladdehashen binder kanal, modtager-uid, tekst, separat signatur, valgte
vedhæftninger og sagens grundrevision. Godkendelsen binder den præcise hash til
den godkendende ejer. Transport kræver samme ansvarlige ejer, samme sag,
samme godkendte kladde, samme hash og samme sagsgrundlag. Nyt kundeinput eller
ændret kladde kræver ny gennemgang.

`supportEjerSvarSend` er bevaret som en fail-closed overgang og returnerer
altid `failed-precondition`. V8-adapterens eksisterende metode `svarSend` skal
mappe til `supportEjerSvarTransporter`, aldrig til dette legacy-navn.

I den lokale V1.1-prøve er `portal` den eneste transport. Den skriver præcis
én kundesynlig besked og samler signaturen én gang. Samme transport-
`anmodningId` kan genforsøges og returnerer samme `beskedId`. Rigtig mail og
implicit dobbeltlevering er ikke aktiveret.

## Fejlkontrakt

- `unauthenticated`: ingen verificeret session.
- `permission-denied`: forkert tenant/bruger, manglende ejerclaim eller forkert
  ansvarlig ejer.
- `invalid-argument`: ugyldigt id, tom tekst, kanal eller payload.
- `aborted`: forventet revision matcher ikke; hent sagen igen.
- `failed-precondition`: ikke-godkendt/forældet svar, direkte send,
  vedhæftning eller anden endnu ikke aktiveret funktion.
- `already-exists`: et `anmodningId` er genbrugt til en anden operation.

## Ikke del af V1.1-aktiveringen

Kontrakten er lokal prototypekode. Der er ingen deployment, produktionsdata,
ekstern AI, rigtig mail, fælles filupload eller historisk migration. Ejerens
interne AI-/oplysningsfunktioner for en ny portalprojektion kræver fortsat en
klient-/endpointafstemning i ejerchatten; de må ikke falde tilbage til at skrive
en parallel salgstråd.
