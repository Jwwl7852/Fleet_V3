# PROCURE implementation

## Ansvar og genbrug

PROCURE ejer indkøbsbehov, katalogets indkøbsfelter, godkendelsesforløb, bestillinger, ordrelinjer og modtagelser. Leverandørens basisoplysninger læses fra platformens fælles leverandørstamdata, og fakturaer, matchafvigelser samt fakturagodkendelse åbnes og håndteres i det fælles Fakturacenter.

Modulet genbruger AppShell, login, tenantafgrænsning, roller/rettigheder, `useListe`, de eksisterende behovs-, ordrestatus-, godkendelses- og mail-callables samt Fakturacenterets dokumenterede URL-kontekst. PROCURE-navigationen viser kun fælles moduler, som AppShell allerede har givet den aktuelle bruger adgang til.

## Implementeret i dette spor

- Samlet responsivt PROCURE-modul med overblik, behov, katalog, godkendelser, bestillinger, modtagelser og forbrug.
- Ordredetalje, revisionskontrol, ordre-PDF og gennemgang af bestillingsmail før eksplicit afsendelse.
- URL-bårne søgninger og filtre, naturlig tilbage-navigation, fokusstyrede dialoger og håndtering af ugemte ændringer.
- Domænefunktioner og regressionstest for leverandøropdeling, godkendelsesregler, revisioner, idempotent mailtilstand, delleverancer, fakturamatch, dubletter, kreditnotaer, varegrupper, enheder og normaliserede priser.
- Tydeligt mærkede syntetiske testdata; de bruges kun i den eksisterende demo-kontekst og aldrig som fallback ved server- eller adgangsfejl.

## Fælles kontrakter og konfiguration

- Fakturacenter åbnes med `kilde=procure`, PO-reference og en kodet returadresse. Fakturaforbrug er afgrænset fra resterende, ikke-faktureret ordreværdi.
- Produktionens mailtransport bruger den eksisterende server-callable og et stabilt request-id. Manglende mailopsætning eller ukendt afsendelsesresultat må ikke registreres som sendt eller automatisk gensendes.
- Browserens demotilstand bruger en kontrolleret testtransport og sender ingen rigtig mail.

## Præcise resterende afhængigheder

- Den fælles backend-callable `procureModtagelseRegistrer` skal implementeres og forbindes til vedvarende, tenantafgrænset filopbevaring, før modtagelser og vedhæftninger kan anvendes i produktion. UI'et viser eksplicit, når forbindelsen mangler.
- Den eksisterende mail-callable skal udvides, hvis den faktisk sendte PDF skal vedhæftes og arkiveres byte-for-byte sammen med mailen. Klienten genererer PDF-forhåndsvisningen, men fremstiller ikke denne arkivering som aktiv.
- Kundens mailcredentials, bestillingsafsender og fakturamodtagelse skal konfigureres server-side. Ingen Veyro-adresse er hardcodet som produktionsstandard.
- OCR, regnskabseksport og betaling forbliver eksterne/fælles Fakturacenter-integrationer og fremstilles ikke som PROCURE-funktionalitet.
