/* src/moduler/Fakturering.jsx
 * Fakturagrundlag. BESLUTNING 25.
 *
 * ⚠ BESLUTNING 25 ER ANTAGELSER, IKKE AFGJORTE KRAV. Skærmen bygger på hvordan
 * vi TROR en vognmand opgør en tur. Den skal efterprøves hos første kunde.
 *
 * Der findes INGEN mockup for denne skærm. Den er bygget efter beslutningen,
 * ikke efter en tegning — så alt hvad der står her, kan begrundes.
 *
 * ---------------------------------------------------------------------------
 * FIRE TING SKÆRMEN GØR SYNLIGE, FORDI DE ELLERS KUN STÅR I EN TEST
 *
 * 1. EN ÅBEN ETAPE SPÆRRER FAKTURERINGEN, og årsagen står på skærmen frem for
 *    at knappen bare er grå. En deaktiveret knap uden forklaring sender
 *    disponenten på jagt; her står hvad der mangler.
 *
 * 2. EN MANGLENDE MOMSSATS SPÆRRER EKSPORTEN. Vi gætter ikke 25 %. Feltet står
 *    tomt med en advarsel frem for udfyldt med et sandsynligt tal — se noten i
 *    grundlag.js. Det er det åbne spørgsmål, gjort synligt frem for gemt i en
 *    README.
 *
 * 3. ET ERSTATTET GRUNDLAG BLIVER STÅENDE, gennemstreget og med en henvisning
 *    til det der afløste det. Skjulte vi det, kunne man ikke se hvad der blev
 *    sendt til kunden første gang — og det er præcis hvad man spørger om, når
 *    kunden ringer om en korrektion.
 *
 * 4. SUMMEN TÆLLER KUN GÆLDENDE GRUNDLAG. Den går gennem summer(), ikke gennem
 *    en reduce her i filen. En kopi uden erGaeldende()-filteret ville se ud som
 *    en sum og være en dobbeltfakturering.
 * ---------------------------------------------------------------------------
 *
 * FASE 0: VISNING. grundlag/ findes ikke i firebase.rules.json endnu, så der
 * skrives ingenting. Knapperne viser hvad de VILLE gøre via kanGodkende() og
 * kanEksportere() — samme mønster som Forslag-skærmen med kanSkifte().
 * Håndhævelsen hører i den Cloud Function der skriver, ikke her: ligger den i
 * skærmen, kan en direkte skrivning gå uden om den.
 */
import { useState } from "react";
import { useKpi } from "../fleet/useKpi.js";
import { kr, num, dato, datoTid } from "../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Knap, Gitter, MiniLinje,
} from "../fleet/ui.jsx";
import { blokerer } from "../fleet/datatilstand.js";
import {
  GRUNDLAG_TILSTAND, LINJE_ART,
  totaler, linjeBeloebOere, linjeMomsOere, talFraAntal,
  kanGodkende, kanEksportere, linjerUdenMoms, erGaeldende, summer,
} from "../fleet/grundlag.js";
import { DEMO_GRUNDLAG } from "../fleet/demo-grundlag.js";
import { DEMO_ETAPER } from "../fleet/demo-etaper.js";
import { DEMO_KUNDER } from "../fleet/demo-kunder.js";

const kundeNavn = (id) => DEMO_KUNDER.find((k) => k.id === id)?.navn || id || "—";

/** Momsen vises som "—" når satsen mangler. IKKE som 0 kr. — et nul ligner et
 *  regnestykke der er gået op, og det er netop det der ikke er sket. */
const momsTekst = (oere) => (oere === null ? "—" : kr(oere));

