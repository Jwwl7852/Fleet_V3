# Veyro ejerkonsol — status v1

Opdateret: 2026-09-11

## V7 mailreference — lokal reviewstatus

- V7 er implementeret i det isolerede ejerspor fra HEAD
  `4b58690309535fde4474e1a489814c4991362e7b`. Den browserverificerede kode er
  `eefc7f4105327555fb2e66d07d7e6b7bbd1333da`; intet er pushet, merget eller
  deployet.
- Mailoversigt og fokuseret sag er adskilt. Oversigten åbner uden automatisk
  valg, viser 25 rækker pr. side, bevarer postkasse/status/mappe/søgning/side og
  samler flere sagers AI-opmærksomhed med eksplicit kilde.
- Pilotflowet dækker sagsafgrænset AI-forslag, revision, eksplicit indsættelse,
  gem/genindlæs og menneskelig godkendelse. Ny mail opretter kun en
  idempotent kladde; browsertesten og fixturekæden sendte ingen ekstern mail.
- Fælles Support er samme underliggende sag: en mail til Dennis blev overtaget
  af Jørn, Jørn skrev en intern note, og Dennis kunne se ændringen. Personlige
  scopes forblev adskilt. Interne Domicil-sager opretter ingen kunde eller
  tenant.
- Opfølgningssiden starter på **Til godkendelse**, og Dennis' Mine-filter kan
  ikke vise Jørns personlige opfølgning. Workerens syv stop-, samtidigheds- og
  ukendt-udfaldsscenarier består fortsat.
- Faktisk Edge-rendering er kontrolleret ved 1440×900, 1920×1080, 899×900,
  390×844 og 360×800. Tilbage gendanner side 2 og rækkefokus; mobil bevarer
  kladden. Computed styles viser Inter Variable 14 px/20,3 px, mindst 38 px
  kontroller, 12 px kort og 2 px fokusregel.
- V7/V6.2-regressionen består 76/76, målrettet ESLint har 0 fejl, og Vite-build
  består med 534 moduler. 12 faktiske screenshots og maskinlæsbare beviser
  ligger i `docs/screenshots/ejer-review-v7/`.
- Detaljeret M01–M10-acceptmatrix står i
  `docs/VEYRO_EJERKONSOL_REVIEW_V7.md`. Microsoft 365, OpenAI, Dinero, OCR og
  bilagsmail er fortsat **Ikke tilsluttet**.

## V6.2-afslutning — lokal reviewstatus

- Den afgrænsede V6.2-runde er implementeret på branch
  `codex/ejer-integrated-development` fra udgangspunkt
  `8b6e5ff0715234feec14582dfd12e9ad37aec112`. Kodecheckpoint er
  `203bff346e0955444260214fba1e2e3708b0f937`; intet er pushet, merget eller
  deployet.
- V6.1-02 markeres historisk som **delvist dokumenteret**, fordi den tidligere
  ordtælling ikke beviste det krævede indhold. V6.2 lukker punktet med en
  kildebaseret lokal adapter, en meningsfuld kortere pilotrevision,
  kontrastprøver og eksplicit indsættelse/gem/genindlæsning.
- Et nyt autoriseret emulatorforløb bruger konsekvent Aurora Mobilitet ApS,
  Sara Testperson og en `.invalid`-adresse fra CRM til accepteret version, ny
  kladde, AI-kontekst og dokumentpreview. Navneblandingen i V6.1 var en
  reviewfixture, der ændrede CRM-navnet efter det låste snapshot; den var ikke en
  tenant- eller adgangsfejl.
- Accepteret snapshot og PDF er fortsat låst og har identiske SHA-256-værdier
  før/efter AI- og kladdeforløbet. Strukturerede prislinjer, rabatter, mængder,
  perioder og ratebladskilde er uændrede.
- Den V6.1-indførte generelle afvisning af pilotstart før tilbudsdatoen er
  fjernet i klient- og serverkopien. Fremtidig og historisk registrering,
  ugyldige værdier, månedsslut/skudår, evaluering og vejledende drift er
  kontrolleret særskilt.
- Den aktuelle fokuserede suite består 37/37, målrettet ESLint har 0 fejl, og
  Vite 5.4.21 bygger 532 moduler. Det autoriserede V6.2-emulatorflow består.
