/* src/moduler/oekonomi/Fakturacenter.jsx
 * Ét fælles sted til fakturaer, bilag og match — beslutning 86.
 *
 * ⚠ SAMME NODE SOM PROCURE LÆSER. `fakturaer/` ER den fælles node, og den har
 * med vilje ingen modulklausul: *"fakturaer er en af de TRE TVETYDIGE NODER
 * der står i basen, fordi den røres af to skærme"*. Fakturacenteret ejer
 * fakturaen; modulet ejer sagen. Procure → Fakturaer er én LINSE på de samme
 * poster, ikke et andet sæt.
 *
 * ⚠ MEN NODEN ER FÆLLES — SKÆRMEN ER IKKE. Det blev målt frem for antaget:
 * `oekonomi` ER et modul, og et **valgfrit** et. En kunde uden Økonomi ser
 * stadig sine fakturaer gennem Procures linse; det han mangler, er den
 * **tværgående** visning. Og det er præcis dét Økonomi-modulet sælger.
 *
 * ⚠ DESTINATIONERNE AFHÆNGER AF MODULERNE. En kunde uden Facility ser aldrig
 * en facility-destination: forslaget ville pege på en node hans regler
 * afviser, og "kan ikke læses" ligner "findes ikke". Målt på nordvest, som har
 * facility, flåde og indkøb — men hverken booking, unitbooking eller warehouse.
 *
 * ⚠ SCOREN ER EN PÅSTAND OM SIKKERHED. Signalerne står under den, så den der
 * godkender, kan se om de 96 % kommer af et sagsnummer eller af at beløbet
 * tilfældigvis lignede. **Kun et nummer giver 100** — alt andet er en
 * slutning, og en slutning må ikke se ud som en kendsgerning ved siden af en
 * knap der hedder "Godkend match".
 *
 * ⚠ OG DE AUTOMATISKE INDGANGE ER STADIG IKKE BYGGET — SKIVE 4C LØSTE KUN
 * BILAGET. Planchen tegner drag & drop, invoice-mail og mobilkvittering til
 * at OPRETTE en faktura automatisk af en fil; det kræver en parsing-/
 * OCR-pipeline der ikke findes. Det "der er ingen fillagring"-argument der
 * stod her, er ikke længere sandt: Skive 4C byggede et begrænset, DEV-only
 * dokumentlager (docs/security-compliance/09_FILE_STORAGE_SECURITY_GATE.md)
 * — men det lader en bruger hæfte ÉT bilag på EN allerede oprettet faktura,
 * ikke oprette fakturaen af filen. Se "Bilag" i detaljeruden. Fakturaer
 * oprettes indtil videre manuelt og placeres her; bilaget kan lægges på
 * bagefter. Planchen siger det selv: *"Invoice-mail er kun én kanal, ikke
 * fundamentet."*
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato, filstoerrelse } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tom, Tabel, Pille, Henter, Datatilstand, Knap, Felt,
  Formularsvar, KpiKort, KpiRaekke, Ikon, Dialog, MiniLinje, Gitter,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  DESTINATIONSART, DESTINATIONSSIGNAL, FAKTURAKILDE, CENTERTILSTAND,
  foreslaaDestination, centertilstand, kanSaetteDestination,
  destinationstekst, afvigelseOere,
} from "../../fleet/fakturacenter.js";
import { FAKTURASTATUS, leverandoerNavn, fakturaTotalOere, PERM_GODKEND }
  from "../../fleet/leverandoerer.js";
import { saetDestination, skiftFaktura } from "../../fleet/faktura.js";
/* ⚠ SKIVE 4C — FAKTURABILAG. Se dokumenter.js's hoved og
   docs/security-compliance/09_FILE_STORAGE_SECURITY_GATE.md. */
