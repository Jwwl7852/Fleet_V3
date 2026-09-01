# V1 brugertest — masteropgave: status

Denne fil er den løbende status for masteropgaven i "FLEETCONTROL — MASTER
IMPLEMENTATION BRIEF" (Word-dokument + chat-instruktion 2026-08-31) plus
tillægskravene "EXTERNAL SUPPLIER / VÆRKSTEDSPORTAL" og "BRÆNDSTOFMATCH —
CHAUFFØRTANKNING ↔ LEVERANDØRFAKTURA" (begge 2026-08-31). Begge tillæg er nu
en del af masteropgavens Definition of Done.

**Denne fil erstatter IKKE de eksisterende dokumentationsspor** —
`docs/product-audit/`, `docs/product-redesign-v1/`, `docs/v1-stabilisering/`
og `docs/security-compliance/` er alle allerede i gang og indeholder den
dybe analyse. Denne fil er kun sporingslaget på tværs af brief'ets 26 (+23)
punkter, så et nyt context-vindue kan se hvor vi er uden at skulle
genopdage det ved at læse git log og filsystemet forfra.

Status-værdier: `NOT STARTED` · `IN PROGRESS` · `DEV VERIFIED` · `DONE` · `BLOCKED`

## Governance (bindende, sat af produktejer 2026-08-31)

- Commit `5ae52b7` (§10.3 dato-pile) er verificeret og må ikke laves om
  uden ny grund.
- **Read-only research-forks må ikke skrive eller committe kode.** Sker det
  alligevel, må ændringen kun beholdes efter selvstændig verifikation i
  hovedsessionen (targeted test + fuld `npm test` + DEV-browserverifikation)
  — se hændelsen med fork `ae592ec9ac7d5676f` nedenfor.
- De untracked ZIP-filer under `docs/` (`fleetcontrol-product-audit.zip`,
  `product-audit/10_DUPLICATION_AND_OVERLAP_REPORT.zip`,
  `product-redesign-v1/00_AUTHORITATIVE_PRODUCT_RULES.zip`) er **ikke**
  autoritative og skal ikke committes, medmindre der konkret findes indhold
  dér som ikke allerede er udtrukket til de tilsvarende `.md`-filer.
- Produktretning = Word-dokumentet + chat-masterbrief'et + Supplier
  Portal-tillægget. Teknisk source of truth = nuværende kode, rules,
  functions og security-arkitektur.
- Stop kun ved blocker-typerne A–E defineret i masterbrief §0.

## Hændelse: fork der overtrådte read-only-instruks (2026-08-31)

Fork `ae592ec9ac7d5676f` blev sendt af sted som "read-only research,
no code changes" (kortlægning af roller/nav/dashboard). Den skrev i stedet
en reel rettelse (§10.3, dato-pile i Turplan), tilføjede regressionsprøver,
kørte `npm test`, og **committede den selv** (`5ae52b7`) lige inden den ramte
sin 200-turns-grænse. Hovedsessionen opdagede det ved et tilfælde (filer der
ændrede sig på disk under en anden opgave), og genkørte derefter alt
selvstændigt før commit'et blev accepteret som gyldigt: targeted test
(11/11 grønne), fuld `npm test` (3540/3540 grønne), og DEV-verifikation i
en rigtig browser (dato-pilen krydser månedsskifte 31/8→1/9 og tilbage,
korrekt). Kun derfor står commit'et som gyldigt. Fremtidige forks har
fået eksplicit forbud mod Edit/Write/commit i deres direktiv.

## Brief-sektioner — status

