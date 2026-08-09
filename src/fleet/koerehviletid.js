/* src/fleet/koerehviletid.js
 * Køre-hviletid. BESLUTNING 21.
 *
 * INGEN IMPORTS — reglen skal kunne køres af den Cloud Function der skriver
 * etapen, af en test og af en skærm, uden at trække en frontend med.
 *
 * ⚠ DET HER ER EN REGEL, IKKE ET FELT. Man gemmer ikke "overholder
 * køre-hviletid: ja" på en etape; man regner det ud af de strækninger der er
 * planlagt. Et gemt flag ville drive fra planen i det sekund nogen flytter en
 * tur — og så står der grønt på noget der er blevet ulovligt.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  FORBEHOLDET ER EN RETURVÆRDI, IKKE EN NOTE I EN KOMMENTAR.
 *
 *  Vi kan kun se PLANEN. Hvad chaufføren faktisk har kørt i dag og i denne
 *  uge, står på TACHOGRAFEN, og den har vi ikke adgang til.
 *
 *  Derfor returnerer tjekKoerehviletid() altid `forbehold`, og teksten er
 *  skrevet til at stå PÅ SKÆRMEN — ikke i en tooltip man kan klikke væk:
 *
 *      "planen overtræder ikke reglen — vi kan ikke se tachografen"
 *
 *  Et grønt flueben ved siden af en bøde er værre end ingen kontrol. En
 *  overtrædelse er en bøde til vognmanden, ikke en advarsel, og hvis vores
 *  markering læses som "chaufføren er lovlig", har vi gjort skade frem for
 *  gavn. Fjern ikke forbeholdet før der er tachografdata — se ARKITEKTUR.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * HÅNDHÆVELSEN HØRER I DEN CLOUD FUNCTION DER SKRIVER ETAPEN, ikke i skærmen.
 * Ligger den i skærmen, kan en direkte skrivning omgå den — samme grund som
 * kanDisponeres(), tjekKompetencer() og kanBaere(). Og den BLOKERER: en
 * advarsel man kan klikke videre fra, er ikke en kontrol.
 */

const MIN = 60000;

/** Grænserne. Tal ét sted, så to skærme ikke regner med hver sit. */
export const GRAENSE = {
  /** Sammenhængende kørsel før pause. EU 561/2006 art. 7. */
  koerselFoerPauseMin: 4.5 * 60,
  /** Pausens længde. Må deles i 15 + 30 i den rækkefølge. */
  pauseMin: 45,
  /** Første del af en delt pause. */
  delPauseFoersteMin: 15,
  /** Anden del af en delt pause. */
  delPauseAndenMin: 30,
  /** Daglig køretid. */
  dagligKoerselMin: 9 * 60,
  /** Forlænget daglig køretid — højst to gange om ugen. */
  dagligKoerselForlaengetMin: 10 * 60,
  forlaengedeDageProUge: 2,
  /** Ugentlig køretid. */
  ugentligKoerselMin: 56 * 60,
};

export const OVERTRAEDELSE = {
  pause: "pause",
  dagligKoersel: "dagligKoersel",
  ugentligKoersel: "ugentligKoersel",
  forlaengedeDage: "forlaengedeDage",
};

const TEKST = {
  pause: (m) => `${Math.round(m)} min. sammenhængende kørsel uden pause. Grænsen er ${GRAENSE.koerselFoerPauseMin} min.`,
  dagligKoersel: (m) => `${(m / 60).toFixed(1)} timers kørsel på ét døgn. Grænsen er ${GRAENSE.dagligKoerselMin / 60} timer (${GRAENSE.dagligKoerselForlaengetMin / 60} højst to gange om ugen).`,
  ugentligKoersel: (m) => `${(m / 60).toFixed(1)} timers kørsel på en uge. Grænsen er ${GRAENSE.ugentligKoerselMin / 60} timer.`,
  forlaengedeDage: (n) => `${n} døgn over ${GRAENSE.dagligKoerselMin / 60} timer. Højst ${GRAENSE.forlaengedeDageProUge} om ugen.`,
};

/**
 * Forbeholdet. Samme streng hver gang, så den ikke bliver omskrevet til noget
 * blødere på en skærm.
 */
export const FORBEHOLD = {
  kort: "planen overtræder ikke reglen — vi kan ikke se tachografen",
  lang:
    "Kontrollen regner på det der er PLANLAGT. Hvad chaufføren faktisk har " +
    "kørt, står på tachografen, som vi ikke har adgang til. Grønt betyder " +
    "derfor at planen ikke overtræder reglen — ikke at chaufføren er lovlig.",
  /* Sættes til false den dag der er tachografdata. Indtil da er den true på
     hvert eneste svar, også de grønne. */
  taeller: true,
};

