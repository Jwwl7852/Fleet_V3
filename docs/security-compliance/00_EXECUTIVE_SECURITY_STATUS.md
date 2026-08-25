# 00 — Executive Security Status

**Læses af**: produktejere. **Formål**: evidence → gaps → prioritering →
implementeringsrækkefølge, FØR den næste angrebsflade (udgående mail, og
senere fillagring) åbnes. **Ikke** en ISO 27001- eller RA-compliance-
erklæring — se `10_RA_TECHNICAL_READINESS.md` og
`11_ISO27001_TECHNICAL_READINESS.md` for hvorfor den skelnen er reel og
vigtig.

Metode: read-only gennemgang af faktisk kode, faktiske regler, faktiske
tests, faktiske deploy-logs — ikke af hensigt eller dokumentation alene.
Hver vurdering er klassificeret VERIFIED / PARTIAL / NOT BUILT /
ORGANIZATIONAL-EXTERNAL / UNKNOWN, og ingen antagelse er opgraderet til
VERIFIED. `npm test` (3269 tests, inkl. RTDB-regel-emulatoren) og `npm run
regler:tjek` blev kørt som del af denne audit — begge grønne/identiske.

## De stærkeste VERIFIED-fund

1. **Tenant-isolation er reel og gennemgående, ikke tilfældig.**
   Anvendt uden undtagelse på ~70 regelblokke i `firebase.rules.json`; nul
   af de 44 Cloud Functions lader en klient bestemme hvilken tenants data
   der røres. En selv-opdaterende testsuite dækker automatisk hver ny
   tenant-bunden node.
2. **Rollemodellen kan ikke omgås fra frontenden.** `roller/`-noden bruges
   ALDRIG af regelfilen til at afgøre adgang — kun det udstedte tokens
   `perms` gør. Platform-ejer-adgang kan kun tildeles via et script der
   kræver en rå service-account-nøgle uden for applikationen.
3. **Skrivesiden af auditloggen er ægte serverhåndhævet.** Append-only,
   manipulationsresistent, en streng fritekst-udelukkende allowlist, og
   intet er nogensinde slettet automatisk under den nuværende
   retentionkonfiguration.
4. **Angrebsfladen er lille og konsekvent bevogtet.** 44 callable-
   funktioner, nul rå HTTP-endepunkter, 100% auth-tjek-dækning, nul reel
   XSS-flade, intet hemmeligt materiale fundet i repoet, og DEV/PROD er
   to genuint adskilte Firebase-projekter med mekanisk miljødetektion.

## De alvorligste fund

**CRITICAL**
- **Ingen backup- eller gendannelsesevne er verificerbar.** Intet RPO,
  intet RTO, ingen gendannelsesprocedure, ingen testet gendannelse findes
  nogen steder i repoet. Om Firebase/GCP leverer noget på
  infrastrukturniveau kan ikke afgøres herfra — det skal tjekkes direkte i
  konsollen, ikke antages. Se doc 06.

**HIGH**
- **Følsomme LÆSNINGER er klientrapporteret, ikke serverhåndhævet
  auditlogget.** Dette er det tidligere kendte forbehold
  (`BESLUTNINGER.md`s egen note: *"vi logger læsninger fra applikationen",
  ikke "vi logger alle læsninger"*), genverificeret mod den aktuelle kode
  OG mod levende adfærd i denne sessions egen DEV-test: en direkte RTDB-
  læsning uden om appens hooks producerer ingen auditpost. Selve
  LÆSETILLADELSEN er reelt håndhævet af RTDB-reglerne — det er kun
  LOGNINGEN af at den skete, der kan omgås. Se doc 05.
- **Ingen alarmering når et menneske.** Logning findes (GCPs
  standardværktøj); ingen fejl, ingen afvist adgang, ingen uregelmæssighed
  udløser i dag noget der rent faktisk kalder nogen op. Se doc 05.
- **App Check er ikke slået til.** Ethvert gyldigt brugertoken kan kalde
  enhver af de 44 funktioner, uanset hvilken klient det kommer fra. Se
  doc 07.
- **Ingen MFA.** Organisatorisk/produktbeslutning, ikke en kodefejl — men
  reelt fraværende. Se doc 03.

