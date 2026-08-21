/* src/fleet/useKpi.js
 * Nøgletal læses ÉT sted: tenants/<id>/kpi/current
 *
 * Dashboard og modulerne læser samme felter. Derfor kan Dashboard ikke
 * længere sige "3 servicepunkter forfalder" mens Facility siger 18 —
 * det er samme kilde, og afledte tal (kapacitetsgrad, budgetafvigelse)
 * beregnes hos forbrugeren i stedet for at blive skrevet ind to steder.
 *
 * once() frem for on() — egress koster, og disse tal skal ikke være live.
 *
 * ⚠ HER STOD AT DEMO-SÆTTET ER DELT PÅ DIVISION *"ligesom den rigtige node"*,
 * og at stien bar en gren pr. division. Begge dele er væk med beslutning 70.
 *
 * ⚠ STIEN SKIFTEDE FORM SAMMEN MED REGLEN, ikke før. `kpi/<division>/…` blev
 * matchet af et **wildcard** `$division`, så en klient der læste et niveau
 * højere uden at reglen fulgte med, ville have fået "current" til at matche
 * `$division`, domænet til at matche `$snapshot` — og `.read` på `$domaene`
 * ville aldrig være nået. Det ville ikke have været en anden sti; det ville
 * have været en anden regel.
 */
import { useEffect, useState, useCallback } from "react";
import { useFleet } from "./FleetContext.jsx";

import { db } from "../firebase.js";
import { DEMO_KPI } from "./demo-kpi.js";
import { TILSTAND, dataTilstand, erAfvist } from "./datatilstand.js";
import { medFuldForm, laesbareDomaener } from "./kpi-aggregering.js";
import { harModul } from "./moduler.js";
import { harPerm } from "./permissions.js";

