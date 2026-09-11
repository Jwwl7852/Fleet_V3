# Veyro ejerkonsol — V6 lokal gennemgang

Dato: 2026-09-11

Worktree: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`

Branch: `codex/ejer-integrated-development`

Verificeret udgangspunkt: `4c0108935337fda6ccde1d011916d1d27820a634`

Kode- og capturecheckpoint: `a753a13ef16080f08d0296284c7b780e2f36acdf`

Preview: `http://127.0.0.1:5211/login`

## Resultat og afgrænsning

V6-rettelserne er implementeret i det isolerede ejerspor. V5-forbedringerne er
bevaret: menugrupper kan fortsat foldes sammen på en aktiv underside,
accepterede tilbud er låste, mailkladder bevares ved mobilnavigation, og
aftalte, målte og håndhævede antal er fortsat forskellige oplysninger.

Den nye tilbudsflade har tre sammenhængende arbejdsområder, lokal AI viser
kundevendt tekst før eksplicit indsættelse, pilotdatoer hænger sammen, og
rapporter viser bindende modulkøb, korrekt hitrate og kendte delmålinger med
datadækning. Mailworkerens sidste serverbeslutning ligger efter jobreservation
og umiddelbart før Microsoft Graph-token/transport.

Alle viste virksomheder, personer, mails, priser, dokumenter og hændelser er
syntetiske emulatorfixtures. Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er
**Ikke tilsluttet**. Der er ikke sendt rigtig mail, overført kundedata til AI,
bogført, pushet, merget eller deployet.

## Detaljeret V6-acceptmatrix

| ID | Status | Implementeret | Konkret verifikation |
| --- | --- | --- | --- |
| V6-01 | Implementeret, funktionelt og visuelt verificeret | Testadaptermærke, titel og brødtekst har egne layoutområder. Ansvarlige vises som profilnavn eller `Ikke tildelt`. | `interaction-verification.json` registrerer nul overlap ved 1440×900, 1920×1080 samt 1440×900 ved 125 % zoom og lang tekst. Se `01-*`. |
| V6-02 | Implementeret og lokalt verificeret | Tilbud viser kunde, nummer, version og status samt fanerne **Sammensæt løsning**, **Tilbudstekst** og **Dokument**. Ratekilde, interval, enhed og antal er adskilt. En ny v3 arver v2-grundlaget; accepteret v2/PDF forbliver låst. | V6-kontrakttest består. Browserkontrollen finder ingen kladde-, AI-indsæt- eller ratebladsredigering i accepteret visning. Se `10-*` og `11-*`. Vedvarende versionslås dækkes fortsat af de eksisterende tilbuds-/ejerflowtests. |
| V6-03 | Implementeret og lokalt verificeret; ekstern model ikke verificeret | Den deterministiske lokale adapter laver konkret kundetekst og kopierer ikke sælgerinstruksen. Indsættelse er eksplicit og rører ikke økonomifelter. Efter manuel ændring markeres forslaget forældet og indsæt-handlingen deaktiveres. | Domæne- og kontrakttest består; `interaction-verification.json.aiStale` er `true/disabled`. Se `11-*` og `11a-*`. OpenAI er ikke tilsluttet. |
| V6-04 | Implementeret og funktionelt verificeret | Automatisk evaluering er 14 dage før pilotslut, dog aldrig før start. Manuel dato bevares med advarsel uden for intervallet. Pilot og vejledende drift er separate faser. | Enhedstest består for månedsslut og skudår. Den sammenhængende reviewfixture ses i `11b-*`. Ingen vejledende drift aktiveres eller faktureres automatisk. |
| V6-05 | Implementeret, funktionelt og visuelt verificeret på syntetisk datasæt | **Mest solgte moduler** bruger accepterede, låste linjer, deduplikerer kunde/modul/version og skelner drift fra pilot. Hitrate bruger 104/(104+26)=80 %. Rapporten læser samme målte konto-data som kundekontoen og viser kendte delsummer, dækning og måletidspunkt. | Moduldeduplicering og pilot/drift består i enhedstest. `06-*` viser Fleet som solgt driftsmodul, 80 %, administrative 2/10 og operative 3/60. Eksterne/historiske produktionsdata er ikke afstemt. |
| V6-06 | Implementeret, funktionelt og visuelt verificeret | Mobil har ét postkassevalg, én søgeadgang og samlede filtre med aktivt antal. Samtale er et fokuseret trin. | `15-*` ved 360×800 viser mindst to komplette rækker uden indledende scroll. `16-*`/`17-*` viser samtale. Målefilen viser intet vandret overflow og `mobilKladde.bevaret=true`. |
| V6-07 | Implementeret og visuelt verificeret | Fælles gemmedialog viser objektet og kun ændrede felter som før → efter; primær handling er **Bekræft og gem**. Ingen ændring giver intet gemmeforløb. X, Annullér/Fortsæt redigering og ESC skriver ikke. | Kontrakttest og eksisterende dialog-/revisionsregression består. `13b-*` viser leverandørens konkrete e-mailændring. Serverkonflikt kan ikke fremkaldes i et screenshot, men eksisterende revisionskontrol bevares. |
| V6-08 | Implementeret og serverlogisk verificeret; ekstern transport ikke verificeret | Worker genlæser tråd, kladde, godkendelse, opfølgning og relevant tilbudskæde efter reservation og før Graph-token. Accept, afvisning eller ny kundemail stopper jobbet; support følger sin egen godkendelse. Idempotens og ukendt udfald bevares. | Den deterministiske beslutnings-/kontrakttest består for accept/ny aktivitet og uafhængig support. `05-*` viser stoppet opfølgning. Graph er ikke kaldt. Når transporten allerede har accepteret en mail, kan konsollen ikke standse eller tilbagekalde den. |
| V6-09 | Funktionelt verificeret | Den faktiske CDP-wheelprøve måler liste, samtale, AI-panel og dokument før/efter hver handling samt top/bund. | Ved både 1440×900 og 1920×1080 flytter kun målområdet sig; alle 8 panelprøver har `isolationOk=true`. Fuld positions- og grænsetabel ligger i `interaction-verification.json`. |
| V6-10 | Implementeret, automatisk og visuelt verificeret | Fladerne bruger de fælles semantiske tokens og forståeligt brugersprog. Foldning, mobil-ESC/fokusretur og låst tilbud er bevaret. | Designkontrakten består 11/11. Beregnede browserstyles: Inter Variable indlæst, 14 px/20,3 px, sidebar 216 px, kort 12 px og knap 42 px. Se `browser-style-verification.json`, `14-*`, `19-*` og `20-*`. |

