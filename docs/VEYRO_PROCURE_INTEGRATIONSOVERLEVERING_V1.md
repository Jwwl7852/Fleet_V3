# VEYRO PROCURE – integrationsoverlevering V1

Dato: 12. september 2026
Formål: entydigt checkpoint- og beslutningsgrundlag for sammenlægning med den fælles Veyro-integrationsbranch.

## 1. Konklusion og anbefalet checkpoint

PROCUREs færdige produktkode, målrettede tests og eksisterende lokale beviser er samlet i produktcheckpointet:

`4f613bdd41632629717e93247f8d9dc7a3ea534b`

Denne rapport committes separat oven på produktcheckpointet. Det efterfølgende dokumentationscommit er det anbefalede **overleveringscheckpoint**, fordi det indeholder både produktcheckpointet og denne rapport. Dets fulde id rapporteres sammen med filen efter committet; et Git-commit kan ikke stabilt indeholde sit eget hash-id.

Der er ikke fundet en tekstuel mergekonflikt mod den aktuelt verificerede integrationsbranch. Sammenlægningen kræver alligevel et eksplicit ejerreview af de fælles filer, især `src/App.jsx`, `src/fleet/AppShell.jsx`, navigation, Firebase-klient, Functions, Database/Storage Rules og Functions-lockfil. Der er ikke startet nye produktændringer for at gøre denne rapport grøn.

## 2. Verificeret Git-grundlag

| Punkt | Verificeret værdi |
| --- | --- |
| Worktree | `C:/Users/DennisChristensen/Documents/GitHub/Fleet_V3-procure-integrated` |
| Branch | `codex/procure-integrated-development` |
| Produkt-HEAD før rapportcommit | `4f613bdd41632629717e93247f8d9dc7a3ea534b` |
| Upstream | Ingen upstream er konfigureret |
| `origin` | `https://github.com/Jwwl7852/Fleet_V3.git` (fetch/push) |
| Ekstra remote | `fakturacenter-backup` → `https://github.com/Dingoo1976/Fleet_V3-fakturacenter-backup.git` (fetch/push) |
| Verificeret integrationsbranch | `codex/veyro-integration-v1` / `origin/codex/veyro-integration-v1` |
| Integration-HEAD | `39963337a52d4464f619077683d1f39aa81eff1e` |
| Fælles forfader | `989dbb87db639efed0ba1b5a1e271560f7659a0c` |
| Divergens | Integrationsbranch: 1 commit; PROCURE: 21 commits efter fælles forfader |

Den seneste fælles vejledning, `docs/VEYRO_MODULUDVIKLINGSSPOR_V1.md`, blev læst direkte fra `codex/veyro-integration-v1` med `git show`; ingen lokal fil blev overskrevet. Integrationsbranchens eneste commit efter den fælles forfader tilføjer denne vejledning. Ingen af dens ændrede filer overlapper PROCURE-branchens ændrede filer. `git merge-tree` viste ingen konfliktmarkører for de nuværende refs.

Et live, skrivebeskyttet `git ls-remote origin` bekræftede `refs/heads/codex/veyro-integration-v1` på `39963337…`. Det fandt **ikke** `refs/heads/codex/procure-integrated-development`. Produkt- og overleveringscheckpointet er derfor **ikke verificeret på GitHub** og er kun lokalt tilgængeligt. Der er ikke udført fetch eller push.

Før rapporten var alle sporede filer rene. Følgende eksisterende, ikke-sporede reviewartefakter er bevaret urørte og er ikke del af checkpointet:

- `output/PROCURE-lager-review-2026-09-12.zip` og tilhørende mappe.
- `output/PROCURE-varelager-koeb-review-2026-09-12.zip` og tilhørende mappe.
- Ikke-sporede undermapper under `output/review/` for lager-, PDF-, runtime- og varelagerbeviser.

## 3. Omfang og proveniens

Forskellen fra fælles forfader til produktcheckpoint er 147 filer, 33.840 tilføjelser og 231 sletninger fordelt på 21 lineære commits. Der er ingen mergecommits i serien og ingen post-base commits importeret eller cherry-picket fra andre modulworktrees. Koden genbruger fælles kontrakter og komponenter fra den fælles base, men ejer ikke andre modulspor.

