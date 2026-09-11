# Veyro ejerkonsol — V6.2 review

Dato: 2026-09-11

Worktree: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-ejer-integrated`

Branch: `codex/ejer-integrated-development`

Udgangspunkt: `8b6e5ff0715234feec14582dfd12e9ad37aec112`

Kodecommit: `203bff346e0955444260214fba1e2e3708b0f937`

## Resultat

De tre afgrænsede V6.2-punkter er implementeret og lokalt verificeret. Det nye
syntetiske forløb bruger **Aurora Mobilitet ApS — syntetisk V6.2-kunde**, Sara
Testperson og `sara@aurora-v62.invalid` fra CRM-post og salgsmulighed gennem
accepteret version, ny kladde, AI-kontekst, gem/genindlæsning og
dokumentpreview. OpenAI og Microsoft 365 er ikke kaldt.

V6.1-02 var kun delvist dokumenteret: den tidligere kontrol beviste, at teksten
blev kortere, men ikke at revisionen faktisk forklarede pilotafgrænsningen.
V6.2 erstatter ikke den historiske V6.1-rapport, men lukker dette indholdskrav
med kildebaseret tekst og kontrastprøver.

## Acceptmatrix

| ID | Status | Rettelse | Faktisk bevis |
| --- | --- | --- | --- |
| V6.2-01 | Bestået lokalt | Den deterministiske adapter modtager nu kladdens valgte moduler, aktiviteter, start, varighed, aftalte omfang, udtrykkelige undtagelser, uafklarede forhold og faseopdeling. En kortere revision bevarer relevante fakta, fremhæver afgrænsningen og kopierer ikke sælgerinstruksen. Fire strukturerede pilotfelter gemmes servervalideret. | Første forslag er 631 tegn og revisionen 521 tegn. Revisionen nævner Fleet, Planning, OBD-montering, opstartsworkshop, tre kalendermåneder fra 2026-10-01, 25 køretøjer/fem brugere, undtagelser, afklaring og ingen automatisk drift. Ændring til to måneder ændrer teksten; fjernet omfang bliver et afklaringspunkt. `kunValgtTekstfeltAendret`, `struktureretOekonomiUaendret`, `revideretErKortere` og `instruktionIkkeLaekket` er alle `true` i maskinresultatet. |
| V6.2-02 | Bestået lokalt | Årsagen var review-fixturen: `seed-owner-review-emulator.mjs` ændrede CRM-navnet efter, at V6.1's accepterede snapshot var låst med Flowtest-navnet. Det var ikke en tenant- eller adgangsfejl. V6.2 opretter derfor en ny virksomhed og salgsmulighed gennem de eksisterende ejerautoriserede callables og bruger stabile id-referencer; ingen historisk V6.1-version omskrives. | Aktuel virksomhed `-P1GqVVk3ZwT6HLMAqwq`, mulighed `-P1GqVWOni0NcGpJpuCk` og tilbud `v62_pilot_20260911`. CRM-, tilbuds- og kladdereferencen er den samme, kontaktmailen er den samme før/efter, og screenshots viser samme kunde i hoved, tekst, opsætning og dokumentpreview. Accepteret snapshot-SHA-256 er uændret `96d005d512c57b569afe521b20de811a95b272bcf134f33ff9d9e02e7de27933`; PDF-SHA-256 er uændret `661518529adc3ce66604e0a18ba01ad0cac011e91d77e3b1f7f0470b3052d1fd`. |
| V6.2-03 | Bestået lokalt | Den generelle sammenligning `pilotStart < udstedelsesdato`, som blev indført i V6.1 i både klientens regelkilde og funktionskopien, er fjernet. Datoformat, varighed, evaluering, kalenderberegning og faseadskillelse er bevaret. Kilde og funktionskopi kontrolleres fortsat byte-logisk ens. | Fremtidig prøve 2026-09-15 → 2026-10-01 giver slut 2027-01-01 og evaluering 2026-12-17. Historisk start 2026-10-01 med tilbudsdato 2026-11-01 afvises ikke. Ugyldig dato og varighed 0 afvises. 2028-01-31 + én måned giver 2028-02-29. Vejledende drift har ingen automatisk aktiveringsværdi. |

## Det sammenhængende tilbudsforløb

Den fokuserede emulatorharness opretter et nyt CRM-firma og en ny
salgsmulighed, opretter og accepterer tilbudsversion 1, genererer den permanente
PDF, opretter en separat version 2-kladdde og gennemfører følgende:

1. Henter det første forslag fra den lokale adapter med de gemte pilotkilder.
2. Sender sælgerinstruksen om en kortere tekst med tydelig afgrænsning.
3. Kontrollerer revisionens indhold mod kilderne og indsætter den eksplicit.
4. Gemmer og genindlæser kladden.
5. Sammenligner prislinjer, rabatter, mængder, perioder, ratebladskilde,
   accepteret snapshot og faktiske PDF-bytes før og efter.
6. Kører kontrastprøver og de fem krævede datoscenarier.

Maskinresultatet er
`docs/screenshots/ejer-review-v6-2/offer-workflow-result.json`. Det er skrevet af
den faktiske kørsel, ikke en manuelt udfyldt acceptfil. Version 1 er accepteret,
version 2 er kladden, og den aktuelle serverrevision er 7.

## Tests og resultater

| Kontrol | Kommando / metode | Resultat |
| --- | --- | --- |
| V6.2-enhed og relevante regressioner | `node --test --test-concurrency=1 test/design-tokens.test.mjs test/ejer-tilbud.test.mjs test/ejer-v6-regler.test.mjs test/ejer-v6-accept.test.mjs test/ejer-v6-1-accept.test.mjs test/ejer-v6-2-accept.test.mjs` | 37/37 bestået, 0 fejl; heraf designkontrakten 11/11. |
| Målrettet lint | `npx eslint` på de ændrede kilder, tests og scripts | 0 fejl. Den synkroniserede `functions/delt`-fil er forventeligt ignoreret af ESLint; identitet med klientkilden dækkes af testen. |
| Produktionsbuild | `npm run build` | Bestået med Vite 5.4.21; 532 moduler transformeret. |
| Autoriseret emulatorflow | `node --env-file=.env.owner-emulator.local scripts/test-owner-v6-2-offer-emulator.mjs` med de fire eksplicitte lokale emulatorhosts | Bestået: `V6.2 tilbudsforløb bestået: v62_pilot_20260911`. |
| Browserforløb | `node scripts/capture-owner-review-v6-2.mjs` med git-ignoreret lokal loginfixture | Normalt tenantløst ejerlogin, seks faktiske optagelser, samme kunde og gemt tekst. |
| Mobilkontrol | Faktisk Edge DevTools-viewport 390×844 | Ugemt kladde bevaret ved panelskift, intet vandret dokumentoverflow. |
| Font | `document.fonts` og computed styles i den faktiske browser | `Inter Variable` indlæst; body og tekstfelt 14 px / 20,3 px. |

Det fulde V6.1-mailworker-, menu-, support- og bilagsbevis er ikke genkørt,
fordi V6.2 ikke ændrer de funktioner. De historiske resultater og screenshots
står i `docs/VEYRO_EJERKONSOL_REVIEW_V6_1.md` og
`docs/screenshots/ejer-review-v6-1/`. Den brede repository-lint har fortsat det
tidligere dokumenterede, uvedkommende FACILITY-hul omkring `@eslint/js`.

## Screenshots

Alle billeder er taget fra den kørende ejerapp efter normalt login med den
syntetiske V6.2-fixture. Manifestet er
`docs/screenshots/ejer-review-v6-2/capture-manifest.json` og binder hvert billede
til route, viewport, flow og kodecommit.

| Fil | Viewport | Dokumenteret tilstand |
| --- | --- | --- |
| `1920x1080-01-foerste-kildebaserede-pilotforslag.png` | 1920×1080 | Første kildebaserede forslag. |
| `1920x1080-02-revideret-kort-pilotafgraensning.png` | 1920×1080 | Kortere, men faktabevarende revision med pilotafgrænsning. |
| `1440x900-03-indsat-gemt-samme-kunde.png` | 1440×900 | Indsat, gemt og genindlæst tekst med korrekt kunde. |
| `1920x1080-04-sammenhaengende-pilotopsaetning.png` | 1920×1080 | De strukturerede pilotkilder og separate faser. |
| `1440x900-05-dokumentpreview-samme-kunde.png` | 1440×900 | Dokumentpreview med samme kunde, tekst og beregning. |
| `390x844-06-mobilkladde-bevaret.png` | 390×844 | Ugemt mobilkladde bevaret ved panelskift. |

## Lokal gennemgang

Preview: `http://127.0.0.1:5211/login`

