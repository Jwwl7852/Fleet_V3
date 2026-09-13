# Veyro ejerkonsol — integrationsnotat v1

Opdateret: 2026-09-11

## Afgrænsning

Ejerkonsollen ligger i det integrerede produkt og er ikke et femte kundemodul.
Den bruger den eksisterende tenantløse `/main`-gren, mens kundernes egen
administration fortsat ligger bag tenantclaims. FLEET, FACILITY, PLANNING og
FAKTURACENTER ændres ikke i deres egne worktrees af dette spor.

## Fælles kontrakter berørt af etape B–G2 og G

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
| `functions/fakturagrundlag-pdf.js` | Fakturagrundlags-PDF/CSV bygges kun fra det frosne frigivelsessnapshot. |
| `functions/dinero-test-adapter.js` | Intern, fail-closed fakturaport til emulatoren; ingen påstået live-Dinero-kontrakt. |
| `src/fleet/ejer-kreditnota-regler.js` | Delt heltalsberegning og reservationskontrol for hel/delvis kredit. |
| `functions/dinero-personlig.js` | Server-only personlig auth, kreditnota- og returdataadapter mod Dineros aktuelle v1-endpoints. |
| `functions/kreditnota-pdf.js` | Kredit-PDF bygges af den frosne kreditversion, ikke af aktuelle priser. |
| `functions/microsoft-graph.js` | Graph-token, delta, vedhæftninger og draft/send-port med eksplicit ukendt udfald. |
| `functions/openai-salgsassistent.js` | Serverbaseret Responses API-kontrakt med struktureret output og `store: false`. |
| `functions/salgsplatform.js` | Rene normaliserings-, dublet-, godkendelses- og AI-budgetregler. |
| `src/fleet/ejer-bilag-regler.js` | Fælles upload-, metadata-, dedupe- og omkostningsmapping for ejerens egne bilag. |
| `src/fleet/ejer-kpi.js` | Fælles afstemte definitioner for økonomi-, aftale- og salgsoverblikket. |
| `src/fleet/ejer-migration.js` | Ren, additiv dry-run-plan for legacy-fakturadata; rører aldrig historiske beløb eller accepterede tilbud. |

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
- `udbyder/fakturajobs/<jobId>` med stabil forretningsnøgle, eksternt reference-id og tre statusdomæner
- `udbyder/kreditnotaer/<fakturaId>/poster/<kreditId>` med frossen kilde, reservation, version og dokument
- `udbyder/kreditjobs/<jobId>` med stabil ekstern GUID og separate dokument-/send-/afregningsstatusser
- `udbyder/dinero/dokumenter/{faktura|kreditnota}/<guid>` med normaliserede returdata og oprindelse
- `udbyder/dinero/synk/checkpoints/<art>` og `/status/<art>` med side, `changesSince`, forsøg og succes
- `udbyder/dinero/posteringer/<id>` med normaliserede bogførte posteringer
- `udbyder/salgsindbakke/traade/<traadId>` med mails, CRM-links, noter, analyse og opfølgninger
- `udbyder/salgsindbakke/dedupe/<hash>` som serverejet leveringslås
- `udbyder/mailjobs/<jobId>` med indholdshash, tilbudsversion og providerstatus
- `udbyder/vidensbase/poster/<id>/versioner/<n>` med kilde, godkendelse og leveringsstatus
- `udbyder/ai/forbrug/<YYYY-MM>` med faktisk og reserveret token-/requestforbrug
- `udbyder/integrationshemmeligheder/microsoft365/delta/<mappe>` med ulæselige Graph-checkpoints
- `ejer/salgsmail/<traadHash>/<beskedHash>/<dokumentId>` i beskyttet Storage
- `ejer/fakturagrundlag/<periode>/<tenantId>/v1.pdf|csv` i beskyttet Storage
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

Etape J tilføjer `scripts/ejer-migration-v1.mjs`. Dry-run er standard og
rapporterer manglende eller modstridende forretningsnøgler. `--apply` kræver
eksplicit projektnavn to gange og en ny rapportfil. En transaktion tilføjer kun
et tomt felt eller accepterer en allerede identisk værdi; en afvigelse afbryder.
Fixtureprøven er genkørbar og bekræfter, at tilbud, prislister, linjer og beløb
er urørte. Der er ikke læst fra eller skrevet til en rigtig Firebase-database.
Recovery og ekstern aktivering er beskrevet i
`docs/VEYRO_EJERKONSOL_DRIFT_V1.md`.

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
- F-callables: samtidige frigivelser, frosset modtager/snapshot, PDF/CSV,
  idempotent job, dokumenteret testsucces, ukendt udfalds-spærre og delvis fejl
  består i isoleret demo-projekt.
