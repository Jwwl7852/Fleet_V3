/* src/fleet/Haendelsespanel.jsx
 * Klik på en driftsopgave åbner den her — udtrukket af Vaerkstedskalender.jsx
 * (Fleet TARGET-restruktureringen), fordi Overblikkets arbejdskø nu også skal
 * kunne åbne "detaljer" på en opgave, ikke kun kalenderen.
 *
 * ⚠ SAMME KOMPONENT, TO KALDERE. Havde hver skærm sin egen kopi, ville de før
 * eller siden vise hver sin version af "hvorfor er enheden spærret" — samme
 * begrundelse som Gitterkalender.jsx og Sagsvisning.jsx ligger i fleet/ og
 * ikke i et modul.
 *
 * ⚠ IKKE `bred` (centreret, 1020px). Den tidligere begrundelse — "et
 * sidepanel ville klemme gitteret sammen til en tredjedel" — gjaldt et panel
 * der er en del af LAYOUT-FLOWET og derfor skubber gitteret til side.
 * `variant="drawer"` (§1 V1 visuel konsolidering) er et OVERLAY, samme
 * `position:fixed` som den centrerede dialog — gitteret klemmes slet ikke,
 * det forbliver forklarligt og synligt bag panelet.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { datoTid, kr, filstoerrelse } from "./format.js";
import {
  Dialog, Faner, Gitter, MiniLinje, Pille, Knap, Tabel, Formularsvar,
} from "./ui.jsx";
import { ARBEJDSTYPE, OPGAVE_STATUS, reservationFraOpgave } from "./opgaver.js";
import { prioritetFor } from "./prioritet.js";
import { slutter } from "./driftskalender.js";
import Statusskifte from "./Statusskifte.jsx";
import Sagsvisning from "./Sagsvisning.jsx";
import { KILDE, prioritetFor as reservationsPrioritet } from "./reservations.js";
import { DOKUMENT_STATUS } from "./dokumenter.js";
import {
  uploadOpgaveDokument, hentOpgaveDokumentLink, deaktiverOpgaveDokument, saetOpgaveDokumentSynlighed,
} from "./opgavedokumenter.js";

const PANEL_FANER = [
  { key: "overblik", label: "Overblik" },
  { key: "sag", label: "Sag" },
];

export default function Haendelsespanel({
  opgave, lvNavn, enheder, onLuk, maaSkrive, onSkiftet,
  /* ⚠ FLEET TARGET §9.3 — lader en kalder åbne panelet direkte på Sag-fanen
     lige efter planlægning, når opgaven har en ekstern leverandør. Samme
     panel, samme menneskeligt klik i Sagsvisnings OpretSagDialog — kun
     hvilken fane der er valgt fra start, er nyt. */
  initialFane = "overblik",
}) {
  const [fane, setFane] = useState(initialFane);
  const enhed = enheder.find((k) => k.id === opgave.koeretoejId) || null;
  const pri = prioritetFor(opgave);

  return (
    <Dialog
      variant="drawer"
      titel={opgave.beskrivelse}
      under={[enhed?.kaldenavn, ARBEJDSTYPE[opgave.arbejdstype],
              opgave.leverandoerId ? lvNavn(opgave.leverandoerId) : "Eget værksted"]
        .filter(Boolean).join(" · ")}
      handling={<Pille tone={OPGAVE_STATUS[opgave.status]?.pill}>
        {OPGAVE_STATUS[opgave.status]?.label}</Pille>}
      onLuk={onLuk}
    >
      <Faner faner={PANEL_FANER} valgt={fane} saet={setFane} label="Hændelse" />

      {fane === "overblik" && (
        <>
          {/* ⚠ ÉN KOLONNE, IKKE TO. Drawerens 420px er for smal til at give
             enhedsinfo og Reservationens påvirkning hver sin halvdel uden at
             MiniLinje-labels og -værdier ombrækker på hvert eneste ord. */}
          <Gitter>
            <div>
              <MiniLinje label="Enhed" vaerdi={<b>{enhed?.kaldenavn || opgave.koeretoejId}</b>} />
              {enhed?.registrering && <MiniLinje label="Reg.nr." vaerdi={enhed.registrering} />}
              <MiniLinje label="Type" vaerdi={ARBEJDSTYPE[opgave.arbejdstype] || "—"} />
              <MiniLinje label="Udføres af" vaerdi={opgave.leverandoerId
                ? lvNavn(opgave.leverandoerId)
                : "Eget værksted"} />
              <MiniLinje label="Start" vaerdi={datoTid(opgave.startMs)} />
              <MiniLinje
                label="Slut"
                vaerdi={slutter(opgave)
                  ? datoTid(slutter(opgave))
                  : <span className="fc-neutral">— intet estimat</span>} />
              <MiniLinje label="Prioritet" vaerdi={pri
                ? <Pille tone={pri.pill}>{pri.label}</Pille>
                : <span className="fc-neutral">— ikke vurderet</span>} />
              {Number.isFinite(opgave.beloebOere) && (
                <MiniLinje label="Estimeret omkostning" vaerdi={kr(opgave.beloebOere)} />
              )}
              <MiniLinje label="Sag" vaerdi={opgave.sagId
                ? <Pille tone="info">Findes — se fanen "Sag"</Pille>
                : <span className="fc-neutral">Ingen</span>} />
            </div>
            <Reservationen opgave={opgave} />
          </Gitter>

          <LeverandoerTilbud opgave={opgave} />
        </>
      )}

      {/* ⚠ SKIVE 3C — DEN DELTE Sagsvisning, IKKE EN PARALLELKOPI. Samme
          komponent som Facilitys Servicekalender bruger. */}
      {fane === "sag" && (
        <Sagsvisning
          sagId={opgave.sagId || null}
          objektType="opgave"
          objektId={opgave.id}
          art="fleet"
          objektLabel={enhed?.kaldenavn || opgave.koeretoejId}
          emneForslag={opgave.beskrivelse}
          modpartNavnForslag={opgave.leverandoerId ? lvNavn(opgave.leverandoerId) : ""}
          onGenindlaes={onSkiftet}
        />
      )}

      {/* ⚠ F.2 — SAMME PLADS SOM Statusskifte, IKKE INDE I EN FANE. Bilag
          hører hverken under "Overblik" (som er DATA om opgaven) eller
          "Sag" (som er kommunikationssporet) — det er en tredje, altid
          synlig handling, samme figur som statusknapperne nedenfor. */}
      <div style={{ marginTop: 18 }}>
        <OpgaveBilag opgave={opgave} lvNavn={lvNavn} maaSkrive={maaSkrive} onAendret={onSkiftet} />
      </div>

      <div style={{ marginTop: 18 }}>
        <Statusskifte opgave={opgave} maaSkrive={maaSkrive} onSkiftet={onSkiftet} />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>Flyt</b> opgaven ved at <b>trække blokken</b> i kalenderen — til et
          andet tidspunkt eller en anden enhed. <b>Shift + piletast</b> gør det
          samme.{" "}
          <Link className="fc-a" to="/flaade/indberetninger">Se indberetninger</Link>
        </p>
      </div>
    </Dialog>
  );
}

