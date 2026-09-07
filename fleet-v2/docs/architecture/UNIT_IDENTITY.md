# Fælles enhedsidentitet – undersøgelse før FLEET v2 etape 2

Undersøgelsen er læsende og ændrer ikke platformens datamodel.

## Nuværende kilde

Platformens FLEET-enheder ligger i Firebase Realtime Database under
`tenants/<tenantId>/koeretoejer/<koeretoejId>`. `tenantId` kommer fra det
autentificerede token (`auth.token.tenant`) og må ikke leveres af klienten.
Postens nøgle er det stabile interne enheds-ID; `kaldenavn`/enhedsnummer og
registreringsnummer er redigerbare visningsfelter.

De relevante læse- og skriverettigheder er `koeretoejer.laes`,
`koeretoejer.skriv` og – for den klassificerede GPS-satellit –
`koeretoejer.sensitiveLaes`.

## Referencer fra øvrige moduler

- Planning normaliserer FLEET-posten til en reference med
  `{ kilde: "fleet", art: "koeretoej", id: koeretoej.id }`. Etaper gemmer
  de samme ID'er i `koeretoejIder`.
- Indberetninger, værkstedsopgaver, indkøb og omkostninger refererer med
  `koeretoejId`; databasereglerne validerer, at målet findes under tenantens
  `koeretoejer`.
- Fakturacenter ejer fakturaprocessen, men kan slå en FLEET-sags
  `koeretoejId` op i den samme enhedsliste for visning. FLEET skal kun modtage
  en godkendt faktisk omkostning/reference tilbage.
- Unitbooking administrerer transportkasser under `kasser/<kasseId>` og
  `kasseudlaan`. Det er et selvstændigt domæne og ikke et alternativt
  enhedsregister for FLEET.

## Anbefalet senere tilslutning

FLEET v2 skal ikke oprette en ny produktionsnode. Et backend-repository skal
senere adaptere `tenants/<tenantId>/koeretoejer/<id>` til v2-visningsmodellen,
mens relationer fortsat bærer det samme stabile ID. Tenant kommer fra den
fælles autentificerede kontekst, og adgang følger eksisterende permissions.

Etape 2 bruger derfor `UnitRepository`-grænsefladen med et lokalt IndexedDB-
repository. Dataene er fiktive, tenant-id'et er `tenant-demo-nordic`, og
lagringen er alene prototypelagring i den aktuelle browser. Repositoryet kan
senere udskiftes med Firebase-adapteren uden at skærmkomponenterne ændres.
