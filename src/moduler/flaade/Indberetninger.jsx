/* src/moduler/flaade/Indberetninger.jsx
 * Indberetninger. BESLUTNING 25 + chaufførappens tre datatyper.
 *
 * ⚠ BESLUTNING 25 ER ANTAGELSER, IKKE AFGJORTE KRAV. Forløbet skal efterprøves
 * hos første kunde. Der findes INGEN mockup — skærmen er bygget efter
 * beslutningen, ikke efter en tegning.
 *
 * ---------------------------------------------------------------------------
 * ÉN SKÆRM, FIRE FELTSKEMAER. Arten styrer hvilke felter der vises, præcis som
 * i Køretøjer. Fire skærme til fire indberetningstyper ville drive fra
 * hinanden, og den femte type ville få sin egen igen.
 *
 * ⚠ APPEN ER IKKE BYGGET — FELTERNE ER. Tidsregistrering, underskrift og
 * materialeforbrug vises her, fordi modellen skal være rigtig FØR appen
 * kommer. Bygges de først når appen er der, skal Indberetninger laves om, og
 * så er der data i produktion der ikke passer.
 *
 * ⚠ MATERIALEFORBRUG ER KOBLINGEN TIL ØKONOMIEN. Én hændelse giver TO
 * posteringer — et salg på fakturagrundlaget og et forbrug på lageret — og
 * skærmen viser dem hver for sig med hver sin tilstand. Slås de sammen,
 * fakturerer man til kostpris eller bogfører sin salgspris som en omkostning.
 * ---------------------------------------------------------------------------
 *
 * FASE 0: VISNING. indberetninger/ har ingen sensitive-node i
 * firebase.rules.json, og indberetninger.sensitiveLaes findes ikke i
 * permissions.js. Begge tilføjes i samme ombæring som reglerne og deres tests
 * — ikke før. Indtil da viser skærmen den LÅSTE tilstand, så man kan se at
 * feltet findes og er beskyttet.
 */
import { useState } from "react";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useKpi } from "../../fleet/useKpi.js";
import { kr, num, dato, datoTid, km as kmFmt } from "../../fleet/format.js";
import { harPerm } from "../../fleet/permissions.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Fejl, Knap, Gitter, MiniLinje,
} from "../../fleet/ui.jsx";
import {
  HAENDELSE_ART, FORLOEB, harFelt, FELT,
  kanAfslutte, kanFaktureres,
  tidPaaStedetMin, forsinkelseMin, forbrugKmPrLiter,
  PERM_SENSITIVE_LAES_PLANLAGT,
} from "../../fleet/indberetninger.js";
import {
  DEMO_INDBERETNINGER, DEMO_INDBERETNINGER_SENSITIVE, demoTankninger,
} from "../../fleet/demo-indberetninger.js";
import { DEMO_KOERETOEJER } from "../../fleet/demo-flaade.js";
import { talFraAntal } from "../../fleet/grundlag.js";

const bilNavn = (id) =>
  DEMO_KOERETOEJER.find((k) => k.id === id)?.kaldenavn || id || "—";

