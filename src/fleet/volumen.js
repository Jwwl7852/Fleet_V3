/* src/fleet/volumen.js
 * Volumenkalkulatoren — tilbudsberegneren. WAREHOUSE.md etape 8.
 *
 * Planchen hedder "Volumenkalkulator": *m², m³, paller → månedspris*. Det er
 * et SALGSVÆRKTØJ. En kunde ringer og siger "jeg har omkring 120 paller og
 * regner med 40 ind og 40 ud om måneden" — og sælgeren skal kunne svare på
 * hvad det koster, med husets egne priser.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ RESULTATET ER ET ESTIMAT, OG DET MÅ ALDRIG SE UD SOM EN FAKTURA.
 *
 * Tallene er bygget på KUNDENS EGET GÆT om hvor meget han har og hvor meget
 * der skal røres. Priserne er vores og er rigtige; mængderne er hans og er
 * ikke. Et beløb der står alene, læses som en pris — og så er det den
 * sælgeren bliver holdt fast på, når virkeligheden viser sig at være 180
 * paller og 90 håndteringer.
 *
 * Derfor bærer `tilbudsberegning()` ALTID sine `forudsaetninger` med, som
 * `tjekKoerehviletid()` altid bærer sit forbehold og `dageUde()` altid bærer
 * sit `faktisk`-flag. Feltet er ikke pynt: uden det kan skærmen vise beløbet
 * uden at vise hvad det hviler på, og det er præcis den fejl der koster.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ OG DEN REGNER IKKE PRISER SELV. `prisFor()` fra pricing.js slås op af
 * kalderen og sendes ind — samme mønster som `afregningslinjer()`. Filen her
 * er importfri på nær beløbsskalaen, og en kopi af prisopslaget ville være to
 * steder der afgør hvilken sats der gjaldt (beslutning 7).
 *
 * ⚠ DER OPRETTES INTET TILBUD. Se `DEMO_TILBUD` i demo-kunder.js: nodeformen
 * for et tilbud er ikke besluttet — et tilbud kan gå til et EMNE der ikke er
 * kunde endnu, og `tilbud` er ikke en bookingtilstand. Beregneren giver et
 * tal, og tallet skrives på tilbuddet den dag den node findes. En knap der
 * "gemte tilbuddet" ville afgøre det spørgsmål ved et uheld.
 */
/* ⚠ ANTAL_SKALA IMPORTERES, den skrives ikke af. `warehouse.js` kalder den
   samme konstant `MAENGDE_SKALA` og har den som et TAL, fordi den fil skal
   kunne kopieres til serveren — men de to ER det samme, og noten i
   warehouse.js siger hvorfor: to skalaer fakturerer 1000× forkert. Filen her
   skal ikke til serveren og importerer derfor originalen. */
import { ANTAL_SKALA as MAENGDE_SKALA } from "./beloeb.js";

/**
 * De tre grundlag et lager kan sælges på.
 *
 * ⚠ MAN VÆLGER ÉT. Paller, m³ og m² er tre måder at måle DET SAMME gods på —
 * lægges to af dem sammen, faktureres den samme plads to gange. Modellen gør
 * det til et valg frem for tre felter, fordi tre felter ville blive udfyldt.
 *
 * ⚠ OG DE ER YDELSER I KATALOGET, ikke tal her i filen. Hvad en palleplads
 * koster, står i standardpriserne og i kundens afvigelse — det er hele
 * beslutning 38. Feltet her er kun broen til det rigtige ydelses-id.
 */
export const KAPACITETSGRUNDLAG = {
  palle: {
    grundlag: "palle", label: "Paller", enhed: "palleplads",
    ydelseId: "lager-palleplads",
    hint: "Antal pallepladser kunden lægger beslag på.",
  },
  kubik: {
    grundlag: "kubik", label: "Kubikmeter", enhed: "m³",
    ydelseId: "lager-kubik",
    hint: "Rumfang. Kan regnes ud af varernes mål — se kubikFraLinjer().",
  },
  kvadratmeter: {
    grundlag: "kvadratmeter", label: "Kvadratmeter", enhed: "m²",
    ydelseId: "lager-kvadratmeter",
    hint: "Gulvareal. For gods der ikke kan stables.",
  },
};

export const ALLE_KAPACITETSGRUNDLAG = Object.keys(KAPACITETSGRUNDLAG);

