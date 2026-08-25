# 04 — Sensitive Data &amp; Privacy

Read-only evidence review af `sensitive/`-nodefamilien, `securityLevel`,
klassifikation og GDPR-nære databehandling.

## A. Sensitive-data-klassifikation

7 `sensitive/*`-familier findes i `firebase.rules.json` (linje 537-794),
alle under nøglen `sensitive`, som selv **ikke** har nogen `.read` (linje
531) — ingen kaskaderisiko fra forælderen. `tenants/$tenantId` har heller
ingen bred `.read`/`.write` — reglerne ligger udelukkende på navngivne børn
(verificeret linje 45-155). **VERIFIED.**

| Node | `.read` | `.write` |
|---|---|---|
| `sensitive/bookinger` | `booking.sensitiveLaes` | `false` (server-only) |
| `sensitive/kunder` | `kunder.sensitiveLaes` | `kunder.skriv` + `.sensitiveLaes` + `newData.exists()` |
| `sensitive/koeretoejer` | `koeretoejer.sensitiveLaes` | tilsvarende par |
| `sensitive/personale` | `personale.sensitiveLaes` | tilsvarende par |
| `sensitive/fravaer` | `fravaer.sensitiveLaes` | tilsvarende par |
| `sensitive/indberetninger` | `indberetninger.sensitiveLaes` | tilsvarende par + fastfrosset når `underskrift` findes |
| `sensitive/sager` | `sag.sensitiveLaes` | `sag.skriv` + `.sensitiveLaes` + `newData.exists()` |

**Rettelse til en tidligere antagelse i denne sessions eget Skive
3C-arbejde**: `sensitive/sager`s betingede klient-`.write` blev dengang
beskrevet som en undtagelse. Det er den ikke — **6 af 7** familier har en
reel betinget klient-`.write` efter nøjagtig samme "skal-kunne-læse-for-at-
skrive"-mønster; kun `sensitive/bookinger` er fuldt server-only. Politikken
er konsistent på tværs, ikke en særtilstand. `newData.exists()` blokerer
hard-delete via et rent `remove()`-kald (beslutning 53) på alle seks
skrivbare. **VERIFIED.**

**`vaerdi/bookinger`** er en separat klassifikationsakse (godsværdi, egen
permission `booking.vaerdiLaes`, adskilt fra `booking.sensitiveLaes` med
vilje — "to permissions kan ikke dele én node"). `.write:false`. Ingen andre
`vaerdi/*`-noder fundet. **VERIFIED, dokumenteret design.**

### `securityLevel` — mere vestigialt end tidligere antaget

Feltet findes i skemaet på **5** noder, ikke kun `sager`: `personale`,
`sager`, `koeretoejer`, `fravaer`, `kunder` (alle `normal|internal|
confidential|restricted`). Grep i `functions/index.js`: **0 træf** — ingen
Cloud Function læser eller betinger noget på feltet. Grep i
`functions/delt/`: **præcis ét skrivested**,
`functions/delt/flaade.js:577` (`securityLevel: post.securityLevel ||
"normal"`) — kun `koeretoejer` får feltet sat overhovedet, og det er
klient-leveret med en default, ikke serverbestemt. Grep i `src/**/*.jsx`:
**0 træf** — ingen skærm viser, filtrerer eller spærrer på det.

**Klassifikation: NOT BUILT som kontrol.** Feltet er skema-valideret på 5
noder, populeret på 1, brugt af 0. Severity **LOW** (det er inert, ingen
skærm stoler fejlagtigt på det i dag) — men flagget som et fund, fordi et
halvvejs-tilsluttet felt er en fælde for en fremtidig skærm der antager det
er meningsfuldt udfyldt overalt.

**Ingen anden klassifikationsakse fundet.** Grep for
`klassifikation|fortrolig|"class"|classification` gav kun træf på
audit-loggens `klasse`-vokabular (`drift`/`regnskab`/`sikkerhed` — et andet
begreb) og ikke-relateret demotekst.

## B. Privacy-nær databehandling

**Helbredsoplysning, eksplicit erkendt som GDPR art. 9 i koden**:
`src/fleet/fravaer.js:34` — kommentaren siger det direkte: *"`sygdom` og
`barnSyg` er helbredsoplysninger efter GDPR art. 9 — særlig kategori."*
`ANSOEGBARE_ARTER` udelukker bevidst helbredsflagede typer fra
selvbetjenings-ansøgningsvejen — en medarbejder kan ikke selv indberette
"sygdom", kun kontoret kan registrere det (`sensitive/fravaer`, gated
`fravaer.skriv`+`.sensitiveLaes`). Samme udelukkelse er genhåndhævet
server-side (rules.json linje ~2285). **VERIFIED — en bevidst, kodeført
GDPR art. 9-beslutning, ikke en tilfældighed.**

**Skadesindberetninger**: `sensitive/indberetninger` bærer
`skadeBeskrivelse` (fritekst ≤2000 tegn), modpartsoplysninger (tredjeparts
personoplysning), og en write-once `underskrift`. Personoplysninger om
både den indberettende medarbejder og en ekstern tredjepart.

**Almindelig PII**: navne/kontaktfelter i `personale`, `kunder`, login-mails
— ikke bemærkelsesværdigt for et TMS. Ingen biometriske, religiøse,
politiske eller strafferetlige kategorier fundet.

**GDPR-sletning ("ret til at blive glemt"): NOT BUILT som produktfunktion.**
Ingen callable-funktion fundet. Selve regelfilens egen designkommentar
(gentaget ved flere `sensitive/*`-noder) siger: *"en GDPR-sletning af en
medarbejder hoerer hos servicekontoen, som gaar uden om reglerne"* — dvs.
sletning er en manuel, uden-om-produktet-handling udført af en operatør, ikke
en sporet/gennemgåelig arbejdsgang i selve produktet, og den vil (per
`sensitive/*`s skrivemønster) nødvendigvis også gå uden om
audit-udløsningen i klientkoden. **Severity: MEDIUM** — retention-mekanismen
(se doc 06) findes og er juridisk lukket for automatisk sletning, men der
findes ingen bygget sletning-på-anmodning, intet logget bevis for hvem der
slettede hvad hvornår når det sker manuelt, og ingen sporing af en
registreredes anmodning til afslutning inde i produktet.

## Fund

| # | Fund | Klassifikation | Severity |
|---|---|---|---|
| 1 | `sensitive/`-familien er konsekvent scopet, ingen parent-kaskade, 6/7 har konsistent betinget skriv-politik | VERIFIED (styrke) | — |
| 2 | `securityLevel` skema-valideret på 5 noder, kun skrevet på 1, læst af 0 | NOT BUILT | LOW |
| 3 | Helbredsoplysning (GDPR art. 9) er bevidst arkitektonisk udelukket fra selvbetjening | VERIFIED (styrke) | — |
| 4 | Ingen GDPR-sletning-på-anmodning i produktet — kun manuel out-of-band operatørhandling, usporet | NOT BUILT | MEDIUM |

Se `05_AUDIT_LOGGING_AND_MONITORING.md` for den relaterede — og vigtigere —
konklusion om at LÆSNING af disse noder er klientrapporteret, ikke
serverhåndhævet.
