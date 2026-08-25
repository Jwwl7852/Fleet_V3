# 03 — Identity, Permissions &amp; Administrator Access

Read-only evidensgennemgang af autentificering, custom claims, roller,
permissions, superadmin-adgang og offboarding.

## A. Firebase Authentication &amp; claims

**Provisionering** — `opretKonto()` (`functions/index.js:376`), kaldt fra
både `opretbruger` (tenant-scoped) og `kundeadmin` (ejer-scoped). Opretter
Firebase Auth-brugeren via `auth.createUser(...)` med en adgangskode
leveret af den OPRETTENDE admin (kun et minimumslængde-tjek,
`MINDSTE_KODE`) — der findes ikke noget invite-link/e-mailbekræftelses-flow.
Sætter udelukkende custom claims `{tenant, rolle, perms}` via Admin SDK.
Afviser `auth/email-already-exists` frem for stille overtagelse af en
eksisterende konto. **VERIFIED.**

- **Gap (MEDIUM)**: ingen e-mailbekræftelse/invite-flow — den oprettende
  admin sætter/kender direkte den nye brugers første adgangskode. Ikke en
  kodefejl, men en provisioneringshygiejne-mangel værd at notere til
  RA/ISO.

**`claimForRolle()`** læser tenantens egen `roller/`-node med `ROLLE_PERMS`
som faldback — én implementation, genbrugt af `opretKonto`, `skiftrolle` og
`rolleskriv`. **VERIFIED, ingen divergerende kopi.**

**`skiftrolle`** kræver `brugere.skriv` i kalderens EGEN tenant. Målbrugeren
hentes via `hentIEgenTenant()`, som HÅRDT verificerer
`bruger.customClaims?.tenant === tenantId` før nogen claim-ændring —
krydstenant-privilegie-eskalering via `skiftrolle` er mekanisk blokeret.
Kalder `auth.revokeRefreshTokens(maalUid)` umiddelbart efter mintning.
**VERIFIED.**

**Deaktivering/offboarding** — `spaerlogin`. **VERIFIED end-to-end, ikke
delvis**: kalder `auth.updateUser(maalUid, {disabled: spaerret})` (en reel
Firebase Auth-kontodeaktivering, ikke bare et app-niveau-flag) +
`revokeRefreshTokens` ved deaktivering. Selvlåsning er blokeret
(`maalUid === uid && spaerret` → afvist). Kontoen slettes aldrig (bevarer
historiske referencer som `oprettetAf`). Dette er en genuint komplet vej
for LOGIN-adgang; den rører ikke dataretention/anonymisering (separat
domæne, se doc 06).

## B. Roller &amp; permissions

7 faste rollenavne (`ROLLE_PERMS` i `src/fleet/permissions.js`),
tenant-redigerbart rolleindhold via `roller/`-noden (beslutning 31b).
Fordelingen er bevidst bred på LÆSNINGER (CLAUDE.dm's egen erkendelse:
"alle syv roller har hver eneste læse-permission" for de fleste domæner) —
skrive-/handlingspermissions er de reelle differentiatorer.

**`roller`-noden bruges ALDRIG i regelfilen til autorisation — VERIFIED.**
`grep '"roller"'` i `firebase.rules.json`: præcis ét træf (nodens egen
`.read`/`.write`-blok). `grep "child('roller')"`: **0 træf** andre steder.
Autorisation sker udelukkende via `auth.token.perms`/`.rolle`/`.tenant`.
Dette er den enkeltvis vigtigste strukturelle kontrol i identitetsmodellen,
og den holder.

**Nav-skjulning vs. reel håndhævelse — VERIFIED som en reel adskillelse.**
`nav.js` bruger `kraeverPerm`-hints (kosmetisk — skjuler et sidebar-punkt).
`App.jsx`: `harAdgang = Boolean(bruger?.tenant)` er det ENESTE der spærrer
rute-adgang — tjekker tenant-claim, ikke per-rute-permission. Grep for
rute-filtrering på permission i `App.jsx`: **0 træf** — bekræfter at
CLAUDE.md's eksplicitte forbud reelt overholdes i koden, ikke kun
dokumenteres. Reel håndhævelse ligger i `firebase.rules.json`s
`.read`/`.write` og i Cloud Functions' `perms.includes(...)`-tjek.

## C. Superadmin / privilegerede handlinger

**Platform-ejer-adgang (`udbyder`) — VERIFIED, den stærkeste kontrol
fundet i denne audit.** `kraevUdbyder()` tjekker kun
`auth.token?.udbyder === true`. Dette claim kan **kun** tildeles via
`scripts/ejer.mjs`, et out-of-band CLI-script der kræver den rå
service-account-nøglefil, og scriptet selv bekræfter at nøglefilen er
git-ignoreret før det kører (`git check-ignore`). **Ingen callable Cloud
Function og ingen in-app UI-vej kan tildele eller selv-tildele `udbyder`.**
Dette forhindrer strukturelt privilegie-eskalering til platform-ejer inde
fra den kørende applikation.

- **Gap (MEDIUM)**: `ejer.mjs` kalder `setCustomUserClaims` +
  `revokeRefreshTokens` direkte mod Firebase Auth — den skriver IKKE til
  appens egen `audit/`-node. Platform-ejerskabsændringer fanges derfor
  ikke i FleetControls eget auditspor, kun i Google Clouds egen
  IAM/Admin SDK-log (uden for dette repo, **UNKNOWN** om den overvåges).