**MEDIUM** (den fulde liste med 19 punkter står i Gate C,
`12_FINDINGS_AND_REMEDIATION_PLAN.md`) — blandt de vigtigste: ingen
søgbar/eksporterbar audit-konsol, ingen applikationsniveau rate limiting,
20 kendte uafhjulpne afhængighedssårbarheder, ingen CI/CD, ingen GDPR-
sletning-på-anmodning, `securityLevel`-feltet er halvvejs implementeret og
derfor et falsk dækningsindtryk, og `audit/`-noden er uden for den
generiske krydstenant-testsuites scanningstræ.

## Gate-oversigt (fuld detalje i doc 12)

- **Gate A — før 3D (udgående mail)**: 7 konkrete krav, ingen af dem
  bygget endnu, fordi 3D ikke er startet. Alle 7 kan opfyldes med mønstre
  der allerede findes og er bevist i denne kodebase (server-side
  fetch-and-verify, `kortStreng`, permission-gates, `logXxx()`-mønsteret).
  Det vigtigste enkeltkrav: modtageradressen SKAL opløses server-side fra
  sagens gemte parter, aldrig fra et klientfelt ved afsendelse.
- **Gate B — før fillagring (4C)**: 9 beslutninger der skal træffes FØR
  første linje kode, ingen af dem hastede — intet er bygget, intet skal
  bygges nu.
- **Gate C — før enterprise/RA-pilot**: 19 fund, herunder backup/DR (igen),
  læsesporing (igen), alarmering (igen), App Check, MFA, SSO,
  søgbar audit-konsol, rate limiting, afhængighedssårbarheder.
- **Gate D — før ISO 27001-certificering**: teknisk restliste plus en lang
  liste organisatoriske dokumenter (risikoregister, SoA, hændelsesplan,
  leverandørrisikovurdering) der IKKE findes i dette repo og ikke bør
  forventes at gøre det — de hører hjemme uden for koden.

## RA- og ISO-readiness — den korte version

Fundamentet for høj sporbarhed er reelt og solidt for MUTATIONER (hvem
ændrede hvad hvornår — server-håndhævet, testet, manipulationsresistent).
Det samme fundament har ét gennemgående hul for LÆSNINGER (hvem SÅ hvad
hvornår — klientrapporteret, ikke server-håndhævet). Dette hul er den
samme tekniske kendsgerning set fra tre vinkler i doc 05, 10 og 11 — ikke
tre separate problemer. At lukke det kræver en arkitekturændring
(følsomme læsninger skal gå gennem en callable-funktion, ikke direkte
RTDB-SDK-læsninger), ikke en detaljerettelse.

## Kan vi trygt fortsætte til at implementere den udgående mail-arkitektur?

**YES, AFTER GATE A.**

Ikke NO: der er intet CRITICAL fund der gør det uforsvarligt at PÅBEGYNDE
arbejdet med 3D. Platformens grundlæggende sikkerhedsmønstre — server-side
fetch-and-verify af tilstand før en handling, konsekvent permission-gating,
en append-only auditlog med en disciplineret allowlist, en Cloud
Function-arkitektur uden rå HTTP-flade — er allerede bevist at virke i
praksis, senest i denne sessions egen Skive 3C-levering, hvor præcis dette
mønster fangede og lukkede en reel fejl (en afsluttet sag der kunne
genåbnes ad bagvejen) FØR den nåede produktion.

Ikke et betingelsesløst YES: Gate A's syv krav (§ modtageropløsning
server-side, hemmelighed kun i Cloud Functions-secrets, permission-gate,
tenant-genverifikation, server-audit af hvert forsøg,
header-injektions-sanering, idempotensnøgle) skal være en del af 3D's
FØRSTE implementering — ikke noget der eftermonteres når mail allerede
sender. Det vigtigste af de syv, modtageropløsning server-side fra sagens
egne gemte parter, er den ene kontrol der forhindrer at en kompromitteret
eller skødesløs klient kan omdirigere en rigtig e-mail til en vilkårlig
adresse. Uden den er "FleetControl sender e-mail" det samme som
"FleetControl kan bruges til at sende e-mail som hvem den angribes."

Ingen af de øvrige fund i denne audit (backup/DR, læsesporing, App Check,
MFA) er unikt forårsaget af eller løses af 3D — de er generelle
platformmangler der eksisterer uafhængigt af om mail bygges, og bør
adresseres i deres egen prioriteringsrækkefølge (se "Det gennemgående
mønster" i doc 12), ikke bruges som en begrundelse for at udskyde 3D
yderligere.