import { DOKUMENT_STATUS } from "../../fleet/dokumenter.js";
import {
  uploadFakturaDokument, hentFakturaDokumentLink, deaktiverFakturaDokument,
} from "../../fleet/fakturadokumenter.js";
/* ⚠ KUN SOM FALDBAKKE I useListe. Skærmen slår ikke op i sættene. */
import { DEMO_FAKTURAER, DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { DEMO_INDKOEBSORDRER } from "../../fleet/demo-procure.js";
import { DEMO_FORBRUGSVARER } from "../../fleet/demo-forbrugsvarer.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_AKTIVER } from "../../fleet/demo-facility.js";

export default function Fakturacenter() {
  const { bruger, moduler } = useFleet();
  /* ⚠ SKIVE 4A — VAR indkoeb.skriv. Se fakturaerSkriv i permissions.js. */
  const maaSkrive = harPerm(bruger?.perms, PERM.fakturaerSkriv);
  const maaGodkende = harPerm(bruger?.perms, PERM_GODKEND);

  /* ⚠ FILTERET ER KONTEKST, IKKE SIKKERHED — punkt 4. `useListe("fakturaer",
     …)` nedenfor er allerede gated på fakturaer.laes af selve RTDB-reglen;
     dette filtrerer kun den liste den læsning i forvejen tillod. Samme
     mønster som ?vis=/?frem= i Arbejdskoe.jsx og Kalender.jsx. */
  const [params] = useSearchParams();
  const destinationFilter = DESTINATIONSART[params.get("destination")]
    ? params.get("destination") : null;

  const [valgtId, setValgtId] = useState(null);
  const [valgtForslag, setValgtForslag] = useState(null);
  const [svar, setSvar] = useState(null);
  const [arbejder, setArbejder] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [grund, setGrund] = useState("");

  const liste = useListe("fakturaer", {
    ordnPaa: "fakturadatoMs", vindueDage: 400, graense: 500, demo: DEMO_FAKTURAER,
  });
  const leverandoerer = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });
  const ordrer = useListe("indkoebsordrer", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 300, demo: DEMO_INDKOEBSORDRER,
  });
  const opgaver = useListe("opgaver", {
    ordnPaa: "startMs", vindueDage: 400, graense: 500, demo: DEMO_OPGAVER,
  });
  const forbrugsvarer = useListe("forbrugsvarer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_FORBRUGSVARER,
  });
  const koeretoejer = useListe("koeretoejer", {
    vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
  });
  const aktiver = useListe("facility/aktiver", {
    vindue: "alle", graense: 500, demo: DEMO_AKTIVER,
  });

  if (liste.henter) return <Henter hvad="fakturaer" />;
  if (blokerer(liste.tilstand)) {
    return <Datatilstand tilstand={liste.tilstand} genprov={liste.genindlaes} />;
  }

  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);
  const alleFakturaer = liste.data;
  /* ⚠ FILTRERET VISNING — se noten ved destinationFilter ovenfor. */
  const fakturaer = destinationFilter
    ? alleFakturaer.filter((f) => f.destinationArt === destinationFilter)
    : alleFakturaer;
  const valgt = fakturaer.find((f) => f.id === valgtId) || null;

  /* ⚠ TALLENE REGNES AF LISTEN, IKKE AF `kpi/`. De er afledt af data skærmen
     alligevel henter — undtagelsen i CLAUDE.md. Et gemt tal ville drive fra
     sit grundlag, og "4 mangler match" ved siden af en liste med syv er værre
     end intet tal. */
  const udenMatch = fakturaer.filter((f) => centertilstand(f) === "udenMatch");
  const tilGodkendelse = fakturaer.filter((f) => f.status === "modtaget");
  const godkendt = fakturaer.filter(
    (f) => f.status === "godkendt" || f.status === "bogfoert");
  const godkendtOere = godkendt.reduce((s, f) => s + (f.beloebOere || 0), 0);
  /* ⚠ "NYE" ER DEM DER HVERKEN ER PLACERET ELLER AFKLARET. Talte vi alle
     modtagne med, ville tallet aldrig falde. */
  const nye = fakturaer.filter(
    (f) => f.status === "modtaget" && centertilstand(f) === "udenMatch");

  const kontekst = {
    moduler,
    opgaver: opgaver.data,
    ordrer: ordrer.data,
    forbrugsvarer: forbrugsvarer.data,
    koeretoejer: koeretoejer.data,
    aktiver: aktiver.data,
    /* En ordre der allerede bærer en anden faktura, foreslås ikke igen —
       regnet af HELE listen, uafhængigt af et visningsfilter. */
    matchedeOrdrer: alleFakturaer
      .filter((f) => f.destinationArt === "procure" && f.id !== valgtId)
      .map((f) => f.destinationId).filter(Boolean),
  };

  const forslag = valgt ? foreslaaDestination(valgt, kontekst) : [];
  const aktivtForslag = valgtForslag
    || forslag[0]
    || null;

  const vaelg = (f) => { setValgtId(f.id); setValgtForslag(null); setSvar(null); };

  const koer = async (fn) => {
    setArbejder(true);
    const r = await fn();
    setSvar(r);
    setArbejder(false);
    setDialog(null);
    setGrund("");
    if (r.ok) liste.genindlaes();
    return r;
  };

  const godkendMatch = () => koer(() => saetDestination({
    fakturaId: valgt.id,
    art: aktivtForslag.art,
    id: aktivtForslag.maal.id,
  }));

  /* De arter kunden overhovedet har. `ingen` er altid med — den er et svar. */
  const mineArter = Object.keys(DESTINATIONSART).filter((a) => {
    const m = DESTINATIONSART[a].modul;
    return !m || !moduler || moduler[m] === true;
  });

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={liste.tilstand} genprov={liste.genindlaes} />

      {destinationFilter && (
        <p className="fc-hint">
          Filtreret til <b>{DESTINATIONSART[destinationFilter].label}</b> —{" "}
          <Link className="fc-a" to="/oekonomi/fakturacenter">vis alle</Link>
        </p>
      )}

      <KpiRaekke>
        <KpiKort label="Nye fakturaer" vaerdi={num(nye.length)}
                 note="modtaget, ikke placeret"
                 ikon={<Ikon navn="dokument" />} tone="ikon-4" rund />
        <KpiKort label="Manglende match" vaerdi={num(udenMatch.length)}
                 note="kræver handling"
                 ikon={<Ikon navn="advarsel" />} tone="ikon-1" rund />
        <KpiKort label="Afventer godkendelse" vaerdi={num(tilGodkendelse.length)}
                 note="modtaget, ikke godkendt"
                 ikon={<Ikon navn="ur" />} tone="ikon-3" rund />
        <KpiKort label="Godkendt" vaerdi={num(godkendt.length)}
                 note={`i alt ${kr(godkendtOere)} ekskl. moms`}
                 ikon={<Ikon navn="skjold" />} tone="ikon-6" rund />
      </KpiRaekke>

      <Formularsvar svar={svar} okTekst="Gemt." />

      {/* ---- Indgangene ------------------------------------------------- */}
      <Kort titel="Modtag bilag">
        {/* ⚠ IKKE FIRE DEAKTIVEREDE KNAPPER. Planchen har drag & drop,
            invoice-mail, mobil og "fra sag"; ingen af dem findes, fordi der
            ikke er nogen fillagring. Fire grå knapper ville være fire attrapper
            — ét felt med én begrundelse er ærligere. */}
        <div className="fc-slipfelt">
          <Ikon navn="dokument" />
          <b>Ingen af indgangene er bygget endnu</b>
          <span className="fc-hint">
            Drag &amp; drop, invoice-mail og mobilkvittering kræver alle
            fillagring med sine egne adgangsregler pr. virksomhed — det er sin
            egen opgave. Fakturaer oprettes indtil da af den vej der modtager
            dem, og placeres her.
          </span>
        </div>
        <p className="fc-hint">
          <b>Invoice-mail er kun én kanal, ikke fundamentet.</b> Det er derfor
          centeret virker uden den: en faktura der er kommet ind ad en hvilken
          som helst vej, kan placeres her.
        </p>
        <p className="fc-hint">
          <b>Skive 4C:</b> vil du blot vedhæfte et bilag til en faktura der
          allerede er oprettet, står den knap i detaljeruden nedenfor — "Modtag"
          her handler om at oprette selve fakturaposten automatisk, hvilket
          stadig ikke er bygget.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel={destinationFilter
          ? `${DESTINATIONSART[destinationFilter].label} (${num(fakturaer.length)})`
          : `Fakturaer (${num(fakturaer.length)})`}>
          <Tabel
            raekker={fakturaer}
            tom="Ingen fakturaer."
            kolonner={[
              {
                key: "faktura", label: "Faktura",
                render: (f) => (
                  <>
                    <b>{f.fakturanummer}</b>
                    <div className="fc-hint">
                      {kr(f.beloebOere)} · forfalder {dato(f.forfaldMs)}
                    </div>
                  </>
                ),
              },
              { key: "lev", label: "Leverandør", render: (f) => lvNavn(f.leverandoerId) },
              {
                key: "kilde", label: "Kilde",
                render: (f) => (
                  <>
                    {FAKTURAKILDE[f.kilde]?.label || FAKTURAKILDE.registreret.label}
                    <div className="fc-hint">{dato(f.fakturadatoMs)}</div>
                  </>
                ),
              },
              {
                key: "dest", label: "Foreslået destination",
                render: (f) => {
                  const t = destinationstekst(f, {
                    opgaver: opgaver.data, ordrer: ordrer.data,
                    forbrugsvarer: forbrugsvarer.data, koeretoejer: koeretoejer.data,
                  });
                  if (t) {
                    return (
                      <span className="fc-med-ikon">
                        <Ikon navn={DESTINATIONSART[f.destinationArt].ikon} />
                        <span>
                          <b>{t.label}</b>
                          <div className="fc-hint">{t.under || "—"}</div>
                        </span>
                      </span>
                    );
                  }
                  /* ⚠ FORSLAGET REGNES PR. RÆKKE, OG DET GEMMES IKKE. Et gemt
                     forslag ville drive fra sit grundlag første gang nogen
                     rettede et beløb. */
                  const bud = foreslaaDestination(f, kontekst)[0];
                  if (!bud) {
                    return (
                      <span className="fc-med-ikon">
                        <Ikon navn="advarsel" />
                        <span>
                          <b>Uden sikkert match</b>
                          <div className="fc-hint">Kræver handling</div>
                        </span>
                      </span>
                    );
                  }
                  return (
                    <span className="fc-med-ikon">
                      <Ikon navn={DESTINATIONSART[bud.art].ikon} />
                      <span>
                        {DESTINATIONSART[bud.art].label}
                        <div className="fc-hint">{maalnavn(bud, koeretoejer.data)}</div>
                      </span>
                    </span>
                  );
                },
              },
              {
                key: "match", label: "Match", num: true,
                render: (f) => {
                  if (f.destinationArt) return <span className="fc-hint">placeret</span>;
                  const bud = foreslaaDestination(f, kontekst)[0];
                  if (!bud) return <span className="fc-hint">—</span>;
                  return (
                    <>
                      <b>{bud.score} %</b>
                      <div className="fc-hint">
                        {bud.score >= 90 ? "Høj" : bud.score >= 60 ? "God" : "Svag"}
                      </div>
                    </>
                  );
                },
              },
              {
                key: "tilstand", label: "Status",
                render: (f) => (
                  <>
                    <Pille tone={CENTERTILSTAND[centertilstand(f)].tone}>
                      {CENTERTILSTAND[centertilstand(f)].label}
                    </Pille>
                    <div className="fc-hint">{FAKTURASTATUS[f.status]?.label}</div>
                  </>
                ),
              },
              {
                key: "vaelg", label: "",
                render: (f) => (
                  <Knap onClick={() => vaelg(f)} disabled={f.id === valgtId}>
                    {f.id === valgtId ? "Vist" : "Vis"}
                  </Knap>
                ),
              },
            ]}
          />
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Det er <b>de samme fakturaer</b> som{" "}
            <Link className="fc-a" to="/indkoeb/fakturaer">Procure → Fakturaer</Link>{" "}
            viser — ikke et andet sæt. Procure er én linse; her ses alle
            destinationer.
          </p>
        </Kort>

        <Detaljer
          faktura={valgt} forslag={forslag} valgtForslag={aktivtForslag}
          saetForslag={setValgtForslag} lvNavn={lvNavn}
          koeretoejer={koeretoejer.data} moduler={moduler} mineArter={mineArter}
          maaSkrive={maaSkrive} maaGodkende={maaGodkende} arbejder={arbejder}
          paaGodkendMatch={godkendMatch}
          paaIngen={() => setDialog({ art: "ingen" })}
          paaStatus={(til) => koer(() => skiftFaktura({ fakturaId: valgt.id, til }))}
        />
      </Gitter>

      {dialog && (
        <Dialog
          titel="Ingen destination passer"
          under="Skriv hvorfor. Uden en grund står fakturaen som uafklaret, og den næste begynder forfra på det samme opslag."
          onLuk={() => { setDialog(null); setGrund(""); }}
          handling={
            <Knap variant="primaer" disabled={!grund.trim() || arbejder}
                  onClick={() => koer(() => saetDestination({
                    fakturaId: valgt.id, art: "ingen", begrundelse: grund.trim(),
                  }))}>
              Markér
            </Knap>
          }
        >
          <Felt id="grund" label="Begrundelse" kraevet vaerdi={grund} saet={setGrund}
                hint="Står på fakturaen — ikke i auditloggen. Fritekst hører ikke der." />
        </Dialog>
      )}
    </div>
  );
}

