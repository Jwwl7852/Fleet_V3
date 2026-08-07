/* src/fleet/reservations.js
 * ÉN reservationsmodel. Tre kilder skriver til den:
 *   booking      → bil + chauffør reserveret til en tur
 *   vaerksted    → bil blokeret under værkstedsbesøg
 *   facilitySag  → aktiv eller lokation optaget af et servicebesøg
 *
 * Uden dette har du tre kalendere der ikke kan se hinanden, og en bil
 * kan blive booket til Hamburg samtidig med at den står på værksted.
 *
 * Sti: tenants/<id>/reservationer/<ressourceType>/<ressourceId>/<resId>
 * Tider i epoch ms. Halvåbne intervaller: [fra, til)
 */

export const RESSOURCE = {
  koeretoej: "koeretoej",
  chauffoer: "chauffoer",
  facilityAktiv: "facilityAktiv",
  lokation: "lokation",
};

export const KILDE = {
  booking: "booking",
  vaerksted: "vaerksted",
  facilitySag: "facilitySag",
  fravaer: "fravaer",      // ferie, sygdom — blokerer chauffør
  manuel: "manuel",
};

/** Hvilke kilder må overskrive hvilke. Værksted vinder over booking:
 *  en bil på værksted kan ikke køre, uanset hvad disponenten har lovet. */
const PRIORITET = { vaerksted: 40, fravaer: 30, facilitySag: 20, booking: 10, manuel: 5 };

export const overlapper = (a, b) => a.fra < b.til && b.fra < a.til;

/** Fritekst til brugeren om hvorfor en reservation kollidere. */
export function konfliktTekst(ny, eksisterende) {
  const k = eksisterende.kilde;
  if (k.type === KILDE.vaerksted) return `Køretøjet er reserveret til værksted (${k.reference || k.id}).`;
  if (k.type === KILDE.fravaer) return `Chaufføren har registreret fravær i perioden.`;
  if (k.type === KILDE.booking) return `Allerede reserveret til booking ${k.reference || k.id}.`;
  if (k.type === KILDE.facilitySag) return `Optaget af servicebesøg fra sag ${k.reference || k.id}.`;
  return "Ressourcen er optaget i perioden.";
}

/**
 * Læser reservationer i et tidsvindue.
 *
 * RTDB kan kun filtrere på ét felt, så vi indekserer på `fra`, henter et
 * vindue der er bredt nok til at fange reservationer der startede før
 * `fra` men stadig løber, og filtrerer resten klientside. Sæt
 * "reservationer/$type/$id": { ".indexOn": "fra" } i security rules.
 */
export async function hentReservationer(db, path, ressourceType, ressourceId, { fra, til, maxVarighedDage = 30 }) {
  const vindueStart = fra - maxVarighedDage * 86400000;
  const snap = await db
    .ref(path(`reservationer/${ressourceType}/${ressourceId}`))
    .orderByChild("fra")
    .startAt(vindueStart)
    .endAt(til)
    .once("value");

  const ud = [];
  snap.forEach((barn) => {
    const r = { id: barn.key, ...barn.val() };
    if (!r.annulleret && overlapper(r, { fra, til })) ud.push(r);
  });
  return ud.sort((a, b) => a.fra - b.fra);
}

/**
 * Tjekker om en reservation kan oprettes.
 * → { ok, konflikter, kanOverskrive }
 */
export async function tjekLedig(db, path, ny, opts = {}) {
  const eksisterende = await hentReservationer(db, path, ny.ressourceType, ny.ressourceId, {
    fra: ny.fra, til: ny.til, ...opts,
  });
  const konflikter = eksisterende
    .filter((r) => r.id !== ny.id)
    .map((r) => ({ ...r, tekst: konfliktTekst(ny, r) }));

  const nyPri = PRIORITET[ny.kilde.type] ?? 0;
  const kanOverskrive = konflikter.every((r) => (PRIORITET[r.kilde.type] ?? 0) < nyPri);

  return { ok: konflikter.length === 0, konflikter, kanOverskrive };
}

/**
 * Opretter en reservation. Kaster hvis der er en konflikt af højere eller
 * samme prioritet — så "Ingen konflikter fundet" i UI'et betyder noget.
 *
 * Det endelige tjek hører i en Cloud Function: to disponenter kan ramme
 * samme sekund, og klientsidetjek kan ikke forhindre det. Denne funktion
 * er til UI-feedback, ikke til at garantere unikhed.
 */
export async function reserver(db, path, ny, { tving = false } = {}) {
  const tjek = await tjekLedig(db, path, ny);
  if (!tjek.ok && !(tving && tjek.kanOverskrive)) {
    const fejl = new Error("Ressourcen er ikke ledig i perioden.");
    fejl.konflikter = tjek.konflikter;
    throw fejl;
  }

  const ref = db.ref(path(`reservationer/${ny.ressourceType}/${ny.ressourceId}`)).push();
  const post = {
    fra: ny.fra,
    til: ny.til,
    kilde: ny.kilde,                 // { type, id, reference }
    note: ny.note || null,
    oprettetMs: Date.now(),
    oprettetAf: ny.oprettetAf || null,
    annulleret: false,
  };
  await ref.set(post);

  /* Overskrevne reservationer annulleres med spor — de slettes ikke, så
     man kan forklare hvorfor en tur blev flyttet. */
  if (tving) {
    for (const k of tjek.konflikter) {
      await db.ref(path(`reservationer/${ny.ressourceType}/${ny.ressourceId}/${k.id}`)).update({
        annulleret: true,
        annulleretMs: Date.now(),
        annulleretAf: ny.oprettetAf || null,
        annulleretAarsag: `Overskrevet af ${ny.kilde.type} ${ny.kilde.reference || ny.kilde.id}`,
      });
    }
  }

  return { id: ref.key, ...post };
}

/** Frigiv — soft delete, aldrig hård. Regnskab og disponering skal kunne
 *  genfortælle hvad der skete. */
export const frigiv = (db, path, ressourceType, ressourceId, resId, af, aarsag) =>
  db.ref(path(`reservationer/${ressourceType}/${ressourceId}/${resId}`)).update({
    annulleret: true, annulleretMs: Date.now(), annulleretAf: af || null, annulleretAarsag: aarsag || null,
  });
