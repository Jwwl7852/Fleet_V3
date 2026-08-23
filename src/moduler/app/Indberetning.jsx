/* src/moduler/app/Indberetning.jsx
 * Chaufførens indberetning fra vejen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ DEN ENESTE SKRIVNING HAN HAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * En chauffør har seks permissions, og `indberetninger.skriv` er den eneste
 * der ikke er en læsning. Den har været der siden rollerne blev sat — og der
 * fandtes ingen vej til den fra en telefon. Han kunne skrive; der var bare
 * ingen knap.
 *
 * ⚠ HAN SKRIVER DIREKTE, IKKE GENNEM EN FUNKTION. Noden er skrivbar med
 * permissionen, og ejerskabet håndhæves i reglen på `oprettetAf` — han kan
 * rette sin egen tankning og ikke kollegaens. Der er ingen anden post der
 * skal skrives i samme åndedrag, og derfor ingen grund til at lukke vejen
 * (modsat `opgaver`, hvor reservationen skal med — beslutning 45).
 *
 * ⚠ OTTE FLISER, TI ARTER. `Skade` spørger ét spørgsmål mere, fordi en
 * enhedsskade og en godsskade har hvert sit feltskema og begge er sensitive.
 * Gættede vi, ville halvdelen af godsskaderne stå som enhedsskader — og det
 * opdages først når forsikringen spørger. Se APP_FLISER.
 *
 * ⚠ OG EN UDGIFT FÅR INTET FORLØB. En parkeringsbillet er et beløb og en
 * dato; en revnet rude bevæger sig gennem seks tilstande. Reglen kræver
 * `forloeb` af netop de arter der har et. Se beslutning 106.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit-regler.js";
import { dato, kr, num, oereFraKroner } from "../../fleet/format.js";
import { Pille, Tom } from "../../fleet/ui.jsx";
import {
  APP_FLISER, HAENDELSE_ART, FELT, harFelt, erUdgift, arterForFlise,
} from "../../fleet/indberetninger.js";
import { DEMO_INDBERETNINGER } from "../../fleet/demo-indberetninger.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";

/**
 * ⚠ FELTERNE SPØRGES AF KATALOGET, IKKE AF EN if-KÆDE I SKÆRMEN.
 * `felterFor()` siger hvad arten bærer; en formular der selv huskede hvilke
 * felter hver art har, ville være det andet sted svaret stod — og den ville
 * love felter noden ikke tager imod. Se `harFelt()`.
 */
const SPOERGSMAAL = {
  [FELT.kmStand]:         { label: "Kilometerstand", type: "number", enhed: "km" },
  [FELT.liter]:           { label: "Liter", type: "number", enhed: "l" },
  [FELT.adBlueLiter]:     { label: "AdBlue", type: "number", enhed: "l" },
  [FELT.prisPrLiterOere]: { label: "Pris pr. liter", type: "number", enhed: "kr", oere: true },
  [FELT.skadeBeskrivelse]: { label: "Hvad skete der?", type: "tekst" },
  [FELT.modpart]:         { label: "Modpart", type: "tekst" },
};

/* De felter chaufføren kan udfylde på en telefon. Underskrift, materialer og
   tidsregistrering hører til et VÆRKSTEDSARBEJDE og udfyldes ikke i en
   lastbil — de står i `felterFor()`, og skærmen springer dem over. */
const PAA_TELEFON = Object.keys(SPOERGSMAAL);

