/* src/moduler/warehouse/Volumen.jsx
 * Warehouse – volumenkalkulator. Etape 8.
 *
 * Planchen: *m², m³, paller → månedspris. En tilbudsberegner.* Det er et
 * SALGSVÆRKTØJ. En kunde ringer og siger "jeg har omkring 120 paller og
 * regner med 40 ind og 40 ud om måneden" — og sælgeren skal kunne svare med
 * husets egne priser, mens de taler sammen.
 *
 * ---------------------------------------------------------------------------
 * FEM TING SKÆRMEN GØR SYNLIGE, FORDI DE ELLERS KUN STÅR I EN TEST
 *
 * 1. ⚠ TALLET ER ET ESTIMAT, OG FORUDSÆTNINGERNE STÅR VED SIDEN AF DET.
 *    Priserne er vores og er rigtige. Mængderne er kundens gæt og er det
 *    ikke. Et beløb der står alene, læses som en pris — og så er det den
 *    sælgeren bliver holdt fast på, når det viser sig at være 180 paller.
 *    `tilbudsberegning()` returnerer altid `forudsaetninger`; skærmen har
 *    ikke lov til at vise beløbet uden dem. Samme familie som forbeholdet i
 *    `tjekKoerehviletid()` og `faktisk`-flaget i `dageUde()`.
 *
 * 2. MAN VÆLGER ÉT GRUNDLAG. Paller, m³ og m² er tre måder at måle det SAMME
 *    gods på. Var de tre felter, ville de blive udfyldt — og så faktureres
 *    den samme plads tre gange.
 *
 * 3. EN MANGLENDE PRIS SPÆRRER SUMMEN. Ydelsen kommer med på listen uden et
 *    beløb, og totalen kan ikke gøres op. Udelod vi linjen, ville tilbuddet
 *    se komplet ud mens en ydelse manglede sin pris — og sælgeren ville give
 *    den væk uden at vide det. Samme regel som på Afregning.
 *
 * 4. EN MÅNED ER 30 DØGN, OG DET STÅR PÅ SKÆRMEN. Opbevaring prissættes pr.
 *    døgn, så "månedspris" kræver at nogen har besluttet hvad en måned er.
 *    Uden tallet ville modtageren af tilbuddet ikke kunne regne efter.
 *
 * 5. KILDEN STÅR PÅ HVER LINJE — standard, rabat eller kundens egen pris. Et
 *    tilbud til en EKSISTERENDE kunde skal regne med hans aftale; et tilbud
 *    til et emne kan kun bruge standardprisen. Forskellen skal kunne ses.
 * ---------------------------------------------------------------------------
 *
 * ⚠ DER OPRETTES INTET TILBUD, OG DET ER IKKE EN MANGEL I DEN HER ETAPE.
 * Nodeformen for et tilbud er ikke besluttet — se `DEMO_TILBUD` i
 * demo-kunder.js: et tilbud kan gå til et EMNE der ikke er kunde endnu, og
 * `tilbud` er ikke en bookingtilstand. En "Gem tilbud"-knap ville afgøre det
 * spørgsmål ved et uheld. Beregneren giver et tal; tallet skrives på
 * tilbuddet den dag noden findes.
 *
 * ⚠ OG SKÆRMEN REGNER IKKE SELV. `tilbudsberegning()` i volumen.js og
 * `prisFor()` i pricing.js — begge ét sted, så en anden skærm ikke kan komme
 * til at svare noget andet på det samme spørgsmål.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { kr, num } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Tom, KpiKort, KpiRaekke,
  Felt, Feltraekke, Knap, MiniLinje
} from "../../fleet/ui.jsx";
import {
  KAPACITETSGRUNDLAG, ALLE_KAPACITETSGRUNDLAG, TILBUDSHAANDTERINGER,
  DOEGN_PR_MAANED, tilbudsberegning, kubikFraLinjer
} from "../../fleet/volumen.js";
import {
  prisFor, STANDARDGRUPPE, PRISKILDE, LAGERYDELSER, METODER
} from "../../fleet/pricing.js";
import { MAENGDE_SKALA, talFraMaengde } from "../../fleet/warehouse.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";
import { DEMO_VARER } from "../../fleet/demo-lager.js";

/* Tal ind fra en tekstboks → husets skala. Tom streng er 0, ikke NaN: et
   ufyldt felt er "ingen håndteringer", ikke en fejl. */
