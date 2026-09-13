# Veyro ejerkonsol — V5 lokal gennemgang

Dato: 2026-09-11

Worktree: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`

Branch: `codex/ejer-integrated-development`

Kodecheckpoint: `06f71c024d3600b339029bc408a7ac894375d4ab`

Preview: `http://127.0.0.1:5211/login`

## Resultat

Rettelserne efter V4 er implementeret i det isolerede ejerspor. Den konkrete
menufejl er rettet: **Salg → Pipeline → Salg** kan nu foldes sammen og åbnes
igen uden sideskift, og brugerens udtrykkelige valg overskrives ikke længere af
den aktive route. Den samme fælles logik anvendes af de foldbare ejergrupper.

Accepterede tilbud har nu en egentlig låst læsevisning. Tilbudsopfølgning
stoppes, når den relevante tilbudskæde er accepteret eller afvist, også når det
er en ældre version, mens supportforløb bevares. Mail har et fokuseret
mobilforløb med bevaret kladde, og desktopens liste, samtale og AI-panel ruller
uafhængigt. Kundekonto, rapporter, bilag, leverandører, lokale AI-forslag og
pilotopsætning er samtidig rettet og dokumenteret.

Alle viste personer, mails, priser, dokumenter og hændelser er syntetiske.
Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er **Ikke tilsluttet**. Ingen
rigtig mail er sendt, og ingen produktionsdata er anvendt.

## V01–V12

| Punkt | Status | Konkret bevis |
| --- | --- | --- |
| V01 — Låst tilbud | Implementeret, funktionelt og visuelt kontrolleret | Accepteret v2 viser tekst og prislinjer uden redigeringsværktøjer. Ny v3 er en særskilt kladde. Serverens versionslås og uændret accepteret snapshot/PDF dækkes af tilbuds- og ejerflowtests. Se `1920x1080-10-*` og `1920x1080-11-*`. |
| V02 — Opfølgning efter accept | Implementeret og funktionelt kontrolleret | Sendefunktionen genkontrollerer tilbudskædens status umiddelbart før joboprettelse og sætter den gamle opfølgning på pause. Fixtures viser **Stoppet — tilbud accepteret**; support er separat. Se `1440x900-05-*`. |
| V03 — AI-arbejde | Implementeret og visuelt kontrolleret | Lokal testadapter giver konkret forslag ud fra syntetisk sag, sælgerinstruktion og revideret tekst. Indsæt er kun aktivt ved et gyldigt forslag og aldrig i låst version; økonomiske felter ændres ikke af AI-handlingen. Se `1920x1080-11-*`. Ekstern OpenAI er ikke aktiveret. |
| V04 — Rateblad og rabat | Implementeret og regressionstestet | Moduler, administrative/operative brugere, enheder og OBD har numeriske antal. Alle/udvalgte prislinjer og sekventiel rabatberegning bruger den eksisterende serverkontrakt og versionskilde. Genindlæsning indgår i ejerflowtesten. |
| V05 — Pilot og aftale | Implementeret og regressionstestet | Begge pilottyper dækkes af domænetesten. Månedsslutning beregnes kalenderkorrekt, og vejledende drift er en separat fase uden automatisk aktivering. Se `1920x1080-11b-*`. |
| V06 — Mobilmail | Funktionelt og visuelt kontrolleret | 360×800 og 390×844 viser liste og fokuseret samtale som separate trin. Tilbage-navigation bevarer sag og lokal kladde; målefilen registrerer `bevaret: true` og ingen dokumentbredde-overflow. |
| V07 — Desktopscroll | Funktionelt målt | Liste, samtale og AI-panel har hver egen målbar scrollhøjde. Testscroll flyttede dem henholdsvis 25, 80 og 80 px uden at flytte de andre paneler. Se `interaction-verification.json`. |
| V08 — Dialoger og menu | Implementeret, funktionelt og visuelt kontrolleret | Pipeline forbliver på `/main/salg/pipeline`, mens Salg skifter `aria-expanded` true → false → true og skjulte underpunkter går 4 → 0 → 4. Mobilnav, ESC/fokusretur og bekræftelsesdialog er kontrolleret. Se `1440x900-20-*`, `899x900-19-*` og `1440x900-13b-*`. |
| V09 — Licenser | Implementeret og visuelt kontrolleret | Den syntetiske konto viser fem unikke personer, to administratorer og flere rettigheder uden dobbelttælling. Aftalte, målte og håndhævede tal er særskilte; manglende kilder vises som ukendte. Se `*-kundekonto-brugere-enheder.png`. |
| V10 — Rapporter | Implementeret og visuelt kontrolleret | Hitrate er 104 / (104 + 26) = 80 %. Mest efterspurgte moduler samt aftalte/målte brugere og enheder har definition, filter og drilldown; manglende målinger er ikke nul. Se `1920x1080-06-*`. |
| V11 — Bilag | Lokalt implementeret og adaptertestet | Upload og billedhandling er tydelige, og lokal fixture dækker billedkontrol, retry og dubletbeskyttelse. Fysisk kamera er ikke påstået testet; det kræver en rigtig telefon. Se `1440x900-12-*`. |
| V12 — Design og adgang | Bestået lokalt | Inter er faktisk indlæst på body, skal, felter og knapper. Målt: 14 px / 20,3 px, sidebar 216 px, kortradius 12 px og ingen dokumentbredde-overflow på de målte viewports. Ejeradgang og ændrede serverkontrakter indgår i de 97 beståede tests. |

