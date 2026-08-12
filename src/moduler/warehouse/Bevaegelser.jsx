/* src/moduler/warehouse/Bevaegelser.jsx
 * Warehouse – bevægelser: modtag, sæt på plads, flyt, pluk, afsend.
 *
 * ⚠ SKÆRMEN SKRIVER IKKE. Hver bevægelse går gennem `bevaegelseskriv`, fordi
 * bevægelsen og saldoen på en eller to pladser skal lande sammen eller slet
 * ikke — og fordi et lagertal der kan rettes i hånden, gør en optælling
 * meningsløs. Se functions/index.js.
 *
 * ⚠ FORMULAREN VISER KUN DE FELTER ARTEN BRUGER. En modtagelse kommer ikke
 * FRA en plads, og en afsendelse går ikke TIL en. Stod begge felter der altid,
 * ville nogen udfylde dem — og serveren ville afvise med en besked om noget
 * der lignede en fejl i systemet frem for i indtastningen.
 *
 * ⚠ DÆKNINGEN VISES FØR DER TRYKKES. Beholdningen på fra-pladsen står ved
 * siden af mængden, så den der plukker, kan se at der ikke er nok INDEN han
 * sender. Serveren afgør stadig — se noten om vinduet i functions/index.js.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, datoTid } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular,
  Henter, Datatilstand, Tom, Ikon, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import { pladsnavn } from "../../fleet/turtlebooking.js";
import {
  BEVAEGELSE_ART, ALLE_BEVAEGELSE_ARTER, ABSOLUTTE_ARTER,
  ENHED, SPORING, PLADS_STATUS, kanPlukkesFra,
  MAENGDE_SKALA, maengdeFraTal, talFraMaengde,
  valideBevaegelse, beholdningsNoegle, UDEN_BATCH,
} from "../../fleet/warehouse.js";
import { skrivBevaegelse } from "../../fleet/lager.js";
import {
  DEMO_VARER, DEMO_REOLPLADSER, DEMO_BEHOLDNING,
} from "../../fleet/demo-lager.js";

const tomForm = () => ({
  art: "modtag", vareId: "", antal: "", fraPladsId: "", tilPladsId: "",
  batch: "", serienummer: "", reference: "", note: "",
});

export default function Bevaegelser() {
  const { bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.bevaegelserSkriv);

  const [f, saetF] = useState(tomForm);
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);
  const [filter, saetFilter] = useState("");

  const { data: bevaegelser, tilstand, genindlaes, henter } = useListe("bevaegelser", {
    division: "alle", graense: 500, demo: [],
    sorter: (a, b) => (b.tidspunktMs || 0) - (a.tidspunktMs || 0),
  });
  const { data: varer } = useListe("varer", {
    division: "alle", graense: 2000, demo: DEMO_VARER,
    sorter: (a, b) => (a.varenummer || "").localeCompare(b.varenummer || "", "da"),
  });
  const { data: pladser } = useListe("reolpladser", {
    division: "alle", graense: 2000, demo: DEMO_REOLPLADSER,
    sorter: (a, b) => pladsnavn(a).localeCompare(pladsnavn(b), "da"),
  });
  const { data: beholdning, genindlaes: genindlaesBeholdning } = useListe("beholdning", {
    division: "alle", graense: 5000, demo: DEMO_BEHOLDNING,
  });

  if (henter) return <Henter hvad="bevægelserne" />;

  const vare = varer.find((v) => v.id === f.vareId) || null;
  const art = BEVAEGELSE_ART[f.art];
  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const vareMap = Object.fromEntries(varer.map((v) => [v.id, v]));

  const saet = (felt) => (v) => {
    saetF((x) => {
      const ny = { ...x, [felt]: v };
      /* ⚠ SKIFTER ARTEN, RYDDES DE FELTER DEN IKKE BRUGER. Ellers ville et
         fra-felt fra en tidligere flytning følge med ind i en modtagelse, og
         serveren ville afvise noget brugeren ikke kunne se. */
      if (felt === "art") {
        const a = BEVAEGELSE_ART[v];
        if (!a?.kraeverFra) ny.fraPladsId = "";
        if (!a?.kraeverTil) ny.tilPladsId = "";
      }
      /* Skifter varen, holder en batch fra en anden vare ikke. */
      if (felt === "vareId") { ny.batch = ""; ny.serienummer = ""; }
      return ny;
    });
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const antalSkaleret = f.antal === "" ? NaN : maengdeFraTal(f.antal);
  const post = {
    art: f.art, vareId: f.vareId, kundeId: vare?.kundeId || "",
    antal: Number.isFinite(antalSkaleret) ? antalSkaleret : undefined,
    fraPladsId: f.fraPladsId || null,
    tilPladsId: f.tilPladsId || null,
    batch: f.batch || null, serienummer: f.serienummer || null,
    reference: f.reference || null, note: f.note || null,
  };
  const fejl = valideBevaegelse(post, { vare });
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0 && !!vare;

  /* ⚠ DÆKNINGEN, VIST FØR DER TRYKKES. Serveren afgør — det her er for at
     brugeren ikke sender noget han kan se ikke går. */
  const fraNoegle = f.fraPladsId && f.vareId
    ? beholdningsNoegle(f.fraPladsId, f.vareId, f.batch || UDEN_BATCH)
    : null;
  const paaFra = fraNoegle
    ? (beholdning.find((b) => b.id === fraNoegle)?.antal ?? 0)
    : null;
  const utilstraekkeligt = paaFra != null && Number.isFinite(antalSkaleret) &&
    !ABSOLUTTE_ARTER.includes(f.art) && antalSkaleret > paaFra;

  const fraSpaerret = f.fraPladsId && !kanPlukkesFra(pladsMap[f.fraPladsId]);
  const tilLukket = f.tilPladsId && pladsMap[f.tilPladsId]?.status === "lukket";

  const send = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const r = await skrivBevaegelse({
      art: f.art, vareId: f.vareId, antal: antalSkaleret,
      fraPladsId: f.fraPladsId, tilPladsId: f.tilPladsId,
      batch: f.batch, serienummer: f.serienummer,
      reference: f.reference, note: f.note,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) {
      /* Arten og pladserne bliver stående: den der modtager tyve paller,
         skal ikke vælge det samme tyve gange. */
      saetF((x) => ({ ...x, antal: "", batch: "", serienummer: "", note: "" }));
      saetRoert({});
      saetVisAlle(false);
      genindlaes();
      genindlaesBeholdning();
    }
  };

  const viste = bevaegelser.filter((b) => !filter || b.art === filter);
  const nu = Date.now();
  const iDag = bevaegelser.filter((b) => nu - (b.tidspunktMs || 0) < 86400000);
  const negative = beholdning.filter((b) => (b.antal || 0) < 0);

  const pladsvalg = (kunPlukbare) => pladser
    .filter((p) => !kunPlukbare || kanPlukkesFra(p))
    .map((p) => ({
      vaerdi: p.id,
      label: `${pladsnavn(p)}${p.zone ? ` · ${p.zone}` : ""}${
        p.status && p.status !== "aktiv" ? ` (${PLADS_STATUS[p.status]?.label})` : ""}`,
    }));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Bevægelser i dag" vaerdi={num(iDag.length)}
                 ikon={<Ikon navn="vogn" />} tone="ikon-5" rund />
        <KpiKort label="Ind i dag"
                 vaerdi={num(iDag.filter((b) => ["modtag", "retur"].includes(b.art)).length)}
                 note="modtagelser og returer" />
        <KpiKort label="Ud i dag"
                 vaerdi={num(iDag.filter((b) => b.art === "afsend").length)}
                 note="afsendelser" />
        {/* ⚠ EN NEGATIV SALDO ER ET LAGER DER SKAL TÆLLES — ikke et tal der
            skal rettes. Den må ikke gemmes væk i en log. */}
        <KpiKort label="Negative saldi" vaerdi={num(negative.length)}
                 note={negative.length
                   ? "tæl lokationen op — der mangler en bevægelse"
                   : "beholdningen er hel"} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Registrér bevægelse">
        {!varer.length || !pladser.length ? (
          <Tom>
            Der skal være mindst én <b>vare</b> og én <b>lokation</b>, før der
            kan registreres en bevægelse. Opret dem under Varer og Lokationer.
          </Tom>
        ) : (
          <Formular onGem={send} gemmer={gemmer}
                    kanGemme={kanGemme && maaSkrive && !fraSpaerret && !tilLukket}
                    gemLabel={art ? art.label : "Registrér"} svar={svar}>
            <Feltraekke>
              <Felt id="b-art" label="Handling" kraevet vaerdi={f.art} saet={saet("art")}
                    fejl={vis("art")}
                    valgmuligheder={ALLE_BEVAEGELSE_ARTER.map((a) => ({
                      vaerdi: a, label: BEVAEGELSE_ART[a].label,
                    }))}
                    hint={ABSOLUTTE_ARTER.includes(f.art)
                      ? "⚠ Optælling SÆTTER beholdningen — den lægger ikke til."
                      : undefined} />
              <Felt id="b-vare" label="Vare" kraevet vaerdi={f.vareId} saet={saet("vareId")}
                    fejl={vis("vareId")}
                    valgmuligheder={[{ vaerdi: "", label: "— vælg —" },
                      ...varer.map((v) => ({
                        vaerdi: v.id, label: `${v.varenummer} · ${v.navn}`,
                      }))]} />
              <Felt id="b-antal" label="Mængde" kraevet type="number" step="any"
                    suffiks={vare ? ENHED[vare.enhed]?.label : undefined}
                    vaerdi={f.antal} saet={saet("antal")} fejl={vis("antal")}
                    hint={vare && ENHED[vare.enhed]?.helTal
                      ? "Kan ikke deles."
                      : vare ? "Kan være en brøkdel." : undefined} />
            </Feltraekke>

            <Feltraekke>
              {/* ⚠ KUN DE FELTER ARTEN BRUGER. Se hovedet. */}
              {art?.kraeverFra && (
                <Felt id="b-fra" label="Fra lokation" kraevet vaerdi={f.fraPladsId}
                      saet={saet("fraPladsId")} fejl={vis("fraPladsId")}
                      valgmuligheder={[{ vaerdi: "", label: "— vælg —" }, ...pladsvalg(false)]}
                      hint={paaFra != null && vare
                        ? `Der står ${num(talFraMaengde(paaFra), ENHED[vare.enhed]?.helTal ? 0 : 1)} ${ENHED[vare.enhed]?.label}`
                        : undefined} />
              )}
              {art?.kraeverTil && (
                <Felt id="b-til" label="Til lokation" kraevet vaerdi={f.tilPladsId}
                      saet={saet("tilPladsId")} fejl={vis("tilPladsId")}
                      valgmuligheder={[{ vaerdi: "", label: "— vælg —" }, ...pladsvalg(false)]} />
              )}
            </Feltraekke>

            {(vare?.sporing === "batch" || vare?.sporing === "serie") && (
              <Feltraekke>
                {vare.sporing === "batch" && (
                  <Felt id="b-batch" label="Batch / lot" kraevet vaerdi={f.batch}
                        saet={saet("batch")} fejl={vis("batch")}
                        hint="Bogstaver, tal, bindestreg og underscore — ikke punktum." />
                )}
                {vare.sporing === "serie" && (
                  <Felt id="b-serie" label="Serienummer" kraevet vaerdi={f.serienummer}
                        saet={saet("serienummer")} fejl={vis("serienummer")} />
                )}
              </Feltraekke>
            )}

            <Feltraekke>
              <Felt id="b-ref" label="Reference" vaerdi={f.reference}
                    saet={saet("reference")} fejl={vis("reference")}
                    hint="Fx et PO- eller ordrenummer." />
              <Felt id="b-note" label="Note" vaerdi={f.note} saet={saet("note")}
                    fejl={vis("note")} />
            </Feltraekke>

            {fraSpaerret && (
              <p className="fc-svar fc-svar-fejl" role="alert">
                ⚠ Der kan ikke plukkes fra en plads i{" "}
                {PLADS_STATUS[pladsMap[f.fraPladsId]?.status]?.label.toLowerCase()}.
                Varen dér er under mistanke — den skal frigives først, ikke
                flyttes udenom.
              </p>
            )}
            {tilLukket && (
              <p className="fc-svar fc-svar-fejl" role="alert">
                ⚠ Lokationen er lukket og kan ikke modtage varer.
              </p>
            )}
            {utilstraekkeligt && !fraSpaerret && (
              <p className="fc-svar fc-svar-fejl" role="alert">
                ⚠ Der står kun{" "}
                {num(talFraMaengde(paaFra), ENHED[vare?.enhed]?.helTal ? 0 : 1)}{" "}
                {ENHED[vare?.enhed]?.label} på lokationen. Serveren afviser det
                her — mængden skal ned, eller varen skal findes et andet sted.
              </p>
            )}
            {!maaSkrive && (
              <p className="fc-svar fc-svar-naegtet" role="alert">
                Du mangler {PERM.bevaegelserSkriv}. Serveren afviser — det er
                ikke en fejl.
              </p>
            )}
          </Formular>
        )}
      </Kort>

      <Kort titel={`Seneste bevægelser (${num(viste.length)})`}>
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="bf-art">Handling</label>
            <select id="bf-art" value={filter} onChange={(e) => saetFilter(e.target.value)}>
              <option value="">Alle handlinger</option>
              {ALLE_BEVAEGELSE_ARTER.map((a) => (
                <option key={a} value={a}>{BEVAEGELSE_ART[a].label}</option>
              ))}
            </select>
          </div>
        </div>

        <Tabel
          kolonner={[
            { key: "tid", label: "Tidspunkt",
              render: (b) => <span className="fc-hint">{datoTid(b.tidspunktMs)}</span> },
            { key: "art", label: "Handling", render: (b) => (
                <Pille tone={["modtag", "retur"].includes(b.art) ? "ok"
                  : b.art === "afsend" ? "bad"
                  : b.art === "optael" ? "warn" : "info"}>
                  {BEVAEGELSE_ART[b.art]?.label || b.art}
                </Pille>
              ) },
            { key: "vare", label: "Vare", render: (b) => (
                <b>{vareMap[b.vareId]?.varenummer || b.vareId}</b>
              ) },
            { key: "antal", label: "Mængde", num: true, render: (b) => {
                const v = vareMap[b.vareId];
                return `${num(talFraMaengde(b.antal), ENHED[v?.enhed]?.helTal ? 0 : 1)} ${
                  ENHED[v?.enhed]?.label || ""}`;
              } },
            { key: "vej", label: "Fra → til", render: (b) => (
                <span className="fc-hint">
                  {b.fraPladsId ? pladsnavn(pladsMap[b.fraPladsId]) : "—"}
                  {" → "}
                  {b.tilPladsId ? pladsnavn(pladsMap[b.tilPladsId]) : "—"}
                </span>
              ) },
            { key: "batch", label: "Batch / serie", render: (b) => (
                b.batch || b.serienummer
                  ? <span className="fc-hint">{b.batch || b.serienummer}</span>
                  : <span className="fc-neutral">—</span>
              ) },
            { key: "ref", label: "Reference", render: (b) => (
                b.reference || <span className="fc-neutral">—</span>
              ) },
          ]}
          raekker={viste}
          tom="Der er ikke registreret nogen bevægelser endnu."
        />

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>En bevægelse rettes ikke.</b> Er der registreret for meget,
          registreres en <b>justering</b> med en note — så står begge dele.
          Et lager hvor historikken kan skrives om, kan ikke afstemmes.
        </p>
      </Kort>
    </div>
  );
}
