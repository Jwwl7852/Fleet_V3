import { Link } from "react-router-dom";
import { dato, iDagIsoLokal, kr } from "../../fleet/format.js";
import { Henter, Kort, KpiKort, KpiRaekke, Pille, Tabel } from "../../fleet/ui.jsx";
import {
  CRM_FASE, crmAktiviteter, crmMuligheder, erAabenMulighed, erForfaldenAktivitet,
} from "../../fleet/ejer-crm-regler.js";
import { useEjerData } from "./EjerDataContext.jsx";

const ejerNavn = (profiler, uid) => profiler?.find((p) => p.uid === uid)?.navn || "Ukendt ejer";

export default function EjerOverblik({ bruger }) {
  const { crm, profiler, fejl, henter, genindlaes } = useEjerData();
  if (henter && crm === null) return <Henter hvad="ejerdata" />;
  if (fejl && crm === null) {
    return (
      <div className="fc-empty fc-empty-bad">
        <b>Ejerdata kunne ikke hentes.</b>
        <p>{String(fejl.message || fejl)}</p>
        <button type="button" className="fc-btn" onClick={genindlaes}>Prøv igen</button>
      </div>
    );
  }

  const iDag = iDagIsoLokal();
  const aktiviteter = crmAktiviteter(crm);
  const muligheder = crmMuligheder(crm);
  const mineAabne = aktiviteter
    .filter((a) => a.ansvarligUid === bruger?.uid && a.status !== "afsluttet")
    .sort((a, b) => String(a.fristDato || "9999").localeCompare(String(b.fristDato || "9999")));
  const forfaldne = mineAabne.filter((a) => erForfaldenAktivitet(a, iDag));
  const iDagPoster = mineAabne.filter((a) => a.fristDato === iDag);
  const udenNaeste = muligheder.filter((m) => erAabenMulighed(m) && !m.naesteAktivitetDato);
  const aabenPipelineOere = muligheder
    .filter(erAabenMulighed)
    .reduce((sum, m) => sum + (m.maanedligVaerdiOere || 0), 0);

  const handlinger = [...forfaldne, ...iDagPoster]
    .filter((post, index, alle) => alle.findIndex((x) => x.id === post.id) === index);

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Mine forfaldne" vaerdi={forfaldne.length} note="åbne aktiviteter"
          til="/main/salg/aktiviteter?filter=forfaldne" />
        <KpiKort label="I dag" vaerdi={iDagPoster.length} note="aftaler og opgaver"
          til="/main/salg/aktiviteter?filter=idag" />
        <KpiKort label="Uden næste handling" vaerdi={udenNaeste.length} note="åbne salgsmuligheder"
          til="/main/salg/pipeline?filter=uden-naeste" />
        <KpiKort label="Åben månedsværdi" vaerdi={kr(aabenPipelineOere)} note="ekskl. engangsbeløb"
          til="/main/salg/pipeline" />
      </KpiRaekke>

      <div className="ejer-overblik-grid">
        <Kort titel="Kræver handling nu" handling={<Link className="fc-a" to="/main/salg/aktiviteter">Se alle</Link>}>
          <Tabel
            raekker={handlinger}
            tom="Du har ingen forfaldne aktiviteter eller aktiviteter i dag."
            kolonner={[
              { label: "Frist", render: (a) => a.fristDato ? dato(Date.parse(`${a.fristDato}T12:00:00Z`)) : "—" },
              { label: "Virksomhed", felt: "virksomhedsnavn" },
              { label: "Aktivitet", felt: "titel" },
              { label: "Status", render: (a) => (
                <Pille tone={erForfaldenAktivitet(a, iDag) ? "bad" : "warn"}>
                  {erForfaldenAktivitet(a, iDag) ? "Forfalden" : "I dag"}
                </Pille>
              ) },
            ]}
          />
        </Kort>

        <Kort titel="Pipeline kræver opfølgning" handling={<Link className="fc-a" to="/main/salg/pipeline">Åbn pipeline</Link>}>
          <Tabel
            raekker={udenNaeste.slice(0, 8)}
            tom="Alle åbne muligheder har en næste handling."
            kolonner={[
              { label: "Virksomhed", felt: "virksomhedsnavn" },
              { label: "Mulighed", felt: "titel" },
              { label: "Fase", render: (m) => CRM_FASE[m.fase] || m.fase },
              { label: "Ansvarlig", render: (m) => ejerNavn(profiler, m.ansvarligUid) },
            ]}
          />
        </Kort>
      </div>

      <Kort titel="Forbindelsesstatus">
        <div className="ejer-statuslinjer">
          <div><Pille tone="ok">Aktiv</Pille><span>Firebase ejerdata og adgangskontrol</span></div>
          <div><Pille tone="warn">Ikke tilsluttet</Pille><span>Dinero — credentials og testorganisation mangler</span></div>
          <div><Pille tone="warn">Ikke tilsluttet</Pille><span>Invoice-mail, inbound-mail og OCR-leverandør er ikke valgt</span></div>
        </div>
      </Kort>
    </div>
  );
}