### PROCURE-ejede områder

- `src/fleet/procure-v2/**`: skærme, adapter, domænelogik, lager-/forbrugslogik, PDF-generator, Inter-fonts, komponenter og afgrænset CSS.
- `src/moduler/indkoeb/ProcureModule.jsx`: indgang fra fælles router.
- `functions/delt/procure-v2/**` og `functions/procure-webshop-credentials.js`: serverdomæne, lager, PDF og krypterede webshopoplysninger.
- `scripts/procure-*.mjs`, `functions/test/procure-callables.integration.mjs` og `test/procure*.test.mjs`: lokale emulator-, browser-, domæne- og regressionsprøver.
- `docs/PROCURE_*.md`: implementerings-, sporbarheds-, lager-, varelager-/køb- og PDF-beviser.
- Sporede syntetiske PDF-/screenshot-/JSON-/CSV-beviser under `output/`. De indeholder testdata og skal ikke bruges som kundedata.

### Ændringer i fælles filer

| Område | Filer og virkning | Integrationsbemærkning |
| --- | --- | --- |
| Router | `src/App.jsx` | `/indkoeb` og `/indkoeb/*` går til det integrerede modul; fælles Leverandører og Fakturacenter bevares; gammel `/indkoeb/varelager` viderestilles. Login-returmekanismen genbruges. |
| AppShell | `src/fleet/AppShell.jsx` | PROCURE bruger fælles shell, mens den gamle fælles sidetitel skjules på `/indkoeb*`; miljøbannertekster er præciseret. Ejer skal vurdere den globale bannerændring. |
| Navigation/faner | `src/fleet/nav.js`, `src/fleet/modulfaner.js`, `src/fleet/moduler.js` | Tilføjer PROCURE-ruter, skjulte mobil-/opsætningsruter og modulmapping for godkendelsessager/bilagskvote. |
| Tema/design | `src/fleet/fleet.css`, `src/fleet/procure-v2/procure-v2.css` | Hovedparten er afgrænset til PROCURE. Fælles CSS ændrer sidebarens `box-sizing` og mobilens nav-gruppelayout; ejerreview kræves for tværmodulpåvirkning. Fælles farvetokens er ikke vilkårligt erstattet. |
| Login/Firebase-klient | `src/firebase.js` | Tilføjer konfigurerbare lokale Database-, Auth- og Functions-emulatorporte. Normal Firebase-login og eksisterende retur-URL bevares. |
| Claims/permissions | Ingen ændring i den centrale permissionsfil eller rollepresets | Modulet genbruger eksisterende signed claims og permissions: `indkoeb.laes`, `indkoeb.skriv`, `indkoeb.godkend`, `brugere.skriv`, `leverandoerer.laes/skriv` og `fakturaer.laes`. |
| Fælles indkøbskontrakter | `src/fleet/behov.js`, `bestilling.js`, `godkendelse.js`, `procure.js`, `varelager.js` | Snapshotfelter, enheder, linjedeling, godkendelser, lagerreferencer, status og historik udvides additivt. |
| Leverandører/mail | `src/fleet/leverandoerer.js`, `mailtransport.js`, `functions/delt/leverandoerer.js`, `functions/delt/mailtransport.js`, `functions/mail/**` | Bestillingsmetode, bestillingsmail, webshopfelter, kontrolleret transport og Mailgun-adapter. Leverandørens basisdata forbliver fælles stamdata. |
| Faktura | `src/fleet/faktura.js`, `functions/index.js` | Udvider fælles fakturakontrakt med PO-/linjereference, match, kreditnotaer og destination. Fakturaen forbliver i fælles Fakturacenter. |
| Ældre indkøbsskærme | `src/moduler/indkoeb/Bestillinger.jsx`, `Leverandoerer.jsx`, `Oversigt.jsx` | Små kompatibilitets-/linkændringer omkring det integrerede modul og fælles leverandører. |
| Functions | `functions/index.js` samt delte serverfiler | Tilføjer PROCURE-callables og udvider fælles faktura-/mailfunktioner. Dette er den største semantiske integrationsflade og bør ikke cherry-pickes filvist uden review. |
| Database/Storage Rules | `firebase.rules.json`, `storage.rules` | Tenant-, modul- og permissionkontroller, validering, indeks samt server-only dokumentstier. |
| Firebase testkonfiguration | `firebase.procure-auth.json`, `firebase.procure-suite.json` | Lokale emulatorporte; ikke produktionskonfiguration. |
| Dependencies/locks | `functions/package.json`, `functions/package-lock.json`, rodens `package.json` | Functions tilføjer `qrcode` 1.5.4 og opdaterer Functions-lockfilen. Rodpakken får kun PROCURE-scripts; rodens lockfil er uændret. |
| Repositorymetadata | `.gitattributes`, `README.md` | PDF-binærhåndtering og lokale PROCURE-/emulatoroplysninger. |

