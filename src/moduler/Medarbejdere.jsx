/* src/moduler/Medarbejdere.jsx
 * Medarbejdere
 *
 * SKELET. Der findes INGEN mockup for denne skærm — den manglede i hele
 * designsættet, og det er grunden til at hverken Bemanding eller Kompetencer
 * havde noget sted at hente navne fra. Datamodellen kom med beslutning 18;
 * skærmen er den der mangler.
 *
 * DET HER ER STEDET HVOR EN MEDARBEJDER OPRETTES. Ikke Opsætning → Brugere &
 * roller: dér oprettes et LOGIN. En chauffør har måske aldrig et, en vikar
 * sjældent, en kontormedarbejder begge.
 *
 *   uid       hvem der GJORDE noget   indberetninger.oprettetAf, auditloggen
 *   personId  hvem det HANDLER OM     reservationer, fravær, opgaver, etaper,
 *                                     kompetencer
 *
 * Nøglen her er personId. uid er et valgfrit felt, der sættes når personen
 * får adgang — se CLAUDE.md.
 *
 * NÅR DU BYGGER DEN:
 *
 *  - Læs med useListe("personale", { ordnPaa: "status", lig: "aktiv", ... }).
 *    Kræver personale.laes, som alle presets har.
 *  - Skrivning kræver personale.skriv, som kun admin har. Skjul ikke bare
 *    knappen — serveren afviser, og fejlen skal forklares.
 *  - `funktioner` er et MAP, ikke et array: en person kan være både mekaniker
 *    og chauffør. Katalog og labels står i fleet/personale.js.
 *  - `division` er en ANDEN akse end funktioner. Lars med C+D er `faelles`.
 *  - CPR, privatadresse og baggrundskontrol hører i sensitive/personale bag
 *    personale.sensitiveLaes. Reglerne AFVISER dem i general — skriv dem ikke
 *    i formularen her.
 *  - En medarbejder kan ikke slettes. Sæt status til `fratraadt`; der hænger
 *    reservationer og indberetninger på personId'et. Reglerne afviser en
 *    sletning, så en Slet-knap ville fejle.
 *  - Udløbende kompetencer hører på Kompetencer-skærmen. Link dertil frem for
 *    at gentage listen — se hvordan Kunder linker til Bookingopsætning.
 */
import { Kort, Tom } from "../fleet/ui.jsx";

export default function Medarbejdere() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Medarbejdere">
        <Tom>
          Denne skærm er ikke bygget endnu. Datamodellen findes —
          se <b>personale/</b> i ARKITEKTUR.md og beslutning 18.
        </Tom>
      </Kort>
    </div>
  );
}
