# Custom claims v2 — format, revocation og migration

## Format og grænse

`pv: 2` betyder, at `perms` er den kanoniske, katalogordnede streng af
permanente to-tegnskoder fra `PERM_KODE`. Mappingen er eksplicit; en kode må
aldrig omnummereres eller genbruges. Manglende `pv` er den eneste legacy-form.
Ukendt version, forkert type, ukendte værdier, dubletter eller ikke-kanonisk
rækkefølge giver nul permissions.

Nye rolleclaims bygges kun gennem `byggRolleClaims()`. Builderen overskriver
`tenant`, `rolle`, `pv` og `perms`, bevarer kun boolske `udbyder` og
`devTester`, og stopper med en stabil fejlkode ved ukendte/reserverede claims.
Der trunkeres aldrig. Hele JSON-objektets UTF-8-længde måles og afvises over
750 bytes. Worst case-testen (58 permissions, 40-tegns tenant og begge flags)
er 294 bytes mod Firebases 1.000-byte-grænse.

Legacy accepterer kun de former den gamle server faktisk udstedte: den gamle
Functions-builders katalogordnede, kendte permissions eller en af de seks
eksakte historiske standardrollestrenge. Arrays, objekter, null, ukendte
permissions og blandede former afvises samlet.

Klient- og Functions-decoderne kan se forskel på en manglende `pv`-egenskab og
`pv: null`; kun den manglende egenskab kan være legacy. Realtime Database
Rules returnerer derimod `null` for begge opslag og kan ikke skelne dem. Rules'
legacy-gren kræver derfor altid en aktiv post i den serverbeskyttede node
`legacyClaimsAllowlist/{uid}` med samme `tenant` som tokenet og et numerisk
`expiresAtMs`, der ligger efter Rules-værdien `now`. Det er den bevidste
sikkerhedsafgrænsning: selv `pv: null` kan kun nå legacy-grenen for en kendt,
tidsbegrænset UID. Klienter kan hverken læse eller skrive allowlisten.

Rules gentager ikke den fulde claimgrammatik ved hvert af de 82 permissiontjek.
Custom claims er Firebase-signerede og må kun udstedes gennem den stramme
serverbuilder. Rules kontrollerer derfor versionen og et helt token med begge
delimitere (`|kode|` eller `|permission|`); et substring kan ikke give adgang.
Den fulde validering for ukendte koder, dubletter, rækkefølge og blandede
formater ligger fortsat i builderen, klientdecoder, Functions-decoder og lokal
preflight.

## Revocation-model

Foer reduceret adgang anvendes, kalder Functions `revokeRefreshTokens`, henter
det serverautoritative `tokensValidAfterTime` og skriver sekundvaerdien i den serverbeskyttede node
`authRevocations/{uid}/revokeTime`. Alle beskyttede RTDB-regler kræver derefter
enten manglende metadata (kontrolleret overgang) eller
`auth.token.auth_time > revokeTime`. Klienter kan hverken læse eller skrive
noden. Uden Rules-gaten kan et allerede udstedt ID-token normalt bevare gammel
adgang indtil det udløber, typisk højst cirka én time.

Foerst naar revocation-metadata er gemt, skrives de nye claims. Ved en
claim-write-fejl forbliver det gamle token derfor afvist. Ved aendring af en
rolle bygges alle beroerte claims foerst, alle beroerte tokens tilbagekaldes
dernest, og rollen aendres kun, naar samtlige revocations lykkes. En senere
claim-write-fejl efterlader kontoen lukket og rapporteres med en stabil kode.

## Senere deployrækkefølge (må ikke automatiseres)

1. Kør unit-, preflight-, build- og emulator-tests i et rent miljø.
2. Kør den særskilt godkendte Auth-inventering. Opret kun allowlist-poster for
   bekræftede legacy-UID'er, bind hver post til den inventerede tenant, sæt en
   kort udløbstid, og kontrollér hele listen. Denne repositoryændring
   befolker ikke allowlisten. Deploy er blokeret, indtil dette er udført.
3. Deploy dual-read Rules med revocation- og legacy-gaten. Manglende metadata er
   midlertidigt tilladt, så eksisterende brugere fortsætter.
4. Deploy Functions med v2-builder, refresh-token-revocation og metadata-write.
5. Deploy klienten med den samme stramme decoder og håndtering af
   `permission-denied` som krav om frisk token/login.
6. Kør `claimsfornyv2` én tenant ad gangen. Tenant kommer fra signeret token,
   roller fra det beskyttede indeks og permissions fra serverens rolledata.
   Behandl hver post i `fejlede`; genkørsel er idempotent.
7. Fjern allowlist-poster efter vellykket migration, og fjern kun selve
   legacy-grenen i en senere, særskilt ændring. Den godkendte inventering og
   tomme restliste skal dokumenteres; en antagelse eller stikprøve er ikke nok.

## Rollback-matrix

| Rules | Functions | Klient | Claims | Resultat / handling |
|---|---|---|---|---|
| dual-read + revocation | v2 + revocation | dual-read | legacy/v2 | Normal overgang; ukendte former fejler lukket. |
| dual-read + revocation | forrige v2-kompatible | dual-read | legacy/v2 | Midlertidig rollback mulig; behold Rules og metadata. |
| dual-read + revocation | v2 + revocation | forrige v2-decoder | legacy/v2 | Mulig kun hvis klienten bevisligt forstår v2. |
| legacy-only | enhver | enhver | nogen v2 | Forbudt: v2-brugere mister adgang. |
| v2-only | enhver | enhver | nogen legacy | Forbudt før godkendt, fuld Auth-inventering. |
| ukendt/uventet | ukendt/uventet | ukendt/uventet | enhver | Stop; ingen automatisk deploy eller fallback. |

Rollback må aldrig slette revocation-metadata eller genindføre en builder, der
kopierer vilkårlige gamle claims. Dual-read Rules skal stå under hele
migrationen. Deploy og rollback er altid manuelle, eksplicit godkendte trin.