## 4. Routes, navigation og adgang

Fælles router eksponerer `/indkoeb` og `/indkoeb/*`. Det interne modul håndterer:

- `/indkoeb`: overblik.
- `/indkoeb/bestillinger`, `/indkoeb/bestillinger/ny`, `/indkoeb/bestillinger/:id` og `/indkoeb/bestillinger/:id/send`.
- `/indkoeb/katalog`, `/indkoeb/godkendelser`, `/indkoeb/modtagelser` og `/indkoeb/modtagelser/:id`.
- `/indkoeb/lager`, `/indkoeb/forbrug` og `/indkoeb/forbrug/varegrupper`.
- `/indkoeb/mobil`, `/indkoeb/mobil/kurv`, `/indkoeb/mobil/mine`, `/indkoeb/mobil/scan`, `/indkoeb/mobil/scan/:id`, `/indkoeb/mobil/qr-maerkater`, `/indkoeb/mobil/modtag` og `/indkoeb/mobil/modtag/:reference`.
- `/indkoeb/opsaetning` samt kompatibilitetsredirects fra `behov`, `varer`, `statistik`, `arkiv` og `varelager`.

Synlig hovednavigation kræver tenantens aktive modul `indkoeb` og `indkoeb.laes`. Modulet afviser læsning uden `indkoeb.laes`; skrivehandlinger kræver `indkoeb.skriv`; linjegodkendelse kræver `indkoeb.godkend`; PROCURE-stamdata/budget kræver `brugere.skriv`. Krypterede webshopoplysninger kræver `leverandoerer.skriv` ved oprettelse og enten ansvarlig indkøber eller leverandøradministrator ved læsning. Fælles Leverandører og Fakturacenter åbnes i deres egne platformkontekster og bruger deres egne permissions.

QR-links giver ingen ekstra adgang. Den eksisterende loginmekanisme bevarer den fulde ønskede URL og returnerer brugeren til varen eller den interne modtagelsesreference efter almindeligt login.

## 5. Serverfunktioner, lagring, regler og migration

### Callables og HTTP-funktion

Følgende PROCURE-relaterede exports findes i `functions/index.js`:

- Lokal testfiltransport: `procureLokalStorage` (HTTP; kun lokal emulatoranvendelse).
- Mail/PDF: `ordreMailSend`.
- Mobilkladde og delindsendelse: `procureMobilKladdeHent`, `procureMobilKladdeGem`, `procureMobilKladdeDelIndsend`.
- Godkendelse: `procureGodkendelseslinjerAfgor`.
- Opsætning: `procureOpsaetningHent`, `procureStamdataGem`, `procureBudgetGem`.
- Hylde-QR: `procureQrMaerkatOpret`, `procureQrMaerkatStatus`, `procureQrMaerkatListe`, `procureQrMaerkatHent`.
- Webshop: `procureWebshopCredentialGem`, `procureWebshopCredentialHent`, `procureWebshopBestillingRegistrer`.
- Modtagelse/bilag: `procureModtagelseUploadInitier`, `procureModtagelseUploadBekraeft`, `procureModtagelseDownloadLink`, `procureModtagelseRegistrer`, `procureModtagelseKorriger`.
- Retur: `procureVareReturneringRegistrer`.
- Faktura: `procureFakturaImport` samt de fælles `fakturamatch`, `fakturastatus` og `fakturadestination`.
- Allerede foretaget køb/bilag: `procureKoebRegistrer`, `procureKoebBilagUploadInitier`, `procureKoebBilagUploadBekraeft`, `procureKoebBilagDownloadLink`.
- Lager: `procureLagerBevaegelse`.

