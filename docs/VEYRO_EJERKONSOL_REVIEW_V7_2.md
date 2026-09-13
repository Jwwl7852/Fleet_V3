# Veyro ejerkonsol — review V7.2

Dato: 2026-09-12  
Arbejdsmappe: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`  
Branch: `codex/ejer-integrated-development`  
Bevaret udgangspunkt: `8b08da24246c9482a2c76acaaebb600164e15d17`  
Browserverificeret kode: `f5533b190b48175bef22024cc4890d1ba6172011`

## Resultat

De tre afgrænsede V7.2-rettelser er implementeret uden at ændre V7.1's
tenantløse ejeradgang, delte Dennis/Jørn-sager eller adskillelsen mellem intern
AI-chat og kundesvar.

Mobilindbakken starter nu med en kompakt postkasseblok og mindst tre fuldt
synlige mailrækker ved 360×800, 390×844, 899×900 og 900×900. Søgning, mapper og
statusfiltre ligger bag én tydelig, reversibel handling; aktivt filter og
nulstilling vises i den kompakte blok.

Svarudkast viser samme bekræftede og manglende oplysninger som fanen
**Oplysninger**. Under editoren vises seneste fælles AI-revision og den samme
hurtiginstruks som fortsætter sagens fælles AI-historik. Et forslag indsættes
kun med **Indsæt i svarudkast** og overskriver aldrig kladden automatisk.

Godkendelse er nu bundet til hele mailindholdet og revisionen. En lokal eller
servergemt ændring i tekst, afsender, modtager, emne eller vedhæftninger gør en
ældre godkendelse ugyldig. Workerens umiddelbare kontrol stopper et forældet
job før transport. En ny gennemset og godkendt version kaldte den injicerede
lokale testtransport præcis én gang; intern chat og noter var ikke i payloaden.

## Lokal gennemgang

- Preview: `http://127.0.0.1:5211/login`
- Fælles indbakke: `/main/mail/indbakker?postkasse=faelles`
- Pilotcase: `/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys`
- Fælles supportsag: `/main/support?sag=v7-support-dennis`
- Opfølgning: `/main/mail/opfoelgning`

Brug normal loginformular og den tenantløse lokale testejer i den
git-ignorerede `.env.owner-emulator.local`. Ingen adgangsoplysninger ligger i
rapporten eller ZIP-filen. Den faktiske browser loggede ind, genindlæste siden
og fandt de samme 116 reviewtråde.

## Detaljeret acceptmatrix

| ID | Status | Implementering | Verifikationsbevis |
|---|---|---|---|
| V72-01 | Bestået | Mobilstarten viser valgt postkasse, kort testmærke, **Ny mail**, værktøjsknap og filterstatus. Værktøjspanelet indeholder søgning, mapper og filtre og kan åbnes/lukkes; filter kan vælges og nulstilles. | `mobile-visible-rows.json`: tre fuldt synlige rækker ved 360×800, 390×844, 899×900 og 900×900; første to rækkers top/bund/højde er registreret; intet vandret overflow. Browserkontrollen har `filtersVisible`, `foldersVisible`, `searchVisible`, `nulstillet` og `lukket=true`. |
| V72-02 | Bestået | Svarudkastets kompakte fakta kommer fra `oplysningerForSag`: 25 enheder, 3 måneder, 5 brugere inkl. 2 administratorer; CVR, startdato og OBD-antal mangler. Seneste AI-revision og hurtiginstruks bruger samme delte historik og kræver eksplicit indsættelse. | `connected-ai-flow.json` og screenshots ved 1440×900, 1920×1080 og 390×844. Ny revision blev servergemt, input ryddet, fanen blev på Svarudkast, og `automaticOverwrite=false`. De eksisterende emulatorbeviser viser fortsat Dennis/Jørn-fælleshistorik og private scopes. |
| V72-03 | Bestået | Ugemte ændringer skjuler straks den godkendte afsendelseshandling og viser **Gem og gennemse igen** deaktiveret. Gemning skriver en ny `kladde`-revision transaktionelt og fjerner tidligere godkendelsesfelter. Godkendelse og afsendelseskø kræver synlig sag, forventet revision og aktuel hash. | `post-approval-ui-proof.json`: 0 afsendelseskald ved ugemt ændring. `post-approval-transport-proof.json`: tekst, modtager, emne og vedhæftning gav hver 0 transportkald og `godkendelse_forældet`; ny version gav præcis 1 lokalt transportkald uden chat/noter. Screenshot af ny reviewmodal dokumenterer afsender, modtager, emne, indhold og godkendelsesstatus. |
| V72-04 | Bestået | Samtaleliste, hver af fanerne Svarudkast/AI-chat/Oplysninger og indbakkens samlede AI-overblik har selvstændig desktoprulning. Mobil bruger dokumentrulning og når nederste handlinger. | `scroll-flows.json`: otte trusted-wheel-forløb ved 1440×900 og 1920×1080. Kun målrettet panel flyttede; modstående panel og dokumentets scrollY forblev uændret. Alle records indeholder route, fane, viewport, bounds og før/efter. |
| V72-05 | Bestået | V7.1-funktionerne for fælles kundesag, delt AI-chat, intern Domicil-sag, supportsynkronisering, opfølgning og menneskelig godkendelse er bevaret. | 12/12 V7/V7.1/V7.2-regressioner, normal login/reload og screenshots af indbakke, sag, support og opfølgning. |
| V72-06 | Bestået | Veyros semantiske designtokens og Inter er bevaret. V7.2-CSS indeholder ingen rå farver. | 11/11 designtoken-tests. Computed Edge-style: `Inter Variable, Inter, -apple-system, Segoe UI, Roboto, Arial, sans-serif`, fontstatus `loaded`, 14 px/20,3 px brødtekst og knapper, 38 px kontrolhøjde, 12 px kortradius og 2 px fokusregel. |