- Server-PDF's layoutprøve er renderet og visuelt kontrolleret.
- Mail, Dinero, OCR, MFA og produktion er ikke tilsluttet eller testet.
- Kreditregler og kredit-callables er emulatorverificeret. Den personlige
  Dinero-adapter og retursynk er kontrakttestet, men ikke kaldt mod Dinero.
- Bilagsupload, signatur/hash/dedupe, metadataversioner, godkendelse,
  genkørbar Dinero-klargøring og postmatch er verificeret i den lokale
  Auth/Database/Functions/Storage-suite. V4-uploadlinket dannes kun uden for
  emulatoren; testfixturebytes indsættes med Admin SDK på den serverberegnede
  sti og gennemgår derefter samme bekræftelseskontrol.
- Invoice-mail, inbound-webhook og OCR har leverandøruafhængige porte, men er
  `ikke_tilsluttet`. Aktivering kræver valgt mailbox/mappe eller routing,
  mindst mulige rettigheder, signatur/replay-kontrakt og en OCR-leverandør.
- Dinero er fortsat eneste autoritative kilde til bogførte omkostninger.
  Konto-/kategori-/fortegns-mapping er lokal og synlig; umappede poster
  udelades med synlig datamangelsstatus. Et godkendt bilag bliver kun et
  frosset Veyro-klargøringsjob, indtil købskontrakten er dokumenteret.
- Økonomioverblikket læser de samme normaliserede Dinero-dokumenter,
  betalinger og posteringer som detaljevisningerne. Synkstatus afgør, om et
  nul må vises som kendt; ellers vises utilstrækkelige data. Modulfiltrering
  kræver fakturalinjer og nedgraderer dækningsstatus, når Dinero-returposten
  ikke indeholder dem.
- Konto-/kategori-/fortegnsdefinitionen genbruges af omkostningslisten og
  KPI-laget. Kundeudvalg oversættes gennem CRM's tenant- og Dinero-kontakt-id,
  så browseren ikke opfinder en ny identitet til eksterne dokumenter.

## Dinero-kontrakt for etape G

- Personlig auth: `POST https://authz.dinero.dk/dineroapi/oauth/token` med
  Basic client-id/secret og API-nøglen som username/password. Tokenet lever
  en time og gemmes ikke i RTDB.
- Kredit: `POST /v1/{organizationId}/sales/creditnotes`, derefter
  `POST .../{guid}/book` med den seneste timestamp og `POST .../{guid}/email`.
  En mistet response efter en skrivning er et ukendt udfald og blokerer retry.
- Returdata: listeendpoints for invoices og sales/creditnotes bruger
  `changesSince`, 0-baseret side og begrænset sidestørrelse. Checkpoint flyttes
  først efter sikker lagring. Payments og mailouts hentes pr. dokument.
- Personlige integrationer kan ikke bruge entries-webhook; 15-minutters
  polling er derfor den valgte transport. Officielle kilder:
  `https://developer.dinero.dk/documentation/personal-integration/`,
  `https://developer.dinero.dk/documentation/faq/` og
  `https://api.dinero.dk/openapi/index.html`.

## Supplerende Microsoft 365- og OpenAI-kontrakt

- Microsoft 365 bliver salgsmailkanal; Dinero forbliver kanal for faktura og
  kreditnota. `info@veyrosystems.com` må først aktiveres efter opslag af den
  faktiske postkassetype og underliggende postkasse.
- Graph-synk bruger mappebaseret delta for indbakke og Sendt post og gemmer den
  fulde `@odata.deltaLink`. Attachments/body kræver mere end Basic-mailadgang.
- Afsendelse modelleres som outbox: en kladde oprettes med
  `POST /users/{id}/messages` og sendes med
  `POST /users/{id}/messages/{message-id}/send`. Graph HTTP 202 betyder accepteret
  anmodning, ikke dokumenteret levering. Sent Items-synk eller en tilsvarende
  dokumenteret providerhændelse markerer `dokumenteret_sendt`.
