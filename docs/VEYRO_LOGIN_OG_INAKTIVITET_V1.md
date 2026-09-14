# Veyro login og inaktivitetslogout V1

Dato: 14. september 2026  
Arbejdsområde: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-integration`  
Branch: `codex/veyro-integration-v1`  
Start-HEAD: `f7b2483f109abb0898f5d07a97aee592f9c37fb6`  
Implementeringscommit: `8cfd0221d41a4169c4dd9f94782fbcaafb8bc604`

## Resultat

Det godkendte loginforslag E er implementeret som den fælles loginflade for
kundeshellen, leverandørportalen, chaufførfladen, udviklertesteren og
ejerkonsollen. Den eksisterende Firebase-login-, claim-, abonnements-, modul-
og permissionkæde er bevaret. Loginfladen ændrer ikke adgangsregler og har
ingen produktionstilslutning eller skjult demo-fallback.

En central inaktivitetsvagt varsler efter 43 minutter og afslutter den rigtige
Firebase-session efter 45 minutters manglende brugeraktivitet. Vagten dækker
alle autentificerede app-rammer, men ikke demo-mode, som ikke har en rigtig
Firebase-session at afslutte.

Dennis besluttede under slutkontrollen, at SUPPORT-motivet ikke skal bruges,
fordi Support ikke sælges som et særskilt produkt. Motivet, katalogposten,
kildekopien og webkopien er derfor helt udeladt. Loginrotationen består af de
ni resterende godkendte motiver.

## Loginfladen

- Desktop bruger et 60/40-layout med motiv til venstre og formular til højre.
- Mobil stabler motiv og formular uden vandret dokumentoverflow.
- Veyros eksisterende logo genbruges fra
  `src/assets/veyro/veyro-systems-logo.png`; det indsendte logo var
  byte-identisk med denne fil.
- Motiverne vælges tilfældigt, har stabile ID'er og gentager ikke straks det
  senest viste motiv. Kun motiv-ID'et gemmes lokalt.
- Originalerne ligger under `src/assets/login/source/`. Optimerede JPEG-filer
  til produktbuildet ligger under `src/assets/login/web/`.
- Formularen bevarer browserens normale autofill/password-manager-adfærd uden
  for udviklingsmiljøet, har Vis/Skjul adgangskode og bruger den eksisterende
  Firebase-nulstilling af adgangskode.
- Billedfejl giver en lokal Veyro-fallbackflade. Loginformularen forbliver
  funktionel; der hentes ikke et eksternt reservebillede.
- Efter inaktivitetslogout viser loginfladen én neutral besked uden at røbe
  konto- eller tenantoplysninger.

## Billedgrundlag

| ID | Motiv | Logintekst |
|---|---|---|
| `fleet` | FLEET | Overblik over flåden. |
| `facility` | FACILITY | Struktur omkring dine bygninger. |
| `planning` | PLANNING | Overblik over næste opgave. |
| `procure` | PROCURE | Fra behov til levering. |
| `fakturacenter` | FAKTURACENTER | Overblik over bilag og omkostninger. |
| `workforce` | WORKFORCE | Mennesker og opgaver i balance. |
| `warehouse` | WAREHOUSE | Plads til overblik. |
| `unit-booking` | UNIT BOOKING | Styr på enhedernes vej. |
| `samlet-drift` | Samlet drift | Din arbejdsdag samlet ét sted. |

Alle billeder er markeret `AI-genereret illustration` på loginfladen. Den
tekniske gennemgang fandt ingen synlige vandmærker eller læsbare rigtige
kundeoplysninger; skærm- og dokumentindhold i motiverne er sløret. Det er en
teknisk indholdskontrol, ikke en juridisk godkendelse af billedrettigheder.

## Inaktivitet og sikkerhedsgrænse

Aktivitet registreres kun fra faktiske brugerhændelser: pointer/klik,
tastatur, touch, musehjul og scrolling. Baggrundskald, polling, rendering,
tokenfornyelse og fanesynlighed nulstiller ikke tiden. Ved genoptagelse af en
skjult fane vurderes den forløbne tid straks.

Aktivitet deles mellem faner med både `BroadcastChannel` og en `storage`-
hændelse. Nøglen er afgrænset efter bruger-ID, tenant/ejer/devtester-kontekst
og Firebase-sessionens `authTime`. En anden bruger, tenant eller nyere
login-session kan derfor ikke genbruge den tidligere sessions aktivitet.
Kanaler, listeners og interval lukkes ved kontekstskift eller unmount.

Varslet bruger den fælles dialog. ESC og X svarer til den tydelige handling
"Fortsæt arbejdet"; brugeren kan også vælge "Log ud nu". Dialogen advarer om,
at ikke-gemte ændringer kan gå tabt. Der er ikke indført automatisk gemning.

45-minuttersgrænsen håndhæves i klienten ved `auth.signOut()`. Det er ikke en
ny serverregel eller tvungen tokenudløbstid. Backendbeskyttelsen er fortsat
Firebase Auth, claims-v2, revocation, Rules, abonnement og permissions. En
stjålet tokenværdi bliver derfor ikke gjort ugyldig alene af klientens
inaktivitetsur; det kræver fortsat den eksisterende server-/revocationmodel.

## Verifikation

### Automatiske kontroller på implementeringsgrundlaget

| Kontrol | Resultat |
|---|---|
| `npm run lint` | Bestået |
| `npm run test:design` | 11/11 bestået |
| `node --test test/login-inaktivitet.test.mjs` | 7/7 bestået |
| `fleet-v2: vitest run tests/Inaktivitetsvagt.test.jsx tests/LoginE.test.jsx` | 8/8 bestået |
| `node --test test/skrift.test.mjs test/statustal.test.mjs` | 8/8 bestået |
| `npm run build` | Bestået; 744 moduler. Kendt størrelsesadvarsel for Procure-chunk består |
| `git diff --check` | Bestået |

Komponenttesten bruger kontrolleret tid og beviser præcist 43-minutters
varsel, 45-minutters kald til den rigtige `auth.signOut()`, fortsættelse,
isolation mellem sikkerhedskontekster og at baggrundsarbejde ikke tæller som
aktivitet. Billedfejl, Vis/Skjul, nulstillingsvalidering og den neutrale
timeoutbesked er også komponenttestet.

### Browser og isoleret emulator

Den faktiske integrerede app blev startet mod det isolerede syntetiske
Firebase-projekt `demo-veyro-owner` med Auth på `127.0.0.1:9109` og Realtime
Database på `127.0.0.1:9010`. Temurin `21.0.12.1+1` blev brugt med
proceslokale miljøvariabler. Ingen installation, administratorhandling eller
produktionstilslutning blev udført.

- Normalt emulatorlogin med signerede claims og tenant lykkedes.
- To separate browserfaner delte den samme autentificerede session.
- Et faktisk logout i den ene fane sendte begge faner tilbage til login.
- En direkte beskyttet URL efter logout blev afvist og viste login.
- SUPPORT-motivet blev fjernet under kørsel; browserkontrol viste et andet
  motiv og ingen SUPPORT-tekst eller supportbilledreference.
- Den fulde 45-minutters ventetid er ikke afventet manuelt i browseren;
  tidsgrænserne er bevist med kontrolleret tid, mens selve Firebase-logouttet
  og flerfaneresultatet er bevist i browseren.

Responsive målinger for loginfladen:

| CSS-viewport | Motiv/panel | Resultat |
|---|---|---|
| 1440×900 | 864/576 px | 60/40, intet vandret overflow |
| 1920×1080 | 1152/768 px | 60/40, intet vandret overflow |
| 390×844 | stablet | Formular inden for klientbredden; kun nødvendig lodret scroll |
| 360×800 | stablet | Formular inden for klientbredden; kun nødvendig lodret scroll |

Browserens fysiske mobiltastatur og password-manager på en rigtig telefon er
fortsat manuel resttest.

## Fælles sikkerhedsgate

Den fulde `npm run test:rules` blev kørt mod
`demo-fleetcontrol-rules-test` med Database og Storage i isolerede emulatorer.
Windows/Netty krævede, som allerede dokumenteret i repositoryet, at `TEMP` og
`TMP` blev fjernet kun i testprocessen. Gaten nåede hele testsuiten, men er
fortsat rød på syv kendte fælles forhold, som ikke er opstået i loginrunden:

1. Fakturacenterets statiske tekst mangler den krævede afgrænsning om, at
   kontrol ikke er betalingsgodkendelse eller bogføring.
2. Navigationens `enheder`-permission er ikke afstemt med den node, skærmen
   faktisk læser.
3. Den gamle undtagelsesbegrundelse for samme `enheder`-punkt er ikke fjernet.
4. Navigationen kræver `fakturaer.godkend`, som Rules ikke håndhæver.
5. `rules.moduler`-scenariet "fejler åbent" får `permission-denied`.
6. `unitbookingImportHashes` mangler eksplicit read-/beholderklassifikation.
7. WAREHOUSE-reglen tillader fortsat en direkte fysisk ændring af den
   kanoniske unit, som regressionstesten kræver afvist.

Punkt 7 er en reel fælles sikkerhedsblokering og skal lukkes før en samlet
produktionsklar markering. Ingen test eller adgangskontrol er deaktiveret for
at skjule disse resultater.

## Lokal afprøvning

Den autentificerede lokale loginprøve står på:

`http://127.0.0.1:5217/login`

Den syntetiske testadgang oplyses i afleveringen og gemmes ikke i dette
versionsstyrede dokument. Serveren er bundet til localhost og kan kun bruges
på denne computer. Miljøet har Auth og Database til login-/sessionsprøven,
men ikke hele Functions-suiten; funktionsafhængige modulforløb er derfor ikke
dokumenteret som bestået i denne loginrunde.

## Ændrede hovedfiler

- `src/moduler/LoginE.jsx`: fælles loginforslag E.
- `src/fleet/login-billeder.js`: stabilt katalog og ikke-gentaget rotation.
- `src/fleet/Inaktivitetsvagt.jsx` og `src/fleet/inaktivitet.js`: central
  sessionvagt og rene tids-/scopefunktioner.
- `src/App.jsx`: vagten om alle autentificerede app-rammer.
- `src/firebase.js`: sessionens `authTime` som ikke-autoriserende scopefelt.
- `src/fleet/fleet.css`: scoped login-, fallback- og varseldesign med fælles
  tokens.

Der er ikke ændret dependencies eller lockfiler. Der er ikke pushet,
deployet, ændret produktionsdata eller aktiveret eksterne tjenester.
