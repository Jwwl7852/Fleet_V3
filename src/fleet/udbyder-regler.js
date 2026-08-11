/* src/fleet/udbyder-regler.js
 * Reglerne for en ny kunde — uden transport.
 *
 * Fjerde gang samme opdeling: audit, skriv, brugere og nu den her.
 * Transportfilen importerer firebase.js, som læser import.meta.env og derfor
 * kun kan indlæses af Vite. Logik der ligger dér, kan ikke prøves i Node.
 */
import { ukendteModuler } from "./moduler.js";
import { ALLE_ABONNEMENTSTATUS } from "./abonnement.js";

/**
 * ⚠ SAMME MØNSTER SOM SERVEREN. RTDB-nøgler må ikke bære . $ # [ ] / — et
 * id med punktum ville skrive et helt andet sted i træet end nogen troede.
 * Står de to forskellige steder, afviser serveren et id formularen godtog.
 */
export const KUNDE_ID_MOENSTER = /^[a-z0-9][a-z0-9-]{1,39}$/;

/**
 * Et forslag til id ud af virksomhedsnavnet.
 *
 * ⚠ ET FORSLAG, IKKE EN AFLEDNING. Id'et er permanent — det står i hver
 * eneste sti under `tenants/` — og et navn kan ændre sig. Feltet kan
 * redigeres, og forslaget forsvinder i det øjeblik nogen rører det.
 */
export function foreslaaId(navn = "") {
  return navn
    .toLowerCase()
    .replace(/[æä]/g, "ae").replace(/[øö]/g, "oe").replace(/[åa]a/g, "aa")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-(a\/s|aps|ivs|is|ks|pmv)$/i, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

export function valideNyKunde(post = {}) {
  const f = {};

  const id = (post.id || "").trim();
  if (!id) f.id = "Kunde-id skal udfyldes.";
  else if (!KUNDE_ID_MOENSTER.test(id)) {
    f.id = "Kun små bogstaver, tal og bindestreg — og mindst to tegn.";
  }

  if (!post.navn?.trim()) f.navn = "Virksomhedsnavn skal udfyldes.";
  else if (post.navn.length > 120) f.navn = "Navnet må højst være 120 tegn.";

  /* CVR er valgfrit — en enkeltmandsvirksomhed under momsgrænsen har måske
     ingen. Men står der noget, skal det være otte cifre. */
  const cvr = (post.cvr || "").trim();
  if (cvr && !/^\d{8}$/.test(cvr)) f.cvr = "Et CVR-nummer er otte cifre.";

  const ukendte = ukendteModuler(post.moduler || []);
  if (ukendte.length) f.moduler = `Ukendte moduler: ${ukendte.join(", ")}`;

  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  return f;
}

export const erKendtStatus = (status) => ALLE_ABONNEMENTSTATUS.includes(status);

/* ---- Svar ------------------------------------------------------------- */

export const UDBYDERSVAR = {
  ok: "ok",
  /* Ejertjekket afviste. Systemet virker; kontoen er ikke ejer. */
  naegtet: "naegtet",
  /* Formen var forkert — ukendt modul, ulovligt id, ukendt status. */
  ugyldig: "ugyldig",
  /* Kunden findes allerede. ⚠ IKKE en fejl der bliver bedre af at prøve
     igen, og vi overskriver ikke: en eksisterende tenant har data og
     brugere, og et "opret" der nulstillede navnet ville være dyrt. */
  optaget: "optaget",
  /* Kunden findes ikke. Typisk en tastefejl i id'et. */
  ukendt: "ukendt",
  forbindelse: "forbindelse",
  demo: "demo",
};

/**
 * ⚠ BESKEDEN FRA FUNKTIONEN BRUGES DIREKTE når den findes. Den er skrevet af
 * os, på dansk, og siger præcis hvad der var galt. Den er ikke fritekst fra
 * en fremmed.
 */
export function tolkUdbyderfejl(fejl) {
  const kode = String(fejl?.code || "").replace(/^functions\//, "");
  const besked = fejl?.message || null;

  if (kode === "permission-denied" || kode === "unauthenticated") {
    return { art: UDBYDERSVAR.naegtet, besked: besked || "Kontoen har ikke udbyderadgang." };
  }
  if (kode === "already-exists") {
    return { art: UDBYDERSVAR.optaget, besked: besked || "Kunden findes allerede." };
  }
  if (kode === "not-found") {
    return { art: UDBYDERSVAR.ukendt, besked: besked || "Kunden findes ikke." };
  }
  if (kode === "invalid-argument" || kode === "failed-precondition") {
    return { art: UDBYDERSVAR.ugyldig, besked: besked || "Oplysningerne kunne ikke bruges." };
  }
  return {
    art: UDBYDERSVAR.forbindelse,
    besked: "Kunne ikke nå serveren. Ændringen er ikke gennemført. Prøv igen.",
  };
}
