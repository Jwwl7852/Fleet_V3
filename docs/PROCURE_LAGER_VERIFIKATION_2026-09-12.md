# PROCURE lager – rettelse og verificering

Dato: 12. september 2026

## Spor og grundlag

- Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-procure-integrated`
- Branch: `codex/procure-integrated-development`
- Start-HEAD for denne runde: `128c2d947d6170117c8698e3c4ff9b59c4af6af7`
- Kode- og testcommit: `c36f8b6` (`fix(procure): verify inventory flows and layouts`)
- Arbejdstræet var rent ved rundens start. Ingen igangværende Git-operation blev fundet.
- Ingen `AGENTS.md` fandtes i worktreet. Den gældende udviklingsvejledning blev læst direkte fra `codex/veyro-integration-v1` ved commit `39963337a52d4464f619077683d1f39aa81eff1e` uden at ændre andre spor.
- Eksisterende `forbrugsvarer` og append-only `forbrugsvarebevaegelser` er fortsat den fælles lagerkilde; der er ikke oprettet et parallelt lagerregister.

## Kravmatrix

| Krav | Relevant kode/backend | Implementeret | Faktisk afprøvet på denne version | Status / rest |
| --- | --- | --- | --- | --- |
| Desktoplayout | `InventoryScreen.jsx`, `procure-v2.css` | PROCURE-indholdet bruger hele AppShell-arbejdsområdet. Min-bredder er begrænset til tabelwrappers med lokal rulning; siden får ikke global vandret rulning. | Autoriseret Edge-session ved 1440 px: indhold `left=250`, `right=1391`, `width=1141`; dokument `clientWidth=scrollWidth=1425`; filtre, handlinger og tabeller var tilgængelige. | Bestået. |
| Mobillayout og overskrifter | `MobileReceiptScreen.jsx`, `procure-v2.css` | Ét trinbestemt H1: “Modtag varer”, “Optæl lager” eller “Lagerstatus opdateret”. Teksten “Servervalideret” og unødvendig teknisk succeshjælp er fjernet. | Otte mobile screenshots ved 360/375/390 CSS-px. Alle målte dokumenter havde `clientWidth=scrollWidth`; samtlige kontroller lå inden for viewporten. Modtagelse, optælling og kvittering blev betjent i browseren. | Bestået. Ikke testet på fysisk telefon. |
| Konkret kvittering | `MobileReceiptScreen.jsx` | Gemte serverresultater leverer vare/varenummer, lager/placering, ny beholdning, korrektion, medarbejder og servertid. Kvitteringen linker til lager og tilknyttet ordre. Uden optælling står der eksplicit, at beholdningen er beregnet og ikke fysisk optalt. | Autoriseret browserflow viste `Pakketape, klar 48 mm · EMB-1001`, `Hovedlager · A-01`, `Ny beholdning: 66 ruller`, `Optællingskorrektion: −2 ruller`, syntetisk medarbejder og servertid. | Bestået. Ingen værdier er hardcodet i komponenten. |
| Historik og periode | `InventoryScreen.jsx`, `procure-inventory-domain.js` | Synlig dato/tid pr. bevægelse; fra-/til-dato; særskilte startbeholdning, modtagelser, forbrug, retur, korrektion og nettoflytning; enheder og ultimo; “Vis bevægelser” åbner grundlaget. Start før perioden går i primo, start i perioden vises separat. | UI viste valgt periode `2026-01-01 – 2026-12-31`. Runtimeafstemning: `58 + 0 + 10 − 1 − 1 − 2 + 0 = 64 ruller`. | Bestået. |
| CSV | `inventoryCsv`, `InventoryScreen.jsx` | Downloaden indeholder valgt fra/til, alle afstemningskolonner, ultimo og enhed. | Faktisk browserdownload `procure-lager-2026-01-01-2026-12-31.csv` blev læst tilbage. Runtime-CSV SHA-256: `24af9cec5593af332355a7ea1ba9c62f2a0b276f7d9360a75072ac805a471d32`; indholdet stemmer med UI-perioden og 64-rullers afstemningen. | Bestået. |
| Modtagelse og lagerbevægelse | `procureModtagelseRegistrer`, regler, browseradapter | Lagerført accepteret mængde og modtagelse gemmes atomisk. Idempotensnøgle forhindrer dobbeltregistrering. | Almindeligt Firebase-password-login mod Auth/Functions/Database: +10 gav 68. Gentaget kald gav `allerede=true` uden ekstra bevægelse. Anden autoriseret session genåbnede ordre og beholdning. | Bestået. |
| Modtagelse uden optælling | samme som ovenfor | Modtagelsen kan afsluttes med beregnet beholdning; seneste optællingsdato ændres ikke. | Browseren gemte modtagelsen og viste særskilt mellemkvittering før optælling. Backenddata blev genåbnet i session 2, mens beholdningen var 68 og før den efterfølgende optælling. | Bestået. |
| Optælling med/uden difference | `procureLagerBevaegelse` | En nul-difference gemmes som dokumentation. Difference kræver begrundelse og bliver særskilt korrektionsbevægelse. | Runtime: 68→68 med delta 0; derefter 68→66 med delta −2. Browseren gennemførte −2-flowet og viste den konkrete kvittering. | Bestået. |
| Samtidighed | revisionskontrol i callable/domæne | En forældet expected revision afvises; nyere bevægelse overskrives ikke. | To tokens/sessioner. Session B gemte optællingen 68; session A's gamle revision blev afvist med `ABORTED`; efter genindlæsning blev 66 gemt. | Bestået. |
| Adgangskontrol | Auth-claims, Functions, `firebase.rules.json` | Tenant og `indkoeb.skriv` håndhæves på serveren; lokationer valideres mod tenantens stamdata. | Læsebruger uden skriveret blev afvist. Fremmed tenant kunne hverken læse varen eller kalde lagerændringen. Tokenclaims blev kontrolleret efter almindeligt password-login. | Bestået lokalt i emulator. |
| Atomisk fejl | `procureModtagelseRegistrer` | Fejl efter servervalidering må hverken give succes eller efterlade modtagelse/lager ude af takt. | Modtagelse med ukendt lager/placering blev afvist; ingen modtagelse blev oprettet, og bevægelsesantallet var uændret. | Bestået. |
| Forbrug, retur, flytning og kreditnota | lager- og returcallables, Fakturacenter | Forbrug reducerer lager. Fysisk retur reducerer én gang. Flytning skriver −/+ og er samlet nul. Kreditnota påvirker ikke fysisk lager. | Runtimeflow kørte alle fire hændelser. Flytning gav `[-2,+2]`; kreditnotaens før-/efter-lagerplaceringer var identiske. | Bestået. Ingen ekstern bogføring/betaling udført. |
| Ordre-PDF fortsættelsessider | `procure-pdf.js`, `procure-followup.test.mjs` | Skabelon v4 viser BESTILLING og bestillingsnummer på alle sider; tabeloverskrift gentages; lange beskrivelser brydes inden antal/enhed. Ingen priser eller modtagelses-QR. | 42 linjer renderet til 4 sider. Alle sider blev visuelt kontrolleret. PDF SHA-256: `db634ff74d61aa2d3bea30dcc618622d61bf4bff5e6cef32d4b6df661236624a`. | Bestået. |

## Autoriseret runtimeflow

Miljøet var den lokale Firebase Emulator Suite for projektet `demo-veyro-owner`:

- Auth `127.0.0.1:9109`
- Realtime Database `127.0.0.1:9010`
- Storage `127.0.0.1:9209`
- Functions `127.0.0.1:5012`
- Preview `http://127.0.0.1:5208`