export default function Indberetninger() {
  const { kpi: k, henter, fejl, genindlaes } = useKpi();
  const { bruger } = useFleet();
  const [valgtId, setValgtId] = useState("ind-001");

  if (henter) return <Henter hvad="indberetninger" />;
  if (!k) return <Fejl genprov={genindlaes}>Nøgletallene kunne ikke hentes.</Fejl>;

  const valgt = DEMO_INDBERETNINGER.find((i) => i.id === valgtId) || null;

  /* AFLEDT af den viste liste — hører derfor ikke i kpi/. Labelen siger
     hvilket udsnit, så tallet ikke læses som en total. */
  const aabne = DEMO_INDBERETNINGER.filter((i) => i.forloeb !== "afsluttet");
  const kanIkkeAfsluttes = aabne.filter((i) => !kanAfslutte(i).ok && i.forloeb === "afventerFaktura");
  const ufakturerede = DEMO_INDBERETNINGER.flatMap((i) =>
    (i.materialelinjer || []).filter((l) => kanFaktureres(i, l).ok)
  );

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Åbne indberetninger" vaerdi={num(aabne.length)} note="i de hentede" />
        <KpiKort label="Afventer faktura" vaerdi={num(kanIkkeAfsluttes.length)}
                 tone={kanIkkeAfsluttes.length ? "warn" : undefined}
                 note="pengesiden er ikke afklaret" />
        <KpiKort label="Materiale til fakturering" vaerdi={num(ufakturerede.length)}
                 note="linjer der kan blive til et grundlag" />
        <KpiKort label="Brændstofudgift" vaerdi={kr(k.flaade.braendstofOere)}
                 note="perioden" />
      </KpiRaekke>

      {fejl && <Fejl genprov={genindlaes}>Viser demo-data — ingen forbindelse til databasen.</Fejl>}

      <Gitter kolonner="minmax(0,3fr) minmax(0,2fr)">
        <Kort titel="Indberetninger">
          <Tabel
            kolonner={[
              { key: "art", label: "Art",
                render: (i) => HAENDELSE_ART[i.art]?.label || i.art },
              { key: "beskrivelse", label: "Hændelse" },
              { key: "bil", label: "Køretøj", render: (i) => bilNavn(i.koeretoejId) },
              { key: "forloeb", label: "Forløb",
                render: (i) => (
                  <Pille tone={FORLOEB[i.forloeb]?.pill || "info"}>
                    {FORLOEB[i.forloeb]?.label || i.forloeb}
                  </Pille>
                ) },
              { key: "oprettet", label: "Oprettet", render: (i) => dato(i.oprettetMs) },
            ]}
            raekker={DEMO_INDBERETNINGER}
            noegle={(i) => i.id}
            paaRaekke={(i) => setValgtId(i.id)}
            erValgt={(i) => i.id === valgtId}
            tom="Ingen indberetninger i perioden."
          />
        </Kort>

        {valgt
          ? <Detaljer i={valgt} bruger={bruger} />
          : <Kort titel="Detaljer"><Tom>Vælg en indberetning.</Tom></Kort>}
      </Gitter>
    </div>
  );
}

/* ---- Detaljepanelet ---------------------------------------------------- */

function Detaljer({ i, bruger }) {
  const afslut = kanAfslutte(i);
  const maaSensitivt = harPerm(bruger?.perms, PERM_SENSITIVE_LAES_PLANLAGT);
  const sensitivt = DEMO_INDBERETNINGER_SENSITIVE[i.id] || {};

  return (
    <Kort titel={HAENDELSE_ART[i.art]?.label || i.art}>
      <Gitter kolonner="1fr 1fr">
        <MiniLinje label="Køretøj" vaerdi={bilNavn(i.koeretoejId)} />
        <MiniLinje label="Oprettet" vaerdi={datoTid(i.oprettetMs)} />
        {harFelt(i.art, FELT.kmStand) && Number.isFinite(i.kmStand) && (
          <MiniLinje label="Kilometerstand" vaerdi={kmFmt(i.kmStand)} />
        )}
        {/* ⚠ HAR en sag — ER ikke en sag. To tilstandsmaskiner, ét felt
            imellem. En mail kan være besvaret uden at bilen er repareret. */}
        <MiniLinje label="Sag" vaerdi={i.sagId || "Ingen"} />
      </Gitter>

      <p style={{ marginTop: 12 }}>{i.beskrivelse}</p>

      {i.art === "braendstof" && <Braendstof i={i} />}

      <Sensitivt aaben={maaSensitivt} data={sensitivt} art={i.art} />

      {i.tidsregistrering && <Tidsregistrering t={i.tidsregistrering} />}

      <Materialer i={i} />

      {!afslut.ok && (
        <div style={{ marginTop: 16 }}>
          <Pille tone="bad">Kan ikke afsluttes</Pille>
          <ul style={{ margin: "8px 0 0 18px" }}>
            {afslut.aarsager.map((a, n) => <li key={n} className="fc-hint">{a}</li>)}
          </ul>
        </div>
      )}

      <div className="fc-row" style={{ gap: 8, marginTop: 12 }}>
        <Knap variant="primaer" disabled title={afslut.ok
          ? "Fase 0: indberetninger/ skrives ikke fra klienten endnu."
          : afslut.aarsager[0]}>
          Afslut
        </Knap>
      </div>
    </Kort>
  );
}

