import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { dato, iDagIsoLokal, kr } from "../../fleet/format.js";
import { Henter, Kort, KpiKort, KpiRaekke, Pille, Tabel } from "../../fleet/ui.jsx";
import {
  CRM_FASE, crmAktiviteter, crmMuligheder, erAabenMulighed, erForfaldenAktivitet,
} from "../../fleet/ejer-crm-regler.js";
import { useEjerData } from "./EjerDataContext.jsx";
import { hentSalgsplatform, SALGSSTATUS } from "../../fleet/ejer-salgsindbakke.js";

const ejerNavn = (profiler, uid) => profiler?.find((p) => p.uid === uid)?.navn || "Ukendt ejer";

export default function EjerOverblik({ bruger }) {
  const { crm, profiler, fejl, henter, genindlaes } = useEjerData();
  const [salgsplatform, setSalgsplatform] = useState(null);
  useEffect(() => { hentSalgsplatform().then(setSalgsplatform).catch(() => setSalgsplatform(null)); }, []);
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
  const mailtraade = Object.entries(salgsplatform?.traade || {}).map(([id, v]) => ({ id, ...v }));
  const nyeHenvendelser = mailtraade.filter((t) => ["ny", "afventer_os"].includes(t.status));
  const godkendelsesopgaver = mailtraade.flatMap((t) => Object.values(t.opfoelgninger || {}).filter((o) => ["kladde", "godkendt"].includes(o.status)).map((o) => ({ ...o, traadId: t.id, emne: t.emne })));

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
        <KpiKort label="Salgsindbakke" vaerdi={nyeHenvendelser.length} note="nye eller afventer vores svar" til="/main/salg/indbakke" />
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

      <Kort titel="Nye salgsbeskeder og godkendelser" handling={<Link className="fc-a" to="/main/salg/indbakke">Åbn salgsindbakke</Link>}>
        <Tabel raekker={[...nyeHenvendelser.slice(0, 6), ...godkendelsesopgaver.slice(0, 4)]} tom="Ingen nye henvendelser eller ventende mailgodkendelser." kolonner={[{ label: "Sag", render: (r) => r.emne || "Opfølgning" }, { label: "Status", render: (r) => <Pille>{r.traadId ? (r.status === "godkendt" ? "Godkendt — klar til send" : "Afventer godkendelse") : SALGSSTATUS[r.status] || r.status}</Pille> }, { label: "Seneste", render: (r) => r.senesteAktivitetMs ? new Date(r.senesteAktivitetMs).toLocaleString("da-DK") : r.godkendtMs ? new Date(r.godkendtMs).toLocaleString("da-DK") : r.godkendelsesopgaveOprettetMs ? new Date(r.godkendelsesopgaveOprettetMs).toLocaleString("da-DK") : "—" }]} />
      </Kort>

      <Kort titel="Forbindelsesstatus">
        <div className="ejer-statuslinjer">
          <div><Pille tone="ok">Aktiv</Pille><span>Firebase ejerdata og adgangskontrol</span></div>
          <div><Pille tone={salgsplatform?.integrationer?.dinero?.status === "aktiv" ? "ok" : "warn"}>{salgsplatform?.integrationer?.dinero?.status === "aktiv" ? "Aktiv" : "Ikke tilsluttet"}</Pille><span>Dinero · fakturaer, kreditnotaer og returdata</span></div>
          <div><Pille tone={salgsplatform?.integrationer?.microsoft365?.status === "aktiv" ? "ok" : "warn"}>{salgsplatform?.integrationer?.microsoft365?.status === "aktiv" ? "Aktiv" : "Ikke tilsluttet"}</Pille><span>Microsoft 365 · info@veyrosystems.com</span></div>
          <div><Pille tone={salgsplatform?.integrationer?.openai?.status === "aktiv" ? "ok" : "warn"}>{salgsplatform?.integrationer?.openai?.status === "aktiv" ? "Aktiv" : "Ikke tilsluttet"}</Pille><span>OpenAI-salgsassistent · mail og CRM virker uafhængigt</span></div>
          <div><Pille tone="warn">Ikke tilsluttet</Pille><span>Bilagsmail og OCR-leverandør er ikke valgt</span></div>
        </div>
      </Kort>
    </div>
  );
}