- Tilbudsmail refererer altid til tilbud-id, versionsnummer, PDF-sti og hash.
- OpenAI Responses API kaldes kun servermæssigt med `store: false`, struktureret
  output, en enkelt sags kontekst og godkendt fælles viden. Hemmeligheder og
  forbindelsestokens gemmes aldrig i RTDB eller browseren.
- Indgående mail, vedhæftninger og webformulartekst behandles som ubetroet
  datagrundlag, aldrig som systeminstruktioner eller autorisation til handling.
- AI-budget reserveres atomisk før kald. CRM/mail kan læses og arbejdes med,
  selv når AI er frakoblet, fejler eller budgettet er brugt.
- Officielle Veyro-priser er ikke fundet; alle tal i emulatorflowet er tydeligt
  markerede fixtures og publiceres ikke som officielle priser.
- Firebase CLI 15.29.0/JDK 21 kan ikke bruges på denne Windows-version på
  grund af AF_UNIX-fejl. Testkommandoen bruger isoleret Temurin JDK 11,
  Node 20.20.2 og CLI 13.35.1 uden at ændre maskinens standardinstallationer.
- `npm audit --omit=dev` finder eksisterende transitive browser-/Firebase
  runtimefund. De berører også Auth/callable- og Admin Storage-overfladen og
  skal løses i et særskilt dependency-opgraderingsspor med fuld regression.
- M365/OpenAI-kontrakten er testet med syntetiske, rene adaptertests. Den
  tidligere grønne platform-/rules-suite er siden udvidet med kundekontoen;
  aktuelle målte delresultater står i statusdokumentet. Live Graph/OpenAI samt
  den nye salgsindbakke-callable-kæde er ikke end-to-end-testet og må ikke
  beskrives som tilsluttet.

## Samlet kundekontokontrakt 2026-09-11

- Den permanente nøgle er det eksisterende tenant-id. CRM, aftale,
  `udbyder/kundekonti`, tenantens moduladgang og fakturagrundlag får ikke hver
  sin konkurrerende kundeidentitet.
- Browseren læser kundekontoen som ejer, men kan ikke skrive direkte.
  `kundekontogem` er eneste skriveport og kræver en tenantløs aktiv ejerclaim.
- Payloaden normaliseres og valideres servermæssigt. `forventetRevision`
  beskytter mod mistede samtidige ændringer; `operationId` gør genindsendelse
  idempotent. Hver gemning opretter en ny version og en ejeraudithændelse.
- Ved kilden `accepteret_tilbud` genlæser serveren den præcise aftaleversion og
  dens prissnapshot; browserens økonomiske værdier kan ikke erstatte den. Ved
  manuel kilde skal et eksisterende versioneret rateblad vælges.
- Kun aktivering med nået virkningsdato skriver modul- og abonnementsadgang til
  tenantdelen. Kundens medarbejderroller og driftsdata forbliver i kundens egen
  administration. Administratorinvitationer er en separat kontrakt og kan ikke
  udstede ejerrollen.
- Andre modulspor kan senere genbruge Dialogens ESC/fokus-kontrakt og de
  semantiske designtokens. Der kræves ingen ændring i FLEET, FACILITY, PLANNING
  eller FAKTURACENTER for at anvende ejerleverancen nu.

## Kommunikationsintegration V2

- Autoritativ indgående model er én delt sag med flere postkassekilder; der
  oprettes ikke én tråd pr. Dennis/Jørn/info-postkasse.
- Graph-jobbet har checkpoint pr. mailbox/mappe og læser Inbox og Sent Items.
  Outlook-svar kan dermed påvirke sagen uden en åben ejerbrowser.
- Internet Message ID er primær deduplikeringsnøgle. Provider-id og eksakt hash
  er sekundære værn; webformularer skal levere stabilt delivery-id.
- Svarafsendelse er totrins: accepteret anmodning/mailjob er ikke det samme som
  dokumenteret afsendelse. Ukendt resultat blokerer blind genudsendelse.
- Se `VEYRO_EJERKONSOL_MAIL_SUPPORT_V2_IMPLEMENTERING.md` for testbevis og
  resterende Microsoft/OpenAI/Dinero/OCR-konfiguration.
