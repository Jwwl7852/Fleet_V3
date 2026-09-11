# PROCURE lagerstyring – implementering og lokal verifikation

Dato: 12. september 2026

## Spor og grundlag

- Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-procure-integrated`
- Branch: `codex/procure-integrated-development`
- Start-HEAD: `da84b466089cd3af3d398b08bb933c8645d9fdee`
- Kodecommit: `0769a5e` (`feat(procure): add inventory management`)
- Arbejdstræet var rent, da lagerarbejdet begyndte.
- Ingen `AGENTS.md` fandtes i sporet.
- Den gældende `docs/VEYRO_MODULUDVIKLINGSSPOR_V1.md` blev læst direkte fra `codex/veyro-integration-v1` ved commit `39963337a52d4464f619077683d1f39aa81eff1e`; arbejdsfiler på andre spor blev ikke ændret.
- Eksisterende `forbrugsvarer` og append-only `forbrugsvarebevaegelser` er genbrugt. Warehouse-modulets 3PL-varemodel er ikke kopieret til et parallelt PROCURE-register.

## Kravmatrix

| Krav | Relevant kode | Implementeret adfærd | Faktisk afprøvning | Resterende |
| --- | --- | --- | --- | --- |
| Lageroversigt og menu | `InventoryScreen.jsx`, `ProcureModule.jsx`, `nav.js`, `App.jsx` | Vare/varenummer, lager/placering, kendt eller ukendt beholdning, minimum, på vej, seneste optælling, søgning og filtre. Legacy `/indkoeb/varelager` viderestilles. | Desktop-browser viste tre syntetiske lagerposter, under-minimum, historik og periodeoversigt. | Ingen kendt kodefejl. |
| Lagerført kontra direkte levering | `varelager.js`, `procure-inventory-domain.js`, `functions/index.js` | Varer markeres eksplicit som lagerførte. Kun lagerførte og accepterede modtagelseslinjer øger lager. Ukendt beholdning bevares som ukendt og omdannes ikke til nul. | Domænetests dækker ukendt beholdning og modtagelse. UI viser oprettelseshandling for ikke-lagerførte katalogvarer. | Kald mod emulator kunne ikke køres; se begrænsning nedenfor. |
| Modtagelse ved hylden | `MobileReceiptScreen.jsx`, `procure-v2-adapter.js`, `procureVaremodtagelseRegistrer` | Søg åbne ordrer på PO eller leverandør, modtag alle eller delvist, vælg placering, vedhæft dokumenter, og gem modtagelse og lagerbevægelse atomisk med idempotensnøgle. Beskadiget/afvist tælles ikke som accepteret. | Mobil-browser: 48 resterende ruller blev valgt på PO-2026-0142; 20 før + 48 modtaget gav 68 beregnet. UI viste serverbekræftelsesformulering og delmodtagelsesstatus. | Vedvarende opslag i en ny Auth-emulatorsession kunne ikke gennemføres lokalt. |
| Optælling ved og efter modtagelse | `MobileReceiptScreen.jsx`, `InventoryScreen.jsx`, `procure-inventory-domain.js` | Valgfri optælling; difference gemmes som særskilt korrektionsbevægelse med begrundelse. Optælling uden difference gemmes stadig. Seneste optælling ændres ikke, hvis brugeren afslutter uden optælling. Revisionskonflikt kræver ny bekræftelse. | Browser: beregnet 68, faktisk 66, difference -2 og begrundelse. Efter bekræftelse viste lageret 66 og separat +48/-2 i historikken. Senere direkte optællingsdialog blev åbnet; ESC lukkede og fokus vendte til “Optæl lager”. | To samtidige rigtige browsersessioner mod emulator blev ikke gennemført. |
| Mobil og desktop | `InventoryScreen.jsx`, `MobileReceiptScreen.jsx`, `procure-v2.css` | Store handlinger til “Modtag varer”, “Registrér forbrug” og “Optæl lager”; enheder vises ved alle antal. “Gemt” vises først efter callback-resultat. | Kontrolleret ved CSS-bredder ca. 388 og 358 px; ingen dokumentbredde-overflow. Desktop og smal visning er fotograferet. | Ikke afprøvet på fysisk telefon; mobilbrowserens kamera indgår ikke i dette lagerflow. |
| Forbrug, retur, flytning og historik | `InventoryScreen.jsx`, `procure-inventory-domain.js`, `procureLagerBevaegelse`, `procureLeverandoerReturRegistrer` | Startbeholdning, forbrug, fysisk retur, optælling, korrektion og tobenet flytning. Hver bevægelse har vare, placering, enhed, type, medarbejder, servertid og reference. Retur reducerer fysisk lager én gang; kreditnota ændrer ikke lager. | Enheds- og domænetests dækker fortegn, enheder, idempotens, revision, retur og nettoflytning. UI-dialoger og historik er gennemgået. | Callable-integration mod rigtig emulator blev blokeret før teststart. |
| Årsoversigt og CSV | `procure-inventory-domain.js`, `InventoryScreen.jsx` | Primo + modtagelser - forbrug - retur ± korrektioner + nettoflytning = ultimo beregnes fra bevægelser. Interne flytninger summerer til nul på lagerniveau. Optællinger/afvigelser vises separat, og filtreret periode kan eksporteres som CSV. | Domænetest validerer perioderegnestykket og CSV. Browser viste tape: 0 + 10 + 10 = 20 i nulstillet demo samt tidligere gennemført 0 + 58 + 8 = 66 før genindlæsning. | CSV-download er udløst fra UI-kontrakten, men filen er ikke genimporteret i et regneark. |
| Ordre-PDF og leverandørmail | `procure-pdf.js`, `SendOrderScreenV2.jsx`, `ordreMailIndhold`, eksempelgenerator | Nye leverandørdokumenter har ingen modtagelses-QR og ingen priser. Teksten “Angiv vores bestillingsnummer [PO] på følgesedlen og fakturaen.” står i PDF og mail. Interne modtagelseslinks og gamle arkiver ændres ikke. Leveringsvalg og åbningstid er bevaret. | Tre PDF'er er genereret, tekstkontrolleret og renderet: 1 side hurtigst, 1 side senest og 4 sider/42 linjer med gentagne tabeloverskrifter. Målrettede tests kontrollerer ingen priser/QR og uændret intern prismodel. | Ingen rigtig mail er sendt; kun kontrolleret kode/testtransportkontrakt. |
| Tenant, roller, dubletter og samtidighed | `functions/index.js`, `firebase.rules.json`, `procure-inventory-domain.js` | Callables kræver auth, tenanttilknytning og `indkoeb.skriv`. Transaktioner håndhæver revisionsnummer og idempotens. Database-regler tillader ikke direkte klientskrivning til bevægelser. | Statiske adgangstests, præflight og 107 målrettede tests bestod. | Auth-/Database-emulator kunne ikke starte på værten; fremmed-tenant og to-sessioners browserflow er derfor ikke dokumenteret som runtime-test. |

## Sammenhængende lokal browserkontrol

Preview: `http://127.0.0.1:5206/indkoeb/lager`

