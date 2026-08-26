/* src/moduler/indkoeb/Leverandoerer.jsx
 * Leverandører — performance, aftaler og priser. BESLUTNING 25.
 *
 * ⚠ BESLUTNING 25 ER ANTAGELSER, IKKE AFGJORTE KRAV. Hvilke seks tal en
 * vognmand faktisk styrer efter, skal efterprøves hos første kunde. Derfor
 * ligger de i ét katalog i leverandoerer.js frem for spredt ud her — skal et
 * af dem skiftes ud, er der ét sted at gøre det.
 *
 * Der findes INGEN mockup for denne skærm.
 *
 * ---------------------------------------------------------------------------
 * ⚠ 1. ET NØGLETAL UDEN SIT GRUNDLAG ER VILDLEDENDE.
 * "50 % til tiden" betyder noget helt andet ved to leveringer end ved to
 * hundrede — men i en tabel ser de ens ud. Hvert tal står derfor MED antallet
 * det er regnet på, og under grænsen står der "for lidt grundlag" frem for en
 * procent. Det er den eneste ærlige måde at stille leverandører op ved siden
 * af hinanden.
 *
 * ⚠ 2. SAMME TAL, TO BETYDNINGER. En prisafvigelse på 4 % er et brud på en
 * fastaftale og helt almindeligt på et spotkøb. Farven kommer derfor fra
 * aftaleformen, ikke fra tallet. En tabel der farver dem ens, lærer indkøberen
 * at ignorere farven.
 *
 * ⚠ 3. EN SATS OVERSKRIVES ALDRIG (beslutning 7). Prislisten er en historik,
 * ikke et opslagsværk: en faktura fra marts måles mod martsprisen. Kommende
 * reguleringer vises for sig, så en stigning kan ses FØR den rammer.
 * ---------------------------------------------------------------------------
 *
 * ⚠ SKIVE 4B — CRUD TILFØJET. Kartoteket var ren visning ("FASE 0") indtil
 * leverandøren blev fælles platform-masterdata for Fleet, Facility og
 * Procure — en skærm tre moduler skal kunne oprette og vedligeholde fra,
 * ikke kun Procure. Skrivningen går gennem `gem()` (samme vej som `kunder`
 * og `reolpladser`), IKKE en ny Cloud Function — `leverandoerer/` har
 * allerede en åben, regelhåndhævet `.write`, og en funktion mere ville
 * være en anden vej til det samme felt.
 */
