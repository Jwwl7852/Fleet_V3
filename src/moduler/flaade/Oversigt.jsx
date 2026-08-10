/* src/moduler/flaade/Oversigt.jsx
 * Flåde – køretøjer
 *
 * DET HER ER STEDET HVOR EN ENHED OPRETTES. Datamodellen kom med beslutning 18.
 *
 * FLÅDEN ER IKKE EN LISTE AF BILER. NI arter i to grupper — se fleet/flaade.js:
 *
 *   motoriseret  traekker, lastbil, varevogn, bus, minibus, scooter, truck
 *   paahaengt    trailer, paahaeng — eget registreringsnummer, egen synsfrist,
 *                egne dæk, men ingen motor
 *
 * (Skeletnoten sagde "syv arter" og listede fem motoriserede. Den var skrevet
 * før bus og minibus kom til, og den ville have vildledt den næste.)
 *
 * `art` STYRER FELTSKEMAET. Det er ikke en talemåde her: detaljepanelet bygges
 * af felterFor(art), så en trailer ikke får en kilometerstand og en scooter
 * ikke får en tachograf. ET FELT DER IKKE FINDES ER IKKE ET TOMT FELT — vises
 * det som "—", ligner det en mangel nogen bør udfylde, og så bliver den
 * udfyldt. Rækken udelades helt.
 *
 * FIRE TING FRA SKELETNOTEN, OG HVOR DE STÅR I KODEN:
 *
 *  1. laengdeMm er MILLIMETER som integer. Færgetakster har grænser ved 10 og
 *     20 m, og 9,998 mod 10,002 afgør prisen. Panelet viser både meter og
 *     millimetertallet — så man kan se hvad der faktisk er gemt. Samme
 *     disciplin som øre i beslutning 2.
 *  2. En trailer kan reserveres selvstændigt, men ikke disponeres alene.
 *     Panelet spørger kanDisponeres() frem for at skrive reglen her — ellers
 *     står reglen to steder, og Disponering får sit eget svar.
 *  3. En solgt bil kan ikke slettes. Der er INGEN Slet-knap: reglernes
 *     newData.exists() afviser en sletning, fordi der hænger indberetninger og
 *     omkostningshistorik på id'et. Man sætter status til `solgt`, og posten
 *     bliver stående. Bil 77 og Påhæng 7 er eksemplerne i demo-sættet.
 *  4. liveGPS hører i sensitive/koeretoejer bag koeretoejer.sensitiveLaes.
 *     Panelet fortæller hvad der ligger der frem for at lade som om det ikke
 *     findes — beslutning 17 gjort synlig.
 *
 * INGEN DIVISION. Et køretøj har ingen (beslutning 19), og reglerne afviser
 * feltet. Byg ikke et divisionsfelt ind i en formular — det ville fejle ved
 * skrivningen. Skærmen reagerer derfor heller ikke på Gods/Bus-toggle'en;
 * division:"alle" står eksplicit, så det ikke ser ud som om den bare var heldig.
 *
 * SKRIVNING ER IKKE BYGGET. Knapperne står der, deaktiverede, med forklaringen.
 *
 * ⚠ Rosteren er et UDSNIT. kpi/ siger 42 aktive i gods og 18 i bus; demo-sættet
 * har 16 enheder i alt og kan ikke ramme nogen af de to tal, fordi et køretøj
 * ikke har en division at deles op på. Nøgletallene øverst kommer fra kpi/ —
 * tabellen tæller sig selv og skriver "af N hentede". At lade tabellen fodre
 * et KpiKort ville være beslutning 6 brudt.
 *
 * ---------------------------------------------------------------------------
 * MOCKUPPEN, OG HVAD DER IKKE BLEV BYGGET SOM DEN
 *
 * 1. INGEN PERIODEVÆLGER I FILTERKORTET. Mockuppen har en; shellen ejer den
 *    allerede. To periodevælgere på samme skærm kan blive uenige, og så er det
 *    brugeren der skal gætte hvilken der gjaldt. Nedetiden nedenfor regnes af
 *    `periode` fra shellen — samme vindue som resten af appen.
 * 2. INGEN "ANVEND FILTRE"-KNAP. Filtrene virker med det samme. En knap gør et
 *    filter til noget man kan glemme at trykke på, og så viser tabellen noget
 *    andet end det der står i felterne.
 * 3. DETALJEPANELET BLEV. Mockuppen har intet, men det er dér "art styrer
 *    feltskemaet" og beslutning 17 kan SES. Tabellen fik fuld bredde som i
 *    billedet, og panelet flyttede ned under den.
 * 4. INGEN ⋮-MENU PR. RÆKKE. Der er ingen handlinger at lægge i den —
 *    skrivning er ikke bygget. En menu med tre deaktiverede punkter er værre
 *    end ingen menu.
 * 5. INGEN SPARKLINE i omkostningslisten. Der findes ingen tidsserie pr. bil.
 *    Afvigelsen mod flådens gennemsnit står i stedet, og DEN er regnet af tal
 *    vi har.
 *
 * TO AFLEDTE TAL, OG DE BLIVER AFLEDTE:
 *
 *   Åbne fejl   aabneFejlFor() over indberetningerne
 *   Nedetid     nedetidMs() over værkstedsbesøgene, klippet til perioden
 *
 * Ingen af dem må havne i kpi/. De er regnet af data skærmen allerede har, og
 * et gemt afledt tal driver fra sit grundlag — det er fejlen i
 * `bemanding.ledig`, og undtagelsen i CLAUDE.md er skrevet for præcis den her
 * slags.
 *
 * LOKATIONEN ER ET KATALOG. Mockuppen skrev Greve, Ballerup, Roskilde og Køge;
 * de findes ikke. Køretøjerne har fået `hjemsted` fra fleet/steder.js — samme
 * fire steder som personalet står på. Ét stedkatalog, så en bil i "Ålborg" og
 * en chauffør i "Aalborg" ikke kan stå to forskellige steder.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, km, meter, dato, datoTid, deviation, serviceTone } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  ENHEDSART, ALLE_ARTER, KOERETOEJ_STATUS, GRUPPE, FELT,
  felterFor, harFelt, gruppeFor, erPaahaengt, kanDisponeres, kraevedeKompetencer,
  KOMPETENCE_LABEL, ikonForArt, nedetidDage,
} from "../../fleet/flaade.js";
import { HAENDELSE_ART, FORLOEB, aabneFejlFor } from "../../fleet/indberetninger.js";
import { stederI } from "../../fleet/steder.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { DEMO_BESOEG } from "../../fleet/demo-vaerksted.js";
import { DEMO_INDBERETNINGER } from "../../fleet/demo-indberetninger.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Tom, Gitter, MiniLinje, Knap,
  KpiKort, KpiRaekke, Ikon, Sider,
} from "../../fleet/ui.jsx";
import { vaerste } from "../../fleet/datatilstand.js";

const PR_SIDE = 8;

const passerSoegning = (k, q) =>
  !q || [k.kaldenavn, k.navn, k.registrering, k.tachografNr]
    .some((v) => (v || "").toLowerCase().includes(q));

/* Feltetiketterne ét sted. Skriver hver skærm sine egne, hedder det
   "Målerstand" her og "Km-stand" på næste. */
