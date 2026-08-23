/* src/moduler/indkoeb/Fakturaer.jsx
 * Procure — fakturaer, match & kontantkøb. Trin 4 af fem (beslutning 78/83).
 * Planche 1.
 *
 * TRE FEJL FRA MOCKUPPEN, ALLE LUKKET STRUKTURELT FREM FOR RETTET.
 *
 * ⚠ 1. AFSTEMNINGEN ER IKKE EN SUBTRAKTION.
 * Mockuppen skrev "9.842.250 − 9.781.625 = 9.765.125". Det er tre UAFHÆNGIGE
 * opgørelser stillet op som om den ene fulgte af de to andre:
 *
 *   registrerede   vores egne indkøbsregistreringer
 *   modtagne       leverandørernes fakturaer
 *   bogførte       regnskabssystemets opgørelse
 *
 * At bogført er en selvstændig kilde er hele grunden til at de tre kan være
 * uenige. Beregnede vi den af de andre, ville afstemningen altid gå op.
 *
 * ⚠ 2. ANTALLET BEREGNES AF LISTEN. KPI-kortet sagde 8, tabellen 16.
 * ⚠ 3. BELØB EKSKL. MOMS PLUS momsOere. Ét beløb inkl. moms blander de to.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ OG EN FJERDE, FUNDET I PLANCHE 1 SELV: detaljeruden skriver fakturaen som
 * "23.031 kr. inkl. moms" og den matchede ordre som "23.031 kr. ekskl. moms".
 * Det er det SAMME tal med to mærkater — de kan ikke begge være rigtige, og
 * den ene er 25 % ved siden af. Alt der sammenlignes her, er ekskl. moms i
 * begge ender; momsen står som sit eget felt.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ MATCHSCOREN ER EN PÅSTAND OM SIKKERHED. "92 %" regnes af navngivne
 * signaler, og skærmen viser HVILKE der slog til — så den der bekræfter, kan
 * se om de 92 % kommer af et bestillingsnummer eller af at beløbet
 * tilfældigvis lignede. Kun et bestillingsnummer giver 100.
 *
 * ⚠ FILUPLOAD ER IKKE BYGGET, og det står på skærmen. Der er ingen Storage
 * sat op; en fil ligger uden for databasereglerne og har sine egne. En
 * deaktiveret knap uden en grund er en attrap.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { usePost } from "../../fleet/usePost.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato, deviation } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Knap,
  Gitter, MiniLinje, Felt, Feltraekke, Formularsvar, Dialog, Ikon, Kpiadgang } from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  FAKTURASTATUS, leverandoerNavn, fakturaTotalOere, PERM_GODKEND,
} from "../../fleet/leverandoerer.js";
import {
  matchForslag, matchtilstand, MATCHTILSTAND, MATCHSIGNAL, kanMatche,
  matchAfvigelseOere, ordreSumOere, linjeListe, ORDRESTATUS,
  STANDARD_GODKENDELSESREGLER, kontantUdenBilag,
} from "../../fleet/procure.js";
import { matchFaktura, skiftFaktura, gemKontantkoeb } from "../../fleet/faktura.js";
/* ⚠ KUN SOM FALDBAKKE I useListe. Skærmen slår ikke op i sættene. */
import {
  DEMO_LEVERANDOERER, DEMO_INDKOEBSLINJER, DEMO_FAKTURAER, demoAfstemning,
} from "../../fleet/demo-indkoeb.js";
import { DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER } from "../../fleet/demo-procure.js";

const TOM_KONTANT = {
  vare: "", leverandoerId: "", antal: "1", enhed: "stk",
  belob: "", moms: "", udlaegAf: "", note: "",
};

