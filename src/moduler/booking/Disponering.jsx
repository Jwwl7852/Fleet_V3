/* src/moduler/booking/Disponering.jsx
 * Disponering
 *
 * TO FORRETNINGER, TO NODER — beslutning 21.
 *
 *   Dagsvisning   opgaver med art 'vaerksted'. Timer, 06–18, én dag.
 *   Ugesvisning   etaper. Døgn, syv dage, ETA over døgngrænser og
 *                 grænseovergange.
 *
 * Det er ikke to zoomniveauer af samme datamodel: `opgaver.status`
 * (indberettet → planlagt → igang → udfoert) er et andet maskineri end etapens
 * `tilstand` (kladde → afventerPlan → afventerKoord → reserveret). Skærmen
 * læser derfor to noder og blander dem aldrig sammen i ét gitter.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  ⚠ FASE 0: DET HER ER EN VISNING.
 *
 *  Ingen drag-and-drop. Ingen skrivning. Ingen konflikthåndtering.
 *  "Træk opgave hertil"-felterne ser rigtige ud og gør ingenting — de er
 *  markeret aria-disabled og siger hvorfor i deres title.
 *
 *  Rigtig disponering kræver de Cloud Functions der ikke findes: en
 *  reservation skal skrives atomisk sammen med etapens koeretoejId, og to
 *  disponenter kan ramme samme sekund. Bygger man det interaktive nu, bygger
 *  man det to gange — og den anden gang er en migrering af data der blev
 *  skrevet forkert i mellemtiden. `etaper` er `.write: false` netop derfor.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * DE FEM TJEK KALDES HER FOR FØRSTE GANG. De har været bygget og testet uden
 * at nogen kaldte dem:
 *
 *   kanDisponeres()      en trailer kan ikke køre alene
 *   kraevedeKompetencer() + tjekKompetencer()   en udløbet kompetence blokerer
 *   kanBaere()           m³ og kg hver for sig
 *   tjekLedigMod()       reservationskonflikt på tværs af de tre kilder
 *   tjekKoerehviletid()  4,5 t før pause, 9 t i døgnet
 *
 * ⚠ MEN DE BLOKERER IKKE HER. De vises. Håndhævelsen hører i den Cloud
 * Function der skriver etapen — ligger den i skærmen, kan en direkte skrivning
 * gå uden om den, og så er tjekkene dekoration. At de nu kaldes, betyder at
 * man kan SE hvad de siger, ikke at de er håndhævet.
 *
 * ⚠ KONFLIKTTALLET ER IKKE kpi.disponering.konflikter. KPI-tallet dækker hele
 * platformen; panelet nederst regner på det VISTE VINDUE. To tal der begge
 * hedder "konflikter" ville være beslutning 6 brudt, så panelet skriver
 * eksplicit hvilket udsnit det er.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { num, pct, dato, klokke, datoTid } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand,
  Gitter, MiniLinje,
} from "../../fleet/ui.jsx";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import { ENHED, ledigeVinduer } from "../../fleet/gitter.js";
import { tjekLedigMod, konfliktTekst } from "../../fleet/reservations.js";
import {
  kanDisponeres, kanBaere, kraevedeKompetencer, KOMPETENCE_LABEL, KOERETOEJ_STATUS,
} from "../../fleet/flaade.js";
import { tjekKompetencer } from "../../fleet/personale.js";
import { tjekKoerehviletid, koerehviletidTekst } from "../../fleet/koerehviletid.js";
import { reservationFraOpgave } from "../../fleet/opgaver.js";
import { reservationerFraEtape, graenseLabel, krydserGraense, tjekGeografi } from "../../fleet/etaper.js";
import { reservationFraFravaer } from "../../fleet/fravaer.js";
import { TILSTAND } from "../../fleet/booking-state.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "../../fleet/demo-personale.js";
import { DEMO_BESOEG, BESOEG_STATUS, OMKOSTNINGSTYPE } from "../../fleet/demo-vaerksted.js";
import { DEMO_ETAPER, demoAabneEtaper } from "../../fleet/demo-etaper.js";
import { DEMO_FRAVAER } from "../../fleet/demo-fravaer.js";

/* Leverandørnavnet slås op — posterne bærer et leverandoerId, ikke en
   fritekststreng. Fem filer havde hver sin stavemåde at drive med. */
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
const lvNavn = (id) => leverandoerNavn(DEMO_LEVERANDOERER, id);

