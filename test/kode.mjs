/* test/kode.mjs
 * Kildekode uden kommentarer — ÉT sted.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Mange prøver læser en kildefil som TEKST og måler et mønster i den. De skal
 * alle først fjerne kommentarerne — ellers måler de en beskrivelse frem for
 * kode, og det er sket tre gange: `rutedeling.test.mjs` faldt på filhovedets
 * *"sidebar + topbar + `<Outlet/>`"*, og to andre på et ord i en note.
 *
 * Hver prøve skrev sin egen. Målt: **32 filer, syv forskellige varianter.**
 * Det er `erGyldigMail()` igen (beslutning 42) — fire steder, tre svar.
 *
 * ⚠ OG VARIANTEN GAV ET FORKERT SVAR. Den almindelige,
 *
 *     s.replace(/\/\*[\s\S]*?\*\//g, "")
 *
 * ser `/*` inde i en STRENG. Da chaufførappen fik ruten `path="/app/*"`,
 * åd den fra det `/*` og frem til næste `*​/` — altså hele resten af
 * rutetræet — og to prøver meldte at **hver eneste skærm manglede en rute.**
 * Fejlen så ud som om App.jsx var i stykker.
 *
 * Leddet nedenfor kræver at `/*` står efter linjestart, blanktegn eller `{`.
 * En kommentar gør altid det; en streng med en jokertegnsrute gør ikke.
 *
 * Se beslutning 106.
 */

/**
 * Fjern blok- og linjekommentarer fra JS/JSX.
 *
 * ⚠ DEN ER IKKE EN PARSER, og skal ikke være det. Den kender ét mønster mere
 * end den naive: at en kommentar begynder på en ordgrænse. Skal en prøve
 * måle noget der kræver rigtig parsing, hører den ikke i en regex.
 */
export const udenKommentarer = (kode) => String(kode)
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, "$1")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * Samme, men linjenumrene bevares — blokke bliver til lige så mange tomme
 * linjer. Til prøver der peger på et linjenummer i en fejlbesked.
 */
export const udenKommentarerMedLinjer = (kode) => String(kode)
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g,
    (m, foer) => foer + "\n".repeat((m.match(/\n/g) || []).length))
  .replace(/^(\s*)\/\/.*$/gm, "$1");
