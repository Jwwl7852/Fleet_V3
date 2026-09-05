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
 * ⚠ HAN SKREV DIREKTE, INDTIL 2026-09-05. Noden VAR skrivbar med
 * permissionen alene for en NY post; ejerskabet håndhæves stadig i reglen
 * på `oprettetAf` for en REDIGERING. Men produktejerens triageflow kræver
 * at en sag med et ticketnummer oprettes ATOMISK sammen med en
 * driftshændelse — der ER nu en anden post der skal skrives i samme
 * åndedrag, præcis den situation `opgaver` allerede løser (beslutning 45).
 * `send()` kalder derfor `indberetningIndsend` (functions/index.js), som
 * opretter indberetningen og — kun for driftshændelser, se
 * `kraeverForloeb()` — sagen i én `update()`. Reglen afviser nu en ny post
 * uden om funktionen (`.write` kræver `data.exists()`).
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
import { kaldFunktion } from "../../firebase.js";
import { dato, kr, num, oereFraKroner, iDagIsoLokal } from "../../fleet/format.js";
import { Pille, Tom } from "../../fleet/ui.jsx";
import {
  APP_FLISER, HAENDELSE_ART, FELT, FORLOEB, harFelt, erUdgift, arterForFlise,
  forloebLabelFor,
} from "../../fleet/indberetninger.js";
import { DEMO_INDBERETNINGER } from "../../fleet/demo-indberetninger.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

/**
 * ⚠ FELTERNE SPØRGES AF KATALOGET, IKKE AF EN if-KÆDE I SKÆRMEN.
 * `felterFor()` siger hvad arten bærer; en formular der selv huskede hvilke
 * felter hver art har, ville være det andet sted svaret stod — og den ville
 * love felter noden ikke tager imod. Se `harFelt()`.
 */
/* ⚠ V1-BRUGERTEST "BRÆNDSTOFMATCH" — INTET "PRIS PR. LITER" HER MERE.
   Feltet er væk fra `felterFor("braendstof")` (indberetninger.js), så
   `PAA_TELEFON.filter(f => harFelt(art, f))` nedenfor viser det aldrig
   længere — chaufføren skal kun kunne taste noget der GØR matchet muligt
   (enhed, dato, liter), ikke noget der GÆTTER på fakturaens pris. */
const SPOERGSMAAL = {
  [FELT.kmStand]:         { label: "Kilometerstand", type: "number", enhed: "km" },
  [FELT.liter]:           { label: "Liter", type: "number", enhed: "l" },
  [FELT.adBlueLiter]:     { label: "AdBlue", type: "number", enhed: "l" },
  [FELT.skadeBeskrivelse]: { label: "Hvad skete der?", type: "tekst" },
  [FELT.modpart]:         { label: "Modpart", type: "tekst" },
};

/* De felter chaufføren kan udfylde på en telefon. Underskrift, materialer og
   tidsregistrering hører til et VÆRKSTEDSARBEJDE og udfyldes ikke i en
   lastbil — de står i `felterFor()`, og skærmen springer dem over. */
const PAA_TELEFON = Object.keys(SPOERGSMAAL);

