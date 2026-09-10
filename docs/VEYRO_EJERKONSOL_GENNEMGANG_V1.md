# Veyro ejerkonsol — lokal gennemgang

Opdateret: 2026-09-11

## Formål og afgrænsning

Denne vejledning genskaber en isoleret gennemgang af ejerkonsollen med normale
Firebase Auth-, Database-, Functions- og Storage-emulatorer. Alle personer,
virksomheder, adresser, priser, mails, dokumenter og økonomiposter er syntetiske
testfixtures. Der bruges ikke demo-mode, guards omgås ikke, og ingen ekstern
integration eller produktionskonto aktiveres.

Preview: `http://127.0.0.1:5211/`

## Sikker loginprocedure

1. Kontrollér, at URL'en er præcis `http://127.0.0.1:5211/login`, og at
   projektmærket er `demo-veyro-owner`.
2. Den lokale, git-ignorerede fil `.env.owner-emulator.local` udfylder formularen
   med en syntetisk tenantløs ejer. Del eller kopier ikke værdierne til chat,
   commits eller tickets.
3. Vælg **Log ind**. Det er det normale Firebase Auth-flow mod `127.0.0.1:9099`.
4. Kontrollér i venstremenuens bund, at identiteten beskrives som
   `Tenantløs ejeridentitet`. Brug ikke demo-mode eller en tenantbruger.

Hvis den lokale fil mangler, kopieres feltnavnene fra den trackede
`.env.owner-emulator.example`, men værdierne opbevares kun i den ignorerede
lokalfil. Der skal ikke oprettes en produktionsbruger.

## Faktisk anvendt testmiljø

| Del | Verificeret version/port |
|---|---|
| Windows-shell | PowerShell |
| Node til emulator, Functions, Vite og fixtures | `v20.20.2` (isoleret mappe) |
| Repositoryets normale shell-Node | `v24.19.0` |
| npm | `11.17.0` |
| Vite | `5.4.21` |
| Firebase CLI | `13.35.1` fra lokal npx-cache |
| Java | Temurin OpenJDK `11.0.32.1+1` fra isoleret mappe |
| Auth | `127.0.0.1:9099` |
| Realtime Database | `127.0.0.1:9000` |
| Functions | `127.0.0.1:5001` |
| Storage | `127.0.0.1:9199` |
| Emulator Hub | `127.0.0.1:4400` |
| Vite preview | `127.0.0.1:5211` |

JDK 21+ var den oprindeligt forventede retning og blev også fundet og afprøvet.
På denne Windows-maskine ramte Firebase CLI 15.29.0 imidlertid en reproducerbar
AF_UNIX-fejl. Den suite, der faktisk startede og bestod, brugte derfor den
isolerede JDK 11 og CLI 13.35.1. Det er ikke en påstand om et generelt
produktionskrav; det er den dokumenterede lokale kompatibilitetsvej. Systemets
Java 8-installation blev ikke ændret eller overskrevet.

Functions-discovery krævede ved en kold opstart
`FUNCTIONS_DISCOVERY_TIMEOUT=60000`; alle ejer-callables blev derefter indlæst.
CLI'ens advarsel om manglende Firebase-login er forventet for et `demo-*`-projekt
og gav ingen adgang til ikke-emulerede tjenester.

## Vellykkede startkommandoer

Kør fra ejer-worktree'en. Stierne nedenfor er de faktiske stier på denne maskine.

```powershell
$jdk = 'C:\Users\DennisChristensen\AppData\Local\Temp\veyro-temurin-jdk11\jdk-11.0.32.1+1'
$nodeexe = 'C:\Users\DennisChristensen\AppData\Local\Temp\veyro-node20\node-v20.20.2-win-x64\node.exe'
$clijs = 'C:\Users\DennisChristensen\AppData\Local\npm-cache\_npx\a2c365da195827f4\node_modules\firebase-tools\lib\bin\firebase.js'
$env:JAVA_HOME = $jdk
$env:Path = ((Join-Path $jdk 'bin') + ';' + (Split-Path $nodeexe) + ';' + $env:Path)
$env:CI = '1'
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = '1'
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60000'
$env:GCLOUD_PROJECT = 'demo-veyro-owner'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000'
$env:FIREBASE_FUNCTIONS_EMULATOR_HOST = '127.0.0.1:5001'
$env:FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'
& $nodeexe $clijs emulators:start --only auth,database,functions,storage --config firebase.json --project demo-veyro-owner
```

