/* src/moduler/turtlebooking/Historik.jsx
 * Turtlebooking – historik pr. kasse og pr. sagsnummer.
 *
 * ⚠ SKÆRMEN SKRIVER IKKE OG SKAL IKKE. Historik er dokumentation; kan den
 * rettes fra en skærm, dokumenterer den ingenting. Rettes en periode, sker
 * det på reservationen under Udlån, mens den stadig er booket — bagefter er
 * perioden en kendsgerning, ikke en aftale.
 *
 * ⚠ TO INDGANGE, FORDI DER ER TO SPØRGSMÅL. "Hvor har MDT-101 været?" og
 * "Hvilke kasser var med på sag 4260?" Et museum låner sjældent én kasse, og
 * en flad liste med et søgefelt svarer kun på det første.
 *
 * ⚠ DET ER IKKE AUDITLOGGEN. Her står hvad der skete med kasserne, ikke hvem
 * der trykkede. Skiftene ligger i `audit/` med deres egen læseregel og kræver
 * `audit.laes` — en lagermedarbejder har den ikke, og det er med vilje: en
 * log over hvem der har gjort hvad, er selv følsom. Se beslutning 17 og 24.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { num, dato, datoTid } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, KpiKort, KpiRaekke, Knap,
} from "../../fleet/ui.jsx";
import {
  UDLAAN_TILSTAND, KASSE_STATUS, AFSLUTTET, pladsnavn,
  dageUde, historikForKasse, sagsoversigt,
} from "../../fleet/turtlebooking.js";
import {
  DEMO_KASSER, DEMO_KASSETYPER, DEMO_KASSEUDLAAN,
} from "../../fleet/demo-turtlebooking.js";
import { DEMO_REOLPLADSER } from "../../fleet/demo-lager.js";

/**
 * Varigheden med sit forbehold.
 *
 * ⚠ ET PLANLAGT TAL SKAL SE ANDERLEDES UD END ET MÅLT. Uden mærket læses
 * "20 dage" som en måling, og så er det et tal nogen regner videre på. Er
 * kassen kommet hjem i forvejen, er det forkert — og fejlen er usynlig,
 * fordi tallet ser lige så sikkert ud som det rigtige. Samme forbehold som
 * `tjekKoerehviletid()` bærer: vi kan se planen, ikke virkeligheden.
 */
function Varighed({ udlaan }) {
  const { dage, faktisk } = dageUde(udlaan);
  if (!dage) return <span className="fc-neutral">—</span>;
  return (
    <>
      {num(dage)} {dage === 1 ? "dag" : "dage"}{" "}
      {faktisk ? <Pille tone="ok">målt</Pille> : <Pille tone="info">planlagt</Pille>}
    </>
  );
}

/** Hvad der faktisk skete, hvis serveren nåede at stemple det. */
function Faktisk({ udlaan: u }) {
  const ud = Number.isFinite(u.udleveretMs) ? datoTid(u.udleveretMs) : null;
  const hjem = Number.isFinite(u.returneretMs) ? datoTid(u.returneretMs) : null;
  if (!ud && !hjem) {
    return (
      <span className="fc-neutral">
        {AFSLUTTET.includes(u.tilstand) ? "ikke stemplet" : "ikke sket endnu"}
      </span>
    );
  }
  return (
    <span className="fc-hint">
      {ud ? `ud ${ud}` : "ikke udleveret"}{hjem ? ` · hjem ${hjem}` : ""}
    </span>
  );
}

const tilstandspille = (t) => (
  <Pille tone={UDLAAN_TILSTAND[t]?.pill || "info"}>
    {UDLAAN_TILSTAND[t]?.label || t}
  </Pille>
);

