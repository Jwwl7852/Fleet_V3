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
 * ⚠ VINDUET ER FREMADRETTET. Shellens periodevælger er BAGUD ("Seneste 30
 * dage") — den svarer på hvad der er sket, og en booking handler om hvad der
 * skal ske. At låne den knap ville være at bruge et instrument til noget andet
 * end det måler. Alt uden for vinduet står i listen nedenfor, som rækker så
 * langt frem der er lovet noget væk.
 *
 * ⚠ MEN DET ER IKKE FAST LÆNGERE. Længden vælges — 1, 2 eller 4 uger — og
 * pilene flytter en uge ad gangen. Låst på fire uger kunne skærmen kun svare
 * på ét spørgsmål i én opløsning, og på otteogtyve kolonner er dagen så smal
 * at man tæller sig frem til den.
 *
 * ⚠ OG HOVEDRÆKKERNE FØLGER MED AF SIG SELV. Ved én uges visning ville
 * "Måned" og "Uge" hver få ÉT felt der spænder hele vinduet — to rækker der
 * siger det samme som datoen i forvejen gør. Gitteret dropper et niveau der
 * kun har én gruppe; se niveauErNyttigt() i gitter.js. Kalderen siger stadig
 * HVILKE grupperinger der giver mening, men ikke hvornår de er tomme.
 */
import { useEffect, useMemo, useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { skiftUdlaan } from "../../fleet/udlaan.js";
import { num, dato, ugenr } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, KpiKort, KpiRaekke, Knap, Faner,
  Formularsvar,
} from "../../fleet/ui.jsx";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import { ENHED, maanedNoegle, ugeNoegle } from "../../fleet/gitter.js";
import {
  UDLAAN_TILSTAND, BINDENDE, KASSE_STATUS, halvaabent, iVindue, pladsnavn,
  sagsblokke, sagstilstand, dageUde, naesteSkift,
  udlaansblokke, UDLAAN_ART, ALLE_UDLAAN_ARTER,
  klargoeresSnart, KLARGOER_VINDUE_TIMER, SKIFTELABEL, SKIFTEFORKLARING,
} from "../../fleet/unitbooking.js";
import {
  DEMO_KASSER, DEMO_KASSETYPER, DEMO_KASSEUDLAAN,
} from "../../fleet/demo-unitbooking.js";
import { DEMO_REOLPLADSER } from "../../fleet/demo-lager.js";

const DAG = 86400000;

/**
 * Hvor langt vinduet kan være. Planchen har "1 uge / 2 uger / 1 md."
 *
 * ⚠ FIRE UGER, IKKE "1 MÅNED", OG DET ER IKKE SJUSK. En kalendermåned er
 * 28–31 dage, så et vindue på en måned ville begynde og slutte midt i en uge —
 * og "Uge"-rækken i hovedet ville få en halv uge i hver ende. Fire uger er
 * fire hele uger, og skubbet flytter netop en uge. Forskellen er højst tre
 * dage; en hovedrække der ikke passer med sine egne grupper, er en fejl man
 * ser hver gang.
 *
 * ⚠ OG STANDARDEN BLIVER FIRE UGER. Det var det eneste vindue der fandtes før,
 * og den der åbner skærmen, skal se det samme som i går.
 */
const VINDUER = [
  { uger: 1, label: "1 uge" },
  { uger: 2, label: "2 uger" },
  { uger: 4, label: "4 uger" },
];
const STANDARD_UGER = 4;

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
  /* ⚠ VINDUET VAR FAST OG UDEN NOGEN VEJ FREM. Otteogtyve dage fra i går, og
     dag niogtyve fandtes ikke — hverken ved at rulle eller ved at klikke.
     Kalenderen kunne kun svare på ét spørgsmål, og det var altid det samme.
     Skubbet flytter en UGE ad gangen, ikke fire: springer man et helt vindue,
     kan et udlån der ligger hen over kanten forsvinde uden at nogen ser det. */
  const [skubUger, setSkubUger] = useState(0);
  /* ⚠ PLANCHENS INTERVAL-VÆLGER. Vinduet var låst på fire uger, og skærmen
     kunne kun svare på ét spørgsmål i én opløsning: "hvad sker der den her
     måned". En uge er et andet spørgsmål — "hvad skal der ske nu" — og på
     fire uger er kolonnerne så smalle at man tæller sig frem til dagen. */
  const [uger, setUger] = useState(STANDARD_UGER);
  /* ⚠ PLANCHENS "grupperet efter kasse-id eller sag". De to svarer på hvert
     sit spørgsmål: kasserækken på "hvornår er DEN her kasse optaget",
     sagsrækken på "hvornår er udstillingen i gang". Det andet kan ikke læses
     af det første når en sag har fire kasser. */
  const [gruppering, setGruppering] = useState("kasse");
  /* ⚠ PLANCHENS "Fremhæv". Alle tre er slået til fra start — en kalender der
     åbner med noget skjult, viser mindre end der er, og den der ikke ved at
     kontrollen findes, tror det er alt. */
  const [arter, setArter] = useState(ALLE_UDLAAN_ARTER);
  const [svaev, setSvaev] = useState(null);
  /* ⚠ PLANCHENS "Aabn naesten fuldskaerm". Problemet er BREDDE: otteogtyve
     kolonner skal dele skaermen med en sidebar paa 216 px. Hver kolonne der
     bliver bredere, er en dato man ikke skal knibe oejnene sammen for. */
  const [fuld, setFuld] = useState(false);
  /* ⚠ PERMISSIONEN, IKKE ROLLEN — og kun til at tegne knappen. Serveren
     spørger om den samme, og `kasseudlaan` er `.write: false`. */
  const { bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.kasseudlaanSkriv);

  /* ⚠ ESCAPE LUKKER DEN. En visning der dækker skærmen og kun kan forlades med
     en museklik-knap, er en fælde — og den der er endt i den, leder efter
     browserens tilbageknap, som fører helt væk fra siden. Samme greb som
     dialogen bruger. */
  useEffect(() => {
    if (!fuld) return undefined;
    const paaTast = (e) => { if (e.key === "Escape") setFuld(false); };
    window.addEventListener("keydown", paaTast);
    return () => window.removeEventListener("keydown", paaTast);
  }, [fuld]);
  const vindueDage = uger * 7;
  const vindueFra = iDag.getTime() - DAG + skubUger * 7 * DAG;
  const vindueTil = vindueFra + vindueDage * DAG;

  /* ⚠ EN ANNULLERET RESERVATION TEGNES IKKE. Den skete ikke, og en blok for
     den ville få kassen til at se optaget ud i en periode hvor den er fri.
     En RETURNERET tegnes derimod: den viser hvor kassen HAR været, og det er
     det man kigger efter når nogen spørger hvorfor den ikke var hjemme. */
  const iVinduet = useMemo(() => udlaan.filter(
    (u) => u.tilstand !== "annulleret" && iVindue(u, vindueFra, vindueTil)),
    [udlaan, vindueFra, vindueTil]);

  const typeNavn = (id) => typer.find((t) => t.id === id)?.navn || id;
  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));

  /* Kun ressourcer med noget i vinduet. Et gitter med hundrede rækker hvoraf
     seks har en blok, skjuler de seks. */
  const kasseraekker = useMemo(() => {
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

  /* ⚠ TRE BLOKKE PR. UDLÅN, IKKE ÉN — planchens "fremhævning pr. art".
     Klargøring, udlån og returnering er tre stykker arbejde for tre
     forskellige mennesker på tre forskellige dage, og en enkelt bjælke fra
     afgang til retur viser ingen af dem. De ligger i FORLÆNGELSE af hinanden,
     ikke oven på: gitteret ville ellers tegne dem som en konflikt. Se
     udlaansblokke().

     ⚠ OG ID'ET BÆRER BEGGE DELE. Svævekortet slår op på `data-blok`, og det
     skal kunne finde UDLÅNET igen — ikke bare arten. */
  const kasseblokke = iVinduet.flatMap((u) =>
    udlaansblokke(u)
      .filter((b) => arter.includes(b.art))
      .map((b) => ({
        id: `${u.id}__${b.art}`,
        raekkeId: u.kasseId,
        /* ⚠ HER SKER OVERSÆTTELSEN, OG KUN HER. Se hovedet. */
        ...halvaabent(b),
        /* ⚠ ARTEN STÅR I BLOKKEN, ikke kun som farve. Farven alene kræver at
           man kender paletten, og på et printet eller sort/hvidt skærmbillede
           findes den ikke — så ville blokken kun sige et sagsnummer. Rækkens
           pille siger hvad kassen er NU; blokkens siger hvad DEN her periode
           er for noget. */
        label: `${UDLAAN_ART[b.art].label} · Sag ${u.sagsnummer}`,
        titel: [u.beskrivelse, `Udlånet er ${UDLAAN_TILSTAND[u.tilstand]?.label}`]
          .filter(Boolean).join(" — "),
        tone: UDLAAN_ART[b.art].pill,
      })));

  /* --- Grupperet efter SAG ------------------------------------------- */

  /* ⚠ EN SAGSRÆKKE ER IKKE EN EKSKLUSIV RESSOURCE. Gitteret tegner overlap i
     samme række som en KONFLIKT — med vilje, fordi to udlån på ÉN kasse er
     noget `konflikter()` ville afvise. Men et museum låner et helt sæt til én
     udstilling: fire kasser i samme periode er det normale. Lagde vi de fire
     udlån råt i sagens række, ville hver eneste udstilling stå som fire røde
     konfliktblokke. `sagsblokke()` fletter dem — se noten dér. */
  const sagsperioder = useMemo(() => sagsblokke(iVinduet), [iVinduet]);

  const sagsraekker = useMemo(() => {
    const set = new Map();
    for (const b of sagsperioder) {
      if (set.has(b.sagsnummer)) continue;
      const foerste = iVinduet.find((u) => u.sagsnummer === b.sagsnummer);
      set.set(b.sagsnummer, {
        id: b.sagsnummer,
        label: `Sag ${b.sagsnummer}`,
        under: foerste?.beskrivelse || "",
      });
    }
    return [...set.values()];
  }, [sagsperioder, iVinduet]);

  const sagsblokListe = sagsperioder.map((b, i) => {
    const t = sagstilstand(b.tilstande);
    return {
      id: `${b.sagsnummer}-${i}`,
      raekkeId: b.sagsnummer,
      ...halvaabent(b),
      /* Antallet står i blokken: det er hele forskellen på de to grupperinger,
         og uden det ville en sag med fire kasser se ud som en med én. */
      label: `${b.kasser.length} ${b.kasser.length === 1 ? "kasse" : "kasser"} · ` +
             `${UDLAAN_TILSTAND[t]?.label || t}`,
      titel: b.kasser.join(", "),
      tone: UDLAAN_TILSTAND[t]?.pill,
    };
  });

  const efterSag = gruppering === "sag";
  const raekker = efterSag ? sagsraekker : kasseraekker;
  const blokke = efterSag ? sagsblokListe : kasseblokke;

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
                 note={`af ${num(kasser.length)} i de viste ${num(vindueDage)} dage`} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {/* ⚠ EN VEJ HJEM. Uden den kan man klikke sig fem uger ud og kun komme
          tilbage ved at tælle klik baglæns — og så ved man ikke hvornår man er
          hjemme igen. Knappen vises kun når man ER væk; ellers ville den sige
          "gå hen hvor du står". */}
      <Fuldskaerm naar={fuld}>
      <Kort titel={`Udlånskalender · ${dato(vindueFra)} – ${dato(vindueTil - DAG)}`}
            handling={
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* ⚠ VÆLGEREN NULSTILLER IKKE SKUBBET. Har man bladret tre
                    uger frem og skifter til én uges visning, vil man se den
                    uge man kigger på — ikke hoppe hjem. Startdatoen står fast;
                    det er kun længden der ændrer sig. */}
                {/* ⚠ GRUPPERINGEN ER ET SPØRGSMÅL, IKKE EN VISNING. Kassen
                    svarer "hvornår er den her kasse optaget"; sagen svarer
                    "hvornår er udstillingen i gang". Med fire kasser på én sag
                    kan det andet ikke læses af det første. */}
                <Faner
                  faner={[
                    { key: "kasse", label: "Pr. kasse" },
                    { key: "sag", label: "Pr. sag" },
                  ]}
                  valgt={gruppering} saet={setGruppering} label="Gruppering"
                />
                <Faner
                  faner={VINDUER.map((v) => ({ key: String(v.uger), label: v.label }))}
                  valgt={String(uger)}
                  saet={(v) => setUger(Number(v))}
                  label="Vindue"
                />
                {/* ⚠ PLANCHENS "Fremhæv" — kun ved gruppering pr. kasse.
                    En sagsrække er FLERE udlån flettet sammen (6.14), og der
                    findes ingen enkelt art at fremhæve; en kontakt der ikke
                    gjorde noget, ville være en pæn knap.
                    ⚠ OG DEN SIDSTE KAN IKKE SLÅS FRA. Et gitter uden en eneste
                    art er et tomt gitter, og det ligner en tom periode frem
                    for et filter man selv har sat. */}
                {gruppering === "kasse" && ALLE_UDLAAN_ARTER.map((a) => {
                  const paa = arter.includes(a);
                  const sidste = paa && arter.length === 1;
                  return (
                    <Knap
                      key={a}
                      variant={paa ? "primaer" : "sekundaer"}
                      aria-pressed={paa}
                      disabled={sidste}
                      title={sidste
                        ? "Mindst én art skal vises — et tomt gitter ligner en tom periode."
                        : `${paa ? "Skjul" : "Vis"} ${UDLAAN_ART[a].label.toLowerCase()}`}
                      onClick={() => setArter((x) => (paa
                        ? x.filter((y) => y !== a)
                        : ALLE_UDLAAN_ARTER.filter((y) => x.includes(y) || y === a)))}
                    >
                      {UDLAAN_ART[a].label}
                    </Knap>
                  );
                })}
                {skubUger !== 0 && <Knap onClick={() => setSkubUger(0)}>I dag</Knap>}
                {/* ⚠ "NÆSTEN", IKKE HELT. Der er en kant hele vejen rundt, og
                    baggrunden bliver stående. Et element der dækker hver
                    eneste pixel, ser ud som en NY SIDE — og så leder man efter
                    browserens tilbageknap i stedet for at lukke det. */}
                <Knap onClick={() => setFuld((f) => !f)}
                      title={fuld
                        ? "Luk fuldskærm. Escape gør det samme."
                        : "Giver kalenderen hele bredden. Escape lukker igen."}>
                  {fuld ? "Luk fuldskærm" : "Fuld skærm"}
                </Knap>
              </span>
            }>
        {/* ⚠ SVÆVEKORTET KOMMER AF `data-blok` PÅ ELEMENTET, ikke af et
            onHover i gitteret. Gitteret bruges af fire skærme, og et
            hover-kald med sin egen tilstand ville have været en femte ting de
            fire skulle være enige om. Se noten ved blokken i Gitterkalender.
            ⚠ OG KUN VED GRUPPERING PR. KASSE. En sagsblok er FLERE udlån
            flettet sammen (se sagsblokke()); et kort der viste ét af dem,
            ville påstå at være hele sagen. */}
        <div
          onMouseLeave={() => setSvaev(null)}
          onMouseMove={(e) => {
            if (efterSag) return;
            const knap = e.target.closest?.("[data-blok]");
            if (!knap) { setSvaev(null); return; }
            /* ⚠ ID'ET ER SAMMENSAT siden arterne blev tre: udlånets id, to
               understreger, og arten. Kortet viser UDLÅNET, ikke arten — det
               er den samme reservation uanset hvilken af de tre blokke musen
               står på. Se udlaansblokke(). */
            const u = iVinduet.find(
              (x) => x.id === String(knap.dataset.blok).split("__")[0]);
            if (u) setSvaev({ x: e.clientX, y: e.clientY, udlaan: u });
          }}
        >
        <Gitterkalender
          raekker={raekker}
          blokke={blokke}
          fra={vindueFra}
          til={vindueTil}
          enhed={ENHED.dag}
          /* ⚠ MÅNED OVER UGE OVER DAG. Ved fire uger er otteogtyve datoer i
             én række ulæselige — det var præcis sådan skærmen så ud. Måneden
             og ugen står derfor for sig, som planchen viser.
             ⚠ OG DE FORSVINDER SELV VED KORTE VINDUER. Ved én uge ville hver
             af de to få ÉT felt der spænder alt — to rækker der siger det
             samme som datoen i forvejen gør. Gitteret dropper et niveau med
             kun én gruppe; kalderen siger stadig HVILKE grupperinger der
             giver mening for hans data. Se niveauErNyttigt(). */
          niveauer={[
            { navn: "Måned", noegle: maanedNoegle },
            { navn: "Uge", noegle: ugeNoegle },
          ]}
          onSkub={(retning) => setSkubUger((u) => u + retning)}
          tom={skubUger === 0
            ? "Ingen kasser er lovet væk i de næste fire uger."
            : "Ingen kasser er lovet væk i den viste periode."}
        />
        </div>
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Kun kasser med et udlån i perioden vises. Vinduet starter{" "}
          <b>fremadrettet</b>, længden vælges foroven, og pilene under
          kalenderen flytter det <b>én uge</b> ad gangen — også ved fire ugers
          visning, så et udlån hen over kanten ikke kan springes over.
          Topbarens periodevælger ser bagud og hører til rapporterne. Alt der
          ligger længere ude, står i listen nedenfor.
          Gitteret ligger i <b>fleet/Gitterkalender.jsx</b> og bruges også af
          Driftskalender, Servicekalender og Disponering.
        </p>
      </Kort>
      </Fuldskaerm>

      {/* ⚠ PLANCHENS SIDEPANEL — og §6.8 skrev selv at det der manglede, var
          KNAPPEN: "man kan klargøre direkte fra kalenderen". Handlingen er den
          samme som Udlån-skærmens, fordi der kun findes én. */}
      <Klargoeringspanel
        klargoer={klargoeresSnart(udlaan, nu)}
        kasser={kasser}
        pladsMap={pladsMap}
        maaSkrive={maaSkrive}
        paaSkiftet={genindlaes}
      />

      {svaev && (
        <Svaevekort
          svaev={svaev}
          kasse={kasser.find((k) => k.id === svaev.udlaan.kasseId) || null}
          typeNavn={typeNavn}
          pladsMap={pladsMap}
        />
      )}

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

/* ---- Svævekortet -------------------------------------------------------- */

/**
 * ⚠ UNITBOOKING HAR SIT EGET, OG DET ER IKKE EN KOPI AF FLEETS.
 *
 * UNITBOOKING.md 6.3 sagde at de to skærme ikke måtte få hver sit svævekort —
 * en analogi til gitteret. Analogien holder ikke: **gitteret er en FORM,
 * svævekortet er INDHOLD.** Gitteret tegner ressourcer × tid uanset hvad en
 * blok betyder. Et svævekort viser en ENTITETS felter, og et `kasseudlaan` og
 * en `opgave` har ingenting til fælles — forskellige noder, forskellige
 * feltskemaer, forskellige kataloger. Fleets kort viser `arbejdstype`,
 * `leverandoerId` og `prioritet`; ingen af de tre findes på et udlån.
 *
 * Et fælles kort skulle tage et felt-array ind fra begge skærme, og så er det
 * ikke en delt komponent længere — det er en tabel med en ramme om.
 *
 * ⚠ DET DER ER FÆLLES, ER UDSEENDET, og det er det allerede: `.fc-svaev` står
 * i `fleet.css` med sin placering, sin skygge og sine to kolonner. Ændres
 * hvordan et svævekort SER ud, sker det ét sted.
 */
function Svaevekort({ svaev, kasse, typeNavn, pladsMap }) {
  const u = svaev.udlaan;
  /* Holdes inden for vinduet: et kort der stikker ud over højre kant, kan ikke
     læses, og et der lægger sig under musen, blinker. */
  const x = Math.min(svaev.x + 16, (window.innerWidth || 1200) - 340);
  const y = Math.min(svaev.y + 16, (window.innerHeight || 800) - 220);

  /* ⚠ MÅLT ELLER PLANLAGT — FLAGET ER VIGTIGERE END TALLET. `fra`/`til` er
     AFTALEN; `udleveretMs`/`returneretMs` er hvad der skete. Uden skellet
     læses "20 dage" som en måling, og er kassen kommet hjem i forvejen, er
     det forkert på en måde ingen kan se. Se dageUde() og beslutning 37. */
  const ude = dageUde(u);

  return (
    <div className="fc-svaev" style={{ left: x, top: y }} role="tooltip">
      <div className="fc-svaev-t">Sag {u.sagsnummer}</div>
      {u.beskrivelse && (
        <div className="fc-svaev-r"><span>Arbejde</span><span>{u.beskrivelse}</span></div>
      )}
      <div className="fc-svaev-r"><span>Kasse</span><span>{u.kasseId}</span></div>
      {kasse && (
        <div className="fc-svaev-r"><span>Type</span><span>{typeNavn(kasse.type)}</span></div>
      )}
      {kasse && (
        <div className="fc-svaev-r">
          <span>Hjemplads</span><span>{pladsnavn(pladsMap[kasse.hjemPladsId])}</span>
        </div>
      )}
      {/* ⚠ INKLUSIVE I BEGGE ENDER. Et udlån 1.–15. er også ude den 15.
          Gitteret regner halvåbent, og oversættelsen sker i halvaabent() — men
          det man LÆSER her, er aftalen som den blev indgået. */}
      <div className="fc-svaev-r"><span>Fra</span><span>{dato(u.fra)}</span></div>
      <div className="fc-svaev-r"><span>Til</span><span>{dato(u.til)}</span></div>
      {Number.isFinite(u.klargoerSenest) && (
        <div className="fc-svaev-r">
          <span>Klargøres senest</span><span>{dato(u.klargoerSenest)}</span>
        </div>
      )}
      <div className="fc-svaev-r">
        <span>{ude.faktisk ? "Ude (målt)" : "Ude (planlagt)"}</span>
        <span>{num(ude.dage)} dage</span>
      </div>
      <div className="fc-svaev-r">
        <span>Tilstand</span>
        <span>
          <Pille tone={UDLAAN_TILSTAND[u.tilstand]?.pill || "info"}>
            {UDLAAN_TILSTAND[u.tilstand]?.label || u.tilstand}
          </Pille>
        </span>
      </div>
    </div>
  );
}

/* ---- Kommende klargøringer ---------------------------------------------- */

/**
 * Planchens sidepanel — men med den knap der er hele pointen.
 *
 * ⚠ §6.8 SKREV SELV HVAD DER MANGLEDE: *"planchens pointe er at man kan
 * klargøre direkte fra kalenderen. Knappen findes på Udlån-skærmen, og at låne
 * den hertil kræver at de to skærme deler den samme handling — ikke to
 * kopier."* Det gør de: `skiftUdlaan()` i `udlaan.js` er den ENE vej ind,
 * fordi `kasseudlaan` er `.write: false`. Der er ingen handling at kopiere —
 * og ordene på knappen ligger nu også ét sted, i `unitbooking.js`.
 *
 * ⚠ OG SKRIDTET SLÅS OP, DET SKRIVES IKKE. `naesteSkift()` siger hvad der
 * kommer efter `booket`, og det er den SAMME tabel serveren håndhæver. Skrev
 * panelet "klargjort" direkte, ville det være en knap der kunne blive ulovlig
 * uden at nogen rettede den.
 *
 * ⚠ LISTEN ER `klargoeresSnart()` — DEN SAMME SOM NØGLETALLET. To lister for
 * ét spørgsmål ville kunne blive uenige, og forskellen ville se ud som et
 * datahul frem for to filtre. Se 6.12.
 *
 * ⚠ DEN KAN MINIMERES, MEN DEN FORSVINDER IKKE. Planchen har en knap; en
 * lukket tilstand hvor panelet var VÆK, ville skjule de kasser der haster —
 * netop for den der ryddede op i sin skærm. Sammenklappet står tallet stadig,
 * og siger hvor mange der er bagud.
 */
function Klargoeringspanel({ klargoer, kasser, pladsMap, maaSkrive, paaSkiftet }) {
  const [aaben, saetAaben] = useState(true);
  const [arbejder, saetArbejder] = useState(null);
  const [svar, saetSvar] = useState(null);
  const nu = Date.now();

  const hjemplads = (kasseId) =>
    pladsnavn(pladsMap[kasser.find((k) => k.id === kasseId)?.hjemPladsId]);

  const skift = async (u) => {
    /* ⚠ SKRIDTET FRA TABELLEN, ikke en streng. Se hovedet. */
    const til = naesteSkift(u.tilstand);
    if (!til) return;
    saetArbejder(u.id);
    saetSvar(null);
    const r = await skiftUdlaan({ udlaanId: u.id, til });
    saetArbejder(null);
    saetSvar(r);
    if (r.ok) paaSkiftet();
  };

  return (
    <Kort
      titel={`Kommende klargøringer (${num(klargoer.antal)})`}
      handling={<Knap onClick={() => saetAaben((a) => !a)}>{aaben ? "Skjul" : "Vis"}</Knap>}
    >
      {!aaben ? (
        <p className="fc-hint">
          {klargoer.antal
            ? <>
                <b>{num(klargoer.antal)}</b> skal klargøres inden for{" "}
                {KLARGOER_VINDUE_TIMER / 24} dage
                {klargoer.bagud ? <> — heraf <b className="fc-bad">{num(klargoer.bagud)}</b> bagud</> : null}.
              </>
            : "Intet haster."}
        </p>
      ) : (
        <>
          <Tabel
            kolonner={[
              /* ⚠ EN OVERSKREDEN FRIST SKAL SES. Den er ikke faldet ud af
                 listen — se klargoeresSnart() — og den skal heller ikke ligne
                 de andre. */
              { key: "klargoerSenest", label: "Senest", render: (u) => (
                  u.klargoerSenest < nu
                    ? <span className="fc-bad">{dato(u.klargoerSenest)} — bagud</span>
                    : dato(u.klargoerSenest)) },
              { key: "kasseId", label: "Kasse", render: (u) => <b>{u.kasseId}</b> },
              { key: "hjem", label: "Hjemplads", render: (u) => (
                  <span className="fc-hint">{hjemplads(u.kasseId)}</span>) },
              { key: "sagsnummer", label: "Sag" },
              { key: "handling", label: "", render: (u) => {
                  const til = naesteSkift(u.tilstand);
                  return (
                    <Knap
                      variant="primaer"
                      disabled={!maaSkrive || !til || arbejder === u.id}
                      title={maaSkrive
                        ? SKIFTEFORKLARING[til]
                        : `Kræver ${PERM.kasseudlaanSkriv} — reglerne afviser.`}
                      onClick={() => skift(u)}
                    >
                      {SKIFTELABEL[til] || "—"}
                    </Knap>
                  );
                } },
            ]}
            raekker={klargoer.poster}
            tom="Ingen kasser skal klargøres inden for de næste syv dage."
          />

          <Formularsvar svar={svar} okTekst="Kassen er klargjort." />

          {klargoer.udenDato > 0 && (
            /* ⚠ DE UDEN DATO ER IKKE NUL — DE ER ET UBESVARET SPØRGSMÅL.
               `klargoerSenest` er valgfri (6.12), og et udlån uden den kan
               hverken tælles med eller fra. Stod det ikke her, ville listen
               påstå at være fuldstændig. */
            <p className="fc-hint" style={{ marginTop: 10 }}>
              ⚠ <b>{num(klargoer.udenDato)}</b> reservationer har ingen
              klargøringsfrist og kan derfor hverken tælles med eller fra. De
              står under <b>Udlån</b>.
            </p>
          )}

          <p className="fc-hint" style={{ marginTop: 10 }}>
            Knappen er <b>den samme handling</b> som på Udlån-skærmen —{" "}
            <code>kasseudlaanskriv</code> skriver udlånet og kassen i én
            transaktion. <code>kasseudlaan</code> er <b>.write: false</b>, så
            der er ingen anden vej ind at kopiere.
          </p>
        </>
      )}
    </Kort>
  );
}

/**
 * Pakker sit indhold ind i en næsten-fuldskærm, eller lader det stå.
 *
 * ⚠ "NÆSTEN", OG DET ER IKKE ET KOMPROMIS. Der er en kant hele vejen rundt, og
 * baggrunden bliver stående. Et element der dækker hver eneste pixel, ser ud
 * som en NY SIDE — og så leder man efter browserens tilbageknap i stedet for
 * at lukke det. Kanten siger at man står oven på noget.
 *
 * ⚠ OG DEN LIGGER UNDER DIALOGEN. `.fc-fuld` er z-index 50,
 * `.fc-dialog-baggrund` er 80: en dialog åbnet herfra skal stadig kunne ses.
 *
 * ⚠ Escape lukker den — se `useEffect` i skærmen. En visning der dækker
 * skærmen og kun kan forlades med en museklik-knap, er en fælde.
 */
function Fuldskaerm({ naar, children }) {
  if (!naar) return children;
  return (
    <div className="fc-fuld" role="region" aria-label="Udlånskalender i fuld skærm">
      {children}
    </div>
  );
}
