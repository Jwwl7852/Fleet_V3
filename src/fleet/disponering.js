/* src/fleet/disponering.js
 * De fem disponeringstjek — ÉT sted.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR FILEN FINDES
 *
 * De fem tjek har hver sin funktion i hver sin fil — `kanDisponeres()` og
 * `kanBaere()` i flaade.js, `tjekKompetencer()` i personale.js,
 * `tjekLedigMod()` i reservations.js, `tjekKoerehviletid()` i
 * koerehviletid.js. De var bygget og testet, og i en periode kaldte INTET dem.
 * Så kaldte Disponering-skærmen dem — som fem separate kald i en lokal
 * `tjekAlt()`.
 *
 * Den funktion er flyttet hertil, fordi serveren nu skal stille NØJAGTIG de
 * samme spørgsmål. Blev den stående i skærmen, skulle `etapeskift` skrive sin
 * egen udgave, og så ville skærmen sige ja hvor serveren sagde nej — den fejl
 * har allerede kostet i `useListe`s divisionsfilter og i grundlagets
 * `fraDb()`. To kopier af en kontrol er værre end ingen: den ene driver, og
 * ingen opdager hvilken.
 *
 * ⚠ OG SVARET ER DE RÆKKER SKÆRMEN VISER. Serveren afviser med den SAMME
 * sætning som disponenten fik at se. En serverfejl der er formuleret et andet
 * sted end den advarsel brugeren læste, er to forklaringer på én ting.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ FILEN ER IKKE IMPORTFRI, og reglen for `functions/delt/` er TRANSITIV:
 * alt den importerer, står også på listen i `kopier-delt.mjs`. Firebase
 * deployer kun `functions/`-mappen, så en import op gennem træet fejler i
 * skyen — ved deploy, ikke ved test.
 */
import { num } from "./format.js";
import {
  kanDisponeres, kanBaere, kraevedeKompetencer, KOMPETENCE_LABEL,
} from "./flaade.js";
import { tjekKompetencer } from "./personale.js";
import { tjekLedigMod, konfliktTekst } from "./reservations.js";
import { tjekKoerehviletid, GRAENSE } from "./koerehviletid.js";

/** Grænsen for hvornår et vindue ikke længere kan antages at være ren kørsel. */
const DAGLIG_GRAENSE_MIN = GRAENSE.dagligKoerselMin;

/**
 * Tonerne på en tjekrække.
 *
 * ⚠ `bad` SPÆRRER, `warn` GØR IKKE. Skellet er ikke kosmetik: læses en
 * advarsel som en spærring, holder disponenten op med at læse dem — og læses
 * en spærring som en advarsel, klikker han videre. `blokerer()` er den ene
 * funktion der afgør hvilke der er hvilke, så skærmen og serveren ikke kan
 * være uenige om det heller.
 */
export const TONE = { bad: "bad", warn: "warn" };

/** Spærrer noget af det her? Én linje, så to steder ikke kan tælle forskelligt. */
export const blokerer = (raekker = []) => raekker.some((r) => r.tone === TONE.bad);

/** Kun spærringerne — i den rækkefølge de blev fundet. */
export const spaerringer = (raekker = []) => raekker.filter((r) => r.tone === TONE.bad);

/**
 * Alle reservationer for én ressource, ud af det opslag kalderen har lavet.
 *
 * `reservationer` er `{ <ressourceType>: { <ressourceId>: [poster] } }` — den
 * form noden har. Skærmen og serveren bygger den hver sin vej (demo-sæt mod
 * et databaseopslag), men de spørger den ens.
 */
export const forRessource = (reservationer, type, id) =>
  reservationer?.[type]?.[id] || [];

/**
 * tjekDisponering({...}) → [{ tjek, tone, tekst }]
 *
 * En tom liste betyder "intet at bemærke". Rækkefølgen er de fem tjeks egen,
 * fordi den er den rækkefølge en disponent ville opdage problemerne i: kan de
 * overhovedet køre sammen, må han føre dem, kan de bære godset, er de ledige,
 * og må han køre så længe.
 *
 * ⚠ DEN AFGØR IKKE — den svarer. Håndhævelsen ligger i `etapeskift`; kaldes
 * den kun fra skærmen, kan en direkte skrivning gå uden om den. Det er derfor
 * `etaper` er `.write: false`.
 */
