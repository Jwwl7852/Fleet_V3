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
import { klokke, ugenr } from "./format.js";

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

/* ---- Grupperede kolonneoverskrifter ------------------------------------ */

/**
 * grupperSlots(slotListe, noegle) → [{ noegle, fra, antal }]
 *
 * Slår NABOSLOTS med samme nøgle sammen til ét spænd. Med den kan et gitter
 * få flere hovedrækker — måned over uge over dag, som planchen for
 * Unitbookings kalender viser.
 *
 * ⚠ HVORFOR DET ER NØDVENDIGT: et vindue på otteogtyve dage giver
 * otteogtyve kolonner, og datoen i hver af dem bliver ulæselig. Grupperingen
 * flytter det man SJÆLDENT skifter (måneden) op i sin egen række, så dagen
 * kun skal bære det den ikke kan undvære.
 *
 * ⚠ KUN NABOER. To spænd med samme nøgle, der ikke rører hinanden, bliver to
 * spænd — ellers ville et gitter der begyndte og sluttede i august, få ÉN
 * august-celle henover september.
 */
export function grupperSlots(slotListe = [], noegle) {
  if (typeof noegle !== "function") return [];
  const ud = [];
  for (const s of slotListe) {
    const n = noegle(s);
    const sidste = ud[ud.length - 1];
    if (sidste && sidste.noegle === n) sidste.antal += 1;
    else ud.push({ noegle: n, fra: s.fra, antal: 1 });
  }
  return ud;
}

/** Månedens navn — "aug. 2026". Ét sted, som slotLabel. */
export const maanedNoegle = (slot) =>
  new Date(slot.fra).toLocaleDateString("da-DK", { month: "short", year: "numeric" });

/** Ugenummeret som tekst. Bruger ugenr() fra format.js. */
export const ugeNoegle = (slot) => `Uge ${ugenr(slot.fra)}`;

/* ---- Kolonneoverskriften i to linjer ------------------------------------ */

/**
 * ⚠ UGEDAGEN SKREVET UD, IKKE SKÅRET AF EN LOKALSTRENG.
 * `toLocaleDateString("da-DK", { weekday: "short" })` giver "man.", "tir.",
 * "ons." — og et `.slice(0, 2)` på den er en antagelse om et format vi ikke
 * ejer. Bliver den til "ma." i en anden Node-version, står der "ma" ét sted og
 * "man" et andet. Listen her er indekseret med getDay(), og søndag er nul.
 *
 * De to bogstaver er entydige på dansk: ma, ti, on, to, fr, lø, sø — tirsdag
 * og torsdag skilles af det andet bogstav.
 */
export const UGEDAG_KORT = ["Sø", "Ma", "Ti", "On", "To", "Fr", "Lø"];

/**
 * slotDele(slot, enhed) → { over, under }
 *
 * Overskriften delt i to linjer: ugedagen over datoen. En kolonne er smal, og
 * "ons 19.08" på én linje bliver til "ons 19…" så snart vinduet er langt —
 * altså mister man netop datoen. To linjer koster højde én gang i hovedet og
 * giver plads i hver eneste kolonne.
 *
 * ⚠ DATOEN BEHOLDER SIN MÅNED. Planchen viser kun dagens tal, fordi den har en
 * måned-række over sig. Fleets kalender har ikke, og en uge kan gå over et
 * månedsskifte — 31.08 og 01.09 ville begge stå som et lille tal uden at man
 * kunne se hvilken måned. Måneden er billig; en forkert dag er ikke.
 */
export function slotDele(slot, enhed = ENHED.dag) {
  if (enhed === ENHED.time) return { over: null, under: klokke(slot.fra) };
  const d = new Date(slot.fra);
  return {
    over: UGEDAG_KORT[d.getDay()],
    under: d.toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit" }),
  };
}


/* ── Rullebjaelken ───────────────────────────────────────────────────────
   Regnestykket bag bjaelken under gitteret, uden React, saa det kan proeves.
   Samme grund som resten af filen: en bjaelke der peger ét sted og ruller et
   andet, opdages ikke ved at kigge paa den. */

/** Mindste haandtag man kan ramme med en mus. Px. */
export const HAANDTAG_MIN = 28;

/**
 * greb(venstre, synlig, ialt) -> { vis, kanRulle, del, andel }
 *
 *   del    haandtagets andel af banen — saa stor en del som det synlige er
 *          af det hele. ⚠ ET MAAL, IKKE PYNT: med fast bredde ville
 *          haandtaget paastaa det samme om fire uger og om ét doegn.
 *   andel  hvor langt det staar henne, 0..1.
 */
export function greb(venstre, synlig, ialt) {
  const skjult = (ialt || 0) - (synlig || 0);
  const kanRulle = skjult > 1 && synlig > 0;
  if (!synlig || !ialt) return { vis: false, kanRulle: false, del: 1, andel: 0 };
  const v = Math.max(0, Math.min(kanRulle ? skjult : 0, venstre || 0));
  return {
    vis: kanRulle,
    kanRulle,
    del: Math.min(1, synlig / ialt),
    andel: kanRulle ? v / skjult : 0,
  };
}

