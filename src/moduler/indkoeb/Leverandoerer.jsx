/* src/moduler/indkoeb/Leverandoerer.jsx
 * Leverandører — performance, aftaler og priser. BESLUTNING 25.
 *
 * ⚠ BESLUTNING 25 ER ANTAGELSER, IKKE AFGJORTE KRAV. Hvilke seks tal en
 * vognmand faktisk styrer efter, skal efterprøves hos første kunde. Derfor
 * ligger de i ét katalog i leverandoerer.js frem for spredt ud her — skal et
 * af dem skiftes ud, er der ét sted at gøre det.
 *
 * Der findes INGEN mockup for denne skærm.
 *
 * ---------------------------------------------------------------------------
 * ⚠ 1. ET NØGLETAL UDEN SIT GRUNDLAG ER VILDLEDENDE.
 * "50 % til tiden" betyder noget helt andet ved to leveringer end ved to
 * hundrede — men i en tabel ser de ens ud. Hvert tal står derfor MED antallet
 * det er regnet på, og under grænsen står der "for lidt grundlag" frem for en
 * procent. Det er den eneste ærlige måde at stille leverandører op ved siden
 * af hinanden.
 *
 * ⚠ 2. SAMME TAL, TO BETYDNINGER. En prisafvigelse på 4 % er et brud på en
 * fastaftale og helt almindeligt på et spotkøb. Farven kommer derfor fra
 * aftaleformen, ikke fra tallet. En tabel der farver dem ens, lærer indkøberen
 * at ignorere farven.
 *
 * ⚠ 3. EN SATS OVERSKRIVES ALDRIG (beslutning 7). Prislisten er en historik,
 * ikke et opslagsværk: en faktura fra marts måles mod martsprisen. Kommende
 * reguleringer vises for sig, så en stigning kan ses FØR den rammer.
 * ---------------------------------------------------------------------------
 *
 * FASE 0: VISNING. Der skrives ingenting.
 */
import { useState } from "react";
import { kr, num, pct, dato, deviation } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Gitter, MiniLinje,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  LEVERANDOER_KATEGORI, AFTALETYPE,
  beregnNoegletal, prisafvigelseTone, MINDSTE_GRUNDLAG,
  gaeldendePrisliste, kommendePriser, indkoebBeloebOere, leverandoerFraDb,
} from "../../fleet/leverandoerer.js";
import {
  DEMO_FAKTURAER, DEMO_LEVERANDOERSAGER,
} from "../../fleet/demo-indkoeb.js";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";

