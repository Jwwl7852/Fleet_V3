/* src/moduler/warehouse/Sporbarhed.jsx
 * Warehouse – sporbarhed. Etape 9.
 *
 * Skærmen svarer på tilbagekaldets spørgsmål: HVOR ER DET PARTI NU, og hvor
 * har det været? Planchen hedder "Sporbarhed & optælling"; optællingshalvdelen
 * er sin egen skærm siden etape 6.
 *
 * ---------------------------------------------------------------------------
 * FEM TING SKÆRMEN GØR SYNLIGE, FORDI DE ELLERS KUN STÅR I EN TEST
 *
 * 1. SPORET LÆSES ÆLDSTE FØRST. Modtaget, placeret, plukket, afsendt — det er
 *    en historie, og vendes den om, læser man forløbet baglæns uden at opdage
 *    det. Alle andre lister i huset er nyeste først, fordi de svarer på "hvad
 *    er der sket for nylig". Den her svarer på "hvad skete der med DEN her".
 *
 * 2. ET PARTI SLÅS OP PÅ VARE **OG** BATCH. To kunder kan have hver sin
 *    `LOT-1`. Uden varen ville et tilbagekald ramme en fremmed kundes gods —
 *    og det er den værste udgang af netop denne skærm.
 *
 * 3. EN BEHOLDER UDEN LOKATION ER IKKE EN FEJL. Den er i transit eller scannet
 *    ind uden at være sat. Skærmen skriver hvad det betyder frem for at vise
 *    en tom rubrik, som ville ligne manglende data.
 *
 * 4. EN AFSENDT ENHED BLIVER STÅENDE. Den har ingen beholder og tæller ikke
 *    med nogen steder — men sporet er hele grunden til at rækken findes.
 *    Sletter man den, kan ingen svare på hvor enheden blev af.
 *
 * 5. UENIGHEDEN MELLEM TALLET OG RÆKKERNE VISES. Se nedenfor.
 * ---------------------------------------------------------------------------
 *
 * ⚠ AFVIGELSESPANELET ER PRISEN VED ET VALG, IKKE EN FEJLMEDDELELSE.
 *
 * `enheder/<serienr>` og `beholdning` bærer den samme kendsgerning — det ene
 * som rækker, det andet som et tal. Det er bevidst valgt (WAREHOUSE.md punkt
 * 7), og det er samme klasse som `bemanding.ledig`: to steder der kan komme ud
 * af trit. Prisen betales tre steder, og det her er det tredje —
 * `enhedsafvigelse()` VISER uenigheden. En drift der ikke kan ses, er en drift
 * der ikke bliver rettet.
 *
 * Og som ved en negativ saldo: det er ikke et tal der skal rettes. Det er en
 * bevægelse der ikke er landet, og den skal findes.
 *
 * ⚠ SKÆRMEN SKRIVER INGENTING. Den er ren visning — der er ikke noget at
 * registrere her. Sporet er en følge af bevægelserne, og de registreres hvor
 * de sker: i Bevægelser, Modtagelse, Pluk og Optælling.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { datoTid, num } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, Knap, Felt, Feltraekke,
  Henter, Datatilstand, KpiKort, KpiRaekke, MiniLinje, Gitter,
} from "../../fleet/ui.jsx";
import { pladsnavn } from "../../fleet/turtlebooking.js";
import {
  BEVAEGELSE_ART, SPORING, ENHED, ENHED_TILSTAND, UDEN_BATCH,
  talFraMaengde, spor, partiPlacering, enhedsafvigelse,
} from "../../fleet/warehouse.js";
import {
  DEMO_VARER, DEMO_REOLPLADSER, DEMO_BEHOLDNING, DEMO_CARRIERS, DEMO_ENHEDER,
} from "../../fleet/demo-lager.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

/* Hvad man kan slå op. To slags, fordi der er to slags sporing — og en
   fælles søgeboks ville skulle gætte hvilken slags strengen var. */
const OPSLAG = {
  parti: { key: "parti", label: "Parti (vare + batch)" },
  enhed: { key: "enhed", label: "Enhed (serienummer)" },
};