export function tjekDisponering({
  reservationerForEtapen = [],
  enheder = [],
  person = null,
  kompetencer = [],
  reservationer = {},
  straekninger = [],
  gods = {},
  advarendeKrav = [],
  paaMs,
} = {}) {
  const ud = [];

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ KOMPETENCEN SKAL GÆLDE NÅR TUREN KØRER — IKKE NÅR DER KLIKKES.

     `tjekKompetencer()` tager et tidspunkt og bruger `Date.now()` hvis ingen
     får det. Med den standard ville en chauffør hvis ADR-bevis udløber på
     tirsdag, kunne disponeres på en tur på fredag: beviset ER gyldigt i det
     øjeblik disponenten trykker, og udløbet i det øjeblik det betyder noget.

     Tidspunktet er etapens SLUTNING, ikke dens start. Et bevis der udløber
     midt i turen, er udløbet på hjemvejen — og en kontrol i Tyskland spørger
     ikke hvornår man kørte hjemmefra.

     Det blev fundet af en prøve der satte udløbet to dage ude i fremtiden og
     forventede en spærring. Uden `paaMs` gav den grønt.
     ══════════════════════════════════════════════════════════════════════ */
  const gaelderPaa = Number.isFinite(paaMs)
    ? paaMs
    : reservationerForEtapen.reduce((s, r) => Math.max(s, r.til || 0), 0) || Date.now();

  /* 1. Enhedskombination. En trailer kan ikke køre alene. */
  const kombi = kanDisponeres(enheder);
  if (!kombi.ok) ud.push({ tjek: "Enhedskombination", tone: TONE.bad, tekst: kombi.aarsag });

  /* 2. Kompetencer. Kravet kommer fra enhederne PLUS godset — ADR hænger på
        lasten og kan ikke udledes af bilen.

     ⚠ BESLUTNING 25: alt `kraevedeKompetencer()` udleder af enheden og godset
     BLOKERER. Krav der kommer et andet sted fra — virksomhedens egne, en
     kundes — advarer med en begrundet override og sendes ind som
     `advarendeKrav`. */
  const krav = kraevedeKompetencer(enheder, gods);
  if (person && (krav.length || advarendeKrav?.length)) {
    const komp = tjekKompetencer(kompetencer, {
      blokerende: krav, advarende: advarendeKrav || [],
    }, gaelderPaa);

    /* ⚠ MANGLER OG UDLØBNE HOLDES ADSKILT. "Han har aldrig haft C/E" og "hans
       C/E udløb i går" kræver hver sin handling — et andet køretøj mod en
       fornyelse — og en samlet liste ville skjule forskellen. */
    for (const m of komp.blokerende.mangler) {
      ud.push({
        tjek: "Kompetence", tone: TONE.bad,
        tekst: `${person.navn} har aldrig haft ${KOMPETENCE_LABEL[m] || m}.`,
      });
    }
    for (const u of komp.blokerende.udloebne) {
      ud.push({
        tjek: "Kompetence", tone: TONE.bad,
        tekst: `${person.navn}s ${KOMPETENCE_LABEL[u] || u} er udløbet. Den BLOKERER — kravet kommer fra bilen eller godset.`,
      });
    }

    /* ADVARSLER er ikke spærringer. Læses de som blokeringer, holder
       disponenten op med at læse dem. */
    for (const m of [...komp.advarende.mangler, ...komp.advarende.udloebne]) {
      ud.push({
        tjek: "Kompetence", tone: TONE.warn,
        tekst: `${person.navn} mangler ${KOMPETENCE_LABEL[m] || m}. Advarsel — kan overrules med en begrundelse, der logges.`,
      });
    }
  }

  /* 3. Kapacitet — m³ og kg hver for sig. En palle kan være let og fylde
        meget, eller tung og fylde lidt. */
  if (gods && (gods.m3 || gods.kg)) {
    const baere = kanBaere(enheder, gods);
    if (!baere.ok) {
      const dele = [];
      if (baere.mangler.m3) dele.push(`${num(baere.mangler.m3)} m³`);
      if (baere.mangler.kg) dele.push(`${num(baere.mangler.kg)} kg`);
      ud.push({ tjek: "Kapacitet", tone: TONE.bad, tekst: `Mangler ${dele.join(" og ")}.` });
    }
  }

  /* 4. Reservationskonflikt. `tjekLedigMod()` er den rene udgave —
        `tjekLedig()` kræver en database, og den findes ikke i demo-mode. */
  for (const r of reservationerForEtapen) {
    const mod = forRessource(reservationer, r.ressourceType, r.ressourceId)
      .filter((x) => x.id !== r.id && x.kilde?.id !== r.kilde?.id);
    const svar = tjekLedigMod(mod, r);
    for (const k of svar.konflikter) {
      ud.push({
        tjek: "Reservation",
        /* ⚠ EN KONFLIKT MED LAVERE PRIORITET ER EN ADVARSEL, ikke en
           spærring: den nye kilde VILLE overskrive. Et værkstedsbesøg (40)
           slår en booking (10), og det er meningen — en bil på værksted kan
           ikke køre, uanset hvad disponenten har lovet kunden. */
        tone: svar.kanOverskrive ? TONE.warn : TONE.bad,
        tekst: `${konfliktTekst(r, k)} ${svar.kanOverskrive
          ? "Den nye kilde har højere prioritet og ville overskrive."
          : "Den eksisterende kilde har højere eller samme prioritet."}`,
      });
    }
  }

  /* 5. Køre-hviletid. 4,5 t før pause, 9 t i døgnet.

     ⚠ FORBEHOLDET FØLGER MED — også når svaret er grønt. Vi kan kun se
     PLANEN, ikke tachografen, og et grønt flueben ved siden af en bøde er
     værre end ingen kontrol. Se `tjekKoerehviletid()`. */
  if (straekninger?.length) {
    /* ⚠ EN STRÆKNING UDEN PLANLAGT KØRETID KAN IKKE VURDERES — og den gættes
       ikke. `tjekKoerehviletid()` regner hele vinduet som kørsel når
       `koerselMin` mangler; det er rigtigt for en dagstur og forkert for en
       langtur, hvor chaufføren sover undervejs. Uden det her led ville hver
       eneste flerdøgnstur blive spærret med "2400 min. sammenhængende
       kørsel", og disponenten ville lære at spærringen er støj.

       Svaret er derfor en spærring der siger hvad der MANGLER, ikke et
       regnestykke på en antagelse. Samme regel som den manglende momssats.
       Se `koerselMinPaakraevet()` i etaper.js. */
    const uvurderlige = straekninger.filter((s) =>
      Number.isFinite(s?.fra) && Number.isFinite(s?.til)
      && (s.til - s.fra) / 60000 > DAGLIG_GRAENSE_MIN
      && !Number.isFinite(s.koerselMin));
    for (const s of uvurderlige) {
      ud.push({
        tjek: "Køre-hviletid", tone: TONE.bad,
        tekst: `${s.id || "En strækning"} løber over ${(GRAENSE.dagligKoerselMin / 60)} timer `
          + "uden en planlagt køretid. Skriv hvor meget af turen der er kørsel — "
          + "hele vinduet kan ikke regnes som kørsel, og det gættes ikke.",
      });
    }
    /* ══════════════════════════════════════════════════════════════════
       ⚠ PAUSEREGLEN KAN IKKE AFGØRES UD AF EN PLANLAGT ETAPE.

       `tjekKoerehviletid()` regner en strækning som SAMMENHÆNGENDE kørsel og
       finder derfor en pauseovertrædelse på enhver tur over 4,5 time. Men en
       etape siger hvor MEGET der køres, ikke hvor pauserne ligger — en tur
       til Paris med 17 timers kørsel er ikke 17 timer i træk, den er flere
       stræk med hvil imellem. Etapen har ingen ben at lægge dem på.

       En spærring der udløses af hver eneste langtur, er ikke en kontrol:
       den lærer disponenten at klikke videre. Pausereglen er derfor en
       ADVARSEL fra en plan — den skal ses, og den kan ikke afgøres.

       ⚠ DE ØVRIGE BLOKERER UÆNDRET. Dagens og ugens SUM er tal etapen
       faktisk bærer: 17 timers kørsel på ét døgn er ulovligt, uanset hvordan
       det deles op. Det er den overtrædelse der betyder noget her, og den
       fanges stadig.

       Skellet er fundet ved at håndhæve tjekket mod rigtige data. Det stod
       ikke i beslutning 21 — dér stod kun at reglen blokerer, og det gør den
       stadig, for det den KAN se. Forbeholdet er det samme som filens eget:
       vi ser planen, ikke tachografen. */
    const kh = tjekKoerehviletid(straekninger.filter((s) => !uvurderlige.includes(s)));
    for (const o of kh.overtraedelser) {
      const kunPlanlagt = o.type === "pause";
      ud.push({
        tjek: "Køre-hviletid",
        tone: kunPlanlagt ? TONE.warn : TONE.bad,
        tekst: kunPlanlagt
          ? `${o.tekst} Advarsel: planen siger ikke hvor pauserne ligger, `
            + "så det kan ikke afgøres herfra."
          : o.tekst,
      });
    }
  }

  return ud;
}
