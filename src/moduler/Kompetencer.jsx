/* src/moduler/Kompetencer.jsx
 * Kompetencer & certifikater. BESLUTNING 25.
 *
 * ⚠ BESLUTNING 25 ER ANTAGELSER, IKKE AFGJORTE KRAV — bortset fra ét sted:
 * hvilke beviser der er lovpligtige, er ikke en antagelse, og derfor er det
 * netop dem der BLOKERER frem for at advare.
 *
 * Der findes INGEN mockup for denne skærm.
 *
 * ---------------------------------------------------------------------------
 * ⚠ TO SLAGS KRAV, OG LINJEN ER HVAD KRAVET KOMMER FRA.
 *
 * ALT hvad kraevedeKompetencer() kan udlede af enheden og godset, BLOKERER:
 * C, C/E, D1, D, tachografkort, ADR, truckcertifikat — og efter beslutning 25
 * også EU-kvalifikationsbeviset og kranførerbeviset. Alt andet ADVARER og kan
 * overrules med en begrundelse.
 *
 * Det er en skarpere linje end "lovkrav mod virksomhedskrav", og den er
 * vigtig: en udløbet kompetence må ikke kunne klikkes væk, for en advarsel man
 * kan klikke videre fra, er ikke en kontrol. Men et virksomhedskrav der
 * blokerer, standser en tur af en grund ingen kan svare på klokken fem om
 * morgenen — så det advarer og koster en sætning.
 *
 * ⚠ TÆRSKLERNE ER serviceTone() FRA format.js — de samme som Flåde og
 * Facility bruger. To steder med hver sin grænse for "snart udløbet" er to
 * skærme der er uenige om hvad der haster.
 *
 * ⚠ BEGRUNDELSEN FOR EN OVERRIDE STÅR I OBJEKTETS HISTORIK, ikke i
 * auditloggen. `begrundelse` må ikke tilføjes til LOGBARE_FELTER —
 * allowlisten findes for at holde fritekst ude af loggen. Se personale.js.
 * ---------------------------------------------------------------------------
 *
 * FASE 0: VISNING. Der skrives ingenting.
 */
import { useState } from "react";
import { num, dato, serviceTone } from "../fleet/format.js";
import {
  Kort, Tom, KpiKort, KpiRaekke, Tabel, Pille, Henter, Datatilstand, Gitter, MiniLinje, Knap,
} from "../fleet/ui.jsx";
import { blokerer } from "../fleet/datatilstand.js";
import { KOMPETENCE_LABEL, BLOKERENDE_KOMPETENCER, kanBlokere } from "../fleet/flaade.js";
import { tjekKompetencer, PERSONALE_STATUS, kanDisponeres } from "../fleet/personale.js";
import { DEMO_PERSONALE, DEMO_KOMPETENCER } from "../fleet/demo-personale.js";
import { useKpi } from "../fleet/useKpi.js";
import { useListe } from "../fleet/useListe.js";

const NU = Date.now();

/* ⚠ OPSLAGENE LÅ PÅ MODULNIVEAU MED DEMO-SÆTTET LUKKET INDE I SIG.
   `personNavn(id)` og `mineKompetencer(personId)` læste DEMO_PERSONALE og
   DEMO_KOMPETENCER direkte — så skærmen viste demofilen, også efter at begge
   noder var seedet. Det er samme mønster som zonePar() og medPrisliste():
   en modulkonstant kan ikke kende komponentens data, så den lukker demoen
   inde. Nu tager de listen ind. */
/* personNavn() er vaek: tabellen har personen selv paa raekken og behoever
   ikke slaa navnet op. Den laa der kun fordi opslaget skulle et sted hen. */
const mineKompetencer = (kompetencer, personId) =>
  kompetencer.filter((k) => k.personId === personId);

