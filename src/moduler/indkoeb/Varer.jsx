/* src/moduler/indkoeb/Varer.jsx
 * Procure — Varer. Procure TARGET, trin 2 (produktejer-review 2026-09-02).
 *
 * TO TING PÅ ÉN FANE, MED VILJE:
 *
 * 1. DEN GLOBALE VAREMASTER (`indkoebsvarer` + `leverandoervarer`, se
 *    fleet/varer.js) — ÉN vare, flere leverandører, hver sin pris. Frisk
 *    katalog, ingen automatisk migrering fra eksisterende data — se
 *    varer.js's hoved for hvorfor.
 *
 * 2. INDKØBSLINJE-/PRISREGISTRERINGEN — FLYTTET HERTIL, UÆNDRET, FRA
 *    Oversigt.jsx (Procure TARGET trin 1, samme review). Formular, tabel,
 *    validering og skrivevej (`indkoeb`-noden, `gem()`) er PRÆCIS den
 *    samme kode — kun UI'ets kanoniske hjem er flyttet, fordi det ER en
 *    vare-handling, og Overblik skulle være en statusskærm, ikke et
 *    dashboard fyldt med parallelle analyseområder.
 *
 * ⚠ IKKE DET SAMME SOM Varelager.jsx (`/indkoeb/varelager`, skjulINav).
 * Det er Procures EGEN forbrugsvarebeholdning (handsker, strækfilm — se dens
 * hoved). Denne fane er et KATALOG + LEVERANDØRPRISER, ikke en beholdning.
 * Et link nederst peger på Varelager for den der leder efter beholdningen.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import {
  kr, num, dato, oereFraKroner, kronerFraOere, iDagIso, isoTilMs, msTilIso,
} from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Knap, Sider, Dialog,
  Felt, Feltraekke, Formular, Formularsvar, MiniLinje, ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  VARE_KATEGORI, VALUTA, ALLE_VALUTAER, valideVare, byggVare,
  valideLeverandoerVare, byggLeverandoerVare, gaeldendeRelationer, evidensForVare,
} from "../../fleet/varer.js";
import {
  LEVERANDOER_KATEGORI, leverandoerNavn, valideIndkoeb, byggIndkoeb, indkoebBeloebOere,
} from "../../fleet/leverandoerer.js";
import { FAKTURASTATUS } from "../../fleet/leverandoerer.js";
import { PROCURE_FANER } from "../../fleet/modulfaner.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import { DEMO_LEVERANDOERER, DEMO_INDKOEBSLINJER } from "../../fleet/demo-indkoeb.js";
import { DEMO_LOKATIONER } from "../../fleet/demo-facility.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";

const PR_SIDE = 5;

/* ---- Registrér indkøb — UÆNDRET fra Oversigt.jsx (kun flyttet) --------- */

const tomLinje = () => ({
  datoIso: iDagIso(), leverandoerId: "",
  vare: "", varenummer: "", antal: "", enhed: "stk",
  prisKr: "", momsKr: "", kategori: "reservedele", fakturastatus: "mangler",
  reference: "", formaal: "", koeretoejId: "", lokationId: "",
});

const fraLinje = (l) => ({
  ...tomLinje(),
  datoIso: msTilIso(l.dato), leverandoerId: l.leverandoerId,
  vare: l.vare ?? "", varenummer: l.varenummer ?? "",
  antal: l.antal ?? "", enhed: l.enhed ?? "stk",
  prisKr: kronerFraOere(l.prisPrEnhedOere),
  momsKr: Number.isFinite(l.momsOere) ? kronerFraOere(l.momsOere) : "",
  kategori: l.kategori, fakturastatus: l.fakturastatus,
  reference: l.reference ?? "", formaal: l.formaal ?? "",
  koeretoejId: l.koeretoejId ?? "", lokationId: l.lokationId ?? "",
});

