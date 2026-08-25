# 01 — Trust Boundaries &amp; Data Flow

Read-only kortlægning af hvor data krydser en tillidsgrænse, og hvem der kan
sætte hvad.

## Arkitekturen i fem led

```
Browser (React/Vite, uautentificeret klientkode)
   │  Firebase Auth (email/password — se 03)
   ▼
ID-token m. custom claims { tenant, rolle, perms, udbyder? }
   │
   ├──► RTDB-regler (firebase.rules.json) — evalueret PR. FORESPØRGSEL
   │     mod auth.token. Håndhæver .read/.write direkte på databasen.
   │
   └──► Cloud Functions (onCall, Admin SDK) — OMGÅR reglerne helt.
         Skal selv genimplementere tenant/perm-tjek.
         Skriver til RTDB via db.ref(...).update()/.set()/.push().
```

Dette er IKKE ét håndhævelsespunkt, men to uafhængige, og begge er
verificeret separat i denne audit (se doc 02 og nedenfor).

## Claim-mintning — hvor tilliden faktisk starter

`tenantId`, `rolle` og `perms` bliver kun sat via to Cloud Functions,
`opretbruger` og `skiftrolle` (`functions/index.js`), begge bag
`kraevBrugeradmin()` som selv læser tenant **udelukkende** fra
`auth.token?.tenant` — aldrig fra klientens payload. **VERIFIED** ved grep:
0 forekomster af `req.data.tenantId`/`d.tenantId` på tværs af de 44
`onCall`-funktioner; samtlige 26 tenantId-udledningssteder bruger
`auth.token?.tenant`.

`claimForRolle()` læser tenantens EGEN `roller/`-node
(`hentRoller(tenantId)`) med `ROLLE_PERMS`-konstanten som faldback — ikke
omvendt. Hvert claim-skift efterfølges af `auth.revokeRefreshTokens(...)`.
Se `03_IDENTITY_PERMISSIONS_AND_ADMIN.md` for den fulde gennemgang,
inklusive den ikke-lukkede risiko (et allerede udstedt, ikke-udløbet
ID-token kan fortsat bruges i det korte vindue før klienten selv
genopfrisker det).

## Funktionsinventar — 47 eksporterede funktioner

44 `onCall`, 3 `onSchedule` (`maaldagligt`, `auditoprydning`,
`kpiaggregering` — kun cron-udløst, ikke eksternt kaldbare). **0
`onRequest`-funktioner (rå HTTP)** — al ekstern indgang går gennem
Firebases callable-protokol, som selv rammer auth-token/App
Check-verifikation før koden kører (App Check-delen er dog ikke slået til
— se doc 07). **VERIFIED, ingen undtagelser fundet.**

Alle 44 callables har et auth-tjek — enten direkte `if (!auth) throw
unauthenticated` eller via en af 7 delte guard-hjælpere
(`kraevBrugeradmin`, `kraevUdbyder`, `kraevKundeId`, `kraevUdlaansskriv`,
`kraevBevaegelsesskriv`, `kraevGrundlag`, `procureDoer`), som hver tilføjer
tenant-eksistens + abonnement-aktiv-tjek oveni. **VERIFIED, 44/44.**

## Hvor krydser klientdata en tillidsgrænse uden serverkontrol?

Systematisk gennemgået af to uafhængige fork-audits (tenant-isolation og
web-attack-surface). Konkret fundet:

- **Ingen** funktion lader klienten bestemme HVILKEN tenant en operation
  rammer.
- **Én reel, men afgrænset, svaghed**: `kortStreng()` trimmer og
  længdebegrænser strenge, men afviser ikke RTDB-forbudte stitegn
  (`. # $ [ ] /`) når en klient-leveret værdi senere bruges som STI-SEGMENT
  (fx `sagId` i `rod.child(\`sager/${sagId}\`)`) frem for som en gemt
  værdi. En ondsindet `sagId` med `/` i sig kunne i teorien navigere til en
  søskendenode **inden for samme tenants eget træ** — `rod` er altid
  forankret på `tenants/${tenantId}`, så dette er IKKE en krydstenant-vej,
  men det er heller ikke testet/afvist eksplicit. **PARTIAL, MEDIUM.**
- Beskeders/noters fritekst går gennem React's JSX, som escaper som
  standard; `dangerouslySetInnerHTML` bruges reelt ingen steder (ét træf,
  og det er en kommentar der dokumenterer at det bevidst IKKE bruges).
  **VERIFIED clean.**

## Hvad Admin-SDK'et skriver UDEN for `tenants/`, og hvorfor

- `audit/$tenantId/...` — holdt uden for `tenants/$tenantId` med vilje
  (ellers ville en fremtidig løsnet forælder-`.read` kaskadere ned i
  loggen). Egen `$tenantId`-scoped regel.
- `brugerTenants/$uid` — kun uid→tenant-opslag til claim-mintning, ikke en
  selvstændig autorisationskilde.
- `udbyder/*` — platform-ejer-data, gated på et SEPARAT claim
  (`auth.token.udbyder === true`), som kun kan udstedes via et
  out-of-band CLI-script der kræver den rå service-account-nøglefil (se
  doc 03). Ingen kundedata bekræftet i disse noder.

## Sammenfatning

To uafhængige håndhævelsespunkter (regler + funktioner), begge verificeret
til konsekvent at forankre autorisation i `auth.token`, aldrig i
klient-leveret data. Den ene reelle, afgrænsede svaghed (sti-segment-tegn)
er indenfor egen tenant, ikke på tværs, og bør lukkes med en eksplicit
karaktervalidering — se `12_FINDINGS_AND_REMEDIATION_PLAN.md`.