## Revideret vurdering af V5 og R01–R20

- V5 V02/R08–R09 er udvidet: der er nu en sidste serverkontrol efter
  jobreservation. Det lokale bevis dækker beslutningen og kaldsrækkefølgen, men
  ikke en rigtig Microsoft Graph-transport.
- V5 V03/R15 er præciseret: den lokale AI-adapter er funktionelt verificeret;
  ekstern OpenAI-modelkvalitet er ikke verificeret.
- V5 V07/R05 er erstattet af den fulde firepositionsmåling ved begge
  desktopstørrelser og ikke blot en enkelt panelscroll.
- V5 V10 er ændret fra efterspørgsel til faktiske, accepterede modulkøb. Den
  viste måleafstemning gælder den syntetiske reviewkonto; datadækning vises,
  hvor ikke alle konti har målinger.
- De øvrige V5- og R01–R20-punkter er regressionstestet i den afgrænsede
  V5/V6-suite. Historiske vurderinger er bevaret; denne sektion er den nyere,
  mere præcise vurdering ved overlap.

## Screenshots og målefiler

Alle 24 PNG-filer er faktiske browseroptagelser fra normalt Auth-emulatorlogin.
Ingen PNG-filer er byte-identiske. `capture-manifest.json` binder hver fil til
route inklusive query, viewport, fixture/tilstand og kodecheckpoint
`a753a13ef16080f08d0296284c7b780e2f36acdf`.

| Filer | Route/query | Viewport og tilstand |
| --- | --- | --- |
| `01-overblik`, `01b-*`, `01c-*` | `/main` | 1440×900, 125 %/lang tekst og 1920×1080 |
| `02-mail-*` | `/main/mail/indbakker` | 1440×900, fælles syntetisk kundesag |
| `04-support` | `/main/support` | 1440×900, samme tråd vist som support |
| `05-opfoelgning-*` | `/main/mail/opfoelgning` | 1440×900, **På pause** efter accept |
| `06-rapporter-*` | `/main/rapporter` | 1920×1080, drift, 80 %, modulkøb og målinger |
| `07-*`, `09-*` | `/main/kunder/flow-tenant?fane=forbrug` | 1440×900 og 1920×1080 |
| `08-*`, `18-*`, `19-*` | `/main/kunder/flow-tenant?fane=obd` | 1440×900 og 899×900; OBD og mobilnav |
| `10-*`, `11-*`, `11a-*`, `11b-*` | `/main/salg/tilbud` | 1920×1080; låst v2, AI, stale AI og pilot v3 |
| `12-bilag-*` | `/main/oekonomi/bilag` | 1440×900, lokal bilags-/mobilkameravisning |
| `13-*`, `13b-*` | `/main/indstillinger/leverandoerer` | 1440×900, oversigt og ændringsdialog |
| `14-integrationer` | `/main/integrationer` | 1920×1080, alle eksterne adaptere frakoblet |
| `15-*` | `/main/mail/indbakker` | 360×800, kompakt liste |
| `16-*`, `17-*` | `/main/mail/indbakker?sag=review-nordlys` | 360×800 og 390×844, samtale/kladde |
| `20-pipeline-*` | `/main/salg/pipeline` | 1440×900, Salg sammenfoldet på aktiv Pipeline |