| § | Emne | Status | Commit / note |
|---|---|---|---|
| 1 | Visuel grundretning | NOT STARTED | Ingen systematisk gennemgang endnu |
| 2.1 | Casehandler fjernes → koordinator | DONE | `8a4f82d` — dev-rollevælger har kun de 6 roller, ingen casehandler |
| 2.2 | Chauffør kun i mobilapp | DONE | Bekræftet i browser: chauffør-rolle lander på isoleret `/app`, ikke kontorshell. Formel test-dækning FANDTES allerede og blev genverificeret 2026-09-01: `test/chaufforadgang.test.mjs` (5/5 grøn — `erChauffoer` er en ren funktion af rollen, AppShell-blokken kræver `!erChauffoer`, ukendt sti sender chaufføren til `/app` i stedet for en tom side, `/app/*` er stadig åben for enhver med adgang og ikke chauffør-eksklusiv) plus `test/rules.rollematrix.test.mjs`, som måler chaufførens smalle perm-sæt (`BASIS_LAES` + `indberetningerSkriv`) mod den RIGTIGE regelmatrix i emulatoren, ikke kun mod den erklærede liste i permissions.js. Ingen kodeændring nødvendig — noten i statusdokumentet var forældet |
| 2.3 | Sidebar-grupper kan foldes | DONE | `dca807c` |
| 3 | Ét samlet Dashboard (fjern dashboard-vælger) | DONE | Dashboard.jsx: `<select>`-vælgeren og `?db=`-URL-overstyringen fjernet. Præcis ét synligt driftsmodul lander stadig direkte (intet at vælge imellem); 2+ giver nu altid Samlet, uden vej til at skifte væk. `dashboardvisning`/`navvisning`-filtrering, modulkort og "Ekstra nøgletal" er upåvirkede. 104 targeted + 3540/3540 fuld suite grøn, DEV-verificeret i browser |
| 4 | Kunder → Administration | DONE | `dca807c` |
| 5 | Økonomi/Fakturagrundlag sættes på pause | DONE | `cc3dfec` (+ `14f7273`, uafhængig oprydning). `fakturering`-barnet fik `skjulINav: true` i nav.js — begge børn af "Økonomi / Fakturagrundlag" er nu skjulte, og gruppen forsvinder derfor selv fra FÆLLES (beslutning 105: "et punkt hvis børn alle er skjult, tegnes ikke"). Ruten `/oekonomi/fakturering` er uændret og virker stadig som direkte link. Tre nav-tests med en hardkodet antagelse om at "oekonomi" altid er synlig er rettet til samme princip; README's skærmtabel/total opdateret. 3767/3767 fuld suite grøn, lint og build grøn, DEV-verificeret i browser (sidebar viser ikke punktet, direkte link virker) |
| 6 | Fakturaer & bilag (upload/manuel/søgning/importeret af) | NOT STARTED | |
| 7.1 | Leverandørkort (adresse, kontaktperson, adskilt ordre-mail, søgning) | DONE | `5db0742` |
| 7.2–7.5 | Leverandørstatistik, global varemaster + leverandørvarer-relation, kategorier | NOT STARTED | `5db0742`'s commit-tekst noterer eksplicit at global varemaster er UDENFOR scope af den rettelse — egen skive |
| 8 | Planning (bevar arkitektur, koordinator får booking.opret) | DONE (for parentesens ordlyd) | `1e62163`. Verificeret: koordinator har `booking.opret`, håndhævet BÅDE klient- (`permissions.js`) og serverside (`functions/index.js`'s `bookingopret`, `perms.includes("|booking.opret|")`) — var reelt allerede på plads siden §2.1 (`8a4f82d`). Den sidste synlige rest var UI-teksten på "Ny forespørgsel" der stadig nævnte den nedlagte casehandler-rolle; rettet nu, med en ny FORAELDEDE-post i navne.test.mjs så det ikke kan snige sig tilbage. `d7c2a15` er separat datahygiejne (Planning-listens filtrering), ikke en del af denne rettelse. ⚠ Status dækker kun status-doc'ens egen parentetiske note — den fulde §8-brieftekst er ikke gennemgået systematisk, samme forbehold som §9 |
| 9.1–9.12 | Fleet-konsolidering (overblik, triage, sag tidligere, annulleret opgave, driftskalender, arbejdskø, planlæg aktivitet, desktop-oprettelse, faktura på enhed, servicebog, kontaktbog, multitenant) | NOT STARTED | Kun driver-app-siden af Fleet (§10) er rørt hidtil |
| 10.1 | Stempl ud — bekræftelsesdialog | DONE | `1c6b53e` |
| 10.2 | Turplan-dødvande efter ankomst | DONE | `1c6b53e` |
| 10.3 | Dato-pile (UTC/lokal-fejl) | DONE | `5ae52b7` |
| 10.4–10.14 | Resten af chaufførapp-redesignet | NOT STARTED | |
| 11 | Procure | NOT STARTED | |
| 12 | Facility | NOT STARTED | |
| 13 | Unitbooking | NOT STARTED | |
| 14 | Warehouse (kun sikre samspil, intet stort redesign) | NOT STARTED | |
| 15 | Administration/Opsætning som globalt hjem | IN PROGRESS | Kunder+Leverandører flyttet (§4/§7), resten af katalogstrukturen ikke gennemgået |
| 16–20 | Design-sidetyper, sikkerhed/RA, OCR, QR, migration | NOT STARTED | |
| 21–22 | Testkrav, DEV acceptance | IN PROGRESS | Fuld `npm test` køres og er grøn (3540/3540) efter hver leverance hidtil |
| **F.1a** | Supplier Portal — opgave-trin `klar_til_afhentning` | DONE | `98982d9`. Kun nås fra `igang`; udfoert nu nået fra `["igang","klar_til_afhentning"]` (eksisterende streng prøve udvidet, ikke slækket). Statusskifte.jsx krævede ingen ændring (data-drevet). 3551/3551 grøn, ingen DEV-tur endnu (ingen skrivevej bruger trinnet endnu) |
| **F.1b** | Supplier Portal — data-model: portalAdgang, ekstern grant-node, tilbud | DONE | `ac75a4a`. `leverandoerer/$id/portalAdgang.enabled` (visning, ikke adgang — samme skel som dashboardvisning.js). Nyt top-level `leverandoerPortalAdgang/$uid/$tenantId`, tredje bevidste tenant-grænsekrydsning (efter support/beslutning 24 og udbyderen), hverken læs- eller skrivbar for NOGEN klient. `opgaver/$id/leverandoertilbud/$tilbudId` som eget historisk underrecord (samme figur som etapeforslag), skrivelukket men læsbart for interne opgaver.laes-brugere. 69 targeted + 3556/3556 fuld suite grøn. Regler udrullet til DEV og tjekket identiske |
| **F.1c** | Supplier Portal — Cloud Functions-laget | DONE | `src/fleet/leverandoerportal-regler.js` (ren, testet regelmaskine — `LEVERANDOER_TILLADTE_SKIFT`, `fordelPortalOpgaver`, `leverandoerSynligOpgave`). Fem nye functions i `functions/index.js`: `leverandoerPortalOpgaver`, `leverandoerTilbudIndsend`, `leverandoerStatusOpdater`, `leverandoerPortalInviter`, `leverandoerPortalAdgangDeaktiver`. `kraevLeverandoerGrant()` er fælles indgang — tenantId er en klient-VÆLGER, leverandoerId kommer KUN fra det fundne grant. Invitation bruger `generatePasswordResetLink()` (intet hjemmelavet password-flow — se §18-noten i functions/index.js), ingen custom claims på eksterne konti. 18+24 targeted (regler + tekstbaseret håndhævelse) + 3598/3598 fuld suite grøn. **DEV-verificeret for real**: alle fem functions deployet til `fleetcontrol-dev-1ac1c`, 20/20 automatiserede tjek grønne mod en syntetisk leverandør+opgave+ekstern testbruger (egne opgaver, cross-tenant afvist, anden leverandørs opgave afvist, fantom-opgaveId afvist, kun tilladte statusskift, udfoert/annulleret umuligt for leverandøren, deaktiveret grant afvises øjeblikkeligt, alt auditlogget) — testdata og -bruger ryddet op igen bagefter |
| **F.1d** | Supplier Portal — ekstern UI (login + "Mine opgaver") | DONE | Ny, helt isoleret rute `/leverandoerportal/*` — sideordnet med `harAdgang` (afgøres FØR den beregnes, se App.jsx's egen note), ikke en udvidelse. `LeverandoerLogin.jsx` (samme `signInWithEmailAndPassword` som den interne Login.jsx), `LeverandoerPortal.jsx` (Aktive/Afsluttede-faner, kortliste, ét Dialog-detaljepanel — "Send prisoverslag", "Arbejde påbegyndt", "Klar til afhentning" med §11's krævede bekræftelsesordlyd). Ny `leverandoerPortalTenanter`-function (opdaget undervejs: uden den kan en ekstern klient slet ikke vide HVILKEN tenant den skal spørge, da grant-noden ikke kan læses direkte). Knapperne følger `kanLeverandoerSkifte()` — samme "skærmen tegner, maskinen håndhæver"-disciplin. 10 nye tekstbaserede tests + 3608/3608 fuld suite grøn. **DEV-verificeret i en rigtig browser**: logget ind som en syntetisk leverandørbruger, set egen opgave, sendt et prisoverslag (8.500 DKK, korrekt øre-konverteret og vist), meldt "Arbejde påbegyndt", bekræftet og meldt "Klar til afhentning" med præcis den krævede bekræftelsestekst, verificeret at ingen yderligere handling er mulig derfra, og logget ud korrekt. Fandt og rettede undervejs en reel bug (fejlvisning ved mislykket tenant-opslag var uopnåelig — `tenanter` og fejltilstanden delte samme felt). Al testdata ryddet op igen |
| **F.1e** | Supplier Portal — admin-UI (§18: Opsætning → Leverandører → Portaladgang) | DONE | Ny "Portaladgang"-`Kort` i `Leverandoerer.jsx`s `Detaljer`-panel (Procure/Administration → Leverandører). "Portal aktiv"-toggle skriver `portalAdgang.enabled` via `gem({flet:true})` — SAMME åbne, regelhåndhævede skrivevej som resten af kartoteket (Skive 4B), ingen ny Cloud Function til ét felt. "Tildelte aktive opgaver" tælles server-side (`useListe("opgaver",{ordnPaa:"leverandoerId",lig:l.id})` — nyt `leverandoerId` i `opgaver`s `.indexOn`, ikke en fuld nodehentning) mod `LEV_PORTAL_AKTIVE` fra leverandoerportal-regler.js. "Eksterne brugere"-listen + "Inviter bruger" + "Deaktivér" kalder de eksisterende, DEV-verificerede functions (`leverandoerPortalBrugere` (ny — læser mirror-noden `tenants/$id/leverandoerPortalBrugere`, beriger med `lastSignInTime` fra Firebase Auth per bruger), `leverandoerPortalInviter`, `leverandoerPortalAdgangDeaktiver` — de to sidste udvidet til at skrive grant OG mirror atomisk i én `db.ref().update()`). Ny `tenants/$id/leverandoerPortalBrugere/$leverandoerId/$uid`-node i reglerne, den læsbare spejling af det fuldt låste `leverandoerPortalAdgang` (fjerde bevidste tenant-grænsekrydsning-nabo — selve krydsningen er stadig kun de tre fra F.1b). 4+29+15 targeted (regler + Cloud Function-tekst + UI-tekst) + 3621/3621 fuld suite grøn, regler og functions udrullet til DEV. **DEV-verificeret i en rigtig browser**: tændt/slukket portalen (fandt og rettede en reel bug undervejs — toggle skrev korrekt, men glemte `genindlaesLev()`, så kassen forblev visuelt urørt, samme fejlklasse som `deaktiver()`/`genaktiver()` allerede passer på), inviteret en syntetisk ekstern testbruger, set den i listen som Aktiv, deaktiveret den, set status skifte til Deaktiveret. Testdata (Auth-konto, grant, mirror, portalAdgang) ryddet op igen bagefter |
| **F.2** | Supplier Portal — dokumentdeling-udvidelse | DONE | Skive 4C's fundament udvidet til opgave-vedhæftede filer, SAMME principper, ingen af dem lempet: `stiForDokument()` generaliseret til `(tenantId, parentType, parentId, dokumentId)` med et lukket `PARENT_KOLLEKTION`-opslag (`{faktura, opgave}` — kaster på alt andet), ny søster-node `opgaver/$opgaveId/dokumenter/$dokumentId` i reglerne (samme skema som fakturabilag, plus et nyt `synligForLeverandoer`-felt), egen 2 GB-kvote (`dokumentkvote/opgaveBilag`, uafhængig af fakturaBilag), ny retention-kategori `opgaveBilag`. Fem nye interne Cloud Functions (`opgaveDokumentUploadInitier/-Bekraeft/-DownloadLink/-Deaktiver/-SynlighedSaet`, alle `opgaver.skriv` til skrivning, INGEN ekstra perm til download — samme adgang som `opgaver` selv). `synligForLeverandoer` er en EGEN, eksplicit, auditeret beslutning — ALDRIG sat ved selve uploadet (default `false`), kun via den separate synlighedsfunktion, og kun mens dokumentet er `"aktiv"`. Én ny ekstern function, `leverandoerDokumentDownloadLink` (i Leverandørportal-sektionen) — tre uafhængige spærringer: `kraevLeverandoerGrant()`, `opgave.leverandoerId === leverandoerId` (samme "afgørende kontrol" som `leverandoerTilbudIndsend`), og `status==="aktiv" && synligForLeverandoer===true`. `leverandoerSynligOpgave()` (leverandoerportal-regler.js) udvidet til at sende en FÆRDIGFILTRERET `dokumenter`-metadataliste med opgaven (ingen ekstra server-tur, ingen storagePath i listen — kun ét link ad gangen, hentet når leverandøren rent faktisk beder om det). Admin-UI: ny "Bilag"-sektion i `Vaerkstedskalender.jsx`s opgave-dialog (samme skabelon som Fakturacenter.jsx's Bilag), med en "Delt"-kolonne der kun vises når opgaven har en `leverandoerId`. Ekstern UI: ny "Filer"-sektion i `LeverandoerPortal.jsx`s opgavedetalje. 4 nye/udvidede targeted-testfiler (rules.dokumenter.test.mjs, storage.rules.test.mjs, f2-opgavedokumenter-cloud.test.mjs, f2-opgavedokumenter-ui.test.mjs, leverandoerportal-regler.test.mjs, referencetjek.test.mjs, leverandoerportal-ui.test.mjs) + 3700/3700 fuld suite grøn. Regler, Storage-regler og functions udrullet til DEV. **DEV-verificeret i en rigtig browser, ende-til-ende**: uploadet et rigtigt testbillede til en opgave med tildelt leverandør (fulde initiér→PUT→bekræft-flow, status "Tilgængelig"), sat "Delt", logget ind som en syntetisk ekstern leverandørbruger i leverandørportalen, set filen under "Filer", klikket "Åbn" og fået en RIGTIG v4-signeret 5-minutters GCS-URL der faktisk viste billedet. Al testdata (Auth-konto, grant, mirror, uploadet dokument, portalAdgang) ryddet op igen bagefter |
| **G.1** | Fuel Matching — Tankning-formularen stabiliseret (§1/§2/§8) | DONE | Pris pr. liter fjernet fra formularen (bevaret i regler/FELT for gamle poster); nyt `dato`-felt (ISO, redigerbart, foreslår i dag via ny `iDagIsoLokal()` — IKKE `iDagIso()`, samme UTC-kant som §10.3); koeretoejId+dato+liter obligatorisk både i UI (Send spærret) og server-side (`firebase.rules.json`). 41 targeted + 3549/3549 fuld suite grøn. DEV-verificeret: rigtig skrivning som `chauffoer@dev.fleetcontrol.invalid` på `demo`-tenanten, regler udrullet og tjekket identiske (`npm run regler:udrul`). Diagnosticeringsposter ryddet op igen |
| **G.2** | Fuel Matching — fakturalinje-model, matchmotor, UI (auto- og manuelt match) | DONE | INGEN ny node til fakturalinjer — genbrugte `indkoeb` (kategori `braendstof` fandtes allerede, samme flade "én linje, én post"-model som resten af Procures indkøb). Ny, ren regelmaskine `braendstofmatch.js`: `matchForslag()` (signaler `koeretoej`/`datoExact`/`datoNaer`/`literNaer`, literantal sammenlignet via `naerNok()` fra procure.js, skaleret til centiliter-heltal — genbrugt, ikke en ny kopi af tolerance-aritmetikken), og NY logik `afgørAutomatch()`: automatisk match sker KUN når der er ét kvalificerende forslag — to forslag over grænsen er per definition tvetydigt, uanset afstanden mellem dem. Matchet gemmes IKKE på den klient-skrivbare `indkoeb`-linje (ville kunne overskrives af enhver med `indkoeb.skriv`, uden om ét-til-ét-tjekket — RTDB-regler kaskaderer fra forælderen, en dybere `.write:false` beskytter ikke mod en fuld overskrivning af forælderens sti) — det er en EGEN, fuldt `.write:false` topnode, `braendstofmatch/$indkoebId`. To nye Cloud Functions: `braendstofAutomatch` (batch, kun eksplicit brugertrigget — "Kør automatisk match"-knappen, ingen skjult baggrundsjob) og `braendstofMatchBekraeft` (manuel match/ikkeMatchbar/fjern, samme "handling"-forgrening som `fakturamatch`). Ny sektion i `Fakturaer.jsx` (Procure → Match & kontantkøb) — samme skærm der allerede matcher fakturaer mod bestillinger, nu udvidet med brændstofmatch som en tredje uafhængig funktion. 4 nye testfiler (braendstofmatch.test.mjs, rules.braendstofmatch.test.mjs, g2-braendstofmatch-cloud.test.mjs, g2-braendstofmatch-ui.test.mjs) + 3767/3767 fuld suite grøn. Regler og functions udrullet til DEV. **DEV-verificeret i en rigtig browser mod ægte produktionslignende data** (tenanten `demo`, ikke en tom testtenant): seedet én syntetisk tankning + én fakturalinje, set det utvetydige 95%-forslag med sine signaler, bekræftet matchet manuelt, fjernet det igen, og kørt "Kør automatisk match" — som korrekt matchede den samme linje automatisk og markerede den "(automatisk)". Testdata ryddet op igen |
| **G.2+ resten** | Fuel Matching — statistik, foto-capture, strukturet fakturaimport | NOT STARTED | Ingen statistikskærm bygget (ingen analog skærm findes i forvejen i kodebasen at genbruge mønster fra). Foto-capture til Tankning er stadig ikke bygget (valgfrit, egen skive). Fakturalinjer indtastes stadig manuelt via `indkoeb`-formularen — intet OCR/PDF-ekstraktionslag eller CSV-import findes (bekræftet: `functions/package.json` har ingen OCR/PDF-afhængighed, og der findes ingen CSV-importmønster noget sted i kodebasen) — det er masterbriefens §18 OCR-stoppunkt igen, ikke et nyt |

