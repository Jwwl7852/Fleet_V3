/* src/moduler/warehouse/Afregning.jsx
 * Warehouse – afregning: hvad lageret kan faktureres for i perioden.
 *
 * ⚠ SKÆRMEN AFGØR INGENTING. Den viser hvad bevægelserne og priserne siger.
 * Linjerne bygges af `afregningslinjer()` og satsen slås op med
 * `satsopslag()` — begge ét sted, så en anden skærm ikke kan komme til at
 * regne lidt anderledes på det samme.
 *
 * ⚠ EN LINJE UDEN SATS UDELADES IKKE. Den står med "mangler sats", og summen
 * kan så ikke gøres op. Udelod vi den, ville totalen se komplet ud mens en
 * ydelse manglede sin pris — og ingen ville opdage det før kunden ringede.
 * Samme regel som momssatsen der mangler: et system der gætter rigtigt ni
 * gange ud af ti, lærer brugeren at stole på det tiende.
 *
 * ⚠ KILDEN STÅR PÅ HVER LINJE — standard, rabat eller kundens egen pris. En
 * pris på en faktura man ikke kan spore, er en pris man ikke kan forsvare.
 *
 * ⚠ PERIODEN KOMMER FRA SHELLEN. Modulet laver ikke sin egen vælger; to
 * vælgere kunne blive uenige om hvilken periode tallene dækker. Prisen er at
 * en afregning her følger "seneste N dage" og ikke en kalendermåned — og det
 * skal den, den dag et grundlag skal fryses. Se noten nederst.
 *
 * ⚠ DER SKRIVES IKKE ET FAKTURAGRUNDLAG HERFRA, og det er ikke en
 * forglemmelse. Noden findes nu, men den er `.write: false` for alle — også
 * admin: et grundlag får sit nummer fra en counter i en transaction, og et
 * låst grundlag må aldrig kunne ændres. Skrivningen hører i en Cloud
 * Function, og den findes ikke endnu (nummerserier står som et kendt hul i
 * README). En knap der lovede en faktura, ville love noget platformen ikke
 * kan. Skærmen siger hvad der mangler i stedet.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Tom, Ikon, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import {
  YDELSE, ALLE_YDELSER, afregningslinjer, afregningssum,
  talFraMaengde, MAENGDE_SKALA,
} from "../../fleet/warehouse.js";
import { satsopslag, STANDARDGRUPPE, PRISKILDE } from "../../fleet/pricing.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

const arterFor = (ydelse) => YDELSE[ydelse]?.arter;

export default function Afregning() {
  const { periode, dage } = useFleet();
  const [kundeId, saetKundeId] = useState("");

  const {
    data: kunder, tilstand, genindlaes, henter,
  } = useListe("kunder", {
    ordnPaa: "navn", vindue: "alle", graense: 200, demo: DEMO_KUNDER,
  });
  /* ⚠ PERIODEN LIGGER PÅ FORESPØRGSLEN, ikke i et filter bagefter. Feltet er
     indekseret (`tidspunktMs`), og en afregning må ikke hente hele
     bevægelseshistorikken ned for at smide 99 % af den væk. */
  const { data: bevaegelser } = useListe("bevaegelser", {
    division: "alle", ordnPaa: "tidspunktMs", graense: 5000, demo: [],
  });
  const { data: standardposter } = useListe(`satser/${STANDARDGRUPPE}`, {
    division: "alle", vindue: "alle", graense: 500, demo: [],
  });

  if (henter) return <Henter hvad="afregningen" />;

  const kunde = kunder.find((k) => k.id === kundeId) || null;
  const standard = Object.fromEntries(standardposter.map((p) => [p.id, p]));

  /* ⚠ ÉN OPSLAGSVEJ. satsopslag() bygger på prisFor(), som bygger på
     satsPaa() — ingen af dem er skrevet af her. */
  const satsFor = satsopslag({
    standard, kunde: kunde?.priser || {}, arterFor,
  });

  const linjer = kunde
    ? afregningslinjer({
        bevaegelser, satsFor, kundeId: kunde.id,
        fra: periode.fra, til: periode.til,
      })
    : [];
  const sum = afregningssum(linjer);
  const mine = bevaegelser.filter((b) => b.kundeId === kundeId);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label={`Bevægelser (${dage} dage)`} vaerdi={num(mine.length)}
                 ikon={<Ikon navn="vogn" />} tone="ikon-5" rund
                 note={kunde ? kunde.navn : "vælg en kunde"} />
        <KpiKort label="Afregningslinjer" vaerdi={num(linjer.length)}
                 note={`af ${num(ALLE_YDELSER.length)} mulige ydelser`} />
        {/* ⚠ MANGLENDE SATSER SKAL STÅ FOR SIG. De er grunden til at summen
            ikke kan gøres op, og det opdages ellers først når regningen
            skal sendes. */}
        <KpiKort label="Uden sats" vaerdi={num(sum.mangler)}
                 note={sum.mangler
                   ? "ydelser uden pris — kan ikke faktureres"
                   : "alle linjer har en pris"} />
        <KpiKort label="At fakturere"
                 vaerdi={sum.beloebOere == null ? "—" : kr(sum.beloebOere)}
                 note={sum.beloebOere == null
                   ? "kan ikke gøres op — en sats mangler"
                   : "ekskl. moms"} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Afregning"
            handling={<Link className="fc-a" to="/kunder/priser">Se standardpriserne</Link>}>
        <p className="fc-hint">
          Perioden er <b>{dato(periode.fra)} – {dato(periode.til)}</b> og
          kommer fra vælgeren i toppen. Bevægelser tælles pr. ydelse, og
          satsen slås op <b>pr. bevægelse</b> — skifter en pris midt i
          perioden, afregnes de to halvdele hver for sig.
        </p>

        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="af-kunde">Kunde</label>
            <select id="af-kunde" value={kundeId}
                    onChange={(e) => saetKundeId(e.target.value)}>
              <option value="">Vælg en kunde …</option>
              {kunder.map((k) => (
                <option key={k.id} value={k.id}>{k.navn}</option>
              ))}
            </select>
          </div>
        </div>

        {!kunde ? (
          <Tom>
            Vælg en kunde for at se hvad lageret kan faktureres for i perioden.
          </Tom>
        ) : !linjer.length ? (
          <Tom>
            Der er ingen afregnbare bevægelser for {kunde.navn} i perioden.
            {" "}Optælling og justering tæller ikke med — de er vores kontrol
            af vores eget arbejde, ikke noget kunden har bedt om.
          </Tom>
        ) : (
          <>
            <Tabel
              kolonner={[
                { key: "ydelse", label: "Ydelse", render: (l) => <b>{l.label}</b> },
                { key: "haendelser", label: "Hændelser", num: true,
                  render: (l) => num(l.haendelser) },
                { key: "antal", label: "Mængde", num: true, render: (l) => (
                    `${num(talFraMaengde(l.antal), l.antal % MAENGDE_SKALA ? 1 : 0)} ${l.enhed}`
                  ) },
                /* ⚠ "MANGLER" ER IKKE 0 KR. En pris på nul er en beslutning
                   om at noget er gratis; en manglende pris er et ubesvaret
                   spørgsmål — og den kan ikke faktureres. */
                { key: "sats", label: "Sats", num: true, render: (l) => (
                    l.satsOere == null
                      ? <span className="fc-bad">mangler</span>
                      : kr(l.satsOere, 2)
                  ) },
                { key: "kilde", label: "Pris fra", render: (l) => (
                    l.kilde
                      ? <Pille tone={PRISKILDE[l.kilde]?.tone || "info"}>
                          {PRISKILDE[l.kilde]?.label || l.kilde}
                        </Pille>
                      : <span className="fc-neutral">—</span>
                  ) },
                { key: "fra", label: "Sats fra", render: (l) => (
                    l.gyldigFra
                      ? <span className="fc-hint">{dato(l.gyldigFra)}</span>
                      : <span className="fc-neutral">—</span>
                  ) },
                { key: "beloeb", label: "Beløb", num: true, render: (l) => (
                    l.beloebOere == null
                      ? <span className="fc-bad">—</span>
                      : <b>{kr(l.beloebOere, 2)}</b>
                  ) },
              ]}
              raekker={linjer}
              noegle={(l, i) => `${l.ydelse}-${l.gyldigFra ?? "ingen"}-${i}`}
              tom="Ingen linjer."
            />

            <div className="fc-linje" style={{ marginTop: 12 }}>
              <span><b>I alt ekskl. moms</b></span>
              {sum.beloebOere == null
                ? <b className="fc-bad">kan ikke gøres op</b>
                : <b>{kr(sum.beloebOere, 2)}</b>}
            </div>

            {sum.mangler > 0 && (
              <p className="fc-svar fc-svar-fejl" role="alert">
                ⚠ {num(sum.mangler)}{" "}
                {sum.mangler === 1 ? "linje mangler" : "linjer mangler"} en
                sats, og summen kan derfor ikke gøres op. Sæt prisen under{" "}
                <Link className="fc-a" to="/kunder/priser">Standardpriser</Link>{" "}
                — eller giv kunden sin egen under{" "}
                <Link className="fc-a" to={`/kunder/aftalepriser/${kunde.id}`}>
                  Kundepriser
                </Link>. En halv sum er værre end ingen: den ser ud som om den
                er regnet ud.
              </p>
            )}
          </>
        )}

        <p className="fc-hint" style={{ marginTop: 12 }}>
          ⚠ <b>Der oprettes ikke et fakturagrundlag herfra endnu.</b> Noden
          findes, men den er <b>.write: false for alle</b> — også admin: et
          grundlag skal have sit nummer fra en counter i en transaction, og et
          låst grundlag må aldrig kunne ændres. Skrivningen hører i en Cloud
          Function, og den findes ikke endnu. En knap der lovede en faktura,
          ville love noget platformen ikke kan. Godkendelsen hører desuden ét
          sted: Indkøb → Fakturaer (beslutning 12).
        </p>
      </Kort>
    </div>
  );
}