export default function Sporbarhed() {
  const [art, saetArt] = useState("parti");
  const [vareId, saetVareId] = useState("");
  const [batch, saetBatch] = useState("");
  const [serienummer, saetSerienummer] = useState("");

  /* ⚠ HELE HISTORIKKEN, IKKE ET VINDUE. Et tilbagekald spørger om et parti
     der kan være modtaget for to år siden, og en afregningsperiode er
     ligegyldig her. Derfor `vindue: "alle"` — og derfor er grænsen sat, så
     man kan se at der ER en. Løber den fuld, er svaret et serverside-opslag,
     ikke en større grænse. */
  const {
    data: bevaegelser, tilstand, genindlaes, henter,
  } = useListe("bevaegelser", {
    division: "alle", vindue: "alle", graense: 5000, demo: [],
  });
  const { data: varer } = useListe("varer", {
    division: "alle", vindue: "alle", graense: 2000, demo: DEMO_VARER,
  });
  const { data: beholdning } = useListe("beholdning", {
    division: "alle", vindue: "alle", graense: 5000, demo: DEMO_BEHOLDNING,
  });
  const { data: carriers } = useListe("carriers", {
    division: "alle", vindue: "alle", graense: 2000, demo: DEMO_CARRIERS,
  });
  const { data: pladser } = useListe("reolpladser", {
    division: "alle", vindue: "alle", graense: 2000, demo: DEMO_REOLPLADSER,
  });
  const { data: enheder } = useListe("enheder", {
    division: "alle", vindue: "alle", graense: 5000, demo: DEMO_ENHEDER,
  });
  const { data: kunder } = useListe("kunder", {
    division: "alle", vindue: "alle", graense: 500, demo: DEMO_KUNDER,
  });

  if (henter) return <Henter hvad="sporet" />;

  const vareMap = Object.fromEntries(varer.map((v) => [v.id, v]));
  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const carrierMap = Object.fromEntries(carriers.map((c) => [c.id, c]));
  const kundeMap = Object.fromEntries(kunder.map((k) => [k.id, k.navn]));

  /* ⚠ EN BEHOLDER UDEN PLADS ER IKKE EN FEJL. Teksten siger hvad tilstanden
     ER, frem for at lade rubrikken stå tom — en tom rubrik læses som data der
     mangler. Se punkt 3 i hovedet. */
  const hvor = (carrierId) => {
    const c = carrierMap[carrierId];
    if (!c) return carrierId || "—";
    return c.pladsId
      ? `${c.id} · ${pladsnavn(pladsMap[c.pladsId])}`
      : `${c.id} · uden lokation`;
  };

  const enhedMap = Object.fromEntries(enheder.map((e) => [e.id, e]));
  const valgtEnhed = art === "enhed" ? enhedMap[serienummer.trim()] || null : null;

  /* ⚠ ENHEDENS VARE KOMMER FRA ENHEDEN, ikke fra vælgeren. Et serienummer
     bærer sin egen vare, og lod vi brugeren vælge en, kunne de to være
     uenige — og så ville sporet vise en anden vares historie. */
  const opslag = art === "enhed"
    ? { serienummer: serienummer.trim() || null }
    : { vareId: vareId || null, batch: batch.trim() || null };

  const harOpslag = art === "enhed" ? Boolean(opslag.serienummer) : Boolean(opslag.vareId);
  const linjer = harOpslag ? spor(bevaegelser, opslag) : [];
  const placeringer = art === "parti" && harOpslag
    ? partiPlacering(beholdning, opslag, { carriers })
    : [];

  const varen = art === "enhed"
    ? (valgtEnhed ? vareMap[valgtEnhed.vareId] : null)
    : vareMap[vareId];

  const afvigelser = enhedsafvigelse(beholdning, enheder, { varer });

  /* Kun serie-sporede varer kan slås op på serienummer. Vælgeren viser derfor
     alle varer i parti-opslaget, og skærmen skriver hvordan varen spores —
     ellers ville et tomt spor ligne en fejl frem for et forkert spørgsmål. */
  const serieVarer = varer.filter((v) => SPORING[v.sporing]?.kraeverSerie);

  const iHuset = enheder.filter((e) => ENHED_TILSTAND[e.tilstand]?.iHuset).length;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        {/* AFLEDT af de lister skærmen allerede har — hører derfor IKKE i
            kpi/. Et gemt afledt tal driver fra sit grundlag; det er fejlen i
            bemanding.ledig. */}
        <KpiKort label="Sporede enheder" vaerdi={num(enheder.length)}
                 note={`${num(iHuset)} i huset`} />
        <KpiKort label="Serie-sporede varer" vaerdi={num(serieVarer.length)}
                 note={`af ${num(varer.length)}`} />
        <KpiKort label="Bevægelser i sporet" vaerdi={harOpslag ? num(linjer.length) : "—"}
                 note={harOpslag ? "for opslaget" : "slå noget op"} />
        {/* ⚠ RØDT NÅR DE TO KILDER ER UENIGE. Se hovedet: det er prisen ved
            valget, gjort synlig — ikke en fejlmeddelelse. */}
        <KpiKort label="Uenige beholdere" vaerdi={num(afvigelser.length)}
                 tone={afvigelser.length ? "warn" : undefined}
                 note="tal mod enhedsrækker" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Slå op"
            under="Et parti er en vare og en batch. En enhed er ét serienummer.">
        <div className="fc-formular-knapper" style={{ marginTop: 0, marginBottom: 12 }}>
          {Object.values(OPSLAG).map((o) => (
            <Knap key={o.key} variant={art === o.key ? "primaer" : undefined}
                  onClick={() => art !== o.key && saetArt(o.key)}>
              {o.label}
            </Knap>
          ))}
        </div>

        {art === "parti" ? (
          <Feltraekke>
            <Felt id="sp-vare" label="Vare" kraevet vaerdi={vareId} saet={saetVareId}
                  valgmuligheder={[
                    { vaerdi: "", label: "Vælg en vare …" },
                    ...varer.map((v) => ({
                      vaerdi: v.id,
                      label: `${v.varenummer} · ${v.navn}`,
                    })),
                  ]}
                  hint="⚠ Batchen er kun entydig sammen med sin vare. To kunder kan have hver sin LOT-1." />
            <Felt id="sp-batch" label="Batch" vaerdi={batch} saet={saetBatch}
                  hint="Tom = varen spores ikke på batch." />
          </Feltraekke>
        ) : (
          <Feltraekke>
            <Felt id="sp-serie" label="Serienummer" kraevet vaerdi={serienummer}
                  saet={saetSerienummer}
                  hint={serieVarer.length
                    ? `Kun ${serieVarer.map((v) => v.varenummer).join(", ")} spores på serienummer.`
                    : "Ingen varer spores på serienummer endnu."} />
          </Feltraekke>
        )}

        {varen && (
          <p className="fc-hint" style={{ marginTop: 8 }}>
            {varen.varenummer} · {varen.navn} · {kundeMap[varen.kundeId] || varen.kundeId}
            {" · spores på "}<b>{SPORING[varen.sporing]?.label.toLowerCase() || varen.sporing}</b>
          </p>
        )}
      </Kort>

      {/* ---- Hvor er det NU? -------------------------------------------- */}
      {harOpslag && (
        <Kort titel="Hvor er det nu">
          {art === "enhed" ? (
            valgtEnhed ? (
              <Gitter kolonner="1fr 1fr">
                <MiniLinje label="Tilstand"
                           vaerdi={ENHED_TILSTAND[valgtEnhed.tilstand]?.label || valgtEnhed.tilstand} />
                <MiniLinje label="Kunde"
                           vaerdi={kundeMap[valgtEnhed.kundeId] || valgtEnhed.kundeId} />
                {/* ⚠ EN AFSENDT ENHED HAR INGEN BEHOLDER, og det er ikke
                    manglende data. Teksten siger det. */}
                <MiniLinje label="Beholder og hylde"
                           vaerdi={valgtEnhed.carrierId
                             ? hvor(valgtEnhed.carrierId)
                             : "ude af huset — se sporet nedenfor"} />
                <MiniLinje label="Senest rørt"
                           vaerdi={valgtEnhed.senestMs ? datoTid(valgtEnhed.senestMs) : "—"} />
              </Gitter>
            ) : (
              <Tom>
                Serienummeret findes ikke på lageret. Enten er det tastet forkert,
                eller også er enheden aldrig modtaget — en afsendt enhed bliver
                stående, så den ville have været her.
              </Tom>
            )
          ) : placeringer.length ? (
            <Tabel
              kolonner={[
                { key: "carrier", label: "Beholder og hylde" },
                { key: "antal", label: "Antal", hoejre: true },
                { key: "kunde", label: "Kunde" },
              ]}
              raekker={placeringer.map((p) => ({
                id: p.id,
                carrier: hvor(p.carrierId),
                antal: `${talFraMaengde(p.antal)} ${ENHED[varen?.enhed]?.label || ""}`,
                kunde: kundeMap[varen?.kundeId] || "—",
              }))}
            />
          ) : (
            <Tom>
              Der ligger ikke noget af partiet på lageret. Det kan være afsendt —
              sporet nedenfor viser hvor det blev af.
            </Tom>
          )}
        </Kort>
      )}

      {/* ---- Sporet ------------------------------------------------------ */}
      {harOpslag && (
        <Kort titel="Sporet"
              under="Ældste først. Et forløb læses forfra — modtaget, placeret, plukket, afsendt.">
          {linjer.length ? (
            <Tabel
              kolonner={[
                { key: "tid", label: "Hvornår" },
                { key: "art", label: "Hvad" },
                { key: "fra", label: "Fra" },
                { key: "til", label: "Til" },
                { key: "antal", label: "Antal", hoejre: true },
                { key: "ref", label: "Reference" },
              ]}
              raekker={linjer.map((b, i) => ({
                id: b.id || `sp-${i}`,
                tid: datoTid(b.tidspunktMs),
                art: <Pille tone="info">{BEVAEGELSE_ART[b.art]?.label || b.art}</Pille>,
                fra: b.fraCarrierId ? hvor(b.fraCarrierId) : "—",
                til: b.tilCarrierId ? hvor(b.tilCarrierId) : "—",
                antal: b.antal != null ? talFraMaengde(b.antal) : "—",
                ref: b.reference || b.note || "—",
              }))}
            />
          ) : (
            <Tom>
              Ingen bevægelser. {art === "parti" && varen && SPORING[varen.sporing]?.kraeverBatch && !batch.trim()
                ? "Varen spores på batch — skriv hvilken."
                : "Partiet er aldrig registreret ind."}
            </Tom>
          )}
        </Kort>
      )}

      {/* ---- Uenigheden -------------------------------------------------- */}
      <Kort titel="Tal mod enhedsrækker"
            under="Beholdningen siger hvor mange. Enhederne siger hvilke. De skal stemme.">
        {afvigelser.length ? (
          <>
            <Tabel
              kolonner={[
                { key: "carrier", label: "Beholder" },
                { key: "vare", label: "Vare" },
                { key: "saldo", label: "Beholdning", hoejre: true },
                { key: "enheder", label: "Enhedsrækker", hoejre: true },
              ]}
              raekker={afvigelser.map((a) => ({
                id: `${a.carrierId}__${a.vareId}`,
                carrier: hvor(a.carrierId),
                vare: vareMap[a.vareId]?.varenummer || a.vareId,
                saldo: num(a.saldo),
                enheder: num(a.enheder),
              }))}
            />
            {/* ⚠ IKKE "RET TALLET". Se hovedet: en uenighed er en bevægelse
                der ikke er landet, ikke et tal der er forkert. Samme holdning
                som ved en negativ saldo. */}
            <p className="fc-hint" style={{ marginTop: 8 }}>
              ⚠ <b>Det er ikke et tal der skal rettes.</b> De to kilder skrives i
              den samme opdatering, så en uenighed betyder at en bevægelse ikke
              er landet — eller at nogen har skrevet uden om <code>bevaegelseskriv</code>.
              Find bevægelsen. En optælling retter saldoen, men ikke enhederne.
            </p>
          </>
        ) : (
          <Tom>
            Ingen uenighed. Beholdningstallet og antallet af enhedsrækker
            stemmer for hver serie-sporet vare.
          </Tom>
        )}
      </Kort>
    </div>
  );
}
