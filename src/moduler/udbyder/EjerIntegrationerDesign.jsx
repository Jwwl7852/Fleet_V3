import { useEffect, useState } from "react";
import { hentSalgsplatform, synkroniserMicrosoft365 } from "../../fleet/ejer-salgsindbakke.js";
import EjerIkon from "./EjerIkon.jsx";

function Status({ aktiv }) { return <span className={`ejer-forbindelse-status ${aktiv ? "aktiv" : "ikke"}`}>{aktiv ? "Tilsluttet" : "Ikke tilsluttet"}</span>; }
function Funktionsliste({ children }) { return <div className="ejer-integrationsfunktioner"><small>Funktioner</small>{children}</div>; }
function Punkt({ children, aktiv = false }) { return <p><span>{aktiv ? "✓" : "○"}</span>{children}<small>{aktiv ? "Aktiv" : "Tilgængelig efter tilslutning"}</small></p>; }

const OPSAETNING = {
  "Microsoft 365": [
    "Bekræft om info@veyrosystems.com er delt postkasse, selvstændig postkasse eller alias.",
    "Registrér Microsoft Entra-applikation og giv kun de nødvendige Graph-rettigheder til den underliggende postkasse.",
    "Kontrollér Inbox og Sendt post i test. Aktivér først efter godkendt prøve; ingen ny postkasse oprettes automatisk.",
  ],
  OpenAI: [
    "Gem API-nøglen som serverhemmelighed; den må aldrig sendes til browseren.",
    "Vælg model og fastsæt den håndhævede månedlige grænse for kald og tokens.",
    "Kør med syntetisk sag og godkendt Veyro-viden, før ekstern behandling aktiveres.",
  ],
  Dinero: [
    "Vælg en særskilt testorganisation og gem API-oplysninger servermæssigt.",
    "Kontrollér kunder, varer, fakturaer, kreditnotaer og betalinger med testadapteren først.",
    "Aktivér ikke bogføring eller udsendelse, før testorganisationen er verificeret.",
  ],
  "Indgående bilagsmail": ["Opret og verificér en dedikeret bilagsadresse.", "Kontrollér dubletnøgler og afsenderregler med syntetiske mails."],
  OCR: ["Vælg leverandør og databehandlergrundlag.", "Kontrollér aflæsning og fejlflow med syntetiske bilag."],
};

