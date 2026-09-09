# Veyro moduludviklingsspor v1

Dato: 2026-09-09

Fælles produktbase: `989dbb87db639efed0ba1b5a1e271560f7659a0c`

Integrationsbranch: `codex/veyro-integration-v1`

Dette dokument fordeler arbejdet efter samlingen af FLEET, FACILITY,
PLANNING og FAKTURACENTER. De fire modulbranches er oprettet direkte fra det
præcise fælles produktcommit. Dokumentationscommits, der senere lægges på
integrationsbranchen, ændrer ikke modulbranchernes aftalte produktbase.

## Udviklingsspor

| Modul | Lokal branch | Absolut worktree | Integreret route | Foreslået lokal port |
|---|---|---|---|---:|
| FLEET | `codex/fleet-integrated-development` | `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-fleet-integrated` | `/fleet-v2` | 5201 |
| FACILITY | `codex/facility-integrated-development` | `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-facility-integrated` | `/facility-v2` | 5202 |
| PLANNING | `codex/planning-integrated-development` | `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-planning-integrated` | `/planning-v2` | 5203 |
| FAKTURACENTER | `codex/fakturacenter-integrated-development` | `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-fakturacenter-integrated` | `/oekonomi/fakturacenter` | 5204 |

Alle fire branches starter på `989dbb87db639efed0ba1b5a1e271560f7659a0c`
og står lokalt uden upstream. De må ikke sættes til at følge
`origin/codex/veyro-integration-v1`; deres første publicering skal bruge deres
eget branch-navn.

De oprindelige prototypeworktrees og branches bevares. I særdeleshed forbliver
det igangværende PLANNING-arbejde i den primære checkout adskilt og må ikke
flyttes, kopieres eller indarbejdes automatisk.

## Ejerskab

Modulchatten ejer som udgangspunkt:

- modulets komponenter og egne styles;
- domænelogik, fixtures og lokale repository-/adapterimplementeringer;
- modulets enheds-, komponent-, kontrakt- og browsertests;
- dokumentation, der kun beskriver modulets egen adfærd.

Integrationschatten ejer og koordinerer:

- root-routing i `src/App.jsx`, fælles navigation i `src/fleet/nav.js` og
  modulwrappers under `src/moduler/`;
- `src/fleet/AppShell.jsx`, login, bruger-/tenantkontekst, claims,
  permissions og moduladgang;
- `firebase.rules.json`, `storage.rules`, Cloud Functions og øvrige
  sikkerheds-/backendgrænser;
- de fælles designtokens og globale platformstyles, inklusive deres
  beslutnings- og snapshottests;
- fælles kontrakter, herunder Fakturacenter Reference Contract V1;
- rootens `package.json`, lockfil, Vite-konfiguration, workflows og andre
  dependencies/buildfiler.

En modulchat må gerne identificere et behov i en fælles fil, men skal beskrive
den konkrete ønskede ændring, begrundelsen, berørte ruter/permissions og de
forventede tests til integrationschatten. Ændringen koordineres dér, før den
udføres eller sammenlægges. Et modul må ikke etablere en ekstra AppShell,
tenantvælger, loginvej eller global temakilde.

### Modulspecifikke kodegrænser

FLEET ejer især:

- `fleet-v2/src/` og `fleet-v2/tests/`;
- komponenter i `fleet-v2/src/components/`;
- domæne-, fixture-, adapter- og repositorykode i `fleet-v2/src/data/`;
- modulstyles i `fleet-v2/src/styles/`.

Integrationspunkterne `src/moduler/flaade/FleetV2Module.jsx`,
`src/fleet/fleet-v2-integration.js`, root-ruter og fælles navigation
koordineres af integrationschatten.

FACILITY ejer især:

- `facility-v2/src/` og `facility-v2/tests/`;
- komponenter, routes og routingadapter i `facility-v2/src/components/`,
  `facility-v2/src/routes/` og `facility-v2/src/routing/`;
- domæne- og repositorylag i `facility-v2/src/domain/` og
  `facility-v2/src/data/`;
- modulstyles i `facility-v2/src/styles/`.

Integrationspunkterne `src/moduler/facility/FacilityV2Module.jsx`,
`src/fleet/facility-v2-integration.js`, root-ruter, React/Router-deduplikering
og fælles navigation koordineres af integrationschatten.

PLANNING ejer især:

- de rene lag under `src/fleet/planning-input/`, `planning-optimization/`,
  `planning-scheduling/`, `planning-execution/` og `planning-adapters/`;
- `src/fleet/planning-ui/`, de øvrige `planning-basic*`-filer og de tilhørende
  tests under `test/planning-*` og `test/planning-*/`;
- standalone-indgangen `planning-demo.html`, så længe den fortsat skal kunne
  bruges uden den fælles shell.

Integrationspunkterne `src/moduler/booking/PlanningV2Module.jsx`,
`src/fleet/planning-v2-integration.js`, root-ruter og fælles navigation
koordineres af integrationschatten.

FAKTURACENTER ejer især:

- `src/moduler/oekonomi/Fakturacenter*.jsx`,
  `src/moduler/oekonomi/fakturacenter-ui.js` og
  `src/moduler/oekonomi/FakturacenterIntake.css`;
