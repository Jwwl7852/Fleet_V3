/* src/moduler/facility/Oversigt.jsx
 * Facility – overblik, fejl & klima
 *
 * ⚠ SENSORVÆRDIERNE KOMMER FRA SAMME NODE SOM KLIMA-SKÆRMEN.
 *
 * I mockupsene viste de to skærme FORSKELLIGE temperaturer for de samme
 * zoner — kun Depot 2 stemte. Begge læser nu facility/sensorer/<zoneId>, i
 * demo gennem zonePar() i demo-facility.js. Der er ét sted at hente tallet,
 * så de kan ikke være uenige.
 *
 * ALARMEN ER AFLEDT, ikke gemt. alarmTilstand() sammenholder målingen med
 * ZONENS grænse. Et lagret alarmflag ville drive fra målingen i det sekund
 * nogen justerede grænsen — og så stod der grønt på noget der ikke var det.
 *
 * "Aktive klimaalarmer" beregnes derfor HER og står ikke i kpi/. Det er samme
 * slags tal som bemanding.ledig: afledt, og dermed noget der ikke skal gemmes.
 * `klimaalarmerIDag` er derimod et rigtigt nøgletal — det kræver historik.
 *
 * FACILITY ER FÆLLES. Skærmen reagerer ikke på Gods/Bus-toggle'en.
 *
 * ---------------------------------------------------------------------------
 * MOCKUPPEN, OG HVAD DER IKKE BLEV SOM DEN
 *
 * 1. LOKATIONERNE ER VORES. Mockuppen skrev Hovedlager–Greve, Terminal–
 *    Taastrup, Værksted–Greve, Kontor–København og Kølehus–Greve. Ingen af
 *    dem findes. Stederne kommer fra STED i fleet/steder.js — samme fire som
 *    personalet er stationeret på og køretøjerne har hjemme, og nu har alle
 *    fire en facilitet. Havde de ikke det, ville halvdelen af flåden stå på
 *    et sted der ikke fandtes i bygningsdata.
 * 2. LOKATIONENS STATUS ER AFLEDT. Mockuppens Normal/Advarsel/Kritisk ligner
 *    et felt; det er lokationTilstand() over anlæg, åbne fejl og klimaalarmer.
 *    Et gemt statusfelt ville drive fra anlæggene under det.
 * 3. DONUTTEN HAR FEM SLICES, IKKE SEKS. Seriepaletten har fem farver, valgt
 *    fordi de kan skelnes — også uden farvesyn (beslutning 30). En sjette
 *    ville genbruge farve ét. aktivFordeling() folder resten til Øvrige og
 *    fortæller i legenden hvad den indeholder.
 * 4. "78 % KAPACITET" PÅ VENTILATIONEN ER IKKE MED. Der findes ingen
 *    kapacitetsmåling. Et procenttal opfundet til lejligheden ville se ud som
 *    en måling — rækken siger i stedet hvor mange anlæg der kører.
 * 5. ESTIMERET OMKOSTNING ER AFLEDT af det planlagte servicebesøg på anlægget,
 *    ikke et felt på anlægget selv. Et anlæg uden planlagt besøg har ikke et
 *    estimat på nul — det har intet estimat, og der står en streg.
 * 6. INGEN ⋮-MENU. Skrivning er ikke bygget; en menu med grå punkter er værre
 *    end ingen menu. Rækken er til gengæld klikbar og styrer driftskortet.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato, deviation, serviceTone } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Gitter,
  MiniLinje, Donut, Ikon, Sider, Knap, Felt, Feltraekke, Formular,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  AKTIV_ART, AKTIV_STATUS, FEJL_STATUS, LOKATION_TYPE,
  ALLE_AKTIV_ARTER, ALLE_AKTIV_STATUS,
  alarmTilstand, aktiveAlarmer, lokationTilstand, driftsforhold, aktivFordeling,
  zonePar,
  valideAktiv, byggAktiv, valideFejl, byggFejl,
} from "../../fleet/facility.js";
import { alvorTone, ALVOR } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import {
  DEMO_SERVICEBESOEG,
  demoAktiv, demoLokation,
} from "../../fleet/demo-facility.js";
import { DEMO_PERSONALE } from "../../fleet/demo-personale.js";

const PR_SIDE = 5;

/**
 * En afvigelse man ikke har, er ikke en afvigelse på nul.
 *
 * ⚠ deviation(undefined) giver "0" og tonen neutral — altså påstanden "ingen
 * ændring". Det er en oplysning vi ikke har, skrevet som om vi havde den, og
 * det er samme fejl som at oversætte en afvist læsning til "ingen
 * forbindelse". Mangler feltet, siger noten det i stedet.
 *
 * Det ER en tilstand man møder: appen læser kpi/ fra basen, og en base der er
 * seedet før feltet fandtes, har det ikke. Nøjagtig sådan stod donutten tom.
 */
