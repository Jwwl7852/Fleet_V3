/* src/moduler/kunder/Standardpriser.jsx
 * Kunder & Priser – standardpriser for alle platformens ydelser.
 *
 * ⚠ DET ER HER ALLE KUNDENS PRISER DEFINERES. Der er to slags priser i
 * platformen, og de må aldrig blandes sammen:
 *
 *   · UDBYDERENS priser på modulerne (`udbyder/prisliste`) — hvad
 *     abonnementet koster. Dem sætter vi som ejere.
 *   · VOGNMANDENS priser til SIN kunde — dem sætter han her.
 *
 * Plancherne til Warehouse har en selvstændig "Rater & afregning"-skærm. Den
 * bygges ikke: den ville være et andet sted at sætte den samme slags pris, og
 * så skulle en vognmand vedligeholde sine priser to steder.
 *
 * ⚠ EN SATS OVERSKRIVES ALDRIG (beslutning 7). Rettes prisen, får den en NY
 * post med sin egen `gyldigFra`. Ellers ændrer en rettelse i dag prisen på en
 * booking fra sidste kvartal, og så kan fakturaen ikke forklares. Historikken
 * står på skærmen — ikke gemt bag et klik, for det er den der forklarer en
 * gammel faktura.
 *
 * ⚠ EN YDELSE UDEN PRIS STÅR SOM "MANGLER", ikke som 0 kr. En pris på nul er
 * en beslutning om at noget er gratis; en manglende pris er et ubesvaret
 * spørgsmål. Samme regel som momssatsen der mangler.
 *
 * ⚠ KUN YDELSER FRA MODULER TENANTEN HAR. Ellers ville skærmen bede om tal
 * for noget vognmanden ikke har købt — og de tal ville stå der og ligne en
 * aftale.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import {
  kr, dato, num, iDagIso, isoTilMs, kronerFraOere,
} from "../../fleet/format.js";
import { oereFraKroner } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular,
  Henter, Datatilstand, Tom, Ikon, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import {
  METODER, YDELSESKATEGORI,
  STANDARDGRUPPE, standardPris, valideSats, ydelserForModuler, satsPaa,
} from "../../fleet/pricing.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";

/* ---- Formularen --------------------------------------------------------- */