Den lokale browser blev kørt med tydeligt mærkede syntetiske testdata. Denne demo bruger ikke login- eller rettighedsbypass som bevis for backendadgang; den er alene UI- og flowkontrol. Normal login og servervaliderede claims ligger i produktionsstien, men den lokale Auth-emulator kunne ikke startes på denne Windows-vært.

Gennemført browserflow:

1. Åbn lageroversigt og vælg Pakketape på Hovedlager/A-01.
2. Find PO-2026-0142 via åbne ordrer og registrer resterende 48 ruller.
3. Bekræft, at 20 + 48 = 68 beregnet beholdning.
4. Optæl 66, angiv begrundelse, og registrer en særskilt korrektion på -2.
5. Gå tilbage til lageret og se 66 ruller samt de separate bevægelser +48 og -2.
6. Åbn en senere optælling direkte fra lageret; kontroller dialogfokus, ESC-lukning og fokusretur.
7. Kontroller smal visning ved ca. 390 og 360 CSS-pixel uden utilsigtet vandret dokumentoverflow.

## PDF-bevis

| Eksempel | Sider/linjer | SHA-256 | Kontrol |
| --- | ---: | --- | --- |
| Hurtigst muligt | 1 / 2 | `e3ffd058b2c2f69c14b65d19f6ba0c218a0695117ac3752b3574053ac79b7e45` | Ingen pris eller QR; fast åbningstid og følgeseddel-/fakturatekst. |
| Senest dato | 1 / 2 | `e7f1c3fb3a98a286c353cba5282868c5f8019f3785468143a686f1201a4ed221` | Dato uden særskilt klokkeslæt; samme åbningstid. |
| Flere sider | 4 / 42 | `ad85945953f86afceadd8d53ec7829523ba4e8e7f6a353f0836c4907c0f39139` | Gentaget tabeloverskrift; ingen overlap eller afskåret tekst ved visuel renderkontrol. |

