# 06 — Retention, Backup &amp; Recovery

Read-only evidensgennemgang. Teknisk implementering holdes eksplicit adskilt
fra juridisk beslutning om konkrete retentionperioder — ingen periode kaldes
"juridisk korrekt" alene fordi den findes i kode.

## A. Retention — to adskilte mekanismer, må ikke sammenblandes

### A1. Auditlog-retention (`audit-regler.js`, ældre, allerede kørende)

- `RETENTION_MAANEDER = { drift: 24, regnskab: 24, sikkerhed: 24 }` —
  eksplicit kommenteret "FORELØBIGT"; bogføringsloven peger mod 60 måneder
  for `regnskab`.
- `RETENTION_AFGJORT = { drift: false, regnskab: false, sikkerhed: false }`
  — **alle tre er `false` i dag.**
- `retentionErAfgjort(klasse)` er et rent opslag på dette flag.
- `forfaldnePartitioner()` returnerer `maaSlettes: retentionErAfgjort(klasse)`
  for hver udløbet partition — **`maaSlettes` er derfor mekanisk altid
  false i dag, uanset alder.**
- `auditoprydning` (planlagt, cron `40 3 1 * *` UTC): `if (!p.maaSlettes) {
  rapporter; continue; }` — kun på `maaSlettes`-grenen kaldes `.remove()`.
  **VERIFIED: givet de nuværende flag-værdier er `.remove()`-kaldet død kode
  — udføres aldrig.**
- **Ny gap, ikke tidligere flagget**: `auditoprydning` udfører INTET
  legal-hold-tjek før sit (i dag sovende) `.remove()`-kald. Se doc 05,
  fund 4.

### A2. Forretningsdata-retentionsystemet (`retention-regler.js`, nyere, beslutning 115)

- 14 kategorier i `RETENTION_KATEGORI`, hver med `periodeMaaneder: null,
  afgjort: false` — **ingen periode er sat for nogen kategori.**
- `anonymiser()`, `eksporterFoerSletning()`, `slet()` er **rene, kastende
  stubs** (`IKKE_BYGGET`) — et kald til nogen af dem kaster øjeblikkeligt.
  **VERIFIED: ingen destruktiv eller anonymiserende evne findes nogen
  steder i denne ramme.**
- `erUndtaget()` (legal-hold-tjek) og `simulerRetention()` (dry-run) er
  reelle, rene, testede funktioner — men kun `retentionDryRun`
  (read-only callable) og `retentionLegalHold` (sætter/hæver en hold)
  bruger dem. Ingen af dem sletter eller anonymiserer noget.
- `retentionLegalHold` kræver `retention.skriv` + `retention.laes`; skriver
  én post til `tenants/<t>/retention/legalHold/<id>`; auditlogget via
  `logRetention()`. **VERIFIED.**

**Klassifikation**: retentionMEKANISMEN (kategorisering, dry-run, hold) =
**VERIFIED som ikke-destruktiv og korrekt gated**. Retentionsperioderne (24
måneder, eller et hvilket som helst fremtidigt tal) =
**ORGANIZATIONAL/EXTERNAL/LEGAL**, uanset kodetilstand.

**Anonymisering samlet: NOT BUILT.** Ingen fungerende anonymisering findes
nogen steder uden for den kastende stub.

## B. Backup

Søgt i `firebase.json`, alle 7 scripts i `scripts/`, rod-`package.json`, og
alle `onSchedule`-funktioner — **ingen backup-/eksportværktøj af nogen art
fundet.** Ingen RTDB-eksportscript, ingen planlagt eksportfunktion, intet
Cloud Storage-eksportmål konfigureret. `firebase.json` har ingen
`storage`-blok overhovedet.

`BACKUP_POLICY`-objektet i `retention-regler.js` er en **ren
pladsholderpost** (`periodeMaaneder: null, afgjort: false`) — den
dokumenterer at backup er et SEPARAT spørgsmål fra dataretention, men
definerer ingen faktisk politik eller mekanisme.

**Klassifikation: NOT BUILT** (repo-verificerbar teknisk implementering).
Om Google Cloud/Firebase udfører nogen infrastruktur-niveau automatisk
backup af denne RTDB-instans **kan ikke afgøres fra repoet** — RTDB (i
modsætning til Firestore) har markant svagere indbygget backup-værktøj, og
intet i dette repo konfigurerer de (begrænsede) muligheder der findes.
**Klassifikation: UNKNOWN** for infrastruktur-niveau backup — anbefales
tjekket direkte i GCP/Firebase-konsollen frem for antaget i nogen retning.
**Severity: HIGH** (intet bevis for at nogen genskabelig kopi af
produktionsdata findes, som dette team kontrollerer eller har verificeret).

## C. Gendannelse &amp; katastrofegenopretning

Søgt i `README.md`, `ARKITEKTUR.md`, `BESLUTNINGER.md`, hele `docs/`, og
`scripts/` for restore/gendan/disaster/runbook/RTO/RPO. **Ingen
gendannelsesprocedure, runbook eller incident-/DR-dokumentation findes
nogen steder i repoet. Klassifikation: NOT BUILT.**

**Ingen gendannelse er nogensinde testet** — ingen testscript, ingen
dokumentation af én. **NOT BUILT.**

**RPO og RTO er ikke defineret nogen steder**, hverken formelt eller
uformelt. **NOT BUILT.** Der er ikke gættet plausible tal i stedet.

**Severity: CRITICAL** — kombineret med afsnit B findes der i dag ingen
verificeret måde at genskabe tenant-data efter tab/korruption, og intet
defineret mål for hvor meget datatab eller nedetid der ville være
acceptabelt.

## D. Monitorering (backup-/kontinuitetsrelevant del)

Se `05_AUDIT_LOGGING_AND_MONITORING.md` for den fulde gennemgang. Kort
opsummeret her: ingen fejlrapporterings-/alarmeringsafhængighed findes;
det eneste der findes er GCPs standard Cloud Logging (logning der findes,
ikke alarmering der når et menneske). Ingen Dependabot/tilsvarende
konfigureret i repoet. Ingen oppetidsovervågning konfigureret.

## Fund

| # | Fund | Klassifikation | Severity |
|---|---|---|---|
| 1 | Retentionmekanismen (kategorisering, dry-run, legal hold) er ikke-destruktiv og korrekt gated | VERIFIED (styrke) | — |
| 2 | Ingen retentionperiode er juridisk afgjort for nogen kategori (alle `afgjort: false`) | ORGANIZATIONAL/EXTERNAL | — (ikke en kodefejl) |
| 3 | Anonymisering er en kastende stub — ingen faktisk evne | NOT BUILT | MEDIUM |
| 4 | `auditoprydning` mangler legal-hold-kobling (se doc 05, fund 4) | PARTIAL | MEDIUM→HIGH |
| 5 | Ingen backup-mekanisme verificerbar fra repoet; infrastrukturniveau ukendt | NOT BUILT / UNKNOWN | HIGH |
| 6 | Ingen gendannelsesprocedure, ingen testet gendannelse, ingen RPO/RTO defineret | NOT BUILT | **CRITICAL** |

Fund 5 og 6 er de mest alvorlige i denne del af auditten og bør fremhæves
direkte i `00_EXECUTIVE_SECURITY_STATUS.md` og i Gate C/D i
`12_FINDINGS_AND_REMEDIATION_PLAN.md`.