I en anden PowerShell med samme fem projekt-/emulatorvariabler:

```powershell
& $nodeexe scripts/seed-owner-emulator.mjs
& $nodeexe scripts/test-owner-flow-emulator.mjs
& $nodeexe scripts/test-owner-invoice-emulator.mjs
& $nodeexe --env-file=.env.owner-emulator.local scripts/seed-owner-review-emulator.mjs

$env:Path = ((Split-Path $nodeexe) + ';' + $env:Path)
npm run dev -- --host 127.0.0.1 --port 5211 --strictPort --mode owner-emulator
```

Fixture-rækkefølgen er bevidst: det accepterede tilbud og den provisionerede
tenant oprettes før fakturagrundlaget fryses. `npm run ejer:review:seed` kan
bruges som navn for det sidste trin; scriptet afviser at køre, hvis testkoden
ikke findes i den git-ignorerede lokalfil.

## Sammenhængende gennemgang

1. **Dagens overblik:** kontrollér den mærkede `TESTADAPTER`-sag og at Microsoft
   365, OpenAI, Dinero og bilagsmail/OCR står som `Ikke tilsluttet`.
2. **Salg → Salgsindbakke:** åbn forespørgslen. Den er koblet til Maria Eksempel,
   Nordlys Drift ApS, salgsmuligheden og tilbud `T-2026-0001 · v2`. Alle mails og
   interne noter er eksplicit mærket som syntetiske fixtures.
3. **AI-analyse:** vis opsummering, udledte behov, modulstatus, manglende data,
   kildepassage og svarudkast. Resultatet er en statisk testadapterfixture;
   OpenAI er ikke kaldt.
4. **Opfølgning:** vis status `Godkendt`. Knappen betyder, at den konkrete kladde
   er godkendt, men Microsoft 365 er ikke tilsluttet, og der sendes ingen mail.
5. **Salg → Rateblad:** vælg perioden `2026-09`. Vis den gældende og den kommende
   uforanderlige prisliste samt det låste Nordlys-grundlag på 2.700 kr. ekskl.
   moms. Tallene er eksempelpriser i emulatoren, ikke officielle Veyro-priser.
6. **Salg → Tilbud:** åbn `T-2026-0001`. Vis version 2, de adskilte månedslinjer,
   introduktionsrabatten, acceptregistreringen og den stabile aftalenøgle.
7. **Administration → Abonnementer:** åbn Nordlys. Vis aktiv Fleet-adgang,
   aftalen og den afventende `.invalid`-invitation. Invitationstokenet vises eller
   deles ikke; den giver kundeadmin, aldrig ejeradgang.
8. **Økonomi → Fakturaer:** vis septemberfakturaen på 3.375 kr. inkl. moms og
   status `delvist betalt`. `sendt` og ekstern reference stammer fra den lokale
   Dinero-testadapter; integrationskortet forbliver `Ikke tilsluttet`.
9. **Økonomi → Kreditnotaer:** vis delkreditten på 844 kr. og den resterende
   krediterbare saldo. Ingen virkelig Dinero-post er oprettet.
10. **Økonomi → Bilagsindbakke:** vis det matchede fixturebilag og det separate
    sandsynlige dubletfund. Filupload er lokal; mailindbakke og OCR er ikke
    tilsluttet.
11. **Økonomi → Økonomioverblik:** gennemgå datadækning, restbeløb og links til
    kilderne. Tallene er et blandet isoleret testdatasæt og må ikke opfattes som
    Veyros bogføring.
