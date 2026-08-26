/* src/moduler/booking/Forslag.jsx
 * Booking – forslag & reservation
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  DEN HER SKÆRM ER BESLUTNING 5 GJORT SYNLIG.
 *
 *  Disponenten laver forslagene. Disponenten må IKKE godkende dem. Det står
 *  ikke som en kommentar nogen steder — det står som et felt der MANGLER i
 *  en liste: `disponent`-presettet i permissions.js har ikke
 *  PERM.bookingGodkend.
 *
 *  Adgangsmodellen ses ved at prøve knappen i `Skrivningen` som to
 *  forskellige roller: knapperne er ikke hardkodede, de er genereret af
 *  tilstandsmaskinen filtreret på dine permissions.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⚠ V1-STABILISERING HF1 — DEN GAMLE `Godkendelse`-DEBUGRUDE ER FJERNET.
 * Der stod her et separat kort ("Godkendelse — rolle: X") der dumpede
 * `kanSkifteEtape()`s raa svar, permissionstrengen `booking.godkend` og en
 * saetning der bad brugeren skifte rolle i sidebaren — synligt for enhver
 * rolle, ikke bag et dev-flag. De to slags nej det forklarede, forklares nu
 * i stedet af den RIGTIGE knap i `Skrivningen`, via dens egen `title` —
 * samme moenster som resten af appen bruger til en deaktiveret knap.
 *
 * ⚠ FORSLAGET HØRER PÅ ETAPEN — BESLUTNING 40.
 *
 * Skærmen læste før bookingens `forslag`. De lå begge steder: på bookingen med
 * tid, pris og transittid, på etapen med enheder og chauffør — for et forløb
 * med én etape det samme løfte skrevet to steder. Det man disponerer, er en
 * etape (beslutning 16), så forslaget ligger dér med alle sine felter, og
 * godkendelsen sker på etapen.
 *
 * Følgen er synlig her: **et forløb med flere etaper godkendes etape for
 * etape.** Det er ikke en omvej — det er hele grunden til at `delvist`
 * findes. Vælgeren øverst er derfor etapevælgeren, ikke pynt.
 *
 * ⚠ DER ER TO SLAGS NEJ, OG DE SKAL VISES HVER FOR SIG.
 *
 *   1. "Du mangler adgangen booking.godkend…"   — en permissionfejl
 *   2. "Vælg et forslag før godkendelse."       — en FORUDSÆTNING
 *
 * Vises kun den første, læses enhver manglende handling som et
 * rettighedsproblem — og så beder en koordinator om adgang hun allerede har,
 * i stedet for at vælge et forslag. `kanSkifteEtape()` svarer på begge, og
 * den rigtige knaps `title` viser det svar den får.
 *
 * ⚠ OG DE FEM DISPONERINGSTJEK VISES FOR DET VALGTE FORSLAG — før man
 * trykker. Serveren kører dem igen og afviser med SAMME sætning; det er den
 * samme `tjekDisponering()`. Men at se dem først er forskellen på at vælge
 * rigtigt og at få en fejl. `fs-c` i demo-sættet rammer med vilje en
 * reservationskonflikt, så man kan se at tjekkene virker frem for at tro det.
 *
 * ⚠ SKÆRMEN AFGØR INGENTING. `etaper` og `reservationer` er `.write: false`
 * for alle; knappen kalder `etapeskift`, som kører tjekkene igen og skriver
 * etapen, reservationerne og bookingens afledte tilstand i ÉN opdatering.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ⚠ SKIVE 3A — `ForslagOgReservation` ER DEN KANONISKE OPLEVELSE, IKKE KUN
 * DENNE RUTE.
 *
 * Godkendelsen hørte før KUN her, nået via et link fra Disponering, der
 * forlod skærmen. Nu åbner Disponering den SAMME komponent i et panel — se
 * `Disponering.jsx`s `<Dialog>` omkring `<ForslagOgReservation>`. Der er
 * bevidst ingen anden udgave: `Forslag` (default-eksporten, ruten
 * `/booking/forslag/:id`) er et tyndt hylster om `bookingId` fra URL'en, og
 * er ALT hvad ruten gør. Al logik — de fem tjek, tilstandsmaskinen,
 * skiftEtape() — bor i `ForslagOgReservation`, importeret af begge steder,
 * så et deep link og et klik fra Disponering aldrig kan vise to forskellige
 * svar på "kan det her forslag godkendes". Se beslutning 40 og 58 — samme
 * disciplin, ét niveau højere.
 * ═══════════════════════════════════════════════════════════════════════
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { enhedsIder, reservationerFraEtape, straekningFraEtape } from "../../fleet/etaper.js";
import { kr, num, dato, datoTid } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, Knap, Gitter, MiniLinje, Formularsvar,
} from "../../fleet/ui.jsx";
import {
  TILSTAND, kanSkifteEtape, tilgaengeligeEtapeHandlinger,
  TRANSPORTTYPE, forslagListe, aktiveForslag, erTrukket,
} from "../../fleet/booking-state.js";
import { tjekDisponering, TONE } from "../../fleet/disponering.js";
import { skiftEtape } from "../../fleet/disponer.js";
import {
  DEMO_BOOKINGER,
} from "../../fleet/demo-bookinger.js";

/* ⚠ OPSLAGENE LÅ PÅ MODULNIVEAU MED DEMO-SÆTTET LUKKET INDE I SIG — og det
   er ikke bare et navn: `bil(id)` fodrer `enheder`, som går direkte ind i
   `tjekDisponering()`. Kanden der skulle prøves, var altså demoens bil og
   ikke kundens. Fjerde gang mønstret dukker op efter zonePar(),
   medPrisliste() og Kompetencers personNavn(). */
