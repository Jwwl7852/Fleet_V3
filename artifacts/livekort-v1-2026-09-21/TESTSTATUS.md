# Livekort Version 1 — teststatus 21. september 2026

## Resultat

Livekortet er gennemgået lokalt med den syntetiske kollegatest-bruger i
`demo-veyro-integration`. Ingen deployment, produktionsdata eller nye eksterne
tjenester er anvendt.

Browserkontrollen er kørt ved 1440×900, 1280×800 og 390×844. Rapporten ligger i
`browser-report.json`, og de otte sammenlignelige screenshots ligger i samme
mappe.

## Datakilde og lagring

- Enhedslisten, afdelingerne og Enhedstype-ID'erne kommer fra Version 1's
  eksisterende tenantafgrænsede enhedsregister og kundens register under
  Opsætning → Ressourcer → Enheder.
- Eksisterende aktuelle positioner bruges uændret, når de findes. Den lokale
  fixture opretter ellers tydeligt markerede demopositioner.
- Historikdelen bruger en deterministisk, lokal adapter
  (`liveMapHistory.js`). Den danner kun syntetiske pakker og gemmer dem ikke.
  Der er derfor ikke oprettet et parallelt produktionsregister.
- En rigtig historikadapter skal senere hente afgrænset efter tenant, enhed og
  periode på serveren samt gemme tracker→enhed-tilknytningen på
  registreringstidspunktet. Det er ikke verificeret mod en leverandør i denne
  levering.

## Turberegning

- Pakker sorteres efter måletid og deduplikeres på provider-pakke-ID (med
  koordinater/tid som fallback).
- Kørsel kræver tænding og hastighed over 2 km/t.
- Stilstand registreres som stop efter mindst fem minutter inden for 80 meter.
- Et markeret databrud lukker den aktuelle tur. Ruten opdeles, og afstand over
  bruddet tælles ikke med.
- Målinger vælges som seneste gyldige værdi ved eller før det valgte tidspunkt;
  nul bevares som en faktisk værdi.

## Verificeret

- Liveværktøjslinje, statusfiltre, enhedsvalg, “Find på kort” og overgang til
  historik.
- Kundens Enhedstype-register anvendes som filterkilde, med legacy-værdier som
  læsbar fallback.
- Historik med to adskilte rutesegmenter, tre ture, to stop og ét synligt
  databrud.
- Periode-popup lukker med Escape og returnerer fokus til periodeknappen.
- Positionstabel: 36 rækker, valgbare kolonner, tastaturvalg og detaljepanel.
- Målinger: hastighed, signal og trackerbatteri; manglende drivbatteri vises
  særskilt og forveksles ikke med trackerbatteriet.
- Ingen vandret siderulning ved de tre aftalte viewportstørrelser.
- CSV indeholder enhed, valgt periode, tidszone, kolonner, enheder og alle
  registreringer. Excel-kompatibel eksport og browserens print-til-PDF viser
  samme valgte periode.
- Node-test: 7/7 grønne. Målrettet ESLint: grøn. Vite-produktionsbuild: grøn
  med repositoryets eksisterende chunk-størrelsesadvarsel.

## Konkrete begrænsninger

- Ingen telematikleverandør eller rigtig OBD/GPS-historik er tilsluttet eller
  verificeret. Screenshots og afspilning er syntetiske.
- Server-side tenant-/rettighedskontrol og eksportautorisation er ikke
  end-to-end-verificeret for en rigtig historik-API. Den eksisterende
  Version 1-rutebeskyttelse og tenantkontekst er bevaret.
- Excel-knappen leverer en Excel-kompatibel `.xls`-tabel, ikke en OOXML
  `.xlsx`-arbejdsbog. PDF leveres via browserens print-til-PDF, ikke som en
  servergenereret PDF.
- Den lokale fixture har én enhed. Retningsmarkør, status og filterlogik er
  implementeret, men en fler-enheds-klynge er ikke visuelt dokumenteret i
  denne screenshotpakke.