const DAG = 86400000;
const T = 3600000;

/* Dagsvisningen er 06–18. Et værksted åbner ikke kl. 00, og 24 kolonner hvoraf
   halvdelen altid er tomme gør de timer der betyder noget smallere. */
const DAG_FRA_TIME = 6;
const DAG_TIL_TIME = 18;

/* ---- Reservationer på tværs af de tre kilder -------------------------- */

/**
 * Beslutning 4 i praksis: ÉN node, tre kilder. Her bygges listen af de tre
 * demo-datasæt, så konflikttjekket kan se dem alle sammen.
 *
 * Uden det ville hver kilde have sin egen kalender, og en etape kunne lægges
 * oven på et værkstedsbesøg uden at nogen opdagede det — det er præcis den
 * fejl beslutning 4 lukkede.
 */
function byggReservationer() {
  const ud = [];
  for (const b of DEMO_BESOEG) {
    try { ud.push({ id: `r-${b.id}`, ...reservationFraOpgave(b) }); } catch { /* ufuldstændig demo-post */ }
  }
  for (const f of DEMO_FRAVAER) {
    try { ud.push({ id: `r-${f.id}`, ...reservationFraFravaer(f) }); } catch { /* ditto */ }
  }
  for (const e of DEMO_ETAPER) {
    try {
      for (const [i, r] of reservationerFraEtape(e).entries()) {
        ud.push({ id: `r-${e.id}-${i}`, ...r });
      }
    } catch { /* ditto */ }
  }
  return ud;
}

const forRessource = (alle, type, id) =>
  alle.filter((r) => r.ressourceType === type && r.ressourceId === id);

/* ---- De fem tjek ------------------------------------------------------ */

/**
 * Kører alle fem for én planlagt post. Ren funktion — den kan flyttes ind i
 * den Cloud Function der skal håndhæve dem, uden at røre skærmen.
 */
