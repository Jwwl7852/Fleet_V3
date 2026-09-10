# Veyro ejerkonsol — byggeplan v1

Opdateret: 2026-09-10

## Fast grundlag

- Repository: `https://github.com/Jwwl7852/Fleet_V3.git`
- Udviklingsspor: `codex/ejer-integrated-development`
- Worktree: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`
- Fælles produktbase: `989dbb87db639efed0ba1b5a1e271560f7659a0c`
- Integrationsref ved oprettelse: `39963337a52d4464f619077683d1f39aa81eff1e`
- Integrationens eneste ændring efter produktbasen var den fælles sporvejledning.

Ejerkonsollen videreudvikles i den eksisterende `/main`-gren af appen. Der
oprettes ikke en parallel konsol, et separat login eller en ny temakilde.

## Produktvalg, der ligger fast

- Rene, personlige ejeridentiteter uden kundetenant er normalmodellen.
- UI-gates er kun navigation; regler og Cloud Functions håndhæver adgang.
- CRM-virksomhed er ikke det samme som en provisioneret tenant.
- FAKTURACENTER er ikke et særskilt kommercielt modul.
- Bindende priser og dokumenter regnes i heltalsøre og snapshots fryses.
- Dinero er Veyros eget regnskabssystem. En testadapter er ikke en liveforbindelse.
- Microsoft 365 og `info@veyrosystems.com` er salgsmailens valgte kanal. Den
  faktiske postkassetype og Graph-rettigheder skal verificeres før aktivering.
- OpenAI bruges kun servermæssigt, sagsspecifikt og under en håndhævet grænse.
  CRM og mail skal fortsat virke uden AI.
- Ingen mail, bogføring, produktionstilpasning eller deployment sker uden særskilt aktivering.
- Originale bilag ligger i beskyttet Storage; direkte klientadgang forbliver lukket.

## Genbrugsoversigt

| Område | Beslutning |
|---|---|
| `/main` og tenantløs routing | Udvides med ejer-navigation; adgangsgrænsen bevares |
| `Konsol.jsx` | Genbruges som Kunde/abonnement-skærm |
| `Prisliste.jsx`, `priser.js`, `beloeb.js` | Genbruges og udvides; ingen parallel prismotor |
| Eksisterende ejer-callables | Bevares, får fælles revocationkontrol og platformaudit |
| `udbyder/kunder`, målinger og fakturagrundlag | Bevares som autoritative eksisterende data |
| Kundens `opsaetning/brugere` | Bevares adskilt fra ejeradministrationen |
| Genereret administratoradgangskode | Lukket og erstattet af tidsbegrænset invitation |
| CRM og tilbud | Implementeret additivt med servervalidering og versionssnapshots |
| Dinero | Faktura-/kreditkø, personlig API-adapter og pagineret retursynk er implementeret; liveforbindelse mangler |
| Microsoft 365-salgsindbakke | Implementeret additivt i G1 under Salg; ekstern forbindelse er ikke aktiveret |
| OpenAI-salgsassistent og vidensbase | Implementeret servermæssigt i G2; secret, model og budgetaktivering mangler |
| Bilagsindbakke | Implementeret med privat upload, gennemgang, dedupe og adapterstatus; eksterne mail/OCR-/købsforbindelser mangler |
| Veyro-logo og tema | Genbruges fra `src/assets/veyro`, `VeyroLogo.jsx` og `fleet.css` |

## Etaper

### A — Verificeret grundlag

Status: afsluttet 2026-09-10.

- Repository, remote, worktrees, live integrationsref og foreskrevet base verificeret.
- Ingen igangværende merge, rebase, cherry-pick eller revert fundet.
- De fire eksisterende modulspor er urørte.
- Eksisterende datamodel, regler, funktioner, jobs, Storage og hosting kortlagt.

### B — Adgang og skal

Status: implementeret og emulatorverificeret 2026-09-10.

- Et eksplicit, tenantløst ejerclaim-format med legacy-kompatibilitet.
- RTDB-læsning for rene ejere uden kunstige tenant/perms-claims.
- Revocationkontrol i alle privilegerede ejer-callables.
- Serverstyret platformaudit og afvisning af direkte klientwrites.
- Ejer-navigation med eksisterende logo, font og Veyro-tokens.
- AK-01–AK-04 verificeret i Database Emulator; Storage-stien for tilbuds-PDF
  er lukket for både ejerklient og kundeadministrator.
- Normalt login med tenantløs testidentitet verificeret i isolerede Auth-,
  Database-, Storage- og Functions-emulatorer uden demo-mode eller guard-omgåelse.

### C — Salg

Status: implementeret og emulatorverificeret.

- Vedvarende CRM-data under ejergrænsen.
- Virksomheder, flere salgsmuligheder, aktiviteter og tidslinje.
- Ansvarlig ejer, Mine/Alle, næste handling og forfald.
- Servervalidering, revisionskontrol, audit og rules-tests.

### D — Priser og tilbud

Status: implementeret og emulatorverificeret; ekstern mail er bevidst ikke tilsluttet.

- Udvid eksisterende versioneret rateblad med engangs- og abonnementslinjer.
- Fælles deterministisk beregning i browser/server.
- Serverallokerede tilbudsnumre og uforanderlige versionssnapshots.
- Rateblad med valg, mængde, aftalt pris, linjerabat, generel rabat,
  introduktionsperiode samt adskilte månedlige og engangsbeløb.
- Automatisk tilbudsudfyldning fra den valgte versionerede prisliste uden at
  opfinde manglende priser.
- Ny kladde/version efter udstedelse; gamle snapshots og PDF'er ændres ikke.
- Vedvarende servergenereret PDF i beskyttet Storage, hash og præcis
  versionsreference; browserudskrift er fortsat supplement.
- Mailadapter med fejlforsøg/status `ikke_tilsluttet`; manuel ekstern
  afsendelse forbliver en særskilt, tydelig registrering.
- Accept med version, server-tidspunkt, metode og dokumentation; ingen
  automatisk fakturafrigivelse.

### E — Aftale og kunde

Status: implementeret og emulatorverificeret.

- Genkørbar provisioning med stabile operations-id'er.
- Aftale-/abonnementsversioner og virkningsdatoer.
- Sikker administratorinvitation uden synlig adgangskode.
- Provisionering genbruger CRM's permanente aftale-/tenantkobling, bevarer
  aftaleversioner og kan genkøres efter delvise fejl uden dobbeltoprettelse.
- Fremtidig virkningsdato registreres som planlagt uden at overskrive et
  aktivt abonnement; en senere genkørsel aktiverer den. Automatisk scheduler
  for dette tidspunkt hører til driftsopsætningen.
- Invitationstoken lagres kun som SHA-256-hash og kan udløbe, tilbagekaldes
  og roteres ved genudsendelse. Nye og eksisterende verificerede Auth-konti
  understøttes; invitationen kan kun give kundens `admin`, aldrig ejeradgang.

### F — Fakturering

Status: implementeret og isoleret verificeret 2026-09-10; Dinero er ikke tilsluttet.

- Vedvarende, idempotent faktura-outbox med stabile forretningsnøgler.
- Frosset frigivelsessnapshot og servergenereret PDF/CSV med SHA-256.
- Separate dokument-, afsendelses- og betalingsstatusser.
- Eksplicit, fail-closed Dinero-testport med scenarier for succes, ukendt udfald
  og delvis fejl; intet simuleret successvar i normal drift.
- Frigivelse, dokumenter, race, genkørsel og blind-genudsendelsesblokering er
  testet i emulatorer.

### G1 — Microsoft 365-salgsindbakke og godkendt opfølgning

Status: implementeret og isoleret verificeret 2026-09-10; Microsoft 365 er ikke tilsluttet.

- Trepanels salgsindbakke med tråde, søgning, filtre, vedhæftningsmetadata,
  separate interne noter og links til virksomhed, kontakt, mulighed og tilbud.
- Normaliseret, dubletsikker indlæsning af Graph- og formularhændelser. Ukendte
  afsendere forbliver henvendelser og opretter aldrig automatisk tenant.
- Vedvarende outbox med skelnen mellem kladde, accepteret Graph-anmodning,
  dokumenteret afsendelse og ukendt udfald. Sent Items-synk er beviskilden.
- Tilbudsmail knyttes til præcis tilbudsversion/PDF og samme sagsforløb.
- Opfølgningskladder kræver konkret ejeraccept; ændringer, nye svar og afsluttet
  sag ugyldiggør accept. CAS og idempotens beskytter mod dobbeltafsendelse.
- Fremtidige opfølgninger er `planlagt`. Et 15-minutters serverjob gør dem
  først til godkendelsesopgaver ved forfald og pauser dem ved ny aktivitet
  eller lukket sag. Accepteret/afvist tilbud kontrolleres igen før Graph-kald.
- Webformularendpoint har HMAC, tidsvindue, leverings-id, honeypot og samme
  korrelations-id som en eventuel afledt mail, så én formular ikke bliver to sager.
- Produktion forbliver `ikke_tilsluttet`, indtil postkassetype, underliggende
  postkasse, Entra-applikation, mindst mulige Graph-rettigheder, webhook/delta-
  drift og secrets er verificeret.

### G2 — Veyro-salgsassistent og vidensbase

Status: implementeret og isoleret verificeret 2026-09-10; OpenAI er ikke tilsluttet.

- Versioneret, godkendt viden med kilde og leveringsstatus: Tilgængelig, Under
  udvikling eller Kræver særskilt aftale.
- Serverbaseret Responses API-adapter med `store: false`, struktureret output,
  sagsspecifik kontekst og ubetroet-mail-grænse.
- Analyse og vedvarende intern samtale lagres separat fra kundemail og kan ikke
  ændre CRM-fakta, pipeline, aftaler eller økonomiske værdier automatisk.
- Nye indgående henvendelser markerer et analysejob. Et særskilt 5-minutters
  serverjob behandler seneste besked, når integrationen er aktiv; samtidige
  leverancer og jobkørsler reserveres atomisk.
- Håndhævet månedlig request-/tokenramme med reservation før kald, afstemning
  efter svar og fail-closed adfærd ved manglende budget.
- Isolerede kontrakttests dækker struktureret request, API-fejl, budgetstop og
  sagsspecifik grænse. Livekald kræver
  særskilt serversecret, modelvalg og aktivering og udføres ikke i denne runde.

### G — Kreditnotaer og Dinero-returdata

Status: implementeret og isoleret verificeret 2026-09-10; live Dinero er ikke tilsluttet.

- Hel og delvis kredit fra frossen fakturaversion med historiske priser og moms.
- Kladder, frigivne dokumenter, igangværende job og ukendte udfald reserverer
  restbeløb og restmængde i én servertransaktion; annullering er kun mulig før frigivelse.
- Separat, idempotent kredit-outbox med stabil ekstern GUID, eksplicit
  dokumenttype/fortegn, bogføring, afsendelsesanmodning og blind-retry-spærre.
- Persistent PDF fra det præcise kreditsnapshot. Endeligt kreditnummer kommer
  først fra Dinero-returdata og foregives ikke af Veyro.
- Personlig Dinero-adapter følger den aktuelle auth-/credit-note-kontrakt.
  Retursynk henter fakturaer, kreditnotaer, betalinger, mailouts og posteringer
  med sikre sidecheckpoints, separat seneste forsøg/succes og 15-minutters job.
- Fakturaer fundet direkte i Dinero importeres med oprindelse. Uden et
  verificerbart Veyro-linjesnapshot kan de ses, men ikke krediteres fra Veyro.

### H — Udgifter

Status: implementeret og isoleret verificeret 2026-09-10; mail, OCR og Dinero-købsflow er ikke tilsluttet.

- Beskyttet PDF/JPEG/PNG-upload med 20 MB-loft, faktisk signaturkontrol,
  SHA-256, privat download og versionshistorik for metadata.
- Eksakt dedupe på kilde-/fil-id og synlige sandsynlighedssignaler på tværs
  af kanaler. Et sandsynligt match sletter eller sammenlægger aldrig selv.
- OCR-resultat er et separat forslag med feltsikkerhed. Manuel gennemgang og
  eksplicit godkendelse kræves før et frosset, genkørbart Dinero-klargøringsjob.
- Bogførte Dinero-poster og godkendte, ikke bogførte bilag holdes adskilt.
  Konto-/kategori-/fortegnsregler er eksplicitte og synlige; umappede poster
  tælles ikke som nul eller som omkostning.
- Filvælger og drag & drop fungerer. Invoice-mail, inbound-mail og OCR har
  adskilte adaptergrænser og vises som `ikke_tilsluttet`, indtil leverandør,
  mailbox/routing, webhooksignatur og credentials er valgt og testet.

### I — Overblik

Status: implementeret og isoleret verificeret 2026-09-10.

- Fælles beregnede KPI-definitioner med periode, beløbsgrundlag, kilde,
  datadækning og klikbar afstemning til faktura-, bilags-, abonnement- og
  salgslisterne.
- Faktureret salg netto bruger dokumenteret afsendte fakturaer ekskl. moms
  og fratrækker bogførte kreditnotaer efter dokumentdato. Kladder/frigivne
  grundlag tæller ikke som sendt salg.
- Betalinger og rest vises inkl. moms og holdes adskilt fra salget. Gældsalder
  har faste intervaller og en særskilt ukendt-forfaldsgruppe.
- Bogførte omkostninger bygger på periodens eksplicit mappede resultatkonti.
  Foreløbig difference vises kun ved komplet salg- og posteringsdækning og
  kaldes aldrig bankbeholdning eller årsresultat.
- Aftaleværdi holder intro-/normal månedsværdi og engangsbeløb adskilt.
  Vinderate bruger kun vundne+tabte afsluttede muligheder og viser tællerne.
- Periode-, kunde-, modul- og kategorifiltre er implementeret. Manglende
  eksterne fakturalinjer ved modulfilter giver `Ikke tilstrækkelige data`.

### J — Samlet aflevering

Status: afsluttet for den isolerede, internt gennemførlige leverance 2026-09-10.

- Additiv migrationsprøve med dry-run/recovery er implementeret og består på
  isoleret fixture; ingen rigtig database er migreret.
- Samlet regression, fire-emulator-kæder, browsergennemgang ved laptop/stor
  skærm og dokumentpreview er gennemført. Eksterne liveforbindelser er fortsat
  særskilte aktiveringsporte og tæller ikke som testede.
- Driftsvejledning og præcise aktiveringstrin uden hemmeligheder er skrevet i
  `docs/VEYRO_EJERKONSOL_DRIFT_V1.md`.

### K — Lokal review og backupforberedelse

Status: gennemført lokalt 2026-09-10; ingen push, deployment eller ekstern
aktivering.

- Frisk, sammenhængende fixture fra salgsforespørgsel til økonomi er seedet og
  browserverificeret med normalt tenantløst ejerlogin.
- Testadapterdata er mærket i UI og dokumentation; virkelige Microsoft 365-,
  OpenAI-, Dinero-, mail- og OCR-forbindelser forbliver `Ikke tilsluttet`.
- Den faktiske Windows-kompatibilitetsvej og versionsmatrix er dokumenteret i
  `docs/VEYRO_EJERKONSOL_GENNEMGANG_V1.md`.
- Ejerbranchens remote-status, filomfang og secret-/fixtureafgrænsning
  kontrolleres før et lokalt checkpoint. Den planlagte senere handling er en
  eksplicit push af kun `codex/ejer-integrated-development`; den udføres ikke i
  denne arbejdsrunde.

## Registrerede antagelser og blokeringer

- Der var ingen yderligere designbilleder tilgængelige; repositoryets faktiske
  brandfiler har derfor forrang.
- Dinero-organisation, personlig integrations client-id/-secret, API-nøgle,
  salgskonto og testorganisation er ikke tilsluttet. Adapteren er derfor ikke live-testet.
- `info@veyrosystems.com` er valgt, men delt postkasse, selvstændig postkasse
  eller alias samt den korrekte underliggende postkasse er ikke verificeret.
- Microsoft Entra/Graph-app, webhook-endpoint, Graph-secrets og nødvendige
  mailbox-rettigheder er ikke opsat. Ingen virkelig mail sendes.
- OpenAI API-secret, godkendt model og produktionsbudget er ikke opsat. Ingen
  virkelig kundemail sendes til AI under udviklingen.
- Invoice-mail, inbound-maildomæne og OCR-leverandør er ikke identificeret.
- Dinero-endpoint og payload for købskladde/bilagsvedhæftning er ikke
  kontraktverificeret; H opretter derfor kun et vedvarende Veyro-job med
  `overfoerselsStatus: ikke_tilsluttet` og foregiver aldrig bogføring.
- Officielle Veyro-priser blev ikke fundet i repositoryet. Prisadministrationen
  er færdig, men kun emulatorfixtures indeholder eksempelpriser.
- MFA kræver fortsat produktionsnær Firebase Authentication-opsætning. Normal
  tenantløs loginrouting er emulatorverificeret, men MFA er ikke aktiveret.
- Firebase CLI 15.29.0/JDK 21 rammer en Windows AF_UNIX-fejl på denne maskine.
  Den reproducerbare testvej er derfor isoleret Temurin JDK 11 + CLI 13.35.1;
  ingen eksisterende Java- eller Node-installation er overskrevet.
- `npm audit --omit=dev` rapporterer kendte transitive fund i den eksisterende
  Firebase/browser- og Admin-SDK-stak. De skal håndteres som en separat,
  kontrolleret dependency-opgradering; denne arbejdsrunde laver ingen bred opgradering.
