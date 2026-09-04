/* src/moduler/facility/Inventar.jsx
 * Facility – Inventar. Facility TARGET-restrukturering (produktejer-review
 * 2026-09-02) — se fleet/modulfaner.js's FACILITY_FANER og
 * docs/product-redesign-v1/07_OLD_CURRENT_TARGET_FLEET_FACILITY_PROCURE_UNITBOOKING.md's
 * Facility-afsnit, punkt 3: "ny visning af data Oversigt.jsx allerede
 * henter (facility/aktiver+facility/lokationer) som en dedikeret,
 * filtrérbar fane frem for kun en tabel nederst på Overblik."
 *
 * ⚠ FLYTTET HERTIL, IKKE GENOPFUNDET. Aktivtabellen, Aktivformularen
 * (opret/redigér) og art-fordelingsdonuten stod alle i Oversigt.jsx før
 * denne restrukturering — samme kode, samme `gem()`/`byggAktiv()`/
 * `valideAktiv()`, kun placeringen og filterraden er ny.
 *
 * ⚠ "+ OPRET OPGAVE" PÅ EN RÆKKE ÅBNER DEN EKSISTERENDE Servicedialog,
 * forudfyldt med anlægget — ingen ny Cloud Function, samme mønster som
 * Overblik.jsx's "Kommende & overskredne services"-tabel.
 */
import { useState } from "react";
import { kr, num, dato, serviceTone } from "../../fleet/format.js";
import { useKpi } from "../../fleet/useKpi.js";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import {
  Kort, Tom, Tabel, Pille, Henter, Datatilstand, Donut, MiniLinje, Ikon,
  Knap, Felt, Feltraekke, Formular, Kpiadgang, ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  AKTIV_ART, AKTIV_STATUS, ALLE_AKTIV_ARTER, ALLE_AKTIV_STATUS,
  aktivFordeling, estimatForAktiv, valideAktiv, byggAktiv,
} from "../../fleet/facility.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import { FACILITY_FANER } from "../../fleet/modulfaner.js";
import Servicedialog from "./Servicedialog.jsx";
import { DEMO_AKTIVER, DEMO_LOKATIONER } from "../../fleet/demo-facility.js";
import { DEMO_PERSONALE } from "../../fleet/demo-personale.js";
import { DEMO_OPGAVER } from "../../fleet/demo-opgaver.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

const tomtAktiv = () => ({
  navn: "", art: "port", status: "idrift", lokationId: "",
  zoneId: "", ansvarligPersonId: "", serviceIntervalDage: "",
});

/**
 * ⚠ VALIDERINGEN SPEJLER firebase.rules.json og afgør ingenting. Serveren
 * validerer igen, og er de to uenige, er reglerne rigtige.
 */
