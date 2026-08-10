/* src/fleet/datatilstand.js
 * Hvorfor en skærm ikke viser rigtige tal — som én ting, ét sted.
 *
 * ⚠ HVORFOR FILEN FINDES: useKpi og useListe oversatte ENHVER fejl til
 * demo-data plus teksten "Viser demo-data — ingen forbindelse til databasen".
 * Også en permission-denied fra sikkerhedsreglerne.
 *
 * Det er forkert på den værst tænkelige måde. Reglerne afviste læsningen —
 * det er systemet der VIRKER — og appen oversatte det til et netværksproblem
 * og fyldte skærmen med opdigtede tal. Den dag en regel er for stram i
 * produktion, ser en kunde befolkede skærme med tal der ikke er deres, og en
 * besked om at internettet driller.
 *
 * Tre tilstande, og pointen er at de opdages på TO FORSKELLIGE TIDSPUNKTER:
 *
 *   demo             Ingen database konfigureret. Kendt FØR forespørgslen.
 *                    Demo-data er det rigtige svar, og miljøbjælken siger det
 *                    allerede — skærmen skal ikke sige det igen.
 *
 *   uautentificeret  Ingen bruger. Kendt FØR forespørgslen. Derfor skal den
 *                    ikke fanges som en fejl: kalderen sender slet ikke
 *                    forespørgslen, og så er der ingen påstand om netværket
 *                    at komme til at fremsætte.
 *
 *   naegtet          Logget ind, men afvist af reglerne. Kan KUN opdages
 *                    bagefter. Aldrig tal — det er hele grunden til filen.
 *
 * visDemo er sand for `demo`, og for `uautentificeret` KUN i dev.
 *
 * ⚠ visDemo ved `uautentificeret` er et STILLADS, ikke en funktion.
 * Det findes fordi der endnu ikke er noget login-flow, og en tom app ville
 * betyde at nogen om tre dage laver en hurtig overstyring for at kunne
 * arbejde. Når login lander, SKAL grenen væk: der er ingen legitim grund til
 * at en dev-bruger ikke er logget ind, når der findes en måde at logge ind
 * på. Gaten på "dev" er ikke pynt — en uautentificeret besøgende i
 * produktion skal møde login-skærmen, ikke opdigtede KPI'er, uanset hvor
 * pænt de er mærket.
 *
 * Ren funktion uden React, så den kan testes. Samme grund som gitter.js.
 */

export const TILSTAND = {
  ok: "ok",
  demo: "demo",
  uautentificeret: "uautentificeret",
  naegtet: "naegtet",
  forbindelse: "forbindelse",
};

/* RTDB melder afvisning som PERMISSION_DENIED, men formen varierer: nogle
   versioner sætter kun `code`, andre lægger det i `message`. Vi ser på begge
   og på begge stavemåder — et bindestregs-"permission-denied" kommer fra
   Firestore-agtige lag. Rammer vi forbi, ender en afvisning som
   "forbindelse", og så er vi delvist tilbage ved den fejl filen retter. */
const AFVIST = /permission[_\s-]?denied/i;

export function erAfvist(fejl) {
  if (!fejl) return false;
  return AFVIST.test(String(fejl.code ?? "")) || AFVIST.test(String(fejl.message ?? ""));
}

/**
 * @param harDb     er der overhovedet en database at spørge
 * @param harBruger er der en autentificeret bruger
 * @param miljoe    "demo" | "dev" | "prod" — fra firebase.js
 * @param fejl      kun sat EFTER en forespørgsel der fejlede
 * @returns { art, visDemo }
 */
export function dataTilstand({ harDb, harBruger, miljoe, fejl = null }) {
  if (!harDb) return { art: TILSTAND.demo, visDemo: true };

  /* Før forespørgslen. Rækkefølgen er meningen: uden bruger skal kalderen
     ikke sende noget, og derfor kan der ikke ligge en fejl her endnu. */
  if (!harBruger) {
    return { art: TILSTAND.uautentificeret, visDemo: miljoe === "dev" };
  }

  if (fejl) {
    return {
      art: erAfvist(fejl) ? TILSTAND.naegtet : TILSTAND.forbindelse,
      visDemo: false,
    };
  }

  return { art: TILSTAND.ok, visDemo: false };
}

/* Nogle skærme læser to noder. Den ene kan være afvist mens den anden går
   igennem, og så er det afvisningen brugeren skal se — ikke den mildeste af
   de to. Rangen er derfor efter alvor, ikke efter hvem der svarede først. */
const RANG = {
  [TILSTAND.ok]: 0,
  [TILSTAND.demo]: 1,
  [TILSTAND.uautentificeret]: 2,
  [TILSTAND.forbindelse]: 3,
  [TILSTAND.naegtet]: 4,
};

export function vaerste(...tilstande) {
  return tilstande.filter(Boolean).reduce(
    (a, b) => ((RANG[b.art] ?? 0) > (RANG[a.art] ?? 0) ? b : a),
    { art: TILSTAND.ok, visDemo: false }
  );
}
