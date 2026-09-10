# Veyro ejerkonsol — integrationsnotat v1

Opdateret: 2026-09-10

## Afgrænsning

Ejerkonsollen ligger i det integrerede produkt og er ikke et femte kundemodul.
Den bruger den eksisterende tenantløse `/main`-gren, mens kundernes egen
administration fortsat ligger bag tenantclaims. FLEET, FACILITY, PLANNING og
FAKTURACENTER ændres ikke i deres egne worktrees af dette spor.

## Fælles kontrakter berørt af etape B–C

| Fil/område | Kontrakt |
|---|---|
| `src/fleet/ejeradgang.js` | Nye ejere får `{ udbyder: true, ev: 1 }`, ingen tenant og ingen kunstig permissionliste. Legacy `{ udbyder: true }` læses fortsat. |
| `firebase.rules.json` | Rene, ikke-tilbagekaldte ejere kan læse ejerdata; tenantbrugere kan ikke. Direkte klientwrites til CRM og audit er afvist. |
| `functions/index.js` | Alle privilegerede ejer-callables bruger samme claim- og revocationkontrol og skriver serveraudit. |
| `scripts/ejer.mjs` | Afviser blandede ejer-/tenantidentiteter og opdaterer Firebase-revocation samt `authRevocations`. |
| `src/fleet/ejer-crm-regler.js` | Delt input- og domænevalidering for CRM. Kopieres mekanisk til `functions/delt/`. |
| `src/App.jsx` | Ejerens routes er fortsat adskilt fra tenantens modulrouting. `/main` og `/main/priser` bevares. |

## Vedvarende datarødder

- `udbyder/crm/virksomheder/<virksomhedId>/stamdata`
- `udbyder/crm/virksomheder/<virksomhedId>/muligheder/<mulighedId>`
- `udbyder/crm/virksomheder/<virksomhedId>/aktiviteter/<aktivitetId>`
- `udbyder/crm/virksomheder/<virksomhedId>/tidslinje/<haendelseId>`
- `udbyder/tilbud/<operationId>` med servernummer, kladde og frosne versioner
- `udbyder/sekvenser/tilbud/<YYYY>` (kun serveradgang)
- `udbyder/audit/<YYYY>/<MM>/<postId>`
- eksisterende `authRevocations/<uid>/revokeTime`

CRM-id'er er stabile RTDB-nøgler. CVR og EAN gemmes som tekst. Bindende writes
sker gennem Cloud Functions-transaktioner med forventet revision og
servergenererede tidspunkter; browseren kan kun læse CRM-data direkte.

## Modulhensyn

- Salgsinteresse bruger det faktiske `MODUL`-katalog. Mappings er fortsat
  PLANNING → `booking`, FLEET → `flaade`, FACILITY → `facility`.
- FAKTURACENTER er ikke tilføjet som et kommercielt modul.
- Ejerens kundekort viser CRM-virksomhed og eventuel `tenantId` som to
  forskellige tilstande. Det opretter ikke tenants i etape C.
- Eksisterende `Konsol.jsx` er fortsat den autoritative ejerflade for faktisk
  abonnement/modultildeling, indtil etape E samler accept og provisioning.
- Kundernes bruger- og rettighedsadministration forbliver i tenantens
  opsætning; ejerkonsollen giver ikke impersonation eller driftsdataadgang.

## Integration og migration

Ændringen er additiv og opretter ingen produktionsdata ved opstart. Der er
ingen automatisk migration af eksisterende blandede ejer-/tenantkonti; de skal
først rapporteres og håndteres manuelt. Nye CRM- og auditnoder kræver de nye
Database Rules og Functions i samme kontrollerede udviklingsudrulning. Ingen
udrulning er udført fra dette spor.

`npm run delt:kopier` skal køres før commit/deploy, så
`functions/delt/ejeradgang.js`, `functions/delt/ejer-crm-regler.js` og
`functions/delt/ejer-tilbud-regler.js` svarer byte-for-byte til kilderne under
`src/fleet/`.

## Verifikationsgrænse

Domænetests, målrettet lint, Functions-import og produktionsbuild er kørt.
Database Rules-emulatoren er endnu ikke kørt, fordi maskinens Java 8 er ældre
end Firebase CLI 15.29.0's krav om Java 21+. Derfor er AK-01–AK-04 ikke
erklæret bevist, selv om regler og testcases er implementeret.
