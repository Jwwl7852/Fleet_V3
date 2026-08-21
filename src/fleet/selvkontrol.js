/* src/fleet/selvkontrol.js
 * Demo-sættenes selvkontroller — ét sted, og de kan ikke tage appen med.
 *
 * ⚠ HVORFOR FILEN FINDES. En selvkontrol i `demo-oekonomi.js` løb over
 * `["gods", "bus"]` og slog op i `DEMO_KPI[division]`. Aksen blev fjernet
 * (beslutning 70), sættet blev fladt, opslaget gav `undefined` — og
 * `.oekonomi` på det KASTEDE.
 *
 * Kontrollen kører på MODULNIVEAU. Undtagelsen skete altså mens modulet blev
 * indlæst, og hver skærm der importerer `omkostningsserie()` blev en **hvid
 * side**. Planning blandt dem.
 *
 * ⚠ EN KONTROL DER SKAL ADVARE, MÅ ALDRIG KUNNE FEJLE HÅRDERE END DET DEN
 * ADVARER OM. Den fandtes for at fange en drift mellem to demo-sæt — et
 * problem der viser et forkert tal på en skærm. Prisen for at have den blev
 * en app der ikke starter.
 *
 * ⚠ OG DEN SKAL STADIG ADVARE OM SIG SELV. Et tavst `catch` ville gøre en
 * kontrol der er holdt op med at virke, til en kontrol ingen savner — samme
 * fejl som en lint der springer noget over: den siger ikke nej, den siger
 * ingenting.
 *
 * Der var 23 af dem, og 19 stod uden noget værn.
 */

/**
 * selvkontrol(navn, fn) — kør en demo-selvkontrol i DEV, og lad den ikke kaste.
 *
 * `navn` er filens, så advarslen kan findes: "demo-flaade: …".
 */
export function selvkontrol(navn, fn) {
  /* ⚠ KUN I DEV. Kontrollerne læser hele datasæt igennem, og de siger noget om
     demo-data — som ikke findes i produktion, hvor noderne er seedet. */
  if (!import.meta.env?.DEV) return;
  try {
    fn();
  } catch (e) {
    console.warn(
      `${navn}: selvkontrollen kunne ikke køre — ${e?.message || e}. `
      + "Kontrollen er sprunget over; den tager ikke appen med. "
      + "Se selvkontrol.js og beslutning 74."
    );
  }
}
