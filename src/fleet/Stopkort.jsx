/* src/fleet/Stopkort.jsx
 * Planlagte stop på et kort over Danmark.
 *
 * ⚠ DET HER ER IKKE POSITIONER, OG FORSKELLEN ER BESLUTNING 22.
 * Rute & status har INGEN GPS. Kortet tegner de steder arbejdet er PLANLAGT
 * til at foregå — altså planen — ikke hvor køretøjerne faktisk er. Panelet
 * skriver det med ord, for ellers læses prikkerne som positioner alligevel,
 * og så har vi lovet en funktion vi ikke har.
 *
 * ⚠ INGEN KORTBIBLIOTEK, OG DET ER ET VALG.
 * Leaflet med OSM-fliser ville sende hver eneste visning til en tredjepart —
 * fra en side der viser en kundes opgaver, kunder og køretøjer. I en
 * multi-tenant TMS er det en beslutning for sig, ikke en implementeringsdetalje.
 * Her er omridset en enkelt path og byerne en tabel; ingen afhængighed, ingen
 * kald ud af huset.
 *
 * Omridset er stærkt forenklet — det skal kunne genkendes som Danmark og
 * placere en prik i det rigtige landsdel, ikke måle afstande.
 */

/* Byer der findes i demo-data, i kortets eget koordinatsystem (0–100).
   Er en by ikke her, tegnes stoppet ikke — se noten ved ukendte nedenfor. */
const BYER = {
  "København": { x: 82, y: 52 },
  "Roskilde": { x: 76, y: 53 },
  "Odense": { x: 55, y: 57 },
  "Kolding": { x: 38, y: 60 },
  "Esbjerg": { x: 24, y: 62 },
  "Vejle": { x: 40, y: 53 },
  "Aarhus": { x: 44, y: 40 },
  "Randers": { x: 45, y: 33 },
  "Aalborg": { x: 41, y: 20 },
  "Herning": { x: 32, y: 41 },
  "Skagen": { x: 50, y: 5 },
  "Padborg": { x: 33, y: 76 },
};

/* Jylland + Fyn + Sjælland, groft. Tre delpaths i én. */
const OMRIDS =
  "M41 8 38 18 30 30 27 44 30 55 26 62 30 72 36 79 42 74 41 63 46 54 48 41 47 26 45 14z" +
  "M50 50 46 58 50 66 58 65 62 57 58 50z" +
  "M70 46 66 55 70 62 80 63 87 55 84 47 76 44z";

export default function Stopkort({ stop = [], hoejde = 210 }) {
  const kendte = stop.filter((s) => BYER[s.sted]);
  const ukendte = stop.length - kendte.length;

  return (
    <div className="fc-stopkort">
      <svg viewBox="0 0 100 85" style={{ height: hoejde }} role="img"
           aria-label={`${kendte.length} planlagte stop fordelt på landet`}>
        <path d={OMRIDS} className="fc-stopkort-land" fillRule="evenodd" />
        {kendte.map((s, i) => {
          const p = BYER[s.sted];
          return (
            <g key={s.id ?? i}>
              <circle cx={p.x} cy={p.y} r="3.4" className={`fc-stopkort-prik fc-stop-${s.tone || "info"}`}>
                <title>{`${s.sted} — ${s.tekst || ""}`}</title>
              </circle>
              {s.nr != null && (
                <text x={p.x} y={p.y + 1.3} className="fc-stopkort-nr">{s.nr}</text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Uden den her sætning bliver prikkerne læst som køretøjer. */}
      <p className="fc-hint fc-stopkort-note">
        Planlagte stop — ikke køretøjernes position. FleetControl har ingen GPS.
        {ukendte > 0 && ` ${ukendte} stop uden kendt by er ikke tegnet.`}
      </p>
    </div>
  );
}
