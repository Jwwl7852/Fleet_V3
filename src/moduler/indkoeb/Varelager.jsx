/* src/moduler/indkoeb/Varelager.jsx
 * Procures EGET varelager — beslutning 85. Planche 5's "Lager".
 *
 * ⚠ VORES EGNE VARER, IKKE KUNDENS. Warehouses `varer`/`beholdning` er 3PL —
 * kundens gods, med et påkrævet `kundeId`. Det her er handsker, strækfilm,
 * papir og filtre: dem vi bruger op og køber igen. Overblikkets kort "Lav
 * lagerbeholdning" stod som `null` indtil den her node fandtes, netop fordi
 * alternativet ville få Procure til at bede os bestille noget en KUNDE
 * mangler. Se beslutning 84.
 *
 * ⚠ BEHOLDNINGEN TASTES IKKE — DEN BEVÆGES. Et felt man kunne rette direkte,
 * ville være en femte bevægelsesart ingen har besluttet, og den ville ikke stå
 * i historikken. Skal tallet rettes, er det en OPTÆLLING, og så står rettelsen
 * der hvor man leder efter den.
 *
 * ⚠ OG DET GEMTE TAL PRØVES MOD BEVÆGELSERNE PÅ SKÆRMEN. Beholdningen skrives
 * sammen med bevægelsen i én `update()` (beslutning 39), fordi en skærm ikke
 * kan summere hele historikken hver gang — men et gemt afledt tal driver
 * (beslutning 71). En drift der ikke kan ses, bliver ikke rettet.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { dato, num, mindst } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Knap, Felt, Feltraekke,
  Formularsvar, KpiKort, KpiRaekke, Ikon, Dialog, MiniLinje,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  BEVAEGELSESART, ALLE_BEVAEGELSESARTER, laveVarer, udenGraense,
  negativeBeholdninger, beholdningsafvigelse, nyBeholdning, behovFraVare,
} from "../../fleet/forbrugsvarer.js";
import { gemForbrugsvare, flytBeholdning } from "../../fleet/varelager.js";
import { meldBehov } from "../../fleet/behov.js";
import {
  DEMO_FORBRUGSVARER, DEMO_FORBRUGSVAREBEVAEGELSER,
} from "../../fleet/demo-forbrugsvarer.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

const TOM_VARE = { navn: "", varenummer: "", enhed: "stk", minimum: "", leverandoerId: "" };

export default function Varelager() {
  const { bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.indkoebSkriv);

  const [svar, setSvar] = useState(null);
  const [arbejder, setArbejder] = useState(false);
  const [vareform, setVareform] = useState(null);
  const [bevaegelse, setBevaegelse] = useState(null);
  const [udkast, setUdkast] = useState(TOM_VARE);
  const [bev, setBev] = useState({ art: "modtaget", antal: "", note: "" });

  const varer = useListe("forbrugsvarer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_FORBRUGSVARER,
  });
  const bevaegelser = useListe("forbrugsvarebevaegelser", {
    ordnPaa: "ms", vindue: "alle", graense: 1000, demo: DEMO_FORBRUGSVAREBEVAEGELSER,
  });
  const lev = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });

  if (varer.henter) return <Henter hvad="varelageret" />;
  if (blokerer(varer.tilstand)) {
    return <Datatilstand tilstand={varer.tilstand} genprov={varer.genindlaes} />;
  }

  const lvNavn = (id) => lev.data.find((l) => l.id === id)?.navn || null;

  const lave = laveVarer(varer.data);
  const uden = udenGraense(varer.data);
  const negative = negativeBeholdninger(varer.data);
  const drift = beholdningsafvigelse(varer.data, bevaegelser.data);

  const koer = async (fn) => {
    setArbejder(true);
    const r = await fn();
    setSvar(r);
    setArbejder(false);
    if (r.ok) {
      varer.genindlaes();
      bevaegelser.genindlaes();
      setVareform(null);
      setBevaegelse(null);
      setUdkast(TOM_VARE);
      setBev({ art: "modtaget", antal: "", note: "" });
    }
    return r;
  };

  const gemVare = () => koer(() => gemForbrugsvare({
    id: vareform === "ny" ? undefined : vareform,
    navn: udkast.navn,
    varenummer: udkast.varenummer || undefined,
    enhed: udkast.enhed,
    leverandoerId: udkast.leverandoerId || undefined,
    /* ⚠ TOM STRENG BLIVER null — "ingen grænse" — og ikke 0. `Number("")` er
       0, og en grænse på nul betyder at varen ALDRIG er lav. Det er det stik
       modsatte af "feltet er ikke udfyldt". */
    minimumBeholdning: udkast.minimum === "" ? null : Number(udkast.minimum),
  }));

  const gemBevaegelse = () => koer(() => flytBeholdning({
    forbrugsvareId: bevaegelse.id,
    art: bev.art,
    antal: bev.antal === "" ? NaN : Number(bev.antal),
    note: bev.note || undefined,
  }));

  /* ⚠ ET LAVT LAGER BLIVER TIL ET BEHOV — UDEN ET ANTAL. Vi ved at varen er
     lav; vi ved ikke hvor meget der skal købes. Antallet er valgfrit på et
     behov netop af den grund (beslutning 80), og et gæt ville gå med i en
     bestilling. */
  const meldInd = (vare) => koer(() => meldBehov(behovFraVare(vare)));

  const aabnRet = (vare) => {
    setVareform(vare.id);
    setUdkast({
      navn: vare.navn || "",
      varenummer: vare.varenummer || "",
      enhed: vare.enhed || "stk",
      minimum: Number.isFinite(vare.minimumBeholdning) ? String(vare.minimumBeholdning) : "",
      leverandoerId: vare.leverandoerId || "",
    });
  };

  const levvalg = [
    { vaerdi: "", label: "Ingen fast leverandør" },
    ...lev.data.map((l) => ({ vaerdi: l.id, label: l.navn })),
  ];
  const artvalg = ALLE_BEVAEGELSESARTER.map((a) => ({
    vaerdi: a, label: BEVAEGELSESART[a].label,
  }));

  const valgtVare = varer.data.find((v) => v.id === bevaegelse?.id) || null;
  const forhaandsvisning = valgtVare && bev.antal !== ""
    ? nyBeholdning(valgtVare, { art: bev.art, antal: Number(bev.antal) })
    : null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={varer.tilstand} genprov={varer.genindlaes} />

      <KpiRaekke>
        <KpiKort label="Under minimum" vaerdi={num(lave.length)}
                 note="klar til at bestille"
                 ikon={<Ikon navn="advarsel" />} tone="ikon-1" rund />
        {/* ⚠ DE UDEN GRÆNSE STÅR FOR SIG. Uden det her tal betyder "0 under
            minimum" både "alt er fyldt op" og "ingen har sat en grænse". */}
        <KpiKort label="Uden minimum" vaerdi={num(uden.length)}
                 note="kan aldrig blive lave"
                 ikon={<Ikon navn="udraab" />} tone="ikon-3" rund />
        <KpiKort label="Varer i alt" vaerdi={mindst(varer.data.length, varer.afkortet)}
                 note="vores egne — ikke kundernes"
                 ikon={<Ikon navn="kasse" />} tone="ikon-4" rund />
        {/* ⚠ HER STOD note="hele historikken" UNDER ET TAL TALT OP AF EN
            LISTE MED LOFT PÅ 1000. Rammes loftet, er det ikke historikken —
            det er de sidste tusind. Se beslutning 96. */}
        <KpiKort label="Bevægelser" vaerdi={mindst(bevaegelser.data.length, bevaegelser.afkortet)}
                 note={bevaegelser.afkortet ? "de nyeste — listen er afkortet" : "hele historikken"}
                 ikon={<Ikon navn="ur" />} tone="ikon-6" rund />
      </KpiRaekke>

      <Formularsvar svar={svar} okTekst="Gemt." />

      {/* ⚠ EN NEGATIV BEHOLDNING ER IKKE EN FEJL I MODELLEN — den er beviset
          på at der mangler en bevægelse. Den vises frem for at blive spærret:
          afviste vi forbruget, ville den rigtige hændelse gå tabt for at
          beskytte et tal der allerede var galt. */}
      {negative.length > 0 && (
        <Kort titel={`Beholdning under nul (${num(negative.length)})`}>
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Et minus betyder <b>ikke</b> at nogen har gjort noget forkert — det
            betyder at der mangler en bevægelse. Nogen har taget varen uden at
            melde det, eller tallet var forkert i forvejen.{" "}
            <b>Svaret er en optælling</b>, ikke en rettelse af tallet.
          </p>
          <Tabel
            raekker={negative}
            tom="Ingen."
            kolonner={[
              { key: "navn", label: "Vare", render: (v) => <b>{v.navn}</b> },
              { key: "beholdning", label: "Beholdning", num: true,
                render: (v) => <b className="fc-bad">{num(v.beholdning)} {v.enhed}</b> },
              { key: "handling", label: "", render: (v) => (
                  <Knap disabled={!maaSkrive || arbejder}
                        onClick={() => { setBevaegelse(v); setBev({ art: "optaelling", antal: "", note: "" }); }}>
                    Tæl op
                  </Knap>) },
            ]}
          />
        </Kort>
      )}

      {/* ⚠ DRIFTEN MELLEM DET GEMTE TAL OG BEVÆGELSERNE. Beholdningen er gemt
          fordi en skærm ikke kan summere historikken for hver vare hver gang —
          men et gemt afledt tal driver. En drift der ikke kan ses, bliver ikke
          rettet. Samme greb som enhedsafvigelse() i Warehouse. */}
      {drift.length > 0 && (
        <Kort titel={`Beholdningen stemmer ikke med bevægelserne (${num(drift.length)})`}>
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Det gemte tal og summen af bevægelser er uenige. <b>Det er en
            manglende bevægelse</b>, ikke et tal der skal rettes — og det er
            derfor begge står her.
          </p>
          <Tabel
            raekker={drift}
            noegle={(r) => r.vare.id}
            tom="Ingen."
            kolonner={[
              { key: "navn", label: "Vare", render: (r) => <b>{r.vare.navn}</b> },
              { key: "gemt", label: "Gemt", num: true, render: (r) => num(r.gemt) },
              { key: "regnet", label: "Regnet af bevægelser", num: true, render: (r) => num(r.regnet) },
              { key: "forskel", label: "Forskel", num: true,
                render: (r) => <b className="fc-bad">{r.forskel > 0 ? "+" : ""}{num(r.forskel)}</b> },
            ]}
          />
        </Kort>
      )}

      <Kort
        titel={`Varelager (${num(varer.data.length)})`}
        handling={maaSkrive && (
          <Knap variant="primaer" onClick={() => { setVareform("ny"); setUdkast(TOM_VARE); }}>
            Ny vare
          </Knap>
        )}
      >
        <p className="fc-hint" style={{ marginTop: 0 }}>
          <b>Vores egne forbrugsvarer</b> — ikke kundernes gods. Det ligger i{" "}
          <Link className="fc-a" to="/warehouse">Warehouse</Link>, hvor hver
          vare tilhører en kunde.
        </p>
        <Tabel
          raekker={varer.data}
          tom="Ingen forbrugsvarer endnu. Opret den første med Ny vare."
          kolonner={[
            { key: "navn", label: "Vare", render: (v) => (
                <>
                  <b>{v.navn}</b>
                  <div className="fc-hint">{v.varenummer || "uden varenummer"}</div>
                </>
              ) },
            { key: "lev", label: "Fast leverandør",
              render: (v) => lvNavn(v.leverandoerId)
                || <span className="fc-hint">ingen</span> },
            { key: "beholdning", label: "Beholdning", num: true, render: (v) => (
                <b className={v.beholdning < 0 ? "fc-bad" : ""}>
                  {num(v.beholdning)} {v.enhed}
                </b>
              ) },
            { key: "minimum", label: "Minimum", num: true,
              /* ⚠ INTET MINIMUM SKRIVER —, IKKE 0. Et nul ville betyde at
                 varen aldrig er lav; en streg betyder at ingen har taget
                 stilling. */
              render: (v) => (Number.isFinite(v.minimumBeholdning)
                ? num(v.minimumBeholdning)
                : <span className="fc-hint" title="Ingen grænse sat — varen kan aldrig blive lav.">—</span>) },
            { key: "status", label: "Status", render: (v) => {
                if (!Number.isFinite(v.minimumBeholdning)) {
                  return <Pille tone="info">Ingen grænse</Pille>;
                }
                if (v.beholdning < 0) return <Pille tone="bad">Under nul</Pille>;
                if (v.beholdning <= v.minimumBeholdning) return <Pille tone="warn">Under minimum</Pille>;
                return <Pille tone="ok">Fyldt op</Pille>;
              } },
            { key: "sidst", label: "Sidste bevægelse",
              render: (v) => (Number.isFinite(v.sidstBevaegetMs)
                ? dato(v.sidstBevaegetMs)
                : <span className="fc-hint">aldrig</span>) },
            { key: "handling", label: "", render: (v) => (
                <span className="fc-knapper">
                  <Knap disabled={!maaSkrive || arbejder}
                        onClick={() => { setBevaegelse(v); setBev({ art: "modtaget", antal: "", note: "" }); }}>
                    Bevægelse
                  </Knap>
                  <Knap disabled={!maaSkrive || arbejder} onClick={() => aabnRet(v)}>
                    Ret
                  </Knap>
                  {/* ⚠ KUN PÅ DE LAVE. En "meld ind"-knap på hver række ville
                      gøre indbakken til en indkøbsliste over alt vi ejer. */}
                  {Number.isFinite(v.minimumBeholdning)
                    && v.beholdning <= v.minimumBeholdning && (
                    <Knap variant="primaer" disabled={!maaSkrive || arbejder}
                          onClick={() => meldInd(v)}>
                      Meld som behov
                    </Knap>
                  )}
                </span>
              ) },
          ]}
        />
      </Kort>

      <Kort titel={`Bevægelser (${num(bevaegelser.data.length)})`}>
        <Tabel
          raekker={[...bevaegelser.data].sort((a, b) => (b.ms || 0) - (a.ms || 0)).slice(0, 25)}
          tom="Ingen bevægelser endnu."
          kolonner={[
            { key: "ms", label: "Tidspunkt", render: (b) => dato(b.ms) },
            { key: "vare", label: "Vare",
              render: (b) => varer.data.find((v) => v.id === b.forbrugsvareId)?.navn
                || b.forbrugsvareId },
            { key: "art", label: "Art", render: (b) => (
                <Pille tone={BEVAEGELSESART[b.art]?.tone}>
                  {BEVAEGELSESART[b.art]?.label || b.art}
                </Pille>
              ) },
            { key: "antal", label: "Antal", num: true, render: (b) => num(b.antal) },
            /* ⚠ FØR OG EFTER STÅR PÅ RÆKKEN. Uden dem kan en enkelt bevægelse
               ikke læses alene — man skulle summere hele historikken for at
               vide hvad den betød. */
            { key: "foer", label: "Før", num: true, render: (b) => num(b.foer) },
            { key: "efter", label: "Efter", num: true, render: (b) => num(b.efter) },
            { key: "note", label: "Note",
              render: (b) => b.note || <span className="fc-hint">—</span> },
          ]}
        />
      </Kort>

      {/* ---- Stamdata --------------------------------------------------- */}
      {vareform && (
        <Dialog
          titel={vareform === "ny" ? "Ny forbrugsvare" : "Ret forbrugsvare"}
          under="Beholdningen sættes ikke her — den er summen af bevægelser."
          onLuk={() => setVareform(null)}
          handling={
            <Knap variant="primaer" disabled={!udkast.navn.trim() || arbejder}
                  onClick={gemVare}>
              Gem
            </Knap>
          }
        >
          <Felt id="v-navn" label="Navn" kraevet vaerdi={udkast.navn}
                saet={(v) => setUdkast({ ...udkast, navn: v })} />
          <Feltraekke>
            <Felt id="v-nr" label="Varenummer" vaerdi={udkast.varenummer}
                  saet={(v) => setUdkast({ ...udkast, varenummer: v })} />
            <Felt id="v-enhed" label="Enhed" kraevet vaerdi={udkast.enhed}
                  saet={(v) => setUdkast({ ...udkast, enhed: v })} />
          </Feltraekke>
          {/* ⚠ MINIMUM ER VALGFRIT, OG DET SIGES. Et tomt felt betyder "ingen
              grænse" — ikke nul. En vare uden grænse kan aldrig blive lav, og
              det er et gyldigt svar for noget vi ikke styrer på. */}
          <Felt id="v-min" label="Minimumsbeholdning" type="number"
                vaerdi={udkast.minimum} suffiks={udkast.enhed}
                hint="Tomt = ingen grænse. Varen kan så aldrig blive lav — det er et svar, ikke en mangel."
                saet={(v) => setUdkast({ ...udkast, minimum: v })} />
          <Felt id="v-lev" label="Fast leverandør" valgmuligheder={levvalg}
                vaerdi={udkast.leverandoerId}
                saet={(v) => setUdkast({ ...udkast, leverandoerId: v })} />
        </Dialog>
      )}

      {/* ---- Bevægelsen ------------------------------------------------- */}
      {bevaegelse && (
        <Dialog
          titel={`Bevægelse — ${bevaegelse.navn}`}
          under="Antallet er altid positivt. Retningen kommer af arten."
          onLuk={() => setBevaegelse(null)}
          handling={
            <Knap variant="primaer" disabled={bev.antal === "" || arbejder}
                  onClick={gemBevaegelse}>
              Gem bevægelse
            </Knap>
          }
        >
          <MiniLinje label="Beholdning nu"
                     vaerdi={<b>{num(valgtVare?.beholdning)} {bevaegelse.enhed}</b>} />
          <Felt id="b-art" label="Hvad skete der" kraevet valgmuligheder={artvalg}
                vaerdi={bev.art} saet={(v) => setBev({ ...bev, art: v })} />
          <Felt id="b-antal"
                /* ⚠ EN OPTÆLLING BÆRER DET TALTE, ikke en ændring — og
                   etiketten siger hvilket. Uden den skulle den der tæller,
                   regne forskellen i hovedet, og en fejl i det regnestykke ser
                   bagefter ud som svind. */
                label={bev.art === "optaelling" ? "Talt antal" : "Antal"}
                type="number" min="0" kraevet suffiks={bevaegelse.enhed}
                vaerdi={bev.antal} saet={(v) => setBev({ ...bev, antal: v })} />
          <Felt id="b-note" label="Note"
                kraevet={bev.art === "svind"}
                hint={bev.art === "svind"
                  ? "Svind uden en grund bliver ikke undersøgt."
                  : "Valgfri."}
                vaerdi={bev.note} saet={(v) => setBev({ ...bev, note: v })} />
          {/* ⚠ REGNET MED SAMME nyBeholdning() SOM SERVEREN SKRIVER. To
              regnestykker ville kunne blive uenige om en optælling. */}
          {forhaandsvisning !== null && (
            <MiniLinje label="Beholdning bagefter" vaerdi={
              <b className={forhaandsvisning < 0 ? "fc-bad" : ""}>
                {num(forhaandsvisning)} {bevaegelse.enhed}
              </b>} />
          )}
          {forhaandsvisning !== null && forhaandsvisning < 0 && (
            <p className="fc-hint">
              Det giver en beholdning under nul. <b>Det spærres ikke</b> — det
              skete jo. Men det betyder at der mangler en bevægelse, og svaret
              er en optælling.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
