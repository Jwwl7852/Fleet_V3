/* src/moduler/flaade/Vaerkstedskalender.jsx
 * Flåde – service, reservationer & fakturaer
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * SAMMENLAGT af to mockups ('Flåde – service, reservationer & fakturaer' og
 * 'Flådeopsætning & værkstedskalender'). De havde hver sin fakturaformular med
 * næsten samme felter — to steder at uploade samme faktura.
 *
 * Værkstedsbesøg skal skrive en reservation med kilde 'vaerksted', som har
 * HØJERE prioritet end booking: en bil på værksted kan ikke køre, uanset hvad
 * disponenten har lovet. Det er 'Bookingblokeringer'-kortet i mockuppen.
 *
 * Fakturabeløb gemmes ekskl. moms + momsOere separat. Mockuppen viste inkl.
 */
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, pct } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";

export default function Vaerkstedskalender() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Aktive køretøjer" vaerdi={num(k.flaade.aktive)} />
        <KpiKort label="Reserveret til værksted" vaerdi={num(k.flaade.paaVaerksted)} />
        <KpiKort label="Service inden 30 dage" vaerdi={num(k.flaade.serviceInden30)} />
        <KpiKort label="Ikke-linkede fakturaer" vaerdi={num(5)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Flåde – service, reservationer & fakturaer">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