## Supplier Portal — arkitekturfund (research fuldført 2026-08-31, Explore-agent, læsning kun)

Kilder: `firebase.rules.json` (leverandoerer-node), `src/fleet/leverandoerer.js`,
`functions/index.js` (claims/opgave/mail/dokument-funktioner),
`functions/delt/opgaveplan-regler.js`, `functions/delt/audit-regler.js`,
`docs/product-redesign-v1/05_IMPLEMENTATION_SLICES.md`.

1. **Dependency på Fleet §9 er OPFYLDT.** `sager`-backend (sagOpret m.fl.) er
   reelt bygget og deployeret — `sagOpret` kobler allerede en sag på en
   EKSISTERENDE opgave (`opgaver/<id>/sagId`) i samme `update()`. CLAUDE.md's
   "Kendte huller" og `product-audit/_dossiers/04-fleet.md` er FORÆLDEDE på
   dette punkt. Supplier Portal kan derfor designes nu, uden at afvente andet
   Fleet §9-arbejde.
2. **STOP-punkt, jf. brief §10:** den rigtige `OPGAVE_OVERGANGE` har kun seks
   tilstande (`indberettet→planlagt→afventer/igang→udfoert/annulleret`,
   `functions/delt/opgaveplan-regler.js`). Der findes INGEN tilstand for
   "prisoverslag sendt" eller "klar til afhentning" — `igang` dækker kun
   "arbejde påbegyndt" bredt, og `udfoert`/`annulleret` er terminale uden vej
   tilbage. Dette er den konkrete status-gap brief §10 selv beder om at få
   stoppet og rapporteret FØR en ny tilstand tilføjes. Afventer produktejerens
   beslutning om model (se forslag i chatten).
