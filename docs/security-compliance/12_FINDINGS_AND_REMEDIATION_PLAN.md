# 12 — Findings &amp; Remediation Plan

Samlet, prioriteret liste over alle fund fra dokument 01-11. Severity er
sat ud fra faktisk exploit/risiko, ikke ud fra hvor let noget er at rette.
Et fund kan godt høre til flere gates.

**Severitydefinition** (som instrueret):
- **CRITICAL** — umiddelbar krydstenant-/data-/legitimations-/
  sikkerhedskompromis-risiko.
- **HIGH** — væsentlig kontrol mangler før ekstern eksponering/enterprise.
- **MEDIUM** — reel hærdnings-/evidensmangel.
- **LOW** — forbedring eller housekeeping.

---

## GATE A — BLOCKER BEFORE 3D (udgående mail)

**Status: IMPLEMENTERET (Skive 3D).** Alle 7 krav er bygget i `sagMailSend`
(functions/index.js) + den delte transport i `functions/mail/`, mekanisk
bevist i `test/skive3d-sagmail.test.mjs` og `test/rules.sager.test.mjs`.
Provider: Mailgun (EU-region) — se doc 08's "Provider decision". Tabellen
nedenfor er den oprindelige gate-liste, bevaret som reference.

| # | Fund | Severity | Kilde | Status |
|---|---|---|---|---|
| A1 | Modtageradresse SKAL opløses server-side fra sagens gemte `parter[]`, aldrig fra et klient-leveret felt ved afsendelse | **CRITICAL** | doc 08 §5 | ✅ Implementeret |
| A2 | Udbyder-hemmeligheden må kun ligge i Cloud Functions-secrets, aldrig i en `VITE_*`-klientvariabel | **CRITICAL** | doc 08 §2 | ✅ Implementeret |
| A3 | Permission-gate skal håndhæves server-side på send-callablen, samme mønster som alle andre funktioner | HIGH | doc 08 §4 | ✅ Implementeret |
| A4 | Tenant skal genverificeres server-side mod sagen der sendes fra | HIGH | doc 08 §3 | ✅ Implementeret |
| A5 | Auditpost skal skrives server-side for ethvert forsøg, succes såvel som fejl | HIGH | doc 08 §12 | ✅ Implementeret |
| A6 | Header-injektions-sanering på emne/reply-to | HIGH | doc 08 §7 | ✅ Implementeret |
| A7 | Idempotensnøgle på send-callablen, så en retry ikke bliver en dobbelt ekstern besked | MEDIUM-HIGH | doc 08 §11 | ✅ Implementeret |
| A8 | (Fundet under implementeringen) `sensitive/sager`s eksisterende betingede klient-write kunne forfalske en "mail sendt"-post uden om sagMailSend | HIGH | ny, se doc 02/04 | ✅ Rettet — kun `kanal: "internNote"` er direkte klientskrivbart |

**Disse syv er forudsætninger, ikke efterfølgende hærdning** — deres fravær
gør "FleetControl sender e-mail" til "FleetControl kan få nogen til at
sende e-mail som hvem som helst den angribes." Ingen af dem er bygget i
dag, fordi 3D ikke er startet — de skal være en del af 3D's FØRSTE
implementering, ikke tilføjes bagefter.

**Stærkt tilrådet, men ikke en formel Gate A-blokering** (fordi de allerede
er generelle platformmangler, ikke noget der bliver farligere netop af
mail): App Check (findes ikke, se doc 07 fund 4), applikationsniveau rate
limiting (findes ikke, doc 07 fund 5) — begge bør dog realistisk løses
SAMTIDIG med 3D, fordi en udgående mail-callable er den første funktion i
systemet hvis misbrug har en konsekvens UDEN FOR FleetControls egne data
(spam, omdømme, provider-blokering).

---

## GATE B — BLOCKER BEFORE FILE/DOCUMENT STORAGE (4C)

Detaljeret i `09_FILE_STORAGE_SECURITY_GATE.md`. Intet er bygget; dette er
beslutninger der skal træffes FØR den første linje kode.

