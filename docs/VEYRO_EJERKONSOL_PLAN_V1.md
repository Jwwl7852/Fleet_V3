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
| Dinero | Fakturajob og isoleret testport er implementeret; liveforbindelse mangler |
| Microsoft 365-salgsindbakke | Tilføjes i et særskilt, additivt G1-spor under Salg |
| OpenAI-salgsassistent og vidensbase | Tilføjes servermæssigt i G2 med eksplicit aktivering og budget |
| Bilagsindbakke | Mangler og tilføjes senere med migration/status |
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

Status: igangsat 2026-09-10.

- Trepanels salgsindbakke med tråde, søgning, filtre, vedhæftningsmetadata,
  separate interne noter og links til virksomhed, kontakt, mulighed og tilbud.
- Normaliseret, dubletsikker indlæsning af Graph- og formularhændelser. Ukendte
  afsendere forbliver henvendelser og opretter aldrig automatisk tenant.
- Vedvarende outbox med skelnen mellem kladde, accepteret Graph-anmodning,
  dokumenteret afsendelse og ukendt udfald. Sent Items-synk er beviskilden.
- Tilbudsmail knyttes til præcis tilbudsversion/PDF og samme sagsforløb.
- Opfølgningskladder kræver konkret ejeraccept; ændringer, nye svar og afsluttet
  sag ugyldiggør accept. CAS og idempotens beskytter mod dobbeltafsendelse.
- Produktion forbliver `ikke_tilsluttet`, indtil postkassetype, underliggende
  postkasse, Entra-applikation, mindst mulige Graph-rettigheder, webhook/delta-
  drift og secrets er verificeret.

### G2 — Veyro-salgsassistent og vidensbase

Status: igangsat 2026-09-10.

- Versioneret, godkendt viden med kilde og leveringsstatus: Tilgængelig, Under
  udvikling eller Kræver særskilt aftale.
- Serverbaseret Responses API-adapter med `store: false`, struktureret output,
  sagsspecifik kontekst og ubetroet-mail-grænse.
- Analyse og vedvarende intern samtale lagres separat fra kundemail og kan ikke
  ændre CRM-fakta, pipeline, aftaler eller økonomiske værdier automatisk.
- Håndhævet månedlig request-/tokenramme med reservation før kald, afstemning
  efter svar og fail-closed adfærd ved manglende budget.
- Isoleret testadapter dækker succes, API-fejl og budgetstop. Livekald kræver
  særskilt serversecret, modelvalg og aktivering og udføres ikke i denne runde.

### G–I — Kredit, returdata, udgifter og overblik

Status: ikke startet ud over fakturering og de supplerende G1/G2-spor.

- Kreditnotaer, returdata, betalinger og synkroniseringscheckpoints.
- Beskyttet bilagsupload, mail-/OCR-adaptergrænser og dubletkontrol.
- Fælles beregnede KPI-definitioner med klikbar afstemning.

### J — Samlet aflevering

Status: ikke startet.

- Additiv migrationsprøve med dry-run/recovery.
- Samlet regression, emulator, browsergennemgang og dokumentpreview.
- Driftsvejledning og præcise aktiveringstrin uden hemmeligheder.

## Registrerede antagelser og blokeringer

- Der var ingen yderligere designbilleder tilgængelige; repositoryets faktiske
  brandfiler har derfor forrang.
- Dinero-organisation, API-credentials og testorganisation er ikke tilsluttet.
- `info@veyrosystems.com` er valgt, men delt postkasse, selvstændig postkasse
  eller alias samt den korrekte underliggende postkasse er ikke verificeret.
- Microsoft Entra/Graph-app, webhook-endpoint, Graph-secrets og nødvendige
  mailbox-rettigheder er ikke opsat. Ingen virkelig mail sendes.
- OpenAI API-secret, godkendt model og produktionsbudget er ikke opsat. Ingen
  virkelig kundemail sendes til AI under udviklingen.
- Invoice-mail, inbound-maildomæne og OCR-leverandør er ikke identificeret.
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
