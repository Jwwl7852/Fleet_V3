# WORKFORCE v2 — integrationsoverlevering

Dato: 13. september 2026  
Produktbase: `989dbb87db639efed0ba1b5a1e271560f7659a0c`  
Modulbranch: `codex/workforce-integrated-development`

## Integrationscheckpoint

Integrér det fulde tip af `codex/workforce-integrated-development` efter den
afsluttende WORKFORCE-commit, ikke rapportens gamle supportbranch.

- **Implementeret lokalt:** WORKFORCE-domæne, IndexedDB-repository,
  leder-/medarbejder-UI, mobilflade, PLANNING-normalisering, korrektionsrunde
  og regressionstests.
- **Teknisk forberedt:** adapterkontrakt til fælles `personale`, `fravaer`,
  `kompetencer`, `stemplinger` og PLANNINGs workforce-adapter.
- **Udestår i samlingen:** root-route/navigation, abonnementsgates,
  autentificerede claims/permissions, Firebase-regler, serverkommandoer,
  feltprojektion og migrering fra modulrepository til de fælles noder.

Fælles filer og backendændringer ejes af samlings-Codex efter
`docs/VEYRO_MODULUDVIKLINGSSPOR_V1.md` og er derfor ikke ændret i dette spor.

## Fælles identitet, data og abonnement

Der må kun findes én medarbejderidentitet. En medarbejder er ikke det samme
som et login og kan eksistere uden `uid`.

| Oplysning | Læseejer | Skriveejer | Felt i modul | Fælles felt |
|---|---|---|---|---|
| Medarbejderidentitet | alle relevante moduler | fælles medarbejderadministration | `employee.id` | `personale/<personId>` |
| Loginrelation | sikker brugeradministration | sikker brugeradministration | `employee.userId?` | `brugere/<uid>/personId` |
| Stamdata/funktioner | relevante moduler | fælles medarbejderregister | `name`, `functions`, `workplace` | `navn`, `funktioner{}`, `stationeret` |
| Organisation | WORKFORCE | WORKFORCE | `team`, `department`, `managerId` | foreslået udvidelse; ingen `division` |
| Vagter/arbejdstid | WORKFORCE | WORKFORCE | `shifts[]` | ny `vagter/<id>` |
| Fraværsperiode/status | relevante moduler | WORKFORCE | `leaves[]` | eksisterende `fravaer/<id>` |
| Ansøgt kategori/note | egen medarbejder eller særskilt læseret | WORKFORCE | projekterede ansøgningsfelter | skal serverprojekteres |
| Registreret fraværsårsag | særskilt læseret | WORKFORCE | `sensitiveLeave` | `sensitive/fravaer/<id>` |
| Kompetencer | relevante disponeringsflows | WORKFORCE | `skills[]` | eksisterende `kompetencer/<id>` |
| Faktisk tid | medarbejder + leder | WORKFORCE | `timeEntries[]` | eksisterende `stemplinger/<personId>/<id>` |

Den fælles, minimale medarbejderstamme i `personale` skal være tilgængelig
for relevante valg og historik i FLEET, WAREHOUSE, FACILITY, UNITBOOKING,
PROCURE, Fakturacenter og PLANNING, selv når kunden ikke abonnerer på
WORKFORCE. WORKFORCE-abonnementet må gate vagtplan, fravær, kompetencer,
timer og udvidede administrationsflader, men må ikke gøre et almindeligt
medarbejdervalg i et andet modul umuligt.

Team, afdeling, arbejdssted og lederansvar er organisatoriske stamdata. De
kan bruges til filtrering og godkendelsesomfang, men må ikke begrænse hvilke
kompetencer medarbejderen kan have. Det tidligere afviste `division`-felt
genindføres ikke.

## Præcise ændringer til samlings-Codex

1. **Route og navigation.** Lazy-load en integrationswrapper for
   `WorkforceV2App` i `src/App.jsx`, montér `/workforce/*`, og tilføj
   Overblik, Medarbejdere, Bemanding, Ferie & fravær, Kompetencer og Timer i
   `src/fleet/nav.js`. Redirects fra ældre bemandings- og
   medarbejderadgange skal føre til samme register.