| # | Fund | Kilde |
|---|---|---|
| B1 | Objektsti-skema med obligatorisk tenant-segment + Storage Rules der håndhæver det server-side (ikke kun RTDB-regler) | doc 09 §1 |
| B2 | Upload-/download-permissionmodel — genbrug `sag.skriv`-bundtet eller indfør parrede `*.dokumentSkriv`/`*.dokumentLaes` | doc 09 §2-3 |
| B3 | Klassifikationsmodel for dokumenter (arver fra sagen, eller pr. dokument) og hvordan Storage Rules evaluerer det uden RTDB-opslag | doc 09 §4 |
| B4 | MIME-allowlist og filstørrelsesgrænser (pr. fil og pr. tenant) | doc 09 §5-6 |
| B5 | Malware-scanning/karantænestrategi — genbrug det eksisterende `karantaene`-UI-mønster fra sagsmodellen frem for at opfinde et nyt | doc 09 §7 |
| B6 | Filnavnehåndtering (intern ID + metadata, aldrig råt filnavn som sti) | doc 09 §9 |
| B7 | Integration med det EKSISTERENDE retention-/legal-hold-system, ikke et parallelt | doc 09 §10 |
| B8 | Audit-dækning for upload/download-link-udstedelse/sletning, server-side | doc 09 §12 |
| B9 | Eksplicit bekræftelse af bucket-region for DEV og PROD | doc 09 §13 |

---

## GATE C — BEFORE ENTERPRISE / RA PILOT

Sikkerhedsfunktioner/evidens en større kunde med rimelighed vil forvente.

| # | Fund | Klassifikation | Severity | Kilde |
|---|---|---|---|---|
| C1 | Ingen gendannelsesprocedure, ingen testet gendannelse, intet RPO/RTO | NOT BUILT | **CRITICAL** | doc 06 |
| C2 | Ingen verificerbar backup-mekanisme | NOT BUILT/UNKNOWN | HIGH | doc 06 |
| C3 | Følsomme læsninger er klientrapporteret, ikke serverhåndhævet auditlogget | PARTIAL | HIGH | doc 05 |
| C4 | Ingen alarmering til et menneske for fejl/afviste forsøg/uregelmæssigheder | NOT BUILT | HIGH | doc 05 |
| C5 | App Check ikke slået til — ethvert gyldigt brugertoken kan kalde enhver funktion | NOT BUILT | MEDIUM-HIGH | doc 07 |
| C6 | Ingen MFA | NOT BUILT/ORG | HIGH | doc 03 |
| C7 | Ingen SSO/federation | NOT BUILT | MEDIUM | doc 03 |
| C8 | Ingen søgbar/eksporterbar audit-konsol — kun en per-sag, to-måneders aktivitetsfane | PARTIAL | MEDIUM | doc 05 |
| C9 | Ingen applikationsniveau rate limiting | PARTIAL | MEDIUM | doc 07 |
| C10 | Ingen idempotensbeskyttelse på oprettelseskald | NOT BUILT | MEDIUM | doc 07 |
| C11 | Ingen Netlify/Hosting-sikkerhedsheadere (CSP m.v.) | NOT BUILT | MEDIUM | doc 07 |
| C12 | 20 kendte, uafhjulpne afhængighedssårbarheder | PARTIAL | MEDIUM | doc 07 |
| C13 | Ingen CI/CD eller automatiseret afhængighedsscanning | NOT BUILT/ORG | MEDIUM | doc 07 |
| C14 | `audit/` uden for den generiske krydstenant-testsuites scanningstræ | PARTIAL | MEDIUM | doc 02 |
| C15 | Referencefelters tenant-scoping ikke pr.-felt-testet mod et reelt forsøg | PARTIAL | MEDIUM | doc 02 |
| C16 | Ingen formel break-glass-procedure | NOT BUILT | MEDIUM | doc 03 |
| C17 | Forældet-claim-vindue efter tilbagekaldelse (intet tvunget genopfriskningstjek) | PARTIAL | MEDIUM | doc 03 |
| C18 | Ingen GDPR-sletning-på-anmodning i produktet | NOT BUILT | MEDIUM | doc 04 |
| C19 | Sti-segment-input ikke karaktersaneret (afgrænset til egen tenant) | PARTIAL | MEDIUM | doc 01/07 |

---

## GATE D — BEFORE ISO 27001 CERTIFICATION

Tekniske og organisatoriske rester. Se `11_ISO27001_TECHNICAL_READINESS.md`
for domæneopdelingen.

