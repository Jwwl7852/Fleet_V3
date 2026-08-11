/* src/moduler/udbyder/Prisliste.jsx
 * Prislisten og fakturagrundlaget i ejerkonsollen.
 *
 * ⚠ EN NY PRIS ER EN NY LISTE. Der er ingen "gem"-knap på en eksisterende —
 * man ændrer tallene og lægger en NY med en dato. Kunne en liste rettes,
 * kunne en faktura fra marts ikke genskabes efter en prisstigning i april,
 * og bogføringsmaterialet skal kunne dokumenteres i fem år.
 *
 * ⚠ MEN DET ER FRYSNINGEN DER BESKYTTER MARTS. Et genereret grundlag gemmer
 * sine egne satser og regner aldrig igen. Versioneringen giver sporbarhed.
 * De to forveksles, og så bygger man den ene og tror man har den anden.
 *
 * ⚠ SKÆRMEN REGNER IKKE SELV. Den viser priserne og kalder funktionen.
 * Beløbene på et grundlag kommer fra det frosne dokument — ikke fra en
 * beregning her, som ville kunne give et andet tal end det der blev faktureret.
 */
import { useEffect, useState } from "react";
import { db } from "../../firebase.js";
import { kr, num, dato, datoTid, pct } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular, Formularsvar,
  Henter, Tom, Gitter, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import { MODUL, VALGFRIE_MODULER, ALLE_MODULER } from "../../fleet/moduler.js";
import {
  BRUGERART, ALLE_BRUGERARTER, tomPrisliste, validerPrisliste,
  gaeldendePrisliste, periodeGraenser,
} from "../../fleet/priser.js";
import { bpsTilPct } from "../../fleet/beloeb.js";
import { opretPrisliste, opretGrundlag, maalNu } from "../../fleet/udbyder.js";

/* Kroner i feltet, øre i basen. ⚠ oereFraKroner findes i format.js — skriv
   den ikke igen; to skalaer fakturerer 100× forkert. */
