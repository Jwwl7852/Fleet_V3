# FACILITY v2 – aflevering af etape 3–7

## Lokale indgange

- Overblik: `http://127.0.0.1:5189/facility`
- Mobil indberetning: `http://127.0.0.1:5189/facility/mobil-indberetning`
- Indberetninger og triage: `http://127.0.0.1:5189/facility/indberetninger`
- Arbejdskø: `http://127.0.0.1:5189/facility/arbejdsko`
- Opgaver: `http://127.0.0.1:5189/facility/opgaver`
- Kalender: `http://127.0.0.1:5189/facility/kalender`
- Service: `http://127.0.0.1:5189/facility/service`
- Dokumenter: `http://127.0.0.1:5189/facility/dokumenter`
- Ejendomskort: `http://127.0.0.1:5189/facility/ejendomskort`
- Økonomi: `http://127.0.0.1:5189/facility/oekonomi`

## Implementeret

Indberetninger kan oprettes på desktop og mobil med vedvarende kladde og
idempotensnøgle. Oprettelsen gemmer indberetning, sag og bilagsrelationer i én
IndexedDB-transaktion. Triage, Arbejdskø og sagsmappe læser samme sag.

Sager kan have flere interne eller eksterne opgaver med separate opgave- og
bestillingsnumre. Mailen er en versionsstyret, redigerbar kladde og sendes ikke.
Kalenderen understøtter uge, måned og liste, konkrete ressourcer, overlap,
redigering og annullering uden krav om drag-and-drop. Udførelse omfatter log,
timer, materialer, tjekliste, løsning og resterende begrænsninger.

Serviceplaner understøtter kalenderintervaller, fast årlig dato og driftstimer.
Varsling/catch-up opretter højst én åben forekomst med indberetning og sag.
Dokumentregistret har multifil-upload, metadata, relationer, preview/download,
versioner og arkivering. Kortet bruger kun manuelt registrerede koordinater.
Økonomi holder budget, estimat, tilbud, tid, materialer og registrerede
omkostninger adskilt og summerer hver kilderegistrering én gang.

## Visuel kontrol

Alle 14 skærme er optaget ved 1680 × 1050 i `docs/visual-check`. Overblik er
bevaret som godkendt. De øvrige skærme følger referencernes panelrækkefølge,
kompakte tabeller, handlingsplacering og navy/teal designsprog.

Begrundede resterende afvigelser:

- Mobilskærmen viser QR-generator og én interaktiv telefonformular side om side;
  referencens to statiske telefontrin er samlet til et brugbart flow.
- Dokument- og kalenderbilleder kan være tomme, indtil brugeren selv uploader
  filer eller opretter bookinger. Der indsættes ikke nye demosager i eksisterende
  brugerdata for at pynte på skærmbillederne.
- Ejendomskortet er en lokal, skematisk koordinatprojektion uden kortfliser. Derfor
  er der ingen ekstern attribution eller risiko for at sende adresser ud.
- Etape-2-profilerne bevarer den allerede godkendte funktionsrige opbygning, selv
  hvor kolonneproportionerne ikke er pixelidentiske med referencebilledet.

## Afgrænsning

Prototypen har ikke produktionslogin, sikker tenantadgang, reel
abonnementsstyring, Fakturacenter-forbindelse, mailafsendelse, serverbaseret
servicekørsel eller datadeling mellem enheder. Normal sagslukning er derfor
blokeret i appen, hvis fakturaafklaring kræves; kun den særskilt begrundede
undtagelse kan bruges. Normal lukning er testet med en isoleret testadapter og
vises ikke som en virkelig integration.