export default function EjerIntegrationerDesign() {
  const [data,setData]=useState(null); const [besked,setBesked]=useState(""); const [valgt,setValgt]=useState(""); const hent=async()=>setData(await hentSalgsplatform());
  useEffect(()=>{hent();},[]); const m=data?.integrationer?.microsoft365||{}; const ai=data?.integrationer?.openai||{};
  const forklar=(navn)=>{setValgt(navn);setBesked(`${navn} er ikke tilsluttet. Nedenfor vises de konkrete trin; ingen forbindelse eller ekstern handling aktiveres her.`);};
  const synk=async()=>{const r=await synkroniserMicrosoft365();setBesked(r.ok?"Synkronisering gennemført.":r.besked);if(r.ok)await hent();};
  return <div className="ejer-integrationer-design">
    <section className="ejer-integrationskort"><header><span className="m365-logo"><i/><i/><i/><i/></span><h2>Microsoft 365<small>E-mail og kalender</small></h2><Status aktiv={m.status==="aktiv"}/></header><dl><div><dt>Valgt salgsadresse</dt><dd>info@veyrosystems.com</dd></div><div><dt>Postkassetype</dt><dd>{m.mailboxType||"Afventer kontrol"}</dd></div></dl><Funktionsliste><Punkt aktiv={m.status==="aktiv"}>Indbakke og Outlook-historik</Punkt><Punkt aktiv={m.status==="aktiv"}>Tilbud og kundesvar</Punkt></Funktionsliste><button type="button" className="ejer-primaer" onClick={m.status==="aktiv"?synk:()=>forklar("Microsoft 365")}><EjerIkon navn="link" size={19}/>{m.status==="aktiv"?"Synkronisér nu":"Opsæt forbindelse"}</button></section>
    <section className="ejer-integrationskort"><header><span className="openai-logo">◎</span><h2>OpenAI · Veyro-assistent<small>AI til tekster og analyser</small></h2><Status aktiv={ai.status==="aktiv"}/></header><dl><div><dt>Model</dt><dd>{ai.model||"Ikke valgt"}</dd></div><div><dt>API-adgang</dt><dd>{ai.status==="aktiv"?"Serverkonfigureret":"Ikke konfigureret"}</dd></div><div><dt>Månedlig forbrugsgrænse</dt><dd>{ai.graense?.requests?`${ai.graense.requests} kald`:"Ikke fastsat"}</dd></div></dl><Funktionsliste><Punkt>Udkast til svar og tilbud</Punkt><Punkt>Opsummering af kundedialoger</Punkt><Punkt>Analyse og indsigt (beta)</Punkt></Funktionsliste><button type="button" className="ejer-primaer" onClick={()=>forklar("OpenAI")}><EjerIkon navn="sparkles" size={19}/>Opsæt AI</button></section>
    <section className="ejer-integrationskort"><header><span className="dinero-logo">d</span><h2>Dinero Pro<small>Regnskab og fakturering</small></h2><Status aktiv={false}/></header><dl><div><dt>Testorganisation</dt><dd>Ikke valgt</dd></div></dl><Funktionsliste><Punkt>Fakturaer, kreditnotaer og betalinger</Punkt><Punkt>Kunder og varer</Punkt><Punkt>Synkronisering af økonomidata</Punkt></Funktionsliste><button type="button" className="ejer-primaer" onClick={()=>forklar("Dinero")}><EjerIkon navn="link" size={19}/>Opsæt Dinero</button></section>
    <section className="ejer-design-kort ejer-bilagsmodtagelse"><h2>Bilagsmodtagelse</h2><p>Sådan modtager og behandler vi bilag fra dine leverandører</p>{[
      ["document","Filvalg og drag & drop","Lokal arbejdsgang","Træk og slip PDF, billeder eller andre filer i bilagsindbakken."],
      ["mail","Indgående bilagsmail","Opsætning mangler","Vi opretter en dedikeret e-mailadresse til dine leverandører."],
      ["search","OCR","Leverandør ikke valgt","Vælg OCR-leverandør for automatisk læsning af bilag."],
    ].map(([ikon,titel,status,tekst])=><button type="button" key={titel} onClick={()=>titel.startsWith("Fil")?location.assign("/main/oekonomi/bilag"):forklar(titel)}><EjerIkon navn={ikon} size={27}/><span><b>{titel}</b><small>{titel.startsWith("Fil")?"Upload bilag manuelt i systemet":titel.startsWith("Ind")?"Modtag bilag via e-mail":"Automatisk aflæsning af bilag"}</small></span><em>{status}</em><p>{tekst}</p><EjerIkon navn="chevron" size={19}/></button>)}</section>
    <section className="ejer-design-kort ejer-aktivering"><h2>Før aktivering</h2><p>Følg disse trin for en sikker og stabil opsætning</p><div>{[["1","Vælg testforbindelse","Start med én integration ad gangen i test."],["2","Gennemfør kontrolleret prøve","Tjek at data hentes og vises korrekt."],["3","Aktivér efter godkendelse","Når alt er testet, kan forbindelsen aktiveres."]].map(([nr,t,s])=><span key={nr}><i>{nr}</i><b>{t}</b><small>{s}</small></span>)}</div></section>
    {besked&&<section className="ejer-design-kort ejer-integration-opsaetning" role="status"><header><h2>Opsætning · {valgt}</h2><button type="button" onClick={()=>{setValgt("");setBesked("");}} aria-label="Luk opsætningsvejledning">×</button></header><p>{besked}</p><ol>{(OPSAETNING[valgt]||[]).map((trin)=><li key={trin}>{trin}</li>)}</ol><p className="fc-hint">Credentials og hemmeligheder skal tilføjes servermæssigt. Denne lokale ejerbrowser viser eller gemmer dem ikke.</p></section>}
  </div>;
}
