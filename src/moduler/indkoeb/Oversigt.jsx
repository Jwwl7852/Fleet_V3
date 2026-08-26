/* src/moduler/indkoeb/Oversigt.jsx
 * Indkøb & vareforbrug
 *
 * ⚠ PRISER I ØRE. Mockuppen viste 18,50 kr/stk — det er `1850`, ikke `18.5`.
 * En float her ender som 1849,999 i en sum over hundrede linjer, og
 * afstemningen mod leverandørens faktura går ikke op med en øre ingen kan
 * forklare. Beslutning 2.
 *
 * ⚠ LINJENS BELØB BEREGNES af antal × pris og gemmes ikke. To kilder til det
 * samme tal kan drive fra hinanden, og så mangler en post uden at totalen
 * afslører det.
 *
 * ⚠ DIVISION ER PÅKRÆVET. Reglerne validerer hasChildren(['division']) på
 * indkoeb/$id. Værdien kan IKKE arves fra køretøjet — beslutning 19 forbyder
 * feltet dér — så den der registrerer, skal sætte den.
 *
 * ⚠ LEVERANDØREN ER EN ENTITET. Posterne bærer `leverandoerId`, ikke en
 * fritekststreng. Modellen har hele tiden indekseret feltet — se
 * fleet/leverandoerer.js.
 *
 * FASE 0: VISNING. Ingen skrivning.
 *
 * ---------------------------------------------------------------------------
 * MOCKUPPEN, OG HVOR JEG IKKE FULGTE DEN
 *
 * 1. ⚠ INGEN STJERNER. Mockuppens leverandørkort har "Kvalitet 4,7 ★" og en
 *    "Samlet score". BESLUTNING 22 afgjorde det modsatte: Leverandører får
 *    OBJEKTIVE TAL, ingen stjerner. En stjerne er en vurdering uden regnestykke
 *    — man kan ikke svare en leverandør der spørger hvorfor han fik 4,2, og man
 *    kan ikke handle på den. En samlet score må kun findes hvis beregningen kan
 *    vises, og der findes intet kvalitetsfelt at bygge den af. Kortet viser i
 *    stedet de tal beregnNoegletal() faktisk kan regne, hvert med sit grundlag.
 * 2. HVERT TAL BÆRER SIT GRUNDLAG. Beslutning 25: under MINDSTE_GRUNDLAG
 *    returnerer beregnNoegletal() null, og der skal stå "for lidt grundlag" —
 *    ikke en streg. To leveringer og to hundrede ser ens ud i en tabel, og så
 *    skiftes leverandør på grundlag af én forsinkelse.
 * 3. INGEN PERIODEVÆLGER I FILTERKORTET. Shellen ejer den. Prisudviklingen har
 *    heller ingen egen vælger: den er et TRENDBILLEDE over tolv måneder delt i
 *    to halvår, og den skriver sit vindue frem for at lade to periodevælgere
 *    blive uenige.
 * 4. INGEN "FLERE FILTRE"-KNAP. Der er ikke flere filtre at folde ud. En knap
 *    der åbner et tomt panel, er værre end ingen knap.
 * 5. INGEN ⋮-MENU. Skrivning er ikke bygget.
 *
 * TRE AFLEDTE TAL, og de bliver afledte: mest købte varer, deres andel, og
 * snitprisen pr. måned. Alle tre er regnet af linjer skærmen allerede har, og
 * et gemt afledt tal driver fra sit grundlag — se `bemanding.ledig`.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { usePost } from "../../fleet/usePost.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import {
  kr, num, pct, dato, deviation, oereFraKroner, kronerFraOere,
  iDagIso, isoTilMs, msTilIso,
} from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Knap, Gitter,
  Ikon, Sider, Linjegraf, Felt, Feltraekke, Formular, Kpiadgang } from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  LEVERANDOER_KATEGORI, AFTALETYPE, FAKTURASTATUS, MINDSTE_GRUNDLAG,
  leverandoerNavn, beregnNoegletal, maalTekst, mestKoebteVarer, snitprisPrMaaned,
  indkoebBeloebOere, leverandoerFraDb,
  prisafvigelseTone, valideIndkoeb, byggIndkoeb,
} from "../../fleet/leverandoerer.js";
import {
  DEMO_FAKTURAER,
} from "../../fleet/demo-indkoeb.js";
import {
  DEMO_INDKOEBSBEHOV, DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER,
} from "../../fleet/demo-procure.js";
import {
  BEHOVKILDE, BEHOVSTATUS, kladdelinjer, ventendeOrdrer,
  matchtilstand, STANDARD_GODKENDELSESREGLER,
} from "../../fleet/procure.js";
/* ⚠ KUN SOM FALDBAKKE I useListe. Skærmen slår ikke op i dem — se
   navneopslagene nedenfor. */
import { DEMO_LOKATIONER } from "../../fleet/demo-facility.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";

const PR_SIDE = 5;
const MAANED = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/* ⚠ HER STOD `const DIVISIONER = { gods, bus, faelles }`, OG DEN BLEV LÆST.

   Aksen gik i beslutning 70 og blev fjernet af shellen, konteksten,
   `useListe`, funktionerne, reglerne og auditlisten i 79. Den blev IKKE
   fjernet af skærmene, og linten kiggede aldrig i `src/moduler/`.

   ⚠ EN LINT DER SPRINGER NOGET OVER, SIGER IKKE NEJ — DEN SIGER INGENTING.
   Målt i dag: 77 levende forekomster i 17 modulfiler. Her var de 22, og
   de gjorde faktisk skade:

     · Registreringsformularen havde et PÅKRÆVET Division-felt, og
       `indkoeb`-reglen har `"division": { ".validate": false }`. Vælger man
       en værdi, AFVISER serveren skrivningen; vælger man ingen, klager
       formularen. Vejen ind var lukket i begge retninger.
     · Tabellen havde en Division-kolonne der tegnede `undefined` på hver
       eneste række, fordi ingen post bærer feltet længere.
     · Fodteksten skrev "Viser 5 af 12 i **undefined**".
     · To leverandørfiltre sammenlignede `l.division === division`, hvor
       BEGGE sider er `undefined` — de slap kun igennem fordi
       `undefined === undefined` er sandt. Et filter der virker ved et
       tilfælde, holder op med at virke uden varsel.

   Se beslutning 84. */

/* ⚠ HER STOD lvNavn PÅ MODULNIVEAU, med demo-kartoteket lukket inde i sig.
   Den kan den ikke, når kartoteket HENTES: en modulkonstant kender ikke
   komponentens data. Den er nu et argument — se opslaget i tabellen. */
/* ⚠ NAVNEOPSLAGENE LÅ SOM MODUL-KONSTANTER BYGGET AF DEMOFILEN.
   Hos en rigtig kunde matcher de INGENTING: kolonnen "Enhed" ville stå tom på
   hver eneste linje, og "Sted" ligeså — og en tabel med tomme navne ligner
   data der mangler frem for et opslag der peger det forkerte sted. Det er
   fjerde gang det mønster koster noget; se noten i Servicekalenderens
   Reservationen-panel. De bygges nu af de hentede lister inde i komponenten. */

/**
 * En afvigelse man ikke har, er ikke en afvigelse på nul.
 * Se den samme note på Facility — deviation(undefined) giver "0" med neutral
 * tone, altså påstanden "ingen ændring" om et tal vi ikke har.
 */