- **Break-glass-procedure: NOT BUILT** som en formel, dokumenteret
  nødadgangsprocedure med tidsboksning/to-mands-kontrol/alarmering.
  Kravet om en service-account-nøglefil er en de facto høj-friktions-
  kontrol, men ikke en designet break-glass-arbejdsgang.

**Selvlåsnings-invarianter — VERIFIED**, begge håndhævet server-side i
`laaserUde()`, kaldt fra `rolleskriv`, som fejler med `failed-precondition`:
1. `brugere.skriv` kan ikke fjernes fra kalderens egen aktuelle rolle.
2. `brugere.skriv` kan ikke fjernes fra den sidste rolle der bærer den
   tenant-bredt, beregnet ved at gentjekke alle 7 roller mod tenantens
   FAKTISKE (evt. redigerede) rolledefinitioner.
Dette er reelt mekanisk håndhævet — et direkte kald til `rolleskriv` uden
om UI'et bliver stadig afvist.

## D. MFA / SSO / sessionsstyring

**MFA: NOT BUILT.** Fuld repo-søgning for
`multiFactor|MFA|totp|PhoneAuthProvider|getMultiFactorResolver`: 0 reelle
træf. Ingen tilmeldings-UI, intet verifikationstrin.

**SSO/Federation: NOT BUILT.** Søgning for
`SAMLAuthProvider|OIDCAuthProvider|signInWithSAML|signInWithOIDC`: 0 træf.
Login er udelukkende Firebase e-mail/adgangskode.

**Session-/tokentilbagekaldelse**: `revokeRefreshTokens` er den ENESTE
tilbagekaldelsesmekanisme fundet — konsekvent anvendt overalt et claim
ændres (`skiftrolle`, `rolleskriv`, `spaerlogin`, `ejer.mjs`). **VERIFIED**
som konsekvent anvendt. **PARTIAL** samlet set: tilbagekaldelsen UDLØSES
korrekt server-side ved enhver privilegieændring, men en klient der
allerede har et gyldigt (endnu ikke udløbet) ID-token kan fortsætte med at
operere med forældede claims i op til tokenets resterende levetid,
medmindre den rammer en `permission-denied` og tvinges til at
genautentificere. Dette er præcis den klasse af fejl Skive 3B.1's
"forældede DEV-koordinator-claims"-hændelse (denne sessions egen historik)
afdækkede i praksis.

**DEV-rolleskift (`Brugervaelger.jsx`) — VERIFIED mekanisk, ikke kun
tillid til kommentaren:**
- Tegnes kun når `miljoe === "dev"`; `miljoe` udledes ÉN gang af
  build-time-værdier (`projektId === PROD_PROJEKT`) — ikke et
  runtime-flag en klient kan vippe.
- Vælgeren udfører et REELT `auth.signOut()` + `signInWithEmailAndPassword()`
  — den ændrer den faktiske Firebase-session og dermed det faktiske token.
- Adskilt herfra: `saetDemoRolle`/`effektivBruger` (kun aktiv når
  `miljoe === "demo"`) rører ALDRIG nogen Firebase Auth-API og ændrer
  ALDRIG `req.auth.token` server-side — kun klientens visningsfelter.
  Påstanden om at denne "pr. definition ikke kan ændre adgang" holder ved
  direkte inspektion, ikke kun ved tillid til kommentaren.

## E. Service accounts

Ingen eksplicit `serviceAccount`-override fundet i repoet. Cloud Functions
kører derfor under GCP's **standard Compute Engine-service-konto** —
direkte observeret i denne sessions egne deploy-logs
(`52498642641-compute@developer.gserviceaccount.com`). **VERIFIED via live
deploy-metadata.**

- **Gap (severity afhænger af IAM-scope, som er UNKNOWN fra repoet
  alene)**: brug af standard-kontoen frem for en dedikeret
  mindste-privilegium-servicekonto pr. funktion er et anerkendt
  GCP-hærdningsgab. Det betyder ikke nødvendigvis at funktionerne har
  overflødige IAM-tildelinger i dag — det kan kun bekræftes via selve
  GCP IAM-policyen, som ligger uden for dette repos synsfelt.

## Fund

| # | Fund | Klassifikation | Severity |
|---|---|---|---|
| 1 | `roller`-noden bruges aldrig af regelfilen til autorisation | VERIFIED (styrke) | — |
| 2 | Nav-skjulning og reel håndhævelse er reelt adskilt; ruter filtreres ikke på permission | VERIFIED (styrke) | — |
| 3 | `udbyder`-claim kan kun tildeles via out-of-band script med service-konto-nøgle | VERIFIED (styrke) | — |
| 4 | Selvlåsnings-invarianter er server-håndhævet, ikke kun UI | VERIFIED (styrke) | — |
| 5 | Ingen e-mailbekræftelse/invite-flow ved kontooprettelse | ORGANIZATIONAL | MEDIUM |
| 6 | `udbyder`-tildeling/-fratagelse går uden om appens eget auditspor | PARTIAL | MEDIUM |
| 7 | Ingen formel break-glass-procedure | NOT BUILT | MEDIUM |
| 8 | Ingen MFA | NOT BUILT | HIGH (organisatorisk/ekstern beslutning, ikke en kodefejl) |
| 9 | Ingen SSO/federation | NOT BUILT | MEDIUM (afhænger af kundekrav) |
| 10 | Tilbagekaldt claim virker først når klientens token udløber/genopfriskes — intet tvunget genopfriskningstjek | PARTIAL | MEDIUM |
| 11 | Standard compute-servicekonto i brug; faktisk IAM-scope ukendt fra repoet | UNKNOWN | Afhænger af IAM |
