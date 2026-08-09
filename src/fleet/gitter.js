/* src/fleet/gitter.js
 * Gitterkalenderens REGNESTYKKE. Ingen React — komponenten ligger i
 * Gitterkalender.jsx.
 *
 * Opdelingen er ikke pænhed: node kan ikke indlæse .jsx, så lå udregningen i
 * komponenten, kunne den ikke testes. Det var samme problem som holdt DEMO_KPI
 * fanget i useKpi.js.
 *
 * TRE STEDER SKAL BRUGE DET SAMME GITTER: Værkstedskalender (køretøjer × dage),
 * Facility → Servicekalender (lokationer × dage) og Disponering (biler × timer).
 * Byggede hver skærm sit eget, ville de læse det samme interval forskelligt —
 * og et gitter der er én dag forskudt, opdages ikke ved at kigge på det.
 *
 * INTERVALLER ER HALVÅBNE: [fra, til). Samme regel som reservationsmodellen,
 * fravær og lagerkapacitet. En blok der slutter mandag kl. 00.00 fylder ikke
 * mandag.
 */

import { overlapper } from "./reservations.js";
import { klokke } from "./format.js";

export const ENHED = { dag: "dag", time: "time" };

/** Loft på antal kolonner. Rammes det, er vinduet for bredt til et gitter —
 *  så hører spørgsmålet i en liste eller et nøgletal. Vi afkorter ikke i
 *  stilhed; samme holdning som MAX_PARTITIONER i useListe. */
export const MAX_SLOTS = 200;

/**
 * slots(fra, til, enhed) → [{ fra, til }]
 *
 * Bygget med Date og ikke med addition af 86400000, fordi et døgn ikke altid
 * er 24 timer: ved sommertidsskiftet er det 23 eller 25. Lagde vi et fast
 * millisekundtal til, ville kolonnerne glide en time i marts og en time i
 * oktober, og en blok ville lande i den forkerte dag.
 */
export function slots(fra, til, enhed = ENHED.dag) {
  if (!Number.isFinite(fra) || !Number.isFinite(til) || til <= fra) return [];

  const d = new Date(fra);
  if (enhed === ENHED.time) d.setMinutes(0, 0, 0);
  else d.setHours(0, 0, 0, 0);

  const ud = [];
  while (d.getTime() < til) {
    const start = d.getTime();
    const naeste = new Date(start);
    if (enhed === ENHED.time) naeste.setHours(naeste.getHours() + 1);
    else naeste.setDate(naeste.getDate() + 1);
    ud.push({ fra: start, til: naeste.getTime() });

    if (ud.length > MAX_SLOTS) {
      throw new Error(
        `gitter: vinduet ville give over ${MAX_SLOTS} kolonner. Snævr perioden ind, ` +
        `eller vis tallet som en liste frem for et gitter.`
      );
    }
    d.setTime(naeste.getTime());
  }
  return ud;
}

/** Kolonneoverskriften. Ét sted, så tre skærme ikke skriver datoen hver sin
 *  måde. */
export function slotLabel(slot, enhed = ENHED.dag) {
  if (enhed === ENHED.time) return klokke(slot.fra);
  return new Date(slot.fra)
    .toLocaleDateString("da-DK", { weekday: "short", day: "2-digit", month: "2-digit" })
    .replace(".", "");
}

/** Er slottet i dag? Bruges til at markere kolonnen — en kalender uden et
 *  "nu" tvinger brugeren til at tælle. */
export const erNu = (slot, nu = Date.now()) => nu >= slot.fra && nu < slot.til;

/**
 * laegUd(blokke, slotListe) → placerede blokke
 *
 * Hver blok får:
 *   start, slut      kolonneindeks, INKLUSIVE begge
 *   foerVindue       blokken begyndte før første kolonne
 *   efterVindue      blokken slutter efter sidste kolonne
 *   konflikt         den overlapper en anden blok i SAMME række
 *
 * ⚠ foerVindue og efterVindue er ikke pynt. En værkstedsblok der løber tre
 * uger og bliver klippet ved vinduets kant, læses som et kort besøg — og så
 * planlægger nogen en tur i en uge hvor bilen står på værksted. Skærmen skal
 * tegne en pil, ikke en pæn kant. Samme fejlklasse som tavs afkortning i
 * useListe: det man ikke kan se mangler, spørger man ikke efter.
 *
 * ⚠ konflikt tegnes, den skjules ikke. På en eksklusiv ressource ER et overlap
 * en konflikt — reserver() ville afvise den anden reservation. Lagde gitteret
 * de to blokke i hver sin bane, ville det se rigtigt ud og skjule noget
 * datamodellen nægter at skrive. Det skal se galt ud, fordi det er galt.
 */