/* ---- Bilag — F.2, samme fundament som Fakturacenter.jsx's Bilag -------- */

/**
 * ⚠ SAMME SKABELON SOM Bilag I Fakturacenter.jsx — se dens hoved for
 * begrundelsen om hvorfor dokumenterne kommer MED opgaven i stedet for at
 * blive hentet separat. Forskellen her: `onAendret` kalder eksplicit
 * `opgaver.genindlaes()` (se Haendelsespanels `onSkiftet`), fordi
 * `useListe("opgaver", …)` ikke er `live: true` — uden det ville et
 * uploadet dokument først dukke op efter et helsides genindlæs.
 *
 * ⚠ DELINGSTOGGLEN VISES KUN NÅR OPGAVEN HAR EN leverandoerId. Uden en
 * tildelt leverandør er der intet at dele MED — en synlig, men virkningsløs
 * knap ville se ud som en funktion der ikke virkede.
 */
function OpgaveBilag({ opgave, lvNavn, maaSkrive, onAendret }) {
  const [arbejder, setArbejder] = useState(false);
  const [svar, setSvar] = useState(null);

  const dokumenter = Object.entries(opgave.dokumenter || {})
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => (b.oprettetTid || 0) - (a.oprettetTid || 0));

  const paaVaelgFil = async (e) => {
    const fil = e.target.files?.[0];
    /* ⚠ NULSTIL FELTET STRAKS — samme grund som Fakturacenters Bilag. */
    e.target.value = "";
    if (!fil) return;
    setArbejder(true);
    setSvar(null);
    const r = await uploadOpgaveDokument({ opgaveId: opgave.id, fil });
    setSvar(r);
    setArbejder(false);
    if (r.ok) onAendret?.();
  };

  const paaAaben = async (d) => {
    setSvar(null);
    const r = await hentOpgaveDokumentLink({ opgaveId: opgave.id, dokumentId: d.id });
    if (r.ok && r.data?.url) {
      window.open(r.data.url, "_blank", "noopener,noreferrer");
    } else {
      setSvar(r);
    }
  };

  const paaDeaktiver = async (d) => {
    setArbejder(true);
    setSvar(null);
    const r = await deaktiverOpgaveDokument({ opgaveId: opgave.id, dokumentId: d.id });
    setSvar(r);
    setArbejder(false);
    if (r.ok) onAendret?.();
  };

  const paaSkifteSynlighed = async (d, synlig) => {
    setArbejder(true);
    setSvar(null);
    const r = await saetOpgaveDokumentSynlighed({ opgaveId: opgave.id, dokumentId: d.id, synlig });
    setSvar(r);
    setArbejder(false);
    if (r.ok) onAendret?.();
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
            /* ⚠ HELE KOLONNEN ER VÆK, IKKE BARE TOM, UDEN EN LEVERANDØR —
               se komponentens hoved. */
            ...(opgave.leverandoerId ? [{
              key: "deling", label: "Leverandørportal",
              render: (d) => (
                d.status === "aktiv" ? (
                  <label className="fc-afkryds-punkt">
                    <input type="checkbox" checked={d.synligForLeverandoer === true}
                           disabled={!maaSkrive || arbejder}
                           onChange={(e) => paaSkifteSynlighed(d, e.target.checked)} />
                    Delt
                  </label>
                ) : <span className="fc-hint">—</span>
              ),
            }] : []),
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
      {opgave.leverandoerId && dokumenter.some((d) => d.status === "aktiv") && (
        <p className="fc-hint" style={{ marginTop: 8 }}>
          "Delt" gør bilaget synligt for {lvNavn(opgave.leverandoerId)} i leverandørportalen —
          ikke resten af FleetControl. Fjern fluebenet for at skjule det igen.
        </p>
      )}
    </>
  );
}