function tjekAlt({ post, enheder, person, kompetencer, reservationer, straekninger, gods, advarendeKrav = [] }) {
  const ud = [];

  /* 1. Enhedskombination */
  const kombi = kanDisponeres(enheder);
  if (!kombi.ok) ud.push({ tjek: "Enhedskombination", tone: "bad", tekst: kombi.aarsag });

  /* 2. Kompetencer. Kravet kommer fra enhederne PLUS godset — ADR hænger på
        lasten og kan ikke udledes af bilen. */
  /* BESLUTNING 25: alt kraevedeKompetencer() udleder af enheden og godset,
     BLOKERER. Krav der kommer et andet sted fra — virksomhedens egne, en
     kundes — advarer med en begrundet override og sendes ind som `advarende`. */
  const krav = kraevedeKompetencer(enheder, gods);
  if (person && (krav.length || advarendeKrav?.length)) {
    const komp = tjekKompetencer(kompetencer, {
      blokerende: krav, advarende: advarendeKrav || [],
    });

    /* Mangler og udløbne holdes adskilt: "har aldrig haft C/E" og "hans C/E
       udløb i går" kræver hver sin handling. */
    for (const m of komp.blokerende.mangler) {
      ud.push({
        tjek: "Kompetence", tone: "bad",
        tekst: `${person.navn} har aldrig haft ${KOMPETENCE_LABEL[m] || m}.`,
      });
    }
    for (const u of komp.blokerende.udloebne) {
      ud.push({
        tjek: "Kompetence", tone: "bad",
        tekst: `${person.navn}s ${KOMPETENCE_LABEL[u] || u} er udløbet. Den BLOKERER — kravet kommer fra bilen eller godset.`,
      });
    }

    /* ADVARSLER er ikke spærringer. Læses de som blokeringer, holder
       disponenten op med at læse dem. */
    for (const m of [...komp.advarende.mangler, ...komp.advarende.udloebne]) {
      ud.push({
        tjek: "Kompetence", tone: "warn",
        tekst: `${person.navn} mangler ${KOMPETENCE_LABEL[m] || m}. Advarsel — kan overrules med en begrundelse, der logges.`,
      });
    }
  }

  /* 3. Kapacitet — m³ og kg hver for sig. */
  if (gods && (gods.m3 || gods.kg)) {
    const baere = kanBaere(enheder, gods);
    if (!baere.ok) {
      const dele = [];
      if (baere.mangler.m3) dele.push(`${num(baere.mangler.m3)} m³`);
      if (baere.mangler.kg) dele.push(`${num(baere.mangler.kg)} kg`);
      ud.push({ tjek: "Kapacitet", tone: "bad", tekst: `Mangler ${dele.join(" og ")}.` });
    }
  }

  /* 4. Reservationskonflikt. tjekLedigMod() er den rene udgave — tjekLedig()
        kræver en database, og i demo-mode er der ingen. */
  for (const r of post.reservationer || []) {
    const mod = forRessource(reservationer, r.ressourceType, r.ressourceId)
      .filter((x) => x.id !== r.id);
    const svar = tjekLedigMod(mod, r);
    for (const k of svar.konflikter) {
      ud.push({
        tjek: "Reservation", tone: svar.kanOverskrive ? "warn" : "bad",
        tekst: `${konfliktTekst(r, k)} ${svar.kanOverskrive
          ? "Den nye kilde har højere prioritet og ville overskrive."
          : "Den eksisterende kilde har højere eller samme prioritet."}`,
      });
    }
  }

  /* 5. Køre-hviletid. Forbeholdet følger med — også når svaret er grønt. */
  if (straekninger?.length) {
    const kh = tjekKoerehviletid(straekninger);
    for (const o of kh.overtraedelser) {
      ud.push({ tjek: "Køre-hviletid", tone: "bad", tekst: o.tekst });
    }
  }

  return ud;
}

/* ---- Skærmen ---------------------------------------------------------- */