export function laegUd(blokke = [], slotListe = []) {
  if (!slotListe.length) return [];
  const vindueFra = slotListe[0].fra;
  const vindueTil = slotListe[slotListe.length - 1].til;

  const placeret = [];
  for (const b of blokke) {
    if (!Number.isFinite(b.fra) || !Number.isFinite(b.til) || b.til <= b.fra) continue;
    /* Halvåbent: en blok der slutter præcis når vinduet begynder, er ikke i
       vinduet. Og en der begynder præcis når vinduet slutter, er det heller
       ikke. */
    if (b.til <= vindueFra || b.fra >= vindueTil) continue;

    const start = slotListe.findIndex((s) => s.til > b.fra);
    let slut = -1;
    for (let i = slotListe.length - 1; i >= 0; i--) {
      if (slotListe[i].fra < b.til) { slut = i; break; }
    }
    if (start < 0 || slut < start) continue;

    placeret.push({
      ...b,
      start,
      slut,
      foerVindue: b.fra < vindueFra,
      efterVindue: b.til > vindueTil,
      konflikt: false,
    });
  }

  /* Konflikter pr. række. overlapper() kommer fra reservations.js — samme
     halvåbne regel som konfliktdetektionen, ikke en ny. */
  const perRaekke = new Map();
  for (const p of placeret) {
    if (!perRaekke.has(p.raekkeId)) perRaekke.set(p.raekkeId, []);
    perRaekke.get(p.raekkeId).push(p);
  }
  for (const liste of perRaekke.values()) {
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        if (overlapper(liste[i], liste[j])) {
          liste[i].konflikt = true;
          liste[j].konflikt = true;
        }
      }
    }
  }

  return placeret;
}

/**
 * ledigeVinduer(blokke, fra, til) → [{ fra, til }]
 *
 * Hullerne mellem blokkene i ÉN række. Bruges til "Træk opgave hertil"-felter.
 *
 * ⚠ DE BEREGNES AF SAMME DATA SOM BLOKKENE, og det er hele pointen. Tegnede
 * skærmen drop-felterne ud fra sin egen idé om hvornår bilen er fri, kunne de
 * to være uenige — og så ville feltet invitere til at lægge en opgave oven i
 * en anden. Ét regnestykke, to visninger.
 *
 * Halvåbent: en blok der slutter kl. 12 og et hul der starter kl. 12 rører
 * hinanden uden at overlappe.
 */
export function ledigeVinduer(blokke = [], fra, til) {
  if (!Number.isFinite(fra) || !Number.isFinite(til) || til <= fra) return [];

  const optaget = blokke
    .filter((b) => Number.isFinite(b.fra) && Number.isFinite(b.til) && b.til > b.fra)
    .map((b) => ({ fra: Math.max(b.fra, fra), til: Math.min(b.til, til) }))
    .filter((b) => b.til > b.fra)
    .sort((a, b) => a.fra - b.fra);

  const ud = [];
  let markoer = fra;
  for (const b of optaget) {
    if (b.fra > markoer) ud.push({ fra: markoer, til: b.fra });
    /* Overlappende blokke må ikke skubbe markøren tilbage. */
    if (b.til > markoer) markoer = b.til;
  }
  if (markoer < til) ud.push({ fra: markoer, til });
  return ud;
}

/** Blokke pr. række, sorteret. Bekvemmelighed til komponenten. */
export function blokkePrRaekke(placerede) {
  const kort = new Map();
  for (const p of placerede) {
    if (!kort.has(p.raekkeId)) kort.set(p.raekkeId, []);
    kort.get(p.raekkeId).push(p);
  }
  for (const liste of kort.values()) liste.sort((a, b) => a.fra - b.fra);
  return kort;
}
