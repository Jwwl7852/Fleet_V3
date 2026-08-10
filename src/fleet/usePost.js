/* src/fleet/usePost.js
 * ÉN post fra ÉN node. Det ekstra opslag på en detaljeskærm.
 *
 * ⚠ HVORFOR DEN IKKE ER useListe. De klassificerede satellitter (beslutning
 * 17) ligger som søskende: sensitive/fravaer/<id>. Læste vi dem med useListe,
 * hentede vi HELE noden — altså alle personers årsager — for at vise én. Det
 * er nøjagtig det, opdelingen findes for at undgå. ARKITEKTUR budgetterer med
 * ét ekstra opslag på en detaljeskærm og nul på en liste; det her er det
 * opslag.
 *
 * id = null betyder "spørg ikke". Så kan hooket stå ubetinget øverst i en
 * skærm — hooks må ikke kaldes betinget — mens selve læsningen først sker når
 * brugeren har bedt om den.
 *
 * De tre tilstande kommer fra dataTilstand() og ikke fra en kopi her. Reglen
 * er den samme som i useKpi og useListe: opdigtede tal findes KUN hvor der
 * ikke er en database at spørge. En afvisning bærer aldrig data med sig.
 *
 * auditerSom hører på FORESPØRGSLEN og ikke i skærmen — ellers glemmes den
 * næste gang nogen læser noden. Samme argument som i useListe.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFleet } from "./FleetContext.jsx";
import { db } from "../firebase.js";
import { laes as auditLaes, adgangNaegtet as auditNaegtet } from "./audit.js";
import { TILSTAND, dataTilstand } from "./datatilstand.js";

/**
 * usePost(node, id, { demo, auditerSom })
 *
 *   node        fx "sensitive/fravaer" — uden tenant-præfiks, path() sætter det
 *   id          nøglen. null/undefined → ingen forespørgsel
 *   demo        objekt eller (id) => objekt, når der ingen database er
 *   auditerSom  objektnavn — logger læsningen OG en afvisning
 *
 * → { post, henter, fejl, tilstand, genindlaes }
 */
export function usePost(node, id, indstillinger = {}) {
  const { path, tenantId, bruger } = useFleet();
  const { demo, auditerSom } = indstillinger;

  const [post, setPost] = useState(null);
  const [henter, setHenter] = useState(false);
  const [fejl, setFejl] = useState(null);
  const [tilstand, setTilstand] = useState({ art: TILSTAND.ok, visDemo: false });
  const [nonce, setNonce] = useState(0);
  const genindlaes = useCallback(() => setNonce((n) => n + 1), []);

  /* demo er typisk en inline-literal og skifter identitet hver render. Den må
     ikke stå i effektens deps — samme greb som i useListe. */
  const demoRef = useRef(demo);
  demoRef.current = demo;

  useEffect(() => {
    let aktiv = true;

    if (!id) {
      setPost(null);
      setFejl(null);
      setHenter(false);
      setTilstand({ art: TILSTAND.ok, visDemo: false });
      return () => { aktiv = false; };
    }

    setHenter(true);
    setFejl(null);

    const demoPost = () => {
      const d = demoRef.current;
      return (typeof d === "function" ? d(id) : d?.[id]) ?? null;
    };

    /* FØR forespørgslen. Uden bruger sendes den slet ikke — se datatilstand.js. */
    const foer = dataTilstand({ harDb: Boolean(db), harBruger: Boolean(bruger) });
    if (foer.art !== TILSTAND.ok) {
      if (aktiv) {
        setTilstand(foer);
        setPost(foer.visDemo ? demoPost() : null);
        setHenter(false);
      }
      return () => { aktiv = false; };
    }

    (async () => {
      try {
        const snap = await db.ref(path(`${node}/${id}`)).once("value");
        if (!aktiv) return;
        setTilstand({ art: TILSTAND.ok, visDemo: false });
        setPost(snap.val() ?? null);
        /* Antallet, ikke indholdet. En auditpost må ikke indeholde det den
           registrerer at nogen har set. */
        if (auditerSom) auditLaes({ objekt: auditerSom, objektId: id, antal: 1 });
      } catch (e) {
        if (!aktiv) return;
        setFejl(e);
        setTilstand(dataTilstand({ harDb: true, harBruger: true, fejl: e }));
        /* Ingen data oven på en afvisning. Det er hele pointen. */
        setPost(null);
        /* Et afvist forsøg på en klassificeret node er selv en hændelse — og
           her er den ægte: brugeren bad udtrykkeligt om at se feltet. */
        if (auditerSom) auditNaegtet({ objekt: auditerSom, objektId: id, aarsag: e?.code || "ukendt" });
      } finally {
        if (aktiv) setHenter(false);
      }
    })();

    return () => { aktiv = false; };
  }, [node, id, path, tenantId, nonce, bruger, auditerSom]);

  return { post, henter, fejl, tilstand, genindlaes };
}