const find = (liste, id) => liste.find((x) => x.id === id) || null;

/** Enhederne på et forslag, som navne. En sættevogn er to. */
const enhedsnavne = (biler, f) =>
  enhedsIder(f).map((id) => find(biler, id)?.kaldenavn || id).join(" + ") || "—";

export function ForslagOgReservation({ bookingId }) {
  const { bruger } = useFleet();

  /* ⚠ FEM NODER, OG DE ER IKKE PYNT. Skærmen er dér koordinatoren GODKENDER
     et forslag, og `Tjekkene` kører de samme fem tjek som `etapeskift`
     håndhæver. Kørte de på demo-sættet mens serveren læste noden, ville
     skærmen sige ja hvor serveren siger nej — og brugeren har fået at vide at
     det var i orden.

     ⚠ RESERVATIONERNE ER DEN VIGTIGSTE. De blev bygget af DEMO_ETAPER alene,
     altså UDEN fravær og uden værksted. En sygemeldt chauffør så ledig ud
     her, mens noden nu bærer fraværet. */
  const etaperListe = useListe("etaper", {
    ordnPaa: "fra", vindue: "alle", graense: 500,
  });
  const resvListe = useListe("reservationer", {
    vindue: "alle", graense: 50,
  });
  const bilListe = useListe("koeretoejer", {
    ordnPaa: "status", vindue: "alle", graense: 500,
  });
  const persListe = useListe("personale", {
    ordnPaa: "status", vindue: "alle", graense: 500,
  });
  const kompListe = useListe("kompetencer", {
    vindue: "alle", graense: 2000,
  });

  /* ⚠ reservationer ER ET TRAE, ikke en liste: type → ressource →
     reservation. useListe giver raekker der ER typerne; traeet samles her,
     paa NODENS form — den samme tjekDisponering() slaar op i. */
  const reservationsnode = Object.fromEntries(
    resvListe.data.map(({ id, ...prRessource }) => [id, prRessource]));

  const kundeListe = useListe("kunder", { vindue: "alle", graense: 500 });
  /* ⚠ BOOKINGEN KOM FRA DEMOFILEN — MENS ETAPERNE KOM FRA NODEN.
     Skærmen hentede allerede `etaper`, `reservationer`, `koeretoejer`,
     `personale` og `kompetencer` fra basen, men slog BOOKINGEN op i
     `demoBooking()` og dens etaper i `demoEtaperPaa()`. Så blev
     reservationstjekket regnet af nodens etaper, mens forløbet på skærmen var
     et helt andet — to svar på ét spørgsmål, i den samme visning.
     En booking oprettet med `bookingopret` (beslutning 55) kunne slet ikke
     åbnes her. */
  const bookingListe = useListe("bookinger", {
    vindue: "alle", graense: 500, demo: DEMO_BOOKINGER,
  });

  /* Etaperne pr. booking — af NODENS liste, den samme skærmen regner
     reservationer af. */
  const etaperPaa = (bookingId) => etaperListe.data
    .filter((e) => e.bookingId === bookingId)
    .sort((a, b) => (a.nr || 0) - (b.nr || 0));

  /* Uden et id i ruten falder vi tilbage på det forløb der faktisk afventer
     koordinator — ellers ville skærmen være tom for den der klikker rundt. */
  const booking = bookingListe.data.find((b) => b.id === bookingId)
    || bookingListe.data.find((b) =>
      etaperPaa(b.id).some((e) => e.tilstand === "afventerKoord" && aktiveForslag(e).length))
    || null;

  const etaper = booking ? etaperPaa(booking.id) : [];
  /* Den etape der har noget at tage stilling til, kommer først. */
  /* ⚠ `forslag` ER ET OBJEKT I NODEN, ikke en array — nøglet på forslagets
     eget id, fordi RTDB ingen arrays har og `valgtForslagId` skal pege på en
     nøgle der findes. `forslagListe()` er det ene sted formen oversættes, og
     den sorterer på `nr`, så to skærme ikke viser dem i hver sin rækkefølge.
     Se beslutning 58. */
  const foerste = etaper.find((e) => aktiveForslag(e).length) || etaper[0] || null;

  const [etapeId, setEtapeId] = useState(foerste?.id || null);
  const [valgtForslagId, setValgtForslagId] = useState(null);
  const [begrundelse, setBegrundelse] = useState("");
  const [arbejder, setArbejder] = useState(false);
  const [svar, setSvar] = useState(null);

  if (!booking) {
    return (
      <div className="fc-grid" style={{ gap: 16 }}>
        <Kort titel="Booking – forslag & reservation">
          <Tom>
            Ingen booking valgt.{" "}
            <Link className="fc-a" to="/booking">Gå til bookingoversigten</Link>.
          </Tom>
        </Kort>
      </div>
    );
  }

  const etape = etaper.find((e) => e.id === etapeId) || foerste;
  const perms = bruger?.perms;
  /* ⚠ KUNDEN KOMMER OGSAA FRA NODEN. Navnet paa forloebet er det
     foerste koordinatoren laeser, og et demo-navn dér er en anden kunde. */
  const k = find(kundeListe.data, booking.kundeId);

  const muligheder = etape ? tilgaengeligeEtapeHandlinger(etape.tilstand, perms) : [];

  /* ⚠ ET TRUKKET FORSLAG KAN IKKE VÆLGES — beslutning 59. Det bliver
     liggende, fordi koordinatoren måske HAR set det, men det er ikke længere
     et bud: `etapeskift` afviser en godkendelse af det, og en radioknap der
     førte til et nej, ville være en attrap. */
  const forslag = aktiveForslag(etape);
  const trukne = forslagListe(etape).filter(erTrukket);
  const valgtForslag = forslag.find((f) => f.id === valgtForslagId) || null;

  /* ══════════════════════════════════════════════════════════════════════
     ⚠ TJEKKENE AFGØR OGSÅ OM KNAPPEN ER AKTIV.

     `kanSkifteEtape()` svarer kun på tilstandsmaskinen: må DU gå fra
     afventerKoord til reserveret, og er der valgt et forslag. Den ved intet
     om at chaufføren allerede kører den dag. Serveren afviser — men en knap
     der er blå og så fejler, er en knap der lyver.

     ⚠ OG DET ER IKKE EN ANDEN SANDHED. Det er den SAMME `tjekDisponering()`
     serveren kalder; skærmen viser bare svaret først. Håndhævelsen ligger
     stadig i `etapeskift` — et direkte kald går ikke uden om noget.
     ══════════════════════════════════════════════════════════════════════ */
  const tjekraekker = etape && valgtForslag
    ? tjekrakkerFor({
      etape, forslag: valgtForslag,
      biler: bilListe.data, personale: persListe.data,
      kompetencer: kompListe.data, alleEtaper: etaperListe.data,
      reservationsnode: reservationsnode,
    })
    : [];
  const spaerret = tjekraekker.some((x) => x.tone === TONE.bad);

  const send = async (tilTilstand) => {
    setArbejder(true);
    const r = await skiftEtape({
      etapeId: etape.id, tilTilstand, valgtForslagId, begrundelse,
    });
    setArbejder(false);
    setSvar(r);
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort
        titel={`${booking.nummer} · ${booking.fraSted} → ${booking.tilSted}`}
        handling={<Pille tone={TILSTAND[booking.tilstand]?.pill}>
          {TILSTAND[booking.tilstand]?.label}
        </Pille>}
      >
        <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
          <div>
            <MiniLinje label="Kunde" vaerdi={k?.navn || booking.kundeId} />
            <MiniLinje label="Transporttype" vaerdi={TRANSPORTTYPE[booking.transporttype]} />
            <MiniLinje label="Ønsket afhentning" vaerdi={datoTid(booking.onsketAfhentningMs)} />
            <MiniLinje label="Ønsket levering" vaerdi={datoTid(booking.onsketLeveringMs)} />
          </div>
          <div>
            <MiniLinje label="Omsætning" vaerdi={kr(booking.omsaetningOere)} />
            <MiniLinje label="Krav" vaerdi={booking.krav?.length ? booking.krav.join(", ") : "—"} />
            <MiniLinje label="Kundekrav" vaerdi={booking.kundekrav || "—"} />
            {/* ⚠ `oprettetAf` ER ET uid, ikke et navn — se demo-bookinger.js.
                At slå navnet op kræver `brugere`-noden, som skærmen ikke
                henter; et råt uid er sandt, et gættet navn ville ikke være. */}
            <MiniLinje label="Oprettet af"
                       vaerdi={<><code>{booking.oprettetAf}</code> · {dato(booking.oprettetMs)}</>} />
          </div>
        </Gitter>

        {/* ⚠ BOOKINGENS TILSTAND ER AFLEDT. Pillen øverst er ikke noget nogen
            skifter — den regnes af forloebstilstand() ud af etaperne, og den
            skrives af etapeskift i samme opdatering som etapeskiftet. */}
        <p className="fc-hint" style={{ marginTop: 12 }}>
          ⚠ <b>Forløbets tilstand er afledt af dets etaper.</b> Den godkendes ikke
          her — det gør <b>etapen</b>. Et forløb med flere etaper godkendes én ad
          gangen, og det er præcis derfor <code>delvist</code> findes.
        </p>
      </Kort>

      {/* ---- Etapevælgeren ------------------------------------------------ */}
      {etaper.length > 1 && (
        <Kort titel={`Forløbets etaper (${etaper.length})`}
              under="Det man disponerer, er en etape. Vælg den du vil tage stilling til.">
          <div className="fc-formular-knapper" style={{ marginTop: 0 }}>
            {etaper.map((e) => (
              <Knap key={e.id}
                    variant={e.id === etape?.id ? "primaer" : undefined}
                    onClick={() => { setEtapeId(e.id); setValgtForslagId(null); setSvar(null); }}>
                {`nr. ${e.nr ?? "?"} · ${e.fraSted} → ${e.tilSted}`}
                {" · "}
                {TILSTAND[e.tilstand]?.label}
              </Knap>
            ))}
          </div>
        </Kort>
      )}

      {!etape ? (
        <Kort titel="Forslag">
          <Tom>
            Forløbet har ingen etaper endnu. Det man disponerer, er en etape
            (beslutning 16) — så der er intet at tage stilling til her.
          </Tom>
        </Kort>
      ) : (
        <Forslagstabel
          etape={etape}
          forslag={forslag}
          trukne={trukne}
          valgtForslagId={valgtForslagId}
          setValgtForslagId={(v) => { setValgtForslagId(v); setSvar(null); }}
          biler={bilListe.data}
          personale={persListe.data}
        />
      )}

      {etape && valgtForslag && (
        <Tjekkene raekker={tjekraekker} forslag={valgtForslag} />
      )}

      {etape && (
        <Skrivningen
          etape={etape} bruger={bruger}
          begrundelse={begrundelse} setBegrundelse={setBegrundelse}
          muligheder={muligheder} valgtForslagId={valgtForslagId}
          send={send} arbejder={arbejder} serversvar={svar}
          spaerret={spaerret} tjekraekker={tjekraekker}
        />
      )}
    </div>
  );
}