function Indkoebsformular({ linje, leverandoerer, koeretoejer, lokationer, sti, paaGemt, paaLuk }) {
  const nyt = !linje;
  const [f, saetF] = useState(() => (linje ? fraLinje(linje) : tomLinje()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const medMs = { ...f, dato: isoTilMs(f.datoIso) };
  const fejl = valideIndkoeb(medMs, { leverandoerer, koeretoejer, lokationer });
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  const oere = oereFraKroner(f.prisKr);
  const linjeSum = Number.isFinite(oere) && Number(f.antal) > 0 ? oere * Number(f.antal) : null;

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = linje?.id || nyId("il");
    const r = await gem({
      sti: sti(id), data: byggIndkoeb(medMs), foer: linje || null,
      objekt: "indkoeb", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt(id);
  };

  return (
    <Kort titel={nyt ? "Registrér indkøb" : `Redigér ${linje.vare}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Registrér indkøb" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="ik-dato" label="Dato" kraevet type="date" vaerdi={f.datoIso}
                saet={saet("datoIso")} fejl={vis("dato")} />
          <Felt id="ik-lev" label="Leverandør" kraevet vaerdi={f.leverandoerId}
                saet={saet("leverandoerId")} fejl={vis("leverandoerId")}
                hint="En entitet, ikke en fritekst — så navnet ikke får tre stavemåder."
                valgmuligheder={[{ vaerdi: "", label: "Vælg …" },
                  ...leverandoerer
                    .filter((l) => l.aktiv !== false || l.id === f.leverandoerId)
                    .map((l) => ({ vaerdi: l.id, label: l.navn }))]} />
        </Feltraekke>
        <Feltraekke>
          <Felt id="ik-vare" label="Vare" kraevet vaerdi={f.vare} saet={saet("vare")}
                fejl={vis("vare")} />
          <Felt id="ik-varenr" label="Varenummer" vaerdi={f.varenummer}
                saet={saet("varenummer")} fejl={vis("varenummer")}
                hint="Bruges til at måle prisafvigelsen mod den aftalte pris." />
          <Felt id="ik-kat" label="Kategori" kraevet vaerdi={f.kategori} saet={saet("kategori")}
                fejl={vis("kategori")}
                valgmuligheder={Object.entries(LEVERANDOER_KATEGORI)
                  .map(([v, l]) => ({ vaerdi: v, label: l }))} />
        </Feltraekke>
        <Feltraekke>
          <Felt id="ik-antal" label="Antal" kraevet type="number" step="any"
                vaerdi={f.antal} saet={saet("antal")} fejl={vis("antal")} />
          <Felt id="ik-enhed" label="Enhed" vaerdi={f.enhed} saet={saet("enhed")}
                fejl={vis("enhed")} />
          <Felt id="ik-pris" label="Pris pr. enhed" kraevet suffiks="kr"
                vaerdi={f.prisKr} saet={saet("prisKr")} fejl={vis("prisKr")}
                hint="Ekskl. moms. Brug KOMMA som decimaltegn — punktum er tusindtalsseparator på dansk." />
          <Felt id="ik-moms" label="Moms" suffiks="kr" vaerdi={f.momsKr}
                saet={saet("momsKr")} fejl={vis("momsKr")}
                hint="Står for sig. Beløbet ovenfor er altid ekskl." />
        </Feltraekke>
        {linjeSum !== null && (
          <p className="fc-hint" style={{ marginTop: 4 }}>
            Linjen bliver <b>{kr(linjeSum)}</b> ekskl. moms —{" "}
            {num(Number(f.antal))} × {kr(oere, 2)}. Beløbet <b>beregnes</b> og
            gemmes ikke.
          </p>
        )}
        <Feltraekke>
          <Felt id="ik-status" label="Fakturastatus" kraevet vaerdi={f.fakturastatus}
                saet={saet("fakturastatus")} fejl={vis("fakturastatus")}
                valgmuligheder={Object.entries(FAKTURASTATUS)
                  .map(([v, s]) => ({ vaerdi: v, label: s.label }))} />
          <Felt id="ik-ref" label="Reference" vaerdi={f.reference} saet={saet("reference")}
                fejl={vis("reference")}
                hint="LEVERANDØRENS nummer — det man slår op i når man ringer, og det der står på fakturaen." />
        </Feltraekke>
        <Feltraekke>
          <Felt id="ik-bil" label="Enhed" vaerdi={f.koeretoejId} saet={saet("koeretoejId")}
                fejl={vis("koeretoejId")}
                valgmuligheder={[{ vaerdi: "", label: "Ingen" },
                  ...koeretoejer.map((k2) => ({ vaerdi: k2.id, label: k2.kaldenavn || k2.navn }))]} />
          <Felt id="ik-lok" label="Lokation" vaerdi={f.lokationId} saet={saet("lokationId")}
                fejl={vis("lokationId")}
                valgmuligheder={[{ vaerdi: "", label: "Ingen" },
                  ...lokationer.map((l) => ({ vaerdi: l.id, label: l.navn }))]} />
          <Felt id="ik-formaal" label="Formål" vaerdi={f.formaal} saet={saet("formaal")}
                fejl={vis("formaal")} hint="Hvorfor blev det købt?" />
        </Feltraekke>
      </Formular>
      <p className="fc-hint" style={{ marginTop: 14 }}>
        ⚠ <b>Prisen indtastes i kroner og gemmes som hele øre.</b> 18,50 kr/stk
        bliver til <code>1850</code>. Reglerne afviser en pris der ikke er
        hele øre — beslutning 2.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        <b>Godkendelse sker ikke her.</b> En faktura godkendes og afstemmes i{" "}
        <Link className="fc-a" to="/indkoeb/fakturaer">Match &amp; kontantkøb</Link>.
      </p>
    </Kort>
  );
}

/* ---- Varemasteren ------------------------------------------------------ */

const TOM_VARE = { navn: "", kategori: "reservedele", standardenhed: "stk", aktiv: true };
const TOM_RELATION = {
  leverandoerId: "", leverandoerVarenummer: "", prisKr: "", valuta: VALUTA.DKK,
  mindsteantal: "", gyldigFraIso: iDagIso(), aktiv: true,
};

export default function Varer() {
  const { bruger, path } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.indkoebSkriv);

  const varer = useListe("indkoebsvarer", { ordnPaa: "navn", vindue: "alle", graense: 500 });
  const relationer = useListe("leverandoervarer", { vindue: "alle", graense: 1000 });
  const leverandoerer = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });
  const historik = useListe("indkoeb", {
    ordnPaa: "dato", vindueDage: 400, graense: 500, demo: DEMO_INDKOEBSLINJER,
  });
  const koeretoejer = useListe("koeretoejer", { vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER });
  const lokationer = useListe("facility/lokationer", { vindue: "alle", graense: 200, demo: DEMO_LOKATIONER });

  const [sog, setSog] = useState("");
  const [kategoriFilter, setKategoriFilter] = useState("");
  const [valgtVareId, setValgtVareId] = useState(null);
  const [vareform, setVareform] = useState(null);
  const [udkastVare, setUdkastVare] = useState(TOM_VARE);
  const [relationform, setRelationform] = useState(null);
  const [udkastRelation, setUdkastRelation] = useState(TOM_RELATION);
  const [svar, setSvar] = useState(null);
  const [arbejder, setArbejder] = useState(false);
  const [linjeform, setLinjeform] = useState(null);
  const [side, setSide] = useState(1);

  const henterNoget = varer.henter || relationer.henter || leverandoerer.henter;
  if (henterNoget) return <Henter hvad="varer" />;
  if (blokerer(varer.tilstand)) {
    return <Datatilstand tilstand={varer.tilstand} genprov={varer.genindlaes} />;
  }

  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);

  const viste = varer.data.filter((v) =>
    (!sog || v.navn.toLowerCase().includes(sog.toLowerCase()))
    && (!kategoriFilter || v.kategori === kategoriFilter));

  const antalLeverandoerer = (vareId) =>
    new Set(relationer.data.filter((r) => r.indkoebsVareId === vareId && r.aktiv !== false).map((r) => r.leverandoerId)).size;
  const laveste = (vareId) => {
    const g = gaeldendeRelationer(vareId, relationer.data);
    return g.length ? g[0] : null;
  };

  const valgtVare = varer.data.find((v) => v.id === valgtVareId) || null;
  const relationerForValgt = valgtVareId
    ? relationer.data.filter((r) => r.indkoebsVareId === valgtVareId).sort((a, b) => (b.gyldigFra || 0) - (a.gyldigFra || 0))
    : [];
  const evidens = valgtVare ? evidensForVare(valgtVare, historik.data) : null;

  const koer = async (fn) => {
    setArbejder(true);
    const r = await fn();
    setSvar(r);
    setArbejder(false);
    return r;
  };

  const gemVare = () => koer(async () => {
    const fejl = valideVare(udkastVare);
    if (Object.keys(fejl).length) {
      return { ok: false, art: "afvist", besked: Object.values(fejl)[0], data: null };
    }
    const id = vareform === "ny" ? nyId("va") : vareform;
    const r = await gem({
      sti: path(`indkoebsvarer/${id}`), data: byggVare(udkastVare),
      foer: vareform === "ny" ? null : valgtVare,
      objekt: "indkoeb", objektId: id,
      handling: vareform === "ny" ? AUDIT.opret : AUDIT.aendre,
    });
    if (r.ok) { setVareform(null); varer.genindlaes(); setValgtVareId(id); }
    return r;
  });

  const gemRelation = () => koer(async () => {
    const post = {
      indkoebsVareId: valgtVareId,
      leverandoerId: udkastRelation.leverandoerId,
      leverandoerVarenummer: udkastRelation.leverandoerVarenummer || undefined,
      prisOere: oereFraKroner(udkastRelation.prisKr),
      valuta: udkastRelation.valuta,
      mindsteantal: udkastRelation.mindsteantal === "" ? undefined : Number(udkastRelation.mindsteantal),
      gyldigFra: isoTilMs(udkastRelation.gyldigFraIso),
      aktiv: udkastRelation.aktiv,
    };
    const fejl = valideLeverandoerVare(post, { varer: varer.data, leverandoerer: leverandoerer.data });
    if (Object.keys(fejl).length) {
      return { ok: false, art: "afvist", besked: Object.values(fejl)[0], data: null };
    }
    const id = relationform === "ny" ? nyId("lva") : relationform;
    const eksisterende = relationerForValgt.find((r) => r.id === relationform);
    const r = await gem({
      sti: path(`leverandoervarer/${id}`), data: byggLeverandoerVare(post),
      foer: relationform === "ny" ? null : eksisterende,
      objekt: "indkoeb", objektId: id,
      handling: relationform === "ny" ? AUDIT.opret : AUDIT.aendre,
    });
    if (r.ok) { setRelationform(null); relationer.genindlaes(); }
    return r;
  });

  const aabnRetVare = (v) => {
    setVareform(v.id);
    setUdkastVare({ navn: v.navn, kategori: v.kategori, standardenhed: v.standardenhed, aktiv: v.aktiv !== false });
    setSvar(null);
  };
  const aabnNyRelation = () => {
    setRelationform("ny");
    setUdkastRelation(TOM_RELATION);
    setSvar(null);
  };

  /* ⚠ HELE ØRE, IKKE FLOAT — samme oversættelse som Indkoebsformular. */
  const sider = Math.max(1, Math.ceil(historik.data.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const historikPaaSiden = historik.data.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={PROCURE_FANER} />

      <Kort
        titel={`Varekatalog (${num(viste.length)})`}
        handling={maaSkrive && (
          <Knap variant="primaer" onClick={() => { setVareform("ny"); setUdkastVare(TOM_VARE); setSvar(null); }}>
            Ny vare
          </Knap>
        )}
      >
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="v-sog">Søg</label>
            <input id="v-sog" type="search" value={sog} onChange={(e) => setSog(e.target.value)}
                   placeholder="Varens navn …" />
          </div>
          <div className="fc-felt">
            <label htmlFor="v-kat">Kategori</label>
            <select id="v-kat" value={kategoriFilter} onChange={(e) => setKategoriFilter(e.target.value)}>
              <option value="">Alle kategorier</option>
              {Object.entries(VARE_KATEGORI).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <Tabel
          raekker={viste}
          tom={varer.data.length ? "Ingen varer passer på filtrene." : "Ingen varer i kataloget endnu. Opret den første med Ny vare."}
          paaRaekke={(v) => setValgtVareId(v.id)}
          erValgt={(v) => v.id === valgtVareId}
          kolonner={[
            { key: "navn", label: "Vare", render: (v) => <b>{v.navn}</b> },
            { key: "kategori", label: "Kategori", render: (v) => VARE_KATEGORI[v.kategori] || v.kategori },
            { key: "enhed", label: "Enhed", render: (v) => v.standardenhed },
            { key: "lev", label: "Leverandører", num: true, render: (v) => num(antalLeverandoerer(v.id)) },
            { key: "pris", label: "Laveste pris", num: true, render: (v) => {
                const l = laveste(v.id);
                return l ? kr(l.prisOere) : <span className="fc-hint">Ingen pris endnu</span>;
              } },
            { key: "status", label: "Status", render: (v) => (
                v.aktiv === false ? <Pille tone="bad">Inaktiv</Pille> : <Pille tone="ok">Aktiv</Pille>
              ) },
          ]}
        />
      </Kort>

      {valgtVare && (
        <Kort
          titel={`${valgtVare.navn} — leverandører & priser`}
          handling={maaSkrive && (
            <span className="fc-knapper">
              <Knap onClick={() => aabnRetVare(valgtVare)}>Ret vare</Knap>
              <Knap variant="primaer" onClick={aabnNyRelation}>Tilføj leverandørpris</Knap>
            </span>
          )}
        >
          {evidens && (
            <p className="fc-hint" style={{ marginTop: 0 }}>
              ⚠ <b>Til orientering, ikke koblet automatisk:</b> indkøbshistorikken
              viser {lvNavn(evidens.leverandoerId)} som seneste leverandør af
              noget der matcher navnet "{valgtVare.navn}"
              {Number.isInteger(evidens.prisPrEnhedOere) ? `, til ${kr(evidens.prisPrEnhedOere)}` : ""}
              {evidens.sidstKoebtMs ? ` (sidst købt ${dato(evidens.sidstKoebtMs)})` : ""}.
              {" "}Match på {evidens.grundlag === "varenummer" ? "varenummer" : "varenavn — kontrollér at det er den rigtige vare"}.
            </p>
          )}
          <Tabel
            raekker={relationerForValgt}
            tom="Ingen leverandørpriser registreret endnu."
            kolonner={[
              { key: "lev", label: "Leverandør", render: (r) => <b>{lvNavn(r.leverandoerId)}</b> },
              { key: "nr", label: "Leverandørens varenr.",
                render: (r) => r.leverandoerVarenummer || <span className="fc-hint">—</span> },
              { key: "pris", label: "Pris", num: true, render: (r) => `${kr(r.prisOere)} ${r.valuta}` },
              { key: "min", label: "Mindsteantal", num: true,
                render: (r) => Number.isFinite(r.mindsteantal) ? num(r.mindsteantal) : <span className="fc-hint">—</span> },
              { key: "gyldig", label: "Gyldig fra", render: (r) => dato(r.gyldigFra) },
              { key: "status", label: "Status", render: (r) => (
                  r.aktiv === false ? <Pille tone="bad">Inaktiv</Pille> : <Pille tone="ok">Aktiv</Pille>
                ) },
              { key: "h", label: "", render: (r) => (
                  maaSkrive ? <Knap onClick={() => {
                    setRelationform(r.id);
                    setUdkastRelation({
                      leverandoerId: r.leverandoerId,
                      leverandoerVarenummer: r.leverandoerVarenummer || "",
                      prisKr: kronerFraOere(r.prisOere), valuta: r.valuta || VALUTA.DKK,
                      mindsteantal: Number.isFinite(r.mindsteantal) ? String(r.mindsteantal) : "",
                      gyldigFraIso: msTilIso(r.gyldigFra), aktiv: r.aktiv !== false,
                    });
                    setSvar(null);
                  }}>Ret</Knap> : null
                ) },
            ]}
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            En ny pris er en NY række — samme princip som leverandørernes egen
            prisliste. Den gældende er den seneste "Gyldig fra" der ikke ligger i fremtiden.
          </p>
        </Kort>
      )}

      {vareform && (
        <Dialog
          titel={vareform === "ny" ? "Ny vare" : `Ret ${valgtVare?.navn}`}
          onLuk={() => setVareform(null)}
          handling={<Knap variant="primaer" disabled={arbejder} onClick={gemVare}>Gem</Knap>}
        >
          <Felt id="vv-navn" label="Navn" kraevet vaerdi={udkastVare.navn}
                saet={(v) => setUdkastVare({ ...udkastVare, navn: v })} />
          <Feltraekke>
            <Felt id="vv-kat" label="Kategori" kraevet vaerdi={udkastVare.kategori}
                  saet={(v) => setUdkastVare({ ...udkastVare, kategori: v })}
                  valgmuligheder={Object.entries(VARE_KATEGORI).map(([v, l]) => ({ vaerdi: v, label: l }))} />
            <Felt id="vv-enhed" label="Standardenhed" kraevet vaerdi={udkastVare.standardenhed}
                  saet={(v) => setUdkastVare({ ...udkastVare, standardenhed: v })} />
          </Feltraekke>
          <Felt id="vv-aktiv" label="Status"
                vaerdi={udkastVare.aktiv ? "aktiv" : "inaktiv"}
                saet={(v) => setUdkastVare({ ...udkastVare, aktiv: v === "aktiv" })}
                valgmuligheder={[{ vaerdi: "aktiv", label: "Aktiv" }, { vaerdi: "inaktiv", label: "Inaktiv" }]} />
          <Formularsvar svar={svar} okTekst="Gemt." />
        </Dialog>
      )}

      {relationform && (
        <Dialog
          titel={relationform === "ny" ? `Ny leverandørpris — ${valgtVare?.navn}` : `Ret leverandørpris — ${valgtVare?.navn}`}
          onLuk={() => setRelationform(null)}
          handling={<Knap variant="primaer" disabled={arbejder} onClick={gemRelation}>Gem</Knap>}
        >
          <Felt id="rv-lev" label="Leverandør" kraevet vaerdi={udkastRelation.leverandoerId}
                saet={(v) => setUdkastRelation({ ...udkastRelation, leverandoerId: v })}
                valgmuligheder={[{ vaerdi: "", label: "Vælg …" },
                  ...leverandoerer.data.filter((l) => l.aktiv !== false || l.id === udkastRelation.leverandoerId)
                    .map((l) => ({ vaerdi: l.id, label: l.navn }))]} />
          <Feltraekke>
            <Felt id="rv-nr" label="Leverandørens varenr." vaerdi={udkastRelation.leverandoerVarenummer}
                  saet={(v) => setUdkastRelation({ ...udkastRelation, leverandoerVarenummer: v })} />
            <Felt id="rv-min" label="Mindsteantal" type="number" vaerdi={udkastRelation.mindsteantal}
                  saet={(v) => setUdkastRelation({ ...udkastRelation, mindsteantal: v })} />
          </Feltraekke>
          <Feltraekke>
            <Felt id="rv-pris" label="Pris" kraevet suffiks={udkastRelation.valuta} vaerdi={udkastRelation.prisKr}
                  saet={(v) => setUdkastRelation({ ...udkastRelation, prisKr: v })}
                  hint="Ekskl. moms, hele kroner/øre — komma som decimaltegn." />
            <Felt id="rv-valuta" label="Valuta" kraevet vaerdi={udkastRelation.valuta}
                  saet={(v) => setUdkastRelation({ ...udkastRelation, valuta: v })}
                  valgmuligheder={ALLE_VALUTAER.map((v) => ({ vaerdi: v, label: v }))} />
          </Feltraekke>
          <Felt id="rv-gyldig" label="Gyldig fra" kraevet type="date" vaerdi={udkastRelation.gyldigFraIso}
                saet={(v) => setUdkastRelation({ ...udkastRelation, gyldigFraIso: v })}
                hint="En ny pris er en ny post, ikke en rettelse af den gamle." />
          <MiniLinje label="Vare" vaerdi={valgtVare?.navn} />
          <Formularsvar svar={svar} okTekst="Gemt." />
        </Dialog>
      )}

      {/* ================= Registrér indkøb (flyttet fra Overblik) ================= */}
      {linjeform && (
        <Indkoebsformular
          key={linjeform}
          linje={linjeform === "ny" ? null : historik.data.find((l) => l.id === linjeform)}
          leverandoerer={leverandoerer.data}
          koeretoejer={koeretoejer.data}
          lokationer={lokationer.data}
          sti={(id) => path(`indkoeb/${id}`)}
          paaGemt={() => { setLinjeform(null); historik.genindlaes(); }}
          paaLuk={() => setLinjeform(null)}
        />
      )}

      <Kort
        titel={`Registrér indkøb (${num(historik.data.length)})`}
        handling={
          <Knap variant="primaer" disabled={!maaSkrive}
                onClick={() => setLinjeform("ny")}
                title={maaSkrive ? "Registrér et indkøb."
                                 : `Kræver ${PERM.indkoebSkriv} — serveren afviser.`}>
            Registrér indkøb
          </Knap>
        }
      >
        <Tabel
          kolonner={[
            { key: "dato", label: "Dato", render: (r) => dato(r.dato) },
            { key: "leverandoerId", label: "Leverandør",
              render: (r) => <b>{lvNavn(r.leverandoerId)}</b> },
            { key: "vare", label: "Vare", render: (r) => (
                <>
                  <b>{r.vare}</b>
                  {r.varenummer && <div className="fc-hint">{r.varenummer}</div>}
                </>
              ) },
            { key: "kategori", label: "Kategori", render: (r) => LEVERANDOER_KATEGORI[r.kategori] },
            { key: "beloeb", label: "Beløb", num: true, render: (r) => kr(indkoebBeloebOere(r)) },
            { key: "fakturastatus", label: "Status",
              render: (r) => <Pille tone={FAKTURASTATUS[r.fakturastatus]?.pill}>{FAKTURASTATUS[r.fakturastatus]?.label}</Pille> },
            { key: "h", label: "", render: (r) => (
                <Knap onClick={() => setLinjeform(r.id)}>Redigér</Knap>
              ) },
          ]}
          raekker={historikPaaSiden}
          tom="Ingen indkøb registreret endnu."
        />
        <div className="fc-row" style={{ marginTop: 12, gap: 12, flexWrap: "wrap" }}>
          <p className="fc-hint" style={{ margin: 0 }}>
            Viser {num(historikPaaSiden.length)} af {num(historik.data.length)}.
          </p>
          <Sider side={nuSide} antal={historik.data.length} prSide={PR_SIDE} saet={setSide} />
        </div>
        {historik.afkortet && (
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Der er flere end de hentede. Listen er <b>afkortet</b>.
          </p>
        )}
      </Kort>

      <p className="fc-hint">
        Leder du efter <b>egne forbrugsvarer</b> (beholdning, minimum og
        bevægelser) frem for et katalog og leverandørpriser? Se{" "}
        <Link className="fc-a" to="/indkoeb/varelager">Varelager</Link>.
      </p>
    </div>
  );
}
