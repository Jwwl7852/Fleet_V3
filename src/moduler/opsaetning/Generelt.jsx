/* src/moduler/opsaetning/Generelt.jsx
 * Opsætning – generelt
 *
 * ⚠ DER ER INGEN MOCKUP FOR DEN HER SKÆRM, og den er ikke bygget på gæt. Den
 * viser hvad tenanten ER — id, divisioner, lokationer, miljø — og hvor
 * stamdata i øvrigt vedligeholdes. Alt sammen findes i forvejen.
 *
 * ---------------------------------------------------------------------------
 * DE TRE ÅBNE SPØRGSMÅL HANDLER ALLE OM AT ÆNDRE
 *
 * FleetControl-spoergsmaal.md spørger: hvad skal en vognmand kunne ændre selv,
 * er afdelinger og lokationer opsætning eller stamdata, og hører CVR, logo og
 * betalingsbetingelser her. Ingen af dem blokerer en LÆSESKÆRM.
 *
 * Det andet spørgsmål har i øvrigt allerede et halvt svar i koden:
 * lokationerne ER stamdata. De ligger i facility/lokationer med areal og
 * type, og de bindes til STED-kataloget i fleet/steder.js — samme fire steder
 * som personalet står på og køretøjerne har hjemme. At lave et andet
 * lokationsbegreb her ville være to stedlister igen.
 *
 * ---------------------------------------------------------------------------
 * ⚠ TENANT-ID ER IMMUTABELT. Det står i hver eneste regel — `auth.token.tenant
 * === $tenantId` — og det står i tokenet. Ændres det, peger alle eksisterende
 * data på en tenant der ikke længere findes, og en bruger med det gamle claim
 * kan ikke læse noget. Der er derfor ingen knap, heller ikke en deaktiveret:
 * en knap antyder at det er en operation der mangler at blive bygget.
 *
 * DIVISIONER ER IKKE EN LISTE MAN REDIGERER. Gods og bus er hele platformens
 * inddeling (beslutning 9) og et FELT på transaktioner — `gods` | `bus` |
 * `faelles`, valideret i reglerne. En tredje division ville være en ændring i
 * regelfilen, ikke en række i en tabel.
 */
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { miljoe } from "../../firebase.js";
import { ALLE_STEDER } from "../../fleet/steder.js";
import { useListe } from "../../fleet/useListe.js";
/* ⚠ KUN SOM FALDBAKKE I useListe. `facility/lokationer` er en seedet node. */
import { DEMO_LOKATIONER } from "../../fleet/demo-facility.js";
import { LOKATION_TYPE } from "../../fleet/facility.js";
import { ALLE_MODULER, harModul } from "../../fleet/moduler.js";
import { num, mindst } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Gitter, MiniLinje, Knap, KpiKort, KpiRaekke, Ikon,
} from "../../fleet/ui.jsx";

/* Hvor stamdata FAKTISK vedligeholdes. Listen står her frem for i en menu,
   fordi det spørgsmål — "hvor retter jeg det?" — er hele grunden til at nogen
   åbner Opsætning. Peger den forkert, leder man videre samme sted igen. */
const STAMDATA = [
  { hvad: "Medarbejdere", hvor: "/opsaetning/medarbejdere", label: "Opsætning → Medarbejdere",
    note: "Personen findes uden login. personId er ikke uid — beslutning 18." },
  { hvad: "Kompetencer og beviser", hvor: "/bemanding/kompetencer", label: "Workforce → Kompetencer",
    note: "En udløbet kompetence blokerer i disponeringen, den advarer ikke." },
  { hvad: "Enheder og påhæng", hvor: "/opsaetning/enheder", label: "Opsætning → Enheder",
    note: "Arten styrer feltskemaet." },
  { hvad: "Kunder og prisgrupper", hvor: "/opsaetning/kunder", label: "Opsætning → Kunder",
    note: "Prisgruppen peger på et satssæt; satserne selv ligger i Bookingopsætning." },
  { hvad: "Satser og tillæg", hvor: "/booking/opsaetning", label: "Booking → Bookingopsætning",
    note: "Versioneres med gyldigFra og overskrives aldrig — beslutning 7." },
  { hvad: "Leverandører og aftaler", hvor: "/indkoeb/leverandoerer", label: "Procure → Leverandører",
    note: "Objektive tal, ingen stjerner — beslutning 22." },
  { hvad: "Bygninger og anlæg", hvor: "/facility", label: "Facility → Overblik",
    note: "Lokationer, areal og zoner. Stederne kommer fra STED-kataloget." },
  { hvad: "Brugere og roller", hvor: "/opsaetning/brugere", label: "Opsætning → Brugere & roller",
    note: "Rollerne er faste. Man tildeler dem — man ændrer dem ikke." },
];

