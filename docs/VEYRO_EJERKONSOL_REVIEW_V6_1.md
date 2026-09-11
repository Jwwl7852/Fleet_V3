# Veyro ejerkonsol — V6.1 lokal afslutning

Dato: 2026-09-11

Worktree: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`

Branch: `codex/ejer-integrated-development`

Verificeret V6-udgangspunkt: `ec42dadae41745b772dcff8c9f7de1f7160749b5`

Kodecheckpoints: `749791f54829e05f90f4dc498ff4d839efdab34c` og
`f7e3f45544ba13053658235bfe1b66c3b07ed56a`

Preview: `http://127.0.0.1:5211/login`

## Resultat og afgrænsning

De fire resterende V6.1-punkter er gennemført i det isolerede ejerspor. De
fungerende V5/V6-forbedringer er bevaret, herunder menufoldning på en aktiv
underside, låste accepterede tilbud, mobilkladder, kundekonto, supportvisning,
rapportering og skellet mellem aftalte, registrerede og håndhævede antal.

Alle viste virksomheder, personer, mails, priser, dokumenter og hændelser er
syntetiske emulatorfixtures. Microsoft 365, OpenAI, Dinero, OCR og bilagsmail
er **Ikke tilsluttet**. Der er ikke sendt rigtig mail, overført kundedata til en
ekstern AI, bogført, pushet, merget eller deployet.

## Detaljeret acceptmatrix

| ID | Status | Implementering | Verifikation og bevis |
| --- | --- | --- | --- |
| V6.1-01 | Bestået | Tilbudsfanen viser tilbudstekst og Veyro-assistent samtidigt i et 3fr/2fr-layout. Ved mobilbreakpointet er de to arbejdsområder særskilte paneler, og hovedfanerne passer nu ved 390 px. Den valgte kladdes eget rateblad bruges i stedet for stiltiende at skifte til dagsaktuelt rateblad. | Faktiske billeder `11e-*` ved 1440×900, `11f-*` ved 1920×1080 og `21-*` ved 390×844. `interaction-verification.json.mobilTilbud` viser bevaret kladde og intet vandret dokumentoverflow. Visuel efterkontrol bekræfter, at fanen **Dokument** ikke længere er afklippet. |
| V6.1-02 | Bestået | En separat v3-kladde arver accepteret v2-indledning, behov, løsningsbeskrivelse, linjer, rateblad og rabat. Lokal AI følger forløbet original → første forslag → sælgerinstruks → kortere revision → eksplicit indsættelse → gem/genindlæs. Sælgerinstruksen bliver ikke kundetekst, økonomifelter ændres ikke, og stale-forslag er blokeret. Pilotstart valideres mod tilbudsdato; evaluering beregnes 14 dage før slut, og pilot/vejledende drift forbliver separate faser. | `offer-workflow-result.json`: `arv=true`, `revideretErKortere=true`, `saelgerinstruksIkkeLaekket=true`, `struktureretOekonomiUaendret=true`, `v2SnapshotUaendret=true`. V2-PDF har samme SHA-256 før og efter: `8b13729c5e3c25175c17be9fdb65e2c12359c144f91061a6d58bf3ab5efe2517`. Billeder `11-*`, `11c-*`, `11d-*`, `11a-*` og `11b-*` dokumenterer trinene. |
| V6.1-03 | Bestået lokalt; Graph ikke aktiveret | Den worker, som produktions-callables bruger, er udskilt med injicerbar transport. Reservation, ny indlæsning af sag/tilbud og sidste validering sker før token/transport. Testhooken er en intern dependency og er ikke en callable eller offentlig bypass. Den optimistiske reservation håndterer Admin-SDK'ets indledende null-callback og bevarer serverens hash-/retry-beskyttelse. | Den faktiske worker er integrationstestet mod Database Emulator. `mailworker-integration-result.json`: accepteret=0 kald, afvist=0, ny kundemail=0, ældre accepteret v2 med nyere kladde=0, uafhængig support=1, to samtidige workers=1, ukendt udfald=1 og genforsøg=0. Stoppet status og årsag er vedvarende gemt. Ingen Graph-token eller ekstern transport blev kaldt. |
| V6.1-04 | Bestået | Bilagssøgningen bruger roligt feltudtryk og fælles fokusstandard. OBD viser teksten **Engangspris pr. OBD-enhed**. Tilbudshovedet viser ratebladets læsbare navn og version; teknisk nøgle ligger kun under detaljer. | `visible-control-measurements.json` måler bilagssøgningen til 330×39,75 px med 2 px `#22C2CF` outline og 2 px offset. Tilbudstekstfeltet måles med Inter, 14 px, 2 px fokus og synlig 658,59 px bredde ved 1440. Se også `08-*`, `12-*`, `11e-*` og `11f-*`. |
| V6.1-05 | Bestået | Manifestet binder alle optagelser til route/query, viewport, syntetisk datakilde og kodecommit. | 29 PNG-filer og seks JSON-bevisfiler ligger i `docs/screenshots/ejer-review-v6-1/`. `capture-manifest.json.codeCommit` er `f7e3f45544ba13053658235bfe1b66c3b07ed56a`. |
| V6.1-06 | Bestået med kendt repository-afgrænsning | V6.1 og de relevante V5/V6-regressioner, målrettet lint og produktionsbuild er kørt. | 39/39 automatiske tests består; emulatortestene for tilbud og mailworker består; målrettet ESLint har 0 fejl; Vite 5.4.21 bygger 532 moduler. Bred `npm run lint` er fortsat blokeret af det eksisterende, uvedkommende `facility-v2/eslint.config.js`, der ikke kan indlæse `@eslint/js`. Andre modulspor er ikke ændret. |

