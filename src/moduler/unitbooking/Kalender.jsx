/* src/moduler/unitbooking/Kalender.jsx
 * Unitbooking – kalender og udlånsliste.
 *
 * ⚠ GITTERET ER IKKE BYGGET HER. `fleet/Gitterkalender.jsx` tegner ressourcer
 * × tid og bruges også af Driftskalender, Servicekalender og Disponering.
 * CLAUDE.md forbyder et fjerde: to gitre der læser det samme interval
 * forskelligt, opdages ikke ved at kigge på dem.
 *
 * ⚠ OG NETOP DERFOR ER `halvaabent()` DET VIGTIGSTE I FILEN. Gitteret regner
 * halvåbent `[fra, til)`; et udlån er inklusivt i begge ender. Tegnes udlånet
 * råt, mangler den SIDSTE dag — og kassen ser fri ud den dag den stadig står
 * hos museet. Oversættelsen sker ét sted, i `unitbooking.js`, og den er prøvet
 * mod `overlapper()` på hver kombination i ti dage.
 *
 * ⚠ VINDUET ER FREMADRETTET OG FAST. Shellens periodevælger er BAGUD
 * ("Seneste 30 dage") — den svarer på hvad der er sket, og en booking handler
 * om hvad der skal ske. At låne den knap ville være at bruge et instrument
 * til noget andet end det måler. Alt uden for vinduet står i listen nedenfor,
 * som rækker så langt frem der er lovet noget væk.
 */
import { useMemo } from "react";
import { useListe } from "../../fleet/useListe.js";
import { num, dato, ugenr } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Tom, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import { ENHED } from "../../fleet/gitter.js";
import {
  UDLAAN_TILSTAND, BINDENDE, KASSE_STATUS, halvaabent, iVindue, pladsnavn,
} from "../../fleet/unitbooking.js";
import {
  DEMO_KASSER, DEMO_KASSETYPER, DEMO_KASSEUDLAAN,
} from "../../fleet/demo-unitbooking.js";
import { DEMO_REOLPLADSER } from "../../fleet/demo-lager.js";

const DAG = 86400000;

/* Fire uger frem fra i går. Kort nok til at kolonnerne kan læses på en
   skærm, langt nok til at et typisk udlån er synligt — og de udlån der
   rækker udenfor, får en pil af gitteret frem for at blive klippet i
   stilhed. Se de to ting Gitterkalenderen holder fast i. */
const VINDUE_DAGE = 28;

/* Listen rækker et år frem. Længere er der ikke nogen der planlægger, og en
   liste med alt er en liste ingen læser. */
const HORISONT_DAGE = 365;

/**
 * Hændelserne i et udlån: den dag kassen skal UD, og den dag den skal HJEM.
 *
 * ⚠ TO RÆKKER PR. UDLÅN, IKKE ÉN. Lageret arbejder efter hændelser, ikke
 * efter perioder: mandag skal disse pakkes, torsdag kommer disse retur. Ét
 * udlån over to måneder ville stå ét sted i en periodeliste og være usynligt
 * begge de uger hvor der faktisk skulle gøres noget.
 */
function haendelser(udlaan, nu) {
  const ud = [];
  for (const u of udlaan) {
    if (!BINDENDE.includes(u.tilstand)) continue;
    /* Er kassen allerede ude, er afhentningen sket — så er den hændelse
       historik, og kun returen står tilbage. */
    if (u.tilstand !== "udlaant") {
      ud.push({ ...u, id: `${u.id}-ud`, naar: u.fra, art: "ud" });
    }
    ud.push({ ...u, id: `${u.id}-hjem`, naar: u.til, art: "hjem" });
  }
  return ud
    .filter((h) => h.naar < nu + HORISONT_DAGE * DAG)
    .sort((a, b) => a.naar - b.naar);
}

