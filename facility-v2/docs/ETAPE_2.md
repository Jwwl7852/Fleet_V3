# FACILITY v2 – etape 2

Etape 2 udvider det eksisterende datasæt fra version 1 til version 2 uden at
genskabe fixtures oven i gemte data. Eksisterende ejendoms-ID'er og relationer
til sager, opgaver, servicepunkter og omkostninger bevares. Migrationen opfinder
ikke historikhændelser for etape 1-data.

## Tilladte forældrerelationer

| Nodetype | Tilladte forældre |
|---|---|
| Bygning | Ejendom |
| Etage | Bygning |
| Område | Ejendom, bygning, etage eller område |
| Rum | Bygning, etage, område eller fællesområde |
| Udendørsareal | Ejendom |
| Tag | Ejendom eller bygning |
| Facade | Ejendom eller bygning |
| Fællesområde | Ejendom, bygning eller etage |

Reglerne håndhæves i domænelaget. En node kan ikke være sin egen forælder,
flyttes til en efterkommer eller knyttes til en anden ejendoms struktur.
Flytning mellem ejendomme er ikke understøttet i denne etape.

## Samtidighed

Hver redigerbar post har et revisionsnummer. En mutation åbner en atomisk
IndexedDB-transaktion, læser den seneste tenant-post, kontrollerer forventet
revision og gemmer først derefter. Ændringer i forskellige faner varsles via
`veyro-facility-v2:data-changes`. Ved konflikt bevares formularens lokale
indtastning, mens brugeren får en synlig konfliktbesked.

## Billeder

JPEG, PNG og WebP accepteres med højst 20 MB pr. fil. Browseren skal kunne
indlæse filen som billede før lagring. Metadata gemmes i datasættet, mens Blob
gemmes separat i object store `media-blobs`. Fjernelse fra en profil sletter
ikke Blob-indholdet, så en senere dokument-/retentionsetape kan afgøre sikker
oprydning uden at bryde historiske referencer.

## Bevidst afgrænsning

Sager, service, dokumenter og økonomi vises kun læsende på profilerne. Der er
ingen BBR-/adresseopslag, leverandørbestilling, mail, serviceautomatik,
korttjeneste eller Fakturacenter-integration i etape 2.