2. **Claims og permissions.** Genbrug `personale.*`, `fravaer.*` og
   `kompetencer.skriv`. Tilføj snævre permissions for `vagter.laes`,
   `vagter.skriv`, `stemplinger.laesAlle` og `stemplinger.rette`. Egen adgang
   afgrænses servermæssigt via `brugere/<uid>/personId`; UI-vælgeren “Vis som”
   er kun lokal preview og må ikke indgå som sikkerhedskontrol.
3. **Følsom fraværsprojektion.** Den fælles backend skal returnere periode,
   omfang, status, konfliktreferencer og id til en godkender uden automatisk
   at returnere ønsket kategori, fri tekst eller registreret årsag. Egen
   medarbejder må efter eksisterende politik læse egen ansøgning og svar.
   Faktisk årsag og følsomme noter kræver særskilt læseret. Hvis den direkte
   RTDB-struktur ikke kan håndhæve feltprojektion, skal ansøgningsnoter
   flyttes til en scoped/sensitiv satellit eller læses gennem en serverquery;
   bred `.read` på `fravaer` må ikke levere dem til klienten.
4. **Vagter.** Opret regler og serverkommandoer for
   create/update/cancel/publish/copy. `vagter/<id>` skal have tenant- og
   modulgate, feltallowlist, halvåbent tidsinterval, statusordliste og forbud
   mod hard delete. Publicering og seriekopiering skal være serverstyret.
5. **Fravær og reservationer.** Implementér idempotente serverkommandoer for
   request/decide/register/update/cancel. En reservation skal have stabilt id
   afledt af fraværs-id'et og må kun repræsentere dette konkrete fravær.
   Gentagne kald må ikke skabe dubletter.
6. **Autoritativ genberegning.** Annullering må ikke ubetinget udsende eller
   gemme `available: true`. Efter enhver mutation genberegnes tilgængelighed
   fra alle autoritative, gældende fraværsposter og øvrige blokerende fakta.
   Overlappende fravær kan derfor holde medarbejderen utilgængelig, selv om én
   post annulleres.
7. **Gamle og nye påvirkninger.** Ved ændring skal transaktionen behandle
   unionen af gammel og ny periode samt både gammel og ny `personId`, hvis
   medarbejderen ændres. Gamle reservationer/indekser fjernes eller
   genberegnes, nye oprettes, og availability-events dækker begge påvirkede
   områder. Dette skal være atomisk eller versionskontrolleret.
8. **Godkendelsesomfang.** Projektet har ikke en fastlagt kontrakt for, om
   godkendelse afgrænses efter team, afdeling, arbejdssted eller konkret
   lederrelation, og heller ikke om en privilegeret bruger må godkende egen
   ansøgning. Beslutningen er **uafklaret** og skal træffes af produktejer før
   backendaccept. Indtil da skal serveren fejle lukket for egen godkendelse og
   godkendelse uden et eksplicit tildelt omfang; et UI-filter er ikke nok.
9. **Tid og kompetencer.** Tidsrettelser skal kræve permission, begrundelse
   og audit. Kompetencekrav skal evalueres på serveren mod opgavens tidspunkt
   og kravtype; obligatoriske blokeringer kan ikke tilsidesættes generelt.
10. **Adaptere.** Normalisér fælles data via `toPlatformEmployee()` og
    `toPlanningWorkforceFacts()`. PLANNING skal kalde
    `checkPlanningAssignment()` eller samme serverkerne på opgavens
    tidspunkt. En PLANNING-opgave inde i en vagt er ikke overlap med vagten;
    fravær eller en anden opgave kan fortsat give konflikt.

## Hændelser

- `workforce.employee.changed.v1`: `tenantId`, `personId`, `changedFields`,
  `atMs`.
- `workforce.availability.changed.v1`: `tenantId`, `personId`, `fromMs`,
  `toMs`, `sourceType`, `sourceId`, `available`, `atMs`. Ingen årsag eller
  note. Eventen udsendes først efter autoritativ genberegning.
- `workforce.shift.published.v1`: `tenantId`, `shiftId`, `personId`, `fromMs`,
  `toMs`, `atMs`.
- `workforce.skill.changed.v1`: `tenantId`, `personId`, `skillType`,
  `validUntilMs`, `atMs`. Intet dokumentindhold.