Alle forretningsfunktioner udleder tenant og bruger fra auth-tokenet og kontrollerer aktivt abonnement, modul og relevant permission på serveren. Revisioner, idempotensnøgler og transaktioner beskytter de dokumenterede samtidigheds- og retry-forløb.

### Data og tenantadskillelse

PROCURE genbruger tenanttræet og udvider det additivt med blandt andet `indkoebsbehov`, `indkoebsordrer`, `procureMobilKladder`, `procureGodkendelsessager`, `procureOpsaetning`, `procureQrMaerkater`, `forbrugsvarer`, `forbrugsvarebevaegelser`, fælles `leverandoerer`, fælles `fakturaer` og `dokumentkvote/procureBilag`. Historiske ordrelinjer beholder snapshots af varenummer, varegruppe, afdeling, enhed, pakningsfaktor og prisgrundlag.

Database Rules indeholder indeks for de nye querymønstre, herunder godkendelsesstatus/tid/afdeling, QR-vare/aktiv/ændringstid, varenavn/varenummer, varebevægelse/vare/tid og fakturaens `kreditererFakturaId`. Den seneste isolerede handlerkørsel loggede alligevel emulatoradvarsler om QR-ændringstid og kreditfakturareference, selv om de aktuelle regler indeholder indeksene. Regelindlæsning/config bør kontrolleres i integrationsmiljøet før pilot; de lokale assertions bestod.

### Filer

Storage-stier er tenantafgrænsede og lukkede for direkte klientadgang:

- `tenants/{tenantId}/indkoebsordrer/{ordreId}/revisioner/{revision}/ordre.pdf`.
- `tenants/{tenantId}/indkoebsordrer/{ordreId}/modtagelser/{modtagelseId}/dokumenter/{dokumentId}`.
- `tenants/{tenantId}/procureKoeb/{koebId}/dokumenter/{dokumentId}`.

Callables udsteder kontrollerede upload-/downloadlinks. PDF/JPEG/PNG kontrolleres for tilladt MIME-type, størrelse og magic bytes, før metadata bliver aktive. Et fejlet upload vises ikke som færdigt bilag. Ordre-PDF gemmes pr. godkendt ordrevision og regenererer eller overskriver ikke et eksisterende arkivobjekt.

### Krypterede oplysninger

Webshoplogin gemmes uden for det læsbare tenanttræ under `procureHemmeligeOplysninger/{tenantId}/{leverandoerId}` som AES-256-GCM-krypteret payload. Kortnummer og CVV accepteres ikke. Audit indeholder ikke klarteksthemmeligheder.

### Migration

Der er ingen destruktiv datamigration og intet produktionsmigrationsscript i checkpointet. Modellerne er additive og normaliserer ældre data ved læsning. Nødvendige integrations-/pilottrin er:

1. Deploy af de gennemgåede Functions, Database Rules, Storage Rules og Functions-dependencies som én koordineret version.
2. Aktivér tenantmodulet `indkoeb` og tildel eksisterende permissions/roller; opret ikke parallelle claims.
3. Konfigurér kundens afdelinger, leveringssteder, varegrupper, leverandørbestillingsdata, fakturamail og godkendelsesregler.
4. Ved aktivering af lagerstyring for en eksisterende vare skal ukendt startbeholdning håndteres med en eksplicit startoptælling; historik må ikke opfindes.
5. Verificér indeksene i det valgte Firebase-projekt efter rule-deploy.

## 6. Miljøkonfiguration

Kun variabelnavne og formål er angivet; ingen hemmelige værdier er læst eller gengivet.