export default function Leverandoerer() {
  const { kpi: k, henter, fejl, tilstand, genindlaes } = useKpi();

  /* ⚠ LEVERANDØREN KOM FRA demo-indkoeb.js INDTIL NODEN FANDTES. Den fandtes
     ikke: `leverandoerer` stod slet ikke i firebase.rules.json, selv om BÅDE
     indkoeb og fakturaer har indekseret leverandoerId siden de blev skrevet.

     ⚠ division: "alle". Leverandøren BÆRER en division (modsat et køretøj —
     se beslutning 19), men skærmen er hele kartoteket: Crawford leverer til
     begge, og en indkøber i Gods skal kunne se hvem Bus handler med når han
     skal finde en ny dækleverandør. Havde vi delt, ville en leverandør
     forsvinde ud af listen uden at nogen havde ændret noget. */
  const {
    data: raa, henter: henterLev, tilstand: levTilstand, genindlaes: genindlaesLev,
  } = useListe("leverandoerer", { ordnPaa: "navn", vindue: "alle", division: "alle", graense: 500 });

  const {
    data: indkoeb, henter: henterIndkoeb,
  } = useListe("indkoeb", { ordnPaa: "dato", vindueDage: 400, division: "alle", graense: 500 });

  const [valgtId, setValgtId] = useState("lv-hydra");

  if (henter || henterLev || henterIndkoeb) return <Henter hvad="leverandører" />;
  /* En AFVIST læsning af kartoteket er ikke en tom liste — se noten i
     Indkøb-oversigten. */
  if (blokerer(levTilstand)) {
    return <Datatilstand tilstand={levTilstand} genprov={genindlaesLev} />;
  }
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  /* ⚠ OVERSAT FRA BASEN. `prisliste` er et objekt i RTDB og en array i
     domænekoden — prisPaa() filtrerer på den. Uden det her kald kaster
     ".filter is not a function" inde i beregnNoegletal(), og skærmen bliver
     hvid. Det er den samme fejl fraDb() i grundlag.js findes for. */
  const leverandoerer = raa.map((l) => leverandoerFraDb(l, l.id));
  const KILDER = { indkoeb, fakturaer: DEMO_FAKTURAER, sager: DEMO_LEVERANDOERSAGER };

  const aktive = leverandoerer.filter((l) => l.aktiv);
  const valgt = leverandoerer.find((l) => l.id === valgtId) || null;

  /* Nøgletallene BEREGNES her — beslutning 6. Et gemt performancetal driver
     fra de fakturaer det blev regnet på, og så rangerer man sine leverandører
     efter et tal ingen kan genfinde. */
  const raekker = aktive.map((l) => ({ l, n: beregnNoegletal(l, KILDER) }));

  const samletOere = indkoeb.reduce((s, i) => s + indkoebBeloebOere(i), 0);
  const udenFaktura = raekker.reduce((s, r) => s + r.n.manglendeFakturaer.vaerdi, 0);
  /* AFLEDT af listen — hører derfor ikke i kpi/. */
  const forTyndt = raekker.filter((r) => !r.n.leveringspraecisionPct.nokData).length;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {k && (
        <KpiRaekke>
          <KpiKort label="Aktive leverandører" vaerdi={num(aktive.length)} />
          <KpiKort label="Indkøb i perioden" vaerdi={kr(samletOere)} note="ekskl. moms" />
          <KpiKort label="Indkøb uden faktura" vaerdi={num(udenFaktura)}
                   tone={udenFaktura ? "warn" : undefined} note="ryk leverandøren" />
          {/* ⚠ ET TAL DER SIGER HVAD VI IKKE VED. Det hører på skærmen: uden det
              ser en tabel med mange tomme felter ud som en fejl frem for som en
              oplysning om at grundlaget er tyndt. */}
          <KpiKort label="For lidt grundlag" vaerdi={num(forTyndt)}
                   note={`under ${MINDSTE_GRUNDLAG} leveringer`} />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Leverandører">
        <Tabel
          kolonner={[
            { key: "navn", label: "Leverandør", render: (r) => r.l.navn },
            { key: "kategori", label: "Kategori",
              render: (r) => LEVERANDOER_KATEGORI[r.l.kategori] || r.l.kategori },
            { key: "aftale", label: "Aftale",
              render: (r) => AFTALETYPE[r.l.aftale?.type]?.label || "—" },
            { key: "omsaetning", label: "Indkøb", num: true,
              render: (r) => kr(r.n.omsaetningOere) },
            { key: "praecision", label: "Til tiden", num: true,
              render: (r) => <Tal m={r.n.leveringspraecisionPct} vis={(v) => pct(v)} enhed="leveringer" /> },
            { key: "pris", label: "Prisafvigelse", num: true,
              render: (r) => (
                <Tal m={r.n.prisafvigelsePct} enhed="køb"
                     tone={prisafvigelseTone(r.l, r.n.prisafvigelsePct.vaerdi)}
                     vis={(v) => deviation(v, { betterWhen: "lower", unit: "pct", dec: 1 }).text} />
              ) },
            { key: "mangler", label: "Uden faktura", num: true,
              render: (r) => r.n.manglendeFakturaer.vaerdi || "—" },
          ]}
          raekker={raekker}
          noegle={(r) => r.l.id}
          paaRaekke={(r) => setValgtId(r.l.id)}
          erValgt={(r) => r.l.id === valgtId}
          tom="Ingen aktive leverandører."
        />
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Et nøgletal står altid med det antal det er regnet på. Under {MINDSTE_GRUNDLAG}{" "}
          observationer vises ingen procent — to leveringer og to hundrede ser
          ens ud i en tabel, og så skifter man leverandør på grundlag af én
          forsinkelse.
        </p>
      </Kort>

      {valgt && <Detaljer l={valgt} kilder={KILDER} />}
    </div>
  );
}

/**
 * Et nøgletal med sit grundlag.
 *
 * ⚠ "FOR LIDT GRUNDLAG" ER IKKE DET SAMME SOM EN STREG. En streg læses som
 * nul eller som "ingen problemer"; teksten her siger at vi ikke ved det endnu.
 */
function Tal({ m, vis, enhed, tone }) {
  if (!m.nokData) {
    return (
      <span className="fc-hint" title={`Regnet på ${m.grundlag} ${enhed}. Der skal mindst ${MINDSTE_GRUNDLAG} til.`}>
        for lidt grundlag
      </span>
    );
  }
  const tekst = vis(m.vaerdi);
  return (
    <span>
      {tone ? <Pille tone={tone}>{tekst}</Pille> : tekst}{" "}
      <span className="fc-hint">({m.grundlag})</span>
    </span>
  );
}

/* ---- Detaljer: aftalen og prislisten ----------------------------------- */

function Detaljer({ l, kilder }) {
  /* ⚠ KILDERNE KOMMER IND. De var en MODULKONSTANT indtil indkoebslinjerne
     blev hentet fra noden — og en modulkonstant kan ikke kende komponentens
     data. Fejlen var ikke en byggefejl: `npm run build` gik igennem, og
     skaermen blev hvid foerst i browseren. */
  const n = beregnNoegletal(l, kilder);
  const gaeldende = gaeldendePrisliste(l);
  const kommende = kommendePriser(l);

  return (
    <Gitter kolonner="minmax(0,1fr) minmax(0,2fr)">
      <Kort titel={l.navn}>
        <MiniLinje label="CVR" vaerdi={l.cvr} />
        <MiniLinje label="Kategori" vaerdi={LEVERANDOER_KATEGORI[l.kategori]} />
        {/* Division BESKRIVER LEVERANDØRENS FORRETNING — derfor tilladt her,
            modsat på personale og køretøjer. Se prøven i leverandoerer.js. */}
        <MiniLinje label="Division" vaerdi={l.division} />
        <MiniLinje label="Aftaleform" vaerdi={AFTALETYPE[l.aftale?.type]?.label || "—"} />
        {l.aftale?.rabatPct != null && (
          <MiniLinje label="Aftalt rabat" vaerdi={pct(l.aftale.rabatPct)} />
        )}
        <MiniLinje label="E-mail" vaerdi={l.kontaktEmail} />

        <div style={{ marginTop: 12 }}>
          <MiniLinje label="Svartid på sager"
                     vaerdi={n.svartidTimer.nokData ? `${num(n.svartidTimer.vaerdi, 1)} timer` : "for lidt grundlag"} />
          <MiniLinje label="Andel af indkøb"
                     vaerdi={n.andelAfIndkoebPct.nokData ? pct(n.andelAfIndkoebPct.vaerdi) : "for lidt grundlag"} />
          <MiniLinje label="Fakturaafvigelse"
                     vaerdi={n.fakturaafvigelseOere.nokData ? kr(n.fakturaafvigelseOere.vaerdi) : "for lidt grundlag"} />
        </div>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Svartiden regnes kun på sager de faktisk har svaret på. En ubesvaret
          sag har ingen svartid — den har en alder.
        </p>
      </Kort>

      <Kort titel="Prisliste">
        <Tabel
          kolonner={[
            { key: "vare", label: "Vare" },
            { key: "varenummer", label: "Varenummer" },
            { key: "pris", label: "Pris", num: true,
              render: (p) => `${kr(p.prisOere, 2)} / ${p.enhed}` },
            { key: "gyldigFra", label: "Gælder fra", render: (p) => dato(p.gyldigFra) },
          ]}
          raekker={gaeldende}
          noegle={(p) => p.varenummer}
          tom="Ingen prisliste registreret."
        />

        {kommende.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="fc-row" style={{ marginBottom: 6 }}>
              <span className="fc-hint">Kommende reguleringer</span>
              <Pille tone="warn">{kommende.length}</Pille>
            </div>
            <Tabel
              kolonner={[
                { key: "vare", label: "Vare" },
                { key: "pris", label: "Ny pris", num: true,
                  render: (p) => `${kr(p.prisOere, 2)} / ${p.enhed}` },
                { key: "gyldigFra", label: "Træder i kraft", render: (p) => dato(p.gyldigFra) },
              ]}
              raekker={kommende}
              noegle={(p) => `${p.varenummer}-${p.gyldigFra}`}
            />
          </div>
        )}

        <p className="fc-hint" style={{ marginTop: 8 }}>
          En sats overskrives aldrig — en regulering er en ny række med
          gyldigFra. Et køb i marts måles mod martsprisen, ikke mod dagens.
          Ellers ville vores egen prisregulering få leverandøren til at se
          dyrere ud bagudrettet.
        </p>
      </Kort>
    </Gitter>
  );
}
