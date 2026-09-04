/* src/fleet/Besoegspanel.jsx
 * Klik på et servicebesøg åbner den her — udtrukket af Servicekalender.jsx
 * (Facility TARGET-restruktureringen, produktejer-review 2026-09-02), fordi
 * den nye Overblik-fane også skal kunne åbne "detaljer" på et servicebesøg,
 * ikke kun kalenderen. Samme begrundelse som Fleets Haendelsespanel.jsx
 * blev udtrukket af Vaerkstedskalender.jsx.
 *
 * ⚠ SAMME KOMPONENT, FLERE KALDERE. Havde hver skærm sin egen kopi, ville de
 * før eller siden vise hver sin version af "hvorfor er anlægget spærret" —
 * samme begrundelse som Gitterkalender.jsx og Sagsvisning.jsx ligger i
 * fleet/ og ikke i et modul.
 *
 * (Selve indholdet er UÆNDRET fra Servicekalender.jsx's version — kun
 * placeringen er ny. Se dens git-historik for den fulde begrundelse bag hver
 * linje: hvorfor den læser startMs/estimeretMin og ikke fra/til/sagsnummer,
 * hvorfor lvNavn er en parameter og ikke en modul-konst, osv.)
 */
import { useState } from "react";
import { datoTid, kr } from "./format.js";
import {
  Dialog, Faner, Fejl, MiniLinje, Pille,
} from "./ui.jsx";
import { reservationFraOpgave, OPGAVE_STATUS } from "./opgaver.js";
import { slutter } from "./driftskalender.js";
import Statusskifte from "./Statusskifte.jsx";
import Sagsvisning from "./Sagsvisning.jsx";
import { KILDE, prioritetFor, konfliktTekst } from "./reservations.js";

const BESOEG_FANER = [
  { key: "overblik", label: "Overblik" },
  { key: "sag", label: "Sag" },
];

export default function Besoegspanel({ besoeg, lvNavn, lokNavn, aktiver, maaSkrive, onLuk, onSkiftet }) {
  const [fane, setFane] = useState("overblik");
  const label = besoeg.aktivId
    ? aktiver.find((a) => a.id === besoeg.aktivId)?.navn || besoeg.aktivId
    : lokNavn(besoeg.lokationId) || besoeg.lokationId;

  let r = null, byggefejl = null;
  try { r = reservationFraOpgave(besoeg); } catch (e) { byggefejl = e.message; }
  const pri = prioritetFor(KILDE.facilitySag);
  const heleStedet = !besoeg.aktivId;
  const slut = slutter(besoeg);

  return (
    <Dialog
      variant="drawer"
      titel={besoeg.beskrivelse}
      under={[label, besoeg.leverandoerId ? lvNavn(besoeg.leverandoerId) : "eget personale"]
        .filter(Boolean).join(" · ")}
      handling={<Pille tone={OPGAVE_STATUS[besoeg.status]?.pill}>
        {OPGAVE_STATUS[besoeg.status]?.label}</Pille>}
      onLuk={onLuk}
    >
      <Faner faner={BESOEG_FANER} valgt={fane} saet={setFane} label="Servicebesøg" />

      {fane === "overblik" && (byggefejl ? <Fejl>{byggefejl}</Fejl> : (
        <>
          <MiniLinje label="Arbejde" vaerdi={besoeg.beskrivelse} />
          <MiniLinje
            label="Udføres af"
            vaerdi={besoeg.leverandoerId ? lvNavn(besoeg.leverandoerId) : "eget personale"}
          />
          <MiniLinje label="Fra" vaerdi={datoTid(besoeg.startMs)} />
          {/* ⚠ EN OPGAVE UDEN ESTIMAT HAR INGEN SLUTNING, og det er ikke det
              samme som at den slutter med det samme. Gitteret giver den et
              synligt minimum for at kunne tegne den; panelet siger sandheden. */}
          <MiniLinje
            label="Til"
            vaerdi={slut
              ? `${datoTid(slut)} (eksklusiv)`
              : <span className="fc-bad">intet estimat</span>}
          />

          <div style={{ borderTop: "1px solid var(--bc-line)", margin: "12px 0" }} />

          <MiniLinje label="Ressource" vaerdi={<code>{r.ressourceType}</code>} />
          <MiniLinje label="Ressource-id" vaerdi={<code>{r.ressourceId}</code>} />
          <MiniLinje label="Kilde" vaerdi={<code>{r.kilde.type}</code>} />
          <MiniLinje
            label="Prioritet"
            vaerdi={<><b>{pri}</b> — taber til værksted (40) og fravær (30), vinder over booking (10)</>}
          />
          {Number.isFinite(besoeg.beloebOere) && (
            <MiniLinje label="Beløb" vaerdi={kr(besoeg.beloebOere)} />
          )}

          {heleStedet && (
            <p className="fc-hint" style={{ marginTop: 12 }}>
              ⚠ Besøget har <b>intet anlæg</b> og spærrer derfor <b>hele lokationen</b>.
              Ressourcen er <code>lokation</code> og ikke <code>facilityAktiv</code> —
              lukker man hallen, er alle porte i den også optaget.
            </p>
          )}

          <p className="fc-hint" style={{ marginTop: 12, fontStyle: "italic" }}>
            {/* ⚠ REFERENCEN ER OPGAVENS id, IKKE ET SAGSNUMMER. Nummeret stod
                på demofilens poster; noden bærer det ikke, og `sager/` findes
                ikke i firebase.rules.json endnu (beslutning 20 er fase 0). Et
                nummer skrevet af på opgaven ville drive fra sagen. */}
            „{konfliktTekst(r, { kilde: { type: KILDE.facilitySag, reference: besoeg.id } })}“
          </p>
          <p className="fc-hint" style={{ marginTop: 12 }}>
            <b>Den fjerde kilde krævede ingen ny kode.</b> Et servicebesøg er en opgave
            med art <b>facility</b>, og <code>reservationFraOpgave()</code> giver
            allerede kilde <b>facilitySag</b>. Beslutning 4 er én node, fire kilder.
          </p>
          <div style={{ marginTop: 14 }}>
            <Statusskifte opgave={besoeg} maaSkrive={maaSkrive} onSkiftet={onSkiftet} />
          </div>
          <p className="fc-hint" style={{ marginTop: 10 }}>
            <b>Flyt</b> besøget ved at <b>trække blokken</b> i Servicekalenderen.
            Slippes den på en <b>lokationsrække</b>, spærrer den hele stedet i
            stedet for ét anlæg — og det er ikke en detalje, det er forskellen
            på at lukke en port og at lukke en hal.
          </p>
        </>
      ))}

      {/* ⚠ SKIVE 3C — DEN DELTE Sagsvisning, IKKE EN EGEN FACILITY-KOPI. Samme
          komponent som Fleet Driftskalenders Haendelsespanel bruger. */}
      {fane === "sag" && (
        <Sagsvisning
          sagId={besoeg.sagId || null}
          objektType="opgave"
          objektId={besoeg.id}
          art="facility"
          objektLabel={label}
          emneForslag={besoeg.beskrivelse}
          modpartNavnForslag={besoeg.leverandoerId ? lvNavn(besoeg.leverandoerId) : ""}
          onGenindlaes={onSkiftet}
        />
      )}
    </Dialog>
  );
}
