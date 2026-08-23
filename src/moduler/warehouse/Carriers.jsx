/* src/moduler/warehouse/Carriers.jsx
 * Warehouse – Carrier-overblik. Planchen med de fem nøgletal øverst.
 *
 * ⚠ DEN ER IKKE "OVERBLIK" FRA WAREHOUSE.md PUNKT 1. Den flade viser aktive
 * lokationer, varelinjer, åbne modtagelser og opgavekø. Den her viser
 * BEHOLDERE — hvad de indeholder, hvor de står, og hvad der mangler at blive
 * placeret. To forskellige skærme, og kun den ene er bygget.
 *
 * ⚠ DE FEM TAL ER AFLEDT, IKKE HENTET FRA `kpi/`. Skærmen har både
 * beholderne og beholdningsposterne, og et gemt tal ved siden af ville drive
 * fra sit grundlag ved den første bevægelse der ramte det ene og ikke det
 * andet — `bemanding.ledig` igen. Opgørelsen ligger i `carrieroverblik()`,
 * ét sted, så den næste skærm ikke tæller lidt anderledes.
 *
 * ⚠ MEN "12 % SIDEN I GÅR" KAN IKKE REGNES HERAF. Et delta kræver gårsdagens
 * tal, og dem har skærmen ikke. Kun ét delta er bygget —
 * `warehouse.carriereUdenLokationDelta` — fordi det er det ene tal hvor en
 * ændring betyder noget: uplacerede beholdere er en bunke der vokser. De fire
 * andre er bevidst ikke bygget; hvert felt er et løfte om en aggregering.
 *
 * ⚠ OG PLANCHENS "DELVIST TØMT" ER IKKE MED. Den kræver et referencetal —
 * delvist i forhold til hvad? — og det findes ikke i modellen. Et gæt ville
 * se ud som en måling. Kortet siger i stedet hvor mange beholdere der HAR
 * indhold, hvilket kan afgøres. Se WAREHOUSE.md punkt 6.4.
 *
 * ⚠ AFKORTNING SKRIVES. Rammes grænsen, er de fem tal regnet af et udsnit —
 * og et nøgletal der tavst beskriver de første 2000 rækker, er værre end
 * ingen nøgletal.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useKpi } from "../../fleet/useKpi.js";

import { num, datoTid, deviation } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Knap, Henter, Datatilstand, Tom, Ikon, Sider,
  KpiKort, KpiRaekke, Kpiadgang } from "../../fleet/ui.jsx";
import { pladsnavn } from "../../fleet/unitbooking.js";
import {
  CARRIER_TYPE, CARRIER_STATUS, ALLE_CARRIER_STATUS,
  EJERFORHOLD, ALLE_EJERFORHOLD, udenLokation, carrieroverblik,
  beholdningPaaCarrier, talFraMaengde, ENHED,
} from "../../fleet/warehouse.js";
import {
  DEMO_CARRIERS, DEMO_REOLPLADSER, DEMO_BEHOLDNING, DEMO_VARER,
} from "../../fleet/demo-lager.js";

const PR_SIDE = 12;

export default function Carriers() {
  const { kpi: k, utilgaengelige } = useKpi();
  const [soeg, saetSoeg] = useState("");
  const [status, saetStatus] = useState("");
  const [ejerforhold, saetEjerforhold] = useState("");
  const [zone, saetZone] = useState("");
  const [side, saetSide] = useState(1);
  const [aaben, saetAaben] = useState(null);

  const {
    data: carriers, tilstand, genindlaes, henter, afkortet,
  } = useListe("carriers", {
    graense: 2000, demo: DEMO_CARRIERS,
    sorter: (a, b) => (a.id || "").localeCompare(b.id || "", "da"),
  });
  const { data: pladser } = useListe("reolpladser", {
    graense: 2000, demo: DEMO_REOLPLADSER,
  });
  const { data: beholdning } = useListe("beholdning", {
    graense: 5000, demo: DEMO_BEHOLDNING,
  });
  const { data: varer } = useListe("varer", {
    graense: 2000, demo: DEMO_VARER,
  });
  const { data: bevaegelser } = useListe("bevaegelser", {
    graense: 2000, demo: [],
  });

  if (henter) return <Henter hvad="beholderne" />;

  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const vareMap = Object.fromEntries(varer.map((v) => [v.id, v]));
  const tal = carrieroverblik(carriers, beholdning);

  /* Seneste bevægelse pr. beholder — udledt af bevægelserne, ikke et felt på
     carrieren. Et gemt "senesteBevaegelseMs" ville drive fra loggen. */
  const senesteFor = {};
  for (const b of bevaegelser) {
    for (const id of [b.carrierId, b.fraCarrierId, b.tilCarrierId]) {
      if (!id) continue;
      if (!senesteFor[id] || (b.tidspunktMs || 0) > senesteFor[id].tidspunktMs) {
        senesteFor[id] = { tidspunktMs: b.tidspunktMs || 0, art: b.art };
      }
    }
  }

  const indhold = (id) => beholdningPaaCarrier(beholdning, id);
  const zoner = [...new Set(pladser.map((p) => p.zone).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "da"));

  const q = soeg.trim().toLowerCase();
  const viste = carriers.filter((c) => {
    if (status && c.status !== status) return false;
    if (ejerforhold && c.ejerforhold !== ejerforhold) return false;
    if (zone && pladsMap[c.pladsId]?.zone !== zone) return false;
    if (!q) return true;
    return (c.id || "").toLowerCase().includes(q) ||
      (c.note || "").toLowerCase().includes(q) ||
      (c.etapeId || "").toLowerCase().includes(q);
  });
  const harFilter = Boolean(q || status || ejerforhold || zone);
  const nulstil = () => {
    saetSoeg(""); saetStatus(""); saetEjerforhold(""); saetZone(""); saetSide(1);
  };

  const sider = Math.max(1, Math.ceil(viste.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const paaSiden = viste.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  /* Beholdere pr. zone. Afledt af de samme rækker — se hovedet. */
  const prZone = zoner.map((z) => ({
    zone: z,
    antal: carriers.filter((c) => pladsMap[c.pladsId]?.zone === z).length,
  })).filter((r) => r.antal);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kpiadgang utilgaengelige={utilgaengelige} />
      <KpiRaekke>
        <KpiKort label="Aktive beholdere" vaerdi={num(tal.aktive)}
                 ikon={<Ikon navn="kasse" />} tone="ikon-5" rund
                 note={`${num(tal.ialt)} i alt, inkl. opbrugte og ude af drift`} />
        <KpiKort label="I transit" vaerdi={num(tal.iTransit)}
                 note="undervejs — står ingen steder" />
        <KpiKort label="Engangs" vaerdi={num(tal.engangs)}
                 note="bliver hos modtageren" />
        {/* ⚠ DET ENESTE KORT MED ET DELTA, og det er et ANTAL. Se hovedet:
            en ændring i uplacerede beholdere er en bunke der vokser. */}
        <KpiKort label="Uden lokation" vaerdi={num(tal.udenLokation)}
                 afvigelse={k?.warehouse
                   ? deviation(k.warehouse.carriereUdenLokationDelta, { betterWhen: "lower" })
                   : undefined}
                 note={tal.udenLokation
                   ? "scannet ind, ikke sat på plads"
                   : "alt er placeret"} />
        {/* ⚠ IKKE "DELVIST TØMT". Se hovedet — den kræver et referencetal
            der ikke findes, og et gæt ville se ud som en måling. */}
        <KpiKort label="Med indhold" vaerdi={num(tal.medIndhold)}
                 note="beholdere der bærer gods" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel={`Beholdere (${num(viste.length)} af ${num(carriers.length)})`}
            handling={<Link className="fc-a" to="/warehouse/lokationer">Se lokationerne</Link>}>
        {/* ⚠ TAVS AFKORTNING OPDAGES FØRST NÅR NOGEN SPØRGER hvorfor en
            beholder mangler — og her ville de fem tal ovenfor også være
            regnet af et udsnit. */}
        {afkortet && (
          <p className="fc-svar fc-svar-fejl" role="alert">
            ⚠ Der blev hentet 2.000 beholdere, og der kan være flere. Tallene
            ovenfor dækker kun de hentede.
          </p>
        )}

        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="c-soeg">Søg</label>
            <input id="c-soeg" type="search" value={soeg}
                   placeholder="Carrier-id, transport eller note"
                   onChange={(e) => { saetSoeg(e.target.value); saetSide(1); }} />
          </div>
          <div className="fc-felt">
            <label htmlFor="c-status">Status</label>
            <select id="c-status" value={status}
                    onChange={(e) => { saetStatus(e.target.value); saetSide(1); }}>
              <option value="">Alle statusser</option>
              {ALLE_CARRIER_STATUS.map((s) => (
                <option key={s} value={s}>{CARRIER_STATUS[s].label}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="c-ejer">Ejerforhold</label>
            <select id="c-ejer" value={ejerforhold}
                    onChange={(e) => { saetEjerforhold(e.target.value); saetSide(1); }}>
              <option value="">Egne og engangs</option>
              {ALLE_EJERFORHOLD.map((e) => (
                <option key={e} value={e}>{EJERFORHOLD[e].label}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="c-zone">Zone</label>
            <select id="c-zone" value={zone}
                    onChange={(e) => { saetZone(e.target.value); saetSide(1); }}>
              <option value="">Alle zoner</option>
              {zoner.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          {harFilter && (
            <div className="fc-felt" style={{ alignSelf: "end" }}>
              <Knap onClick={nulstil}>Ryd filtre</Knap>
            </div>
          )}
        </div>

        {!carriers.length ? (
          <Tom>
            Der er ingen beholdere endnu. Godset ligger i en beholder — også
            når det bare er en palle — så den første skal oprettes, før der
            kan modtages noget.
          </Tom>
        ) : (
          <>
            <Tabel
              kolonner={[
                { key: "id", label: "Carrier-id", render: (c) => <b>{c.id}</b> },
                { key: "type", label: "Type", render: (c) => (
                    <span className="fc-hint">
                      {CARRIER_TYPE[c.type]?.label || c.type}
                      {c.laengdeMm && c.breddeMm && c.hoejdeMm
                        ? ` · ${c.laengdeMm}×${c.breddeMm}×${c.hoejdeMm}`
                        : ""}
                    </span>
                  ) },
                { key: "ejer", label: "Ejerforhold", render: (c) => (
                    <Pille tone={EJERFORHOLD[c.ejerforhold]?.pill || "info"}>
                      {EJERFORHOLD[c.ejerforhold]?.label || c.ejerforhold}
                    </Pille>
                  ) },
                /* ⚠ "UDEN LOKATION" ER FRAVÆRET AF EN PLADS, ikke en status.
                   Den står som en advarsel og ikke som en tom celle: en
                   beholder ingen har sat på plads, er en opgave. */
                { key: "lokation", label: "Lokation", render: (c) => (
                    c.pladsId
                      ? pladsnavn(pladsMap[c.pladsId])
                      : udenLokation(c)
                        ? <span className="fc-bad">ingen lokation</span>
                        : <span className="fc-neutral">—</span>
                  ) },
                { key: "indhold", label: "Indhold", num: true, render: (c) => {
                    const linjer = indhold(c.id);
                    if (!linjer.length) return <span className="fc-neutral">tom</span>;
                    return (
                      <span className="fc-hint">
                        {num(linjer.length)} {linjer.length === 1 ? "vare" : "varer"}
                      </span>
                    );
                  } },
                { key: "status", label: "Status", render: (c) => (
                    <Pille tone={CARRIER_STATUS[c.status]?.pill || "info"}>
                      {CARRIER_STATUS[c.status]?.label || c.status}
                    </Pille>
                  ) },
                { key: "transport", label: "Transport", render: (c) => (
                    c.etapeId
                      ? <span className="fc-hint">{c.etapeId}</span>
                      : <span className="fc-neutral">—</span>
                  ) },
                /* ⚠ UDLEDT AF BEVÆGELSERNE. Et gemt "seneste bevægelse" på
                   beholderen ville drive fra loggen. */
                { key: "senest", label: "Seneste bevægelse", render: (c) => {
                    const s = senesteFor[c.id];
                    return s
                      ? <span className="fc-hint">{datoTid(s.tidspunktMs)}</span>
                      : <span className="fc-neutral">ingen endnu</span>;
                  } },
                { key: "handling", label: "", render: (c) => (
                    indhold(c.id).length
                      ? <Knap onClick={() => saetAaben(c.id === aaben ? null : c.id)}>
                          {c.id === aaben ? "Skjul" : "Vis indhold"}
                        </Knap>
                      : null
                  ) },
              ]}
              raekker={paaSiden}
              erValgt={(c) => c.id === aaben}
              tom="Ingen beholdere matcher filteret."
            />
            <Sider side={nuSide} antal={viste.length} prSide={PR_SIDE} saet={saetSide} />
          </>
        )}
      </Kort>

      {aaben && (
        <Kort titel={`Indhold — ${aaben}`}>
          <Tabel
            kolonner={[
              { key: "vare", label: "Vare", render: (b) => (
                  <b>{vareMap[b.vareId]?.varenummer || b.vareId}</b>
                ) },
              { key: "navn", label: "", render: (b) => (
                  <span className="fc-hint">{vareMap[b.vareId]?.navn || ""}</span>
                ) },
              { key: "batch", label: "Batch", render: (b) => (
                  b.batch && b.batch !== "_"
                    ? b.batch
                    : <span className="fc-neutral">—</span>
                ) },
              { key: "antal", label: "Mængde", num: true, render: (b) => {
                  const v = vareMap[b.vareId];
                  return `${num(talFraMaengde(b.antal), ENHED[v?.enhed]?.helTal ? 0 : 1)} ${
                    ENHED[v?.enhed]?.label || ""}`;
                } },
            ]}
            raekker={indhold(aaben)}
            noegle={(b) => b.id}
            tom="Beholderen er tom."
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ <b>Indholdet hænger på beholderen, ikke på hylden.</b> Flyttes
            beholderen, følger godset med uden at et eneste lagertal skrives
            om — det er derfor en placering ikke rører en saldo.
          </p>
        </Kort>
      )}

      {prZone.length > 0 && (
        <Kort titel="Beholdere pr. zone">
          <Tabel
            kolonner={[
              { key: "zone", label: "Zone", render: (r) => <b>{r.zone}</b> },
              { key: "antal", label: "Beholdere", num: true,
                render: (r) => num(r.antal) },
            ]}
            raekker={prZone}
            noegle={(r) => r.zone}
            tom="Ingen zoner."
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Beholdere uden lokation står ikke i en zone — de er talt i kortet
            ovenfor, ikke her.
          </p>
        </Kort>
      )}
    </div>
  );
}
