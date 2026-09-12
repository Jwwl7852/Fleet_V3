# PROCURE – Varelager, vareopsætning og køb med kvittering

Dato: 12. september 2026

## Spor og version

- Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-procure-integrated`
- Branch: `codex/procure-integrated-development`
- Start-HEAD: `3dbc5ab55e5fe85c811d18b1eafb85dcba8ccd36`
- Kodecommit: `39dd9f2` (`feat(procure): simplify inventory and receipt purchases`)
- Preview: `http://127.0.0.1:5208/indkoeb/lager`
- Der er ikke udført push, merge, deployment, produktionsændringer, køb, betalinger eller leverandørmails.

## Kravmatrix

| Krav | Relevant kode/backend | Implementeret adfærd | Faktisk afprøvet | Status / rest |
| --- | --- | --- | --- | --- |
| Forenklet Varelager | `InventoryScreen.jsx`, `procure-inventory-domain.js`, `nav.js` | Menupunkt og titel er “Varelager”. Kun lagerførte varer vises, én række pr. varenummer. Kompatible placeringer summeres; detaljer viser placeringer, bevægelser, optællinger, bestillinger og periodeafstemning. Ukendt beholdning vises som “Ikke optalt”, ikke nul. | Autoriseret Edge-flow ved 1440 px viste én række for EMB-1001, 58 ruller, genbestillingsniveau 10, statusdato og beregnet månedsforbrug. AppShell-arbejdsområdet var `left=250`, `right=1391`; ingen global vandret overflow. | Implementeret og bestået lokalt. |
| Ingen forventning om dagligt udtag | `InventoryScreen.jsx` | “Registrér forbrug” er fjernet som daglig hovedhandling. Historiske udtagsbevægelser og afstemning bevares. | Browserassertion bekræftede, at handlingsteksten ikke findes på Varelager-forsiden. | Implementeret. |
| Beregnet forbrug mellem optællinger | `calculatedConsumptionIntervals`, `materialConsumptionCsv` | Startoptælling + modtagelser + nettoflytninger − retur + øvrige korrektioner − registreret udtag − slutoptælling. Slutoptællingens korrektion tælles ikke igen. Negativt resultat markeres; utilstrækkeligt eller delvist grundlag vises ærligt. Månedsniveau følger faktisk dækkede dage; årsforbrug kræver mindst 330 dages dækning. | Målrettede domænetests dækkede 10 + 6 − 12 = 4, retur/flytning/udtag/korrektion én gang, negativt og manglende grundlag samt CSV. | Implementeret og bestået. |
| Opsætning pr. varenummer | `CatalogItemEditor`, `forbrugsvarerOpdater` | Navn, varenummer, kategori, enheder/pakningsfaktor, standardafdeling, lagerstyring og genbestillingsniveau. Aktivering uden kendt startbeholdning kræver efterfølgende startoptælling; historik slettes ikke. | Autoriseret browser åbnede vareopsætningen og viste alle felter. Lagerført tape vises; ikke-lagerført mælk vises ikke på Varelager. | Implementeret. Omdøb/deaktivering af en konkret kundevare blev ikke gemt i browserflowet. |
| Kundens egne afdelinger | eksisterende `procureOpsaetning/afdelinger`, `MobileOrderScreen`, katalogkurv, behov, køb og ordrebackend | Ingen fast produkt-afdelingsliste. Aktive kundestamdata bruges til varestandard, behov, katalogkurv, mobilkurv, allerede foretaget køb, filtre og analyse. Afdeling gemmes pr. varelinje og følger delindsendelse/godkendelse/ordre. | Runtimeflow oprettede én leverandørordre med linjer til “Administration” og “Varemodtagelse”; fuldt godkendelsesgrundlag blev bevaret. Fremmed tenant blev afvist. | Implementeret og bestået med syntetiske stamdata. |
| Én indgang gennem Ny bestilling | `NewPurchaseScreen.jsx`, `ProcurementWorkspaceScreen.jsx` | Valg A åbner leverandørflowet. Valg B registrerer et allerede foretaget køb uden ordre-mail eller betaling. Begge sagstyper ses i samme bestillingsoversigt. | Desktop- og mobilbrowser viste de to valg. Runtime registrerede to linjer og bekræftede uændret ordreantal, `vendorMailSent=false` og `paymentCreated=false`. | Implementeret. |
| Køb med/uden kvittering | `procureKoebRegistrer`, bilagscallables, Storage-regler og adapter | PDF/JPEG/PNG, maks. 25 MB, magic-bytes, SHA-256, tenantsti og karantæne/aktivering. Køb uden fil får “Kvittering mangler” og kan suppleres på samme køb. Lagerført vare opretter præcis én modtagelsesbevægelse; ikke-lagerført vare gør ikke. | Almindeligt Firebase-login: upload/download havde identiske bytes og SHA-256 `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`; filen blev genåbnet i session 2; efterfølgende bilag blev knyttet til samme køb; ugyldige magic-bytes blev afvist. | Implementeret og bestået lokalt. Ingen OCR er påstået. |
| Firmakort og økonomisk status | købscallable og workspace | Betalingsform gemmes, men registreringen sender ingen ordre, foretager ingen betaling og fremstilles ikke som bogført. | Mobilkvitteringen viste “Afventer udgiftsgodkendelse · ikke bogført”, Firmakort, 144,00 kr. og “Ingen leverandørbestilling er sendt”. | Implementeret. Ekstern kort-/bogføringsintegration er ikke tilsluttet. |
| Forbrug som rapport | `ConsumptionScreen`, `calculatedConsumptionIntervals`, købslinjer og CSV | Lagerførte varer vises som “Beregnet mellem optællinger”; andre som “Indkøbt mængde”. Periode, afdeling, varesøgning, enhed, bagvedliggende køb/optællinger og CSV. Fakturaforbrug og økonomi er fortsat særskilt. | Autoriseret browser genåbnede KOB-referencen og bilaget. Faktisk CSV `procure-materialeforbrug-2026-09.csv` indeholdt perioden `2026-09-01–2026-09-30`, 12 liter mælk og SHA-256 `df3e3e4212b779d99f5054da8d20331bdb2441f828a71229ebc09c07500f5b2d`. | Implementeret og bestået. |
| Mobil, genindlæsning og UUID | `NewPurchaseScreen`, workspace og bilagsbackend | Store kontroller ved 360/390 px. Kvitteringen viser læsbar KOB-reference, ikke intern UUID. Serveren svarer før succes vises. | Fem mobile skærmtrin blev kørt ved 390 px, valg og kvittering også ved 360 px. `clientWidth=scrollWidth`, ingen betjeningselementer lå uden for viewport. Køb og bilag blev genåbnet i en anden autoriseret session. | Implementeret. Fysisk mobilkamera er ikke afprøvet. |
| Retry, samtidighed og adgang | køb-, mobilkladde-, modtagelses- og lagercallables | Idempotens ved køb/modtagelse, revisionskontrol ved lager, tenant/permissions fra authclaims og atomisk registrering. | To autoriserede sessioner; gentaget køb/modtagelse gav ingen dublet; stale optælling gav `ABORTED`; læser uden skriveret og fremmed tenant blev afvist; fejlet lokation gav hverken modtagelse eller bevægelse. | Bestået i lokale emulatorer. |
| 66 kontra 64 ruller | lagerbrowser og særskilt runtime-QA | Browserkvitteringen dokumenterer optælling 68 → 66. Det længere backendflow fortsætter med forbrug, flytning og fysisk retur og ender separat på 64. | Begge tal findes i hvert sit JSON-/screenshotbevis og blandes ikke. | Afstemt. |

