# 05 — Audit Logging &amp; Monitoring

Read-only evidensgennemgang. Denne fil svarer eksplicit på det tidligere
kendte, uafklarede spørgsmål: **kan følsomme læsninger reelt siges at være
serverhåndhævet auditlogget, eller er dele af det kun applikationsbaseret?**
Svaret klassificeres sandt — ingen kosmetisk PASS.

## Den vigtigste konklusion først

**Skrivninger (mutationer) til `sager`, `indberetninger`, `opgaver`,
`fakturaer` m.fl. er server-integritets-håndhævet auditlogget — VERIFIED.**
**Følsomme LÆSNINGER er applikations-udløst, ikke server-håndhævet —
PARTIAL, ikke VERIFIED.**

Dette er ikke en ny opdagelse — `audit.js`s egen kildekodekommentar og
`test/sensitivlaesning.test.mjs`s eget formål siger det samme — men denne
audit har genverificeret det mod den AKTUELLE kode og mod en levende test,
ikke kun mod tidligere dokumentation.

## A. Skrivesiden — VERIFIED, sporet til bunds

Mekanismen: en Cloud Function (Admin SDK) udfører selv RTDB-skrivningen OG
kalder `logXxx()` i samme funktionskrop — en klient kan ikke kalde
funktionen og springe logkaldet over, fordi det ikke er betinget af
klientdata.

Konkret verificeret (linjehenvisninger i `functions/index.js`):

| Handling | Logges hvor | Bevis |
|---|---|---|
| Sagoprettelse (`sagOpret`) | `logSager(...)`, ubetinget | linje 5658 |
| Sagsbesked (`sagBeskedSkriv`) | `logSager(...)`, ubetinget | linje 5734 (efter denne sessions rettelse) |
| Sagsafslutning (`sagAfslut`) | `logSager(...)`, ubetinget | bekræftet af `test/sager-funktioner.test.mjs`: "ALLE FEM FUNKTIONER KALDER logSager()" |
| Opgave/etape/booking-oprettelse og -skift, INKL. tilknyttet reservation | `logOpgave(...)`, ubetinget, i `etapeskift`, `bookingopret`, `opgaveplanlaeg`, `facilityplanlaeg`, `opgaveflyt`, `opgavestatus` | linje 3269, 3322, 3441, 3674, 3985, 4165, 4271 |
| Fakturagodkendelse/-afvisning/-bogføring (`fakturastatus`) | `logProcure(..., AUDIT.tilstandsskift, "fakturaer", ...)`, ubetinget | linje 5209-5210 |
| Indberetningsskift | `logIndberetning(...)` | linje 3677, 3798 |
| Retention/legal hold | `logRetention(...)` | linje 5986 og opefter |

**Reservationsændringer har ingen separat `logReservation`, fordi de aldrig
ændres uafhængigt af deres ejende opgave/etape/booking** — de skrives
atomisk i samme `update()` som den handling der udløser dem (arkitekturens
egen invariant, se CLAUDE.md). De er derfor dækket, men under objekttypen
`"opgaver"`/`"etaper"`/`"bookinger"`, ikke som en selvstændig kategori.
**VERIFIED, ikke længere UNKNOWN.**

**Allowlisten (`LOGBARE_FELTER` i `audit-regler.js`) er reelt håndhævet, ikke
kun skrevet ned**: ~35 felter, alle numeriske/enum/id-felter. **Nul
fritekstfelter**. Serveren genfiltrerer selv (`functions/index.js`
linje ~198-202) — klientfiltrering er bekvemmelighed, ikke kontrollen.
Denne sessions eget Skive 3C-arbejde bekræftede det konkret: `sagAfslut`s
frie `afslutningsAarsag` er bevidst udeladt af audit-kaldet, og en test
håndhæver det.

## B. Læsesiden — PARTIAL, ikke VERIFIED

Mekanismen, sporet ende-til-ende:

1. `usePost.js`/`useListe.js`s `auditerSom`-parameter kalder
   `auditLaes()`/`auditNaegtet()` **fra browseren**, EFTER at RTDB-læsningen
   allerede er gennemført.
2. Dette kald går gennem en autentificeret Cloud Function (`audit`), ikke
   et direkte klient-skriv til `audit/` — SELVE SKRIVNINGEN, når den sker,
   er derfor server-integritets-sikret (tenant/uid/tidsstempel sat
   server-side, ikke fra klientens payload).
