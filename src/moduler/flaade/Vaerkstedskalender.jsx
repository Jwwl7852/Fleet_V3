/* src/moduler/flaade/Vaerkstedskalender.jsx
 * Flåde – service, reservationer & fakturaer
 *
 * SAMMENLAGT af to mockups (beslutning 12). De havde hver sin fakturaformular
 * med næsten samme felter — to steder at uploade samme faktura.
 *
 * ⚠ DEN FEJL KAN GENSKABES HER, OG DEN ER LIGE UDEN FOR DØREN.
 * Indkøb → Fakturaer er skærmen til fakturagodkendelse og afstemning. Bygger
 * man en fuld fakturaformular her, har man to godkendelsesflows med et nyt
 * navn. Reglerne peger på den rigtige opdeling:
 *
 *   indkoeb/<id>     .write med indkoeb.skriv   registreringen af omkostningen
 *   fakturaer/<id>   .write: FALSE              den bogførte faktura
 *
 * Formularen her registrerer altså et INDKØB i kontekst — bil, arbejdsordre,
 * omkostningstype, sagsnummer — og linker videre til Indkøb → Fakturaer for
 * godkendelse. Ét sted at registrere, ét sted at godkende. Byg ikke en
 * godkend-knap her.
 *
 * ⚠ INDKØB KRÆVER division, OG BILEN HAR INGEN. Reglerne validerer
 * hasChildren(['division']) på indkoeb/$id, mens beslutning 19 forbyder feltet
 * på koeretoejer/. Værdien kan ikke udledes af bilen, og formularen har derfor
 * et EKSPLICIT divisionsfelt. Bilvælgeren ved siden af må ikke antyde en — to
 * felter der ser ud som om det ene følger af det andet, er præcis den fælde
 * beslutning 19 lukkede.
 *
 * ⚠ BELØB: ekskl. moms i ét felt, momsOere i et andet. ALDRIG ét felt med
 * inkl. moms. Totalen beregnes til visning og gemmes ikke — beslutning 2.
 * Mockuppen viste inkl. moms.
 *
 * KALENDEREN LIGGER I fleet/Gitterkalender.jsx, ikke her. Servicekalender og
 * Disponering skal bruge nøjagtig samme gitter. Pilene og konfliktmarkeringen
 * er kontroller, ikke pynt — se noten i den fil.
 *
 * BOOKINGBLOKERINGER er reservationsmodellen gjort synlig: et værkstedsbesøg
 * skriver en reservation på KØRETØJET med kilde 'vaerksted' og prioritet 40 —
 * højere end booking, fordi en bil på værksted ikke kan køre, uanset hvad
 * disponenten har lovet. Fase 0 viser hvad reservationen VILLE blive, som
 * Ferie & fravær gør. Ingen skrivning.
 *
 * BESLUTNING 20: sagsvisningen med faner og demo-tråden. Visning, ingen
 * afsendelse. En faktura der kom ind på en sag kan registreres derfra —
 * sagsnummeret følger med posten.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useKpi } from "../../fleet/useKpi.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { kr, num, dato, datoTid, oereFraKroner } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Knap, Henter, Fejl,
  Gitter, MiniLinje,
} from "../../fleet/ui.jsx";
import Gitterkalender from "../../fleet/Gitterkalender.jsx";
import { ENHED } from "../../fleet/gitter.js";
import Sagsvisning from "../../fleet/Sagsvisning.jsx";
import { SAG_TILSTAND } from "../../fleet/sager.js";
import { demoSagerFor } from "../../fleet/demo-sag.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { KOERETOEJ_STATUS } from "../../fleet/flaade.js";
import {
  DEMO_BESOEG, DEMO_INDKOEB, BESOEG_STATUS, OMKOSTNINGSTYPE,
  ALLE_OMKOSTNINGSTYPER, demoIkkeLinkede, totalOere, demoKoeretoejKaldenavn,
} from "../../fleet/demo-vaerksted.js";
import { KILDE, prioritetFor, konfliktTekst } from "../../fleet/reservations.js";
import { reservationFraOpgave } from "../../fleet/opgaver.js";

const DAG = 86400000;
const DIVISIONER = { gods: "Gods", bus: "Bus", faelles: "Fælles" };

/* Vinduet er 14 dage frem fra i går. Kort nok til at kolonnerne kan læses,
   langt nok til at et typisk besøg er synligt — og de besøg der rækker
   udenfor, får en pil frem for at blive klippet i stilhed. */
