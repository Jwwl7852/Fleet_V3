# Veyro login og inaktivitetslogout V1

Dato: 14. september 2026  
Arbejdsområde: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-integration`  
Branch: `codex/veyro-integration-v1`  
Start-HEAD: `f7b2483f109abb0898f5d07a97aee592f9c37fb6`  
Implementeringscommit: `8cfd0221d41a4169c4dd9f94782fbcaafb8bc604`
Katalog- og sikkerhedscommit: `cc8a555e7fe9840e2c4c9d2ce85db64b8cc8f3a3`

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
kildekopien og webkopien er derfor helt udeladt. Loginrotationen består nu af
16 godkendte motiver: præcis to til hvert af modulerne FLEET, FACILITY,
PLANNING, PROCURE, FAKTURACENTER, WORKFORCE, WAREHOUSE og UNIT BOOKING.

Login starter altid på en neutral petrolflade med originalt Veyro-logo. Et
modulmotiv vises først, når loginadressens eksakte origin findes i en minimal,
serverstyret offentlig visningskonfiguration. Ukendt adresse, ugyldigt svar,
netværksfejl og tomt moduludsnit forbliver neutrale. Klienten læser ikke
tenantens beskyttede abonnement, permissions eller database før login.

## Loginfladen

- Desktop bruger et 60/40-layout med motiv til venstre og formular til højre.
- Mobil stabler motiv og formular uden vandret dokumentoverflow.
- Veyros eksisterende logo genbruges fra
  `src/assets/veyro/veyro-systems-logo.png`; det indsendte logo var
  byte-identisk med denne fil.
- Motiverne vælges kun blandt den validerede loginadressens offentligt
  tilladte aktive moduler. De har stabile ID'er og gentager ikke straks det
  senest viste motiv. Kun motiv-ID'et gemmes lokalt, afgrænset med et opaque
  offentligt kontekst-ID, så kundeskift ikke genbruger en anden kundes valg.
- Originalerne ligger under `src/assets/login/source/`. Optimerede JPEG-filer
  til produktbuildet ligger under `src/assets/login/web/`.
- Formularen bevarer browserens normale autofill/password-manager-adfærd uden
  for udviklingsmiljøet, har Vis/Skjul adgangskode og bruger den eksisterende
  Firebase-nulstilling af adgangskode.
- Billedfejl giver den samme neutrale petrolflade. Loginformularen forbliver
  funktionel; der hentes ikke et tilfældigt eller eksternt reservebillede.
- Efter inaktivitetslogout viser loginfladen én neutral besked uden at røbe
  konto- eller tenantoplysninger.

## Billedgrundlag

| Modul | Billede 1 | Billede 2 |
|---|---|---|
| FLEET | `fleet-1` — Overblik over flåden. | `fleet-2` — Din arbejdsdag samlet ét sted. |
| FACILITY | `facility-1` — Struktur omkring dine bygninger. | `facility-2` — Styr på teknik og installationer. |
| PLANNING | `planning-1` — Overblik over næste opgave. | `planning-2` — Planen samlet på én skærm. |
| PROCURE | `procure-1` — Fra behov til levering. | `procure-2` — Fra behov til det rigtige indkøb. |
| FAKTURACENTER | `fakturacenter-1` — Overblik over bilag og omkostninger. | `fakturacenter-2` — Fra bilag til overblik. |
| WORKFORCE | `workforce-1` — Mennesker og opgaver i balance. | `workforce-2` — Samarbejde omkring arbejdsdagen. |
| WAREHOUSE | `warehouse-1` — Plads til overblik. | `warehouse-2` — Varer på rette plads. |
| UNIT BOOKING | `unit-booking-1` — Styr på enhedernes vej. | `unit-booking-2` — Klar til næste udlån. |

Det tidligere billede “Samlet drift” er `fleet-2`. SUPPORT er ikke et modul i
kataloget og har hverken katalogpost eller loginaktiv.

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

## Offentlig loginkontekst

Cloud Function `offentligloginkontekst` accepterer kun `GET`/`OPTIONS` fra en
eksakt origin, som er registreret server-side i secret
`VEYRO_OFFENTLIGE_LOGIN_KONTEKSTER_JSON`. HTTP tillades kun på localhost til
emulatorprøve; kundeadresser kræver HTTPS. Svaret er begrænset til version,
et opaque offentligt kontekst-ID og en allowlist af de otte loginmoduler. Det
indeholder ikke tenant-ID, kundenavn, roller, brugere, permissions, priser
eller den autoritative abonnementsmodel. Ukendte origins får hverken katalog
eller CORS-adgang. Svar caches ikke, og browseren sender ingen credentials.

Konfigurationen er en særskilt offentlig visningsprojektion, ikke en åbning af
`tenants/*/moduler` eller andre beskyttede noder. Den skal vedligeholdes
server-side sammen med en valideret kundespecifik loginadresse. Denne runde
har ikke sat produktionssecret, kundedomæner eller foretaget deployment.

## Verifikation

### Automatiske kontroller på implementeringsgrundlaget

| Kontrol | Resultat |
|---|---|
| `npm run lint` | Bestået |
| `npm run test:design` | 11/11 bestået |
| `node test/login-inaktivitet.test.mjs` | 8/8 bestået |
| `node test/offentlig-login-kontekst.test.mjs` | 3/3 bestået |
| `fleet-v2: LoginE, LoginBilleder, LoginKundekonfiguration og Inaktivitetsvagt` | 15/15 bestået |
| `node --test test/skrift.test.mjs test/statustal.test.mjs` | 8/8 bestået |
| `npm run build` | Bestået; 752 moduler. Kendt størrelsesadvarsel for Procure-chunk består |
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
- Den nye offentlige browserprøve brugte en syntetisk allowlist med kun FLEET,
  WORKFORCE og WAREHOUSE. Otte reloads gav
  `FLEET, WAREHOUSE, FLEET, WORKFORCE, FLEET, WORKFORCE, WAREHOUSE, WORKFORCE`;
  FACILITY blev aldrig vist.
- Motivnavn og billed-URL var byte-for-byte uændrede, mens der blev skrevet i
  e-mailfeltet. En anden ukendt lokal origin målte 0 modulbilleder, 0
  motivtekster, 1 originalt logo og petrolbaggrunden `rgb(8, 127, 143)`.
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

Den lokale visuelle loginprøve med en syntetisk, offentlig modulallowlist står
på:

`http://127.0.0.1:5218/login`

Denne side beviser loginlayout, motivfilter og neutral fejltilstand, ikke et
nyt autentificeret backendforløb. Den syntetiske projektion er proceslokal,
serveren er bundet til localhost og kan kun bruges på denne computer. Den
faktiske produktionsmapping mangler med vilje, fordi denne runde hverken
opretter secrets, deployer Functions eller ændrer kundedomæner.

## Ændrede hovedfiler

- `src/moduler/LoginE.jsx`: fælles loginforslag E.
- `src/fleet/login-billeder.js`: stabilt katalog og ikke-gentaget rotation.
- `src/fleet/login-kundekonfiguration.js`: lukket klientvalidering af den
  minimale offentlige projektion.
- `functions/offentlig-login-kontekst.js` og `functions/index.js`: eksakt
  originmapping uden læsning af beskyttede abonnementsdata.
- `src/fleet/Inaktivitetsvagt.jsx` og `src/fleet/inaktivitet.js`: central
  sessionvagt og rene tids-/scopefunktioner.
- `src/App.jsx`: vagten om alle autentificerede app-rammer.
- `src/firebase.js`: sessionens `authTime` som ikke-autoriserende scopefelt.
- `src/fleet/fleet.css`: scoped login-, fallback- og varseldesign med fælles
  tokens.

Der er ikke ændret dependencies eller lockfiler. Der er ikke pushet,
deployet, ændret produktionsdata eller aktiveret eksterne tjenester.
