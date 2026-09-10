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
- Lokalt dokumentationscheckpoint efter D/E:
  `f948eaf6c55d7f940775ca7f53522ad238fcc441`; intet er pushet.
- Lokalt faktura-outbox-checkpoint før Microsoft 365/OpenAI-runden:
  `1d7b5d0b2b400a28adfcfc8bcabf12d228694349`; intet er pushet.
- Lokalt Microsoft 365-/salgsassistent-checkpoint:
  `ca2354cd1f11354f6f01a05c2525e5908c9782b5`; intet er pushet.
- Lokalt kredit-/Dinero-returcheckpoint:
  `f7500301366038eee455077c8ab5b4624804cd68`; intet er pushet.
- Lokalt bilags-/udgiftscheckpoint:
  `fe288ffc90dc99f00be06157cc778ea8b9bdd43c`; intet er pushet.
- Lokalt økonomioverblikscheckpoint:
  `e11b5afd4e944895b4cabccc19484b514bab70aa`; intet er pushet.
- Lokalt etape-J-/afleveringscheckpoint:
  `9d3fbd9aca7921e154f771568cd70a4b5dba25ec`; intet er pushet.
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
| F — Fakturering | Implementeret; Dinero eksternt blokeret | Race, snapshot, PDF/CSV, genkørsel, ukendt udfald og delvis fejl emulatorverificeret |
| G1 — Microsoft 365-salgsmail | Implementeret; ekstern forbindelse mangler | Rene kontrakt-/fejltests, rules og samlet build/regression består; live Graph og ny callable-E2E er ikke kørt |
| G2 — OpenAI-salgsassistent | Implementeret; ekstern forbindelse mangler | Struktureret request, API-fejl, budgetstop, rules og samlet build/regression består; live API er ikke kaldt |
| G — Kredit og returdata | Implementeret; live Dinero mangler | Beregning, reservation/race, PDF og testkø emulatorverificeret; live API og retursynk ikke eksternt testet |
| H — Udgifter | Implementeret; mail/OCR/Dinero-køb mangler eksternt | Upload, signatur/hash, dedupe, metadata, godkendelse, genkørbar klargøring og match emulatorverificeret |
| I — Overblik | Implementeret og isoleret verificeret | Afstemte KPI-definitioner, datadækning, filtre og detaljelinks består på kendt datasæt |
| J — Samlet aflevering | Implementeret og isoleret verificeret | Additiv fixture-migration, recoveryplan, driftsvejledning, 4360/4360 regression, build og normal browserlogin-gennemgang består |

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
| 1 | Overblik | Implementeret med CRM-opfølgning, nye henvendelser, godkendelsesopgaver og ærlig integrationsstatus |
| 2 | Salgspipeline | Implementeret med persistent pipeline, aktiviteter og kundehistorik |
| 3 | Kunde og abonnement | CRM, aftale/tenantprovisionering og sikker administratorinvitation implementeret |
| 4 | Rateblad | Versioneret redigering og tilbudsautoudfyldning implementeret; officielle priser mangler |
| 5 | Tilbud | Versioner, PDF, M365-mailkladde/outbox, AI-tekstforslag, manuel registrering og accept implementeret |
| 6 | Fakturaer | Frigivelse, PDF/CSV, kø, adapterstatus og fejlforløb implementeret; Dinero ikke tilsluttet |
| 7 | Kreditnotaer | Hel/delvis kredit, reservation, PDF, kø og afstemningsstatus implementeret; live Dinero ikke tilsluttet |
| 8 | Bilagsindbakke | Privat upload, dedupe, metadata, OCR-status og godkendelse implementeret; mail/OCR eksternt frakoblet |
| 9 | Omkostninger | Dinero-posteringer, eksplicit kontomapping, fortegn, bilagsmatch og datadækning implementeret; købsoverførsel frakoblet |
| 10 | Økonomioverblik | Afstemte KPI'er, filtre, datadækning og klikbare detaljelister implementeret |
| 11 | Integrationer | M365/OpenAI-status samt Dinero faktura-, kredit- og retursynkkontrakt implementeret; eksterne forbindelser ikke tilsluttet |

## Implementeret i etape G1–G2

- Salgsindbakke med trådliste, samtale og sag/AI-panel; søgning, filtre,
  vedhæftninger, ansvarlig, status, CRM-links og særskilte interne noter.
- Delta-synk af Inbox og Sendt post med immutable Graph-id'er, vedvarende
  checkpoints, dubletnøgler og lagring af tilladte vedhæftninger i beskyttet Storage.
- Websitehenvendelser med HMAC, replay-/dubletbeskyttelse, honeypot og
  korrelation til afledt mail. Ukendte afsendere provisionerer aldrig tenant.