Der blev brugt syntetiske brugere, almindeligt Firebase-password-login og signerede tenant-, rolle- og permission-claims. Ingen demo-login, rollevælger eller rettighedsbypass indgik som adgangsbevis.

Runtimebeviset ligger i `output/review/lager-runtime/PROCURE-lager-auth-functions-bevis.json`. Det dokumenterer to autoriserede sessioner, writer-/tenantafvisning, idempotens, revisionskonflikt, atomisk fejl, fysisk retur, kreditnota uden lagerændring og periodeafstemning.

## Browser- og artefaktbevis

- `output/review/lager-browser/01-mobil-modtag-varer-390.png`
- `output/review/lager-browser/01b-mobil-modtag-varer-375.png`
- `output/review/lager-browser/02-mobil-modtag-varer-360.png`
- `output/review/lager-browser/03-mobil-modtagelse-gemt-390.png`
- `output/review/lager-browser/04-mobil-optael-lager-390.png`
- `output/review/lager-browser/05-mobil-optael-lager-360.png`
- `output/review/lager-browser/06-mobil-lagerstatus-opdateret-390.png`
- `output/review/lager-browser/07-mobil-lagerstatus-opdateret-360.png`
- `output/review/lager-browser/08-desktop-lageroversigt-og-historik.png`
- `output/review/lager-browser/09-desktop-genaabnet-anden-session.png`
- `output/review/lager-browser/procure-lager-2026-01-01-2026-12-31.csv`
- `output/review/lager-browser/PROCURE_LAGER_BROWSER_QA.json`
- `output/review/lager-pdf-render-v4/PROCURE-bestilling-flere-sider-1.png` … `-4.png`
- `output/review/lager-pdf-render-v4/PROCURE-bestilling-hurtigst-muligt.png`
- `output/review/lager-pdf-render-v4/PROCURE-bestilling-senest-dato.png`
- `output/pdf/PROCURE-bestilling-flere-sider.pdf`

