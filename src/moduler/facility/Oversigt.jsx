/* src/moduler/facility/Oversigt.jsx
 * Facility – Overblik. Facility TARGET-restrukturering (produktejer-review
 * 2026-09-02), samme mønster som Fleet: `Overblik | Inventar | Service &
 * reparation | Planlagt | Statistik` som en vandret ModulNav, se
 * fleet/modulfaner.js's FACILITY_FANER og
 * docs/product-redesign-v1/07_OLD_CURRENT_TARGET_FLEET_FACILITY_PROCURE_UNITBOOKING.md's
 * Facility-afsnit.
 *
 * ⚠ COCKPIT, IKKE ALT PÅ ÉN SIDE. Den fulde "Aktiver"-tabel med opret/redigér
 * flyttede til den nye Inventar-fane (samme data, egen fane, filtrérbar) —
 * TARGET's egen begrundelse: "ny visning ... som en dedikeret, filtrérbar
 * fane frem for kun en tabel nederst på Overblik." Donuttet (fordelingen på
 * art) flyttede med af samme grund; det er en INVENTAR-egenskab.
 *
 * Tilbage her: KPI-rækken (nu fire tal der matcher TARGET's wireframe —
 * "Åbne facility-sager" er skiftet ud med "Åbne fejl", fordi `sager/` er
 * fase 0 og feltet ALTID er null, mens "åbne fejl" allerede var en reel,
 * afledt tælling på skærmen), to NYE lister ("Kommende & overskredne
 * services" med en "+ Opret opgave"-genvej direkte på rækken, og "Seneste
 * serviceaktivitet"), og det der allerede virkede: Lokationer, Driftsforhold,
 * Åbne fejl (+ Meld fejl) og Fakturaer. Intet af det er "spredt forkert" —
 * TARGET-analysen selv siger Facility manglede de to nye faner og de to
 * knap-på-række-genveje, ikke at data lå det forkerte sted.
 *
 * ⚠ estimatForAktiv() ER RETTET SAMTIDIG. Den læste `DEMO_SERVICEBESOEG`
 * uanset miljø — se fleet/facility.js's egen note. Den bor der nu, så
 * Overblik og Inventar ikke kan vise hvert sit tal for samme anlæg.
 *
 * ⚠ "KLIMA NU" ER FJERNET (produktejer-review 2026-09-02). Kortet læste
 * ægte RTDB-noder (facility/zoner+sensorer), men der er INGEN reel
 * datakilde bag dem hos en rigtig kunde: ingen admin-skærm kan oprette en
 * zone eller registrere en sensor, og ingen Cloud Function/integration kan
 * skrive en målt værdi. De eneste tal nogen har set i noden, kommer fra
 * `scripts/provisioner-dev.mjs`'s statiske engangsseed — samme tal som
 * `DEMO_ZONER`/`DEMO_SENSORER`. `docs/product-redesign-v1/
 * 01_ROUTE_DISPOSITION.md` (linje 165) siger det udtrykkeligt: "Skjul indtil
 * zone-/sensoropsætning [...] er reel. Må ikke fremstå som færdig
 * monitorering uden datakilde."
 *
 * ⚠ OG SAMME OPRYDNING ER NU FØRT HELE VEJEN (produktejer-review 2026-09-02,
 * anden runde). Første runde fjernede kun det klima-EGNE kort og lod
 * Driftsforhold og Lokationer blive stående på samme sensornode — den rest
 * er lukket her: skærmen læser slet ikke `facility/zoner`/`facility/sensorer`
 * længere, og `driftsforhold()`/`lokationTilstand()` i fleet/facility.js
 * tager ikke længere sensordata som argument. Tilbage er kun det de to kort
 * ALTID kunne udlede af rigtig Facility-data: porte/ventilation-status og
 * åbne fejl. Se noterne ved de to funktioner selv.
 *
 * (Resten af filens oprindelige hoved — sensorværdier, afledt lokationsstatus,
 * donut-paletten, mockup-afvigelser — gælder stadig og er ikke gentaget her;
 * se git-historikken for den fulde tekst.)
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato, datoTid, deviation, serviceTone } from "../../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Gitter,
  MiniLinje, Ikon, Knap, Felt, Feltraekke, Formular, Kpiadgang, ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { Modulfakturaer } from "../../fleet/Modulfakturaer.jsx";
import {
  FEJL_STATUS, LOKATION_TYPE,
  lokationTilstand, driftsforhold,
  estimatForAktiv,
  valideFejl, byggFejl,
} from "../../fleet/facility.js";
import { OPGAVE_STATUS } from "../../fleet/opgaver.js";
import { alvorTone, ALVOR } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import { FACILITY_FANER } from "../../fleet/modulfaner.js";
import Servicedialog from "./Servicedialog.jsx";
import Besoegspanel from "../../fleet/Besoegspanel.jsx";
import { leverandoerNavn } from "../../fleet/leverandoerer.js";
import {
  demoAktiv, demoLokation,
} from "../../fleet/demo-facility.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

const DAG = 86400000;

/**
 * En afvigelse man ikke har, er ikke en afvigelse på nul.
 *
 * ⚠ deviation(undefined) giver "0" og tonen neutral — altså påstanden "ingen
 * ændring". Det er en oplysning vi ikke har, skrevet som om vi havde den, og
 * det er samme fejl som at oversætte en afvist læsning til "ingen
 * forbindelse". Mangler feltet, siger noten det i stedet.
 */
