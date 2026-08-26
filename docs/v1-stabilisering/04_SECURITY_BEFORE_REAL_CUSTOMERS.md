# Security/compliance-status før rigtige kunder

Dette genbruger det eksisterende security-compliance-checkpoint (`docs/security-compliance/00-12`, `CLAUDE.md`, `ARKITEKTUR.md`). Der er ikke åbnet nogen ny sikkerhedsundersøgelse, og der er ikke oprettet nye sikkerhedsopgaver — kun en klassifikation af hvad der allerede står skrevet. Gate C løses ikke her.

To bøtter, ingen andre:
- **OK FOR INTERN DEV TEST** — fint som det er til at ejerne bruger det internt i DEV nu.
- **BLOCKS REAL CUSTOMER USE** — skal løses før en rigtig betalende kundes rigtige data rører dette.

| Emne | Klassifikation | Begrundelse | Kilde |
|---|---|---|---|
| Malware-scanning af uploadede dokumenter | **BLOCKS REAL CUSTOMER USE** | Bevidst ikke bygget endnu. En prøve håndhæver at ingen scanner-kald findes i koden. | `test/skive4c-dokumenter.test.mjs:157-165`; `docs/security-compliance/09_FILE_STORAGE_SECURITY_GATE.md` §7 |
| Backup/restore — database (RTDB) | **BLOCKS REAL CUSTOMER USE** (CRITICAL) | Ingen eksport/backup-værktøj, ingen testet gendannelsesprocedure, intet RPO/RTO defineret. | `docs/security-compliance/06_RETENTION_BACKUP_AND_RECOVERY.md` §B-C; `00_EXECUTIVE_SECURITY_STATUS.md:40-44` |
| Backup/restore — Storage (filer) | **BLOCKS REAL CUSTOMER USE** | GCS soft-delete (7 dage) er aktiveret på DEV-bucket'en, men beskytter kun selve blob'en, ikke den parrede RTDB-metadatapost, og erstatter ikke en reel gendannelsesprocedure — dokumenteret eksplicit som IKKE en løsning på ovenstående. | `ARKITEKTUR.md:49-82` |
| MFA | **BLOCKS REAL CUSTOMER USE** | Ingen tilmeldings- eller verifikationsflow findes nogen steder i koden. | `docs/security-compliance/03_IDENTITY_PERMISSIONS_AND_ADMIN.md` §D |
| App Check | **BLOCKS REAL CUSTOMER USE** | Ikke koblet til nogen steder — enhver gyldig brugerlogin kan kalde enhver af de 44 Cloud Functions fra et hvilket som helst klient. | `docs/security-compliance/07_SECURE_DEVELOPMENT_AND_DEPLOYMENT.md:37-44` |
| Monitoring/alerting | **BLOCKS REAL CUSTOMER USE** | Standard GCP-logning findes, men intet varsler et menneske — ingen fejlrapportering, ingen anomali-/login-detektion, ingen oppetidsovervågning. | `docs/security-compliance/05_AUDIT_LOGGING_AND_MONITORING.md` §D |
| Sensitive-data læse-audit | **BLOCKS REAL CUSTOMER USE** | Skrivninger er solidt server-håndhævede; læsninger af `sensitive/`-data er kun klient-rapporterede og kan læses direkte uden om enhver audit. Kræver en arkitekturændring (route følsomme læsninger gennem et callable), ikke en patch. | `docs/security-compliance/05_AUDIT_LOGGING_AND_MONITORING.md` §B; `CLAUDE.md`'s egen note om `sensitive/`-læsninger |
| GDPR-sletning efter anmodning | **BLOCKS REAL CUSTOMER USE** | Ikke bygget — retention-rammeværkets `slet()`/`anonymiser()` er bevidste, kastende stubs. | `docs/security-compliance/06_RETENTION_BACKUP_AND_RECOVERY.md` §A2; `12_FINDINGS_AND_REMEDIATION_PLAN.md` C18 |
| Retention-perioder (juridisk uafklaret) | **BLOCKS REAL CUSTOMER USE** | Arkitektonisk klar (klassifikation, dry-run, legal hold virker og er korrekt spærret), men enhver periode er `afgjort: false`. Ingen automatisk sletning sker i dag — det er en organisatorisk/juridisk beslutning, ikke en kodefejl. | `CLAUDE.md`'s `RETENTION_MAANEDER`/`RETENTION_AFGJORT`-note |
| Udgående mail (Skive 3D/4D, Mailgun EU) | **OK FOR INTERN DEV TEST** *(og funktionelt solid til rigtig brug)* | Alle 7 Gate A-krav er implementeret og mekanisk bevist. Nævnt som kontrast — dette er den ene port i denne audit der reelt er lukket. | `docs/security-compliance/12_FINDINGS_AND_REMEDIATION_PLAN.md` Gate A |
| Dokumentlagerets tenant-isolation/adgangsvej (minus scanning) | **OK FOR INTERN DEV TEST** | `storage.rules` blokerer al direkte klientadgang; al reel adgang går gennem fire Cloud Functions med kortlivede signerede URL'er; ingen global `dokumenter.laes/.skriv`-permission. | `README.md:99-103`; `ARKITEKTUR.md:39-47` |

**Ikke klassificerbart fra repoet alene (undlad at gætte):** om Google Cloud/Firebase selv laver nogen form for infrastruktur-niveau automatisk backup af RTDB-instansen — tjek direkte i GCP/Firebase-konsollen. Samme forbehold for den fulde IAM-rækkevidde på standard compute-servicekontoen.

## Konklusion for denne audit

Ingen af ovenstående kræver handling for at starte **intern DEV-test** — det er præcis den brug ejerne allerede laver. Listen bliver relevant den dag en rigtig kundes rigtige data first skal ind i systemet, og er allerede sporet i detalje i de refererede dokumenter. Denne audit tilføjer ikke nye sikkerhedsopgaver — kun et opdateret, ét-steds overblik over hvad der allerede er kendt.
