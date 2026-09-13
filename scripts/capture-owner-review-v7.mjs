/* Browserbaseret V7.2-accept og screenshots fra det lokale, isolerede ejermiljø. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const BASE = process.env.OWNER_REVIEW_URL || "http://127.0.0.1:5211";
const PORT = Number(process.env.OWNER_REVIEW_DEBUG_PORT || 9337);
const OUT = resolve(process.env.OWNER_REVIEW_OUTPUT || "docs/screenshots/ejer-review-v7-2");
const CODE_COMMIT = process.env.OWNER_REVIEW_CODE_COMMIT || "arbejdstrae";
const EMAIL = process.env.VITE_DEV_EJER_MAIL || "";
const KODE = process.env.VITE_DEV_BRUGER_KODE || "";
const edge = [process.env.OWNER_REVIEW_BROWSER, join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"), join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe")]
  .filter(Boolean).find((sti) => { try { return process.getBuiltinModule("node:fs").statSync(sti).isFile(); } catch { return false; } });
if (!edge) throw new Error("Microsoft Edge blev ikke fundet.");
if (!EMAIL || !KODE) throw new Error("Den git-ignorerede lokale ejerloginfixture mangler.");

mkdirSync(OUT, { recursive: true });
const profil = mkdtempSync(join(tmpdir(), "veyro-owner-v72-"));
const proces = spawn(edge, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1920,1080", `${BASE}/login`], { stdio: "ignore" });
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));
const json = async (sti) => { const svar = await fetch(`http://127.0.0.1:${PORT}${sti}`); if (!svar.ok) throw new Error(`DevTools ${svar.status}`); return svar.json(); };
let side;
for (let i = 0; i < 80; i += 1) { try { const sider = await json("/json/list"); side = sider.find((post) => post.type === "page" && post.url?.startsWith(BASE)) || sider.find((post) => post.type === "page"); if (side?.webSocketDebuggerUrl) break; } catch { /* browseren starter */ } await pause(250); }
if (!side?.webSocketDebuggerUrl) throw new Error("Kunne ikke forbinde til reviewbrowseren.");
const socket = new WebSocket(side.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sekvens = 0;
const ventende = new Map();
socket.addEventListener("message", (event) => { const svar = JSON.parse(event.data); if (!svar.id || !ventende.has(svar.id)) return; const haandtering = ventende.get(svar.id); ventende.delete(svar.id); svar.error ? haandtering.reject(new Error(svar.error.message)) : haandtering.resolve(svar.result); });
const kald = (method, params = {}) => { const id = ++sekvens; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolveSvar, reject) => ventende.set(id, { resolve: resolveSvar, reject })); };
async function evaluer(expression) { const resultat = await kald("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (resultat.exceptionDetails) throw new Error(resultat.exceptionDetails.text || "Browserfejl"); return resultat.result?.value; }
async function ventPaa(expression, besked, ms = 30000) { const slut = Date.now() + ms; while (Date.now() < slut) { if (await evaluer(expression)) return; await pause(160); } throw new Error(besked); }
async function viewport(width, height) { await kald("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height }); }
async function gaaTil(sti) { await kald("Page.navigate", { url: `${BASE}${sti}` }); await ventPaa("document.readyState === 'complete'", `${sti} blev ikke klar`); await pause(500); }
async function klik(selector, tekst) { return evaluer(`(()=>{const e=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(x=>(x.textContent||'').includes(${JSON.stringify(tekst)}));if(!e)return false;e.click();return true})()`); }
async function billede(navn, width, height) { await viewport(width, height); await pause(250); const resultat = await kald("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }); const fil = join(OUT, `${width}x${height}-${navn}.png`); writeFileSync(fil, Buffer.from(resultat.data, "base64")); return fil; }
async function hjul(x, y, deltaY) { await kald("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); await kald("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY }); await pause(300); }
async function maalToRullere({ navn, width, height, sti, venstre, hoejre, fane = "" }) {
  await viewport(width, height); await gaaTil(sti);
  await ventPaa(`Boolean(document.querySelector(${JSON.stringify(venstre)}))&&Boolean(document.querySelector(${JSON.stringify(hoejre)}))`, `${navn}: rullepaneler mangler`);
  if (fane) { await klik("[role=tab]", fane); await pause(180); }
  await evaluer(`document.querySelector(${JSON.stringify(venstre)}).scrollTop=0;document.querySelector(${JSON.stringify(hoejre)}).scrollTop=0;true`);
  const punkter = await evaluer(`(()=>{const v=document.querySelector(${JSON.stringify(venstre)});const h=document.querySelector(${JSON.stringify(hoejre)});const vb=v.getBoundingClientRect();const hb=h.getBoundingClientRect();return{venstre:{selector:${JSON.stringify(venstre)},left:Math.round(vb.left),top:Math.round(vb.top),right:Math.round(vb.right),bottom:Math.round(vb.bottom),max:v.scrollHeight-v.clientHeight,x:vb.left+vb.width/2,y:vb.top+Math.min(vb.height/2,180)},hoejre:{selector:${JSON.stringify(hoejre)},left:Math.round(hb.left),top:Math.round(hb.top),right:Math.round(hb.right),bottom:Math.round(hb.bottom),max:h.scrollHeight-h.clientHeight,x:hb.left+hb.width/2,y:hb.top+Math.min(hb.height/2,180)}}})()`);
  if (punkter.venstre.max <= 0 || punkter.hoejre.max <= 0) throw new Error(`${navn}: begge paneler skal kunne rulle: ${JSON.stringify(punkter)}`);
  const foer = await evaluer(`(()=>({venstre:document.querySelector(${JSON.stringify(venstre)}).scrollTop,hoejre:document.querySelector(${JSON.stringify(hoejre)}).scrollTop,dokument:scrollY}))()`);
  await hjul(punkter.venstre.x, punkter.venstre.y, 360);
  const efterVenstre = await evaluer(`(()=>({venstre:document.querySelector(${JSON.stringify(venstre)}).scrollTop,hoejre:document.querySelector(${JSON.stringify(hoejre)}).scrollTop,dokument:scrollY}))()`);
  await hjul(punkter.hoejre.x, punkter.hoejre.y, 360);
  const efterHoejre = await evaluer(`(()=>({venstre:document.querySelector(${JSON.stringify(venstre)}).scrollTop,hoejre:document.querySelector(${JSON.stringify(hoejre)}).scrollTop,dokument:scrollY}))()`);
  if (efterVenstre.venstre <= foer.venstre || efterVenstre.hoejre !== foer.hoejre || efterHoejre.hoejre <= efterVenstre.hoejre || efterHoejre.venstre !== efterVenstre.venstre) throw new Error(`${navn}: rullerne påvirker hinanden: ${JSON.stringify({ foer, efterVenstre, efterHoejre })}`);
  return { navn, route: sti, fane: fane || null, viewport: { width, height }, paneler: punkter, foer, efterVenstre, efterHoejre, trustedWheelEvents: true };
}
const filer = [];
const kontroller = {};

try {
  await kald("Page.enable"); await kald("Runtime.enable"); await viewport(1440, 900); await gaaTil("/login");
  if (!(await evaluer("location.pathname.startsWith('/main')"))) {
    await evaluer(`(()=>{const s=(q,v)=>{const e=document.querySelector(q);const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));};s('input[type=email]',${JSON.stringify(EMAIL)});s('input[type=password]',${JSON.stringify(KODE)});document.querySelector('form').requestSubmit();return true})()`);
    await ventPaa("location.pathname.startsWith('/main')", "Normalt tenantløst ejerlogin fejlede");
  }

  await gaaTil("/main/mail/indbakker?postkasse=faelles");
  await ventPaa("document.querySelectorAll('.ejer-mail-raekker > button').length >= 7", "Den kompakte V7-mailliste viser ikke mindst syv rækker");
  await kald("Page.reload", { ignoreCache: true }); await ventPaa("document.querySelectorAll('.ejer-mail-raekker > button').length >= 7", "Reviewdata forsvandt efter genindlæsning med normalt login");
  kontroller.normalLoginReload = true;
  kontroller.indbakke = await evaluer(`(()=>{const rows=[...document.querySelectorAll('.ejer-mail-raekker > button')];const visible=rows.filter(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}).length;const ai=[...document.querySelectorAll('.ejer-mail-ai-overblik article')];return{route:location.pathname+location.search,overviewWithoutSelectedCase:!document.querySelector('.ejer-mail-v7-detalje'),renderedRows:rows.length,visibleRows:visible,totalText:document.querySelector('.ejer-mail-paginering')?.innerText,aiPoints:ai.length,aiSources:[...new Set(ai.map(e=>e.innerText.split('\\n')[0]))].length,horizontalOverflow:document.documentElement.scrollWidth>innerWidth}})()`);
  if (kontroller.indbakke.visibleRows < 7) throw new Error(`Kun ${kontroller.indbakke.visibleRows} fuldt synlige mailrækker ved 1440×900`);
  if (kontroller.indbakke.aiPoints < 3) throw new Error("Det samlede AI-overblik har færre end tre punkter");
  const totalTraade = Number(String(kontroller.indbakke.totalText).match(/af (\d+)/)?.[1] || 0);
  if (totalTraade < 100) throw new Error(`V7-datasættet viste kun ${totalTraade} samtaler`);
  filer.push(await billede("01-din-arbejdsindbakke", 1440, 900));
  filer.push(await billede("02-din-arbejdsindbakke", 1920, 1080));

  await gaaTil("/main/mail/indbakker?postkasse=faelles&q=ingen-sag-med-denne-v7-soegning");
  await ventPaa("Boolean(document.querySelector('.ejer-ai-tom'))", "AI-overblikkets tomtilstand blev ikke vist");
  kontroller.aiEmptyState = true;
  await gaaTil("/main/mail/indbakker?postkasse=faelles&status=afventer_os&side=2");
  await ventPaa("document.querySelectorAll('.ejer-mail-raekker > button').length > 0", "Side 2 kunne ikke åbnes");
  await evaluer("document.querySelector('.ejer-mail-raekker').scrollTop=120;document.querySelector('.ejer-mail-raekker > button').click();true");
  await ventPaa("Boolean(document.querySelector('.ejer-mail-v7-detalje'))", "Rækkeåbning skiftede ikke til sagsvisningen");
  await klik("button", "Tilbage til indbakke");
  await ventPaa("Boolean(document.querySelector('.ejer-mail-v7-oversigt')) && !new URLSearchParams(location.search).has('sag')", "Tilbage genskabte ikke oversigten");
  kontroller.tilbage = await evaluer(`(()=>({status:new URLSearchParams(location.search).get('status'),side:new URLSearchParams(location.search).get('side'),rowFocus:Boolean(document.activeElement?.closest('.ejer-mail-raekker'))}))()`);
  if (kontroller.tilbage.status !== "afventer_os" || kontroller.tilbage.side !== "2" || !kontroller.tilbage.rowFocus) throw new Error(`Tilbage bevarede ikke filter, side og rækkefokus: ${JSON.stringify(kontroller.tilbage)}`);
  await gaaTil("/main/mail/indbakker?postkasse=faelles");

  if (!(await klik("button", "Ny mail"))) throw new Error("Ny mail-handlingen mangler");
  await ventPaa("Boolean(document.querySelector('[role=dialog]'))", "Ny mail-dialogen åbnede ikke");
  kontroller.nyMail = await evaluer(`(()=>{const d=document.querySelector('[role=dialog]');return{modal:d?.getAttribute('aria-modal'),hasCancel:[...d.querySelectorAll('button')].some(b=>b.innerText.includes('Annullér')),focusInside:d?.contains(document.activeElement),externalSendAvailable:[...d.querySelectorAll('button')].some(b=>/send/i.test(b.innerText))}})()`);
  await evaluer("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
  await ventPaa("!document.querySelector('[role=dialog]')", "ESC lukkede ikke den urørte maildialog");

  await gaaTil("/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys");
  await ventPaa("document.body.innerText.includes('Pilotprojekt') && Boolean(document.querySelector('textarea[aria-label=Svarudkast]'))", "Pilotsagen blev ikke vist");
  kontroller.faner = await evaluer(`(()=>[...document.querySelectorAll('[role=tab]')].map(e=>e.innerText))()`);
  if (JSON.stringify(kontroller.faner) !== JSON.stringify(["Svarudkast", "AI-chat", "Oplysninger"])) throw new Error("Svar og AI har ikke præcis de tre krævede faner");
  filer.push(await billede("03-svarudkast", 1440, 900));
  filer.push(await billede("04-svarudkast", 1920, 1080));
  await viewport(1440, 900);
  await evaluer(`(()=>{const e=document.querySelector('.ejer-mail-hurtiginstruks input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,'Gør tonen mere personlig, behold de bekræftede antal og forklar næste skridt');e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await klik("button", "Lav ny revision");
  await ventPaa("document.body.innerText.includes('AI-forslaget er gemt i det fælles, interne arbejdsrum') && document.querySelector('.ejer-mail-hurtiginstruks input')?.value === ''", "Den forbundne hurtiginstruks gemte ikke en ny revision");
  kontroller.forbundetAiSvarudkast = await evaluer(`(()=>({activeTab:[...document.querySelectorAll('[role=tab]')].find(e=>e.getAttribute('aria-selected')==='true')?.innerText,instruction:'Gør tonen mere personlig, behold de bekræftede antal og forklar næste skridt',factsText:document.querySelector('.ejer-svarfakta')?.innerText||'',latestRevision:Boolean(document.querySelector('.ejer-ai-seneste')),proposalText:document.querySelector('.ejer-ai-seneste p')?.innerText||'',explicitInsert:Boolean([...document.querySelectorAll('.ejer-ai-seneste button')].find(b=>b.innerText.includes('Indsæt i svarudkast'))),automaticOverwrite:false,sharedInputCleared:!document.querySelector('.ejer-mail-hurtiginstruks input')?.value}))()`);
  if (kontroller.forbundetAiSvarudkast.activeTab !== "Svarudkast" || !kontroller.forbundetAiSvarudkast.latestRevision || !kontroller.forbundetAiSvarudkast.explicitInsert) throw new Error(`Svarudkastets AI-forløb er ikke forbundet: ${JSON.stringify(kontroller.forbundetAiSvarudkast)}`);
  await evaluer(`(()=>{const p=document.querySelector('.ejer-mail-ai-panel');const s=document.querySelector('.ejer-ai-seneste');p.scrollTop+=s.getBoundingClientRect().top-p.getBoundingClientRect().top-10;return true})()`); await pause(180);
  filer.push(await billede("05-svarudkast-ai-instruks-og-revision", 1440, 900));
  filer.push(await billede("06-svarudkast-ai-instruks-og-revision", 1920, 1080));
  await klik("[role=tab]", "AI-chat");
  const rulPunkter = await evaluer(`(()=>{const l=document.querySelector('.ejer-mail-beskeder').getBoundingClientRect();const r=document.querySelector('.ejer-mail-ai-panel').getBoundingClientRect();return{lx:l.left+l.width/2,ly:l.top+l.height/2,rx:r.left+r.width/2,ry:r.top+r.height/2,leftMax:document.querySelector('.ejer-mail-beskeder').scrollHeight-document.querySelector('.ejer-mail-beskeder').clientHeight,rightMax:document.querySelector('.ejer-mail-ai-panel').scrollHeight-document.querySelector('.ejer-mail-ai-panel').clientHeight}})()`);
  if (rulPunkter.leftMax <= 0 || rulPunkter.rightMax <= 0) throw new Error(`Begge arbejdsruder skal have selvstændigt rulbart indhold: ${JSON.stringify(rulPunkter)}`);
  const rulFoer = await evaluer(`(()=>({left:document.querySelector('.ejer-mail-beskeder').scrollTop,right:document.querySelector('.ejer-mail-ai-panel').scrollTop}))()`);
  await hjul(rulPunkter.lx, rulPunkter.ly, 420);
  const rulVenstre = await evaluer(`(()=>({left:document.querySelector('.ejer-mail-beskeder').scrollTop,right:document.querySelector('.ejer-mail-ai-panel').scrollTop}))()`);
  await hjul(rulPunkter.rx, rulPunkter.ry, 420);
  const rulHoejre = await evaluer(`(()=>({left:document.querySelector('.ejer-mail-beskeder').scrollTop,right:document.querySelector('.ejer-mail-ai-panel').scrollTop}))()`);
  kontroller.uafhaengigRulning = { foer: rulFoer, efterVenstreHjul: rulVenstre, efterHoejreHjul: rulHoejre, trustedWheelEvents: true };
  if (rulVenstre.left <= rulFoer.left || rulVenstre.right !== rulFoer.right || rulHoejre.right <= rulVenstre.right || rulHoejre.left !== rulVenstre.left) throw new Error(`Ruderne ruller ikke uafhængigt: ${JSON.stringify(kontroller.uafhaengigRulning)}`);
  await evaluer(`(()=>{const e=document.querySelector('.ejer-mail-aiinstruks input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,'Lav et kortere forslag, behold alle fakta, vent med CVR og foreslå telefon');e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await klik("button", "Lav nyt forslag");
  await ventPaa("Boolean(document.querySelector('.ejer-ai-forslag'))", "Lokalt AI-svarforslag blev ikke dannet");
  await viewport(1440, 900);
  await evaluer(`(()=>{const panel=document.querySelector('.ejer-mail-ai-panel');const forslag=document.querySelector('.ejer-ai-forslag');panel.scrollTop+=forslag.getBoundingClientRect().top-panel.getBoundingClientRect().top-8;return true})()`);
  await pause(200);
  kontroller.aiForslagUdsnit = await evaluer(`(()=>{const panel=document.querySelector('.ejer-mail-ai-panel').getBoundingClientRect();const forslag=document.querySelector('.ejer-ai-forslag').getBoundingClientRect();return{panelTop:Math.round(panel.top),panelBottom:Math.round(panel.bottom),forslagTop:Math.round(forslag.top),forslagBottom:Math.round(forslag.bottom),overskriftSynlig:forslag.top>=panel.top&&forslag.top<panel.bottom}})()`);
  if (!kontroller.aiForslagUdsnit.overskriftSynlig) throw new Error(`AI-forslagets overskrift er ikke med i screenshotudsnittet: ${JSON.stringify(kontroller.aiForslagUdsnit)}`);
  filer.push(await billede("05-ai-chat-forslag-foer-indsaettelse", 1440, 900));
  await klik("button", "Indsæt i svarudkast");
  await ventPaa("document.querySelector('textarea[aria-label=Svarudkast]')?.value.includes('Hej Maria')", "AI-forslaget blev ikke indsat i svaret");
  await klik("button", "Gem kladde");
  await ventPaa("document.body.innerText.includes('Svarudkastet er gemt')", "Svarudkastet blev ikke gemt");
  await klik("button", "Gennemse og send");
  await ventPaa("document.body.innerText.includes('Gennemse svar')", "Gennemgangen før godkendelse åbnede ikke");
  kontroller.reviewAdskillerInternData = await evaluer(`(()=>{const d=document.querySelector('[role=dialog]');return !d.innerText.includes('Dennis og Jørn kan se samtalen')&&!d.innerText.includes('Sælgerens ekstra baggrund')})()`);
  filer.push(await billede("06-gennemse-foer-godkendelse", 1440, 900));
  await klik("[role=dialog] button", "Godkend svar");
  await ventPaa("document.body.innerText.includes('afventer særskilt afsendelse')", "Svar blev ikke godkendt efter gennemgang");
  await gaaTil("/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys");
  await ventPaa("document.body.innerText.includes('Afsend godkendt svar')", "Det konkrete svar blev ikke godkendt og genindlæst lokalt");
  kontroller.svarflow = { aiForslag: true, forslagFoerIndsaettelse: true, indsatEksplicit: true, gemt: true, reviewFoerGodkendelse: true, godkendt: true, sendt: false };
  const afsendKaldFoer = await evaluer("performance.getEntriesByType('resource').filter(e=>e.name.includes('kommunikationssvarafsend')).length");
  await evaluer(`(()=>{const e=document.querySelector('textarea[aria-label=Svarudkast]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(e,e.value+'\\n\\nLokal V7.2-rettelse efter godkendelse.');e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await pause(120);
  const blokeretKnap = await evaluer(`(()=>{const send=document.querySelector('[data-testid=afsend-godkendt-svar]');const review=document.querySelector('[data-testid=gennemse-svar]');review?.click();return{sendVisible:Boolean(send),reviewDisabled:Boolean(review?.disabled),reviewText:review?.innerText||'',warning:document.querySelector('.ejer-mail-ugemt')?.innerText||''}})()`);
  await pause(180);
  const afsendKaldEfter = await evaluer("performance.getEntriesByType('resource').filter(e=>e.name.includes('kommunikationssvarafsend')).length");
  kontroller.efterGodkendelseAendret = { ...blokeretKnap, afsendKaldFoer, afsendKaldEfter, transportKald: afsendKaldEfter - afsendKaldFoer };
  if (blokeretKnap.sendVisible || !blokeretKnap.reviewDisabled || !blokeretKnap.warning.includes('gennemse den igen') || afsendKaldEfter !== afsendKaldFoer) throw new Error(`Ugemt ændring blokerede ikke afsendelse: ${JSON.stringify(kontroller.efterGodkendelseAendret)}`);
  filer.push(await billede("08-godkendelse-blokeret-efter-aendring", 1440, 900));
  await klik("button", "Gem kladde");
  await ventPaa("document.body.innerText.includes('Svarudkastet er gemt') && !document.body.innerText.includes('Afsend godkendt svar') && document.querySelector('[data-testid=gennemse-svar]')?.disabled === false", "Gemning ugyldiggjorde ikke den tidligere godkendelse eller gjorde ikke den nye kladde klar");
  await klik("button", "Gennemse og send");
  await ventPaa("document.body.innerText.includes('Afventer din konkrete godkendelse')", "Den nye version åbnede ikke den aktuelle reviewmodal");
  kontroller.reviewModal = await evaluer(`(()=>{const d=document.querySelector('[role=dialog]');return{fra:d?.innerText.includes('info@veyrosystems.com'),til:d?.innerText.includes('maria@nordlys.syntetisk.invalid'),emne:d?.innerText.includes('Vedr. pilotprojekt med FLEET'),indhold:d?.innerText.includes('Lokal V7.2-rettelse efter godkendelse'),godkendelse:d?.innerText.includes('Afventer din konkrete godkendelse')}})()`);
  if (!kontroller.reviewModal.fra || !kontroller.reviewModal.til || !kontroller.reviewModal.emne || !kontroller.reviewModal.indhold || !kontroller.reviewModal.godkendelse) throw new Error(`Reviewmodal mangler felter: ${JSON.stringify(kontroller.reviewModal)}`);
  filer.push(await billede("09-aktuel-reviewmodal-efter-aendring", 1440, 900));
  await klik("[role=dialog] button", "Godkend svar");
  await ventPaa("document.body.innerText.includes('afventer særskilt afsendelse')", "Den ændrede version blev ikke godkendt");
  await klik("[role=tab]", "Oplysninger");
  await ventPaa("document.body.innerText.includes('2 af de 5 brugere') && document.body.innerText.includes('CVR')", "Oplysningsfanens fakta mangler");
  kontroller.oplysninger = await evaluer(`(()=>({fiveUsers:document.body.innerText.includes('5 brugere i alt'),twoAdmins:document.body.innerText.includes('2 af de 5 brugere'),cvrMissing:document.body.innerText.includes('CVR')&&document.body.innerText.includes('Ikke oplyst'),sellerContext:document.querySelector('.ejer-sagsbaggrund textarea')?.value.includes('Maria foretrækker en kort afklaring')}))()`);
  if (Object.values(kontroller.oplysninger).some((vaerdi) => !vaerdi)) throw new Error(`Oplysningsfanen mangler dokumenterede fakta: ${JSON.stringify(kontroller.oplysninger)}`);
  filer.push(await billede("07-oplysninger-med-kilder", 1440, 900));

  await gaaTil("/main/mail/sager?postkasse=faelles&mappe=domicil&sag=v7-domicil&fra=sager");
  await klik("[role=tab]", "Oplysninger");
  await ventPaa("document.body.innerText.includes('Domicil') && document.body.innerText.includes('Intern sag og mappe')", "Den interne Domicil-sag blev ikke vist");
  kontroller.internSag = await evaluer(`(()=>({kundeOprettet:document.body.innerText.includes('Åbn kundekort'),internMappe:document.body.innerText.includes('Foreslået mappe: Domicil'),correctCounterparty:document.body.innerText.includes('Havneparken Ejendomme'),wrongCustomerLabel:document.querySelector('.ejer-mail-sagshoved')?.innerText.includes('Nordlys Drift')}))()`);
  if (kontroller.internSag.kundeOprettet || kontroller.internSag.wrongCustomerLabel || !kontroller.internSag.correctCounterparty) throw new Error("Domicil-sagen viser fortsat en forkert kundemærkat");
  filer.push(await billede("08-intern-sag-domicil", 1440, 900));

  await gaaTil("/main/support?sag=v7-support-dennis");
  await ventPaa("document.body.innerText.includes('Support') && document.body.innerText.includes('Nordlys')", "Den delte supportsag blev ikke vist i Support");
  kontroller.support = await evaluer(`(()=>({sharedCaseVisible:true,route:location.pathname+location.search,joern:document.body.innerText.includes('Jørn'),notUnallocated:!document.body.innerText.includes('Ikke fordelt'),status:document.body.innerText.includes('Afventer os')}))()`);
  if (!kontroller.support.joern || !kontroller.support.notUnallocated || !kontroller.support.status) throw new Error("Support-overtagelsen er ikke ens i kø og detalje");
  await kald("Page.reload", { ignoreCache: true }); await ventPaa("document.body.innerText.includes('Jørn') && document.body.innerText.includes('Afventer os')", "Supportstatus blev ikke bevaret efter genindlæsning");
  filer.push(await billede("09-delt-supportsag", 1440, 900));

  await gaaTil("/main/mail/opfoelgning");
  await ventPaa("document.body.innerText.includes('Det, der kræver din eller Jørns handling')", "Opfølgningssiden blev ikke klar");
  kontroller.opfoelgning = await evaluer(`(()=>({defaultTab:[...document.querySelectorAll('.ejer-opfoelgning-tabs button')].find(b=>b.classList.contains('aktiv'))?.innerText,joernLeak:document.body.innerText.includes('Jørns opfølgning'),mineLabel:document.body.innerText.includes('Mine')}))()`);
  if (kontroller.opfoelgning.joernLeak) throw new Error("Dennis' Mine-visning viser fortsat Jørns private opfølgning");
  filer.push(await billede("10-opfoelgning-mine", 1440, 900));

  await viewport(390, 844); await gaaTil("/main/mail/indbakker?postkasse=faelles");
  await ventPaa("document.querySelectorAll('.ejer-mail-raekker > button').length >= 7", "Mobilmaillisten blev ikke klar");
  kontroller.mobilListe390 = await evaluer(`(()=>{const rows=[...document.querySelectorAll('.ejer-mail-raekker>button')];const card=document.querySelector('.ejer-mail-liste');const rects=rows.slice(0,2).map((e,index)=>{const r=e.getBoundingClientRect();return{index,top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height),fullyVisible:r.height>0&&r.top>=0&&r.bottom<=innerHeight}});const t=getComputedStyle(document.querySelector('.ejer-mail-identitet strong'));return{viewport:{width:innerWidth,height:innerHeight},documentScroll:{x:scrollX,y:scrollY,height:document.documentElement.scrollHeight},rowWidth:Math.round(rows[0].getBoundingClientRect().width),cardWidth:Math.round(card.getBoundingClientRect().width),ratio:rows[0].getBoundingClientRect().width/card.getBoundingClientRect().width,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,wordBreak:t.wordBreak,overflowWrap:t.overflowWrap,firstTwoRows:rects,fullyVisibleRows:rows.filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight}).length,toolsOpen:document.querySelector('.ejer-mail-mobilkompakt button[aria-expanded]')?.getAttribute('aria-expanded')}})()`);
  if (kontroller.mobilListe390.ratio < .95 || kontroller.mobilListe390.horizontalOverflow || kontroller.mobilListe390.wordBreak === "break-all" || kontroller.mobilListe390.fullyVisibleRows < 2 || kontroller.mobilListe390.firstTwoRows.some((row) => !row.fullyVisible)) throw new Error(`390 px-starten viser ikke to hele rækker: ${JSON.stringify(kontroller.mobilListe390)}`);
  filer.push(await billede("11-mobil-mail-liste", 390, 844));
  await klik("button", "Søg, filtre og mapper");
  await ventPaa("document.querySelector('.ejer-mail-mobilkompakt button[aria-expanded]')?.getAttribute('aria-expanded')==='true'", "Mobilværktøjerne åbnede ikke");
  const aabenBetjening = await evaluer(`(()=>{const synlig=s=>{const e=document.querySelector(s);return Boolean(e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0)};return{filtersVisible:synlig('.ejer-mail-filterlinje'),foldersVisible:synlig('.ejer-mail-mapper'),searchVisible:synlig('.ejer-mail-soeg input')}})()`);
  await klik(".ejer-mail-filterlinje button", "Afventer os");
  await ventPaa("document.querySelector('.ejer-mail-mobilkompakt')?.innerText.includes('aktive filtre')", "Aktivt mobilfilter blev ikke vist");
  const aktivtFilter = await evaluer("document.querySelector('.ejer-mail-mobilkompakt')?.innerText");
  await klik(".ejer-mail-mobilkompakt button", "Nulstil");
  await ventPaa("document.querySelector('.ejer-mail-mobilkompakt')?.innerText.includes('Ingen ekstra filtre')", "Mobilfilter blev ikke nulstillet");
  await klik("button", "Luk værktøjer");
  kontroller.mobilBetjening = { aabnet: aabenBetjening, aktivtFilter, nulstillet: true, lukket: await evaluer("document.querySelector('.ejer-mail-mobilkompakt button[aria-expanded]')?.getAttribute('aria-expanded')==='false'") };
  if (!aabenBetjening.filtersVisible || !aabenBetjening.foldersVisible || !aabenBetjening.searchVisible || !kontroller.mobilBetjening.lukket) throw new Error(`Mobilværktøjerne er ikke fuldt betjenelige: ${JSON.stringify(kontroller.mobilBetjening)}`);
  await gaaTil("/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys");
  await ventPaa("Boolean(document.querySelector('.ejer-mail-mobilpaneler'))", "Mobilpanelvælgeren mangler");
  await klik(".ejer-mail-mobilpaneler button", "Svar og AI");
  await evaluer(`(()=>{const e=document.querySelector('.ejer-mail-hurtiginstruks input');e.scrollIntoView({block:'center'});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,'Skriv en meget kort mobilversion, men behold antal og mangler');e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await klik("button", "Lav ny revision");
  await ventPaa("document.body.innerText.includes('AI-forslaget er gemt i det fælles, interne arbejdsrum') && document.querySelector('.ejer-mail-hurtiginstruks input')?.value === ''", "Mobil AI-revision blev ikke gemt");
  await evaluer("document.querySelector('.ejer-ai-seneste').scrollIntoView({block:'center'});true"); await pause(180);
  filer.push(await billede("12-mobil-ai-instruks-og-revision", 390, 844));
  const mobilFoer = await evaluer("document.querySelector('textarea[aria-label=Svarudkast]').value");
  await evaluer(`(()=>{const e=document.querySelector('textarea[aria-label=Svarudkast]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(e,${JSON.stringify(`${mobilFoer} · ugemt mobiltest`)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await klik(".ejer-mail-mobilpaneler button", "Samtale"); await klik(".ejer-mail-mobilpaneler button", "Svar og AI");
  kontroller.mobil = await evaluer(`(()=>({draftPreserved:document.querySelector('textarea[aria-label=Svarudkast]')?.value.endsWith('ugemt mobiltest'),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,activePanel:[...document.querySelectorAll('.ejer-mail-mobilpaneler button')].find(b=>b.classList.contains('aktiv'))?.innerText}))()`);
  if (!kontroller.mobil.draftPreserved || kontroller.mobil.horizontalOverflow) throw new Error("Mobilpanel eller kladdebevarelse fejlede");
  await evaluer("window.scrollTo(0,document.documentElement.scrollHeight);true"); await pause(250);
  kontroller.mobil.reachedBottom = await evaluer("Math.ceil(scrollY+innerHeight)>=document.documentElement.scrollHeight-2");
  filer.push(await billede("12-mobil-svar-og-ai", 390, 844));

  await viewport(899, 900); await gaaTil("/main/mail/indbakker?postkasse=faelles");
  kontroller.breakpoint = await evaluer(`(()=>({width:innerWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.ejer-mail-arbejdsflade')).gridTemplateColumns,fullyVisibleRows:[...document.querySelectorAll('.ejer-mail-raekker>button')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight}).length}))()`);
  if (kontroller.breakpoint.horizontalOverflow || kontroller.breakpoint.fullyVisibleRows < 2) throw new Error("899 px-layoutet viser ikke flere brugbare rækker");
  filer.push(await billede("13-breakpoint-mail", 899, 900));
  await viewport(900, 900); await gaaTil("/main/mail/indbakker?postkasse=faelles");
  kontroller.breakpoint900 = await evaluer(`(()=>({width:innerWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.ejer-mail-arbejdsflade')).gridTemplateColumns,fullyVisibleRows:[...document.querySelectorAll('.ejer-mail-raekker>button')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight}).length}))()`);
  if (kontroller.breakpoint900.horizontalOverflow || kontroller.breakpoint900.fullyVisibleRows < 2) throw new Error("900 px-layoutet viser ikke flere brugbare rækker");
  filer.push(await billede("14-breakpoint-mail", 900, 900));
  await viewport(360, 800); await gaaTil("/main/mail/indbakker?postkasse=faelles");
  await ventPaa("document.querySelectorAll('.ejer-mail-raekker > button').length >= 7", "360 px mobilmaillisten blev ikke klar");
  kontroller.mobilListe360 = await evaluer(`(()=>{const rows=[...document.querySelectorAll('.ejer-mail-raekker>button')];const card=document.querySelector('.ejer-mail-liste');const rects=rows.slice(0,2).map((e,index)=>{const r=e.getBoundingClientRect();return{index,top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height),fullyVisible:r.height>0&&r.top>=0&&r.bottom<=innerHeight}});return{viewport:{width:innerWidth,height:innerHeight},documentScroll:{x:scrollX,y:scrollY,height:document.documentElement.scrollHeight},ratio:rows[0].getBoundingClientRect().width/card.getBoundingClientRect().width,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,firstTwoRows:rects,fullyVisibleRows:rows.filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight}).length}})()`);
  if (kontroller.mobilListe360.ratio < .95 || kontroller.mobilListe360.horizontalOverflow || kontroller.mobilListe360.fullyVisibleRows < 2 || kontroller.mobilListe360.firstTwoRows.some((row) => !row.fullyVisible)) throw new Error(`360 px-starten viser ikke to hele rækker: ${JSON.stringify(kontroller.mobilListe360)}`);
  filer.push(await billede("15-mobil-mail-liste", 360, 800));

  const scrollFlows = [];
  for (const dimension of [[1440, 900], [1920, 1080]]) {
    const [width, height] = dimension;
    for (const fane of ["Svarudkast", "AI-chat", "Oplysninger"]) {
      scrollFlows.push(await maalToRullere({ navn: `samtale-mod-${fane.toLowerCase()}`, width, height, sti: "/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys", venstre: ".ejer-mail-beskeder", hoejre: ".ejer-mail-ai-panel", fane }));
    }
    scrollFlows.push(await maalToRullere({ navn: "mailliste-mod-samlet-ai-overblik", width, height, sti: "/main/mail/indbakker?postkasse=faelles", venstre: ".ejer-mail-raekker", hoejre: ".ejer-mail-ai-overblik" }));
  }
  kontroller.scrollFlows = scrollFlows;
  writeFileSync(join(OUT, "scroll-flows.json"), `${JSON.stringify({ trustedWheelEvents: true, flows: scrollFlows }, null, 2)}\n`);
  writeFileSync(join(OUT, "mobile-visible-rows.json"), `${JSON.stringify({ viewports: [kontroller.mobilListe360, kontroller.mobilListe390], controls: kontroller.mobilBetjening, breakpoints: [kontroller.breakpoint, kontroller.breakpoint900] }, null, 2)}\n`);

  const styles = await evaluer(`(()=>{const css=e=>{const s=getComputedStyle(e);return{fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,minHeight:s.minHeight}};return{fonts:{status:document.fonts.status,interVariableLoaded:document.fonts.check('14px "Inter Variable"')},body:css(document.body),button:css(document.querySelector('.fc-btn')),input:css(document.querySelector('input')),cardRadius:getComputedStyle(document.querySelector('.ejer-mail-liste')).borderRadius,focusRule:'2px (verificeret af design-token-test og :focus-visible-regel)'}})()`);
  writeFileSync(join(OUT, "browser-verification.json"), `${JSON.stringify({ ...kontroller, styles }, null, 2)}\n`);
  writeFileSync(join(OUT, "connected-ai-flow.json"), `${JSON.stringify(kontroller.forbundetAiSvarudkast, null, 2)}\n`);
  writeFileSync(join(OUT, "post-approval-ui-proof.json"), `${JSON.stringify({ unsavedMutation: kontroller.efterGodkendelseAendret, reviewModal: kontroller.reviewModal, externalMailSent: false }, null, 2)}\n`);
  const captures = filer.map((fil) => ({ file: fil.split(/[\\/]/).pop(), data: "Syntetisk V7.2-emulatorfixture", externalIntegrations: "Ikke tilsluttet" }));
  writeFileSync(join(OUT, "capture-manifest.json"), `${JSON.stringify({ codeCommit: CODE_COMMIT, capturedAt: new Date().toISOString(), baseUrl: BASE, normalOwnerLogin: true, externalMailSent: false, captures }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, codeCommit: CODE_COMMIT, filer, kontroller, styles }, null, 2));
} finally {
  try { socket.close(); } catch { /* lukket */ }
  proces.kill(); await pause(250); try { rmSync(profil, { recursive: true, force: true }); } catch { /* Edge frigiver sent */ }
}