- Seks faktiske browseroptagelser ved 1440×900, 1920×1080 og 390×844 samt tre
  maskinlæsbare bevisfiler ligger i `docs/screenshots/ejer-review-v6-2/`.
  Computed styles bekræfter indlæst Inter Variable 14 px / 20,3 px og intet
  vandret dokumentoverflow på mobil.
- Detaljeret acceptmatrix står i `docs/VEYRO_EJERKONSOL_REVIEW_V6_2.md`.
  Microsoft 365, OpenAI, Dinero, OCR og bilagsmail forbliver **Ikke
  tilsluttet**; kun syntetiske data og lokale adaptere er anvendt.

## V6.1-afslutning — lokal reviewstatus

Historisk note: punkt V6.1-02 var kun delvist dokumenteret, fordi en kortere
tekst ikke i sig selv beviste en korrekt pilotafgrænsning. V6.2-rapporten
dokumenterer den efterfølgende indholdsmæssige accept. Resten af afsnittet
bevares som den oprindelige V6.1-status.

- V6.1 er implementeret og lokalt verificeret på branch
  `codex/ejer-integrated-development`. Kodecheckpoints er `749791f` og
  `f7e3f45`; intet er pushet, merget eller deployet.
- Tilbudstekst og Veyro-assistent står i 60/40-layout ved 1440×900 og
  1920×1080. Mobil viser dem som særskilte paneler, og alle tre hovedfaner er
  nu synlige uden vandret afklipning ved 390×844.
- En ny v3-kladde arver den accepterede v2-tekst og opsætning. Den redigerede
  tekst består gem/genindlæs, mens v2-snapshot og PDF er uændrede med identisk
  SHA-256 før og efter.
- Den lokale AI-testadapter er kørt gennem første forslag, sælgerinstruks,
  kortere revideret forslag og eksplicit indsættelse. Instruksen lækkes ikke,
  økonomifelter ændres ikke, og forældede forslag kan ikke indsættes.
- Den faktiske produktions-mailworker er integrationstestet mod den lokale
  databaseemulator med injiceret lokal transport. Accept, afvisning, ny mail og
  ældre accepteret version med nyere kladde giver 0 transportkald; uafhængig
  support giver 1; to samtidige workers giver højst 1; ukendt udfald blokerer
  automatisk genforsøg.
- Bilagssøgning, OBD-hjælp og læsbart rateblad er visuelt kontrolleret. Den
  målte bilagssøgning er 330×39,75 px og har 2 px cyan fokusmarkering med 2 px
  afstand. Inter Variable er faktisk indlæst i browseren.
- V5/V6/V6.1-regressionen består 39/39, målrettet ESLint har 0 fejl, og Vite-
  produktionsbuild består med 532 moduler. Repositoryets brede lint er fortsat
  blokeret af det uvedkommende FACILITY-hul omkring manglende `@eslint/js`.
- Der er taget 29 faktiske PNG-optagelser og seks maskinlæsbare bevisfiler i
  `docs/screenshots/ejer-review-v6-1/`, bundet til kodecommit
  `f7e3f45544ba13053658235bfe1b66c3b07ed56a`.
- Detaljeret acceptmatrix og lokal gennemgang står i
  `docs/VEYRO_EJERKONSOL_REVIEW_V6_1.md`. Microsoft 365, OpenAI, Dinero, OCR og
  bilagsmail forbliver **Ikke tilsluttet**.

## Designreview — aktuel arbejdsrunde

- Starttilstand genverificeret på branch `codex/ejer-integrated-development`,
  HEAD `58ecd392067c658e947354354403c08487fd212f`, rent udgangspunkt.
- Den nyeste serie på 11 vedhæftede filer er kortlagt; fil 11 behandles som den
  rettede udgave af fil 7.
- Ejerens skal, navigation og fælles topbar er tilpasset den godkendte serie med
  repositoryets eksisterende logo og den fælles `fleet.css`-tokenkontrakt.
- Overblik, salgsindbakke, tilbud/tilbudsmail, opfølgningsgodkendelse,
  kunde/sagsassistent, økonomioverblik, integrationer og vidensbase er bygget om
  til de viste layouts uden at erstatte de eksisterende serverflows.