/**
 * Ruten. `/booking/forslag/:id` — deep link'et fra en booking-liste, en
 * kollega eller et gammelt bogmærke. Intet af det nedenfor må vokse: al
 * logik hører i `ForslagOgReservation` ovenfor.
 */
export default function Forslag() {
  const { id } = useParams();
  return <ForslagOgReservation bookingId={id} />;
}

/* ---- Forslagene på etapen ---------------------------------------------- */

function Forslagstabel({ etape, forslag, trukne = [], valgtForslagId, setValgtForslagId, biler, personale }) {
  /* ⚠ LISTERNE KOMMER IND. Kolonnerne slaar navne op, og en
     underkomponent kan ikke se den ydres variable — femte gang i denne
     omgang, og byggeriet siger det ikke: en ReferenceError ved rendering er
     ingen byggefejl. Kun et klik fanger den.
     ⚠ SJETTE GANG: `forslag` kom til her, da noden holdt op med at bære en
     array. Kommentaren ovenfor stod der allerede — og fælden gentog sig
     alligevel i den samme fil. */
  return (
    <Kort titel={`Forslag på etape nr. ${etape.nr ?? "?"} (${forslag.length})`}
          under={`${etape.fraSted} → ${etape.tilSted} · ${TILSTAND[etape.tilstand]?.label}`}>
      {forslag.length ? (
        /* ⚠ HELE RÆKKEN VÆLGER, ikke kun radioen. Et forslag er en linje med
           otte kolonner, og en 4 px knap yderst til venstre er det eneste
           sted man må ramme — det er ikke betjening, det er en prøve i
           finmotorik. `paaRaekke` giver også tastaturadgang, som en <tr> med
           en onClick ellers ikke har. Radioen bliver stående, fordi den viser
           HVAD der er valgt. */
        <Tabel
          paaRaekke={(f) => setValgtForslagId(f.id)}
          erValgt={(f) => f.id === valgtForslagId}
          kolonner={[
            { key: "vaelg", label: "", render: (f) => (
                <input type="radio" name="forslag" checked={valgtForslagId === f.id}
                       onChange={() => setValgtForslagId(f.id)}
                       aria-label={`Vælg forslag ${f.nr}`} />) },
            { key: "nr", label: "#", render: (f) => <b>{f.nr}</b> },
            /* ⚠ EN SÆTTEVOGN ER TO ENHEDER. Feltet er en liste af samme grund
               som på etapen: en trailer kan ikke køre alene, og et forslag der
               kun kunne pege på trækkeren, ville foreslå noget
               kanDisponeres() afviser. */
            { key: "koeretoejIder", label: "Enhed",
              render: (f) => enhedsnavne(biler, f) },
            { key: "personId", label: "Chauffør",
              render: (f) => find(personale, f.personId)?.navn || f.personId },
            { key: "afhentningMs", label: "Planlagt afhentning",
              render: (f) => datoTid(f.afhentningMs) },
            { key: "leveringMs", label: "Levering", render: (f) => datoTid(f.leveringMs) },
            { key: "transitTimer", label: "Transit", num: true,
              render: (f) => `${num(f.transitTimer)} t` },
            { key: "estimatOere", label: "Estimat", num: true,
              render: (f) => kr(f.estimatOere) },
            { key: "note", label: "Note" },
          ]}
          raekker={forslag}
          noegle={(f) => f.id}
        />
      ) : (
        <Tom>
          Etapen har {trukne.length ? "ingen AKTIVE forslag" : "ingen forslag"}.
          Disponenten laver dem — det er den anden halvdel af beslutning 5.
        </Tom>
      )}

      {/* ⚠ DE TRUKNE STÅR MED, MEN IKKE SOM ET VALG. De slettes ikke — et
          forslag koordinatoren HAR set, og som så forsvandt, kan ikke
          forklares et halvt år senere. Men de er ikke længere et bud, og
          `etapeskift` afviser en godkendelse af dem. Beslutning 59. */}
      {trukne.length > 0 && (
        <p className="fc-hint" style={{ marginTop: 12 }}>
          <b>{trukne.length} trukket tilbage</b> —{" "}
          {trukne.map((f) => `nr. ${f.nr}`).join(", ")}. De står ikke som et
          valg: disponenten har taget dem af bordet, og en godkendelse ville
          blive afvist. Nummeret genbruges ikke, så en samtale om
          "forslag 2" bliver ved med at pege på det samme.
        </p>
      )}
    </Kort>
  );
}

