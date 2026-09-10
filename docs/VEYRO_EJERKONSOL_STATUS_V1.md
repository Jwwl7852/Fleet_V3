# Veyro ejerkonsol — status v1

Opdateret: 2026-09-10

## Git og arbejdsområde

- Worktree: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`
- Branch: `codex/ejer-integrated-development`
- Base/HEAD ved oprettelse: `989dbb87db639efed0ba1b5a1e271560f7659a0c`
- HEAD ved arbejdsrundens start:
  `56e9ca0449cd61929d70e4ef58edcb4e90233af3`
- Lokalt etape D/E- og sikkerhedscheckpoint:
  `7d622c47a4045dec21a6b784f29bf470244cca3e`; intet er pushet.
- Live `origin/codex/veyro-integration-v1` ved oprettelse: `39963337a52d4464f619077683d1f39aa81eff1e`
- Upstream: ingen; første publicering skal bruge eget branchnavn.
- FLEET, FACILITY, PLANNING og FAKTURACENTER-worktrees: ikke ændret.

## Etapestatus

| Etape | Status | Verifikation |
|---|---|---|
| A — Verificeret grundlag | Implementeret og verificeret | Git, worktrees, live ref og filkortlægning |
| B — Adgang og skal | Implementeret og verificeret | AK-01–AK-04 33/33 med Storage; normalt tenantløst browserlogin i fire emulatorer |
| C — Salg | Implementeret og verificeret | Persistent servermodel, domænetests og callable-kædetest |
| D — Priser og tilbud | Implementeret; mail eksternt blokeret | Beregning, samtidighed, version 1/2, snapshots, PDF, accept og fejlstatus emulatorverificeret |
| E — Aftale og kunde | Implementeret og verificeret | Aftale/tenant genkørt uden dublet; nye/eksisterende konti, revoke/resend/accept testet |
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
- Storage: alle direkte klientreads/-writes er afvist; servergenererede
  tilbuds-PDF'er ligger versioneret under `ejer/tilbud/<id>/v<version>.pdf`.
- Hostingautoritet: Firebase Hosting (`firebase.json`, `dist`) findes, mens
  `netlify.toml` også beskriver Netlify-kontekst. Ingen deployment udføres.

## Bekræftede problemer før etape B

1. En ny ejer fra `scripts/ejer.mjs` får kun `udbyder: true`, mens ejerreads
   også ligger bag claims-v2-gaten. Testwrapperen beriger claimet og skjuler det.
2. Scriptet tillader blandet ejer-/tenantidentitet.
3. Ejer-callables kontrollerer ikke `authRevocations`.
4. Platformhandlinger som prislister har ikke samlet serveraudit.
5. Ejerkonsollen har ikke den aftalte arbejdsnavigation.

## Implementeret i etape B–E

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
- Versioneret rateblad med generiske tilbudsydelser, heltalsøre, rabatter,
  introperiode og automatisk udfyldning af tilbudslinjer.
- Uforanderlige tilbudsversioner, persistent versions-PDF med SHA-256,
  mailadapterfejlstatus, manuel afsendelse og dokumenteret accept.
- Genkørbar aftale-/tenantprovisionering med virkningsdato og beskyttelse mod
  dubletter samt bevaret aftalehistorik.
- Tidsbegrænsede administratorinvitationer med hash, udløb, tilbagekaldelse,
  genudsendelse/tokenrotation og eksisterende-konto-flow. Det gamle
  engangsadgangskode-endpoint er lukket.
- Ærlige statussider for endnu ikke byggede eller eksternt blokerede områder;
  ingen demo-success eller localStorage-fallback.

## De 11 skærmområder

| Nr. | Område | Faktisk status |
|---|---|---|
| 1 | Overblik | Implementeret med CRM-opfølgning og ærlig integrationsstatus |
| 2 | Salgspipeline | Implementeret med persistent pipeline, aktiviteter og kundehistorik |
| 3 | Kunde og abonnement | CRM, aftale/tenantprovisionering og sikker administratorinvitation implementeret |
| 4 | Rateblad | Versioneret redigering og tilbudsautoudfyldning implementeret; officielle priser mangler |
| 5 | Tilbud | Versioner, PDF, afsendelsesstatus, manuel registrering og accept implementeret |
| 6 | Fakturaer | Ikke implementeret i den nye ejerflade |
| 7 | Kreditnotaer | Ikke implementeret |
| 8 | Bilagsindbakke | Ikke implementeret |
| 9 | Omkostninger | Ikke implementeret |
| 10 | Økonomioverblik | Ikke implementeret |
| 11 | Integrationer | Statusside implementeret; forbindelser og jobs ikke implementeret |

## Verifikation 2026-09-10 — aktuel arbejdsrunde

- Isoleret Temurin JDK 21 blev fundet/afprøvet, men CLI 15.29.0 rammer en
  reproducerbar Windows AF_UNIX-fejl. Isoleret Temurin JDK 11 + Firebase CLI
  13.35.1 virker; systemets Java-installationer er ikke ændret.
- AK-01–AK-04 og Storage-regler: 33/33 består. Det dækker tenantløs ejer,
  kundeadministrator, tenantadskillelse, tilbagekaldt gammelt token og lukket
  direkte adgang til ejerens PDF-sti.
- Browser: normalt login med syntetisk tenantløs ejer i Auth/Database/Storage/
  Functions-emulatorer åbner `/main` og tilbudssiden med serverdata. Ingen
  demo-mode, guard-omgåelse eller produktionskonto blev brugt.
- Callable end-to-end: salgsmulighed → rateblad v1 → samtidig tilbudsændring
  → tilbud v1/PDF → rateblad v2 → tilbud v2 → ikke-tilsluttet mail → manuel
  afsendelse → accept → aftale/tenant → genkørsel → invitation. Består.
- Samtidighed: to writes med samme forventede revision giver præcis én vinder;
  cold-start-transaktioner bruger verificeret startsnapshot og efterfølgende
  Firebase-CAS-retries.
- Historik: v1-prisen er uændret efter ny prisliste/v2, og aftaleversionen
  dubleres ikke ved genkørsel. Accept opretter ingen faktura.
- PDF: servergenerering til Storage og versionsmetadata består; den visuelle
  layoutprøve med repositoryets logo er renderet og inspiceret.
- Fuld platformregression med repositoryets normale Node 24-testmiljø samt
  isoleret JDK 11/CLI 13.35.1 til emulatorerne: 4315/4315 består. Functions-
  emulatoren er separat verificeret på den deklarerede Node 20-runtime.
- Målrettet ESLint består. `npm run build` består med 502 moduler; kun den
  eksisterende CSS-kommentaradvarsel vises.
- Repositoryets brede `npm run lint` stopper i den eksisterende isolerede
  `facility-v2/eslint.config.js`, fordi dens lokale `@eslint/js` ikke er
  installeret. Den integrerede produktkode er lintet særskilt og består.

## Dependency-audit

- Browserpakken: 12 runtimefund (1 høj, 11 moderate) i den eksisterende
  Firebase 10.12.2/Undici- og React Router-stak. Ejerens login/callable-routing
  bruger disse pakker, men der er ikke fundet et konkret exploit i det nye flow.
- Functions: 11 moderate runtimefund i eksisterende Firebase Admin-transitive
  pakker. Den nye PDF-lagring bruger Admin Storage og er derfor inden for den
  berørte dependency-overflade.
- Rettelser kræver en separat kontrolleret Firebase/Router/Admin-opgradering,
  herunder en major Admin-opgradering ifølge audit. Den brede opgradering er
  bevidst ikke udført i denne arbejdsrunde.

## Næste konkrete opgave

Beslut officiel priskilde, mailleverandør og aktiveringsmekanisme for fremtidige
virkningsdatoer. Fortsæt derefter etape F med en persistent outbox/jobmodel og
en isoleret Dinero-testadapter. Dependency-opgraderingen bør planlægges som et
separat spor med fuld regression; ingen produktionstilslutning sker herfra.