- `src/fleet/fakturacenter-intake.js`,
  `src/fleet/demo-fakturacenter-intake.js` og
  `src/fleet/fakturacenter-adapters/`;
- Fakturacenter-tests under `test/`.

Ruten, AppShell-navigationen og adgangsgaten koordineres af
integrationschatten. `docs/FAKTURACENTER_REFERENCE_CONTRACT_V1.md` er en fælles
kontrakt og må ikke ændres som en almindelig modulfil.

## Arbejdsgang for en modulleverance

1. Kør `git fetch origin` og kontrollér branch, arbejdsstatus og forskellen til
   `origin/codex/veyro-integration-v1`. En enkel kontrol er
   `git rev-list --left-right --count HEAD...origin/codex/veyro-integration-v1`.
2. Bevar altid lokalt arbejde før fælles opdateringer. Commit en afgrænset
   leverance eller lav en særskilt sikkerhedsbranch; brug ikke reset eller
   overskrivning. Hvis integrationsbranchen er nyere, gennemgå dens commits og
   indarbejd dem kontrolleret. En merge ind i modulbranchen bevarer historik;
   konflikter i fælles filer koordineres med integrationschatten.
3. Implementér kun modulets aftalte ændring i den integrerede variant. Kør
   modulets egne tests og relevante root-, kontrakt-, adgangs-, browser- og
   buildkontroller.
4. Commit ændringen på modulbranchen. Aflever til integrationschatten med
   fuldt commit-ID, præcis ændringsbeskrivelse, ændrede fælles grænser,
   testkommandoer/resultater og kendte begrænsninger.
5. Integrationschatten sammenlægger én leverance ad gangen, løser fælles
   konflikter fagligt og kontrollerer alle berørte moduler samt det samlede
   program.
6. En modulændring findes kun på modulets egen lokale adresse, indtil den er
   integreret. Den vises først på `http://127.0.0.1:5197/`, når den er med i
   integrationsbranchen og den fælles server er genstartet på det nye HEAD.

## Lokal afprøvning fra modulworktrees

Port 5197 er reserveret til den sikrede samlede integrationsversion og skal
fortsat køre uændret. Brug følgende særskilte porte med Vites `strictPort`, så
en optaget port giver en tydelig fejl i stedet for et lydløst portskift:

| Spor | Adresse | FLEET IndexedDB-navn | FACILITY IndexedDB-navn |
|---|---|---|---|
| FLEET | `http://127.0.0.1:5201/` | `veyro-fleet-v2-fleet-integrated-dev-v1` | `veyro-facility-v2-fleet-integrated-dev-v1` |
| FACILITY | `http://127.0.0.1:5202/` | `veyro-fleet-v2-facility-integrated-dev-v1` | `veyro-facility-v2-facility-integrated-dev-v1` |
| PLANNING | `http://127.0.0.1:5203/` | `veyro-fleet-v2-planning-integrated-dev-v1` | `veyro-facility-v2-planning-integrated-dev-v1` |
| FAKTURACENTER | `http://127.0.0.1:5204/` | `veyro-fleet-v2-fakturacenter-integrated-dev-v1` | `veyro-facility-v2-fakturacenter-integrated-dev-v1` |

Første gang i et nyt worktree kan dependencies installeres med `npm ci`.
Det er ikke udført som del af oprettelsen. Uden `.env.local` starter rootappen
i repositoryets syntetiske demo-mode og forbinder ikke til Firebase. Kopiér
ikke integrationens eller en gammel prototypes `.env.local` ind i worktreeet.

Eksempel for FLEET-sporet i PowerShell:

```powershell
Set-Location 'C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-fleet-integrated'
$env:VITE_FLEET_V2_DATABASE_NAME = 'veyro-fleet-v2-fleet-integrated-dev-v1'
$env:VITE_FACILITY_V2_DATABASE_NAME = 'veyro-facility-v2-fleet-integrated-dev-v1'
npm run dev -- --host 127.0.0.1 --port 5201 --strictPort
```

Brug samme mønster og tabellens navne/port i de andre worktrees. Variablerne
sættes kun for den aktuelle PowerShell-proces og indeholder ingen hemmeligheder.
Separate porte giver også separate browser-origins. Dermed holdes FLEETs og
FACILITYs IndexedDB/Blob-data, Fakturacenterets lokale UI-præferencer samt
PLANNINGs hukommelses- og BroadcastChannel-tilstand adskilt fra port 5197 og
de oprindelige prototyper.

Hvis en opgave kræver autentificerede emulatorbrugere, skal den eksisterende
emulatoropsætning aftales med integrationschatten. Et modul-worktree må ikke
starte, nulstille eller seede fælles emulatorer og må aldrig bruge en rigtig
backend som utilsigtet standard. Legitime lokale nøgler bliver i en ignoreret
`.env.local` og må ikke skrives i dokumentation, commits eller startkommandoer.

## Overleveringstekst — FLEET

