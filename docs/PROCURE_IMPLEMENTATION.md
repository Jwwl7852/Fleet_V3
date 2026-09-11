# PROCURE implementation

Dato: 2026-09-11

## Ansvar og genbrug

PROCURE ejer indkøbsbehov, katalogets indkøbsfelter,
godkendelsesforløb, bestillinger, ordrelinjer og modtagelser.
Leverandørernes basisoplysninger er fælles stamdata. Fakturaer,
matchafvigelser og fakturagodkendelse håndteres i det fælles
Fakturacenter.

Modulet genbruger AppShell, almindeligt Firebase-login,
tenantafgrænsning, roller/rettigheder, `useListe`, fælles beløbsmodel,
leverandørdata og eksisterende backendmønstre. Demoen er visuelt og
funktionelt mærket som syntetisk og erstatter ikke adgangstest.

## Implementeret

- Samlet responsiv arbejdsflade for bestillinger, varekatalog,
  godkendelser, modtagelser, forbrug og opsætning.
- Mobil vareindsamling med servergemt kladde, delvis indsendelse,
  leverandøropdeling, tydelig kvittering og ingen automatisk afsendelse.
- Hylde-QR med stabil mærkatreference, aktivt antalvalg og udskrivning.
- Ordre-PDF med stabil modtagelses-QR, eksplicit mailafsendelse,
  revisionslås, idempotens, faktisk PDF-vedhæftning og byteidentisk arkiv.
- Linjegodkendelse med godkend, udskyd, send tilbage og afvis, herunder
  delmængder og begrundelseskrav.
- Produktionsegnet modtagelses-backend med flere delleverancer,
  korrektioner, beskadiget/afvist mængde og tenantafgrænset PDF/JPEG/PNG-
  opbevaring med type-, størrelse- og magic-byte-kontrol.
- Webshopbestilling med serverkrypteret legitimation, begrænset adgang,
  revisionskontrol, firmakortstatus uden kortnummer/CVV og fortsat
  økonomisk opfølgning efter afsluttet lager.
- Fakturaimport og -match i fælles Fakturacenter med dubletværn,
  kreditnotaer, fysisk retur og rapportering uden dobbelttælling.

## Afsluttende reviewrettelser

Demoens mobilkvittering bruger nu kun resultatet af den aktuelle
indsendelse. Status, sendt/rest-antal, kurvbadge og PO-liste stemmer derfor
overens, og tidligere ordrer tælles ikke med.

Prisafvigelseskredit og returkredit følger to separate backendgrænser. En
prisafvigelseskredit begrænses af den oprindelige fakturas afvigelse. En
returkredit kræver en registreret fysisk retur, korrekt fakturakobling og
begrænses af returens serverberegnede værdi. En kreditnota er ikke i sig
selv dokumentation for en kortrefundering eller betaling.

Mobilmodtagelsen viser servergemte tidligere modtagelser og henter hvert
bilag gennem et nyt adgangskontrolleret link. Kvitteringen bruger den
ordrestatus, som den afsluttede backendtransaktion returnerer. Ordredetaljens
faner kan rulle lokalt på smalle skærme uden at skabe vandret sideoverflow.

## Lokal verifikation

Den autoriserede preview på `http://127.0.0.1:5207` anvender lokale Auth-,
Functions-, Realtime Database- og Storage-emulatorer med syntetiske brugere
og signerede claims. Den visuelle demo findes på
`http://127.0.0.1:5205/indkoeb/mobil`.

Se `PROCURE_FOLLOWUP_VERIFICATION.md` for konkrete kommandoer, hashes,
browserresultater og screenshots samt `PROCURE_REQUIREMENTS_TRACEABILITY.md`
for status pr. krav.

## Resterende eksterne afhængigheder

Koden er ikke deployet. Produktion kræver kundens Firebase-/Storage-
opsætning, offentlig HTTPS-appadresse, `PROCURE_WEBSHOP_KEY`, kundens
mailtransport og leverandør-/fakturamodtagelsesdata. Ekstern webshop,
kortudbyder, betaling/refundering, OCR og regnskabseksport er ikke tilsluttet
i denne lokale opgave. Fysisk mobilkamera er ikke afprøvet.

Ingen rigtig leverandørmail, webshopordre, betaling, push, merge eller
deployment er udført.
