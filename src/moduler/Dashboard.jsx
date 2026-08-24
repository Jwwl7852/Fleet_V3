/* src/moduler/Dashboard.jsx
 * REFERENCEMODUL. Sådan ser et modul ud i v3.
 *
 * Læg mærke til hvad der IKKE er her: ingen sidebar, ingen tenant-vælger,
 * ingen periodevælger, ingen egen Firebase-init, ingen egne farver, ingen
 * håndskrevne afvigelsesstrenge, ingen egne nøgletal.
 *
 * Alle tal på Dashboard er de SAMME felter som modulerne selv læser. Derfor
 * kan Dashboard ikke længere sige "3 servicepunkter forfalder" mens Facility
 * siger 18 — det var tilfældet i mockupsene.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useKpi } from "../fleet/useKpi.js";
import { useFleet } from "../fleet/FleetContext.jsx";
/* ⚠ MODUL bruges til NAVNET på et modul. Et eget map her ville være det
   andet sted et modul hedder noget — og så ville Dashboardet kunne sige
   "Indkøb" hvor sidebaren siger "Procure". Se moduler.js. */
import { harModul, MODUL } from "../fleet/moduler.js";
/* ⚠ KATALOGET LIGGER UDEN FOR SKÆRMEN, så feltstierne kan prøves mod
   demo-kpi.js. Et kort der peger på et felt der ikke findes, ville skrive
   INTET (—) i tavshed — og "—" ligner et ubesvaret nøgletal frem for en
   tastefejl i en sti. Se dashboards.js. */
import {
  SAMLET, MODULKORT, kortTal, handlinger, tilgaengelige,
} from "../fleet/dashboards.js";
/* ⚠ LAYOUTET ER BRUGERENS EGEN PRÆFERENCE OM SIG SELV — til forskel fra
   dashboardvisning, som er en ADMINISTRATORS beslutning om en ANDEN bruger.
   Derfor skrives det herfra gennem skriv.js’ ene vej ind (og ikke af en
   Cloud Function), og reglen er auth.uid === $uid. Se widgets.js. */
import {
  widget, tilgaengeligeWidgets, standardlayout, layoutFor, valideLayout,
} from "../fleet/widgets.js";
import { gem } from "../fleet/skriv.js";
/* ⚠ EN VISNING, IKKE EN ADGANG — se dashboardvisning.js. Indstillingen
   skjuler et dashboard i vælgeren; den spærrer ikke tallene, som ligger i en
   kpi-node enhver i tenanten kan læse. */
import { synligeDashboards } from "../fleet/dashboardvisning.js";
/* ⚠ SKIVE 2C — SAMME "VISNING, IKKE ADGANG"-SKEL, TREDJE LAG. navvisning
   skjuler et arbejdsområde en administrator har slået fra for DENNE
   bruger — samme regel som dashboardvisning, blot admin-styret i stedet
   for selvvalgt. Se navvisning.js's hoved for "OG, ikke ELLER"-garantien. */
import { erSkjultVedNavvisning } from "../fleet/navvisning.js";
import { usePost } from "../fleet/usePost.js";
import { PRIORITET } from "../fleet/prioritet.js";
import { omkostningsserie, maanedsEtiketter } from "../fleet/demo-oekonomi.js";
import { kr, num, pct, deviation, deviationPct, INTET } from "../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Pille, Henter, Datatilstand, MiniLinje, Gitter, Donut, Soejlegraf, Tom, Fordelingsbjaelke, Ikon, Handlingsliste, Knap, Formularsvar, Kpiadgang } from "../fleet/ui.jsx";

/* Fordelingen af opgaver på tilstand. Felterne findes i kpi/ — de tælles ikke
   ud af en hentet liste, for en liste er et udsnit i en periode og ikke en
   total (beslutning 6). Rækkefølgen er forløbets, ikke størrelsens: farven
   følger tilstanden, så den ikke skifter når tallene gør.
   'aabne' er IKKE summen af de fem — den tæller de uafsluttede. Totalen
   udregnes derfor af delene. */
const STATUSFORDELING = (k) => [
  { navn: "Indberettet", antal: k.opgaver.indberettet },
  { navn: "Planlagt", antal: k.opgaver.planlagt },
  { navn: "I gang", antal: k.opgaver.igang },
  { navn: "Afventer", antal: k.opgaver.afventer },
  { navn: "Udført", antal: k.opgaver.udfoert },
];

/* ⚠ KATALOGET FOR "KRÆVER HANDLING" LÅ HER SOM EN LOKAL const.
   Det gør det ikke længere: Arbejdskøen og modulkortene skal vise de SAMME
   tal, og et katalog i en JSX-fil kan ikke prøves mod kpi/. Det står nu i
   fleet/dashboards.js sammen med modulkortene, og en prøve holder hver
   eneste feltsti op mod demo-kpi.js.

   ⚠ OG LISTEN ER IKKE LÆNGERE FAST. Før stod fem rækker med hver sit tal,
   uanset om tallet var 0 — "0 fakturaer til godkendelse" er ikke en
   handling, det er fraværet af en. handlinger() svarer kun med de rækker
   der faktisk kræver noget, og et UBESVARET felt giver ingen række: null
   er ikke nul, og en handling på et tal ingen har regnet, er en påstand. */