const FELT_LABEL = {
  [FELT.kmStand]: "Kilometerstand",
  [FELT.driftPrKmOere]: "Driftsomkostning pr. km",
  [FELT.kapacitet]: "Kapacitet",
  [FELT.saeder]: "Sæder",
  [FELT.naesteServiceMs]: "Næste service",
  [FELT.synMs]: "Syn",
  [FELT.tachografNr]: "Tachograf",
};

function feltVaerdi(enhed, felt) {
  switch (felt) {
    case FELT.kmStand: return km(enhed.kmStand);
    /* driftPrKmOere er UDEN chauffør — beslutning 11's 3,42 kr.
       Kalkulationsprisen inkl. chauffør ligger i Bookingopsætning. */
    case FELT.driftPrKmOere: return kr(enhed.driftPrKmOere, 2);
    case FELT.kapacitet:
      return `${num(enhed.kapacitet?.m3 || 0)} m³ · ${num(enhed.kapacitet?.kg || 0)} kg`;
    case FELT.saeder: return num(enhed.saeder);
    case FELT.tachografNr: return enhed.tachografNr || "—";
    default: return null;
  }
}

/* Service og syn er datoer med en frist — samme tre trin som Facility og
   Kompetencer bruger. serviceTone() ét sted, ikke tre tærskler i tre filer. */