export function useKpi() {
  const { tenantId, path, dage, bruger, moduler } = useFleet();
  const [data, setData] = useState(null);
  const [henter, setHenter] = useState(true);
  const [fejl, setFejl] = useState(null);
  const [tilstand, setTilstand] = useState({ art: TILSTAND.ok, visDemo: false });
  const [nonce, setNonce] = useState(0);
  /* ⚠ HVILKE DOMÆNER SERVEREN AFVISTE. Tomt betyder ikke "alt er der" — det
     betyder at intet blev afvist; et domæne kunden ikke har modulet til,
     bliver slet ikke bedt om. Se laesbareDomaener(). */
  const [afviste, setAfviste] = useState([]);

  const genindlaes = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let aktiv = true;
    setHenter(true);
    setFejl(null);
    const demo = DEMO_KPI;

    /* FØR forespørgslen. Manglende database og manglende bruger er begge
       tilstande vi kender op front — de skal ikke fanges som fejl, og uden
       bruger sendes forespørgslen slet ikke. Så kan vi heller ikke komme til
       at kalde en afvisning for et netværksproblem. Se datatilstand.js. */
    const foer = dataTilstand({ harDb: Boolean(db), harBruger: Boolean(bruger) });
    if (foer.art !== TILSTAND.ok) {
      if (aktiv) {
        setTilstand(foer);
        setData(foer.visDemo ? demo : null);
        setHenter(false);
      }
      return () => { aktiv = false; };
    }

    (async () => {
      try {
        /* ⚠ ET DOMÆNE AD GANGEN — OG DET ER IKKE EN OPTIMERING.
           `kpi/` har ingen `.read` længere; den ligger på hvert domæne med
           sin modulklausul. En læsning af forælderen ville derfor blive
           afvist for ALLE, også admin. Prisen for at kunne spærre `oekonomi`
           for en kunde der ikke har modulet, er at der ikke findes ét kald
           der henter det hele.

           ⚠ VI BEDER KUN OM DEM VI MÅ FÅ. `laesbareDomaener()` er den samme
           liste reglen håndhæver — ellers ville hver sideindlæsning udløse en
           håndfuld `permission-denied` i konsollen, og en afvisning skal
           betyde noget. Catch'en nedenfor er bæltet: modullisten kan være
           forældet i forhold til det serveren mener. */
        const oenskede = laesbareDomaener(
          (m) => harModul(moduler, m),
          /* ⚠ OG BRUGERENS EGEN PERMISSION. Et nøgletal er ikke mildere end
             sit grundlag: må han ikke læse `kunder/`, skal han heller ikke
             kunne læse antallet af kunder ad bagvejen. Reglen håndhæver det;
             det her sørger for at vi ikke beder om det. */
          (p) => harPerm(bruger?.perms, p));
        const svar = await Promise.all(oenskede.map(async (d) => {
          try {
            const s = await db.ref(path(`kpi/current/${d}`)).once("value");
            return { d, vaerdi: s.val(), afvist: false };
          } catch (e) {
            /* ⚠ EN AFVIST LÆSNING KASTER IKKE HELE SIDEN. Ét lukket domæne er
               ikke det samme som en lukket base — den skelnen er hele grunden
               til at hvert domæne hentes for sig.

               ⚠ OG MØNSTRET SKRIVES IKKE AF. RTDB melder afvisning i `code`
               eller i `message`, med tre stavemåder; `erAfvist()` kender dem
               alle, og en kopi her ville før eller siden ramme forbi og kalde
               en afvisning for en netværksfejl. */
            if (erAfvist(e)) return { d, vaerdi: null, afvist: true };
            throw e;
          }
        }));
        if (!aktiv) return;

        const afviste = svar.filter((s) => s.afvist).map((s) => s.d);
        /* ⚠ ALLE AFVIST ER EN AFVISNING — ikke et tomt datasæt. Sker det, er
           det tenanten eller abonnementet der spærrer, ikke ét modul. */
        if (oenskede.length && afviste.length === oenskede.length) {
          setTilstand({ art: TILSTAND.naegtet, visDemo: false });
          setData(null);
          return;
        }

        const samlet = {};
        for (const s of svar) if (s.vaerdi != null) samlet[s.d] = s.vaerdi;
        setAfviste(afviste);
        /* ⚠ HER STOD `snap.val() || demo` — OG DET VAR EN FEJL DER VENTEDE.
           Begrundelsen var at appen ellers stod tom for en bruger der var
           logget korrekt ind. Det var rigtigt dengang alt var visning og der
           kun fandtes én tenant.

           Men i det øjeblik en RIGTIG kunde får en tom base, ville han se
           DEMO Transports tal: 287 aktiver, 842.615 kr i driftsomkostninger.
           Det er beslutning 26's lærestreg — demo-data oven på en rigtig
           læsning — som overlevede præcis her.

           En tom node er en TREDJE ting: ikke en fejl, ikke en afvisning, og
           ikke nul. Skærmen siger hvad der mangler. Se TILSTAND.ikkeAggregeret. */
        const vaerdi = Object.keys(samlet).length ? samlet : null;
        if (vaerdi) {
          setTilstand({ art: TILSTAND.ok, visDemo: false });
          /* ⚠ LAGT OVEN PÅ NODENS FULDE FORM. RTDB gemmer ikke null: et felt
             der aggregeringen skrev som null, er SLETTET når det kommer
             tilbage — og er hele domænet null, findes domænet ikke.

             Målt på den udrullede base: `bemanding` manglede helt, fordi alle
             ni felter afventer divisionsspørgsmålet. Bemanding-skærmen læser
             `k.bemanding.disponeret` og blev HVID. Det var ikke skærmens fejl
             — den læste et felt aggregeringen havde skrevet.

             Oversættelsen hører HER og ikke i hver skærm, af samme grund som
             fraDb() i grundlag.js: tyve skærme ville lave tyve varianter, og
             den næste ville glemme den. */
          /* ⚠ FORMEN LÆGGES OGSÅ PÅ ET AFVIST DOMÆNE, og det er et bevidst
             valg med en pris. Uden den ville `k.oekonomi.budgetOere` kaste, og
             en skærm blive HVID hos en kunde der bare mangler et modul — den
             fejl useKpi netop findes for at undgå.
             Følgen er at et afvist domæne ser ud som et der ikke er REGNET:
             begge skriver INTET (—). De to er ikke det samme, og forskellen
             ligger i `afviste` ved siden af tallene. En skærm der vil sige
             "du må ikke se det" frem for "ikke regnet endnu", skal spørge
             den — se Dashboard. */
          setData(medFuldForm(vaerdi));
        } else {
          /**
           * ⚠ FORMEN, IKKE null — og det er forskellen på en skærm med et hul
           * i og en hvid skærm.
           *
           * Her stod `setData(null)`, og fire skærme læser `k.` hele vejen
           * ned: Workforce, Planning, Disponering og Kunder. De returnerede
           * derfor på `if (!k)` **før** de tegnede deres tabeller — og en
           * kunde med 35 medarbejdere i basen så en tom Workforce, fordi
           * NØGLETALLENE manglede.
           *
           * Det blev målt på en rigtig tenant: `kpi`-noden var tom, og ti
           * skærme så i stykker ud af én manglende node.
           *
           * ⚠ SKELLET ER IKKE VÆK — det er flyttet derhen hvor det hører.
           * `tilstand` siger stadig `ikkeAggregeret`, så skærmen kan sige det
           * ÉN gang øverst; felterne er null og skriver INTET (—), som de
           * skal. Dashboard og Økonomi har intet under nøgletallene og
           * blokerer stadig — se noten ved blokerer().
           */
          setTilstand({ art: TILSTAND.ikkeAggregeret, visDemo: false });
          setData(medFuldForm({}));
        }
      } catch (e) {
        if (!aktiv) return;
        setFejl(e);
        setTilstand(dataTilstand({ harDb: true, harBruger: true, fejl: e }));
        /* Ingen tal oven på en afvisning. Det er hele pointen. */
        setData(null);
      } finally {
        if (aktiv) setHenter(false);
      }
    })();

    return () => { aktiv = false; };
  }, [tenantId, dage, path, nonce, bruger, moduler]);

  return { kpi: data, henter, fejl, tilstand, genindlaes, afviste };
}

/* Demo-sættet ligger i demo-kpi.js — rent data, uden React, så en test og
   demo-filerne kan læse det uden at trække FleetContext med. Det re-eksporteres
   her, så alt der importerede DEMO_KPI herfra virker uændret. */
export { DEMO_KPI };