export default function Kompetencer() {
  const { kpi: k, henter, fejl, tilstand, genindlaes } = useKpi();

  /* ⚠ TO SEEDEDE NODER, OG SKÆRMEN VISTE DEMOFILEN FOR BEGGE. Den tæller
     UDLØBNE BEVISER — det tal der afgør om en chauffør kan disponeres — og
     det stod med mockuppens tal i hver eneste tenant.

     division: "alle" på begge. Hverken personale eller kompetencer bærer
     feltet (beslutning 19), og et filter ville derfor være en påstand om at
     de gjorde. */
  const pers = useListe("personale", {
    ordnPaa: "status", vindue: "alle", division: "alle", graense: 500,
    demo: DEMO_PERSONALE,
  });
  const komp = useListe("kompetencer", {
    vindue: "alle", division: "alle", graense: 2000, demo: DEMO_KOMPETENCER,
  });

  const [valgtId, setValgtId] = useState(null);

  if (henter || pers.henter || komp.henter) return <Henter hvad="kompetencer" />;
  /* En AFVIST læsning er ikke et tomt kompetencekartotek. */
  if (blokerer(komp.tilstand)) {
    return <Datatilstand tilstand={komp.tilstand} genprov={komp.genindlaes} />;
  }
  /* ⚠ INGEN BLOKERING PÅ MANGLENDE NØGLETAL. En ny kunde har ingen
     aggregerede tal, og skal alligevel kunne bruge skærmen — knappen der
     opretter hans første post sidder på en af dem. Se blokerer(). */
  if (blokerer(tilstand)) return <Datatilstand tilstand={tilstand} genprov={genindlaes} />;

  /* AFLEDT af listen skærmen allerede har — hører derfor ikke i kpi/.
     Samme sag som aktive klimaalarmer; et gemt afledt tal driver fra sit
     grundlag, og det er fejlen i bemanding.ledig. */
  const udloebne = komp.data.filter((x) => x.udloeberMs <= NU);
  const snart = komp.data.filter(
    (x) => x.udloeberMs > NU && serviceTone(x.udloeberMs, NU).dage <= 30
  );
  /* ⚠ DET TAL DER BETYDER NOGET: hvor mange af de udløbne der BLOKERER. En
     udløbet førstehjælp og et udløbet ADR-bevis er ikke samme problem, og en
     samlet optælling ville skjule forskellen. */
  const blokerende = udloebne.filter((x) => kanBlokere(x.type));

  const raekker = pers.data
    .filter((p) => p.status !== "fratraadt")
    .map((p) => {
      const mine = mineKompetencer(komp.data, p.id);
      return {
        p,
        mine,
        udloebne: mine.filter((x) => x.udloeberMs <= NU),
        blokerede: mine.filter((x) => x.udloeberMs <= NU && kanBlokere(x.type)),
        snart: mine.filter((x) => x.udloeberMs > NU && serviceTone(x.udloeberMs, NU).dage <= 30),
      };
    });

  const valgt = raekker.find((r) => r.p.id === valgtId) || null;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      {k && (
        <KpiRaekke>
          <KpiKort label="Medarbejdere" vaerdi={num(raekker.length)} note="ikke fratrådte" />
          <KpiKort label="Udløbet og blokerer" vaerdi={num(blokerende.length)}
                   tone={blokerende.length ? "bad" : undefined}
                   note="chaufføren kan ikke disponeres" />
          <KpiKort label="Udløbet, advarer" vaerdi={num(udloebne.length - blokerende.length)}
                   tone={udloebne.length - blokerende.length ? "warn" : undefined}
                   note="kan overrules med begrundelse" />
          <KpiKort label="Udløber inden 30 dage" vaerdi={num(snart.length)}
                   tone={snart.length ? "warn" : undefined} note="forny i tide" />
        </KpiRaekke>
      )}

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Gitter kolonner="minmax(0,3fr) minmax(0,2fr)">
        <Kort titel="Medarbejdere">
          <Tabel
            kolonner={[
              { key: "navn", label: "Medarbejder", render: (r) => r.p.navn },
              { key: "status", label: "Status",
                render: (r) => (
                  <Pille tone={PERSONALE_STATUS[r.p.status]?.pill || "info"}>
                    {PERSONALE_STATUS[r.p.status]?.label || r.p.status}
                  </Pille>
                ) },
              { key: "antal", label: "Kompetencer", num: true, render: (r) => num(r.mine.length) },
              { key: "tilstand", label: "Gyldighed", render: (r) => <Tilstand r={r} /> },
            ]}
            raekker={raekker}
            noegle={(r) => r.p.id}
            paaRaekke={(r) => setValgtId(r.p.id)}
            erValgt={(r) => r.p.id === valgtId}
            tom="Ingen medarbejdere."
          />
          <p className="fc-hint" style={{ marginTop: 8 }}>
            En udløbet kompetence der <strong>blokerer</strong>, standser
            disponeringen — den advarer ikke. Håndhævelsen hører i den Cloud
            Function der skriver etapen; ligger den kun her, kan en direkte
            skrivning gå uden om den.
          </p>
        </Kort>

        {valgt
          ? <Detaljer r={valgt} />
          : <Kort titel="Detaljer"><Tom>Vælg en medarbejder.</Tom></Kort>}
      </Gitter>

      <Udloebsliste raekker={raekker} />
    </div>
  );
}

/** Den værste tilstand vinder. En medarbejder med både en blokeret og en
 *  advarende kompetence er blokeret — ikke "delvist i orden". */
function Tilstand({ r }) {
  if (r.blokerede.length) return <Pille tone="bad">Blokeret</Pille>;
  if (r.udloebne.length) return <Pille tone="warn">Udløbet, advarer</Pille>;
  if (r.snart.length) return <Pille tone="warn">Udløber snart</Pille>;
  return <Pille tone="ok">Gyldig</Pille>;
}

/* ---- Detaljer ---------------------------------------------------------- */