12. **System → Integrationer:** afslut med den autoritative oversigt, hvor alle
    virkelige eksterne forbindelser fortsat er frakoblede.

## Datakilder og bevisniveau

| Område | Kilde i gennemgangen | Verificeret |
|---|---|---|
| Login og ejeradgang | Firebase Auth + claims i emulator | Normalt login og tenantløs ejerroute |
| CRM, tilbud, aftale og invitation | Database/Functions-emulatorer | Vedvarende serverflow og genkørsel |
| Tilbuds-PDF og økonomidokumenter | Storage/Functions-emulatorer | Lokal versions-/snapshotknytning |
| AI-analyse og svar | Statisk, mærket testadapterfixture | UI og datamodel; intet OpenAI-kald |
| Salgsmail/opfølgning | Statisk mailfixture og lokal outboxstatus | Godkendelsesstatus; intet Graph-kald |
| Faktura/kredit/retur | Isoleret Dinero-testadapter | Lokal kontrakt- og fejllogik; intet Dinero-kald |
| Bilag/OCR | Lokal filfixture; OCR frakoblet | Hash, dublet og match; ingen leverandørintegration |

Previewet er kun tilgængeligt, mens de to lokale processer kører. En genstart af
emulatorerne nulstiller data; kør fixture-rækkefølgen igen.

## Skærmbilleder

- `docs/screenshots/ejer-review/01-overblik.png`
- `docs/screenshots/ejer-review/02-salgsindbakke-ai.png`
- `docs/screenshots/ejer-review/03-ai-opfoelgning.png`
- `docs/screenshots/ejer-review/04-tilbud-v2-accept.png`
- `docs/screenshots/ejer-review/05-frosset-grundlag.png`
- `docs/screenshots/ejer-review/06-aftale-invitation.png`

## Rettelsesrunde 2026-09-11 — samlet kundekonto

Efter normalt login kan den nye, samlede konto åbnes på tre måder:

1. **Salg → Kunder → Kundekonto / Administrér kundekonto**.
2. **Administration → Abonnementer → Administrér kundekonto**.
3. Direkte `/main/kunder/<tenant-id>`; siden falder tilbage til kunde- og
   abonnementsoversigterne, hvis den ikke har intern navigationshistorik.

Den lokale syntetiske flowfixture kan gennemgås direkte på
`/main/kunder/flow-tenant`. Fanerne **Brugere og enheder**, **OBD** og
**Abonnement og priser** viser henholdsvis aftalt/målt/håndhævet omfang,
hardware kontra dataabonnement og den accepterede, låste tilbudsversion.
Invitationer afprøves kun som lokal status; der sendes ingen mail.

Den reproducerbare browsercapture køres med Node 24.19.0, mens preview og de
fire Firebase-emulatorer allerede kører:

```powershell
node scripts/capture-owner-review.mjs
```

Scriptet starter en isoleret headless Edge-profil, bruger den normale lokale
loginformular, udskriver ingen loginværdier og fjerner profilen bagefter.
Resultatet ligger i `docs/screenshots/ejer-review-v2/`:

- `1440x900-01-overblik.png`
- `1440x900-02-salgsindbakke.png`
- `1440x900-03-kundekonto-brugere-enheder.png`
- `1440x900-04-kundekonto-obd.png`
- `1920x1080-05-kundekonto-priser.png`
- `1920x1080-06-integrationer.png`
- `899x900-07-mobil-kundekonto.png`
- `899x900-08-mobil-navigation-aaben.png`
- `browser-style-verification.json`

Den målte app-font er `Inter Variable` på ejerskal, indhold, formularfelter og
faner; `document.fonts.check('14px "Inter Variable"')` er sand. JSON-filen
gemmer de konkrete computed styles. `body` arver ikke app-typografien, men hele
den interaktive ejerflade gør; det er en bevidst scope-afgrænsning, så andre
Veyro-moduler ikke ændres af ejersporet.
