/* src/fleet/Statusskifte.jsx
 * Knapperne der flytter en driftsopgave gennem sit statsmaskineri.
 *
 * ⚠ DEN LIGGER I fleet/ FORDI FIRE SKÆRME VISER DEN SAMME OPGAVE.
 * Driftskalenderen, Arbejdskøen, Servicekalenderen og Disponering. Byggede
 * hver af dem sin egen knaprække, ville de før eller siden være uenige om
 * hvilke skift der findes — og den ene ville tilbyde et skift serveren afviser.
 * Samme snit som Gitterkalenderen og Planlaegdialog.
 *
 * ⚠ KNAPPERNE TEGNES AF MASKINEN, IKKE AF EN LISTE HER.
 * `OPGAVE_OVERGANGE` siger hvad der kan lade sig gøre fra den status opgaven
 * står i, og serveren afviser med `kanSkifteOpgave()` — den SAMME funktion.
 * En knap der ikke svarer til en overgang, er en pæn knap; en overgang uden en
 * knap er en vej ingen kan finde.
 *
 * ⚠ INGEN BEGRUNDELSE VED ANNULLERING, OG DET ER MED VILJE.
 * `etapeskift` kræver en, fordi en annulleret TUR er en aftale med en kunde
 * der brydes. En driftsopgave er vores egen disposition. Og vigtigere: en
 * begrundelse ville være fritekst på vej mod auditloggen, og allowlisten i
 * `audit-regler.js` findes netop for at holde tastet tekst ude. Noten på
 * auditposten skrives af SERVEREN, af felter den selv kender.
 *
 * ⚠ OG DEN SKRIVER IKKE SELV. `opgaver` og `reservationer` er begge
 * `.write: false`, og et statusskifte rører dem begge: en annulleret opgave
 * skal give bilen fri igen. Vejen ind er `opgavestatus`. Se beslutning 50.
 */
import { useState } from "react";
import { Knap, Raekke, Dialog, Felt, Formular, Formularsvar } from "./ui.jsx";
import { OPGAVE_STATUS } from "./opgaver.js";
import {
  OPGAVE_OVERGANGE, RESERVATION_VED, skiftOpgaveStatus,
} from "./opgaveplan.js";

/* Hvilken knap der er den primære. ⚠ ÉN AD GANGEN: står to knapper som lige
   vigtige, læser man ingen af dem. Den primære er den man gør oftest fra den
   status man står i. */
const PRIMAER = { planlagt: "igang", afventer: "igang", igang: "udfoert",
                  indberettet: "planlagt" };

/** Hvad skiftet gør ved reservationen, som en sætning. Ét sted. */
const FOELGE = {
  afkort: "Reservationen afkortes til nu, så enheden bliver fri igen.",
  frigiv: "Reservationen fjernes, så enheden bliver fri igen.",
  uaendret: null,
};

export default function Statusskifte({ opgave, maaSkrive = false, onSkiftet }) {
  const [svar, saetSvar] = useState(null);
  const [gemmer, saetGemmer] = useState(false);
  /* `null` = ingen dialog. En streng = den status der spørges om tid til. */
  const [spoerger, saetSpoerger] = useState(null);

  if (!opgave) return null;
  const maal = OPGAVE_OVERGANGE[opgave.status];

  /* ⚠ EN ENDESTATION FÅR EN SÆTNING, IKKE EN TOM RÆKKE. Uden den ser panelet
     ud som om knapperne mangler at blive bygget. */
  if (!maal) {
    return (
      <p className="fc-hint" style={{ marginTop: 10 }}>
        Opgaven har en status maskinen ikke kender (<code>{String(opgave.status)}</code>),
        så der er ingen skift at tilbyde.
      </p>
    );
  }
  if (!maal.length) {
    return (
      <p className="fc-hint" style={{ marginTop: 10 }}>
        <b>{OPGAVE_STATUS[opgave.status]?.label}</b> er en endestation — et afsluttet
        forløb genåbnes ikke. Skal arbejdet gøres om, er det en <b>ny opgave</b>.
      </p>
    );
  }

  const skift = async (status, faktiskMin) => {
    saetGemmer(true);
    saetSvar(null);
    const r = await skiftOpgaveStatus({ opgaveId: opgave.id, foer: opgave, status, faktiskMin });
    saetGemmer(false);
    saetSvar(r);
    saetSpoerger(null);
    if (r.ok) onSkiftet?.(status);
  };

  return (
    <>
      <Raekke>
        {maal.map((status) => (
          <Knap
            key={status}
            variant={PRIMAER[opgave.status] === status ? "primaer" : "sekundaer"}
            disabled={!maaSkrive || gemmer}
            title={maaSkrive
              ? [`${OPGAVE_STATUS[opgave.status]?.label} → ${OPGAVE_STATUS[status]?.label}`,
                 FOELGE[RESERVATION_VED[status]]].filter(Boolean).join(". ")
              : "Kræver opgaver.skriv."}
            /* ⚠ KUN `udfoert` SPØRGER. De andre skift har intet at oplyse, og
               en dialog der kun har en Ja-knap, er en forhindring. */
            onClick={() => (status === "udfoert" ? saetSpoerger(status) : skift(status))}
          >
            {ETIKET[status] || OPGAVE_STATUS[status]?.label || status}
          </Knap>
        ))}
      </Raekke>

      <Formularsvar svar={svar} okTekst="Statussen er skiftet." />

      {spoerger === "udfoert" && (
        <Tidsdialog
          opgave={opgave}
          gemmer={gemmer}
          onLuk={() => saetSpoerger(null)}
          onMeld={(faktiskMin) => skift("udfoert", faktiskMin)}
        />
      )}
    </>
  );
}