- Alle virkelige integrationer viser fortsat `Ikke tilsluttet`. Testdata er
  mærket `TESTADAPTER`/eksempel, og ingen ekstern mail, AI-analyse, Dinero-post
  eller produktionsændring er udført.
- Målrettet ESLint og produktionsbuild består. Den samlede målpakke består med
  76/76 tests, heraf 11 design-token-tests, efter flytning af ejerreglerne til
  den fælles stylesheet-kontrakt.
- Ni unikke referenceflows er browseråbnet med normalt tenantløst login og uden
  dokumentoverflow ved den faste IAB-viewport på 931×794 CSS-pixel.
- Ny fysisk pixelkontrol ved 1440×900 og 1920×1080 er ikke udført, fordi den
  tilgængelige browser ikke kan ændre viewport. Det står åbent og er ikke skjult
  bag den tidligere rundes bredskærmskontrol.
- Det detaljerede referencekort og de resterende afvigelser står i
  `docs/review/ejerkonsol-design-v1/README.md`.
- Lokalt kodecheckpoint: `de72201` (`feat(ejer): match approved owner console design`).
- Lokalt designreview-checkpoint: `a1fb2f3` (`docs(ejer): record design review and remaining viewport QA`).
- `origin/codex/ejer-integrated-development` findes ikke endnu. GitHub Actions
  viser kun custom-claims-workflowet, som er afgrænset til en anden branch.
- GitHub-backup er ikke udført: repositoryets autoritative driftsdokumentation
  angiver Netlify som frontend-host, og `netlify.toml` har en aktiv
  `branch-deploy`-kontekst. Uden adgang til Netlify-siteopsætningen kan et push
  derfor ikke dokumenteres som deployment-frit. Planlagt kommando er fortsat
  `git push --set-upstream origin codex/ejer-integrated-development`; ingen
  force-push, merge eller produktionsændring må indgå.

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
| J — Samlet aflevering | Implementeret og isoleret verificeret | Additiv fixture-migration, recoveryplan, driftsvejledning, målrettede ejer-/design-/regeltests, build og normal browserlogin-gennemgang består; brede legacy-kontroller har kendte afgrænsede fejl |

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
- AK-01–AK-04, bilagsadgang og Storage-regler bestod i dette checkpoints
  daværende platformkørsel. Det dækker tenantløs ejer,
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
- Checkpointets platformregression blev kørt med repositoryets normale Node
  24-testmiljø samt isoleret JDK 11/CLI 13.35.1 til emulatorerne. Functions-
  emulatoren blev separat verificeret på den deklarerede Node 20-runtime. Den
  aktuelle brede suite har siden fået yderligere tests og kendte afgrænsede
  legacy-fejl; det aktuelle resultat står i rettelsescheckpointet nedenfor.
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

## Rettelsescheckpoint 2026-09-11 — kundekonto og designstandard

- Faktisk udgangspunkt var worktree
  `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`, branch
  `codex/ejer-integrated-development`, HEAD
  `a5ee1120a800b85bf210af836ee13acfc3f1834c`. Arbejdet er fortsat som lokale,
  ikke-pushede commits; de øvrige modulworktrees er ikke ændret.
- Den samlede kundekonto findes på `/main/kunder/:tenantId` og kan åbnes via
  **Administrér kundekonto** fra både Salg → Kunder og Administration →
  Abonnementer. De syv områder er Kundeprofil, Moduler, Brugere og enheder,
  OBD, Abonnement og priser, Administratorer og Historik.
- `kundekontogem` håndhæver tenantløs ejerclaim, validerer den accepterede
  aftaleversion eller det manuelle rateblad, bruger optimistisk revision og
  operation-id, gemmer uforanderlige versioner og skriver audit. Direkte
  browserwrite til `udbyder/kundekonti` er afvist i databasereglerne.
- Den friske emulatorflowtest består med tilbud v1/v2, accepteret v2,
  konto/mængder/OBD, idempotent gentagelse, én vinder ved samtidig ændring og
  uændrede låste tilbudssnapshots. Faktura-/kredit-/bilagsflowet består fortsat.
- AK-01–AK-04 og abonnementsreglerne består på den kompatible, isolerede vej:
  Firebase CLI 13.35.1, Temurin JDK 11.0.32.1+1 og Node 20.20.2. Den normale
  udviklings-/capture-shell bruger Node 24.19.0; ingen systeminstallation er
  overskrevet.