Den samlede pakke `output/PROCURE-lager-review-2026-09-12.zip` indeholder seks rapporter, 16 aktuelle screenshots, fire JSON/CSV-beviser og tre PDF-eksempler.

## Testresultater

Bestået på kodecommit `c36f8b6`:

- `npm run lint` → bestået.
- `npm run build` → bestået, 647 moduler transformeret.
- `node --test --test-isolation=none test/design-tokens.test.mjs` → 11/11.
- `node --test --test-isolation=none test/procure-inventory.test.mjs test/procure-followup.test.mjs test/forbrugsvarer.test.mjs test/navadgang.test.mjs test/referencetjek.test.mjs` → 70/70.
- `firebase emulators:exec --only database,storage --config firebase.rules-test.json --project demo-fleetcontrol-rules-test "node scripts/test-platform.mjs"` → 4.349/4.349, 0 fejl.
- `firebase emulators:exec --only auth,database,storage,functions --config firebase.procure-suite.json --project demo-veyro-owner "node scripts/procure-inventory-auth-functions-qa.mjs output/review/lager-runtime"` → bestået.
- `node scripts/procure-inventory-browser-qa.mjs` mod samme lokale miljø → bestået; ti screenshots og faktisk CSV oprettet.
- `npm run procure:pdf-samples` samt Poppler-rendering af flerside-PDF → 4/4 sider visuelt kontrolleret.

## Statusgrænser

- **Implementeret:** layoutrettelser, konkret kvittering, historik/periode/CSV, runtime-QA og PDF-fortsættelseshoved.
- **Faktisk afprøvet:** almindeligt lokalt login, servercallables, database-/storage-regler, to sessioner, adgangsafvisninger, samtidighed, retry, atomisk fejl, browser ved 360/390/1440 og PDF-rendering.
- **Fortsat uafprøvet:** fysisk telefon/hardwarebrowser. Det er ikke nødvendigt for de krævede CSS-bredder, men er ikke påstået gennemført.
- **Ekstern konfiguration:** produktions-Firebase, rigtig mailtransport, kredentialer og eksterne økonomiintegrationer er ikke anvendt eller ændret.

Ingen push, merge, deployment, offentlig eksponering, produktionsændring, køb, betaling eller leverandørmail er udført.
