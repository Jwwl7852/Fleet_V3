/* src/fleet/Planlaegdialog.jsx
 * "Planlæg aktivitet" — formularen der opretter en driftsopgave.
 *
 * ⚠ DEN LÅ INDE I Vaerkstedskalender.jsx, OG SÅ SKULLE DISPONERING BRUGE DEN.
 *
 * Det er samme snit som Gitterkalenderen selv: to skærme der planlægger den
 * SAMME node med hver sin formular, ville være to steder at være uenige om
 * feltskemaet — og den ene ville før eller siden glemme at kalde
 * `valideOpgaveplan()`. Beslutning 12's fejl i en ny forklædning.
 *
 * Den ligger derfor i `fleet/` og ikke i et modul, af nøjagtig samme grund som
 * `Gitterkalender.jsx` og `Sagsvisning.jsx` gør det. Beslutning 49.
 *
 * ⚠ DEN SKRIVER GENNEM SERVEREN, IKKE GENNEM skriv.js.
 * `opgaveplanlaeg` skriver opgaven OG dens reservation i ÉN update().
 * `opgaver` og `reservationer` er begge `.write: false`, og de to skal lande
 * sammen eller slet ikke: en opgave uden sin reservation ser FRI ud i
 * disponeringen, hvilket er værre end en spærring man kan se. Dertil kan to
 * disponenter ramme samme sekund. Se fleet/opgaveplan.js og beslutning 45.
 *
 * ⚠ `foraf` ER ET FORSLAG, IKKE EN LÅS.
 * Gitteret kender bilen og tidsrummet der blev klikket på, og at skulle taste
 * dem igen ville gøre klikket til en omvej. Men felterne er stadig felter:
 * rammer man ved siden af, retter man i formularen frem for at fortryde og
 * klikke igen. Et forudfyldt felt man ikke kan rette, er en attrap med data i.
 *
 * ⚠ INGEN MAIL. Mockuppens "Send bekræftelse til leverandøren" er beslutning
 * 20, og den er fase 0: `sager/` står ikke i firebase.rules.json, og der er
 * hverken modtagevej eller afsendelse. En deaktiveret radiogruppe der sagde
 * "ikke bygget", ville være en attrap der opfører sig som en kontrol —
 * formularen skriver i stedet hvad der mangler.
 */
import { useState } from "react";
import { datoTid, isoTilMs, msTilIso } from "./format.js";
import { Dialog, Felt, Feltraekke, Formular } from "./ui.jsx";
import { OPGAVE_STATUS, ARBEJDSTYPE, ALLE_ARBEJDSTYPER } from "./opgaver.js";
import { PRIORITET, ALLE_PRIORITETER } from "./prioritet.js";
import {
  planlaegOpgave, valideOpgaveplan, PLANLAEGBAR_STATUS,
} from "./opgaveplan.js";



/* Fejlnøgle → etiket. ⚠ SAMME ORD SOM PÅ FELTET. Skrev opsummeringen
   "koeretoejId" hvor etiketten siger "Enhed", skulle brugeren oversætte vores
   feltnavne for at finde det felt der mangler. */
const FELTNAVN = {
  koeretoejId: "Enhed",
  arbejdstype: "Aktivitetstype",
  status: "Status",
  startMs: "Startdato og -tid",
  estimeretMin: "Varighed",
  leverandoerId: "Udføres af",
  prioritet: "Prioritet",
  beskrivelse: "Beskrivelse",
  art: "Art",
  _node: "Noden afviser posten",
};