function Prisformular({ ydelse, nuvaerende, sti, paaGemt, paaLuk }) {
  const [kroner, saetKroner] = useState(() =>
    (nuvaerende ? kronerFraOere(nuvaerende.beloebOere) : ""));
  const [fraIso, saetFraIso] = useState(iDagIso);
  const [roert, saetRoert] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const beloebOere = oereFraKroner(kroner);
  const gyldigFra = isoTilMs(fraIso);
  const post = { gyldigFra, beloebOere, metode: ydelse.metode, valuta: "DKK" };
  const fejl = valideSats(post);
  const kanGemme = Object.keys(fejl).length === 0;

  const gemNu = async () => {
    saetRoert(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = nyId("s");
    const r = await gem({
      /* ⚠ EN NY POST, IKKE EN RETTELSE AF DEN GAMLE. Det er hele beslutning 7:
         den gamle sats bliver stående, så en faktura fra dengang kan
         forklares. */
      sti: sti(`satser/${STANDARDGRUPPE}/${ydelse.id}/satser/${id}`),
      data: { ...post, oprettetMs: Date.now() },
      flet: true,
      objekt: "satser", objektId: `${ydelse.id}/${id}`,
      handling: AUDIT.opret,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <Kort titel={`Ny pris — ${ydelse.navn}`}>
      <p className="fc-hint">
        Beregnes <b>{METODER[ydelse.metode]?.label.toLowerCase()}</b>
        {METODER[ydelse.metode]?.enhed ? ` (${METODER[ydelse.metode].enhed})` : ""}.
        {nuvaerende
          ? ` Nuværende pris: ${kr(nuvaerende.beloebOere, 2)} fra ${dato(nuvaerende.gyldigFra)}.`
          : " Der er ingen pris i dag."}
      </p>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel="Gem prisen" onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="p-beloeb" label="Pris" kraevet suffiks="kr." vaerdi={kroner}
                saet={(v) => { saetKroner(v); saetSvar(null); }}
                fejl={roert ? fejl.beloebOere : null}
                hint="Ekskl. moms. Nul er en gyldig pris, hvis ydelsen er gratis." />
          {/* ⚠ DATOEN ER IKKE PYNT. Vil man have prisen til at gælde fra den
              1., vælger man den — så rammer den ikke bagud ind i en måned der
              allerede er faktureret. */}
          <Felt id="p-fra" label="Gælder fra" kraevet type="date" vaerdi={fraIso}
                saet={(v) => { saetFraIso(v); saetSvar(null); }}
                fejl={roert ? fejl.gyldigFra : null}
                hint="Den gamle pris bliver stående og gælder frem til denne dato." />
        </Feltraekke>
      </Formular>
    </Kort>
  );
}

/* ---- Skærmen ------------------------------------------------------------ */

export default function Standardpriser() {
  const { path, bruger, moduler } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.satserSkriv);

  const [redigerer, saetRedigerer] = useState(null);
  const [aaben, saetAaben] = useState(null);
  const [kategori, saetKategori] = useState("");

  /* Hele gruppen i ét kald — ydelserne er få, og fire visninger af det samme
     datasæt kan ikke sige hver sit. */
  const { data: poster, tilstand, genindlaes, henter } = useListe(
    `satser/${STANDARDGRUPPE}`, { graense: 500, demo: [] });

  if (henter) return <Henter hvad="standardpriserne" />;

  /* useListe giver et array med id; standardPris() vil have et opslag. */
  const standard = Object.fromEntries(poster.map((p) => [p.id, p]));
  const nu = Date.now();

  const ydelser = ydelserForModuler(moduler)
    .filter((y) => !kategori || y.kategori === kategori)
    .map((y) => ({ ...y, sats: standardPris(standard, y.id, nu) }));

  const alle = ydelserForModuler(moduler);
  const mangler = alle.filter((y) => !standardPris(standard, y.id, nu));
  const kategorier = [...new Set(alle.map((y) => y.kategori))];

  const historik = (ydelseId) => {
    const p = standard[ydelseId];
    const liste = Array.isArray(p?.satser) ? p.satser : Object.values(p?.satser || {});
    return [...liste].sort((a, b) => (b.gyldigFra || 0) - (a.gyldigFra || 0));
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Ydelser" vaerdi={num(alle.length)}
                 ikon={<Ikon navn="seddel" />} tone="ikon-5" rund
                 note="det der kan prissættes" />
        {/* ⚠ MANGLENDE PRISER SKAL STÅ FOR SIG. En ydelse uden pris kan ikke
            faktureres, og det opdages ellers først når regningen skal sendes. */}
        <KpiKort label="Uden pris" vaerdi={num(mangler.length)}
                 note={mangler.length
                   ? mangler.slice(0, 2).map((y) => y.navn).join(", ")
                   : "alle ydelser er prissat"} />
        <KpiKort label="Kategorier" vaerdi={num(kategorier.length)} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {redigerer && (
        <Prisformular ydelse={redigerer}
                      nuvaerende={standardPris(standard, redigerer.id, nu)}
                      sti={path}
                      paaLuk={() => saetRedigerer(null)}
                      paaGemt={() => { saetRedigerer(null); genindlaes(); }} />
      )}

      <Kort titel="Standardpriser">
        <p className="fc-hint">
          Det er de priser der gælder for <b>alle</b> kunder. Klikker du dig ind
          på en enkelt kunde, kan du give den en egen pris eller en rabat —
          standarden bliver stående.
        </p>

        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="sp-kategori">Kategori</label>
            <select id="sp-kategori" value={kategori}
                    onChange={(e) => saetKategori(e.target.value)}>
              <option value="">Alle kategorier</option>
              {kategorier.map((k) => (
                <option key={k} value={k}>{YDELSESKATEGORI[k]?.label || k}</option>
              ))}
            </select>
          </div>
        </div>

        {!alle.length ? (
          <Tom>
            Der er ingen ydelser at prissætte. Ydelserne følger de moduler
            virksomheden har — og lige nu er der ingen af dem der har
            prissatte ydelser.
          </Tom>
        ) : (
          <Tabel
            kolonner={[
              { key: "navn", label: "Ydelse", render: (y) => <b>{y.navn}</b> },
              { key: "kategori", label: "Kategori", render: (y) => (
                  <Pille tone="info">{YDELSESKATEGORI[y.kategori]?.label || y.kategori}</Pille>
                ) },
              { key: "metode", label: "Beregnes", render: (y) => (
                  <span className="fc-hint">{METODER[y.metode]?.label || y.metode}</span>
                ) },
              /* ⚠ "Mangler" ER IKKE 0 KR. En pris på nul er en beslutning om
                 at noget er gratis; en manglende pris er et ubesvaret
                 spørgsmål — og den kan ikke faktureres. */
              { key: "pris", label: "Pris", num: true, render: (y) => (
                  y.sats
                    ? kr(y.sats.beloebOere, 2)
                    : <span className="fc-bad">mangler</span>
                ) },
              { key: "fra", label: "Gælder fra", render: (y) => (
                  y.sats
                    ? <span className="fc-hint">{dato(y.sats.gyldigFra)}</span>
                    : <span className="fc-neutral">—</span>
                ) },
              { key: "handling", label: "", render: (y) => (
                  <span className="fc-med-ikon" style={{ gap: 6 }}>
                    <Knap variant="primaer" disabled={!maaSkrive}
                          title={maaSkrive ? "Sæt en ny pris fra en dato."
                            : `Kræver ${PERM.satserSkriv} — reglerne afviser.`}
                          onClick={() => saetRedigerer(y)}>
                      {y.sats ? "Ny pris" : "Sæt pris"}
                    </Knap>
                    {historik(y.id).length > 1 && (
                      <Knap onClick={() => saetAaben(y.id === aaben ? null : y.id)}>
                        {y.id === aaben ? "Skjul" : `Historik (${historik(y.id).length})`}
                      </Knap>
                    )}
                  </span>
                ) },
            ]}
            raekker={ydelser}
            erValgt={(y) => y.id === aaben}
            tom="Ingen ydelser i den kategori."
          />
        )}

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>En pris overskrives aldrig.</b> Retter du den, kommer der en ny
          post med sin egen dato, og den gamle bliver stående. Ellers ville en
          rettelse i dag ændre prisen på en booking fra sidste kvartal — og så
          kunne fakturaen ikke forklares.
        </p>
      </Kort>

      {aaben && (
        <Kort titel={`Prishistorik — ${
          ydelserForModuler(moduler).find((y) => y.id === aaben)?.navn || aaben}`}>
          <Tabel
            kolonner={[
              { key: "fra", label: "Gælder fra", render: (s) => dato(s.gyldigFra) },
              { key: "beloeb", label: "Pris", num: true,
                render: (s) => kr(s.beloebOere, 2) },
              { key: "status", label: "", render: (s) => {
                  const g = satsPaa(historik(aaben), nu);
                  return g && g.gyldigFra === s.gyldigFra
                    ? <Pille tone="ok">gælder nu</Pille>
                    : s.gyldigFra > nu
                      ? <Pille tone="info">træder i kraft senere</Pille>
                      : <span className="fc-neutral">afløst</span>;
                } },
            ]}
            raekker={historik(aaben)}
            noegle={(s, i) => `${s.gyldigFra}-${i}`}
            tom="Ingen historik."
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ <b>De afløste priser bliver stående.</b> Det er dem der forklarer
            en gammel faktura — og uden dem ville en korrektion se ud som en
            fejl frem for en aftale der er ændret.
          </p>
        </Kort>
      )}
    </div>
  );
}