const afvig = (vaerdi, opts) =>
  Number.isFinite(vaerdi)
    ? { afvigelse: deviation(vaerdi, opts), note: "vs. forrige periode" }
    : { note: "afvigelsen er ikke aggregeret endnu" };

const tomFejl = (aktivId = "") => ({
  aktivId, status: "ny", alvor: "mellem", beskrivelse: "", meldtAf: "",
});

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
  const { kpi: k, henter, tilstand, genindlaes, utilgaengelige } = useKpi();
  const { bruger, path } = useFleet();

  const felles = { vindue: "alle", graense: 500 };
  const lok = useListe("facility/lokationer", { ordnPaa: "type", ...felles });
  const akt = useListe("facility/aktiver", { ordnPaa: "naesteServiceMs", ...felles });
  const fej = useListe("facility/fejl", { ordnPaa: "meldtMs", ...felles });
  /* ⚠ NY HER — "Kommende & overskredne services"' "+ Opret opgave" og
     "Seneste serviceaktivitet" kræver den RIGTIGE opgaveliste, samme
     hentning som Servicekalender.jsx bruger (art "facility" filtreres
     klientside, samme begrundelse som dér). Den er også kilden til den
     rettede estimatForAktiv(). */
  const opgaver = useListe("opgaver", {
    ordnPaa: "startMs", vindue: "fremad", vindueDage: 120, fremDage: 365,
    graense: 500, demo: DEMO_OPGAVER,
  });
  const leverandoerer = useListe("leverandoerer", {
    vindue: "alle", graense: 200, demo: DEMO_LEVERANDOERER,
  });

  const lvNavn = (id) => leverandoerNavn(leverandoerer.data, id);
  const lokNavn = (id) => lok.data.find((l) => l.id === id)?.navn || "";

  const [valgtLokId, setValgtLokId] = useState(null);
  const [fejlform, setFejlform] = useState(null);
  /* Facility §"+ Opret opgave" — samme foraf-form som gitterets ledige felt
     bruger i Servicekalender.jsx: `{aktivId, startMs}`. */
  const [planlaegger, setPlanlaegger] = useState(null);
  const [detaljerId, setDetaljerId] = useState(null);

  const facilityopgaver = opgaver.data.filter((o) => o.art === "facility");

  const henterNoget = henter || lok.henter || akt.henter || fej.henter || opgaver.henter;
  if (henterNoget) return <Henter hvad="facility" />;
  if (blokerer(akt.tilstand)) {
    return <Datatilstand tilstand={akt.tilstand} genprov={akt.genindlaes} />;
  }
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  const aabne = fej.data.filter((f) => f.status !== "udbedret");
  const ctx = { aktiver: akt.data, aabneFejl: aabne };
  const maaSkrive = harPerm(bruger?.perms, PERM.facilitySkriv);

  const valgtLok = lok.data.find((l) => l.id === valgtLokId) || lok.data[0];
  const drift = valgtLok ? driftsforhold(valgtLok.id, ctx) : [];

  /* ⚠ "SERVICE <30 DAGE" OG "OVERSKREDET" ER TO ADSKILTE MÆNGDER — regnet
     direkte af naesteServiceMs, IKKE af serviceTone()'s tre trin. serviceTone()
     slår "overskredet" og "≤14 dage" sammen i samme "bad"-tone (den er lavet
     til ÉN celle i en tabel, ikke to KPI'er) — brugte vi den her, ville et
     anlæg der er 5 dage overskredet, tælle med i BEGGE kort. Begge tal er
     afledt af den allerede hentede `akt`-liste, ikke i kpi/. */
  const nu = Date.now();
  const overskredet = akt.data.filter((a) => Number.isFinite(a.naesteServiceMs) && a.naesteServiceMs < nu);
  const snart = akt.data.filter((a) => Number.isFinite(a.naesteServiceMs)
    && a.naesteServiceMs >= nu && a.naesteServiceMs - nu <= 30 * DAG);
  /* "Kommende & overskredne services" — TARGET's wireframe-tabel. */
  const kommendeOgOverskredne = [...overskredet, ...snart]
    .sort((a, b) => a.naesteServiceMs - b.naesteServiceMs);

  /* "Seneste serviceaktivitet" — de nyeste facility-opgaver, uanset status,
     nyeste først. Samme liste som Servicekalender.jsx viser, kun beskåret. */
  const seneste = [...facilityopgaver]
    .filter((o) => Number.isFinite(o.startMs))
    .sort((a, b) => b.startMs - a.startMs)
    .slice(0, 6);

  return (
    <div className="fc-grid" style={{ gap: 11 }}>
      <ModulNav punkter={FACILITY_FANER} />
      <Kpiadgang utilgaengelige={utilgaengelige} />
      {k && (
        <KpiRaekke>
          <KpiKort label="Aktiver i drift" vaerdi={num(k.facility.aktiver)}
                   ikon={<Ikon navn="bygning" />} tone="ikon-5" rund til="/facility/inventar"
                   {...afvig(k.facility.aktiverDeltaPct, { betterWhen: "higher", unit: "pct" })} />
          <KpiKort label="Service inden 30 dage" vaerdi={num(snart.length)}
                   ikon={<Ikon navn="ur" />} tone="ikon-3" rund til="/facility/planlagt"
                   note="afledt af aktivernes næste service" />
          <KpiKort label="Overskredet" vaerdi={num(overskredet.length)}
                   ikon={<Ikon navn="advarsel" />} tone="ikon-2" rund til="/facility/inventar"
                   note="afledt af aktivernes næste service" />
          <KpiKort label="Åbne fejl" vaerdi={num(aabne.length)}
                   ikon={<Ikon navn="udraab" />} tone="ikon-1" rund
                   note="alt der ikke er udbedret" />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel={`Kommende & overskredne services (${num(kommendeOgOverskredne.length)})`}>
        <Tabel
          kolonner={[
            { key: "navn", label: "Anlæg", render: (r) => <b>{r.navn}</b> },
            { key: "lokationId", label: "Lokation", render: (r) => (
                <span className="fc-med-ikon fc-med-ikon-svag">
                  <Ikon navn="bygning" />{demoLokation(r.lokationId)?.navn || "—"}
                </span>
              ) },
            { key: "naesteServiceMs", label: "Næste service", render: (r) => {
                const s = serviceTone(r.naesteServiceMs);
                return (
                  <div className="fc-tolinje">
                    <b className={s.tone === "bad" ? "fc-bad" : undefined}>{dato(r.naesteServiceMs)}</b>
                    <span className={s.tone === "bad" ? "fc-bad" : undefined}>{s.tekst}</span>
                  </div>
                );
              } },
            { key: "serviceIntervalDage", label: "Interval", num: true,
              render: (r) => (Number.isFinite(r.serviceIntervalDage) ? `${num(r.serviceIntervalDage)} dage` : "—") },
            { key: "estimat", label: "Estimeret omkostning", num: true, render: (r) => {
                const oere = estimatForAktiv(opgaver.data, r.id, nu);
                return oere == null ? <span className="fc-neutral">—</span> : kr(oere);
              } },
            { key: "h", label: "", render: (r) => (
                <Knap disabled={!maaSkrive}
                      onClick={() => setPlanlaegger({ aktivId: r.id, startMs: r.naesteServiceMs })}
                      title={maaSkrive ? "Åbner Planlæg service med anlægget udfyldt."
                                       : "Kræver opgaver.skriv."}>
                  + Opret opgave
                </Knap>
              ) },
          ]}
          raekker={kommendeOgOverskredne}
          noegle={(r) => r.id}
          tom="Ingen aktiver har service inden for 30 dage."
        />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          Sorteret efter hvornår service forfalder — overskredne øverst.
          <b> Estimeret omkostning</b> er prisen på anlæggets næste PLANLAGTE
          servicebesøg (en opgave), ikke et felt på anlægget selv — et anlæg
          uden planlagt besøg har intet estimat, ikke et estimat på nul.
        </p>
      </Kort>

      <Kort titel="Seneste serviceaktivitet">
        <Tabel
          kolonner={[
            { key: "startMs", label: "Dato", render: (r) => datoTid(r.startMs) },
            { key: "hvad", label: "Anlæg/lokation", render: (r) => (
                <b>{r.aktivId ? (akt.data.find((a) => a.id === r.aktivId)?.navn || r.aktivId)
                                : (lokNavn(r.lokationId) || r.lokationId)}</b>
              ) },
            { key: "beskrivelse", label: "Beskrivelse" },
            { key: "leverandoerId", label: "Udføres af",
              render: (r) => (r.leverandoerId ? lvNavn(r.leverandoerId) : "eget personale") },
            { key: "status", label: "Status", render: (r) => (
                <Pille tone={OPGAVE_STATUS[r.status]?.pill}>{OPGAVE_STATUS[r.status]?.label || r.status}</Pille>
              ) },
            { key: "beloebOere", label: "Beløb", num: true, render: (r) => kr(r.beloebOere) },
            { key: "h", label: "", render: (r) => (
                <Knap onClick={() => setDetaljerId(r.id)}>Detaljer</Knap>
              ) },
          ]}
          raekker={seneste}
          noegle={(r) => r.id}
          tom="Ingen facility-opgaver endnu."
        />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          De seks seneste facility-opgaver, uanset status. Fuld liste og
          kalender ligger i <Link className="fc-a" to="/facility/servicekalender">Service &amp; reparation</Link>.
        </p>
      </Kort>

      <Gitter kolonner="repeat(auto-fit, minmax(300px, 1fr))">
        <Kort titel="Lokationer"
              handling={<Link className="fc-a" to="/facility/servicekalender">Se servicekalenderen</Link>}>
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
            Statussen er <b>afledt</b> af anlæg og åbne fejl på stedet — den
            er ikke et felt. Stederne kommer fra <b>STED</b>, samme katalog
            som personale og flåde bruger.
          </p>
        </Kort>

        <Kort titel={`Driftsforhold — ${valgtLok?.navn || "—"}`}>
          {!drift.length ? (
            <Tom>Ingen porte eller ventilationsanlæg på denne lokation.</Tom>
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
            Talt op fra <b>facility/aktiver</b>s egen status. Kun porte og
            ventilation vises her — øvrige anlægstyper står i <b>Inventar</b>.
          </p>
        </Kort>

        {/* ⚠ "KLIMA NU" ER FJERNET HERFRA (produktejer-review 2026-09-02).
            Kortet viste rigtige RTDB-læsninger (facility/zoner+sensorer), men
            der er INGEN reel datakilde bag dem: ingen admin-skærm kan
            oprette en zone eller en sensor, og INGEN Cloud Function eller
            integration kan skrive en målt temperatur — de eneste tal der
            nogensinde har stået i noden, kommer fra scripts/provisioner-dev.mjs's
            statiske engangsseed (samme tal som DEMO_ZONER/DEMO_SENSORER).
            Det er præcis den situation `01_ROUTE_DISPOSITION.md` (linje 165)
            forbyder: "Skjul indtil zone-/sensoropsætning [...] er reel. Må
            ikke fremstå som færdig monitorering uden datakilde." Klima.jsx's
            eget hoved siger det samme om selve klimaskærmen. At vise kortet
            her ville være at give Overblik en anden regel end skærmen
            kortet linkede til.
            ⚠ ANDEN RUNDE (produktejer-review 2026-09-02): Driftsforhold-
            kortets temperaturrække og Lokationers klimaalarm-baserede
            Kritisk-trin er nu OGSÅ fjernet — se noterne ved driftsforhold()
            og lokationTilstand() i fleet/facility.js. Skærmen læser slet
            ikke facility/zoner eller facility/sensorer længere; "Se klima &
            energi"-linket på Driftsforhold-kortet er fjernet af samme grund,
            for et kort uden klimaindhold skal ikke pege videre på en
            klimaskærm. */}
      </Gitter>

      {fejlform && (
        <Fejlformular
          key={fejlform}
          fejlpost={fejlform === "ny" ? null : fej.data.find((x) => x.id === fejlform)}
          aktiver={akt.data}
          sti={(under) => path(`facility/${under}`)}
          paaGemt={() => { setFejlform(null); genindlaes(); fej.genindlaes(); }}
          paaLuk={() => setFejlform(null)}
        />
      )}

      <Kort
        titel={`Åbne fejl (${aabne.length})`}
        handling={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link className="fc-a" to="/facility/servicekalender">Se servicekalenderen</Link>
            <Knap variant="primaer" disabled={!maaSkrive}
                  onClick={() => setFejlform("ny")}
                  title={maaSkrive ? "Meld en fejl på et anlæg." : "Kræver facility.skriv — serveren afviser."}>
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
          Viser {num(aabne.length)} af {num(fej.data.length)} hentede fejl.
        </p>
      </Kort>

      {planlaegger && (
        <Servicedialog
          aktiver={akt.data}
          lokationer={lok.data}
          leverandoerer={leverandoerer.data}
          foraf={planlaegger}
          onLuk={() => setPlanlaegger(null)}
          onGemt={() => { setPlanlaegger(null); opgaver.genindlaes(); akt.genindlaes(); genindlaes(); }}
        />
      )}

      {detaljerId && (() => {
        const valgt = facilityopgaver.find((o) => o.id === detaljerId) || null;
        return valgt && (
          <Besoegspanel
            besoeg={valgt} lvNavn={lvNavn} lokNavn={lokNavn} aktiver={akt.data}
            maaSkrive={maaSkrive}
            onSkiftet={() => opgaver.genindlaes()}
            onLuk={() => setDetaljerId(null)}
          />
        );
      })()}

      {/* ⚠ SAMME FAKTURAER SOM FAKTURACENTERET — ikke et andet sæt.
          Modulet ejer sagen; centeret ejer fakturaen (beslutning 86). */}
      <Modulfakturaer art="facility" />
    </div>
  );
}