- Afgrænset ESLint for alle ændrede ejerfiler består. Designkontrakten består
  11/11, kundekontoreglerne 5/5, navnekontrollen 5/5 og Vite-build består med
  525 moduler. Repositoryets brede `npm run lint` er fortsat blokeret af det
  eksisterende manglende `@eslint/js` i `facility-v2`; dette spor er ikke ændret.
- Browseren har med normalt tenantløst ejerlogin verificeret ugemte ændringer,
  synlig Luk, Annullér/Fortsæt, ESC som kun lukker øverste dialog og fokusretur
  til **Tilbage til kunder og abonnementer**. Browserens Tilbage åbner samme
  beskyttelse uden at miste inputtet.
- Faktiske screenshots er genskabt ved 1440×900, 1920×1080 og 899×900. Målt i
  browseren: sidebar 216 px, kort 12 px, input 38 px, indholdsmargin 26 px,
  Inter Variable 14 px/20,3 px på skal, felter og faner, og intet vandret
  dokumentoverflow ved mobilkontrollen.
- Microsoft 365, OpenAI, Dinero, OCR og bilagsmail står stadig som `Ikke
  tilsluttet`. Kun syntetiske `.invalid`-data og lokale testadaptere er brugt.

## Mail, support og arbejdsflow V2 — 2026-09-11

- Lokal baseline før runden: branch `codex/ejer-integrated-development`, HEAD
  `463aab33392651edf3eb12dc54d340bba05242fa`, ren arbejdsstatus. Nyere arbejde
  blev bevaret; de øvrige worktrees er ikke ændret.
- Nye routes dækker Mail/Indbakker, Opfølgning, Sager og mapper, Sendt, fælles
  Support, Rapporter og Veyros leverandører.
- Mail skelner fysisk postkasse fra sagsansvar og viser sammensmeltede kilder,
  valgt samtale, AI-testgrundlag og konkret godkendelsesstatus. Support er samme
  tråd, ikke en kopi.
- Det planlagte M365-deltajob kan hente Inbox og Sent Items for flere postkasser
  uden browser. Graph er ikke kaldt lokalt, fordi credentials og mailbox-type
  ikke er verificeret.
- Grøn verifikation: salg/aftale/invitation; økonomi/bilag;
  kommunikation/support/samtidighed/stale-godkendelse; AK-regler 34/34;
  kommunikations-/designtests 16/16; build med 530 moduler.
- Screenshots ligger i `docs/screenshots/ejer-review-v3/`. Computed styles viser
  Inter Variable, 14 px/20,3 px, 216 px sidebar, 12 px kort, 40–42 px kontroller
  og intet vandret dokumentoverflow ved de målte viewports.
- Bred `npm run lint` er stadig blokeret af det eksisterende FACILITY-hul
  (`@eslint/js`). Afgrænset lint af alle ændrede ejerfiler består.

## V3-opfølgning — 2026-09-11

- Kommunikation læses nu gennem den ejerautoriserede serverfunktion
  `ejerkommunikationhent`; direkte læsning af hele trådsamlingen er lukket.
- Personlige postkassetråde filtreres efter fysisk postkasseejer eller ansvar,
  mens delte kundesager fortsat kan ses og overtages af begge ejere.
- Accepterede tilbud kan danne en ny, separat kladde uden at ændre accepteret
  tekst, PDF, aftale eller fakturagrundlag. Provisionering følger den låste
  accepterede version.
- OBD-priser bruger nu eksplicit kronevisning og øretransport. Pilotdatoer,
  rabatomfang, rapportfiltre, hitrate, bilagsretry, leverandørkort og neutral
  integrationsstatus er samlet i ejerskallen.
- Godkendte opfølgninger ligger i en særskilt kø og kræver fortsat en ny
  afsendelseshandling med umiddelbar statuskontrol.
- Lokal verifikation: 44/44 afgrænsede tests, 11/11 designtests, fuld
  regelpakke exit 0, afgrænset ESLint og build med 530 moduler.
- 15 nye browseroptagelser og acceptstatus R01–R20 ligger i
  `docs/screenshots/ejer-review-v4-final/` og `VEYRO_EJERKONSOL_REVIEW_V4.md`.

## V5-rettelsesrunde — 2026-09-11