function FristLinje({ label, ms }) {
  if (ms == null) return null;
  const s = serviceTone(ms);
  return (
    <MiniLinje
      label={label}
      vaerdi={<>{dato(ms)} <Pille tone={s.tone}>{s.tekst}</Pille></>}
    />
  );
}

/**
 * Servicecellen: datoen, og hvor langt der er til den.
 *
 * ⚠ TO FRISTER, IKKE ÉN. En service forfalder på DATO eller på KILOMETER, alt
 * efter hvad der kommer først, og de kan pege hver sin vej: en bil der har
 * stået stille i to måneder, er tæt på datoen og langt fra kilometeren. Vises
 * kun den ene, planlægger værkstedet efter den forkerte.
 *
 * Kilometerlinjen udelades hvor arten ikke HAR en kilometerstand — en trailer
 * har ingen motor. Et felt der ikke findes, vises ikke som tomt.
 */
function ServiceCelle({ enhed }) {
  if (enhed.naesteServiceMs == null) return <span className="fc-neutral">—</span>;
  const s = serviceTone(enhed.naesteServiceMs);
  const overskredet = enhed.naesteServiceMs < Date.now();
  const restKm = Number.isFinite(enhed.naesteServiceKm) && Number.isFinite(enhed.kmStand)
    ? enhed.naesteServiceKm - enhed.kmStand
    : null;

  return (
    <div className="fc-tolinje">
      {overskredet
        ? <b className="fc-bad">Overskredet</b>
        : <b>{dato(enhed.naesteServiceMs)}</b>}
      <span className={overskredet ? "fc-bad" : undefined}>
        {overskredet
          ? `siden ${dato(enhed.naesteServiceMs)}`
          : restKm == null ? s.tekst
          : restKm <= 0 ? `${km(-restKm)} over intervallet`
          : `om ${km(restKm)}`}
      </span>
    </div>
  );
}