/* ---- De fem tjek, for det valgte forslag -------------------------------- */

/**
 * ⚠ VIST FØR MAN TRYKKER, IKKE SOM EN FEJL BAGEFTER.
 *
 * Serveren kører de samme tjek og afviser med samme sætning — det er den
 * samme `tjekDisponering()`. Men at se dem først er forskellen på at vælge
 * rigtigt og at få en fejl man ikke forstod var mulig.
 *
 * ⚠ OG DEN AFGØR INTET. Håndhævelsen ligger i `etapeskift`; det her er en
 * visning af hvad den vil svare.
 */
export function tjekrakkerFor({
  etape, forslag, biler = [], personale = [], kompetencer = [],
  alleEtaper = [], reservationsnode = {},
}) {
  /* Etapen som den ville se ud MED forslaget — det er den kombination der
     skal prøves, ikke den etapen bærer nu. */
  const paaEtapen = {
    ...etape,
    koeretoejIder: forslag.koeretoejIder,
    personId: forslag.personId,
  };

  /* ⚠ KILDERNE KOMMER IND. De blev læst af demo-sæt lukket inde i
     modulniveauets `bil()`, `person()` og DEMO_KOMPETENCER — og det er ikke
     kosmetik: `enheder` går direkte ind i `kanBaere()` og `kanDisponeres()`.
     Bilen der blev prøvet, var demoens og ikke kundens. */
  const enheder = enhedsIder(paaEtapen).map((id) => find(biler, id)).filter(Boolean);
  const p = find(personale, forslag.personId);
  const mine = kompetencer.filter((c) => c.personId === forslag.personId);

  /* ⚠ KØRE-HVILETID GÆLDER PERSONEN, IKKE TUREN. Alle hans etaper skal med,
     ellers kan han få sin fjerde tur i træk fordi hver enkelt så lovlig ud
     for sig. */
  const straekninger = alleEtaper
    .filter((x) => x.personId === forslag.personId && x.id !== etape.id)
    .map(straekningFraEtape)
    .concat([straekningFraEtape(paaEtapen)]);

  /* ⚠ RESERVATIONERNE KOMMER FRA NODEN — den samme serveren læser.
     Her blev de bygget af DEMO_ETAPER alene, altså UDEN fravær og uden
     værksted. En sygemeldt chauffør så ledig ud på netop den skærm hvor
     koordinatoren GODKENDER: serveren ville have afvist, og brugeren havde
     fået at vide at det var i orden.

     Etapens egne reservationer trækkes fra — den skal ikke være i konflikt
     med sig selv. `kilde.id` er etapens id; se reservationerFraEtape(). */
  const reservationer = {};
  for (const [type, prRessource] of Object.entries(reservationsnode)) {
    for (const [resId, poster] of Object.entries(prRessource || {})) {
      const andres = Object.entries(poster || {})
        .map(([id, r]) => ({ id, ...r }))
        .filter((r) => r.kilde?.id !== etape.id);
      if (!andres.length) continue;
      reservationer[type] ??= {};
      reservationer[type][resId] = andres;
    }
  }

  return tjekDisponering({
    reservationerForEtapen: reservationerFraEtape(paaEtapen),
    enheder, person: p, kompetencer: mine, reservationer, straekninger,
    gods: etape.maengde || {},
  });
}

