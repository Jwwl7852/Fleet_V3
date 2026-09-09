# Værkstedsforløb i FLEET v2-prototypen

En værkstedsopgave (`workshopTask`) oprettes eksplicit fra en eksisterende sag med status `ready`. Oprettelse eller statusændringen `Klar til værksted` opretter aldrig automatisk en opgave. En sag kan højst have én aktiv opgave; afsluttede eller annullerede opgaver bevares, så en senere opgave kan referere til samme sag uden at slette historik.

Relationerne er stabile: `unitId → reportId → caseId → workshopTaskId → bookingId`. Indberetningens oprindelige tekst og billeder genbruges via relationen og kopieres ikke til en ny demopost.

Opgavestatus er `created`, `booked`, `in_progress`, `waiting_parts`, `completed` og `cancelled`. Tilladte overgange er samlet i `src/data/workshopWorkflow.js`. En opgave kan gå direkte fra `created` til `in_progress` ved akut arbejde. Fremtidig booking ændrer ikke sag eller enhed til “På værksted”; det sker først ved `in_progress` eller `waiting_parts`.

Bookinger lagrer entydige ISO-tidspunkter og vises i dansk lokal tid. Interne ressourcer må ikke overlappe, og samme enhed må ikke have overlappende værkstedsophold. Et eksternt værksted må have flere samtidige opgaver, fordi værkstedet ikke modelleres som én enkelt plads. `requested` er ønsket tid, mens `confirmed` er manuelt bekræftet aftale.

Afslutning kræver udført arbejde, faktisk sluttid, vurdering af om problemet er løst og eksplicit anvendelighed. Ved uløst problem går sagen tilbage til vurdering. Historik, eventuel servicebogspost, faktiske omkostninger og sags-/opgavehændelser skrives i samme IndexedDB-transaktion. Estimater opbevares kun på opgaven og tæller ikke som faktiske omkostninger. Omkostninger er DKK ekskl. moms og har reference til både enhed og opgave.

Driftsstatus og sikkerhedsmæssig anvendelighed er adskilt. Afslutning af én opgave kan ikke frigive en enhed, hvis en anden aktiv sag eller et andet fysisk værkstedsophold fortsat spærrer.

Alt er lokal prototypedata. Der sendes intet til værksteder, Planning, Fakturacenter, Firebase eller andre produktionstjenester.