Log ind gennem den normale loginformular som den lokalt provisionerede
tenantløse testejer. De nødvendige testværdier ligger i den git-ignorerede
lokale emulatorfil og må ikke kopieres til chat, rapport eller Git. Gå derefter
til **Salg → Tilbud**, vælg Aurora Mobilitet ApS og åbn version 2-kladden.

Ved afleveringen svarer preview på port 5211. Emulator UI svarer på port 4000,
Functions på 5001, Database på 9000, Auth på 9099 og Storage på 9199.

## Driftsgrænse og resterende ekstern opsætning

- AI-resultatet er verificeret med den lokale deterministiske adapter. Reel
  OpenAI-modelkvalitet, budgethåndhævelse og produktionskald er ikke afprøvet.
- Microsoft 365, OpenAI, Dinero, OCR og bilagsmail forbliver **Ikke
  tilsluttet**. Ingen rigtig mail er sendt, og ingen virkelig kundedata er brugt.
- Microsoft 365 kræver fortsat verificering af den faktiske type bag
  `info@veyrosystems.com`, Graph-rettigheder, webhook/delta-job og en kontrolleret
  testorganisation, før virkelig maildrift kan aktiveres.
- Dinero, OCR og bilagsmail kræver fortsat deres respektive testorganisation,
  credentials, mapping og kontrollerede aktivering.
- Ingen push, merge, deployment, produktionsændring eller ændring af andre
  modulworktrees er foretaget.
