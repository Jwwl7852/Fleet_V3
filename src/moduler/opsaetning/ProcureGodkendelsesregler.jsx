/* src/moduler/opsaetning/ProcureGodkendelsesregler.jsx
 * Opsætning → Procure → Godkendelsesregler.
 *
 * ⚠ FLYTTET HERTIL FRA Godkendelser.jsx (Procure TARGET, trin 4,
 * produktejer-review 2026-09-02) — INFORMATIONSARKITEKTUR, IKKE EN NY
 * GODKENDELSESMOTOR. Selve håndhævelsen (`godkendelsesregelskriv`,
 * `kraeverGodkendelse()`, `kanSkifteIndkoebsordre()` i fleet/procure.js) er
 * fuldstændig uændret — kun UI'et der SÆTTER politikken er flyttet. Den
 * DAGLIGE brug af politikken — køen af ordrer der venter, og handlingerne
 * på dem — blev bevidst IKKE flyttet med; den bor i Procure → Bestillinger,
 * fordi det er det daglige arbejde, ikke administration af det.
 *
 * ⚠ TO REGLER, HVER MED SIN KONTAKT, OG BEGGE KAN SLÅS FRA. Kunden bad
 * udtrykkeligt om det: en lille virksomhed hvor samme person bestiller og
 * godkender, får intet ud af et ekstra trin. At kunne slå reglen fra er en
 * FUNKTION og ikke et hul.
 *
 * ⚠ MEN DEN SÆTTES AF EN ADMINISTRATOR, IKKE AF DEN DER BESTILLER.
 * `godkendelsesregelskriv` kræver `brugere.skriv` — den der rammer loftet,
 * må ikke kunne hæve det.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { usePost } from "../../fleet/usePost.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr } from "../../fleet/format.js";
import {
  Kort, Henter, Datatilstand, Knap, Felt, Feltraekke, Formularsvar,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { STANDARD_GODKENDELSESREGLER } from "../../fleet/procure.js";
import { gemGodkendelsesregler } from "../../fleet/godkendelse.js";
import { DEMO_GODKENDELSESREGLER } from "../../fleet/demo-procure.js";

export default function ProcureGodkendelsesregler() {
  const { bruger } = useFleet();
  const maaSaetteRegler = harPerm(bruger?.perms, PERM.brugereSkriv);

  const [svar, setSvar] = useState(null);
  const [arbejder, setArbejder] = useState(false);
  const [udkast, setUdkast] = useState(null);

  const regelPost = usePost(null, "godkendelsesregler", { demo: DEMO_GODKENDELSESREGLER });
  const brugere = useListe("brugere", { vindue: "alle", graense: 200 });

  if (regelPost.henter) return <Henter hvad="godkendelsesreglerne" />;
  if (blokerer(regelPost.tilstand)) {
    return <Datatilstand tilstand={regelPost.tilstand} genprov={regelPost.genindlaes} />;
  }

  const regler = regelPost.post || STANDARD_GODKENDELSESREGLER;

  const nuvaerende = udkast || {
    overBeloeb: {
      aktiv: Boolean(regler.overBeloeb?.aktiv),
      graenseOere: regler.overBeloeb?.graenseOere ?? null,
      godkenderUid: regler.overBeloeb?.godkenderUid || "",
    },
    fakturagodkendelse: {
      aktiv: Boolean(regler.fakturagodkendelse?.aktiv),
      godkenderUid: regler.fakturagodkendelse?.godkenderUid || "",
    },
  };
  const saet = (gren, felt, vaerdi) => setUdkast({
    ...nuvaerende, [gren]: { ...nuvaerende[gren], [felt]: vaerdi },
  });

  const gemRegler = async () => {
    setArbejder(true);
    const r = await gemGodkendelsesregler(udkast);
    setSvar(r);
    setArbejder(false);
    if (r.ok) { setUdkast(null); regelPost.genindlaes(); }
  };

  const brugervalg = [
    { vaerdi: "", label: "Vælg godkender…" },
    ...brugere.data.map((b) => ({ vaerdi: b.id, label: b.navn || b.email || b.id })),
  ];

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Formularsvar svar={svar} okTekst="Gemt." />

      <div className="fc-regelraekke">
        <Kort titel="Godkendelse over beløb"
              handling={<Kontakt aktiv={nuvaerende.overBeloeb.aktiv}
                                 disabled={!maaSaetteRegler}
                                 label="Godkendelse over beløb"
                                 saet={(v) => saet("overBeloeb", "aktiv", v)} />}>
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Kræver godkendelse, når et indkøb <b>overstiger</b> det angivne beløb.
          </p>
          <Feltraekke>
            <Felt id="graense" label="Beløbsgrænse" type="number" suffiks="kr."
                  disabled={!maaSaetteRegler || !nuvaerende.overBeloeb.aktiv}
                  vaerdi={Number.isInteger(nuvaerende.overBeloeb.graenseOere)
                    ? nuvaerende.overBeloeb.graenseOere / 100 : ""}
                  saet={(v) => saet("overBeloeb", "graenseOere",
                    v === "" ? null : Math.round(Number(v) * 100))} />
            <Felt id="godkender" label="Godkender" valgmuligheder={brugervalg}
                  disabled={!maaSaetteRegler || !nuvaerende.overBeloeb.aktiv}
                  vaerdi={nuvaerende.overBeloeb.godkenderUid}
                  saet={(v) => saet("overBeloeb", "godkenderUid", v)} />
          </Feltraekke>
          <p className="fc-hint">
            {nuvaerende.overBeloeb.aktiv && Number.isInteger(nuvaerende.overBeloeb.graenseOere)
              ? <>Indkøb til og med {kr(nuvaerende.overBeloeb.graenseOere)} godkendes automatisk.</>
              : "Reglen er slået fra — alle bestillinger går direkte videre."}
          </p>
        </Kort>

        <Kort titel="Kræv fakturagodkendelse"
              handling={<Kontakt aktiv={nuvaerende.fakturagodkendelse.aktiv}
                                 disabled={!maaSaetteRegler}
                                 label="Kræv fakturagodkendelse"
                                 saet={(v) => saet("fakturagodkendelse", "aktiv", v)} />}>
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Kræver godkendelse af fakturaer før betaling.
          </p>
          <Felt id="fgodkender" label="Godkender" valgmuligheder={brugervalg}
                disabled={!maaSaetteRegler || !nuvaerende.fakturagodkendelse.aktiv}
                vaerdi={nuvaerende.fakturagodkendelse.godkenderUid}
                saet={(v) => saet("fakturagodkendelse", "godkenderUid", v)} />
          <p className="fc-hint">
            {nuvaerende.fakturagodkendelse.aktiv
              ? <>Kun den valgte kan godkende en faktura. Selve godkendelsen
                 sker på <Link className="fc-a" to="/oekonomi/fakturacenter?destination=procure">
                 Fakturaer &amp; bilag</Link>.</>
              : <>Reglen er slået fra — alle med <code>{PERM.indkoebGodkend}</code>{" "}
                 kan godkende en faktura.</>}
          </p>
          <p className="fc-hint">
            <b>Der betales ikke fra systemet.</b> Reglen afgør hvem der må
            sige god for regningen — ikke hvornår pengene sendes.
          </p>
        </Kort>

        <Kort titel="Kan slås fra">
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Godkendelsen kan slås fra, hvis virksomheden er lille, eller hvis
            samme person både bestiller og godkender. Så går bestillingen
            direkte videre uden et ekstra trin.
          </p>
          <p className="fc-hint">
            Godkenderen kan godkende sine <b>egne</b> bestillinger. Reglen
            udpeger én person, og krævede vi to par øjne, ville hans egne
            ordrer aldrig kunne godkendes. <b>Det markeres i stedet</b> på
            selve ordren i Bestillinger.
          </p>
          {!maaSaetteRegler && (
            <p className="fc-hint fc-bad">
              Du kan se reglerne, men ikke ændre dem. Det kræver{" "}
              <code>{PERM.brugereSkriv}</code>: <b>den der rammer loftet, må
              ikke kunne hæve det.</b>
            </p>
          )}
          {maaSaetteRegler && udkast && (
            <Knap variant="primaer" disabled={arbejder} onClick={gemRegler}>
              Gem reglerne
            </Knap>
          )}
        </Kort>
      </div>

      <Kort titel="Den daglige kø">
        <p className="fc-hint" style={{ marginTop: 0 }}>
          Ordrer der afventer godkendelse, og handlingerne på dem, står ikke
          her — det er dagligt arbejde, ikke administration. Se{" "}
          <Link className="fc-a" to="/indkoeb/bestillinger">Procure → Bestillinger</Link>.
        </p>
      </Kort>
    </div>
  );
}

/**
 * ⚠ EN RIGTIG CHECKBOX INDENI. Et `<div>` med en `onClick` er ikke en kontakt
 * for den der bruger tastatur eller skærmlæser.
 */
function Kontakt({ aktiv, saet, label, disabled }) {
  return (
    <label className={`fc-kontakt${aktiv ? " fc-kontakt-til" : ""}`}>
      <input type="checkbox" checked={aktiv} disabled={disabled}
             aria-label={label} onChange={(e) => saet(e.target.checked)} />
      <span className="fc-kontakt-spor" aria-hidden="true" />
    </label>
  );
}