export default function Fakturering() {
  const { kpi: k, henter, fejl, tilstand, genindlaes } = useKpi();
  const [valgtId, setValgtId] = useState("grl-002");

  if (henter) return <Henter hvad="fakturagrundlag" />;
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  const valgt = DEMO_GRUNDLAG.find((g) => g.id === valgtId) || null;

  /* AFLEDT af den liste skærmen allerede har — hører derfor IKKE i kpi/.
     Samme sag som aktive klimaalarmer: et gemt afledt tal driver fra sit
     grundlag, og det er fejlen i bemanding.ledig. */
  const kladder = DEMO_GRUNDLAG.filter((g) => g.tilstand === "kladde" && erGaeldende(g));
  const spaerrede = kladder.filter((g) => !kanGodkende(g, { etaper: DEMO_ETAPER }).ok);
  const udenMoms = DEMO_GRUNDLAG.filter((g) => erGaeldende(g) && linjerUdenMoms(g).length);

  /* ⚠ GENNEM summer(), ikke en reduce her. Den filtrerer på erGaeldende(), og
     det er hele pointen med to-vejs-referencen. */
  const sum = summer(DEMO_GRUNDLAG);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {k && (
        <KpiRaekke>
          {/* Fra kpi/ — en opgørelse på tværs af tenanten, som denne side af
              listen ikke kan regne ud. Betydningen er skærpet med beslutning 25:
              udført arbejde UDEN et låst grundlag. */}
          <KpiKort label="Ikke faktureret" vaerdi={kr(k.oekonomi.ikkeFaktureretOere)}
                   note="udført uden låst grundlag" />
          {/* De tre næste er AFLEDT af de hentede grundlag. Labelen siger hvilket
              udsnit, så tallet ikke læses som en total. */}
          <KpiKort label="Kladder" vaerdi={num(kladder.length)} note="i de hentede" />
          <KpiKort label="Spærret af åbne etaper" vaerdi={num(spaerrede.length)}
                   tone={spaerrede.length ? "warn" : undefined} note="kan ikke godkendes" />
          <KpiKort label="Mangler momssats" vaerdi={num(udenMoms.length)}
                   tone={udenMoms.length ? "warn" : undefined} note="eksport spærret" />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Gitter kolonner="minmax(0,3fr) minmax(0,2fr)">
        <Kort titel="Fakturagrundlag">
          <Tabel
            kolonner={[
              { key: "nummer", label: "Nummer", render: (g) => <Nummer g={g} /> },
              { key: "kunde", label: "Kunde", render: (g) => kundeNavn(g.kundeId) },
              { key: "tilstand", label: "Tilstand", render: (g) => <TilstandsPille g={g} /> },
              { key: "beloeb", label: "Beløb ekskl. moms", num: true,
                render: (g) => kr(totaler(g).beloebOere) },
              { key: "moms", label: "Moms", num: true,
                render: (g) => momsTekst(totaler(g).momsOere) },
            ]}
            raekker={DEMO_GRUNDLAG}
            noegle={(g) => g.id}
            paaRaekke={(g) => setValgtId(g.id)}
            erValgt={(g) => g.id === valgtId}
            tom="Ingen fakturagrundlag i perioden."
          />
          <div className="fc-row" style={{ justifyContent: "space-between", marginTop: 12 }}>
            <MiniLinje label={`Gældende grundlag (${sum.antal} af ${DEMO_GRUNDLAG.length})`}
                       vaerdi={kr(sum.beloebOere)} />
            <MiniLinje label="Moms" vaerdi={momsTekst(sum.momsOere)} />
          </div>
          {/* Står der frem for i en kommentar: forskellen mellem 4 poster og 3
              gældende ER korrektionen, og den skal kunne ses uden at regne. */}
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Summen tæller kun gældende grundlag. Et erstattet grundlag bliver
            stående i listen, men tælles ikke med — en rettelse må ikke blive
            en fordobling.
          </p>
        </Kort>

        {valgt ? <Detaljer g={valgt} /> : <Kort titel="Detaljer"><Tom>Vælg et grundlag.</Tom></Kort>}
      </Gitter>
    </div>
  );
}

/* ---- Nummeret, med erstatningen synlig -------------------------------- */

function Nummer({ g }) {
  const erstattet = !erGaeldende(g);
  return (
    <span>
      {/* Gennemstreget frem for skjult. Man skal kunne se hvad kunden fik
          første gang — det er netop det man bliver spurgt om. */}
      <span style={erstattet ? { textDecoration: "line-through", opacity: 0.7 } : undefined}>
        {g.nummer}
      </span>
      {erstattet && (
        <span className="fc-hint" style={{ marginLeft: 8 }}>
          erstattet af {DEMO_GRUNDLAG.find((x) => x.id === g.erstattetAfId)?.nummer || g.erstattetAfId}
        </span>
      )}
    </span>
  );
}

function TilstandsPille({ g }) {
  const t = GRUNDLAG_TILSTAND[g.tilstand];
  return <Pille tone={t?.pill || "info"}>{t?.label || g.tilstand}</Pille>;
}

/* ---- Detaljepanelet ---------------------------------------------------- */

function Detaljer({ g }) {
  const t = totaler(g);
  const godkendelse = kanGodkende(g, { etaper: DEMO_ETAPER });
  const eksport = kanEksportere(g);

  return (
    <Kort titel={g.nummer}>
      <Gitter kolonner="1fr 1fr">
        <MiniLinje label="Kunde" vaerdi={kundeNavn(g.kundeId)} />
        <MiniLinje label="Forløb" vaerdi={g.bookingId} />
        <MiniLinje label="Udarbejdet" vaerdi={dato(g.udarbejdetMs)} />
        <MiniLinje label="Godkendt" vaerdi={g.godkendtMs ? dato(g.godkendtMs) : "—"} />
      </Gitter>

      <Tabel
        kolonner={[
          { key: "tekst", label: "Linje",
            render: (l) => (
              <span>
                {l.tekst}
                <span className="fc-hint" style={{ marginLeft: 8 }}>
                  {LINJE_ART[l.art]?.label}
                </span>
              </span>
            ) },
          { key: "antal", label: "Antal", num: true,
            /* Vises som tal, gemmes som tusinddele. Enheden står ved siden af,
               så 2,5 ikke kan læses som 2,5 stk. når det er timer. */
            render: (l) => `${num(talFraAntal(l.antal), 1)} ${l.enhed || ""}` },
          { key: "sats", label: "Sats", num: true, render: (l) => kr(l.satsOere) },
          { key: "beloeb", label: "Beløb", num: true, render: (l) => kr(linjeBeloebOere(l)) },
          { key: "moms", label: "Moms", num: true, render: (l) => <MomsCelle l={l} /> },
        ]}
        raekker={g.linjer || []}
        noegle={(l) => l.id}
        tom="Grundlaget har ingen linjer."
      />

      <div style={{ marginTop: 12 }}>
        <MiniLinje label="I alt ekskl. moms" vaerdi={kr(t.beloebOere)} />
        <MiniLinje label="Moms" vaerdi={momsTekst(t.momsOere)} />
        <MiniLinje label="I alt inkl. moms" vaerdi={momsTekst(t.ialtOere)} />
      </div>

      <Spaerring titel="Kan ikke godkendes" tjek={godkendelse} />
      <Spaerring titel="Kan ikke eksporteres" tjek={eksport} />

      {g.erstatterId && (
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Erstatter {DEMO_GRUNDLAG.find((x) => x.id === g.erstatterId)?.nummer || g.erstatterId}.
        </p>
      )}

      <Historik poster={g.historik} />

      <div className="fc-row" style={{ gap: 8, marginTop: 12 }}>
        {/* FASE 0: knapperne skriver ikke. De er deaktiveret af det SAMME tjek
            som Cloud Functionen skal bruge — så UI og server er enige, og man
            kan se det. Titlen forklarer hvorfor, så en grå knap ikke er en
            gåde. */}
        <Knap variant="primaer" disabled title={godkendelse.ok
          ? "Fase 0: grundlag/ er endnu ikke i firebase.rules.json — der skrives ikke."
          : godkendelse.aarsager[0]}>
          Godkend
        </Knap>
        <Knap disabled title={eksport.ok
          ? "Fase 0: eksporten er ikke koblet til regnskabssystemet endnu."
          : eksport.aarsager[0]}>
          Eksportér
        </Knap>
      </div>
    </Kort>
  );
}

/** Momscellen. Et manglende tal får en advarsel — ikke et gæt og ikke et nul. */
function MomsCelle({ l }) {
  const oere = linjeMomsOere(l);
  if (oere === null) {
    return <Pille tone="warn">Sats mangler</Pille>;
  }
  return <span>{kr(oere)} <span className="fc-hint">({l.momssats} %)</span></span>;
}

/**
 * Alle årsager, ikke kun den første.
 *
 * En skærm der viser én ad gangen, sender disponenten frem og tilbage: han
 * retter det ene, klikker igen, og får det næste at vide.
 */
function Spaerring({ titel, tjek }) {
  if (tjek.ok) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <Pille tone="bad">{titel}</Pille>
      <ul style={{ margin: "8px 0 0 18px" }}>
        {tjek.aarsager.map((a, i) => <li key={i} className="fc-hint">{a}</li>)}
      </ul>
    </div>
  );
}

/** Historikken er append-only, og begrundelserne står HER — ikke i
 *  auditloggen, som er en allowliste uden fritekst. Se personale.js. */
function Historik({ poster = [] }) {
  if (!poster.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="fc-hint" style={{ marginBottom: 6 }}>Historik</div>
      {poster.map((p, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <MiniLinje label={datoTid(p.ms)} vaerdi={p.hvad} />
          {p.begrundelse && <div className="fc-hint" style={{ marginLeft: 8 }}>{p.begrundelse}</div>}
        </div>
      ))}
    </div>
  );
}
