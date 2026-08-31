/* src/moduler/indkoeb/Fakturaer.jsx
 * Procure — match & kontantkøb. Trin 4 af fem (beslutning 78/83), Planche 1.
 *
 * ⚠ SKIVE 4A — INDSKRÆNKET TIL DET DER ER ÆGTE PROCURE-SPECIFIKT.
 * Faktura-listen, status og godkendelse duplikerede det fælles Fakturacenter
 * (`/oekonomi/fakturacenter`, Fælles → Fakturaer & bilag) — samme node, to
 * skærme der viste det samme. De er flyttet derhen; denne skærm har kun
 * match-til-bestillingslinje og kontantkøb tilbage, som ikke findes andre
 * steder. "Afstemning" er også fjernet: den viste `demoAfstemning()`, en
 * PERMANENT hardkodet mockup-fixture uden nogen ægte kilde til det tredje
 * tal ("bogført — regnskabssystemets egen opgørelse"), og en permanent demo
 * på en rigtig skærm er præcis den fejl CLAUDE.md advarer mod.
 *
 * ⚠ MATCHSCOREN ER EN PÅSTAND OM SIKKERHED. "92 %" regnes af navngivne
 * signaler, og skærmen viser HVILKE der slog til — så den der bekræfter, kan
 * se om de 92 % kommer af et bestillingsnummer eller af at beløbet
 * tilfældigvis lignede. Kun et bestillingsnummer giver 100.
 *
 * ⚠ BELØB EKSKL. MOMS PLUS momsOere — aldrig ét beløb inkl. moms, som
 * blandede de to i mockuppen.
 *
 * ⚠ FILUPLOAD ER IKKE BYGGET, og det står på skærmen. Der er ingen Storage
 * sat op; en fil ligger uden for databasereglerne og har sine egne. En
 * deaktiveret knap uden en grund er en attrap.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato, isoTilMs } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Pille, Henter, Datatilstand, Knap,
  Gitter, MiniLinje, Felt, Feltraekke, Formularsvar, Dialog, Kpiadgang } from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { FAKTURASTATUS, leverandoerNavn, fakturaTotalOere } from "../../fleet/leverandoerer.js";
import {
  matchForslag, MATCHSIGNAL, kanMatche,
  matchAfvigelseOere, ordreSumOere, linjeListe, ORDRESTATUS, kontantUdenBilag,
} from "../../fleet/procure.js";
import { matchFaktura, gemKontantkoeb } from "../../fleet/faktura.js";
import {
  matchForslag as braendstofMatchForslag, afgørAutomatch, BRAENDSTOF_MATCHSIGNAL,
} from "../../fleet/braendstofmatch.js";
import {
  koerBraendstofAutomatch, braendstofMatchBekraeft,
} from "../../fleet/braendstofmatch-klient.js";
/* ⚠ KUN SOM FALDBAKKE I useListe. Skærmen slår ikke op i sættene. */
import { DEMO_LEVERANDOERER, DEMO_INDKOEBSLINJER, DEMO_FAKTURAER } from "../../fleet/demo-indkoeb.js";
import { DEMO_INDKOEBSORDRER } from "../../fleet/demo-procure.js";
import { DEMO_INDBERETNINGER } from "../../fleet/demo-indberetninger.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";

const TOM_KONTANT = {
  vare: "", leverandoerId: "", antal: "1", enhed: "stk",
  belob: "", moms: "", udlaegAf: "", note: "",
};

