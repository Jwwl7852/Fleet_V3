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
 *
 * ⚠ TO DATOER, OG DE BETYDER IKKE DET SAMME. `gyldigFraMs` er hvornår prisen
 * GÆLDER; `oprettetMs` er hvornår listen blev LAGT. En liste kan lægges i dag
 * og gælde fra den 1. i næste måned. "Sidst rettet" er den ene, ikke den anden,
 * og skærmen skriver begge.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../../firebase.js";
import { kr, num, dato, datoTid, pct } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular, Formularsvar,
  Henter, Tom, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import { MODUL, ALLE_MODULER } from "../../fleet/moduler.js";
import {
  BRUGERART, ALLE_BRUGERARTER, tomPrisliste, validerPrisliste,
  gaeldendePrisliste, periodeGraenser,
} from "../../fleet/priser.js";
import { bpsTilPct } from "../../fleet/beloeb.js";
import { csv, csvOere, filnavn } from "../../fleet/eksport.js";
import { opretPrisliste, opretGrundlag, maalNu } from "../../fleet/udbyder.js";

/* Kroner i feltet, øre i basen. ⚠ To skalaer fakturerer 100× forkert. */
const kronerFelt = (oere) => (Number.isFinite(oere) && oere ? String(oere / 100) : "");
const oereFelt = (kroner) => {
  const n = Number(String(kroner).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/* En sats på nul faktureres ikke — den skal ikke se ud som "0,00 kr". */
const sats = (oere) => (Number.isFinite(oere) && oere ? kr(oere) : <span className="fc-neutral">—</span>);
const harSats = (p) =>
  Boolean(p?.basisOere || p?.prKoeretoejOere ||
          Object.values(p?.prBrugerOere || {}).some(Boolean));

/** Hent en fil i browseren. ⚠ URL'en frigives igen — ellers holder fanen den. */
function hent(indhold, navn) {
  const blob = new Blob([indhold], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = navn;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---- Satserne, som de står ---------------------------------------------- */

/**
 * ⚠ MODULER UDEN ÉN ENESTE SATS UDELADES SOM UDGANGSPUNKT. En tabel over ti
 * moduler hvor syv står tomme, er en tabel man skal lede i. Kontakten findes
 * for den der vil se hvad der IKKE koster noget.
 */
function Satser({ liste, visAlle }) {
  const raekker = ALLE_MODULER
    .map((m) => ({ modul: m, ...(liste.moduler?.[m] || {}) }))
    .filter((r) => visAlle || harSats(r));

  if (!raekker.length) return <Tom>Ingen satser på listen. Den fakturerer ingenting.</Tom>;

  return (
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
          {raekker.map((r) => (
            <tr key={r.modul}>
              <td><b>{MODUL[r.modul]?.label || r.modul}</b></td>
              <td style={{ textAlign: "right" }}>{sats(r.basisOere)}</td>
              {ALLE_BRUGERARTER.map((a) => (
                <td key={a} style={{ textAlign: "right" }}>{sats(r.prBrugerOere?.[a])}</td>
              ))}
              <td style={{ textAlign: "right" }}>{sats(r.prKoeretoejOere)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Prislisten som regnearksrækker. Samme kolonner som på skærmen. */
const prislisteCsv = (liste) =>
  csv(
    ALLE_MODULER.map((m) => ({ modul: m, ...(liste.moduler?.[m] || {}) })),
    [
      { navn: "Modul", hent: (r) => MODUL[r.modul]?.label || r.modul },
      { navn: "Pr. måned", hent: (r) => csvOere(r.basisOere || 0) },
      ...ALLE_BRUGERARTER.map((a) => ({
        navn: `Pr. ${BRUGERART[a].label.toLowerCase()}`,
        hent: (r) => csvOere(r.prBrugerOere?.[a] || 0),
      })),
      { navn: "Pr. køretøj", hent: (r) => csvOere(r.prKoeretoejOere || 0) },
      { navn: "Momssats (%)", hent: () => liste.momssats },
      { navn: "Gælder fra", hent: () => dato(liste.gyldigFraMs) },
    ]
  );

/** Ét grundlags LINJER — ikke totalerne. En revisor lægger linjerne sammen. */
const grundlagCsv = (periode, raekker) =>
  csv(
    raekker.flatMap((g) => (g.linjer || []).map((l) => ({ g, l }))),
    [
      { navn: "Periode", hent: () => periode },
      { navn: "Kunde", hent: ({ g }) => g.kundeId },
      { navn: "Modul", hent: ({ l }) => MODUL[l.modul]?.label || l.modul },
      { navn: "Type", hent: ({ l }) =>
          l.akse === "bruger" ? BRUGERART[l.brugerart]?.label || l.brugerart
                              : l.akse === "koeretoej" ? "Køretøj" : "Abonnement" },
      { navn: "Enheder", hent: ({ l }) => l.enheder },
      { navn: "Dage", hent: ({ l }) => l.dage },
      { navn: "Dage i perioden", hent: ({ l }) => l.dageIPerioden },
      { navn: "Listepris", hent: ({ l }) => csvOere(l.listeprisOere) },
      { navn: "Rabat (%)", hent: ({ l }) => bpsTilPct(l.rabatBps || 0) },
      { navn: "Sats", hent: ({ l }) => csvOere(l.satsOere) },
      /* ⚠ BELØBET REGNES IKKE HER. Det står på linjen som det blev frosset —
         en genberegning i en eksport kunne give et andet tal end fakturaen. */
      { navn: "Beløb ekskl. moms", hent: ({ l }) =>
          csvOere(Math.round(((l.antal || 0) * (l.satsOere || 0)) / 1000)) },
      { navn: "Momssats (%)", hent: ({ l }) => l.momssats },
    ]
  );

/* ---- Ny prisliste ------------------------------------------------------- */

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

/* ---- Skærmen ------------------------------------------------------------ */

export default function Prisliste() {
  const [lister, saetLister] = useState(null);
  const [grundlag, saetGrundlag] = useState({});
  const [ny, saetNy] = useState(false);
  const [aabenId, saetAabenId] = useState(null);
  const [visAlle, saetVisAlle] = useState(false);
  const [periode, saetPeriode] = useState(() => {
    /* Forrige måned. En periode der ikke er slut, kan ikke gøres op. */
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1))
      .toISOString().slice(0, 7);
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
  /* "Sidst rettet" er hvornår en liste sidst blev LAGT — ikke hvornår en
     pris begyndte at gælde. Se noten i toppen. */
  const sidstRettet = alle.reduce((m, l) => Math.max(m, l.oprettetMs || 0), 0);

  const g = periodeGraenser(periode);
  const periodeSlut = g && Date.now() > g.til;
  const findes = Boolean(grundlag[periode]);
  const raekker = findes
    ? Object.entries(grundlag[periode]).map(([id, x]) => ({ id, ...x }))
    : [];

  const aaben = alle.find((l) => l.id === aabenId) || null;

  const kald = async (fn) => {
    saetArbejder(true);
    const r = await fn();
    saetArbejder(false);
    saetSvar(r.ok ? { ok: true } : { ok: false, art: r.art, besked: r.besked });
    if (r.ok) genindlaes();
    return r;
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {/* ⚠ TILBAGE-LINKET ER IKKE PYNT. Konsollen har ingen sidebar (en ejer
          står ikke i en kundekontekst), så uden det er browserens tilbageknap
          den eneste vej — og den findes ikke, hvis man kom via et link. */}
      <div className="fc-med-ikon fc-ikke-print" style={{ gap: 12 }}>
        <Link className="fc-a" to="/main">← Kunder</Link>
        <span className="fc-hint">Priser &amp; fakturagrundlag</span>
      </div>

      <KpiRaekke>
        <KpiKort label="Prislister" vaerdi={num(alle.length)}
                 note={gaeldende ? `gældende fra ${dato(gaeldende.gyldigFraMs)}` : "ingen gælder endnu"} />
        <KpiKort label="Momssats"
                 vaerdi={gaeldende && Number.isFinite(gaeldende.momssats) ? `${gaeldende.momssats} %` : "—"}
                 note={gaeldende ? "" : "gættes ikke"} />
        <KpiKort label="Sidst rettet"
                 vaerdi={sidstRettet ? dato(sidstRettet) : "—"}
                 note={sidstRettet ? "en ny liste blev lagt" : "ingen lister"} />
        <KpiKort label="Opgjorte perioder" vaerdi={num(Object.keys(grundlag).length)} />
      </KpiRaekke>

      {ny && (
        <Nyliste udgangspunkt={gaeldende} paaLuk={() => saetNy(false)}
                 paaGemt={() => { saetNy(false); genindlaes(); }} />
      )}

      <Kort
        titel="Prislister"
        handling={
          <span className="fc-med-ikon fc-ikke-print" style={{ gap: 8 }}>
            <Knap onClick={() => window.print()}>Print</Knap>
            <Knap variant="primaer" onClick={() => saetNy(true)}>Ny prisliste</Knap>
          </span>
        }
      >
        {!alle.length ? (
          <Tom>
            Ingen prisliste endnu. Uden en nægter generatoren at gøre en periode
            op — den gætter ikke en pris.
          </Tom>
        ) : (
          <Tabel
            kolonner={[
              { key: "fra", label: "Gælder fra", render: (l) => (
                  <>
                    <b>{dato(l.gyldigFraMs)}</b>
                    {gaeldende?.id === l.id && <> <Pille tone="ok">gældende</Pille></>}
                    {l.gyldigFraMs > Date.now() && <> <Pille tone="info">kommende</Pille></>}
                  </>
                ) },
              { key: "lagt", label: "Lagt", render: (l) =>
                  (l.oprettetMs ? datoTid(l.oprettetMs) : <span className="fc-neutral">—</span>) },
              { key: "moms", label: "Moms", render: (l) => `${l.momssats} %` },
              { key: "antal", label: "Moduler med en pris", num: true, render: (l) =>
                  num(ALLE_MODULER.filter((m) => harSats(l.moduler?.[m])).length) },
              { key: "handling", label: "", render: (l) => (
                  <span className="fc-med-ikon fc-ikke-print" style={{ gap: 6 }}>
                    <Knap onClick={() => saetAabenId(aabenId === l.id ? null : l.id)}>
                      {aabenId === l.id ? "Skjul" : "Vis satser"}
                    </Knap>
                    <Knap onClick={() => hent(prislisteCsv(l),
                            filnavn(`prisliste-gaelder-${dato(l.gyldigFraMs)}`, l.oprettetMs))}>
                      Excel
                    </Knap>
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
          prisstigning i april. <b>Lagt</b> er hvornår listen blev skrevet;{" "}
          <b>Gælder fra</b> er hvornår prisen slår igennem.
        </p>
      </Kort>

      {aaben && (
        <Kort
          titel={`Satser — gælder fra ${dato(aaben.gyldigFraMs)}`}
          handling={
            <span className="fc-med-ikon fc-ikke-print" style={{ gap: 8 }}>
              <label className="fc-hint fc-med-ikon" style={{ gap: 6 }}>
                <input type="checkbox" checked={visAlle}
                       onChange={() => saetVisAlle((v) => !v)} />
                Vis moduler uden pris
              </label>
              <Knap onClick={() => hent(prislisteCsv(aaben),
                      filnavn(`prisliste-gaelder-${dato(aaben.gyldigFraMs)}`, aaben.oprettetMs))}>
                Hent som Excel
              </Knap>
              <Knap onClick={() => window.print()}>Print</Knap>
            </span>
          }
        >
          <Satser liste={aaben} visAlle={visAlle} />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Moms <b>{aaben.momssats} %</b>. Lagt{" "}
            {aaben.oprettetMs ? datoTid(aaben.oprettetMs) : "— (før datoen blev gemt)"}.
            En streg betyder <b>ingen sats</b> — den akse faktureres ikke.
          </p>
        </Kort>
      )}

      <Kort titel="Gør en periode op">
        <div className="fc-ikke-print">
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
            {findes && (
              <>
                <Knap onClick={() => hent(grundlagCsv(periode, raekker),
                        filnavn(`fakturagrundlag-${periode}`, raekker[0]?.genereretMs))}>
                  Hent som Excel
                </Knap>
                <Knap onClick={() => window.print()}>Print</Knap>
              </>
            )}
          </div>
          <Formularsvar svar={svar} />
        </div>

        {findes && (
          <>
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Opgjort {datoTid(raekker[0]?.genereretMs)} — <b>låst</b>. En rettelse
              er et nyt grundlag der henviser til det gamle; den vej er ikke
              bygget, og indtil den er, nægter generatoren at overskrive.
            </p>
            <Tabel
              kolonner={[
                { key: "id", label: "Kunde", render: (r) => <b>{r.kundeId}</b> },
                { key: "dage", label: "Dage", num: true, render: (r) => (
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
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Udtrækket indeholder <b>linjerne</b>, ikke totalerne. En revisor
              lægger linjerne sammen — det er præcis hvad man gør, når man er
              uenig — og beløbene står som de blev <b>frosset</b>, ikke regnet igen.
            </p>
          </>
        )}
      </Kort>
    </div>
  );
}