Andre moduler læser medarbejderidentitet og relevante availability-fakta.
De skriver ikke WORKFORCEs vagter, fravær, kompetencer eller stemplinger.

## Accepttests for samlingen

### Obligatorisk forløb i to autentificerede sessioner

Afprøv mod den fælles backend med **to separate, samtidigt autentificerede
sessioner**. “Vis som” kan ikke bruges som bevis.

1. Session A er medarbejderen med `brugere/<uid>/personId` og indsender en
   frihedsanmodning.
2. Session B er en anden autentificeret bruger inden for det tilladte
   godkendelsesomfang og godkender med et svar.
3. Session A genindlæser fra fælles backend og ser afgørelse og svar.
4. Den faktiske PLANNING-integration læser samme backendtilstand og afviser
   eller markerer en tildeling i perioden uden at modtage årsag eller note.
5. Godkendelseskaldet gentages med samme idempotency key. Der skal stadig
   kun findes én fraværspost og én reservation med id afledt af fraværs-id.

Dokumentér begge uid'er, deres forskellige claims, fælles `tenantId`,
fraværs-id, reservations-id og PLANNING-resultat. Medtag ikke tokens eller
følsomme noter i screenshots.

### Sikkerhed, omfang og samtidighed

1. En medarbejder må ikke kunne læse en anden medarbejders ansøgte kategori,
   note, svar eller registrerede årsag. En godkender uden følsom læseret skal
   kunne behandle periode og anmodning uden at modtage disse felter.
2. En bruger med godkendelsespermission, men uden for tilladt organisatorisk
   omfang, skal afvises på serveren. Test egen godkendelse efter den besluttede
   politik.
3. Kør samtidige modstridende godkendelses-, ændrings- og annulleringskald.
   Versionskontrol/transaktion skal give én deterministisk sluttilstand, én
   auditsekvens og ingen dubletreservationer.
4. Verificér tenant-isolation på læsning, queries og alle skrivekommandoer.

### Funktionelle integrationsscenarier

1. Deaktivér alle driftsmoduler undtagen WORKFORCE; register, vagtplan,
   fravær, kompetencer, timer og selvbetjening skal fortsat virke.
2. Deaktivér WORKFORCE og verificér, at det minimale medarbejderregister
   fortsat kan levere medarbejdervalg i FLEET, WAREHOUSE, FACILITY,
   UNITBOOKING, PROCURE, Fakturacenter og PLANNING, hvor funktionerne findes.
3. Opret en medarbejder uden `uid`, redigér og fratræd. Historik og gamle
   referencer skal bestå; fremtidige tildelinger skal fremhæves.
4. Offentliggør en vagt og verificér, at kun den tilknyttede medarbejder kan
   se den i egen adgang. Kladder må ikke indgå i medarbejderplanen eller
   lederens offentliggjorte plantimer.
5. Opret, gentag og ændr én forekomst af en nattevagt over midnat. Verificér
   sommertid, pause, nettotid og at serien ikke ændres utilsigtet.
6. Opret fravær hen over en vagt og PLANNING-opgave. Begge vises som berørte,
   men ingen opgave slettes eller omfordeles automatisk.
7. Ændr fraværets periode og derefter medarbejder. Verificér gammel og ny
   periode/person. Annullér derefter én af to overlappende fraværsposter og
   verificér, at medarbejderen fortsat er utilgængelig på grund af den anden.
8. Tildel en PLANNING-opgave inden i en offentliggjort vagt. Vagten må ikke
   udløse dobbeltbooking; fravær og andre opgaver kan stadig gøre det.
9. Test et certifikatkrav før og efter `validUntilMs`; serverresultatet skal
   skifte på opgavens tidspunkt. Test både obligatorisk blokering og
   driftsmæssig advarsel.
10. Gennemfør mobilforløbene for egen plan, ind-/udstempling, frihedsanmodning
    og svar med en faktisk tilknyttet bruger.

## Blokeringer før produktionsklar status

- Godkendelsesomfang og politik for egen godkendelse er ikke besluttet.
- Fælles backend, regler, claims og serverprojektion er ikke implementeret i
  dette modulspor.
- Den faktiske PLANNING-integration og tværsessionsaccept er ikke gennemført.
- Lokal IndexedDB-afprøvning er derfor ikke dokumentation for
  produktionsklarhed.