function Tjekkene({ raekker, forslag }) {
  return (
    <Kort titel={`De fem tjek — forslag ${forslag.nr}`}
          under="Det serveren vil svare. Den kører dem igen; det her er ikke afgørelsen.">
      {raekker.length === 0 ? (
        <Tom>
          Ingen bemærkninger. Enhederne kan køre sammen, chaufføren må føre dem,
          de kan bære godset, alle er ledige, og køretiden holder.
        </Tom>
      ) : (
        <Tabel
          kolonner={[
            { key: "tjek", label: "Tjek", render: (r) => <b>{r.tjek}</b> },
            { key: "tone", label: "", render: (r) => (
                <Pille tone={r.tone === TONE.bad ? "bad" : "warn"}>
                  {r.tone === TONE.bad ? "spærrer" : "advarsel"}
                </Pille>) },
            { key: "tekst", label: "Hvad" },
          ]}
          raekker={raekker.map((r, i) => ({ ...r, id: `t-${i}` }))}
        />
      )}
      <p className="fc-hint" style={{ marginTop: 8 }}>
        ⚠ <b>En advarsel er ikke en spærring.</b> Læses de ens, holder man op med
        at læse dem. En udløbet kompetence <b>blokerer</b>; en konflikt med lavere
        prioritet gør ikke, fordi den nye kilde ville overskrive.
      </p>
    </Kort>
  );
}

