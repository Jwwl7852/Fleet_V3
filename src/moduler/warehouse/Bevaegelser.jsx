/* src/moduler/warehouse/Bevaegelser.jsx
 * Warehouse – bevægelser: modtag, placér, flyt, pluk, afsend.
 *
 * ⚠ SKÆRMEN SKRIVER IKKE. Hver bevægelse går gennem `bevaegelseskriv`, fordi
 * bevægelsen og saldoen i en eller to beholdere skal lande sammen eller slet
 * ikke — og fordi et lagertal der kan rettes i hånden, gør en optælling
 * meningsløs. Se functions/index.js.
 *
 * ⚠ GODSET LIGGER I EN BEHOLDER, IKKE PÅ EN HYLDE (etape 12). Bevægelserne
 * flytter derfor varer MELLEM beholdere; hylden er beholderens adresse.
 *
 * ⚠ OG PLACERINGEN ER EN ANDEN SLAGS BEVÆGELSE. Den flytter beholderen hen
 * på en hylde og rører hverken vare eller antal — godset skifter ikke mængde
 * af at blive båret et andet sted hen. Formularen skifter derfor helt form,
 * frem for at vise felter der ikke betyder noget for den handling.
 *
 * ⚠ FORMULAREN VISER KUN DE FELTER ARTEN BRUGER. En modtagelse kommer ikke
 * FRA en beholder, og en afsendelse går ikke TIL en. Stod begge felter der
 * altid, ville nogen udfylde dem — og serveren ville afvise med en besked om
 * noget der lignede en fejl i systemet frem for i indtastningen.
 *
 * ⚠ DÆKNINGEN VISES FØR DER TRYKKES. Beholdningen i fra-beholderen står ved
 * siden af mængden, så den der plukker, kan se at der ikke er nok INDEN han
 * sender. Serveren afgør stadig — se noten om vinduet i functions/index.js.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, datoTid } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Felt, Feltraekke, Formular,
  Henter, Datatilstand, Tom, Ikon, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import { pladsnavn } from "../../fleet/unitbooking.js";
import {
  BEVAEGELSE_ART, ALLE_BEVAEGELSE_ARTER, ABSOLUTTE_ARTER,
  ENHED, PLADS_STATUS, kanPlukkesFra,
  maengdeFraTal, talFraMaengde,
  valideBevaegelse, beholdningsNoegle, UDEN_BATCH,
  CARRIER_STATUS, CARRIER_TYPE, kraeverLokation,
} from "../../fleet/warehouse.js";
import { skrivBevaegelse } from "../../fleet/lager.js";
import {
  DEMO_VARER, DEMO_REOLPLADSER, DEMO_BEHOLDNING, DEMO_CARRIERS,
} from "../../fleet/demo-lager.js";

const tomForm = () => ({
  art: "modtag", vareId: "", antal: "",
  fraCarrierId: "", tilCarrierId: "",
  /* Kun placeringen bruger de to: hvilken beholder der sættes hvor. */
  carrierId: "", tilPladsId: "",
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
  const { data: carriers, genindlaes: genindlaesCarriers } = useListe("carriers", {
    division: "alle", graense: 2000, demo: DEMO_CARRIERS,
    sorter: (a, b) => (a.id || "").localeCompare(b.id || "", "da"),
  });

  if (henter) return <Henter hvad="bevægelserne" />;

  const vare = varer.find((v) => v.id === f.vareId) || null;
  const art = BEVAEGELSE_ART[f.art];
  const placering = Boolean(art?.flytterCarrier);
  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const vareMap = Object.fromEntries(varer.map((v) => [v.id, v]));
  const carrierMap = Object.fromEntries(carriers.map((c) => [c.id, c]));

  /* Hylden en beholder står på — spærringen sidder på PLADSEN, ikke på
     beholderen, og skal slås op ét led længere ude efter etape 12. */
  const pladsForCarrier = (id) => pladsMap[carrierMap[id]?.pladsId] || null;

  const saet = (felt) => (v) => {
    saetF((x) => {
      const ny = { ...x, [felt]: v };
      /* ⚠ SKIFTER ARTEN, RYDDES DE FELTER DEN IKKE BRUGER. Ellers ville et
         fra-felt fra en tidligere flytning følge med ind i en modtagelse, og
         serveren ville afvise noget brugeren ikke kunne se. */
      if (felt === "art") {
        const a = BEVAEGELSE_ART[v];
        if (!a?.kraeverFraCarrier) ny.fraCarrierId = "";
        if (!a?.kraeverTilCarrier) ny.tilCarrierId = "";
        /* ⚠ OG EN PLACERING HAR HVERKEN VARE ELLER ANTAL. Blev de stående,
           ville serveren afvise felter brugeren ikke længere kunne se. */
        if (a?.flytterCarrier) {
          ny.vareId = ""; ny.antal = ""; ny.batch = ""; ny.serienummer = "";
        } else {
          ny.carrierId = ""; ny.tilPladsId = "";
        }
      }
      /* Skifter varen, holder en batch fra en anden vare ikke. */
      if (felt === "vareId") { ny.batch = ""; ny.serienummer = ""; }
      return ny;
    });
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const antalSkaleret = f.antal === "" ? NaN : maengdeFraTal(f.antal);
  const post = placering
    ? { art: f.art, carrierId: f.carrierId || null, tilPladsId: f.tilPladsId || null }
    : {
        art: f.art, vareId: f.vareId, kundeId: vare?.kundeId || "",
        antal: Number.isFinite(antalSkaleret) ? antalSkaleret : undefined,
        fraCarrierId: f.fraCarrierId || null,
        tilCarrierId: f.tilCarrierId || null,
        batch: f.batch || null, serienummer: f.serienummer || null,
        reference: f.reference || null, note: f.note || null,
      };
  const fejl = valideBevaegelse(post, { vare });
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0 && (placering || !!vare);

  /* ⚠ DÆKNINGEN, VIST FØR DER TRYKKES. Serveren afgør — det her er for at
     brugeren ikke sender noget han kan se ikke går. */
  const fraNoegle = f.fraCarrierId && f.vareId
    ? beholdningsNoegle(f.fraCarrierId, f.vareId, f.batch || UDEN_BATCH)
    : null;
  const paaFra = fraNoegle
    ? (beholdning.find((b) => b.id === fraNoegle)?.antal ?? 0)
    : null;
  const utilstraekkeligt = paaFra != null && Number.isFinite(antalSkaleret) &&
    !ABSOLUTTE_ARTER.includes(f.art) && antalSkaleret > paaFra;

  /* ⚠ SPÆRRINGEN SIDDER PÅ HYLDEN, IKKE PÅ BEHOLDEREN. Efter etape 12 står
     godset i en carrier, og carrieren står på en plads — karantænen slås
     derfor op ét led længere ude. Uden det kunne den omgås ved at plukke fra
     beholderen frem for fra hylden. En beholder uden plads har ingen hylde at
     arve en spærring fra. */
  const fraPlads = f.fraCarrierId ? pladsForCarrier(f.fraCarrierId) : null;
  const tilPlads = placering
    ? (f.tilPladsId ? pladsMap[f.tilPladsId] : null)
    : (f.tilCarrierId ? pladsForCarrier(f.tilCarrierId) : null);
  const fraSpaerret = Boolean(fraPlads && !kanPlukkesFra(fraPlads));
  const tilLukket = tilPlads?.status === "lukket";
  /* En beholder der er i transit eller opbrugt, kan ikke sættes på en hylde —
     samme invariant som belægningen hviler på. */
  const carrierUdeAfHuset = placering && f.carrierId &&
    !kraeverLokation(carrierMap[f.carrierId]?.status);

  const send = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const r = await skrivBevaegelse(placering
      ? { art: f.art, carrierId: f.carrierId, tilPladsId: f.tilPladsId, note: f.note }
      : {
          art: f.art, vareId: f.vareId, antal: antalSkaleret,
          fraCarrierId: f.fraCarrierId, tilCarrierId: f.tilCarrierId,
          batch: f.batch, serienummer: f.serienummer,
          reference: f.reference, note: f.note,
        });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) {
      /* Arten og beholderne bliver stående: den der modtager tyve paller,
         skal ikke vælge det samme tyve gange. En placering rydder derimod
         beholderen — den er sat, og den næste er en anden. */
      saetF((x) => (placering
        ? { ...x, carrierId: "", note: "" }
        : { ...x, antal: "", batch: "", serienummer: "", note: "" }));
      saetRoert({});
      saetVisAlle(false);
      genindlaes();
      genindlaesBeholdning();
      genindlaesCarriers();
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

  /* ⚠ BEHOLDEREN VISER HVOR DEN STÅR. En liste med tyve carrier-numre og
     intet andet kan ikke bruges af et menneske — og den der plukker, skal
     kunne se om beholderen overhovedet er på lageret. */
  const carriervalg = (kunPaaLager) => carriers
    .filter((c) => !kunPaaLager || kraeverLokation(c.status))
    .map((c) => ({
      vaerdi: c.id,
      label: `${c.id} · ${CARRIER_TYPE[c.type]?.label || c.type}${
        c.pladsId ? ` · ${pladsnavn(pladsMap[c.pladsId])}` : " · uden lokation"}${
        kraeverLokation(c.status) ? "" : ` (${CARRIER_STATUS[c.status]?.label})`}`,
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
        {!varer.length || !pladser.length || !carriers.length ? (
          <Tom>
            Der skal være mindst én <b>vare</b>, én <b>lokation</b> og én{" "}
            <b>beholder</b>, før der kan registreres en bevægelse. Godset
            ligger i en beholder — også når det bare er en palle.
          </Tom>
        ) : (
          <Formular onGem={send} gemmer={gemmer}
                    kanGemme={kanGemme && maaSkrive && !fraSpaerret && !tilLukket
                              && !carrierUdeAfHuset}
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
              {/* ⚠ EN PLACERING HAR HVERKEN VARE ELLER ANTAL. Den flytter
                  beholderen med alt hvad der er i den. */}
              {!placering && (
                <>
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
                </>
              )}
            </Feltraekke>

            <Feltraekke>
              {/* ⚠ KUN DE FELTER ARTEN BRUGER. Se hovedet. */}
              {placering ? (
                <>
                  <Felt id="b-carrier" label="Beholder" kraevet vaerdi={f.carrierId}
                        saet={saet("carrierId")} fejl={vis("carrierId")}
                        valgmuligheder={[{ vaerdi: "", label: "— vælg —" }, ...carriervalg(true)]}
                        hint="Kun beholdere der er i huset. En i transit står ikke på en hylde." />
                  <Felt id="b-tilplads" label="Sættes på" kraevet vaerdi={f.tilPladsId}
                        saet={saet("tilPladsId")} fejl={vis("tilPladsId")}
                        valgmuligheder={[{ vaerdi: "", label: "— vælg —" }, ...pladsvalg(false)]} />
                </>
              ) : (
                <>
                  {art?.kraeverFraCarrier && (
                    <Felt id="b-fra" label="Fra beholder" kraevet vaerdi={f.fraCarrierId}
                          saet={saet("fraCarrierId")} fejl={vis("fraCarrierId")}
                          valgmuligheder={[{ vaerdi: "", label: "— vælg —" }, ...carriervalg(false)]}
                          hint={paaFra != null && vare
                            ? `Der ligger ${num(talFraMaengde(paaFra), ENHED[vare.enhed]?.helTal ? 0 : 1)} ${ENHED[vare.enhed]?.label}`
                            : undefined} />
                  )}
                  {art?.kraeverTilCarrier && (
                    <Felt id="b-til" label="Til beholder" kraevet vaerdi={f.tilCarrierId}
                          saet={saet("tilCarrierId")} fejl={vis("tilCarrierId")}
                          valgmuligheder={[{ vaerdi: "", label: "— vælg —" }, ...carriervalg(false)]} />
                  )}
                </>
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
                ⚠ Beholderen står på en plads i{" "}
                {PLADS_STATUS[fraPlads?.status]?.label.toLowerCase()}.
                Varen dér er under mistanke — den skal frigives først, ikke
                flyttes udenom.
              </p>
            )}
            {carrierUdeAfHuset && (
              <p className="fc-svar fc-svar-fejl" role="alert">
                ⚠ Beholderen er{" "}
                {CARRIER_STATUS[carrierMap[f.carrierId]?.status]?.label.toLowerCase()}{" "}
                og kan ikke sættes på en hylde.
              </p>
            )}
            {tilLukket && (
              <p className="fc-svar fc-svar-fejl" role="alert">
                ⚠ Lokationen er lukket og kan ikke modtage varer.
              </p>
            )}
            {utilstraekkeligt && !fraSpaerret && (
              <p className="fc-svar fc-svar-fejl" role="alert">
                ⚠ Der ligger kun{" "}
                {num(talFraMaengde(paaFra), ENHED[vare?.enhed]?.helTal ? 0 : 1)}{" "}
                {ENHED[vare?.enhed]?.label} i beholderen. Serveren afviser det
                her — mængden skal ned, eller varen skal findes i en anden.
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
            /* ⚠ EN PLACERING HAR INGEN VARE, og cellen skal sige hvad der så
               skete — ikke stå tom. En tom celle læses som manglende data. */
            { key: "vare", label: "Vare", render: (b) => (
                b.vareId
                  ? <b>{vareMap[b.vareId]?.varenummer || b.vareId}</b>
                  : <span className="fc-hint">hele beholderen</span>
              ) },
            { key: "antal", label: "Mængde", num: true, render: (b) => {
                if (!b.vareId) return <span className="fc-neutral">—</span>;
                const v = vareMap[b.vareId];
                return `${num(talFraMaengde(b.antal), ENHED[v?.enhed]?.helTal ? 0 : 1)} ${
                  ENHED[v?.enhed]?.label || ""}`;
              } },
            { key: "vej", label: "Fra → til", render: (b) => (
                <span className="fc-hint">
                  {b.art === "putaway"
                    ? <>{b.fraPladsId ? pladsnavn(pladsMap[b.fraPladsId]) : "uden lokation"}
                        {" → "}{pladsnavn(pladsMap[b.tilPladsId])}
                        {" "}<b>{b.carrierId}</b></>
                    : <>{b.fraCarrierId || "—"}{" → "}{b.tilCarrierId || "—"}</>}
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
