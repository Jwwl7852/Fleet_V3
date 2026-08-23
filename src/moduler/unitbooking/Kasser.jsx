/* src/moduler/unitbooking/Kasser.jsx
 * Unitbooking – kasser.
 *
 * ⚠ EN UDLÅNT KASSE OPTAGER IKKE EN REOLPLADS. Prototypen skrev "Udlånt hos
 * kunde" SOM PLADS. Så kunne ledige hylder ikke tælles, og en plads var
 * optaget af en kasse der fysisk stod i Paris. Her er det en TILSTAND, og
 * `pladsId` er fraværende — formularen skjuler feltet og reglerne afviser det.
 *
 * ⚠ HJEMPLADS OG NUVÆRENDE PLADS ER TO TING. Hvor kassen HØRER TIL, og hvor
 * den STÅR. De er ens det meste af tiden, og netop derfor skal de være to
 * felter: den dag en kasse er sat på en anden hylde, er forskellen det eneste
 * der kan finde den igen.
 *
 * ⚠ EN KASSE SLETTES ALDRIG. Der hænger udlånshistorik på id'et. En kasse der
 * går i stykker, får status `udeAfDrift` og bliver stående — samme regel som
 * en solgt bil (beslutning 18). Der er ingen slet-knap.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, dato, pct, iDagIso, isoTilMs, msTilIso, mindst } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular,
  Henter, Datatilstand, Tom, Ikon, Sider, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import {
  KASSE_STATUS, ALLE_KASSE_STATUS, SELVVALGT_KASSE_STATUS,
  kraeverPlads, valideKasse, pladsnavn, naesteReservation, undertyperFor,
  mmFraCm, cmFraMm, kassebelaegning,
} from "../../fleet/unitbooking.js";
import { maalFraMm, volumenIalt } from "../../fleet/volumen.js";
import { gem } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import {
  DEMO_KASSER, DEMO_KASSETYPER, DEMO_KASSEUDLAAN,
} from "../../fleet/demo-unitbooking.js";
import { DEMO_REOLPLADSER } from "../../fleet/demo-lager.js";

const PR_SIDE = 12;

/* Volumen af formularens cm-felter. ⚠ Tallene rundes til to decimaler i
   VISNINGEN — ikke i data. Et rundet maal gemt ville vaere en anden kasse. */
const maalAfFelter = (f) => maalFraMm({
  laengdeMm: mmFraCm(f.laengdeCm), breddeMm: mmFraCm(f.breddeCm),
  hoejdeMm: mmFraCm(f.hoejdeCm),
});
const m2 = (f) => (maalAfFelter(f)?.m2 ?? 0).toFixed(2).replace('.', ',');
const m3 = (f) => (maalAfFelter(f)?.m3 ?? 0).toFixed(2).replace('.', ',');

const tomKasse = () => ({
  id: "", type: "", undertype: "", status: "ledig", hjemPladsId: "", pladsId: "",
  laengdeCm: "", breddeCm: "", hoejdeCm: "", note: "", udeAfDriftIso: "",
});