3. **Hullet**: intet tvinger trin 1 til at ske. RTDB's `.read`-regel (som
   reelt spærrer selve læsningen — verificeret separat, se doc 04) og
   audit-skrivningen er to UAFHÆNGIGE, ukoblede operationer. En klient der
   læser direkte via `db.ref(...).once('value')` — fra browserkonsollen,
   en modificeret bundle, eller et script med et gyldigt token — kan
   simpelthen aldrig kalde `audit`-funktionen. RTDB har ingen
   server-side læse-trigger (i modsætning til skrivninger), så dette kan
   ikke lukkes uden at lede følsomme læsninger gennem en callable i stedet
   for direkte RTDB-SDK-læsninger.
4. **Levende bekræftelse fra denne sessions egen DEV-verifikation** (Skive
   3C, samme samtale): under fejlsøgning læste jeg
   `tenants/demo/sensitive/sager` og `tenants/demo/sager` direkte via
   `db.ref(...).once('value')` i browserkonsollen adskillige gange, uden om
   `usePost`/`useListe`. Ingen af disse læsninger producerede en
   `audit.laes`-post — trivielt at demonstrere for enhver med en
   autentificeret session og devtools.
5. Koden siger det allerede selv, to steder, uafhængigt: `audit.js`s egen
   kommentar — *"Den her er KLIENTRAPPORTERET og dermed svagere end resten:
   en klient der ikke kalder den, logger ikke... Rigtig serverlogning...
   kræver, at følsomme læsninger går gennem en callable"* — og
   `test/sensitivlaesning.test.mjs`s eget formål: den kan kun bevise at
   hvert kaldested i UI-KILDEKODEN sender `auditerSom` med; den kan hverken
   bevise, eller foregiver at bevise, at hver faktisk netværksforespørgsel
   logges.

**Klassifikation: PARTIAL, ikke VERIFIED, ikke opgraderet kosmetisk.**
RTDB-læsetilladelseskontrollen er reel (VERIFIED); det tilhørende
auditspor er en best-effort applikationskonvention med en statisk lint som
eneste bagstopper, ikke en servergaranti. **Severity: HIGH** for
RA/ISO-formål specifikt — "hvem har set denne følsomme post" er præcis det
spørgsmål en revisor vil stille, og det ærlige svar i dag er "den frontend
vi valgte at fortælle det til."

## C. Audit-integritet og drift

**Append-only, manipulationsresistens — VERIFIED.** `audit/`-roden er
`.write:false` for alle klienter. Den eneste skriver er `audit`
Cloud Function, som **kun nogensinde kalder `.push()`** — ingen
`.set()`/`.update()` mod en eksisterende nøgle fundet nogen steder. Den
planlagte `auditoprydning` er den eneste anden skriver, og den kalder kun
`.remove()` på en HEL partition (`audit/{tenant}/{klasse}/{år}/{måned}`),
aldrig en redigering — "manipulation" i betydningen at ÆNDRE en
eksisterende post er ikke muligt via nogen fundet kodevej; kun total
partitions-sletning er, og den er selv gated (næste punkt).

**Retention — VERIFIED mekanisme, eksplicit IKKE juridisk afgjort.**
`RETENTION_MAANEDER` = 24 måneder for alle 3 klasser, markeret
"Ikke afgjort" for 2 af 3. `RETENTION_AFGJORT` = `{false, false, false}` for
alle tre i dag. `auditoprydning` tjekker `maaSlettes` (afledt af
`retentionErAfgjort()`) FØR den nogensinde kalder `.remove()`: når flagget
er false (nuværende tilstand), rapporterer den kun til en
"forfaldne"-liste og logger *"Retention er IKKE afgjort — der slettes
ingenting."* **Ingen auditdata er nogensinde blevet automatisk slettet
under den nuværende konfiguration** — dette er en velbygget sikkerhedslås,
ikke et hul.

- **Ny gap fundet (MEDIUM i dag, HIGH hvis en klasse nogensinde sættes
  `afgjort:true`)**: `auditoprydning` udfører **intet legal-hold-tjek**
  før dens (i dag inaktive) `.remove()`-kald. Legal hold
  (`erUndtaget()`) konsulteres i dag kun af `retentionDryRun`s
  simuleringsvej for FORRETNINGSDATA-kategorierne, ikke af
  audit-log-sletningsvejen. Hvis `RETENTION_AFGJORT` nogensinde vippes til
  `true` for en klasse UDEN at denne kobling først er bygget, ville en hel
  auditpartition kunne slettes uden hensyn til en eventuel legal hold sat
  på en enkelt sag/hændelse i den periode.

