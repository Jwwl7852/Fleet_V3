/* src/fleet/udbyder.js
 * Klientsiden af ejerkonsollen.
 *
 * ⚠ DER SKRIVES INTET HERFRA. Alle fire handlinger er Cloud Functions, fordi
 * `udbyder/kunder` og kundeposten er `.write: false` — også for en ejer. En
 * klient der må skrive til `tenants/<id>/moduler` for ét `<id>`, kan skrive
 * til dem alle; reglen kan ikke kende forskel på "min kunde" og "en anden
 * kunde", når begge er kunder. Serveren kan, fordi den kender handlingen.
 * Se beslutning 34.
 *
 * ⚠ TREDJE TRANSPORTFIL EFTER SAMME MØNSTER — audit.js, skriv.js, brugere.js.
 * Reglerne ligger i `udbyder-regler.js`, fordi den her importerer
 * firebase.js, som kun Vite kan indlæse. Logik der lå her, kunne ikke prøves
 * i Node.
 */
import { kaldFunktion } from "../firebase.js";
import { UDBYDERSVAR, tolkUdbyderfejl } from "./udbyder-regler.js";

export {
  UDBYDERSVAR, tolkUdbyderfejl, valideNyKunde, foreslaaId,
} from "./udbyder-regler.js";

/* Små bogstaver — en 2. generations funktion bliver til en Cloud
   Run-tjeneste, og et tjenestenavn må kun være småt. Navnene SKAL matche
   functions/index.js. */
export const UDBYDERFUNKTION = {
  opret: "kundeopret",
  moduler: "kundemoduler",
  status: "kundestatus",
  admin: "kundeadmin",
};

async function kald(navn, data) {
  try {
    const svar = await kaldFunktion(navn, data);
    return { ok: true, art: UDBYDERSVAR.ok, besked: null, data: svar?.data ?? null };
  } catch (fejl) {
    if (/ingen Firebase-app/i.test(String(fejl?.message))) {
      return {
        ok: false, art: UDBYDERSVAR.demo,
        besked: "Demo-tilstand: der er ingen server, så intet blev ændret.",
      };
    }
    return { ok: false, ...tolkUdbyderfejl(fejl), data: null };
  }
}

/**
 * ⚠ KUNDE-ID'ET SENDES MED, og det er den ENE undtagelse fra reglen om at
 * tenanten kommer fra tokenet. En ejerkonto har ingen tenant — der er ikke
 * noget at tage. Adgangen bæres af `udbyder`-claim'et, som serveren tjekker
 * som det første den gør. Se noten i functions/index.js.
 */
export const opretKunde = ({ id, navn, cvr, moduler }) =>
  kald(UDBYDERFUNKTION.opret, {
    id: id.trim(), navn: navn.trim(), cvr: (cvr || "").trim() || undefined, moduler,
  });

export const saetModuler = ({ id, moduler }) =>
  kald(UDBYDERFUNKTION.moduler, { id, moduler });

export const saetStatus = ({ id, status, aarsag }) =>
  kald(UDBYDERFUNKTION.status, { id, status, aarsag: aarsag || undefined });

export const opretKundeadmin = ({ id, email, navn, kode, rolle }) =>
  kald(UDBYDERFUNKTION.admin, {
    id, email: email.trim(), navn: navn.trim(), kode, rolle: rolle || "admin",
  });
