/* src/fleet/Stopoversigt.jsx
 * Hvor dagens arbejde ligger — fordelt på sted.
 *
 * ⚠ DET HER VAR ET LANDKORT, OG DET BLEV LAVET OM MED VILJE.
 *
 * Første udgave tegnede Danmark som en håndskrevet SVG-path og satte prikker
 * på byerne. Omridset så forkert ud, og det er den slags man ikke kan rette
 * ved at gætte videre: en kystlinje tegnet på hukommelse bliver ikke rigtig
 * af endnu et forsøg.
 *
 * Vigtigere: for et dusin opgaver siger et kort ikke noget, en liste ikke også
 * siger. Man skal kunne se HVOR meget der ligger hvor, og det læses bedre af
 * en søjle end af en prik hvis størrelse man skal gætte. Et kort ville først
 * betale sig med ruter og afstande — og dem har vi ikke, fordi der ingen GPS
 * er (beslutning 22).
 *
 * ⚠ OG DET ER STADIG PLANLAGTE STOP, IKKE POSITIONER. Panelet siger det med
 * ord. Uden den sætning læses en liste over byer som "her er bilerne nu", og
 * så har vi lovet en funktion vi ikke har.
 */

import { fordelPaaSted } from "./opgaver.js";

export default function Stopoversigt({ stop = [] }) {
  const steder = fordelPaaSted(stop);
  if (!steder.length) return <p className="fc-hint">Ingen opgaver planlagt i dag.</p>;

  const flest = steder[0].antal;

  return (
    <div>
      <ul className="fc-steder">
        {steder.map((s) => (
          <li key={s.sted}>
            <span className="fc-steder-navn">{s.sted}</span>
            <span className="fc-steder-spor">
              {/* Bredden er andelen af det travleste sted, ikke af totalen —
                  ellers bliver alle søjler korte når arbejdet er spredt, og
                  så kan man ikke se forskel på nogen af dem. */}
              <span className="fc-steder-fyld" style={{ width: `${(s.antal / flest) * 100}%` }} />
            </span>
            <span className="fc-steder-prikker">
              {s.toner.map((t, i) => (
                <i key={i} className={`fc-prik fc-prik-${t}`} aria-hidden="true" />
              ))}
            </span>
            <b className="fc-steder-tal">{s.antal}</b>
          </li>
        ))}
      </ul>

      <p className="fc-hint" style={{ marginTop: 10 }}>
        Planlagte stop — ikke køretøjernes position. FleetControl har ingen GPS.
      </p>
    </div>
  );
}