function Aktivformular({ aktiv, lokationer, zoner, personale, sti, paaGemt, paaLuk }) {
  const nyt = !aktiv;
  const [f, saetF] = useState(() => (aktiv ? { ...tomtAktiv(), ...aktiv } : tomtAktiv()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const fejl = valideAktiv(f, { lokationer, zoner, personale });
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = aktiv?.id || nyId("fa");
    const r = await gem({
      sti: sti(`aktiver/${id}`), data: byggAktiv(f), foer: aktiv || null,
      objekt: "facility", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt(id);
  };

  return (
    <Kort titel={nyt ? "Nyt anlæg" : `Redigér ${aktiv.navn}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret anlæg" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="fa-navn" label="Navn" kraevet vaerdi={f.navn} saet={saet("navn")}
                fejl={vis("navn")} hint="Port 3, Køleanlæg 1 — det navn folk bruger." />
          <Felt id="fa-art" label="Udstyrstype" kraevet vaerdi={f.art} saet={saet("art")}
                fejl={vis("art")}
                valgmuligheder={ALLE_AKTIV_ARTER.map((a) => ({ vaerdi: a, label: AKTIV_ART[a].label }))} />
          <Felt id="fa-status" label="Status" kraevet vaerdi={f.status} saet={saet("status")}
                fejl={vis("status")}
                valgmuligheder={ALLE_AKTIV_STATUS.map((s) => ({ vaerdi: s, label: AKTIV_STATUS[s].label }))} />
        </Feltraekke>

        <Feltraekke>
          <Felt id="fa-lok" label="Lokation" kraevet vaerdi={f.lokationId} saet={saet("lokationId")}
                fejl={vis("lokationId")}
                hint="Et anlæg uden lokation kan ikke vises i driftsstatus."
                valgmuligheder={[{ vaerdi: "", label: "Vælg …" },
                  ...lokationer.map((l) => ({ vaerdi: l.id, label: l.navn }))]} />
          {AKTIV_ART[f.art]?.maalesZone && (
            <Felt id="fa-zone" label="Zone" kraevet vaerdi={f.zoneId} saet={saet("zoneId")}
                  fejl={vis("zoneId")}
                  hint="Arten måles i en zone — uden den kan Klima ikke vise dens temperatur."
                  valgmuligheder={[{ vaerdi: "", label: "Vælg …" },
                    ...zoner.map((z) => ({ vaerdi: z.id, label: z.navn }))]} />
          )}
        </Feltraekke>

        <Feltraekke>
          {/* ⚠ personId, ALDRIG uid. Den ansvarlige er hvem det HANDLER om;
              en facilityansvarlig har måske intet login. Beslutning 18. */}
          <Felt id="fa-ansv" label="Ansvarlig" vaerdi={f.ansvarligPersonId}
                saet={saet("ansvarligPersonId")} fejl={vis("ansvarligPersonId")}
                hint="En medarbejder — ikke et login. Personen findes uden konto."
                valgmuligheder={[{ vaerdi: "", label: "Ingen" },
                  ...personale.map((p) => ({ vaerdi: p.id, label: p.navn }))]} />
          <Felt id="fa-interval" label="Serviceinterval" type="number" suffiks="dage"
                vaerdi={f.serviceIntervalDage} saet={saet("serviceIntervalDage")}
                fejl={vis("serviceIntervalDage")} />
        </Feltraekke>
      </Formular>

      <p className="fc-hint" style={{ marginTop: 14 }}>
        Der er <b>ingen division</b> på et facility-anlæg. Facility er{" "}
        <b>fælles</b> — porten er den samme uanset hvem der kører igennem den —
        og reglerne afviser feltet.
      </p>
    </Kort>
  );
}

export default function FacilityInventar() {
  const { kpi: k, utilgaengelige } = useKpi();
  const { bruger, path } = useFleet();

  const felles = { vindue: "alle", graense: 500 };
  const lok = useListe("facility/lokationer", { ordnPaa: "type", ...felles, demo: DEMO_LOKATIONER });
  const akt = useListe("facility/aktiver", { ordnPaa: "naesteServiceMs", ...felles, demo: DEMO_AKTIVER });
  const zon = useListe("facility/zoner", { ordnPaa: "lokationId", ...felles });
  const pers = useListe("personale", { vindue: "alle", graense: 500, demo: DEMO_PERSONALE });
  const opgaver = useListe("opgaver", { vindue: "alle", graense: 500, demo: DEMO_OPGAVER });
  const leverandoerer = useListe("leverandoerer", {
    vindue: "alle", graense: 200, demo: DEMO_LEVERANDOERER,
  });

  const personNavn = (personId) => pers.data.find((p) => p.id === personId)?.navn || "—";
  const lokNavn = (id) => lok.data.find((l) => l.id === id)?.navn || "—";

  const [soeg, setSoeg] = useState("");
  const [artFilter, setArtFilter] = useState("");
  const [lokFilter, setLokFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [valgtId, setValgtId] = useState(null);
  const [aktivform, setAktivform] = useState(null);
  const [planlaegger, setPlanlaegger] = useState(null);

  const henterNoget = akt.henter || lok.henter || zon.henter || pers.henter || opgaver.henter;
  if (henterNoget) return <Henter hvad="inventaret" />;
  if (blokerer(akt.tilstand)) {
    return <Datatilstand tilstand={akt.tilstand} genprov={akt.genindlaes} />;
  }

  const maaSkrive = harPerm(bruger?.perms, PERM.facilitySkriv);
  const zoner = zon.data;

  const q = soeg.trim().toLowerCase();
  const viste = akt.data
    .filter((a) => !artFilter || a.art === artFilter)
    .filter((a) => !lokFilter || a.lokationId === lokFilter)
    .filter((a) => !statusFilter || a.status === statusFilter)
    .filter((a) => !q || (a.navn || "").toLowerCase().includes(q))
    .sort((a, b) => (a.naesteServiceMs ?? Infinity) - (b.naesteServiceMs ?? Infinity));

  const harFilter = Boolean(q || artFilter || lokFilter || statusFilter);
  const nulstil = () => { setSoeg(""); setArtFilter(""); setLokFilter(""); setStatusFilter(""); };

  const valgt = viste.find((a) => a.id === valgtId) || null;
  const fordeling = aktivFordeling(k?.facility?.aktiverPrArt || {});
  const nu = Date.now();

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={FACILITY_FANER} />
      <Kpiadgang utilgaengelige={utilgaengelige} />

      <Kort titel="Aktivfordeling">
        {!fordeling.length ? (
          <Tom>
            <b>aktiverPrArt</b> findes ikke i <code>kpi/</code> for denne tenant — fordelingen
            er ikke aggregeret endnu.
          </Tom>
        ) : (
          <Donut dele={fordeling} total={k?.facility?.aktiver} midteTekst="aktive" format={(v) => num(v)} />
        )}
        <p className="fc-hint" style={{ marginTop: 12 }}>
          Fordelingen kommer fra <b>kpi/</b>, ikke fra de {num(akt.data.length)} hentede —
          højst fem slices, en sjette ville genbruge den første farve.
        </p>
      </Kort>

      <Kort>
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="fi-soeg">Søg</label>
            <input id="fi-soeg" type="search" value={soeg}
                   placeholder="Navn på anlæg"
                   onChange={(e) => setSoeg(e.target.value)} />
          </div>
          <div className="fc-felt">
            <label htmlFor="fi-art">Udstyrstype</label>
            <select id="fi-art" value={artFilter} onChange={(e) => setArtFilter(e.target.value)}>
              <option value="">Alle typer</option>
              {ALLE_AKTIV_ARTER.map((a) => <option key={a} value={a}>{AKTIV_ART[a].label}</option>)}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="fi-lok">Lokation</label>
            <select id="fi-lok" value={lokFilter} onChange={(e) => setLokFilter(e.target.value)}>
              <option value="">Alle lokationer</option>
              {lok.data.map((l) => <option key={l.id} value={l.id}>{l.navn}</option>)}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="fi-status">Status</label>
            <select id="fi-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Alle</option>
              {ALLE_AKTIV_STATUS.map((s) => <option key={s} value={s}>{AKTIV_STATUS[s].label}</option>)}
            </select>
          </div>
          <div className="fc-filtre-knapper">
            <Knap disabled={!harFilter} onClick={nulstil}>Nulstil filtre</Knap>
          </div>
        </div>
      </Kort>

      {aktivform && (
        <Aktivformular
          key={aktivform}
          aktiv={aktivform === "ny" ? null : akt.data.find((a) => a.id === aktivform)}
          lokationer={lok.data}
          zoner={zoner}
          personale={pers.data.filter((p) => p.status === "aktiv")}
          sti={(under) => path(`facility/${under}`)}
          paaGemt={() => { setAktivform(null); akt.genindlaes(); }}
          paaLuk={() => setAktivform(null)}
        />
      )}

      <Kort titel={`Aktiver (${num(viste.length)})`}
            handling={
              <Knap variant="primaer" disabled={!maaSkrive}
                    onClick={() => { setAktivform("ny"); setValgtId(null); }}
                    title={maaSkrive ? "Opret et nyt anlæg." : "Kræver facility.skriv — serveren afviser."}>
                Nyt anlæg
              </Knap>
            }>
        <Tabel
          kolonner={[
            { key: "navn", label: "Aktiv", render: (r) => (
                <button type="button" className="fc-a"
                        style={{ background: "none", border: 0, padding: 0, cursor: "pointer",
                                 font: "inherit", fontWeight: 650, textAlign: "left" }}
                        aria-pressed={r.id === valgtId}
                        onClick={() => setValgtId(r.id === valgtId ? null : r.id)}>
                  {r.navn}
                </button>
              ) },
            { key: "art", label: "Kategori", render: (r) => AKTIV_ART[r.art]?.label || r.art },
            { key: "lokationId", label: "Lokation", render: (r) => (
                <span className="fc-med-ikon fc-med-ikon-svag"><Ikon navn="bygning" />{lokNavn(r.lokationId)}</span>
              ) },
            { key: "naesteServiceMs", label: "Næste service", render: (r) => {
                const s = serviceTone(r.naesteServiceMs);
                return (
                  <div className="fc-tolinje">
                    <b className={s.tone === "bad" ? "fc-bad" : undefined}>{dato(r.naesteServiceMs)}</b>
                    <span className={s.tone === "bad" ? "fc-bad" : undefined}>{s.tekst}</span>
                  </div>
                );
              } },
            { key: "ansvarligPersonId", label: "Ansvarlig", render: (r) => personNavn(r.ansvarligPersonId) },
            { key: "status", label: "Status", render: (r) => (
                <Pille tone={AKTIV_STATUS[r.status]?.pill}>{AKTIV_STATUS[r.status]?.label || r.status}</Pille>
              ) },
            { key: "estimat", label: "Estimeret omkostning", num: true, render: (r) => {
                const oere = estimatForAktiv(opgaver.data, r.id, nu);
                return oere == null ? <span className="fc-neutral">—</span> : kr(oere);
              } },
            { key: "h", label: "", render: (r) => (
                <Knap disabled={!maaSkrive}
                      onClick={() => setPlanlaegger({ aktivId: r.id, startMs: r.naesteServiceMs })}
                      title={maaSkrive ? "Åbner Planlæg service med anlægget udfyldt." : "Kræver opgaver.skriv."}>
                  + Opret opgave
                </Knap>
              ) },
          ]}
          raekker={viste}
          noegle={(r) => r.id}
          tom={harFilter ? "Ingen aktiver passer på filtrene." : "Ingen aktiver oprettet endnu."}
        />
      </Kort>

      {valgt && (
        <Kort titel={valgt.navn} handling={
          <Knap disabled={!maaSkrive} onClick={() => setAktivform(valgt.id)}
                title={maaSkrive ? "Redigér anlægget." : "Kræver facility.skriv."}>
            Redigér
          </Knap>
        }>
          <MiniLinje label="Model/type" vaerdi={AKTIV_ART[valgt.art]?.label || valgt.art} />
          <MiniLinje label="Lokation" vaerdi={lokNavn(valgt.lokationId)} />
          <MiniLinje label="Status" vaerdi={<Pille tone={AKTIV_STATUS[valgt.status]?.pill}>{AKTIV_STATUS[valgt.status]?.label}</Pille>} />
          <MiniLinje label="Ansvarlig" vaerdi={personNavn(valgt.ansvarligPersonId)} />
          <MiniLinje label="Serviceinterval"
                     vaerdi={Number.isFinite(valgt.serviceIntervalDage) ? `${num(valgt.serviceIntervalDage)} dage` : "—"} />
          <p className="fc-hint" style={{ marginTop: 12 }}>
            Der er <b>ingen Slet-knap</b>. Reglernes <b>newData.exists()</b> afviser en
            sletning, fordi der hænger fejl- og servicehistorik på id'et.
          </p>
        </Kort>
      )}

      {planlaegger && (
        <Servicedialog
          aktiver={akt.data}
          lokationer={lok.data}
          leverandoerer={leverandoerer.data}
          foraf={planlaegger}
          onLuk={() => setPlanlaegger(null)}
          onGemt={() => { setPlanlaegger(null); opgaver.genindlaes(); akt.genindlaes(); }}
        />
      )}
    </div>
  );
}