/**
 * ⚠ DEN SKRIVER GENNEM SERVEREN, IKKE GENNEM skriv.js.
 *
 * `opgaver` ER skrivbar med `opgaver.skriv` — men opgaven og dens RESERVATION
 * skal skrives sammen eller slet ikke, og `reservationer` er `.write: false`
 * for alle. Landede kun opgaven, ville enheden have et værkstedsbesøg uden at
 * være spærret, og så ser den FRI ud i disponeringen — værre end en spærring
 * man kan se. Dertil kan to disponenter ramme samme sekund.
 *
 * Hele begrundelsen står i `fleet/opgaveplan.js` og i functions/index.js.
 *
 * ⚠ VALIDERINGEN ER SERVERENS EGEN. valideOpgaveplan() ligger i delt/ og
 * kaldes begge steder. Formularen svarer HURTIGT; serveren AFGØR — og de to
 * siger det samme, fordi det er den samme funktion.
 *
 * ⚠ INGEN MAIL-BLOK. Mockuppen har "Send bekræftelse til leverandøren?".
 * Beslutning 20 er fase 0: `sager/` står ikke i firebase.rules.json, og der
 * er ingen afsendelse. En deaktiveret radiogruppe der sagde "ikke bygget",
 * ville være en attrap der opfører sig som en kontrol. Skærmen skriver i
 * stedet hvad der mangler.
 */