/**
 * Hvad der mangler, i én sætning — eller null.
 *
 * ⚠ DEN HER KOLONNE ER HELE GRUNDEN TIL LISTEN. En dato alene siger ikke om
 * nogen skal gøre noget. "Skulle være ude i går, er ikke klargjort" gør.
 */
function mangler(h, nu) {
  if (h.art === "ud") {
    if (h.naar < nu) {
      return h.tilstand === "klargjort"
        ? "Skulle være udleveret — kassen står klar"
        : "Skulle være ude — er ikke klargjort endnu";
    }
    if (h.tilstand === "booket" && h.naar < nu + 3 * DAG) {
      return "Skal klargøres inden afhentning";
    }
    return null;
  }
  if (h.naar < nu && h.tilstand === "udlaant") return "Over tiden — ikke kommet hjem";
  return null;
}

export default function Kalender() {
  const { data: udlaan, tilstand, genindlaes, henter } = useListe("kasseudlaan", {
    division: "alle", graense: 2000, demo: DEMO_KASSEUDLAAN,
  });
  const { data: kasser } = useListe("kasser", {
    division: "alle", graense: 1000, demo: DEMO_KASSER,
    sorter: (a, b) => a.id.localeCompare(b.id, "da"),
  });
  const { data: typer } = useListe("kassetyper", {
    division: "alle", graense: 100, demo: DEMO_KASSETYPER,
  });
  const { data: pladser } = useListe("reolpladser", {
    division: "alle", graense: 500, demo: DEMO_REOLPLADSER,
  });

  const nu = Date.now();
  const iDag = new Date(nu); iDag.setHours(0, 0, 0, 0);
  const vindueFra = iDag.getTime() - DAG;
  const vindueTil = vindueFra + VINDUE_DAGE * DAG;

  /* ⚠ EN ANNULLERET RESERVATION TEGNES IKKE. Den skete ikke, og en blok for
     den ville få kassen til at se optaget ud i en periode hvor den er fri.
     En RETURNERET tegnes derimod: den viser hvor kassen HAR været, og det er
     det man kigger efter når nogen spørger hvorfor den ikke var hjemme. */
  const iVinduet = useMemo(() => udlaan.filter(
    (u) => u.tilstand !== "annulleret" && iVindue(u, vindueFra, vindueTil)),
    [udlaan, vindueFra, vindueTil]);

  const typeNavn = (id) => typer.find((t) => t.id === id)?.navn || id;
  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));

  /* Kun kasser med noget i vinduet. Et gitter med hundrede rækker hvoraf
     seks har en blok, skjuler de seks. */
  const raekker = useMemo(() => {
    const ider = new Set(iVinduet.map((u) => u.kasseId));
    return kasser.filter((k) => ider.has(k.id)).map((k) => ({
      id: k.id,
      label: k.id,
      under: typeNavn(k.type),
      pille: (
        <Pille tone={KASSE_STATUS[k.status]?.pill || "info"}>
          {KASSE_STATUS[k.status]?.label || k.status}
        </Pille>
      ),
    }));
  }, [iVinduet, kasser, typer]);

  const blokke = iVinduet.map((u) => ({
    id: u.id,
    raekkeId: u.kasseId,
    /* ⚠ HER SKER OVERSÆTTELSEN, OG KUN HER. Se hovedet. */
    ...halvaabent(u),
    label: `Sag ${u.sagsnummer}`,
    titel: u.beskrivelse || undefined,
    tone: UDLAAN_TILSTAND[u.tilstand]?.pill,
  }));

  if (henter) return <Henter hvad="kalenderen" />;

  const liste = haendelser(udlaan, nu);
  const denneUge = liste.filter((h) => h.naar >= iDag.getTime() && h.naar < iDag.getTime() + 7 * DAG);
  const bagud = liste.filter((h) => h.naar < iDag.getTime() && mangler(h, nu));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Ud denne uge"
                 vaerdi={num(denneUge.filter((h) => h.art === "ud").length)}
                 note="skal pakkes og afhentes" />
        <KpiKort label="Hjem denne uge"
                 vaerdi={num(denneUge.filter((h) => h.art === "hjem").length)}
                 note="skal modtages og sættes på plads" />
        {/* ⚠ DEN HER MÅ IKKE GEMMES VÆK. En kasse der ikke er kommet hjem, er
            ikke en fejl i systemet — det er en kasse nogen skal ringe om. */}
        <KpiKort label="Bagud" vaerdi={num(bagud.length)}
                 note={bagud.length
                   ? bagud.map((h) => h.kasseId).slice(0, 3).join(", ")
                   : "intet er skredet"} />
        <KpiKort label="Kasser i spil" vaerdi={num(raekker.length)}
                 note={`af ${num(kasser.length)} i de næste ${VINDUE_DAGE} dage`} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel={`Udlånskalender · ${dato(vindueFra)} – ${dato(vindueTil - DAG)}`}>
        <Gitterkalender
          raekker={raekker}
          blokke={blokke}
          fra={vindueFra}
          til={vindueTil}
          enhed={ENHED.dag}
          tom="Ingen kasser er lovet væk i de næste fire uger."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Kun kasser med et udlån i perioden vises. Vinduet er <b>fast og
          fremadrettet</b> — topbarens periodevælger ser bagud og hører til
          rapporterne. Alt der ligger længere ude, står i listen nedenfor.
          Gitteret ligger i <b>fleet/Gitterkalender.jsx</b> og bruges også af
          Driftskalender, Servicekalender og Disponering.
        </p>
      </Kort>

      <Kort titel={`Udlånsliste · ${num(liste.length)} hændelser`}>
        <Tabel
          kolonner={[
            { key: "uge", label: "Uge", midt: true,
              render: (h) => <span className="fc-hint">{ugenr(h.naar)}</span> },
            { key: "naar", label: "Dato", render: (h) => dato(h.naar) },
            /* ⚠ VERBET, IKKE TILSTANDEN. Den der læser listen, skal vide hvad
               han skal gøre — ikke hvilken tilstand posten er i. */
            { key: "art", label: "Hændelse", render: (h) => (
                <Pille tone={h.art === "ud" ? "warn" : "ok"}>
                  {h.art === "ud" ? "Ud" : "Hjem"}
                </Pille>
              ) },
            { key: "kasse", label: "Kasse", render: (h) => <b>{h.kasseId}</b> },
            { key: "plads", label: "Hjemplads", render: (h) => {
                const k = kasser.find((x) => x.id === h.kasseId);
                return <span className="fc-hint">{pladsnavn(pladsMap[k?.hjemPladsId])}</span>;
              } },
            { key: "sag", label: "Sag", render: (h) => h.sagsnummer },
            { key: "besk", label: "Beskrivelse",
              render: (h) => <span className="fc-hint">{h.beskrivelse || "—"}</span> },
            { key: "tilstand", label: "Tilstand", render: (h) => (
                <Pille tone={UDLAAN_TILSTAND[h.tilstand]?.pill || "info"}>
                  {UDLAAN_TILSTAND[h.tilstand]?.label || h.tilstand}
                </Pille>
              ) },
            { key: "mangler", label: "", render: (h) => {
                const m = mangler(h, nu);
                return m
                  ? <span className="fc-bad">{m}</span>
                  : <span className="fc-neutral">—</span>;
              } },
          ]}
          raekker={liste}
          tom="Ingen kasser er lovet væk. Reservationer oprettes under Udlån."
        />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>Et udlån står to gange</b> — den dag kassen skal ud, og den dag
          den skal hjem. Lageret arbejder efter hændelser, ikke efter perioder:
          et udlån over to måneder ville ellers være usynligt i begge de uger
          hvor der faktisk skulle gøres noget. Er kassen allerede ude, er
          afhentningen historik, og kun returen står tilbage.
        </p>
      </Kort>
    </div>
  );
}