`browser-style-verification.json` indeholder de beregnede styles og fontstatus.
`interaction-verification.json` indeholder koordinater, overlapkontrol,
panelpositioner, scrollgrænser, mobilkladde, tilbudslås og stale AI-kontrol.
Dokumentationscommittet ligger efter capturecheckpoints og oplyses som endelig
lokal HEAD sammen med ZIP-afleveringen.

## Genkørt verifikation

| Kontrol | Resultat |
| --- | --- |
| `node --test --test-concurrency=1 test/ejer-v6-regler.test.mjs test/ejer-v6-accept.test.mjs test/ejer-v5-accept.test.mjs test/design-tokens.test.mjs` | 26/26 bestået, heraf design 11/11 |
| Målrettet ESLint på ændrede ejer-, server-, capture- og testfiler | Bestået |
| `npm run build` | Bestået med Vite 5.4.21 og 532 moduler |
| Normal login og browsercapture | Bestået mod `demo-veyro-owner` |
| Viewports | 360×800, 390×844, 899×900, 1440×900 og 1920×1080 |

Repositoryets brede `npm run lint` er fortsat blokeret af det allerede kendte,
uvedkommende FACILITY-hul: `facility-v2/eslint.config.js` kan ikke indlæse
`@eslint/js`. Dependencies eller andre modulspor er ikke ændret for at skjule
det. V6-filerne består den målrettede lint.

## Lokal gennemgang

1. Åbn `http://127.0.0.1:5211/login` og kontrollér projektet
   `demo-veyro-owner`.
2. Den git-ignorerede `.env.owner-emulator.local` forudfylder en syntetisk,
   tenantløs ejer. Vælg **Log ind**; kopier ikke oplysningerne ud af formularen.
3. Gennemgå især **Tilbud**, **Rapporter**, **Mail → Indbakker**, **Mail →
   Opfølgning**, **Support**, **Kunder → Administrér kundekonto**,
   **Leverandører** og **Integrationer**.
4. Under **Salg → Pipeline** kan Salg foldes sammen og åbnes igen uden at
   forlade Pipeline.

Preview og emulatorer er efterladt kørende til lokal gennemgang.

## Reproducerbart lokalmiljø

| Del | Faktisk anvendt version |
| --- | --- |
| Firebase CLI | 13.35.1 fra den dokumenterede lokale npx-cache |
| Emulator-Java | Temurin OpenJDK 11.0.32.1+1 |
| Kontrol-Java | Temurin OpenJDK 21.0.12.1+1 er tilgængelig, men ikke den kompatible V5/V6-emulatorvej |
| Node, emulatorer/fixtures | 20.20.2 |
| Node, normal shell/capture | 24.19.0 |
| npm | 11.17.0 |
| Vite | 5.4.21 |

Den vellykkede startkommando og alle porte står i
`docs/VEYRO_EJERKONSOL_GENNEMGANG_V1.md`. Den bruger den isolerede Node 20,
JDK 11, CLI 13.35.1, `demo-veyro-owner`, Auth 9099, Database 9000, Functions
5001, Storage 9199 og preview 5211. JDK 21/nyere CLI blev ikke gjort til et
lokalt krav, fordi CLI 15 tidligere ramte den dokumenterede AF_UNIX-fejl på
denne Windows-maskine. Ingen global installation er ændret.

## Resterende ekstern opsætning

- Microsoft 365: verificér den underliggende type for
  `info@veyrosystems.com`, Entra-app, mindst mulige mailbox-scopes, Send As,
  delta/webhooks og syntetisk Inbox/Sent/ukendt-udfaldstest.
- OpenAI: serverhemmelighed, godkendt model, håndhævet budget og særskilt
  aktivering. Den lokale deterministiske adapter er ikke OpenAI.
- Dinero: testorganisation, OAuth/API og verificeret mapping.
- OCR og bilagsmail: leverandør, indgående adresse, retention og overvågning.
- Godkendt kommercielt rateblad/officielle priser og fysisk kameratest på en
  rigtig mobilenhed.

Disse forhold har ikke blokeret den isolerede V6-implementering. De tilhørende
statusser forbliver **Ikke tilsluttet**, indtil hver forbindelse er etableret og
verificeret.