const kronerFelt = (oere) => (Number.isFinite(oere) && oere ? String(oere / 100) : "");
const oereFelt = (kroner) => {
  const n = Number(String(kroner).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/* ---- Ny prisliste ------------------------------------------------------ */

function Nyliste({ udgangspunkt, paaGemt, paaLuk }) {
  const [momssats, saetMoms] = useState(
    udgangspunkt && Number.isFinite(udgangspunkt.momssats) ? String(udgangspunkt.momssats) : ""
  );
  const [fra, saetFra] = useState(() => {
    /* Den 1. i næste måned. ⚠ Sæt ALTID gyldigFraMs til den 1.: generatoren
       bruger listen der gjaldt ved periodens BEGYNDELSE, og en dato midt i en
       måned slår derfor først igennem måneden efter — hvilket ingen forventer. */
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1))
      .toISOString().slice(0, 10);
  });
  const [p, saetP] = useState(() => {
    const start = tomPrisliste(ALLE_MODULER);
    const gl = udgangspunkt?.moduler || {};
    for (const m of Object.keys(start)) {
      start[m].basisOere = gl[m]?.basisOere || 0;
      start[m].prKoeretoejOere = gl[m]?.prKoeretoejOere || 0;
      for (const a of ALLE_BRUGERARTER) {
        start[m].prBrugerOere[a] = gl[m]?.prBrugerOere?.[a] || 0;
      }
    }
    return start;
  });
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saetSats = (modul, sti, kroner) => {
    saetSvar(null);
    saetP((x) => {
      const ny = { ...x, [modul]: { ...x[modul], prBrugerOere: { ...x[modul].prBrugerOere } } };
      if (sti.startsWith("bruger:")) ny[modul].prBrugerOere[sti.slice(7)] = oereFelt(kroner);
      else ny[modul][sti] = oereFelt(kroner);
      return ny;
    });
  };

  const liste = {
    gyldigFraMs: Date.parse(`${fra}T00:00:00.000Z`),
    momssats: Number(momssats),
    moduler: p,
  };
  const fejl = validerPrisliste(liste, { kendteModuler: ALLE_MODULER });
  const kanGemme = fejl.length === 0;

  const gem = async () => {
    saetGemmer(true);
    const r = await opretPrisliste(liste);
    saetGemmer(false);
    if (r.ok) paaGemt();
    else saetSvar({ ok: false, art: r.art, besked: r.besked });
  };

  return (
    <Kort titel={udgangspunkt ? "Ny prisliste (kopi af den gældende)" : "Første prisliste"}>
      <Formular onGem={gem} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel="Læg prislisten" onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="pl-fra" label="Gælder fra" kraevet type="date" vaerdi={fra} saet={saetFra}
                hint="Sæt den til den 1. Generatoren bruger den liste der gjaldt ved periodens begyndelse." />
          {/* ⚠ MOMSSATSEN GÆTTES IKKE. Ikke 25, ikke 0 — se validerLinje() i
              grundlag.js. Uden den kan grundlaget ikke eksporteres. */}
          <Felt id="pl-moms" label="Momssats (%)" kraevet vaerdi={momssats} saet={saetMoms}
                hint="Gættes ikke. Uden den nægtes eksporten." />
        </Feltraekke>

        <div style={{ overflowX: "auto" }}>
          <table className="fc-table">
            <thead>
              <tr>
                <th>Modul</th>
                <th style={{ textAlign: "right" }}>Pr. måned</th>
                {ALLE_BRUGERARTER.map((a) => (
                  <th key={a} style={{ textAlign: "right" }}>Pr. {BRUGERART[a].label.toLowerCase()}</th>
                ))}
                <th style={{ textAlign: "right" }}>Pr. køretøj</th>
              </tr>
            </thead>
            <tbody>
              {ALLE_MODULER.map((m) => (
                <tr key={m}>
                  <td>
                    <b>{MODUL[m].label}</b>
                    {MODUL[m].altid && <> <Pille tone="info">basis</Pille></>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input className="fc-input-tal" inputMode="decimal"
                           value={kronerFelt(p[m].basisOere)}
                           onChange={(e) => saetSats(m, "basisOere", e.target.value)} />
                  </td>
                  {ALLE_BRUGERARTER.map((a) => (
                    <td key={a} style={{ textAlign: "right" }}>
                      <input className="fc-input-tal" inputMode="decimal"
                             value={kronerFelt(p[m].prBrugerOere[a])}
                             onChange={(e) => saetSats(m, `bruger:${a}`, e.target.value)} />
                    </td>
                  ))}
                  <td style={{ textAlign: "right" }}>
                    <input className="fc-input-tal" inputMode="decimal"
                           value={kronerFelt(p[m].prKoeretoejOere)}
                           onChange={(e) => saetSats(m, "prKoeretoejOere", e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="fc-hint" style={{ marginTop: 10 }}>
          Kroner her, <b>øre</b> i basen. En sats på <b>0</b> faktureres ikke — så
          kan Flåde koste pr. køretøj og Bemanding pr. chauffør.
        </p>
        <p className="fc-hint" style={{ marginTop: 6 }}>
          ⚠ <b>Antallet er kundens, satsen er modulets.</b> Sætter du en
          brugerpris på fire moduler, betaler kunden fire gange pr. bruger. Vil
          du have den én gang for hele platformen, så sæt den på{" "}
          <b>{MODUL.dashboard.label}</b> — det modul ingen kan fravælge.
        </p>
        {fejl.length > 0 && (
          <ul className="fc-hint" style={{ marginTop: 8 }}>
            {fejl.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
      </Formular>
    </Kort>
  );
}

/* ---- Skærmen ----------------------------------------------------------- */

export default function Prisliste() {
  const [lister, saetLister] = useState(null);
  const [grundlag, saetGrundlag] = useState({});
  const [ny, saetNy] = useState(false);
  const [periode, saetPeriode] = useState(() => {
    /* Forrige måned. En periode der ikke er slut, kan ikke gøres op. */
    const n = new Date();
    const f = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1));
    return f.toISOString().slice(0, 7);
  });
  const [arbejder, saetArbejder] = useState(false);
  const [svar, saetSvar] = useState(null);

  const genindlaes = async () => {
    const [l, g] = await Promise.all([
      db.ref("udbyder/prisliste").once("value"),
      db.ref("udbyder/fakturagrundlag").once("value"),
    ]);
    saetLister(l.val() || {});
    saetGrundlag(g.val() || {});
  };
  useEffect(() => { genindlaes().catch(() => saetLister({})); }, []);

  if (lister === null) return <Henter hvad="prislisten" />;

  const alle = Object.entries(lister)
    .map(([id, l]) => ({ id, ...l }))
    .sort((a, b) => b.gyldigFraMs - a.gyldigFraMs);
  const gaeldende = gaeldendePrisliste(lister, Date.now());
  const g = periodeGraenser(periode);
  const periodeSlut = g && Date.now() > g.til;
  const findes = Boolean(grundlag[periode]);

  const kald = async (fn) => {
    saetArbejder(true);
    const r = await fn();
    saetArbejder(false);
    saetSvar(r.ok ? { ok: true } : { ok: false, art: r.art, besked: r.besked });
    if (r.ok) genindlaes();
    return r;
  };

  const raekker = findes ? Object.entries(grundlag[periode]).map(([id, x]) => ({ id, ...x })) : [];

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Prislister" vaerdi={num(alle.length)}
                 note={gaeldende ? `gældende fra ${dato(gaeldende.gyldigFraMs)}` : "ingen gælder endnu"} />
        <KpiKort label="Momssats"
                 vaerdi={gaeldende && Number.isFinite(gaeldende.momssats) ? `${gaeldende.momssats} %` : "—"}
                 note={gaeldende ? "" : "gættes ikke"} />
        <KpiKort label="Opgjorte perioder" vaerdi={num(Object.keys(grundlag).length)} />
      </KpiRaekke>

      {ny && (
        <Nyliste udgangspunkt={gaeldende} paaLuk={() => saetNy(false)}
                 paaGemt={() => { saetNy(false); genindlaes(); }} />
      )}

      <Kort
        titel="Prislister"
        handling={<Knap variant="primaer" onClick={() => saetNy(true)}>Ny prisliste</Knap>}
      >
        {!alle.length ? (
          <Tom>
            Ingen prisliste endnu. Uden en kan der ikke gøres en periode op —
            generatoren nægter frem for at gætte en pris.
          </Tom>
        ) : (
          <Tabel
            kolonner={[
              { key: "fra", label: "Gælder fra", render: (l) => (
                  <>
                    <b>{dato(l.gyldigFraMs)}</b>
                    {gaeldende?.id === l.id && <> <Pille tone="ok">gældende</Pille></>}
                  </>
                ) },
              { key: "moms", label: "Moms", render: (l) => `${l.momssats} %` },
              { key: "moduler", label: "Moduler med en pris", render: (l) => (
                  <span className="fc-hint">
                    {Object.keys(l.moduler || {})
                      .filter((m) => l.moduler[m]?.basisOere || l.moduler[m]?.prKoeretoejOere ||
                                     Object.values(l.moduler[m]?.prBrugerOere || {}).some(Boolean))
                      .map((m) => MODUL[m]?.label || m).join(", ") || "ingen"}
                  </span>
                ) },
            ]}
            raekker={alle}
            tom="Ingen prislister."
          />
        )}
        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>En liste rettes aldrig.</b> En ny pris er en ny liste med en ny
          dato — ellers kunne en faktura fra marts ikke genskabes efter en
          prisstigning i april.
        </p>
      </Kort>

      <Kort titel="Gør en periode op">
        <Feltraekke>
          <Felt id="gr-periode" label="Periode" vaerdi={periode}
                saet={(v) => { saetPeriode(v); saetSvar(null); }}
                hint="Én måned, fx 2026-07." />
        </Feltraekke>

        {!periodeSlut && (
          <div className="fc-empty fc-empty-warn">
            <p><b>Perioden er ikke slut endnu.</b></p>
            <p className="fc-hint" style={{ marginTop: 6 }}>
              Et grundlag der fryses for tidligt, mangler resten af måneden{" "}
              <b>for altid</b> — dokumentet regnes aldrig igen.
            </p>
          </div>
        )}

        {findes && (
          <p className="fc-hint">
            Opgjort {datoTid(raekker[0]?.genereretMs)} — <b>låst</b>. En rettelse
            er et nyt grundlag der henviser til det gamle; den vej er ikke bygget,
            og indtil den er, nægter generatoren at overskrive.
          </p>
        )}

        <div className="fc-formular-knapper" style={{ marginTop: 10 }}>
          <Knap variant="primaer" disabled={arbejder || !periodeSlut || findes}
                onClick={() => kald(() => opretGrundlag({ periode }))}>
            {arbejder ? "Arbejder …" : findes ? "Allerede opgjort" : `Gør ${periode} op`}
          </Knap>
          {/* ⚠ MÅLINGEN KAN IKKE LAVES BAGUD. Knappen findes for at kunne se
              at kæden virker uden at vente et døgn — ikke for at reparere en
              manglende dag. */}
          <Knap disabled={arbejder} onClick={() => kald(() => maalNu())}>
            Mål alle kunder nu
          </Knap>
        </div>
        <Formularsvar svar={svar} />

        {findes && (
          <Tabel
            kolonner={[
              { key: "id", label: "Kunde", render: (r) => <b>{r.kundeId}</b> },
              { key: "dage", label: "Dage", num: true,
                render: (r) => (
                  <>
                    {num(r.dageFaktureres)}
                    {r.dageFaktureres !== r.dageMaalt && (
                      <span className="fc-hint"> af {num(r.dageMaalt)} målt</span>
                    )}
                  </>
                ) },
              { key: "brugere", label: "Højeste brugere", render: (r) => (
                  <span className="fc-hint">
                    {ALLE_BRUGERARTER.map((a) =>
                      `${BRUGERART[a].label.toLowerCase()} ${r.hoejesteBrugere?.[a] ?? 0}`).join(", ")}
                  </span>
                ) },
              { key: "kt", label: "Køretøjer", num: true,
                render: (r) => num(r.hoejesteKoeretoejer) },
              { key: "rabat", label: "Rabat", num: true,
                render: (r) => (r.rabatBps ? pct(bpsTilPct(r.rabatBps)) : "—") },
              { key: "beloeb", label: "Ekskl. moms", num: true,
                render: (r) => <b>{kr(r.beloebOere)}</b> },
              /* ⚠ null, IKKE 0. Mangler en linje sin momssats, er et halvt
                 momsbeløb værre end intet — det ser ud som om det er regnet. */
              { key: "moms", label: "Moms", num: true,
                render: (r) => (r.momsOere === null || r.momsOere === undefined
                  ? <span className="fc-bad">mangler sats</span> : kr(r.momsOere)) },
            ]}
            raekker={raekker}
            tom="Ingen kunder i perioden."
          />
        )}
      </Kort>

      <p className="fc-hint">
        Grundlaget er et <b>frosset dokument</b>, ikke en beregning. Det gemmer
        sine egne satser og regner aldrig igen — ellers ville en faktura fra
        marts få nye tal i april. Skærmen viser hvad der står i dokumentet.
      </p>
    </div>
  );
}
