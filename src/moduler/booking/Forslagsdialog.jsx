/* src/moduler/booking/Forslagsdialog.jsx
 * "Foreslå tur" — formularen der skriver et forslag på en etape.
 *
 * ⚠ DEN LIGGER I MODULET, IKKE I `fleet/`. Ét sted foreslår: Disponering, hvor
 * turen kan SES. Får den en anden, flytter filen med — men en fil der flyttes
 * til fælleseje før den har to ejere, er en foregribelse. Samme afvejning som
 * `Servicedialog.jsx`.
 *
 * ⚠ ET FORSLAG ER IKKE EN RESERVATION. Det siger hvem og hvad der KUNNE køre
 * turen; først når koordinatoren godkender, bindes ressourcerne. Derfor kan
 * der ligge tre ad gangen, og derfor spærrer de ingenting.
 *
 * ⚠ OG DISPONENTEN MÅ IKKE GODKENDE SIT EGET — beslutning 5. Det er hele
 * grunden til at forslaget og godkendelsen er to skridt med hver sin
 * permission: `booking.foreslaa` her, `booking.godkend` i Forslag.
 *
 * ⚠ EN SÆTTEVOGN ER TO ENHEDER. Feltet er en LISTE, ikke ét valg: en trailer
 * kan ikke køre alene, og `kanDisponeres()` afviser den uden en trækkende
 * enhed. Et forslag der kun kunne pege på trækkeren, ville foreslå noget
 * serveren siger nej til.
 */
import { useState } from "react";
import { datoTid, isoTilMs, msTilIso, oereFraKroner, kr } from "../../fleet/format.js";
import { Dialog, Felt, Feltraekke, Formular, Knap } from "../../fleet/ui.jsx";
import { valideForslag, MAKS_FORSLAG, forslagListe } from "../../fleet/booking-state.js";
import { skrivForslag } from "../../fleet/disponer.js";

/* Fejlnøgle → etiket. ⚠ SAMME ORD SOM PÅ FELTET. */
const FELTNAVN = {
  koeretoejIder: "Enheder",
  personId: "Chauffør",
  afhentningMs: "Afhentning",
  leveringMs: "Levering",
  transitTimer: "Transittid",
  estimatOere: "Estimat",
  note: "Note",
  tilstand: "Etapens tilstand",
  _antal: "Antal forslag",
};

/** Dato + klokkeslæt → ms. ⚠ `isoTilMs` giver klokken 12, ikke midnat —
 *  klokkeslættet lægges på bagefter i lokal tid. Se format.js. */
const tilMs = (iso, tid) => {
  const dag = isoTilMs(iso);
  if (!Number.isFinite(dag)) return null;
  const [t, m] = String(tid).split(":").map(Number);
  if (!Number.isFinite(t) || !Number.isFinite(m)) return null;
  const d = new Date(dag);
  d.setHours(t, m, 0, 0);
  return d.getTime();
};

