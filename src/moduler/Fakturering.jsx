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
 * 2. MOMSSATSEN ER BESVARET — 25 %, uden undtagelser (beslutning 98).
 *    Her stod at den ikke måtte gættes, og at det tomme felt var det åbne
 *    spørgsmål gjort synligt. Spørgsmålet blev stillet og besvaret af ejeren,
 *    og `byggGrundlag()` sætter nu satsen. Kortet "Mangler momssats" bliver
 *    stående som et VÆRN: et grundlag fra før beslutningen kan have en tom
 *    linje, og en fil med et hul i kan ikke kaldes tilbage fra bogholderens
 *    indbakke.
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
 * RIGTIGE DATA, OG KNAPPERNE VIRKER. `grundlag` er en node, og godkendelsen
 * og låsningen går gennem `grundlagskriv`.
 *
 * ⚠ MEN SKÆRMEN AFGØR STADIG INGENTING. Noden er **`.write: false` for alle**,
 * også admin. Tre ting kan ikke håndhæves af en klient — nummeret kommer fra
 * en counter i en transaction, tilstandsskiftet følger kanGodkende()'s regler,
 * og et låst grundlag må aldrig kunne ændres. Håndhævelsen ligger i
 * funktionen; ligger den i skærmen, kan et direkte kald gå uden om den.
 *
 * ⚠ KNAPPERNE ER DEAKTIVERET AF DE SAMME TJEK SOM SERVEREN BRUGER.
 * `kanGodkende()` og `kanLaase()` er de SAMME funktioner begge steder, fordi
 * `grundlag.js` er kopieret til `functions/delt/`. UI og server kan derfor
 * ikke blive uenige — og titlen på en grå knap siger hvorfor den er grå, frem
 * for at sende brugeren på jagt.
 *
 * ⚠ AT KUNNE EKSPORTERES OG AT KUNNE LÅSES ER TO SPØRGSMÅL. Et låst grundlag
 * må gerne eksporteres igen — filen kan være gået tabt i den anden ende — men
 * ikke låses igen. De var det samme tjek, indtil et klik på et låst grundlag
 * fandt forskellen: skærmen tilbød en ny låsning, og serveren svarede
 * "INTERNAL".
 *
 * ⚠ EN LÅSNING KRÆVER EN EKSPORTREFERENCE. Feltet står på skærmen, men
 * serveren afviser uden — feltet er den hurtige besked, ikke afgørelsen. En
 * låsning uden reference er en påstand om at bilaget er eksporteret, uden at
 * nogen kan finde det igen.
 *
 * ⚠ OG ALT PÅ SKÆRMEN SKAL KOMME FRA DE SAMME RÆKKER. Da noden kom til,
 * hentede kortene rigtige grundlag mens detaljepanelet stadig slog etaper op
 * i demo-sættet — så kortet sagde "0 spærret", mens panelet ved siden af
 * skrev at forløbet havde en åben etape. Det er `bemanding.ledig` i en anden
 * forklædning: to kilder til det samme spørgsmål. Panelet får nu listerne
 * sendt med.
 */
import { useState } from "react";
import { useKpi } from "../fleet/useKpi.js";
import { useListe } from "../fleet/useListe.js";
import { useFleet } from "../fleet/FleetContext.jsx";
import { harPerm, PERM } from "../fleet/permissions.js";
import { godkendGrundlag, laasGrundlag } from "../fleet/fakturering.js";
import { kr, num, dato, datoTid } from "../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Knap, Gitter, MiniLinje,
  Felt, Feltraekke, Formularsvar,
} from "../fleet/ui.jsx";
import { blokerer } from "../fleet/datatilstand.js";
import {
  GRUNDLAG_TILSTAND, LINJE_ART,
  totaler, linjeBeloebOere, linjeMomsOere, talFraAntal,
  kanGodkende, kanEksportere, kanLaase, linjerUdenMoms, erGaeldende, summer, fraDb,
  eksporter, MOMSSATS_SALG,
} from "../fleet/grundlag.js";
import { hentFil, filnavn } from "../fleet/eksport.js";
import { DEMO_GRUNDLAG } from "../fleet/demo-grundlag.js";
import { DEMO_ETAPER } from "../fleet/demo-etaper.js";
import { DEMO_KUNDER } from "../fleet/demo-kunder.js";

