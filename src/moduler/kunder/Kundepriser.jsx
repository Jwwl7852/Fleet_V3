/* src/moduler/kunder/Kundepriser.jsx
 * Kunder & Priser – den enkelte kundes aftale.
 *
 * To lag, ikke tre (PRISER.md punkt 4.1): der er ÉN standardprisliste for
 * hele virksomheden, og afvigelsen sættes på kunden. Prisgruppen bærer ikke
 * længere en pris — den er et filtreringsfelt i kundeoversigten.
 *
 * ⚠ ENTEN EN EGEN PRIS ELLER EN RABAT — ALDRIG BEGGE. Derfor er det ét valg
 * med to udfald og ikke to felter man kan udfylde begge. To felter der begge
 * kan sætte prisen, er to svar på samme spørgsmål, og så bliver det
 * tilfældigt hvilket der vinder. Reglerne afviser en post med begge.
 *
 * ⚠ EN RABAT PÅ EN STANDARDPRIS DER MANGLER, GIVER INGEN PRIS — ikke 0 kr.
 * 15 % af ingenting er ikke nul kroner; det er det samme ubesvarede
 * spørgsmål med et tal foran. Skærmen skriver det, fordi den linje ikke kan
 * faktureres, og det ellers først opdages når regningen skal sendes.
 *
 * ⚠ KILDEN STÅR ALTID VED TALLET. En pris man ikke kan se oprindelsen af,
 * kan ikke forklares over for kunden — og det er netop den samtale prisen
 * findes til.
 *
 * ⚠ SKRIVNING KRÆVER BEGGE PERMISSIONS: `kunder.skriv` åbner stien, og
 * `satser.skriv` er det led der gør at prisen ikke kan sættes af flere end
 * standardprisen kan. Knappen siger hvilken der mangler — "du har ikke
 * adgang" uden at sige til hvad, er ikke en forklaring.
 *
 * ⚠ DER ER INGEN SLETTEKNAP, og det er med vilje. `.validate` kører ikke ved
 * en sletning, så den er det ene hul reglerne ikke kan lukke — og som
 * `skriv.js` ikke har en slet(), findes vejen derfor ikke i klienten. En
 * afvigelse tages ud af drift med en ny post, ikke ved at forsvinde.
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";
import {
  kr, dato, num, pct, iDagIso, isoTilMs, kronerFraOere, oereFraKroner,
} from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { bpsTilPct, pctTilBps } from "../../fleet/beloeb.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular,
  Henter, Datatilstand, Tom, Ikon, KpiKort, KpiRaekke, MiniLinje,
} from "../../fleet/ui.jsx";
import {
  METODER, YDELSESKATEGORI, STANDARDGRUPPE, ydelserForModuler,
  standardPris, kundeSats, prisFor, satsliste, satsPaa,
  valideKundesats, kundeprisSti, PRISKILDE,
} from "../../fleet/pricing.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";

const EGEN = "egen";
const RABAT = "rabat";

/* ---- Formularen --------------------------------------------------------- */