## Sammenhængende tilbudsforløb

Den accepterede version 2 er fortsat den bindende, låste version. Version 3 er
en separat kladde med arvet tekst og opsætning. Det lokale testforløb indsatte
den reviderede indledning, gemte kladden og genindlæste den fra emulatoren.
Samtidig blev version 2 genlæst og dens snapshot samt PDF-bytehash sammenlignet
før og efter. Begge er uændrede.

AI-forslagets første tekst var længere end den reviderede tekst. Den konkrete
sælgerinstruks blev kun brugt som lokal input og optræder ikke i det indsatte
forslag. Linjer, generel rabat, introduktionsrabat og rateblad-id havde samme
serialiserede værdi før og efter AI-forløbet. OpenAI blev ikke kaldt.

Pilotens start er sat efter tilbudsdatoen. Domænereglen afviser en start før
tilbudsdatoen, og de eksisterende kalenderprøver dækker månedsslut og skudår.
Den vejledende driftsfase vises separat og bliver ikke automatisk aktiveret
eller faktureret.

## Mailworkerens maskinlæsbare resultater

| Scenario efter reservation | Transportkald | Vedvarende resultat |
| --- | ---: | --- |
| Tilbud accepteret | 0 | `pauset`, `tilbud_accepteret` |
| Tilbud afvist | 0 | `pauset`, `tilbud_afvist` |
| Ny indgående kundemail | 0 | `pauset`, `godkendelse_forældet` |
| Accepteret v2 og nyere separat kladde | 0 | `pauset`, `tilbud_accepteret` |
| Uafhængigt godkendt supportsvar | 1 | `accepteret_af_graph` i lokal transportadapter |
| To samtidige workers | 1 | Én accepteret, én afvist ved reservation |
| Ukendt udfald efter transportgrænsen | 1 | `ukendt`; efterfølgende automatisk genforsøg afvist |

Statusnavnet `accepteret_af_graph` er produktionsmodellens eksisterende
statusværdi; i denne test betyder den kun, at den injicerede lokale transport
accepterede kaldet. Bevisfilen markerer eksplicit `eksternAfsendelse=false`.

## Browser, design og kontrolmål

- Inter Variable og Inter rapporteres indlæst af `document.fonts.check`.
- Brødtekst er beregnet til 14 px / 20,3 px (1,45 linjehøjde).
- Desktop-sidebar er 216 px, primære kort har 12 px radius, og de målte knapper
  har mindst 42 px højde.
- Bilagssøgningens aktive fokus er 2 px cyan med 2 px offset.
- Ingen af de målte 360, 390, 899, 1440 eller 1920 viewports har vandret
  dokumentoverflow.
- Uafhængig hjulscroll er fortsat bestået for liste, samtale, AI-panel og side
  ved både 1440×900 og 1920×1080.

De primære V6.1-optagelser er:

| Filer | Formål |
| --- | --- |
| `11c-*`, `11d-*` | Kortere revideret AI-forslag og eksplicit indsættelse |
| `11e-*`, `11f-*` | Gemt tilbudstekst og AI side om side ved begge desktopstørrelser |
| `11a-*` | Stale-forslag blokeret efter manuel ændring |
| `11b-*` | Fremtidigt pilotforløb med separat vejledende drift |
| `21-*` | Separate mobilpaneler, bevaret kladde og komplette hovedfaner |
| `12-*` | Bilagsfelt og lokale mobilbilagsmuligheder |
| `08-*` | OBD-opsætning med hardware/data adskilt |

## Testresultater

| Kontrol | Resultat |
| --- | --- |
| `node --test --test-concurrency=1` for design, V5, V6, V6.1 og tilbud | 39/39 bestået, heraf design 11/11 |
| `scripts/test-owner-flow-emulator.mjs` | Bestået: CRM → rateblad → tilbud v1/v2 → PDF → accept → aftale/kundekonto |
| `scripts/test-owner-v6-1-offer-emulator.mjs` | Bestået: arv, AI, gem/genindlæs og uændret v2/PDF |
| `scripts/test-owner-mailworker-v6-1-emulator.mjs` | Syv scenarier bestået mod faktisk worker og lokal transport |
| Målrettet ESLint på ændrede V6.1-filer | 0 fejl; CSS er uden for ESLint-konfigurationen |
| `npm run build` | Bestået med Vite 5.4.21 og 532 moduler |
| Normal login og browsercapture | Bestået mod `demo-veyro-owner` |

## Lokal gennemgang

1. Åbn `http://127.0.0.1:5211/login`.
2. Kontrollér, at siden viser projektet `demo-veyro-owner`.
3. Den git-ignorerede `.env.owner-emulator.local` forudfylder den syntetiske,
   tenantløse testejer. Vælg **Log ind**; kopiér ikke værdierne ud af formularen.
4. Gå til **Salg → Tilbud**, vælg den syntetiske Nordlys-sag og åbn den
   separate v3-kladde. Fanen **Tilbudstekst** viser 60/40-layoutet.
5. Gå til **Kunder → Administrér kundekonto → OBD** og derefter **Økonomi →
   Bilag** for de to øvrige V6.1-kontroller.
6. Se **Mail → Opfølgning** for den vedvarende stoppede opfølgning og
   **Integrationer** for de sandfærdige frakoblede statusser.

Preview og emulatorer er efterladt kørende til lokal gennemgang.

## Reproducerbart lokalmiljø

| Del | Faktisk anvendt version |
| --- | --- |
| Firebase CLI | 13.35.1 fra lokal npx-cache |
| Emulator-Java | Temurin OpenJDK 11.0.32.1+1 |
| Kontrol-Java | Temurin OpenJDK 21.0.12.1+1 findes, men CLI 15-databasestart ramte den dokumenterede Windows-loopback/AF_UNIX-fejl |
| Node, emulatorer/fixtures | 20.20.2 |
| Node, normal shell/capture | 24.19.0 |
| Vite | 5.4.21 |

Den fungerende start bruger `firebase.owner-test.json`, projekt
`demo-veyro-owner`, Auth 9099, Database 9000, Functions 5001, Storage 9199,
Emulator UI 4000 og preview 5211. Ingen global installation er ændret.

## Resterende ekstern opsætning

- Microsoft 365: verificér postkassetypen for `info@veyrosystems.com`, Entra-
  appen, mindst mulige mailbox-scopes, Send As, delta/webhooks og kontrolleret
  Inbox/Sent/ukendt-udfaldstest.
- OpenAI: serverhemmelighed, godkendt model, håndhævet budget og særskilt
  aktivering. Den lokale deterministiske adapter er ikke OpenAI.
- Dinero: testorganisation, OAuth/API, varer/kontomapping og retursynk.
- OCR og bilagsmail: leverandør, indgående adresse, retention og overvågning.
- Godkendt kommercielt rateblad/officielle priser og fysisk kameratest på en
  rigtig mobilenhed.

Ingen af disse forhold blokerede det lokale V6.1-arbejde, og ingen status er
vist som tilsluttet uden faktisk opsætning og verifikation.
