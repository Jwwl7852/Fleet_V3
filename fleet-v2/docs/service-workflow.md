# Serviceforløb i FLEET v2

Serviceprototypen bruger de eksisterende, stabile enheds-ID'er og den fælles servicebog. `serviceRequirements` beskriver beregningsgrundlag og varsler; en faktisk udførelse gemmes fortsat i `relations.service`. `serviceEvents` er kun lokal prototypehistorik.

## Beregning

Et krav kan have en fast dato, et månedsinterval, et målerinterval eller en kombination. Ved kombination udløser den først nåede grænse servicebehovet. Ukendt basis eller manglende aktuel målerstand vises som **Mangler grundlag** og bliver ikke til nul. En booking markerer højst kravet som planlagt; kun en eksplicit registrering af udført service flytter grundlaget og næste frist.

## Planlægning og relationer

Planlægning opretter atomisk én manuel servicesag og én værkstedsopgave med relation til det samme servicekrav og den samme enhed. Sagen får den fælles læsbare Veyro-reference, men ingen fiktiv indberetning. Gentaget planlægning genbruger den aktive opgave.

Ved afsluttet og løst servicearbejde oprettes én idempotent post i den eksisterende servicebog, og kravet får nyt datobasis og/eller målerbasis. En ekstern opgave kan samtidig afvente Fakturacenter; det forhindrer ikke servicebogsopdateringen eller beregningen af næste frist og holder ikke enheden kunstigt ude af drift. Sagen lukkes aldrig automatisk.

## Prototypegrænse

Alle data ligger i lokal IndexedDB. Produktionsudgaven skal håndhæve tenant, idempotens og autoritative referencer på serveren. FLEET opretter ikke fakturakontrol eller bogføring; eksterne værkstedsbeløb forbliver foreløbige, indtil kontrollerede fordelinger eventuelt modtages gennem den dokumenterede Fakturacenter-kontrakt.

## Tilbagevendende planer og forekomster

En brugerdefineret plan gemmes som et `serviceRequirement` pr. enhed. En fælles skabelon ligger i `serviceTemplates`, mens hver tildelt enhed fortsat får sit eget krav, beregningsgrundlag og sin egen historik. `serviceOccurrences` er den stabile identitet for én konkret varsling. Forekomstnøglen kombinerer kravets stabile ID med den aktuelle dato- og målergrænse.

Ved varsling opretter én IndexedDB-transaktion præcis én indberetning og én sag. Begge bruger den fælles Veyro-reference, og forekomsten reserverer et bestillingsnummer gennem den eksisterende bestillingsnummerlogik. Nummeret betyder ikke, at noget er sendt eller accepteret. Oprindelsen er `service_automation`; der opfindes ingen indberetter.

Gentagne kontroller, genindlæsning og flere faner møder samme forekomstnøgle i den serialiserede tenant-transaktion og genbruger derfor forløbet. Den manuelle Planlæg-handling viderefører den varslede sag. Eksisterende planlagte værkstedsopgaver migreres til forekomster uden nye rapporter eller sager.

Kun den ældste aktuelle, uafsluttede intervalgrænse repræsenteres. Efter længere fravær oprettes derfor ikke en bunke historiske sager. En årlig kalenderplan flyttes til samme valgte måned/dag næste år, selv om arbejdet blev udført forsinket. Måneds- og målerintervaller regnes derimod fra faktisk udført service.

Varslingskontrollen kører ved appstart og hvert minut, mens prototypen er åben. Demodatoen kan angives manuelt i Serviceautomatik-dialogen. Oprettelse mens appen er lukket kræver senere en serverbaseret planlagt kørsel.

Automatisk mail er en separat kundeindstilling og er slået fra som standard. Selv når tilvalg og regel markeres i demotilstanden, findes der ingen afsenderforbindelse, og ingen mail sendes.
