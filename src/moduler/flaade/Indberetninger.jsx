/* src/moduler/flaade/Indberetninger.jsx
 * Indberetninger. BESLUTNING 25 + chaufførappens tre datatyper.
 *
 * ⚠ BESLUTNING 25 ER ANTAGELSER, IKKE AFGJORTE KRAV. Forløbet skal efterprøves
 * hos første kunde. Der findes INGEN mockup — skærmen er bygget efter
 * beslutningen, ikke efter en tegning.
 *
 * ---------------------------------------------------------------------------
 * ÉN SKÆRM, FIRE FELTSKEMAER. Arten styrer hvilke felter der vises, præcis som
 * i Køretøjer. Fire skærme til fire indberetningstyper ville drive fra
 * hinanden, og den femte type ville få sin egen igen.
 *
 * ⚠ APPEN ER IKKE BYGGET — FELTERNE ER. Tidsregistrering, underskrift og
 * materialeforbrug vises her, fordi modellen skal være rigtig FØR appen
 * kommer. Bygges de først når appen er der, skal Indberetninger laves om, og
 * så er der data i produktion der ikke passer.
 *
 * ⚠ MATERIALEFORBRUG ER KOBLINGEN TIL ØKONOMIEN. Én hændelse giver TO
 * posteringer — et salg på fakturagrundlaget og et forbrug på lageret — og
 * skærmen viser dem hver for sig med hver sin tilstand. Slås de sammen,
 * fakturerer man til kostpris eller bogfører sin salgspris som en omkostning.
 * ---------------------------------------------------------------------------
 *
 * ⚠ FASEN ER OVRE. Her stod at `indberetninger/` ingen sensitive-node havde
 * i firebase.rules.json, og at `indberetninger.sensitiveLaes` ikke fandtes i
 * permissions.js — begge dele "tilføjes i samme ombæring som reglerne og
 * deres tests, ikke før". Det er sket: noden findes, underskriften er
 * write-once, permissionen er koordinatorens, og skærmen læser nu satellitten
 * gennem `usePost()` frem for demo-sættet.
 *
 * ⚠ SATELLITTEN HENTES KUN NÅR BRUGEREN MÅ LÆSE DEN. Uden `maaSensitivt`
 * ville hver visning give en `permission-denied` — altså en AFVIST læsning
 * hver gang en disponent åbnede en indberetning. En afvisning er reglerne der
 * VIRKER, men den skal ikke fremprovokeres af os selv.
 */
import { useState } from "react";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { usePost } from "../../fleet/usePost.js";
import { kr, num, dato, datoTid, km as kmFmt } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Gitter, MiniLinje, Kpiadgang,
  Knap, Dialog, ModulNav } from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  HAENDELSE_ART, FORLOEB, harFelt, FELT,
  kanAfslutte, kanFaktureres,
  tidPaaStedetMin, forsinkelseMin, forbrugKmPrLiter,
} from "../../fleet/indberetninger.js";
import {
  demoTankninger,
} from "../../fleet/demo-indberetninger.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { talFraAntal } from "../../fleet/grundlag.js";
import { PRIORITET } from "../../fleet/prioritet.js";
import { OPGAVE_STATUS, arbejdstypeForIndberetningsart } from "../../fleet/opgaver.js";
import { FLEET_FANER } from "../../fleet/modulfaner.js";
/* ⚠ SKIVE 3B — samme to komponenter som Vaerkstedskalender.jsx og
   Disponering.jsx bruger. Ingen parallel triage- eller planlægningslogik. */
import Indberetningtriage from "../../fleet/Indberetningtriage.jsx";
import Planlaegdialog from "../../fleet/Planlaegdialog.jsx";
import Haendelsespanel from "../../fleet/Haendelsespanel.jsx";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
/* ⚠ SKIVE 3C — samme delte sagsvisning som Fleet Driftskalender og Facility
   Servicekalender bruger. Kun til at ÅBNE en sag der allerede findes. */