/**
 * De håndteringer et tilbud regner med — pr. måned.
 *
 * ⚠ REKKEFØLGEN ER FLOWETS: ind, på plads, plukket, ud, retur. En liste i
 * alfabetisk orden ville bede sælgeren om tallene i en anden orden end den
 * kunden fortæller dem i.
 */
export const TILBUDSHAANDTERINGER = [
  { ydelseId: "lager-handlingInd", label: "Modtagelser", enhed: "stk./md." },
  { ydelseId: "lager-flytning",    label: "Flytninger",  enhed: "stk./md." },
  { ydelseId: "lager-pluk",        label: "Pluk",        enhed: "pluklinjer/md." },
  { ydelseId: "lager-handlingUd",  label: "Afsendelser", enhed: "stk./md." },
  { ydelseId: "lager-retur",       label: "Returer",     enhed: "stk./md." },
];

/**
 * ⚠ EN MÅNED ER ET AFTALT TAL, IKKE EN KALENDERMÅNED.
 *
 * Opbevaringen prissættes pr. DØGN (`prPalledoegn`, `prKubikdoegn`), og en
 * månedspris kræver derfor at man beslutter hvor mange døgn en måned er.
 * Februar og juli er ikke det samme, og et tilbud der brugte den indeværende
 * måneds længde, ville give et andet svar den 1. marts end den 1. juli — for
 * det samme gods.
 *
 * 30 er talt op, ikke gættet: det er den skæring branchen bruger, og den står
 * HER som en konstant frem for som et 30-tal midt i en formel, så den kan
 * findes og ændres ét sted. Skærmen SKRIVER tallet, så modtageren af tilbuddet
 * kan se hvad "pr. måned" betyder.
 */
export const DOEGN_PR_MAANED = 30;

/**
 * Rumfang i m³ af en stak varer — ud af varernes egne mål.
 *
 * ⚠ MÅLENE ER PR. STK. OG STÅR I MILLIMETER på varen. Regnestykket står her,
 * ét sted, fordi det ellers ville blive skrevet af hver gang nogen skulle
 * bruge et rumfang — og en faktor 1000 forkert i et tilbud er en pris der er
 * en milliard gange forkert.
 *
 * ⚠ EN VARE UDEN MÅL TÆLLER IKKE MED, og den RAPPORTERES. Talte den som nul,
 * ville rumfanget se komplet ud mens en palle manglede; samme regel som en
 * afregningslinje uden sats. Kalderen skal vise `uden`.
 */
export function kubikFraLinjer(linjer = [], { varer = [] } = {}) {
  const vareMap = new Map(varer.map((v) => [v.id, v]));
  let kubik = 0;
  const uden = [];

  for (const l of linjer) {
    const v = vareMap.get(l.vareId);
    const mm = v && [v.laengdeMm, v.breddeMm, v.hoejdeMm];
    if (!mm || mm.some((n) => !Number.isFinite(n) || n <= 0)) {
      uden.push(l.vareId);
      continue;
    }
    /* mm³ → m³ er 1e9. Antallet er skaleret som alt andet i huset. */
    const prStk = (mm[0] * mm[1] * mm[2]) / 1e9;
    kubik += prStk * ((l.antal || 0) / MAENGDE_SKALA);
  }
  return { kubik, uden };
}

/**
 * tilbudsberegning({ … }) → { linjer, sum, forudsaetninger, doegn }
 *
 * `prisFor(ydelseId)` slås op af kalderen og skal returnere `{ oere, kilde }`
 * eller `null`. Se `prisFor()` i pricing.js — og bemærk at `null` betyder at
 * ydelsen ikke har en pris, ikke at den er gratis.
 *
 * `maengde` og hver håndtering er SKALERET med MAENGDE_SKALA, som overalt
 * ellers. En halv palle findes ikke, men et halvt kubikmeter gør.
 *
 * ⚠ EN YDELSE UDEN PRIS UDELADES IKKE — den kommer med, med `beloebOere:
 * null`, og så kan summen ikke gøres op. Udelod vi den, ville tilbuddet se
 * komplet ud mens en ydelse manglede sin pris, og sælgeren ville give den
 * væk uden at vide det. Samme regel som `afregningslinjer()`.
 */