export default function Fakturaer() {
  const { henter, tilstand, genindlaes, utilgaengelige } = useKpi();
  const { bruger } = useFleet();

  const [valgtId, setValgtId] = useState(null);
  const [valgtOrdreId, setValgtOrdreId] = useState(null);
  const [svar, setSvar] = useState(null);
  const [arbejder, setArbejder] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [grund, setGrund] = useState("");
  const [kontant, setKontant] = useState(TOM_KONTANT);

  /* ---- G.2 — brændstofmatch --------------------------------------- */
  const [valgtBmId, setValgtBmId] = useState(null);
  const [valgtTankningId, setValgtTankningId] = useState(null);
  const [bmSvar, setBmSvar] = useState(null);
  const [bmArbejder, setBmArbejder] = useState(false);
  const [bmDialog, setBmDialog] = useState(false);
  const [bmGrund, setBmGrund] = useState("");
  const [automatchKoerer, setAutomatchKoerer] = useState(false);
  const [automatchSvar, setAutomatchSvar] = useState(null);

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
  /* ⚠ SKIVE 4A — stadig hentet for "Lagt ud af"-dropdownen i kontantkøbet;
     godkender-opslaget der brugte den, hører nu til Fakturacenteret. */
  const brugere = useListe("brugere", { vindue: "alle", graense: 200 });

  /* ⚠ G.2 — server-side filtreret på art, samme mønster som andre
     .indexOn-felter. Tankningerne er de eneste indberetninger denne skærm
     har brug for. */
  const tankninger = useListe("indberetninger", {
    ordnPaa: "art", lig: "braendstof", graense: 1000, demo: DEMO_INDBERETNINGER,
  });
  const braendstofmatch = useListe("braendstofmatch", {
    vindue: "alle", graense: 1000, demo: [],
  });
  const koeretoejer = useListe("koeretoejer", { vindue: "alle", demo: DEMO_KOERETOEJER });

  if (henter || liste.henter || indkoeb.henter || tankninger.henter || braendstofmatch.henter) {
    return <Henter hvad="fakturaer" />;
  }
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

  /* ⚠ SKIVE 4A — TO PERMISSIONS, IKKE ÉN. Match skriver på `fakturaer/`
     (fakturaerSkriv); kontantkøb skriver en `indkoeb`-linje (indkoebSkriv,
     uændret) — to forskellige noder, to forskellige tjek. */
  const maaMatche = harPerm(bruger?.perms, PERM.fakturaerSkriv);
  const maaKontant = harPerm(bruger?.perms, PERM.indkoebSkriv);

  /* ---- G.2 — brændstofmatch --------------------------------------- */
  const koeretoejNavn = (id) => {
    const k = koeretoejer.data.find((kt) => kt.id === id);
    return k?.kaldenavn || k?.navn || id;
  };
  const bmMatchMap = Object.fromEntries(braendstofmatch.data.map((m) => [m.indkoebId, m]));
  /* ⚠ SAMME "HÆNGENDE REFERENCE TÆLLER MED"-PRINCIP SOM udenMatch OVENFOR. */
  const braendstofLinjer = indkoeb.data.filter((l) => l.kategori === "braendstof");
  const bmUbehandlede = braendstofLinjer.filter((l) =>
    !bmMatchMap[l.id] && l.fakturastatus !== "bogfoert" && l.fakturastatus !== "afvist");
  const bmAfgjorte = braendstofLinjer
    .map((l) => ({ linje: l, match: bmMatchMap[l.id] }))
    .filter((x) => x.match);
  /* ⚠ SAMME "SCOREN REGNES HER, GEMMES ALDRIG"-PRINCIP SOM forslag NEDENFOR. */
  const bmMatchedeTankningIder = braendstofmatch.data
    .filter((m) => m.tilstand === "matchet")
    .map((m) => m.tankningId);
  const bmValgtLinje = bmUbehandlede.find((l) => l.id === valgtBmId) || null;
  const bmForslag = bmValgtLinje
    ? braendstofMatchForslag(bmValgtLinje, tankninger.data, { matchedeTankningIder: bmMatchedeTankningIder })
    : [];
  const bmAfgoerelse = afgørAutomatch(bmForslag);

  const vaelgBm = (l) => { setValgtBmId(l.id); setValgtTankningId(null); setBmSvar(null); };

  const koerBm = async (fn) => {
    setBmArbejder(true);
    const r = await fn();
    setBmSvar(r);
    setBmArbejder(false);
    setBmDialog(false);
    setBmGrund("");
    if (r.ok) { indkoeb.genindlaes(); braendstofmatch.genindlaes(); }
    return r;
  };

  const koerAutomatch = async () => {
    setAutomatchKoerer(true);
    setAutomatchSvar(null);
    const r = await koerBraendstofAutomatch();
    setAutomatchSvar(r);
    setAutomatchKoerer(false);
    if (r.ok) { indkoeb.genindlaes(); braendstofmatch.genindlaes(); }
  };

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
  const udenBilag = kontantUdenBilag(indkoeb.data);
  /* ⚠ SKIVE 4A — DEM DER OVERHOVEDET ER PROCURES AT MATCHE: uplaceret, eller
     allerede placeret på Procure. En faktura placeret på Fleet/Facility/
     Lager er ikke denne skærms ærinde — det er Fakturacenterets. */
  const matchbare = fakturaer.filter((f) => !f.destinationArt || erProcure(f));

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
  /* ⚠ SKIVE 4B — INAKTIVE KAN IKKE VÆLGES TIL NYT, men den allerede valgte
     bliver stående. */
  const levvalg = [
    { vaerdi: "", label: "Vælg leverandør…" },
    ...leverandoerer.data
      .filter((l) => l.aktiv !== false || l.id === kontant.leverandoerId)
      .map((l) => ({ vaerdi: l.id, label: l.navn })),
  ];

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kpiadgang utilgaengelige={utilgaengelige} />
      <KpiRaekke>
        {/* AFLEDT af den hentede liste — ikke fra kpi/. */}
        <KpiKort label="Manglende match" vaerdi={num(udenMatch.length)} note="i de hentede" />
        {/* ⚠ MANGLEN TÆLLES FREM FOR AT SPÆRRE — der er ingen fillagring at
            kræve en kvittering med. Fjern ikke tællingen når den kommer;
            så bliver den først rigtig. Samme greb som
            kpi.opgaver.udenTidsregistrering (beslutning 50). */}
        <KpiKort label="Kontantkøb uden bilag" vaerdi={num(udenBilag.length)}
                 note="fillagring er ikke bygget" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />
      <Formularsvar svar={svar} okTekst="Gemt." />

      <p className="fc-hint">
        Fakturaernes fulde liste, status og godkendelse foregår i{" "}
        <Link className="fc-a" to="/oekonomi/fakturacenter?destination=procure">
          Fakturaer &amp; bilag
        </Link>. Her er kun det der er Procures eget: match mod en
        bestilling, og kontantkøb.
      </p>

      {/* ---- Match og kontantkøb — planchens to resterende spalter ------ */}
      <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
        <Kort titel="Foreslåede matches">
          {/* ⚠ SKIVE 4A — EN SMAL VÆLGER, IKKE DEN FULDE LISTE. Fakturaernes
              fulde tabel med status/godkendelse ligger nu i Fakturacenteret;
              her vises kun dem der overhovedet er Procures at matche —
              uplacerede, eller allerede placeret på Procure (så et match kan
              rettes eller fjernes). */}
          <div className="fc-vaelger" style={{ marginBottom: 12 }}>
            {matchbare.length === 0 ? (
              <Tom>Ingen fakturaer at matche lige nu.</Tom>
            ) : matchbare.map((f) => (
              <label key={f.id} className={`fc-forslag${f.id === valgtId ? " fc-forslag-valgt" : ""}`}>
                <input type="radio" name="valgt-faktura" checked={f.id === valgtId}
                       aria-label={`Vælg ${f.fakturanummer}`}
                       onChange={() => vaelg(f)} />
                <span className="fc-forslag-krop">
                  <span className="fc-row">
                    <b>{f.fakturanummer}</b>
                    <span className="fc-hint">{kr(f.beloebOere)}</span>
                  </span>
                  <span className="fc-hint">{lvNavn(f.leverandoerId)} · {dato(f.fakturadatoMs)}</span>
                </span>
              </label>
            ))}
          </div>
          {!valgt ? (
            <Tom>Vælg en faktura ovenfor for at se hvilke bestillinger den kan høre til.</Tom>
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
                         disabled={!maaMatche}
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
                <Knap variant="primaer" disabled={!valgtOrdreId || arbejder || !maaMatche}
                      onClick={bekraeftMatch}>
                  Bekræft match
                </Knap>
                <Knap disabled={arbejder || !maaMatche}
                      onClick={() => setDialog({ art: "ikkeMatchbar" })}>
                  Markér som ikke-matchbar
                </Knap>
                {valgt.destinationId && (
                  <Knap disabled={arbejder || !maaMatche}
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
          <Knap variant="primaer" disabled={arbejder || !maaKontant} onClick={gemKontant}>
            Gem kontant køb
          </Knap>
        </Kort>
      </Gitter>

      {/* ---- G.2 — Brændstofmatch ---------------------------------- */}
      <Kort titel="Brændstofmatch"
            handling={
              <Knap disabled={automatchKoerer || !maaKontant || bmUbehandlede.length === 0}
                    onClick={koerAutomatch}
                    title={maaKontant ? undefined : `Kræver ${PERM.indkoebSkriv}.`}>
                {automatchKoerer ? "Kører …" : "Kør automatisk match"}
              </Knap>
            }>
        <p className="fc-hint" style={{ marginTop: 0 }}>
          Matcher leverandørens fakturalinjer (brændstof) mod chaufførernes
          egne tankningsregistreringer — <b>enhed, dato og literantal</b>.
          Prisen kommer altid fra fakturaen, aldrig fra chaufføren.
          Automatisk match sker kun når der er <b>ét</b> utvetydigt forslag —
          to forslag er per definition tvetydigt, uanset hvor meget bedre det
          ene er.
        </p>
        {automatchSvar && (
          automatchSvar.ok ? (
            <p className="fc-hint">
              {automatchSvar.data.automatiskMatchet} matchet automatisk ·
              {" "}{automatchSvar.data.forbliverAabne} venter stadig på et menneske.
            </p>
          ) : <Formularsvar svar={automatchSvar} />
        )}

        <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
          <div>
            <div className="fc-vaelger" style={{ marginBottom: 12 }}>
              {bmUbehandlede.length === 0 ? (
                <Tom>Ingen ubehandlede brændstoflinjer lige nu.</Tom>
              ) : bmUbehandlede.map((l) => (
                <label key={l.id} className={`fc-forslag${l.id === valgtBmId ? " fc-forslag-valgt" : ""}`}>
                  <input type="radio" name="valgt-braendstoflinje" checked={l.id === valgtBmId}
                         aria-label={`Vælg ${l.vare}, ${dato(l.dato)}`}
                         onChange={() => vaelgBm(l)} />
                  <span className="fc-forslag-krop">
                    <span className="fc-row">
                      <b>{num(l.antal, 1)} l</b>
                      <span className="fc-hint">{dato(l.dato)}</span>
                    </span>
                    <span className="fc-hint">{lvNavn(l.leverandoerId)} · {l.reference}</span>
                  </span>
                </label>
              ))}
            </div>

            {!bmValgtLinje ? (
              <Tom>Vælg en fakturalinje for at se hvilke tankninger den kan høre til.</Tom>
            ) : (
              <>
                {!bmForslag.length ? (
                  <Tom>
                    Ingen tankning passer inden for vinduet. En chauffør har
                    måske endnu ikke registreret den.
                  </Tom>
                ) : bmForslag.map((f) => (
                  <label key={f.tankning.id}
                         className={`fc-forslag${valgtTankningId === f.tankning.id ? " fc-forslag-valgt" : ""}`}>
                    <input type="radio" name="braendstofmatch" checked={valgtTankningId === f.tankning.id}
                           disabled={!maaKontant}
                           aria-label={`Match med tankning ${dato(isoTilMs(f.tankning.dato))}`}
                           onChange={() => setValgtTankningId(f.tankning.id)} />
                    <span className="fc-forslag-krop">
                      <span className="fc-row">
                        <b>{koeretoejNavn(f.tankning.koeretoejId)}</b>
                        <Pille tone={f.score >= 85 ? "ok" : f.score >= 60 ? "warn" : "info"}>
                          {f.score} % match
                        </Pille>
                      </span>
                      <span className="fc-hint">{dato(isoTilMs(f.tankning.dato))} · {num(f.tankning.liter, 1)} l</span>
                      <span className="fc-hint">
                        {f.signaler.map((s) => BRAENDSTOF_MATCHSIGNAL[s].label).join(" · ")}
                      </span>
                    </span>
                  </label>
                ))}
                {bmAfgoerelse.automatisk && (
                  <p className="fc-hint">
                    Ét utvetydigt forslag — "Kør automatisk match" bekræfter den uden at du behøver vælge.
                  </p>
                )}
                <div className="fc-knapper" style={{ justifyContent: "flex-start", marginTop: 12 }}>
                  <Knap variant="primaer" disabled={!valgtTankningId || bmArbejder || !maaKontant}
                        onClick={() => koerBm(() => braendstofMatchBekraeft({
                          indkoebId: bmValgtLinje.id, tankningId: valgtTankningId,
                        }))}>
                    Bekræft match
                  </Knap>
                  <Knap disabled={bmArbejder || !maaKontant} onClick={() => setBmDialog(true)}>
                    Markér som ikke-matchbar
                  </Knap>
                </div>
                <Formularsvar svar={bmSvar} okTekst="Gemt." />
              </>
            )}
          </div>

          <div>
            <h3 className="fc-underoverskrift" style={{ marginTop: 0 }}>Afgjorte</h3>
            {bmAfgjorte.length === 0 ? (
              <Tom>Ingen afgjorte brændstoflinjer endnu.</Tom>
            ) : bmAfgjorte.map(({ linje: l, match: m }) => (
              <div key={l.id} className="fc-forslag">
                <span className="fc-forslag-krop">
                  <span className="fc-row">
                    <b>{num(l.antal, 1)} l — {dato(l.dato)}</b>
                    <Pille tone={m.tilstand === "matchet" ? "ok" : "info"}>
                      {m.tilstand === "matchet" ? "Matchet" : "Ikke matchbar"}
                      {m.automatisk ? " (automatisk)" : ""}
                    </Pille>
                  </span>
                  {m.tilstand === "matchet" ? (
                    <span className="fc-hint">
                      {koeretoejNavn(tankninger.data.find((t) => t.id === m.tankningId)?.koeretoejId)}
                    </span>
                  ) : (
                    <span className="fc-hint">{m.ikkeMatchbarGrund}</span>
                  )}
                  {l.fakturastatus !== "bogfoert" && (
                    <Knap disabled={bmArbejder || !maaKontant}
                          onClick={() => koerBm(() => braendstofMatchBekraeft({
                            indkoebId: l.id, handling: "fjern",
                          }))}>
                      Fjern match
                    </Knap>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Gitter>
      </Kort>

      {valgt && (
        <Detaljer faktura={valgt} ordre={valgtOrdre} lvNavn={lvNavn} />
      )}

      {dialog && (
        <Dialog
          titel="Ingen af bestillingerne passer"
          under="Skriv hvorfor. Uden en grund begynder den næste forfra på det samme opslag."
          onLuk={() => { setDialog(null); setGrund(""); }}
          handling={
            <Knap variant="primaer" disabled={!grund.trim() || arbejder}
                  onClick={() => koer(() => matchFaktura({
                    fakturaId: valgt.id, handling: "ikkeMatchbar", grund: grund.trim(),
                  }))}>
              Markér
            </Knap>
          }
        >
          <Felt id="grund" label="Begrundelse" kraevet vaerdi={grund} saet={setGrund}
                hint="Står på fakturaen — ikke i auditloggen. Fritekst hører ikke der." />
        </Dialog>
      )}

      {bmDialog && (
        <Dialog
          titel="Ingen af tankningerne passer"
          under="Skriv hvorfor. Uden en grund begynder den næste forfra på det samme opslag."
          onLuk={() => { setBmDialog(false); setBmGrund(""); }}
          handling={
            <Knap variant="primaer" disabled={!bmGrund.trim() || bmArbejder}
                  onClick={() => koerBm(() => braendstofMatchBekraeft({
                    indkoebId: bmValgtLinje.id, handling: "ikkeMatchbar", grund: bmGrund.trim(),
                  }))}>
              Markér
            </Knap>
          }
        >
          <Felt id="bm-grund" label="Begrundelse" kraevet vaerdi={bmGrund} saet={setBmGrund}
                hint="Står på fakturalinjen — ikke i auditloggen. Fritekst hører ikke der." />
        </Dialog>
      )}
    </div>
  );
}
/* ---- Detaljeruden: fakturaen og matchet — IKKE godkendelsen ------------ */

/* ⚠ SKIVE 4A — GODKENDELSE/AFVIS/BOGFØR ER FJERNET HERFRA. De duplikerede
   Fakturacenterets knapper mod nøjagtig samme funktion (`fakturastatus`) —
   to steder at trykke "Godkend" er to steder der kan glemme et
   permissionstjek. Status vises stadig (læsning, ingen handling); selve
   godkendelsen sker i Fakturaer & bilag. */
function Detaljer({ faktura, ordre, lvNavn }) {
  const kanBekraefte = ordre ? kanMatche(faktura, ordre) : null;
  const afvigelse = matchAfvigelseOere(faktura, ordre);

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

      <p className="fc-hint" style={{ marginTop: 12 }}>
        Godkendelse, afvisning og bogføring foregår i{" "}
        <Link className="fc-a" to="/oekonomi/fakturacenter?destination=procure">
          Fakturaer &amp; bilag
        </Link>.
      </p>
    </Kort>
  );
}
