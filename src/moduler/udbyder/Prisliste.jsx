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
  Henter, Tom,
} from "../../fleet/ui.jsx";
import { MODUL, ALLE_MODULER } from "../../fleet/moduler.js";
import {
  BRUGERART, ALLE_BRUGERARTER, tomPrisliste, tomPlatform, validerPrisliste,
  gaeldendePrisliste, periodeGraenser, MOMSSATS,
} from "../../fleet/priser.js";
import { bpsTilPct, linjeBeloebOere } from "../../fleet/beloeb.js";
import { csv, csvOere, filnavn, hentFil } from "../../fleet/eksport.js";
import {
  opretPrisliste, opretGrundlag, maalNu, sletPrisliste,
} from "../../fleet/udbyder.js";

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

/* ⚠ HENTNINGEN LÅ HER SOM EN LOKAL FUNKTION, og den er flyttet til
   `eksport.js` da Fakturering fik brug for den samme (beslutning 98). To
   kopier af de samme fire linjer er hvordan den ene glemmer
   `revokeObjectURL`. */
const hent = hentFil;

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
            <th className="fc-num">Pr. måned</th>
            {ALLE_BRUGERARTER.map((a) => (
              <th key={a} className="fc-num">Pr. {BRUGERART[a].label.toLowerCase()}</th>
            ))}
            <th className="fc-num">Pr. enhed</th>
          </tr>
        </thead>
        <tbody>
          {raekker.map((r) => (
            <tr key={r.modul}>
              <td><b>{MODUL[r.modul]?.label || r.modul}</b></td>
              <td className="fc-num">{sats(r.basisOere)}</td>
              {ALLE_BRUGERARTER.map((a) => (
                <td key={a} className="fc-num">{sats(r.prBrugerOere?.[a])}</td>
              ))}
              <td className="fc-num">{sats(r.prKoeretoejOere)}</td>
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
      { navn: "Pr. enhed", hent: (r) => csvOere(r.prKoeretoejOere || 0) },
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
                              : l.akse === "koeretoej" ? "Enhed" : "Abonnement" },
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

/* ---- Fakturaopstillingen ------------------------------------------------ */

/** Linjens tekst. ⚠ MODULETS RIGTIGE NAVN — ikke et opdigtet produktnavn. */
function linjetekst(l) {
  if (l.akse === "platform") return "Platformsadgang";
  if (l.akse === "koeretoej") return "Enheder";
  if (l.akse === "bruger") {
    const navn = BRUGERART[l.brugerart]?.label || l.brugerart;
    /* ⚠ FRIMÆNGDEN STÅR I TEKSTEN, ikke i en fodnote. "1 · 3 inkluderet" er
       det der forklarer hvorfor beløbet er nul — se beslutning 36. */
    return l.inkluderet
      ? `${navn}e (${num(l.enheder)} · ${num(l.inkluderet)} inkluderet)`
      : `${navn}e`;
  }
  return MODUL[l.modul]?.label || l.modul;
}

/**
 * Ét grundlag som en faktura.
 *
 * ⚠ DEN REGNER IKKE. Hvert beløb står som det blev FROSSET ved generingen.
 * En genberegning her kunne give et andet tal end det kunden fik — og så
 * ville skærmen og fakturaen være uenige uden at nogen kunne se hvorfor.
 * `linjeBeloebOere` bruges kun til at lægge linjens egne to tal sammen.
 */
function Faktura({ kunde, periode, g }) {
  const linjer = g.linjer || [];

  /* ⚠ ET FROSSET DOKUMENT UDEN LINJER ER IKKE EN VISNINGSFEJL. Det blev
     opgjort dengang der ikke var maalt noget — og det regnes aldrig igen.
     Skaermen skal sige hvad der skete, ikke vise en tom tabel og lade
     laeseren gaette. Samme regel som "for lidt grundlag" frem for en streg. */
  if (!linjer.length) {
    return (
      <div className="fc-empty fc-empty-info">
        <p><b>Opgjort uden linjer.</b></p>
        <p className="fc-hint" style={{ marginTop: 6 }}>
          Der var <b>{num(g.dageMaalt)} maalte dage</b> og{" "}
          <b>{num(g.dageFaktureres)} fakturerbare</b> i {periode}. Er begge nul,
          fandtes der endnu ingen daglig maaling for kunden — den kan ikke laves
          bagud.
        </p>
        <p className="fc-hint" style={{ marginTop: 6 }}>
          Dokumentet er <b>laast</b> og regnes aldrig igen. Opgjort{" "}
          {datoTid(g.genereretMs)}.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="fc-scroll">
        <table className="fc-table">
          <thead>
            <tr>
              <th>Beskrivelse</th>
              <th className="fc-num">Antal</th>
              <th className="fc-num">Stk.pris</th>
              <th className="fc-num">Rabat</th>
              <th className="fc-num">Beløb</th>
            </tr>
          </thead>
          <tbody>
            {linjer.map((l, i) => (
              <tr key={`${l.modul}-${l.akse}-${l.brugerart || ""}-${i}`}>
                <td>
                  {linjetekst(l)}
                  {l.dage !== l.dageIPerioden && (
                    <div className="fc-hint">
                      {num(l.dage)} af {num(l.dageIPerioden)} dage
                    </div>
                  )}
                </td>
                {/* Det MÅLTE antal — ikke det fakturerbare. Forskellen står i
                    beskrivelsen som "3 inkluderet". */}
                <td className="fc-num">{num(l.enheder)}</td>
                <td className="fc-num">{kr(l.listeprisOere)}</td>
                <td className="fc-num">
                  {l.rabatBps ? pct(bpsTilPct(l.rabatBps)) : <span className="fc-neutral">—</span>}
                </td>
                <td className="fc-num"><b>{kr(linjeBeloebOere(l))}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}><b>I alt (ekskl. moms)</b></td>
              <td className="fc-num"><b>{kr(g.beloebOere)}</b></td>
            </tr>
            <tr>
              <td colSpan={4}>Moms {Number.isFinite(g.momssats) ? `${g.momssats} %` : ""}</td>
              <td className="fc-num">
                {/* ⚠ null, IKKE 0. Mangler en linje sin momssats, er et halvt
                    momsbeløb værre end intet — det ser ud som om det er regnet. */}
                {g.momsOere === null || g.momsOere === undefined
                  ? <span className="fc-bad">mangler sats</span> : kr(g.momsOere)}
              </td>
            </tr>
            <tr>
              <td colSpan={4}><b>Total</b></td>
              <td className="fc-num">
                <b>{g.ialtOere === null || g.ialtOere === undefined
                  ? <span className="fc-bad">—</span> : kr(g.ialtOere)}</b>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="fc-hint" style={{ marginTop: 12 }}>
        {kunde?.navn || g.kundeId} · {periode} · opgjort {datoTid(g.genereretMs)} ·{" "}
        <b>låst</b>. Beløbene står som de blev frosset og regnes aldrig igen.
      </p>
      <p className="fc-hint" style={{ marginTop: 6 }}>
        {num(g.dageFaktureres)} dage faktureret
        {g.dageFaktureres !== g.dageMaalt && <> af {num(g.dageMaalt)} målte</>} — højeste
        antal i perioden. Dage på pause eller opsagt tæller ikke med.
        {g.rabatBps > 0 && <> Rabat på alt: <b>{pct(bpsTilPct(g.rabatBps))}</b>.</>}
      </p>
    </div>
  );
}

/* ---- Ny prisliste ------------------------------------------------------- */

function Nyliste({ udgangspunkt, paaGemt, paaLuk }) {

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
  /* ⚠ PLATFORMSADGANGEN STAAR FOR SIG — den er ikke et modul. Se noten ved
     PLATFORM i priser.js om hvorfor den ikke er dashboard-modulet. */
  const [pf, saetPf] = useState(() => {
    const start = tomPlatform();
    const gl = udgangspunkt?.platform || {};
    start.basisOere = gl.basisOere || 0;
    for (const a of ALLE_BRUGERARTER) {
      start.inkluderetBrugere[a] = gl.inkluderetBrugere?.[a] || 0;
    }
    return start;
  });
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  /* Brugerpriser der laa paa et MODUL i den liste vi kopierer fra. */
  const gamleBrugerpriser = Object.entries(udgangspunkt?.moduler || {})
    .flatMap(([modul, m]) => Object.entries(m?.prBrugerOere || {})
      .filter(([, oere]) => oere > 0)
      .map(([art, oere]) => ({ modul, art, oere })));

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
    momssats: MOMSSATS,
    platform: pf,
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
    <Kort className="fc-ikke-print"
          titel={udgangspunkt ? "Ny prisliste (kopi af den gældende)" : "Første prisliste"}>
      <Formular onGem={gem} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel="Læg prislisten" onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="pl-fra" label="Gælder fra" kraevet type="date" vaerdi={fra} saet={saetFra}
                hint="Listen gælder fra denne dato og fremad — indtil en nyere liste tager over." />
        </Feltraekke>

        {/* ⚠ MOMSSATSEN ER FAST OG SÆTTES IKKE HER. Det er FleetControls egen
            faktura til en dansk vognmand: 25 % hver gang. Et åbent felt ville
            ikke give præcision, men en tastefejl at lave. Se MOMSSATS i
            priser.js — og noten dér om hvorfor det IKKE er samme sag som
            kundens eget fakturagrundlag, hvor satsen faktisk varierer. */}
        <p className="fc-hint">
          Moms <b>{MOMSSATS} %</b> — fast. Sættes ét sted i koden, ikke pr. liste.
        </p>

        {/* ⚠ EN GAMMEL LISTE HAVDE BRUGERPRISER PAA MODULERNE. De foelger IKKE
            med over, fordi de nu hoerer paa platformen — og en kopi der taber
            et tal i stilhed, er vaerre end en der siger det. Satserne vises,
            saa de kan tastes ind ét sted i stedet. */}
        {gamleBrugerpriser.length > 0 && (
          <div className="fc-empty fc-empty-warn" style={{ marginBottom: 12 }}>
            <p><b>Brugerpriserne følger ikke med fra den gamle liste.</b></p>
            <p className="fc-hint" style={{ marginTop: 6 }}>
              Den havde dem på modulerne; de hører nu på platformen, hvor der
              er ÉN sats pr. brugerart. Tast dem ind nedenfor:{" "}
              {gamleBrugerpriser.map((g, i) => (
                <span key={`${g.modul}-${g.art}`}>
                  {i > 0 && ", "}
                  <b>{MODUL[g.modul]?.label || g.modul}</b>{" "}
                  {BRUGERART[g.art]?.label.toLowerCase()} {kr(g.oere)}
                </span>
              ))}.
            </p>
          </div>
        )}

        <p className="fc-hint" style={{ marginTop: 4 }}><b>Platformsadgang</b></p>
        <div className="fc-scroll">
          <table className="fc-table">
            <thead>
              <tr>
                <th>Grundbeløb pr. måned</th>
                {ALLE_BRUGERARTER.map((a) => (
                  <th key={`i-${a}`} className="fc-num">Inkl. {BRUGERART[a].label.toLowerCase()}e</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="fc-num">
                  <input className="fc-input-tal" inputMode="decimal"
                         aria-label="Grundbeløb pr. måned"
                         value={kronerFelt(pf.basisOere)}
                         onChange={(e) => { saetSvar(null);
                           saetPf((x) => ({ ...x, basisOere: oereFelt(e.target.value) })); }} />
                </td>
                {ALLE_BRUGERARTER.map((a) => (
                  <td key={`i-${a}`} className="fc-num">
                    {/* ⚠ ET ANTAL, IKKE KRONER. Frimængden er brugere der er
                        med i prisen — og den trækkes fra ÉN gang, ikke én
                        gang pr. modul. Se tomPlatform() i priser.js. */}
                    <input className="fc-input-tal fc-input-pct" inputMode="numeric"
                           aria-label={`Inkluderede ${BRUGERART[a].label}e`}
                           value={pf.inkluderetBrugere[a] || ""}
                           onChange={(e) => { saetSvar(null);
                             const n = Math.max(0, Math.round(Number(e.target.value) || 0));
                             saetPf((x) => ({ ...x, inkluderetBrugere: { ...x.inkluderetBrugere, [a]: n } })); }} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="fc-hint" style={{ marginTop: 12 }}><b>Moduler</b></p>
        <div className="fc-scroll">
          <table className="fc-table">
            <thead>
              <tr>
                <th>Modul</th>
                <th className="fc-num">Pr. måned</th>
                {ALLE_BRUGERARTER.map((a) => (
                  <th key={a} className="fc-num">Pr. {BRUGERART[a].label.toLowerCase()}</th>
                ))}
                <th className="fc-num">Pr. enhed</th>
              </tr>
            </thead>
            <tbody>
              {ALLE_MODULER.map((m) => (
                <tr key={m}>
                  <td>
                    <b>{MODUL[m].label}</b>
                    {MODUL[m].altid && <> <Pille tone="info">basis</Pille></>}
                    {/* Beskrivelsen fra kataloget — ét sted, ikke skrevet af. */}
                    <div className="fc-hint">{MODUL[m].hvad}</div>
                  </td>
                  <td className="fc-num">
                    <input className="fc-input-tal" inputMode="decimal"
                           value={kronerFelt(p[m].basisOere)}
                           onChange={(e) => saetSats(m, "basisOere", e.target.value)} />
                  </td>
                  {ALLE_BRUGERARTER.map((a) => (
                    <td key={a} className="fc-num">
                      <input className="fc-input-tal" inputMode="decimal"
                             aria-label={`${MODUL[m].label} pr. ${BRUGERART[a].label}`}
                             value={kronerFelt(p[m].prBrugerOere[a])}
                             onChange={(e) => saetSats(m, `bruger:${a}`, e.target.value)} />
                    </td>
                  ))}
                  <td className="fc-num">
                    <input className="fc-input-tal" inputMode="decimal"
                           aria-label={`${MODUL[m].label} pr. enhed`}
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
          kan Fleet koste pr. enhed og Workforce pr. chauffør.
        </p>
        <p className="fc-hint" style={{ marginTop: 6 }}>
          ⚠ <b>Antallet er kundens, satsen er modulets.</b> Sætter du en
          brugerpris på to moduler, betaler kunden to gange pr. bruger — og
          fakturaen får en linje for hver, så det kan ses.
        </p>
        <p className="fc-hint" style={{ marginTop: 6 }}>
          <b>Inkl.</b> er en frimængde på <b>abonnementet</b>: kun antallet ud
          over den faktureres, og den trækkes fra <b>én gang</b> — ikke én gang
          pr. modul. Linjen vises alligevel med 0 kr., så det kan ses at der
          blev målt.
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
  const [sletter, saetSletter] = useState(null);
  const [kunder, saetKunder] = useState([]);
  const [svar, saetSvar] = useState(null);

  /**
   * ⚠ EN AFVIST LAESNING ER IKKE 'INGEN PRISLISTER'.
   *
   * Her stod `.catch(() => saetLister({}))`, og det er samme fejl som
   * beslutning 26 handler om: reglerne VIRKEDE, og skaermen oversatte det
   * til at der ikke var noget. Fem prislister laa i basen mens skaermen
   * skrev 'Ingen prisliste endnu'.
   *
   * ⚠ OG DE TO LAESNINGER ER SKILT AD. De laa i ét Promise.all, saa en
   * afvisning paa fakturagrundlag skjulte prislisterne. To spoergsmaal, to
   * svar — den ene maa ikke kunne slaa den anden ihjel.
   */
  const [fejl, saetFejl] = useState(null);

  const genindlaes = async () => {
    saetFejl(null);
    try {
      saetLister((await db.ref("udbyder/prisliste").once("value")).val() || {});
    } catch (e) {
      saetLister({});
      saetFejl(e);
    }
    try {
      saetGrundlag((await db.ref("udbyder/fakturagrundlag").once("value")).val() || {});
    } catch (e) {
      saetGrundlag({});
      saetFejl((f) => f || e);
    }
    try {
      const i = (await db.ref("udbyder/kunder").once("value")).val() || {};
      const ider = Object.keys(i).sort((a, b) => a.localeCompare(b, "da"));
      /* Navnet staar under tenanten — ét sted. Se noten i Konsol.jsx. */
      saetKunder(await Promise.all(ider.map(async (id) => ({
        id,
        navn: (await db.ref(`tenants/${id}/virksomhed/navn`).once("value")).val() || id,
      }))));
    } catch (e) {
      saetKunder([]);
      saetFejl((f) => f || e);
    }
  };
  useEffect(() => { genindlaes(); }, []);

  if (lister === null) return <Henter hvad="prislisten" />;

  const alle = Object.entries(lister)
    .map(([id, l]) => ({ id, ...l }))
    .sort((a, b) => b.gyldigFraMs - a.gyldigFraMs);
  const gaeldende = gaeldendePrisliste(lister, Date.now());
  /* "Sidst rettet" er hvornår en liste sidst blev LAGT — ikke hvornår en
     pris begyndte at gælde. Se noten i toppen. */
  /* ⚠ HER STOD "REGNET, MEN VISES IKKE". Tallet nåede aldrig skærmen, og
     kommentaren ovenfor forklarede hvad det betød — til ingen. Det står nu i
     kortets hoved, hvor man kan se hvornår kataloget sidst blev rørt uden at
     åbne en liste. Se beslutning 67. */
  const sidstRettet = alle.reduce((m, l) => Math.max(m, l.oprettetMs || 0), 0);

  const g = periodeGraenser(periode);
  const periodeSlut = g && Date.now() > g.til;
  const findes = Boolean(grundlag[periode]);
  const raekker = findes
    ? Object.entries(grundlag[periode]).map(([id, x]) => ({ id, ...x }))
    : [];

  const aaben = alle.find((l) => l.id === aabenId) || null;

  /* Den nærmest FØLGENDE liste. `alle` er sorteret nyest først, så afløseren
     står lige før i rækken. */
  const afloeser = (l) => {
    const i = alle.findIndex((x) => x.id === l.id);
    return i > 0 ? alle[i - 1] : null;
  };

  /* ⚠ HVILKE PERIODER ER REGNET AF LISTEN. Samme opslag som funktionen laver
     — men her for at kunne SIGE det, ikke for at afgøre det. Afgørelsen
     ligger på serveren; ellers kunne en ændret klient slette en brugt liste. */
  const brugtI = (l) =>
    Object.entries(grundlag)
      .filter(([, kunder]) =>
        Object.values(kunder || {}).some((g) => g?.prislisteId === l.id))
      .map(([periode]) => periode)
      .sort();

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

      {fejl && (
        <div className="fc-empty fc-empty-bad">
          <p><b>Læsningen blev afvist.</b></p>
          <p className="fc-hint" style={{ marginTop: 6 }}>
            Det er ikke et tomt katalog — det er reglerne der virker. Har
            kontoen udbyderadgang? Den gives med <code>npm run ejer:giv</code>.
          </p>
          <p className="fc-hint" style={{ marginTop: 6 }}>{String(fejl?.message || fejl)}</p>
          <Knap onClick={genindlaes}>Prøv igen</Knap>
        </div>
      )}

      {ny && (
        <Nyliste udgangspunkt={gaeldende} paaLuk={() => saetNy(false)}
                 paaGemt={() => { saetNy(false); genindlaes(); }} />
      )}

      {sletter && (
        <Kort titel={`Slet prislisten der gælder fra ${dato(sletter.gyldigFraMs)}?`}>
          {/* ⚠ ADVARSLEN STÅR HER, AFVISNINGEN STÅR I FUNKTIONEN. En advarsel
              man kan klikke væk, er ikke en kontrol: er listen brugt til at
              gøre en periode op, afvises sletningen uanset hvad der klikkes. */}
          <div className="fc-empty fc-empty-warn">
            <p><b>Den forsvinder helt. Der er ingen fortryd.</b></p>
            <p className="fc-hint" style={{ marginTop: 6 }}>
              {brugtI(sletter).length > 0 ? (
                <>
                  ⚠ Listen er brugt til at gøre <b>{brugtI(sletter).join(", ")}</b> op.
                  Serveren <b>afviser</b> at slette den — et grundlag der peger
                  på en slettet prisliste, kan ikke dokumenteres.
                </>
              ) : (
                <>
                  Ingen opgørelse er regnet af den, så den er en kladde og ikke
                  regnskabsmateriale. Er den <b>gældende</b>, tager den
                  nærmest foregående liste over — og findes der ingen, kan der
                  ikke gøres en periode op før du lægger en ny.
                </>
              )}
            </p>
          </div>
          <div className="fc-formular-knapper">
            <Knap variant="primaer" disabled={arbejder || brugtI(sletter).length > 0}
                  onClick={async () => {
                    const r = await kald(() => sletPrisliste({ id: sletter.id }));
                    if (r.ok) { saetSletter(null); saetAabenId(null); }
                  }}>
              {arbejder ? "Sletter …" : "Slet prislisten"}
            </Knap>
            <Knap onClick={() => saetSletter(null)} disabled={arbejder}>Behold den</Knap>
          </div>
          <Formularsvar svar={svar} />
        </Kort>
      )}

      {/* ⚠ UD AF PRINTET. En udskrift skal kunne sendes til kunden, og han
          skal ikke have vores prisliste eller vores arbejdsgang med. Kun
          fakturaerne printes. */}
      <Kort
        className="fc-ikke-print"
        titel="Prislister"
        handling={
          <span className="fc-med-ikon fc-ikke-print" style={{ gap: 8 }}>
            <Knap onClick={() => window.print()}>Print</Knap>
            <Knap variant="primaer" onClick={() => saetNy(true)}>Ny prisliste</Knap>
          </span>
        }
      >
        {/* ⚠ "SIDST LAGT", IKKE "GÆLDER FRA". De to er forskellige spørgsmål:
            en liste kan LÆGGES i dag og GÆLDE fra næste kvartal, og tabellen
            nedenunder svarer allerede på det andet i to kolonner. Det her
            svarer på "har nogen rørt kataloget siden sidst" — ét spørgsmål om
            hele kataloget, som derfor hører over tabellen og ikke i den.
            ⚠ Og den står i kroppen frem for i `handling`: den skulle så have
            været en ny prop på det DELTE `Kort`, og en oplysning der gælder
            én skærm, hører ikke i skallen. */}
        {sidstRettet > 0 && (
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Sidst lagt <b>{dato(sidstRettet)}</b> — det er hvornår en liste blev
            lagt ind, ikke hvornår en pris begyndte at gælde.
          </p>
        )}
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
              /* ⚠ EN LISTE HAR INGEN SLUTDATO — den gælder til en NYERE tager
                 over. En liste lagt 1. januar gælder hele året, hvis der ikke
                 kommer en ny. Kolonnen regnes derfor af naboen i listen; den
                 er ikke et felt, og den må ikke blive det: et gemt "gælder
                 til" ville drive fra den næste liste. */
              { key: "til", label: "Gælder til", render: (l) => {
                  const naeste = afloeser(l);
                  return naeste
                    ? <span className="fc-hint">{dato(naeste.gyldigFraMs - 1)}</span>
                    : <span className="fc-hint">indtil videre</span>;
                } },
              { key: "lagt", label: "Lagt", render: (l) =>
                  (l.oprettetMs ? datoTid(l.oprettetMs) : <span className="fc-neutral">—</span>) },
              { key: "moms", label: "Moms", render: (l) => `${l.momssats} %` },
              /* ⚠ VENSTRESTILLET MED VILJE. Et antal er et tal, men kolonnen
                 staar mellem to tekstkolonner, og et enkelt ciffer klemt ud
                 til hoejre under en lang overskrift ser ud som en fejl. */
              { key: "antal", label: "Moduler med en pris", render: (l) =>
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
                    <Knap onClick={() => { saetSletter(l); saetSvar(null); }}
                          disabled={arbejder}>
                      Slet
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
          className="fc-ikke-print"
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

      <Kort className="fc-ikke-print" titel="Gør en periode op">
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
            {/* ⚠ ÉT KLIK, ALLE KUNDER. Dokumentet er stadig ét pr. kunde —
                det er handlingen der er samlet. Med tredive kunder ville
                tredive klik være en månedlig opgave ingen orker. */}
            <Knap variant="primaer" disabled={arbejder || !periodeSlut}
                  onClick={() => kald(() => opretGrundlag({ periode }))}>
              {arbejder ? "Danner …" : `Dan fakturagrundlag for ${periode}`}
            </Knap>
            {/* ⚠ MÅLINGEN KAN IKKE LAVES BAGUD. Knappen findes for at kunne se
                at kæden virker uden at vente et døgn — ikke for at reparere en
                manglende dag. */}
            <Knap disabled={arbejder} onClick={() => kald(() => maalNu())}>
              Mål alle kunder nu
            </Knap>
            {raekker.length > 0 && (
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

        {/* ⚠ ÉN RÆKKE PR. KUNDE, OGSÅ FØR DER ER GJORT OP. Grundlaget er et
            SELVSTÆNDIGT dokument pr. kunde — én kunde uden målinger må ikke
            holde de andre tilbage. En delvis opgørelse er kun farlig hvis den
            er usynlig, og her kan den ses. */}
        {kunder.length > 0 && (
          <>
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Et opgjort grundlag er <b>låst</b>. En rettelse er et nyt grundlag
              der henviser til det gamle; den vej er ikke bygget, og indtil den
              er, nægter generatoren at overskrive.
            </p>
            <Tabel
              noegle={(r) => r.id}
              kolonner={[
                { key: "id", label: "Kunde", render: (r) => (
                    <>
                      <b>{r.navn}</b>
                      <div className="fc-hint">{r.id}</div>
                    </>
                  ) },
                { key: "tilstand", label: "Status", render: (r) => (
                    r.g ? <Pille tone="ok">opgjort</Pille>
                        : <Pille tone="info">ikke opgjort</Pille>
                  ) },
                { key: "dage", label: "Dage", num: true, render: (r) => (
                    r.g ? (
                      <>
                        {num(r.g.dageFaktureres)}
                        {r.g.dageFaktureres !== r.g.dageMaalt && (
                          <span className="fc-hint"> af {num(r.g.dageMaalt)} målt</span>
                        )}
                      </>
                    ) : <span className="fc-neutral">—</span>
                  ) },
                { key: "kt", label: "Enheder", num: true,
                  render: (r) => (r.g ? num(r.g.hoejesteKoeretoejer) : <span className="fc-neutral">—</span>) },
                { key: "rabat", label: "Rabat", num: true,
                  render: (r) => (r.g ? (r.g.rabatBps ? pct(bpsTilPct(r.g.rabatBps)) : "—")
                                      : <span className="fc-neutral">—</span>) },
                { key: "beloeb", label: "Ekskl. moms", num: true,
                  render: (r) => (r.g ? <b>{kr(r.g.beloebOere)}</b> : <span className="fc-neutral">—</span>) },
                /* ⚠ null, IKKE 0. Mangler en linje sin momssats, er et halvt
                   momsbeløb værre end intet — det ser ud som om det er regnet. */
                { key: "moms", label: "Moms", num: true,
                  render: (r) => (!r.g ? <span className="fc-neutral">—</span>
                    : r.g.momsOere === null || r.g.momsOere === undefined
                      ? <span className="fc-bad">mangler sats</span> : kr(r.g.momsOere)) },
                { key: "opgjort", label: "Opgjort", render: (r) => (
                    r.g ? <span className="fc-hint">{datoTid(r.g.genereretMs)}</span>
                        : <span className="fc-neutral">—</span>
                  ) },
              ]}
              raekker={kunder.map((k) => ({ ...k, g: grundlag[periode]?.[k.id] || null }))}
              tom="Ingen kunder."
            />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Udtrækket indeholder <b>linjerne</b>, ikke totalerne. En revisor
              lægger linjerne sammen — det er præcis hvad man gør, når man er
              uenig — og beløbene står som de blev <b>frosset</b>, ikke regnet igen.
            </p>
          </>
        )}
      </Kort>

      {/* ⚠ ÉN FAKTURA PR. KUNDE, UNDER HINANDEN — og hver starter paa sin egen
          side i print (fc-side-skift). Det er dét "opdelt hver for sig"
          betyder paa en udskrift: man river arkene fra hinanden og sender ét
          til hver. En samlet tabel over alle kunders linjer kan ingen sende. */}
      {raekker.map((g, i) => (
        <div key={g.id} className={i > 0 ? "fc-side-skift" : undefined}>
          <Kort
            /* ⚠ KUN FIRMANAVN OG PERIODE. Arket skal kunne sendes som det
               er, og "Fakturagrundlag" er vores ord for det — ikke kundens. */
            titel={`${kunder.find((k) => k.id === g.kundeId)?.navn || g.kundeId} — ${periode}`}
            handling={
              <span className="fc-med-ikon fc-ikke-print" style={{ gap: 8 }}>
                <Knap onClick={() => hent(
                        grundlagCsv(periode, [g]),
                        filnavn(`fakturagrundlag-${g.kundeId}-${periode}`, g.genereretMs))}>
                  Excel
                </Knap>
              </span>
            }
          >
            <Faktura kunde={kunder.find((k) => k.id === g.kundeId)}
                     periode={periode} g={g} />
          </Kort>
        </div>
      ))}
    </div>
  );
}