/* ---- Hvad der bliver skrevet ------------------------------------------- */

function Skrivningen({
  etape, bruger, begrundelse, setBegrundelse,
  muligheder, valgtForslagId, send, arbejder, serversvar, spaerret, tjekraekker,
}) {
  return (
    <Kort titel="Handlinger">
      <div className="fc-felt">
        <label htmlFor="fs-begrund">Begrundelse (kræves ved returnér og afvis)</label>
        <textarea id="fs-begrund" rows={2} value={begrundelse}
                  placeholder="Fx: forslag 2 er billigst og leverer inden fristen"
                  onChange={(e) => setBegrundelse(e.target.value)} />
      </div>

      {/* ⚠ KNAPPERNE ER GENERERET AF TILSTANDSMASKINEN, ikke håndskrevet. En
          rolle kan derfor ikke komme til at se en knap den ikke må bruge — og
          `kanSkifteEtape()` afgør om den er aktiv, med den samme funktion
          serveren bruger. */}
      <div className="fc-formular-knapper">
        {muligheder.length === 0 ? (
          <span className="fc-hint">Din rolle har ingen handlinger på denne tilstand.</span>
        ) : muligheder.map((m) => {
          const tjek = kanSkifteEtape(
            { ...etape, valgtForslagId }, m.til, bruger?.perms, { begrundelse });
          /* ⚠ KUN VEJEN TIL `reserveret` BINDER RESSOURCER. En returnering
             eller en afvisning rører hverken bil eller chauffør og skal
             derfor ikke spærres af en reservationskonflikt — tværtimod er det
             netop dét man gør, når forslaget ikke holder. */
          const binder = m.til === "reserveret";
          const stoppet = binder && spaerret;
          const foersteSpaerring = tjekraekker.find((x) => x.tone === TONE.bad);
          return (
            <Knap key={m.til}
                  variant={binder ? "primaer" : undefined}
                  disabled={!tjek.ok || stoppet || arbejder}
                  title={!tjek.ok
                    ? tjek.aarsag
                    : stoppet
                      ? `${foersteSpaerring.tjek}: ${foersteSpaerring.tekst}`
                      : "Kalder etapeskift. Serveren kører de fem tjek igen."}
                  onClick={() => send(m.til)}>
              {arbejder ? "Arbejder …" : m.handling}
            </Knap>
          );
        })}
      </div>

      <Formularsvar svar={serversvar} />
    </Kort>
  );
}