export default function AppIndberetning() {
  const { bruger } = useFleet();
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
  /* ⚠ BESØGENE, SÅ KORTET KAN SIGE HVORNÅR. `opgaver` er en base-node —
     fire moduler skriver til den (beslutning 92) — så en chauffør må læse
     den. Vinduet er fremad OG bagud: et besøg der lige er overstået, er
     stadig svaret på hans melding. */
  const opgaveListe = useListe("opgaver", {
    ordnPaa: "startMs", vindue: "alle", graense: 500, demo: DEMO_OPGAVER,
  });
  const levListe = useListe("leverandoerer", {
    vindue: "alle", graense: 200, demo: DEMO_LEVERANDOERER,
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

  const enhedNavn = (id) => {
    const b = bilListe.data.find((x) => x.id === id);
    return b ? (b.kaldenavn || b.navn || id) : null;
  };
  /* ⚠ TOM LISTE → INTET NAVN, IKKE EN ANKLAGE. Har kunden ikke Procure,
     spørger useListe slet ikke (beslutning 94/95), og et "ukendt værksted"
     ville beskylde dataene for noget der er en modulmangel. */
  const vaerkstedNavn = (id) =>
    levListe.data.find((x) => x.id === id)?.navn || null;

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
    if (braendstofManglerFelt) return; // knappen er spærret, men send() kaldes kun herfra
    setFejl(null);

    /* ⚠ SERVEREN SÆTTER oprettetAf/oprettetMs/forloeb/id/sagId — en browser
       kan oplyse hvad som helst om hvem og hvornår. Se indberetningIndsend()
       i functions/index.js. */
    const payload = {
      art,
      ...(svar.koeretoejId ? { koeretoejId: svar.koeretoejId } : {}),
      ...(svar.beskrivelse?.trim() ? { beskrivelse: svar.beskrivelse.trim() } : {}),
      ...(Number.isFinite(svar.omkostningOere) ? { omkostningOere: svar.omkostningOere } : {}),
      /* ⚠ TANKNINGENS DATO, IKKE `oprettetMs`. Falder tilbage til samme
         standard som inputtet viste, hvis han aldrig rørte feltet — de to
         skal aldrig kunne komme ud af sync. */
      ...(art === "braendstof" ? { dato: svar.dato || iDagIsoLokal() } : {}),
    };
    for (const f of PAA_TELEFON) {
      if (!harFelt(art, f)) continue;
      const v = svar[f];
      if (v === undefined || v === null || v === "") continue;
      payload[f] = v;
    }

    setGemmer(true);
    try {
      const r = await kaldFunktion("indberetningIndsend", payload);
      setGemmer(false);
      /* ⚠ TICKETNUMMERET I KVITTERINGEN. Kun driftshændelser får en sag —
         se funktionens eget hoved — så r.data.sagsnummer er null for en
         udgiftsregistrering, og teksten siger det uden et ticketnummer. */
      const sagsnummer = r.data?.sagsnummer;
      setKvittering(sagsnummer
        ? `${HAENDELSE_ART[art].label} sendt — sag ${sagsnummer}`
        : `${HAENDELSE_ART[art].label} sendt`);
      fortryd();
      /* ⚠ LISTEN HENTES IGEN. `useListe` er et `once()`-opslag — den ser
         ikke en skrivning der lige er sket, og "Indberettet" stod tom under
         en kvittering der sagde "sendt". Fundet ved at sende en rigtig
         parkeringsbillet gennem appen: posten LÅ i basen, med rigtigt beløb
         og uden `forloeb`. En kvittering der modsiges af listen ved siden
         af, er værre end ingen kvittering. */
      mine.genindlaes();
      setFane("liste");
    } catch (e) {
      setGemmer(false);
      /* ⚠ EN AFVIST SKRIVNING ER IKKE EN NETVÆRKSFEJL. Funktionen svarer med
         en forklaring i e.message; "prøv igen" ville lære ham at systemet
         er i stykker. */
      setFejl(e?.message || "Indberetningen kunne ikke sendes.");
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

  /* ⚠ TILLÆGSKRAV "BRÆNDSTOFMATCH" §8/§23 — SAMME TRE FELTER SOM MATCHET.
     Datoen falder altid tilbage til `iDagIsoLokal()` (se dato-inputtets
     `value` ovenfor), så den tæller aldrig som manglende her. */
  const braendstofManglerFelt = art === "braendstof"
    && (!svar.koeretoejId || !(Number(svar.liter) > 0));

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
          <h2 className="fc-app-titel">Indberettet</h2>
          <p className="fc-hint">
            Dine indberetninger og hvornår driften har planlagt dem.
          </p>
          {egne.length === 0 ? (
            <Tom>Du har ikke indberettet noget endnu.</Tom>
          ) : (
            <ol className="fc-app-dage">
              {egne.map((i) => {
                /* ⚠ BESØGET SLÅS OP PÅ INDBERETNINGEN, IKKE OMVENDT. Feltet
                   kom til i beslutning 109: opgaven peger tilbage på den
                   melding der udløste den. Uden det kunne skærmen ikke svare
                   på hvornår driften havde planlagt hans melding — og det er
                   dét linjen lover. */
                const besoeg = opgaveListe.data.find((o) => o.indberetningId === i.id);
                return (
                  <li key={i.id} className="fc-app-indb">
                    <div className="fc-app-indb-top">
                      <b>
                        {HAENDELSE_ART[i.art]?.label || i.art}
                        {enhedNavn(i.koeretoejId) && ` · ${enhedNavn(i.koeretoejId)}`}
                      </b>
                      {/* ⚠ KUN DRIFTSHÆNDELSER HAR EN TILSTAND AT VISE. En
                          pille på en tankning ville påstå at nogen skal gøre
                          noget ved den. */}
                      {!erUdgift(i.art) && i.forloeb && (
                        <Pille tone={FORLOEB[i.forloeb]?.pill}>
                          {forloebLabelFor(i.forloeb, true)}
                        </Pille>
                      )}
                      {erUdgift(i.art) && Number.isFinite(i.omkostningOere) && (
                        <span className="fc-hint">{kr(i.omkostningOere, 2)}</span>
                      )}
                    </div>

                    {i.beskrivelse && (
                      <p className="fc-hint">{i.beskrivelse}</p>
                    )}

                    {/* ⚠ DATOEN ER BESØGETS, IKKE INDBERETNINGENS. Kortet
                        svarer på hvornår bilen skal ind — ikke på hvornår han
                        skrev. Er der intet besøg, står der ingenting: en
                        tekst som "ikke planlagt endnu" ville sige det samme
                        som pillen lige ovenfor. */}
                    {besoeg && Number.isFinite(besoeg.startMs) && (
                      <p className="fc-app-besoeg">
                        📅 {dato(besoeg.startMs)}
                        {/* ⚠ NAVNET PÅ VÆRKSTEDET SER HAN OFTE IKKE, og det er
                            beslutning 104: `leverandoerer` kræver
                            `indkoeb.laes`, som en chauffør ikke har — hvem vi
                            handler med og på hvilke vilkår er en kommerciel
                            oplysning.

                            ⚠ MEN STEDET MÅ HAN SE, og det skal han: han er
                            den der kører bilen derhen. `sted` står på opgaven
                            selv. Uden faldbakken stod der en dato og intet
                            andet — og en dato uden et sted er ikke en besked
                            man kan handle på. */}
                        {vaerkstedNavn(besoeg.leverandoerId)
                          ? ` · 🔧 ${vaerkstedNavn(besoeg.leverandoerId)}`
                          : besoeg.sted ? ` · 📍 ${besoeg.sted}` : ""}
                      </p>
                    )}
                  </li>
                );
              })}
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

          {/* ⚠ V1-BRUGERTEST "BRÆNDSTOFMATCH" — DATOEN ER TANKNINGENS, IKKE
              OPRETTELSENS. `oprettetMs` sættes stadig automatisk til nu (det
              er "hvornår han skrev", ikke "hvornår han tankede") — men en
              tankning registreres ofte senere, og matchmotoren skal kunne
              stole på DENNE dato, ikke på hvornår telefonen havde dækning.
              Foreslås som i dag (`iDagIsoLokal()` — ikke `iDagIso()`, se
              dens egen note i format.js), men kan ændres. Kun braendstof:
              §2 i tillægskravet scoper det dertil, ingen anden art har
              endnu et krav om det. */}
          {art === "braendstof" && (
            <label className="fc-app-felt">
              <span>Dato</span>
              <input className="fc-ctl" type="date"
                value={svar.dato || iDagIsoLokal()}
                onChange={(e) => saet("dato", e.target.value || undefined)} />
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

          {/* ⚠ ENHED + DATO + LITER ER OBLIGATORISKE FOR BRÆNDSTOF — det er
              præcis de tre felter matchet bygger på (tillægskrav §8), og
              reglen håndhæver det samme krav server-side (se rules.json's
              `.validate` for indberetninger). Datoen mangler aldrig reelt
              (inputtet viser altid mindst dagens dato), men koeretoejId og
              liter kan sagtens stå tomme, og en afvist skrivning uden en
              forklaring HER ville bare vise fejlteksten fra serveren efter
              et klik i stedet for før. */}
          {braendstofManglerFelt && (
            <p className="fc-hint">Vælg enhed og indtast liter for at kunne registrere tankningen.</p>
          )}

          <div className="fc-app-knapper">
            <button type="button" className="fc-btn fc-btn-primaer fc-app-knap"
              disabled={gemmer || braendstofManglerFelt} onClick={send}>
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