function Detaljer({ r }) {
  /* ⚠ SAMME FUNKTION SOM DISPONERING BRUGER. Skærmen svarer ikke selv på om
     kompetencerne holder — den spørger tjekKompetencer(). To steder der
     vurderer det samme, kan vurdere forskelligt, og så er en chauffør grøn her
     og rød i Disponering. */
  const krav = {
    blokerende: r.mine.filter((x) => kanBlokere(x.type)).map((x) => x.type),
    advarende: r.mine.filter((x) => !kanBlokere(x.type)).map((x) => x.type),
  };
  const tjek = tjekKompetencer(r.mine, krav, NU);

  return (
    <Kort titel={r.p.navn}>
      <MiniLinje label="Status" vaerdi={PERSONALE_STATUS[r.p.status]?.label} />
      <MiniLinje label="Kan disponeres"
                 vaerdi={kanDisponeres(r.p) ? "Ja" : "Nej — se status"} />

      <Tabel
        kolonner={[
          { key: "type", label: "Kompetence",
            render: (x) => KOMPETENCE_LABEL[x.type] || x.type },
          { key: "virkning", label: "Virkning",
            /* ⚠ STÅR PÅ HVER RÆKKE. Ellers kan man ikke se hvorfor to udløbne
               beviser har hver sin konsekvens. */
            render: (x) => kanBlokere(x.type)
              ? <Pille tone="bad">Blokerer</Pille>
              : <Pille tone="info">Advarer</Pille> },
          { key: "udloeber", label: "Udløber", render: (x) => dato(x.udloeberMs) },
          { key: "tone", label: "", render: (x) => <Udloeb ms={x.udloeberMs} /> },
        ]}
        raekker={[...r.mine].sort((a, b) => a.udloeberMs - b.udloeberMs)}
        noegle={(x) => x.id}
        tom="Ingen kompetencer registreret."
      />

      {tjek.blokerende.udloebne.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Pille tone="bad">Blokerer disponering</Pille>
          <ul style={{ margin: "8px 0 0 18px" }}>
            {tjek.blokerende.udloebne.map((t) => (
              <li key={t} className="fc-hint">
                {KOMPETENCE_LABEL[t] || t} er udløbet. Kan ikke overrules.
              </li>
            ))}
          </ul>
        </div>
      )}

      {tjek.advarende.udloebne.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Pille tone="warn">Advarsel</Pille>
          <ul style={{ margin: "8px 0 0 18px" }}>
            {tjek.advarende.udloebne.map((t) => (
              <li key={t} className="fc-hint">
                {KOMPETENCE_LABEL[t] || t} er udløbet. Kan overrules med en
                begrundelse, der gemmes i historikken.
              </li>
            ))}
          </ul>
          {/* FASE 0: knappen skriver ikke. byggOverride() kaster uden en
              begrundelse, og begrundelsen hører i objektets historik — ikke i
              auditposten, som er en allowliste uden fritekst. */}
          <Knap disabled title="Fase 0: en override kræver en begrundelse og skrives af en Cloud Function."
                style={{ marginTop: 8 }}>
            Overrul med begrundelse
          </Knap>
        </div>
      )}
    </Kort>
  );
}

/** Udløbsvarslingen bruger serviceTone() — samme tærskler som Flåde og
 *  Facility. To grænser for "snart" ville gøre skærmene uenige om hvad der
 *  haster. */
function Udloeb({ ms }) {
  const t = serviceTone(ms, NU);
  return <Pille tone={t.tone}>{t.tekst}</Pille>;
}

/* ---- Påmindelser ------------------------------------------------------- */

/**
 * ⚠ RÆKKEFØLGEN ER EFTER DATO, IKKE EFTER ALVOR.
 *
 * Det er fristende at lægge alt det blokerende øverst. Men listen her er en
 * ARBEJDSLISTE — den skal svare på "hvad skal jeg nå inden det brænder på", og
 * så er datoen den rigtige akse. Virkningen står på hver række, så det
 * blokerende stadig kan ses.
 */
function Udloebsliste({ raekker }) {
  const kommende = raekker
    .flatMap((r) => [...r.udloebne, ...r.snart].map((x) => ({ ...x, person: r.p })))
    .sort((a, b) => a.udloeberMs - b.udloeberMs);

  return (
    <Kort titel="Udløber eller er udløbet">
      <Tabel
        kolonner={[
          { key: "person", label: "Medarbejder", render: (x) => x.person.navn },
          { key: "type", label: "Kompetence",
            render: (x) => KOMPETENCE_LABEL[x.type] || x.type },
          { key: "virkning", label: "Virkning",
            render: (x) => kanBlokere(x.type)
              ? <Pille tone="bad">Blokerer</Pille>
              : <Pille tone="info">Advarer</Pille> },
          { key: "udloeber", label: "Udløber", render: (x) => dato(x.udloeberMs) },
          { key: "tone", label: "", render: (x) => <Udloeb ms={x.udloeberMs} /> },
        ]}
        raekker={kommende}
        noegle={(x) => x.id}
        tom="Ingen kompetencer udløber inden for 30 dage."
      />
      <p className="fc-hint" style={{ marginTop: 8 }}>
        Sorteret efter dato, ikke efter alvor: listen skal svare på hvad der
        skal nås først. {BLOKERENDE_KOMPETENCER.length} af kompetencetyperne
        blokerer disponeringen — resten advarer.
      </p>
    </Kort>
  );
}