- Tilbuds-outbox fryser modtager, tekst, præcis tilbudsversion, PDF-sti og hash.
  Graph 202/204 er kun accepteret anmodning; Sendt post dokumenterer afsendelse.
- Planlagte opfølgninger aktiveres ved forfald, kræver konkret menneskelig
  godkendelse og invalideres ved tekstændring, nyt svar, lukket sag eller
  accepteret/afvist tilbud. Ukendt Graph-udfald kan ikke genudsendes blindt.
- Versioneret vidensbase med kilde, godkendelse og leveringsstatus samt
  serverbaseret Responses API-adapter med `store: false` og struktureret output.
- Automatisk sagsanalyse og vedvarende intern assistentsamtale bruger kun den
  aktuelle sag og godkendt viden. AI kan foreslå tilbudstekst, men indsættelse
  kræver brugerhandling, og prismotorens bindende felter er ikke AI-skrivbare.
- Hver ny indgående besked markerer et analysejob; et separat schedulerjob
  reserverer og udfører analysen, når OpenAI er aktiv. Fejl vises på sagen og
  stopper ikke mail eller CRM.
- Månedligt request-/input-/outputbudget reserveres atomisk før kald og
  afstemmes efter svar. Mail og CRM er uafhængige af AI-status.

## Implementeret i etape F

- Fakturagrundlag frigives ved CAS til et uforanderligt v1-snapshot med
  forretningsnøgle, aftale-/prislistereferencer, mængdekilder og SHA-256.
- PDF og CSV dannes servermæssigt fra det præcise frigivelsessnapshot og
  lagres under en ejerbeskyttet Storage-sti.
- Ét stabilt fakturajob pr. periode/tenant forhindrer dobbeltoprettelse.
- Dinero-porten er en eksplicit testkontrakt, ikke en gættet live-HTTP-kontrakt.
  Den kan kun give simuleret succes i det præcise demo-/emulatormiljø og med et
  navngivet scenario. Ukendt resultat spærrer blind genudsendelse.
- Bogført-men-ikke-sendt kan genkøres med samme eksterne reference.

## Implementeret i etape G

- Kreditnotaskærmen viser originalt, krediteret/reserveret og resterende beløb,
  fakturalinjer og mængder samt adskilte dokument-, send- og afregningsstatusser.
- Serveren bygger kreditten af det frosne fakturasnapshot. Historiske priser,
  moms, kunde, valuta og originalreference kopieres ind; senere prisændringer
  kan derfor ikke omskrive en kreditversion.
- Alle aktive kreditstadier, inklusive kladde og ukendt eksternt udfald,
  reserverer i samme RTDB-transaktion. Samtidig overkreditering afvises.
- Frigivelsen fryser v1 med SHA-256 og en persistent PDF i lukket Storage.
  Kun en uændret kladde kan annulleres; frigivne dokumenter hårdslettes ikke.
- Kredit-outbox genbruger F's fejlmodel. Testadapteren dækker succes, timeout
  efter oprettelse og bogført-men-ikke-sendt. Liveadapteren bruger en stabil
  GUID, men er ikke kaldt uden en autoriseret Dinero-testorganisation.
- Personlig integrations auth, credit-note create/book/email, invoice/credit
  read, payments, mailouts, entries, pagination og `changesSince` er mappet til
  den aktuelle officielle kontrakt. Hemmeligheder er Functions-secrets.
- Retursynk har separate sikre checkpoints pr. dokumenttype, seneste forsøg
  og seneste succes, maksimum otte dokumenter pr. art pr. kørsel og scheduler
  hvert 15. minut. Manglende/stale data vises aldrig som nul.
- Betalt originalfaktura viser tilbagebetalings-/udligningsbehov. Veyro
  markerer aldrig automatisk banktilbagebetaling som udført.

## Implementeret i etape H

- Bilagsindbakken har filvælger, drag & drop, liste/søgning, kilde, dato,
  leverandør, dokumentnummer, beløb, status og synlig dubletbegrundelse.
- Upload initieres servermæssigt og begrænses til PDF/JPEG/PNG og 20 MB.
  Bekræftelsen kontrollerer Storage-metadata, magic bytes og SHA-256 før
  originalen markeres som modtaget. Direkte klientadgang til originalen er
  lukket; hentning kræver et nyt ejercheck og et fem minutters link.
- Fast metadata-model, manuelle versioner og særskilt OCR-forslag forhindrer,
  at udtrukket tekst bliver godkendte regnskabsdata. Metadata og OCR låses
  efter godkendelse/klargøring.
- Eksakt hash-/kildededupe og tværkanals signaler markerer mulige dubletter.
  Der er ingen automatisk sletning, sammenlægning eller bogføring.