/* ⚠ NAVNET SLÅS OP I DEN LISTE SKÆRMEN HAR HENTET, ikke i demo-sættet.
   Med rigtige grundlag og opdigtede kundenavne ville en faktura kunne stå
   med et navn der ikke findes — og ingen ville kunne se at det var opdigtet. */
const navnetPaa = (kunder, id) =>
  kunder.find((k) => k.id === id)?.navn || id || "—";

/** Momsen vises som "—" når satsen mangler. IKKE som 0 kr. — et nul ligner et
 *  regnestykke der er gået op, og det er netop det der ikke er sket. */
const momsTekst = (oere) => (oere === null ? "—" : kr(oere));

export default function Fakturering() {
  const { kpi: k, henter, tilstand, genindlaes } = useKpi();
  const { bruger } = useFleet();
  const [valgtId, setValgtId] = useState("grl-002");

  /* ⚠ RIGTIGE GRUNDLAG NU — ikke kun demo-sættet. Noden er `.write: false`
     for alle, ogsaa admin: et grundlag faar sit nummer fra en counter i en
     transaction, skifter tilstand efter kanGodkende()'s regler, og et laast
     grundlag maa aldrig kunne aendres. Ingen af de tre kan haandhaeves af en
     klient — de gaar gennem grundlagskriv. */
  const {
    data: raaGrundlag, tilstand: grundlagTilstand, genindlaes: genindlaesGrundlag,
    henter: henterGrundlag,
  } = useListe("grundlag", {
    ordnPaa: "udarbejdetMs", vindueDage: 365, graense: 500,
    demo: DEMO_GRUNDLAG,
  });
  /* ⚠ OVERSAT VED LÆSNINGEN, ÉN GANG. RTDB har ingen arrays: `linjer` og
     `historik` kommer hjem som objekter, og hver eneste funktion i
     grundlag.js itererer dem. Uden det her kaster kanGodkende() på den
     første post, og skærmen bliver hvid — det var netop hvad den gjorde, da
     det første rigtige grundlag blev oprettet. Serveren bruger den SAMME
     fraDb(); en oversættelse pr. forbruger ville være en kopi der driver. */
  const grundlag = raaGrundlag.map((g) => fraDb(g));
  /* Etaperne afgoer om et grundlag kan godkendes — kanGodkende() spoerger
     forloebstilstand(), ikke et filter her. */
  const { data: etaper } = useListe("etaper", {
    vindue: "alle", graense: 2000, demo: DEMO_ETAPER,
  });
  const { data: kunder } = useListe("kunder", {
    vindue: "alle", graense: 500, demo: DEMO_KUNDER,
  });

  if (henter || henterGrundlag) return <Henter hvad="fakturagrundlag" />;
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  const valgt = grundlag.find((g) => g.id === valgtId) || null;

  /* AFLEDT af den liste skærmen allerede har — hører derfor IKKE i kpi/.
     Samme sag som aktive klimaalarmer: et gemt afledt tal driver fra sit
     grundlag, og det er fejlen i bemanding.ledig. */
  const kladder = grundlag.filter((g) => g.tilstand === "kladde" && erGaeldende(g));
  const spaerrede = kladder.filter((g) => !kanGodkende(g, { etaper }).ok);
  const udenMoms = grundlag.filter((g) => erGaeldende(g) && linjerUdenMoms(g).length);

  /* ⚠ GENNEM summer(), ikke en reduce her. Den filtrerer på erGaeldende(), og
     det er hele pointen med to-vejs-referencen. */
  const sum = summer(grundlag);

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
          {/* ⚠ ET VÆRN, IKKE ET ARBEJDSTRIN. Satsen sættes af byggGrundlag()
              siden beslutning 98, så tallet er nul i praksis. Står der
              alligevel noget, er grundlaget skrevet før beslutningen eller
              uden om den vej ind — og så skal det ses. */}
          <KpiKort label="Mangler momssats" vaerdi={num(udenMoms.length)}
                   tone={udenMoms.length ? "warn" : undefined}
                   note={udenMoms.length ? "eksport spærret" : `alle på ${MOMSSATS_SALG} %`} />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />
      {/* ⚠ GRUNDLAGENE HAR DERES EGEN TILSTAND. En afvist læsning på dem er
          ikke det samme som manglende nøgletal, og de to må ikke dække over
          hinanden — en tom liste ville ellers ligne "ingen grundlag". */}
      <Datatilstand tilstand={grundlagTilstand} genprov={genindlaesGrundlag} />

      <Gitter kolonner="minmax(0,3fr) minmax(0,2fr)">
        <Kort titel="Fakturagrundlag">
          <Tabel
            kolonner={[
              { key: "nummer", label: "Nummer",
                render: (g) => <Nummer g={g} alle={grundlag} /> },
              { key: "kunde", label: "Kunde", render: (g) => navnetPaa(kunder, g.kundeId) },
              { key: "tilstand", label: "Tilstand", render: (g) => <TilstandsPille g={g} /> },
              { key: "beloeb", label: "Beløb ekskl. moms", num: true,
                render: (g) => kr(totaler(g).beloebOere) },
              { key: "moms", label: "Moms", num: true,
                render: (g) => momsTekst(totaler(g).momsOere) },
            ]}
            raekker={grundlag}
            noegle={(g) => g.id}
            paaRaekke={(g) => setValgtId(g.id)}
            erValgt={(g) => g.id === valgtId}
            tom="Ingen fakturagrundlag i perioden."
          />
          <div className="fc-row" style={{ justifyContent: "space-between", marginTop: 12 }}>
            <MiniLinje label={`Gældende grundlag (${sum.antal} af ${grundlag.length})`}
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

        {/* ⚠ ETAPERNE OG KUNDERNE SENDES MED. Slog panelet dem op i
            demo-sættet, ville kortet ovenfor og panelet her svare forskelligt
            på det samme grundlag — og det gjorde de: kortet sagde "0 spærret",
            mens panelet skrev at forløbet havde en åben etape. */}
        {valgt
          ? <Detaljer g={valgt} etaper={etaper} kunder={kunder} alle={grundlag}
                      bruger={bruger} paaSkrevet={genindlaesGrundlag} />
          : <Kort titel="Detaljer"><Tom>Vælg et grundlag.</Tom></Kort>}
      </Gitter>
    </div>
  );
}