## Autoriserede runtimebeviser

Firebase Emulator Suite, projekt `demo-veyro-owner`:

- Auth `127.0.0.1:9109`
- Realtime Database `127.0.0.1:9010`
- Storage `127.0.0.1:9209`
- Functions `127.0.0.1:5012`

Syntetiske brugere loggede ind med almindeligt Firebase-password-login. Signerede claims bar tenant, rolle og permissions. Der blev ikke brugt demo-login, rollevælger eller adgangsbypass.

- `PROCURE_KOEB_AUTH_FUNCTIONS_BEVIS.json`: to sessioner, mixed departments, køb/kvittering, idempotens og tenantafvisning.
- `PROCURE-lager-auth-functions-bevis.json`: modtagelse, optælling, samtidighed, forbrug, retur, flytning, kreditnota uden lagerændring og periodeafstemning.
- `PROCURE_VARELAGER_KOEB_BROWSER_QA.json`: 11 screenshots, viewportmålinger, genåbnet bilag og faktisk CSV.

## Testresultater

- `npm run lint` → bestået.
- `npm run build` → bestået; 648 moduler transformeret.
- `node --test --test-isolation=none test/design-tokens.test.mjs` → 11/11.
- Målrettet PROCURE-/navigation-/referencepakke → 83/83.
- Isoleret Database/Storage-regression via cachet Firebase CLI 13.35.1 og lokal Java 11 → 4.354/4.354, 0 fejl. Projektets `npm run test:rules` med Firebase CLI 15.29 kunne ikke starte på standard-Java 8, fordi CLI 15.29 kræver Java 21; den samme testsuite blev derfor kørt på de dedikerede porte med den kompatible, allerede cachede CLI/runtime.
- `procure-purchase-auth-functions-qa.mjs` → bestået.
- `procure-inventory-auth-functions-qa.mjs` → bestået.
- `procure-varelager-purchase-browser-qa.mjs` → bestået ved 360/390/1440 px.
- Direkte visuel kontrol i den åbne lokale browser bekræftede, at AppShell og Ny bestilling ikke overlapper.

## Afgrænsning

- Implementeret og afprøvet lokalt: funktioner, adgang, filopbevaring, UI, CSV, retry og samtidighed som angivet ovenfor.
- Fortsat uafprøvet: fysisk telefonkamera og kundens faktiske data-/arbejdsgange.
- Ekstern konfiguration: produktions-Firebase, OCR, mail, webshop, kort og bogføring er ikke tilsluttet eller ændret.

