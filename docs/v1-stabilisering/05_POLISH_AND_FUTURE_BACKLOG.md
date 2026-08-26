# Polish og future-backlog

Ikke en roadmap. Kun det der blev observeret undervejs og bevidst IKKE skal bygges under stabiliseringen. POLISH = virker, kunne forbedres senere. FUTURE FEATURE = reelt ikke bygget, allerede ærligt afsløret i UI'et, og ude af scope her.

---

## POLISH

- **Stale kildekodekommentarer** i `Planlaegdialog.jsx`/`Vaerkstedskalender.jsx` påstår at case-mail ikke er bygget — den er (Skive 3D). Forvirrer den næste udvikler, ikke slutbrugeren.
- **Dashboard-kortene for Warehouse/Unitbooking** siger "Nøgletal er endnu ikke tilgængelige" — teknisk korrekt (Dashboard-aggregeringen dækker dem endnu ikke), men underdriver at begge modulers EGNE hjem har rige, rigtige nøgletal ét klik væk. Ordlyden bør skelne "ikke på denne oversigt" fra "ikke bygget."
- **Bookmark-tvetydighed** på `/unitbooking/kalender` efter en tidligere omorganisering — allerede selvdokumenteret som en bevidst, accepteret omkostning, ikke en fejl.
- **Kassetype-oprettelse** ligger på Reolpladser-skærmen, ikke sammen med "Opret ny kasse" — bevidst (type er stamdata), men en lille opdagelsesfriktion for en lagermedarbejder der ikke ved det.
- **Leverandør-tabellen** gentager "for lidt grundlag" i to kolonner for næsten hver række — ærligt, men støjende at skimme; et ikon/tooltip ville skalere bedre.
- **Procure & vareforbrug (modulhjem)** er visuelt tættere pakket (5-trins procesbånd + to KPI-rækker + indbakketabel + hjælpepanel på én skærm) end søsterskærme som Dashboard/Fleet.
- **8 efterladte DEV-testordrer** (BST-2026-00047…00055) og et par gennemskueligt navngivne test-leverandører optræder i Procures ordrehistorik og i enhver leverandørvælger. Harmløst i DEV, men bør ryddes op før dette seed bruges til en demo eller onboarding.
- **Hængende karantænedokumenter** — se F6 i `02`. En fremtidig udløbs-/oprydningsmekanisme for uafsluttede uploads er værd at overveje, ikke akut.
- **12 af 15 skrive-gatede domæner** mangler stadig en tilsvarende læse-permission — et allerede kendt, løbende, sporet hærdningsarbejde, ikke et nyt fund.
- **Admin = union af alt** — korrekt design, nævnt kun som en påmindelse til den der fremover provisionerer rigtige tenant-admins om ikke at default'e til admin for at undgå friktion.

### Let designgennemgang (bevidst kort — en større designkonsolidering kommer separat)

Ingen BLOCKER eller HIGH FRICTION fundet i design på tværs af ~10 gennemgåede skærme (Dashboard, tabeller, dialoger, kalender, chaufførapp). Observationer, alle POLISH:
- Informationsdensiteten varierer en del mellem skærme (Leverandører og Procures modulhjem er tættere end Dashboard/Fleet).
- Statuspiller og "adgang nægtet med grund"-bannere er konsekvent brugt på tværs af skærme — en reel styrke, ikke et fund.
- Chaufførappens fire store, kontrastrige kort er et godt modstykke til de tættere kontorskærme.
- DEV-miljøbanneret øverst er tydeligt og ikke i vejen.

---

## FUTURE FEATURE (allerede ærligt afsløret — byg IKKE under stabilisering)

- **Workforce-dashboardets nøgletal** ("Kapacitetsgrad", "Underbemandede vagter", "Ledige kapaciteter") viser bevidst "—" i stedet for et opdigtet tal — spørgsmålet er stillet, ikke besvaret endnu.
- **`/bemanding` (Bemandingsplan)-stub** — korrekt skjult fra navigationen, siger selv tydeligt at den ikke er en del af V1 endnu, peger videre til Kompetencer.
- **Hjælp/support-sagsopfølgning** — ingen ticketing-funktion findes; skærmen siger det ligeud og henviser til en kontaktperson i stedet for at foregive en formular.
- **Fakturaer & bilag — automatisk indtag** (drag & drop, invoice-mail, mobilkvittering) — skærmen selv siger "Ingen af indgangene er bygget endnu"; blokerer ikke den manuelle match/godkend-vej, som virker.
- **Opsætning → Generelt** — tre eksplicit listede åbne spørgsmål om hvad der skal kunne redigeres; en deaktiveret knap med en begrundet tooltip, ikke en knap der lover noget.
- **GDPR-sletning og retention-perioder** — organisatoriske/juridiske beslutninger, ikke kodearbejde; se `04` for detaljer.