/**
 * Et beløb — eller INTET hvis det ikke er regnet.
 *
 * ⚠ kr() SKELNER IKKE MELLEM NUL OG UBESVARET, og det er en beslutning:
 * `kr(0)` er "0 kr." og et rigtigt beløb, så kun kalderen kan vide om nul er
 * et svar. Her er det ikke — og uden den her gate stod Dashboardet med
 * "0 kr." i driftsomkostninger for en base hvor tallet aldrig var regnet.
 *
 * ⚠ DEN BLEV FØRST SYNLIG DA kpi/ HOLDT OP MED AT VÆRE SEEDET. Så længe
 * provisioneringen skrev DEMO_KPI, havde hvert felt en værdi, og forskellen
 * mellem "nul" og "ikke regnet" fandtes ikke på skærmen.
 */
const beloebEllerIntet = (oere, dec) =>
  (Number.isFinite(oere) ? kr(oere, dec) : INTET);

export default function Dashboard() {
  const { kpi: k, henter, tilstand, genindlaes, utilgaengelige } = useKpi();
  const { moduler, bruger, path: sti } = useFleet();
  const [params, saetParams] = useSearchParams();
  /* ⚠ KUN DE MODULER KUNDEN HAR. Samme svar som sidebarens — to
     forskellige svar på "hvad må jeg se" ville være to steder at være
     uenige. Billede 3's afkrydsning pr. bruger kommer i sin egen etape
     sammen med rollemodellen. */
  const harKundenModul = (m) => harModul(moduler, m);
  /* ⚠ BRUGERENS EGEN INDSTILLING, sat af en administrator. Findes den
     ikke, ser han alt det kunden har købt — præcis som før. Det er dét
     der gør ændringen sikker at udrulle: ingen mister en visning af at
     funktionen kommer. */
  const visning = usePost("dashboardvisning", bruger?.uid || null);
  /* ⚠ SKIVE 2C — TREDJE LAG, ADMINENS navvisning. Samme "spørg ikke før
     brugeren er kendt"-greb som dashboardvisning/brugerlayout ovenfor:
     `bruger?.uid || null` betyder ingen forespørgsel før login. */
  const navvisning = usePost("navvisning", bruger?.uid || null);

  /* ⚠ DASHBOARD-NØGLEN OG KPI-DOMÆNET HEDDER IKKE DET SAMME FOR PLANNING.
     `utilgaengelige` (fra useKpi) er nøglet på KPI-DOMÆNET — "disponering"
     — mens DASHBOARDS/dashboardvisning/navvisning alle bruger MODULETS
     navn — "booking" — som resten af skærmen. Det er den samme forskel
     kpi-aggregering.js selv navngiver: "disponering hører til booking;
     domænet er opkaldt efter skærmen, modulet efter forretningen." Uden
     oversættelsen ville `utilgaengelige["booking"]` altid være undefined,
     og en spærret Planning-forespørgsel ville se tilgængelig ud. */
  const KPI_DOMAENE_FOR_DASHBOARD = { booking: "disponering" };
  const kanSeDashboard = (noegle) =>
    !utilgaengelige[KPI_DOMAENE_FOR_DASHBOARD[noegle] || noegle];

  /* ⚠ .post, IKKE .data. usePost returnerer { post, henter, fejl, tilstand };
     useListe returnerer { data }. Skrev man .data her, ville den vaere
     undefined, synligeDashboards() ville falde tilbage paa "alt", og
     indstillingen ville ALDRIG virke — mens skaermen saa helt rigtig ud. */
  /* ⚠ OG DASHBOARDS HVIS TAL ER SPÆRRET, TILBYDES IKKE — beslutning 105.
     Vælgeren bød en chauffør "Procure", og siden var en side af streger. Det
     er samme figur som `kraeverPerm` i menuen: det tilbudte skal svare til
     det læsbare, og reglen håndhæver uændret.
     ⚠ OG NAVVISNING ER FOLDET IND I DEN SAMME kanSeFn — beslutning-agtig
     valg, ikke en tilfældighed: `synligeDashboards()` kalder ALDRIG
     `kanSeFn` for et `altid: true`-punkt (Samlet), så Samlet kan af samme
     grund heller ikke skjules af navvisning — den er den sikre fallback,
     præcis som Dashboard-punktet i sidebaren ikke kan skjules af den. Et
     senere lag kan derfor kun REDUCERE hvad et tidligere lag tillod: hver
     eneste betingelse her er et "OG", aldrig et "ELLER". */
  const ALLE = synligeDashboards(visning.post, harKundenModul,
    (noegle) => kanSeDashboard(noegle) && !erSkjultVedNavvisning(noegle, navvisning.post));
  void tilgaengelige;

  /* ⚠ SKIVE 2C — 1 MODUL LANDER DIREKTE, 2+ FÅR EN VÆLGER, 0 FALDER TILBAGE
     TIL SAMLET. "Driftsmodul" er ALLE minus Samlet — Kunder, Fakturaer &
     bilag, Økonomi, Opsætning og Hjælp er slet ikke i DASHBOARDS og tæller
     derfor aldrig med her, uden at det kræver et eget filter. */
  const driftsmoduler = ALLE.filter((d) => d.key !== SAMLET);
  const visVaelger = driftsmoduler.length >= 2;
  /* Præcis ét synligt driftsmodul: det ER forsiden, og Samlet tilbydes
     ikke som et kunstigt ekstra valg (se visVaelger ovenfor, som skjuler
     selve vælgeren — standardMaal styrer kun hvor man LANDER). Nul eller
     to-plus: Samlet, som altid findes (`altid: true`). */
  const standardMaal = driftsmoduler.length === 1 ? driftsmoduler[0].key : SAMLET;

  /* ⚠ ET LAYOUT PR. DASHBOARD. Fleet-forsiden og det samlede overblik er to
     forskellige sider med hvert sit formål; ét fælles layout ville betyde at
     man ikke kunne have begge — og så ville vælgeren ovenfor kun skifte
     overskrift. Noden er brugerlayout/<uid>/<dashboard>. */
  const layout = usePost("brugerlayout", bruger?.uid || null);
  /* ⚠ UDKASTET ER SIT EGET. Rettede vi direkte i det gemte, ville
     "Annullér" ikke kunne bringe noget tilbage — og en fortrydelse der
     ikke fortryder, er værre end ingen. */
  const [redigerer, saetRedigerer] = useState(false);
  const [udkast, saetUdkast] = useState(null);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);
  /* ⚠ SKIVE 2C — "EKSTRA NØGLETAL" ER LUKKET SOM STANDARD, men
     `redigerer` tvinger den åben (se JSX'et) — man skal kunne se det man
     retter. `onToggle` synker tilstanden begge veje, så et klik på selve
     <summary> ikke driver fra det React tror den ved. */
  const [ekstraAaben, saetEkstraAaben] = useState(false);

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Datatilstand tilstand={tilstand} genprov={genindlaes} tom="Nøgletallene kunne ikke hentes." />;

  /* Afledte tal BEREGNES her — de skrives ikke ind i basen to steder.
     Det er derfor kapacitetsgraden ikke længere kan være 84 % på Dashboard
     og 83 % i Bemanding.

     ⚠ KAPACITETSGRADEN STOD HER OG ER FLYTTET TIL dashboards.js.
     Modulkortet regner den nu med kapacitetsgrad(), og regnestykket lå to
     steder i det øjeblik kortet blev bygget af et katalog. Gaten fulgte med:
     `null / 58 * 100` er 0 og ikke null, og 0 % kapacitet ligner en måling
     af en flåde der står stille. */
  const budgetAfvPct = deviationPct(k.oekonomi.driftsomkostningerOere, k.oekonomi.budgetOere);

  /* Seks måneder, ikke tolv: kortet er en tredjedel bredt, og tolv søjler
     dér bliver til striber. Serien og etiketterne kommer fra demo-oekonomi,
     så Dashboard og Økonomi viser de SAMME måneder og de samme tal — lå
     regnestykket to steder, kunne de vise hver sit.
     Sidste punkt er det aktuelle tal fra kpi/, som på Økonomi. */
  /* ⚠ INDKØBSPRISAFVIGELSEN OG LEVERANCE TIL TIDEN STOD PÅ PROCURE-KORTET
     OG ER IKKE MED LÆNGERE. Modulkortene bærer TRE tal hver, som i
     mockuppen — et kort med fem linjer kan ikke skimmes, og det var derfor
     de blev lavet om. De to tal er ikke tabt: de står på Procure selv, hvor
     fortegnskonventionen fra beslutning 3 også hører hjemme.

     Skal de tilbage, hører de i MODULKORT i dashboards.js — ikke som et
     fjerde felt hardkodet her. */

  const { historik } = omkostningsserie();
  const serie = [...historik, k.oekonomi.driftsomkostningerOere].slice(-6);
  const maanedsPunkter = maanedsEtiketter(6).map((m, i) => ({
    label: m, vaerdier: [serie[i]]
  }));

  /* ⚠ VALGET STÅR I URL'EN, ikke i en useState. Et dashboard man har
     indstillet, skal overleve en genindlæsning og kunne sendes til en
     kollega — og "kig på Fleet-dashboardet" er ubrugeligt uden et link.
     Samme greb som Arbejdskøens ?vis=.
     ⚠ OG DET ER DEN SAMME LISTE, ALLE, DER AFGØR BÅDE VALGMULIGHEDERNE OG
     GYLDIGHEDEN — SKIVE 2C's forespørgsels-sikkerhed. `?db=flaade` prøves
     mod `ALLE`, som allerede har været igennem alle fire lag; et
     manipuleret `?db=` på et modul der ikke er købt, ikke kan læses, er
     skjult via navvisning eller skjult via dashboardvisning, kan derfor
     aldrig matche — og falder tilbage til `standardMaal`, aldrig til en
     hvid skærm. */
  const valgt = ALLE.some((d) => d.key === params.get("db")) ? params.get("db") : standardMaal;

  /* ⚠ HANDLINGERNE ER DE SAMME TAL SOM KORTENE — samme katalog, samme
     opslag i kpi/. Kom de fra hver sin kilde, kunne listen sige 7 og
     Fleet-kortet 6 på den SAMME skærm. Se dashboards.js.
     ⚠ OG HØJST SEKS I DEN PRIMÆRE SEKTION — SKIVE 2C. Samlet skal være
     handlingsorienteret, ikke en væg af kort; en liste der voksede med
     antal moduler, ville før eller siden gøre det modsatte. Loftet er
     IKKE stille: er der flere, siger en linje under listen hvor mange der
     er skåret væk, i stedet for at lade dem forsvinde usagt. */
  const alleHandlinger = handlinger(k, { harModulFn: harKundenModul })
    .filter((h) => valgt === SAMLET || h.modul === valgt);
  const HANDLING_LOFT = 6;
  const handler = alleHandlinger.slice(0, HANDLING_LOFT);
  const skaaretHandlinger = alleHandlinger.length - handler.length;

  /* Samlet viser alle modulkort; et modul-dashboard viser sit eget. */
  const kortNoegler = (valgt === SAMLET
    ? ALLE.filter((d) => d.key !== SAMLET).map((d) => d.key)
    : [valgt]).filter((m) => MODULKORT[m]);

  /* ⚠ layoutFor() SKELNER MELLEM null OG []. Et layout der ALDRIG er gemt,
     får standarden; et der er gemt tomt, ER tomt. Uden den forskel ville
     standarden komme tilbage næste gang man besøgte siden, og gemmeknappen
     ville se ud som om den ikke virkede. Se widgets.js. */
  const gemt = layout.post?.[valgt] ?? null;
  const viste = redigerer
    ? (udkast || [])
    : layoutFor(gemt, valgt, harKundenModul);

  const nyt = (liste) => { saetUdkast(liste); saetSvar(null); };
  const tilfoejWidget = (key) => nyt([...(udkast || []), key]);
  const fjernWidget = (key) => nyt((udkast || []).filter((x) => x !== key));

  /* ⚠ FLYTNING BÅDE MED MUS OG MED TASTATUR. Træk-og-slip alene er
     ubrugeligt for den der ikke kan bruge en mus, og et layout man ikke kan
     rette, er et layout man ikke har. Pilene kalder den SAMME funktion som
     slippet — to flytterutiner ville før eller siden flytte forskelligt. */
  const flytWidget = (fra, til) => {
    const ny = [...(udkast || [])];
    if (fra === til || til < 0 || til >= ny.length) return;
    const [taget] = ny.splice(fra, 1);
    ny.splice(til, 0, taget);
    nyt(ny);
  };

  const gemLayout = async () => {
    /* ⚠ DEN SAMME FUNKTION SOM REGLERNE. valideLayout() prøver NAVNENE;
       reglen kan ikke slå op i et katalog og prøver FORMEN. En kontrol der
       kun findes her, er en pæn knap. */
    const kontrol = valideLayout(udkast || []);
    if (!kontrol.ok) {
      saetSvar({ ok: false, art: "fejl", besked: kontrol.fejl });
      return;
    }
    saetGemmer(true);
    /* ⚠ GENNEM skriv.js, IKKE db.ref() DIREKTE. Én vej ind, som der er én
       vej ud i useListe — og en afvist skrivning bliver til en forklaring
       frem for "prøv igen". */
    const r = await gem({
      sti: sti("brugerlayout/" + bruger?.uid + "/" + valgt),
      data: udkast || [],
      foer: gemt,
      objekt: "brugerlayout",
      objektId: bruger?.uid || null,
    });
    saetGemmer(false);
    saetSvar(r);
    if (!r.ok) return;
    saetRedigerer(false);
    saetUdkast(null);
    layout.genindlaes();
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kpiadgang utilgaengelige={utilgaengelige} />
      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {/* ⚠ VÆLGEREN ER EN <select> OG IKKE FANER. Syv dashboards i en
          fanerække ville brække på en bærbar, og listen vokser med hvert
          modul vi sælger.
          ⚠ OG DEN TEGNES KUN VED 2+ SYNLIGE DRIFTSMODULER — SKIVE 2C. Med
          præcis ét er der intet at vælge imellem, og en vælger med én
          mulighed er ikke et valg — det er en attrap. Med nul findes der
          heller intet at vælge; Samlet er selve svaret. `visVaelger` er
          udledt af `ALLE`, som allerede har været igennem alle fire
          synlighedslag, så vælgeren aldrig kan tilbyde noget den ikke må. */}
      <div className="fc-kal-top">
        {visVaelger ? (
          <>
            <label className="fc-hint" htmlFor="db-vaelg">Vis dashboard:</label>
            <select id="db-vaelg" className="fc-ctl" value={valgt}
                    onChange={(e) => saetParams(e.target.value === SAMLET
                      ? {} : { db: e.target.value })}>
              {ALLE.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
            <span className="fc-hint">
              {ALLE.find((d) => d.key === valgt)?.under}
            </span>
          </>
        ) : (
          <span className="fc-hint">
            {ALLE.find((d) => d.key === valgt)?.under}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {redigerer ? (
            <>
              <Knap onClick={() => nyt(standardlayout(valgt, harKundenModul))}>
                Nulstil
              </Knap>
              <Knap onClick={() => {
                saetRedigerer(false); saetUdkast(null); saetSvar(null);
              }}>Annullér</Knap>
              <Knap variant="primaer" onClick={gemLayout} disabled={gemmer}>
                {gemmer ? "Gemmer …" : "Gem layout"}
              </Knap>
            </>
          ) : (
            <Knap onClick={() => {
              saetRedigerer(true); saetUdkast(viste); saetSvar(null);
            }}>Tilpas forside</Knap>
          )}
        </span>
      </div>

      <Formularsvar svar={svar} />

      {/* ═══════════════════════════════════════════════════════════════
          A + B — KRÆVER HANDLING. SKIVE 2C's primære, ledende sektion.
          Handlingsliste FANDTES I FORVEJEN og er den ENESTE liste — den
          gamle "Åbne opgaver der kræver opfølgning"-tabel (permanent tom,
          en parallel struktur ved siden af netop denne) er fjernet, ikke
          flyttet. Se dashboards.js for hvorfor rækkerne kun er dem der
          faktisk kræver noget. */}
      <Kort titel="Kræver handling">
        {/* ⚠ Handlingsliste ER EN PRIMITIV, OG DEN FANDTES I FORVEJEN.
            Jeg skrev min egen markup med min egen .fc-handling-txt — og
            klassenavnet var TAGET af netop den primitiv. css-navne-prøven
            fangede det: den sidste regel vinder, og den vinder et andet
            sted i appen end der hvor man arbejder.

            Prioriteten bæres af ikonets tone, og modulet står i
            underteksten — mockuppens to piller ville have krævet en
            anden primitiv til den samme slags liste.

            ⚠ KUN DE RÆKKER DER FAKTISK KRÆVER NOGET. Før stod fem rækker
            fast, uanset om tallet var 0 — og "0 fakturaer til godkendelse"
            er ikke en handling, det er fraværet af en. Et UBESVARET felt
            giver heller ingen række: null er ikke nul. Se handlinger(). */}
        <Handlingsliste
          poster={handler.map((h) => ({
            id: h.key,
            til: h.sti,
            tone: PRIORITET[h.prioritet].pill,
            ikon: h.ikon,
            tekst: h.tekst,
            under: `${MODUL[h.modul]?.label || h.modul} · ${h.hvorfor}`,
            antal: num(h.antal),
          }))}
        />
        {/* ⚠ INGEN STILLE AFSKÆRING. Er der flere end loftet, siger en
            linje det — samme disciplin som mindst()/afkortet andre steder
            i appen: en nedre grænse er en kendsgerning, ikke et tal der
            forsvinder usagt. */}
        {skaaretHandlinger > 0 && (
          <p className="fc-hint" style={{ marginTop: 10 }}>
            {num(skaaretHandlinger)} {skaaretHandlinger === 1 ? "handling til" : "handlinger til"} —
            se det enkelte modul for resten.
          </p>
        )}
      </Kort>

      {/* ⚠ ET KORT PR. MODUL, BYGGET AF KATALOGET — ikke tre håndskrevne.
          Her stod Workforce, Facility og Procure som hver sit stykke JSX med
          hver sin liste af MiniLinjer. Det fjerde modul ville have fået sit
          eget, og det femte ville have set anderledes ud end de fire. */}
      <Gitter kolonner="repeat(auto-fit, minmax(300px, 1fr))">
        {kortNoegler.map((m) => (
          <Modulkort key={m} modul={m} kort={MODULKORT[m]} kpi={k} />
        ))}
      </Gitter>

      {/* ═══════════════════════════════════════════════════════════════
          C — EKSTRA NØGLETAL. Sekundær, sammenklappelig — SKIVE 2C.
          Brugerens EGEN widget-række (uændret motor, se Widgetkort/
          Widgetvaelger nedenfor) OG de tværgående/regnskabsprægede kort,
          som ofte kun viser — (endnu ikke aggregeret), flyttet ud af den
          primære sektion. "Tilpas forside" bor stadig i topbaren ovenfor
          og virker uændret — knappen sætter blot `redigerer`, som her
          tvinger sektionen åben, så man kan se det man er ved at rette. */}
      <details className="fc-sammenklap" open={ekstraAaben || redigerer}
                onToggle={(e) => saetEkstraAaben(e.target.open)}>
        <summary>
          <span aria-hidden="true" className="fc-sammenklap-pil">{"›"}</span>
          Ekstra nøgletal
        </summary>
        <div className="fc-sammenklap-b">
          {/* ⚠ BRUGERENS EGEN RÆKKE STÅR FØRST HERINDE. Det er den man selv
              har sat sammen. */}
          {viste.length > 0 && (
            <KpiRaekke>
              {viste.map((key, i) => (
                <Widgetkort
                  key={key} nr={i} antal={viste.length} noegle={key} kpi={k}
                  redigerer={redigerer}
                  paaFlyt={flytWidget} paaFjern={fjernWidget}
                />
              ))}
            </KpiRaekke>
          )}

          {redigerer && viste.length === 0 && (
            <Tom>Ingen widgets valgt. Et tomt layout ER et valg — gemmer du det,
              bliver forsiden stående uden rækken.</Tom>
          )}

          {!redigerer && viste.length === 0 && (
            <Tom>Ingen ekstra widgets valgt endnu. Tilpas forsiden for at tilføje nogle.</Tom>
          )}

          {redigerer && (
            <Widgetvaelger
              valgte={viste}
              harModulFn={harKundenModul}
              paaSlaaTil={tilfoejWidget}
              paaFjern={fjernWidget}
            />
          )}

          {/* ⚠ TVÆRGÅENDE TAL HØRER PÅ DET SAMLEDE DASHBOARD. På et
              modul-dashboard ville "Driftsomkostninger" og "Ikke-faktureret"
              være tal fra et andet modul end det man har valgt — og så betyder
              valget ingenting. */}
          {valgt === SAMLET && (
          <KpiRaekke>
            <KpiKort label="Åbne opgaver" vaerdi={num(k.opgaver.aabne)} />
            {/* ⚠ HER STOD deviation(-0.6, …) — ET HARDKODET DELTA. Kortet viste
                "↘ −0,6 %-point" under en nedetid der var UBESVARET: en pil der
                pegede et sted ingen kunne genfinde, og som pegede samme vej i hver
                eneste tenant. Værre end det hardkodede antal ovenfor, fordi en
                afvigelse LIGNER en måling af noget der har ændret sig. */}
            <KpiKort label="Nedetid" vaerdi={pct(k.flaade.nedetidPct, 1)}
                     afvigelse={deviation(k.flaade.nedetidDeltaPoint, { betterWhen: "lower", unit: "pct" })}
                     note="%-point" />
            {/* ⚠ kr() SKELNER IKKE — og det er med vilje: kun KALDEREN ved om nul
                er et svar. Her er det ikke. Uden gaten stod der "0 kr." for et
                tal ingen har regnet, og nul kroner i driftsomkostninger er en
                påstand om en vognmand der ikke bruger penge. Se format.js. */}
            <KpiKort label="Driftsomkostninger" vaerdi={beloebEllerIntet(k.oekonomi.driftsomkostningerOere)}
                     afvigelse={deviation(budgetAfvPct, { betterWhen: "lower", unit: "pct" })} note="vs. budget" />
            {/* ⚠ null / 100 ER 0, IKKE null. Divisionen gik uden om deviation()s
                gate, og kortet skrev "0,00 vs. sidste periode" for et delta der
                aldrig var regnet. Regnestykker paa null giver STILLE et tal —
                se noten ved deviationPct() i format.js. */}
            <KpiKort label="Omkostning pr. km" vaerdi={beloebEllerIntet(k.flaade.omkostningPrKmOere, 2)}
                     afvigelse={deviation(
                       Number.isFinite(k.flaade.omkostningPrKmDeltaOere)
                         ? k.flaade.omkostningPrKmDeltaOere / 100 : null,
                       { betterWhen: "lower", dec: 2 })}
                     note="vs. sidste periode" />
            {/* Planlagt vs. akut vedligehold — feltet fandtes i kpi/ hele tiden.
                Budgetafvigelsen er ikke tabt: den beregnes ÉN gang og vises på
                Økonomi, hvor fortegnskonventionen fra beslutning 3 hører hjemme.
                Her stod den som det femte kort uden at være i mockuppen. */}
            {/* ⚠ 100 − null ER 100, IKKE NaN. null bliver til 0 i et minusstykke,
                og kortet skrev derfor "— / 100 %": den ene halvdel ubesvaret, den
                anden skråsikker. To tal der summerer til 100 skal mangle SAMMEN.
                En JSX-kommentar kan i øvrigt ikke stå MELLEM to attributter — den
                læses som et spread, og byggeriet siger 'Expected "..."'. */}
            <KpiKort label="Planlagt vs. akut vedligehold"
                     vaerdi={`${pct(k.oekonomi.planlagtVedligeholdPct)} / ${
                       Number.isFinite(k.oekonomi.planlagtVedligeholdPct)
                         ? pct(100 - k.oekonomi.planlagtVedligeholdPct) : INTET}`}
                     ekstra={<Fordelingsbjaelke pct={k.oekonomi.planlagtVedligeholdPct} />}
                     note={`Mål ${pct(70)} / ${pct(30)}`} />
            <KpiKort label="Ikke-faktureret" vaerdi={beloebEllerIntet(k.oekonomi.ikkeFaktureretOere)}
                     note="ekskl. moms" />
          </KpiRaekke>
          )}

          {valgt === SAMLET && (
          /* Midterrækken. auto-fit, så kortet fylder pænt alene nu og de to
              øvrige (Omkostninger pr. måned, Største afvigelser) glider ind ved
              siden af uden endnu en layoutændring. */
          <Gitter kolonner="repeat(auto-fit, minmax(320px, 1fr))">
            <Kort titel="Omkostninger pr. måned">
              <Soejlegraf
                punkter={maanedsPunkter}
                serier={[{ navn: "Driftsomkostninger", tone: "brand" }]}
                maal={{ vaerdi: k.oekonomi.budgetOere, navn: "Budget" }}
                format={(v) => kr(v)}
                hoejde={148}
              />
            </Kort>

            <Kort titel="Status på opgaver"
                  handling={<Link className="fc-a" to="/booking">Se alle opgaver</Link>}>
              <Donut dele={STATUSFORDELING(k)} format={num} midteTekst="i alt" />
            </Kort>

            {/* ⚠ FELTET KAN MANGLE, OG SKÆRMEN SKAL TÅLE DET.
                `afvigelser` står på KPI-efterslæbet: aggregeringen er ikke bygget,
                så en ægte kpi/-node har det ikke endnu. useKpi returnerer nodens
                værdi når den findes — og så er demo-sættets felt ikke med.
                Det gælder ethvert efterslæbsfelt: definér det i demo-kpi.js, OG
                lad skærmen kunne stå uden det. Et .map() på undefined giver en
                hvid skærm, ikke et manglende kort. */}
            <Kort titel="Største afvigelser"
                  handling={<Link className="fc-a" to="/oekonomi">Se alle afvigelser</Link>}>
              {!k.afvigelser?.length ? (
                <Tom>Afvigelser aggregeres endnu ikke. Se KPI-efterslæbet i README.</Tom>
              ) : (
              <ol className="fc-afvig">
                {k.afvigelser.map((a) => (
                  <li key={a.id}>
                    <div className="fc-afvig-txt">
                      <b>{a.emne}</b>
                      <span>{a.kilde}</span>
                    </div>
                    {/* Afvigelsen skrives ALDRIG som en håndlavet streng — så ville
                        + være rødt her og grønt et andet sted. betterWhen 'lower':
                        en overskridelse er dårlig, uanset om det er kroner eller
                        procent. */}
                    {a.beloebOere != null && (
                      <span className="fc-afvig-tal fc-bad">
                        {deviation(a.beloebOere, { betterWhen: "lower", unit: "kr" }).text}
                      </span>
                    )}
                    {a.pct != null && (
                      <span className="fc-afvig-tal fc-bad">
                        {deviation(a.pct, { betterWhen: "lower", unit: "pct" }).text}
                      </span>
                    )}
                    <Pille tone={a.alvor === "hoej" ? "bad" : a.alvor === "mellem" ? "warn" : "ok"}>
                      {a.alvor === "hoej" ? "Høj" : a.alvor === "mellem" ? "Mellem" : "Lav"}
                    </Pille>
                  </li>
                ))}
              </ol>
              )}
            </Kort>
          </Gitter>
          )}
        </div>
      </details>

      <p className="fc-hint">Alle beløb er ekskl. moms, medmindre andet er angivet.</p>
    </div>
  );
}

/* ---- Modulkortet ------------------------------------------------------ */

/**
 * Tre tal fra kpi/, eller en ærlig besked om hvad der mangler.
 *
 * ⚠ ET MODUL UDEN TAL FÅR ET KORT ALLIGEVEL. Warehouse har ét felt i kpi/
 * og UnitBooking ingen. Udelod vi kortene, ville de to moduler se ud som
 * noget der ikke findes; fyldte vi dem med tal, ville de se ud som
 * målinger. Kortet skriver i stedet hvilke felter der skal beregnes — så
 * står efterslæbet på skærmen frem for kun i README.
 */
function Modulkort({ modul, kort, kpi }) {
  const navn = MODUL[modul]?.label || modul;
  return (
    <Kort
      titel={<><Ikon navn={kort.ikon} farve={`var(--fc-${kort.tone})`} /> {navn}</>}
      handling={<Link className="fc-a" to={kort.sti}>Gå til {navn}</Link>}
    >
      {kort.mangler ? (
        <>
          <Tom>Tallene aggregeres ikke endnu.</Tom>
          <p className="fc-hint" style={{ marginTop: 10 }}>
            {kort.hvorfor}
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Felter der mangler:{" "}
            {kort.mangler.map((f, i) => (
              <span key={f}>{i > 0 ? ", " : ""}<code>{f}</code></span>
            ))}
          </p>
        </>
      ) : (
        kort.tal.map((post) => {
          const t = kortTal(kpi, post);
          /* ⚠ INTET (—) FOR ET UBESVARET TAL, ikke 0. num() og pct() bærer
             gaten; her vælges kun hvilken af dem. Se format.js. */
          const vist = t.form === "pct" ? pct(t.vaerdi, 0) : num(t.vaerdi);
          return <MiniLinje key={post.label} label={t.label} vaerdi={vist} />;
        })
      )}
    </Kort>
  );
}

/* ---- Widgets: brugerens egen række ------------------------------------ */

/**
 * Ét widgetkort.
 *
 * ⚠ SAMME KORT I BEGGE TILSTANDE. I redigering får det håndtag udenom, men
 * tallet bliver stående — et layout man bygger på tomme kasser, kan man ikke
 * se om giver mening.
 */
function Widgetkort({ nr, antal, noegle, kpi, redigerer, paaFlyt, paaFjern }) {
  const w = widget(noegle);
  /* ⚠ EN UKENDT NØGLE SPRINGES OVER, IKKE VIST SOM ET TOMT KORT.
     valideLayout() fanger den ved SKRIVNINGEN, hvor der er nogen at sige det
     til; her ville et opslag på null blive til en hvid skærm. */
  if (!w) return null;

  /* ⚠ SAMME OPSLAG SOM MODULKORTENE — `kortTal()` kender forskellen på et
     FELT og en AFLEDNING, så skærmen ikke skal. Her stod `kpiVaerdi(kpi,
     w.felt)` direkte, og en widget med `afledt` ville derfor have slået op på
     `undefined` og tegnet en streg — et tal der findes, vist som et der ikke
     gør. Se beslutning 71. */
  const { vaerdi: raa } = kortTal(kpi, w);
  /* ⚠ INTET (—) FOR ET UBESVARET FELT, ikke 0. Gaten sidder i num()/pct(),
     og beloebEllerIntet() bærer den for kr(), som ikke skelner selv. */
  const vist = w.form === "pct" ? pct(raa, 1)
    : w.form === "kr" ? beloebEllerIntet(raa)
    : w.form === "kr2" ? beloebEllerIntet(raa, 2)
    : num(raa);

  const kort = (
    <KpiKort label={w.label} vaerdi={vist} rund
             ikon={<Ikon navn={w.ikon} />} tone={w.tone} />
  );
  if (!redigerer) return kort;

  return (
    <div
      className="fc-widget-red"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(nr));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const fra = Number(e.dataTransfer.getData("text/plain"));
        if (Number.isInteger(fra)) paaFlyt(fra, nr);
      }}
    >
      {kort}
      {/* ⚠ PILENE GØR PRÆCIS DET SAMME SOM TRÆKKET — samme flytWidget().
          Træk-og-slip alene er ubrugeligt for den der ikke kan bruge en mus,
          og et layout man ikke kan rette, er et layout man ikke har. */}
      <div className="fc-widget-vaerktoej">
        <button type="button" className="fc-widget-knap" title="Flyt til venstre"
                onClick={() => paaFlyt(nr, nr - 1)} disabled={nr === 0}
                aria-label={"Flyt " + w.label + " til venstre"}>{"\u2039"}</button>
        <button type="button" className="fc-widget-knap" title="Flyt til højre"
                onClick={() => paaFlyt(nr, nr + 1)} disabled={nr >= antal - 1}
                aria-label={"Flyt " + w.label + " til højre"}>{"\u203a"}</button>
        <button type="button" className="fc-widget-knap" title="Fjern"
                onClick={() => paaFjern(noegle)}
                aria-label={"Fjern " + w.label}>{"\u00d7"}</button>
      </div>
    </div>
  );
}