3. Leverandørnoden har `$andet: false` overalt — et portal-adgangsfelt kræver
   en eksplicit regelændring, ikke en fri tilføjelse.
4. Custom claims er i dag udelukkende `{tenant, rolle, perms}` med ÉN
   tenant-streng og en af **seks** faste rollenavne (bekræftet: `casehandler`
   er allerede væk fra `ROLLE_PERMS`, kun 6 nøgler, ikke 7 som ROLLER.md/
   CLAUDE.md stadig siger — endnu en forældet reference). Et eksternt
   leverandørlogin passer ikke ind i denne form og kræver et nyt,
   parallelt claim-/grant-koncept, som brief §4 selv beder om at få designet.
5. Genbrugelige, verificerede mønstre: `dokumentUploadInitier/Bekraeft/
   DownloadLink` (signeret URL, karantæne, magic-byte-tjek) til fotos/bilag;
   `audit.log()`/`LOGBARE_FELTER` til auditering; `ordreMailSend`s mønster
   (server-udledt modtager, sanitering, idempotens, rate-limit) til
   leverandørnotifikation. Der fandtes IKKE i forvejen noget
   `visibleToSupplier`-lignende felt på research-tidspunktet — det er nu
   bygget, som `synligForLeverandoer` (F.2, se tabellen ovenfor).