export default function AppIndberetning() {
  const { path: sti, bruger } = useFleet();
  const [fane, setFane] = useState("ny");
  const [flise, setFlise] = useState(null);
  const [art, setArt] = useState(null);
  const [svar, setSvar] = useState({});
  const [gemmer, setGemmer] = useState(false);
  const [kvittering, setKvittering] = useState(null);
  const [fejl, setFejl] = useState(null);

  const bilListe = useListe("koeretoejer", {
    vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
  });
  const mine = useListe("indberetninger", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 200,
    demo: DEMO_INDBERETNINGER,
  });

  /* ⚠ KUN HANS EGNE. Reglen lader ham LÆSE hele noden — den er gated på
     modulet, ikke på ejerskabet — men "Indberettet" er hans kvitteringsliste,
     ikke kontorets arbejdsliste. Kollegaens tankninger hører ikke der. */
  const egne = mine.data
    .filter((i) => i.oprettetAf === bruger?.uid)
    .sort((a, b) => (b.oprettetMs || 0) - (a.oprettetMs || 0));

  function vaelgFlise(f) {
    setFejl(null); setKvittering(null); setSvar({});
    setFlise(f.key);
    const arter = arterForFlise(f.key);
    /* Én art → direkte til formularen. To → skærmen spørger. */
    setArt(arter.length === 1 ? arter[0] : null);
  }

  function fortryd() {
    setFlise(null); setArt(null); setSvar({}); setFejl(null);
  }

  async function send() {
    setFejl(null);
    const id = nyId("ind");
    const nu = Date.now();

    /* ⚠ FORLØBET SÆTTES KUN HVOR DET BETYDER NOGET. Reglen kræver feltet af
       driftshændelser og afviser det ikke på udgifter — men et "Ny" på en
       parkeringsbillet ville stå i en tilstandsmaskine den aldrig kommer
       igennem, og kontorets arbejdsliste ville fyldes med bilag. */
    const post = {
      art,
      oprettetAf: bruger?.uid || null,
      oprettetMs: nu,
      ...(erUdgift(art) ? {} : { forloeb: "ny" }),
      ...(svar.koeretoejId ? { koeretoejId: svar.koeretoejId } : {}),
      ...(svar.beskrivelse?.trim() ? { beskrivelse: svar.beskrivelse.trim() } : {}),
      ...(Number.isFinite(svar.omkostningOere) ? { omkostningOere: svar.omkostningOere } : {}),
    };
    for (const f of PAA_TELEFON) {
      if (!harFelt(art, f)) continue;
      const v = svar[f];
      if (v === undefined || v === null || v === "") continue;
      post[f] = v;
    }

    setGemmer(true);
    const r = await gem({
      sti: sti(`indberetninger/${id}`),
      data: post,
      objekt: "indberetninger",
      objektId: id,
      handling: AUDIT.opret,
      note: `${HAENDELSE_ART[art].label} fra chaufførappen`,
    });
    setGemmer(false);

    if (r.ok) {
      setKvittering(`${HAENDELSE_ART[art].label} sendt`);
      fortryd();
      /* ⚠ LISTEN HENTES IGEN. `useListe` er et `once()`-opslag — den ser
         ikke en skrivning der lige er sket, og "Indberettet" stod tom under
         en kvittering der sagde "sendt". Fundet ved at sende en rigtig
         parkeringsbillet gennem appen: posten LÅ i basen, med rigtigt beløb
         og uden `forloeb`. En kvittering der modsiges af listen ved siden
         af, er værre end ingen kvittering. */
      mine.genindlaes();
      setFane("liste");
    } else {
      /* ⚠ EN AFVIST SKRIVNING ER IKKE EN NETVÆRKSFEJL. `skriv.js` svarer med
         en forklaring; "prøv igen" ville lære ham at systemet er i stykker. */
      setFejl(r.besked);
    }
  }

  /* ---- Tal og tekst ---------------------------------------------------- */

  const saet = (felt, v) => setSvar((s) => ({ ...s, [felt]: v }));
  /**
   * ⚠ ØREOMREGNINGEN ER format.js', IKKE MIN EGEN.
   *
   * Jeg skrev først `Math.round(Number(v.replace(",", ".")) * 100)` her.
   * `oereFraKroner()` har stået i `format.js` siden beslutning 2 og kan to
   * ting mere: den fjerner tusindtalsseparatoren (`"1.250,00"` blev til
   * **NaN** i min), og den runder af, fordi `84,20 * 100` er
   * 8419.999999999999 i flydende komma — en øre der mangler, og som først
   * opdages i en afstemning hvor ingen kan forklare den.
   *
   * En kopi nummer to af et regnestykke er den fejl der har kostet mest i
   * det her repo.
   */
  const antal = (v) => {
    const n = Number(String(v).replace(/[\s.]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className="fc-app-tur">
      <p>
        <Link to="/app" className="fc-app-tilbage">← Forside</Link>
        <b className="fc-app-sidetitel">Indberetning</b>
      </p>

      {kvittering && <p className="fc-app-kvittering">{kvittering}</p>}
      {fejl && <p className="fc-app-fejl">{fejl}</p>}

      <div className="fc-app-faner">
        <button type="button"
          className={fane === "ny" ? "fc-btn fc-btn-primaer fc-app-knap" : "fc-btn fc-app-knap"}
          onClick={() => setFane("ny")}>+ Ny</button>
        <button type="button"
          className={fane === "liste" ? "fc-btn fc-btn-primaer fc-app-knap" : "fc-btn fc-app-knap"}
          onClick={() => setFane("liste")}>📋 Indberettet</button>
      </div>

      {fane === "liste" ? (
        <section className="fc-app-kort">
          {egne.length === 0 ? (
            <Tom>Du har ikke indberettet noget endnu.</Tom>
          ) : (
            <ol className="fc-app-tidslinje">
              {egne.map((i) => (
                <li key={i.id}>
                  <span className="fc-app-tid">{dato(i.oprettetMs)}</span>
                  <span>{HAENDELSE_ART[i.art]?.label || i.art}</span>
                  {/* ⚠ KUN DRIFTSHÆNDELSER HAR EN TILSTAND AT VISE. En pille
                      på en tankning ville påstå at nogen skal gøre noget. */}
                  {!erUdgift(i.art) && i.forloeb && (
                    <Pille tone="info">{i.forloeb}</Pille>
                  )}
                  {Number.isFinite(i.omkostningOere) && (
                    <span className="fc-hint">{kr(i.omkostningOere, 2)}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : !flise ? (
        <section className="fc-app-kort">
          <h2 className="fc-app-titel">Hvad vil du indberette?</h2>
          <div className="fc-app-fliser">
            {APP_FLISER.map((f) => (
              <button key={f.key} type="button" className="fc-app-flise"
                onClick={() => vaelgFlise(f)}>
                <span className="fc-app-ikon" aria-hidden="true">{f.ikon}</span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : !art ? (
        <section className="fc-app-kort">
          {/* ⚠ INTET FORVALG. Et der stod på forhånd, ville blive stående hos
              den der har travlt — og de to arter er ikke udskiftelige. */}
          <h2 className="fc-app-titel">Hvad blev beskadiget?</h2>
          <div className="fc-app-knapper">
            {arterForFlise(flise).map((a) => (
              <button key={a} type="button" className="fc-btn fc-app-knap"
                onClick={() => setArt(a)}>{HAENDELSE_ART[a].label}</button>
            ))}
          </div>
          <button type="button" className="fc-btn fc-app-knap" onClick={fortryd}>
            Fortryd
          </button>
        </section>
      ) : (
        <section className="fc-app-kort">
          <h2 className="fc-app-titel">{HAENDELSE_ART[art].label}</h2>

          {/* ⚠ BILEN SPØRGES KUN NÅR ARTEN HÆNGER PÅ EN. En godsskade sidder
              på godset, ikke på bilen — `paaKoeretoej` er kataloget svar. */}
          {HAENDELSE_ART[art].paaKoeretoej && (
            <label className="fc-app-felt">
              <span>Enhed</span>
              <select className="fc-ctl" value={svar.koeretoejId || ""}
                onChange={(e) => saet("koeretoejId", e.target.value || undefined)}>
                <option value="">Vælg …</option>
                {bilListe.data.map((b) => (
                  <option key={b.id} value={b.id}>{b.kaldenavn || b.navn || b.id}</option>
                ))}
              </select>
            </label>
          )}

          {PAA_TELEFON.filter((f) => harFelt(art, f)).map((f) => {
            const s = SPOERGSMAAL[f];
            return (
              <label key={f} className="fc-app-felt">
                <span>{s.label}{s.enhed ? ` (${s.enhed})` : ""}</span>
                {s.type === "tekst" ? (
                  <textarea className="fc-ctl" rows={3} value={svar[f] || ""}
                    onChange={(e) => saet(f, e.target.value)} />
                ) : (
                  <input className="fc-ctl" type="text" inputMode="decimal"
                    value={svar[`${f}_raa`] ?? ""}
                    onChange={(e) => {
                      const raa = e.target.value;
                      setSvar((v) => ({
                        ...v,
                        [`${f}_raa`]: raa,
                        /* ⚠ ØRE SOM INTEGER, og omregningen er format.js'.
                           Et beløb er penge; et antal liter er ikke. */
                        [f]: s.oere ? (oereFraKroner(raa) ?? undefined)
                          : (antal(raa) ?? undefined),
                      }));
                    }} />
                )}
              </label>
            );
          })}

          {/* ⚠ BELØBET ER UDGIFTENS ENESTE TAL, og det står i `omkostningOere`
              — feltet noden allerede bar. Et `beloebOere` ved siden af ville
              være det samme tal to steder. */}
          {erUdgift(art) && art !== "braendstof" && (
            <label className="fc-app-felt">
              <span>Beløb (kr, ekskl. moms)</span>
              <input className="fc-ctl" type="text" inputMode="decimal"
                value={svar.beloeb_raa ?? ""}
                onChange={(e) => {
                  setSvar((v) => ({
                    ...v,
                    beloeb_raa: e.target.value,
                    omkostningOere: oereFraKroner(e.target.value) ?? undefined,
                  }));
                }} />
            </label>
          )}

          <label className="fc-app-felt">
            <span>Beskrivelse{art === "andet" ? "" : " (valgfri)"}</span>
            <textarea className="fc-ctl" rows={3} value={svar.beskrivelse || ""}
              onChange={(e) => saet("beskrivelse", e.target.value)} />
          </label>

          <div className="fc-app-knapper">
            <button type="button" className="fc-btn fc-btn-primaer fc-app-knap"
              disabled={gemmer} onClick={send}>
              {gemmer ? "Sender …" : "Send"}
            </button>
            <button type="button" className="fc-btn fc-app-knap" onClick={fortryd}>
              Fortryd
            </button>
          </div>
        </section>
      )}

      <p className="fc-hint fc-app-fod">
        Kontoret ser indberetningen med det samme. {num(egne.length)} sendt.
      </p>
    </div>
  );
}
