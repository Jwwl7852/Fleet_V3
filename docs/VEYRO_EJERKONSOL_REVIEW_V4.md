# Ejerkonsol — V3-opfølgning og lokal acceptstatus

Dato: 2026-09-11

Branch: `codex/ejer-integrated-development`

Miljø: isolerede Firebase-emulatorer og syntetiske reviewdata

## Resultat

V3-opfølgningen er implementeret i det isolerede ejerspor. Den eksisterende
mail-, support-, kunde-, tilbuds-, økonomi- og integrationsarkitektur er bevaret.
Direkte læsning af den samlede kommunikationssamling er lukket; ejerens synlige
tråde udleveres nu af en serverfunktion, som filtrerer delte og private kilder.

Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er fortsat **Ikke tilsluttet**.
Ingen rigtig mail eller kundedata er anvendt.

## Acceptpunkter

| Punkt | Lokal status | Verifikation |
| --- | --- | --- |
| R01 | Bestået | Accepteret tilbudsversion 2 er låst. En ny kladde oprettes som en særskilt version; provisionering bruger fortsat den accepterede version. |
| R02 | Bestået | Gem/slet har konkret bekræftelse. Annullér bevarer data, gem lukker først efter svar, og fejl bevarer redigeringen. |
| R03 | Bestået | Fælles lukke-/navigationstest dækker ESC, fokusretur, ugemte ændringer og browserhistorik. |
| R04 | Bestået | Navigationens grupper bevarer eksplicit åben/lukket tilstand; aktiv route åbner sin gruppe. Rækker og fokusmarkering er tastaturbetjente. |
| R05 | Bestået | Mailtråd, samtale og AI-panel kan rulle uafhængigt på desktop; mobil bruger ét naturligt dokumentflow. |
| R06 | Bestået | Syntetisk personlig Dennis-mail kan ses af Dennis, ikke af Jørn. En delt kundesag er synlig for begge og kan overtages uden at ændre fysisk afsender. |
| R07 | Bestået | Support bruger samme mailtråd, mens interne noter gemmes særskilt og aldrig indgår i kundesvar. Idempotens dækkes af kommunikationstest. |
| R08 | Bestået | Godkendelse og afsendelse er to separate køer/trin. Nyt kundesvar eller ændret status invaliderer en ventende godkendelse. |
| R09 | Bestået | Samtidige godkendelser og gentagne leverancer beskyttes af versions-/idempotensnøgler og servertransaktioner. |
| R10 | Bestået | Kundeopsætningen skelner administratorer fra medarbejder- og chaufførlicenser og viser mængder pr. modul. |
| R11 | Bestået | OBD-hardwarepris `675 kr.` transporteres og gemmes som `67.500 øre` og vises igen som `675 kr.` Hardware og dataabonnement er separate felter. |
| R12 | Bestået | Manglende måling vises som ukendt/utilgængelig; frakoblet telemetri vises ikke som online. |
| R13 | Bestået | Rateblad/version samt rabat på alle eller udvalgte linjer er redigerbart uden at omskrive låste tilbud. |
| R14 | Bestået | Pilot og pilot med efterfølgende drift har kalenderkorrekte start-, slut- og evalueringsdatoer. Drift aktiveres ikke automatisk. |
| R15 | Bestået | Lokal AI-testadapter giver konkrete tekstforslag og indsættelse, men ændrer ikke priser, rabatter, moms eller totaler. |
| R16 | Bestået | Hitrate beregnes af afsluttede muligheder: 104 vundne og 26 tabte giver 80 %. Åbne sager og versionsrækker tælles ikke med. |
| R17 | Bestået | Tomt datagrundlag viser en tekstlig tomtilstand og ikke en misvisende graf. |
| R18 | Bestået | Mobilbilag har kompakt upload/kamera, retry og deduplikering; Dinero-resultater mærkes som testadapter. |
| R19 | Bestået | Den fulde database-/storage-regelpakke består i den reproducerede emulatoropsætning. |
| R20 | Bestået | 360×800, 390×844, 899×900, 1440×900 og 1920×1080 er gennemgået uden dokumentbredde-overflow. |

## Faktisk browserkontrol

`docs/screenshots/ejer-review-v4-final/browser-style-verification.json` dokumenterer:

- `document.fonts.status = loaded` og Inter er indlæst.
- Ejerkomponenter, formularfelter, knapper og tabeller bruger `Inter Variable`.
- Sidebar er 216 px, primære kort har 12 px radius, felter er 40 px og knapper
  42 px i den målte desktopvisning.
- Ingen af de fem målte viewports havde vandret overflow på dokumentniveau.
- `body` uden for ejerskallen beholder browserfallback; hele den aktive
  ejerflade er eksplicit scoped til Inter.

De 15 faktiske screenshots ligger i `docs/screenshots/ejer-review-v4-final/`.

## Verifikation

- Afgrænsede ejer-/regeltests: **44/44 bestået**.
- Design-token-test: **11/11 bestået**.
- Fuld database- og storage-regeltest: **bestået, exit 0**.
- ESLint på alle ændrede ejerfiler: **bestået**.
- Vite-produktionsbuild: **bestået, 530 moduler**.
- Syntetisk review-seed: **bestået**; integrationsstatus ender som
  `ikke_tilsluttet`.

## Reproducerbar emulatoropsætning

Den vellykkede lokale kombination er:

- Firebase CLI `13.35.1`.
- Java `11.0.32.1+1` fra den isolerede Temurin-mappe
  `C:\Users\DennisChristensen\AppData\Local\Temp\veyro-temurin-jdk11\jdk-11.0.32.1+1\bin\java.exe`.
- Node `20.20.2` til emulatorer, seed, tests og build.
- Node `24.19.0` til browseroptagelsen, fordi optagelsesscriptets
  DevTools-WebSocket kræver den globale WebSocket-implementering.

Firebase CLI `15.29.0` afviser Java før 21. Den tidligere Java 21+-besked
beskriver derfor den aktuelle CLI-generation, mens den dokumenterede, vellykkede
JDK 11-kørsel bruger projektets kompatible CLI `13.35.1`. Der er ikke foretaget
en systeminstallation eller en bred dependency-opgradering.

Preview blev startet med projektets owner-emulator Vite-kommando på
`127.0.0.1:5211`; Firebase-emulatorerne blev startet med CLI 13.35.1 og den
isolerede Java-binær. Review-seed og tests bruger kun emulatorværter.

## Ekstern opsætning, som fortsat mangler

- Microsoft 365: verificeret postkassetype, Entra-app, mindst mulige Graph-
  rettigheder, webhook/delta-abonnement og godkendt afsenderopsætning.
- OpenAI: servernøgle, valgt model, aktiv forbrugsgrænse og særskilt aktivering.
- Dinero: testorganisation, OAuth/API-adgang og kontrolleret mapping.
- OCR og bilagsmail: leverandør, modtageadresse og driftsovervågning.
- Godkendt kommercielt rateblad og officielle priser.

Der er ikke pushet, merget, deployet, migreret eller sendt rigtig mail.
