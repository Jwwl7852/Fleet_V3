/* src/moduler/facility/Servicedialog.jsx
 * "Planlæg service" — formularen der opretter en facility-opgave.
 *
 * ⚠ DEN LIGGER I MODULET, IKKE I `fleet/` — OG DET ER IKKE INKONSEKVENT.
 * `Planlaegdialog.jsx` flyttede til `fleet/` fordi TO skærme planlægger
 * værkstedsopgaver (Driftskalenderen og Disponering), og to formularer til én
 * node ville være to steder at være uenige om feltskemaet. Servicebesøget har
 * ÉN skærm. Får det en anden, flytter filen med — men en fil der flyttes til
 * fælleseje før den har to ejere, er en foregribelse, ikke en beskyttelse.
 *
 * ⚠ DEN ER IKKE EN KOPI AF Planlaegdialog. Feltskemaet er et ANDET
 * (beslutning 21): ingen enhed, ingen arbejdstype, og ressourcen er enten et
 * anlæg eller en hel lokation. Det de deler — valideringen og sætningerne —
 * deles i `opgaveplan-regler.js`, hvor `tidsfelter()` allerede står ét sted
 * for begge arter.
 *
 * ⚠ ENTEN-ELLER ER BYGGET IND I VÆLGEREN. Ressourcen er ÉT felt med værdier
 * som `aktiv:fa-port3` og `lok:lok-halb`, ikke to felter man kunne udfylde
 * begge. Anlæggets lokation står på anlægget; en opgave der bar begge, ville
 * reservere anlægget og lade lokationen stå som en påstand ingen læser. Fem af
 * de ni facility-opgaver i demo-sættet bar begge felter.
 *
 * ⚠ INGEN MAIL. Samme som Planlaegdialog: beslutning 20 er fase 0.
 *
 * ⚠ SKIVE 3A — "UDFØRES AF" HARMONISERET MED Planlaegdialog, KUN VISNINGEN.
 * Feltskemaet er stadig sit eget (se ovenfor).
 *
 * ⚠ SKIVE 4B — `harProcure`-HINTEN ER VÆK. Leverandørkartoteket er ikke
 * længere Procures eget (Model B, `04_DATA_AND_PERMISSION_IMPACT.md` §28) —
 * `leverandoerer` læses uafhængigt af om Procure-modulet er aktivt, så et
 * hint der forklarede en tom liste med "hører til Procure" ville nu være
 * usandt. Prop'en `harProcure` er derfor fjernet fra denne skærm.
 */
import { useState } from "react";
import { datoTid, isoTilMs, msTilIso } from "../../fleet/format.js";
import { Dialog, Felt, Feltraekke, Formular } from "../../fleet/ui.jsx";
import { OPGAVE_STATUS } from "../../fleet/opgaver.js";
import { PRIORITET, ALLE_PRIORITETER } from "../../fleet/prioritet.js";
import { AKTIV_ART, AKTIV_STATUS } from "../../fleet/facility.js";
import {
  planlaegFacilityopgave, valideFacilityopgave, PLANLAEGBAR_STATUS,
} from "../../fleet/opgaveplan.js";

/* Fejlnøgle → etiket. ⚠ SAMME ORD SOM PÅ FELTET — ellers skal brugeren
   oversætte vores feltnavne for at finde det felt der mangler. */
const FELTNAVN = {
  aktivId: "Anlæg eller lokation",
  lokationId: "Lokation",
  status: "Status",
  startMs: "Startdato og -tid",
  estimeretMin: "Varighed",
  leverandoerId: "Udføres af",
  prioritet: "Prioritet",
  beskrivelse: "Beskrivelse",
  arbejdstype: "Arbejdstype",
  art: "Art",
  _node: "Noden afviser posten",
};

/* Ressourcen som ÉN værdi. Se hovedet: enten-eller er bygget ind i formen,
   ikke pålagt bagefter af en validering. */
const vaerdiFor = (post) =>
  post.aktivId ? `aktiv:${post.aktivId}` : post.lokationId ? `lok:${post.lokationId}` : "";

