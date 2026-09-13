/* Kompakt V6.2-reviewcapture fra den faktiske lokale ejerbrowser. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const BASE = process.env.OWNER_REVIEW_URL || "http://127.0.0.1:5211";
const PORT = Number(process.env.OWNER_REVIEW_DEBUG_PORT || 9332);
const OUT = resolve(process.env.OWNER_REVIEW_OUTPUT || "docs/screenshots/ejer-review-v6-2");
const CODE_COMMIT = process.env.OWNER_REVIEW_CODE_COMMIT || "ikke-angivet";
const EMAIL = process.env.VITE_DEV_EJER_MAIL || "";
const KODE = process.env.VITE_DEV_BRUGER_KODE || "";
const KUNDE = "Aurora Mobilitet ApS — syntetisk V6.2-kunde";
const browser = [process.env.OWNER_REVIEW_BROWSER, join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"), join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe")]
  .filter(Boolean).find((sti) => { try { return process.getBuiltinModule("node:fs").statSync(sti).isFile(); } catch { return false; } });
if (!browser) throw new Error("Microsoft Edge blev ikke fundet.");
if (!EMAIL || !KODE) throw new Error("Den git-ignorerede lokale ejerloginfixture mangler.");

mkdirSync(OUT, { recursive: true });
const profil = mkdtempSync(join(tmpdir(), "veyro-owner-v62-"));
const proces = spawn(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, "--window-size=1920,1080", `${BASE}/login`], { stdio: "ignore" });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (sti) => { const r = await fetch(`http://127.0.0.1:${PORT}${sti}`); if (!r.ok) throw new Error(`DevTools ${r.status}`); return r.json(); };
let side;
for (let i = 0; i < 60; i += 1) { try { const sider = await json("/json/list"); side = sider.find((p) => p.type === "page" && p.url?.startsWith(BASE)) || sider.find((p) => p.type === "page"); if (side?.webSocketDebuggerUrl) break; } catch { /* starter */ } await pause(250); }
if (!side?.webSocketDebuggerUrl) throw new Error("Kunne ikke forbinde til reviewbrowseren.");
const socket = new WebSocket(side.webSocketDebuggerUrl);
await new Promise((ok, fejl) => { socket.addEventListener("open", ok, { once: true }); socket.addEventListener("error", fejl, { once: true }); });
let sekvens = 0;
const ventende = new Map();
socket.addEventListener("message", (event) => { const svar = JSON.parse(event.data); if (!svar.id || !ventende.has(svar.id)) return; const h = ventende.get(svar.id); ventende.delete(svar.id); svar.error ? h.reject(new Error(svar.error.message)) : h.resolve(svar.result); });
const kald = (method, params = {}) => { const id = ++sekvens; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolveSvar, reject) => ventende.set(id, { resolve: resolveSvar, reject })); };
async function evaluer(expression) { const r = await kald("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "Browserfejl"); return r.result?.value; }
async function ventPaa(expression, besked, ms = 30000) { const slut = Date.now() + ms; while (Date.now() < slut) { if (await evaluer(expression)) return; await pause(150); } throw new Error(besked); }
async function viewport(width, height) { await kald("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height }); }
async function gaaTil(sti) { await kald("Page.navigate", { url: `${BASE}${sti}` }); await ventPaa("document.readyState === 'complete'", `${sti} blev ikke klar`); await pause(300); }
async function klik(selector, tekst) { return evaluer(`(()=>{const e=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(x=>(x.textContent||'').includes(${JSON.stringify(tekst)}));if(!e)return false;e.click();return true})()`); }
async function billede(navn, width, height) { await viewport(width, height); await pause(180); const r = await kald("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }); const fil = join(OUT, `${width}x${height}-${navn}.png`); writeFileSync(fil, Buffer.from(r.data, "base64")); return fil; }

const filer = [];
try {
  await kald("Page.enable"); await kald("Runtime.enable"); await viewport(1440, 900); await gaaTil("/login");
  if (!(await evaluer("location.pathname.startsWith('/main')"))) {
    await evaluer(`(()=>{const s=(q,v)=>{const e=document.querySelector(q);const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));};s('input[type=email]',${JSON.stringify(EMAIL)});s('input[type=password]',${JSON.stringify(KODE)});document.querySelector('form').requestSubmit();return true})()`);
    await ventPaa("location.pathname.startsWith('/main')", "Normalt tenantløst ejerlogin fejlede");
  }
  await viewport(1920, 1080); await gaaTil("/main/salg/tilbud");
  await ventPaa(`document.body.innerText.includes(${JSON.stringify(KUNDE)})`, "V6.2-kunden blev ikke vist");
  await evaluer(`(()=>{const c=Array.from(document.querySelectorAll('tr')).find(e=>(e.innerText||'').includes(${JSON.stringify(KUNDE)}));if(!c)return false;c.click();return true})()`);
  await ventPaa(`document.querySelector('.ejer-tilbud-identitet')?.innerText.includes(${JSON.stringify(KUNDE)})`, "V6.2-tilbuddet blev ikke valgt");
  if (!(await klik("button", "Redigér"))) throw new Error("Redigér kladde blev ikke fundet");
  await ventPaa("Boolean(document.querySelector('.ejer-tilbudsredigering'))", "Tilbudskladden åbnede ikke");
  await klik(".ejer-tilbud-redigerfaner button", "Tilbudstekst");
  await ventPaa("Boolean(document.querySelector('#tilbud-ai-instruks'))", "AI-arbejdsområdet mangler");
  await klik("button", "Foreslå løsningsbeskrivelse");
  await ventPaa("document.querySelector('.ejer-ai-resultat p')?.innerText.includes('25 køretøjer')", "Det første kildebaserede forslag mangler");
  await evaluer("document.querySelector('.ejer-ai-resultat').scrollIntoView({block:'center'});true");
  filer.push(await billede("01-foerste-kildebaserede-pilotforslag", 1920, 1080));
  await evaluer(`(()=>{const e=document.querySelector('#tilbud-ai-instruks');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(e,'Gør teksten kortere og fremhæv pilotens afgrænsning.');e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await klik("button", "Lav revideret forslag");
  await ventPaa("document.querySelector('.ejer-ai-resultat p')?.innerText.includes('aktiveres ikke automatisk')", "Det reviderede pilotforslag mangler afgrænsning");
  filer.push(await billede("02-revideret-kort-pilotafgraensning", 1920, 1080));
  await klik("button", "Indsæt i tilbud");
  await ventPaa("!document.querySelector('.ejer-ai-resultat') && document.querySelector('#tilbud-loesning')?.value.includes('aktiveres ikke automatisk')", "Forslaget blev ikke indsat");
  await klik("button", "Gem kladde");
  await ventPaa("!document.querySelector('.ejer-tilbudsredigering')", "Kladde blev ikke gemt");
  await klik("button", "Redigér");
  await ventPaa("Boolean(document.querySelector('.ejer-tilbudsredigering'))", "Gemt kladde kunne ikke genåbnes");
  await klik(".ejer-tilbud-redigerfaner button", "Tilbudstekst");
  await ventPaa("document.querySelector('#tilbud-loesning')?.value.includes('aktiveres ikke automatisk')", "Gemt tekst blev ikke genindlæst");
  filer.push(await billede("03-indsat-gemt-samme-kunde", 1440, 900));
  await viewport(1920, 1080); await klik(".ejer-tilbud-redigerfaner button", "Sammensæt løsning");
  await ventPaa("Boolean(document.querySelector('#tilbud-pilot-omfang'))", "Pilotens kildefelter mangler");
  await evaluer("document.querySelector('#tilbud-pilot-omfang').scrollIntoView({block:'center'});true"); await pause(180);
  filer.push(await billede("04-sammenhaengende-pilotopsaetning", 1920, 1080));
  await viewport(1440, 900); await klik(".ejer-tilbud-redigerfaner button", "Dokument");
  await ventPaa(`document.querySelector('.ejer-tilbud-dokumentkladde')?.innerText.includes(${JSON.stringify(KUNDE)})`, "Dokumentpreviewet viste ikke V6.2-kunden");
  await evaluer("document.querySelector('.ejer-tilbud-dokumentkladde').scrollIntoView({block:'start'});true"); await pause(180);
  filer.push(await billede("05-dokumentpreview-samme-kunde", 1440, 900));
  await viewport(390, 844); await klik(".ejer-tilbud-redigerfaner button", "Tilbudstekst");
  await ventPaa("Boolean(document.querySelector('.ejer-tilbud-mobilpaneler'))", "Mobilpanelerne mangler");
  const mobilFoer = await evaluer("document.querySelector('#tilbud-loesning').value");
  await evaluer(`(()=>{const e=document.querySelector('#tilbud-loesning');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(e,${JSON.stringify(`${mobilFoer} · mobilkladde ikke gemt`)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await klik(".ejer-tilbud-mobilpaneler button", "Veyro-assistent"); await klik(".ejer-tilbud-mobilpaneler button", "Tilbudstekst");
  await ventPaa(`document.querySelector('#tilbud-loesning')?.value===${JSON.stringify(`${mobilFoer} · mobilkladde ikke gemt`)}`, "Mobilkladden blev ikke bevaret");
  await evaluer("document.querySelector('#tilbud-loesning').scrollIntoView({block:'center'});true");
  filer.push(await billede("06-mobilkladde-bevaret", 390, 844));

  const browserKontrol = await evaluer(`(()=>{const css=e=>{const s=getComputedStyle(e);return{fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight}};return{route:location.pathname,viewport:{width:innerWidth,height:innerHeight},kunde:${JSON.stringify(KUNDE)},kundeSynlig:document.body.innerText.includes(${JSON.stringify(KUNDE)}),mobilkladdeBevaret:document.querySelector('#tilbud-loesning')?.value.endsWith('mobilkladde ikke gemt'),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,fonts:{status:document.fonts.status,interVariableLoaded:document.fonts.check('14px "Inter Variable"')},body:css(document.body),input:css(document.querySelector('#tilbud-loesning'))}})()`);
  writeFileSync(join(OUT, "browser-verification.json"), `${JSON.stringify(browserKontrol, null, 2)}\n`);
  const captures = [
    { file: "1920x1080-01-foerste-kildebaserede-pilotforslag.png", route: "/main/salg/tilbud", viewport: "1920x1080", flow: "V6.2 Aurora-v2-kladde, første lokale forslag" },
    { file: "1920x1080-02-revideret-kort-pilotafgraensning.png", route: "/main/salg/tilbud", viewport: "1920x1080", flow: "Samme kladde, sælgerinstruks og revideret forslag" },
    { file: "1440x900-03-indsat-gemt-samme-kunde.png", route: "/main/salg/tilbud", viewport: "1440x900", flow: "Indsat, gemt og genindlæst tekst" },
    { file: "1920x1080-04-sammenhaengende-pilotopsaetning.png", route: "/main/salg/tilbud", viewport: "1920x1080", flow: "Sammenhængende, strukturerede pilotkilder" },
    { file: "1440x900-05-dokumentpreview-samme-kunde.png", route: "/main/salg/tilbud", viewport: "1440x900", flow: "Dokumentpreview med samme V6.2-kunde og kladde" },
    { file: "390x844-06-mobilkladde-bevaret.png", route: "/main/salg/tilbud", viewport: "390x844", flow: "Ugemt mobilkladde bevaret ved panelskift" },
  ];
  writeFileSync(join(OUT, "capture-manifest.json"), `${JSON.stringify({ codeCommit: CODE_COMMIT, capturedAt: new Date().toISOString(), baseUrl: BASE, dataSource: "Syntetisk emulatorfixture og lokal deterministisk adapter", externalIntegrations: "Ikke tilsluttet", customerFlow: "v62_pilot_20260911", captures }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, codeCommit: CODE_COMMIT, filer, browserKontrol }, null, 2));
} finally {
  try { socket.close(); } catch { /* lukket */ }
  proces.kill(); await pause(250); try { rmSync(profil, { recursive: true, force: true }); } catch { /* Edge frigiver sent */ }
}
