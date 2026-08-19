/* src/moduler/warehouse/Modtagelse.jsx
 * Warehouse – transit & placering. Planchens fire trin.
 *
 *   1. Ankommet fra transport → 2. Vælg beholder →
 *   3. Vælg lokation → 4. Beholder placeret
 *
 * ⚠ AT SÆTTE BEHOLDEREN PÅ EN HYLDE ER ANKOMSTEN. Der er ikke et "modtag"-
 * trin før placeringen: en beholder i transit der nu står på en hylde, ER
 * kommet frem, og statussen følger med i samme skrivning. To skridt ville
 * betyde at der fandtes et øjeblik hvor beholderen både var undervejs og
 * stod et sted — og det er præcis den tilstand belægningen hviler på ikke
 * findes. Den anden vej findes stadig: en beholder kan være scannet ind uden
 * at være placeret, og så står den som "uden lokation".
 *
 * ⚠ FORSLAGET ER EN LEDIG PLADS, IKKE EN BEREGNET PLADS. Systemet foreslår
 * den første plads der er aktiv og tom — via den fælles belægningsopgørelse,
 * så forslaget ikke kan blive uenigt med Lokationer om hvad "ledig" betyder.
 * Planchen viser "1,9 m³ ledig" ved forslaget; det tal findes ikke, fordi der
 * ikke er en kapacitetsmodel — og et opdigtet rumfang ville se ud som en
 * måling. Der står zone og type i stedet.
 *
 * ⚠ PLANCHENS "KUNDENS FASTE OMRÅDE" ER IKKE BYGGET. En kundezone er et
 * reserveret OMRÅDE med ledig m² og m³ — to ting modellen ikke har: hverken
 * en reservation af en plads til én kunde eller en kapacitet. Skærmen siger
 * det frem for at vise en knap der ikke kan gøre det den lover. Se
 * WAREHOUSE.md punkt 6.6.
 *
 * ⚠ OG DER TEGNES IKKE ET LAGERKORT. Planchens gitter er en fysisk plan, og
 * `reolpladser` har ingen koordinater — hal, reol, fag, hylde og plads er
 * navne, ikke positioner. Et kort tegnet på gæt ville vise en hylde et sted
 * den ikke står. Oversigten er derfor pr. zone.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, datoTid } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formularsvar,
  Henter, Datatilstand, Tom, Ikon, KpiKort, KpiRaekke, MiniLinje,
} from "../../fleet/ui.jsx";
import { pladsnavn } from "../../fleet/unitbooking.js";
import {
  CARRIER_TYPE, CARRIER_STATUS, EJERFORHOLD, udenLokation,
  beholdningPaaCarrier, talFraMaengde, ENHED, PLADS_TYPE, PLADS_STATUS,
  rumfangMm3,
} from "../../fleet/warehouse.js";
import { belaegningPrPlads, pladsErLedig } from "../../fleet/reolplads.js";
import { skrivBevaegelse } from "../../fleet/lager.js";
import { harModul } from "../../fleet/moduler.js";
import {
  DEMO_CARRIERS, DEMO_REOLPLADSER, DEMO_BEHOLDNING, DEMO_VARER,
} from "../../fleet/demo-lager.js";
import { DEMO_KASSER } from "../../fleet/demo-unitbooking.js";

/* m³ med én decimal. Målene er i millimeter (heltal), så regnestykket sker
   her og gemmes ikke — et gemt rumfang ville drive fra målene. */
const kubik = (c) => {
  const mm3 = rumfangMm3(c);
  return mm3 == null ? null : mm3 / 1e9;
};