export default function Planlaegdialog({
  enheder, leverandoerer, harProcure, onLuk, onGemt,
  /* Gitterets forslag: { koeretoejId, startMs, varighedMin }. Skive 3B
     udvidede den med tre felter fra en indberetning: { beskrivelse,
     prioritet, indberetningId }. Se hovedet — det er et forslag, ikke en
     lås; alle felter kan rettes i formularen. */
  foraf = null,
}) {
  /* Startforslag: i morgen kl. 08.00. ⚠ IKKE "nu" — en aktivitet man
     planlægger, ligger frem i tiden, og et defaultet nu ville lave en
     forsinket opgave i samme øjeblik den blev oprettet. */
  const iMorgen = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.getTime();
  };

  const [post, saetPost] = useState(() => {
    /* ⚠ KLOKKESLÆTTET TAGES AF DEN VALGTE START, ikke af `msTilIso`.
       `msTilIso` giver DATOEN; klokken skal læses for sig i lokal tid, ellers
       ville et klik på et hul kl. 13 blive til kl. 08 — og så havde klikket
       flyttet noget brugeren ikke bad om. */
    const start = Number.isFinite(foraf?.startMs) ? foraf.startMs : iMorgen();
    const d = new Date(start);
    const tt = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");

    return {
      koeretoejId: foraf?.koeretoejId || "",
      /* ⚠ HER BLEV DIVISIONEN FORESLÅET AF SHELLEN — fordi beslutning 19
         forbød feltet på bilen, og en formular der udledte det af enheden,
         ville have genindført koblingen. Argumentet holdt, og aksen holdt op
         med at findes i beslutning 70. Se 79. */
      arbejdstype: "",
      status: "planlagt",
      leverandoerId: "",
      /* Skive 3B: en indberetning kan have sat en prioritet ved triage. */
      prioritet: foraf?.prioritet || "",
      beskrivelse: foraf?.beskrivelse || "",
      startIso: msTilIso(start),
      startTid: `${tt}:${mm}`,
      /* ⚠ VARIGHEDEN FORESLÅS IKKE AF HULLETS LÆNGDE. Et ledigt vindue på syv
         timer betyder ikke at arbejdet tager syv timer — det betyder at der er
         plads. Et forudfyldt estimat ville være et gæt der ser ud som en
         beslutning, og estimatet er dét reservationen regnes af. */
      varighedMin: "",
    };
  });
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);
  /* ⚠ EN FEJL VISES FØRST NÅR FELTET ER RØRT — eller når man har trykket Gem.
     Uden det stod hele formularen rød i det øjeblik den blev åbnet, og en
     formular der skælder ud før man har skrevet noget, lærer man at overse.
     Samme greb som Reolpladser, Medarbejdere, Brugere og fire andre — se
     `vis()` dér. Det er repoets mønster, ikke et nyt. */
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);

  const saet = (felt) => (v) => {
    saetPost((p) => ({ ...p, [felt]: v }));
    saetRoert((r) => ({ ...r, [felt]: true }));
    /* Et svar hører til den post der blev sendt. Rører man et felt bagefter,
       beskriver svaret ikke længere det man har foran sig. */
    saetSvar(null);
  };

  /* ⚠ isoTilMs SÆTTER KLOKKEN 12, IKKE MIDNAT — se format.js. Klokkeslættet
     lægges på bagefter i lokal tid, så en dato der er valgt i en vælger, ikke
     bliver dagen før fordi et trin i kæden trak en time fra. */
  const startMs = (() => {
    const dag = isoTilMs(post.startIso);
    if (!Number.isFinite(dag)) return null;
    const [t, m] = String(post.startTid).split(":").map(Number);
    if (!Number.isFinite(t) || !Number.isFinite(m)) return null;
    const d = new Date(dag);
    d.setHours(t, m, 0, 0);
    return d.getTime();
  })();

  const udkast = {
    art: "vaerksted",
    koeretoejId: post.koeretoejId || null,
    arbejdstype: post.arbejdstype || null,
    status: post.status,
    beskrivelse: post.beskrivelse,
    startMs,
    estimeretMin: Number(post.varighedMin) || null,
    leverandoerId: post.leverandoerId || null,
    prioritet: post.prioritet || null,
    /* ⚠ SKIVE 3B — IKKE ET FELT I FORMULAREN. Koblingen er forslagets, ikke
       brugerens: rammer man ved siden af på enhed eller beskrivelse, retter
       man i formularen, men hvilken indberetning der udløste besøget, er
       ikke noget der skal kunne tastes forkert. */
    indberetningId: foraf?.indberetningId || undefined,
  };

  const kontrol = valideOpgaveplan(udkast, {
    enheder: enheder.map((k) => k.id),
    leverandoerer: leverandoerer.map((l) => l.id),
  });
  /* ⚠ `vis()` STYRER KUN OM FEJLEN TEGNES — IKKE OM DEN GÆLDER.
     `kanGemme` læser `kontrol.ok` uændret, så en urørt formular ikke kan
     sendes bare fordi den ser pæn ud. De to spørgsmål er forskellige, og de
     skal ikke svares af den samme variabel. */
  const vis = (fejlNoegle, ...roerteNoegler) => {
    /* ⚠ FEJLNØGLEN OG FELTNAVNET ER IKKE ALTID DET SAMME. Datoen hedder
       `startIso` i formularen, men fejlen hedder `startMs`; varigheden hedder
       `varighedMin`, fejlen `estimeretMin`. Uden det her led ville de to
       felter aldrig vise deres fejl — de blev aldrig "rørt" under det navn
       fejlen bar. */
    const noegler = roerteNoegler.length ? roerteNoegler : [fejlNoegle];
    return visAlle || noegler.some((k) => roert[k]) ? kontrol.fejl[fejlNoegle] : null;
  };

  /* ⚠ SLUTTIDSPUNKTET VISES, MEN GEMMES IKKE. Noden bærer startMs og
     estimeretMin; en gemt slutning ville være det samme udsagn to steder og
     drive første gang nogen rettede varigheden. */
  const slutMs = Number.isFinite(startMs) && Number(post.varighedMin) > 0
    ? startMs + Number(post.varighedMin) * 60000
    : null;

  const gem = async () => {
    /* ⚠ FØRST NU VISES DE FELTER MAN ALDRIG RØRTE. Trykker man Gem på en halv
       formular, skal man kunne se hvad der mangler — ikke bare at knappen er
       grå. `kanGemme` har allerede stoppet kaldet; det her er forklaringen. */
    saetVisAlle(true);
    if (!kontrol.ok) return;
    saetGemmer(true);
    saetSvar(null);
    const r = await planlaegOpgave(udkast);
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) onGemt();
  };

  const enhed = enheder.find((k) => k.id === post.koeretoejId) || null;

  return (
    <Dialog
      titel="Planlæg aktivitet"
      under="Opgaven og reservationen skrives sammen — eller slet ikke."
      onLuk={onLuk}
    >
      {/* ⚠ KNAPPEN ER AKTIV, OGSÅ NÅR FORMULAREN ER UGYLDIG — OG DET ER MED
          VILJE. Deaktiverede vi den, ville `saetVisAlle(true)` i gem() aldrig
          kunne kaldes: brugeren ville se en grå knap og INGEN forklaring på
          hvilke felter der manglede. Han har rørt otte af ti; de sidste to har
          han aldrig set en fejl på.

          ⚠ De syv andre formularer i repoet (Reolpladser, Medarbejdere,
          Brugere, Varer, Bevægelser, Indkøb, Udlån) har præcis den døde gren:
          de kalder saetVisAlle(true) i en funktion knappen forhindrer dem i at
          nå. Det er ikke rettet her — det er en selvstændig oprydning — men
          mønstret kopieres ikke videre.

          gem() afviser selv: den sætter visAlle og returnerer, hvis kontrollen
          ikke er ok. Der sendes altså aldrig noget ugyldigt afsted. */}
      <Formular onGem={gem} gemmer={gemmer}
                gemLabel="Planlæg aktivitet" onAnnuller={onLuk} svar={svar}>
        <Felt id="pl-enhed" label="Enhed" kraevet
              vaerdi={post.koeretoejId} saet={saet("koeretoejId")}
              fejl={vis("koeretoejId")}
              valgmuligheder={[
                { vaerdi: "", label: "Vælg enhed" },
                ...enheder
                  /* ⚠ EN SOLGT ELLER SKROTTET ENHED KAN IKKE FÅ EN OPGAVE.
                     Serveren afviser den, og en vælger der tilbød den, ville
                     love noget der bliver sagt nej til bagefter. */
                  .filter((k) => k.status !== "solgt" && k.status !== "skrottet")
                  .map((k) => ({ vaerdi: k.id, label: `${k.kaldenavn} — ${k.navn}` })),
              ]} />

        <Feltraekke>
          <Felt id="pl-type" label="Aktivitetstype" kraevet
                vaerdi={post.arbejdstype} saet={saet("arbejdstype")}
                fejl={vis("arbejdstype")}
                valgmuligheder={[
                  { vaerdi: "", label: "Vælg type" },
                  ...ALLE_ARBEJDSTYPER.map((t) => ({ vaerdi: t, label: ARBEJDSTYPE[t] })),
                ]} />
          <Felt id="pl-status" label="Status" kraevet
                vaerdi={post.status} saet={saet("status")}
                fejl={vis("status")}
                hint="Afventende, hvis arbejdet venter på en reservedel."
                valgmuligheder={PLANLAEGBAR_STATUS.map((v) => ({
                  vaerdi: v, label: OPGAVE_STATUS[v].label,
                }))} />
        </Feltraekke>

        {/* ⚠ HER STOD EN PÅKRÆVET "DIVISION"-VÆLGER, og den overlevede
            beslutning 70 med tre valgmuligheder til et felt reglerne AFVISER.

            ⚠ DET VAR VÆRRE END DØD KODE. Feltet var markeret `kraevet`, mens
            hverken valideringen eller skrivningen kendte det længere — så
            brugeren skulle udfylde noget der ingen steder blev læst, og som
            ville have fået skrivningen afvist hvis den var. En formular er
            det sted en beslutning bliver til noget nogen taster.

            Fjernet i beslutning 75. */}

        <Feltraekke>
          <Felt id="pl-dato" label="Startdato" type="date" kraevet
                vaerdi={post.startIso} saet={saet("startIso")}
                fejl={vis("startMs", "startIso", "startTid")} />
          <Felt id="pl-tid" label="Starttid" type="time" kraevet
                vaerdi={post.startTid} saet={saet("startTid")} />
          <Felt id="pl-varighed" label="Varighed" type="number" kraevet
                suffiks="min" min="1"
                vaerdi={post.varighedMin} saet={saet("varighedMin")}
                fejl={vis("estimeretMin", "varighedMin")}
                hint="Så længe er enheden spærret." />
        </Feltraekke>

        <Feltraekke>
          <Felt id="pl-lev" label="Udføres af"
                vaerdi={post.leverandoerId} saet={saet("leverandoerId")}
                fejl={vis("leverandoerId")}
                valgmuligheder={[
                  { vaerdi: "", label: "Eget værksted" },
                  ...leverandoerer
                    .filter((l) => l.kategori === "vaerksted" || l.kategori === "daek")
                    .map((l) => ({ vaerdi: l.id, label: l.navn })),
                ]}
                /* ⚠ SKIVE 3A — SAMME TO-TILSTANDS-HINT SOM Servicedialog.
                   Stod før som `undefined` når Procure var aktivt — ingen
                   hint overhovedet, hvor Servicedialogs altid sagde "Tom
                   betyder eget personale." To formularer for "udføres af"
                   der opførte sig forskelligt uden grund. */
                hint={harProcure
                  ? "Tom betyder eget værksted."
                  : "Kun eget værksted: leverandørkartoteket hører til Procure, som ikke er aktivt."} />
          <Felt id="pl-pri" label="Prioritet"
                vaerdi={post.prioritet} saet={saet("prioritet")}
                fejl={vis("prioritet")}
                /* ⚠ TOM ER ET SVAR. En opgave uden prioritet står som ikke
                   vurderet og tælles for sig — se prioritet.js. */
                hint="Tom betyder ikke vurderet — det er et svar."
                valgmuligheder={[
                  { vaerdi: "", label: "Ikke vurderet" },
                  ...ALLE_PRIORITETER.map((v) => ({ vaerdi: v, label: PRIORITET[v].label })),
                ]} />
        </Feltraekke>

        <Felt id="pl-besk" label="Beskrivelse" kraevet
              vaerdi={post.beskrivelse} saet={saet("beskrivelse")}
              fejl={vis("beskrivelse")}
              placeholder="Hvad skal der laves?" maxLength={500} />

        {enhed && slutMs && (
          <div className="fc-sum" style={{ marginTop: 4 }}>
            <span>{enhed.kaldenavn} er spærret</span>
            <span className="fc-sum-v">
              {datoTid(startMs)} – {datoTid(slutMs)}
            </span>
          </div>
        )}

        {visAlle && !kontrol.ok && (
          /* ⚠ NAVNGIVER FELTERNE, ikke bare "udfyld formularen". Fejlene står
             også ved hvert felt, men i en dialog med ti felter kan de to der
             mangler, ligge uden for det man kigger på. */
          <p className="fc-svar fc-svar-fejl" role="alert">
            Mangler: {Object.keys(kontrol.fejl).map((k) => FELTNAVN[k] || k).join(", ")}.
          </p>
        )}

        <p className="fc-hint" style={{ marginTop: 10 }}>
          Sluttidspunktet <b>beregnes</b> og gemmes ikke. Noden bærer
          {" "}<b>startMs</b> og <b>estimeretMin</b> — et gemt sluttidspunkt
          ville være det samme udsagn to steder og drive første gang nogen
          rettede varigheden.
        </p>

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>Der sendes ingen mail til leverandøren.</b> Mockuppens
          {" "}“Send bekræftelse” er beslutning 20, og den er fase 0:
          {" "}<b>sager/</b> står ikke i <b>firebase.rules.json</b>, og der er
          hverken modtagevej eller afsendelse. Aftalen laves stadig i telefonen
          eller i Outlook — men <b>sagsnummeret</b> kan ikke sættes herfra endnu.
        </p>

        <p className="fc-hint" style={{ marginTop: 10 }}>
          Er enheden allerede optaget, <b>afvises</b> planlægningen med
          {" "}<b>hvad</b> der spærrer. Et værkstedsbesøg har den højeste
          prioritet, men det rydder <b>ikke</b> selv en booking af vejen: turen
          skal flyttes eller annulleres først, så det kan forklares bagefter.
        </p>
      </Formular>
    </Dialog>
  );
}