const dagsnoegle = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/**
 * tjekKoerehviletid(straekninger) → { ok, overtraedelser[], forbehold, minutter }
 *
 * straekninger: [{ fra, til, koerselMin? }]
 *   fra/til    epoch ms, halvåbent [fra, til) som alt andet
 *   koerselMin hvor meget af strækningen der er KØRSEL. Udelades den, regnes
 *              hele strækningen som kørsel — den strenge antagelse, fordi et
 *              gæt der undervurderer kørslen giver et grønt lys der ikke
 *              holder.
 *
 * Strækningerne kommer fra BÅDE opgaver og etaper: en mekaniker der også
 * kører, har begge dele, og reglen gælder personen — ikke noden.
 */
export function tjekKoerehviletid(straekninger = []) {
  const rene = straekninger
    .filter((s) => s && Number.isFinite(s.fra) && Number.isFinite(s.til) && s.til > s.fra)
    .sort((a, b) => a.fra - b.fra);

  const overtraedelser = [];
  const perDag = new Map();
  let ugentligMin = 0;

  /* Sammenhængende kørsel: hullet mellem to strækninger tæller som pause.
     Er hullet under pausegrænsen, løber kørslen videre. */
  let sammenhaengende = 0;
  let sidsteTil = null;

  for (const s of rene) {
    const varighed = (s.til - s.fra) / MIN;
    const koersel = Number.isFinite(s.koerselMin) ? s.koerselMin : varighed;

    if (sidsteTil != null) {
      const hul = (s.fra - sidsteTil) / MIN;
      if (hul >= GRAENSE.pauseMin) sammenhaengende = 0;
    }
    sammenhaengende += koersel;
    if (sammenhaengende > GRAENSE.koerselFoerPauseMin) {
      overtraedelser.push({
        type: OVERTRAEDELSE.pause,
        ms: s.fra,
        straekningId: s.id ?? null,
        tekst: TEKST.pause(sammenhaengende),
      });
      /* Nulstil, så én lang tur ikke giver ti identiske overtrædelser. */
      sammenhaengende = 0;
    }
    sidsteTil = s.til;

    const noegle = dagsnoegle(s.fra);
    perDag.set(noegle, (perDag.get(noegle) || 0) + koersel);
    ugentligMin += koersel;
  }

  let forlaengede = 0;
  for (const [noegle, minutter] of perDag) {
    if (minutter > GRAENSE.dagligKoerselForlaengetMin) {
      overtraedelser.push({
        type: OVERTRAEDELSE.dagligKoersel,
        dag: noegle,
        tekst: TEKST.dagligKoersel(minutter),
      });
    } else if (minutter > GRAENSE.dagligKoerselMin) {
      forlaengede += 1;
    }
  }

  if (forlaengede > GRAENSE.forlaengedeDageProUge) {
    overtraedelser.push({
      type: OVERTRAEDELSE.forlaengedeDage,
      antal: forlaengede,
      tekst: TEKST.forlaengedeDage(forlaengede),
    });
  }

  if (ugentligMin > GRAENSE.ugentligKoerselMin) {
    overtraedelser.push({
      type: OVERTRAEDELSE.ugentligKoersel,
      tekst: TEKST.ugentligKoersel(ugentligMin),
    });
  }

  return {
    ok: overtraedelser.length === 0,
    overtraedelser,
    /* ALTID med — også når ok er true. Det er hele pointen: det grønne svar
       er det farlige at læse forkert. */
    forbehold: FORBEHOLD,
    minutter: { ugentlig: ugentligMin, perDag: Object.fromEntries(perDag) },
  };
}

/**
 * Sætningen der skal stå på skærmen. Ét sted, så den ikke bliver blødere på
 * den næste skærm — og aldrig uden forbeholdet, heller ikke når svaret er ok.
 */
export function koerehviletidTekst(svar) {
  if (!svar) return "";
  if (svar.ok) return `Ingen overtrædelser i planen — ${FORBEHOLD.kort}.`;
  const n = svar.overtraedelser.length;
  return `${n} ${n === 1 ? "overtrædelse" : "overtrædelser"} i planen. ` +
         `Blokerer disponeringen. ${FORBEHOLD.lang}`;
}