/* ---- Brændstof: km/l regnes, ikke hentes ------------------------------- */

function Braendstof({ i }) {
  const tankninger = demoTankninger(i.koeretoejId);
  const kmPrL = forbrugKmPrLiter(tankninger);
  return (
    <div style={{ marginTop: 12 }}>
      <MiniLinje label="Liter" vaerdi={num(i.liter)} />
      {/* ⚠ VISES FOR SIG, tælles ikke med i km/l. Lagt til literantallet ville
          forbruget se ~5 % bedre ud end det er. */}
      <MiniLinje label="AdBlue" vaerdi={`${num(i.adBlueLiter)} l (ikke i km/l)`} />
      <MiniLinje label="Pris pr. liter" vaerdi={kr(i.prisPrLiterOere, 2)} />
      <MiniLinje
        label="Forbrug"
        vaerdi={kmPrL === null
          /* Ét datapunkt er ingen måling. Vi viser ikke et tal vi ikke har. */
          ? "Kræver to målerstande"
          : `${num(kmPrL, 2)} km/l`}
      />
      <p className="fc-hint" style={{ marginTop: 6 }}>
        Regnet på differencen mellem {tankninger.length} målerstande —
        kilometerstanden er totalt tal, ikke km siden sidste tankning.
      </p>
    </div>
  );
}

/* ---- Tidsregistrering: to slags tidspunkter ---------------------------- */

function Tidsregistrering({ t }) {
  const paaStedet = tidPaaStedetMin(t);
  const forsinket = forsinkelseMin(t);
  return (
    <div style={{ marginTop: 16 }}>
      <div className="fc-hint" style={{ marginBottom: 6 }}>Tidsregistrering</div>
      <MiniLinje label="Ankomst" vaerdi={datoTid(t.ankomstMs)} />
      <MiniLinje label="Afgang" vaerdi={t.afgangMs ? datoTid(t.afgangMs) : "Ikke meldt"} />
      <MiniLinje label="På stedet" vaerdi={paaStedet === null ? "—" : `${num(paaStedet)} min.`} />
      {/* ⚠ DET ANDET TIDSPUNKT. En ventetid tastet dagen efter er svagere
          dokumentation end en tastet på stedet — og den der skal forsvare
          fakturaen, skal kunne se det. Ikke for at mistænkeliggøre nogen. */}
      <p className="fc-hint" style={{ marginTop: 6 }}>
        Registreret {datoTid(t.registreretMs)}
        {forsinket !== null && forsinket > 0 && ` — ${num(forsinket)} min. efter ankomsten`}.
      </p>
    </div>
  );
}

/* ---- Sensitive felter: låst tilstand er ikke tomhed -------------------- */

/**
 * ⚠ FELTET VISES SOM LÅST, IKKE SOM FRAVÆRENDE.
 *
 * Og kortet står der for ALLE arter — også dem uden en skade. Vistes det kun
 * når der VAR noget at skjule, kunne man læse af hængelåsen at der skete
 * noget. Det er samme indsigt som ved cargoValue i ARKITEKTUR: delvis
 * afsløring lækker gennem udeladelsen.
 */