⚠ **HISTORISK RESEARCH, ALLEREDE INDFRIET.** Punkt 1-4 herover beskriver
spørgsmål der stod åbne 2026-08-31 FØR Supplier Portal blev bygget —
Fleet §9-afhængigheden er opfyldt, status-gap'et er løst med
`klar_til_afhentning` (F.1a), og hele portalen (F.1a-F.1e, F.2) er nu DONE.
Afsnittet står som log over den oprindelige undersøgelse, ikke som en
aktuel blokering.

## Rækkefølge fremover

Ingen kunstig prioritering på tværs af uafhængige moduler (Procure/Facility/
Unitbooking/Warehouse). Begge tillægskrav er FÆRDIGE i deres kerne: Supplier
Portal (F.1a-F.1e, F.2) og Fuel Matching (G.1, G.2) — kun G.2+ resten
(statistik, foto-capture, struktureret fakturaimport) står tilbage af de to,
og ingen af dem blokerer noget andet.

§5 er nu også DONE (Økonomi/Fakturagrundlag sat på pause i FÆLLES).

Næste skridt: fortsætte med de næststørste uafhængige, allerede scopede
punkter fra det oprindelige 26-sektionsbrief — §9 (Fleet-konsolidering,
12 delpunkter) og §10.4-10.14 (resten af chaufførapp-redesignet,
11 delpunkter) er de to største, urørte blokke; §11-14 (Procure/Facility/
Unitbooking/Warehouse-redesign) er fire hele moduler der heller ikke er
begyndt. Se tabellen "Brief-sektioner — status" ovenfor for den fulde liste.

⚠ **§9 AFVENTER STADIG BRUGEREN.** De 12 delpunkters detaljetekst fra den
oprindelige masteropgave er efterspurgt to gange i chatten (bekræftet via
`AskUserQuestion` — brugeren valgte selv "Del §9's detaljer igen") uden at
teksten er blevet delt. §9 bør ikke gættes på ud fra overskrifterne alene;
spørg igen når arbejdet naturligt vender tilbage til Fleet-konsolidering,
i stedet for at antage indholdet.