export default function Disponering() {
  const { kpi: k, henter, fejl, tilstand, genindlaes } = useKpi();
  const [fane, setFane] = useState("dag");
  const [valgtId, setValgtId] = useState(null);

  const iDag = new Date(); iDag.setHours(0, 0, 0, 0);
  const D0 = iDag.getTime();

  const dagFra = D0 + DAG_FRA_TIME * T;
  const dagTil = D0 + DAG_TIL_TIME * T;
  const ugeFra = D0;
  const ugeTil = D0 + 7 * DAG;

  const reservationer = useMemo(byggReservationer, []);
  const personEfterId = new Map(DEMO_PERSONALE.map((p) => [p.id, p]));
  const bilEfterId = new Map(DEMO_KOERETOEJER.map((b) => [b.id, b]));

  /* --- Dagsvisning: opgaver med art vaerksted --- */
  const dagensOpgaver = DEMO_BESOEG.filter((b) => b.fra < dagTil && dagFra < b.til);
  const dagRaekker = useMemo(() => {
    const ider = new Set(dagensOpgaver.map((o) => o.koeretoejId));
    return DEMO_KOERETOEJER.filter((b) => ider.has(b.id)).map((b) => ({
      id: b.id, label: b.kaldenavn, under: b.navn,
      pille: <Pille tone={KOERETOEJ_STATUS[b.status]?.pill}>{KOERETOEJ_STATUS[b.status]?.label}</Pille>,
    }));
  }, [dagFra, dagTil]);

  const dagBlokke = dagensOpgaver.map((o) => ({
    id: o.id, raekkeId: o.koeretoejId, fra: o.fra, til: o.til,
    label: `${OMKOSTNINGSTYPE[o.type]} · ${lvNavn(o.leverandoerId)}`,
    titel: o.beskrivelse, tone: BESOEG_STATUS[o.status]?.tone,
  }));

  /* Drop-felterne beregnes af SAMME data som blokkene — se ledigeVinduer(). */
  const dagDropfelter = useMemo(() => {
    const felter = [];
    for (const r of dagRaekker) {
      const mine = dagBlokke.filter((b) => b.raekkeId === r.id);
      for (const [i, v] of ledigeVinduer(mine, dagFra, dagTil).entries()) {
        /* Under en time er der ikke plads til en værkstedsopgave. */
        if (v.til - v.fra < T) continue;
        felter.push({ id: `drop-${r.id}-${i}`, raekkeId: r.id, fra: v.fra, til: v.til });
      }
    }
    return felter;
  }, [dagFra, dagTil, dagRaekker.length]);

  /* --- Ugesvisning: etaper --- */
  const ugensEtaper = DEMO_ETAPER.filter(
    (e) => e.koeretoejId && e.fra < ugeTil && ugeFra < e.til
  );
  const ugeRaekker = useMemo(() => {
    const ider = new Set(ugensEtaper.map((e) => e.koeretoejId));
    return DEMO_KOERETOEJER.filter((b) => ider.has(b.id)).map((b) => ({
      id: b.id, label: b.kaldenavn, under: b.navn,
    }));
  }, [ugeFra, ugeTil]);

  const ugeBlokke = ugensEtaper.map((e) => ({
    id: e.id, raekkeId: e.koeretoejId, fra: e.fra, til: e.til,
    label: `${e.fraSted} → ${e.tilSted}`,
    titel: `${e.fraSted} → ${e.tilSted} · ETA ${e.etaMs ? datoTid(e.etaMs) : "ukendt"}` +
           (krydserGraense(e) ? ` · ${e.graenseovergange.map(graenseLabel).join(", ")}` : " · kun Danmark"),
    tone: e.tilstand === "reserveret" ? "ok" : e.tilstand === "afventerKoord" ? "warn" : "info",
  }));

  if (henter) return <Henter hvad="disponering" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  /* --- Tjekkene, kørt på det viste vindue --- */
  const fund = [];
  for (const e of ugensEtaper) {
    const bil = bilEfterId.get(e.koeretoejId);
    const person = personEfterId.get(e.personId);
    const kompetencer = DEMO_KOMPETENCER.filter((c) => c.personId === e.personId);
    /* Chaufførens strækninger i vinduet — køre-hviletid gælder personen, ikke
       turen, så alle hans ture skal med. */
    const straekninger = DEMO_ETAPER
      .filter((x) => x.personId === e.personId)
      .map((x) => ({ id: x.id, fra: x.fra, til: x.til }));

    const resv = reservationerFraEtape(e).map((r, i) => ({ id: `r-${e.id}-${i}`, ...r }));
    for (const f of tjekAlt({
      post: { reservationer: resv },
      enheder: [bil].filter(Boolean),
      person, kompetencer, reservationer, straekninger, gods: e.maengde,
    })) {
      fund.push({ ...f, id: `${e.id}-${fund.length}`, hvor: `${e.id} · ${e.fraSted} → ${e.tilSted}` });
    }

    const geo = tjekGeografi(e);
    if (!geo.ok) fund.push({ id: `${e.id}-geo`, tjek: "Geografi", tone: "bad", tekst: geo.aarsag, hvor: e.id });
  }

  const valgt = ugensEtaper.find((e) => e.id === valgtId)
    || dagensOpgaver.find((o) => o.id === valgtId) || null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Planlagte opgaver" vaerdi={num(k.disponering.planlagteOpgaver)} />
        <KpiKort label="Uplanlagte" vaerdi={num(k.opgaver.uplanlagte)} />
        <KpiKort label="Ledig kapacitet" vaerdi={pct(k.disponering.ledigKapacitetPct)} />
        <KpiKort label="Konflikter" vaerdi={num(k.disponering.konflikter)} note="hele platformen" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Disponering">
        <div className="fc-faner" role="tablist" aria-label="Visning">
          <button type="button" role="tab" className="fc-fane" aria-selected={fane === "dag"}
                  onClick={() => setFane("dag")}>
            Dag — værksted
          </button>
          <button type="button" role="tab" className="fc-fane" aria-selected={fane === "uge"}
                  onClick={() => setFane("uge")}>
            Uge — langtur
          </button>
        </div>

        {fane === "dag" ? (
          <>
            <p className="fc-hint" style={{ marginBottom: 12 }}>
              <b>{dato(D0)}</b>, kl. {DAG_FRA_TIME}–{DAG_TIL_TIME}. Dagsvisningen læser{" "}
              <b>opgaver</b> med art <b>vaerksted</b> — varighed i timer. Ugesvisningen
              læser en anden node.
            </p>
            <Gitterkalender
              raekker={dagRaekker} blokke={dagBlokke}
              fra={dagFra} til={dagTil} enhed={ENHED.time}
              valgtId={valgtId} onVaelg={(b) => setValgtId(b.id === valgtId ? null : b.id)}
              dropfelter={{
                felter: dagDropfelter,
                tekst: "Træk opgave hertil",
                titel: "Ikke bygget endnu. Disponering skrives af en Cloud Function der " +
                       "reserverer atomisk — to disponenter kan ramme samme sekund.",
              }}
              tom="Ingen værkstedsopgaver i dag."
            />
          </>
        ) : (
          <>
            <p className="fc-hint" style={{ marginBottom: 12 }}>
              <b>{dato(ugeFra)} – {dato(ugeTil - 1)}</b>. Ugesvisningen læser <b>etaper</b> —
              ETA over døgngrænser og grænseovergange. Det man disponerer er en{" "}
              <b>etape</b>, ikke en booking.
            </p>
            <Gitterkalender
              raekker={ugeRaekker} blokke={ugeBlokke}
              fra={ugeFra} til={ugeTil} enhed={ENHED.dag}
              valgtId={valgtId} onVaelg={(b) => setValgtId(b.id === valgtId ? null : b.id)}
              tom="Ingen etaper i perioden."
            />
          </>
        )}

        <p className="fc-hint" style={{ marginTop: 12 }}>
          ⚠ <b>Fase 0 er en visning.</b> Der er ingen drag-and-drop og ingen skrivning.
          Feltet <b>Træk opgave hertil</b> er en attrap: rigtig disponering skriver
          etapens køretøj og dens reservation i <b>én transaktion</b> fra en Cloud
          Function, og <code>etaper</code> er <b>.write: false</b> indtil den findes.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Konflikter fund={fund} kpiTal={k.disponering.konflikter} />
        <div className="fc-grid">
          <Uplanlagte />
          <Detalje post={valgt} personEfterId={personEfterId} />
        </div>
      </Gitter>
    </div>
  );
}

