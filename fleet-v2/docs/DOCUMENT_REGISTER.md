# FLEET v2 dokumentregister (lokal prototype)

Dokumenter gemmes som én post med stabilt `document.id`, en versionsliste og nul eller flere relationer. Relationer peger på eksisterende stabile ID'er for enhed, sag, værkstedsopgave, serviceplan eller servicepost. Fjernes én relation, bevares dokumentet og alle øvrige relationer.

En manuelt uploadet fil har sin Blob på den konkrete dokumentversion. Eksisterende billeder, videoer og dokumenter fra indberetninger og værkstedsopgaver bliver registreret med en stabil `sourceKey` og en `sourceAttachment`-reference. Dokumentregisteret kopierer ikke deres Blob. Ved forhåndsvisning slås den oprindelige vedhæftning op gennem samme datasæt. Mangler den oprindelige fil, vises metadata som utilgængelig fil; systemet opfinder ikke filindhold.

Erstatning af en fil opretter en ny version og ændrer `currentVersionId`. Ældre versioner og deres metadata-snapshot bevares. Arkivering er reversibel og sletter hverken versioner eller relationer. Permanent sletning findes ikke i denne etape.

`ensureDocumentRegistry` er en idempotent, tabsfri migration i `unitRepository`. Den nulstiller ikke IndexedDB. Leasing-relationen er reserveret til en senere etape. Enhedsprofilbilleder forbliver en del af enheden og registreres ikke automatisk som dokumenter.

Dette er lokal prototypelagring i browserens IndexedDB. En senere backend skal håndhæve tenantadskillelse, rettigheder, versionskonflikter, integritetskontrol, viruskontrol og autoritativ lagring.