/**
 * skridt(venstre, synlig, ialt, retning, kanSkubbe)
 *   -> { slags: "rul" | "skub", til }
 *
 * ⚠ PILEN GAAR VIDERE HVOR RULNINGEN SLIPPER. Er man ved kanten — eller er
 * der slet ikke noget at rulle i — flytter det samme klik PERIODEN. For den
 * der sidder med musen er det den samme bevaegelse: "vis mig laengere frem".
 * Kan kalderen ikke flytte perioden, staar man stille ved kanten.
 */
export function skridt(venstre, synlig, ialt, retning, kanSkubbe = false) {
  const skjult = Math.max(0, (ialt || 0) - (synlig || 0));
  const v = Math.max(0, Math.min(skjult, venstre || 0));
  const kanRulle = skjult > 1;
  const kant = retning < 0 ? v <= 1 : v >= skjult - 1;
  if (kanSkubbe && (!kanRulle || kant)) return { slags: "skub", til: retning };
  /* Fire femtedele af en skaerm, ikke en hel: en stribe man kender igen fra
     forrige skaerm er det eneste der binder de to sammen. */
  const laengde = Math.max(1, Math.round(synlig * 0.8));
  return { slags: "rul", til: Math.max(0, Math.min(skjult, v + retning * laengde)) };
}

/* ── Træk ────────────────────────────────────────────────────────────────
   At flytte en blok i gitteret. Beslutning 49.

   ⚠ REGNESTYKKET LIGGER HER OG IKKE I KOMPONENTEN, af samme grund som resten
   af filen: et gitter der lander blokken én kolonne ved siden af, opdages ikke
   ved at kigge på det — man tror bare man ramte forkert. */

/**
 * maaTraekkes(placeret) → boolean
 *
 * ⚠ EN BLOK DER RÆKKER UD OVER VINDUET, KAN IKKE TRÆKKES.
 *
 * Det er den samme grund som pilene findes for. Rækker blokken ud over kanten,
 * kan man ikke SE hvor den begynder — og en flytning regnes fra begyndelsen.
 * Trak man i den klippede ende, ville opgaven flytte sig et andet sted hen end
 * det man sigtede efter, og forskellen ville være præcis så stor som den del
 * der ligger uden for skærmen. Udvid perioden, og træk så.
 */
export const maaTraekkes = (placeret) =>
  Boolean(placeret) && !placeret.foerVindue && !placeret.efterVindue;

/**
 * traekTil(blok, slotListe, fraIndeks, tilIndeks) → { fra, til } | null
 *
 * Blokkens nye vindue, når den er trukket fra én kolonne til en anden.
 *
 * ⚠ VARIGHEDEN FØLGER MED, DEN STRÆKKES IKKE. Man flytter et værkstedsbesøg;
 * man forlænger det ikke ved at trække i det. Skal det vare længere, er det et
 * andet estimat — og estimatet er hvad vi TROR, ikke hvor blokken blev sluppet.
 *
 * ⚠ OG DEN LÆGGER IKKE MILLISEKUNDER TIL.
 * Et døgn er ikke altid 24 timer: ved sommertidsskiftet er det 23 eller 25.
 * Trak man en blok tre dage frem ved at lægge 3 × 86400000 til, ville den
 * lande en time forskudt i marts og en time den anden vej i oktober — og et
 * værkstedsbesøg der begynder kl. 07 ville pludselig begynde kl. 06. Derfor:
 * blokkens forskydning INDE I sin egen kolonne bevares, og den lægges på
 * MÅLKOLONNENS begyndelse. Samme grund som slots() bygges med Date.
 */
export function traekTil(blok, slotListe = [], fraIndeks, tilIndeks) {
  if (!blok || !Number.isFinite(blok.fra) || !Number.isFinite(blok.til)) return null;
  if (blok.til <= blok.fra) return null;
  const fraSlot = slotListe[fraIndeks];
  const tilSlot = slotListe[tilIndeks];
  if (!fraSlot || !tilSlot) return null;

  const iSlottet = blok.fra - fraSlot.fra;
  const varighed = blok.til - blok.fra;
  const fra = tilSlot.fra + iSlottet;
  return { fra, til: fra + varighed };
}

/**
 * slotUnder(slotListe, indeks) → { fra, til } | null
 *
 * Bekvemmelighed til komponenten: kolonnen et pointer-slip landede på. Står
 * her frem for i JSX'en, så grænserne prøves ét sted.
 */
export const slotUnder = (slotListe = [], indeks) =>
  (Number.isInteger(indeks) && indeks >= 0 && indeks < slotListe.length)
    ? slotListe[indeks]
    : null;
