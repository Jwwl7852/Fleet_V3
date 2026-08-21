/* src/fleet/Etapeskifte.jsx
 * Knapperne der flytter en ETAPE gennem tilstandsmaskinen.
 *
 * ⚠ HVORFOR DEN FINDES: MASKINEN HAVDE NI TILSTANDE OG ÉN DØR.
 *
 * `skiftEtape()` blev kaldt fra præcis ÉT sted — Forslag-skærmen — som
 * afgør `afventerKoord`. Alt andet i `ETAPE_OVERGANGE` havde ingen knap:
 *
 *   kladde → afventerPlan   "Send til planlægning"   ingen skærm
 *   kladde → annulleret     "Annullér"               ingen skærm
 *   aaben → afventerPlan    "Tag af venteliste"      ingen skærm
 *   reserveret → udfoert    "Markér udført"          ingen skærm
 *   reserveret → annulleret "Annullér etape"         ingen skærm
 *   afvist → afventerPlan   "Genåbn etape"           ingen skærm
 *
 * En booking oprettet med `bookingopret` (beslutning 55) begyndte som
 * `kladde` og kunne aldrig komme videre. En overgang uden en knap er en vej
 * ingen kan finde — og maskinen så hel ud, fordi tabellen var komplet.
 *
 * ⚠ DEN LIGGER I `fleet/` AF SAMME GRUND SOM `Statusskifte.jsx`.
 * Flere skærme viser den samme etape. Byggede hver sin knaprække, ville de før
 * eller siden være uenige om hvilke skift der findes, og den ene ville tilbyde
 * et skift serveren afviser. Skærmen VISER; `etapeskift` HÅNDHÆVER — med den
 * SAMME `kanSkifteEtape()`.
 *
 * ⚠ DE FORSLAGSBÆRENDE OVERGANGE TEGNES IKKE HER.
 * `Send forslag`, `Foreslå matchet tur` og `Godkend valgt forslag` kræver et
 * forslag (`kraeverForslag` / `kraeverValgtForslag`), og et forslag laves der
 * hvor man kan SE turen — i Disponering og Forslag. En knap her ville åbne en
 * dialog der ikke kunne udfyldes. `kanSkifteEtape()` afviser dem alligevel;
 * komponenten viser dem som en **henvisning** frem for at lade som om.
 *
 * ⚠ OG DEN SKRIVER IKKE SELV. `etaper`, `reservationer` og `bookinger` er alle
 * `.write: false`. Et etapeskift rører alle tre — tilstanden, reservationen på
 * hver ressource, og bookingens AFLEDTE tilstand — og de skal lande sammen
 * eller slet ikke. Vejen ind er `etapeskift`.
 */
import { useState } from "react";
import { Knap, Raekke, Dialog, Felt, Formular, Formularsvar } from "./ui.jsx";
import {
  TILSTAND, tilgaengeligeEtapeHandlinger, kanSkifteEtape,
} from "./booking-state.js";
import { skiftEtape } from "./disponer.js";
import { msTilIso, isoTilMs } from "./format.js";

/* Hvilken knap der er den primære. ⚠ ÉN AD GANGEN: står to knapper som lige
   vigtige, læser man ingen af dem. Den primære er den man gør oftest fra den
   tilstand man står i. */
const PRIMAER = {
  kladde: "afventerPlan",
  aaben: "afventerPlan",
  reserveret: "udfoert",
  afvist: "afventerPlan",
};

/** De overgange der kræver et forslag — de hører i Disponering og Forslag. */
const KRAEVER_FORSLAG = (o) => Boolean(o.kraeverForslag || o.kraeverValgtForslag);

