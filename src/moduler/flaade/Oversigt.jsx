/* src/moduler/flaade/Oversigt.jsx
 * Flåde
 *
 * SKELET. Mockup findes — indholdet er ikke bygget endnu.
 *
 * 'Omkostning pr. km' her er DRIFTSOMKOSTNING uden chauffør. Kalkulationsprisen
 * inkl. chauffør ligger i Bookingopsætning. Hold navnene adskilt.
 * Feltet hedder `driftPrKmOere` netop af den grund — beslutning 11.
 *
 * DET HER ER STEDET HVOR EN ENHED OPRETTES. Mockuppens biler er hardcodede;
 * datamodellen kom med beslutning 18.
 *
 * FLÅDEN ER IKKE EN LISTE AF BILER. Syv arter i to grupper — se
 * fleet/flaade.js:
 *
 *   motoriseret  traekker, lastbil, varevogn, scooter, truck
 *   paahaengt    trailer, paahaeng — eget registreringsnummer, egen synsfrist,
 *                egne dæk, men ingen motor
 *
 * `art` STYRER FELTSKEMAET, som `art` på opgaver. En scooter har ingen
 * tachograf og ingen køre-hviletid; ENHEDSART siger hvilke felter der findes.
 * Reglerne kræver art, status, division og en positiv laengdeMm — resten er
 * formularlogik.
 *
 * NÅR DU BYGGER DEN:
 *
 *  - laengdeMm er MILLIMETER som integer. Færgetakster har grænser ved 10 og
 *    20 m, og 9,998 mod 10,002 afgør prisen. Vis meter, gem millimeter —
 *    aldrig en float. Samme disciplin som øre i beslutning 2.
 *  - En trailer kan reserveres selvstændigt, men ikke disponeres alene. Brug
 *    kanDisponeres() frem for at skrive reglen i skærmen.
 *  - En solgt bil kan ikke slettes. Sæt status til `solgt`; der hænger
 *    indberetninger og omkostningshistorik på id'et, og reglerne afviser en
 *    sletning — en Slet-knap ville fejle.
 *  - liveGPS hører i sensitive/koeretoejer bag koeretoejer.sensitiveLaes.
 */
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, pct } from "../../fleet/format.js";
import { Kort, Tom, KpiKort, KpiRaekke } from "../../fleet/ui.jsx";
import { Henter, Fejl } from "../../fleet/ui.jsx";

export default function FlaadeOversigt() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Aktive køretøjer" vaerdi={num(k.flaade.aktive)} />
        <KpiKort label="Ude af drift" vaerdi={num(k.flaade.udeAfDrift)} />
        <KpiKort label="Service inden 30 dage" vaerdi={num(k.flaade.serviceInden30)} />
        <KpiKort label="Driftsomk. pr. km" vaerdi={kr(k.flaade.omkostningPrKmOere,2)} />
      </KpiRaekke>
      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}
      <Kort titel="Flåde">
        <Tom>Indholdet er ikke bygget endnu. Nøgletallene ovenfor kommer fra
             den fælles KPI-node, så de matcher Dashboard.</Tom>
      </Kort>
    </div>
  );
}