export function tilbudsberegning({
  grundlag,
  maengde = 0,
  maaneder = 1,
  haandteringer = {},
  prisFor,
} = {}) {
  if (typeof prisFor !== "function") {
    throw new Error(
      "tilbudsberegning: prisFor(ydelseId) mangler. Prisen slås op af " +
      "kalderen — en kopi her ville være to steder der afgør hvilken sats " +
      "der gjaldt.");
  }
  const g = KAPACITETSGRUNDLAG[grundlag];
  if (!g) {
    throw new Error(
      `tilbudsberegning: ukendt grundlag "${grundlag}". Man vælger ÉT af ` +
      `${ALLE_KAPACITETSGRUNDLAG.join(", ")} — to af dem er den samme plads ` +
      "faktureret to gange.");
  }

  const doegn = Math.max(0, Math.round(maaneder * DOEGN_PR_MAANED));
  const linjer = [];

  /* ---- Opbevaringen ---------------------------------------------------- */
  const opbevaring = prisFor(g.ydelseId) || null;
  linjer.push({
    ydelseId: g.ydelseId,
    label: `Opbevaring — ${g.label.toLowerCase()}`,
    art: "lager",
    antal: maengde,
    enhed: g.enhed,
    /* Grundlaget for linjen er mængde × døgn. Det står som et felt, så
       skærmen kan vise regnestykket frem for kun resultatet. */
    doegn,
    satsOere: opbevaring?.oere ?? null,
    kilde: opbevaring?.kilde ?? null,
    beloebOere: opbevaring
      ? Math.round((maengde * doegn * opbevaring.oere) / MAENGDE_SKALA)
      : null,
  });

  /* ---- Håndteringerne -------------------------------------------------- */
  for (const h of TILBUDSHAANDTERINGER) {
    const antalPrMd = haandteringer[h.ydelseId] || 0;
    /* ⚠ NUL HÅNDTERINGER GIVER INGEN LINJE. En linje på 0 kr. i et tilbud
       ligner en ydelse kunden får gratis — og så bliver den bedt om. */
    if (!antalPrMd) continue;

    const p = prisFor(h.ydelseId) || null;
    const antal = antalPrMd * maaneder;
    linjer.push({
      ydelseId: h.ydelseId,
      label: h.label,
      art: "haandtering",
      antal,
      enhed: h.enhed,
      doegn: null,
      satsOere: p?.oere ?? null,
      kilde: p?.kilde ?? null,
      beloebOere: p ? Math.round((antal * p.oere) / MAENGDE_SKALA) : null,
    });
  }

  /* ⚠ SUMMEN KAN IKKE GØRES OP HVIS BARE ÉN LINJE MANGLER SIN PRIS. Samme
     regel som `afregningssum()` — og den står her frem for som en import,
     fordi filen skal kunne læses uden warehouse.js. En halv sum ser ud som
     om den er regnet ud. */
  const mangler = linjer.filter((l) => l.beloebOere == null).length;
  const ialtOere = mangler ? null : linjer.reduce((s, l) => s + l.beloebOere, 0);

  return {
    linjer,
    doegn,
    sum: {
      ialtOere,
      /* Månedsprisen er det tallet bliver spurgt om. Den er afledt og gemmes
         ingen steder — beslutning 6. */
      prMaanedOere: ialtOere == null || !maaneder ? null : Math.round(ialtOere / maaneder),
      mangler,
    },
    /* ══════════════════════════════════════════════════════════════════
       ⚠ FORUDSÆTNINGERNE FØLGER MED TALLET. Se hovedet: priserne er vores
       og er rigtige, mængderne er kundens gæt og er det ikke. Uden det her
       felt kan skærmen vise beløbet uden at vise hvad det hviler på.
       ══════════════════════════════════════════════════════════════════ */
    forudsaetninger: [
      {
        hvad: "Grundlag",
        vaerdi: `${maengde / MAENGDE_SKALA} ${g.enhed}`,
        note: "Oplyst af kunden — ikke målt af os.",
      },
      {
        hvad: "Periode",
        vaerdi: `${maaneder} md. = ${doegn} døgn`,
        note: `En måned regnes som ${DOEGN_PR_MAANED} døgn. Opbevaring prissættes pr. døgn.`,
      },
      ...TILBUDSHAANDTERINGER
        .filter((h) => haandteringer[h.ydelseId])
        .map((h) => ({
          hvad: h.label,
          vaerdi: `${haandteringer[h.ydelseId] / MAENGDE_SKALA} ${h.enhed}`,
          note: "Forventet aktivitet — ikke en aftalt mængde.",
        })),
    ],
  };
}