export default function Modtagelse() {
  const { bruger, moduler } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.bevaegelserSkriv);

  const [valgt, saetValgt] = useState(null);
  const [pladsId, saetPladsId] = useState("");
  const [arbejder, saetArbejder] = useState(false);
  const [svar, saetSvar] = useState(null);
  const [kvittering, saetKvittering] = useState(null);

  const {
    data: carriers, tilstand, genindlaes, henter,
  } = useListe("carriers", {
    division: "alle", graense: 2000, demo: DEMO_CARRIERS,
    sorter: (a, b) => (a.id || "").localeCompare(b.id || "", "da"),
  });
  const { data: pladser } = useListe("reolpladser", {
    division: "alle", graense: 2000, demo: DEMO_REOLPLADSER,
    sorter: (a, b) => pladsnavn(a).localeCompare(pladsnavn(b), "da"),
  });
  const { data: beholdning } = useListe("beholdning", {
    division: "alle", graense: 5000, demo: DEMO_BEHOLDNING,
  });
  const { data: varer } = useListe("varer", {
    division: "alle", graense: 2000, demo: DEMO_VARER,
  });
  const { data: bevaegelser, genindlaes: genBev } = useListe("bevaegelser", {
    division: "alle", graense: 500, demo: [],
    sorter: (a, b) => (b.tidspunktMs || 0) - (a.tidspunktMs || 0),
  });
  /* Kasserne tæller med i belægningen — men kun hvis tenanten har modulet.
     Se noten ved `hent` i useListe.js. */
  const { data: kasser } = useListe("kasser", {
    division: "alle", graense: 2000, demo: DEMO_KASSER,
    hent: harModul(moduler, "unitbooking"),
  });

  if (henter) return <Henter hvad="beholderne i transit" />;

  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const vareMap = Object.fromEntries(varer.map((v) => [v.id, v]));
  const belaeg = belaegningPrPlads({ beholdning, kasser, carriers });
  const tom = (id) => belaeg[id] || { ialt: 0, optaget: false };

  /* ⚠ KØEN: det der venter på en plads. En beholder i transit er på vej ind,
     og en der er scannet uden lokation, står allerede i huset — begge dele er
     "endnu ikke placeret", og de hører i den samme liste. Ellers ville den
     ene halvdel blive glemt, fordi ingen skærm viste den. */
  const koe = carriers.filter(
    (c) => c.status === "iTransit" || udenLokation(c));

  const carrier = koe.find((c) => c.id === valgt) || null;
  const indhold = carrier ? beholdningPaaCarrier(beholdning, carrier.id) : [];

  /* Ledige pladser — ét sted, samme opgørelse som Lokationer bruger. */
  const ledige = pladser.filter((p) => pladsErLedig(p, tom(p.id)));
  const forslag = ledige[0] || null;

  const senesteScans = bevaegelser.filter((b) => b.art === "putaway").slice(0, 5);

  const vaelg = (c) => {
    saetValgt(c.id);
    saetPladsId("");
    saetSvar(null);
    saetKvittering(null);
  };

  const placer = async (maalId) => {
    if (!carrier || !maalId) return;
    saetArbejder(true);
    const r = await skrivBevaegelse({
      art: "putaway", carrierId: carrier.id, tilPladsId: maalId,
    });
    saetArbejder(false);
    saetSvar(r);
    if (r.ok) {
      saetKvittering({
        carrierId: carrier.id,
        pladsId: maalId,
        /* ⚠ SIGER OM DEN OGSÅ ANKOM. Serveren svarer på det, fordi det er
           serveren der afgjorde om statussen skiftede — skærmen ville skulle
           gætte ud fra en tilstand der lige er ændret. */
        ankommet: Boolean(r.data?.ankommet),
        tidspunktMs: Date.now(),
      });
      saetValgt(null);
      saetPladsId("");
      genindlaes();
      genBev();
    }
  };

  const trin = kvittering ? 4 : carrier ? 3 : 2;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Venter på plads" vaerdi={num(koe.length)}
                 ikon={<Ikon navn="kasse" />} tone="ikon-5" rund
                 note="i transit eller scannet uden lokation" />
        <KpiKort label="I transit"
                 vaerdi={num(carriers.filter((c) => c.status === "iTransit").length)}
                 note="på vej ind" />
        <KpiKort label="Uden lokation"
                 vaerdi={num(carriers.filter(udenLokation).length)}
                 note="står i huset, men ingen steder" />
        <KpiKort label="Ledige pladser" vaerdi={num(ledige.length)}
                 note={`af ${num(pladser.length)} — hverken varer, kasser eller carriers`} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Transit & placering">
        <p className="fc-hint">
          {/* De fire trin, som på planchen. Trinnet er UDLEDT af hvor langt
              man er — ikke en gemt tilstand der kan komme ud af trit. */}
          <b>{trin === 4 ? "4" : trin}. </b>
          {trin === 2 && "Vælg den beholder der er ankommet."}
          {trin === 3 && "Vælg hvor den skal stå — eller tag den foreslåede plads."}
          {trin === 4 && "Beholderen er placeret."}
        </p>

        {kvittering && (
          <div className="fc-empty fc-empty-info">
            <p>
              <b>{kvittering.carrierId}</b> står nu på{" "}
              <b>{pladsnavn(pladsMap[kvittering.pladsId])}</b>.
            </p>
            <p className="fc-hint" style={{ marginTop: 6 }}>
              {kvittering.ankommet
                ? "Beholderen var i transit og er registreret som ankommet i samme skridt."
                : "Beholderen stod i huset i forvejen og er nu sat på plads."}
              {" "}{datoTid(kvittering.tidspunktMs)}
            </p>
            <div className="fc-med-ikon" style={{ gap: 8, marginTop: 10 }}>
              <Knap variant="primaer" onClick={() => saetKvittering(null)}>
                Ny placering
              </Knap>
              <Link className="fc-a" to="/warehouse/carriers">Se alle beholdere</Link>
            </div>
          </div>
        )}

        <Formularsvar svar={svar} />

        {!kvittering && (
          <>
            {!koe.length ? (
              <Tom>
                Der er ingen beholdere der venter på en plads. Alt der er i
                huset, står et sted.
              </Tom>
            ) : (
              <Tabel
                kolonner={[
                  { key: "id", label: "Beholder", render: (c) => <b>{c.id}</b> },
                  { key: "type", label: "Type", render: (c) => (
                      <span className="fc-hint">{CARRIER_TYPE[c.type]?.label || c.type}</span>
                    ) },
                  { key: "ejer", label: "", render: (c) => (
                      <Pille tone={EJERFORHOLD[c.ejerforhold]?.pill || "info"}>
                        {EJERFORHOLD[c.ejerforhold]?.label || c.ejerforhold}
                      </Pille>
                    ) },
                  { key: "status", label: "Status", render: (c) => (
                      <Pille tone={CARRIER_STATUS[c.status]?.pill || "info"}>
                        {c.status === "iTransit"
                          ? CARRIER_STATUS[c.status].label
                          : "uden lokation"}
                      </Pille>
                    ) },
                  { key: "transport", label: "Fra transport", render: (c) => (
                      c.transportId
                        ? <span className="fc-hint">{c.transportId}</span>
                        : <span className="fc-neutral">—</span>
                    ) },
                  { key: "indhold", label: "Indhold", num: true, render: (c) => {
                      const l = beholdningPaaCarrier(beholdning, c.id);
                      return l.length
                        ? <span className="fc-hint">{num(l.length)} {l.length === 1 ? "vare" : "varer"}</span>
                        : <span className="fc-neutral">tom</span>;
                    } },
                  { key: "handling", label: "", render: (c) => (
                      <Knap variant={c.id === valgt ? "primaer" : undefined}
                            onClick={() => vaelg(c)}>
                        {c.id === valgt ? "Valgt" : "Vælg"}
                      </Knap>
                    ) },
                ]}
                raekker={koe}
                erValgt={(c) => c.id === valgt}
                tom="Ingen beholdere venter."
              />
            )}
          </>
        )}
      </Kort>

      {carrier && !kvittering && (
        <Kort titel={`Valgt beholder — ${carrier.id}`}>
          <MiniLinje label="Type" vaerdi={CARRIER_TYPE[carrier.type]?.label || carrier.type} />
          <MiniLinje label="Ejerforhold" vaerdi={EJERFORHOLD[carrier.ejerforhold]?.label} />
          {carrier.kundeId && <MiniLinje label="Kunde" vaerdi={carrier.kundeId} />}
          {/* ⚠ REGNET AF MÅLENE, ikke gemt. Et gemt rumfang ville drive fra
              de tre mål ved den første rettelse. Mangler et mål, står der
              ingenting — ikke nul. */}
          <MiniLinje label="Rumfang"
                     vaerdi={kubik(carrier) == null
                       ? "målene mangler"
                       : `${num(kubik(carrier), 2)} m³`} />
          <MiniLinje label="Indhold"
                     vaerdi={indhold.length
                       ? indhold.map((b) => `${vareMap[b.vareId]?.varenummer || b.vareId} · ${
                           num(talFraMaengde(b.antal), ENHED[vareMap[b.vareId]?.enhed]?.helTal ? 0 : 1)}`).join(" · ")
                       : "tom"} />
          {carrier.transportId && (
            <MiniLinje label="Fra transport" vaerdi={carrier.transportId} />
          )}

          <p className="fc-hint" style={{ marginTop: 12 }}><b>Vælg lokation</b></p>

          {forslag ? (
            <div className="fc-empty fc-empty-info">
              <p>
                Foreslået ledig plads: <b>{pladsnavn(forslag)}</b>
                {forslag.zone ? ` · ${forslag.zone}` : ""}
                {forslag.type ? ` · ${PLADS_TYPE[forslag.type]?.label || forslag.type}` : ""}
              </p>
              <Knap variant="primaer" disabled={!maaSkrive || arbejder}
                    title={maaSkrive ? undefined : `Kræver ${PERM.bevaegelserSkriv} — reglerne afviser.`}
                    onClick={() => placer(forslag.id)}>
                {arbejder ? "Placerer …" : "Vælg foreslået plads"}
              </Knap>
            </div>
          ) : (
            <p className="fc-svar fc-svar-fejl" role="alert">
              ⚠ Der er ingen ledig plads at foreslå. Alle aktive pladser bærer
              noget, eller de er spærrede.
            </p>
          )}

          <Feltraekke>
            <Felt id="m-plads" label="Eller vælg en anden plads" vaerdi={pladsId}
                  saet={(v) => { saetPladsId(v); saetSvar(null); }}
                  valgmuligheder={[{ vaerdi: "", label: "— vælg —" },
                    ...pladser.map((p) => ({
                      vaerdi: p.id,
                      label: `${pladsnavn(p)}${p.zone ? ` · ${p.zone}` : ""}${
                        tom(p.id).optaget ? " (optaget)" : ""}${
                        p.status && p.status !== "aktiv"
                          ? ` (${PLADS_STATUS[p.status]?.label})` : ""}`,
                    }))]}
                  hint="Listen viser alle pladser — også de optagne og spærrede, så man kan se hvorfor de ikke foreslås." />
          </Feltraekke>

          <div className="fc-med-ikon" style={{ gap: 8 }}>
            <Knap variant="primaer"
                  disabled={!maaSkrive || !pladsId || arbejder ||
                            tom(pladsId).optaget ||
                            !pladsErLedig(pladsMap[pladsId], tom(pladsId))}
                  onClick={() => placer(pladsId)}>
              Placér på valgt plads
            </Knap>
            <Knap onClick={() => saetValgt(null)}>Annullér</Knap>
          </div>

          {pladsId && !pladsErLedig(pladsMap[pladsId], tom(pladsId)) && (
            <p className="fc-svar fc-svar-fejl" role="alert">
              ⚠ Den plads kan ikke tage imod:{" "}
              {tom(pladsId).optaget
                ? "der står noget på den i forvejen."
                : `den er ${PLADS_STATUS[pladsMap[pladsId]?.status]?.label.toLowerCase()}.`}
            </p>
          )}

          {/* ⚠ KUNDENS FASTE OMRÅDE MANGLER, OG DET STÅR HER FREM FOR AT BLIVE
              OPDAGET. Se hovedet. */}
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ <b>Kundens faste område kan ikke vælges endnu.</b> En kundezone er
            et reserveret område med ledig plads i m² og m³ — og modellen har
            hverken en reservation af en plads til én kunde eller en kapacitet.
            En knap der lovede det, ville placere godset et sted systemet ikke
            kan holde styr på.
          </p>
        </Kort>
      )}

      {senesteScans.length > 0 && (
        <Kort titel="Seneste placeringer">
          <Tabel
            kolonner={[
              { key: "tid", label: "Tidspunkt", render: (b) => datoTid(b.tidspunktMs) },
              { key: "carrier", label: "Beholder", render: (b) => <b>{b.carrierId}</b> },
              { key: "fra", label: "Fra", render: (b) => (
                  b.fraPladsId
                    ? pladsnavn(pladsMap[b.fraPladsId])
                    : <span className="fc-hint">uden lokation</span>
                ) },
              { key: "til", label: "Til", render: (b) => pladsnavn(pladsMap[b.tilPladsId]) },
            ]}
            raekker={senesteScans}
            noegle={(b) => b.id}
            tom="Ingen placeringer endnu."
          />
        </Kort>
      )}
    </div>
  );
}