const VINDUE_DAGE = 14;

/* Reservationsbyggeren lå her som en lokal kopi, indtil Disponering fik brug
   for den samme. Den ligger nu i fleet/opgaver.js som reservationFraOpgave()
   og er generaliseret over arten — to skærme med hver sin kopi er den fejl vi
   fangede i Bookingopsætnings divisionsfilter. */

export default function Vaerkstedskalender() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  const { bruger } = useFleet();

  const [valgtBesoegId, setValgtBesoegId] = useState(null);
  const [valgtSagId, setValgtSagId] = useState(null);

  const sager = demoSagerFor("flaade");
  const sag = sager.find((s) => s.id === valgtSagId) || sager[0] || null;

  const nu = Date.now();
  const iDag = new Date(nu); iDag.setHours(0, 0, 0, 0);
  const vindueFra = iDag.getTime() - DAG;
  const vindueTil = vindueFra + VINDUE_DAGE * DAG;

  /* Kun biler der har noget i vinduet. Et gitter med 16 rækker hvoraf 11 er
     tomme, skjuler de fem der betyder noget. */
  const besoegIVindue = DEMO_BESOEG.filter((b) => b.fra < vindueTil && vindueFra < b.til);
  const raekker = useMemo(() => {
    const ider = new Set(besoegIVindue.map((b) => b.koeretoejId));
    return DEMO_KOERETOEJER
      .filter((kt) => ider.has(kt.id))
      .map((kt) => ({
        id: kt.id,
        label: kt.kaldenavn,
        under: kt.navn,
        pille: <Pille tone={KOERETOEJ_STATUS[kt.status]?.pill}>
          {KOERETOEJ_STATUS[kt.status]?.label}
        </Pille>,
      }));
  }, [vindueFra, vindueTil]);

  const blokke = besoegIVindue.map((b) => ({
    id: b.id,
    raekkeId: b.koeretoejId,
    fra: b.fra,
    til: b.til,
    label: `${OMKOSTNINGSTYPE[b.type]} · ${b.vaerksted}`,
    titel: b.beskrivelse,
    tone: BESOEG_STATUS[b.status]?.tone,
  }));

  const valgtBesoeg = DEMO_BESOEG.find((b) => b.id === valgtBesoegId) || null;

  if (henter) return <Henter hvad="nøgletal" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  const maaSkriveIndkoeb = harPerm(bruger?.perms, PERM.indkoebSkriv);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Aktive køretøjer" vaerdi={num(k.flaade.aktive)} />
        <KpiKort label="Reserveret til værksted" vaerdi={num(k.flaade.paaVaerksted)} />
        <KpiKort label="Service inden 30 dage" vaerdi={num(k.flaade.serviceInden30)} />
        {/* Feltet er defineret i demo-kpi.js og læses herfra. Det er IKKE det
            samme tal som indkoeb.fakturaerTilGodkendelse: "ikke-linket" og
            "afventer godkendelse" er to tilstande, og at bruge det ene som det
            andet er beslutning 11 og 14 om igen. Det er aggregeringen der
            mangler, ikke skærmen — se KPI-efterslæbet i README. */}
        <KpiKort label="Ikke-linkede fakturaer" vaerdi={num(k.flaade.ikkeLinkedeFakturaer)} />
      </KpiRaekke>

      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}

      <Kort titel={`Værkstedskalender · ${dato(vindueFra)} – ${dato(vindueTil - 1)}`}>
        <Gitterkalender
          raekker={raekker}
          blokke={blokke}
          fra={vindueFra}
          til={vindueTil}
          enhed={ENHED.dag}
          valgtId={valgtBesoegId}
          onVaelg={(b) => setValgtBesoegId(b.id === valgtBesoegId ? null : b.id)}
          tom="Ingen værkstedsbesøg i perioden."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Kun biler med aktivitet i perioden vises. Gitteret ligger i{" "}
          <b>fleet/Gitterkalender.jsx</b> og bruges også af Facility →
          Servicekalender og af Disponering — samme gitter, andre rækker.
        </p>
      </Kort>

      <Gitter kolonner="minmax(0,1fr) minmax(0,1fr)">
        <Blokeringer besoeg={valgtBesoeg} />
        <IndkoebsForm
          besoeg={valgtBesoeg}
          sag={sag}
          maaSkrive={maaSkriveIndkoeb}
        />
      </Gitter>

      <Kort
        titel="Registrerede indkøb"
        handling={<Link className="fc-a" to="/indkoeb/fakturaer">Godkend og afstem i Indkøb</Link>}
      >
        <Tabel
          kolonner={[
            { key: "fakturadatoMs", label: "Dato", render: (r) => dato(r.fakturadatoMs) },
            { key: "koeretoejId", label: "Bil", render: (r) => <b>{demoKoeretoejKaldenavn(r.koeretoejId)}</b> },
            { key: "type", label: "Type", render: (r) => OMKOSTNINGSTYPE[r.type] },
            { key: "leverandoer", label: "Leverandør" },
            { key: "division", label: "Division", render: (r) => <Pille tone="info">{DIVISIONER[r.division]}</Pille> },
            { key: "fakturanummer", label: "Fakturanr." },
            { key: "beloebOere", label: "Ekskl. moms", num: true, render: (r) => kr(r.beloebOere) },
            { key: "momsOere", label: "Moms", num: true, render: (r) => kr(r.momsOere) },
            /* Beregnet hos forbrugeren, ikke gemt. */
            { key: "total", label: "Total", num: true, render: (r) => kr(totalOere(r)) },
            { key: "fakturaId", label: "Linket", render: (r) => (r.fakturaId
                ? <Pille tone="ok">Ja</Pille>
                : <Pille tone="warn">Ikke linket</Pille>) },
          ]}
          raekker={DEMO_INDKOEB}
          tom="Ingen indkøb registreret."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          {num(demoIkkeLinkede().length)} af {num(DEMO_INDKOEB.length)} viste indkøb er
          endnu ikke matchet mod en leverandørfaktura. <b>Totalen beregnes her</b> og
          gemmes ikke — beløbet står som <b>beloebOere</b> ekskl. moms med{" "}
          <b>momsOere</b> ved siden af, aldrig som ét inkl.-beløb. Blandes de to,
          lægges inkl.-tal sammen med ekskl.-tal i en rapport.
        </p>
      </Kort>

      <Kort titel="Værkstedssager">
        <Tabel
          kolonner={[
            { key: "nummer", label: "Sagsnr.", render: (r) => <b>{r.nummer}</b> },
            { key: "emne", label: "Emne" },
            { key: "objektLabel", label: "Køretøj" },
            { key: "modpartNavn", label: "Værksted" },
            { key: "harAftale", label: "Aftale",
              render: (r) => (r.harAftale ? datoTid(r.aftaleFraMs) : <span className="fc-neutral">—</span>) },
            { key: "antalKarantaene", label: "Karantæne", num: true,
              render: (r) => (r.antalKarantaene > 0
                ? <Pille tone="bad">{r.antalKarantaene}</Pille>
                : <span className="fc-neutral">0</span>) },
            { key: "tilstand", label: "Status",
              render: (r) => <Pille tone={SAG_TILSTAND[r.tilstand]?.pill}>{SAG_TILSTAND[r.tilstand]?.label}</Pille> },
            { key: "aabn", label: "",
              render: (r) => (
                <Knap onClick={() => setValgtSagId(r.id)} disabled={r.id === sag?.id}>
                  {r.id === sag?.id ? "Vist" : "Åbn"}
                </Knap>
              ) },
          ]}
          raekker={sager}
          tom="Ingen værkstedssager."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Sagsnummeret sættes i emnefeltet, når der sendes mail til værkstedet.
          Værkstedet svarer normalt i Outlook, og <b>Re:</b> bevarer nummeret.
          Aftalen på sagen står som et planlagt besøg i kalenderen ovenfor — samme
          tidspunkter, ét sted.
        </p>
      </Kort>

      {sag && <Kort><Sagsvisning sag={sag} /></Kort>}
    </div>
  );
}

