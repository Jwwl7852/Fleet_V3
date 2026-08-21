/* src/moduler/booking/NyForespoergsel.jsx
 * Booking – ny transportforespørgsel
 *
 * Rolle: casehandler. Det er her forløbet begynder — en forespørgsel oprettes
 * som `kladde` og sendes til planlægning med overgangen til `afventerPlan`.
 *
 * ⚠ SKÆRMEN SKRIVER NU. Her stod "der skrives ingenting (fase 0)".
 * `bookingopret` skriver bookingen OG dens etaper i ÉN atomisk opdatering og
 * henter nummeret fra counteren — beslutning 55.
 *
 * ⚠ ÉN KNAP, IKKE TO. Der stod "Send til planlægning" og "Gem som kladde",
 * begge deaktiverede. Oprettelsen laver en KLADDE; at sende den til
 * planlægning er et etapeskift (`etapeskift`, kladde → afventerPlan) og
 * dermed et andet kald. De to kan ikke lægges sammen atomisk, og en kæde der
 * lykkes halvt ville efterlade et forløb i en tilstand brugeren ikke bad om.
 * En kladde han kan SE og sende videre, er det ærlige svar.
 *
 * ⚠ BOOKINGNUMMERET KOMMER FRA EN COUNTER, ALDRIG FRA EN OPTÆLLING.
 * naesteBookingnummer() kører en transaction mod countere/booking/<år>
 * (beslutning 8). At tælle eksisterende bookinger ville give to bookinger
 * samme nummer i det sekund to casehandlere opretter samtidig. Funktionen
 * kræver en database og kaldes derfor ikke her — feltet viser formatet.
 *
 * FLEKSIBILITET ER IKKE PYNT. Uden et spænd på afhentning og levering kan
 * matchningen ikke lægge to forsendelser sammen, og hver forespørgsel bliver
 * sin egen tur.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { kr, oereFraKroner } from "../../fleet/format.js";
import {
  Kort, Pille, Knap, Gitter, MiniLinje, Formularsvar, Datatilstand,
} from "../../fleet/ui.jsx";
import {
  TILSTAND, kanSkifteEtape, byggEtapeSkifte,
  TRANSPORTTYPE, RUTEPRAEFERENCE, FLEKSIBILITET,
} from "../../fleet/booking-state.js";
import { PERM } from "../../fleet/permissions.js";
import { harPerm } from "../../fleet/permissions.js";
import { opretBooking, valideBooking } from "../../fleet/booking.js";
/* ⚠ KUN SOM FALDBAKKE I useListe. `kunder` ER en seedet node, og skærmen
   læste demosættet DIREKTE — så vælgeren tilbød kunder der ikke findes i
   basen, og serveren ville svare "Kunden findes ikke" på et valg skærmen selv
   havde tilbudt. Samme fejl som Indkøb → Fakturaer havde. */
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

const TOM = {
  kundeId: "", fraSted: "", tilSted: "",
  transporttype: "fuldlast", rutepraeference: "hurtigst",
  omsaetning: "",
  onsketAfhentning: "", afhentningFleks: "timer2",
  onsketLevering: "", leveringFleks: "halvdag",
  krav: "", kundekrav: "",
};

const tilMs = (v) => (v ? new Date(v).getTime() : null);