/** Målets navn, uanset art. Et råt id er ikke et svar. */
function maalnavn(forslag, koeretoejer = []) {
  const m = forslag.maal;
  if (forslag.art === "procure") return m.nummer;
  if (forslag.art === "lager") return m.navn;
  const kt = m.koeretoejId ? koeretoejer.find((k) => k.id === m.koeretoejId) : null;
  return [kt?.kaldenavn, m.beskrivelse].filter(Boolean).join(" · ") || m.id;
}

/* ---- Detaljeruden ------------------------------------------------------ */

function Detaljer({
  faktura, forslag, valgtForslag, saetForslag, lvNavn, koeretoejer,
  moduler, mineArter, maaSkrive, maaGodkende, arbejder,
  paaGodkendMatch, paaIngen, paaStatus,
}) {
  if (!faktura) {
    return (
      <Kort titel="Faktura detaljer">
        <Tom>Vælg en faktura for at se den, placere den og godkende den.</Tom>
      </Kort>
    );
  }

  const laast = faktura.status === "bogfoert";
  const kan = valgtForslag
    ? kanSaetteDestination(faktura, { art: valgtForslag.art, id: valgtForslag.maal.id }, { moduler })
    : null;
  const afvig = afvigelseOere(faktura, valgtForslag);

  return (
    <Kort titel={faktura.fakturanummer}>
      <MiniLinje label="Leverandør" vaerdi={<b>{lvNavn(faktura.leverandoerId)}</b>} />
      <MiniLinje label="Fakturadato" vaerdi={dato(faktura.fakturadatoMs)} />
      <MiniLinje label="Forfaldsdato" vaerdi={dato(faktura.forfaldMs)} />
      {/* ⚠ TO LINJER, IKKE ÉN. Planche 1 skrev ét beløb "inkl. moms" og
          sammenlignede det med et ekskl.-beløb — 25 % forkert, systematisk. */}
      <MiniLinje label="Beløb ekskl. moms" vaerdi={<b>{kr(faktura.beloebOere)}</b>} />
      <MiniLinje label="Moms" vaerdi={kr(faktura.momsOere)} />
      <MiniLinje label="Total" vaerdi={<b>{kr(fakturaTotalOere(faktura))}</b>} />
      <MiniLinje label="Status" vaerdi={
        <Pille tone={FAKTURASTATUS[faktura.status]?.pill}>
          {FAKTURASTATUS[faktura.status]?.label}
        </Pille>} />

      <Bilag faktura={faktura} maaSkrive={maaSkrive} />

      <h3 className="fc-underoverskrift">Foreslået match</h3>

      {faktura.destinationArt === "ingen" ? (
        <>
          <Pille tone="info">Ingen destination</Pille>
          <p className="fc-hint">{faktura.destinationGrund}</p>
        </>
      ) : !forslag.length ? (
        <p className="fc-hint">
          Ingen destination passer.{" "}
          {/* ⚠ HVILKE ARTER KUNDEN OVERHOVEDET HAR, STÅR HER. Uden det ser en
              tom liste ud som en fejl i systemet frem for som en kunde der
              ikke har modulet. */}
          Der er søgt i: {mineArter.filter((a) => a !== "ingen")
            .map((a) => DESTINATIONSART[a].label).join(", ") || "ingen moduler"}.
        </p>
      ) : (
        forslag.slice(0, 4).map((f) => (
          <label key={`${f.art}-${f.maal.id}`}
                 className={`fc-forslag${valgtForslag === f ? " fc-forslag-valgt" : ""}`}>
            <input type="radio" name="dest" checked={valgtForslag === f}
                   disabled={!maaSkrive || laast}
                   aria-label={`${DESTINATIONSART[f.art].label} ${maalnavn(f, koeretoejer)}`}
                   onChange={() => saetForslag(f)} />
            <span className="fc-forslag-krop">
              <span className="fc-row">
                <b>{DESTINATIONSART[f.art].label}</b>
                <Pille tone={f.score >= 90 ? "ok" : f.score >= 60 ? "warn" : "info"}>
                  {f.score} %
                </Pille>
              </span>
              <span className="fc-hint">{maalnavn(f, koeretoejer)}</span>
              {/* ⚠ HVAD SCOREN BYGGER PÅ. Et tal alene er en fornemmelse med to
                  decimaler; signalerne er dét der gør den efterprøvelig. */}
              <span className="fc-hint">
                {f.signaler.map((s) => DESTINATIONSSIGNAL[s].label).join(" · ")}
              </span>
            </span>
          </label>
        ))
      )}

      {valgtForslag && (
        <>
          {/* ⚠ AFVIGELSEN ER null NÅR ET TAL MANGLER — ikke 0. Et nul betyder
              "de er ens", hvilket er noget helt andet end "vi ved det ikke". */}
          <MiniLinje label="Afvigelse fra det ventede" vaerdi={
            afvig === null
              ? <span className="fc-hint">kan ikke regnes</span>
              : <b className={afvig === 0 ? "" : "fc-bad"}>{kr(afvig)}</b>} />
          {kan && !kan.ok && <p className="fc-hint fc-bad">{kan.aarsag}</p>}
        </>
      )}

      <div className="fc-knapper" style={{ justifyContent: "flex-start", marginTop: 12 }}>
        <Knap variant="primaer"
              disabled={!maaSkrive || laast || arbejder || !valgtForslag || (kan && !kan.ok)}
              onClick={paaGodkendMatch}>
          Godkend match
        </Knap>
        <Knap disabled={!maaSkrive || laast || arbejder} onClick={paaIngen}>
          Ingen destination
        </Knap>
      </div>

      <h3 className="fc-underoverskrift">Godkendelse</h3>
      <p className="fc-hint" style={{ marginTop: 0 }}>
        {/* ⚠ TO HANDLINGER, IKKE ÉN. At placere en faktura er at registrere
            hvad den hører til; at sige god for at der skal betales, er
            `fakturaer.godkend` (Skive 4A, tidligere indkoeb.godkend — se
            beslutning 82). En knap der gjorde begge dele, ville lade den der
            konterer, betale. */}
        At placere fakturaen og at sige god for den er <b>to handlinger</b>.
        Godkendelsen kræver <code>{PERM_GODKEND}</code>.
      </p>
      <div className="fc-knapper" style={{ justifyContent: "flex-start" }}>
        <Knap variant="primaer"
              disabled={!maaGodkende || laast || arbejder || faktura.status === "godkendt"}
              title={maaGodkende ? undefined : `Det kræver ${PERM_GODKEND}.`}
              onClick={() => paaStatus("godkendt")}>
          Godkend faktura
        </Knap>
        {/* ⚠ SKIVE 4A — GATET PÅ fakturaerSkriv. Bogføring krævede før ingen
            permission overhovedet, hverken her eller server-side; se
            `fakturastatus` i functions/index.js. */}
        <Knap disabled={!maaSkrive || laast || arbejder || faktura.status !== "godkendt"}
              title={!maaSkrive ? `Det kræver ${PERM.fakturaerSkriv}.`
                : faktura.status === "godkendt" ? undefined
                : "Fakturaen skal godkendes før den kan bogføres."}
              onClick={() => paaStatus("bogfoert")}>
          Bogfør / eksportér
        </Knap>
      </div>

      {laast && (
        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>Fakturaen er bogført.</b> Hverken destination eller godkendelse kan
          ændres bagefter — en kontering der ændrer sig, gør en afstemning der
          stemte, til en der ikke gør.
        </p>
      )}
      <p className="fc-hint" style={{ marginTop: 10 }}>
        <b>Der sendes ikke noget til et regnskabssystem.</b> Bogføring sætter
        tilstanden her; der er ingen integration, og en knap der påstod det,
        ville få nogen til at holde op med at bogføre manuelt.
      </p>
    </Kort>
  );
}