const klokkeslet = (ms, fald) => {
  if (!Number.isFinite(ms)) return fald;
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function Forslagsdialog({ etape, biler, personale, onLuk, onGemt }) {
  const [f, saetF] = useState(() => ({
    /* ⚠ ENHEDERNE ER TOMME FRA START. Etapen bærer måske allerede
       `koeretoejIder` fra et tidligere forløb, men et forslag er et NYT bud —
       et forudfyldt valg ville blive godkendt uden at blive læst. */
    koeretoejIder: [],
    personId: "",
    /* Etapens eget vindue er forslaget: kunden har ønsket afhentning, og
       disponenten flytter den hvis turen kræver det. */
    afhentIso: msTilIso(etape.fra ?? Date.now()),
    afhentTid: klokkeslet(etape.fra, "08:00"),
    leverIso: msTilIso(etape.senestMs ?? etape.til ?? etape.fra ?? Date.now()),
    leverTid: klokkeslet(etape.senestMs ?? etape.til, "16:00"),
    transitTimer: "",
    estimat: "",
    note: "",
  }));
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((r) => ({ ...r, [felt]: true }));
    saetSvar(null);
  };

  /* ⚠ EN SÆTTEVOGN ER TO. Enhederne slås til og fra hver for sig — et
     multiselect ville skjule at det er et VALG at tage traileren med. */
  const skiftEnhed = (id) => {
    saetF((x) => ({
      ...x,
      koeretoejIder: x.koeretoejIder.includes(id)
        ? x.koeretoejIder.filter((k) => k !== id)
        : [...x.koeretoejIder, id],
    }));
    saetRoert((r) => ({ ...r, koeretoejIder: true }));
    saetSvar(null);
  };

  const afhentningMs = tilMs(f.afhentIso, f.afhentTid);
  const leveringMs = tilMs(f.leverIso, f.leverTid);

  const udkast = {
    koeretoejIder: Object.fromEntries(f.koeretoejIder.map((id) => [id, true])),
    personId: f.personId || null,
    afhentningMs,
    leveringMs,
    transitTimer: Number(f.transitTimer) || null,
    estimatOere: oereFraKroner(f.estimat),
    note: f.note,
  };

  /* ⚠ SERVERENS EGEN VALIDERING. `valideForslag()` ligger i `booking-state.js`,
     som er delt, og `forslagskriv` kalder præcis den samme. */
  const kontrol = valideForslag(udkast, etape, {
    biler: biler.map((b) => b.id),
    personale: personale.map((p) => p.id),
  });

  const vis = (noegle, ...roerte) => {
    const n = roerte.length ? roerte : [noegle];
    return visAlle || n.some((k) => roert[k]) ? kontrol.fejl[noegle] : null;
  };

  const gem = async () => {
    saetVisAlle(true);
    if (!kontrol.ok) return;
    saetGemmer(true);
    saetSvar(null);
    const r = await skrivForslag({
      etapeId: etape.id,
      koeretoejIder: f.koeretoejIder,
      personId: udkast.personId,
      afhentningMs, leveringMs,
      transitTimer: udkast.transitTimer ?? undefined,
      estimatOere: udkast.estimatOere ?? undefined,
      note: f.note.trim() || undefined,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) onGemt?.(r.data);
  };

  const findes = forslagListe(etape).length;

  return (
    <Dialog
      titel="Foreslå tur"
      under={`Etape nr. ${etape.nr ?? "?"} · ${etape.fraSted} → ${etape.tilSted} · ${findes} af ${MAKS_FORSLAG} forslag`}
      onLuk={onLuk}
    >
      <Formular onGem={gem} gemmer={gemmer}
                gemLabel="Gem forslag" onAnnuller={onLuk} svar={svar}>
        {/* ⚠ ENHEDERNE ER KNAPPER, IKKE ET DROPDOWN. En sættevogn er to, og
            en liste hvor man skal holde Ctrl nede for at tage traileren med,
            er en prøve i finmotorik — samme grund som hele rækken vælger i
            Forslag-tabellen. */}
        <div className="fc-felt">
          <label>Enheder *</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {biler
              /* En solgt eller skrottet enhed kan ikke disponeres — serveren
                 afviser den, og et valg der tilbød den, ville love noget der
                 bliver sagt nej til bagefter. */
              .filter((b) => b.status !== "solgt" && b.status !== "skrottet")
              .map((b) => (
                <Knap key={b.id}
                      variant={f.koeretoejIder.includes(b.id) ? "primaer" : "sekundaer"}
                      onClick={() => skiftEnhed(b.id)}>
                  {b.kaldenavn || b.navn}
                </Knap>
              ))}
          </div>
          {vis("koeretoejIder") && (
            <p className="fc-fejl" role="alert">{vis("koeretoejIder")}</p>
          )}
          <p className="fc-hint">
            En <b>sættevogn er to</b> — trækker plus trailer. En trailer alene
            afvises af <code>kanDisponeres()</code>.
          </p>
        </div>

        <Felt id="fd-person" label="Chauffør" kraevet
              vaerdi={f.personId} saet={saet("personId")}
              fejl={vis("personId")}
              valgmuligheder={[
                { vaerdi: "", label: "Vælg chauffør" },
                ...personale
                  .filter((p) => p.aktiv !== false)
                  .map((p) => ({ vaerdi: p.id, label: p.navn })),
              ]}
              hint="Kompetencer og køre-hviletid prøves på serveren — med det samme, ikke først hos koordinatoren." />

        <Feltraekke>
          <Felt id="fd-afh-dato" label="Afhentning" type="date" kraevet
                vaerdi={f.afhentIso} saet={saet("afhentIso")}
                fejl={vis("afhentningMs", "afhentIso", "afhentTid")} />
          <Felt id="fd-afh-tid" label="Kl." type="time" kraevet
                vaerdi={f.afhentTid} saet={saet("afhentTid")} />
          <Felt id="fd-lev-dato" label="Levering" type="date" kraevet
                vaerdi={f.leverIso} saet={saet("leverIso")}
                fejl={vis("leveringMs", "leverIso", "leverTid")} />
          <Felt id="fd-lev-tid" label="Kl." type="time" kraevet
                vaerdi={f.leverTid} saet={saet("leverTid")} />
        </Feltraekke>

        <Feltraekke>
          {/* ⚠ TRANSITTIDEN ER KØRSEL, IKKE VINDUET. En tur til Paris løber
              over 40 timer, og chaufføren sover undervejs. Køre-hviletiden
              regner på KØRSEL — samme skel som etapens `koerselMin`. */}
          <Felt id="fd-transit" label="Transittid" type="number" suffiks="t" min="1"
                vaerdi={f.transitTimer} saet={saet("transitTimer")}
                fejl={vis("transitTimer")}
                hint="Timer i kørsel — ikke hele vinduet." />
          <Felt id="fd-estimat" label="Estimat" suffiks="kr." inputMode="decimal"
                vaerdi={f.estimat} saet={saet("estimat")}
                fejl={vis("estimatOere")}
                hint="Ekskl. moms. Gemmes i hele ører." />
        </Feltraekke>

        <Felt id="fd-note" label="Note"
              vaerdi={f.note} saet={saet("note")}
              fejl={vis("note")}
              placeholder="Fx: billigere, men leverer en halv dag senere"
              maxLength={300} />

        {Number.isFinite(afhentningMs) && Number.isFinite(leveringMs)
          && leveringMs > afhentningMs && (
          <div className="fc-sum" style={{ marginTop: 4 }}>
            <span>Vinduet</span>
            <span className="fc-sum-v">{datoTid(afhentningMs)} – {datoTid(leveringMs)}</span>
          </div>
        )}
        {Number.isFinite(udkast.estimatOere) && (
          <div className="fc-sum">
            <span>Estimat</span>
            <span className="fc-sum-v">{kr(udkast.estimatOere)} ekskl. moms</span>
          </div>
        )}

        {visAlle && !kontrol.ok && (
          <p className="fc-svar fc-svar-fejl" role="alert">
            Mangler: {Object.keys(kontrol.fejl).map((k) => FELTNAVN[k] || k).join(", ")}.
          </p>
        )}

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ Et forslag <b>spærrer ingenting</b>. Reservationen skrives først når
          koordinatoren godkender — og det må <b>du ikke selv</b> (beslutning 5).
          Send forslagene videre fra <b>Bookingoversigten</b>, når du er færdig.
        </p>
      </Formular>
    </Dialog>
  );
}