const afvig = (vaerdi, opts) =>
  Number.isFinite(vaerdi)
    ? { afvigelse: deviation(vaerdi, opts), note: "vs. forrige periode" }
    : { note: "afvigelsen er ikke aggregeret endnu" };

/* ⚠ HER STOD `personNavn` SOM EN MODUL-KONST BYGGET AF DEMOFILEN — og
   vælgeren i aktivformularen fik det samme sæt. Hos en rigtig kunde ville
   kolonnen "Ansvarlig" stå med en streg på hver række, og formularen ville
   tilbyde folk der ikke findes i basen. Opslaget bygges nu af den hentede
   liste inde i komponenten.
   ⚠ personId, ALDRIG uid — det er hvem det HANDLER om, ikke hvem der gjorde
   noget. En facilityansvarlig har måske intet login. */

/**
 * Estimatet på et anlægs NÆSTE planlagte servicebesøg.
 *
 * AFLEDT, og det skal det blive: prisen står på besøget, hvor den blev aftalt
 * med leverandøren. Kopieret op på anlægget ville den ligge to steder, og den
 * ene ville blive stående når besøget blev ombooket.
 */
function estimatForAktiv(besoeg, aktivId, nu = Date.now()) {
  const mine = besoeg
    .filter((b) => b.aktivId === aktivId && b.status !== "aflyst" && b.til >= nu)
    .sort((a, b) => a.fra - b.fra);
  return mine.length ? mine[0].estimatOere : null;
}

/* ---- Formularerne ------------------------------------------------------ */

const tomtAktiv = () => ({
  navn: "", art: "port", status: "idrift", lokationId: "",
  zoneId: "", ansvarligPersonId: "", serviceIntervalDage: "",
});

const tomFejl = (aktivId = "") => ({
  aktivId, status: "ny", alvor: "mellem", beskrivelse: "", meldtAf: "",
});

/**
 * ⚠ VALIDERINGEN SPEJLER firebase.rules.json og afgør ingenting. Serveren
 * validerer igen, og er de to uenige, er reglerne rigtige.
 *
 * ⚠ ARTEN AFGØR OM ANLÆGGET SKAL HAVE EN ZONE. Et køleanlæg uden zone kan
 * Klima ikke vise temperaturen for — feltet er derfor påkrævet netop dér, og
 * skjult hvor det ikke giver mening.
 */
