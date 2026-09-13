import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const BASE = process.env.OWNER_REVIEW_URL || "http://127.0.0.1:5211";
const OUT = join(process.cwd(), "docs", "screenshots", "ejer-review-v8-1-mobile-ai-history");
const PORT = Number(process.env.OWNER_REVIEW_DEBUG_PORT || 9471);
const EMAIL = process.env.VITE_DEV_EJER_MAIL;
const KODE = process.env.VITE_DEV_BRUGER_KODE;
const edge = [
  join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
  join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"),
].find((path) => { try { return statSync(path).isFile(); } catch { return false; } });

if (!edge || !EMAIL || !KODE) throw new Error("Lokal Edge eller loginfixture mangler.");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "veyro-v8-mobile-ai-"));
const edgeProcess = spawn(edge, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  "--edge-skip-compat-layer-relaunch", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, "--window-size=390,844", `${BASE}/login`,
], { stdio: "ignore" });

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getJson = async (path) => (await fetch(`http://127.0.0.1:${PORT}${path}`)).json();
let page;
for (let i = 0; i < 80; i += 1) {
  try {
    const pages = await getJson("/json/list");
    page = pages.find((post) => post.type === "page" && post.url?.startsWith(BASE)) || pages.find((post) => post.type === "page");
    if (page?.webSocketDebuggerUrl) break;
  } catch { /* browseren starter */ }
  await pause(250);
}
if (!page?.webSocketDebuggerUrl) throw new Error("Reviewbrowseren kunne ikke åbnes.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, fail) => { socket.addEventListener("open", ok, { once: true }); socket.addEventListener("error", fail, { once: true }); });
let seq = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data); const entry = pending.get(message.id); if (!entry) return;
  pending.delete(message.id); message.error ? entry.fail(new Error(message.error.message)) : entry.ok(message.result);
});
const cdp = (method, params = {}) => {
  const id = ++seq; socket.send(JSON.stringify({ id, method, params }));
  return new Promise((ok, fail) => pending.set(id, { ok, fail }));
};
const js = async (expression) => {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
};
const wait = async (expression, message, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(expression)) return; await pause(150); }
  throw new Error(message);
};
const viewport = async (width, height) => {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height });
  await pause(250);
};
const go = async (path) => {
  await cdp("Page.navigate", { url: `${BASE}${path}` });
  await wait("document.readyState==='complete'", `Kunne ikke åbne ${path}`); await pause(650);
};
const clickText = async (selector, value) => {
  const ok = await js(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>(x.textContent||'').includes(${JSON.stringify(value)}));if(!e)return false;e.click();return true})()`);
  if (!ok) throw new Error(`Mangler ${value}`); await pause(250);
};
const type = async (selector, value) => {
  const ok = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const set=Object.getOwnPropertyDescriptor(proto,'value').set;set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  if (!ok) throw new Error(`Mangler ${selector}`); await pause(200);
};
const shot = async (name, width, height) => {
  await viewport(width, height); const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const path = join(OUT, `${width}x${height}-${name}.png`); writeFileSync(path, Buffer.from(result.data, "base64")); return path;
};
const measure = async () => js(`(()=>{const h=document.querySelector('.ejer-ai-chathistorik'),p=document.querySelector('#panel-ai-chat'),c=document.querySelector('[data-testid=fast-ai-chat-komposer]'),t=c?.querySelector('textarea'),r=h?.getBoundingClientRect(),line=parseFloat(getComputedStyle(h).lineHeight);return{panelHeight:Math.round(p?.getBoundingClientRect().height||0),historyClientHeight:h?.clientHeight||0,historyScrollHeight:h?.scrollHeight||0,historyScrollTop:h?.scrollTop||0,historyScrollMax:Math.max(0,(h?.scrollHeight||0)-(h?.clientHeight||0)),historyVisibleLineCapacity:Number(((h?.clientHeight||0)/line).toFixed(2)),historyOverflowY:getComputedStyle(h).overflowY,historyVisible:Boolean(r&&r.top>=0&&r.bottom<=innerHeight),composerVisible:Boolean(c&&c.getBoundingClientRect().top>=0&&c.getBoundingClientRect().bottom<=innerHeight),unsentText:t?.value||'',horizontalOverflow:document.documentElement.scrollWidth>innerWidth}})()`);

const proof = { version: "V8.1 mobil AI-historik", capturedAtUtc: new Date().toISOString(), base: BASE, known: {}, unknown: {}, screenshots: [] };
try {
  await cdp("Page.enable"); await cdp("Runtime.enable"); await viewport(390, 844); await go("/login");
  if (!(await js("location.pathname.startsWith('/main')"))) {
    await type("input[type=email]", EMAIL); await type("input[type=password]", KODE); await clickText("button", "Log ind");
    await wait("location.pathname.startsWith('/main')", "Normalt ejerlogin fejlede");
  }

  await go("/main/support?sag=v8-support-kendt");
  await clickText(".ejer-mail-mobilpaneler button", "Svar og AI"); await clickText("[role=tab]", "AI-chat");
  if (!(await js("document.body.innerText.includes('Dokumenterede fakta')"))) {
    await type("[data-testid=fast-ai-chat-komposer] textarea", "Find den dokumenterede løsning og vis de relevante kilder.");
    await clickText("button", "Fejlsøg og foreslå svar"); await wait("document.body.innerText.includes('Dokumenterede fakta')", "Kendt AI-svar mangler");
  }
  await type("[data-testid=fast-ai-chat-komposer] textarea", "Usendt mobiltekst bevares ved faneskift");
  await clickText("[role=tab]", "Oplysninger"); await clickText("[role=tab]", "AI-chat");
  await js("document.querySelector('.ejer-mail-svarfokus').scrollIntoView({block:'start'})"); await pause(200);
  proof.known.top = await measure();
  proof.known.readableAnswer = await js("document.querySelector('.ejer-ai-chathistorik')?.innerText.includes('Log helt ud')");
  proof.known.unsentPreserved = proof.known.top.unsentText.includes("Usendt mobiltekst");
  assert.ok(proof.known.top.historyClientHeight >= 240); assert.ok(proof.known.top.historyVisibleLineCapacity >= 10);
  assert.equal(proof.known.top.historyOverflowY, "auto"); assert.equal(proof.known.top.horizontalOverflow, false);
  assert.equal(proof.known.readableAnswer, true); assert.equal(proof.known.unsentPreserved, true);
  proof.screenshots.push(await shot("kendt-svar-og-usendt-tekst", 390, 844));
  proof.known.scroll = await js(`(()=>{const h=document.querySelector('.ejer-ai-chathistorik');const before=h.scrollTop;h.scrollTop=h.scrollHeight;return{before,after:h.scrollTop,max:h.scrollHeight-h.clientHeight,advanced:h.scrollTop>before}})()`);
  assert.equal(proof.known.scroll.advanced, true); proof.screenshots.push(await shot("kendt-historik-rullet", 390, 844));

  await viewport(360, 800); await go("/main/support?sag=v8-support-ukendt");
  await clickText(".ejer-mail-mobilpaneler button", "Svar og AI"); await clickText("[role=tab]", "AI-chat");
  if (!(await js("document.body.innerText.includes('Ingen tilstrækkelig godkendt viden')"))) {
    await type("[data-testid=fast-ai-chat-komposer] textarea", "Stil de nødvendige spørgsmål uden at opfinde en løsning.");
    await clickText("button", "Fejlsøg og foreslå svar"); await wait("document.body.innerText.includes('Ingen tilstrækkelig godkendt viden')", "Ukendt-sagens spørgsmål mangler");
  }
  await type("[data-testid=fast-ai-chat-komposer] textarea", "Usendt afklaring bevares");
  await clickText("[role=tab]", "Svarudkast"); await clickText("[role=tab]", "AI-chat");
  await js("document.querySelector('.ejer-mail-svarfokus').scrollIntoView({block:'start'});document.querySelector('.ejer-ai-chathistorik').scrollTop=document.querySelector('.ejer-ai-chathistorik').scrollHeight"); await pause(200);
  proof.unknown.bottom = await measure();
  proof.unknown.questionsVisible = await js(`(()=>{const t=document.querySelector('.ejer-ai-chathistorik')?.innerText||'';return{version:t.includes('produktversion'),error:t.includes('fejltekst eller log'),attempts:t.includes('allerede udførte fejlsøgningstrin')}})()`);
  proof.unknown.unsentPreserved = proof.unknown.bottom.unsentText.includes("Usendt afklaring");
  assert.ok(proof.unknown.bottom.historyClientHeight >= 240); assert.ok(proof.unknown.bottom.historyScrollTop > 0);
  assert.deepEqual(proof.unknown.questionsVisible, { version: true, error: true, attempts: true }); assert.equal(proof.unknown.unsentPreserved, true);
  assert.equal(proof.unknown.bottom.horizontalOverflow, false);
  proof.screenshots.push(await shot("ukendt-spoergsmaal-og-usendt-tekst", 360, 800));
  writeFileSync(join(OUT, "measurements.json"), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof, null, 2));
} finally {
  try { socket.close(); } catch { /* luk */ }
  try { edgeProcess.kill(); } catch { /* luk */ }
  await pause(800); try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Edge kan holde profilen kort */ }
}