/* ---- Bilag — Skive 4C -------------------------------------------------- */

/**
 * ⚠ DOKUMENTERNE KOMMER MED FAKTURAEN — de hentes ikke separat. `faktura`
 * kommer fra samme `useListe("fakturaer", …)` som resten af skærmen, og RTDB
 * henter hele fakturaens undertræ (dokumenter inklusive) i ét, allerede
 * LIVE opslag. En ekstra hentning her ville være det samme opslag to gange
 * — og to steder der kunne blive uenige om hvor mange bilag fakturaen har.
 */
function Bilag({ faktura, maaSkrive }) {
  const [arbejder, setArbejder] = useState(false);
  const [svar, setSvar] = useState(null);

  const dokumenter = Object.entries(faktura.dokumenter || {})
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => (b.oprettetTid || 0) - (a.oprettetTid || 0));

  const paaVaelgFil = async (e) => {
    const fil = e.target.files?.[0];
    /* ⚠ NULSTIL FELTET STRAKS. Ellers kan den samme fil ikke vælges igen
       efter en afvisning — <input type="file"> melder ingen change-event
       for en uændret værdi. */
    e.target.value = "";
    if (!fil) return;
    setArbejder(true);
    setSvar(null);
    const r = await uploadFakturaDokument({ fakturaId: faktura.id, fil });
    setSvar(r);
    setArbejder(false);
  };

  const paaAaben = async (d) => {
    setSvar(null);
    const r = await hentFakturaDokumentLink({ fakturaId: faktura.id, dokumentId: d.id });
    if (r.ok && r.data?.url) {
      /* ⚠ ET NYT VINDUE, IKKE navigate(). Linket er en Storage-URL, ikke en
         rute i denne app — window.open holder brugeren på fakturacenteret. */
      window.open(r.data.url, "_blank", "noopener,noreferrer");
    } else {
      setSvar(r);
    }
  };

  const paaDeaktiver = async (d) => {
    setArbejder(true);
    setSvar(null);
    const r = await deaktiverFakturaDokument({ fakturaId: faktura.id, dokumentId: d.id });
    setSvar(r);
    setArbejder(false);
  };

  return (
    <>
      <h3 className="fc-underoverskrift">Bilag</h3>
      <Formularsvar svar={svar} okTekst="Gemt." />

      {maaSkrive && (
        <div className="fc-row" style={{ marginBottom: 8 }}>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                 aria-label="Upload bilag" disabled={arbejder}
                 onChange={paaVaelgFil} />
          {arbejder && <span className="fc-hint">Overfører…</span>}
        </div>
      )}

      {dokumenter.length === 0 ? (
        <p className="fc-hint">Ingen bilag endnu.</p>
      ) : (
        <Tabel
          raekker={dokumenter}
          noegle={(d) => d.id}
          tom="Ingen bilag endnu."
          kolonner={[
            {
              key: "fil", label: "Fil",
              render: (d) => (
                <>
                  <b>{d.originaltFilnavn}</b>
                  <div className="fc-hint">
                    {filstoerrelse(d.stoerrelse)} · {d.valideretMime}
                  </div>
                </>
              ),
            },
            {
              key: "status", label: "Status",
              render: (d) => (
                <>
                  <Pille tone={DOKUMENT_STATUS[d.status]?.pill}>
                    {DOKUMENT_STATUS[d.status]?.label || d.status}
                  </Pille>
                  {d.status === "afvist" && d.afvistGrund && (
                    <div className="fc-hint">{d.afvistGrund}</div>
                  )}
                </>
              ),
            },
            {
              key: "handling", label: "",
              render: (d) => (
                <span className="fc-med-ikon" style={{ gap: 8 }}>
                  {d.status === "aktiv" && (
                    <Knap onClick={() => paaAaben(d)}>Åbn</Knap>
                  )}
                  {d.status === "aktiv" && maaSkrive && (
                    <Knap disabled={arbejder} onClick={() => paaDeaktiver(d)}>
                      Deaktivér
                    </Knap>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}

      {/* ⚠ IKKE FALSK ROLIGHED. Skive 4C bygger ingen malware-scanner (Gate
          B §7/§6 i checkpointet før 4C) — det står her, i DEV, hvor det kan
          ses af den der uploader, ikke gemt væk i en fil kun udviklere
          læser. */}
      <p className="fc-hint" style={{ marginTop: 8 }}>
        <b>DEV-begrænsning:</b> automatisk malware-scanning er endnu ikke
        aktiveret. Filer valideres på filtype, størrelse og indhold
        (signatur) før de vises som bilag — men scannes ikke for malware.
        Upload kun kontrollerede testfiler.
      </p>
    </>
  );
}