export default function NyForespoergsel() {
  const { bruger, division } = useFleet();
  const [f, setF] = useState(TOM);
  const [gemmer, setGemmer] = useState(false);
  const [svarPost, setSvarPost] = useState(null);
  const saet = (n) => (e) => {
    setF((x) => ({ ...x, [n]: e.target.value }));
    /* Et svar hører til den post der blev sendt. Rører man et felt bagefter,
       beskriver svaret ikke længere det man har foran sig. */
    setSvarPost(null);
  };

  /* ⚠ NODEN, IKKE DEMOSÆTTET. Se importen. Divisionsfilteret ligger i
     useListe — en post UDEN division hører til begge, ikke til ingen. */
  /* ⚠ HER STOD `{ division, … }`, og det var en latent fejl: indstillingen
     hed `division` og tog `"shell" | "alle"`, men fik VÆRDIEN `"gods"`. Den
     virkede ved et tilfælde — alt der ikke er `"alle"`, opfører sig som
     `"shell"` — så en tastefejl i navnet ville have givet præcis samme
     opførsel. Indstillingen findes ikke længere (beslutning 70), og
     `useListe` afviser nu en ukendt indstilling højlydt frem for at gøre
     ingenting. */
  const kunder = useListe("kunder", { graense: 500, demo: DEMO_KUNDER });

  const omsaetningOere = oereFraKroner(f.omsaetning);

  /* Kladden som tilstandsmaskinen ser den. Overgangen kladde → afventerPlan
     kræver booking.opret og har ingen andre forudsætninger — men de felter
     forespørgslen skal bære, kontrolleres her, så man ikke sender en tom sag
     til planlægning.

     ⚠ DET ER ETAPENS TILSTANDSMASKINE (beslutning 40). En forespørgsel bliver
     til et forløb med mindst én etape, og det er etapen der sendes til
     planlægning — bookingens tilstand er AFLEDT og skrives af etapeskift.
     Der findes ikke længere en kanSkifte() på en booking. */
  const kladde = { tilstand: "kladde", forslag: [], valgtForslagId: null };
  const svar = kanSkifteEtape(kladde, "afventerPlan", bruger?.perms);
  const maaOprette = harPerm(bruger?.perms, PERM.bookingOpret);

  /* ⚠ SERVERENS EGEN VALIDERING, IKKE EN LISTE VED SIDEN AF.
     Her stod en håndskrevet `mangler`-liste med fem felter — og den kendte
     ikke fleksibiliteten, rækkefølgen på tidspunkterne eller at beløbet skal
     være hele ører. `valideBooking()` ligger i `booking-state.js`, som er
     delt, og `bookingopret` kalder præcis den samme. To formuleringer af én
     spærring er to forklaringer på én ting. */
  const udkast = {
    kundeId: f.kundeId || null,
    division,
    fraSted: f.fraSted,
    tilSted: f.tilSted,
    transporttype: f.transporttype,
    rutepraeference: f.rutepraeference || null,
    afhentningFleks: f.afhentningFleks,
    leveringFleks: f.leveringFleks,
    onsketAfhentningMs: tilMs(f.onsketAfhentning),
    onsketLeveringMs: tilMs(f.onsketLevering),
    omsaetningOere,
    kundekrav: f.kundekrav,
    krav: f.krav.split(",").map((k) => k.trim()).filter(Boolean),
  };
  const kontrol = valideBooking(udkast, { kunder: kunder.data.map((k) => k.id) });
  const mangler = Object.values(kontrol.fejl);

  const gem = async () => {
    if (!kontrol.ok) return;
    setGemmer(true);
    setSvarPost(null);
    const r = await opretBooking(udkast);
    setGemmer(false);
    setSvarPost(r);
    if (r.ok) setF(TOM);
  };

  const opdatering = byggEtapeSkifte(kladde, "afventerPlan", {
    rolle: bruger?.rolle, bruger: bruger?.uid, begrundelse: null,
  });
  const historikNoegle = Object.keys(opdatering).find((n) => n.startsWith("historik/"));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort
          titel="Ny transportforespørgsel"
          handling={<Pille tone={TILSTAND.kladde.pill}>{TILSTAND.kladde.label}</Pille>}
        >
          <p className="fc-hint" style={{ marginBottom: 14 }}>
            Forespørgslen oprettes som <b>kladde</b> og sendes til planlægning.
            Disponenten laver derefter 1–3 forslag, og koordinatoren godkender —
            <b> ikke</b> disponenten selv.{" "}
            <Link className="fc-a" to="/booking/forslag/bk-2026-00314">Se forslagstrinnet</Link>.
          </p>

          {/* ⚠ EN AFVIST LÆSNING ER IKKE EN TOM KUNDELISTE. Uden den her
              ville vælgeren bare stå tom, og brugeren ville tro at der ingen
              kunder var — se datatilstand.js. */}
          <Datatilstand tilstand={kunder.tilstand} genprov={kunder.genindlaes} />

          <Gitter kolonner="1fr 1fr">
            <div className="fc-felt">
              <label htmlFor="nf-kunde">Kunde *</label>
              <select id="nf-kunde" value={f.kundeId} onChange={saet("kundeId")}>
                <option value="">Vælg kunde</option>
                {kunder.data
                  /* ⚠ EN INAKTIV KUNDE FÅR INGEN NY BOOKING — serveren afviser
                     den, og en vælger der tilbød den, ville love noget der
                     bliver sagt nej til bagefter. */
                  .filter((k) => k.aktiv !== false)
                  .map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
              </select>
            </div>
            <div className="fc-felt">
              <label htmlFor="nf-type">Transporttype</label>
              <select id="nf-type" value={f.transporttype} onChange={saet("transporttype")}>
                {Object.entries(TRANSPORTTYPE).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </Gitter>

          <Gitter kolonner="1fr 1fr">
            <div className="fc-felt">
              <label htmlFor="nf-fra">Afhentningssted *</label>
              <input id="nf-fra" value={f.fraSted} onChange={saet("fraSted")} placeholder="By eller adresse" />
            </div>
            <div className="fc-felt">
              <label htmlFor="nf-til">Leveringssted *</label>
              <input id="nf-til" value={f.tilSted} onChange={saet("tilSted")} placeholder="By eller adresse" />
            </div>
          </Gitter>

          <div className="fc-felt">
            <label htmlFor="nf-rute">Rutepræference</label>
            <select id="nf-rute" value={f.rutepraeference} onChange={saet("rutepraeference")}>
              {Object.entries(RUTEPRAEFERENCE).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Tidspunkt OG fleksibilitet ved siden af hinanden. Et ønsket
              tidspunkt uden et spænd er i praksis "fast", og så kan
              matchningen ikke lægge to forsendelser sammen. */}
          <Gitter kolonner="1fr 1fr">
            <div className="fc-felt">
              <label htmlFor="nf-afh">Ønsket afhentning *</label>
              <input id="nf-afh" type="datetime-local" value={f.onsketAfhentning}
                     onChange={saet("onsketAfhentning")} />
            </div>
            <div className="fc-felt">
              <label htmlFor="nf-afhf">Fleksibilitet</label>
              <select id="nf-afhf" value={f.afhentningFleks} onChange={saet("afhentningFleks")}>
                {Object.entries(FLEKSIBILITET).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </Gitter>

          <Gitter kolonner="1fr 1fr">
            <div className="fc-felt">
              <label htmlFor="nf-lev">Ønsket levering</label>
              <input id="nf-lev" type="datetime-local" value={f.onsketLevering}
                     onChange={saet("onsketLevering")} />
            </div>
            <div className="fc-felt">
              <label htmlFor="nf-levf">Fleksibilitet</label>
              <select id="nf-levf" value={f.leveringFleks} onChange={saet("leveringFleks")}>
                {Object.entries(FLEKSIBILITET).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </Gitter>

          <div className="fc-felt">
            <label htmlFor="nf-oms">Aftalt omsætning ekskl. moms (kr.) *</label>
            <input id="nf-oms" inputMode="decimal" value={f.omsaetning}
                   onChange={saet("omsaetning")} placeholder="0,00" />
          </div>

          <div className="fc-felt">
            <label htmlFor="nf-krav">Krav til udstyr</label>
            <input id="nf-krav" value={f.krav} onChange={saet("krav")}
                   placeholder="Bagsmæklift, palleløfter, køl 2–6 °C …" />
          </div>

          <div className="fc-felt">
            <label htmlFor="nf-kkrav">Kundekrav</label>
            <textarea id="nf-kkrav" rows={2} value={f.kundekrav} onChange={saet("kundekrav")}
                      placeholder="Fx: ring 30 min. før ankomst" />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {/* ⚠ KNAPPEN ER AKTIV SELV OM FORMULAREN ER UGYLDIG — så listen
                nedenfor kan nå at forklare hvad der mangler. `gem()` afviser
                selv; der sendes aldrig noget ugyldigt afsted. Deaktiveret på
                permissionen, derimod: en knap serveren afviser, er en pæn
                knap. */}
            <Knap variant="primaer" onClick={gem}
                  disabled={!maaOprette || gemmer}
                  title={maaOprette ? undefined : `Kræver ${PERM.bookingOpret}.`}>
              {gemmer ? "Opretter …" : "Opret forespørgsel"}
            </Knap>
          </div>
          <Formularsvar svar={svarPost}
                        okTekst={svarPost?.data?.nummer
                          ? `Oprettet som ${svarPost.data.nummer} — kladde med én etape.`
                          : "Oprettet."} />
          {mangler.length > 0 && (
            <p className="fc-hint" style={{ marginTop: 10 }}>Mangler: {mangler.join(" ")}</p>
          )}
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Forespørgslen oprettes som <b>kladde med én etape</b>. At sende den
            til planlægning er et <b>etapeskift</b> — et andet kald, som
            <b> Forslag</b> og <b>Disponering</b> laver. De to kan ikke lægges
            sammen atomisk, og en kæde der lykkes halvt ville efterlade
            forløbet i en tilstand ingen bad om.
          </p>
        </Kort>

        <div className="fc-grid">
          <Kort titel={`Overgangen — rolle: ${bruger?.rolle || "ukendt"}`}>
            <MiniLinje label="Fra" vaerdi={<Pille tone={TILSTAND.kladde.pill}>{TILSTAND.kladde.label}</Pille>} />
            <MiniLinje label="Til" vaerdi={<Pille tone={TILSTAND.afventerPlan.pill}>{TILSTAND.afventerPlan.label}</Pille>} />
            <MiniLinje label="Kræver" vaerdi={<code>{PERM.bookingOpret}</code>} />
            <MiniLinje label="kanSkifteEtape()" vaerdi={svar.ok
              ? <Pille tone="ok">ok</Pille>
              : <Pille tone="bad">afvist</Pille>} />
            {!svar.ok && <p className="fc-hint fc-bad" style={{ marginTop: 8 }}>{svar.aarsag}</p>}
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Både <b>casehandler</b>, <b>koordinator</b> og <b>admin</b> har{" "}
              <code>booking.opret</code>. En <b>chauffør</b> har den ikke — skift rolle i
              sidebaren og se knappen og svaret ændre sig.
            </p>
          </Kort>

          {/* ⚠ KORTET HED "Hvad Gem ville skrive" — det var rigtigt dengang
              der ikke blev skrevet noget. Nu skriver knappen, og kortet viser
              det NÆSTE skridt: hvad etapeskiftet til planlægning ville sætte. */}
          <Kort titel="Næste skridt: send til planlægning">
            <MiniLinje label="tilstand" vaerdi={<code>{opdatering.tilstand}</code>} />
            <MiniLinje label="sidstAendretAf" vaerdi={<code>{String(opdatering.sidstAendretAf)}</code>} />
            <MiniLinje label="historik" vaerdi={<code>{historikNoegle}</code>} />
            <MiniLinje label="omsaetningOere"
                       vaerdi={<code>{omsaetningOere == null ? "—" : omsaetningOere}</code>} />
            <MiniLinje label="division" vaerdi={<code>{division}</code>} />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Beløbet gemmes i <b>hele øre, ekskl. moms</b> — {kr(omsaetningOere || 0)} bliver{" "}
              <code>{omsaetningOere ?? 0}</code>. Aldrig en float, og aldrig ét felt med
              moms indeni.
            </p>
          </Kort>

          <Kort titel="Bookingnummeret">
            <MiniLinje label="Format" vaerdi={<code>BKG-ÅÅÅÅ-NNNNN</code>} />
            <MiniLinje label="Kilde" vaerdi={<code>countere/booking/&lt;år&gt;</code>} />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Nummeret kommer fra en <b>counter i en transaction</b>, aldrig fra en
              optælling af eksisterende bookinger — to casehandlere der opretter samtidig
              ville ellers få samme nummer. Det tildeles af den Cloud Function der
              skriver posten, og derfor er feltet tomt indtil da.
            </p>
          </Kort>
        </div>
      </Gitter>
    </div>
  );
}
