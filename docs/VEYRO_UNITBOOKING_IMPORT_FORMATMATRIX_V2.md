# UNIT Booking – formatmatrix V2

Dato: 13. september 2026

Matrixen skelner mellem at hente råt indhold, at fortolke bookingfelter og at
gennemføre hele browserforløbet. Udtrukket tekst er ikke det samme som sikkert
fortolkede oplysninger; medarbejderen skal altid gennemgå udkastet før en
reservation kan oprettes.

| Format | Lokal udtrækning | Forsigtig fortolkning | Fuld upload i browser | Evidens og begrænsning |
|---|---|---|---|---|
| `.csv` | Ja: separator, kolonner, rækker og cellereferencer | Ja for entydige, kendte feltnavne; decimalkomma normaliseres | Ja | To objektlinjer uploadet via filfelt, Storage og Functions; gennemgang og reservation verificeret |
| `.eml` | Ja: emne, tekst/HTML-tekst og relevante vedhæftninger | Ja for entydige felter i mailtekst og understøttede vedhæftninger | Nej, men fuldt backend-uploadforløb er kørt | Test med mail og CSV-vedhæftning; UI-filfeltet bruger samme uploadtransport som CSV |
| `.msg` | Ja: mailtekst og relevante vedhæftninger | Ja for entydige felter i tekst og understøttede vedhæftninger | Nej, men fuldt backend-uploadforløb er kørt | Testet med rigtig binær MSG-fixture og én vedhæftning |
| Tekst-PDF | Ja: tekst pr. side med sidehenvisning | Ja for entydige felter i teksten | Nej, men fuldt backend-uploadforløb er kørt | Tekst og side 1 verificeret. Layouttabeller kan stadig kræve manuel rettelse |
| Scannet PDF | Ingen lokal OCR | Kun efter tilsluttet OCR/AI og fortsat manuel gennemgang | Nej | Uploadområdet oplyser begrænsningen før valg. Ekstern tjeneste er ikke konfigureret |
| `.xlsx` | Ja: relevante ark, tabeller og ikke-tomme celler | Ja for kendte overskrifter og entydige værdier | Nej, men fuldt backend-uploadforløb er kørt | Ark- og cellereferencer verificeret |
| PNG/JPEG | Ingen lokal OCR | Kun efter tilsluttet OCR/AI og fortsat manuel gennemgang | Nej | Kamera-/billed-OCR er ikke konfigureret eller verificeret |

## Fælles sikkerheds- og kvalitetsregler

- Originalfil, hash, filtype, størrelse og aflæsningsresultat bevares på det
  adgangsbeskyttede udkast. Den efterfølgende booking beholder reference til
  udkastet.
- Samme hash giver dubletadvarsel. Gentaget bekræftelse med samme operation-id
  giver ikke en ekstra reservation.
- Mail- og dokumenttekst behandles som inert data. Tekst som forsøger at give
  systemet instruktioner ændrer hverken validering, type, dato eller valg.
- Dato, måleenhed, målakse og type udfyldes kun automatisk, når format og
  indhold er entydigt. Aflæste mål uden sikker enhed vises som “skal bekræftes”,
  ikke som helt manglende eller sikkert fortolkede.
- Flere objekter bevares som separate linjer. Der udføres ingen automatisk
  sampakning.

## Teknisk tilslutning for OCR/AI

Den eksisterende eksterne extractor kan aktiveres gennem projektets aftalte
Functions-konfiguration og secret. Ingen ny tjeneste eller abonnement er
oprettet. Det isolerede testmiljø havde ingen extractor-URL eller gyldig secret,
så scannede PDF'er og billeder er med vilje ikke markeret som automatisk
aflæst. Manuel gennemgang og indtastning fungerer uden tjenesten.

## Testmateriale

- Syntetisk CSV med to objekter, danske datoer og decimalkomma.
- Syntetisk EML med CSV-vedhæftning.
- Syntetisk XLSX med ark- og cellereferencer.
- Tekstbaseret syntetisk PDF.
- Binær MSG-fixture fra det Apache-2.0-licenserede
  `HiraokaHyperTools/msgreader`-projekt, bevaret som
  `test/fixtures/unitbooking-msgreader-test2.msg`.

Maskinlæsbar runtime-evidens findes i
`artifacts/unitbooking-v2-fix/runtime/UNITBOOKING_AUTH_FUNCTIONS_QA.json`.
Browser-evidens findes i
`artifacts/unitbooking-v2-fix/screenshots/UNITBOOKING_BROWSER_QA.json`.