import Sagsvisning from "../../fleet/Sagsvisning.jsx";

/* ⚠ HER STOD `bilNavn` SOM EN MODUL-KONST BYGGET AF DEMOFILEN. Hos en rigtig
   kunde matcher den ingenting, og kolonnen "Enhed" ville stå med et råt id på
   hver eneste indberetning. Opslaget bygges nu af den hentede liste — og
   SENDES MED til Detaljer, for en underkomponent kan ikke se den ydres
   variable. */

export default function Indberetninger() {
  const { kpi: k, henter, tilstand, genindlaes, utilgaengelige } = useKpi();
  const { bruger } = useFleet();
  /* ⚠ FLEET TARGET §9.3 — kun til det nyoprettede Haendelsespanels
     Statusskifte (en OPGAVE-permission), adskilt fra `maaTriagere`
     (`indberetninger.skrivAlle`) i Detaljer nedenfor, som styrer
     indberetningens EGEN triage. To forskellige noder, to permissions. */
  const maaPlanlaegge = harPerm(bruger?.perms, PERM.opgaverSkriv);
  /* ⚠ FLEET TARGET COMPLETION (produktejer-review 2026-09-01) — detaljerne
     flyttede fra en fast sidekolonne til den godkendte drawer (§1's
     variant="drawer"), så tabellen kan bruge fuld bredde når intet er valgt.
     Startværdien er derfor null, ikke en hardkodet demo-post: en drawer der
     er åben ved siden af intet klik, ville se ud som en fejl. */
  const [valgtId, setValgtId] = useState(null);
  /* Skive 3B: null = lukket, ellers et forslag til Planlaegdialog. */
  const [planlaegger, setPlanlaegger] = useState(null);
  /* ⚠ FLEET TARGET §9.3 — se Planlaegdialog.jsx's egen note. Efter en
     planlægning med en ekstern leverandør åbnes den nyoprettede opgaves
     Haendelsespanel direkte på Sag-fanen, samme drawer som Driftskalenderen
     bruger — ikke en parallel sag-visning her. */
  const [opgaveDetaljerId, setOpgaveDetaljerId] = useState(null);

  /* ⚠ NODEN, IKKE DEMOFILEN. `indberetninger` var den sjette node med regler
     og ingen data — den blokerede kun ét KPI-felt, og Dashboardet hardkodede
     tallet i stedet for at savne det.

     ordnPaa: "art" og ikke "type". Indekset navngav "type", som ingen post
     har; tredje gang det mønster dukkede op. */
  const liste = useListe("indberetninger", {
    ordnPaa: "oprettetMs", vindueDage: 400, graense: 500,
  });

  /* ⚠ KUN SOM FALDBAKKE. Flåden er en seedet node. */
  const enheder = useListe("koeretoejer", {
    vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
  });
  const bilNavn = (id) =>
    enheder.data.find((k) => k.id === id)?.kaldenavn || id || "—";

  /* ⚠ SKIVE 4B — IKKE LÆNGERE MODULSPÆRRET. `leverandoerer` er nu fælles
     masterdata uden modulklausul (Model B), gated på `leverandoerer.laes`
     alene — samme rettelse som Vaerkstedskalender.jsx. */
  const leverandoerer = useListe("leverandoerer", {
    vindue: "alle", demo: DEMO_LEVERANDOERER,
  });

  /* ⚠ SKIVE 3B — "eventuel tilknyttet driftsopgave" i detaljepanelet.
     BESØGET SLÅS OP PÅ INDBERETNINGEN, IKKE OMVENDT — samme opslag som
     chaufførappens Indberetning.jsx, se beslutning 109. */
  const opgaver = useListe("opgaver", {
    vindue: "alle", graense: 500, demo: DEMO_OPGAVER,
  });
  const brugere = useListe("brugere", { vindue: "alle", graense: 200 });
  const brugerNavn = (uid) => {
    const b = brugere.data.find((x) => x.id === uid);
    return b?.navn || b?.email || uid || "—";
  };

  const maaSensitivt = harPerm(bruger?.perms, PERM.indberetningerSensitiveLaes);
  /* ⚠ id = null BETYDER "SPØRG IKKE". Hooket står ubetinget — hooks må ikke
     kaldes betinget — mens selve læsningen først sker når brugeren må. */
  /* ⚠ auditerSom SKAL MED PÅ EN sensitive-NODE — og den manglede her.
     `sensitive/indberetninger` bærer skadebeskrivelse, modpart,
     forsikringsselskab, policenummer og underskrift: den mest personlige og
     mest juridisk ladede post i produktet. `audit.js` siger om `laes()` at
     *"det er den del der plejer at mangle, og den RA-kunder spørger om"* —
     og netop den læsning blev ikke logget.
     Naboen `sensitive/fravaer` i Fravaer.jsx havde den. Samme hook, samme
     slags node, ét ord til forskel. Se beslutning 99. */
  const sensitiv = usePost("sensitive/indberetninger", maaSensitivt ? valgtId : null, {
    auditerSom: "indberetningSensitive",
  });

  if (henter || liste.henter) return <Henter hvad="indberetninger" />;
  /* En AFVIST læsning af listen er ikke en tom liste. */
  if (blokerer(liste.tilstand)) {
    return <Datatilstand tilstand={liste.tilstand} genprov={liste.genindlaes} />;
  }
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  const raekker = liste.data;
  const valgt = raekker.find((i) => i.id === valgtId) || null;

  /* AFLEDT af den viste liste — hører derfor ikke i kpi/. Labelen siger
     hvilket udsnit, så tallet ikke læses som en total. */
  const aabne = raekker.filter((i) => i.forloeb !== "afsluttet");
  const kanIkkeAfsluttes = aabne.filter((i) => !kanAfslutte(i).ok && i.forloeb === "afventerFaktura");
  const ufakturerede = raekker.flatMap((i) =>
    (i.materialelinjer || []).filter((l) => kanFaktureres(i, l).ok)
  );

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={FLEET_FANER} />
      <Kpiadgang utilgaengelige={utilgaengelige} />
      {k && (
        <KpiRaekke>
          <KpiKort label="Åbne indberetninger" vaerdi={num(aabne.length)} note="i de hentede" />
          <KpiKort label="Afventer faktura" vaerdi={num(kanIkkeAfsluttes.length)}
                   tone={kanIkkeAfsluttes.length ? "warn" : undefined}
                   note="pengesiden er ikke afklaret" />
          <KpiKort label="Materiale til fakturering" vaerdi={num(ufakturerede.length)}
                   note="linjer der kan blive til et grundlag" />
          <KpiKort label="Brændstofudgift" vaerdi={kr(k.flaade.braendstofOere)}
                   note="perioden" />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {/* ⚠ FLEET TARGET COMPLETION — FULD BREDDE NÅR INTET ER VALGT. Den
          tidligere faste 3fr/2fr-kolonne reserverede plads til detaljerne
          selv når ingen post var valgt. Detaljerne bor nu i drawer'en
          nedenfor. */}
      <Kort titel="Indberetninger">
        <Tabel
          kolonner={[
            { key: "art", label: "Art",
              render: (i) => HAENDELSE_ART[i.art]?.label || i.art },
            { key: "beskrivelse", label: "Hændelse" },
            { key: "bil", label: "Enhed", render: (i) => bilNavn(i.koeretoejId) },
            { key: "forloeb", label: "Forløb",
              render: (i) => (
                <Pille tone={FORLOEB[i.forloeb]?.pill || "info"}>
                  {FORLOEB[i.forloeb]?.label || i.forloeb}
                </Pille>
              ) },
            { key: "oprettet", label: "Oprettet", render: (i) => dato(i.oprettetMs) },
          ]}
          raekker={raekker}
          noegle={(i) => i.id}
          paaRaekke={(i) => setValgtId(i.id)}
          erValgt={(i) => i.id === valgtId}
          tom="Ingen indberetninger i perioden."
        />
      </Kort>

      {valgt && (
        <Dialog variant="drawer" titel={HAENDELSE_ART[valgt.art]?.label || valgt.art}
                onLuk={() => setValgtId(null)}>
          <Detaljer i={valgt} bruger={bruger} sensitivt={sensitiv.post || {}}
                    bilNavn={bilNavn} genindlaes={liste.genindlaes}
                    besoeg={opgaver.data.find((o) => o.indberetningId === valgt.id) || null}
                    brugerNavn={brugerNavn}
                    onPlanlaeg={() => setPlanlaegger({
                      koeretoejId: valgt.koeretoejId || "",
                      beskrivelse: valgt.beskrivelse || "",
                      prioritet: valgt.prioritet || "",
                      indberetningId: valgt.id,
                      /* ⚠ FLEET TARGET §9.2 — se opgaver.js's egen note.
                         Stadig kun et forslag: feltet forbliver et
                         almindeligt, redigerbart felt i Planlaegdialog. */
                      arbejdstype: arbejdstypeForIndberetningsart(valgt.art),
                    })} />
        </Dialog>
      )}

      {/* ⚠ SKIVE 3B — SAMME DIALOG SOM Vaerkstedskalender.jsx OG
          Disponering.jsx, forudfyldt fra indberetningen. Ingen parallel
          "indberetningskalender". */}
      {planlaegger && (
        <Planlaegdialog
          enheder={enheder.data}
          leverandoerer={leverandoerer.data}
          foraf={planlaegger}
          onLuk={() => setPlanlaegger(null)}
          onGemt={(res) => {
            setPlanlaegger(null);
            liste.genindlaes();
            /* ⚠ SKIVE 3B — INDBERETNINGEN OG DENS NYE OPGAVE HØRER SAMMEN.
               Uden den her genindlæsning viste "Driftsopgave" stadig "Ingen"
               lige efter planlægningen — koblingen var skrevet på serveren,
               men skærmens egen `opgaver`-liste vidste det ikke endnu. */
            opgaver.genindlaes();
            /* ⚠ FLEET TARGET §9.3 — se Planlaegdialog.jsx's egen note. */
            if (res?.harEksternLeverandoer && res.opgaveId) setOpgaveDetaljerId(res.opgaveId);
          }}
        />
      )}

      {opgaveDetaljerId && (() => {
        const nyOpgave = opgaver.data.find((o) => o.id === opgaveDetaljerId) || null;
        return nyOpgave && (
          <Haendelsespanel
            opgave={nyOpgave}
            lvNavn={(id) => leverandoerNavn(leverandoerer.data, id)}
            enheder={enheder.data}
            maaSkrive={maaPlanlaegge}
            initialFane="sag"
            onSkiftet={() => opgaver.genindlaes()}
            onLuk={() => setOpgaveDetaljerId(null)}
          />
        );
      })()}
    </div>
  );
}

/* ---- Detaljepanelet ---------------------------------------------------- */

function Detaljer({ i, bruger, sensitivt, bilNavn, genindlaes, besoeg, brugerNavn, onPlanlaeg }) {
  /* ⚠ SAMME PERMISSION SOM HENTNINGEN OVENFOR. Gaten her afgør hvad der
     TEGNES; reglen på `sensitive/indberetninger` afgør hvad der kan LÆSES.
     Ligger kontrollen kun i skærmen, går et direkte kald uden om den. */
  const maaSensitivt = harPerm(bruger?.perms, PERM.indberetningerSensitiveLaes);
  /* ⚠ SKIVE 3B — indberetninger.skrivAlle, IKKE indberetninger.skriv.
     Chaufføren har kun den sidste (sine egne), og reglen på
     `indberetninger/$id` skelner på nøjagtig den samme permission. Se
     Indberetningtriage.jsx og indberetningTriage i functions/index.js. */
  const maaTriagere = harPerm(bruger?.perms, PERM.indberetningerSkrivAlle);
  /* ⚠ SKIVE 3C — VISNING, IKKE OPRETTELSE. En indberetning er kun et
     "Fleet: ... når den er koblet til en sag"-indgangspunkt (se hovedet i
     Sagsvisning.jsx) — der er bevidst INGEN "Opret sag"-knap her. En sag
     hænger på en OPGAVE (objektType "opgave"), ikke direkte på en
     indberetning; koblingen her er kun til at ÅBNE en sag der allerede
     findes, hvis nogen har skrevet i.sagId. */
  const [sagAaben, saetSagAaben] = useState(false);

  /* ⚠ FLEET TARGET COMPLETION — INGEN EGEN <Kort> LÆNGERE. Titlen tegnes nu
     af den omsluttende drawer (Dialog variant="drawer" i Indberetninger()),
     samme mønster som Haendelsespanel.jsx: panelet GIVER chrome'et, indholdet
     tegner kun sit eget. En <Kort> herinde ville have givet en dobbelt titel. */
  return (
    <>
      <Gitter kolonner="1fr 1fr">
        <MiniLinje label="Enhed" vaerdi={bilNavn(i.koeretoejId)} />
        <MiniLinje label="Oprettet af" vaerdi={<>{brugerNavn(i.oprettetAf)} · {datoTid(i.oprettetMs)}</>} />
        {harFelt(i.art, FELT.kmStand) && Number.isFinite(i.kmStand) && (
          <MiniLinje label="Kilometerstand" vaerdi={kmFmt(i.kmStand)} />
        )}
        {/* ⚠ SKIVE 3B — FORLØBET STÅR OGSÅ I DETALJEPANELET, ikke kun i
            listen: valgt indberetning kan være scrollet ud af syne. */}
        {i.forloeb && (
          <MiniLinje label="Forløb" vaerdi={
            <Pille tone={FORLOEB[i.forloeb]?.pill || "info"}>
              {FORLOEB[i.forloeb]?.label || i.forloeb}
            </Pille>
          } />
        )}
        <MiniLinje label="Prioritet" vaerdi={i.prioritet
          ? PRIORITET[i.prioritet]?.label || i.prioritet
          : "Ikke vurderet"} />
        {/* ⚠ HAR en sag — ER ikke en sag. To tilstandsmaskiner, ét felt
            imellem. En mail kan være besvaret uden at bilen er repareret. */}
        <MiniLinje label="Sag" vaerdi={i.sagId
          ? <Knap onClick={() => saetSagAaben(true)}>Åbn sag</Knap>
          : "Ingen"} />
        {/* ⚠ BESØGET SLÅS OP PÅ INDBERETNINGEN, IKKE OMVENDT — beslutning
            109. Feltet kan mangle selv når der ER en aktivitet: koblingen
            findes kun fra opgaver oprettet via "Planlæg aktivitet" herfra. */}
        <MiniLinje label="Driftsopgave" vaerdi={besoeg
          ? <>{OPGAVE_STATUS[besoeg.status]?.label || besoeg.status} · {dato(besoeg.startMs)}</>
          : "Ingen"} />
      </Gitter>

      <p style={{ marginTop: 12 }}>{i.beskrivelse}</p>

      {i.art === "braendstof" && <Braendstof i={i} />}

      <Sensitivt aaben={maaSensitivt} data={sensitivt} art={i.art} />

      {i.tidsregistrering && <Tidsregistrering t={i.tidsregistrering} />}

      <Materialer i={i} />

      {/* ⚠ SKIVE 3B — MASKINEN TEGNER KNAPPERNE, IKKE EN LISTE HER. Se
          Indberetningtriage.jsx: "Markér som vurderet", "Planlæg aktivitet"
          og "Afslut" tegnes af FORLOEB[i.forloeb].naeste, og serveren afviser
          med den SAMME kanSkifteTil()/kanAfslutte(). */}
      <div style={{ marginTop: 16 }}>
        <Indberetningtriage
          indberetning={i}
          maaSkrive={maaTriagere}
          onPlanlaeg={onPlanlaeg}
          onSkiftet={genindlaes}
        />
      </div>

      {sagAaben && (
        <Dialog bred titel="Sag" onLuk={() => saetSagAaben(false)}>
          <Sagsvisning sagId={i.sagId} art="fleet" />
        </Dialog>
      )}
    </>
  );
}

/* ---- Brændstof: km/l regnes, ikke hentes ------------------------------- */

function Braendstof({ i }) {
  const tankninger = demoTankninger(i.koeretoejId);
  const kmPrL = forbrugKmPrLiter(tankninger);
  return (
    <div style={{ marginTop: 12 }}>
      <MiniLinje label="Liter" vaerdi={num(i.liter)} />
      {/* ⚠ VISES FOR SIG, tælles ikke med i km/l. Lagt til literantallet ville
          forbruget se ~5 % bedre ud end det er. */}
      <MiniLinje label="AdBlue" vaerdi={`${num(i.adBlueLiter)} l (ikke i km/l)`} />
      <MiniLinje label="Pris pr. liter" vaerdi={kr(i.prisPrLiterOere, 2)} />
      <MiniLinje
        label="Forbrug"
        vaerdi={kmPrL === null
          /* Ét datapunkt er ingen måling. Vi viser ikke et tal vi ikke har. */
          ? "Kræver to målerstande"
          : `${num(kmPrL, 2)} km/l`}
      />
      <p className="fc-hint" style={{ marginTop: 6 }}>
        Regnet på differencen mellem {tankninger.length} målerstande —
        kilometerstanden er totalt tal, ikke km siden sidste tankning.
      </p>
    </div>
  );
}

/* ---- Tidsregistrering: to slags tidspunkter ---------------------------- */

function Tidsregistrering({ t }) {
  const paaStedet = tidPaaStedetMin(t);
  const forsinket = forsinkelseMin(t);
  return (
    <div style={{ marginTop: 16 }}>
      <div className="fc-hint" style={{ marginBottom: 6 }}>Tidsregistrering</div>
      <MiniLinje label="Ankomst" vaerdi={datoTid(t.ankomstMs)} />
      <MiniLinje label="Afgang" vaerdi={t.afgangMs ? datoTid(t.afgangMs) : "Ikke meldt"} />
      <MiniLinje label="På stedet" vaerdi={paaStedet === null ? "—" : `${num(paaStedet)} min.`} />
      {/* ⚠ DET ANDET TIDSPUNKT. En ventetid tastet dagen efter er svagere
          dokumentation end en tastet på stedet — og den der skal forsvare
          fakturaen, skal kunne se det. Ikke for at mistænkeliggøre nogen. */}
      <p className="fc-hint" style={{ marginTop: 6 }}>
        Registreret {datoTid(t.registreretMs)}
        {forsinket !== null && forsinket > 0 && ` — ${num(forsinket)} min. efter ankomsten`}.
      </p>
    </div>
  );
}

/* ---- Sensitive felter: låst tilstand er ikke tomhed -------------------- */

/**
 * ⚠ FELTET VISES SOM LÅST, IKKE SOM FRAVÆRENDE.
 *
 * Og kortet står der for ALLE arter — også dem uden en skade. Vistes det kun
 * når der VAR noget at skjule, kunne man læse af hængelåsen at der skete
 * noget. Det er samme indsigt som ved cargoValue i ARKITEKTUR: delvis
 * afsløring lækker gennem udeladelsen.
 */
function Sensitivt({ aaben, data, art }) {
  const harNoget = Boolean(data?.skadeBeskrivelse || data?.underskrift);
  return (
    <div style={{ marginTop: 16 }}>
      <div className="fc-row" style={{ marginBottom: 6 }}>
        <span className="fc-hint">Beskyttede oplysninger</span>
        <Pille tone={aaben ? "ok" : "warn"}>{aaben ? "Adgang" : "Låst"}</Pille>
      </div>

      {!aaben && (
        <p className="fc-hint">
          Skadebeskrivelse og underskrift kræver <code>indberetninger.sensitiveLaes</code>.
          Kortet vises for alle indberetninger — også dem uden skade — så en
          hængelås ikke i sig selv røber at der skete noget.
        </p>
      )}

      {aaben && !harNoget && <p className="fc-hint">Ingen beskyttede oplysninger på denne.</p>}

      {aaben && harNoget && (
        <>
          {data.skadeBeskrivelse && <p>{data.skadeBeskrivelse}</p>}
          {data.modpart && (
            <MiniLinje label="Modpart" vaerdi={`${data.modpart.navn} — ${data.modpart.rolle}`} />
          )}
          {data.underskrift && <Underskrift u={data.underskrift} />}
        </>
      )}
    </div>
  );
}

/**
 * ⚠ SKRIVES ÉN GANG. Reglen er "underskrift": { ".write": "!data.exists()" } —
 * ikke en konvention. En underskrift der kan redigeres bagefter, beviser
 * ingenting. En rettelse er et TILLÆG: en ny indberetning der henviser til den
 * gamle, præcis som et låst fakturagrundlag erstattes frem for at rettes.
 */
function Underskrift({ u }) {
  return (
    <div style={{ marginTop: 12 }}>
      <MiniLinje label="Underskrevet af" vaerdi={u.navn} />
      <MiniLinje label="Sted" vaerdi={u.stedTekst || "—"} />
      <MiniLinje label="Tidspunkt" vaerdi={datoTid(u.ms)} />
      <p className="fc-hint" style={{ marginTop: 6 }}>
        Kan ikke ændres. En rettelse sker som en ny indberetning der henviser
        til denne — underskriften er et bevis, og et bevis der kan redigeres,
        beviser ingenting.
      </p>
    </div>
  );
}

/* ---- Materialeforbrug: én hændelse, to posteringer --------------------- */

function Materialer({ i }) {
  const linjer = i.materialelinjer || [];
  if (!linjer.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="fc-hint" style={{ marginBottom: 6 }}>Materialeforbrug</div>
      <Tabel
        kolonner={[
          { key: "vare", label: "Vare" },
          { key: "maengde", label: "Mængde", num: true,
            /* Vises som tal, gemmes som tusinddele — samme skala som
               grundlagets antal, så der ikke skal regnes om undervejs. */
            render: (l) => `${num(talFraAntal(l.maengde), 1)} ${l.enhed}` },
          /* ⚠ TO KOLONNER, IKKE ÉN. Salget og forbruget er to posteringer af
             samme hændelse med hver sit beløb og hver sin modtager. */
          { key: "salg", label: "Faktureret", render: (l) => <Salgstilstand i={i} l={l} /> },
          { key: "lager", label: "Lagertrukket",
            render: (l) => l.lagertraekId
              ? <Pille tone="ok">Trukket</Pille>
              : <Pille tone="warn">Ikke trukket</Pille> },
        ]}
        raekker={linjer}
        noegle={(l) => l.varenummer || l.vare}
        tom="Intet materiale registreret."
      />
      <p className="fc-hint" style={{ marginTop: 6 }}>
        Salget og forbruget er to posteringer af samme hændelse. Linjen på
        fakturagrundlaget er hvad kunden betaler; lagertrækket er hvad det
        kostede os. Slås de sammen, bliver dækningsgraden forkert uden at noget
        ser forkert ud.
      </p>
    </div>
  );
}

/** Tilstanden siger hvorfor, ikke bare ja/nej. "Ingen kunde" og "allerede
 *  faktureret" kræver hver sin handling — eller ingen. */
function Salgstilstand({ i, l }) {
  if (l.grundlagslinjeId) return <Pille tone="ok">På grundlag</Pille>;
  const tjek = kanFaktureres(i, l);
  if (tjek.ok) return <Pille tone="warn">Kan faktureres</Pille>;
  return <Pille tone="info" title={tjek.aarsag}>Ikke fakturerbar</Pille>;
}