export default function Fakturaer() {
  const { kpi: k, henter, tilstand, genindlaes, utilgaengelige } = useKpi();
  const { bruger } = useFleet();

  const [valgtId, setValgtId] = useState(null);
  const [valgtOrdreId, setValgtOrdreId] = useState(null);
  const [svar, setSvar] = useState(null);
  const [arbejder, setArbejder] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [grund, setGrund] = useState("");
  const [kontant, setKontant] = useState(TOM_KONTANT);

  const liste = useListe("fakturaer", {
    ordnPaa: "fakturadatoMs", vindueDage: 400, graense: 500, demo: DEMO_FAKTURAER,
  });
  const indkoeb = useListe("indkoeb", {
    ordnPaa: "dato", vindueDage: 400, graense: 1000, demo: DEMO_INDKOEBSLINJER,
  });
  const leverandoerer = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });
  const ordrer = useListe("indkoebsordrer", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 300, demo: DEMO_INDKOEBSORDRER,
  });
  const regelPost = usePost(null, "godkendelsesregler", { demo: DEMO_GODKENDELSESREGLER });
  const brugere = useListe("brugere", { vindue: "alle", graense: 200 });

  if (henter || liste.henter || indkoeb.henter) return <Henter hvad="fakturaer" />;
  /* En AFVIST læsning er ikke en tom fakturaliste. */
  if (blokerer(liste.tilstand)) {
    return <Datatilstand tilstand={liste.tilstand} genprov={liste.genindlaes} />;
  }
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal og skal alligevel kunne bruge skærmen. */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  /* ⚠ OPSLAGET BYGGES AF DEN HENTEDE LISTE, ikke af demofilen — det var en
     modul-konst engang, og hos en rigtig kunde stod leverandørkolonnen tom. */
  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);
  const brugerNavn = (uid) => {
    const b = brugere.data.find((x) => x.id === uid);
    return b?.navn || b?.email || uid || "—";
  };

  const maaGodkende = harPerm(bruger?.perms, PERM_GODKEND);
  const maaSkrive = harPerm(bruger?.perms, PERM.indkoebSkriv);
  const regler = regelPost.post || STANDARD_GODKENDELSESREGLER;

  const fakturaer = liste.data;
  const valgt = fakturaer.find((f) => f.id === valgtId) || null;

  /* ⚠ "UDEN MATCH" MÅLES MOD NODEN, og en HÆNGENDE reference tæller med — et
     id der peger på noget som ikke findes, ser matchet ud og er det ikke. */
  const findesOrdre = new Set(ordrer.data.map((o) => o.id));
  /* ⚠ OG ARTEN SKAL MED (beslutning 86). Feltet er faelles: en faktura
     placeret paa en Fleet-sag baerer ogsaa et `destinationId`, og uden
     artstjekket ville den taelle som matchet mod en ordre der ikke findes.
     ⚠ Den taeller heller ikke som UDEN match her — den ER placeret, bare
     et andet sted. Procure-skaermen er én linse paa de faelles fakturaer. */
  const erProcure = (f) => f.destinationArt === "procure";
  const udenMatch = fakturaer.filter(
    (f) => !f.ikkeMatchbar && !f.destinationArt
      || (erProcure(f) && f.destinationId && !findesOrdre.has(f.destinationId)));
  const tilGodkendelse = fakturaer.filter((f) => f.status === "modtaget");
  const godkendtDenneMaaned = fakturaer.filter(
    (f) => f.status === "godkendt" || f.status === "bogfoert");
  const udenBilag = kontantUdenBilag(indkoeb.data);

  /* Forslagene til den valgte. Regnes her — de gemmes ikke. */
  const matchede = fakturaer.map((f) => f.destinationId).filter(Boolean);
  const forslag = valgt
    ? matchForslag(valgt, ordrer.data, { matchede: matchede.filter((id) => id !== valgt.destinationId) })
    : [];
  const valgtOrdre = ordrer.data.find((o) => o.id === (valgtOrdreId || valgt?.destinationId)) || null;

  const vaelg = (f) => { setValgtId(f.id); setValgtOrdreId(f.destinationId || null); setSvar(null); };

  const koer = async (fn) => {
    setArbejder(true);
    const r = await fn();
    setSvar(r);
    setArbejder(false);
    setDialog(null);
    setGrund("");
    if (r.ok) { liste.genindlaes(); indkoeb.genindlaes(); }
    return r;
  };

  const bekraeftMatch = () => koer(() => matchFaktura({
    fakturaId: valgt.id, ordreId: valgtOrdreId,
  }));

  const gemKontant = async () => {
    const r = await koer(() => gemKontantkoeb({
      vare: kontant.vare,
      leverandoerId: kontant.leverandoerId,
      antal: kontant.antal === "" ? undefined : Number(kontant.antal),
      /* ⚠ KRONER IND, ØRE UD — oversat ét sted. En float i basen fakturerer
         forkert, og fejlen ses først på et regnskab. */
      prisPrEnhedOere: kontant.belob === "" ? undefined : Math.round(Number(kontant.belob) * 100),
      momsOere: kontant.moms === "" ? undefined : Math.round(Number(kontant.moms) * 100),
      enhed: kontant.enhed,
      udlaegAf: kontant.udlaegAf || undefined,
      note: kontant.note || undefined,
      dato: Date.now(),
    }));
    if (r.ok) setKontant(TOM_KONTANT);
  };

  const brugervalg = [
    { vaerdi: "", label: "Vælg hvem der lagde ud…" },
    ...brugere.data.map((b) => ({ vaerdi: b.id, label: b.navn || b.email || b.id })),
  ];
  const levvalg = [
    { vaerdi: "", label: "Vælg leverandør…" },
    ...leverandoerer.data.map((l) => ({ vaerdi: l.id, label: l.navn })),
  ];

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kpiadgang utilgaengelige={utilgaengelige} />
      {k && (
        <KpiRaekke>
          {/* Feltet fra kpi/, ikke et hardkodet 21. Dashboard viser samme tal. */}
          <KpiKort label="Fakturaer til godkendelse" vaerdi={num(k.indkoeb.fakturaerTilGodkendelse)} />
          {/* AFLEDT af den viste liste. Labelen siger det. */}
          <KpiKort label="Manglende match" vaerdi={num(udenMatch.length)} note="i de hentede" />
          <KpiKort label="Godkendt denne måned" vaerdi={num(k.indkoeb.godkendtDenneMaaned)} />
          {/* ⚠ MANGLEN TÆLLES FREM FOR AT SPÆRRE — der er ingen fillagring at
              kræve en kvittering med. Fjern ikke tællingen når den kommer;
              så bliver den først rigtig. Samme greb som
              kpi.opgaver.udenTidsregistrering (beslutning 50). */}
          <KpiKort label="Kontantkøb uden bilag" vaerdi={num(udenBilag.length)}
                   note="fillagring er ikke bygget" />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />
      <Formularsvar svar={svar} okTekst="Gemt." />

      {/* ---- Modtag, match, kontantkøb — planchens tre spalter ---------- */}
      <Gitter kolonner="minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)">
        <Kort titel="Modtag faktura">
          {/* ⚠ IKKE EN DEAKTIVERET KNAP UDEN EN GRUND. Planchen har et
              slip-felt; der er ingen Storage sat op, og en fil ligger uden for
              databasereglerne og har sine egne. Samme mønster som
              filfelterne på Indkøbsbehov. */}
          <div className="fc-slipfelt">
            <Ikon navn="dokument" />
            <b>Upload er ikke bygget endnu</b>
            <span className="fc-hint">
              PDF- og billedupload kræver fillagring med sine egne adgangsregler
              pr. virksomhed, og det er sin egen opgave. Fakturaer oprettes
              indtil da af den vej der modtager dem.
            </span>
          </div>
          <p className="fc-hint">
            Faktura-mail kan tilsluttes senere. Sagsbaseret mail er{" "}
            <b>fase 0</b> — kun visning; modtagevej og parsing mangler.
          </p>
        </Kort>

        <Kort titel="Foreslåede matches">
          {!valgt ? (
            <Tom>Vælg en faktura i listen for at se hvilke bestillinger den kan høre til.</Tom>
          ) : (
            <>
              <p className="fc-hint" style={{ marginTop: 0 }}>
                Forslag ud fra <b>bestillingsnummer</b>, leverandør, beløb og dato.
                {" "}<b>Kun et bestillingsnummer giver 100 %</b> — alt andet er en
                slutning.
              </p>
              {!forslag.length ? (
                <Tom>
                  Ingen bestilling passer. En faktura fra en leverandør vi ikke har
                  en åben bestilling hos, er ikke en fejl — men den skal afklares.
                </Tom>
              ) : forslag.map((f) => (
                <label key={f.ordre.id}
                       className={`fc-forslag${valgtOrdreId === f.ordre.id ? " fc-forslag-valgt" : ""}`}>
                  <input type="radio" name="match" checked={valgtOrdreId === f.ordre.id}
                         disabled={!maaSkrive}
                         aria-label={`Match med ${f.ordre.nummer}`}
                         onChange={() => setValgtOrdreId(f.ordre.id)} />
                  <span className="fc-forslag-krop">
                    <span className="fc-row">
                      <b>{f.ordre.nummer}</b>
                      <Pille tone={f.score >= 90 ? "ok" : f.score >= 60 ? "warn" : "info"}>
                        {f.score} % match
                      </Pille>
                    </span>
                    <span className="fc-hint">
                      {lvNavn(f.ordre.leverandoerId)} · {kr(f.sumOere)} ekskl. moms
                    </span>
                    {/* ⚠ HVAD SCOREN BYGGER PÅ. Et tal alene er en fornemmelse
                        med to decimaler; signalerne er dét der gør den
                        efterprøvelig. */}
                    <span className="fc-hint">
                      {f.signaler.map((s) => MATCHSIGNAL[s].label).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
              <div className="fc-knapper" style={{ justifyContent: "flex-start", marginTop: 12 }}>
                <Knap variant="primaer" disabled={!valgtOrdreId || arbejder || !maaSkrive}
                      onClick={bekraeftMatch}>
                  Bekræft match
                </Knap>
                <Knap disabled={arbejder || !maaSkrive}
                      onClick={() => setDialog({ art: "ikkeMatchbar" })}>
                  Markér som ikke-matchbar
                </Knap>
                {valgt.destinationId && (
                  <Knap disabled={arbejder || !maaSkrive}
                        onClick={() => koer(() => matchFaktura({ fakturaId: valgt.id, handling: "fjern" }))}>
                    Fjern match
                  </Knap>
                )}
              </div>
            </>
          )}
        </Kort>

        <Kort titel="Kontant køb">
          <p className="fc-hint" style={{ marginTop: 0 }}>
            {/* ⚠ DET BLIVER EN INDKØBSLINJE. En egen node ville være den samme
                kendsgerning to steder, og hvert beløb i modulet skulle huske
                at lægge dem sammen. */}
            Registreres som en <b>indkøbslinje</b> med betalingsform{" "}
            <i>kontant</i> — samme node som alt andet vi har købt.
          </p>
          <Felt id="k-vare" label="Vare" kraevet vaerdi={kontant.vare}
                saet={(v) => setKontant({ ...kontant, vare: v })} />
          <Felt id="k-lev" label="Leverandør" kraevet valgmuligheder={levvalg}
                vaerdi={kontant.leverandoerId}
                saet={(v) => setKontant({ ...kontant, leverandoerId: v })} />
          <Feltraekke>
            <Felt id="k-antal" label="Antal" type="number" vaerdi={kontant.antal}
                  suffiks={kontant.enhed}
                  saet={(v) => setKontant({ ...kontant, antal: v })} />
            {/* ⚠ EKSKL. MOMS, OG ETIKETTEN SIGER DET. En kvittering viser
                inkl.; taster man bontotalen her, er beløbet 25 % for højt og
                ingen opdager det før regnskabet ikke stemmer. */}
            <Felt id="k-belob" label="Beløb pr. stk. ekskl. moms" type="number" kraevet
                  suffiks="kr." vaerdi={kontant.belob}
                  saet={(v) => setKontant({ ...kontant, belob: v })} />
          </Feltraekke>
          <Felt id="k-moms" label="Moms i alt" type="number" suffiks="kr."
                vaerdi={kontant.moms} hint="Står på bonnen. Gættes ikke."
                saet={(v) => setKontant({ ...kontant, moms: v })} />
          {/* ⚠ HVEM DER LAGDE UD, ER IKKE HVEM DER TASTER. En kontorassistent
              taster en kollegas bon, og pengene skal til kollegaen. */}
          <Felt id="k-udlaeg" label="Lagt ud af" kraevet valgmuligheder={brugervalg}
                vaerdi={kontant.udlaegAf}
                saet={(v) => setKontant({ ...kontant, udlaegAf: v })} />
          <Felt id="k-note" label="Note" vaerdi={kontant.note}
                saet={(v) => setKontant({ ...kontant, note: v })} />
          <p className="fc-hint">
            <b>Kvittering kan ikke vedhæftes endnu</b> — der er ingen fillagring.
            Manglen <b>tælles</b> i nøgletallet ovenfor frem for at spærre: et
            krav man ikke kan opfylde, bliver til et felt man skriver "ja" i.
          </p>
          <Knap variant="primaer" disabled={arbejder || !maaSkrive} onClick={gemKontant}>
            Gem kontant køb
          </Knap>
        </Kort>
      </Gitter>

      <Afstemning />

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort titel={`Modtagne fakturaer (${num(fakturaer.length)})`}>
          <Tabel
            kolonner={[
              { key: "fakturanummer", label: "Fakturanr.", render: (r) => <b>{r.fakturanummer}</b> },
              { key: "leverandoerId", label: "Leverandør", render: (r) => lvNavn(r.leverandoerId) },
              { key: "fakturadatoMs", label: "Dato", render: (r) => dato(r.fakturadatoMs) },
              { key: "forfaldMs", label: "Forfald", render: (r) => dato(r.forfaldMs) },
              /* TO KOLONNER, aldrig ét inkl.-beløb. */
              { key: "beloebOere", label: "Ekskl. moms", num: true, render: (r) => kr(r.beloebOere) },
              { key: "momsOere", label: "Moms", num: true, render: (r) => kr(r.momsOere) },
              { key: "total", label: "Total", num: true, render: (r) => kr(fakturaTotalOere(r)) },
              {
                key: "match", label: "Match",
                render: (r) => (
                  <>
                    <Pille tone={MATCHTILSTAND[matchtilstand(r)].tone}>
                      {MATCHTILSTAND[matchtilstand(r)].label}
                    </Pille>
                    {r.destinationId && (
                      <div className="fc-hint">
                        <code>{ordrer.data.find((o) => o.id === r.destinationId)?.nummer || r.destinationId}</code>
                      </div>
                    )}
                  </>
                ),
              },
              /* Beslutning 20: sporet tilbage til den tråd der aftalte arbejdet. */
              { key: "sagsnummer", label: "Sag", render: (r) => (r.sagsnummer
                  ? <Link className="fc-a" to="/flaade"><code>{r.sagsnummer}</code></Link>
                  : <span className="fc-neutral">—</span>) },
              { key: "status", label: "Status",
                render: (r) => <Pille tone={FAKTURASTATUS[r.status]?.pill}>
                  {FAKTURASTATUS[r.status]?.label}</Pille> },
              { key: "vaelg", label: "", render: (r) => (
                  <Knap onClick={() => vaelg(r)} disabled={r.id === valgtId}>
                    {r.id === valgtId ? "Vist" : "Vis"}
                  </Knap>) },
            ]}
            raekker={fakturaer}
            tom="Ingen fakturaer."
          />

          <p className="fc-hint" style={{ marginTop: 12 }}>
            <b>{num(udenMatch.length)}</b> fakturaer mangler match mod en
            bestilling, <b>{num(tilGodkendelse.length)}</b> afventer godkendelse,
            og <b>{num(godkendtDenneMaaned.length)}</b> er godkendt eller bogført.
            Tallene er <b>beregnet af listen ovenfor</b> — mockuppens KPI-kort sagde 8
            mens tabellen sagde 16, fordi de var to kilder til samme tal.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Beløbet står som <b>beloebOere ekskl. moms</b> med <b>momsOere</b> ved
            siden af. Totalen beregnes — ét felt med moms indeni ville betyde at en
            rapport lægger inkl.-tal sammen med ekskl.-tal.
          </p>
        </Kort>

        <Detaljer
          faktura={valgt} ordre={valgtOrdre} lvNavn={lvNavn} brugerNavn={brugerNavn}
          maaGodkende={maaGodkende} regler={regler} arbejder={arbejder}
          paaSkift={(til) => (til === "afvist"
            ? setDialog({ art: "afvis" })
            : koer(() => skiftFaktura({ fakturaId: valgt.id, til })))}
        />
      </Gitter>

      {dialog && (
        <Dialog
          titel={dialog.art === "afvis" ? "Afvis faktura" : "Ingen af bestillingerne passer"}
          under={dialog.art === "afvis"
            ? "Skriv hvorfor. En afvist regning skal kunne forklares til leverandøren."
            : "Skriv hvorfor. Uden en grund begynder den næste forfra på det samme opslag."}
          onLuk={() => { setDialog(null); setGrund(""); }}
          handling={
            <Knap variant="primaer" disabled={!grund.trim() || arbejder}
                  onClick={() => (dialog.art === "afvis"
                    ? koer(() => skiftFaktura({ fakturaId: valgt.id, til: "afvist", begrundelse: grund.trim() }))
                    : koer(() => matchFaktura({ fakturaId: valgt.id, handling: "ikkeMatchbar", grund: grund.trim() })))}>
              {dialog.art === "afvis" ? "Afvis" : "Markér"}
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

/* ---- Tre totaler, to navngivne afvigelser ------------------------------ */

function Afstemning() {
  const a = demoAfstemning();

  return (
    <Kort titel="Afstemning">
      <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
        <div>
          {/* TRE UAFHÆNGIGE OPGØRELSER — ikke et regnestykke. */}
          <MiniLinje label="Registrerede indkøb" vaerdi={<b>{kr(a.registreredeIndkoebOere)}</b>} />
          <MiniLinje label="Modtagne fakturaer" vaerdi={<b>{kr(a.modtagneFakturaerOere)}</b>} />
          <MiniLinje label="Bogført i regnskabet" vaerdi={<b>{kr(a.bogfoertOere)}</b>} />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Tre <b>uafhængige</b> opgørelser. Mockuppen skrev dem som
            "9.842.250 − 9.781.625 = 9.765.125", men bogført er regnskabets egen
            optælling og ikke afledt af de to andre — det er netop derfor de kan
            være uenige.
          </p>
        </div>

        <div>
          {/* HVER AFVIGELSE MED SIT EGET NAVN OG SIN EGEN HANDLING. */}
          <div className="fc-linje">
            <span>
              <b>Manglende fakturaer</b>
              <br /><span className="fc-hint">registrerede − modtagne · ryk leverandøren</span>
            </span>
            <b className={deviation(a.manglendeFakturaerOere, { betterWhen: "lower" }).tone === "bad"
              ? "fc-bad" : ""}>{kr(a.manglendeFakturaerOere)}</b>
          </div>
          <div className="fc-linje">
            <span>
              <b>Ikke bogført</b>
              <br /><span className="fc-hint">modtagne − bogførte · bogfør fakturaen</span>
            </span>
            <b className="fc-bad">{kr(a.ikkeBogfoertOere)}</b>
          </div>

          <p className="fc-hint" style={{ marginTop: 12 }}>
            To afvigelser, to navne, <b>to forskellige handlinger</b>. Ét felt der hed
            "afvigelse" ville blive læst som ét tal, og så handler ingen på nogen af
            dem — det er beslutning 11 og 14 om igen.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Begge beregnes af de tre totaler og gemmes ikke.
          </p>
        </div>
      </Gitter>
    </Kort>
  );
}

/* ---- Detaljeruden: fakturaen, matchet og godkendelsen ------------------ */

function Detaljer({ faktura, ordre, lvNavn, brugerNavn, maaGodkende, regler, arbejder, paaSkift }) {
  if (!faktura) {
    return (
      <Kort titel="Faktura detaljer">
        <Tom>Vælg en faktura for at se den, matche den og godkende den.</Tom>
      </Kort>
    );
  }

  const kanBekraefte = ordre ? kanMatche(faktura, ordre) : null;
  const afvigelse = matchAfvigelseOere(faktura, ordre);
  const fg = regler.fakturagodkendelse || {};
  const laast = faktura.status === "bogfoert";

  return (
    <Kort titel="Faktura detaljer">
      <MiniLinje label="Leverandør" vaerdi={<b>{lvNavn(faktura.leverandoerId)}</b>} />
      <MiniLinje label="Fakturanr." vaerdi={<code>{faktura.fakturanummer}</code>} />
      <MiniLinje label="Fakturadato" vaerdi={dato(faktura.fakturadatoMs)} />
      <MiniLinje label="Forfald" vaerdi={dato(faktura.forfaldMs)} />
      {/* ⚠ TO LINJER, IKKE ÉN. Planchen skrev ét beløb "inkl. moms" og
          sammenlignede det med ordrens ekskl.-beløb. */}
      <MiniLinje label="Beløb ekskl. moms" vaerdi={<b>{kr(faktura.beloebOere)}</b>} />
      <MiniLinje label="Moms" vaerdi={kr(faktura.momsOere)} />
      <MiniLinje label="Total" vaerdi={<b>{kr(fakturaTotalOere(faktura))}</b>} />
      <MiniLinje label="Status" vaerdi={
        <Pille tone={FAKTURASTATUS[faktura.status]?.pill}>
          {FAKTURASTATUS[faktura.status]?.label}
        </Pille>} />

      <h3 className="fc-underoverskrift">Match</h3>
      {faktura.ikkeMatchbar ? (
        <>
          <Pille tone="info">Ikke matchbar</Pille>
          <p className="fc-hint">{faktura.ikkeMatchbarGrund}</p>
        </>
      ) : !ordre ? (
        <p className="fc-hint">Ingen bestilling valgt. Vælg et forslag ovenfor.</p>
      ) : (
        <>
          <MiniLinje label="Bestilling" vaerdi={<code>{ordre.nummer}</code>} />
          <MiniLinje label="Tilstand" vaerdi={
            <Pille tone={ORDRESTATUS[ordre.status]?.tone}>
              {ORDRESTATUS[ordre.status]?.label || ordre.status}
            </Pille>} />
          <MiniLinje label="Bestilt beløb ekskl. moms" vaerdi={kr(ordreSumOere(ordre))} />
          <MiniLinje label="Linjer" vaerdi={num(linjeListe(ordre).length)} />
          {/* ⚠ AFVIGELSEN ER null NÅR ET AF TALLENE MANGLER — ikke 0. Et nul
              ville betyde "de er ens", hvilket er noget helt andet end "vi
              ved det ikke". */}
          <MiniLinje label="Afvigelse" vaerdi={
            afvigelse === null
              ? <span className="fc-hint">kan ikke regnes</span>
              : <b className={afvigelse === 0 ? "" : "fc-bad"}>{kr(afvigelse)}</b>} />
          {kanBekraefte && !kanBekraefte.ok && (
            <p className="fc-hint fc-bad">{kanBekraefte.aarsag}</p>
          )}
        </>
      )}

      <h3 className="fc-underoverskrift">Godkendelse</h3>
      {/* ⚠ HVEM DER SKAL GODKENDE, KOMMER AF REGLEN — ikke af et felt i
          formularen. Er reglen slået fra, rækker permissionen; det er hele
          meningen med at kunne slå den fra (beslutning 82). */}
      <MiniLinje label="Godkender" vaerdi={
        fg.aktiv
          ? brugerNavn(fg.godkenderUid)
          : <span className="fc-hint">alle med {PERM.indkoebGodkend}</span>} />
      {faktura.godkendtAf && (
        <MiniLinje label="Godkendt af" vaerdi={brugerNavn(faktura.godkendtAf)} />
      )}
      {faktura.begrundelse && (
        <MiniLinje label="Begrundelse" vaerdi={faktura.begrundelse} />
      )}

      <div className="fc-knapper" style={{ justifyContent: "flex-start", marginTop: 12 }}>
        <Knap variant="primaer"
              disabled={!maaGodkende || laast || arbejder || faktura.status === "godkendt"}
              title={maaGodkende ? undefined : `Det kræver ${PERM.indkoebGodkend}.`}
              onClick={() => paaSkift("godkendt")}>
          Godkend
        </Knap>
        <Knap disabled={!maaGodkende || laast || arbejder || faktura.status === "afvist"}
              title={maaGodkende ? undefined : `Det kræver ${PERM.indkoebGodkend}.`}
              onClick={() => paaSkift("afvist")}>
          Afvis
        </Knap>
        {/* ⚠ MAN BOGFØRER IKKE NOGET DER IKKE ER GODKENDT. Planchens egen
            fodnote siger det: "Efter godkendelse bogføres og sendes til
            regnskabssystemet." */}
        <Knap disabled={laast || arbejder || faktura.status !== "godkendt"}
              title={faktura.status === "godkendt" ? undefined
                : "Fakturaen skal godkendes før den kan bogføres."}
              onClick={() => paaSkift("bogfoert")}>
          Bogfør
        </Knap>
      </div>

      {laast && (
        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>Fakturaen er bogført.</b> Hverken match eller godkendelse kan ændres
          bagefter — posten er sendt til regnskabet, og en ændring ville gøre en
          afstemning der stemte, til en der ikke gør.
        </p>
      )}
      <p className="fc-hint" style={{ marginTop: 10 }}>
        Bogføring sætter tilstanden her. <b>Der sendes ikke noget til et
        regnskabssystem</b> — der er ingen integration, og en knap der påstod
        det, ville få nogen til at holde op med at bogføre manuelt.
      </p>
    </Kort>
  );
}