- Godkendelse fryses i et vedvarende købskladde-job. Samtidige/genkørte kald
  genbruger samme job og snapshot; Dinero-overførslen står eksplicit som
  `ikke_tilsluttet`.
- Omkostningsvisningen bruger kun daterede Dinero-poster på eksplicit
  resultatmappede konti og respekterer fortegn/krediteringer. Umappede poster
  og godkendte, ikke bogførte bilag vises separat. Ét bilag kan have flere
  postmatches uden at bilagsbeløbet tælles igen.
- Filupload er den eneste aktive indgang. Microsoft 365-invoice-mappe,
  inbound-mail og OCR er adaptere med konkret manglende opsætning og vises
  ikke som aktive.

## Implementeret i etape I

- `/main/oekonomi` er erstattet af et beregnet økonomioverblik med periode,
  kunde, modul og omkostningskategori som synlige filtre.
- Det fælles domænelag definerer label, beløbsgrundlag og kilde for centrale
  KPI'er og leverer både kortenes tal og deres afstemningsrækker.
- Faktureret salg netto er dokumenteret afsendte fakturaer ekskl. moms minus
  bogførte kreditnotaer. Veyro-grundlag og Dinero-dokument tælles ikke begge.
- Betalinger og rest er inkl. moms, grupperet efter betalings-/forfaldsdato,
  med gældsalder og ukendt datadækning. Et krediteret nul kaldes ikke betaling.
- Omkostningstal bruger kun periodens eksplicit kategoriserede resultatkonti.
  Foreløbig difference kræver komplette Dinero-dokumenter og posteringer og
  beskrives udtrykkeligt som hverken likviditet eller endeligt årsresultat.
- Abonnement viser aktive aftaler samt normal og aktuel intro-månedsværdi uden
  engangsbeløb. Pipeline viser månedsværdi og engang separat; vinderate viser
  vundne af afsluttede og ingen procent ved tomt grundlag.
- Arbejdskort linker til faktura-, bilags-, omkostnings-, abonnements- og
  salgsskærme. Modulfordeling uden eksterne fakturalinjer foregiver ikke data.

## Verifikation 2026-09-10 — aktuel arbejdsrunde

- Isoleret Temurin JDK 21 blev fundet/afprøvet, men CLI 15.29.0 rammer en
  reproducerbar Windows AF_UNIX-fejl. Isoleret Temurin JDK 11 + Firebase CLI
  13.35.1 virker; systemets Java-installationer er ikke ændret.
- AK-01–AK-04, bilagsadgang og Storage-regler indgår i 4360/4360 grønne
  platformtests. Det dækker tenantløs ejer,
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
  isoleret JDK 11/CLI 13.35.1 til emulatorerne: 4360/4360 består. Functions-
  emulatoren er separat verificeret på den deklarerede Node 20-runtime.
- M365/OpenAI-måltests: 10/10 består, herunder korrelationsdublet, immutable
  provider-id, ukendt afsender, godkendelsesinvalidering, planlagt forfald,
  AI-budget/API-fejl samt ukendt Graph-udfald efter oprettet kladde.
- Målrettet ESLint består.
- Etape G-måltests: 7/7 består. Den eksisterende fire-emulator-E2E dækker
  nu også kundeafvisning, delkredit, samtidig restkredit med én vinder,
  overkreditafvisning, frossen PDF og idempotent testafsendelse.
- Etape H-måltests: 7/7 består. Fire-emulator-E2E dækker ejer-/kundeafvisning,
  uploadbekræftelse, eksakt dublet, metadataversion, godkendelse, to samtidige
  Dinero-klargøringer til ét job og match til en bogført fixturepost.
- Etape I-måltests: 7/7 består på et kendt afstemningsdatasæt med faktura,
  kredit, betaling, rest, gældsalder, omkostningskredit, umappet konto,
  introaftale, pipeline, vinderate og alle fire filterarter.
- Etape J-måltests: 8/8 består. Den additive migration finder kun manglende
  forretningsnøgler, er idempotent, stopper på afvigelser og ændrer ikke
  accepterede tilbud, historiske linjer eller beløb. Fixture-dry-run fandt to
  forventede operationer; ingen rigtig database blev læst eller migreret.
- Normal browserlogin med den tenantløse syntetiske ejer er genkørt i fire
  emulatorer. Overblik, salgspipeline/-indbakke, tilbud, rateblad, vidensbase,
  abonnement, økonomi, faktura, kredit, bilag, omkostninger og integrationer
  blev åbnet uden demo-mode. Tastaturnavigation til ratebladet består.
- Layout blev kontrolleret ved 1440×900 og 1920×1080 uden vandret overflow.
  Gennemgangen fandt en manglende kolonnenøgle/feltfallback i fællestabellen;
  den er rettet og visuelt genverificeret med synlige gældsaldersetiketter.