const delOp = (v) => {
  const [slags, id] = String(v || "").split(":");
  if (slags === "aktiv" && id) return { aktivId: id, lokationId: "" };
  if (slags === "lok" && id) return { aktivId: "", lokationId: id };
  return { aktivId: "", lokationId: "" };
};

export default function Servicedialog({
  aktiver, lokationer, leverandoerer, onLuk, onGemt,
  /* Gitterets forslag: { aktivId | lokationId, startMs }. Et FORSLAG, ikke en
     lås — rammer man ved siden af, retter man i formularen. Se Planlaegdialog. */
  foraf = null,
}) {
  /* Startforslag: i morgen kl. 08.00. ⚠ IKKE "nu" — et besøg man planlægger,
     ligger frem i tiden, og et defaultet nu ville lave et forsinket besøg i
     samme øjeblik det blev oprettet. */
  const iMorgen = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.getTime();
  };

  const [post, saetPost] = useState(() => {
    const start = Number.isFinite(foraf?.startMs) ? foraf.startMs : iMorgen();
    const d = new Date(start);
    const tt = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");

    return {
      ressource: vaerdiFor(foraf || {}),
      /* ⚠ `faelles` ER FORSLAGET, IKKE EN LÅS. Anlæggene er de samme uanset
         hvem der kører gennem porten, og skærmen reagerer ikke på Gods/Bus.
         Men opgaven bærer hvem der BETALER, og det er ikke altid fælles:
         eftersynet af busladestanderne i Aalborg står som `bus`. */
      status: "planlagt",
      leverandoerId: "",
      prioritet: "",
      beskrivelse: "",
      startIso: msTilIso(start),
      startTid: `${tt}:${mm}`,
      /* ⚠ VARIGHEDEN FORESLÅS IKKE AF HULLETS LÆNGDE — et ledigt vindue på syv
         timer betyder at der er plads, ikke at arbejdet tager syv timer. */
      varighedMin: "",
    };
  });
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);

  const saet = (felt) => (v) => {
    saetPost((p) => ({ ...p, [felt]: v }));
    saetRoert((r) => ({ ...r, [felt]: true }));
    saetSvar(null);
  };

  /* ⚠ isoTilMs SÆTTER KLOKKEN 12, IKKE MIDNAT — se format.js. Klokkeslættet
     lægges på bagefter i lokal tid, så en dato valgt i en vælger ikke bliver
     dagen før fordi et trin i kæden trak en time fra. */
  const startMs = (() => {
    const dag = isoTilMs(post.startIso);
    if (!Number.isFinite(dag)) return null;
    const [t, m] = String(post.startTid).split(":").map(Number);
    if (!Number.isFinite(t) || !Number.isFinite(m)) return null;
    const d = new Date(dag);
    d.setHours(t, m, 0, 0);
    return d.getTime();
  })();

  const valgtRessource = delOp(post.ressource);

  const udkast = {
    art: "facility",
    aktivId: valgtRessource.aktivId || null,
    lokationId: valgtRessource.lokationId || null,
    status: post.status,
    beskrivelse: post.beskrivelse,
    startMs,
    estimeretMin: Number(post.varighedMin) || null,
    leverandoerId: post.leverandoerId || null,
    prioritet: post.prioritet || null,
  };

  const kontrol = valideFacilityopgave(udkast, {
    aktiver: aktiver.map((a) => a.id),
    lokationer: lokationer.map((l) => l.id),
    leverandoerer: leverandoerer.map((l) => l.id),
  });

  /* ⚠ FEJLNØGLEN OG FELTNAVNET ER IKKE DET SAMME — fjerde gang det led
     mangler et sted. Ressourcen hedder `ressource` i formularen, men fejlen
     hedder `aktivId`; datoen hedder `startIso`, fejlen `startMs`. Uden det
     ekstra led ville de felter aldrig vise deres fejl. Se Planlaegdialog. */
  const vis = (fejlNoegle, ...roerteNoegler) => {
    const noegler = roerteNoegler.length ? roerteNoegler : [fejlNoegle];
    return visAlle || noegler.some((k) => roert[k]) ? kontrol.fejl[fejlNoegle] : null;
  };

  /* ⚠ SLUTTIDSPUNKTET VISES, MEN GEMMES IKKE. Noden bærer startMs og
     estimeretMin; en gemt slutning ville være samme udsagn to steder. */
  const slutMs = Number.isFinite(startMs) && Number(post.varighedMin) > 0
    ? startMs + Number(post.varighedMin) * 60000
    : null;

  const gem = async () => {
    saetVisAlle(true);
    if (!kontrol.ok) return;
    saetGemmer(true);
    saetSvar(null);
    const r = await planlaegFacilityopgave(udkast);
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) onGemt();
  };

  const lokNavn = (id) => lokationer.find((l) => l.id === id)?.navn || id;
  const heleStedet = Boolean(valgtRessource.lokationId);
  const valgtNavn = valgtRessource.aktivId
    ? aktiver.find((a) => a.id === valgtRessource.aktivId)?.navn
    : valgtRessource.lokationId ? lokNavn(valgtRessource.lokationId) : null;

  return (
    <Dialog
      titel="Planlæg service"
      under="Besøget og reservationen skrives sammen — eller slet ikke."
      onLuk={onLuk}
    >
      <Formular onGem={gem} gemmer={gemmer}
                gemLabel="Planlæg service" onAnnuller={onLuk} svar={svar}>
        {/* ⚠ ÉT FELT, IKKE TO. Anlæg og lokation er hinandens alternativ, og
            en formular med to vælgere ville tillade at udfylde begge — se
            hovedet. Lokationerne står nederst, fordi de spærrer MEST. */}
        <Felt id="sv-res" label="Anlæg eller lokation" kraevet
              vaerdi={post.ressource} saet={saet("ressource")}
              fejl={vis("aktivId", "ressource")}
              hint="Vælges en lokation, spærres HELE stedet — også portene i hallen."
              valgmuligheder={[
                { vaerdi: "", label: "Vælg anlæg eller lokation" },
                ...aktiver.map((a) => ({
                  vaerdi: `aktiv:${a.id}`,
                  /* ⚠ STATUS MED I ETIKETTEN, IKKE SOM ET FILTER. Et anlæg der
                     er i stykker, er præcis det man bestiller service på —
                     modsat en solgt bil, som serveren afviser. */
                  label: `${a.navn} — ${AKTIV_ART[a.art]?.label || a.art}, `
                    + `${lokNavn(a.lokationId)} · ${AKTIV_STATUS[a.status]?.label || a.status}`,
                })),
                ...lokationer.map((l) => ({
                  vaerdi: `lok:${l.id}`, label: `${l.navn} — hele lokationen`,
                })),
              ]} />

        <Feltraekke>
          <Felt id="sv-status" label="Status" kraevet
                vaerdi={post.status} saet={saet("status")}
                fejl={vis("status")}
                hint="Afventende, hvis arbejdet venter på en reservedel."
                valgmuligheder={PLANLAEGBAR_STATUS.map((v) => ({
                  vaerdi: v, label: OPGAVE_STATUS[v].label,
                }))} />
          {/* ⚠ HER STOD ET PÅKRÆVET Division-FELT, og det gjorde vejen ind
              LUKKET I BEGGE RETNINGER: `opgaver`-reglen har
              `"division": { ".validate": false }` siden beslutning 70, så en
              valgt værdi blev AFVIST af serveren — og uden en værdi klagede
              formularen. Et krævet felt der ikke kan udfyldes rigtigt, er
              ikke en validering; det er en blindgyde.

              Noten sagde "reglerne kræver den". Det gjorde de, indtil 70.
              En kommentar der beskriver en regel der er væk, holder feltet
              i live. Se beslutning 87. */}
        </Feltraekke>

        <Feltraekke>
          <Felt id="sv-dato" label="Startdato" type="date" kraevet
                vaerdi={post.startIso} saet={saet("startIso")}
                fejl={vis("startMs", "startIso", "startTid")} />
          <Felt id="sv-tid" label="Starttid" type="time" kraevet
                vaerdi={post.startTid} saet={saet("startTid")} />
          <Felt id="sv-varighed" label="Varighed" type="number" kraevet
                suffiks="min" min="1"
                vaerdi={post.varighedMin} saet={saet("varighedMin")}
                fejl={vis("estimeretMin", "varighedMin")}
                hint="Så længe er anlægget spærret." />
        </Feltraekke>

        <Feltraekke>
          <Felt id="sv-lev" label="Udføres af"
                vaerdi={post.leverandoerId} saet={saet("leverandoerId")}
                fejl={vis("leverandoerId")}
                valgmuligheder={[
                  { vaerdi: "", label: "Eget personale" },
                  /* ⚠ KUN KATEGORIEN `facility`. Kartoteket har seks
                     kategorier, og en portleverandør og en dækmand er ikke
                     hinandens alternativer. Samme greb som Planlaegdialog, der
                     filtrerer på `vaerksted` og `daek`. Alle fem
                     facility-leverandører i sættet bærer kategorien.
                     ⚠ SKIVE 4B — INAKTIVE KAN IKKE VÆLGES TIL NYT, men den
                     allerede valgte bliver stående (se samme greb i
                     Planlaegdialog). */
                  ...leverandoerer
                    .filter((l) => l.kategori === "facility")
                    .filter((l) => l.aktiv !== false || l.id === post.leverandoerId)
                    .map((l) => ({ vaerdi: l.id, label: l.navn })),
                ]}
                /* ⚠ SKIVE 4B — INGEN TO-TILSTANDS-HINT LÆNGERE. Kartoteket
                   var Procures eget indtil nu; hinten der sagde det, er ikke
                   længere sand — `leverandoerer` er fælles masterdata, læst
                   uafhængigt af om Procure-modulet er aktivt. */
                hint="Tom betyder eget personale." />
          <Felt id="sv-pri" label="Prioritet"
                vaerdi={post.prioritet} saet={saet("prioritet")}
                fejl={vis("prioritet")}
                hint="Tom betyder ikke vurderet — det er et svar."
                valgmuligheder={[
                  { vaerdi: "", label: "Ikke vurderet" },
                  ...ALLE_PRIORITETER.map((v) => ({ vaerdi: v, label: PRIORITET[v].label })),
                ]} />
        </Feltraekke>

        <Felt id="sv-besk" label="Beskrivelse" kraevet
              vaerdi={post.beskrivelse} saet={saet("beskrivelse")}
              fejl={vis("beskrivelse")}
              placeholder="Hvad skal der laves?" maxLength={500} />

        {/* ⚠ INGEN ARBEJDSTYPE-VÆLGER. Arten HAR ikke feltet (ART_FELTER), og
            ordlisten er værkstedets — den deles med Procures omkostningstype.
            En vælger her ville skrive et felt posten ikke må bære. */}

        {valgtNavn && slutMs && (
          <div className="fc-sum" style={{ marginTop: 4 }}>
            <span>{valgtNavn} er spærret</span>
            <span className="fc-sum-v">{datoTid(startMs)} – {datoTid(slutMs)}</span>
          </div>
        )}

        {heleStedet && (
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ Besøget har <b>intet anlæg</b> og spærrer derfor <b>hele lokationen</b>.
            Ressourcen bliver <code>lokation</code> og ikke <code>facilityAktiv</code> —
            lukker man hallen, er alle porte i den også optaget.
          </p>
        )}

        {visAlle && !kontrol.ok && (
          <p className="fc-svar fc-svar-fejl" role="alert">
            Mangler: {Object.keys(kontrol.fejl).map((k) => FELTNAVN[k] || k).join(", ")}.
          </p>
        )}
      </Formular>
    </Dialog>
  );
}
