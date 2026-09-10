# Veyro ejerkonsol — byggeplan v1

Opdateret: 2026-09-10

## Fast grundlag

- Repository: `https://github.com/Jwwl7852/Fleet_V3.git`
- Udviklingsspor: `codex/ejer-integrated-development`
- Worktree: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`
- Fælles produktbase: `989dbb87db639efed0ba1b5a1e271560f7659a0c`
- Integrationsref ved oprettelse: `39963337a52d4464f619077683d1f39aa81eff1e`
- Integrationens eneste ændring efter produktbasen var den fælles sporvejledning.

Ejerkonsollen videreudvikles i den eksisterende `/main`-gren af appen. Der
oprettes ikke en parallel konsol, et separat login eller en ny temakilde.

## Produktvalg, der ligger fast

- Rene, personlige ejeridentiteter uden kundetenant er normalmodellen.
- UI-gates er kun navigation; regler og Cloud Functions håndhæver adgang.
- CRM-virksomhed er ikke det samme som en provisioneret tenant.
- FAKTURACENTER er ikke et særskilt kommercielt modul.
- Bindende priser og dokumenter regnes i heltalsøre og snapshots fryses.
- Dinero er Veyros eget regnskabssystem. En testadapter er ikke en liveforbindelse.
- Ingen mail, bogføring, produktionstilpasning eller deployment sker uden særskilt aktivering.
- Originale bilag ligger i beskyttet Storage; direkte klientadgang forbliver lukket.

## Genbrugsoversigt

| Område | Beslutning |
|---|---|
| `/main` og tenantløs routing | Udvides med ejer-navigation; adgangsgrænsen bevares |
| `Konsol.jsx` | Genbruges som Kunde/abonnement-skærm |
| `Prisliste.jsx`, `priser.js`, `beloeb.js` | Genbruges og udvides; ingen parallel prismotor |
| Eksisterende ejer-callables | Bevares, får fælles revocationkontrol og platformaudit |
| `udbyder/kunder`, målinger og fakturagrundlag | Bevares som autoritative eksisterende data |
| Kundens `opsaetning/brugere` | Bevares adskilt fra ejeradministrationen |
| Genereret administratoradgangskode | Erstattes senere af tidsbegrænset invitation |
| CRM, tilbud, Dinero, bilagsindbakke | Mangler og tilføjes additivt med migration/status |
| Veyro-logo og tema | Genbruges fra `src/assets/veyro`, `VeyroLogo.jsx` og `fleet.css` |

## Etaper

### A — Verificeret grundlag

Status: afsluttet 2026-09-10.

- Repository, remote, worktrees, live integrationsref og foreskrevet base verificeret.
- Ingen igangværende merge, rebase, cherry-pick eller revert fundet.
- De fire eksisterende modulspor er urørte.
- Eksisterende datamodel, regler, funktioner, jobs, Storage og hosting kortlagt.

### B — Adgang og skal

Status: implementeret; emulatorverifikation blokeret af lokal Java-version.

- Et eksplicit, tenantløst ejerclaim-format med legacy-kompatibilitet.
- RTDB-læsning for rene ejere uden kunstige tenant/perms-claims.
- Revocationkontrol i alle privilegerede ejer-callables.
- Serverstyret platformaudit og afvisning af direkte klientwrites.
- Ejer-navigation med eksisterende logo, font og Veyro-tokens.
- Rules-, domæne-, lint-, build- og routingregression.

### C — Salg

Status: implementeret som første vertikale arbejdsgang; serverdata og
domænetests er verificeret, regelbevis afventer Java 21.

- Vedvarende CRM-data under ejergrænsen.
- Virksomheder, flere salgsmuligheder, aktiviteter og tidslinje.
- Ansvarlig ejer, Mine/Alle, næste handling og forfald.
- Servervalidering, revisionskontrol, audit og rules-tests.

### D — Priser og tilbud

Status: delvist implementeret.

- Udvid eksisterende versioneret rateblad med engangs- og abonnementslinjer.
- Fælles deterministisk beregning i browser/server.
- Serverallokerede tilbudsnumre, versionssnapshots og PDF.

Første del leverer tilbudskladde, fælles serverberegning, unikt nummer,
uforanderlig version 1, browserens udskriv/gem-PDF og en eksplicit manuel
afsendelsesregistrering. Automatisk indlæsning fra officiel prisliste,
reviderede versioner, vedvarende PDF-fil, mailadapter og accept hører fortsat
til de resterende D/E-arbejdsgange.

### E — Aftale og kunde

Status: ikke startet.

- Genkørbar provisioning med stabile operations-id'er.
- Aftale-/abonnementsversioner og virkningsdatoer.
- Sikker administratorinvitation uden synlig adgangskode.

### F–I — Fakturering, kredit, udgifter og overblik

Status: ikke startet.

- Vedvarende outbox/jobmodel og realistisk Dinero-testadapter før liveforbindelse.
- Kreditnotaer, returdata, betalinger og synkroniseringscheckpoints.
- Beskyttet bilagsupload, mail-/OCR-adaptergrænser og dubletkontrol.
- Fælles beregnede KPI-definitioner med klikbar afstemning.

### J — Samlet aflevering

Status: ikke startet.

- Additiv migrationsprøve med dry-run/recovery.
- Samlet regression, emulator, browsergennemgang og dokumentpreview.
- Driftsvejledning og præcise aktiveringstrin uden hemmeligheder.

## Registrerede antagelser og blokeringer

- Der var ingen yderligere designbilleder tilgængelige; repositoryets faktiske
  brandfiler har derfor forrang.
- Dinero-organisation, API-credentials og testorganisation er ikke tilsluttet.
- Invoice-mail, inbound-maildomæne og OCR-leverandør er ikke identificeret.
- MFA kræver verifikation af Firebase Authentication-produkt/opsætning; UI må
  ikke vise MFA som aktiv, før en rigtig tenantløs ejerflow er afprøvet.