export default function Etapeskifte({ etape, perms, onSkiftet }) {
  const [svar, saetSvar] = useState(null);
  const [gemmer, saetGemmer] = useState(false);
  /* `null` = ingen dialog. Ellers overgangen der spørges om noget til. */
  const [spoerger, saetSpoerger] = useState(null);

  if (!etape) return null;

  const alle = tilgaengeligeEtapeHandlinger(etape.tilstand, perms);

  /* ⚠ EN ENDESTATION FÅR EN SÆTNING, IKKE EN TOM RÆKKE. Uden den ser panelet
     ud som om knapperne mangler at blive bygget — se Statusskifte. */
  if (!TILSTAND[etape.tilstand]) {
    return (
      <p className="fc-hint" style={{ marginTop: 10 }}>
        Etapen har en tilstand maskinen ikke kender
        (<code>{String(etape.tilstand)}</code>), så der er ingen skift at tilbyde.
      </p>
    );
  }

  const her = alle.filter((o) => !KRAEVER_FORSLAG(o));
  const andetsteds = alle.filter(KRAEVER_FORSLAG);

  const skift = async (o, ekstra = {}) => {
    saetGemmer(true);
    saetSvar(null);
    const r = await skiftEtape({ etapeId: etape.id, tilTilstand: o.til, ...ekstra });
    saetGemmer(false);
    saetSvar(r);
    saetSpoerger(null);
    if (r.ok) onSkiftet?.(o.til);
  };

  /* ⚠ FORHÅNDSSVARET ER SKÆRMENS, IKKE AFGØRELSEN. Serveren spørger igen med
     den samme funktion; det her er for at kunne sige HVORFOR med det samme
     frem for et sekunds tavshed efterfulgt af et nej. */
  const spaerring = (o) => {
    const t = kanSkifteEtape(etape, o.til, perms,
      /* Begrundelsen og fristen spørges der om i dialogen — de må ikke gøre
         knappen grå, for så kan man ikke nå at give dem. */
      { begrundelse: o.kraeverBegrundelse ? "—" : undefined });
    return t.ok ? null : t.aarsag;
  };

  return (
    <>
      {her.length > 0 && (
        <Raekke>
          {her.map((o) => {
            const nej = spaerring(o);
            return (
              <Knap
                key={o.til}
                variant={PRIMAER[etape.tilstand] === o.til ? "primaer" : "sekundaer"}
                disabled={Boolean(nej) || gemmer}
                title={nej || `${TILSTAND[etape.tilstand]?.label} → ${TILSTAND[o.til]?.label}`}
                onClick={() => ((o.kraeverBegrundelse || o.kraeverFrist)
                  ? saetSpoerger(o) : skift(o))}
              >
                {o.handling}
              </Knap>
            );
          })}
        </Raekke>
      )}

      {her.length === 0 && (
        <p className="fc-hint" style={{ marginTop: 10 }}>
          {alle.length === 0
            ? <>
                <b>{TILSTAND[etape.tilstand]?.label}</b> har ingen skift du må
                udføre herfra. Et afsluttet forløb genåbnes ikke — skal turen
                køres igen, er det en <b>ny booking</b>.
              </>
            : <>Herfra skal der <b>et forslag</b> til, og det laves i
               Disponering. Se nedenfor.</>}
        </p>
      )}

      {/* ⚠ EN HENVISNING, IKKE EN DEAKTIVERET KNAP. En knap der aldrig kan
          trykkes, er en attrap; en sætning der siger hvor man gør det, er en
          vej. Se "Træk opgave hertil" i beslutning 49. */}
      {andetsteds.length > 0 && (
        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>{andetsteds.map((o) => o.handling).join(" · ")}</b> kræver et
          forslag på etapen, og et forslag laves hvor turen kan ses —
          i <b>Disponering</b> og <b>Forslag</b>.
        </p>
      )}

      <Formularsvar svar={svar} okTekst="Etapen er skiftet." />

      {spoerger && (
        <Skiftedialog
          etape={etape}
          overgang={spoerger}
          gemmer={gemmer}
          onLuk={() => saetSpoerger(null)}
          onSkift={(ekstra) => skift(spoerger, ekstra)}
        />
      )}
    </>
  );
}

/**
 * ⚠ BEGRUNDELSEN ER PÅKRÆVET HVOR MASKINEN SIGER DET — OG DEN ER FRITEKST.
 *
 * En annulleret TUR er en aftale med en kunde der brydes, og en afvisning er
 * et svar kunden skal kunne få. Derfor kræver `etapeskift` en begrundelse,
 * modsat `opgavestatus` (beslutning 50), hvor en driftsopgave er vores egen
 * disposition.
 *
 * ⚠ OG DEN GÅR IKKE I AUDITLOGGEN. `LOGBARE_FELTER` i `audit-regler.js` er en
 * allowliste netop for at holde tastet tekst ude; begrundelsen står på
 * ETAPENS historik, hvor den hører til sagen.
 *
 * ⚠ FRISTEN ER LIGE SÅ PÅKRÆVET. En åben etape uden `senestMs` er gods der
 * ligger på lageret uden at nogen ser det ophobe sig — det er derfor
 * `kraeverFrist` findes.
 */
function Skiftedialog({ etape, overgang, gemmer, onLuk, onSkift }) {
  const [begrundelse, saetBegrundelse] = useState("");
  const [fristIso, saetFristIso] = useState(
    etape.senestMs ? msTilIso(etape.senestMs) : "");

  const senestMs = overgang.kraeverFrist ? isoTilMs(fristIso) : undefined;
  const manglerFrist = overgang.kraeverFrist && !Number.isFinite(senestMs);
  const manglerGrund = overgang.kraeverBegrundelse && !begrundelse.trim();

  return (
    <Dialog
      titel={overgang.handling}
      under={`${TILSTAND[etape.tilstand]?.label} → ${TILSTAND[overgang.til]?.label}`}
      onLuk={onLuk}
    >
      <Formular
        onGem={() => onSkift({
          begrundelse: overgang.kraeverBegrundelse ? begrundelse.trim() : undefined,
          senestMs: overgang.kraeverFrist ? senestMs : undefined,
        })}
        gemmer={gemmer}
        gemLabel={overgang.handling}
        onAnnuller={onLuk}
      >
        {overgang.kraeverBegrundelse && (
          <Felt id="es-grund" label="Begrundelse" kraevet
                vaerdi={begrundelse} saet={saetBegrundelse}
                fejl={manglerGrund ? "Serveren afviser skiftet uden en begrundelse." : null}
                hint="Står på etapens historik — ikke i auditloggen, som kun tager felter fra en allowliste."
                placeholder="Hvorfor?" maxLength={300} />
        )}
        {overgang.kraeverFrist && (
          <Felt id="es-frist" label="Frist" type="date" kraevet
                vaerdi={fristIso} saet={saetFristIso}
                fejl={manglerFrist ? "En åben etape skal have en frist." : null}
                hint="Uden en frist kan lageret fyldes op uden at nogen ser det." />
        )}
      </Formular>
    </Dialog>
  );
}