/* miljoe er en streng fra firebase.js: "prod" | "dev" | "demo". En ukendt
   vaerdi faar tonen warn frem for at falde tilbage paa noget beroligende —
   ved vi ikke hvilket miljoe vi staar i, er det i sig selv en advarsel. */
const MILJOE_TONE = {
  prod: { tone: "bad", label: "Produktion" },
  dev: { tone: "ok", label: "Udvikling" },
  demo: { tone: "info", label: "Demo" },
};

export default function Generelt() {
  const { tenantId, tenant, tenants, dage, moduler } = useFleet();

  /* ⚠ SPURGT MED harModul(), IKKE TALT PÅ NODEN. Den ene kender reglen om
     at en manglende node betyder ALLE, og at de obligatoriske altid er med.
     En optælling her ville være en kopi af den regel — og kopien ville
     drive. */
  const aktiveModuler = ALLE_MODULER.filter((m) => harModul(moduler, m));
  const m = MILJOE_TONE[miljoe] || { tone: "warn", label: String(miljoe) };

  /* ⚠ NODEN, IKKE DEMOFILEN. Skærmen er en LÆSESKÆRM over kundens opsætning,
     og kortet "Lokationer" viste vores fem demolokationer som om de var hans.
     Et tal på en opsætningsskærm er det sted man går hen for at se hvad man
     HAR — og det er værre at vise et forkert tal her end at vise ingenting. */
  const lok = useListe("facility/lokationer", {
    ordnPaa: "type", vindue: "alle", graense: 200,
    demo: DEMO_LOKATIONER,
  });

  /* Lokationerne grupperes på sted, så man kan se at STED-kataloget og
     bygningsdata er ét og samme vokabular. */
  const perSted = ALLE_STEDER.map((s) => ({
    sted: s,
    lokationer: lok.data.filter((l) => l.sted === s),
  }));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Virksomhed" vaerdi={tenant?.navn || tenantId}
                 ikon={<Ikon navn="bygning" />} tone="ikon-5" rund
                 note={`tenant-id: ${tenantId}`} />
        {/* ⚠ HER STOD "Divisioner: Gods og bus". Aksen gik i beslutning 70,
            og kortet blev stående — på den ene skærm hvor en kunde læser
            HVAD HAN HAR KØBT. Det er den værste slags forældet tekst: den
            sælger en funktion produktet ikke har.

            Modulerne er dét kunden faktisk er delt op efter. Se beslutning
            70 og 87. */}
        {/* ⚠ EN MANGLENDE moduler-NODE BETYDER ALLE, IKKE INGEN.

            Første udgave af kortet skrev `Object.keys(moduler || {}).length`
            og sagde **"Moduler: 0"** på demo-tenanten — som ikke HAR noden,
            og derfor har dem alle. Det blev set på skærmen, ikke i koden.

            Reglen læser den samme vej: `!moduler.exists() || …`. `harModul()`
            gør det ét sted, og det er dét sted der skal spørges — en
            optælling ved siden af er en filterkopi, og en filterkopi der er
            90 % rigtig, afviser præcis dét reglen tillader (beslutning 56).

            Tredje gang samme fælde: seedet i 56, mit eget destinationsfilter
            i 86, og her. Se beslutning 87. */}
        <KpiKort label="Moduler" vaerdi={num(aktiveModuler.length)}
                 ikon={<Ikon navn="kasse" />} tone="ikon-2" rund
                 note={moduler
                   ? "opdelingen er moduler, ikke divisioner"
                   : "ingen moduler-node — kunden har dem alle"} />
        <KpiKort label="Lokationer" vaerdi={mindst(lok.data.length, lok.afkortet)}
                 ikon={<Ikon navn="stednaal" />} tone="ikon-6" rund
                 note={`på ${num(ALLE_STEDER.length)} steder`} til="/facility" />
        <KpiKort label="Miljø" vaerdi={m.label}
                 ikon={<Ikon navn="skjold" />} tone="ikon-4" rund
                 note={`periode: seneste ${num(dage)} dage`} />
      </KpiRaekke>

      <Gitter kolonner="repeat(auto-fit, minmax(300px, 1fr))">
        <Kort titel="Virksomheden">
          <MiniLinje label="Navn" vaerdi={tenant?.navn || "—"} />
          <MiniLinje label="Tenant-id" vaerdi={<code>{tenantId}</code>} />
          <MiniLinje label="Miljø" vaerdi={<Pille tone={m.tone}>{m.label}</Pille>} />
          <MiniLinje label="Adgang til" vaerdi={`${num(tenants.length)} tenant${tenants.length === 1 ? "" : "s"}`} />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ <b>Tenant-id kan ikke ændres.</b> Det står i hver eneste regel —{" "}
            <code>auth.token.tenant === $tenantId</code> — og i dit token. Ændres
            det, peger alle eksisterende data på en tenant der ikke længere findes,
            og en bruger med det gamle claim kan ikke læse noget.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Der står bevidst <b>ingen knap</b>, heller ikke en grå: en deaktiveret
            knap antyder en operation der bare mangler at blive bygget.
          </p>
        </Kort>

        <Kort titel="Opdelingen">
          {/* ⚠ HER STOD ET "Divisioner"-KORT MED GODS OG BUS. Aksen gik i
              beslutning 70 — ingen abonnent har både gods og bus — og kortet
              blev stående på den ene skærm hvor en kunde læser hvad han har
              købt. Værre: `Aktiv nu` læste shellens `division`, som er
              `undefined`, og skrev derfor altid "Gods".

              Det er ikke en tekst der bare var forældet. Den beskrev et
              produkt vi ikke har. Se beslutning 87. */}
          <MiniLinje label="Kunden er delt op efter" vaerdi={<b>moduler</b>} />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Der er <b>ingen gods/bus-akse</b>. Den blev fjernet i beslutning 70,
            fordi <b>ingen abonnent har begge</b> — og den opdeling en kunde
            faktisk har, står i hans <b>moduler</b>.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Feltet er <code>.validate: false</code> på hver eneste node —
            <b>forbudt, ikke fjernet</b>, så en manglende regel ikke stiltiende
            tillader aksen at komme tilbage som data.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Skal en kunde have både gods og bus, er svaret <b>to moduler</b> —
            ikke en akse på tværs af alle noder.
          </p>
        </Kort>

        <Kort titel="Perioden">
          <MiniLinje label="Valgt" vaerdi={`Seneste ${num(dage)} dage`} />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Perioden ejes af <b>shellen</b> og vælges i toppen. Hvert modul filtrerer
            på de samme epoch-millisekunder, så to skærme ikke kan vise hver sit
            tidsrum. Derfor er der heller ingen periodevælger i noget filterkort —
            to vælgere kan blive uenige om hvilken der gjaldt, uden at nogen kan se
            hvilken.
          </p>
        </Kort>
      </Gitter>

      <Kort titel="Lokationer">
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          Stederne kommer fra <b>ét katalog</b> — <code>STED</code> i{" "}
          <code>fleet/steder.js</code>. Samme fire steder som personalet er
          stationeret på og enhederne har hjemme. Et andet lokationsbegreb her
          ville være to stedlister, og så ville en bil i "Ålborg" ikke stå samme
          sted som en chauffør i "Aalborg" — uden at nogen kunne se det.
        </p>
        <Tabel
          kolonner={[
            { key: "sted", label: "Sted", render: (r) => (
                <span className="fc-med-ikon"><Ikon navn="stednaal" /><b>{r.sted}</b></span>
              ) },
            { key: "lokationer", label: "Bygninger", render: (r) => (
                r.lokationer.length
                  ? r.lokationer.map((l) => l.navn).join(" · ")
                  : <span className="fc-neutral">ingen</span>
              ) },
            { key: "type", label: "Type", render: (r) => (
                r.lokationer.length
                  ? [...new Set(r.lokationer.map((l) => LOKATION_TYPE[l.type] || l.type))].join(", ")
                  : <span className="fc-neutral">—</span>
              ) },
            { key: "areal", label: "Areal", num: true, render: (r) => (
                r.lokationer.length
                  ? `${num(r.lokationer.reduce((s, l) => s + (l.arealM2 || 0), 0))} m²`
                  : <span className="fc-neutral">—</span>
              ) },
          ]}
          raekker={perSted}
          noegle={(r) => r.sted}
          tom="Ingen steder i kataloget."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Lokationer vedligeholdes i{" "}
          <Link className="fc-a" to="/facility">Facility</Link>, hvor de hører sammen
          med anlæggene i dem. Det er ikke tilfældigt: spørgsmålet{" "}
          <b>"er lokationer opsætning eller stamdata?"</b> står stadig åbent i
          projektets spørgsmålsliste, men koden har allerede svaret halvt — de er
          stamdata med areal, type og zoner, ikke en indstilling.
        </p>
      </Kort>

      <Kort titel="Hvor stamdata rettes">
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          Spørgsmålet <b>"hvor retter jeg det?"</b> er hele grunden til at nogen
          åbner Opsætning. Listen står derfor her og ikke kun i menuen — peger den
          forkert, leder man videre samme sted igen.
        </p>
        <Tabel
          kolonner={[
            { key: "hvad", label: "Stamdata", render: (r) => <b>{r.hvad}</b> },
            { key: "hvor", label: "Rettes i", render: (r) => (
                <Link className="fc-a" to={r.hvor}>{r.label}</Link>
              ) },
            { key: "note", label: "", bredde: "48%",
              render: (r) => <span className="fc-hint">{r.note}</span> },
          ]}
          raekker={STAMDATA}
          noegle={(r) => r.hvad}
          tom="Ingen stamdata registreret."
        />
      </Kort>

      <Kort titel="Det der ikke er besvaret endnu">
        <p className="fc-hint">
          Tre spørgsmål i projektets spørgsmålsliste står stadig åbne for denne
          skærm, og de handler alle om <b>at ændre</b> — ikke om at vise:
        </p>
        <ul className="fc-liste">
          <li>Hvad skal en vognmand kunne ændre selv, og hvad skal han ringe om?</li>
          <li>Er afdelinger, lokationer og standardlager opsætning eller stamdata?</li>
          <li>Hører CVR, adresse, logo på fakturaer og betalingsbetingelser her?</li>
        </ul>
        <p className="fc-hint" style={{ marginTop: 10 }}>
          Det sidste er værd at tage stilling til før det bygges: et <b>logo på en
          faktura</b> hører sammen med den der laver fakturaen — og FleetControl
          laver ikke den juridiske faktura (beslutning 22). Vi leverer et{" "}
          <Link className="fc-a" to="/oekonomi/fakturering">fakturagrundlag</Link>.
          Ligger logoet her, lover skærmen noget systemet ikke gør.
        </p>
        <div style={{ marginTop: 12 }}>
          <Knap disabled title="Ikke besluttet endnu — se de tre spørgsmål ovenfor.">
            Redigér virksomhedsoplysninger
          </Knap>
        </div>
      </Kort>
    </div>
  );
}
