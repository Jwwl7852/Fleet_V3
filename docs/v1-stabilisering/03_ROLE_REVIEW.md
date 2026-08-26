# Rollegennemgang

Metode: kode-krydstjek af `src/fleet/permissions.js` (`ROLLE_PERMS`) mod `src/fleet/nav.js` (`kraeverModul`/`kraeverPerm`), suppleret med live spot-tjek af 4 af de 7 roller (admin, disponent, lagermedarbejder, chauffør) via DEV-rollevælgeren, og cross-check mod fund fra de øvrige funktionsaudit-agenter (fx den udpegede godkender i Procure).

**Navigation er ikke security** — det princip er lagt til grund overalt: et skjult menupunkt bevises ikke at være en reel spærring, og et synligt menupunkt bevises ikke at virke. Begge dele er tjekket separat nedenfor hvor det var muligt.

---

## DEV-rollevælgeren er reel, ikke en klient-side attrap

Bekræftet, ikke antaget:
- `src/fleet/Brugervaelger.jsx:38-58` — `skift()` logger reelt ud og ind igen (`signOut()` + `signInWithEmailAndPassword()`) som en anden Firebase Auth-konto.
- `scripts/provisioner-dev.mjs:795` — `setCustomUserClaims()` via Admin SDK'et minter rigtige custom claims for hver af de 7 seedede konti.
- `scripts/provisioner-dev.mjs:801` — `revokeRefreshTokens()` tvinger et nyt token-hent ved næste login.
- Live bevis: skift til `chauffoer` gav en ægte, tom-sidebar `/app`; skift til `disponent` gav en ægte server-side `permission-denied` på et Warehouse-skriveforsøg. Ingen af delene er muligt fra en klient-side attrap.

`CLAUDE.md`'s egen regel ("En klient kan ikke ændre sit eget token") holder.

---

## Pr. rolle

| Rolle | Kan gøre (kort) | Live tjekket | Over-adgang | Under-adgang |
|---|---|---|---|---|
| **admin** | `ALLE_PERMS` — alt | Ja: fuld sidebar, alle grupper | Med vilje — union af alt, se `permissions.js:858-863`'s egen note om at give den ud sparsomt | Ingen |
| **koordinator** | Godkender bookinger/grundlag/indkøb/fakturaer; sags-triage, karantænefrigivelse, aftalebekræftelse, ekstern mail | Nej | Se F7 i `02` — fire uafhængige godkendelsesmagter i ét login, hver enkelt begrundet, men samlet blast radius bør være et bevidst valg | Ingen |
| **disponent** | Planlægger/disponerer, foreslår bookinger (kan IKKE selv godkende — bevidst, beslutning 5), ser køretøjs-GPS | Ja: fuld driftsmodulnav; et Warehouse-skriveforsøg blev korrekt afvist server-side | Ingen | Ingen — mangel på `bookingGodkend` er bevidst |
| **casehandler** | Opretter bookinger, udkast til grundlag (ikke godkendelse), arbejder sagstråde (ikke karantæne/aftale/ekstern mail) | Nej | Ingen | Ingen |
| **lagermedarbejder** | Fuldt Warehouse/Unitbooking-skrivesæt | Ja: landede korrekt på en skærm rollen faktisk må skrive til | Ingen | Ingen |
| **revisor** | Udelukkende læsning: al kommerciel data, audit-log, retention-log | Nej | Ingen — nul `.skriv`-permissions i hele rollen | Ingen |
| **chauffør** | `BASIS_LAES` + `indberetningerSkriv` — intet andet | Ja: `/app`, nul sidebar (med vilje), præcis 4 kort matcher permissions | Ingen — ingen adgang til kontorskærme overhovedet | Undersøgt og AFVIST som fund: `fravaer.skriv` mangler, men RTDB-reglerne har en bevidst, snæver undtagelse (beslutning 108) der lader en chauffør oprette sin EGEN, nye orlovsansøgning uden den permission — se dog **B2 i `02`**, som er et separat, reelt problem (ansøgningen når aldrig kontoret) |

## Fund

- **HIGH FRICTION** — allerede dækket som F3 i `02_BLOCKERS_AND_FRICTION.md`: navigation gates næsten udelukkende på modulkøb, ikke rolle, så flere roller ser skrivehandlinger de ikke kan bruge.
- **POLISH** — allerede dækket som F7 i `02`: koordinator-rollens samlede godkendelsesmagt.
- **FUTURE FEATURE** — 12 af 15 skrive-gatede domæner mangler stadig en tilsvarende læse-permission. Dette er et allerede kendt, løbende hærdningsarbejde sporet i produktets egen `test/laeseadgang.test.mjs` (3 af 15 lukket under en tidligere beslutning) — ikke noget nyt fundet i denne audit, og ikke noget der skal bygges under stabilisering.

**Konklusion:** ingen rolle blev fundet med en adgang der udgør et reelt sikkerhedsproblem (ingen kan læse/skrive data uden en plausibel jobbegrundelse), og ingen rolle blev fundet blokeret fra centralt arbejde i sit eget felt. De to fund der findes, er allerede talt med i `02`'s HIGH FRICTION/POLISH-lister for ikke at dobbelttælle.
