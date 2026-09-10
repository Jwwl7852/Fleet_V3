# Ejerkonsol — designreview V1

Opdateret: 2026-09-11

## Grundlag

Reviewet er udført mod den faktisk kørende lokale ejerkonsol med normalt,
tenantløst Firebase-testlogin og syntetiske emulatorfixtures. Der er ikke
brugt demo-mode eller omgåelse af guards. Microsoft 365, OpenAI, Dinero,
bilagsmail og OCR står fortsat som **Ikke tilsluttet**.

Den vedhæftede serie indeholder 11 filer, selv om opgaven omtaler 10 billeder.
Skærm 11 er en rettet udgave af skærm 7 og er derfor brugt som autoritativ
reference ved overlap.

## Referencekort

| Reference | Faktisk route/tilstand | Implementeret match | Bevidst dataforskel |
|---|---|---|---|
| 01 Overblik | `/main` | Skal, KPI-bånd, opmærksomhed, assistent og seneste aktivitet | Tal kommer fra emulatoren |
| 02 Tilbudstekst | `/main/salg/tilbud` | Versionshoved, måneds-/engangssum, faner, tekstfelter, prislinjer og assistent | Fixturepriser er ikke officielle priser |
| 03 Salgsindbakke | `/main/salg/indbakke` | Filtre, trådliste, samtale, interne noter og sagspanel | Tråd og personer er mærkede testfixtures |
| 04 Opfølgning | `/main/salg/aktiviteter` | Kø, kladde, redigering, godkendelse, udsættelse og annullering | M365-afsendelse forbliver lukket |
| 05 Send tilbud | Tilbud → `Klargør mail` | Modtager, emne, tekst, præcis PDF-version, opfølgning og særskilt manuel registrering | Send-knappen kan kun oprette lokal kladde, når M365 er frakoblet |
| 06 Sagsassistent | `/main/salg/kunder?fane=assistent` | Sagskilder, fakta/fortolkning/spørgsmål, svarudkast og intern samtale | Intet live OpenAI-kald |
| 07/11 Kunde | `/main/salg/kunder` | Kundemetadata, historik, aftale, administratoradgang, næste handling og assistent | Nyeste rettede reference 11 har forrang |
| 08 Økonomi | `/main/oekonomi` | Afstemte KPI'er, dokumentliste, bilagsarbejde og definitioner | Manglende Dinero-dækning vises som utilstrækkelige data |
| 09 Integrationer | `/main/integrationer` | M365/OpenAI/Dinero-kort, bilagsmodtagelse og aktiveringsrækkefølge | Alle eksterne forbindelser er sandt frakoblede |
| 10 Vidensbase | `/main/salg/vidensbase` | Søgning, statusfaner, versioneret redigering og leveringsstatus | Aktuel fixture har ingen godkendte poster |

De eksisterende routes for pipeline, rateblad, abonnementer, fakturaer,
kreditnotaer og bilagsindbakke er bevaret. Den tidligere samlede CRM-
aktivitetsliste kan fortsat åbnes på `/main/salg/aktiviteter/alle`.

## Funktionel kontrol

- De ni unikke referenceflows blev åbnet i den kørende app uden dokumentbredde-
  overflow ved den tilgængelige IAB-viewport på 931 CSS-pixel.
- Tilbuds-PDF'en blev aflæst som `T-2026-0001_v2.pdf`; versionsnummeret kommer
  fra det låste tilbudssnapshot.
- `Gem kladde` starter en ny tilbudsversion, hvis den viste version er låst.
- Manuel afsendelsesregistrering kræver dokumentation og sender ikke mail.
- Opfølgningsskærmen genkontrollerer kundesvar og tilbudsstatus på serveren;
  afsendelse er fail-closed uden Microsoft 365.
- AI-knapper viser frakoblet status og sender ikke fixtureindhold eksternt.

## Screenshot- og viewportbevis

Rettelsesrunden 2026-09-11 har erstattet dette åbne punkt med faktiske,
repositorygemte browseroptagelser. En isoleret headless Edge-profil loggede ind
gennem den normale Auth-emulatorformular og optog den byggede app ved præcis
1440×900, 1920×1080 og 899×900. Billederne er ikke genererede designbilleder og
ligger i `docs/screenshots/ejer-review-v2/` sammen med de målte computed styles.

Ved 1920×1080 blev sidebar målt til 216 px, kort til 12 px radius, inputs til
38 px og indholdspadding til 26 px. `Inter Variable` var indlæst og blev faktisk
brugt med 14 px/20,3 px på skal, indhold, formularfelter og faner. Ved 899×900
var der intet vandret dokumentoverflow; navigationen var lukket i en synlig
hamburgerstyret mobilskuffe, så kontoindholdet forblev tilgængeligt.

Den nyeste Procure-billedserie bruges som fælles programstandard for farver,
Inter, geometri, kort, tabeller, felter og statusudtryk. Den tidligere
ejerbilledserie bruges fortsat for ejerens informationsarkitektur og flows.
Det giver bevidst mindre sidetitler og roligere arbejdsflader end de tidlige
ejer-mockups, men fastholder deres funktionelle opbygning.

## Samlet kundekonto

Referenceflowet for kunde/aftale er udvidet med en fuld side på
`/main/kunder/:tenantId`. Fanerne dækker Kundeprofil, Moduler, Brugere og
enheder, OBD, Abonnement og priser, Administratorer og Historik. Skærmbillederne
`1440x900-03-*`, `1440x900-04-*` og `1920x1080-05-*` dokumenterer de redigerbare
mængder, den separate OBD-model og den låste prisoprindelse. Handlingen
**Administrér kundekonto** findes både på CRM-kunden og abonnementsoversigten.

## Kendte, afgrænsede forskelle

- Alle priser og personer i reviewbillederne er syntetiske fixtures; officielle
  Veyro-priser er ikke fundet og må derfor ikke udledes af referencebillederne.
- Microsoft 365, OpenAI, Dinero, OCR og bilagsmail er visuelt og funktionelt
  frakoblede. Layoutet viser adapterstatus, men foregiver ingen ekstern succes.
- Den brede repository-lint kan ikke starte FACILITY-underprojektets konfiguration,
  fordi dets lokale `@eslint/js` mangler. Alle ændrede ejerfiler består den
  afgrænsede ESLint-kørsel; FACILITY-worktree/dependencies er ikke ændret.
- Den ældre ejer-CSS i `fleet.css` indeholder fortsat før-runden dublerede
  grundregler og rå typografital, som de brede historiske CSS-kvalitetstests
  rapporterer. Den aktive ejerskal overskrides af `ejer-standard.css` med de
  låste semantiske tokens og består design-tokenkontrollen; en oprydning af det
  gamle blok bør ske særskilt for ikke at udvide denne rettelse til en risikabel
  total omskrivning af alle tidligere ejerskærme.
