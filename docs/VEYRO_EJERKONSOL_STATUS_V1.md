# Veyro ejerkonsol — status v1

Opdateret: 2026-09-10

## Git og arbejdsområde

- Worktree: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`
- Branch: `codex/ejer-integrated-development`
- Base/HEAD ved oprettelse: `989dbb87db639efed0ba1b5a1e271560f7659a0c`
- Live `origin/codex/veyro-integration-v1` ved oprettelse: `39963337a52d4464f619077683d1f39aa81eff1e`
- Upstream: ingen; første publicering skal bruge eget branchnavn.
- FLEET, FACILITY, PLANNING og FAKTURACENTER-worktrees: ikke ændret.

## Etapestatus

| Etape | Status | Verifikation |
|---|---|---|
| A — Verificeret grundlag | Implementeret og verificeret | Git, worktrees, live ref og filkortlægning |
| B — Adgang og skal | Implementeret — sikkerhedstest mangler miljø | Claim/revocation-enhedstest, lint, build og Functions-import består; Rules-emulator kræver Java 21 |
| C — Salg | Implementeret — sikkerhedstest mangler miljø | Persistent servermodel, 6 domænetests, lint, build og Functions-import består |
| D — Priser og tilbud | Delvist implementeret | 5 deterministiske beregningstests, lint, build og Functions-import består |
| E — Aftale og kunde | Ikke implementeret | — |
| F — Fakturering | Ikke implementeret | — |
| G — Kredit og returdata | Ikke implementeret | — |
| H — Udgifter | Ikke implementeret | — |
| I — Overblik | Ikke implementeret | — |
| J — Samlet aflevering | Ikke implementeret | — |

## Kortlægning af eksisterende løsning

- Kunde/abonnement/moduler: `src/moduler/udbyder/Konsol.jsx`.
- Prislistesnapshots, målinger og låst grundlag: `Prisliste.jsx`, `priser.js`
  og eksisterende ejer-callables i `functions/index.js`.
- Routing: tenantløst ejertræ i `src/App.jsx`, `/main` og `/main/priser`.
- Læsninger: afgrænsede RTDB-reads; direkte writes er afvist.
- Storage: alle direkte klientreads/-writes er afvist; ejerbilagssti mangler.
- Hostingautoritet: Firebase Hosting (`firebase.json`, `dist`) findes, mens
  `netlify.toml` også beskriver Netlify-kontekst. Ingen deployment udføres.

## Bekræftede problemer før etape B

1. En ny ejer fra `scripts/ejer.mjs` får kun `udbyder: true`, mens ejerreads
   også ligger bag claims-v2-gaten. Testwrapperen beriger claimet og skjuler det.
2. Scriptet tillader blandet ejer-/tenantidentitet.
3. Ejer-callables kontrollerer ikke `authRevocations`.
4. Platformhandlinger som prislister har ikke samlet serveraudit.
5. Ejerkonsollen har ikke den aftalte arbejdsnavigation.

## Implementeret i etape B–C

- Fælles tenantløst ejerclaim med legacy-læsning og eksplicit versionsfelt.
- Ejeroprettelse afviser en eksisterende tenantidentitet; fjernelse opdaterer
  både Firebase tokenrevocation og applikationens revocationnode.
- Alle ejer-callables bruger servermæssig revocationkontrol og platformaudit.
- Database Rules adskiller ejer-CRM/audit fra alle tenantidentiteter og afviser
  direkte klientwrites.
- Egen Veyro-branded ejerskal og navigation under `/main`, uden at blande den
  med kundens egen administratorfunktion.
- Vedvarende CRM med virksomheder, flere salgsmuligheder, aktiviteter,
  Mine/Alle-filtre, pipeline, kundekort, historik og revisionskontrol.
- Ærlige statussider for endnu ikke byggede eller eksternt blokerede områder;
  ingen demo-success eller localStorage-fallback.

## Verifikation 2026-09-10

- `node --check functions/index.js` og `node --check scripts/ejer.mjs`: består.
- `node --test test/ejeradgang.test.mjs`: 4/4 består.
- `node --test test/ejer-crm.test.mjs`: 6/6 består.
- Målrettet ESLint for `src`, `functions`, `scripts`, `test` og rodconfig:
  består uden fund.
- `npm run test:design`: 11/11 består.
- `npm run build`: består, 498 moduler transformeret. En eksisterende CSS-
  kommentartekst giver en ikke-blokerende minifier-advarsel.
- Import af `functions/index.js`: 81 exports indlæst; alle fire nye CRM-exports
  og tre nye tilbuds-exports findes.
- Tilbudstest: 5/5 består, inklusive instruksens 5.855,00/40.855,00-fixture,
  sekventielle rabatter og introperiodens første år.
- Tilbudsserver: `tilbudgem`, `tilbududsted` og `tilbudsendtregistrer` kan
  importeres som callables. Runtime mod emulator er ikke kørt pga. Java 21-
  blokeringen.
- `npm run test:rules`: ikke kørt færdigt. Firebase CLI 15.29.0 afviser den
  installerede Temurin Java 8 og kræver Java 21+. AK-01–AK-04 er derfor ikke
  erklæret bestået.
- Repositoryets brede `npm run lint` stopper i den eksisterende isolerede
  `facility-v2/eslint.config.js`, fordi dens lokale `@eslint/js` ikke er
  installeret. Den integrerede produktkode er lintet særskilt og består.

## Næste konkrete opgave

Færdiggør etape D med officiel ratebladsimport, ny version efter udstedelse,
vedvarende dokumentfil og mailadaptergrænse. Fortsæt derefter etape E med
accept, genkørbar provisioning og invitationer. Installér eller peg
`JAVA_HOME` på en JDK 21+ og genkør Rules-suiten, før B–D kan betegnes fuldt
sikkerhedsverificeret.