const afvig = (vaerdi, opts, note = "vs. forrige periode") =>
  Number.isFinite(vaerdi)
    ? { afvigelse: deviation(vaerdi, opts), note }
    : { note: "afvigelsen er ikke aggregeret endnu" };

/**
 * Godkendelsen af en linje. AFLEDT af de felter der findes.
 *
 * `afvist` er en fakturastatus, ikke et godkendelsesflag — en afvist faktura
 * ER en afvist godkendelse, og to felter for den samme kendsgerning kunne
 * modsige hinanden.
 */
function godkendelse(l) {
  if (l.fakturastatus === "afvist") return { tone: "bad", tekst: "Afvist", ikon: "udraab" };
  if (l.godkendtAf) return { tone: "ok", tekst: "Godkendt", ikon: "skjold" };
  return { tone: "warn", tekst: "Afventer", ikon: "ur" };
}

/**
 * Et nøgletal med sit grundlag. BESLUTNING 25.
 *
 * ⚠ null ER IKKE NUL, OG DET ER IKKE EN STREG. beregnNoegletal() returnerer
 * null under MINDSTE_GRUNDLAG, fordi to observationer ikke er et mønster. En
 * streg ville se ud som "ingen problemer"; teksten siger hvorfor der ikke står
 * et tal, og hvor lidt der ligger bag.
 */
function MedGrundlag({ maal, format = (v) => v, tone }) {
  if (!maal?.nokData) {
    /* ⚠ TRE GRUNDE, IKKE ÉN — og teksten står ét sted. To skærme viser de
       samme tal, og de skrev begge "for lidt grundlag" på et felt hvor
       grundlaget var rigeligt og nævneren var et udsnit. Se beslutning 91. */
    return (
      <span className="fc-neutral"
            title={maal?.aarsag === "udsnit"
              ? "Nævneren er et hentet vindue der ramte sit loft."
              : maal?.aarsag === "ingenKilde"
                ? "Noden findes ikke endnu — se beslutning 20."
                : `${maal?.grundlag ?? 0} af mindst ${MINDSTE_GRUNDLAG} observationer`}>
        {maalTekst(maal)}
      </span>
    );
  }
  return (
    <span className={tone ? `fc-${tone}` : undefined}>
      {format(maal.vaerdi)}{" "}
      <span className="fc-neutral" style={{ fontSize: 11 }}>({num(maal.grundlag)})</span>
    </span>
  );
}

/* ---- Formularen -------------------------------------------------------- */

/* ⚠ DE TRE STOD HER FØR. De er flyttet til format.js, fordi personale.js
   havde sin egen kopi og Unitbooking var ved at lave en tredje. Se noten der
   om hvorfor klokken er 12 og ikke midnat. */

const tomLinje = () => ({
  datoIso: iDagIso(), leverandoerId: "",
  vare: "", varenummer: "", antal: "", enhed: "stk",
  prisKr: "", momsKr: "", kategori: "reservedele", fakturastatus: "mangler",
  reference: "", formaal: "", koeretoejId: "", lokationId: "",
});

const fraLinje = (l) => ({
  ...tomLinje(),
  datoIso: msTilIso(l.dato), leverandoerId: l.leverandoerId,
  vare: l.vare ?? "", varenummer: l.varenummer ?? "",
  antal: l.antal ?? "", enhed: l.enhed ?? "stk",
  prisKr: kronerFraOere(l.prisPrEnhedOere),
  momsKr: Number.isFinite(l.momsOere) ? kronerFraOere(l.momsOere) : "",
  kategori: l.kategori, fakturastatus: l.fakturastatus,
  reference: l.reference ?? "", formaal: l.formaal ?? "",
  koeretoejId: l.koeretoejId ?? "", lokationId: l.lokationId ?? "",
});

/**
 * ⚠ PRISEN INDTASTES I KRONER OG GEMMES SOM ØRE.
 *
 * Beslutning 2: 18,50 kr/stk er `1850`, ikke `18.5`. En float ender som
 * 1849,999 i en sum over hundrede linjer, og så går afstemningen mod
 * leverandørens faktura ikke op med en øre ingen kan forklare. Omregningen
 * sker ét sted — oereFraKroner() i format.js — og reglerne afviser en pris
 * der ikke er hele øre.
 *
 * ⚠ LINJENS BELØB SENDES IKKE. Det beregnes af antal × pris. To kilder til
 * samme tal kan drive fra hinanden, og reglerne afviser feltet.
 */
