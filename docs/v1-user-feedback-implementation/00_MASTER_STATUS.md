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
| 2.2 | Chauffør kun i mobilapp | DEV VERIFIED | Bekræftet i browser: chauffør-rolle lander på isoleret `/app`, ikke kontorshell. Formel test-dækning ikke verificeret endnu |
| 2.3 | Sidebar-grupper kan foldes | DONE | `dca807c` |
| 3 | Ét samlet Dashboard (fjern dashboard-vælger) | DONE | Dashboard.jsx: `<select>`-vælgeren og `?db=`-URL-overstyringen fjernet. Præcis ét synligt driftsmodul lander stadig direkte (intet at vælge imellem); 2+ giver nu altid Samlet, uden vej til at skifte væk. `dashboardvisning`/`navvisning`-filtrering, modulkort og "Ekstra nøgletal" er upåvirkede. 104 targeted + 3540/3540 fuld suite grøn, DEV-verificeret i browser |
| 4 | Kunder → Administration | DONE | `dca807c` |
| 5 | Økonomi/Fakturagrundlag sættes på pause | NOT STARTED | Stadig synligt i FÆLLES i browser |
| 6 | Fakturaer & bilag (upload/manuel/søgning/importeret af) | NOT STARTED | |
| 7.1 | Leverandørkort (adresse, kontaktperson, adskilt ordre-mail, søgning) | DONE | `5db0742` |
| 7.2–7.5 | Leverandørstatistik, global varemaster + leverandørvarer-relation, kategorier | NOT STARTED | `5db0742`'s commit-tekst noterer eksplicit at global varemaster er UDENFOR scope af den rettelse — egen skive |
| 8 | Planning (bevar arkitektur, koordinator får booking.opret) | IN PROGRESS? | `d7c2a15` "Planning-listen filtreres positivt" — relateret men ikke bekræftet dækkende §8 fuldt ud |
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
| **F.2+** | Supplier Portal — resten (dokumentdeling-udvidelse, admin-UI) | NOT STARTED | Dokumentdeling er en EGEN, isoleret security-skive før fotos kan vises i portalen (produktejerens eksplicitte krav 2026-08-31) — den eksisterende sikre dokument-arkitektur (Skive 4C) er HARDKODET til `parentType: "faktura"` alene (`firebase.rules.json`); kode-kommentaren kalder selv udvidelse til andre parentTypes "en senere skive på samme fundament". Ingen direkte Storage-adgang, public URLs eller en separat usikker portal-filvej — udvidelsen skal følge samme principper som 4C (tenant-isoleret sti, server-side grant-tjek, eksplicit `visibleToSupplier`, short-lived links, audit af link-udstedelse). Admin-UI (§18: Opsætning → Leverandører → [leverandør] → Portaladgang, "Inviter bruger") er heller ikke bygget endnu — Cloud Functions (`leverandoerPortalInviter`/`-AdgangDeaktiver`) findes og er DEV-verificeret, kun UI'et til at kalde dem mangler |
| **G.1** | Fuel Matching — Tankning-formularen stabiliseret (§1/§2/§8) | DONE | Pris pr. liter fjernet fra formularen (bevaret i regler/FELT for gamle poster); nyt `dato`-felt (ISO, redigerbart, foreslår i dag via ny `iDagIsoLokal()` — IKKE `iDagIso()`, samme UTC-kant som §10.3); koeretoejId+dato+liter obligatorisk både i UI (Send spærret) og server-side (`firebase.rules.json`). 41 targeted + 3549/3549 fuld suite grøn. DEV-verificeret: rigtig skrivning som `chauffoer@dev.fleetcontrol.invalid` på `demo`-tenanten, regler udrullet og tjekket identiske (`npm run regler:udrul`). Diagnosticeringsposter ryddet op igen |
| **G.2+** | Fuel Matching — resten (fakturalinje-model, matchmotor, UI, statistik) | NOT STARTED | Foto-capture til Tankning er OGSÅ ikke bygget endnu (valgfrit, egen skive — se note nedenfor). Ingen strukturerede fakturalinjer findes i dag; intet OCR/PDF-ekstraktionslag findes (bekræftet: `functions/package.json` har ingen OCR/PDF-afhængighed) — det er masterbriefens §18 OCR-stoppunkt igen, ikke et nyt. Matchmotoren kan og skal bygges mod SYNTETISKE strukturerede linjer uden at afvente den beslutning; genbrug `procure.js`/`fakturacenter.js`'s `matchForslag`/`TOLERANCE_BPS`-mønster |

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
   leverandørnotifikation. Der findes IKKE i forvejen noget
   `visibleToSupplier`-lignende felt — det er et nyt mønster, ikke et genbrug.

## Rækkefølge fremover

Ingen kunstig prioritering på tværs af uafhængige moduler (Procure/Facility/
Unitbooking/Warehouse). Supplier Portal er IKKE længere blokeret af Fleet §9
(opfyldt), men er blokeret af status-gap-beslutningen ovenfor — afventer svar
før rules/functions/tests bygges.

Næste skridt: fortsætte med andre uafhængige, allerede scopede punkter (fx
resten af Fleet §9, Fakturaer & bilag §6, chaufførapp §10.4+) mens
Supplier Portal-statusbeslutningen afventer.