/* ---- Konflikter og advarsler ------------------------------------------ */

function Konflikter({ fund, kpiTal }) {
  return (
    <Kort titel={`Konflikter og advarsler i det viste vindue (${fund.length})`}>
      {/* Beslutning 6: to tal der begge hedder "konflikter" må ikke kunne
          forveksles. KPI-kortet øverst er hele platformen; det her er vinduet. */}
      <p className="fc-hint" style={{ marginBottom: 12 }}>
        Det her er <b>et andet udsnit</b> end KpiKortet øverst.{" "}
        <b>{num(kpiTal)}</b> er platformens samlede tal fra <code>kpi/</code>;{" "}
        <b>{num(fund.length)}</b> er hvad de fem tjek finder i den viste periode.
        De skal ikke gå op mod hinanden.
      </p>

      <Tabel
        kolonner={[
          { key: "tjek", label: "Tjek", render: (r) => (
              <Pille tone={r.tone}>{r.tjek}</Pille>) },
          { key: "hvor", label: "Hvor" },
          { key: "tekst", label: "Hvad" },
        ]}
        raekker={fund}
        tom="Ingen af de fem tjek finder noget i perioden."
      />

      <p className="fc-hint" style={{ marginTop: 12 }}>
        Det er <b>første gang de fem tjek faktisk kaldes</b>. De har været bygget og
        testet uden at nogen kaldte dem. Men de <b>blokerer ikke her</b> — de vises.
        Håndhævelsen hører i den Cloud Function der skriver etapen; ligger den i
        skærmen, kan en direkte skrivning gå uden om den.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        {koerehviletidTekst(tjekKoerehviletid([]))}
      </p>
    </Kort>
  );
}