function Indkoebsformular({ linje, leverandoerer, koeretoejer, lokationer, sti, paaGemt, paaLuk }) {
  const nyt = !linje;
  const [f, saetF] = useState(() => (linje ? fraLinje(linje) : tomLinje()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  /* Datoen bæres som ISO i formularen og som epoch-ms i basen. */
  const medMs = { ...f, dato: isoTilMs(f.datoIso) };
  const fejl = valideIndkoeb(medMs, { leverandoerer, koeretoejer, lokationer });
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  /* Beløbet vises, men gemmes ikke — så man kan se hvad linjen bliver til. */
  const oere = oereFraKroner(f.prisKr);
  const linjeSum = Number.isFinite(oere) && Number(f.antal) > 0 ? oere * Number(f.antal) : null;

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = linje?.id || nyId("il");
    const r = await gem({
      sti: sti(id), data: byggIndkoeb(medMs), foer: linje || null,
      objekt: "indkoeb", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt(id);
  };

  return (
    <Kort titel={nyt ? "Registrér indkøb" : `Redigér ${linje.vare}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Registrér indkøb" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="ik-dato" label="Dato" kraevet type="date" vaerdi={f.datoIso}
                saet={saet("datoIso")} fejl={vis("dato")} />
          <Felt id="ik-lev" label="Leverandør" kraevet vaerdi={f.leverandoerId}
                saet={saet("leverandoerId")} fejl={vis("leverandoerId")}
                hint="En entitet, ikke en fritekst — så navnet ikke får tre stavemåder."
                valgmuligheder={[{ vaerdi: "", label: "Vælg …" },
                  /* ⚠ SKIVE 4B — INAKTIVE KAN IKKE VÆLGES TIL NYT, men den
                     allerede valgte bliver stående ved redigering. */
                  ...leverandoerer
                    .filter((l) => l.aktiv !== false || l.id === f.leverandoerId)
                    .map((l) => ({ vaerdi: l.id, label: l.navn }))]} />
          {/* ⚠ HER STOD ET PÅKRÆVET DIVISION-FELT, og det gjorde vejen ind
              lukket: `indkoeb`-reglen forbyder feltet (beslutning 70), så en
              valgt værdi blev AFVIST af serveren — og uden en værdi klagede
              formularen. Et krævet felt der ikke kan udfyldes rigtigt, er
              ikke en validering; det er en blindgyde. Se beslutning 84. */}
        </Feltraekke>

        <Feltraekke>
          <Felt id="ik-vare" label="Vare" kraevet vaerdi={f.vare} saet={saet("vare")}
                fejl={vis("vare")} />
          <Felt id="ik-varenr" label="Varenummer" vaerdi={f.varenummer}
                saet={saet("varenummer")} fejl={vis("varenummer")}
                hint="Bruges til at måle prisafvigelsen mod den aftalte pris." />
          <Felt id="ik-kat" label="Kategori" kraevet vaerdi={f.kategori} saet={saet("kategori")}
                fejl={vis("kategori")}
                valgmuligheder={Object.entries(LEVERANDOER_KATEGORI)
                  .map(([v, l]) => ({ vaerdi: v, label: l }))} />
        </Feltraekke>

        <Feltraekke>
          <Felt id="ik-antal" label="Antal" kraevet type="number" step="any"
                vaerdi={f.antal} saet={saet("antal")} fejl={vis("antal")} />
          <Felt id="ik-enhed" label="Enhed" vaerdi={f.enhed} saet={saet("enhed")}
                fejl={vis("enhed")} />
          {/* ⚠ KRONER IND, ØRE UD. Se oereFraKroner(). */}
          <Felt id="ik-pris" label="Pris pr. enhed" kraevet suffiks="kr"
                vaerdi={f.prisKr} saet={saet("prisKr")} fejl={vis("prisKr")}
                hint="Ekskl. moms. Brug KOMMA som decimaltegn — punktum er tusindtalsseparator på dansk." />
          <Felt id="ik-moms" label="Moms" suffiks="kr" vaerdi={f.momsKr}
                saet={saet("momsKr")} fejl={vis("momsKr")}
                hint="Står for sig. Beløbet ovenfor er altid ekskl." />
        </Feltraekke>

        {/* ⚠ BELØBET VISES, MEN GEMMES IKKE. To kilder til samme tal kan drive
            fra hinanden, og reglerne afviser feltet. */}
        {linjeSum !== null && (
          <p className="fc-hint" style={{ marginTop: 4 }}>
            Linjen bliver <b>{kr(linjeSum)}</b> ekskl. moms —{" "}
            {num(Number(f.antal))} × {kr(oere, 2)}. Beløbet <b>beregnes</b> og
            gemmes ikke.
          </p>
        )}

        <Feltraekke>
          <Felt id="ik-status" label="Fakturastatus" kraevet vaerdi={f.fakturastatus}
                saet={saet("fakturastatus")} fejl={vis("fakturastatus")}
                valgmuligheder={Object.entries(FAKTURASTATUS)
                  .map(([v, s]) => ({ vaerdi: v, label: s.label }))} />
          <Felt id="ik-ref" label="Reference" vaerdi={f.reference} saet={saet("reference")}
                fejl={vis("reference")}
                hint="LEVERANDØRENS nummer — det man slår op i når man ringer, og det der står på fakturaen." />
        </Feltraekke>

        <Feltraekke>
          {/* Et indkøb er købt TIL noget. Uden det er linjen et beløb uden
              ærinde, og ingen kan svare på om den hørte til. */}
          <Felt id="ik-bil" label="Enhed" vaerdi={f.koeretoejId} saet={saet("koeretoejId")}
                fejl={vis("koeretoejId")}
                valgmuligheder={[{ vaerdi: "", label: "Ingen" },
                  ...koeretoejer.map((k2) => ({ vaerdi: k2.id, label: k2.kaldenavn || k2.navn }))]} />
          <Felt id="ik-lok" label="Lokation" vaerdi={f.lokationId} saet={saet("lokationId")}
                fejl={vis("lokationId")}
                valgmuligheder={[{ vaerdi: "", label: "Ingen" },
                  ...lokationer.map((l) => ({ vaerdi: l.id, label: l.navn }))]} />
          <Felt id="ik-formaal" label="Formål" vaerdi={f.formaal} saet={saet("formaal")}
                fejl={vis("formaal")} hint="Hvorfor blev det købt?" />
        </Feltraekke>
      </Formular>

      <p className="fc-hint" style={{ marginTop: 14 }}>
        ⚠ <b>Prisen indtastes i kroner og gemmes som hele øre.</b> 18,50 kr/stk
        bliver til <code>1850</code>. En float ender som 1849,999 i en sum over
        hundrede linjer, og så går afstemningen mod leverandørens faktura ikke op
        med en øre ingen kan forklare. Reglerne afviser en pris der ikke er hele
        øre — beslutning 2.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        <b>Godkendelse sker ikke her.</b> En faktura godkendes og afstemmes ét
        sted — <Link className="fc-a" to="/indkoeb/fakturaer">Procure → Fakturaer</Link>{" "}
        — og <code>fakturaer</code> er <code>.write: false</code>, fordi
        godkendelsen skal skrive atomisk sammen med afstemningen. To
        godkendelsesflows er beslutning 12 om igen.
      </p>
    </Kort>
  );
}

export default function IndkoebOversigt() {
  const { kpi: k, henter, tilstand, genindlaes, utilgaengelige } = useKpi();

  /* ⚠ LINJERNE KOM FRA demo-indkoeb.js INDTIL NODEN BLEV SEEDET. Noden havde
     regler, indeks og validering af hver feltform — og ingen data, så skærmen
     læste demofilen direkte. Den viste altså det samme uanset hvad kunden
     havde registreret.

     ⚠ vindueDage OG IKKE vindue: "alle". Tabellen viser shellens periode, men
     prisgrafen skal have tolv måneder bagud — det er dens grundlag. Vinduet
     lægges derfor bagud fra periodens start, frem for at hente hele noden:
     "alle" på en node der vokser med hvert indkøb, er en regning der kommer
     stille. 400 dage, så tolv måneder er dækket uanset hvor i måneden
     perioden starter.

     ⚠ INGEN division HER. Standarden er "shell", og den er den rigtige:
     valgt division PLUS fælles PLUS poster uden division. Skærmen havde sin
     EGEN kopi af den regel, og kopien manglede det sidste led. */
  const {
    data: indkoebslinjer, henter: henterLinjer,
    tilstand: linjeTilstand, genindlaes: genindlaesLinjer, afkortet,
  } = useListe("indkoeb", { ordnPaa: "dato", vindueDage: 400, graense: 500 });

  /* ⚠ HELE KARTOTEKET, IKKE DIVISIONENS. Leverandørfilteret skal kunne vise
     den leverandør en linje peger på — også hvis han er registreret på den
     anden division. Et filter der ikke kan vælge det der står i tabellen,
     ligner en tom database. */
  const { data: raaLeverandoerer } = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500,
  });

  /* ⚠ NODERNE, IKKE DEMOFILERNE. Tre lister som skærmen både SLÅR NAVNE OP I
     og TILBYDER I FORMULAREN. Med demofilen ville registreringsformularen
     tilbyde biler og steder der ikke findes i kundens base — og serveren
     ville afvise et valg skærmen selv havde givet. Samme fejl som Ny
     forespørgsel havde med kunderne (beslutning 55). */
  const { data: koeretoejer } = useListe("koeretoejer", {
    vindue: "alle", graense: 500, demo: DEMO_KOERETOEJER,
  });
  const { data: lokationer } = useListe("facility/lokationer", {
    vindue: "alle", graense: 200, demo: DEMO_LOKATIONER,
  });
  /* ⚠ FAKTURAERNE ER EN SEEDET NODE, og leverandørernes nøgletal blev regnet
     af demosættet: ni opdigtede fakturaer mod kundens egne. To svar på ét
     spørgsmål, ét klik fra hinanden — nøjagtig den fejl Indkøb → Fakturaer
     havde. */
  /* ⚠ HER STOD `ordnPaa: "dato"`, OG EN FAKTURA HAR INTET `dato`-FELT.

     Datoen hedder `fakturadatoMs` — det er dét de to andre skærme sorterer
     på, og dét der står i `.indexOn`. Følgen var ikke en fejl man kan se:
     tidsvinduet filtrerede på et felt ingen post bærer, så listen kom hjem
     TOM. Nøgletallene ovenfor kommer fra `kpi/` og stod rigtigt imens.

     Det blev fundet fordi Overblikkets nye kort sagde "Fakturaer uden match:
     0" mens fakturaskærmen sagde 9. **To skærme, samme spørgsmål, to svar** —
     og det tavse nul var det farligste af dem: nul uden match ser ud som en
     afstemning der går op. Se beslutning 84.

     ⚠ Samme fælde som `opgaver."dato"` og som indekset der pegede på
     `godkendelsesstatus`: RTDB fejler ikke på et ukendt felt. */
  const { data: fakturaer } = useListe("fakturaer", {
    ordnPaa: "fakturadatoMs", vindueDage: 400, graense: 500,
    demo: DEMO_FAKTURAER,
  });

  /* ⚠ OVERBLIKKETS FIRE FØRSTE TAL REGNES AF DE HER LISTER — de står IKKE i
     `kpi/`. Det er undtagelsen i CLAUDE.md: er tallet afledt af data skærmen
     alligevel har, beregnes det hos forbrugeren. Et gemt tal ville drive fra
     sit grundlag, og her ville "5 afventer godkendelse" kunne stå ved siden
     af en kø med tre. */
  const { data: behov } = useListe("indkoebsbehov", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 500, demo: DEMO_INDKOEBSBEHOV,
  });
  const { data: ordrer } = useListe("indkoebsordrer", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 300, demo: DEMO_INDKOEBSORDRER,
  });
  const { post: regelPost } = usePost(null, "godkendelsesregler", {
    demo: DEMO_GODKENDELSESREGLER,
  });
  const { data: brugere } = useListe("brugere", { vindue: "alle", graense: 200 });

  /* Navneopslagene bygges af de hentede lister — ikke af en modul-konst.
     En underkomponent kan ikke se dem, så de skal sendes med, hvis tabellen
     flyttes ud. */
  const ktNavn = (id) => koeretoejer.find((k) => k.id === id)?.kaldenavn || null;
  const ktPlade = (id) => koeretoejer.find((k) => k.id === id)?.registrering || null;
  const stedNavn = (id) => lokationer.find((l) => l.id === id)?.navn || null;

  const { bruger, periode, path } = useFleet();
  const [kategori, setKategori] = useState("");
  const [status, setStatus] = useState("");
  const [leverandoer, setLeverandoer] = useState("");
  const [side, setSide] = useState(1);
  /* null = lukket, "ny" = registrér, ellers nøglen på den linje der rettes. */
  const [linjeform, setLinjeform] = useState(null);

  if (henter || henterLinjer) return <Henter hvad="indkøb" />;
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;
  /* ⚠ LINJERNE BLOKERER, HVOR NØGLETALLENE IKKE GØR. En ny kunde uden
     aggregerede tal skal stadig kunne registrere sit første indkøb — men en
     AFVIST læsning af selve linjerne er noget andet: så er tabellen ikke tom,
     den er ukendt, og en tom tabel ligner et tomt lager. */
  if (blokerer(linjeTilstand)) {
    return <Datatilstand tilstand={linjeTilstand} genprov={genindlaesLinjer} />;
  }

  const maaSkrive = harPerm(bruger?.perms, PERM.indkoebSkriv);

  /* ⚠ HER STOD `const iDivision = indkoebslinjer` med noten "useListe har
     allerede delt på division". Den deler ikke længere (beslutning 70), og
     et navn der siger "divisionens linjer", er en påstand om en opdeling der
     ikke findes. Navnet er nu det listen ER. */
  const alleLinjer = indkoebslinjer;

  /* ⚠ OVERSAT FRA BASEN. `prisliste` er et objekt i RTDB og en array i
     domænekoden — prisPaa() filtrerer på den, og beregnNoegletal() kalder
     prisPaa(). Uden oversættelsen kaster ".filter is not a function" midt i
     et regnestykke, og skærmen bliver hvid. Samme fejl som Faktureringens
     `linjer`; se fraDb() i grundlag.js. */
  const leverandoerer = raaLeverandoerer.map((l) => leverandoerFraDb(l, l.id));

  /* ⚠ TABELLEN VISER SHELLENS PERIODE. Historikken bagud er prisgrafens
     grundlag og hører ikke i en liste over "ordrer og fakturaer" — den ville
     drukne de aktuelle i tolv måneders løbende dieselkøb. */
  const iPerioden = alleLinjer.filter((l) => l.dato >= periode.fra && l.dato <= periode.til);

  const viste = iPerioden.filter((l) =>
    (!kategori || l.kategori === kategori) &&
    (!status || l.fakturastatus === status) &&
    (!leverandoer || l.leverandoerId === leverandoer));

  const harFilter = Boolean(kategori || status || leverandoer);
  const nulstil = () => { setKategori(""); setStatus(""); setLeverandoer(""); setSide(1); };

  const sider = Math.max(1, Math.ceil(viste.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const paaSiden = viste.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  /* Beregnet af den viste liste — ikke et nøgletal. */
  const vistForbrugOere = viste.reduce((s, l) => s + indkoebBeloebOere(l), 0);

  /* Mest købte: over divisionens linjer i perioden, ikke over historikken. */
  const topVarer = mestKoebteVarer(iPerioden.length ? iPerioden : alleLinjer);

  /* ⚠ TOLV MÅNEDER DELT I TO HALVÅR. Serien "forrige periode" er de seks
     måneder FØR de seks viste, forskudt så samme x-position sammenligner
     måned nr. 1 med måned nr. 1. Sammenlignes januar med juli, er forskellen
     sæson og ikke leverandør. */
  const nu = Date.now();
  const seksMdr = 182 * 86400000;
  const aktuel = snitprisPrMaaned(alleLinjer, { varenummer: "DIESEL-B7", maaneder: 6, nu });
  const forrige = snitprisPrMaaned(alleLinjer, { varenummer: "DIESEL-B7", maaneder: 6, nu: nu - seksMdr });
  const prisPunkter = aktuel.map((p, i) => ({
    label: MAANED[p.maaned],
    vaerdier: [p.snitOere / 100, forrige[i] ? forrige[i].snitOere / 100 : null],
  }));

  /* Leverandørernes objektive tal. Prislisten skal med — prisafvigelsen måles
     mod den pris der GJALDT DA VI KØBTE, og den står i prislisten. */
  /* ⚠ KUN `aktiv`. Her stod `&& (l.division === division || l.division ===
     "faelles")`, og begge sider var `undefined` efter beslutning 70 — filteret
     slap kun igennem fordi `undefined === undefined` er sandt. */
  const performance = leverandoerer
    .filter((l) => l.aktiv)
    .map((l) => ({
      leverandoer: l,
      /* ⚠ SKÆRMEN VIDSTE AT LISTEN VAR AFKORTET — den skriver det endda
         nedenfor — og sendte den alligevel ind som NÆVNER i
         `andelAfIndkoebPct`. En andel af et udsnit er ikke en andel.
         `sager/` findes ikke, og et tomt array skal ikke læses som
         "de har aldrig svaret". Se beslutning 91. */
      tal: beregnNoegletal(l, {
        indkoeb: alleLinjer,
        fakturaer,
        sager: [],
        sagerFindes: false,
        indkoebAfkortet: afkortet,
      }),
    }))
    .sort((a, b) => b.tal.omsaetningOere - a.tal.omsaetningOere)
    .slice(0, 5);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kpiadgang utilgaengelige={utilgaengelige} />
      <Procureoverblik
        behov={behov} ordrer={ordrer} fakturaer={fakturaer}
        leverandoerer={leverandoerer} brugere={brugere} indkoebslinjer={alleLinjer}
        regler={regelPost || STANDARD_GODKENDELSESREGLER}
        lavBeholdning={k?.indkoeb?.lavBeholdning ?? null}
      />

      {k && (
        <KpiRaekke>
          {/* Runde ikoner med chevron, som resten af appen. Tonerne er
              IKONACCENTER — farven forstærker, tallet og teksten bærer. */}
          <KpiKort label="Åbne ordrer" vaerdi={num(k.indkoeb.aabneOrdrer)}
                   ikon={<Ikon navn="dokument" />} tone="ikon-5" rund til="/indkoeb"
                   {...afvig(k.indkoeb.aabneOrdrerDeltaPct, { betterWhen: "lower", unit: "pct" })} />
          <KpiKort label="Fakturaer til godkendelse" vaerdi={num(k.indkoeb.fakturaerTilGodkendelse)}
                   ikon={<Ikon navn="seddel" />} tone="ikon-2" rund til="/indkoeb/fakturaer"
                   {...afvig(k.indkoeb.fakturaerTilGodkendelseDeltaPct, { betterWhen: "lower", unit: "pct" })} />
          <KpiKort label="Prisafvigelser" vaerdi={num(k.indkoeb.indkoebsprisafvigelser)}
                   ikon={<Ikon navn="advarsel" />} tone="ikon-4" rund til="/indkoeb/leverandoerer"
                   {...afvig(k.indkoeb.prisafvigelserDelta, { betterWhen: "lower" }, "nye vs. forrige periode")} />
          {/* ⚠ PROCENTPOINT, IKKE PROCENT. 92 % der stiger til 97 % er +5 point.
              Feltnavnet siger hvilket — se noten i demo-kpi.js. */}
          <KpiKort label="Leverancer til tiden" vaerdi={pct(k.indkoeb.leveranceTilTidenPct, 0)}
                   ikon={<Ikon navn="lastbil" />} tone="ikon-6" rund til="/indkoeb/leverandoerer"
                   {...afvig(k.indkoeb.leveranceTilTidenDeltaPoint, { betterWhen: "higher" },
                             "procentpoint vs. forrige periode")} />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort>
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="ik-lev">Leverandør</label>
            <select id="ik-lev" value={leverandoer}
                    onChange={(e) => { setLeverandoer(e.target.value); setSide(1); }}>
              <option value="">Alle leverandører</option>
              {leverandoerer
                .map((l) => <option key={l.id} value={l.id}>{l.navn}</option>)}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="ik-status">Status</label>
            <select id="ik-status" value={status}
                    onChange={(e) => { setStatus(e.target.value); setSide(1); }}>
              <option value="">Alle</option>
              {Object.entries(FAKTURASTATUS).map(([v, s]) => (
                <option key={v} value={v}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="ik-kat">Kategori</label>
            <select id="ik-kat" value={kategori}
                    onChange={(e) => { setKategori(e.target.value); setSide(1); }}>
              <option value="">Alle kategorier</option>
              {Object.entries(LEVERANDOER_KATEGORI).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="fc-filtre-knapper">
            <Knap disabled={!harFilter} onClick={nulstil}>Nulstil filtre</Knap>
          </div>
        </div>
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Filtrene virker med det samme. <b>Perioden</b> vælges i toppen — den er
          shellens, og to periodevælgere på samme skærm kan blive uenige om hvilken
          der gjaldt. Tabellen viser de <b>{num(periode.dage)} dage</b> der er valgt.
        </p>
      </Kort>

      {/* Formularen står OVER tabellen, så man kan se linjen man netop har
          registreret. `key` nulstiller felterne ved skift mellem poster. */}
      {linjeform && (
        <Indkoebsformular
          key={linjeform}
          linje={linjeform === "ny" ? null : alleLinjer.find((l) => l.id === linjeform)}
          leverandoerer={leverandoerer}
          koeretoejer={koeretoejer}
          lokationer={lokationer}
          sti={(id) => path(`indkoeb/${id}`)}
          paaGemt={() => { setLinjeform(null); genindlaes(); }}
          paaLuk={() => setLinjeform(null)}
        />
      )}

      <Kort
        titel={`Ordrer og fakturaer (${num(viste.length)})`}
        handling={
          <Knap variant="primaer" disabled={!maaSkrive}
                onClick={() => setLinjeform("ny")}
                title={maaSkrive ? "Registrér et indkøb."
                                 : `Kræver ${PERM.indkoebSkriv} — serveren afviser.`}>
            Registrér indkøb
          </Knap>
        }
      >
        <Tabel
          kolonner={[
            { key: "dato", label: "Dato", render: (r) => dato(r.dato) },
            { key: "leverandoerId", label: "Leverandør",
              render: (r) => <b>{leverandoerNavn(leverandoerer, r.leverandoerId)}</b> },
            /* ⚠ LEVERANDØRENS NUMMER, ikke vores. Det er dét man slår op i,
               når man ringer, og dét der står på fakturaen der skal matches. */
            { key: "reference", label: "Reference",
              render: (r) => r.reference || <span className="fc-neutral">—</span> },
            { key: "kategori", label: "Kategori", render: (r) => LEVERANDOER_KATEGORI[r.kategori] },
            /* Et indkøb er købt TIL noget. Uden det er linjen et beløb uden
               ærinde, og så kan ingen svare på om den hørte til. */
            { key: "relateret", label: "Relateret enhed / opgave", bredde: "22%", render: (r) => {
                const bil = ktNavn(r.koeretoejId);
                const sted = stedNavn(r.lokationId);
                const hoved = bil
                  ? `${bil}${ktPlade(r.koeretoejId) ? ` (${ktPlade(r.koeretoejId)})` : ""}`
                  : sted;
                if (!hoved && !r.formaal) return <span className="fc-neutral">—</span>;
                return (
                  <div className="fc-tolinje">
                    <b>{hoved || "Ikke tilknyttet"}</b>
                    {r.formaal && <span>{r.formaal}</span>}
                  </div>
                );
              } },
            /* BEREGNET — der findes intet gemt beløb på linjen. */
            { key: "beloeb", label: "Beløb", num: true,
              render: (r) => kr(indkoebBeloebOere(r)) },
            { key: "godkendelse", label: "Godkendelse", render: (r) => {
                const g = godkendelse(r);
                return (
                  <Pille tone={g.tone}>
                    <span className="fc-pill-ikon"><Ikon navn={g.ikon} /></span>{g.tekst}
                  </Pille>
                );
              } },
            { key: "fakturastatus", label: "Status",
              render: (r) => <Pille tone={FAKTURASTATUS[r.fakturastatus]?.pill}>
                {FAKTURASTATUS[r.fakturastatus]?.label}</Pille> },

          ]}
          raekker={paaSiden}
          tom={harFilter ? "Ingen indkøb passer på filtrene."
                         : "Ingen indkøb registreret i perioden."}
        />

        <div className="fc-row" style={{ marginTop: 12, gap: 12, flexWrap: "wrap" }}>
          <p className="fc-hint" style={{ margin: 0 }}>
            Viser {num(paaSiden.length)} af {num(viste.length)} til{" "}
            <b>{kr(vistForbrugOere)}</b> ekskl. moms. Det er det <b>viste udsnit</b> —
            månedens forbrug i <code>kpi/</code> dækker hele perioden, og de to skal
            ikke gå op mod hinanden.
          </p>
          <Sider side={nuSide} antal={viste.length} prSide={PR_SIDE} saet={setSide} />
        </div>
        {/* ⚠ EN AFKORTET LISTE SKAL SIGE DET. Hentes der 500 og findes der
            flere, er tabellen ikke et udsnit brugeren har valgt — den er et
            udsnit databasen valgte. Uden beskeden ser 500 linjer ud som alle
            linjer, og forbruget nedenfor ser ud som hele forbruget. */}
        {afkortet && (
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Der er flere end de 500 hentede. Listen er <b>afkortet</b> — snævr
            perioden eller filtrene ind.
          </p>
        )}
        <p className="fc-hint" style={{ marginTop: 10 }}>
          Beløbet pr. linje <b>beregnes</b> af antal × pris pr. enhed og gemmes ikke.
          Prisen står i <b>hele øre</b> — 18,50 kr/stk er <code>1850</code>. En float
          ville blive 1849,999 i en sum, og så går afstemningen ikke op med en øre
          ingen kan forklare.
        </p>
      </Kort>

      <Gitter kolonner="repeat(auto-fit, minmax(310px, 1fr))">
        <Kort titel="Mest købte varer"
              handling={<Link className="fc-a" to="/indkoeb/leverandoerer">Se leverandører</Link>}>
          <Tabel
            kolonner={[
              { key: "vare", label: "Vare", render: (r) => <b>{r.vare}</b> },
              { key: "kategori", label: "Kategori",
                render: (r) => LEVERANDOER_KATEGORI[r.kategori] || r.kategori },
              { key: "beloebOere", label: "Køb", num: true, render: (r) => kr(r.beloebOere) },
              { key: "andelPct", label: "Andel", bredde: "26%", render: (r) => (
                  <div className="fc-udn">
                    <b>{pct(r.andelPct, 0)}</b>
                    <span className="fc-udn-spor">
                      <span className="fc-udn-fyld fc-udn-serie1"
                            style={{ width: `${Math.min(100, r.andelPct)}%` }} />
                    </span>
                  </div>
                ) },
            ]}
            raekker={topVarer}
            tom="Ingen indkøb i perioden."
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ Andelen er af <b>de viste linjer</b>, ikke af tenantens samlede indkøb.
            En andel ud af et udsnit ligner en andel af helheden — og en enkelt vare
            i en filtreret liste ville give 100 %. Nævneren er summen af det du kan
            se ovenfor.
          </p>
        </Kort>

        <Kort titel="Prisudvikling — snitpris, diesel">
          <Linjegraf
            punkter={prisPunkter}
            serier={[{ navn: "Seneste 6 måneder" }, { navn: "De 6 måneder før", stiplet: true }]}
            format={(v) => `${v.toFixed(2)} kr/l`}
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            <b>Vægtet</b> snitpris: samlet beløb divideret med samlet mængde. Det
            usammenvejede gennemsnit lader et lille nødkøb flytte månedens pris, og
            så ligner én dyr tankning en prisstigning hos leverandøren.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Vinduet er <b>tolv måneder delt i to halvår</b> og følger ikke
            periodevælgeren i toppen: en trend over 30 dage er ét punkt. De to
            kurver er forskudt, så samme x-position sammenligner måned nr. 1 med
            måned nr. 1 — sammenlignes januar med juli, er forskellen sæson og ikke
            leverandør. En måned uden indkøb <b>bryder</b> kurven frem for at dykke
            til nul.
          </p>
        </Kort>

        <Kort titel="Leverandørperformance"
              handling={<Link className="fc-a" to="/indkoeb/leverandoerer">Se alle</Link>}>
          <Tabel
            kolonner={[
              { key: "navn", label: "Leverandør",
                render: (r) => <b>{r.leverandoer.navn}</b> },
              { key: "tilTiden", label: "Til tiden", render: (r) => (
                  r.tal.leveringspraecisionPct.nokData ? (
                    <div className="fc-udn">
                      <b>{pct(r.tal.leveringspraecisionPct.vaerdi, 0)}</b>
                      <span className="fc-udn-spor">
                        <span className={`fc-udn-fyld fc-udn-${
                          r.tal.leveringspraecisionPct.vaerdi >= 95 ? "ok"
                          : r.tal.leveringspraecisionPct.vaerdi >= 85 ? "warn" : "bad"}`}
                              style={{ width: `${r.tal.leveringspraecisionPct.vaerdi}%` }} />
                      </span>
                    </div>
                  ) : <MedGrundlag maal={r.tal.leveringspraecisionPct} />
                ) },
              /* Prisafvigelsen tones efter AFTALEFORMEN: 4 % på en fastaftale er
                 et aftalebrud, 4 % på et spotkøb er markedet. */
              { key: "pris", label: "Prisafvigelse", num: true, render: (r) => (
                  <MedGrundlag
                    maal={r.tal.prisafvigelsePct}
                    format={(v) => `${v > 0 ? "+" : ""}${num(v, 1)} %`}
                    tone={r.tal.prisafvigelsePct.nokData
                      ? prisafvigelseTone(r.leverandoer, r.tal.prisafvigelsePct.vaerdi)?.tone
                      : undefined}
                  />
                ) },
              { key: "mangler", label: "Mangler faktura", num: true, render: (r) => (
                  <span className={r.tal.manglendeFakturaer.vaerdi > 0 ? "fc-warn" : undefined}>
                    {num(r.tal.manglendeFakturaer.vaerdi)}
                  </span>
                ) },
              { key: "omsaetning", label: "Samlet køb", num: true,
                render: (r) => kr(r.tal.omsaetningOere) },
            ]}
            raekker={performance}
            noegle={(r) => r.leverandoer.id}
            tom="Ingen aktive leverandører."
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ <b>Ingen stjerner og ingen samlet score.</b> Mockuppen har begge dele;
            beslutning 22 afgjorde det modsatte. En stjerne er en vurdering uden
            regnestykke — man kan hverken svare en leverandør der spørger hvorfor
            han fik 4,2, eller handle på tallet. En score må kun findes hvis
            beregningen kan vises.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Tallet i parentes er <b>grundlaget</b> — hvor mange observationer der
            ligger bag. Under {MINDSTE_GRUNDLAG} står der <b>for lidt grundlag</b> og
            ikke en streg: to leveringer og to hundrede ser ens ud i en tabel, og så
            skiftes leverandør på grundlag af én forsinkelse. Beslutning 25.
          </p>
        </Kort>
      </Gitter>

      <Leverandoerkartotek leverandoerer={leverandoerer} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PROCURES OVERBLIK — planche 5, beslutning 84
   ══════════════════════════════════════════════════════════════════════════

   Modulets forside: hele processen fra behov til afstemning, de tal der
   kræver en handling, og indbakken.

   ⚠ PROCESBÅNDET ER EN VEJVISER, IKKE EN TILSTAND. Planchen tegner fem
   nummererede trin. Det er FORLØBET — ikke hvor en bestemt post står — og
   derfor er hvert trin et LINK til det sted arbejdet gøres. Et bånd der
   fremhævede "det aktive trin", ville påstå at modulet har én tilstand ad
   gangen; det har fem køer der løber samtidig.

   ⚠ FIRE AF DE FEM TAL REGNES HER, IKKE I `kpi/`. De er afledt af lister
   skærmen alligevel henter — undtagelsen i CLAUDE.md. Et gemt tal ville
   drive fra sit grundlag, og "5 afventer godkendelse" ved siden af en kø
   med tre er værre end intet tal.

   ⚠ DET FEMTE KAN IKKE REGNES, OG DET SIGER DET. "Lav lagerbeholdning"
   kræver `forbrugsvarer` — Procures EGET varelager — og noden findes ikke.
   Warehouses `varer`/`beholdning` er KUNDENS gods (3PL), så et tal derfra
   ville bede os bestille noget en kunde mangler. Feltet står som `null` i
   `kpi/` med den grund, og kortet skriver `—`.

   ⚠ OG PLANCHENS FIRE BUNDKORT ER IKKE GENTAGET. Den viser "Bestillinger
   12" og "Fakturaer 4" BÅDE i toppen og i bunden — det samme tal to steder
   på én skærm. To visninger af ét tal er to steder der kan nå at blive
   uenige; det er beslutning 11 og 14, og det var mockuppens "8 mod 16" på
   fakturaskærmen. Bunden er derfor rene GENVEJE uden tal.
   ══════════════════════════════════════════════════════════════════════════ */

const TRIN = [
  { nr: 1, label: "Behov", under: "Indkøbsbehov oprettes i organisationen",
    til: "/indkoeb/behov" },
  { nr: 2, label: "Bestilling", under: "Ordre oprettes og sendes til leverandør",
    til: "/indkoeb/bestillinger" },
  { nr: 3, label: "Godkendelse", under: "Ordre og beløb godkendes i henhold til regler",
    til: "/indkoeb/godkendelser" },
  { nr: 4, label: "Faktura", under: "Faktura modtages og bogføres",
    til: "/indkoeb/fakturaer" },
  { nr: 5, label: "Afstemning", under: "Match og afstemning afsluttes",
    til: "/indkoeb/fakturaer" },
];

const SAADAN = [
  { nr: 1, label: "Opret behov",
    under: "Find den vare du mangler, og meld den ind — fra telefonen hvis du står ved reolen." },
  { nr: 2, label: "Bestil og godkend",
    under: "Forslaget finder leverandøren. Over beløbsgrænsen skal en godkender sige god." },
  { nr: 3, label: "Modtag og bogfør",
    under: "Fakturaen matches mod bestillingen — bestillingsnummeret gør matchet sikkert." },
  { nr: 4, label: "Afstem og afslut",
    under: "Tre uafhængige opgørelser holdes op mod hinanden. Uenighed er en oplysning." },
];

function Procureoverblik({
  behov, ordrer, fakturaer, leverandoerer, brugere, indkoebslinjer, regler, lavBeholdning,
}) {
  const lvNavn = (id) => leverandoerer.find((l) => l.id === id)?.navn || null;
  const brugerNavn = (uid) => {
    const b = brugere.find((x) => x.id === uid);
    return b?.navn || b?.email || uid || "—";
  };

  /* ⚠ "KRÆVER HANDLING" ER IKKE "FINDES". Et afvist behov er der taget
     stilling til, og et bestilt ligger på en ordre — begge ville puste
     tallet op med arbejde der er gjort. */
  const aabneBehov = behov.filter(
    (b) => b.status !== "bestilt" && b.status !== "afvist");
  /* Åben bestilling = sendt, men ikke modtaget. En kladde er ikke sendt, og
     en annulleret er ikke åben. */
  const aabneOrdrer = ordrer.filter((o) => o.status === "sendt");
  const koe = ventendeOrdrer(ordrer, regler);
  /* ⚠ EN HÆNGENDE REFERENCE TÆLLER MED. Et ordreId der peger på noget som
     ikke findes, ser matchet ud og er det ikke — og den er allerede talt
     som afstemt. Samme regel som på fakturaskærmen. */
  const findesOrdre = new Set(ordrer.map((o) => o.id));
  const udenMatch = fakturaer.filter(
    (f) => matchtilstand(f) === "manglerMatch"
      || (f.destinationArt === "procure" && f.destinationId && !findesOrdre.has(f.destinationId)));

  /* Indbakken: de nyeste åbne behov, med det forslag Bestillinger ville give.
     ⚠ SAMME `kladdelinjer()` SOM BESTILLINGSSKÆRMEN. To opslag der svarede
     hver sit på "hvem leverer den vare", ville sende folk to steder hen. */
  const indbakke = kladdelinjer(
    [...aabneBehov].sort((a, b) => (b.oprettetMs || 0) - (a.oprettetMs || 0)).slice(0, 5),
    indkoebslinjer);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Kort titel="Indkøbsprocessen">
        <ol className="fc-trinbaand">
          {TRIN.map((t) => (
            <li key={t.nr} className="fc-trin">
              <Link className="fc-trin-link" to={t.til}>
                <span className="fc-trin-nr" aria-hidden="true">{t.nr}</span>
                <span className="fc-trin-tekst">
                  <b>{t.label}</b>
                  <span className="fc-hint">{t.under}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Kort>

      <KpiRaekke>
        <KpiKort label="Behov kræver handling" vaerdi={num(aabneBehov.length)}
                 note="meldt ind, ikke bestilt"
                 ikon={<Ikon navn="dokument" />} tone="ikon-4" rund til="/indkoeb/behov" />
        <KpiKort label="Åbne bestillinger" vaerdi={num(aabneOrdrer.length)}
                 note="sendt, ikke modtaget"
                 ikon={<Ikon navn="vogn" />} tone="ikon-6" rund til="/indkoeb/bestillinger" />
        <KpiKort label="Afventer godkendelse" vaerdi={num(koe.length)}
                 note={koe.length
                   ? `ældste ventet siden ${dato(koe[0].ordre.oprettetMs)}`
                   : "køen er tom"}
                 ikon={<Ikon navn="klokke" />} tone="ikon-3" rund til="/indkoeb/godkendelser" />
        <KpiKort label="Fakturaer uden match" vaerdi={num(udenMatch.length)}
                 note="i de hentede"
                 ikon={<Ikon navn="seddel" />} tone="ikon-2" rund til="/indkoeb/fakturaer" />
        {/* ⚠ TALLET STOD SOM — INDTIL `forbrugsvarer` FANDTES (beslutning 85).
            Det er Procures EGET varelager; Warehouses `varer` er KUNDENS gods,
            og et tal derfra ville bede os bestille noget en kunde mangler.
            Noten er rettet med: en tekst der siger at noget ikke er bygget,
            er en usandhed så snart det er. */}
        <KpiKort label="Lav lagerbeholdning" vaerdi={num(lavBeholdning)}
                 note="varer på eller under deres minimum"
                 ikon={<Ikon navn="advarsel" />} tone="ikon-1" rund
                 til="/indkoeb/varelager" />
      </KpiRaekke>

      <Gitter kolonner="minmax(0,2fr) minmax(0,1fr)">
        <Kort
          titel={`Indbakke for indkøbsbehov (${num(aabneBehov.length)})`}
          handling={<Link className="fc-a" to="/indkoeb/behov">Se alle behov</Link>}
        >
          <Tabel
            raekker={indbakke}
            noegle={(r) => r.behov.id}
            tom="Ingen åbne behov. De kommer fra snedkeri, lager og kontor."
            kolonner={[
              {
                key: "vare", label: "Vare",
                render: (r) => (
                  <>
                    <b>{r.behov.vare}</b>
                    <div className="fc-hint">{r.behov.varenummer || "uden varenummer"}</div>
                  </>
                ),
              },
              {
                key: "kilde", label: "Kilde",
                render: (r) => BEHOVKILDE[r.behov.kilde] || r.behov.kilde,
              },
              {
                key: "af", label: "Oprettet af",
                render: (r) => (
                  <>
                    {brugerNavn(r.behov.oprettetAf)}
                    <div className="fc-hint">{dato(r.behov.oprettetMs)}</div>
                  </>
                ),
              },
              {
                key: "status", label: "Status",
                render: (r) => (
                  <Pille tone={BEHOVSTATUS[r.behov.status]?.tone}>
                    {BEHOVSTATUS[r.behov.status]?.label || r.behov.status}
                  </Pille>
                ),
              },
              {
                /* ⚠ SAMME OPSLAG SOM BESTILLINGSSKÆRMEN, og det siger fra
                   når der intet er. Et gæt ville være værre end ingenting. */
                key: "forslag", label: "Foreslået leverandør",
                render: (r) => (r.forslag
                  ? lvNavn(r.forslag.leverandoerId) || r.forslag.leverandoerId
                  : <span className="fc-hint">Ingen tidligere leverance</span>),
              },
              {
                key: "antal", label: "Antal", num: true,
                /* ⚠ ET UBESVARET ANTAL SKRIVER —, IKKE 0. Feltet er valgfrit
                   med vilje (beslutning 80); et nul ville være en påstand om
                   at der ikke skal bestilles noget. */
                render: (r) => (Number.isFinite(r.behov.antal)
                  ? `${num(r.behov.antal)} ${r.behov.enhed || ""}`.trim()
                  : num(null)),
              },
            ]}
          />
        </Kort>

        <Kort titel="Sådan virker det">
          <ol className="fc-saadan">
            {SAADAN.map((t) => (
              <li key={t.nr} className="fc-saadan-trin">
                <span className="fc-saadan-nr" aria-hidden="true">{t.nr}</span>
                <span>
                  <b>{t.label}</b>
                  <span className="fc-hint">{t.under}</span>
                </span>
              </li>
            ))}
          </ol>
          {/* ⚠ PLANCHEN GENTOG TO AF TALLENE I FIRE BUNDKORT. Det samme tal
              to steder på én skærm er to steder der kan nå at blive uenige —
              mockuppens "8 mod 16" på fakturaskærmen. Genvejene bærer derfor
              ingen tal. */}
          <div className="fc-genveje">
            <Link className="fc-a" to="/indkoeb/leverandoerer">Leverandører</Link>
            <Link className="fc-a" to="/indkoeb/bestillinger">Bestillinger</Link>
            <Link className="fc-a" to="/indkoeb/godkendelser">Godkendelser</Link>
            <Link className="fc-a" to="/indkoeb/fakturaer">Fakturaer</Link>
          </div>
        </Kort>
      </Gitter>
    </div>
  );
}

/* ---- Leverandøren som entitet ------------------------------------------ */

function Leverandoerkartotek({ leverandoerer }) {
  /* ⚠ LISTEN KOMMER IND, DEN HENTES IKKE HER. To useListe-kald på samme node
     i samme skærm er to hentninger af de samme rækker — og to steder der kan
     nå at vise hver sit, hvis kun det ene genindlæses. */
  /* ⚠ ALLE. Her stod et divisionsfilter hvor begge sider var `undefined`. */
  const viste = leverandoerer;

  return (
    <Kort
      titel="Leverandører"
      handling={<Link className="fc-a" to="/indkoeb/leverandoerer">Se alle og performance</Link>}
    >
      <Tabel
        kolonner={[
          { key: "navn", label: "Leverandør", render: (r) => <b>{r.navn}</b> },
          { key: "cvr", label: "CVR" },
          { key: "kategori", label: "Kategori", render: (r) => LEVERANDOER_KATEGORI[r.kategori] },
          { key: "aftale", label: "Aftale",
            /* ⚠ SKIVE 4B — r.aftale KAN VÆRE UNDEFINED. Feltet var altid
               valgfrit i reglerne, men før 4B kom hver leverandør fra seedet
               demodata, som altid satte en aftale — CRUD-formularen sætter
               den ikke, så en nyoprettet leverandør crashede hele skærmen. */
            render: (r) => !r.aftale ? "—" : <Pille tone={AFTALETYPE[r.aftale.type]?.forventerFastPris ? "ok" : "info"}>
              {AFTALETYPE[r.aftale.type]?.label}
              {r.aftale.rabatPct ? ` · ${r.aftale.rabatPct} %` : ""}
            </Pille> },

          { key: "kontaktEmail", label: "Kontakt",
            render: (r) => <a className="fc-a" href={`mailto:${r.kontaktEmail}`}>{r.kontaktEmail}</a> },
          { key: "aktiv", label: "Status",
            render: (r) => (r.aktiv ? <Pille tone="ok">Aktiv</Pille> : <Pille tone="bad">Inaktiv</Pille>) },
        ]}
        raekker={viste}
        tom="Ingen leverandører."
      />

      <p className="fc-hint" style={{ marginTop: 12 }}>
        <b>Leverandøren er en entitet</b> — reglerne har hele tiden indekseret{" "}
        <code>leverandoerId</code> på både <code>indkoeb</code> og{" "}
        <code>fakturaer</code>, men noden fandtes ikke. Imens stod navnene som
        fritekst i tre demo-filer med hver sin stavemåde at drive med.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        <b>Division findes ikke på en leverandør</b> — og gjorde det heller ikke,
        efter beslutning 70. Her stod et afsnit om hvorfor feltet var tilladt
        netop her, modsat på personale og enheder. Aksen er væk, reglen har
        <code>.validate: false</code> på feltet, og en forklaring på en
        undtagelse fra en regel der ikke findes, lærer den næste at aksen
        stadig lever et sted. Se beslutning 84.
      </p>
      <p className="fc-hint" style={{ marginTop: 8 }}>
        Leverandørens e-mail bliver <b>startlisten af parter</b> på en sag
        (beslutning 20). Derefter ejer sagen listen: en frigivelse fra karantæne
        tilføjer til <b>sagen</b>, aldrig til kartoteket — ellers ville ét klik åbne
        for alle fremtidige sager.
      </p>
    </Kort>
  );
}