/**
 * Kataloget man vælger fra.
 *
 * ⚠ FELTSTIEN STÅR PÅ HVER LINJE. En widget ER et felt i kpi/ med en
 * præsentation — står stien der, kan man se hvorfor et kort skriver "—":
 * feltet er ikke aggregeret endnu. Uden den ville stregen ligne en fejl i
 * selve widgeten.
 *
 * ⚠ KUN DE MODULER KUNDEN HAR — uden undtagelser. En afkrydsning for et
 * modul der ikke er købt, ville se ud som et valg der betyder noget, og
 * tallet bagved er netop det kunden ikke har betalt for at se. Grupperne er
 * modulernes, og navnet kommer fra MODUL — ikke fra et map her.
 */
function Widgetvaelger({ valgte, harModulFn, paaSlaaTil, paaFjern }) {
  const kan = tilgaengeligeWidgets(harModulFn);
  const grupper = [...new Set(kan.map((w) => w.modul))];

  return (
    <Kort titel="Tilpas forsiden">
      {/* ⚠ HER STOD "N AF 12 PLADSER", OG DE TOLV VAR EN SMAGSDOM. Der er
          intet loft på antallet: layoutet er brugerens egen præference om sin
          egen skærm, og en grænse han ikke kan hæve, er en beslutning taget
          på hans vegne uden anden begrundelse end smag. Den øvrige grænse er
          kataloget selv — en widget kan kun stå én gang. Se widgets.js. */}
      <p className="fc-hint">
        Træk kortene ovenfor for at bytte om — eller brug pilene på hvert kort,
        hvis du hellere vil bruge tastaturet. {num(valgte.length)} af{" "}
        {num(kan.length)} tilgængelige widgets er valgt.
      </p>
      {grupper.map((m) => (
        <div key={m} className="fc-widget-gruppe">
          <b>{MODUL[m]?.label || m}</b>
          <div className="fc-permgitter" style={{ maxHeight: "none" }}>
            {kan.filter((w) => w.modul === m).map((w) => {
              const paa = valgte.includes(w.key);
              return (
                <label key={w.key} className="fc-perm">
                  <input type="checkbox" checked={paa}
                         onChange={() => (paa ? paaFjern(w.key) : paaSlaaTil(w.key))} />
                  <span>
                    <b>{w.label}</b>
                    <span className="fc-hint" style={{ display: "block" }}>
                      <code>{w.felt}</code>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </Kort>
  );
}