export default function FlaadeOversigt() {
  const { bruger, periode } = useFleet();
  const { kpi: k, henter: henterKpi, tilstand: kpiTilstand, genindlaes: genindlaesKpi } = useKpi();
  const [valgtId, setValgtId] = useState(null);
  const [soeg, setSoeg] = useState("");
  const [art, setArt] = useState("");
  const [sted, setSted] = useState("");
  const [visAlle, setVisAlle] = useState(false);
  const [side, setSide] = useState(1);

  /* Server-side filtreres på ét felt: status. Det er indekseret
     (".indexOn": ["status", "art", "naesteServiceMs"]), og `aktiv` er langt
     det almindeligste opslag — man leder efter en bil man kan bruge i morgen,
     ikke efter dem der er solgt.

     "Alle" skifter til vindue:"alle" frem for at tilføje et filter, fordi
     useListe kaster hvis man sender både lig og vindue. Arten filtreres
     klientside: RTDB kan kun filtrere på ét felt, og status er det rigtige at
     bruge det på. */
  const { data: flaade, henter, tilstand, genindlaes, afkortet } = useListe("koeretoejer", {
    ordnPaa: "status",
    ...(visAlle ? { vindue: "alle" } : { lig: "aktiv" }),
    /* EKSPLICIT. Posterne har ingen division (beslutning 19), og useListe
       viser divisionsløse rækker i begge toggles — så resultatet ville være
       det samme uden. Men så ville det se ud som om skærmen var heldig. */
    division: "alle",
    graense: 300,
    sorter: (a, b) => (a.kaldenavn || a.navn).localeCompare(b.kaldenavn || b.navn, "da"),
    demo: DEMO_KOERETOEJER,
  });

  if (henterKpi || henter) return <Henter hvad="flåden" />;
  if (!k) return <Datatilstand tilstand={kpiTilstand} genprov={genindlaesKpi} tom="Nøgletallene kunne ikke hentes." />;

  const maaSkrive = harPerm(bruger?.perms, PERM.koeretoejerSkriv);
  const maaSeFoelsomt = harPerm(bruger?.perms, PERM.koeretoejerSensitiveLaes);

  const q = soeg.trim().toLowerCase();
  const viste = flaade.filter((e) =>
    (!art || e.art === art) && (!sted || e.hjemsted === sted) && passerSoegning(e, q));

  /* Stedlisten kommer af de HENTEDE biler, ikke af hele kataloget: står der
     ingen bil i Odense, skal Odense ikke kunne vælges og give nul rækker. */
  const steder = stederI(flaade);
  const harFilter = Boolean(q || art || sted);
  const nulstil = () => { setSoeg(""); setArt(""); setSted(""); setSide(1); };

  /* Siden klippes til det der findes — ellers står man på side 4 af en liste
     der efter et filter kun har to. */
  const sider = Math.max(1, Math.ceil(viste.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const paaSiden = viste.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  /* Valget følger med, når filteret ændrer sig — ellers viser panelet en enhed
     der ikke længere står i tabellen ved siden af. */
  const valgt = viste.find((e) => e.id === valgtId) || null;

  const statusPille = (e) => {
    const s = KOERETOEJ_STATUS[e.status];
    return <Pille tone={s?.pill || "info"}>{s?.label || e.status}</Pille>;
  };

  /* kanDisponeres() frem for at skrive reglen her. Den svarer på ÉN enhed for
     sig; en trailer alene giver derfor "nej", og det er hele pointen. */
  const disponerbar = valgt ? kanDisponeres([valgt]) : null;
  const kompetencekrav = valgt ? kraevedeKompetencer([valgt]) : [];

  /* De tre dyreste pr. km. Afvigelsen måles mod FLÅDENS gennemsnit fra kpi/ —
     ikke mod gennemsnittet af de hentede, som ville flytte sig hver gang nogen
     satte et filter. */
  const dyreste = [...flaade]
    .filter((e) => Number.isFinite(e.driftPrKmOere) && e.status === "aktiv")
    .sort((a, b) => b.driftPrKmOere - a.driftPrKmOere)
    .slice(0, 3);

  const senesteIndberetninger = [...DEMO_INDBERETNINGER]
    .sort((a, b) => (b.oprettetMs || 0) - (a.oprettetMs || 0))
    .slice(0, 4);

  const kaldenavn = (id) => flaade.find((e) => e.id === id)?.kaldenavn || id || "—";

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        {/* Runde ikoner med chevron, som Booking og Bemanding. Tonerne er
            IKONACCENTER: farven forstærker, tallet og teksten bærer.
            Kortet er SELV linket — mockuppen har både en chevron og en
            "Se køretøjer"-linje, men et link inde i et link er ugyldigt
            markup, og to veje til samme sted er én for meget. */}
        <KpiKort label="Aktive køretøjer" vaerdi={num(k.flaade.aktive)}
                 ikon={<Ikon navn="lastbil" />} tone="ikon-5" rund til="/flaade" />
        <KpiKort label="Ude af drift" vaerdi={num(k.flaade.udeAfDrift)}
                 ikon={<Ikon navn="skruenoegle" />} tone="ikon-2" rund
                 note={`heraf ${num(k.flaade.paaVaerksted)} på værksted`}
                 til="/flaade/vaerksted" />
        <KpiKort label="Service inden 30 dage" vaerdi={num(k.flaade.serviceInden30)}
                 ikon={<Ikon navn="ur" />} tone="ikon-3" rund
                 til="/flaade/vaerksted" />
        {/* Driftsomkostning UDEN chauffør. Kalkulationsprisen inkl. chauffør
            er 8,40 kr og ligger i Bookingopsætning — beslutning 11.
            betterWhen:"lower" — en stigning i kroner pr. km er RØD, uanset at
            pilen peger op. Se noten i deviation(). */}
        <KpiKort label="Omkostning pr. km" vaerdi={kr(k.flaade.omkostningPrKmOere, 2)}
                 ikon={<Ikon navn="seddel" />} tone="ikon-6" rund
                 afvigelse={deviation(k.flaade.omkostningPrKmDeltaOere,
                                      { betterWhen: "lower", unit: "kr", dec: 2 })}
                 note="vs. forrige periode" til="/oekonomi" />
      </KpiRaekke>

      <Datatilstand tilstand={vaerste(tilstand, kpiTilstand)}
                    genprov={() => { genindlaes(); genindlaesKpi(); }} />

      {/* Filtrene som eget kort, som mockuppen — men uden dens periodevælger
          og uden "Anvend filtre". Se noten i toppen af filen. */}
      <Kort>
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="fl-soeg">Søg</label>
            <input id="fl-soeg" type="search" value={soeg}
                   placeholder="Kaldenavn, model, nummerplade eller tachograf"
                   onChange={(e) => { setSoeg(e.target.value); setSide(1); }} />
          </div>
          <div className="fc-felt">
            <label htmlFor="fl-art">Køretøjstype</label>
            <select id="fl-art" value={art}
                    onChange={(e) => { setArt(e.target.value); setSide(1); }}>
              <option value="">Alle typer</option>
              {ALLE_ARTER.map((a) => (
                <option key={a} value={a}>{ENHEDSART[a].label}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="fl-sted">Lokation</label>
            <select id="fl-sted" value={sted}
                    onChange={(e) => { setSted(e.target.value); setSide(1); }}>
              <option value="">Alle lokationer</option>
              {steder.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="fl-status">Status</label>
            <select id="fl-status" value={visAlle ? "alle" : "aktiv"}
                    onChange={(e) => { setVisAlle(e.target.value === "alle"); setSide(1); }}>
              <option value="aktiv">Kun aktive</option>
              <option value="alle">Alle, inkl. solgte og skrottede</option>
            </select>
          </div>
          <div className="fc-filtre-knapper">
            <Knap disabled={!harFilter} onClick={nulstil}>Nulstil filtre</Knap>
          </div>
        </div>
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Filtrene virker med det samme. <b>Status</b> filtreres i basen — det er
          det eneste indekserede felt, og RTDB kan kun filtrere på ét. Type og
          lokation filtreres på de hentede rækker.
        </p>
      </Kort>

      <Kort
        titel={`Køretøjer (${num(viste.length)})`}
        handling={
          <div style={{ display: "flex", gap: 8 }}>
            <Knap disabled title="Eksport er ikke bygget endnu.">Eksportér</Knap>
            <Knap variant="primaer" disabled
                  title={maaSkrive ? "Oprettelse er ikke bygget endnu."
                                   : "Kræver koeretoejer.skriv."}>
              Ny enhed
            </Knap>
          </div>
        }
      >
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          Flåden er ikke en liste af biler. <b>Ni arter</b> i to grupper, og{" "}
          <b>arten styrer feltskemaet</b>: en trailer har eget syn og egne dæk,
          men ingen motor og ingen kilometerstand. En påhængt enhed kan
          reserveres alene, men ikke disponeres alene. Klik på en enhed for
          feltskemaet.
        </p>

        <Tabel
          kolonner={[
            { key: "kaldenavn", label: "Enhed", render: (r) => (
                <button type="button" className="fc-a"
                        style={{ background: "none", border: 0, padding: 0, cursor: "pointer",
                                 font: "inherit", fontWeight: 650, textAlign: "left" }}
                        aria-pressed={r.id === valgtId}
                        onClick={() => setValgtId(r.id === valgtId ? null : r.id)}>
                  {r.kaldenavn || r.navn}
                </button>
              ) },
            /* Ikonet kommer fra ART_IKON i flaade.js. Pillen om arten er væk:
               den sagde det samme som ikonet og etiketten gør sammen, og en
               farvet pille pr. række gjorde tabellen til et farvekort. */
            { key: "art", label: "Type", render: (r) => (
                <span className="fc-med-ikon">
                  <Ikon navn={ikonForArt(r.art)} />
                  {ENHEDSART[r.art]?.label || r.art}
                  {gruppeFor(r.art) === GRUPPE.paahaengt && (
                    <span className="fc-neutral"> · påhængt</span>
                  )}
                </span>
              ) },
            { key: "hjemsted", label: "Lokation", render: (r) => (
                r.hjemsted
                  ? <span className="fc-med-ikon"><Ikon navn="stednaal" />{r.hjemsted}</span>
                  : <span className="fc-neutral">—</span>
              ) },
            /* En trailer har ingen kilometerstand. Streg frem for 0 — nul km
               ville se ud som en fabriksny bil. */
            { key: "kmStand", label: "KM", num: true, render: (r) => (
                Number.isFinite(r.kmStand)
                  ? km(r.kmStand)
                  : <span className="fc-neutral">—</span>
              ) },
            { key: "naesteServiceMs", label: "Næste service",
              render: (r) => <ServiceCelle enhed={r} /> },
            { key: "aabneFejl", label: "Åbne fejl", midt: true, render: (r) => {
                const n = aabneFejlFor(DEMO_INDBERETNINGER, r.id);
                return <span className={`fc-antal fc-antal-${Math.min(n, 2)}`}>{n}</span>;
              } },
            /* AFLEDT af værkstedsbesøgene, klippet til shellens periode. */
            { key: "nedetid", label: `Nedetid (dage)`, num: true, render: (r) => {
                const d = nedetidDage(DEMO_BESOEG, r.id, periode.fra, periode.til);
                return <span className={d >= 2 ? "fc-bad" : undefined}>{num(d, 1)}</span>;
              } },
            { key: "driftPrKmOere", label: "Omkostning pr. km", num: true,
              render: (r) => kr(r.driftPrKmOere, 2) },
            { key: "status", label: "Status", render: statusPille },
          ]}
          raekker={paaSiden}
          tom={harFilter ? "Ingen enheder passer på filtrene." : "Ingen enheder oprettet endnu."}
        />

        <div className="fc-row" style={{ marginTop: 12, gap: 12, flexWrap: "wrap" }}>
          <p className="fc-hint" style={{ margin: 0 }}>
            Viser {num(paaSiden.length)} af {num(viste.length)} filtrerede,{" "}
            {num(flaade.length)} hentede. Nedetiden er de{" "}
            <b>{num(periode.dage)} dage</b> shellen står på.
          </p>
          <Sider side={nuSide} antal={viste.length} prSide={PR_SIDE} saet={setSide} />
        </div>

        <p className="fc-hint" style={{ marginTop: 10 }}>
          Tabellen er <b>ikke</b> delt på Gods/Bus: et køretøj har ingen division,
          men er defineret ved sin <b>art</b> — en påhængsvogn kan tilhøre både en
          gods- og en busvognmand. Toggle'en i toppen ændrer derfor ikke denne
          tabel. <b>Åbne fejl</b> og <b>nedetid</b> er regnet her af
          indberetninger og værkstedsbesøg; de ligger ikke i <b>kpi/</b>, fordi et
          gemt afledt tal driver fra sit grundlag.
        </p>
        {afkortet && (
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Der er flere end de 300 hentede. Listen er afkortet — snævr søgningen ind.
          </p>
        )}
      </Kort>

      {valgt && (
        <Gitter kolonner="repeat(auto-fit, minmax(320px, 1fr))">
          <Kort titel={valgt.kaldenavn || valgt.navn} handling={statusPille(valgt)}>
            <MiniLinje label="Model" vaerdi={valgt.navn} />
            <MiniLinje label="Registrering" vaerdi={valgt.registrering || "—"} />
            <MiniLinje label="Art" vaerdi={ENHEDSART[valgt.art]?.label || valgt.art} />
            <MiniLinje
              label="Gruppe"
              vaerdi={gruppeFor(valgt.art) === GRUPPE.paahaengt ? "Påhængt" : "Motoriseret"}
            />
            <MiniLinje label="Hjemsted" vaerdi={valgt.hjemsted || "—"} />
            {/* Både meter og millimeter. Meter er til mennesket, millimeter
                er hvad der faktisk står i basen — og det er millimetertallet
                en færgetakst afgøres på. */}
            <MiniLinje
              label="Længde"
              vaerdi={<>{meter(valgt.laengdeMm)} <span className="fc-neutral">
                ({num(valgt.laengdeMm)} mm)</span></>}
            />

            {/* HER er "art styrer skemaet" konkret: rækkerne kommer fra
                felterFor(), ikke fra en håndskrevet liste. */}
            {felterFor(valgt.art)
              .filter((f) => f !== FELT.naesteServiceMs && f !== FELT.synMs)
              .map((f) => (
                <MiniLinje key={f} label={FELT_LABEL[f]} vaerdi={feltVaerdi(valgt, f)} />
              ))}

            {harFelt(valgt.art, FELT.naesteServiceMs) && (
              <FristLinje label="Næste service" ms={valgt.naesteServiceMs} />
            )}
            {harFelt(valgt.art, FELT.synMs) && (
              <FristLinje label="Syn" ms={valgt.synMs} />
            )}

            {valgt.afgangMs && (
              <MiniLinje label="Afgang" vaerdi={`${dato(valgt.afgangMs)} — ${valgt.afgangAarsag}`} />
            )}

            <p className="fc-hint" style={{ marginTop: 12 }}>
              Feltskemaet kommer fra <b>arten</b>, ikke fra hvad der er udfyldt.{" "}
              {ENHEDSART[valgt.art]?.tachograf
                ? "Denne art har tachograf og køre-hviletid."
                : "Denne art har hverken tachograf eller køre-hviletid, så felterne findes ikke."}{" "}
              Et felt der ikke findes, vises ikke som tomt — et tomt felt bliver udfyldt.
            </p>
          </Kort>

          <Kort titel="Disponering">
            <MiniLinje
              label="Kan disponeres"
              vaerdi={disponerbar.ok
                ? "Ja"
                : <span className="fc-bad">Nej</span>}
            />
            {!disponerbar.ok && (
              <p className="fc-hint" style={{ marginTop: 8 }}>{disponerbar.aarsag}</p>
            )}
            {erPaahaengt(valgt) && (
              <p className="fc-hint" style={{ marginTop: 8 }}>
                Enheden kan <b>reserveres</b> alene — den er en helt almindelig
                eksklusiv ressource, og to biler kan ikke få den samme. Den kan
                bare ikke <b>disponeres</b> alene, og det er en disponeringsregel
                frem for en reservationsegenskab.
              </p>
            )}
            <MiniLinje
              label="Kræver af føreren"
              vaerdi={kompetencekrav.length
                ? kompetencekrav.map((c) => KOMPETENCE_LABEL[c] || c).join(", ")
                : "Ingen"}
            />
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Kravet kommer fra <b>kraevedeKompetencer()</b> — samme kilde som
              Disponering og den Cloud Function der skal skrive etapen. ADR
              kommer fra <b>lasten</b> og kan derfor ikke udledes af enheden
              alene. En <b>udløbet</b> kompetence skal blokere, ikke advare.
            </p>
          </Kort>

          <Kort titel="Stamdata og sletning">
            <p className="fc-hint">
              Der er <b>ingen Slet-knap</b>. Reglernes <b>newData.exists()</b> afviser
              en sletning, fordi der hænger indberetninger, service- og
              omkostningshistorik på id'et. Man sætter status til <b>Solgt</b> eller{" "}
              <b>Skrottet</b>, og posten bliver stående — ellers kan en faktura fra
              sidste kvartal ikke forklares.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Knap disabled title={maaSkrive ? "Redigering er ikke bygget endnu."
                                              : "Kræver koeretoejer.skriv."}>
                Redigér
              </Knap>
              <Knap disabled title={maaSkrive ? "Afgang er ikke bygget endnu."
                                              : "Kræver koeretoejer.skriv."}>
                Registrér afgang
              </Knap>
            </div>
            {!maaSkrive && (
              <p className="fc-hint" style={{ marginTop: 10 }}>
                Din rolle kan ikke skrive køretøjer. Knapperne står der, fordi
                serveren afviser og fejlen skal kunne forklares — en skjult knap
                lærer brugeren at funktionen ikke findes.
              </p>
            )}
          </Kort>

          {/* Beslutning 17 gjort synlig, som på Medarbejdere. */}
          <Kort titel="Følsomme oplysninger">
            <p className="fc-hint">
              <b>liveGPS</b> ligger i <b>sensitive/koeretoejer/{valgt.id}</b> — en
              søskendenode, ikke et barn, fordi en <b>.read</b> kaskaderer og ikke
              kan indsnævres på et barn. Den kræver{" "}
              <b>koeretoejer.sensitiveLaes</b>, som disponent, koordinator og admin
              har: man kan ikke disponere uden at vide hvor bilerne er.
            </p>
            <p className="fc-hint" style={{ marginTop: 8 }}>
              {maaSeFoelsomt
                ? "Din rolle har adgang. Positionen hentes ikke her — den kræver et ekstra opslag og hører ikke i en liste."
                : "Din rolle har ikke adgang, og serveren afviser opslaget."}{" "}
              <Link className="fc-a" to="/booking/live-kort">Se live-kortet</Link>.
            </p>
          </Kort>
        </Gitter>
      )}

      <Gitter kolonner="repeat(auto-fit, minmax(340px, 1fr))">
        <Kort titel="Seneste indberetninger"
              handling={<Link className="fc-a" to="/flaade/indberetninger">Se alle indberetninger</Link>}>
          <Tabel
            kolonner={[
              { key: "oprettetMs", label: "Tidspunkt", render: (r) => datoTid(r.oprettetMs) },
              { key: "koeretoejId", label: "Enhed", render: (r) => (
                  r.koeretoejId
                    ? <b>{kaldenavn(r.koeretoejId)}</b>
                    /* En godsskade hænger på lasten, ikke på en bil.
                       HAENDELSE_ART siger det selv med paaKoeretoej: false. */
                    : <span className="fc-neutral">Ingen enhed</span>
                ) },
              { key: "beskrivelse", label: "Hændelse", bredde: "42%" },
              /* ⚠ ARTEN, IKKE EN OPFUNDET ALVOR. Mockuppen har Kritisk /
                 Advarsel / Info, men der findes intet alvorsfelt — og at udlede
                 alvor af arten ville være at digte en vurdering ind i data.
                 Forløbet bærer farven, og det ER en tilstand vi har. */
              { key: "art", label: "Art",
                render: (r) => HAENDELSE_ART[r.art]?.label || r.art },
              { key: "forloeb", label: "Forløb", render: (r) => (
                  <Pille tone={FORLOEB[r.forloeb]?.pill || "info"}>
                    {FORLOEB[r.forloeb]?.label || r.forloeb}
                  </Pille>
                ) },
            ]}
            raekker={senesteIndberetninger}
            tom="Ingen indberetninger."
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Mockuppen mærkede hver linje <b>Kritisk</b>, <b>Advarsel</b> eller{" "}
            <b>Info</b>. Der findes ikke noget alvorsfelt, og at udlede alvoren af
            arten ville være at digte en vurdering ind i data — en bremsefejl og en
            ridse er begge <b>reparation</b>. Forløbet står i stedet: det er en
            tilstand nogen faktisk har sat.
          </p>
        </Kort>

        <Kort titel="Køretøjer med højeste omkostning pr. km"
              handling={<Link className="fc-a" to="/oekonomi">Se omkostninger</Link>}>
          <Tabel
            kolonner={[
              { key: "rang", label: "", bredde: "44px", render: (r) => {
                  const i = dyreste.indexOf(r) + 1;
                  return <span className={`fc-rang fc-rang-${i}`}>{i}</span>;
                } },
              { key: "kaldenavn", label: "Enhed", render: (r) => <b>{r.kaldenavn || r.navn}</b> },
              { key: "art", label: "Type", render: (r) => (
                  <span className="fc-med-ikon">
                    <Ikon navn={ikonForArt(r.art)} />{ENHEDSART[r.art]?.label || r.art}
                  </span>
                ) },
              { key: "driftPrKmOere", label: "Pr. km", num: true,
                render: (r) => <b>{kr(r.driftPrKmOere, 2)}</b> },
              /* Mod FLÅDENS gennemsnit fra kpi/, ikke mod de hentedes — ellers
                 flytter sammenligningsgrundlaget sig hver gang nogen filtrerer,
                 og den samme bil er pludselig billig. */
              { key: "afvig", label: "vs. flåden", num: true, render: (r) => {
                  const d = deviation(r.driftPrKmOere - k.flaade.omkostningPrKmOere,
                                      { betterWhen: "lower", unit: "kr", dec: 2 });
                  return <span className={`fc-${d.tone}`}>{d.pil} {d.text}</span>;
                } },
            ]}
            raekker={dyreste}
            tom="Ingen aktive enheder med en omkostning pr. km."
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Mockuppen har en kurve pr. bil. Der findes <b>ingen tidsserie</b> pr.
            køretøj — kun den aktuelle sats — så der står afvigelsen mod flådens
            gennemsnit på <b>{kr(k.flaade.omkostningPrKmOere, 2)}</b> i stedet. En
            kurve tegnet af ét punkt er en påstand om en udvikling, vi ikke kender.
            Beløb er ekskl. moms og <b>uden</b> chauffør.
          </p>
        </Kort>
      </Gitter>

      <p className="fc-hint">
        Demo-flåden er et <b>udsnit</b> på {num(DEMO_KOERETOEJER.length)} enheder, ikke hele
        flåden — nøgletallene øverst kommer fra <b>kpi/</b> og er langt større tal. De to
        skal ikke gå op mod hinanden: tabellen tæller sig selv og siger "af N hentede",
        og en optælling af hentede rækker er ikke et nøgletal. Alle beløb er ekskl. moms.
      </p>
    </div>
  );
}
