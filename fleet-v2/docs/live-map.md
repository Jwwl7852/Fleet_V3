# Livekort og positionslaget

Livekort, Overblikkets minikort og enhedsprofilens GPS-fane læser alle `relations.positions`, knyttet til det eksisterende stabile `unitId`. Det tidligere lokale `relations.gps` bevares kun som migrationskilde og bruges ikke af skærmene.

En position har særskilte tidspunkter for måling (`measuredAt`), modtagelse (`receivedAt`) og seneste enhedskontakt (`lastContactAt`). Bevægelse og forbindelsesstatus er uafhængige felter. Koordinater valideres, og en måling med samme eller ældre måletidspunkt kan ikke erstatte den aktuelle position.

## Kortgrundlag

Prototypen viser de synlige OpenStreetMap Standard-rasterfliser fra `https://tile.openstreetmap.org/{z}/{x}/{y}.png` og viser altid attribution til OpenStreetMap-bidragsydere. Der foretages ingen prefetching, massehentning eller offline-download. Browserens normale HTTP-cache anvendes. Flisetjenesten er best effort og har ingen SLA.

Hvis fliser ikke kan indlæses, vises et lokalt reservekort med et geografisk projekteret koordinatgitter. Reservekortet opfinder ikke veje eller adresser; enhedslisten og positionsdetaljerne virker fortsat.

Kilder og vilkår:

- https://operations.osmfoundation.org/policies/tiles/
- https://www.openstreetmap.org/copyright

## Lokal demo og senere integration

Alle positioner er fiktive og mærkes “Demopositioner – ikke live”. Demokontrollen skriver kun til positionslaget og påvirker ikke Service-demotid eller andre domæner. Når appen er lukket, modtages der ingen positioner.

En senere GPS-/OBD-adapter skal sende tenant-ID, stabilt enheds-ID, kilde, koordinater, nøjagtighed samt de tre tidspunkter. Produktionsdrift kræver serverbaseret autorisation, tenantkontrol, idempotens og autoritativ rækkefølge af målinger.

Livekortet indeholder bevidst ingen ruter, stop, destinationer, opgaver, besøgsrækkefølge, arbejdsplaner eller chaufførplanlægning.