/* ---- Bookingblokeringer ---------------------------------------------- */

/**
 * Reservationsmodellen gjort synlig. Kortet svarer på ét spørgsmål:
 * hvorfor kan disponenten ikke bruge bilen i den uge?
 */
function Blokeringer({ besoeg }) {
  if (!besoeg) {
    return (
      <Kort titel="Bookingblokeringer">
        <Tom>Vælg et besøg i kalenderen for at se hvilken reservation det ville skrive.</Tom>
      </Kort>
    );
  }
  const r = reservationFraOpgave(besoeg);
  const pri = prioritetFor(KILDE.vaerksted);

  return (
    <Kort
      titel="Bookingblokeringer"
      handling={<Pille tone={BESOEG_STATUS[besoeg.status]?.tone}>{BESOEG_STATUS[besoeg.status]?.label}</Pille>}
    >
      <MiniLinje label="Bil" vaerdi={<b>{demoKoeretoejKaldenavn(besoeg.koeretoejId)}</b>} />
      <MiniLinje label="Arbejde" vaerdi={besoeg.beskrivelse} />
      <MiniLinje label="Værksted" vaerdi={besoeg.vaerksted} />
      <MiniLinje label="Fra" vaerdi={datoTid(besoeg.fra)} />
      <MiniLinje label="Til" vaerdi={`${datoTid(besoeg.til)} (eksklusiv)`} />
      {besoeg.sagsnummer && <MiniLinje label="Sag" vaerdi={besoeg.sagsnummer} />}

      <div style={{ borderTop: "1px solid var(--bc-line)", margin: "12px 0" }} />

      <MiniLinje label="Ressource" vaerdi={<code>{r.ressourceType}</code>} />
      <MiniLinje label="Kilde" vaerdi={<code>{r.kilde.type}</code>} />
      <MiniLinje
        label="Prioritet"
        vaerdi={<><b>{pri}</b> — den højeste. Vinder over fravær, facility og booking</>}
      />

      <p className="fc-hint" style={{ marginTop: 12 }}>
        En bil på værksted kan ikke køre, <b>uanset hvad disponenten har lovet</b>.
        Derfor står værksted øverst: en booking der overlapper, bliver overskrevet
        og annulleret med årsag — ikke slettet, så man kan forklare hvorfor en tur
        blev flyttet.
      </p>
      <p className="fc-hint" style={{ marginTop: 6, fontStyle: "italic" }}>
        „{konfliktTekst(null, { kilde: { type: KILDE.vaerksted, reference: besoeg.id } })}“
      </p>
      <p className="fc-hint" style={{ marginTop: 12 }}>
        <b>Reservationen skrives ikke endnu.</b> To disponenter kan ramme samme
        sekund, så konfliktfriheden hører i en Cloud Function. Indtil da er{" "}
        <b>reservationer/</b> ikke skrevet herfra, og det her er formen — ikke en
        handling.
      </p>
    </Kort>
  );
}