import { useState } from "react";
import { kr, num, pct, dato, deviation } from "../../fleet/format.js";
import {
  Kort, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Gitter, MiniLinje,
  Knap, Felt, Feltraekke, Formular,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import {
  LEVERANDOER_KATEGORI, ALLE_KATEGORIER, AFTALETYPE,
  beregnNoegletal, prisafvigelseTone, MINDSTE_GRUNDLAG, maalTekst,
  gaeldendePrisliste, kommendePriser, indkoebBeloebOere, leverandoerFraDb,
  valideLeverandoer, byggLeverandoer,
} from "../../fleet/leverandoerer.js";
import { SPROG, ALLE_SPROG, STANDARD_SPROG } from "../../fleet/sprog.js";
import { DEMO_FAKTURAER } from "../../fleet/demo-indkoeb.js";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";

export default function Leverandoerer() {
  const { kpi: k, henter, tilstand, genindlaes } = useKpi();
  const { bruger, path } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.leverandoererSkriv);
  const [nyt, saetNyt] = useState(false);
  const [redigerer, saetRedigerer] = useState(null);

  /* ⚠ LEVERANDØREN KOM FRA demo-indkoeb.js INDTIL NODEN FANDTES. Den fandtes
     ikke: `leverandoerer` stod slet ikke i firebase.rules.json, selv om BÅDE
     indkoeb og fakturaer har indekseret leverandoerId siden de blev skrevet.

     ⚠ SKÆRMEN ER HELE KARTOTEKET. Leverandøren bar en division indtil
     beslutning 70 — men allerede før den var argumentet mod at filtrere her
     stærkt: Crawford leverer til begge, og en indkøber skulle kunne se hvem
     den anden afdeling handlede med når han skulle finde en ny
     dækleverandør. Havde vi delt, ville en leverandør
     forsvinde ud af listen uden at nogen havde ændret noget. */
  const {
    data: raa, henter: henterLev, tilstand: levTilstand, genindlaes: genindlaesLev,
  } = useListe("leverandoerer", { ordnPaa: "navn", vindue: "alle", graense: 500 });

  /* ⚠ `afkortet` TAGES MED, OG DET ER IKKE PYNT. Nævneren i
     `andelAfIndkoebPct` er tenantens SAMLEDE indkøb; ramte listen sit loft,
     kender vi den ikke, og en andel regnet af et udsnit er beslutning 6's
     fejl med et procenttegn på. Oplysningen har ligget i `useListe` hele
     tiden — den blev bare ikke sendt videre. Se beslutning 91. */
  const {
    data: indkoeb, henter: henterIndkoeb, afkortet: indkoebAfkortet,
  } = useListe("indkoeb", { ordnPaa: "dato", vindueDage: 400, graense: 500 });

  /* ⚠ FAKTURAERNE ER EN SEEDET NODE, og leverandørernes nøgletal blev regnet
     af demosættet: ni opdigtede fakturaer mod kundens egne. Skærmen RANGERER
     leverandører på tallet, så et forkert grundlag er ikke en visningsfejl —
     det er en anbefaling om hvem man skal handle med. */
  const { data: fakturaer } = useListe("fakturaer", {
    ordnPaa: "fakturadatoMs", vindueDage: 400, graense: 500,
    demo: DEMO_FAKTURAER,
  });

  const [valgtId, setValgtId] = useState("lv-hydra");

  if (henter || henterLev || henterIndkoeb) return <Henter hvad="leverandører" />;
  /* En AFVIST læsning af kartoteket er ikke en tom liste — se noten i
     Indkøb-oversigten. */
  if (blokerer(levTilstand)) {
    return <Datatilstand tilstand={levTilstand} genprov={genindlaesLev} />;
  }
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  /* ⚠ OVERSAT FRA BASEN. `prisliste` er et objekt i RTDB og en array i
     domænekoden — prisPaa() filtrerer på den. Uden det her kald kaster
     ".filter is not a function" inde i beregnNoegletal(), og skærmen bliver
     hvid. Det er den samme fejl fraDb() i grundlag.js findes for. */
  const leverandoerer = raa.map((l) => leverandoerFraDb(l, l.id));
  /* ⚠ SAGERNE ER TAGET UD, OG BEGRUNDELSEN FOR AT HAVE DEM VAR FORKERT.
     Her stod: *"Et tomt array ville få hver leverandør til at stå med nul
     reklamationer, og det ser ud som en måling."* Det passer ikke —
     `maal(0, 0)` giver `vaerdi: null`, altså "for lidt grundlag", ikke nul.
     Præmissen holdt aldrig, og på den præmis blev et demo-datasæt vist ved
     siden af kundens rigtige indkøb og fakturaer.

     `sager/` findes ikke i `firebase.rules.json` (beslutning 20 er fase 0),
     og det siger `sagerFindes: false` nu — så svartiden står som **"kilden
     findes ikke"** frem for at låne et tal fra en demofil. Se beslutning 91. */
  const KILDER = { indkoeb, fakturaer, sager: [], sagerFindes: false, indkoebAfkortet };

  /* ⚠ SKIVE 4B — `l.aktiv !== false`, IKKE `l.aktiv`. Feltet er VALGFRIT i
     reglerne; en post uden det er ikke "vi ved den er inaktiv", det er "der
     er aldrig taget stilling" — og skal derfor tælle som aktiv, samme
     polaritet som filtrene i Fleet/Facility/Procures leverandørvælgere. */
  const aktive = leverandoerer.filter((l) => l.aktiv !== false);
  const inaktive = leverandoerer.filter((l) => l.aktiv === false);
  const valgt = leverandoerer.find((l) => l.id === valgtId) || null;

  /* Nøgletallene BEREGNES her — beslutning 6. Et gemt performancetal driver
     fra de fakturaer det blev regnet på, og så rangerer man sine leverandører
     efter et tal ingen kan genfinde. */
  const raekker = aktive.map((l) => ({ l, n: beregnNoegletal(l, KILDER) }));

  const samletOere = indkoeb.reduce((s, i) => s + indkoebBeloebOere(i), 0);
  const udenFaktura = raekker.reduce((s, r) => s + r.n.manglendeFakturaer.vaerdi, 0);
  /* AFLEDT af listen — hører derfor ikke i kpi/. */
  const forTyndt = raekker.filter((r) => !r.n.leveringspraecisionPct.nokData).length;

  /* ⚠ SAMME LILLE SKRIVNING SOM DEN STORE FORMULAR — kun feltet aktiv.
     Ingen ny mekanisme: samme gem(), samme flet:true, samme audit. */
  const deaktiver = async (l) => {
    await gem({
      sti: path(`leverandoerer/${l.id}`), data: { aktiv: false }, foer: l,
      flet: true, objekt: "leverandoerer", objektId: l.id, handling: AUDIT.aendre,
    });
    genindlaesLev();
  };
  const genaktiver = async (l) => {
    await gem({
      sti: path(`leverandoerer/${l.id}`), data: { aktiv: true }, foer: l,
      flet: true, objekt: "leverandoerer", objektId: l.id, handling: AUDIT.aendre,
    });
    genindlaesLev();
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {k && (
        <KpiRaekke>
          <KpiKort label="Aktive leverandører" vaerdi={num(aktive.length)} />
          <KpiKort label="Indkøb i perioden" vaerdi={kr(samletOere)} note="ekskl. moms" />
          <KpiKort label="Indkøb uden faktura" vaerdi={num(udenFaktura)}
                   tone={udenFaktura ? "warn" : undefined} note="ryk leverandøren" />
          {/* ⚠ ET TAL DER SIGER HVAD VI IKKE VED. Det hører på skærmen: uden det
              ser en tabel med mange tomme felter ud som en fejl frem for som en
              oplysning om at grundlaget er tyndt. */}
          <KpiKort label="For lidt grundlag" vaerdi={num(forTyndt)}
                   note={`under ${MINDSTE_GRUNDLAG} leveringer`} />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {nyt && (
        <Leverandoerformular sti={path} paaLuk={() => saetNyt(false)}
                              paaGemt={() => { saetNyt(false); genindlaesLev(); }} />
      )}
      {redigerer && (
        <Leverandoerformular leverandoer={redigerer} sti={path}
                              paaLuk={() => saetRedigerer(null)}
                              paaGemt={() => { saetRedigerer(null); genindlaesLev(); }} />
      )}

      <Kort titel="Leverandører"
            handling={
              <Knap variant="primaer" disabled={!maaSkrive} onClick={() => saetNyt(true)}
                    title={maaSkrive ? "Opret en leverandør."
                                     : `Kræver ${PERM.leverandoererSkriv} — reglerne afviser.`}>
                Ny leverandør
              </Knap>
            }>
        <Tabel
          kolonner={[
            { key: "navn", label: "Leverandør", render: (r) => r.l.navn },
            { key: "kategori", label: "Kategori",
              render: (r) => LEVERANDOER_KATEGORI[r.l.kategori] || r.l.kategori },
            { key: "aftale", label: "Aftale",
              render: (r) => AFTALETYPE[r.l.aftale?.type]?.label || "—" },
            { key: "omsaetning", label: "Indkøb", num: true,
              render: (r) => kr(r.n.omsaetningOere) },
            { key: "praecision", label: "Til tiden", num: true,
              render: (r) => <Tal m={r.n.leveringspraecisionPct} vis={(v) => pct(v)} enhed="leveringer" /> },
            { key: "pris", label: "Prisafvigelse", num: true,
              render: (r) => (
                <Tal m={r.n.prisafvigelsePct} enhed="køb"
                     tone={prisafvigelseTone(r.l, r.n.prisafvigelsePct.vaerdi)}
                     vis={(v) => deviation(v, { betterWhen: "lower", unit: "pct", dec: 1 }).text} />
              ) },
            { key: "mangler", label: "Uden faktura", num: true,
              render: (r) => r.n.manglendeFakturaer.vaerdi || "—" },
          ]}
          raekker={raekker}
          noegle={(r) => r.l.id}
          paaRaekke={(r) => setValgtId(r.l.id)}
          erValgt={(r) => r.l.id === valgtId}
          tom="Ingen aktive leverandører."
        />
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Et nøgletal står altid med det antal det er regnet på. Under {MINDSTE_GRUNDLAG}{" "}
          observationer vises ingen procent — to leveringer og to hundrede ser
          ens ud i en tabel, og så skifter man leverandør på grundlag af én
          forsinkelse.
        </p>
      </Kort>

      {/* ⚠ INAKTIVE VISES FOR SIG — IKKE I PERFORMANCE-TABELLEN. Ranger man en
          leverandør man ikke længere handler med, blander man "hvem klarer
          sig godt" sammen med "hvem er her slet ikke mere". De har ingen
          nøgletal her, kun en vej tilbage. */}
      {inaktive.length > 0 && (
        <Kort titel={`Inaktive leverandører (${num(inaktive.length)})`}>
          <Tabel
            kolonner={[
              { key: "navn", label: "Leverandør", render: (l) => l.navn },
              { key: "kategori", label: "Kategori",
                render: (l) => LEVERANDOER_KATEGORI[l.kategori] || l.kategori },
              { key: "handling", label: "", render: (l) => (
                  <Knap disabled={!maaSkrive} onClick={() => genaktiver(l)}
                        title={maaSkrive ? undefined : `Kræver ${PERM.leverandoererSkriv}.`}>
                    Aktivér igen
                  </Knap>
                ) },
            ]}
            raekker={inaktive}
            noegle={(l) => l.id}
            tom="Ingen inaktive leverandører."
          />
        </Kort>
      )}

      {valgt && (
        <Detaljer l={valgt} kilder={KILDER} maaSkrive={maaSkrive}
                  paaRediger={() => saetRedigerer(valgt)}
                  paaDeaktiver={() => deaktiver(valgt)} />
      )}
    </div>
  );
}

/**
 * Et nøgletal med sit grundlag.
 *
 * ⚠ "FOR LIDT GRUNDLAG" ER IKKE DET SAMME SOM EN STREG. En streg læses som
 * nul eller som "ingen problemer"; teksten her siger at vi ikke ved det endnu.
 */
function Tal({ m, vis, enhed, tone }) {
  if (!m.nokData) {
    /* ⚠ TRE GRUNDE, IKKE ÉN. Her stod "for lidt grundlag" på hvert eneste
       tomt felt — også på dem hvor grundlaget var rigeligt og nævneren var et
       udsnit, og på dem hvor noden slet ikke findes. De tre peger på hver sin
       handling: vent, hent bredere, eller byg noden. Teksten står ét sted, i
       `leverandoerer.js`. Se beslutning 91. */
    const titel = m.aarsag === "udsnit"
      ? "Nævneren er et hentet vindue der ramte sit loft — en andel af et udsnit er ikke en andel."
      : m.aarsag === "ingenKilde"
        ? "Noden findes ikke endnu — se beslutning 20."
        : `Regnet på ${m.grundlag} ${enhed}. Der skal mindst ${MINDSTE_GRUNDLAG} til.`;
    return <span className="fc-hint" title={titel}>{maalTekst(m)}</span>;
  }
  const tekst = vis(m.vaerdi);
  return (
    <span>
      {tone ? <Pille tone={tone}>{tekst}</Pille> : tekst}{" "}
      <span className="fc-hint">({m.grundlag})</span>
    </span>
  );
}

/* ---- Detaljer: aftalen og prislisten ----------------------------------- */

function Detaljer({ l, kilder, maaSkrive, paaRediger, paaDeaktiver }) {
  /* ⚠ KILDERNE KOMMER IND. De var en MODULKONSTANT indtil indkoebslinjerne
     blev hentet fra noden — og en modulkonstant kan ikke kende komponentens
     data. Fejlen var ikke en byggefejl: `npm run build` gik igennem, og
     skaermen blev hvid foerst i browseren. */
  const n = beregnNoegletal(l, kilder);
  const gaeldende = gaeldendePrisliste(l);
  const kommende = kommendePriser(l);

  return (
    <Gitter kolonner="minmax(0,1fr) minmax(0,2fr)">
      <Kort titel={l.navn}
            handling={
              <span className="fc-med-ikon" style={{ gap: 8 }}>
                <Knap disabled={!maaSkrive} onClick={paaRediger}
                      title={maaSkrive ? undefined : `Kræver ${PERM.leverandoererSkriv}.`}>
                  Redigér
                </Knap>
                <Knap disabled={!maaSkrive} onClick={paaDeaktiver}
                      title={maaSkrive ? undefined : `Kræver ${PERM.leverandoererSkriv}.`}>
                  Deaktivér
                </Knap>
              </span>
            }>
        <MiniLinje label="CVR" vaerdi={l.cvr} />
        <MiniLinje label="Kategori" vaerdi={LEVERANDOER_KATEGORI[l.kategori]} />
        {/* Division BESKRIVER LEVERANDØRENS FORRETNING — derfor tilladt her,
            modsat på personale og køretøjer. Se prøven i leverandoerer.js. */}
        {/* ⚠ HER STOD EN "Division"-LINJE. Feltet gik i beslutning 70 og er
            `.validate: false` paa noden — linjen tegnede altsaa en tom vaerdi
            paa hver eneste leverandoer. Se beslutning 84. */}
        <MiniLinje label="Aftaleform" vaerdi={AFTALETYPE[l.aftale?.type]?.label || "—"} />
        {l.aftale?.rabatPct != null && (
          <MiniLinje label="Aftalt rabat" vaerdi={pct(l.aftale.rabatPct)} />
        )}
        <MiniLinje label="E-mail" vaerdi={l.kontaktEmail} />
        {/* ⚠ SKIVE 4B — TELEFON VISTES ALDRIG, selvom feltet altid har været i
            reglerne og i demodata. Et felt der findes i basen, men ikke på
            skærmen, er en tavs kilde ingen kan se. */}
        <MiniLinje label="Telefon" vaerdi={l.kontaktTelefon} />
        {/* ⚠ SKIVE 4D — STANDARDSPROG FOR ORDREMAIL. Et manglende felt (en
            leverandør oprettet før 4D) viser eksplicit STANDARD_SPROG, ikke
            en tom linje — det ER standarden, indtil posten gemmes igen. */}
        <MiniLinje label="Sprog for ordremail" vaerdi={SPROG[l.sprog] || SPROG[STANDARD_SPROG]} />

        <div style={{ marginTop: 12 }}>
          <MiniLinje label="Svartid på sager"
                     vaerdi={n.svartidTimer.nokData ? `${num(n.svartidTimer.vaerdi, 1)} timer` : "for lidt grundlag"} />
          <MiniLinje label="Andel af indkøb"
                     vaerdi={n.andelAfIndkoebPct.nokData ? pct(n.andelAfIndkoebPct.vaerdi) : "for lidt grundlag"} />
          <MiniLinje label="Fakturaafvigelse"
                     vaerdi={n.fakturaafvigelseOere.nokData ? kr(n.fakturaafvigelseOere.vaerdi) : "for lidt grundlag"} />
        </div>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Svartiden regnes kun på sager de faktisk har svaret på. En ubesvaret
          sag har ingen svartid — den har en alder.
        </p>
      </Kort>

      <Kort titel="Prisliste">
        <Tabel
          kolonner={[
            { key: "vare", label: "Vare" },
            { key: "varenummer", label: "Varenummer" },
            { key: "pris", label: "Pris", num: true,
              render: (p) => `${kr(p.prisOere, 2)} / ${p.enhed}` },
            { key: "gyldigFra", label: "Gælder fra", render: (p) => dato(p.gyldigFra) },
          ]}
          raekker={gaeldende}
          noegle={(p) => p.varenummer}
          tom="Ingen prisliste registreret."
        />

        {kommende.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="fc-row" style={{ marginBottom: 6 }}>
              <span className="fc-hint">Kommende reguleringer</span>
              <Pille tone="warn">{kommende.length}</Pille>
            </div>
            <Tabel
              kolonner={[
                { key: "vare", label: "Vare" },
                { key: "pris", label: "Ny pris", num: true,
                  render: (p) => `${kr(p.prisOere, 2)} / ${p.enhed}` },
                { key: "gyldigFra", label: "Træder i kraft", render: (p) => dato(p.gyldigFra) },
              ]}
              raekker={kommende}
              noegle={(p) => `${p.varenummer}-${p.gyldigFra}`}
            />
          </div>
        )}

        <p className="fc-hint" style={{ marginTop: 8 }}>
          En sats overskrives aldrig — en regulering er en ny række med
          gyldigFra. Et køb i marts måles mod martsprisen, ikke mod dagens.
          Ellers ville vores egen prisregulering få leverandøren til at se
          dyrere ud bagudrettet.
        </p>
      </Kort>
    </Gitter>
  );
}

/* ---- Opret/redigér — Skive 4B ------------------------------------------ */

const tomLeverandoer = () => ({
  navn: "", kategori: "", cvr: "", kontaktEmail: "", kontaktTelefon: "", aktiv: true,
  /* ⚠ SKIVE 4D — EKSPLICIT VALGT, IKKE BROWSERENS SPROG. Se sprog.js. */
  sprog: STANDARD_SPROG,
});

/**
 * ⚠ SAMME SKABELON SOM Pladsformular I Reolpladser.jsx. `flet:true`, fordi
 * `aftale` og `prisliste` kan stå på posten i forvejen — denne formular
 * rører dem ikke, og en fuld overskrivning ville tømme dem i tavshed.
 */
function Leverandoerformular({ leverandoer, sti, paaGemt, paaLuk }) {
  const nyt = !leverandoer;
  const [f, saetF] = useState(() => (leverandoer ? { ...tomLeverandoer(), ...leverandoer } : tomLeverandoer()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const fejl = valideLeverandoer(f);
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = leverandoer?.id || nyId("lv");
    const r = await gem({
      sti: sti(`leverandoerer/${id}`), data: byggLeverandoer(f), foer: leverandoer || null,
      flet: true,
      objekt: "leverandoerer", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  const kategorivalg = [
    { vaerdi: "", label: "Vælg kategori…" },
    ...ALLE_KATEGORIER.map((k) => ({ vaerdi: k, label: LEVERANDOER_KATEGORI[k] })),
  ];

  return (
    <Kort titel={nyt ? "Ny leverandør" : `Redigér ${leverandoer.navn}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret leverandør" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="lv-navn" label="Navn" kraevet vaerdi={f.navn} saet={saet("navn")}
                fejl={vis("navn")} />
          <Felt id="lv-kategori" label="Kategori" kraevet valgmuligheder={kategorivalg}
                vaerdi={f.kategori} saet={saet("kategori")} fejl={vis("kategori")} />
        </Feltraekke>
        <Feltraekke>
          <Felt id="lv-cvr" label="CVR" vaerdi={f.cvr} saet={saet("cvr")}
                fejl={vis("cvr")} hint="Otte cifre." />
          <Felt id="lv-email" label="E-mail" vaerdi={f.kontaktEmail} saet={saet("kontaktEmail")}
                fejl={vis("kontaktEmail")} />
          <Felt id="lv-tlf" label="Telefon" vaerdi={f.kontaktTelefon} saet={saet("kontaktTelefon")}
                fejl={vis("kontaktTelefon")} />
        </Feltraekke>
        <Feltraekke>
          <Felt id="lv-sprog" label="Sprog for ordremail"
                valgmuligheder={ALLE_SPROG.map((s) => ({ vaerdi: s, label: SPROG[s] }))}
                vaerdi={f.sprog || STANDARD_SPROG} saet={saet("sprog")} fejl={vis("sprog")}
                hint="Standarden for udgående ordremail til denne leverandør — kan overstyres pr. mail, når ordren sendes." />
        </Feltraekke>
        {/* ⚠ AKTIV ER IKKE EN SLET-KNAP. Feltet findes for at kunne tage en
            leverandør ud af drift uden at fjerne ham — se
            "Deaktivér"-knappen i detaljepanelet, som er den normale vej.
            Feltet står også her, så en genaktivering kan ske fra samme
            formular hvis nogen redigerer en allerede inaktiv post. */}
        <label className="fc-afkryds-punkt">
          <input type="checkbox" checked={f.aktiv !== false}
                 onChange={(e) => saet("aktiv")(e.target.checked)} />
          Aktiv
        </label>
      </Formular>
    </Kort>
  );
}
