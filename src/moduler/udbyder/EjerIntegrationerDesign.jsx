import { useEffect, useState } from "react";
import { hentSalgsplatform, synkroniserMicrosoft365 } from "../../fleet/ejer-salgsindbakke.js";
import EjerIkon from "./EjerIkon.jsx";

function Status({ aktiv }) { return <span className={`ejer-forbindelse-status ${aktiv ? "aktiv" : "ikke"}`}>{aktiv ? "Tilsluttet" : "Ikke tilsluttet"}</span>; }
function Funktionsliste({ children }) { return <div className="ejer-integrationsfunktioner"><small>Funktioner</small>{children}</div>; }
function Punkt({ children }) { return <p><span>✓</span>{children}</p>; }

export default function EjerIntegrationerDesign() {
  const [data,setData]=useState(null); const [besked,setBesked]=useState(""); const hent=async()=>setData(await hentSalgsplatform());
  useEffect(()=>{hent();},[]); const m=data?.integrationer?.microsoft365||{}; const ai=data?.integrationer?.openai||{};
  const forklar=(navn)=>setBesked(`${navn} kan konfigureres, når de servermæssige credentials og den godkendte testforbindelse foreligger. Ingen forbindelse er aktiveret nu.`);
  const synk=async()=>{const r=await synkroniserMicrosoft365();setBesked(r.ok?"Synkronisering gennemført.":r.besked);if(r.ok)await hent();};
  return <div className="ejer-integrationer-design">
    <section className="ejer-integrationskort"><header><span className="m365-logo"><i/><i/><i/><i/></span><h2>Microsoft 365<small>E-mail og kalender</small></h2><Status aktiv={m.status==="aktiv"}/></header><dl><div><dt>Valgt salgsadresse</dt><dd>info@veyrosystems.com</dd></div><div><dt>Postkassetype</dt><dd>{m.mailboxType||"Afventer kontrol"}</dd></div></dl><Funktionsliste><Punkt>Indbakke og Outlook-historik</Punkt><Punkt>Tilbud og kundesvar</Punkt></Funktionsliste><button type="button" className="ejer-primaer" onClick={m.status==="aktiv"?synk:()=>forklar("Microsoft 365")}><EjerIkon navn="link" size={19}/>{m.status==="aktiv"?"Synkronisér nu":"Opsæt forbindelse"}</button></section>
    <section className="ejer-integrationskort"><header><span className="openai-logo">◎</span><h2>OpenAI · Veyro-assistent<small>AI til tekster og analyser</small></h2><Status aktiv={ai.status==="aktiv"}/></header><dl><div><dt>Model</dt><dd>{ai.model||"Ikke valgt"}</dd></div><div><dt>API-adgang</dt><dd>{ai.status==="aktiv"?"Serverkonfigureret":"Ikke konfigureret"}</dd></div><div><dt>Månedlig forbrugsgrænse</dt><dd>{ai.graense?.requests?`${ai.graense.requests} kald`:"Ikke fastsat"}</dd></div></dl><Funktionsliste><Punkt>Udkast til svar og tilbud</Punkt><Punkt>Opsummering af kundedialoger</Punkt><Punkt>Analyse og indsigt (beta)</Punkt></Funktionsliste><button type="button" className="ejer-primaer" onClick={()=>forklar("OpenAI")}><EjerIkon navn="sparkles" size={19}/>Opsæt AI</button></section>
    <section className="ejer-integrationskort"><header><span className="dinero-logo">d</span><h2>Dinero Pro<small>Regnskab og fakturering</small></h2><Status aktiv={false}/></header><dl><div><dt>Testorganisation</dt><dd>Ikke valgt</dd></div></dl><Funktionsliste><Punkt>Fakturaer, kreditnotaer og betalinger</Punkt><Punkt>Kunder og varer</Punkt><Punkt>Synkronisering af økonomidata</Punkt></Funktionsliste><button type="button" className="ejer-primaer" onClick={()=>forklar("Dinero")}><EjerIkon navn="link" size={19}/>Opsæt Dinero</button></section>
    <section className="ejer-design-kort ejer-bilagsmodtagelse"><h2>Bilagsmodtagelse</h2><p>Sådan modtager og behandler vi bilag fra dine leverandører</p>{[
      ["document","Filvalg og drag & drop","Lokal arbejdsgang","Træk og slip PDF, billeder eller andre filer i bilagsindbakken."],
      ["mail","Indgående bilagsmail","Opsætning mangler","Vi opretter en dedikeret e-mailadresse til dine leverandører."],
      ["search","OCR","Leverandør ikke valgt","Vælg OCR-leverandør for automatisk læsning af bilag."],
    ].map(([ikon,titel,status,tekst])=><button type="button" key={titel} onClick={()=>titel.startsWith("Fil")?location.assign("/main/oekonomi/bilag"):forklar(titel)}><EjerIkon navn={ikon} size={27}/><span><b>{titel}</b><small>{titel.startsWith("Fil")?"Upload bilag manuelt i systemet":titel.startsWith("Ind")?"Modtag bilag via e-mail":"Automatisk aflæsning af bilag"}</small></span><em>{status}</em><p>{tekst}</p><EjerIkon navn="chevron" size={19}/></button>)}</section>
    <section className="ejer-design-kort ejer-aktivering"><h2>Før aktivering</h2><p>Følg disse trin for en sikker og stabil opsætning</p><div>{[["1","Vælg testforbindelse","Start med én integration ad gangen i test."],["2","Gennemfør kontrolleret prøve","Tjek at data hentes og vises korrekt."],["3","Aktivér efter godkendelse","Når alt er testet, kan forbindelsen aktiveres."]].map(([nr,t,s])=><span key={nr}><i>{nr}</i><b>{t}</b><small>{s}</small></span>)}</div></section>
    {besked&&<p className="ejer-integrationbesked" role="status">{besked}</p>}
  </div>;
}