| # | Fund | Klassifikation | Severity | Kilde |
|---|---|---|---|---|
| D1 | (= C1, C2) Backup/DR-domænet har INGEN positiv teknisk understøttelse | NOT BUILT | **CRITICAL** | doc 06/11 |
| D2 | (= C3) Læsesporing af følsomme data er ikke serverhåndhævet | PARTIAL | HIGH | doc 05/11 |
| D3 | Ingen retentionperiode juridisk afgjort for nogen kategori | ORGANIZATIONAL/LEGAL | — | doc 06 |
| D4 | Anonymisering er en kastende stub — ingen faktisk evne | NOT BUILT | MEDIUM | doc 06 |
| D5 | `auditoprydning` mangler legal-hold-kobling før (i dag inaktiv) sletning | PARTIAL | MEDIUM→HIGH ved aktivering | doc 05/06 |
| D6 | `securityLevel`-felt skema-defineret på 5 noder, reelt ubrugt — falsk dækningsindtryk | NOT BUILT | LOW | doc 04/11 |
| D7 | `udbyder`-tildeling/-fratagelse går uden om appens eget auditspor | PARTIAL | MEDIUM | doc 03 |
| D8 | Ingen e-mailbekræftelse/invite-flow ved kontooprettelse | ORGANIZATIONAL | MEDIUM | doc 03 |
| D9 | Standard compute-servicekonto i brug; faktisk IAM-scope ukendt | UNKNOWN | Afhænger af IAM | doc 03 |
| D10 | Ingen dokumenteret adgangsgennemgangs-, hændelsesrespons-, leverandørrisiko- eller change-review-proces kunne findes i repoet | ORGANIZATIONAL/EXTERNAL | — | doc 11 (alle domæner) |
| D11 | Pre-commit-hook dækker ikke fuld testsuite, kun betingede udsnit | PARTIAL | LOW | doc 07 |
| D12–D19 | (= C4–C13, gentaget fordi de også er ISO-relevante logning-/sårbarheds-/kontinuitetsfund) | — | — | doc 05/07/11 |

---

## De stærkeste VERIFIED-fund (til brug i executive-sammendraget)

Disse skal ikke drukne i gap-listen — de er den reelle, mekanisk beviste
del af fundamentet:

1. Tenant-isolationsmønstret er anvendt uden undtagelse på ~70 regelblokke
   og nul klient-leverede tenantId-steder i 44 Cloud Functions (doc 01/02).
2. En selv-opdaterende krydstenant-testsuite dækker automatisk hver ny
   tenant-bunden node (doc 02).
3. `roller`-noden bruges aldrig til autorisation — kun `auth.token.perms`
   (doc 03).
4. Platform-ejer-adgang kan kun tildeles via et out-of-band script der
   kræver en service-account-nøglefil uden for applikationen (doc 03).
5. Selvlåsnings-invarianter er reelt server-håndhævede (doc 03).
6. `sensitive/`-familien er konsekvent scopet med nul parent-kaskade-risiko;
   GDPR art. 9-helbredsoplysning er bevidst arkitektonisk udelukket fra
   selvbetjening (doc 04).
7. Skrivesidens auditlog er server-integritets-håndhævet, append-only,
   manipulationsresistent, og retention-sikker som standard — intet er
   nogensinde slettet automatisk under den nuværende konfiguration
   (doc 05/06).
8. 100% auth-tjek-dækning på 44 callable-funktioner; nul rå
   HTTP-endepunkter; nul reel XSS-flade (doc 07).
9. Intet hemmeligt materiale i repoet; DEV og PROD er to genuint adskilte
   Firebase-projekter med mekanisk, ikke manuel, miljødetektion (doc 07).

## Det gennemgående mønster

Adgangskontrol og skrivesporbarhed er markant stærkere end kontinuitet og
alarmering. Prioritér i denne rækkefølge, uafhængigt af hvor let hvert
punkt er at rette:

1. **Backup/gendannelse** (C1/C2/D1) — intet fundament findes overhovedet.
2. **Alarmering** (C4) — logning findes, ingen når et menneske.
3. **Læsesporing af følsomme data** (C3/D2) — det mest ISO/RA-kritiske
   enkeltfund, kræver en arkitekturændring (led følsomme læsninger gennem
   en callable) frem for en detaljerettelse.
4. Derefter Gate A i sin helhed, hvis/når 3D besluttes startet.