export default function Historik() {
  const [visning, saetVisning] = useState("kasse");
  const [valgtKasse, saetValgtKasse] = useState("");
  const [soeg, saetSoeg] = useState("");

  const { data: udlaan, tilstand, genindlaes, henter } = useListe("kasseudlaan", {
    division: "alle", graense: 2000, demo: DEMO_KASSEUDLAAN,
  });
  const { data: kasser } = useListe("kasser", {
    division: "alle", graense: 1000, demo: DEMO_KASSER,
    sorter: (a, b) => a.id.localeCompare(b.id, "da"),
  });
  const { data: typer } = useListe("kassetyper", {
    division: "alle", graense: 100, demo: DEMO_KASSETYPER,
  });
  const { data: pladser } = useListe("reolpladser", {
    division: "alle", graense: 500, demo: DEMO_REOLPLADSER,
  });

  if (henter) return <Henter hvad="historikken" />;

  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const typeNavn = (id) => typer.find((t) => t.id === id)?.navn || id;

  /* ⚠ AFLEDT, IKKE GEMT. Tallene regnes af de udlån skærmen allerede har. Et
     gemt "antal udlån" på kassen ville drive fra listen første gang en
     reservation blev annulleret. */
  const afsluttede = udlaan.filter((u) => u.tilstand === "returneret");
  const stemplede = afsluttede.filter((u) => dageUde(u).faktisk);
  const annullerede = udlaan.filter((u) => u.tilstand === "annulleret");
  const sager = sagsoversigt(udlaan);

  const q = soeg.trim().toLowerCase();

  const kasseliste = kasser.filter((k) => !q || k.id.toLowerCase().includes(q));
  const kasse = kasser.find((k) => k.id === valgtKasse) || null;
  const kassensUdlaan = kasse ? historikForKasse(udlaan, kasse.id) : [];
  const kassensDage = kassensUdlaan
    .filter((u) => u.tilstand === "returneret")
    .reduce((s, u) => s + dageUde(u).dage, 0);

  const visteSager = sager.filter((s) =>
    !q || s.sagsnummer.toLowerCase().includes(q) ||
    (s.beskrivelse || "").toLowerCase().includes(q) ||
    s.kasser.some((id) => id.toLowerCase().includes(q)));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Udlån i alt" vaerdi={num(udlaan.length)}
                 note={`fordelt på ${num(sager.length)} sager`} />
        <KpiKort label="Afsluttede" vaerdi={num(afsluttede.length)}
                 note="kassen er kommet hjem" />
        {/* ⚠ DEN HER MÅLER OS SELV, ikke lageret. Et afsluttet udlån uden
            stempel er et vi ikke kan sige varigheden på — og andelen falder
            kun, hvis nogen begynder at gå uden om systemet. */}
        <KpiKort label="Med målt varighed"
                 vaerdi={afsluttede.length
                   ? `${Math.round((stemplede.length / afsluttede.length) * 100)} %`
                   : "—"}
                 note={afsluttede.length
                   ? `${num(afsluttede.length - stemplede.length)} har kun det planlagte`
                   : "ingen afsluttede endnu"} />
        <KpiKort label="Annullerede" vaerdi={num(annullerede.length)}
                 note="lovet væk og trukket tilbage" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Historik">
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="h-visning">Slå op</label>
            <select id="h-visning" value={visning}
                    onChange={(e) => { saetVisning(e.target.value); saetSoeg(""); }}>
              <option value="kasse">Pr. kasse</option>
              <option value="sag">Pr. sagsnummer</option>
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="h-soeg">Søg</label>
            <input id="h-soeg" type="search" value={soeg}
                   placeholder={visning === "kasse"
                     ? "Kasse-id, fx MDT-101"
                     : "Sagsnummer, beskrivelse eller kasse"}
                   onChange={(e) => saetSoeg(e.target.value)} />
          </div>
        </div>

        {visning === "kasse" ? (
          <Tabel
            kolonner={[
              { key: "id", label: "Kasse", render: (k) => <b>{k.id}</b> },
              { key: "type", label: "Type", render: (k) => typeNavn(k.type) },
              { key: "status", label: "Status", render: (k) => (
                  <Pille tone={KASSE_STATUS[k.status]?.pill || "info"}>
                    {KASSE_STATUS[k.status]?.label || k.status}
                  </Pille>
                ) },
              { key: "hjem", label: "Hjemplads", render: (k) => (
                  <span className="fc-hint">{pladsnavn(pladsMap[k.hjemPladsId])}</span>
                ) },
              { key: "antal", label: "Udlån", num: true,
                render: (k) => num(historikForKasse(udlaan, k.id).length) },
              { key: "vaelg", label: "", render: (k) => (
                  <Knap onClick={() => saetValgtKasse(k.id === valgtKasse ? "" : k.id)}>
                    {k.id === valgtKasse ? "Luk" : "Vis historik"}
                  </Knap>
                ) },
            ]}
            raekker={kasseliste}
            erValgt={(k) => k.id === valgtKasse}
            tom="Ingen kasser matcher søgningen."
          />
        ) : (
          <Tabel
            kolonner={[
              { key: "sag", label: "Sagsnummer", render: (s) => <b>{s.sagsnummer}</b> },
              { key: "besk", label: "Beskrivelse",
                render: (s) => <span className="fc-hint">{s.beskrivelse || "—"}</span> },
              { key: "periode", label: "Periode",
                render: (s) => `${dato(s.fra)} – ${dato(s.til)}` },
              /* ⚠ ET MUSEUM LÅNER SJÆLDENT ÉN KASSE. Kolonnen er hele grunden
                 til at sagen er en gruppering og ikke et søgefelt. */
              { key: "kasser", label: "Kasser", render: (s) => s.kasser.join(", ") },
              { key: "antal", label: "Antal", num: true,
                render: (s) => num(s.kasser.length) },
              { key: "tilstande", label: "Tilstand", render: (s) => (
                  <span className="fc-med-ikon" style={{ gap: 4, flexWrap: "wrap" }}>
                    {[...new Set(s.udlaan.map((u) => u.tilstand))].map((t) => (
                      <span key={t}>{tilstandspille(t)}</span>
                    ))}
                  </span>
                ) },
            ]}
            raekker={visteSager}
            noegle={(s) => s.sagsnummer}
            tom="Ingen sager matcher søgningen."
          />
        )}

        <p className="fc-hint" style={{ marginTop: 12 }}>
          ⚠ <b>Her står hvad der skete med kasserne — ikke hvem der trykkede.</b>{" "}
          Tilstandsskiftene ligger i auditloggen, som har sin egen læseregel og
          kræver <b>audit.laes</b>. En log over hvem der har gjort hvad, er selv
          følsom, og adgangen til den er ikke en del af lagerarbejdet.
        </p>
      </Kort>

      {/* Detaljen er sit eget kort. Der findes ingen underoverskrift i huset,
          og et nyt klassenavn er en global variabel — se css-navne.test.mjs. */}
      {visning === "kasse" && kasse && (
        <Kort titel={`${kasse.id} · ${num(kassensUdlaan.length)} udlån${
          kassensDage > 0 ? ` · ${num(kassensDage)} dage ude i alt` : ""}`}>
          {kassensDage > 0 && (
            <p className="fc-hint">
              ⚠ Summen tæller kun <b>afsluttede</b> udlån, og den blander målte
              og planlagte dage. Kolonnen viser hvilket der er hvilket — et
              planlagt tal er ikke en måling.
            </p>
          )}
          <Tabel
            kolonner={[
              { key: "sag", label: "Sag", render: (u) => <b>{u.sagsnummer}</b> },
              { key: "besk", label: "Beskrivelse",
                render: (u) => <span className="fc-hint">{u.beskrivelse || "—"}</span> },
              { key: "aftalt", label: "Aftalt periode",
                render: (u) => `${dato(u.fra)} – ${dato(u.til)}` },
              { key: "faktisk", label: "Faktisk", render: (u) => <Faktisk udlaan={u} /> },
              { key: "dage", label: "Varighed", render: (u) => <Varighed udlaan={u} /> },
              { key: "tilstand", label: "Tilstand",
                render: (u) => tilstandspille(u.tilstand) },
            ]}
            raekker={kassensUdlaan}
            tom="Kassen har aldrig været lånt ud."
          />
        </Kort>
      )}
    </div>
  );
}
