# Veyro ejerkonsol — integrationsnotat v1

Opdateret: 2026-09-10

## Afgrænsning

Ejerkonsollen ligger i det integrerede produkt og er ikke et femte kundemodul.
Den bruger den eksisterende tenantløse `/main`-gren, mens kundernes egen
administration fortsat ligger bag tenantclaims. FLEET, FACILITY, PLANNING og
FAKTURACENTER ændres ikke i deres egne worktrees af dette spor.

## Fælles kontrakter berørt af etape B–E

| Fil/område | Kontrakt |
|---|---|
| `src/fleet/ejeradgang.js` | Nye ejere får `{ udbyder: true, ev: 1 }`, ingen tenant og ingen kunstig permissionliste. Legacy `{ udbyder: true }` læses fortsat. |
| `firebase.rules.json` | Rene, ikke-tilbagekaldte ejere kan læse ejerdata; tenantbrugere kan ikke. Direkte klientwrites til CRM og audit er afvist. |
| `functions/index.js` | Alle privilegerede ejer-callables bruger samme claim- og revocationkontrol og skriver serveraudit. |
| `scripts/ejer.mjs` | Afviser blandede ejer-/tenantidentiteter og opdaterer Firebase-revocation samt `authRevocations`. |
| `src/fleet/ejer-crm-regler.js` | Delt input- og domænevalidering for CRM. Kopieres mekanisk til `functions/delt/`. |
| `src/fleet/ejer-tilbud-regler.js` | Fælles heltalsberegning, ratebladsoversættelse og tilbudsvalidering i browser/server. |
| `src/fleet/priser.js` | Den versionerede prisliste kan også bære tilbudsydelser; officielle priser opfindes ikke. |
| `src/App.jsx` | Ejerens routes er fortsat adskilt fra tenantens modulrouting. `/main` og `/main/priser` bevares. |
| `src/moduler/InvitationAccept.jsx` | Offentlig invitationsrute bruger normal Firebase Auth og giver kun tenantrollen `admin`. |
| `functions/tilbud-pdf.js` | Server-PDF bygges fra det frosne versionssnapshot og repositoryets Veyro-logo. |

## Vedvarende datarødder

- `udbyder/crm/virksomheder/<virksomhedId>/stamdata`
- `udbyder/crm/virksomheder/<virksomhedId>/muligheder/<mulighedId>`
- `udbyder/crm/virksomheder/<virksomhedId>/aktiviteter/<aktivitetId>`
- `udbyder/crm/virksomheder/<virksomhedId>/tidslinje/<haendelseId>`
- `udbyder/tilbud/<operationId>` med servernummer, kladde og frosne versioner
- `udbyder/tilbud/<operationId>/versioner/<n>/pdf` med Storage-sti og SHA-256
- `udbyder/aftaler/<aftaleId>/versioner/<n>` med tilbuds- og acceptsnapshot
- `udbyder/provisioneringer/provision_<tilbudId>_<version>` som genkørselslås
- `udbyder/invitationer/<invitationId>` med tokenhash, generation og livscyklus
- `udbyder/integrationer/tilbudsmail` som adapterstatus, ikke credentials
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
  forskellige tilstande. Kun et registreret accepteret tilbud kan blive til
  aftale og eventuel tenant gennem serverfunktionen.
- Eksisterende `Konsol.jsx` er fortsat den autoritative ejerflade for faktisk
  abonnement/modultildeling og viser nu sikre administratorinvitationer.
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
`functions/delt/ejer-tilbud-regler.js` samt `functions/delt/priser.js` svarer
byte-for-byte til kilderne under `src/fleet/`.

Tilbuds-PDF'en lagres kun af Admin SDK. `storage.rules` tillader hverken ejer-
eller tenantklienten direkte upload/download; hentning går gennem en
ejerbeskyttet callable med kortlivet URL. Mailadapteren sender intet, når
`udbyder/integrationer/tilbudsmail` ikke er aktiv, men registrerer forsøget som
`ikke_tilsluttet`. Manuel ekstern afsendelse er en separat auditérbar handling.

Provisioneringen bruger stabil nøgle pr. tilbudsversion, genbruger CRM's
permanente aftale-/tenantkobling og skriver tenant, kundeindeks og lås i en
samlet multi-path update. Aftaleversionen fryses før anvendelsen. En fremtidig
virkningsdato lægger en `planlagtAftale` uden at ændre det aktive abonnement;
processen skal genkøres af bruger eller senere scheduler på virkningsdatoen.

## Verifikationsgrænse

- AK-01–AK-04 og Storage: 33/33 i lokal Database/Storage Emulator.
- Normal browserlogin og ejerroute: verificeret med syntetisk tenantløs
  identitet i Auth/Database/Storage/Functions Emulator Suite.
- D/E-callables: hele kæden med samtidig write, to pris-/tilbudsversioner,
  persistent PDF, mailfejl, manuel afsendelse, accept, genkørbar provisioning
  og nye/eksisterende inviterede konti består i isoleret demo-projekt.
- Server-PDF's layoutprøve er renderet og visuelt kontrolleret.
- Mail, Dinero, OCR, MFA og produktion er ikke tilsluttet eller testet.
- Officielle Veyro-priser er ikke fundet; alle tal i emulatorflowet er tydeligt
  markerede fixtures og publiceres ikke som officielle priser.
- Firebase CLI 15.29.0/JDK 21 kan ikke bruges på denne Windows-version på
  grund af AF_UNIX-fejl. Testkommandoen bruger isoleret Temurin JDK 11,
  Node 20.20.2 og CLI 13.35.1 uden at ændre maskinens standardinstallationer.
- `npm audit --omit=dev` finder eksisterende transitive browser-/Firebase
  runtimefund. De berører også Auth/callable- og Admin Storage-overfladen og
  skal løses i et særskilt dependency-opgraderingsspor med fuld regression.
