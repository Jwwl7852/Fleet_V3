# Mobil indberetning og økonomi i den lokale prototype

Mobilflowet bruger de samme `unitId`, indberetninger, sager, bilag og atomiske repository-mutationer som desktopflowet. De to syntetiske brugerprofiler demonstrerer afdelingsafgrænsning og adgang til hele flåden, men dette er ikke en sikkerhedsgrænse: en produktionsversion kræver autentificeret brugeridentitet samt servervalidering af tenant, afdeling, direkte links og scannede enheds-ID’er. QR-labelen indeholder kun `VEYRO-UNIT:<stabilt-id>` og giver aldrig i sig selv adgang.

Kladder gemmes med brugerens stabile demo-ID og valgt trin. En indsendelse genbruger den eksisterende idempotensnøgle og opretter én indberetning og én sag i samme IndexedDB-transaktion.

Økonomisiden læser eksisterende omkostningsposter og leasing-/værkstedsrelationer uden at oprette et nyt register. Poster klassificeres som faktiske, foreløbige, estimerede eller kontraktlige. Kun faktiske beløb indgår i faktiske summer; forskellige valutaer summeres ikke. Depositum udelades. Periodedistance kræver mindst to daterede målerobservationer, og nedetid beregnes som en union af overlappende dokumenterede perioder. Fakturacenter er ikke tilsluttet.