function Kasseformular({ kasse, typer, pladser, sti, paaGemt, paaLuk }) {
  const nyt = !kasse;
  const [f, saetF] = useState(() => (kasse
    ? {
      ...tomKasse(), ...kasse,
      /* Noden bærer mm; formularen viser cm. Se mmFraCm(). */
      laengdeCm: cmFraMm(kasse.laengdeMm), breddeCm: cmFraMm(kasse.breddeMm),
      hoejdeCm: cmFraMm(kasse.hoejdeMm),
      udeAfDriftIso: Number.isFinite(kasse.udeAfDriftFra)
        ? msTilIso(kasse.udeAfDriftFra) : "",
    }
    : tomKasse()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => {
      const ny = { ...x, [felt]: v };
      /* ⚠ SKIFTER STATUS TIL UDLÅNT, FORSVINDER PLADSEN. Ellers ville
         formularen sende et pladsId reglerne afviser — og brugeren skulle
         gætte hvorfor. */
      if (felt === "status" && !kraeverPlads(v)) ny.pladsId = "";
      /* Sættes den tilbage på lager uden en plads, foreslås hjempladsen: det
         er dér den hører til, og det er nitten gange ud af tyve rigtigt. */
      if (felt === "status" && kraeverPlads(v) && !ny.pladsId) ny.pladsId = ny.hjemPladsId;
      return ny;
    });
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  /* katalog: hele typerne, saa undertypen kan slaas op mod SIN egen type. */
  const ctx = { typer: typer.map((t) => t.id), pladser: pladser.map((p) => p.id), katalog: typer };
  /* ⚠ isoTilMs SAETTER KLOKKEN 12, IKKE MIDNAT — se format.js. En dato der
     rykker sig en dag, opdages ikke ved at kigge paa den. */
  const udeAfDriftFra = f.udeAfDriftIso ? isoTilMs(f.udeAfDriftIso) : null;
  const fejl = valideKasse(
    { ...f, pladsId: f.pladsId || null, udeAfDriftFra }, ctx);
  /* ⚠ FEJLNØGLEN OG FELTNAVNET ER IKKE ALTID DET SAMME. Datoen hedder
     `udeAfDriftIso` i formularen, men fejlen hedder `udeAfDriftFra` — og uden
     det ekstra led ville feltet aldrig vise sin fejl, fordi det aldrig blev
     "rørt" under det navn fejlen bar. Præcis den fælde står allerede skrevet
     ned i Planlaegdialog, og den her formular havde den enkle udgave. Tredje
     gang mønstret dukker op. */
  const vis = (fejlNoegle, ...roerteNoegler) => {
    const noegler = roerteNoegler.length ? roerteNoegler : [fejlNoegle];
    return visAlle || noegler.some((k) => roert[k]) ? fejl[fejlNoegle] : null;
  };
  const kanGemme = Object.keys(fejl).length === 0;
  const paaLager = kraeverPlads(f.status);

  /* Undertyperne paa den VALGTE type — ikke alle typers. */
  const undertyper = undertyperFor(typer.find((t) => t.id === f.type));

  /* ⚠ ET TYPESKIFT RYDDER UNDERTYPEN. Uden det bliver en alukasses
     "XL" staaende naar man skifter til Traekasse, og formularen sender en
     kombination reglen afviser — med en fejl der peger paa undertypen,
     mens brugeren rettede typen. */
  const saetType = (v) => {
    saetF((x) => ({ ...x, type: v, undertype: "" }));
    saetRoert((x) => ({ ...x, type: true }));
    saetSvar(null);
  };

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = (kasse?.id || f.id).trim();
    const data = {
      type: f.type,
      /* ⚠ NULSTILLES NAAR TYPEN SKIFTER — se saetType nedenfor. Null og ikke
         tom streng: reglen kraever en streng der findes i katalogget. */
      undertype: f.undertype || null,
      status: f.status, hjemPladsId: f.hjemPladsId,
      laengdeMm: mmFraCm(f.laengdeCm), breddeMm: mmFraCm(f.breddeCm),
      hoejdeMm: mmFraCm(f.hoejdeCm),
      pladsId: paaLager ? f.pladsId : null,
      /* ⚠ KUN NAAR DEN ER UDE AF DRIFT. Bliver kassen ledig igen, ryddes
         datoen: et felt der blev staaende, ville faa kalenderen til at tegne
         en blok paa en kasse der virker. Status er sandheden. */
      udeAfDriftFra: f.status === "udeAfDrift" ? udeAfDriftFra : null,
      note: f.note?.trim() || null,
    };
    const r = await gem({
      sti: sti(`kasser/${id}`), data, foer: kasse || null,
      objekt: "kasser", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  const pladsvalg = pladser.map((p) => ({ vaerdi: p.id, label: pladsnavn(p) }));

  return (
    <Kort titel={nyt ? "Ny kasse" : `Redigér ${kasse.id}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret kasse" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          {/* ⚠ ID'ET ER KASSENS PÅSKRIFT og kan ikke ændres bagefter: der
              hænger udlån på det. */}
          <Felt id="k-id" label="Kasse-id" kraevet vaerdi={nyt ? f.id : kasse.id}
                saet={nyt ? saet("id") : undefined} readOnly={!nyt} fejl={vis("id")}
                hint={nyt ? "Står på kassen. Fx MDT-101." : "Kan ikke ændres — der hænger udlån på id'et."} />
          <Felt id="k-type" label="Type" kraevet vaerdi={f.type} saet={saetType}
                fejl={vis("type")}
                valgmuligheder={typer.map((t) => ({ vaerdi: t.id, label: `${t.id} · ${t.navn}` }))} />
          {/* ⚠ FELTET TEGNES KUN NÅR TYPEN HAR UNDERTYPER. Planchens
              "Har undertype: ja/nej" er ikke et felt — den er udledt af om
              der er nogen. En deaktiveret vælger der altid stod der, ville
              være en kontrol der ikke kontrollerer noget, og en tom vælger
              læses som "nogen har glemt at udfylde den". */}
          {undertyper.length > 0 && (
            <Felt id="k-undertype" label="Undertype" vaerdi={f.undertype}
                  saet={saet("undertype")} fejl={vis("undertype")}
                  hint="Valgfri. Hører til den valgte type."
                  valgmuligheder={[{ vaerdi: "", label: "Ingen undertype" }]
                    .concat(undertyper.map((u) => ({ vaerdi: u.id, label: u.navn })))} />
          )}
          {/* ⚠ KUN DE TO DEN HER SKÆRM KAN OBSERVERE. `klargjort` og `udlaant`
              er FØLGER af et udlånsskifte og sættes af serveren sammen med
              udlånet. Kunne de vælges her, ville der findes en kasse der stod
              som udlånt uden et udlån at pege på — og ingen kunne se hvem der
              havde den. Reglerne afviser det også; det er ikke kun formularen
              der er pæn. */}
          {SELVVALGT_KASSE_STATUS.includes(f.status) ? (
            <Felt id="k-status" label="Status" kraevet vaerdi={f.status} saet={saet("status")}
                  fejl={vis("status")}
                  valgmuligheder={SELVVALGT_KASSE_STATUS.map((s) => ({
                    vaerdi: s, label: KASSE_STATUS[s].label,
                  }))}
                  hint="Ude af drift, når kassen er i stykker. Den bliver stående." />
          ) : (
            <Felt id="k-status" label="Status" readOnly
                  vaerdi={KASSE_STATUS[f.status]?.label || f.status}
                  hint="Kommer fra et udlån og ændres under Udlån — ikke her." />
          )}
        </Feltraekke>

        {/* ⚠ FELTET TEGNES KUN NÅR KASSEN ER UDE AF DRIFT. En ude-af-drift-dato
            på en kasse der virker, er et felt der altid står tomt — og et tomt
            felt læses som noget nogen har glemt. Samme greb som undertypen, der
            kun tegnes når typen HAR nogen.
            ⚠ OG DEN ER PÅKRÆVET DÉR. Uden datoen kan kalenderen ikke tegne
            "ude af drift" som andet end et flag; planchen har den som en blok,
            og en blok kræver et startpunkt. Reglen kræver den på STATUS-feltet,
            så en skrivning uden den bliver afvist. */}
        {f.status === "udeAfDrift" && (
          <Felt id="k-uad" label="Ude af drift siden" type="date" kraevet
                vaerdi={f.udeAfDriftIso} saet={saet("udeAfDriftIso")}
                fejl={vis("udeAfDriftFra", "udeAfDriftIso")}
                max={iDagIso()}
                hint="Hvornår gik den i stykker? Kan ikke ligge i fremtiden — det er
                      en observation, ikke en plan. Kassen kan ikke loves væk så
                      længe den står sådan." />
        )}

        {/* ⚠ MÅL, IKKE m² OG m³. Planchen har volumen som to indtastede felter;
            to tal om den samme fysiske kasse kan blive uenige. Målene kan de
            ikke — 120 × 80 × 95 cm ER 0,96 m² og 0,91 m³. Se maalFraMm(). */}
        <Feltraekke>
          <Felt id="k-laengde" label="Længde" vaerdi={f.laengdeCm}
                saet={saet("laengdeCm")} fejl={vis("laengdeCm")} suffiks="cm" />
          <Felt id="k-bredde" label="Bredde" vaerdi={f.breddeCm}
                saet={saet("breddeCm")} fejl={vis("breddeCm")} suffiks="cm" />
          <Felt id="k-hoejde" label="Højde" vaerdi={f.hoejdeCm}
                saet={saet("hoejdeCm")} fejl={vis("hoejdeCm")} suffiks="cm"
                hint={maalFraMm({
                  laengdeMm: mmFraCm(f.laengdeCm), breddeMm: mmFraCm(f.breddeCm),
                  hoejdeMm: mmFraCm(f.hoejdeCm),
                })
                  ? `${m2(f)} m² · ${m3(f)} m³`
                  : "Alle tre, ellers kan volumen ikke regnes."} />
        </Feltraekke>

        <Feltraekke>
          <Felt id="k-hjem" label="Hjemplads" kraevet vaerdi={f.hjemPladsId}
                saet={saet("hjemPladsId")} fejl={vis("hjemPladsId")}
                valgmuligheder={pladsvalg}
                hint="Hvor kassen hører til. Den beholder den, også når den er ude." />
          {paaLager ? (
            <Felt id="k-plads" label="Står nu" kraevet vaerdi={f.pladsId}
                  saet={saet("pladsId")} fejl={vis("pladsId")}
                  valgmuligheder={pladsvalg}
                  hint="Hvor den står lige nu. Ofte den samme som hjempladsen." />
          ) : null}
        </Feltraekke>

        {!paaLager && (
          <p className="fc-hint">
            ⚠ En <b>{KASSE_STATUS[f.status]?.label.toLowerCase()}</b> kasse står
            ikke på en reolplads — den er ude. Hylden er fri til en anden kasse.
          </p>
        )}

        <Felt id="k-note" label="Note" vaerdi={f.note} saet={saet("note")}
              hint="Fx en skade. Kun til jer selv." />
      </Formular>
    </Kort>
  );
}

export default function Kasser() {
  const { path, bruger } = useFleet();
  const [ny, saetNy] = useState(false);
  const [redigerer, saetRedigerer] = useState(null);
  const [soeg, saetSoeg] = useState("");
  const [status, saetStatus] = useState("");
  const [type, saetType] = useState("");
  const [undertype, saetUndertype] = useState("");
  const [side, saetSide] = useState(1);

  const maaSkrive = harPerm(bruger?.perms, PERM.kasserSkriv);

  /* Ingen division på en kasse — den hører til en hal. Eksplicit, så det ikke
     ser ud som om skærmen bare var heldig. */
  const { data: kasser, afkortet: kasserAfkortet, tilstand, genindlaes, henter } = useListe("kasser", {
    graense: 1000, demo: DEMO_KASSER,
    sorter: (a, b) => a.id.localeCompare(b.id, "da"),
  });
  const { data: pladser } = useListe("reolpladser", {
    graense: 500, demo: DEMO_REOLPLADSER,
    sorter: (a, b) => pladsnavn(a).localeCompare(pladsnavn(b), "da"),
  });
  const { data: typer } = useListe("kassetyper", {
    graense: 100, demo: DEMO_KASSETYPER,
  });
  /* ⚠ HERFRA KOMMER "RESERVERET". Det er IKKE en kassestatus — en reservation
     ER et udlån, og et flag på kassen ville være samme kendsgerning gemt to
     steder. Prisen for at gøre det rigtigt er den her ekstra læsning; til
     gengæld står der hvilken sag og hvornår, og ikke bare "booket". */
  const { data: udlaan } = useListe("kasseudlaan", {
    graense: 2000, demo: DEMO_KASSEUDLAAN,
  });

  if (henter) return <Henter hvad="kasserne" />;

  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const typeMap = Object.fromEntries(typer.map((t) => [t.id, t]));

  const q = soeg.trim().toLowerCase();
  const viste = kasser.filter((k) =>
    (!status || k.status === status) &&
    (!type || k.type === type) &&
    (!undertype || k.undertype === undertype) &&
    (!q || k.id.toLowerCase().includes(q) ||
      pladsnavn(pladsMap[k.pladsId]).toLowerCase().includes(q)));

  /* Siden klippes til det der findes — ellers står man på side 4 af en liste
     der efter et filter kun har to. */
  const sider = Math.max(1, Math.ceil(viste.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const paaSiden = viste.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  const antal = (s) => kasser.filter((k) => k.status === s).length;
  /* ⚠ AFLEDT, IKKE FRA kpi/. Tallene regnes af de kasser skærmen allerede
     har — de er ikke et aggregat, og et gemt tal ville drive fra listen.
     Se undtagelsen i CLAUDE.md. */
  const paaLager = kasser.filter((k) => kraeverPlads(k.status)).length;
  /* ⚠ UDLEDT, IKKE GEMT. "Reserveret" er ikke en kassestatus — se noten ved
     KASSE_STATUS. Tallet regnes af de udlån skærmen allerede har. */
  const nu = Date.now();
  const reserveret = kasser.filter(
    (k) => k.status === "ledig" && naesteReservation(udlaan, k.id, nu)).length;
  /* ⚠ OG DEM UDEN MÅL TÆLLER IKKE MED — de RAPPORTERES. Talte de som nul,
     ville totalen se komplet ud mens en kasse manglede. Se volumenIalt(). */
  const volumen = volumenIalt(kasser);
  /* ⚠ PLANCHENS FJERDE NØGLETAL, OG DET VAR IKKE BYGGET. UNITBOOKING.md
     begrundede det med at tallet "allerede står på Kasselisten" — altså her.
     Det gjorde det ikke. Regnestykket ligger i `unitbooking.js`, så Udlån
     kan vise NØJAGTIG det samme tal; to skærme med hver sin belægningsgrad
     ville være beslutning 6 brudt. Se UNITBOOKING.md 6.10. */
  const bel = kassebelaegning(kasser);
  /* Undertyperne paa den FILTREREDE type — ikke alle typers blandet sammen. */
  const filterUndertyper = undertyperFor(typer.find((t) => t.id === type));
  const tal1 = (v) => v.toFixed(1).replace(".", ",");

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Kasser i alt" vaerdi={mindst(kasser.length, kasserAfkortet)}
                 ikon={<Ikon navn="kasse" />} tone="ikon-5" rund />
        <KpiKort label="Ledige" vaerdi={num(antal("ledig"))}
                 note={reserveret
                   ? `heraf ${num(reserveret)} lovet væk i en periode`
                   : "klar til udlån"} />
        <KpiKort label="Udlånt" vaerdi={num(antal("udlaant"))} note="ude hos kunde" />
        {/* ⚠ NOTEN ER IKKE PYNT. Nævneren er de BRUGBARE kasser, så procenten
            STIGER hver gang en kasse går i stykker — og et tal der ser bedre
            ud af at noget går i stykker, må ikke stå alene. Antallet ude af
            drift hører til tallet, som flaget hører til dageUde(). */}
        <KpiKort label="Belægningsgrad" vaerdi={pct(bel.pct)}
                 note={bel.pct === null
                   ? "ingen brugbare kasser at regne på"
                   : `${num(bel.iBrug)} af ${num(bel.kanBruges)} brugbare` +
                     (bel.udeAfDrift ? ` · ${num(bel.udeAfDrift)} ude af drift` : "")} />
        <KpiKort label="På lager" vaerdi={num(paaLager)}
                 note={`heraf ${num(antal("udeAfDrift"))} ude af drift`} />
        <KpiKort label="Samlet volumen" vaerdi={`${tal1(volumen.m3)} m³`}
                 note={volumen.uden.length
                   ? `${tal1(volumen.m2)} m² gulvplads · ${num(volumen.uden.length)} uden mål`
                   : `${tal1(volumen.m2)} m² gulvplads`} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {ny && (
        <Kasseformular typer={typer} pladser={pladser} sti={path}
                       paaLuk={() => saetNy(false)}
                       paaGemt={() => { saetNy(false); genindlaes(); }} />
      )}
      {redigerer && (
        <Kasseformular kasse={redigerer} typer={typer} pladser={pladser} sti={path}
                       paaLuk={() => saetRedigerer(null)}
                       paaGemt={() => { saetRedigerer(null); genindlaes(); }} />
      )}

      <Kort
        titel={`Kasser (${num(viste.length)} af ${num(kasser.length)})`}
        handling={
          <Knap variant="primaer" disabled={!maaSkrive || !typer.length || !pladser.length}
                onClick={() => saetNy(true)}
                title={!maaSkrive ? `Kræver ${PERM.kasserSkriv} — reglerne afviser.`
                  : !typer.length ? "Opret en kassetype først."
                  : !pladser.length ? "Opret en reolplads først."
                  : "Opret en kasse."}>
            Ny kasse
          </Knap>
        }
      >
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="kf-soeg">Søg</label>
            <input id="kf-soeg" type="search" value={soeg}
                   placeholder="Kasse-id eller plads"
                   onChange={(e) => { saetSoeg(e.target.value); saetSide(1); }} />
          </div>
          <div className="fc-felt">
            <label htmlFor="kf-status">Status</label>
            <select id="kf-status" value={status}
                    onChange={(e) => { saetStatus(e.target.value); saetSide(1); }}>
              <option value="">Alle statusser</option>
              {ALLE_KASSE_STATUS.map((v) => (
                <option key={v} value={v}>{KASSE_STATUS[v].label}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="kf-type">Type</label>
            <select id="kf-type" value={type}
                    onChange={(e) => {
                      saetType(e.target.value);
                      /* ⚠ ET TYPESKIFT RYDDER UNDERTYPEFILTRET. Undertyperne
                         hører til ÉN type, så "Trækasse + XL" ville give en tom
                         liste og se ud som om der ingen trækasser var. */
                      saetUndertype("");
                      saetSide(1);
                    }}>
              <option value="">Alle typer</option>
              {typer.map((t) => <option key={t.id} value={t.id}>{t.navn}</option>)}
            </select>
          </div>
          {/* ⚠ FILTRET TEGNES KUN NÅR EN TYPE ER VALGT, og kun hvis den HAR
              undertyper. En liste med alle typers undertyper blandet sammen
              ville have to "Standard" der betød hver sit. */}
          {filterUndertyper.length > 0 && (
          <div className="fc-felt">
            <label htmlFor="kf-undertype">Undertype</label>
            <select id="kf-undertype" value={undertype}
                    onChange={(e) => { saetUndertype(e.target.value); saetSide(1); }}>
              <option value="">Alle undertyper</option>
              {filterUndertyper.map((u) => (
                <option key={u.id} value={u.id}>{u.navn}</option>
              ))}
            </select>
          </div>
          )}
        </div>

        {!typer.length || !pladser.length ? (
          <Tom>
            En kasse skal have en <b>type</b> og en <b>hjemplads</b>. Opret dem
            under Reolpladser først — ellers ville kassen pege på noget der ikke
            findes, og reglerne afviser den.
          </Tom>
        ) : (
          <>
            <Tabel
              kolonner={[
                { key: "id", label: "Kasse", render: (k) => <b>{k.id}</b> },
                { key: "type", label: "Type",
                  render: (k) => typeMap[k.type]?.navn || k.type },
                /* ⚠ EGEN KOLONNE, IKKE SAT SAMMEN MED TYPEN. Planchen har dem
                   som to kolonner og to filtre, og "Alukasse · Stor" i én
                   celle kunne hverken sorteres eller filtreres på undertypen
                   alene. En kasse uden undertype står med en streg — typen
                   har måske slet ingen, og et tomt felt læses som en fejl. */
                { key: "undertype", label: "Undertype",
                  render: (k) => undertyperFor(typeMap[k.type])
                    .find((u) => u.id === k.undertype)?.navn || "—" },
                /* ⚠ ÉN KOLONNE MED BEGGE TAL. Planchen har to, men de er to
                   visninger af det SAMME mål — og en tabel med ti kolonner
                   læses ikke. Der er intet gemt felt at sortere på alligevel:
                   tallene er afledt af længde × bredde × højde. */
                { key: "volumen", label: "Volumen", render: (k) => {
                  const m = maalFraMm(k);
                  if (!m) return "—";
                  const t = (v) => v.toFixed(2).replace(".", ",");
                  return `${t(m.m2)} m² · ${t(m.m3)} m³`;
                } },
                { key: "status", label: "Status", render: (k) => (
                    <Pille tone={KASSE_STATUS[k.status]?.pill || "info"}>
                      {KASSE_STATUS[k.status]?.label || k.status}
                    </Pille>
                  ) },
                /* ⚠ EN STREG, IKKE "Udlånt hos kunde". Kassen står ingen
                   steder — det er ikke en plads med et navn. */
                { key: "plads", label: "Står nu", render: (k) => (
                    k.pladsId ? pladsnavn(pladsMap[k.pladsId])
                              : <span className="fc-neutral">— ude</span>
                  ) },
                { key: "hjem", label: "Hjemplads", render: (k) => (
                    <span className="fc-hint">{pladsnavn(pladsMap[k.hjemPladsId])}</span>
                  ) },
                /* ⚠ HER STOD "BOOKET" I PROTOTYPEN — som en femte status på
                   kassen. Den er væk: en reservation ER et udlån, og mærkatet
                   udledes af det. Til gengæld står der HVILKEN sag og HVORNÅR,
                   hvilket et flag aldrig kunne. */
                { key: "reserveret", label: "Reserveret", render: (k) => {
                    const r = naesteReservation(udlaan, k.id, nu);
                    if (!r) return <span className="fc-neutral">—</span>;
                    return (
                      <span className="fc-hint">
                        sag {r.sagsnummer} · {dato(r.fra)}–{dato(r.til)}
                      </span>
                    );
                  } },
                { key: "handling", label: "", render: (k) => (
                    <Knap disabled={!maaSkrive} onClick={() => saetRedigerer(k)}>Redigér</Knap>
                  ) },
              ]}
              raekker={paaSiden}
              tom="Ingen kasser matcher filteret."
            />
            <Sider side={nuSide} antal={viste.length} prSide={PR_SIDE} saet={saetSide} />
          </>
        )}

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>En kasse slettes aldrig.</b> Der hænger udlån på id'et. En kasse
          der går i stykker, får status <b>ude af drift</b> og bliver stående —
          samme regel som en solgt bil.
        </p>
      </Kort>
    </div>
  );
}
