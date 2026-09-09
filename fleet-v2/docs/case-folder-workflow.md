# Sagsmappe og reference – lokal prototype

En indberetning og dens sag deler én stabil læsbar `VYR-ÅÅÅÅ-NNNNN`-reference,
mens de fortsat har separate interne ID'er. Kladder bevarer referencen, og
bestillinger under sagen får egne `BST-ÅÅÅÅ-NNNNN`-referencer.

Livscyklussen er bevidst opdelt i fire akser:

1. værkstedsopgavens arbejdsstatus;
2. enhedens sikkerhedsmæssige anvendelighed;
3. fakturaafklaring;
4. sagens åbne/lukkede status.

Afsluttet arbejde kan frigive enheden og skrive historik/servicebog uden at
lukke sagen. Normal lukning kræver afklarede opgaver, alle forventede
kontrollerede fakturaer og en eksplicit bekræftelse. Lukning uden faktura
kræver særskilt valg, begrundelse og samme bekræftelse. Genåbning er en
eksplicit, historikført handling.

Alle hændelser i denne etape er lokal prototypelogning i IndexedDB og er ikke
et produktionssikret auditspor.
