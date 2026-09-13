/* src/moduler/warehouse/Varer.jsx
 * Warehouse – varekartotek.
 *
 * WAREHOUSE rummer både kundegods og virksomhedens egne lagerførte varer.
 * Ejerforholdet står eksplicit på nye varer; historiske varer uden felt er
 * fortsat kundegods. Egne varer har ingen kunde og går ikke automatisk til
 * afregningsgrundlaget.
 *
 * ⚠ SPORINGEN KAN IKKE LAVES OM BAGUD, og formularen siger det. Får en vare
 * batch et år senere, findes der bevægelser uden — og så kan et tilbagekald
 * ikke svare på hvilke kolli der var i partiet.
 *
 * ⚠ BEHOLDNINGEN VISES, MEN SKRIVES IKKE HERFRA. Den er summen af
 * bevægelserne og ændres kun af den Cloud Function der skriver dem (etape 4).
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, mindst, datoTid } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular,
  Henter, Datatilstand, Tom, Ikon, Sider, KpiKort, KpiRaekke, MiniLinje,
} from "../../fleet/ui.jsx";
import {
  ENHED, ALLE_ENHEDER, SPORING, ALLE_SPORINGER,
  VARE_EJERFORHOLD, ALLE_VARE_EJERFORHOLD, vareEjerforhold,
  BEVAEGELSE_ART,
  MAENGDE_SKALA, talFraMaengde, valideVare, rumfangMm3,
  beholdningPrVare, underMinimum,
} from "../../fleet/warehouse.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import { DEMO_VARER, DEMO_BEHOLDNING } from "../../fleet/demo-lager.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

const PR_SIDE = 12;

const tomVare = () => ({
  ejerforhold: "kunde", kundeId: "", varenummer: "", navn: "", enhed: "stk", sporing: "ingen",
  varegruppe: "", laengdeMm: "", breddeMm: "", hoejdeMm: "", vaegtG: "",
  minimum: "", aktiv: true,
});

/** "" → null, ellers et heltal. Formularfelter er strenge. */
const heltal = (v) => (v === "" || v == null ? null : Math.round(Number(v)));

