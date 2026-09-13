# WORKFORCE v2 — integrationsoverlevering

Dato: 13. september 2026  
Produktbase: `989dbb87db639efed0ba1b5a1e271560f7659a0c`  
Modulbranch: `codex/workforce-integrated-development`

## Statusmarkering

- **Implementeret:** samlet WORKFORCE-domæne, IndexedDB-repository,
  leder-/medarbejder-UI, responsiv mobilflade, PLANNING-normalisering og tests.
- **Teknisk forberedt:** adapterkontrakt til det eksisterende fælles
  `personale`, `fravaer`, `kompetencer` og PLANNINGs workforce-adapter.
- **Udestår i samlingen:** root-route/navigation, claims/permissions,
  Firebase-regler, serverkommandoer og migrering af modulrepositoryet til de
  fælles noder. De filer ejes af integrationschatten og er ikke ændret her.

## Fælles identitet og ejerskab

| Oplysning | Læseejer | Skriveejer | Felt i modul | Fælles felt |
|---|---|---|---|---|
| Medarbejderidentitet | alle relevante moduler | fælles medarbejderadministration | `employee.id` | `personale/<personId>` |
| Loginrelation | brugeradministration | sikker brugeradministration | `employee.userId?` | `brugere/<uid>/personId` |
| Stamdata/funktioner | relevante moduler | WORKFORCE/register | `name`, `functions`, `workplace` | `navn`, `funktioner{}`, `stationeret` |
| Organisation | WORKFORCE | WORKFORCE | `team`, `department`, `managerId` | foreslået udvidelse; ingen `division` |
| Vagter/arbejdstid | WORKFORCE | WORKFORCE | `shifts[]` | ny `vagter/<id>` |
| Fraværsperiode | relevante moduler | WORKFORCE | `leaves[]` | eksisterende `fravaer/<id>` |
| Fraværsårsag | særskilt rettighed | WORKFORCE | `sensitiveLeave` | `sensitive/fravaer/<id>` |
| Kompetencer | relevante disponeringsflows | WORKFORCE | `skills[]` | eksisterende `kompetencer/<id>` |
| Faktisk tid | medarbejder + leder | WORKFORCE | `timeEntries[]` | eksisterende `stemplinger/<personId>/<id>` |

Team, afdeling, arbejdssted og lederansvar er organisatoriske stamdata. De
bruges til filtrering og godkendelsesansvar, men må ikke begrænse hvilke
kompetencer medarbejderen kan have. `division` genindføres ikke.

## Ønskede fælles ændringer

1. `src/App.jsx`: lazy-load en integrationswrapper for `WorkforceV2App` og
   montér `/workforce/*`. Bevar redirects fra `/bemanding/*` og
   `/opsaetning/medarbejdere` til den samme medarbejderflade.
2. `src/fleet/nav.js`: WORKFORCE med Overblik, Medarbejdere, Bemanding,
   Ferie & fravær, Kompetencer og Timer. Medarbejderens `/app` kan linke til
   samme selvbetjeningskomponent uden en ekstra medarbejderdatabase.
3. `src/fleet/permissions.js`: genbrug `personale.*`, `fravaer.*` og
   `kompetencer.skriv`. Tilføj snævre permissions for `vagter.laes`,
   `vagter.skriv`, `stemplinger.laesAlle` og `stemplinger.rette` i stedet for
   rolletjek. Egen plan/tid/frihed afgrænses med `brugere/<uid>/personId`.
4. `firebase.rules.json`: ny `vagter/<id>` med tenant/modulgate, feltallowlist,
   halvåbent tidsinterval, statusordliste, forbud mod hard delete og servervej
   til publicering/kopiering. Bevar eksisterende general/sensitive-split.
5. Cloud Functions: kommandoer til vagt-create/update/cancel/publish/copy,
   fravær register/update/cancel og tidsrettelse. Fraværskommandoen skal
   atomisk skrive eller fjerne `reservationer/medarbejder/<personId>/res-<id>`.
   ID’et udledes af fraværs-id’et, så gentagne kald er idempotente.
6. Firebase-adapter: normalisér via `toPlatformEmployee()` og
   `toPlanningWorkforceFacts()`. PLANNING skal kalde
   `checkPlanningAssignment()`/den fælles serverkerne på opgavens tidspunkt.

## Hændelser

- `workforce.employee.changed.v1`: `tenantId`, `personId`, `changedFields`, `atMs`.
- `workforce.availability.changed.v1`: `tenantId`, `personId`, `fromMs`,
  `toMs`, `sourceType`, `sourceId`, `available`, `atMs` — ingen årsag.
- `workforce.shift.published.v1`: `tenantId`, `shiftId`, `personId`, `fromMs`, `toMs`, `atMs`.
- `workforce.skill.changed.v1`: `tenantId`, `personId`, `skillType`,
  `validUntilMs`, `atMs` — ingen dokumentindhold.

Andre moduler læser medarbejderidentitet og tilgængelighed. De skriver ikke
vagter, fravær, kompetencer eller stemplinger.

## Acceptscenarier for samlingen

### Påkrævet tværsessionsforløb

Afprøv fraværsflowet mellem **to separate, samtidigt autentificerede
sessioner** mod den fælles backend. “Vis som” i standalone-prototypen er kun
et previewværktøj og kan ikke bruges som bevis for claims, tenant-isolation
eller rettighedskontrol.

1. Session A er autentificeret som en medarbejder med
   `brugere/<uid>/personId` og indsender en frihedsanmodning.
2. Session B er autentificeret som en anden bruger med den relevante
   godkendelsespermission og godkender anmodningen med et svar.
3. Session A modtager/læser den gemte afgørelse og svaret efter genindlæsning
   fra den fælles backend.
4. PLANNING læser den ændrede tilgængelighed fra samme backend og afviser
   eller markerer en tildeling i fraværsperioden uden at kende den følsomme
   årsag.
5. Gentag godkendelseskaldet og kontrollér, at der fortsat kun findes én
   fraværspost og én reservation med id afledt af fraværets id.

Dokumentér begge uid'er, deres forskellige claims/permissions, det fælles
`tenantId`, fraværs-id, reservations-id og PLANNING-resultatet. Brug ikke
screenshots med tokens eller følsomme fraværsnoter.

1. Deaktivér alle driftsmoduler undtagen WORKFORCE; register, vagtplan,
   fravær, kompetencer, timer og selvbetjening skal fortsat virke.
2. Opret en medarbejder uden `uid`; vælg samme `personId` i FLEET, WMS,
   FACILITY, UNITBOOKING, PROCURE og Fakturacenter, hvor valget findes.
3. Offentliggør en vagt og verificér, at kun den tilknyttede medarbejder kan
   se den i egen adgang.
4. Godkend samme fraværsanmodning to gange; der må findes præcis én
   reservation. Ændr perioden og annullér; kun den reservation må ændres/fjernes.
5. Opret fravær hen over en vagt og PLANNING-opgave; begge skal vises som
   berørte, men ingen opgave må slettes eller omfordeles automatisk.
6. Tildel en PLANNING-opgave inden i en offentliggjort vagt; vagten må ikke
   udløse dobbeltbooking. Fravær og andre opgaver kan stadig gøre det.
7. Prøv certifikatkravet både før og efter `validUntilMs`; serverresultatet
   skal skifte på opgavens tidspunkt.
8. Verificér tenant-isolation og at en bruger uden `fravaer.sensitiveLaes`
   kan se utilgængelighed, men ikke årsag eller note.
