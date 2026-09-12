/* Browseraccept for V7.3.1. Kun lokal preview og Firebase-emulatorer anvendes. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const BASE = process.env.OWNER_REVIEW_URL || "http://127.0.0.1:5213";
const PORT = Number(process.env.OWNER_REVIEW_DEBUG_PORT || 9344);
const OUT = resolve("docs/screenshots/ejer-review-v7-3-1");
const EMAIL = process.env.VITE_DEV_EJER_MAIL || "";
const KODE = process.env.VITE_DEV_BRUGER_KODE || "";
const project = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST;
assert.match(project, /^demo-/);
assert.equal(authHost, "127.0.0.1:9099");
assert.equal(functionsHost, "127.0.0.1:5001");

const edge = [
  process.env.OWNER_REVIEW_BROWSER,
  join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
].filter(Boolean).find((sti) => { try { return process.getBuiltinModule("node:fs").statSync(sti).isFile(); } catch { return false; } });
if (!edge || !EMAIL || !KODE) throw new Error("Lokal browser eller loginfixture mangler.");

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "veyro-v731-"));
const edgeProcess = spawn(edge, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1920,1080", `${BASE}/login`], { stdio: "ignore" });
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));
const getJson = async (path) => (await fetch(`http://127.0.0.1:${PORT}${path}`)).json();
let page;
for (let forsøg = 0; forsøg < 80; forsøg += 1) {
  try { const pages = await getJson("/json/list"); page = pages.find((post) => post.type === "page" && post.url?.startsWith(BASE)) || pages.find((post) => post.type === "page"); if (page?.webSocketDebuggerUrl) break; } catch { /* Browseren starter stadig. */ }
  await pause(250);
}
if (!page?.webSocketDebuggerUrl) throw new Error("Reviewbrowseren kunne ikke åbnes.");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, fejl) => { socket.addEventListener("open", ok, { once: true }); socket.addEventListener("error", fejl, { once: true }); });
let sekvens = 0;
const ventende = new Map();
socket.addEventListener("message", (event) => { const besked = JSON.parse(event.data); const vent = ventende.get(besked.id); if (!vent) return; ventende.delete(besked.id); besked.error ? vent.fejl(new Error(besked.error.message)) : vent.ok(besked.result); });
const cdp = (method, params = {}) => { const id = ++sekvens; socket.send(JSON.stringify({ id, method, params })); return new Promise((ok, fejl) => ventende.set(id, { ok, fejl })); };
async function js(expression) { const svar = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (svar.exceptionDetails) throw new Error(svar.exceptionDetails.exception?.description || svar.exceptionDetails.text); return svar.result?.value; }
async function wait(expression, message, ms = 30000) { const slut = Date.now() + ms; while (Date.now() < slut) { if (await js(expression)) return; await pause(150); } throw new Error(message); }
async function viewport(width, height) { await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height }); }
async function go(path) { await cdp("Page.navigate", { url: `${BASE}${path}` }); await wait("document.readyState==='complete'", `Kunne ikke åbne ${path}`); await pause(500); }
async function center(selector, text = "") {
  const resultat = await js(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>!${JSON.stringify(text)}||(x.textContent||'').includes(${JSON.stringify(text)}));if(!e)return null;e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  if (!resultat) throw new Error(`Mangler kontrol: ${selector} ${text}`);
  return resultat;
}
async function click(selector, text = "") { const punkt = await center(selector, text); await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: punkt.x, y: punkt.y, button: "left", clickCount: 1 }); await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: punkt.x, y: punkt.y, button: "left", clickCount: 1 }); await pause(120); }
async function wheel(selector) { await center(selector); await js(`document.querySelector(${JSON.stringify(selector)}).focus()`); await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 }); await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 }); await pause(300); }
async function scrollTo(selector) { const ok = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.scrollIntoView({block:'center',inline:'nearest'});return true})()`); if (!ok) throw new Error(`Mangler scrollmål: ${selector}`); await pause(200); }
async function selectAll() { await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 }); await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 }); }
async function type(selector, value) { await click(selector); await selectAll(); await cdp("Input.insertText", { text: value }); await pause(120); }
async function shot(name, width, height) { await viewport(width, height); await pause(300); const svar = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }); const file = join(OUT, `${width}x${height}-${name}.png`); writeFileSync(file, Buffer.from(svar.data, "base64")); return file; }
async function login(email) { const svar = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=v731`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: KODE, returnSecureToken: true }) }); assert.equal(svar.ok, true); return (await svar.json()).idToken; }
async function call(name, data, token) { const svar = await fetch(`http://${functionsHost}/${project}/europe-west1/${name}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) }); const json = await svar.json(); if (json.error) throw new Error(`${name}: ${json.error.status}: ${json.error.message}`); return json.result; }

const proof = { version: "V7.3.1", base: BASE, normalLogin: false, reload: false, viewports: ["1440x900", "1920x1080", "390x844", "360x800"], testCase: "v7-pilot-nordlys", checks: {}, screenshots: [] };
try {
  await cdp("Page.enable"); await cdp("Runtime.enable"); await viewport(1440, 900); await go("/login");
  if (!(await js("location.pathname.startsWith('/main')"))) {
    if (!(await js("document.querySelector('input[type=email]')?.value"))) await type("input[type=email]", EMAIL);
    if (!(await js("document.querySelector('input[type=password]')?.value"))) await type("input[type=password]", KODE);
    await click("button", "Log ind"); await wait("location.pathname.startsWith('/main')", "Normalt ejerlogin fejlede");
  }
  proof.normalLogin = true;
  await go("/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys");
  await wait("Boolean(document.querySelector('textarea[aria-label=Svarudkast]'))", "Svarudkastet mangler");
  await cdp("Page.reload", { ignoreCache: true }); await wait("Boolean(document.querySelector('textarea[aria-label=Svarudkast]'))", "Reviewdata forsvandt efter reload"); proof.reload = true;
  proof.checks.signatureConflict = await js(`(()=>({warning:document.body.innerText.includes('Vælg én afslutning'),reviewBlocked:document.querySelector('[data-testid=gennemse-svar]')?.disabled===true,bodySignoffs:(document.querySelector('textarea[aria-label=Svarudkast]').value.match(/Venlig hilsen/g)||[]).length,separateSignoffs:([...(document.querySelector('.ejer-kladde-signatur pre')?.innerText||'').matchAll(/Venlig hilsen/g)]).length}))()`);
  assert.equal(proof.checks.signatureConflict.warning, true); assert.equal(proof.checks.signatureConflict.reviewBlocked, true);
  proof.screenshots.push(await shot("01-synligt-svarfelt", 1440, 900));
  await scrollTo(".ejer-signaturkonflikt"); proof.screenshots.push(await shot("02-signaturvalg", 1440, 900));

  await click("button", "Erstat med min aktuelle signatur"); await wait("!document.body.innerText.includes('Vælg én afslutning')", "Signaturvalget blev ikke anvendt");
  const svarEfterValg = await js("document.querySelector('textarea[aria-label=Svarudkast]').value");
  const multiLine = `${svarEfterValg}\n\nV7.3.1 browsertest: første linje.\nAnden linje skal bevares efter genindlæsning.`;
  await type("textarea[aria-label=Svarudkast]", multiLine); await wait("document.querySelector('textarea[aria-label=Svarudkast]').value.includes('Anden linje skal bevares')", "Flerlinjet tekst blev ikke skrevet");
  const desktop1440 = await js(`(()=>{const e=document.querySelector('textarea[aria-label=Svarudkast]').getBoundingClientRect(),f=document.querySelector('.ejer-mail-hurtiginstruks textarea').getBoundingClientRect(),b=document.querySelector('.ejer-mail-hurtiginstruks .fc-btn').getBoundingClientRect();return{editor:{top:e.top,bottom:e.bottom,height:e.height,visible:e.top>=0&&e.bottom<=innerHeight},aiField:{width:f.width,visible:f.top>=0&&f.bottom<=innerHeight},aiButtonSeparate:b.top>=f.bottom-1,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,font:getComputedStyle(document.querySelector('textarea[aria-label=Svarudkast]')).fontFamily}})()`);
  assert.equal(desktop1440.editor.visible, true); assert.equal(desktop1440.horizontalOverflow, false); proof.checks.desktop1440 = desktop1440;
  await click("button", "Gem kladde"); await wait("document.body.innerText.includes('Svarudkastet er gemt')", "Svarudkastet blev ikke gemt");
  await cdp("Page.reload", { ignoreCache: true }); await wait("document.querySelector('textarea[aria-label=Svarudkast]')?.value.includes('Anden linje skal bevares')", "Den gemte flerlinjetekst forsvandt efter reload");
  proof.checks.draftPersisted = true; proof.screenshots.push(await shot("03-gemt-flerlinjet-svar", 1440, 900)); proof.screenshots.push(await shot("04-gemt-flerlinjet-svar", 1920, 1080));
  await viewport(1440, 900); const venstreFoer = await js("document.querySelector('.ejer-mail-venstrehistorik').scrollTop"); const højreFoer = await js("document.querySelector('#panel-svarudkast').scrollTop"); await scrollTo(".ejer-mail-hurtiginstruks textarea");
  proof.checks.quickInstruction = await js(`(()=>{const f=document.querySelector('.ejer-mail-hurtiginstruks textarea').getBoundingClientRect(),b=document.querySelector('.ejer-mail-hurtiginstruks .fc-btn').getBoundingClientRect();return{visible:f.top>=0&&f.bottom<=innerHeight,width:f.width,buttonSeparate:b.top>=f.bottom-1,leftScrollBefore:${venstreFoer},leftScrollAfter:document.querySelector('.ejer-mail-venstrehistorik').scrollTop,rightScrollBefore:${højreFoer},rightScrollAfter:document.querySelector('#panel-svarudkast').scrollTop}})()`); assert.equal(proof.checks.quickInstruction.visible, true); assert.equal(proof.checks.quickInstruction.leftScrollBefore, proof.checks.quickInstruction.leftScrollAfter); proof.screenshots.push(await shot("05-bred-hurtiginstruks-efter-rulning", 1440, 900));
  await viewport(1440, 900); await click("button", "Gennemse og send"); await wait("Boolean(document.querySelector('[role=dialog]'))", "Gennemgangen åbnede ikke");
  proof.checks.review = await js(`(()=>{const samlet=document.querySelector('[data-testid=review-samlet-svar]').innerText;return{signoffs:(samlet.match(/Venlig hilsen/g)||[]).length,multiLine:samlet.includes('Anden linje skal bevares'),internalExcluded:!samlet.includes('Kun Dennis og Jørn')&&!samlet.includes('intern note')}})()`);
  assert.equal(proof.checks.review.signoffs, 1); assert.equal(proof.checks.review.internalExcluded, true); proof.screenshots.push(await shot("06-samlet-svar-med-en-signatur", 1440, 900));
  await click("[role=dialog] button", "Godkend svar"); await wait("Boolean(document.querySelector('[data-testid=afsend-godkendt-svar]'))", "Det konkrete svar blev ikke godkendt"); proof.checks.approvedNotSent = true;

  await click("[role=tab]", "AI-chat"); await wait("Boolean(document.querySelector('.ejer-mail-aiinstruks textarea'))", "AI-chat mangler");
  const aiFoer = await js("document.querySelector('.ejer-ai-chathistorik').scrollTop"); proof.screenshots.push(await shot("07-ai-chat-foer-rulning", 1440, 900)); await wheel(".ejer-ai-chathistorik", 900); const aiEfter = await js("document.querySelector('.ejer-ai-chathistorik').scrollTop");
  await type(".ejer-mail-aiinstruks textarea", "Første interne linje.\nAnden interne linje må aldrig sendes.");
  proof.checks.ai = await js(`(()=>{const h=document.querySelector('.ejer-ai-chathistorik'),c=document.querySelector('.ejer-mail-aiinstruks'),t=c.querySelector('textarea'),r=t.getBoundingClientRect();return{historyScrollable:h.scrollHeight>h.clientHeight,scrollBefore:${aiFoer},scrollAfter:${aiEfter},composerVisible:r.top>=0&&r.bottom<=innerHeight,textareaWidth:t.getBoundingClientRect().width,buttonSeparate:c.querySelector('button').getBoundingClientRect().top>=r.bottom-1,focused:document.activeElement===t,aiHasSignature:[...h.querySelectorAll('.ai p')].some(p=>p.innerText.includes('Venlig hilsen'))}})()`);
  assert.equal(proof.checks.ai.composerVisible, true); assert.equal(proof.checks.ai.focused, true); assert.equal(proof.checks.ai.aiHasSignature, false); assert.ok(proof.checks.ai.scrollAfter > proof.checks.ai.scrollBefore); proof.screenshots.push(await shot("08-ai-chat-efter-rulning", 1440, 900));

  await type(".ejer-intern-note-komposer textarea", "V7.3.1 fælles browsernote – samme note i Mail og Support"); await click("button", "Gem intern note"); await wait("document.body.innerText.includes('Den interne note er gemt')", "Den interne note blev ikke gemt");
  const mailNote = await js(`(()=>{const p=[...document.querySelectorAll('.ejer-notehistorik [data-note-id]')].find(e=>e.innerText.includes('V7.3.1 fælles browsernote'));return p?{id:p.dataset.noteId,time:p.querySelector('time')?.dateTime||'',author:p.querySelector('b')?.innerText||'',text:p.innerText}:null})()`);
  assert.ok(mailNote?.id); await scrollTo(`[data-note-id="${mailNote.id}"]`); proof.screenshots.push(await shot("09-gemt-note-i-mail", 1440, 900));
  await click("button", "Knyt til Support"); await wait("location.pathname==='/main/support'", "Sagen blev ikke åbnet i Support"); await wait(`Boolean([...document.querySelectorAll('.ejer-support-notehistorik [data-note-id]')].find(e=>e.dataset.noteId===${JSON.stringify(mailNote.id)}))`, "Samme note-id ses ikke i Support");
  let supportNote = await js(`(()=>{const p=document.querySelector(${JSON.stringify(`[data-note-id="${mailNote.id}"]`)});return p?{id:p.dataset.noteId,time:p.querySelector('time')?.dateTime||'',author:p.querySelector('b')?.innerText||'',text:p.innerText}:null})()`);
  assert.equal(supportNote.id, mailNote.id); assert.equal(supportNote.time, mailNote.time); assert.equal(supportNote.author, mailNote.author); await scrollTo(`[data-note-id="${mailNote.id}"]`); proof.screenshots.push(await shot("10-samme-note-i-support", 1440, 900));
  await cdp("Page.reload", { ignoreCache: true }); await wait(`Boolean(document.querySelector(${JSON.stringify(`[data-note-id="${mailNote.id}"]`)}))`, "Noten forsvandt i Support efter reload"); supportNote = await js(`(()=>{const p=document.querySelector(${JSON.stringify(`[data-note-id="${mailNote.id}"]`)});return{id:p.dataset.noteId,time:p.querySelector('time')?.dateTime||'',author:p.querySelector('b')?.innerText||''}})()`);
  const joernToken = await login("joern@demo.veyro.invalid"); const joernData = await call("ejerkommunikationhent", {}, joernToken); const joernNote = joernData.traade["v7-pilot-nordlys"].noter[mailNote.id];
  proof.checks.sharedNote = { threadId: "v7-pilot-nordlys", noteId: mailNote.id, mail: mailNote, support: supportNote, otherOwner: Boolean(joernNote), otherOwnerUid: joernNote?.oprettetAf || "", reload: true };
  assert.equal(proof.checks.sharedNote.otherOwner, true);

  await viewport(390, 844); await go("/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys"); await click(".ejer-mail-mobilpaneler button", "Svar og AI"); await wait("document.getElementById('mobilfane-svar')?.getAttribute('aria-selected')==='true'", "Mobilfanen Svar og AI blev ikke aktiv");
  const mobilGrundlag = await js("document.querySelector('textarea[aria-label=Svarudkast]').value"); const mobilTekst = `${mobilGrundlag}\n\nMobil usendt linje 1\nMobil usendt linje 2`;
  await type("textarea[aria-label=Svarudkast]", mobilTekst); await click(".ejer-mail-mobilpaneler button", "Samtale"); await wait("document.getElementById('mobilfane-samtale')?.getAttribute('aria-selected')==='true'", "Mobilfanen Samtale blev ikke aktiv"); await click(".ejer-mail-mobilpaneler button", "Svar og AI");
  proof.checks.mobile390 = await js(`(()=>{const svar=document.getElementById('mobilpanel-svar'),samtale=document.getElementById('mobilpanel-samtale'),felt=document.querySelector('textarea[aria-label=Svarudkast]');return{activeTab:document.querySelector('.ejer-mail-mobilpaneler [aria-selected=true]')?.innerText,responseDisplay:getComputedStyle(svar).display,conversationDisplay:getComputedStyle(samtale).display,draftPreserved:felt.value.includes('Mobil usendt linje 2'),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,focused:document.activeElement===felt,fieldRect:felt.getBoundingClientRect().toJSON()}})()`);
  assert.equal(proof.checks.mobile390.activeTab, "Svar og AI"); assert.notEqual(proof.checks.mobile390.responseDisplay, "none"); assert.equal(proof.checks.mobile390.conversationDisplay, "none"); assert.equal(proof.checks.mobile390.draftPreserved, true); assert.equal(proof.checks.mobile390.horizontalOverflow, false); await click("textarea[aria-label=Svarudkast]"); proof.checks.mobile390.focused = await js("document.activeElement===document.querySelector('textarea[aria-label=Svarudkast]')"); proof.screenshots.push(await shot("11-mobil-aktiv-svarfane", 390, 844));
  await viewport(360, 800); await click("[role=tab]", "AI-chat"); await wait("document.getElementById('fane-ai-chat')?.getAttribute('aria-selected')==='true'", "AI-chatfanen blev ikke aktiv på mobil"); await type(".ejer-mail-aiinstruks textarea", "Mobil intern linje 1\nMobil intern linje 2");
  proof.checks.mobile360 = await js(`(()=>{const t=document.querySelector('.ejer-mail-aiinstruks textarea'),r=t.getBoundingClientRect();return{activeInnerTab:document.querySelector('.ejer-mail-ai-faner [aria-selected=true]')?.innerText,focused:document.activeElement===t,multiLine:t.value.includes('Mobil intern linje 2'),visible:r.top>=0&&r.bottom<=innerHeight,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,visualViewport:{width:visualViewport?.width||innerWidth,height:visualViewport?.height||innerHeight}}})()`);
  assert.equal(proof.checks.mobile360.activeInnerTab, "AI-chat"); assert.equal(proof.checks.mobile360.focused, true); assert.equal(proof.checks.mobile360.multiLine, true); assert.equal(proof.checks.mobile360.horizontalOverflow, false); proof.screenshots.push(await shot("12-mobil-ai-chat-fokus", 360, 800));
  proof.checks.fonts = await js(`({status:document.fonts.status,inter:document.fonts.check('14px Inter'),body:getComputedStyle(document.body).fontFamily,textarea:getComputedStyle(document.querySelector('textarea')).fontFamily,button:getComputedStyle(document.querySelector('button')).fontFamily})`);
  writeFileSync(join(OUT, "browser-proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof, null, 2));
} finally {
  try { socket.close(); } catch { /* lukning */ }
  try { edgeProcess.kill(); } catch { /* lukning */ }
  await pause(900);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Windows kan holde profilen kortvarigt. */ }
}