/* ---- Indkøbsregistrering --------------------------------------------- */

/**
 * Registrerer et INDKØB, ikke en faktura. Se noten i toppen af filen: der er
 * ét sted at registrere og ét sted at godkende, og det her er det første.
 */
function IndkoebsForm({ besoeg, sag, maaSkrive }) {
  const [beloeb, setBeloeb] = useState("");
  const [moms, setMoms] = useState("");
  const [division, setDivision] = useState("");
  const [type, setType] = useState(besoeg?.type || "");
  const [fakturanummer, setFakturanummer] = useState("");
  const [sagsnummer, setSagsnummer] = useState("");

  const beloebOere = oereFraKroner(beloeb);
  const momsOere = oereFraKroner(moms);
  const total = (beloebOere || 0) + (momsOere || 0);

  /* division er PÅKRÆVET af reglerne og kan ikke udledes af bilen. */
  const mangler = [
    !besoeg && "et besøg",
    !division && "division",
    !type && "omkostningstype",
    beloebOere == null && "beløb",
  ].filter(Boolean);

  return (
    <Kort
      titel="Registrér indkøb"
      handling={
        <Link className="fc-a" to="/indkoeb/fakturaer">Godkendelse sker i Indkøb</Link>
      }
    >
      {!besoeg ? (
        <Tom>Vælg et besøg i kalenderen — indkøbet registreres på bilen og
             arbejdsordren, ikke løsrevet.</Tom>
      ) : (
        <>
          <MiniLinje label="Bil" vaerdi={<b>{demoKoeretoejKaldenavn(besoeg.koeretoejId)}</b>} />
          <MiniLinje label="Arbejdsordre" vaerdi={<code>{besoeg.id}</code>} />
          <MiniLinje label="Leverandør" vaerdi={besoeg.vaerksted} />

          {/* ⚠ Divisionsfeltet står FOR SIG og udfyldes ikke af bilvalget.
              Reglerne kræver det på indkoeb/, og bilen har det ikke
              (beslutning 19). Fyldte vi det ud automatisk ud fra bilen, ville
              vi genindføre præcis den kobling beslutning 19 fjernede. */}
          <div className="fc-felt" style={{ marginTop: 12 }}>
            <label htmlFor="ik-division">Division *</label>
            <select id="ik-division" value={division} onChange={(e) => setDivision(e.target.value)}>
              <option value="">Vælg division</option>
              {Object.entries(DIVISIONER).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <p className="fc-hint" style={{ marginTop: -4, marginBottom: 12 }}>
            Kan <b>ikke</b> udledes af bilen — et køretøj har ingen division
            (beslutning 19), men et indkøb er en transaktion og skal have én.
            Vælg den der skal bære omkostningen.
          </p>

          <div className="fc-felt">
            <label htmlFor="ik-type">Omkostningstype *</label>
            <select id="ik-type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Vælg type</option>
              {ALLE_OMKOSTNINGSTYPER.map((t) => (
                <option key={t} value={t}>{OMKOSTNINGSTYPE[t]}</option>
              ))}
            </select>
          </div>

          <div className="fc-felt">
            <label htmlFor="ik-fnr">Fakturanummer</label>
            <input id="ik-fnr" value={fakturanummer}
                   onChange={(e) => setFakturanummer(e.target.value)}
                   placeholder="Leverandørens nummer" />
          </div>

          {/* Beslutning 20: en faktura der kom ind på en sag skal kunne
              registreres derfra, så man kan gå fra posten tilbage til tråden. */}
          <div className="fc-felt">
            <label htmlFor="ik-sag">Sagsnummer</label>
            <input id="ik-sag" value={sagsnummer || besoeg.sagsnummer || ""}
                   onChange={(e) => setSagsnummer(e.target.value)}
                   placeholder={sag ? sag.nummer : "FLT-ÅÅÅÅ-NNNNN"} />
          </div>

          {/* TO FELTER. Aldrig ét med inkl. moms. */}
          <Gitter kolonner="1fr 1fr">
            <div className="fc-felt">
              <label htmlFor="ik-beloeb">Beløb ekskl. moms (kr.) *</label>
              <input id="ik-beloeb" inputMode="decimal" value={beloeb}
                     onChange={(e) => setBeloeb(e.target.value)} placeholder="0,00" />
            </div>
            <div className="fc-felt">
              <label htmlFor="ik-moms">Moms (kr.)</label>
              <input id="ik-moms" inputMode="decimal" value={moms}
                     onChange={(e) => setMoms(e.target.value)} placeholder="0,00" />
            </div>
          </Gitter>

          <div className="fc-sum">
            <span>Total inkl. moms</span>
            <span className="fc-sum-v">{kr(total)}</span>
          </div>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Totalen <b>beregnes</b> og gemmes ikke. Basen får{" "}
            <code>beloebOere: {beloebOere ?? "—"}</code> og{" "}
            <code>momsOere: {momsOere ?? "—"}</code> — hele øre som integer, ekskl.
            moms adskilt fra moms. Ét felt med inkl. moms ville betyde at en rapport
            lægger inkl.-tal sammen med ekskl.-tal.
          </p>

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Knap variant="primaer" disabled
                  title={maaSkrive
                    ? "Skrivning er ikke bygget endnu (fase 0)."
                    : "Kræver indkoeb.skriv."}>
              Registrér indkøb
            </Knap>
          </div>
          {mangler.length > 0 && (
            <p className="fc-hint" style={{ marginTop: 10 }}>
              Mangler: {mangler.join(", ")}.
            </p>
          )}
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Posten skrives til <b>indkoeb/</b> — ikke til <b>fakturaer/</b>, som er{" "}
            <b>.write: false</b> og kun skrives af en Cloud Function. Matchning mod
            leverandørens faktura, godkendelse og afstemning sker ét sted:{" "}
            <Link className="fc-a" to="/indkoeb/fakturaer">Indkøb → Fakturaer</Link>.
            Der er derfor ingen Godkend-knap her.
          </p>
        </>
      )}
    </Kort>
  );
}
