import { useEffect, useState } from "react";
import { Felt, Knap, Kort, Pille, Tabel } from "../../fleet/ui.jsx";
import { gemVidenspost, hentSalgsplatform } from "../../fleet/ejer-salgsindbakke.js";

const STATUS = { tilgaengelig: "Tilgængelig", under_udvikling: "Under udvikling", saerskilt_aftale: "Kræver særskilt aftale" };
const tom = { titel: "", indhold: "", kilde: "", leveringsstatus: "tilgaengelig", godkendt: false };

export default function EjerVidensbase() {
  const [data, setData] = useState({}); const [f, setF] = useState(tom); const [valgt, setValgt] = useState(null); const [svar, setSvar] = useState(null); const [arbejder, setArbejder] = useState(false);
  const indlaes = async () => setData((await hentSalgsplatform()).viden || {});
  useEffect(() => { indlaes(); }, []);
  const liste = Object.entries(data).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.opdateretMs || 0) - (a.opdateretMs || 0));
  const rediger = (v) => { setValgt(v); setF({ titel: v.titel || "", indhold: v.indhold || "", kilde: v.kilde || "", leveringsstatus: v.leveringsstatus || "tilgaengelig", godkendt: v.godkendt === true }); };
  const gem = async () => { setArbejder(true); const r = await gemVidenspost({ ...f, id: valgt?.id, forventetRevision: valgt?.revision || 0 }); setArbejder(false); setSvar(r); if (r.ok) { await indlaes(); setValgt(null); setF(tom); } };
  return <div className="fc-grid ejer-kundelayout"><Kort titel="Godkendt Veyro-viden"><p className="fc-hint">Kun eksplicit godkendte versioner må bruges af assistenten. Kilde og leveringsstatus følger hvert snapshot.</p><Tabel raekker={liste} paaRaekke={rediger} kolonner={[{ noegle: "titel", titel: "Titel" }, { titel: "Levering", render: (r) => <Pille>{STATUS[r.leveringsstatus]}</Pille> }, { titel: "Version", render: (r) => `v${r.aktuelVersion || 0}` }, { titel: "AI", render: (r) => r.godkendt ? "Godkendt" : "Ikke godkendt" }]} tom="Vidensbasen er tom." /></Kort><Kort titel={valgt ? "Ny version" : "Ny videnspost"}><Felt id="viden-titel" label="Titel" vaerdi={f.titel} saet={(v) => setF({ ...f, titel: v })} /><Felt id="viden-tekst" label="Godkendt beskrivelse / standardtekst" vaerdi={f.indhold} saet={(v) => setF({ ...f, indhold: v })} multiline /><Felt id="viden-kilde" label="Kilde" vaerdi={f.kilde} saet={(v) => setF({ ...f, kilde: v })} hint="Fx produktbeslutning, fil eller godkendt mødenote." /><Felt id="viden-status" label="Leveringsstatus" vaerdi={f.leveringsstatus} saet={(v) => setF({ ...f, leveringsstatus: v })} valgmuligheder={Object.entries(STATUS).map(([vaerdi, label]) => ({ vaerdi, label }))} /><label className="fc-check"><input type="checkbox" checked={f.godkendt} onChange={(e) => setF({ ...f, godkendt: e.target.checked })} /> Godkend denne version til AI-kontekst</label><div className="fc-actions"><Knap variant="primaer" onClick={gem} disabled={arbejder || !f.titel || !f.indhold || !f.kilde}>Gem uforanderlig version</Knap>{valgt && <Knap onClick={() => { setValgt(null); setF(tom); }}>Annullér</Knap>}</div>{svar && !svar.ok && <p className="fc-fejltekst">{svar.besked}</p>}</Kort></div>;
}