const skaleret = (s) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * MAENGDE_SKALA) : 0;
};

export default function Volumen() {
  const [grundlag, saetGrundlag] = useState("palle");
  const [maengde, saetMaengde] = useState("120");
  const [maaneder, saetMaaneder] = useState("12");
  const [kundeId, saetKundeId] = useState("");
  const [haandtering, saetHaandtering] = useState({
    "lager-handlingInd": "40", "lager-handlingUd": "40"
  });

  const {
    data: kunder, tilstand, genindlaes, henter
  } = useListe("kunder", {
    ordnPaa: "navn", vindue: "alle", graense: 200, demo: DEMO_KUNDER
  });
  const { data: standardposter } = useListe(`satser/${STANDARDGRUPPE}`, {
    division: "alle", vindue: "alle", graense: 500, demo: []
  });
  /* Varerne bruges kun til rumfangsberegneren nederst — kunden har måske
     allerede sine varer i systemet, og så skal han ikke gætte sit eget m³. */
  const { data: varer } = useListe("varer", {
    division: "alle", vindue: "alle", graense: 2000, demo: DEMO_VARER
  });

  if (henter) return <Henter hvad="priserne" />;

  const kunde = kunder.find((k) => k.id === kundeId) || null;
  const standard = Object.fromEntries(standardposter.map((p) => [p.id, p]));

  /* ⚠ ÉN OPSLAGSVEJ. prisFor() bygger på satsPaa(), som bærer beslutning 7 om
     at satser aldrig overskrives. En kopi her ville være to steder der afgør
     hvilken pris der gjaldt.

     ⚠ OG ET EMNE FÅR STANDARDPRISEN. Vælges ingen kunde, er `kunde` tomt, og
     prisFor() falder tilbage på standarden — som den skal: et tilbud til en
     der ikke er kunde endnu, kan ikke regne med en aftale der ikke findes. */
  const slaaOp = (ydelseId) => prisFor(
    { standard, kunde: kunde?.priser || {} }, ydelseId);

  const beregning = tilbudsberegning({
    grundlag,
    maengde: skaleret(maengde),
    maaneder: Number(maaneder) || 0,
    haandteringer: Object.fromEntries(
      TILBUDSHAANDTERINGER.map((h) => [h.ydelseId, skaleret(haandtering[h.ydelseId] || 0)])),
    prisFor: slaaOp
  });

  const g = KAPACITETSGRUNDLAG[grundlag];
  const udenPris = beregning.linjer.filter((l) => l.satsOere == null);

  /* Rumfang ud af varernes egne mål — for den kunde der allerede har sine
     varer registreret. AFLEDT af data skærmen har; hører ikke i kpi/. */
  const kundensVarer = kunde ? varer.filter((v) => v.kundeId === kunde.id) : [];

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Pris pr. måned"
                 vaerdi={beregning.sum.prMaanedOere == null ? "—" : kr(beregning.sum.prMaanedOere)}
                 note={beregning.sum.mangler ? "en pris mangler" : "ekskl. moms"}
                 tone={beregning.sum.mangler ? "warn" : undefined} />
        <KpiKort label="I alt for perioden"
                 vaerdi={beregning.sum.ialtOere == null ? "—" : kr(beregning.sum.ialtOere)}
                 note={`${num(beregning.doegn)} døgn`} />
        <KpiKort label="Ydelser uden pris" vaerdi={num(udenPris.length)}
                 tone={udenPris.length ? "warn" : undefined}
                 note={udenPris.length ? "summen kan ikke gøres op" : "alle har en pris"} />
        <KpiKort label="Prisgrundlag"
                 vaerdi={kunde ? "Kundens aftale" : "Standard"}
                 note={kunde ? kunde.navn : "intet emne valgt"} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Hvad skal der regnes på"
            under="Priserne er vores. Mængderne er kundens — se forbeholdet nedenfor.">
        {/* ⚠ ÉT GRUNDLAG, VALGT — IKKE TRE FELTER. Paller, m³ og m² er tre
            måder at måle det samme gods på; var de tre felter, ville de blive
            udfyldt, og den samme plads faktureret tre gange. */}
        <div className="fc-formular-knapper" style={{ marginTop: 0, marginBottom: 12 }}>
          {ALLE_KAPACITETSGRUNDLAG.map((k) => (
            <Knap key={k} variant={grundlag === k ? "primaer" : undefined}
                  onClick={() => grundlag !== k && saetGrundlag(k)}>
              {KAPACITETSGRUNDLAG[k].label}
            </Knap>
          ))}
        </div>

        <Feltraekke>
          <Felt id="v-maengde" label={`Mængde (${g.enhed})`} kraevet
                vaerdi={maengde} saet={saetMaengde} hint={g.hint} />
          <Felt id="v-mdr" label="Periode (måneder)" kraevet
                vaerdi={maaneder} saet={saetMaaneder}
                hint={`En måned regnes som ${DOEGN_PR_MAANED} døgn — opbevaring prissættes pr. døgn.`} />
          <Felt id="v-kunde" label="Kunde eller emne" vaerdi={kundeId} saet={saetKundeId}
                valgmuligheder={[
                  { vaerdi: "", label: "Emne — brug standardpriser" },
                  ...kunder.map((k) => ({ vaerdi: k.id, label: k.navn })),
                ]}
                hint="En eksisterende kunde regnes med sin egen aftale." />
        </Feltraekke>

        <p className="fc-hint" style={{ marginTop: 12, marginBottom: 4 }}>
          Forventet aktivitet pr. måned. Et felt der står tomt, giver ingen linje —
          en linje på 0 kr. i et tilbud ligner en ydelse kunden får gratis.
        </p>
        <Feltraekke>
          {TILBUDSHAANDTERINGER.map((h) => (
            <Felt key={h.ydelseId} id={`v-${h.ydelseId}`} label={h.label}
                  vaerdi={haandtering[h.ydelseId] || ""}
                  saet={(v) => saetHaandtering((s) => ({ ...s, [h.ydelseId]: v }))}
                  suffiks={h.enhed} />
          ))}
        </Feltraekke>
      </Kort>

      <Kort titel="Beregningen"
            handling={<Link className="fc-a" to="/opsaetning/priser">Se priserne</Link>}>
        <Tabel
          kolonner={[
            { key: "ydelse", label: "Ydelse" },
            { key: "grundlag", label: "Grundlag" },
            { key: "sats", label: "Sats", hoejre: true },
            { key: "kilde", label: "Pris fra" },
            { key: "beloeb", label: "Beløb", hoejre: true },
          ]}
          raekker={beregning.linjer.map((l) => ({
            id: l.ydelseId,
            ydelse: (
              <>
                <b>{l.label}</b>{" "}
                <span className="fc-hint">
                  {METODER[LAGERYDELSER[l.ydelseId]?.metode]?.label.toLowerCase()}
                </span>
              </>
            ),
            /* Regnestykket, ikke kun resultatet. Kan man ikke se hvordan
               tallet fremkom, kan man ikke forsvare det over for kunden. */
            grundlag: l.doegn
              ? `${talFraMaengde(l.antal)} ${l.enhed} × ${num(l.doegn)} døgn`
              : `${talFraMaengde(l.antal)} ${l.enhed.replace("/md.", "")} i alt`,
            /* ⚠ TO DECIMALER PAA SATSEN, og det er ikke pynt: en
               palleplads koster 2,50 kr. i doegnet, og "3 kr." ville goere
               regnestykket uforklarligt — 120 × 360 × 3 er ikke 108.000.
               Totalerne staar i hele kroner som alle andre steder. */
            sats: l.satsOere == null ? "—" : kr(l.satsOere, 2),
            kilde: l.kilde
              ? <Pille tone={PRISKILDE[l.kilde]?.tone}>{PRISKILDE[l.kilde]?.label}</Pille>
              : <Pille tone="warn">Mangler</Pille>,
            beloeb: l.beloebOere == null ? "—" : kr(l.beloebOere)
          }))}
        />

        <div style={{ marginTop: 12 }}>
          <MiniLinje label={`I alt for ${maaneder || 0} md. (${num(beregning.doegn)} døgn)`}
                     vaerdi={beregning.sum.ialtOere == null ? "—" : kr(beregning.sum.ialtOere)} />
          <MiniLinje label="Pr. måned, ekskl. moms"
                     vaerdi={beregning.sum.prMaanedOere == null ? "—" : kr(beregning.sum.prMaanedOere)} />
        </div>

        {udenPris.length > 0 && (
          <p className="fc-hint" style={{ marginTop: 8 }}>
            ⚠ <b>{udenPris.length === 1 ? "En ydelse mangler" : `${udenPris.length} ydelser mangler`} sin
            pris</b>, og summen kan derfor ikke gøres op:{" "}
            {udenPris.map((l) => LAGERYDELSER[l.ydelseId]?.navn || l.ydelseId).join(", ")}.
            Sæt den under <Link className="fc-a" to="/opsaetning/priser">Standardpriser</Link> —
            linjen udelades ikke, for så ville tilbuddet se komplet ud.
          </p>
        )}
      </Kort>

      {/* ══════════════════════════════════════════════════════════════════
          ⚠ FORBEHOLDET STÅR VED TALLET, IKKE I EN FODNOTE. Se hovedet:
          priserne er vores og er rigtige, mængderne er kundens gæt og er det
          ikke. Feltet kommer fra tilbudsberegning() — skærmen kan ikke vise
          beløbet uden at vise hvad det hviler på.
          ══════════════════════════════════════════════════════════════════ */}
      <Kort titel="Hvad tallet hviler på"
            under="Et estimat, ikke et tilbud. Priserne er vores; mængderne er oplyst.">
        <Tabel
          kolonner={[
            { key: "hvad", label: "Forudsætning" },
            { key: "vaerdi", label: "Værdi" },
            { key: "note", label: "" },
          ]}
          raekker={beregning.forudsaetninger.map((f, i) => ({
            id: `f-${i}`, hvad: <b>{f.hvad}</b>, vaerdi: f.vaerdi,
            note: <span className="fc-hint">{f.note}</span>
          }))}
        />
        <p className="fc-hint" style={{ marginTop: 8 }}>
          ⚠ <b>Der oprettes ikke et tilbud herfra.</b> Nodeformen er ikke
          besluttet: et tilbud kan gå til et <b>emne</b> der ikke er kunde
          endnu, og <code>tilbud</code> er ikke en bookingtilstand. En knap der
          gemte tilbuddet, ville afgøre det spørgsmål ved et uheld. Tallet
          skrives på tilbuddet den dag noden findes — tilbudsmodellen står i{" "}
          <code>fleet/demo-kunder.js</code>.
        </p>
      </Kort>

      {/* ---- Rumfang ud af varernes mål ---------------------------------- */}
      {grundlag === "kubik" && (
        <Kort titel="Kender vi allerede varerne?"
              under="Rumfanget kan regnes af varernes egne mål — så skal kunden ikke gætte.">
          {kunde ? (
            kundensVarer.length ? (
              <Tabel
                kolonner={[
                  { key: "vare", label: "Vare" },
                  { key: "maal", label: "Mål (mm)" },
                  { key: "kubik", label: "m³ pr. stk.", hoejre: true },
                ]}
                raekker={kundensVarer.map((v) => {
                  const { kubik, uden } = kubikFraLinjer(
                    [{ vareId: v.id, antal: MAENGDE_SKALA }], { varer: kundensVarer });
                  return {
                    id: v.id,
                    vare: `${v.varenummer} · ${v.navn}`,
                    maal: uden.length
                      ? "—"
                      : `${v.laengdeMm} × ${v.breddeMm} × ${v.hoejdeMm}`,
                    /* ⚠ EN VARE UDEN MÅL TÆLLER IKKE SOM NUL. Den står med
                       en streg: et nul ville se ud som et regnestykke der er
                       gået op. */
                    kubik: uden.length ? "mål mangler" : kubik.toFixed(3)
                  };
                })}
              />
            ) : (
              <Tom>{kunde.navn} har ingen varer registreret endnu.</Tom>
            )
          ) : (
            <Tom>
              Vælg en eksisterende kunde for at regne rumfanget ud af hans
              varer. Et emne har ingen varer hos os endnu — dér er m³ noget
              kunden oplyser.
            </Tom>
          )}
        </Kort>
      )}
    </div>
  );
}