Arbejd fremover i
`C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-fleet-integrated` på
branch `codex/fleet-integrated-development`. Branchen starter fra den sikrede
fælles base `989dbb87db639efed0ba1b5a1e271560f7659a0c`. FLEET er integreret på
`/fleet-v2`. De primære modulplaceringer er `fleet-v2/src/` og
`fleet-v2/tests/`; integrationen går gennem
`src/moduler/flaade/FleetV2Module.jsx` og
`src/fleet/fleet-v2-integration.js`.

Alt nyt FLEET-arbejde skal udføres og testes i denne integrerede variant. FLEET-
chatten ejer modulkomponenter, domænelogik, lokale adaptere/repositories og
tests. Ændringer i root-routing, AppShell, navigation, login, permissions,
tema, fælles kontrakter eller root-dependencies beskrives konkret og
koordineres gennem integrationschatten. Aflever fuldt commit-ID,
ændringsbeskrivelse og testresultater til integration. Den gamle prototype i
`C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-fleet-v2` på
`codex/fleet-v2-development` bevares; eventuelt nyere arbejde dér indgår ikke
automatisk og må ikke kopieres ukritisk.

## Overleveringstekst — FACILITY

Arbejd fremover i
`C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-facility-integrated`
på branch `codex/facility-integrated-development`. Branchen starter fra den
sikrede fælles base `989dbb87db639efed0ba1b5a1e271560f7659a0c`. FACILITY er
integreret på `/facility-v2`. De primære modulplaceringer er
`facility-v2/src/` og `facility-v2/tests/`; integrationen går gennem
`src/moduler/facility/FacilityV2Module.jsx` og
`src/fleet/facility-v2-integration.js`.

Alt nyt FACILITY-arbejde skal udføres og testes i denne integrerede variant.
FACILITY-chatten ejer modulkomponenter, routes, domænelogik, lokale
adaptere/repositories og tests. Ændringer i root-routing, AppShell, navigation,
login, permissions, tema, fælles kontrakter, Router-deduplikering eller root-
dependencies beskrives konkret og koordineres gennem integrationschatten.
Aflever fuldt commit-ID, ændringsbeskrivelse og testresultater til integration.
Den gamle prototype i
`C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-facility-v2` på
`codex/facility-v2-development` bevares; eventuelt nyere arbejde dér indgår
ikke automatisk og må ikke kopieres ukritisk.

## Overleveringstekst — PLANNING

Arbejd fremover i
`C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-planning-integrated`
på branch `codex/planning-integrated-development`. Branchen starter fra den
sikrede fælles base `989dbb87db639efed0ba1b5a1e271560f7659a0c`. PLANNING er
integreret på `/planning-v2`. De primære kodeplaceringer er
`src/fleet/planning-ui/`, `src/fleet/planning-input/`,
`src/fleet/planning-optimization/`, `src/fleet/planning-scheduling/`,
`src/fleet/planning-execution/`, `src/fleet/planning-adapters/` og deres tests
under `test/`. Integration går gennem
`src/moduler/booking/PlanningV2Module.jsx` og
`src/fleet/planning-v2-integration.js`.

Alt nyt PLANNING-arbejde skal udføres og testes i denne integrerede variant.
PLANNING-chatten ejer UI, domænelag, offentlige adaptergrænser, fixtures og
tests. Ændringer i root-routing, AppShell, navigation, login, permissions,
tema, fælles kontrakter eller root-dependencies beskrives konkret og
koordineres gennem integrationschatten. Aflever fuldt commit-ID,
ændringsbeskrivelse og testresultater til integration. Den gamle sikrede
prototype i `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-planning`
på `codex/planning-ui-reference-v1` og det nyere igangværende PLANNING-arbejde
i den primære checkout bevares. Intet derfra indgår automatisk eller må
flyttes ind uden særskilt gennemgang.

## Overleveringstekst — FAKTURACENTER

Arbejd fremover i
`C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-fakturacenter-integrated`
på branch `codex/fakturacenter-integrated-development`. Branchen starter fra
den sikrede fælles base `989dbb87db639efed0ba1b5a1e271560f7659a0c`.
FAKTURACENTER er integreret på `/oekonomi/fakturacenter` med sektioner via
`?sektion=...`. De primære kodeplaceringer er
`src/moduler/oekonomi/Fakturacenter*.jsx`,
`src/moduler/oekonomi/fakturacenter-ui.js`,
`src/fleet/fakturacenter-intake.js`,
`src/fleet/fakturacenter-adapters/` og de tilhørende tests under `test/`.

Alt nyt FAKTURACENTER-arbejde skal udføres og testes i denne integrerede
variant. FAKTURACENTER-chatten ejer modulkomponenter, prototypekontrolflow,
lokale adaptere og tests. Ændringer i root-routing, AppShell, navigation,
login, permissions, tema, Reference Contract V1 eller root-dependencies
beskrives konkret og koordineres gennem integrationschatten. Aflever fuldt
commit-ID, ændringsbeskrivelse og testresultater til integration. Den gamle
prototype i
`C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-fakturacenter` på
`codex/fakturacenter-intake-v1-dev` bevares; eventuelt nyere arbejde dér
indgår ikke automatisk og må ikke kopieres ukritisk.