/**
 * ⚠ FLEET TARGET COMPLETION §8 (produktejer-review 2026-09-01) — "Fleet-
 * overblik/arbejdskø [skal] vise de allerede besluttede eksterne
 * leverandørtilstande, især prisoverslag [...] når data findes. Ingen
 * parallel portalstatus." "Klar til afhentning" er allerede synlig for
 * gratis — det ER en `opgave.status`, og drawer-headeren tegner ALLE
 * statusser med den samme `OPGAVE_STATUS`-pille foroven. Denne blok er den
 * anden halvdel: prisoverslaget leverandøren har indsendt.
 *
 * ⚠ LÆSNING, IKKE HANDLING. At acceptere/afvise et tilbud er ikke bygget her
 * — det er leverandørportalens egen skrivevej. Samme "skærmen VISER, en
 * Cloud Function HÅNDHÆVER"-adskillelse som resten af filen.
 *
 * ⚠ HELE HISTORIKKEN, NYESTE ØVERST — samme udfoldning som
 * leverandoerportal-regler.js's leverandoerSynligOpgave() bruger til
 * portalens egen visning (ældste øverst dér, fordi et forløb læses
 * kronologisk; her nyeste øverst, fordi det er DET tilbud der gælder nu).
 * Et rettet tilbud er en NY post, aldrig en overskrivning af den gamle.
 */