## R01–R20 efter V5

R01–R20 fra V4 er fortsat bestået. R04 er skærpet: en aktiv underside åbner kun
gruppen som standard, når der ikke findes et gemt brugervalg. Manuel lukning
respekteres gennem genrendering og ændrer ikke route eller sidedata. R05 er nu
dokumenteret med faktiske scrollpositioner, og R15 har et synligt lokalt
AI-forslag i stedet for en forbindelsespladsholder. R08–R09 er udvidet med den
umiddelbare kontrol af accepteret/afvist tilbud før opfølgningsjobbet oprettes.

## Browser- og interaktionsmålinger

`docs/screenshots/ejer-review-v5/browser-style-verification.json` viser:

- `document.fonts.status = loaded`.
- `Inter Variable` er indlæst og anvendt på body, ejerskal, felter og knapper.
- Brødtekst er 14 px med 20,3 px beregnet linjehøjde.
- Sidebar er 216 px og primære kort har 12 px radius.
- Den målte desktop- og mobilvisning har ikke vandret dokumentoverflow.

`interaction-verification.json` dokumenterer menufoldning, de tre uafhængige
desktop-scrollområder samt bevaret mobilkladde. `capture-manifest.json` binder
hver optagelse til route, viewport, fixture og kodecommit.

## Genkørt verifikation mod V5-koden

- Målrettet ejer-, adgangs-, tilbuds-, kundekonto-, M365/AI-, kommunikations-,
  design- og V5-suite: **97/97 bestået**.
- Målrettet ESLint på alle ændrede JS/JSX- og testfiler: **bestået**.
- Vite-produktionsbuild: **bestået**, 531 moduler.
- Syntetisk ejerflow fra tom emulator: **bestået**.
- Faktura-, delbetalings-, kreditnota- og bilagsflow: **bestået**.
- Normal login gennem Auth-emulatoren: **bestået**; ingen auth-omgåelse.
- Faktiske viewports: 360×800, 390×844, 899×900, 1440×900 og 1920×1080.

Screenshots dokumenterer layout og synlige tilstande. Interaktionsmålingerne og
de automatiske tests er beviset for scroll, kladdebevarelse, menufoldning,
versionslås, beregninger og adgang.

## Lokal gennemgang

1. Åbn `http://127.0.0.1:5211/login`.
2. Brug den normale lokalt forudfyldte test-ejerformular, og vælg **Log ind**.
   Adgangsoplysninger skal ikke kopieres ud af emulatoren eller deles.
3. Gennemgå især **Salg → Pipeline** og fold Salg sammen/ud igen.
4. Åbn **Tilbud**, sammenlign accepteret v2 med den særskilte kladde v3, og
   gennemgå lokal AI-testadapter samt rateblad/pilot.
5. Åbn **Mail → Indbakker**, **Mail → Opfølgning**, **Support**, **Kunder →
   Administrér kundekonto**, **Rapporter**, **Bilagsindbakke**, **Leverandører**
   og **Indstillinger → Integrationer**.

Previewet og emulatorerne blev genbrugt fra det korrekte worktree og efterlades
kørende til lokal gennemgang.

## Reproducerbart lokalmiljø

- Firebase CLI `13.35.1`.
- Temurin JDK `11.0.32.1+1` til den kompatible emulatorsuite.
- Node `20.20.2` til emulatorer, seed, tests og build.
- Node `24.19.0` til DevTools-baseret screenshotoptagelse.
- Firebase-projekt: `demo-veyro-owner`; Auth 9099, Functions 5001, Database
  9000 og Storage 9199.

CLI 15 kræver Java 21+, men den dokumenterede JDK 11-kørsel bruger projektets
kompatible Firebase CLI 13.35.1. Der er ikke foretaget en global Java- eller
Node-installation.

## Resterende ekstern opsætning

- Microsoft 365: verificér om `info@veyrosystems.com` er delt postkasse,
  selvstændig postkasse eller alias; opret Entra-app, mailbox-scope,
  webhook/delta og Send As-rettigheder med mindst mulige privilegier.
- OpenAI: serverhemmelighed, godkendt model, håndhævet forbrugsgrænse og
  særskilt aktivering med syntetisk prøve.
- Dinero: testorganisation, OAuth/API-adgang og verificeret mapping.
- OCR og bilagsmail: leverandør, indgående adresse, retention og overvågning.
- Fysisk mobiltest af kamera og platformens filvælger.
- Godkendt kommercielt rateblad og officielle priser.

Der er ikke udført push, merge, deployment, produktionsmigration, bogføring
eller virkelig mailafsendelse.