`output/pdf/PROCURE-bestilling-manifest.json` dokumenterer de genererede bytes og `vendorReceiptQr: false`. Preview, mailvedhæftning og arkiv bruger fortsat den samme revisionslåste PDF-bytebuffer; dette er dækket af de eksisterende PDF/mailtests. Allerede arkiverede filer bliver ikke regenereret.

## Testresultater

Bestået:

- `node --test test/procure-inventory.test.mjs test/procure-followup.test.mjs test/procure-review2.test.mjs test/bestilling.test.mjs test/skive4d-ordremail.test.mjs test/statustal.test.mjs test/custom-claims-v2-preflight.test.mjs` → 107 bestået, 0 fejl.
- `npm run lint` → bestået.
- `npm run build` → bestået.
- `npm run test:design` → 11 bestået, 0 fejl.
- `git diff --check` → ingen whitespacefejl; kun forventede Windows line-ending-advarsler før commit.

Ikke bestået/ikke kørt som bevis:

- `npm run test:rules` kom ikke frem til tests. Firebase Database-emulatoren fejlede under opstart med `Unable to establish loopback connection` / `SocketException: Invalid argument: connect`, også med den lokale Java 21-runtime.
- Derfor er `functions/test/procure-callables.integration.mjs`, almindeligt Auth-login, fremmed-tenant-afvisning, vedvarende genåbning og to samtidige browser-sessioner ikke faktisk kørt mod emulator i denne aflevering.
- En fuld, ufiltreret `node --test` rammer allerede kendte, ikke-PROCURE-relaterede extensionless import-/fixturefejl i Facility V2/Fleet V2. Den afgrænsede PROCURE-pakke ovenfor er grøn.

## Artefakter

- Desktop: `output/screenshots/lager/01-lageroversigt-desktop.png`
- Mobil modtagelse: `output/screenshots/lager/02-mobilmodtagelse-390.png`
- Mobil optælling: `output/screenshots/lager/04-mobiloptaelling-difference-390.png`
- Mobil gemt status: `output/screenshots/lager/05-mobil-lager-gemt-390.png`
- Renderede PDF-sider: `output/screenshots/lager/pdf-*.png`
- PDF'er og manifest: `output/pdf/PROCURE-bestilling-*.pdf` og `output/pdf/PROCURE-bestilling-manifest.json`

## Afgrænsning

- Færdig kode: lagerdomæne, UI, callables, regler, mobilmodtagelse, bevægelseshistorik, periodeafstemning/CSV samt nye PDF/mailkrav.
- Lokalt afprøvet: domæne-/regressionstests, lint, build, design-tests, syntetiske browserflows og PDF-rendering.
- Ikke runtime-afprøvet: Firebase Auth/Database/Functions-integration på grund af emulatorens loopbackfejl på værten.
- Ekstern konfiguration: rigtig mailtransport, kundecredentials og produktionsmiljø er hverken anvendt eller ændret.
- Ingen push, merge, deployment, produktionsændring, køb, betaling eller leverandørmail er foretaget.