function LeverandoerTilbud({ opgave }) {
  const tilbud = Object.entries(opgave.leverandoertilbud || {})
    .map(([id, t]) => ({ id, ...t }))
    .sort((a, b) => (b.indsendtMs || 0) - (a.indsendtMs || 0));
  if (!tilbud.length) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <div className="fc-hint" style={{ marginBottom: 6 }}>Leverandørtilbud</div>
      <Tabel
        kolonner={[
          { key: "indsendtMs", label: "Modtaget", render: (t) => datoTid(t.indsendtMs) },
          { key: "beloeb", label: "Beløb", num: true,
            render: (t) => (Number.isFinite(t.beloebOere) ? kr(t.beloebOere) : "—") },
          { key: "kommentar", label: "Kommentar", render: (t) => t.kommentar || "—" },
          { key: "status", label: "Status",
            render: (t) => <Pille tone="info">{t.status || "afventer"}</Pille> },
        ]}
        raekker={tilbud}
        noegle={(t) => t.id}
        tom=""
      />
    </div>
  );
}

/**
 * Reservationsmodellen gjort synlig. Kortet svarer på ét spørgsmål: hvorfor
 * kan disponenten ikke bruge enheden i den periode?
 */
function Reservationen({ opgave }) {
  let r = null;
  let fejl = null;
  try {
    r = reservationFraOpgave(opgave);
  } catch (e) {
    /* ⚠ FEJLEN VISES, DEN SLUGES IKKE. reservationFraOpgave() kaster når der
       ikke er noget vindue at reservere — og det er det rigtige svar: en
       standardlængde ville spærre enheden i et tidsrum ingen har besluttet.
       Fangede vi den i stilhed, ville panelet bare mangle et afsnit. */
    fejl = e.message;
  }

  if (fejl) {
    return (
      <div>
        <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Reservationens påvirkning</h3>
        <p className="fc-hint fc-bad">
          Opgaven kan <b>ikke</b> reservere sin enhed: {fejl}
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Så længe den ikke kan, ser enheden <b>fri</b> ud i disponeringen — og
          det er værre end en spærring man kan se.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Reservationens påvirkning</h3>
      <MiniLinje label="Ressource" vaerdi={<code>{r.ressourceType}</code>} />
      <MiniLinje label="Spærret fra" vaerdi={datoTid(r.fra)} />
      <MiniLinje label="Spærret til" vaerdi={`${datoTid(r.til)} (eksklusiv)`} />
      <MiniLinje label="Kilde" vaerdi={<code>{r.kilde.type}</code>} />
      <MiniLinje
        label="Prioritet"
        vaerdi={<><b>{reservationsPrioritet(r.kilde.type)}</b>
          {r.kilde.type === KILDE.vaerksted && " — den højeste"}</>} />
      <p className="fc-hint" style={{ marginTop: 10 }}>
        En enhed på værksted kan ikke køre, <b>uanset hvad disponenten har
        lovet</b>. En booking der overlapper, bliver overskrevet og annulleret
        med årsag — ikke slettet, så man kan forklare hvorfor en tur blev
        flyttet.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        <b>Reservationen skrives ikke endnu.</b> To disponenter kan ramme samme
        sekund, så konfliktfriheden hører i en Cloud Function. Det her er
        <b> formen</b>, ikke en handling.
      </p>
    </div>
  );
}