- Verificeret udgangspunkt var worktree
  `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`, branch
  `codex/ejer-integrated-development`, HEAD
  `617b47d96e2c8123f81cda3481bcbce3b7597559`. Koderettelserne er gemt lokalt i
  checkpoint `06f71c024d3600b339029bc408a7ac894375d4ab`.
- Menugrupper kan nu foldes sammen, selv om et aktivt underpunkt er valgt.
  Pipeline bliver på samme URL, mens Salg kan skifte lukket/åben gentagne
  gange. Det udtrykkelige gemte brugervalg har forrang for route-defaulten.
- Accepterede tilbud viser nu en låst læseflade. Ny redigering foregår i en
  særskilt kladde, og opfølgninger for den accepterede tilbudskæde stoppes og
  afvises igen umiddelbart før afsendelsesjobbet.
- Lokal AI-testadapter, pilot/rabat, fælles kundemail, support, mobilmail,
  licens-/OBD-visning, rapporter, bilag og leverandørhistorik er rettet efter
  V5-instruksen. Ingen ekstern AI-, mail- eller økonomitjeneste blev kaldt.
- V5-verifikation består: 97/97 målrettede tests, målrettet ESLint, Vite-build
  med 531 moduler og de syntetiske ejer-/økonomiflows i emulatorerne.
- Browsermålinger viser Inter 14 px / 20,3 px på hele ejerfladen, 216 px
  sidebar, 12 px kortradius, bevaret mobilkladde og faktisk uafhængig scroll i
  mailens liste-, samtale- og AI-panel.
- 22 faktiske screenshots ved 360×800, 390×844, 899×900, 1440×900 og
  1920×1080 samt route-/commitmanifest ligger i
  `docs/screenshots/ejer-review-v5/`. Den samlede acceptstatus står i
  `docs/VEYRO_EJERKONSOL_REVIEW_V5.md`.
- Microsoft 365, OpenAI, Dinero, OCR og bilagsmail står fortsat som **Ikke
  tilsluttet**. Ingen push, merge, deployment, produktionsændring eller rigtig
  mailafsendelse er foretaget.

## V6-afsluttende rettelser — 2026-09-11

- Verificeret udgangspunkt var branch `codex/ejer-integrated-development` ved
  `4c0108935337fda6ccde1d011916d1d27820a634`. Nyere V5-arbejde og de øvrige
  worktrees er bevaret.
- Overblikkets testadaptermærke overlapper ikke titel eller brødtekst ved
  1440×900, 1920×1080 eller 125 % zoom med lang tekst. Ansvarlige vises med
  profilnavn eller `Ikke tildelt`.
- Tilbud er samlet i **Sammensæt løsning**, **Tilbudstekst** og **Dokument**.
  Accepteret v2 er fortsat låst; en ny v3 arver sit grundlag uden at ændre v2
  eller dens PDF.
- Den lokale AI-testadapter laver kundevendt tekst, kræver eksplicit indsættelse
  og blokerer et forældet forslag efter manuel tekstændring. Pilotdatoer,
  vejledende drift og manuelle evalueringsdatoer er afstemt.
- Rapporter viser accepterede modulkøb med deduplikering og pilot/drift-filter,
  hitrate 104/(104+26)=80 % samt kendte målinger med datadækning og tidspunkt.
- Mobilmail viser mindst to komplette rækker ved 360×800, bevarer kladde og
  route ved tilbage-navigation, og desktopscroll er målt før/efter for liste,
  samtale, AI-panel og dokument ved begge desktopstørrelser.
- Gemmedialogen viser konkrete før → efter-værdier. Workerens sidste
  serverkontrol ligger efter jobreservation og før Graph-transport; support er
  særskilt, og et ukendt transportresultat genudsendes ikke blindt.
- Målrettet V5/V6/designsuite består 26/26, målrettet ESLint og Vite-build
  består. 24 unikke browseroptagelser og målefiler ligger i
  `docs/screenshots/ejer-review-v6/`; den detaljerede acceptmatrix ligger i
  `docs/VEYRO_EJERKONSOL_REVIEW_V6.md`.
- Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er fortsat **Ikke
  tilsluttet**. Kun syntetiske emulatorfixtures er anvendt; ingen push, merge,
  deployment, produktionsændring, bogføring eller virkelig mailafsendelse er
  udført.