- Drifts-, migration-, recovery-, smoke-test- og aktiveringsrækkefølge er
  samlet i `docs/VEYRO_EJERKONSOL_DRIFT_V1.md` uden hemmeligheder.
- `npm run build` efter etape J består med 517 moduler.
- En ny fuld callable-E2E for salgsindbakken blev ikke oprettet, fordi miljøets
  sikkerhedsreview afviste den foreslåede emulatortestfil. Den eksisterende
  ejer-flow-E2E, rules, rene adaptertests og build er grønne; M365-/AI-callables
  er derfor implementeret, men ikke påstået end-to-end-verificeret.
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
- G1/G2 har ikke tilføjet nye npm-pakker: Graph og Responses API bruger den
  deklarerede Node-runtimes `fetch`. De nye mailvedhæftninger og callables
  bruger dog de allerede berørte Firebase Admin/Storage-afhængigheder.
- Rettelser kræver en separat kontrolleret Firebase/Router/Admin-opgradering,
  herunder en major Admin-opgradering ifølge audit. Den brede opgradering er
  bevidst ikke udført i denne arbejdsrunde.

## Før reel aktivering

Den internt gennemførlige etape J er afsluttet. Før ekstern aktivering skal
postkassetype og underliggende mailbox-id for
`info@veyrosystems.com` verificeres, Entra-app/mailbox-scope og Send As-retten
godkendes, og en syntetisk ikke-produktions-E2E gennemføres. OpenAI kræver
godkendt model, månedlige grænser og Functions-secret samt en autoriseret
syntetisk prøve. Dependency-opgraderingen forbliver et separat spor; ingen
produktionstilslutning, virkelig mail eller kundedataoverførsel sker herfra.
Indgående vedhæftninger gemmes som tvungen download, privat/no-store og med
20 MB loft; valg af malware-scanning og retention skal træffes før produktion.
Dinero-aktivering kræver personlig client-id/-secret, organisations-id,
organisationsspecifik API-nøgle, salgskonto og en separat testorganisation.
Først derefter kan oprettelse/bogføring/mailout og retursynk dokumenteres live.
Bilagsoverførsel kræver desuden et kontraktverificeret Dinero-købs-/bilagsflow;
ingen klargjort Veyro-post er rapporteret som bogført.

## Reviewcheckpoint 2026-09-10

- Verificeret arbejdsområde før review: worktree
  `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`, branch
  `codex/ejer-integrated-development`, HEAD
  `31c046c6f9d31a7d1cedbeea0f85581a0393e43b`, ingen upstream. De øvrige
  modulworktrees blev kun aflæst og ikke ændret.
- En frisk Auth/Database/Functions/Storage-suite blev startet på det isolerede
  `demo-veyro-owner`-projekt. Første kolde Functions-discovery overskred 10
  sekunder; med `FUNCTIONS_DISCOVERY_TIMEOUT=60000` blev alle ejer-callables
  indlæst.
- Faktisk anvendt værktøjskæde: Firebase CLI `13.35.1`, Temurin OpenJDK
  `11.0.32.1+1`, isoleret Node `v20.20.2`, npm `11.17.0` og Vite `5.4.21`.
  Shellens normale Node er `v24.19.0`. JDK 21/CLI 15.29.0 er fortsat kun den
  mislykkede AF_UNIX-vej på denne Windows-maskine, ikke den kørte suite.
- Fixturekæden blev kørt fra tom emulator i rækkefølgen ejer → tilbud/aftale →
  faktura/kredit/bilag → review. Resultatet omfattede tilbud v1/v2, accepteret
  version 2, idempotent aftale/tenant, invitation, låst septembergrundlag,
  delbetaling, delkredit, bilagsdublet og match.
- Normal browserlogin blev gennemført som den syntetiske tenantløse ejer via
  Auth-emulatoren. Ingen demo-mode, guard-omgåelse, produktionskonto eller
  virkelig credential blev brugt.
- Browseren viste den sammenhængende Nordlys-reviewcase og den præcise
  prislistesnapshotreference på fakturaen. Microsoft 365, OpenAI, Dinero,
  bilagsmail og OCR står fortsat som `Ikke tilsluttet`.
- AI-, mail- og Dinero-resultater i reviewcasen er eksplicit mærkede lokale
  testadapterfixtures. Der er ikke overført mailindhold til OpenAI og ikke sendt
  mail eller økonomidata til en ekstern tjeneste.
- Reproducerbar login-, start- og gennemgangsvejledning samt screenshots er
  samlet i `docs/VEYRO_EJERKONSOL_GENNEMGANG_V1.md`.
