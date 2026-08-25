# 02 — Tenant Isolation

Read-only evidence review af RTDB rules, Cloud Functions og eksisterende
prøvedækning. Metoden: læs den faktiske regelfil og de faktiske funktioner —
gæt ikke, og opgradér ikke en antagelse til VERIFIED.

`npm test` (inkl. `npm run test:rules`, emulatorbaseret): **3269 tests, 0
fejl**, kørt i denne audit.

## Sammenfatning

Tenant-isolationsmønstret i `firebase.rules.json` er anvendt **uden
undtagelse** på tværs af samtlige ~70 regelblokke: hver tenant-bunden node har
sin `.read`/`.write` bundet til `auth.token.tenant === $tenantId` PLUS et
`_findes`-tjek PLUS et abonnement-aktiv-tjek, forankret på nodens EGEN
`$tenantId`-sti. Ingen Cloud Function blandt de 46 `onCall`-funktioner læser
`tenantId` fra klientens payload — alle 26 fundne udledningssteder bruger
`auth.token?.tenant`. Det er den stærkeste enkeltstående observation i denne
audit: **VERIFIED**, ikke antaget.

Den generiske krydstenant-prøvesuite (`test/rules.tenant.test.mjs`) er
selv-opdaterende: listen af noder den tester, udledes af selve
`firebase.rules.json` ved testkørsel — en ny node (som Skive 3C's `sager`)
kommer automatisk med, uden at nogen skal huske at tilføje et testtilfælde.

## A. Trust boundary / dataflow

Se `01_TRUST_BOUNDARIES_AND_DATA_FLOW.md` for det fulde flow. Kort opsummeret
her: browser → Firebase Auth (udsteder ID-token med custom claims) → to
UAFHÆNGIGE håndhævelsespunkter — RTDB-regler (evalueret pr. forespørgsel mod
`auth.token`) og Cloud Functions (Admin SDK, **omgår reglerne helt** og skal
selv genimplementere tenant/perm-tjekket). Begge blev verificeret uafhængigt.

**Claim-mintningen** (`opretbruger`, `skiftrolle` i `functions/index.js`)
læser `tenantId` **udelukkende** fra `auth.token?.tenant` — aldrig fra
klientens `req.data`. `claimForRolle()` læser tenantens EGEN `roller/`-node
med `ROLLE_PERMS` som faldback, ikke omvendt (matcher beslutning 31b, nu
bekræftet i kode, ikke kun i prosa). Se `03_IDENTITY_PERMISSIONS_AND_ADMIN.md`
for detaljen.

## B. Systematisk gennemgang af `firebase.rules.json` (4055 linjer)

### De fire fælles/basisnoder (beslutning 92)

`opgaver`, `reservationer`, `satser`, `fakturaer` ligger bevidst i BASEN
(ikke under et modulnavn), fordi flere moduler skriver til dem. Det var
netop her det historiske krydstenant-hul lå (DEV-kunden `nordvest`,
37 reservationer synlige for en anden tenant end deres ejer). Bekræftet i
denne audit at alle fire fortsat bærer identisk `$tenantId`-scoped
læseregel (`reservationer` linje ~1125, `opgaver` ~1801/1953, `fakturaer`
~2982, `satser` ~1684) — **VERIFIED**.

### `sensitive/`-søskendenoder

Læst i fuld bredde (linje 537–810): `sensitive/{bookinger, kunder,
koeretoejer, personale, fravaer, indberetninger, sager}` ligger alle under
SAMME `$tenantId` som deres basisnode — ikke et separat topniveau-træ. Ingen
divergens fundet. `sensitive/sager/$sagId` har (som eneste af disse, sammen
med `sensitive/indberetninger`) en reel betinget klient-`.write`
(`sag.skriv` + `sag.sensitiveLaes`) — samme form begge steder, ikke en
særtilstand. **VERIFIED.**

### Referencefelter (krydstenant-smugling)

8 stikprøvede eksistenstjek (`personId` og lignende, linje 510, 692, 1262,
1359, 1863, 2370, 2625, 2672) bruger alle
`root.child('tenants').child($tenantId).child(...)` — samme `$tenantId` som
selve skrivningens egen forankring, så en reference kan strukturelt kun
opløses inden for skriverens egen tenant. **VERIFIED for stikprøven, men
IKKE bevist for hvert af de ~50 tjekkede felter enkeltvis** —
`test/referencetjek.test.mjs` kontrollerer kun at et eksistenstjek FINDES,
ikke at det er tenant-scopet. **PARTIAL/gap (MEDIUM):** ingen test beviser
eksplicit "en reference der kun findes i tenant B, afvises fra tenant A."

### Platform-noder uden for `tenants/`

- `audit/$tenantId/...` — egen `$tenantId`-scoped + `audit.laes`-gated
  regel, holdt UDENFOR `tenants/$tenantId` med vilje (ellers ville en
  fremtidig løsnet `.read` på `tenants/$tenantId` kaskadere ned i loggen).
  **VERIFIED korrekt scopet.**
- `brugerTenants/$uid` — kun `auth.uid === $uid`, bruges server-side til
  claim-mintning, ikke selv en autorisationskilde. **VERIFIED.**
- `udbyder/*` — gated på `auth.token.udbyder === true` (separat
  platform-claim), `.write:false` overalt, ingen kundedata bekræftet i
  disse noder. **VERIFIED.**

## C. Eksisterende isolationstest-dækning

| Domæne | Generisk sweep (`rules.tenant.test.mjs`) | Domænespecifik krydstenant-test |
|---|---|---|
| kunder, opgaver, kpi, reservationer, fakturaer, sager, sensitive/sager | JA (autoinkluderet) | `sager` har egen (`rules.sager.test.mjs`), `grundlag` har egen |
| indberetninger, sensitive/indberetninger | JA | Ingen dedikeret fil fundet |
| personale, sensitive/personale, brugere, roller | JA | Ingen |
| facility/*, unitbooking/*, warehouse/* | JA | Ingen |
| **audit** (topniveau, egen `$tenantId`) | **NEJ — uden for scanningens træ** | Ingen krydstenant-test fundet specifikt for `audit` |
| udbyder/* | N/A (platform-claim) | `rules.udbyder.test.mjs` findes |

Den generiske sweep dækker desuden noget mere subtilt end simpel
læse/skrive-afvisning: **atomisk multi-sti-opdatering der spænder to
tenants afvises som helhed** (linje 253-268 i testfilen) — forhindrer at en
lovlig skrivning bundtes med en ulovlig for at sondere en anden tenant.
Samt: en "spøgelses-tenant" (et claim der peger på en tenant uden `_findes`)
kan hverken læse, skrive eller bootstrappe sig selv til eksistens.

## Fund

| # | Fund | Klassifikation | Severity | Evidens |
|---|---|---|---|---|
| 1 | Tenant-scoping-mønstret anvendes uden undtagelse på tværs af ~70 regelblokke; nul klient-leverede tenantId-steder i 46 Cloud Functions | VERIFIED (styrke) | — | Se A/B ovenfor |
| 2 | Selv-opdaterende krydstenant-testsuite dækker automatisk hver node under `tenants/$tenantId`, inkl. atomisk multi-sti-lækage | VERIFIED (styrke) | — | `test/rules.tenant.test.mjs` |
| 3 | `audit/` (den mest følsomme læsning i systemet) er UDENFOR den generiske sweeps scanningstræ og har ingen dedikeret krydstenant-test | PARTIAL | MEDIUM | `rules.tenant.test.mjs` linje 45-46 vs. `firebase.rules.json` linje 3831 |
| 4 | Referencefelters tenant-scoping er strukturelt sund, men ikke bevist pr. felt mod et reelt krydstenant-forsøg | PARTIAL | MEDIUM | `referencetjek.test.mjs` tjekker kun tilstedeværelse |
| 5 | Ingen App Check / CORS-politik / rate limiting / `maxInstances` på nogen af de 46 callables | NOT BUILT | HIGH (se doc 07, Gate A/C) | grep, 0 træf |

Fund 5 uddybes i `07_SECURE_DEVELOPMENT_AND_DEPLOYMENT.md` — nævnt her fordi
det blev opdaget under denne gennemgang, men hører ikke primært til
tenant-isolation som emne.

## Anbefaling til `12_FINDINGS_AND_REMEDIATION_PLAN.md`

- Tilføj en dedikeret krydstenant-test for `audit/$tenantId/...` (fund 3) —
  billig at rette, lukker et reelt hul i selve dækningen af den mest
  følsomme node.
- Overvej en supplerende test der aktivt forsøger at skrive en reference
  (fx `personId`) der peger på en post i en ANDEN tenant, for at gøre fund 4
  til et bevist resultat i stedet for en strukturel slutning.
