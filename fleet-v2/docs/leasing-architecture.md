# Leasing i FLEET v2

## Afgrænsning

Leasing bruger det eksisterende tenant-datasæt, enhedsregister, dokumentregister, indberetninger, sager og sagsmappe. En leasingaftale peger på et stabilt `unitId`; en afleveringsforekomst peger på `leaseId`, `unitId`, `reportId` og `caseId`. Der oprettes derfor ikke et ekstra enheds- eller dokumentregister.

Data lagres kun i prototypens IndexedDB. Skema version 12 tilføjer valgfrie samlinger for aftaler, målerobservationer, afleveringsforløb, kontraktgennemgange, indstillinger og hændelser. Eksisterende poster kopieres ikke eller nulstilles. Den syntetiske leasingaftale oprettes kun, når en ældre tenant slet ikke har et leasingregister.

## Referencer og automatik

Ved valgt varslingsfrist opretter én repository-mutation atomisk:

- én indberetning med oprindelsen `Automatisk oprettet fra Leasing`;
- én sag med fælles Veyro-reference;
- én afleveringsforekomst med eget bestillingsnummer.

Forekomstnøglen er `leaseId:plannedDeliveryDate`. Gentagne kontroller, genindlæsninger og flere faner genbruger samme forekomst. Varsler får desuden en stabil nøgle pr. aftale, afleveringsdato og varslingsgrænse. Ændres udløb eller planlagt aflevering efter sagsoprettelsen, markeres forløbet til revurdering og den tidligere hændelse bevares.

Den lokale kontrol kører ved appstart og hvert minut, mens appen er åben. En produktionsløsning skal køre serverbaseret pr. tenant, anvende en unik databasebegrænsning på forekomstnøglen og tildele læsbare referencer autoritativt på serveren.

## Kilometer og prognose

Leasingdistance er `seneste daterede kilometertæller - målerstand ved levering`; den seneste kilometertæller vises ikke som kørt distance. Prognosen bruger som standard op til 183 dage mellem den seneste observation og den første brugbare observation i vinduet. Hvis dette grundlag ikke findes, kan et særskilt manuelt månedligt forventet kørselsniveau bruges. Historiske målinger ændres ikke af prognosen.

Samlet kilometergrænse bruges direkte. Periodisk grænse opskaleres efter aftalens antal måneder og den registrerede periodelængde. Manglende startmåler, manglende observationer, faldende målinger uden eksplicit korrektion samt modstridende data giver `Kan ikke beregnes`; de bliver aldrig nul. Observationer ældre end 90 dage markeres forældede.

Depositum vises som ind-/udbetaling og indgår ikke automatisk i forventede eller faktiske leasingomkostninger. Restværdi og købsoption behandles heller ikke som sikre udgifter. Valutaer summeres kun, når alle aktive aftaler bruger samme valuta.

`leaseOdometerAdapter` er en frakoblet grænse til et senere OBD-tilvalg. En virkelig adapter skal levere tenant, stabilt enheds-ID, måletidspunkt, modtagelsestidspunkt, kilde, enhed og eksplicitte korrektioner/målerskift. Ingen OBD-tjeneste er tilsluttet i prototypen.

## Aflevering og sagslukning

Fysisk aflevering sætter aftalen til afleveret og enheden til inaktiv, gemmer eventuelt en dateret slutmåling og lader sagen stå åben med `awaiting_settlement`. Aflevering sletter aldrig enheden eller historikken. Før-afleveringsbilleder og kvittering gemmes én gang i Dokumenter og knyttes til enhed, aftale og sag via relationer.

Sagsmappens eksisterende regler gælder uændret: normal lukning kræver afklarede forventede fakturaer samt brugerens eksplicitte bekræftelse; lukning uden faktura kræver begrundelse. FLEET har ingen handling til fakturamatch eller fakturakontrol.

## Dokument- og kontraktaflæsning

Leasingrelationen er aktiveret i det fælles dokumentregister. Samme Blob og version kan have relationer til aftale, enhed og sag uden kopiering. Tidligere dokumentversioner bevares.

`contractExtractionProposal` er adaptergrænsen. Kun dokumentet `document-lease-demo-contract`, mærket som navngiven syntetisk fixture, giver demonstrationsforslag. Vilkårlige brugeruploads giver altid `Automatisk aflæsning er ikke tilsluttet`. Kun brugerens markerede felter kan anvendes. `Ikke fundet` bliver aldrig til `Ikke inkluderet`, og forslag, belæg, dokumentversion samt manuelle rettelser bevares i gennemgangen.

Reel lokal aflæsning kræver en særskilt godkendt PDF-/OCR-komponent med sideforankrede tekstuddrag, versionsidentitet, konfliktregistrering og dokumenterede licenser. Alternativ ekstern AI/OCR kræver særskilt godkendelse, databehandleraftale, tenant-isolation, server-side credentials og eksplicit behandling af fortrolige dokumenter. Ingen fil sendes ud af appen i denne etape.

## Ikke tilsluttet

- Fakturacenter og kontrollerede fordelinger.
- OBD-/GPS-kilometermålinger.
- AI/OCR for brugerens egne dokumenter.
- Mailafsendelse eller mailautomatik.
- Fælles kilometerpuljer på tværs af aftaler.