/* ---- Uplanlagt: åbne etaper ------------------------------------------- */

function Uplanlagte() {
  const aabne = demoAabneEtaper();
  return (
    <Kort titel={`Uplanlagt (${aabne.length})`}>
      <Tabel
        kolonner={[
          { key: "rute", label: "Rute", render: (r) => <b>{r.fraSted} → {r.tilSted}</b> },
          { key: "senestMs", label: "Frist", render: (r) => (r.senestMs
              ? dato(r.senestMs)
              : <span className="fc-bad">mangler</span>) },
          { key: "maengde", label: "Gods", num: true,
            render: (r) => `${num(r.maengde?.m3)} m³` },
        ]}
        raekker={aabne}
        tom="Ingen åbne etaper."
      />
      <p className="fc-hint" style={{ marginTop: 10 }}>
        <b>aaben</b> er en tilstand, ikke fravær af planlægning — den kan forespørges
        og bærer en <b>frist</b>. Uden frist fyldes lageret med gods ingen henter.
        Et match bliver et <b>forslag</b>, aldrig en reservation: koordinatoren
        godkender stadig.
      </p>
    </Kort>
  );
}

/* ---- Detaljepanel ------------------------------------------------------ */

function Detalje({ post, personEfterId }) {
  if (!post) {
    return (
      <Kort titel="Detaljer">
        <Tom>Vælg en blok i gitteret.</Tom>
      </Kort>
    );
  }

  /* En etape har fraSted; en værkstedsopgave har et værksted. */
  const erEtape = Boolean(post.fraSted);
  if (!erEtape) {
    return (
      <Kort titel={post.beskrivelse}>
        <MiniLinje label="Type" vaerdi={OMKOSTNINGSTYPE[post.type]} />
        <MiniLinje label="Værksted" vaerdi={lvNavn(post.leverandoerId)} />
        <MiniLinje label="Fra" vaerdi={klokke(post.fra)} />
        <MiniLinje label="Til" vaerdi={`${klokke(post.til)} (eksklusiv)`} />
        <MiniLinje label="Art" vaerdi={<code>{post.art}</code>} />
        <MiniLinje label="Division" vaerdi={post.division} />
      </Kort>
    );
  }

  const person = personEfterId.get(post.personId);
  return (
    <Kort
      titel={`${post.fraSted} → ${post.tilSted}`}
      handling={<Pille tone={TILSTAND[post.tilstand]?.pill}>{TILSTAND[post.tilstand]?.label}</Pille>}
    >
      <MiniLinje label="Booking" vaerdi={<code>{post.bookingId}</code>} />
      <MiniLinje label="Etape" vaerdi={`nr. ${post.nr}`} />
      <MiniLinje label="Afgang" vaerdi={datoTid(post.fra)} />
      <MiniLinje label="ETA" vaerdi={post.etaMs ? datoTid(post.etaMs) : "—"} />
      <MiniLinje label="Chauffør" vaerdi={person?.navn || "—"} />
      <MiniLinje label="Gods" vaerdi={`${num(post.maengde?.m3)} m³ · ${num(post.maengde?.kg)} kg`} />
      <MiniLinje
        label="Grænseovergange"
        vaerdi={krydserGraense(post)
          ? post.graenseovergange.map(graenseLabel).join(", ")
          : <Pille tone="info">Kun kørsel i Danmark</Pille>}
      />
      <MiniLinje
        label="Passager"
        vaerdi={Object.keys(post.passager || {}).length
          ? Object.entries(post.passager).map(([p, n]) => `${p} ×${n}`).join(", ")
          : "—"}
      />
      <p className="fc-hint" style={{ marginTop: 12 }}>
        Passagerne er prismotorens input — <b>beregnForloeb()</b> regner på dem.
        De skal være geografisk mulige: Storebælt og Femern udelukker hinanden,
        for man kører den ene vej eller den anden.{" "}
        <Link className="fc-a" to="/booking/opsaetning">Se satserne</Link>.
      </p>
    </Kort>
  );
}