function Aktivformular({ aktiv, lokationer, zoner, personale, sti, paaGemt, paaLuk }) {
  const nyt = !aktiv;
  const [f, saetF] = useState(() => (aktiv ? { ...tomtAktiv(), ...aktiv } : tomtAktiv()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const fejl = valideAktiv(f, { lokationer, zoner, personale });
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = aktiv?.id || nyId("fa");
    const r = await gem({
      sti: sti(`aktiver/${id}`), data: byggAktiv(f), foer: aktiv || null,
      objekt: "facility", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt(id);
  };

  return (
    <Kort titel={nyt ? "Nyt anlæg" : `Redigér ${aktiv.navn}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret anlæg" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="fa-navn" label="Navn" kraevet vaerdi={f.navn} saet={saet("navn")}
                fejl={vis("navn")} hint="Port 3, Køleanlæg 1 — det navn folk bruger." />
          {/* ⚠ art ER UDSTYRSTYPEN, ikke opgavens art. Samme feltnavn, to
              vokabularer — se ARKITEKTUR. */}
          <Felt id="fa-art" label="Udstyrstype" kraevet vaerdi={f.art} saet={saet("art")}
                fejl={vis("art")}
                valgmuligheder={ALLE_AKTIV_ARTER.map((a) => ({ vaerdi: a, label: AKTIV_ART[a].label }))} />
          <Felt id="fa-status" label="Status" kraevet vaerdi={f.status} saet={saet("status")}
                fejl={vis("status")}
                valgmuligheder={ALLE_AKTIV_STATUS.map((s) => ({ vaerdi: s, label: AKTIV_STATUS[s].label }))} />
        </Feltraekke>

        <Feltraekke>
          <Felt id="fa-lok" label="Lokation" kraevet vaerdi={f.lokationId} saet={saet("lokationId")}
                fejl={vis("lokationId")}
                hint="Et anlæg uden lokation kan ikke vises i driftsstatus."
                valgmuligheder={[{ vaerdi: "", label: "Vælg …" },
                  ...lokationer.map((l) => ({ vaerdi: l.id, label: l.navn }))]} />
          {AKTIV_ART[f.art]?.maalesZone && (
            <Felt id="fa-zone" label="Zone" kraevet vaerdi={f.zoneId} saet={saet("zoneId")}
                  fejl={vis("zoneId")}
                  hint="Arten måles i en zone — uden den kan Klima ikke vise dens temperatur."
                  valgmuligheder={[{ vaerdi: "", label: "Vælg …" },
                    ...zoner.map((z) => ({ vaerdi: z.id, label: z.navn }))]} />
          )}
        </Feltraekke>

        <Feltraekke>
          {/* ⚠ personId, ALDRIG uid. Den ansvarlige er hvem det HANDLER om;
              en facilityansvarlig har måske intet login. Beslutning 18. */}
          <Felt id="fa-ansv" label="Ansvarlig" vaerdi={f.ansvarligPersonId}
                saet={saet("ansvarligPersonId")} fejl={vis("ansvarligPersonId")}
                hint="En medarbejder — ikke et login. Personen findes uden konto."
                valgmuligheder={[{ vaerdi: "", label: "Ingen" },
                  ...personale.map((p) => ({ vaerdi: p.id, label: p.navn }))]} />
          <Felt id="fa-interval" label="Serviceinterval" type="number" suffiks="dage"
                vaerdi={f.serviceIntervalDage} saet={saet("serviceIntervalDage")}
                fejl={vis("serviceIntervalDage")} />
        </Feltraekke>
      </Formular>

      <p className="fc-hint" style={{ marginTop: 14 }}>
        Der er <b>ingen division</b> på et facility-anlæg. Facility er{" "}
        <b>fælles</b> — porten er den samme uanset hvem der kører igennem den —
        og reglerne afviser feltet.
      </p>
    </Kort>
  );
}

/**
 * ⚠ ALVOREN ER ET VALG, IKKE EN UDLEDNING. Den der melder fejlen, ved om
 * porten står helt stille eller bare lukker langsomt. Det kan ingen regel
 * regne sig frem til bagefter — og alvoren afgør om lokationen bliver kritisk.
 */
function Fejlformular({ fejlpost, aktiver, sti, paaGemt, paaLuk }) {
  const nyt = !fejlpost;
  const [f, saetF] = useState(() => (fejlpost ? { ...tomFejl(), ...fejlpost } : tomFejl()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const fejl = valideFejl(f, { aktiver });
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = fejlpost?.id || nyId("fe");
    const r = await gem({
      sti: sti(`fejl/${id}`), data: byggFejl(f), foer: fejlpost || null,
      objekt: "facility", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt(id);
  };

  return (
    <Kort titel={nyt ? "Meld en fejl" : "Opdatér fejlmelding"}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Meld fejl" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="fe-aktiv" label="Anlæg" kraevet vaerdi={f.aktivId} saet={saet("aktivId")}
                fejl={vis("aktivId")}
                valgmuligheder={[{ vaerdi: "", label: "Vælg …" },
                  ...aktiver.map((a) => ({
                    vaerdi: a.id,
                    label: `${a.navn} · ${demoLokation(a.lokationId)?.navn || "—"}`,
                  }))]} />
          <Felt id="fe-alvor" label="Alvor" kraevet vaerdi={f.alvor} saet={saet("alvor")}
                fejl={vis("alvor")}
                hint="Høj gør lokationen kritisk i overblikket. Vælg den kun når noget ikke virker nu."
                valgmuligheder={[
                  { vaerdi: "hoej", label: ALVOR.hoej },
                  { vaerdi: "mellem", label: ALVOR.mellem },
                  { vaerdi: "lav", label: ALVOR.lav },
                ]} />
          <Felt id="fe-status" label="Status" kraevet vaerdi={f.status} saet={saet("status")}
                fejl={vis("status")}
                valgmuligheder={Object.entries(FEJL_STATUS).map(([v, s]) => ({ vaerdi: v, label: s.label }))} />
        </Feltraekke>

        <Felt id="fe-besk" label="Beskrivelse" kraevet vaerdi={f.beskrivelse}
              saet={saet("beskrivelse")} fejl={vis("beskrivelse")}
              hint="Hvad sker der, og hvornår? Den her læses af den der skal ud og se på det." />
        <Felt id="fe-meldt" label="Meldt af" vaerdi={f.meldtAf} saet={saet("meldtAf")}
              fejl={vis("meldtAf")} />
      </Formular>

      <p className="fc-hint" style={{ marginTop: 14 }}>
        ⚠ <b>Alvoren er et valg.</b> Den afgør om lokationen står{" "}
        <b>Kritisk</b> i overblikket, og den kan ingen regel regne sig frem til
        bagefter — den der melder fejlen, ved om porten står stille eller bare
        lukker langsomt.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        Beskrivelsen er <b>fritekst</b> og havner derfor <b>ikke</b> i
        auditloggen — kun at fejlen blev meldt, af hvem og på hvilket anlæg.
        Allowlisten i <code>audit-regler.js</code> holder fritekst ude.
      </p>
    </Kort>
  );
}

export default function FacilityOversigt() {
  const { kpi: k, henter, tilstand, genindlaes } = useKpi();

  /* ⚠ FEM NODER, IKKE ÉN. `facility` har børn, og hvert barn er sin egen
     liste: lokationer, aktiver, fejl, zoner og sensorer. Skærmen læste dem
     alle fra demo-facility.js indtil noden blev seedet.

     ⚠ REGLERNE FORBYDER `division` PÅ LOKATIONER, AKTIVER OG FEJL — facility
     er fælles, og det var det allerede før aksen blev fjernet (beslutning 70).
     Samme begrundelse som på køretøjerne.

     ⚠ vindue: "alle" fordi ingen af dem er en tidsserie. Et aktiv har en
     næste service, ikke en dato det "hører til"; filtrerede vi på shellens
     periode, ville halvdelen af portene forsvinde når nogen valgte en uge. */
  const felles = { vindue: "alle", graense: 500 };
  const lok = useListe("facility/lokationer", { ordnPaa: "type", ...felles });
  const akt = useListe("facility/aktiver", { ordnPaa: "naesteServiceMs", ...felles });
  const fej = useListe("facility/fejl", { ordnPaa: "meldtMs", ...felles });
  const zon = useListe("facility/zoner", { ordnPaa: "lokationId", ...felles });
  /* ⚠ KUN SOM FALDBAKKE. `personale` er en seedet node. */
  const pers = useListe("personale", {
    vindue: "alle", graense: 500, demo: DEMO_PERSONALE,
  });
  const personNavn = (personId) =>
    pers.data.find((p) => p.id === personId)?.navn || "—";
  /* Sensorerne er nøglet på ZONEN — en zone har én måling ad gangen. */
  const sen = useListe("facility/sensorer", { vindue: "alle", graense: 500 });

  const { bruger, path } = useFleet();
  const [valgtLokId, setValgtLokId] = useState(null);
  const [side, setSide] = useState(1);
  /* null = lukket, "ny" = opret, ellers nøglen på den post der redigeres. */
  const [aktivform, setAktivform] = useState(null);
  const [fejlform, setFejlform] = useState(null);

  const henterNoget = henter || lok.henter || akt.henter || fej.henter
    || zon.henter || sen.henter;
  if (henterNoget) return <Henter hvad="facility" />;
  /* ⚠ EN AFVIST LÆSNING ER IKKE EN TOM LISTE. Aktiverne blokerer, hvor
     nøgletallene ikke gør — en tom aktivtabel ligner et anlæg uden aktiver. */
  if (blokerer(akt.tilstand)) {
    return <Datatilstand tilstand={akt.tilstand} genprov={akt.genindlaes} />;
  }
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  /* ÉN kilde. Klima-skærmen kalder den samme funktion med sine egne rækker. */
  const par = zonePar(zon.data, sen.data);
  const alarmer = aktiveAlarmer(par);
  /* ⚠ ALT DER IKKE ER UDBEDRET. En fejl der er planlagt eller i gang, er
     stadig en fejl der ikke er væk — samme regel som facilitytal(). */
  const aabne = fej.data.filter((f) => f.status !== "udbedret");
  const ctx = { aktiver: akt.data, aabneFejl: aabne, par };
  /* Zonerne til formularens vælger — samme kilde som klimalisten. */
  const zoner = par.map((p) => p.zone);
  const maaSkrive = harPerm(bruger?.perms, PERM.facilitySkriv);

  const valgtLok = lok.data.find((l) => l.id === valgtLokId) || lok.data[0];
  const drift = valgtLok ? driftsforhold(valgtLok.id, ctx) : [];

  const fordeling = aktivFordeling(k?.facility?.aktiverPrArt || {});

  /* ⚠ IKKE num(undefined) OG IKKE NUL. En ny kunde har ingen aggregerede tal,
     og "0 aktiver" ville være en påstand om at han ingen har. Se blokerer()
     i datatilstand.js — skærmen skal kunne bruges uden nøgletallene. */
  const kpiTal = (v) => (Number.isFinite(v) ? num(v) : "ikke aggregeret");

  /* Aktivtabellen sorteres efter hvornår service forfalder — det er den
     rækkefølge man arbejder listen i. */
  const aktiver = [...akt.data].sort((a, b) => a.naesteServiceMs - b.naesteServiceMs);
  const sider = Math.max(1, Math.ceil(aktiver.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const paaSiden = aktiver.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {k && (
        <KpiRaekke>
          {/* Runde ikoner med chevron, som resten af appen. Tonerne er
              IKONACCENTER: farven forstærker, tallet og teksten bærer.
              Afvigelserne KRÆVER historik og kommer derfor fra kpi/ — de kan
              ikke regnes af de femten demo-aktiver skærmen har. */}
          <KpiKort label="Aktiver i drift" vaerdi={num(k.facility.aktiver)}
                   ikon={<Ikon navn="bygning" />} tone="ikon-5" rund til="/facility"
                   {...afvig(k.facility.aktiverDeltaPct, { betterWhen: "higher", unit: "pct" })} />
          <KpiKort label="Servicepunkter forfalder" vaerdi={num(k.facility.servicepunkterForfalder)}
                   ikon={<Ikon navn="skruenoegle" />} tone="ikon-2" rund
                   til="/facility/servicekalender"
                   {...afvig(k.facility.servicepunkterDelta, { betterWhen: "lower" })} />
          <KpiKort label="Åbne facility-sager" vaerdi={num(k.facility.aabneSager)}
                   ikon={<Ikon navn="udraab" />} tone="ikon-1" rund
                   til="/facility/servicekalender"
                   {...afvig(k.facility.aabneSagerDelta, { betterWhen: "lower" })} />
          <KpiKort label="Planlagt vedligehold" vaerdi={num(k.facility.planlagtVedligehold)}
                   ikon={<Ikon navn="kalender" />} tone="ikon-6" rund
                   til="/facility/servicekalender"
                   {...afvig(k.facility.planlagtVedligeholdDelta, { betterWhen: "higher" })} />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Gitter kolonner="repeat(auto-fit, minmax(300px, 1fr))">
        <Kort titel="Lokationer"
              handling={<Link className="fc-a" to="/facility/servicekalender">Se servicekalenderen</Link>}>
          {/* Rækken er klikbar og styrer driftskortet til højre. Mockuppen
              har et fast "Hovedlager Greve"; her følger kortet det sted man
              spørger om, så de to ikke kan komme til at handle om hver sit. */}
          {lok.data.map((l) => {
            const t = lokationTilstand(l.id, ctx);
            const valgt = l.id === valgtLokId;
            return (
              <button key={l.id} type="button"
                      className={`fc-lokrk${valgt ? " fc-lokrk-nu" : ""}`}
                      aria-pressed={valgt}
                      onClick={() => setValgtLokId(l.id)}>
                <span className="fc-med-ikon"><Ikon navn="bygning" /></span>
                <span className="fc-lokrk-txt">
                  <b>{l.navn}</b>
                  <span>{LOKATION_TYPE[l.type] || l.type}</span>
                </span>
                <span className="fc-lokrk-m2">{num(l.arealM2)} m²</span>
                <Pille tone={t.tone}>{t.tekst}</Pille>
              </button>
            );
          })}
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Statussen er <b>afledt</b> af anlæg, åbne fejl og klimaalarmer på stedet
            — den er ikke et felt. Et gemt statusfelt ville stå Kritisk på en hal
            hvor alt virkede, så snart den sidste fejl blev lukket. Stederne kommer
            fra <b>STED</b>, samme katalog som personale og flåde bruger.
          </p>
        </Kort>

        <Kort titel="Aktivoversigt"
              handling={<Link className="fc-a" to="/facility/servicekalender">Se alle aktiver</Link>}>
          {/* ⚠ ET MANGLENDE FELT ER IKKE "INGEN DATA I PERIODEN".
              Donut-primitivet siger det sidste, når listen er tom, og det er
              rigtigt for en periode uden aktivitet — men forkert her: feltet
              er ikke aggregeret endnu, og det er en helt anden ting at gøre
              noget ved. Samme skelnen som dataTilstand() laver mellem en
              afvist læsning og en manglende forbindelse.
              Det ER sket: appen læser kpi/ fra basen, og en base seedet før
              aktiverPrArt fandtes, har feltet ikke. Kør npm run
              provisioner:dev. */}
          {!fordeling.length ? (
            <Tom>
              <b>aktiverPrArt</b> findes ikke i <code>kpi/</code> for denne tenant.
              Fordelingen er ikke aggregeret endnu — det er ikke det samme som
              at der ingen aktiver er; nøgletallet ovenfor siger{" "}
              {kpiTal(k?.facility?.aktiver)}.
            </Tom>
          ) : (
            <Donut
              dele={fordeling}
              total={k?.facility?.aktiver}
              midteTekst="aktive"
              format={(v) => num(v)}
            />
          )}
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Fordelingen af alle <b>{kpiTal(k?.facility?.aktiver)}</b> aktiver kommer fra{" "}
            <b>kpi/</b> — den kan ikke regnes af de {num(akt.data.length)} hentede.
            Højst fem slices: seriepaletten har fem farver der kan skelnes fra
            hinanden, også uden farvesyn, og en sjette ville genbruge den første.
            {fordeling.find((d) => d.dele)
              ? ` Øvrige er ${fordeling.find((d) => d.dele).dele.join(" og ")}.`
              : ""}
          </p>
        </Kort>

        <Kort titel={`Driftsforhold — ${valgtLok?.navn || "—"}`}
              handling={<Link className="fc-a" to="/facility/klima">Se klima &amp; energi</Link>}>
          {!drift.length ? (
            <Tom>Ingen anlæg registreret på lokationen.</Tom>
          ) : drift.map((r) => (
            <MiniLinje
              key={r.label}
              label={<span className="fc-med-ikon fc-med-ikon-svag">
                <Ikon navn={r.ikon} />{r.label}
              </span>}
              vaerdi={<>{r.vaerdi} <Pille tone={r.tone}>{r.tekst}</Pille></>}
            />
          ))}
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Temperaturen er lokationens <b>koldeste</b> zone — et kontor på 21 grader
            siger intet om et kølerum ved siden af. Tallene kommer fra{" "}
            <b>facility/sensorer</b>, samme node som Klima læser. Mockuppens{" "}
            <b>78 % kapacitet</b> på ventilationen findes ikke som måling, og et
            opfundet procenttal ville ligne en.
          </p>
        </Kort>
      </Gitter>

      {/* Formularerne står OVER den tabel de skriver til, så man kan se
          resultatet uden at rulle. `key` nulstiller felterne når man skifter
          fra én post til en anden — ellers bærer formularen den forriges
          værdier med sig. */}
      {aktivform && (
        <Aktivformular
          key={aktivform}
          aktiv={aktivform === "ny" ? null : akt.data.find((a) => a.id === aktivform)}
          lokationer={lok.data}
          zoner={zoner}
          personale={pers.data.filter((p) => p.status === "aktiv")}
          sti={(under) => path(`facility/${under}`)}
          paaGemt={() => { setAktivform(null); genindlaes(); }}
          paaLuk={() => setAktivform(null)}
        />
      )}
      {fejlform && (
        <Fejlformular
          key={fejlform}
          fejlpost={fejlform === "ny" ? null : fej.data.find((x) => x.id === fejlform)}
          aktiver={akt.data}
          sti={(under) => path(`facility/${under}`)}
          paaGemt={() => { setFejlform(null); genindlaes(); }}
          paaLuk={() => setFejlform(null)}
        />
      )}

      <Kort titel={`Aktiver (${num(akt.data.length)} hentede af ${kpiTal(k?.facility?.aktiver)})`}
            handling={
              <Knap variant="primaer" disabled={!maaSkrive}
                    onClick={() => { setAktivform("ny"); setFejlform(null); }}
                    title={maaSkrive ? "Opret et nyt anlæg."
                                     : "Kræver facility.skriv — serveren afviser."}>
                Nyt anlæg
              </Knap>
            }>
        <Tabel
          kolonner={[
            { key: "navn", label: "Aktiv", render: (r) => <b>{r.navn}</b> },
            { key: "art", label: "Kategori", render: (r) => AKTIV_ART[r.art]?.label || r.art },
            { key: "lokationId", label: "Lokation", render: (r) => (
                <span className="fc-med-ikon fc-med-ikon-svag">
                  <Ikon navn="bygning" />{demoLokation(r.lokationId)?.navn || "—"}
                </span>
              ) },
            /* Dato OG frist. serviceTone() ét sted — samme tre trin som Flåde,
               Kompetencer og Facility-kalenderen bruger. */
            { key: "naesteServiceMs", label: "Næste service", render: (r) => {
                const s = serviceTone(r.naesteServiceMs);
                return (
                  <div className="fc-tolinje">
                    <b className={s.tone === "bad" ? "fc-bad" : undefined}>
                      {dato(r.naesteServiceMs)}
                    </b>
                    <span className={s.tone === "bad" ? "fc-bad" : undefined}>{s.tekst}</span>
                  </div>
                );
              } },
            /* ⚠ personId, ikke uid. Se noten ved personNavn(). */
            { key: "ansvarligPersonId", label: "Ansvarlig",
              render: (r) => personNavn(r.ansvarligPersonId) },
            { key: "status", label: "Status", render: (r) => (
                <Pille tone={AKTIV_STATUS[r.status]?.pill}>
                  {AKTIV_STATUS[r.status]?.label || r.status}
                </Pille>
              ) },
            { key: "estimat", label: "Estimeret omkostning", num: true, render: (r) => {
                const oere = estimatForAktiv(DEMO_SERVICEBESOEG, r.id);
                /* Intet planlagt besøg er ikke et estimat på nul. */
                return oere == null
                  ? <span className="fc-neutral">—</span>
                  : kr(oere);
              } },
          ]}
          raekker={paaSiden}
          tom="Ingen aktiver oprettet endnu."
        />
        <div className="fc-row" style={{ marginTop: 12, gap: 12, flexWrap: "wrap" }}>
          <p className="fc-hint" style={{ margin: 0 }}>
            Viser {num((nuSide - 1) * PR_SIDE + 1)}–{num((nuSide - 1) * PR_SIDE + paaSiden.length)}{" "}
            af {num(aktiver.length)} hentede. Platformens tal er{" "}
            <b>{kpiTal(k?.facility?.aktiver)}</b>, og de to skal ikke gå op mod hinanden:
            listen er et udsnit. Sorteret efter hvornår service forfalder.
          </p>
          <Sider side={nuSide} antal={aktiver.length} prSide={PR_SIDE} saet={setSide} />
        </div>
        <p className="fc-hint" style={{ marginTop: 10 }}>
          <b>Estimeret omkostning</b> er prisen på anlæggets næste planlagte
          servicebesøg — den står på besøget, hvor den blev aftalt med
          leverandøren. Kopieret op på anlægget ville den blive stående, når
          besøget blev ombooket. Beløb er ekskl. moms.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort
          titel={`Åbne fejl (${aabne.length})`}
          handling={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Link className="fc-a" to="/facility/servicekalender">Se servicekalenderen</Link>
              <Knap variant="primaer" disabled={!maaSkrive}
                    onClick={() => { setFejlform("ny"); setAktivform(null); }}
                    title={maaSkrive ? "Meld en fejl på et anlæg."
                                     : "Kræver facility.skriv — serveren afviser."}>
                Meld fejl
              </Knap>
            </div>
          }
        >
          <Tabel
            kolonner={[
              { key: "meldtMs", label: "Meldt", render: (r) => dato(r.meldtMs) },
              { key: "aktivId", label: "Anlæg", render: (r) => {
                  const a = demoAktiv(r.aktivId);
                  return <><b>{a?.navn}</b> <span className="fc-neutral">
                    · {demoLokation(a?.lokationId)?.navn}</span></>;
                } },
              { key: "beskrivelse", label: "Beskrivelse" },
              { key: "meldtAf", label: "Meldt af" },
              { key: "alvor", label: "Prioritet",
                render: (r) => <Pille tone={alvorTone(r.alvor)}>{ALVOR[r.alvor]}</Pille> },
              { key: "status", label: "Status",
                render: (r) => <Pille tone={FEJL_STATUS[r.status]?.pill}>{FEJL_STATUS[r.status]?.label}</Pille> },
            ]}
            raekker={aabne}
            tom="Ingen åbne fejl."
          />
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Viser {num(aabne.length)} af {num(fej.data.length)} hentede fejl.{" "}
            <b>{kpiTal(k?.facility?.aabneFejl)}</b> er platformens tal fra <code>kpi/</code> —
            listen her er et udsnit og skal ikke gå op mod det.
          </p>
        </Kort>

        <Kort
          titel="Klima nu"
          handling={<Link className="fc-a" to="/facility/klima">Se klima &amp; energi</Link>}
        >
          {/* SAMME liste som Klima-skærmen viser. Ét opslag, to visninger. */}
          {par.map(({ zone, maaling }) => {
            const a = alarmTilstand(zone, maaling);
            return (
              <MiniLinje
                key={zone.id}
                label={zone.navn}
                vaerdi={maaling
                  ? <>{maaling.tempC.toFixed(1)} °C <Pille tone={a.tone}>{a.tekst}</Pille></>
                  : <span className="fc-neutral">ingen måling</span>}
              />
            );
          })}
          <p className="fc-hint" style={{ marginTop: 10 }}>
            <b>{num(alarmer.length)}</b> aktive alarmer, beregnet nu — tallet står{" "}
            <b>ikke</b> i <code>kpi/</code>, fordi det er afledt af målingen og zonens
            grænse. Tallene kommer fra <b>facility/sensorer</b>, samme node som Klima
            læser. I mockupsene viste de to skærme forskellige temperaturer for samme
            zoner; nu er der kun ét sted at hente dem.
          </p>
        </Kort>
      </Gitter>
    </div>
  );
}