| Variabel | Formål |
| --- | --- |
| `VITE_FB_API_KEY`, `VITE_FB_AUTH_DOMAIN`, `VITE_FB_DB_URL`, `VITE_FB_PROJECT_ID`, `VITE_FB_APP_ID` | Klientens Firebase-projektkonfiguration. |
| `VITE_FB_MILJOE`, `VITE_NETLIFY_CONTEXT` | Miljømærkning i klienten. |
| `VITE_FIREBASE_EMULATORS`, `VITE_FIREBASE_EMULATOR_PREVIEW` | Eksplicit aktivering af lokale emulatorer/preview; må ikke sættes som produktionsgenvej. |
| `VITE_FB_AUTH_EMULATOR_PORT`, `VITE_FB_DATABASE_EMULATOR_PORT`, `VITE_FB_FUNCTIONS_EMULATOR_PORT` | Lokale, konfigurerbare emulatorporte. |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_AFSENDER` | Serveropbevaret mailtransport. |
| `MAILGUN_API_BASE` | Valgfri server-endpointoverride til mailadapter/testmiljø. |
| `PROCURE_WEBSHOP_KEY` | Firebase Secret med 32-byte nøglemateriale til webshopcredentials. |
| `PROCURE_WEBSHOP_KEY_LOCAL` | Kun lokal emulatorfallback; må ikke anvendes i produktion. |
| `FIREBASE_CONFIG`, `GCLOUD_PROJECT`, `FUNCTIONS_EMULATOR`, `FIREBASE_STORAGE_EMULATOR_HOST` | Functions/Firebase-runtime og lokal emulatorrouting. |

QA-scripts bruger derudover `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_DATABASE_EMULATOR_HOST`, `FIREBASE_FUNCTIONS_EMULATOR_HOST`, `PROCURE_AUTH_QA_PASSWORD`, `PROCURE_AUTH_QA_URL`, `PROCURE_QA_URL`, `PROCURE_INVENTORY_QA_URL`, `PROCURE_QA_PDF_OUTPUT`, `EDGE_PATH`, `PDFTOPPM`, `PROCURE_QR_PYTHON` og `PROCURE_QR_PYTHONPATH`. De er testværktøjskonfiguration, ikke produktionskrav. Repoets eksisterende udviklings-loginvariabler er ikke en del af det autoriserede PROCURE-bevis.

## 7. Status på centrale forløb

| Forløb | Implementeret | Faktisk verificeret | Grænse/rest |
| --- | --- | --- | --- |
| Mobil/QR → behovsliste → valgte linjer | Servergemt kurv, søgning, hylde-QR, eksplicit `Tilføj`, delvis indsendelse og offlineværn. Scanning alene ændrer ikke antal. | Almindeligt Auth-emulatorlogin i to sessioner; passiv scan 0→0, aktiv tilføjelse 0→1; 5 af 10 linjer sendt og 5 bevaret; tenantafvisning. | Fysisk mobilkamera er ikke afprøvet. |
| Delvis godkendelse | Godkend, udskyd, send retur eller afvis pr. linje; delmængde; obligatorisk begrundelse; kun godkendt mængde danner ordre. Hele oprindelige grundlag bevares mod tærskelomgåelse. | 6/10 godkendt i browser; backend godkendte senere 2 mere, så 8 blev bestilt og 2 ventede; retry gav kun ét ordreoutput; manglende godkenderret blev afvist. | Ingen kendt lokal kodemangel. |
| Mailordre | Godkendt revision, aktiv Send-handling, idempotent transport, ukendt status ved tvetydigt transportsvar og særskilt leverandørbekræftelse. | Kontrolleret lokal transport inspicerede den faktiske multipart-payload og blev kaldt én gang. | Mailgun/kundens afsender er ikke produktionskonfigureret eller liveafprøvet. |
| Webshop/firmakort | Krypteret credentialadgang, manuel åbning/registrering af webshopreference, firmakortstatus uden kortdata og fortsat økonomiopfølgning. Webshopordre udløser ikke ekstra mail. | Krypteret emulatorroundtrip, køber-/tenantafvisning, audit, retry, browseråbning uden statusændring og syntetisk firmakortregistrering. | Ingen leverandør-API, bank, kortudbyder, betaling eller refundering er tilsluttet. |
| Delmodtagelse og afslutning | Flere leverancer, accepteret/beskadiget/afvist, rest, bilag, korrektion, fysisk retur og lagerbevægelse én gang. | 72/120 tape og 80/80 film, senere resterende 48 tape; to bilag genåbnet; retry, samtidighed, stale revision og fremmed tenant afvist. | Fysisk returtransport og OCR er ikke tilsluttet. |
| Ordremail og PDF | Inter Regular/Bold er indlejret. Side 1: bestiller/leverandør → levering → fakturering → varer. Fortsættelsessider har PO og tabelhoved. Ingen priser eller modtagelses-QR i nye leverandørdokumenter. Arkiv er revisionslåst. | Tre aktuelle PDF-eksempler; flerside 42 linjer/4 sider; danske tegn og sideskift kontrolleret. Preview, vedhæftning og arkiv havde identisk SHA-256 `004600f29bf15f71ffdfdc1c4a122e22dc9ce82fd7a49dc7189ff05ceb2bcf42`. | Produktionsmail ikke sendt. Ældre arkiverede PDF'er med QR er historiske og forbliver uændrede. |
| Fakturacenter | PO-/ordrelinjereference, import, trevejsmatch, delfaktura, prisafvigelse, kreditnota, dubletværn og nettoforbrug bruger fælles fakturadata/functions. | Samlet handlerflow gav ordre 8.880 kr., første modtagelse 7.728 kr., delfaktura 7.872 kr., afvigelse/kredit 144 kr., restfaktura 1.152 kr. og netto 8.880 kr. uden dobbelttælling. | Backendforbindelsen er emulatorverificeret. Produktionsimport/OCR/bogføring/betaling er ikke tilsluttet; intern godkendelse er ikke bogføring. |
| FLEET/FACILITY | Behovs-/ordrelinjer kan bære stabile referencefelter, og fakturadestinationens fælles kontrakt understøtter destinationstyper. | Domæne-/kontrakttests bevarer referencer. | Ingen fuld, autoriseret browserprøve mod faktiske FLEET-/FACILITY-entiteter og ingen dokumenteret bidirektionel liveforbindelse. Dette er en aftalt kontrakt, ikke en produktionsverificeret integration. |

## 8. Testgrundlag

### Aktuelt produktcheckpoint `4f613bdd…`

Seneste ændring efter lager-/købsflowet vedrører ordre-PDF, faktureringsplacering og Inter. Følgende blev kørt på det aktuelle produktcheckpoint:

```powershell
npm run procure:pdf-samples
node --test test/bestilling.test.mjs test/procure-followup.test.mjs test/skive4d-ordremail.test.mjs test/functions-delt.test.mjs
node functions/test/procure-callables.integration.mjs
npm run lint -- --quiet
npm run build
npm run test:design
```

Resultat:

- 119/119 målrettede ordre-, mail-, PDF- og Functions-regressionstests bestod.
- Callable-integrationen afsluttede med `ok: true`, tenantadskillelse, QR-idempotens, genåbnede bilag, én transportkald og ovenstående 8.880/7.728/7.872/144/1.152-beløb.
- 11/11 designtests bestod.
- ESLint og produktionsbuild bestod. Builden advarede om en PROCURE-chunk på ca. 1.409 kB (ca. 601 kB gzip), primært fordi fulde Inter-fontfiler indlejres til PDF; det er ikke en buildfejl.
- `pypdf` fandt fire sider, indlejret `/Inter-Regular` og `/Inter-Bold`, danske tegn, PO på tre fortsættelsessider og tabelhoved på alle fire sider.

### Gyldige tidligere runtime-/browserbeviser, som indgår i produktcheckpointet

Senere commits efter disse beviser ændrer ordre-PDF/mail og dokumentation, ikke de beskrevne lager-/købsskærme eller deres domænelogik. Derfor er resultaterne genbrugt og ikke kunstigt genkørt til denne rapport.

- Lagerkodecommit `c36f8b69d0670fb58cf8636e18d0e9fa540ad946`: 70/70 målrettede tests, 11/11 design, 4.349/4.349 platform/rules, Auth/Functions/Database/Storage-flow og browser ved 360/390/1440 px. To sessioner, retry, stale revision, atomisk fejl og tenant/permissionafvisning indgår.
- Varelager-/købskodecommit `39dd9f25891ca32348593d80b80180052a3e91c6`: 83/83 målrettede tests, 4.354/4.354 platform/rules via kompatibel lokal Firebase CLI/Java, to autoriserede sessioner, kvitteringsbytes genåbnet, faktisk CSV og browser ved 360/390/1440 px.
- Faktisk CSV for materialeforbrug: periode 2026-09-01–2026-09-30, 12 liter og SHA-256 `df3e3e4212b779d99f5054da8d20331bdb2441f828a71229ebc09c07500f5b2d`.
- Lagerbrowserkvitteringen ender på 66 ruller efter optælling 68→66. Det særskilte længere backendflow fortsætter med forbrug, flytning og retur og ender på 64 ruller. Tallene beskriver forskellige stopsteder og er ikke en afvigelse.

Den aktuelle dokumentationskontrol fandt kendt, ældre whitespace i to eksisterende rapportfiler. Der er ikke ændret produktkode for at rense historiske rapportdetaljer.

## 9. Eksterne forbindelser – præcis status

| Forbindelse | Status ved checkpoint |
| --- | --- |
| Firebase Auth, Realtime Database, Storage og Functions | Implementeret og verificeret samlet i lokale emulatorer med almindeligt password-login og signerede claims. Ikke deployet i produktion. |
| Mail | Mailgun-adapter implementeret. Multipart, PDF og idempotens er verificeret med kontrolleret lokal transport. Ingen rigtig leverandørmail og ingen produktionscredentials. |
| Webshop | Krypteret adgang og intern registrering er emulatorverificeret. Ingen generisk ekstern webshop-API; brugeren åbner leverandørens HTTPS-side og registrerer resultatet. |
| Fakturacenter | Fælles datamodel og backendfunktioner er sammenhængende emulatorverificeret. Produktions-OCR/import, bogføring og betaling er ikke verificeret. |
| Bilag | Tenantafgrænset Storage-flow er emulatorverificeret med identiske downloadbytes. OCR er ikke tilsluttet. |
| Firmakort/bank | Kun intern betalingsform/status og dokumentation. Ingen kortdata, betaling, bank- eller refunderingstilslutning. |
| FLEET/FACILITY | Referencekontrakt og felter findes; ingen dokumenteret liveintegration mod modulernes entiteter. |
| QR/kamera | QR-generering, software-/browserflow og adgang er verificeret. Fysisk mobilkamera er ikke afprøvet. |

## 10. Forventede integrationskonflikter og håndtering

Der er ingen aktuelle tekstkonflikter, men følgende semantiske konflikter forventes, hvis integrationsbranchen udvikler sig efter dette checkpoint:

1. **`src/App.jsx`, `src/fleet/nav.js`, `src/fleet/modulfaner.js`**: behold fælles router-/navstruktur og fold PROCURE-ruter ind én gang. Undgå både gammel og ny indkøbsrouter samtidig.
2. **`src/fleet/AppShell.jsx`, `src/fleet/fleet.css`**: ejerreview sidehoved, miljøbanner, sidebar `box-sizing` og mobil navgrupper på alle moduler. PROCUREs lokale CSS skal forblive navnerumsafgrænset.
3. **`functions/index.js`**: integrér callables som en samlet kontrakt med delte domænefiler. Bevar nyere fælles Fakturacenterfunktioner, permissions og exports; undgå at erstatte filen en gros.
4. **`firebase.rules.json`, `storage.rules`**: sammensmelt additive noder og indeks. Kør hele rulesuiten og en tenant-negativ test efter sammenlægning. Kontroller at produktionens valgte Firebase-konfiguration faktisk indlæser disse rules.
5. **`src/firebase.js`**: behold eksisterende produktionsinitialisering; emulatorrouting må kun aktiveres eksplicit og må ikke blive en login-/tenantgenvej.
6. **Leverandør/faktura-kontrakter**: fælles stamdata og Fakturacenter er autoritative. Eventuelle nyere felter fra integration skal merges additivt med PROCUREs ordre-/matchreferencer.
7. **`functions/package-lock.json`**: regenerér kun med projektets aftalte Node/npm-version efter en semantisk merge af `qrcode`; undgå manuel konfliktløsning i lockfilen.
8. **Sporede outputfiler**: beslut i integration, om syntetiske beviser skal blive i Git eller flyttes til et artefaktarkiv. De må ikke importeres til kundedata eller deploymentbundles.

Anbefalet integrationsrækkefølge er: opdatér integrationsworktreet, merge/cherry-pick hele overleveringscheckpointet, løs fælles filer områdevis med deres ejer, installer Functions-lockfilen uændret eller regenerér deterministisk, kør rules/tests/build, og først derefter foretag miljøspecifik konfiguration. Denne rapport udfører ingen af disse handlinger.

## 11. Åbne punkter klassificeret

### Blokerer sammenlægning

- Overleveringscheckpointet findes ikke på GitHub. En integrator skal have adgang til det lokale Git-objekt eller foretage et særskilt, godkendt push, før en fjern-PR eller serverbaseret merge kan udføres.
- Obligatorisk ejerreview og samlet konfliktløsning af fælles router, AppShell, navigation, Functions, Rules og lockfil mangler. Dette er en integrationsgate, ikke en kendt funktionsfejl.

Der er ellers ingen kendt lokal testfejl eller aktuel tekstkonflikt, der blokerer et lokalt integrationsforsøg.

### Blokerer kundepilot

- Produktions-Firebase-projekt, Functions, Database/Storage Rules, modulaktivering og rolle-/permissionmapping er ikke deployet eller prøvet i pilotmiljø.
- Kundens leverandørdata, fakturamail, leveringssteder, afdelinger, varegrupper, godkendelsesregler og eventuelle lager-startoptællinger skal konfigureres og valideres.
- Hvis mailordre indgår i piloten: Mailgun-secret/domain/afsender, offentlig app-URL samt en kontrolleret end-to-end test i pilotmiljø skal være på plads.
- Indeksadvarslen fra den isolerede emulator skal forklares ved kontrol af faktisk rule-loading, selv om indeksene findes i den committede fil.
- Autoriserede smoke-tests skal gentages efter den faktiske sammenlægning, fordi nuværende browser-/emulatorbeviser er fra PROCURE-worktreet, ikke integrationsworktreet.
- Hvis QR-scanning er pilotskritisk: fysisk kamera/login-retur på de valgte iOS-/Android-browsere skal afprøves.
- Hvis FLEET-/FACILITY-valg er pilotskritisk: den fælles entitetsvælger og referenceadgang skal verificeres i det sammenlagte program; nuværende bevis dækker kun kontrakten.

### Kan udvikles videre efter sammenlægning

- OCR af kvitteringer, følgesedler og fakturaer.
- Leverandørspecifik webshop-API/automation; nuværende flow er kontrolleret ekstern åbning plus intern registrering.
- Bank-, kort-, betalings-, refunderings- og regnskabseksportintegration.
- Automatisk leverandørbekræftelse/ETA.
- Regnearksformat ud over CSV og yderligere analyse-/rapportfunktioner.
- Lazy loading/font-subsetting for at reducere PROCURE-chunkens størrelse.
- Flytning af store syntetiske beviser ud af Git, hvis fælles repositorypolitik kræver det.

## 12. Checkpointkontrol

Før dokumentationscommittet blev branchdiffen kontrolleret for private-key-markører, kendte API-nøglemønstre, live betalingsnøgler og GitHub-tokens. Der blev ikke fundet et virkeligt hemmeligt materiale. Den eneste konkrete `MAILGUN_API_KEY`-tildeling i testkoden er den eksplicit syntetiske værdi `syntetisk-noegle`; `.env.example` er den eneste sporede env-fil. Ikke-sporede reviewmapper er ikke staged.

Produktcheckpoint: `4f613bdd41632629717e93247f8d9dc7a3ea534b`

Overleveringscheckpoint: committet, der indeholder denne fil; fuldt id rapporteres i den afsluttende overlevering

GitHub-verificering af PROCURE-checkpoint: nej

Merge, push, deployment, produktionsmigration og rigtig mail: ikke udført