## Uafhængig rulning

`scroll-flows.json` indeholder følgende kombinationer ved begge desktopmål:

1. Samtale ↔ Svarudkast
2. Samtale ↔ AI-chat
3. Samtale ↔ Oplysninger
4. Mailliste ↔ samlet AI-overblik

Ved 1440×900 flyttede eksempelvis Svarudkast `0→298`, mens samtalen forblev
på 360 og dokumentet på 0. Ved 1920×1080 flyttede Svarudkast `0→118`, mens
samtalen forblev på 223 og dokumentet på 0. De øvrige seks records følger
samme krav.

## Testresultater

- `npm run build`: bestået; Vite 5.4.21, 535 moduler.
- Målrettet ESLint af alle V7.2-kode-, test- og capturescriptfiler: 0 fejl.
- `npm run test:design`: 11/11 bestået.
- V7/V7.1/V7.2 Node-regression: 12/12 bestået.
- Mailworker i emulator: 5/5 scenarier bestået.
- Browseraccept: normal login/reload, 20 faktiske screenshots, fire
  mobil/breakpointmålinger og otte trusted-wheel-scrollflows bestået.
- `node --check` af function- og begge capturescripts: bestået.

Den brede historiske `npm run lint` går også ind i en separat indlejret
Facility-installation, som mangler sin egen `@eslint/js`-afhængighed. Dette er
et eksisterende repoforhold; målrettet lint af samtlige V7.2-filer er grønt.

## Screenshots og maskinbeviser

`docs/screenshots/ejer-review-v7-2/` indeholder 20 faktiske browseroptagelser:

- indbakke ved 1440×900 og 1920×1080
- Svarudkast og forbundet AI-revision ved begge desktopmål
- AI-chat før eksplicit indsættelse
- review før godkendelse, blokering efter ændring og ny aktuel reviewmodal
- Oplysninger, intern Domicil-sag, delt supportsag og opfølgning
- mobil ved 360×800 og 390×844 samt breakpoint ved 899×900 og 900×900

Maskinbeviser:

- `browser-verification.json`
- `mobile-visible-rows.json`
- `connected-ai-flow.json`
- `post-approval-ui-proof.json`
- `post-approval-transport-proof.json`
- `scroll-flows.json`
- `capture-manifest.json`
- `test-results.txt`

## Designreview

V7.2 følger referencebilledets arbejdshierarki: samtalen er venstre
arbejdsflade, og **Svar og AI** er højre arbejdsflade med fanerne
**Svarudkast**, **AI-chat** og **Oplysninger**. Den kompakte mobile top er en
nødvendig responsiv tilpasning for at opfylde kravet om mindst to hele
mailrækker uden indledende scroll. Testmærkning er mere eksplicit end i
referencebilledet, så syntetiske data og frakoblede tjenester ikke kan
forveksles med produktion.

## Resterende ekstern opsætning

Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er fortsat **Ikke tilsluttet**.
Lokalt er kun den deterministiske AI-testadapter og en injiceret mailtransport
brugt. Følgende kræver senere, særskilt autorisation og credentials:

1. Microsoft 365-postkasser, Graph-webhooks/deltajob og rigtig afsendelse.
2. OpenAI-model, credentials, forbrugsramme og ekstern AI-verifikation.
3. Dinero, OCR og bilagsmail med hver sin forbindelses- og driftstest.

Ingen push, merge, deployment, produktionsændring, ekstern AI-kald eller
rigtig mailafsendelse er foretaget. Andre modulworktrees er ikke ændret.