function Afvigelsesformular({ kunde, ydelse, standard, nuvaerende, sti, paaGemt, paaLuk }) {
  /* Ét valg med to udfald. Skifter man art, ryddes det andet felt — så kan
     der ikke ligge en gammel værdi og blive gemt sammen med den nye. */
  const [art, saetArt] = useState(() =>
    (nuvaerende && Number.isFinite(nuvaerende.rabatBps) ? RABAT : EGEN));
  const [kroner, saetKroner] = useState(() =>
    (nuvaerende && Number.isFinite(nuvaerende.beloebOere) ? kronerFraOere(nuvaerende.beloebOere) : ""));
  const [procent, saetProcent] = useState(() =>
    (nuvaerende && Number.isFinite(nuvaerende.rabatBps) ? String(bpsTilPct(nuvaerende.rabatBps)) : ""));
  const [fraIso, saetFraIso] = useState(iDagIso);
  const [roert, saetRoert] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const gyldigFra = isoTilMs(fraIso);
  const post = art === RABAT
    ? { gyldigFra, rabatBps: pctTilBps(Number(String(procent).replace(",", ".")) || 0) }
    : { gyldigFra, beloebOere: oereFraKroner(kroner), metode: ydelse.metode, valuta: "DKK" };

  /* Tomt felt må ikke blive til nul. `oereFraKroner("")` giver null, og en
     post uden beløb OG uden rabat afvises af valideringen — det er det
     rigtige svar, ikke en gratis ydelse. */
  if (art === EGEN && post.beloebOere === null) delete post.beloebOere;

  const fejl = valideKundesats(post);
  const kanGemme = Object.keys(fejl).length === 0;

  /* Hvad det ender med at koste. Regnes af prisFor() og ikke her — ellers
     ville formularen og tabellen kunne blive uenige om samme pris.
     ⚠ KUN NÅR POSTEN ER GYLDIG. Med et tomt prisfelt ville prisFor() falde
     tilbage på standarden, og så stod der et tal ved "Resultatet" som ikke
     var det man var ved at skrive. */
  const forhaandsvisning = kanGemme
    ? prisFor(
        { standard: { [ydelse.id]: { satser: standard ? [standard] : [] } },
          kunde: { [ydelse.id]: { satser: [{ ...post, gyldigFra: gyldigFra ?? 0 }] } } },
        ydelse.id, gyldigFra ?? Date.now())
    : null;

  const gemNu = async () => {
    saetRoert(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const satsId = nyId("s");
    const r = await gem({
      /* ⚠ EN NY POST, IKKE EN RETTELSE AF DEN GAMLE — beslutning 7 gælder
         også kundens aftale. Den gamle afvigelse bliver stående, så en
         faktura fra dengang kan forklares. */
      sti: sti(kundeprisSti(kunde.id, ydelse.id, satsId)),
      data: { ...post, oprettetMs: Date.now() },
      flet: true,
      /* ⚠ LOGGES SOM `satser`, IKKE SOM `kunder`. Posten ligger på kunden,
         men den ER en sats — og satser er et regnskabsobjekt med sin egen
         retention. Lå prisændringerne i drift-partitionen, ville halvdelen
         af prishistorikken i loggen have en anden levetid end den anden. */
      objekt: "satser", objektId: `${kunde.id}/${ydelse.id}/${satsId}`,
      handling: AUDIT.opret,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <Kort titel={`Aftalepris — ${ydelse.navn} for ${kunde.navn}`}>
      <p className="fc-hint">
        Standardprisen er{" "}
        {standard
          ? <b>{kr(standard.beloebOere, 2)}</b>
          : <span className="fc-bad">ikke sat</span>}
        {" "}({METODER[ydelse.metode]?.label.toLowerCase()}).
        {nuvaerende && (
          Number.isFinite(nuvaerende.rabatBps)
            ? ` Kunden har i dag ${pct(bpsTilPct(nuvaerende.rabatBps))} rabat fra ${dato(nuvaerende.gyldigFra)}.`
            : ` Kunden har i dag sin egen pris på ${kr(nuvaerende.beloebOere, 2)} fra ${dato(nuvaerende.gyldigFra)}.`)}
      </p>

      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel="Gem aftaleprisen" onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          {/* ⚠ ÉT VALG, IKKE TO FELTER. Se hovedet på filen. */}
          <Felt id="ka-art" label="Aftalen er" kraevet vaerdi={art}
                saet={(v) => { saetArt(v); saetSvar(null); }}
                valgmuligheder={[
                  { vaerdi: EGEN, label: "En egen pris" },
                  { vaerdi: RABAT, label: "En rabat på standardprisen" },
                ]}
                hint="Enten den ene eller den anden — aldrig begge." />

          {art === EGEN ? (
            <Felt id="ka-beloeb" label="Kundens pris" kraevet suffiks="kr." vaerdi={kroner}
                  saet={(v) => { saetKroner(v); saetSvar(null); }}
                  fejl={roert ? (fejl.beloebOere || fejl.form) : null}
                  hint="Ekskl. moms. Uafhængig af standardprisen — den følger ikke med, når standarden ændres." />
          ) : (
            <Felt id="ka-rabat" label="Rabat" kraevet suffiks="%" vaerdi={procent}
                  saet={(v) => { saetProcent(v); saetSvar(null); }}
                  fejl={roert ? (fejl.rabatBps || fejl.form) : null}
                  hint="Regnes af den standardpris der gælder på dagen — ændres standarden, følger kundens pris med." />
          )}

          <Felt id="ka-fra" label="Gælder fra" kraevet type="date" vaerdi={fraIso}
                saet={(v) => { saetFraIso(v); saetSvar(null); }}
                fejl={roert ? fejl.gyldigFra : null}
                hint="Den gamle aftale bliver stående og gælder frem til denne dato." />
        </Feltraekke>

        {/* ⚠ HVAD DET ENDER MED AT KOSTE — og "ingen pris" når grundlaget
            mangler. En rabat på en standardpris der ikke findes, kan ikke
            faktureres, og det skal stå FØR den gemmes. */}
        <p className="fc-hint">
          Resultatet:{" "}
          {!kanGemme
            ? <span className="fc-neutral">— udfyld felterne</span>
            : forhaandsvisning
              ? <b>{kr(forhaandsvisning.oere, 2)}</b>
              : <span className="fc-bad">
                  ingen pris — der er ingen standardpris at give rabat på
                </span>}
        </p>
      </Formular>
    </Kort>
  );
}

/* ---- Skærmen ------------------------------------------------------------ */

export default function Kundepriser() {
  const { kundeId } = useParams();
  const navigate = useNavigate();
  const { path, bruger, moduler } = useFleet();

  /* ⚠ BEGGE PERMISSIONS. kunder.skriv åbner stien; satser.skriv er det led
     der holder prisen hos dem der må sætte priser. Se reglerne. */
  const maaKunder = harPerm(bruger?.perms, PERM.kunderSkriv);
  const maaSatser = harPerm(bruger?.perms, PERM.satserSkriv);
  const maaSkrive = maaKunder && maaSatser;
  const mangler = [!maaKunder && PERM.kunderSkriv, !maaSatser && PERM.satserSkriv].filter(Boolean);

  const [redigerer, saetRedigerer] = useState(null);
  const [aaben, saetAaben] = useState(null);

  const {
    data: kunder, tilstand: kundeTilstand, genindlaes: genindlaesKunder,
    henter: henterKunder,
  } = useListe("kunder", {
    ordnPaa: "navn", vindue: "alle", graense: 200, demo: DEMO_KUNDER,
  });

  const {
    data: standardposter, tilstand: satsTilstand, genindlaes: genindlaesSatser,
    henter: henterSatser,
  } = useListe(`satser/${STANDARDGRUPPE}`, { graense: 500, demo: [] });

  if (henterKunder || henterSatser) return <Henter hvad="kunder og priser" />;

  const kunde = kunder.find((k) => k.id === kundeId) || null;
  const standard = Object.fromEntries(standardposter.map((p) => [p.id, p]));
  const nu = Date.now();

  const genindlaesAlt = () => { genindlaesKunder(); genindlaesSatser(); };

  /* Kundens afvigelser ligger PÅ kundeposten — useListe henter hele noden,
     så det er ikke et opslag mere. */
  const kundepriser = kunde?.priser || {};

  const ydelser = ydelserForModuler(moduler).map((y) => ({
    ...y,
    standard: standardPris(standard, y.id, nu),
    afvigelse: kundeSats(kundepriser, y.id, nu),
    pris: prisFor({ standard, kunde: kundepriser }, y.id, nu),
  }));

  const medAfvigelse = ydelser.filter((y) => y.afvigelse);
  const udenPris = ydelser.filter((y) => !y.pris);

  const historik = (ydelseId) =>
    [...satsliste(kundepriser[ydelseId])].sort((a, b) => (b.gyldigFra || 0) - (a.gyldigFra || 0));

  const vaelger = (
    <div className="fc-filtre">
      <div className="fc-felt">
        <label htmlFor="kp-kunde">Kunde</label>
        <select id="kp-kunde" value={kundeId || ""}
                onChange={(e) => {
                  saetRedigerer(null); saetAaben(null);
                  navigate(e.target.value ? `/opsaetning/aftalepriser/${e.target.value}` : "/opsaetning/aftalepriser");
                }}>
          <option value="">Vælg en kunde …</option>
          {kunder.map((k) => (
            <option key={k.id} value={k.id}>{k.navn}</option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={kundeTilstand} genprov={genindlaesAlt} />
      <Datatilstand tilstand={satsTilstand} genprov={genindlaesAlt} />

      {!kunde ? (
        <Kort titel="Kundepriser">
          <p className="fc-hint">
            Vælg en kunde for at se hendes aftale. Uden en afvigelse gælder{" "}
            <Link className="fc-a" to="/opsaetning/priser">standardprisen</Link> —
            det er ikke et hul, det er hovedreglen.
          </p>
          {vaelger}
          {!kunder.length && (
            <Tom>Der er ingen kunder at sætte priser for.</Tom>
          )}
        </Kort>
      ) : (
        <>
          <KpiRaekke>
            <KpiKort label="Ydelser" vaerdi={num(ydelser.length)}
                     ikon={<Ikon navn="seddel" />} tone="ikon-5" rund
                     note="det der kan prissættes" />
            <KpiKort label="Egen aftale" vaerdi={num(medAfvigelse.length)}
                     note={medAfvigelse.length
                       ? medAfvigelse.slice(0, 2).map((y) => y.navn).join(", ")
                       : "kunden følger standardprisen"} />
            {/* ⚠ EN YDELSE UDEN PRIS KAN IKKE FAKTURERES — heller ikke når
                kunden har en rabat. Rabatten forudsætter en standardpris. */}
            <KpiKort label="Uden pris" vaerdi={num(udenPris.length)}
                     note={udenPris.length
                       ? "kan ikke faktureres for denne kunde"
                       : "alle ydelser har en pris"} />
          </KpiRaekke>

          {redigerer && (
            <Afvigelsesformular
              kunde={kunde} ydelse={redigerer}
              standard={standardPris(standard, redigerer.id, nu)}
              nuvaerende={kundeSats(kundepriser, redigerer.id, nu)}
              sti={path}
              paaLuk={() => saetRedigerer(null)}
              paaGemt={() => { saetRedigerer(null); genindlaesAlt(); }} />
          )}

          <Kort titel={`Aftalepriser — ${kunde.navn}`}
                handling={<Link className="fc-a" to="/opsaetning/kunder">Tilbage til kunderne</Link>}>
            {vaelger}

            <div className="fc-grid" style={{ gap: 4, marginBottom: 10 }}>
              <MiniLinje label="Division"
                         vaerdi={kunde.division === "faelles" ? "Fælles — gods og bus"
                           : kunde.division === "bus" ? "Bus" : "Gods"} />
              {/* ⚠ PRISGRUPPEN BÆRER IKKE LÆNGERE EN PRIS (PRISER.md 4.1).
                  Feltet står stadig på kundeposten og filtrerer i
                  kundeoversigten — det er navnet der er holdt op med at
                  betyde noget, ikke kolonnen der er forsvundet. */}
              {kunde.prisgruppe && (
                <MiniLinje label="Prisgruppe"
                           vaerdi={`${kunde.prisgruppe} — bærer ikke en pris, kun et filter`} />
              )}
            </div>

            <Tabel
              kolonner={[
                { key: "navn", label: "Ydelse", render: (y) => <b>{y.navn}</b> },
                { key: "kategori", label: "Kategori", render: (y) => (
                    <Pille tone="info">{YDELSESKATEGORI[y.kategori]?.label || y.kategori}</Pille>
                  ) },
                { key: "standard", label: "Standard", num: true, render: (y) => (
                    y.standard
                      ? <span className="fc-hint">{kr(y.standard.beloebOere, 2)}</span>
                      : <span className="fc-bad">mangler</span>
                  ) },
                { key: "aftale", label: "Kundens aftale", render: (y) => {
                    if (!y.afvigelse) return <span className="fc-neutral">—</span>;
                    return Number.isFinite(y.afvigelse.rabatBps)
                      ? <>{pct(bpsTilPct(y.afvigelse.rabatBps))} rabat{" "}
                          <span className="fc-hint">fra {dato(y.afvigelse.gyldigFra)}</span></>
                      : <>egen pris{" "}
                          <span className="fc-hint">fra {dato(y.afvigelse.gyldigFra)}</span></>;
                  } },
                /* ⚠ PRISEN STÅR ALDRIG UDEN SIN KILDE. Ellers kan man ikke se
                   om 340 kr er standarden, en rabat eller en aftalt pris — og
                   så kan den ikke forklares over for kunden. */
                { key: "pris", label: "Pris", num: true, render: (y) => (
                    y.pris
                      ? <>{kr(y.pris.oere, 2)}{" "}
                          <Pille tone={PRISKILDE[y.pris.kilde].tone}>
                            {PRISKILDE[y.pris.kilde].label}
                          </Pille></>
                      : <span className="fc-bad">
                          {y.afvigelse ? "ingen standard at give rabat på" : "mangler"}
                        </span>
                  ) },
                { key: "handling", label: "", render: (y) => (
                    <span className="fc-med-ikon" style={{ gap: 6 }}>
                      <Knap variant="primaer" disabled={!maaSkrive}
                            title={maaSkrive
                              ? "Sæt kundens egen pris eller rabat fra en dato."
                              : `Kræver ${mangler.join(" og ")} — reglerne afviser.`}
                            onClick={() => saetRedigerer(y)}>
                        {y.afvigelse ? "Ny aftale" : "Sæt aftale"}
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
              tom="Der er ingen ydelser at prissætte. Ydelserne følger de moduler virksomheden har."
            />

            <p className="fc-hint" style={{ marginTop: 10 }}>
              ⚠ <b>En rabat følger standardprisen; en egen pris gør ikke.</b>{" "}
              Ændrer du standarden i morgen, flytter rabatkunden sig med — den
              med sin egen pris bliver stående. Det er forskellen på de to, og
              den er hele grunden til at der skal vælges.
            </p>
            {!maaSkrive && (
              <p className="fc-hint">
                Du kan se aftalen, men ikke ændre den: det kræver{" "}
                <b>{mangler.join(" og ")}</b>. Reglerne afviser skrivningen —
                knappen er ikke det eneste der stopper den.
              </p>
            )}
          </Kort>

          {aaben && (
            <Kort titel={`Aftalehistorik — ${ydelser.find((y) => y.id === aaben)?.navn || aaben}`}>
              <Tabel
                kolonner={[
                  { key: "fra", label: "Gælder fra", render: (s) => dato(s.gyldigFra) },
                  { key: "hvad", label: "Aftale", render: (s) => (
                      Number.isFinite(s.rabatBps)
                        ? `${pct(bpsTilPct(s.rabatBps))} rabat`
                        : `Egen pris: ${kr(s.beloebOere, 2)}`
                    ) },
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
                ⚠ <b>De afløste aftaler bliver stående.</b> Det er dem der
                forklarer en gammel faktura — og uden dem ville en ændret
                aftale se ud som en fejl.
              </p>
            </Kort>
          )}
        </>
      )}
    </div>
  );
}
