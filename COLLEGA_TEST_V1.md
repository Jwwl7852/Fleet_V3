# VEYRO Version 1 – lokal kollegatest

Denne vejledning kører kun mod lokale Firebase-emulatorer og syntetiske data.
Der kræves ingen produktionsadgang eller private konfigurationsfiler.

## 1. Hent den rigtige branch

```powershell
git clone https://github.com/Jwwl7852/Fleet_V3.git
cd Fleet_V3
git switch --track origin/codex/veyro-integration-v1
```

Hvis repositoryet allerede findes:

```powershell
git fetch origin
git switch codex/veyro-integration-v1
git pull --ff-only
```

## 2. Programmer

- Git 2.45 eller nyere.
- Node.js 24 LTS til app, seed og tests. Functions deklarerer Node.js 20; Firebase CLI kan bruge en installeret Node 20 til fuld Functions-paritet.
- npm 10 eller nyere.
- Java 21 til Realtime Database-emulatoren.
- En moderne Chromium-browser, eksempelvis Edge eller Chrome.

De senest verificerede lokale versioner er Node `24.19.0`, npm `11.17.0`, Git `2.55.0` og OpenJDK `21.0.12.1`.

## 3. Installer og opret lokal konfiguration

```powershell
npm ci
npm --prefix functions ci
Copy-Item .env.v1-colleague.example .env.v1-colleague.local
```

`.env.v1-colleague.local` er git-ignoreret. Eksempelfilen indeholder kun et `demo-*`-projekt, localhost-porte og en konto under `.invalid`.

## 4. Start emulatorer og seed syntetiske data

Åbn terminal 1:

```powershell
npm run v1:colleague:emulators
```

Vent til Auth, Functions, Database og Storage er startet. Åbn derefter terminal 2:

```powershell
npm run v1:colleague:seed
```

Seedet er låst til `demo-veyro-integration` og localhost. Det opretter en syntetisk administrator, tenant, medarbejdere, vagter, fravær, kalenderkategorier, varer og units. Det kan ikke ramme DEV eller produktion.

## 5. Start Version 1

I terminal 2:

```powershell
npm run v1:colleague:dev
```

Åbn `http://127.0.0.1:5197/` og log ind med:

- E-mail: `kollegatest-admin@example.invalid`
- Adgangskode: `Veyro-Kollegatest-Only-2026!`

WORKFORCE-kalenderen findes på `http://127.0.0.1:5197/workforce-v2/kalender`.
Den gamle `/workforce-v2/bemanding`-adresse viderestilles kompatibelt.

## 6. Kontroller

```powershell
npm run lint
npm run build
node --test workforce-v2/tests/workforce-calendar.test.js test/workforce-calendar-navigation.test.mjs
```

Den brede regelgate kan køres separat. Den starter sin egen isolerede Database-/Storage-emulator og kræver, at de porte, der er angivet i `firebase.rules-test.json`, er ledige:

```powershell
npm run test:rules
```

Stop app og emulatorer med `Ctrl+C`. Emulatorindholdet er disponibelt og kan oprettes igen med seedkommandoen.

### Kendt værtsafhængig emulatorfejl

På review-maskinen kunne Firebase Database-emulatoren ikke oprette sin lokale Java-loopback-forbindelse (`Unable to establish loopback connection` / `SocketException: Invalid argument: connect`) med Microsoft OpenJDK 21.0.12.1. Fejlen opstår før VEYRO-kode eller seed køres. Hvis samme fejl ses, skal lokal Java-/firewall-/loopback-konfiguration rettes, eller testen køres på en anden Java 21-maskine. Start ikke seedet, før Database-emulatoren melder klar på port 9000.

## Afgrænsning

- Ingen deployment udføres af kommandoerne ovenfor.
- Ingen produktionsdata eller eksterne integrationer anvendes.
- Design V2 ligger på et separat spor og indgår ikke i denne branchtest.