function Sensitivt({ aaben, data, art }) {
  const harNoget = Boolean(data?.skadeBeskrivelse || data?.underskrift);
  return (
    <div style={{ marginTop: 16 }}>
      <div className="fc-row" style={{ marginBottom: 6 }}>
        <span className="fc-hint">Beskyttede oplysninger</span>
        <Pille tone={aaben ? "ok" : "warn"}>{aaben ? "Adgang" : "Låst"}</Pille>
      </div>

      {!aaben && (
        <p className="fc-hint">
          Skadebeskrivelse og underskrift kræver <code>indberetninger.sensitiveLaes</code>.
          Kortet vises for alle indberetninger — også dem uden skade — så en
          hængelås ikke i sig selv røber at der skete noget.
        </p>
      )}

      {aaben && !harNoget && <p className="fc-hint">Ingen beskyttede oplysninger på denne.</p>}

      {aaben && harNoget && (
        <>
          {data.skadeBeskrivelse && <p>{data.skadeBeskrivelse}</p>}
          {data.modpart && (
            <MiniLinje label="Modpart" vaerdi={`${data.modpart.navn} — ${data.modpart.rolle}`} />
          )}
          {data.underskrift && <Underskrift u={data.underskrift} />}
        </>
      )}
    </div>
  );
}

/**
 * ⚠ SKRIVES ÉN GANG. Reglen er "underskrift": { ".write": "!data.exists()" } —
 * ikke en konvention. En underskrift der kan redigeres bagefter, beviser
 * ingenting. En rettelse er et TILLÆG: en ny indberetning der henviser til den
 * gamle, præcis som et låst fakturagrundlag erstattes frem for at rettes.
 */
function Underskrift({ u }) {
  return (
    <div style={{ marginTop: 12 }}>
      <MiniLinje label="Underskrevet af" vaerdi={u.navn} />
      <MiniLinje label="Sted" vaerdi={u.stedTekst || "—"} />
      <MiniLinje label="Tidspunkt" vaerdi={datoTid(u.ms)} />
      <p className="fc-hint" style={{ marginTop: 6 }}>
        Kan ikke ændres. En rettelse sker som en ny indberetning der henviser
        til denne — underskriften er et bevis, og et bevis der kan redigeres,
        beviser ingenting.
      </p>
    </div>
  );
}

/* ---- Materialeforbrug: én hændelse, to posteringer --------------------- */

function Materialer({ i }) {
  const linjer = i.materialelinjer || [];
  if (!linjer.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="fc-hint" style={{ marginBottom: 6 }}>Materialeforbrug</div>
      <Tabel
        kolonner={[
          { key: "vare", label: "Vare" },
          { key: "maengde", label: "Mængde", num: true,
            /* Vises som tal, gemmes som tusinddele — samme skala som
               grundlagets antal, så der ikke skal regnes om undervejs. */
            render: (l) => `${num(talFraAntal(l.maengde), 1)} ${l.enhed}` },
          /* ⚠ TO KOLONNER, IKKE ÉN. Salget og forbruget er to posteringer af
             samme hændelse med hver sit beløb og hver sin modtager. */
          { key: "salg", label: "Faktureret", render: (l) => <Salgstilstand i={i} l={l} /> },
          { key: "lager", label: "Lagertrukket",
            render: (l) => l.lagertraekId
              ? <Pille tone="ok">Trukket</Pille>
              : <Pille tone="warn">Ikke trukket</Pille> },
        ]}
        raekker={linjer}
        noegle={(l) => l.varenummer || l.vare}
        tom="Intet materiale registreret."
      />
      <p className="fc-hint" style={{ marginTop: 6 }}>
        Salget og forbruget er to posteringer af samme hændelse. Linjen på
        fakturagrundlaget er hvad kunden betaler; lagertrækket er hvad det
        kostede os. Slås de sammen, bliver dækningsgraden forkert uden at noget
        ser forkert ud.
      </p>
    </div>
  );
}

/** Tilstanden siger hvorfor, ikke bare ja/nej. "Ingen kunde" og "allerede
 *  faktureret" kræver hver sin handling — eller ingen. */
function Salgstilstand({ i, l }) {
  if (l.grundlagslinjeId) return <Pille tone="ok">På grundlag</Pille>;
  const tjek = kanFaktureres(i, l);
  if (tjek.ok) return <Pille tone="warn">Kan faktureres</Pille>;
  return <Pille tone="info" title={tjek.aarsag}>Ikke fakturerbar</Pille>;
}