/* Knapteksten er en HANDLING, ikke en tilstand. "Udført" på en knap læses som
   en oplysning om hvad opgaven ER; "Meld udført" som noget man gør. */
const ETIKET = {
  igang: "Start arbejdet",
  udfoert: "Meld udført",
  afventer: "Sæt på afventende",
  annulleret: "Annullér",
  planlagt: "Planlæg",
};

/**
 * ⚠ TIDEN ER VALGFRI, OG DIALOGEN SIGER DET.
 *
 * En værkfører der lukker ti opgaver, ved ikke nødvendigvis hvor længe hver af
 * dem tog. Krævede vi feltet, ville det blive udfyldt med fiktion — og tallet
 * bruges til at vurdere estimater. `kpi.opgaver.udenTidsregistrering` TÆLLER
 * dem der mangler, så hullet er synligt frem for spærret.
 *
 * ⚠ OG DEN FORESLÅR IKKE ET TAL. Et forudfyldt estimat ville blive godkendt
 * uden at blive læst, og så stod estimatet som en måling. De to felter er
 * adskilt netop for ikke at kunne forveksles: `estimeretMin` er hvad vi troede,
 * `faktiskMin` er hvad der gik.
 */
function Tidsdialog({ opgave, gemmer, onLuk, onMeld }) {
  const [minutter, saetMinutter] = useState("");
  const tal = Number(minutter);
  const gyldig = minutter === "" || (Number.isFinite(tal) && tal >= 0);

  return (
    <Dialog
      titel="Meld udført"
      under="Reservationen afkortes til nu, så enheden bliver fri igen."
      onLuk={onLuk}
    >
      <Formular
        onGem={() => onMeld(minutter === "" ? undefined : Math.round(tal))}
        gemmer={gemmer}
        gemLabel="Meld udført"
        onAnnuller={onLuk}
      >
        <Felt
          id="st-faktisk" label="Faktisk tid" type="number" min="0" suffiks="min"
          vaerdi={minutter} saet={saetMinutter}
          fejl={gyldig ? null : "Et helt antal minutter, og ikke negativt."}
          hint="Valgfri. Lad den stå tom, hvis du ikke ved det — så tælles opgaven
                med under „uden tidsregistrering“ frem for at få et gættet tal."
        />

        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>Estimatet var {opgave.estimeretMin} min.</b> Det er hvad vi troede;
          feltet her er hvad der <b>gik</b>. De to står hver for sig, fordi en bil
          kan holde på liften i seks timer og blive arbejdet på i to — og
          reservationen regnes af estimatet, ikke af tiden.
        </p>

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>Reservationen forlænges ikke.</b> Løb arbejdet over sin tid, bliver
          den stående som den var: den periode kan allerede være lovet væk til en
          booking, og en udvidelse ville lave et overlap datamodellen afviser.
          Overskridelsen kan ses her på opgaven i stedet.
        </p>
      </Formular>
    </Dialog>
  );
}