**Eksport/søgning — PARTIAL, og smallere end "søgning."** Den ENESTE
skærm i hele appen der læser `audit/`, er `Sagsvisning.jsx`s
"Aktiviteter"-fane (bygget denne session, Skive 3C):
`useSagAktiviteter()` henter nøjagtigt `audit/drift/{år}/{måned}` for
INDEVÆRENDE OG FORRIGE MÅNED ALENE, filtrerer klientside til den ene sag,
gated på `PERM.auditLaes`. Ingen datointervalvælger, ingen
aktørbaseret søgning, ingen krydsobjekt-forespørgsel, ingen adgang til
`regnskab`/`sikkerhed`-klasser, ingen eksport/download. **Ingen anden
skærm læser `audit/`** — `Brugere.jsx` viser kun `audit.laes`-permissionen
i en rolleeditor; `unitbooking/Historik.jsx` er eksplicit IKKE
auditloggen, per sin egen headerkommentar. Severity **MEDIUM** for
RA/ISO: "producér bevis for X over periode Y på tværs af alle aktører"
kræver i dag et manuelt månedsvist RTDB-udtræk af en person med
`audit.laes` og Firebase-konsol/script-adgang, ikke en produktfunktion.

## D. Monitorering — logning der findes, kontra alarmer der når et menneske

**Cloud Function-fejlovervågning: NOT BUILT som applikationslag.** Ingen
fejlrapporterings-/alarmeringsafhængighed i hverken rod- eller
`functions/package.json` (ingen Sentry, ingen
`@google-cloud/error-reporting`). Ingen `.github/`-mappe overhovedet — ingen
Dependabot, ingen Actions. Det der findes, er GCP's STANDARD Cloud
Functions/Cloud Logging (fanger automatisk stdout/stderr/exceptions for
enhver deployet funktion — bekræftet direkte denne session ved at læse
rigtige logposter via `firebase functions:log`). Dette er **logning der
findes**, ikke **alarmering der når et menneske** — ingen bliver kaldt op;
nogen skal vide de skal kigge.

**Auth/permission-fejl-synlighed**: som beskrevet i afsnit B er
`AUDIT.adgangNaegtet` (afviste forsøg) LIGE SÅ klientrapporteret som
`AUDIT.laes` — samme hul, samme begrundelse.

**Unormal login-detektion: NOT BUILT.** Ingen anomalidetektion
(umulig-rejse, ny enhed, gentagne fejl) fundet nogen steder.

**Sårbarhedsalarmering**: se doc 07 — ingen Dependabot/tilsvarende
konfigureret i repoet; om GitHubs egne repo-niveau-alarmer er slået til er
**UNKNOWN/ORGANIZATIONAL** (kan ikke ses fra repo-indholdet alene).

**Oppetids-/tilgængelighedsovervågning: NOT BUILT.** Ingen konfiguration
fundet.

## Fund

| # | Fund | Klassifikation | Severity |
|---|---|---|---|
| 1 | Skrivesidens audit er server-integritets-håndhævet, konsekvent, manipulationsresistent, retention-sikker som standard | VERIFIED (styrke) | — |
| 2 | Reservations- og fakturagodkendelses-audit tidligere UNKNOWN er nu VERIFIED (dækket via ejende opgave hhv. `logProcure`) | VERIFIED | — |
| 3 | Følsomme LÆSNINGER er klientrapporteret, ikke serverhåndhævet — genbekræftet mod aktuel kode og live adfærd | PARTIAL | **HIGH** |
| 4 | `auditoprydning` mangler legal-hold-tjek før (i dag inaktiv) sletning | PARTIAL | MEDIUM (HIGH hvis retention-flag aktiveres uden fix) |
| 5 | Ingen søgbar/eksporterbar audit-konsol — kun en per-sag, to-måneders aktivitetsfane | PARTIAL | MEDIUM |
| 6 | Ingen alarmering til et menneske for fejl, afviste forsøg eller sårbarheder — kun rå logs | NOT BUILT | HIGH |
| 7 | Ingen anomalidetektion på login | NOT BUILT | LOW–MEDIUM |

Fund 3 er det vigtigste i hele denne audit for RA/ISO-formål og skal citeres
direkte, ikke omskrives blødere, i `00_EXECUTIVE_SECURITY_STATUS.md`.