/* ---- Nummeret, med erstatningen synlig -------------------------------- */

function Nummer({ g, alle = [] }) {
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
          erstattet af {alle.find((x) => x.id === g.erstattetAfId)?.nummer || g.erstattetAfId}
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

function Detaljer({ g, etaper = [], kunder = [], alle = [], bruger, paaSkrevet }) {
  const [reference, saetReference] = useState("");
  const [arbejder, saetArbejder] = useState(false);
  const [svar, saetSvar] = useState(null);

  const t = totaler(g);
  const godkendelse = kanGodkende(g, { etaper });
  /* ⚠ TO SPØRGSMÅL, IKKE ÉT. `eksport` afgør om bilaget må ud af huset —
     også et låst grundlag må eksporteres igen, hvis filen er gået tabt.
     `laasning` afgør om det må låses, og det må et låst grundlag ikke: så
     ville eksportReference og laastMs blive overskrevet. De var det samme
     tjek, indtil et klik på et låst grundlag fandt forskellen. */
  const eksport = kanEksportere(g);
  const laasning = kanLaase(g);
  const maaGodkende = harPerm(bruger?.perms, PERM.grundlagGodkend);

  /* ⚠ SKÆRMEN SKRIVER IKKE SELV. Begge handlinger går gennem grundlagskriv:
     nummeret, tilstandsskiftet og låsningen kan ikke håndhæves af en klient.
     Se fakturering.js. */
  const send = async (fn) => {
    saetArbejder(true);
    const r = await fn();
    saetArbejder(false);
    saetSvar(r);
    if (r.ok) { saetReference(""); paaSkrevet?.(); }
  };
  const paaGodkend = () => send(() => godkendGrundlag({ id: g.id }));
  const paaLaas = () => send(() => laasGrundlag({ id: g.id, reference: reference.trim() }));

  return (
    <Kort titel={g.nummer}>
      <Gitter kolonner="1fr 1fr">
        <MiniLinje label="Kunde" vaerdi={navnetPaa(kunder, g.kundeId)} />
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
          Erstatter {alle.find((x) => x.id === g.erstatterId)?.nummer || g.erstatterId}.
        </p>
      )}

      <Historik poster={g.historik} />

      {/* ⚠ REFERENCEN ER PÅKRÆVET VED LÅSNING, og feltet står her frem for i
          en dialog: en låsning uden reference er en påstand om at bilaget er
          eksporteret, uden at nogen kan finde det igen. Serveren afviser
          uden — feltet er den hurtige besked, ikke afgørelsen. */}
      {laasning.ok && (
        <Feltraekke>
          <Felt id="f-ref" label="Eksportreference" kraevet vaerdi={reference}
                saet={(v) => { saetReference(v); saetSvar(null); }}
                hint="Hvor ligger bilaget? Fx “e-conomic bilag 4471”." />
        </Feltraekke>
      )}

      <Formularsvar svar={svar} />

      <div className="fc-formular-knapper">
        {/* ⚠ KNAPPERNE ER DEAKTIVERET AF DET SAMME TJEK SOM SERVEREN BRUGER —
            kanGodkende() og kanLaase() er de SAMME funktioner begge
            steder, fordi grundlag.js er kopieret til functions/delt/. UI og
            server kan derfor ikke blive uenige, og titlen forklarer hvorfor
            en grå knap er grå.

            ⚠ MEN SKÆRMEN AFGØR STADIG INGENTING. Håndhævelsen ligger i
            grundlagskriv; ligger den i skærmen, kan et direkte kald gå
            udenom. */}
        <Knap variant="primaer"
              disabled={!godkendelse.ok || !maaGodkende || arbejder}
              title={!maaGodkende
                ? `Kræver ${PERM.grundlagGodkend} — serveren afviser.`
                : godkendelse.ok
                  ? "Godkender grundlaget. Åbne etaper og manglende satser spærrer."
                  : godkendelse.aarsager[0]}
              onClick={paaGodkend}>
          {arbejder ? "Arbejder …" : "Godkend"}
        </Knap>
        <Knap disabled={!laasning.ok || !maaGodkende || arbejder || !reference.trim()}
              title={!maaGodkende
                ? `Kræver ${PERM.grundlagGodkend} — serveren afviser.`
                : !laasning.ok
                  ? laasning.aarsager[0]
                  : !reference.trim()
                    ? "Skriv hvor bilaget ligger, før grundlaget låses."
                    : "Låser grundlaget. Det kan ikke ændres bagefter."}
              onClick={paaLaas}>
          Lås mod reference
        </Knap>
        {/* ⚠ EKSPORTEN VAR BYGGET OG BLEV KALDT INGEN STEDER.
            `eksporter()` har stået i grundlag.js siden beslutning 25 og
            produceret den neutrale model — men der var ingen knap, fordi
            momssatsen spærrede hver eneste eksport. Med beslutning 98 er
            satsen 25 %, og så er der ikke længere noget at vente på.

            ⚠ DET ER DEN NEUTRALE MODEL, IKKE EN ADAPTER. Hvilket
            regnskabssystem der får sit eget format først — e-conomic, Dinero,
            Business Central — er stadig åbent (beslutning 22). En JSON af
            `eksporter()` er præcis det der er besluttet: det låste grundlag,
            som det står, med formatVersion så modtageren kan se hvad han
            læser.

            ⚠ OG DEN LÅSER IKKE. At hente filen er ikke det samme som at
            bogføre den; låsningen kræver stadig en reference til hvor
            bilaget endte. En knap der gjorde begge dele, ville låse et
            grundlag på et download der måske aldrig blev åbnet. */}
        <Knap disabled={!eksport.ok}
              title={eksport.ok
                ? "Henter grundlaget som JSON i den neutrale model. Låser ikke."
                : eksport.aarsager[0]}
              onClick={() => hentFil(
                JSON.stringify(eksporter(g), null, 2),
                filnavn(`grundlag-${g.nummer || g.id}`),
                "application/json;charset=utf-8",
              )}>
          Hent som JSON
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
