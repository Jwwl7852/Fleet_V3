export const facilityNavigation = [
  { path: '/facility', label: 'Overblik', icon: 'dashboard', stage: 1, description: 'Et samlet, databaseret overblik over ejendomme, sager, service og registrerede demoomkostninger.' },
  { path: '/facility/ejendomme', label: 'Ejendomme', icon: 'building', stage: 2, description: 'Søgning, filtrering og profiler for ejendomme og deres fleksible bygningsstruktur.' },
  { path: '/facility/installationer', label: 'Installationer', icon: 'installation', stage: 2, description: 'Placering, betjente områder, funktion, service, historik og relationer.' },
  { path: '/facility/indberetninger', label: 'Indberetninger', icon: 'report', stage: 3, description: 'Desktopindberetning, modtagelse og fælles triage af fejl og behov.' },
  { path: '/facility/arbejdsko', label: 'Arbejdskø', icon: 'queue', stage: 3, description: 'Fælles sagsgrundlag og fremdrift fra vurdering til afsluttet arbejde.' },
  { path: '/facility/opgaver', label: 'Opgaver', icon: 'tasks', stage: 4, description: 'Interne og eksterne opgaver, leverandørtildeling og dokumenteret udførelse.' },
  { path: '/facility/kalender', label: 'Kalender', icon: 'calendar', stage: 4, description: 'Vedligeholdelseskalender med læsbare overlap og tilgængelig oprettelse og redigering.' },
  { path: '/facility/service', label: 'Service', icon: 'service', stage: 5, description: 'Tilbagevendende planer, forekomster, varsling og servicehistorik.' },
  { path: '/facility/ejendomskort', label: 'Ejendomskort', icon: 'map', stage: 6, description: 'Manuelt registrerede, faste placeringer med links til ejendomsprofiler.' },
  { path: '/facility/dokumenter', label: 'Dokumenter', icon: 'document', stage: 6, description: 'Fælles dokumentregister med versioner, relationer og historiske referencer.' },
  { path: '/facility/mobil-indberetning', label: 'Mobil indberetning', icon: 'mobile', stage: 6, description: 'Mobil fejlindberetning med manuelt valg og lokal QR-identifikation.' },
  { path: '/facility/oekonomi', label: 'Økonomi og statistik', icon: 'chart', stage: 7, description: 'Budget, estimater og registrerede omkostninger vist tydeligt adskilt.' },
];

export const pageByPath = new Map(facilityNavigation.map((item) => [item.path, item]));