function Vareformular({ vare, kunder, sti, paaGemt, paaLuk }) {
  const nyt = !vare;
  const [f, saetF] = useState(() => (vare ? { ...tomVare(), ...vare } : tomVare()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v, ...(felt === "ejerforhold" && v === "egen" ? { kundeId: "" } : {}) }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const talfelter = {
    laengdeMm: heltal(f.laengdeMm), breddeMm: heltal(f.breddeMm),
    hoejdeMm: heltal(f.hoejdeMm), vaegtG: heltal(f.vaegtG),
    minimum: heltal(f.minimum),
  };
  /* Tomme felter må ikke tælle som ugyldige tal. */
  const tilPrøve = { ...f, ...Object.fromEntries(
    Object.entries(talfelter).filter(([, v]) => v != null)) };
  for (const [k, v] of Object.entries(talfelter)) if (v == null) delete tilPrøve[k];

  const fejl = valideVare(tilPrøve, { kunder: kunder.map((k) => k.id) });
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  const mm3 = rumfangMm3(talfelter);

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = vare?.id || nyId("v");
    const r = await gem({
      sti: sti(`varer/${id}`),
      data: {
        ejerforhold: f.ejerforhold,
        kundeId: f.ejerforhold === "kunde" ? f.kundeId : null,
        varenummer: f.varenummer.trim(),
        navn: f.navn.trim(),
        enhed: f.enhed,
        sporing: f.sporing,
        varegruppe: f.varegruppe?.trim() || null,
        ...talfelter,
        aktiv: f.aktiv !== false,
      },
      foer: vare || null, objekt: "varer", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <Kort titel={nyt ? "Ny vare" : `Redigér ${vare.varenummer}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret vare" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="v-ejerforhold" label="Ejerforhold" kraevet vaerdi={f.ejerforhold}
                saet={saet("ejerforhold")} fejl={vis("ejerforhold")}
                valgmuligheder={ALLE_VARE_EJERFORHOLD.map((id) => ({
                  vaerdi: id, label: VARE_EJERFORHOLD[id].label,
                }))}
                hint="Afgør ejerskab og om lagerarbejdet kan kundeafregnes." />
          {f.ejerforhold === "kunde" && (
            <Felt id="v-kunde" label="Kunde" kraevet vaerdi={f.kundeId}
                  saet={saet("kundeId")} fejl={vis("kundeId")}
                  valgmuligheder={[{ vaerdi: "", label: "— vælg —" },
                    ...kunder.map((k) => ({ vaerdi: k.id, label: k.navn || k.id }))]}
                  hint="Kunden ejer varen og er modpart på lagerafregningen." />
          )}
          <Felt id="v-nr" label="Varenummer" kraevet vaerdi={f.varenummer}
                saet={saet("varenummer")} fejl={vis("varenummer")}
                hint="Kundens eget nummer. To kunder må gerne bruge det samme." />
          <Felt id="v-navn" label="Navn" kraevet vaerdi={f.navn}
                saet={saet("navn")} fejl={vis("navn")} />
        </Feltraekke>

        <Feltraekke>
          <Felt id="v-enhed" label="Enhed" kraevet vaerdi={f.enhed} saet={saet("enhed")}
                fejl={vis("enhed")}
                valgmuligheder={ALLE_ENHEDER.map((e) => ({
                  vaerdi: e, label: ENHED[e].label,
                }))}
                hint={ENHED[f.enhed]?.helTal
                  ? "Kan ikke deles — en halv findes ikke."
                  : "Kan være en brøkdel."} />
          {/* ⚠ ET VALG, IKKE EN INDSTILLING. */}
          <Felt id="v-sporing" label="Sporing" kraevet vaerdi={f.sporing}
                saet={nyt ? saet("sporing") : undefined} readOnly={!nyt}
                fejl={vis("sporing")}
                valgmuligheder={nyt ? ALLE_SPORINGER.map((s) => ({
                  vaerdi: s, label: SPORING[s].label,
                })) : undefined}
                hint={nyt
                  ? "Kan ikke ændres bagefter — bevægelser uden batch kan ikke få en."
                  : "Kan ikke ændres. Der findes bevægelser der følger valget."} />
          <Felt id="v-gruppe" label="Varegruppe" vaerdi={f.varegruppe}
                saet={saet("varegruppe")} hint="Fri gruppering. Fx Emballage." />
        </Feltraekke>

        <Feltraekke>
          {/* ⚠ MILLIMETER OG GRAM SOM HELTAL. En float ved en volumengrænse
              er en fejl der venter — samme regel som i Flåde. */}
          <Felt id="v-l" label="Længde" type="number" suffiks="mm" vaerdi={f.laengdeMm}
                saet={saet("laengdeMm")} fejl={vis("laengdeMm")} />
          <Felt id="v-b" label="Bredde" type="number" suffiks="mm" vaerdi={f.breddeMm}
                saet={saet("breddeMm")} fejl={vis("breddeMm")} />
          <Felt id="v-h" label="Højde" type="number" suffiks="mm" vaerdi={f.hoejdeMm}
                saet={saet("hoejdeMm")} fejl={vis("hoejdeMm")} />
          <Felt id="v-vaegt" label="Vægt" type="number" suffiks="g" vaerdi={f.vaegtG}
                saet={saet("vaegtG")} fejl={vis("vaegtG")} />
        </Feltraekke>

        <Feltraekke>
          <Felt id="v-min" label="Minimum" type="number" suffiks={ENHED[f.enhed]?.label}
                vaerdi={f.minimum} saet={saet("minimum")} fejl={vis("minimum")}
                hint="Under det her står varen som lav. Tom = ingen grænse." />
        </Feltraekke>

        <p className="fc-hint">
          {mm3
            ? <>Rumfang pr. enhed: <b>{(mm3 / 1e9).toFixed(3)} m³</b>. Bruges af
              volumenkalkulatoren og af lagerprisen pr. m³.</>
            : <>⚠ Uden alle tre mål kan rumfanget ikke regnes — og så kan varen
              ikke afregnes pr. m³. Det er ikke en fejl, men det er en
              begrænsning.</>}
        </p>
      </Formular>
    </Kort>
  );
}

export default function Varer() {
  const { path, bruger } = useFleet();
  const [ny, saetNy] = useState(false);
  const [redigerer, saetRedigerer] = useState(null);
  const [detalje, saetDetalje] = useState(null);
  const [soeg, saetSoeg] = useState("");
  const [ejer, saetEjer] = useState("");
  const [kunde, saetKunde] = useState("");
  const [gruppe, saetGruppe] = useState("");
  const [side, saetSide] = useState(1);

  const maaSkrive = harPerm(bruger?.perms, PERM.varerSkriv);

  const { data: varer, afkortet: varerAfkortet, tilstand, genindlaes, henter } = useListe("varer", {
    graense: 2000, demo: DEMO_VARER,
    sorter: (a, b) => (a.varenummer || "").localeCompare(b.varenummer || "", "da"),
  });
  const { data: beholdning } = useListe("beholdning", {
    graense: 5000, demo: DEMO_BEHOLDNING,
  });
  const { data: bevaegelser } = useListe("bevaegelser", {
    graense: 5000, demo: [], sorter: (a, b) => (b.tidspunktMs || 0) - (a.tidspunktMs || 0),
  });
  const { data: kunder } = useListe("kunder", {
    graense: 500, demo: DEMO_KUNDER,
  });

  if (henter) return <Henter hvad="varekartoteket" />;

  const kundeNavn = (id) => kunder.find((k) => k.id === id)?.navn || id;
  /* ⚠ SUMMERET, IKKE LÆST. Der findes intet totaltal pr. vare. */
  const total = beholdningPrVare(beholdning);
  const lave = underMinimum(varer, beholdning);
  const grupper = [...new Set(varer.map((v) => v.varegruppe).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "da"));

  const q = soeg.trim().toLowerCase();
  const viste = varer.filter((v) =>
    (!ejer || vareEjerforhold(v) === ejer) &&
    (!kunde || v.kundeId === kunde) &&
    (!gruppe || v.varegruppe === gruppe) &&
    (!q || (v.varenummer || "").toLowerCase().includes(q) ||
      (v.navn || "").toLowerCase().includes(q)));

  const sider = Math.max(1, Math.ceil(viste.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const paaSiden = viste.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  const udenMaal = varer.filter((v) => !rumfangMm3(v)).length;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Varer i alt" vaerdi={mindst(varer.length, varerAfkortet)}
                 ikon={<Ikon navn="kasse" />} tone="ikon-5" rund
                 note={`${num(varer.filter((v) => vareEjerforhold(v) === "kunde").length)} kundegods · ${num(varer.filter((v) => vareEjerforhold(v) === "egen").length)} egne`} />
        <KpiKort label="Under minimum" vaerdi={num(lave.length)}
                 note={lave.length
                   ? lave.slice(0, 3).map((r) => r.vare.varenummer).join(", ")
                   : "ingen varer er lave"} />
        {/* ⚠ MÅLER OS SELV. En vare uden mål kan ikke afregnes pr. m³ — og
            tallet falder kun hvis nogen opretter varer uden at måle dem. */}
        <KpiKort label="Uden mål" vaerdi={num(udenMaal)}
                 note="kan ikke afregnes pr. m³" />
        <KpiKort label="Varegrupper" vaerdi={num(grupper.length)} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {ny && (
        <Vareformular kunder={kunder} sti={path}
                      paaLuk={() => saetNy(false)}
                      paaGemt={() => { saetNy(false); genindlaes(); }} />
      )}
      {redigerer && (
        <Vareformular vare={redigerer} kunder={kunder} sti={path}
                      paaLuk={() => saetRedigerer(null)}
                      paaGemt={() => { saetRedigerer(null); genindlaes(); }} />
      )}

      <Kort
        titel={`Varer (${num(viste.length)} af ${num(varer.length)})`}
        handling={
          <Knap variant="primaer" disabled={!maaSkrive}
                onClick={() => saetNy(true)}
                title={!maaSkrive ? `Kræver ${PERM.varerSkriv} — reglerne afviser.` : "Opret en vare."}>
            Ny vare
          </Knap>
        }
      >
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="vf-soeg">Søg</label>
            <input id="vf-soeg" type="search" value={soeg}
                   placeholder="Varenummer eller navn"
                   onChange={(e) => { saetSoeg(e.target.value); saetSide(1); }} />
          </div>
          <div className="fc-felt">
            <label htmlFor="vf-ejer">Ejerforhold</label>
            <select id="vf-ejer" value={ejer}
                    onChange={(e) => { saetEjer(e.target.value); saetSide(1); }}>
              <option value="">Alle ejere</option>
              {ALLE_VARE_EJERFORHOLD.map((id) => (
                <option key={id} value={id}>{VARE_EJERFORHOLD[id].label}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="vf-kunde">Kunde</label>
            <select id="vf-kunde" value={kunde}
                    onChange={(e) => { saetKunde(e.target.value); saetSide(1); }}>
              <option value="">Alle kunder</option>
              {kunder.map((k) => (
                <option key={k.id} value={k.id}>{k.navn || k.id}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="vf-gruppe">Varegruppe</label>
            <select id="vf-gruppe" value={gruppe}
                    onChange={(e) => { saetGruppe(e.target.value); saetSide(1); }}>
              <option value="">Alle grupper</option>
              {grupper.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        {!varer.length ? (
          <Tom handling={<Knap variant="primaer" disabled={!maaSkrive} onClick={() => saetNy(true)}>Opret første vare</Knap>}>
            Varekartoteket er tomt. Opret kundegods eller en af virksomhedens egne varer.
          </Tom>
        ) : (
          <>
            <Tabel
              kolonner={[
                { key: "nr", label: "Varenr.", render: (v) => <b>{v.varenummer}</b> },
                { key: "navn", label: "Navn", render: (v) => v.navn },
                { key: "ejer", label: "Ejer",
                  render: (v) => vareEjerforhold(v) === "egen"
                    ? <Pille tone="info">Egen virksomhed</Pille>
                    : <span className="fc-hint">{kundeNavn(v.kundeId)}</span> },
                { key: "enhed", label: "Enhed", render: (v) => ENHED[v.enhed]?.label || v.enhed },
                { key: "sporing", label: "Sporing", render: (v) => (
                    <Pille tone={v.sporing === "ingen" ? "info" : "ok"}>
                      {SPORING[v.sporing]?.label || v.sporing}
                    </Pille>
                  ) },
                /* ⚠ SUMMEN AF BEHOLDNINGSPOSTERNE — der findes intet gemt
                   totaltal. Se noten i warehouse.js. */
                { key: "antal", label: "På lager", num: true, render: (v) => {
                    const a = total[v.id] || 0;
                    const lav = Number.isInteger(v.minimum) && v.minimum > 0 &&
                      a < v.minimum * MAENGDE_SKALA;
                    return (
                      <span className={lav ? "fc-bad" : undefined}>
                        {num(talFraMaengde(a), ENHED[v.enhed]?.helTal ? 0 : 1)}
                      </span>
                    );
                  } },
                { key: "min", label: "Min.", num: true,
                  render: (v) => (Number.isInteger(v.minimum) && v.minimum > 0
                    ? num(v.minimum)
                    : <span className="fc-neutral">—</span>) },
                { key: "handling", label: "", render: (v) => (
                    <Knap disabled={!maaSkrive} onClick={() => saetRedigerer(v)}>
                      Redigér
                    </Knap>
                  ) },
              ]}
              raekker={paaSiden}
              paaRaekke={(v) => saetDetalje(v)}
              erValgt={(v) => detalje?.id === v.id}
              tom="Ingen varer matcher filteret."
            />
            <Sider side={nuSide} antal={viste.length} prSide={PR_SIDE} saet={saetSide} />
          </>
        )}

        <p className="fc-hint" style={{ marginTop: 10 }}>
          På lager regnes af bevægelserne. Egne varer indgår i lagerarbejdet,
          men ikke automatisk i kundens afregningsgrundlag.
        </p>
      </Kort>

      {detalje && (
        <Kort titel={`${detalje.varenummer} · ${detalje.navn}`}
              handling={<Knap onClick={() => saetDetalje(null)}>Luk detalje</Knap>}>
          <div className="warehouse-overview-grid">
            <div>
              <MiniLinje label="Ejer" vaerdi={vareEjerforhold(detalje) === "egen" ? "Egen virksomhed" : kundeNavn(detalje.kundeId)} />
              <MiniLinje label="Beholdning" vaerdi={`${num(talFraMaengde(total[detalje.id] || 0), ENHED[detalje.enhed]?.helTal ? 0 : 1)} ${ENHED[detalje.enhed]?.label || detalje.enhed}`} />
              <MiniLinje label="Sporing" vaerdi={SPORING[detalje.sporing]?.label || detalje.sporing} />
              <MiniLinje label="Varegruppe" vaerdi={detalje.varegruppe || "Ikke angivet"} />
              <MiniLinje label="Mål" vaerdi={rumfangMm3(detalje) ? `${detalje.laengdeMm} × ${detalje.breddeMm} × ${detalje.hoejdeMm} mm` : "Ikke fuldt opmålt"} />
            </div>
            <div>
              <b>Seneste historik</b>
              <Tabel
                kolonner={[
                  { key: "tid", label: "Tid", render: (b) => datoTid(b.tidspunktMs) },
                  { key: "art", label: "Handling", render: (b) => BEVAEGELSE_ART[b.art]?.label || b.art },
                  { key: "antal", label: "Antal", num: true, render: (b) => num(talFraMaengde(b.antal), ENHED[detalje.enhed]?.helTal ? 0 : 1) },
                  { key: "ref", label: "Reference", render: (b) => b.reference || "—" },
                ]}
                raekker={bevaegelser.filter((b) => b.vareId === detalje.id).slice(0, 8)}
                tom="Der er endnu ingen bevægelser på varen."
              />
            </div>
          </div>
        </Kort>
      )}
    </div>
  );
}
