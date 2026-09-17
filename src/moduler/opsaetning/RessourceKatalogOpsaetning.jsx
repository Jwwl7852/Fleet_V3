import { useMemo, useState } from "react";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { useListe } from "../../fleet/useListe.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import { validerRessourceKategori, validerRessourceHardware } from "../../fleet/ressource-regler.js";
import { Datatilstand, Henter, Knap, Kort, Pille, Tabel } from "../../fleet/ui.jsx";

const tomKategori = { id: "", navn: "", aktiv: true, sortering: 100 };
const tomHardware = { id: "", serienummer: "", leverandoer: "", model: "", status: "aktiv" };

export default function RessourceKatalogOpsaetning({
  gruppe, titel, hardwareArt = null, children = null, visKategorier = true,
}) {
  const { path, bruger } = useFleet();
  const kategorier = useListe(`ressourceKategorier/${gruppe}`, {
    vindue: "alle", graense: 500, sorter: (a, b) => Number(a.sortering) - Number(b.sortering), demo: [],
  });
  const hardware = useListe(`ressourceHardware/${hardwareArt || "obd"}`, {
    vindue: "alle", graense: 500, hent: Boolean(hardwareArt),
    sorter: (a, b) => String(a.serienummer).localeCompare(String(b.serienummer), "da"), demo: [],
  });
  const [kategori, setKategori] = useState(tomKategori);
  const [enhed, setEnhed] = useState(tomHardware);
  const [svar, setSvar] = useState(null);
  const [gemmer, setGemmer] = useState(false);
  const eksisterendeKategori = useMemo(
    () => kategorier.data.find((post) => post.id === kategori.id), [kategori.id, kategorier.data],
  );
  const eksisterendeHardware = useMemo(
    () => hardware.data.find((post) => post.id === enhed.id), [enhed.id, hardware.data],
  );

  const gemKategori = async (event) => {
    event.preventDefault();
    const { fejl, post } = validerRessourceKategori(kategori);
    if (Object.keys(fejl).length) { setSvar({ ok: false, besked: Object.values(fejl)[0] }); return; }
    setGemmer(true);
    const id = kategori.id || nyId(`ressource-${gruppe}`);
    const nu = Date.now();
    const data = {
      ...post,
      oprettetMs: eksisterendeKategori?.oprettetMs || nu,
      oprettetAf: eksisterendeKategori?.oprettetAf || bruger.uid,
      opdateretMs: nu, opdateretAf: bruger.uid,
    };
    const resultat = await gem({
      sti: path(`ressourceKategorier/${gruppe}/${id}`), data,
      foer: eksisterendeKategori || null, objekt: "ressourceKategori", objektId: `${gruppe}/${id}`,
      handling: eksisterendeKategori ? AUDIT.aendre : AUDIT.opret,
    });
    setGemmer(false); setSvar(resultat);
    if (resultat.ok) { setKategori(tomKategori); kategorier.genindlaes(); }
  };

  const skiftKategori = async (post) => {
    const nu = Date.now();
    setGemmer(true);
    const resultat = await gem({
      sti: path(`ressourceKategorier/${gruppe}/${post.id}`),
      data: { ...post, aktiv: post.aktiv === false, opdateretMs: nu, opdateretAf: bruger.uid },
      foer: post, objekt: "ressourceKategori", objektId: `${gruppe}/${post.id}`, handling: AUDIT.tilstandsskift,
    });
    setGemmer(false); setSvar(resultat); if (resultat.ok) kategorier.genindlaes();
  };

  const gemHardware = async (event) => {
    event.preventDefault();
    const { fejl, post } = validerRessourceHardware(enhed, hardwareArt);
    if (Object.keys(fejl).length) { setSvar({ ok: false, besked: Object.values(fejl)[0] }); return; }
    setGemmer(true);
    const id = enhed.id || nyId(`${hardwareArt}-hardware`);
    const nu = Date.now();
    const data = {
      ...post,
      ...(eksisterendeHardware?.tilknytning ? { tilknytning: eksisterendeHardware.tilknytning } : {}),
      ...(eksisterendeHardware?.historik ? { historik: eksisterendeHardware.historik } : {}),
      oprettetMs: eksisterendeHardware?.oprettetMs || nu,
      oprettetAf: eksisterendeHardware?.oprettetAf || bruger.uid,
      opdateretMs: nu, opdateretAf: bruger.uid,
    };
    const resultat = await gem({
      sti: path(`ressourceHardware/${hardwareArt}/${id}`), data,
      foer: eksisterendeHardware || null, objekt: "ressourceHardware", objektId: `${hardwareArt}/${id}`,
      handling: eksisterendeHardware ? AUDIT.aendre : AUDIT.opret,
    });
    setGemmer(false); setSvar(resultat);
    if (resultat.ok) { setEnhed(tomHardware); hardware.genindlaes(); }
  };

  if ((visKategorier && kategorier.henter) || (hardwareArt && hardware.henter)) return <Henter hvad="ressourceindstillingerne" />;
  if (visKategorier && kategorier.fejl) return <Datatilstand tilstand={kategorier.tilstand} genprov={kategorier.genindlaes} />;

  return <div className="fc-grid" style={{ gap: 16 }}>
    {visKategorier ? <>
    <Kort titel={`${titel} – kundedefinerede kategorier`} handling={<Knap onClick={() => setKategori(tomKategori)}>Ny kategori</Knap>}>
      <p className="fc-hint">Kategorier har stabile ID'er og deaktiveres i stedet for at blive slettet. Eksisterende ressourcer og historik beholder derfor deres reference. Vælg en række for at redigere den.</p>
      <Tabel
        kolonner={[
          { key: "navn", label: "Kategori", render: (post) => <><b>{post.navn}</b><br /><small>{post.id}</small></> },
          { key: "sortering", label: "Sortering" },
          { key: "status", label: "Status", render: (post) => <Pille tone={post.aktiv === false ? "neutral" : "ok"}>{post.aktiv === false ? "Inaktiv" : "Aktiv"}</Pille> },
          { key: "handling", label: "Handling", render: (post) => <Knap disabled={gemmer} onClick={() => skiftKategori(post)}>{post.aktiv === false ? "Genaktivér" : "Deaktivér"}</Knap> },
        ]}
        raekker={kategorier.data}
        paaRaekke={setKategori}
        erValgt={(post) => post.id === kategori.id}
        tom="Ingen kategorier er oprettet endnu."
      />
    </Kort>
    <Kort titel={kategori.id ? `Redigér ${kategori.navn}` : "Opret kategori"}>
      <form className="fc-form-grid" onSubmit={gemKategori}><label className="fc-felt"><span>Navn</span><input value={kategori.navn} maxLength="80" onChange={(e) => setKategori({ ...kategori, navn: e.target.value })} /></label><label className="fc-felt"><span>Sorteringsrækkefølge</span><input type="number" min="0" max="9999" value={kategori.sortering} onChange={(e) => setKategori({ ...kategori, sortering: e.target.value })} /><small className="fc-felt-hint">Lavere tal vises først. 100 er standardværdien.</small></label><div><Knap type="submit" disabled={gemmer}>{gemmer ? "Gemmer …" : "Gem kategori"}</Knap></div></form>
    </Kort>
    </> : null}
    {hardwareArt ? <>
      <Kort titel={`${hardwareArt.toUpperCase()}-hardware`} handling={<Knap onClick={() => setEnhed(tomHardware)}>Registrér hardware</Knap>}>
        <p className="fc-hint">Kun interne hardwareoplysninger registreres. Ingen ekstern tjeneste aktiveres. Tilknytninger ændres atomisk fra ressourceformularen. Vælg en række for at redigere den.</p>
        <Tabel
          kolonner={[
            { key: "serienummer", label: "Serienummer", render: (post) => <><b>{post.serienummer}</b><br /><small>{post.id}</small></> },
            { key: "model", label: "Model", render: (post) => [post.leverandoer, post.model].filter(Boolean).join(" · ") || "—" },
            { key: "status", label: "Status", render: (post) => <Pille tone={post.status === "aktiv" ? "ok" : "neutral"}>{post.status === "aktiv" ? "Aktiv" : "Inaktiv"}</Pille> },
            { key: "tilknytning", label: "Tilknytning", render: (post) => post.tilknytning?.ressourceId || "Ledig" },
            { key: "aabn", label: "", render: () => <span className="fc-a" aria-hidden="true">Åbn ›</span> },
          ]}
          raekker={hardware.data}
          paaRaekke={setEnhed}
          erValgt={(post) => post.id === enhed.id}
          tom={`Ingen ${hardwareArt.toUpperCase()}-enheder er registreret.`}
        />
      </Kort>
      <Kort titel={enhed.id ? `Redigér ${enhed.serienummer}` : `Registrér ${hardwareArt.toUpperCase()}`}>
        <form className="fc-form-grid" onSubmit={gemHardware}><label className="fc-felt"><span>Serienummer</span><input value={enhed.serienummer} maxLength="100" onChange={(e) => setEnhed({ ...enhed, serienummer: e.target.value })} /></label><label className="fc-felt"><span>Leverandør</span><input value={enhed.leverandoer || ""} maxLength="100" onChange={(e) => setEnhed({ ...enhed, leverandoer: e.target.value })} /></label><label className="fc-felt"><span>Model</span><input value={enhed.model || ""} maxLength="100" onChange={(e) => setEnhed({ ...enhed, model: e.target.value })} /></label><label className="fc-felt"><span>Status</span><select value={enhed.status} disabled={Boolean(enhed.tilknytning?.ressourceId)} onChange={(e) => setEnhed({ ...enhed, status: e.target.value })}><option value="aktiv">Aktiv</option><option value="inaktiv">Inaktiv</option></select></label><div><Knap type="submit" disabled={gemmer}>{gemmer ? "Gemmer …" : "Gem hardware"}</Knap></div></form>
      </Kort>
    </> : null}
    {children}
    {svar?.besked ? <p className="fc-advarsel" role="status">{svar.besked}</p> : null}
    {svar?.ok ? <p className="fc-succes" role="status">Ændringen er gemt.</p> : null}
  </div>;
}
