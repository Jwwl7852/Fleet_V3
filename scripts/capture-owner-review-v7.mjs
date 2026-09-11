/* Browserbaseret V7-accept og screenshots fra det lokale, isolerede ejermiljø. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const BASE = process.env.OWNER_REVIEW_URL || "http://127.0.0.1:5211";
const PORT = Number(process.env.OWNER_REVIEW_DEBUG_PORT || 9337);
const OUT = resolve(process.env.OWNER_REVIEW_OUTPUT || "docs/screenshots/ejer-review-v7");
const CODE_COMMIT = process.env.OWNER_REVIEW_CODE_COMMIT || "arbejdstrae";
const EMAIL = process.env.VITE_DEV_EJER_MAIL || "";
const KODE = process.env.VITE_DEV_BRUGER_KODE || "";
const edge = [process.env.OWNER_REVIEW_BROWSER, join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"), join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe")]
  .filter(Boolean).find((sti) => { try { return process.getBuiltinModule("node:fs").statSync(sti).isFile(); } catch { return false; } });
if (!edge) throw new Error("Microsoft Edge blev ikke fundet.");
if (!EMAIL || !KODE) throw new Error("Den git-ignorerede lokale ejerloginfixture mangler.");

mkdirSync(OUT, { recursive: true });
const profil = mkdtempSync(join(tmpdir(), "veyro-owner-v7-"));
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
  filer.push(await billede("03-pilotprojekt-samtale-og-ai", 1440, 900));
  filer.push(await billede("04-pilotprojekt-samtale-og-ai", 1920, 1080));
  await evaluer(`(()=>{const e=document.querySelector('.ejer-mail-aiinstruks input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,'Gør svaret kortere og konkret');e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await klik("button", "Lav svarforslag");
  await ventPaa("Boolean(document.querySelector('.ejer-ai-forslag'))", "Lokalt AI-svarforslag blev ikke dannet");
  await klik("button", "Indsæt i svar");
  await ventPaa("document.querySelector('textarea[aria-label=Svarudkast]')?.value.includes('Hej Maria')", "AI-forslaget blev ikke indsat i svaret");
  await klik("button", "Gem kladde");
  await ventPaa("document.body.innerText.includes('Svarudkastet er gemt')", "Svarudkastet blev ikke gemt");
  await klik("button", "Gennemse og godkend");
  await pause(800);
  await gaaTil("/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys");
  await ventPaa("document.body.innerText.includes('Afsend godkendt svar')", "Det konkrete svar blev ikke godkendt og genindlæst lokalt");
  kontroller.svarflow = { aiForslag: true, indsat: true, gemt: true, godkendt: true, sendt: false };
  filer.push(await billede("05-pilotprojekt-godkendt-ikke-sendt", 1440, 900));

  await gaaTil("/main/mail/sager?postkasse=faelles&mappe=domicil&sag=v7-domicil&fra=sager");
  await ventPaa("document.body.innerText.includes('Domicil') && document.body.innerText.includes('Intern sag og mappe')", "Den interne Domicil-sag blev ikke vist");
  kontroller.internSag = await evaluer(`(()=>({kundeOprettet:document.body.innerText.includes('Åbn kundekort'),internMappe:document.body.innerText.includes('Foreslået mappe: Domicil'),dokumenter:document.body.innerText.includes('dokument(er) på sagen')}))()`);
  filer.push(await billede("06-intern-sag-domicil", 1440, 900));

  await gaaTil("/main/support?sag=v7-support-dennis");
  await ventPaa("document.body.innerText.includes('Support') && document.body.innerText.includes('Nordlys')", "Den delte supportsag blev ikke vist i Support");
  kontroller.support = { sharedCaseVisible: true, route: "/main/support?sag=v7-support-dennis" };
  filer.push(await billede("07-delt-supportsag", 1440, 900));

  await gaaTil("/main/mail/opfoelgning");
  await ventPaa("document.body.innerText.includes('Det, der kræver din eller Jørns handling')", "Opfølgningssiden blev ikke klar");
  kontroller.opfoelgning = await evaluer(`(()=>({defaultTab:[...document.querySelectorAll('.ejer-opfoelgning-tabs button')].find(b=>b.classList.contains('aktiv'))?.innerText,joernLeak:document.body.innerText.includes('Jørns opfølgning'),mineLabel:document.body.innerText.includes('Mine')}))()`);
  if (kontroller.opfoelgning.joernLeak) throw new Error("Dennis' Mine-visning viser fortsat Jørns private opfølgning");
  filer.push(await billede("08-opfoelgning-mine", 1440, 900));

  await viewport(390, 844); await gaaTil("/main/mail/indbakker?postkasse=faelles");
  await ventPaa("document.querySelectorAll('.ejer-mail-raekker > button').length >= 7", "Mobilmaillisten blev ikke klar");
  filer.push(await billede("09-mobil-mail-liste", 390, 844));
  await gaaTil("/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys");
  await ventPaa("Boolean(document.querySelector('.ejer-mail-mobilpaneler'))", "Mobilpanelvælgeren mangler");
  await klik(".ejer-mail-mobilpaneler button", "Svar og AI");
  const mobilFoer = await evaluer("document.querySelector('textarea[aria-label=Svarudkast]').value");
  await evaluer(`(()=>{const e=document.querySelector('textarea[aria-label=Svarudkast]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(e,${JSON.stringify(`${"${mobilFoer}"} · ugemt mobiltest`)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`.replace('"${mobilFoer}"', JSON.stringify(mobilFoer)));
  await klik(".ejer-mail-mobilpaneler button", "Samtale"); await klik(".ejer-mail-mobilpaneler button", "Svar og AI");
  kontroller.mobil = await evaluer(`(()=>({draftPreserved:document.querySelector('textarea[aria-label=Svarudkast]')?.value.endsWith('ugemt mobiltest'),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,activePanel:[...document.querySelectorAll('.ejer-mail-mobilpaneler button')].find(b=>b.classList.contains('aktiv'))?.innerText}))()`);
  if (!kontroller.mobil.draftPreserved || kontroller.mobil.horizontalOverflow) throw new Error("Mobilpanel eller kladdebevarelse fejlede");
  filer.push(await billede("10-mobil-svar-og-ai", 390, 844));

  await viewport(899, 900); await gaaTil("/main/mail/indbakker?postkasse=faelles");
  kontroller.breakpoint = await evaluer(`(()=>({width:innerWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,mobileLayout:getComputedStyle(document.querySelector('.ejer-mail-arbejdsflade')).display}))()`);
  filer.push(await billede("11-breakpoint-mail", 899, 900));
  await viewport(360, 800); await gaaTil("/main/mail/indbakker?postkasse=faelles");
  await ventPaa("document.querySelectorAll('.ejer-mail-raekker > button').length >= 7", "360 px mobilmaillisten blev ikke klar");
  filer.push(await billede("12-mobil-mail-liste", 360, 800));

  const styles = await evaluer(`(()=>{const css=e=>{const s=getComputedStyle(e);return{fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,minHeight:s.minHeight}};return{fonts:{status:document.fonts.status,interVariableLoaded:document.fonts.check('14px "Inter Variable"')},body:css(document.body),button:css(document.querySelector('.fc-btn')),input:css(document.querySelector('input')),cardRadius:getComputedStyle(document.querySelector('.ejer-mail-liste')).borderRadius,focusRule:'2px (verificeret af design-token-test og :focus-visible-regel)'}})()`);
  writeFileSync(join(OUT, "browser-verification.json"), `${JSON.stringify({ ...kontroller, styles }, null, 2)}\n`);
  const captures = filer.map((fil) => ({ file: fil.split(/[\\/]/).pop(), data: "Syntetisk V7-emulatorfixture", externalIntegrations: "Ikke tilsluttet" }));
  writeFileSync(join(OUT, "capture-manifest.json"), `${JSON.stringify({ codeCommit: CODE_COMMIT, capturedAt: new Date().toISOString(), baseUrl: BASE, normalOwnerLogin: true, externalMailSent: false, captures }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, codeCommit: CODE_COMMIT, filer, kontroller, styles }, null, 2));
} finally {
  try { socket.close(); } catch { /* lukket */ }
  proces.kill(); await pause(250); try { rmSync(profil, { recursive: true, force: true }); } catch { /* Edge frigiver sent */ }
}
