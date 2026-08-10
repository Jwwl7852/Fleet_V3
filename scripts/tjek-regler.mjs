/* scripts/tjek-regler.mjs
 * Er de UDRULLEDE regler den samme fil som firebase.rules.json?
 *
 * ⚠ HVORFOR SCRIPTET FINDES: de var det ikke.
 *
 * DEV kørte en ældre version med en `.read` på `tenants/$tenantId`. En .read
 * kaskaderer ned over alt under sig, og et strammere barn kan ikke tilbagekalde
 * den — så hele klassificeringen fra beslutning 17 var væk. Seks noder fandtes
 * slet ikke i den udrullede version: sensitive, vaerdi, personale, kompetencer,
 * roller, $klasse. En chauffør uden personale.sensitiveLaes kunne læse
 * sensitive/personale.
 *
 * Reglerne var rigtige hele tiden. De kørte bare ikke.
 *
 * De 591 prøver havde ret om FILEN og sagde intet om DATABASEN — de kører mod
 * emulatoren med den lokale fil. Ingen af dem kunne fange det, og ingen af dem
 * er forkerte. Det er projektets kernefejl i en ny form: en kontrol der findes
 * i repoet, men ikke i virkeligheden.
 *
 * Kør:
 *   npm run regler:tjek      sammenlign
 *   npm run regler:udrul     udrul OG sammenlign — en udrulning er ikke
 *                            faerdig foer den er efterproevet
 *
 * Firebase returnerer filen BYTE-IDENTISK: kommentarer, indrykning,
 * raekkefoelge. Derfor er sammenligningen tekstuel — ingen JSON-parsing, ingen
 * semantisk diff der selv kan tage fejl. Kun linjeskift normaliseres, fordi en
 * frisk klon paa Windows kan give CRLF lokalt mod LF udrullet.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const NOEGLEFIL = ".serviceaccount-dev.json";
export const REGELFIL = "firebase.rules.json";

/* ------------------------------------------------------------------ *
 * Sammenligningen — ren, saa den kan proeves uden netvaerk
 * ------------------------------------------------------------------ */

const linjer = (s) => String(s ?? "").replace(/\r\n/g, "\n").split("\n");

/**
 * @returns {{ens, linjerLokal, linjerUdrullet, foersteAfvigelse}}
 *
 * foersteAfvigelse baerer linjenummer og BEGGE sider. En besked der kun siger
 * "de er forskellige", sender folk i gang med at diffe i haanden — og saa
 * bliver tjekket noget man springer over.
 */
export function sammenlignRegler(lokal, udrullet) {
  const a = linjer(lokal);
  const b = linjer(udrullet);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return {
        ens: false,
        linjerLokal: a.length,
        linjerUdrullet: b.length,
        foersteAfvigelse: {
          nr: i + 1,
          lokal: a[i] ?? "(filen slutter her)",
          udrullet: b[i] ?? "(den udrullede slutter her)",
        },
      };
    }
  }
  return { ens: true, linjerLokal: a.length, linjerUdrullet: b.length, foersteAfvigelse: null };
}

/** Beskeden til mennesket. Adskilt fra sammenligningen, saa begge kan proeves. */
export function rapport(r, projektId) {
  if (r.ens) {
    return `Reglerne i ${projektId} er identiske med ${REGELFIL} (${r.linjerLokal} linjer).`;
  }
  const a = r.foersteAfvigelse;
  return [
    `DRIFT: de udrullede regler i ${projektId} er IKKE ${REGELFIL}.`,
    "",
    `  ${REGELFIL}: ${r.linjerLokal} linjer`,
    `  udrullet:          ${r.linjerUdrullet} linjer`,
    "",
    `  foerste forskel, linje ${a.nr}:`,
    `    fil:      ${a.lokal.trim().slice(0, 100)}`,
    `    udrullet: ${a.udrullet.trim().slice(0, 100)}`,
    "",
    "Databasen haandhaever det UDRULLEDE, ikke filen. Proeverne siger kun noget",
    "om filen. Udrul med:  npm run regler:udrul",
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * Koerslen
 * ------------------------------------------------------------------ */

/**
 * ⚠ INGEN PRODUKTIONSSPAERRING HER, OG DET ER BEVIDST.
 *
 * provisioner-dev.mjs naegter at koere mod produktion, fordi den SKRIVER.
 * Det her er en ren laesning, og mod produktion er den MERE vaerd end mod DEV:
 * dér er konsekvensen af drift en kunde der ser data, de ikke maa se.
 *
 * Kopierede vi spaerringen herind af vane, ville vi goere den vigtigste
 * kontrol umulig praecis dér hvor den betyder mest. Spaerringen hoerer til
 * skrivning, ikke til projektet.
 *
 * Noeglefilen kan derfor angives:  node scripts/tjek-regler.mjs <noeglefil>
 */
async function main() {
  const noeglefil = process.argv[2] || NOEGLEFIL;

  let noegle;
  try {
    noegle = JSON.parse(readFileSync(noeglefil, "utf8"));
  } catch (e) {
    throw new Error(
      e.code === "ENOENT"
        ? `AFBRUDT: ${noeglefil} mangler. Se README om servicekontonøglen.`
        : `AFBRUDT: ${noeglefil} kunne ikke læses som JSON.\n${e.message}`
    );
  }

  const lokal = readFileSync(REGELFIL, "utf8");

  const { initializeApp, cert } = await import("firebase-admin/app");
  const app = initializeApp({ credential: cert(noegle) });
  const token = await app.options.credential.getAccessToken();

  const url =
    `https://${noegle.project_id}-default-rtdb.europe-west1.firebasedatabase.app` +
    `/.settings/rules.json?access_token=${token.access_token}`;
  const svar = await fetch(url);
  if (!svar.ok) {
    await app.delete();
    throw new Error(`AFBRUDT: kunne ikke hente reglerne (HTTP ${svar.status}).`);
  }
  const udrullet = await svar.text();
  await app.delete();

  const r = sammenlignRegler(lokal, udrullet);
  console.log(rapport(r, noegle.project_id));
  if (!r.ens) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`\n${e.message}\n`);
    process.exit(1);
  });
}
