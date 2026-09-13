import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const BASE = process.env.OWNER_REVIEW_URL || "http://127.0.0.1:5213";
const OUT = join(process.cwd(), "docs", "screenshots", "ejer-review-v7-3-2");
const PORT = Number(process.env.OWNER_REVIEW_DEBUG_PORT || 9462);
const EMAIL = process.env.VITE_DEV_EJER_MAIL;
const KODE = process.env.VITE_DEV_BRUGER_KODE;
const edge = [
  join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
  join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"),
].find((sti) => { try { return statSync(sti).isFile(); } catch { return false; } });

if (!edge || !EMAIL || !KODE) throw new Error("Lokal Edge eller loginfixture mangler.");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "veyro-v732-"));
const edgeProcess = spawn(edge, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  "--edge-skip-compat-layer-relaunch", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, "--window-size=1920,1080", `${BASE}/login`,
], { stdio: "ignore" });
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));
const getJson = async (path) => (await fetch(`http://127.0.0.1:${PORT}${path}`)).json();
let page;
for (let forsøg = 0; forsøg < 80; forsøg += 1) {
  try {
    const pages = await getJson("/json/list");
    page = pages.find((post) => post.type === "page" && post.url?.startsWith(BASE)) || pages.find((post) => post.type === "page");
    if (page?.webSocketDebuggerUrl) break;
  } catch { /* Edge starter stadig. */ }
  await pause(250);
}
if (!page?.webSocketDebuggerUrl) throw new Error("Reviewbrowseren kunne ikke åbnes.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, fejl) => {
  socket.addEventListener("open", ok, { once: true });
  socket.addEventListener("error", fejl, { once: true });
});
let sekvens = 0;
const ventende = new Map();
socket.addEventListener("message", (event) => {
  const besked = JSON.parse(event.data);
  const vent = ventende.get(besked.id);
  if (!vent) return;
  ventende.delete(besked.id);
  besked.error ? vent.fejl(new Error(besked.error.message)) : vent.ok(besked.result);
});
const cdp = (method, params = {}) => {
  const id = ++sekvens;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((ok, fejl) => ventende.set(id, { ok, fejl }));
};
async function js(expression) {
  const svar = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (svar.exceptionDetails) throw new Error(svar.exceptionDetails.exception?.description || svar.exceptionDetails.text);
  return svar.result?.value;
}
async function wait(expression, message, ms = 30000) {
  const slut = Date.now() + ms;
  while (Date.now() < slut) {
    if (await js(expression)) return;
    await pause(150);
  }
  throw new Error(message);
}
async function viewport(width, height) {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height });
  await pause(250);
}
async function go(path) {
  await cdp("Page.navigate", { url: `${BASE}${path}` });
  await wait("document.readyState==='complete'", `Kunne ikke åbne ${path}`);
  await pause(500);
}
async function center(selector, text = "") {
  const punkt = await js(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>!${JSON.stringify(text)}||(x.textContent||'').includes(${JSON.stringify(text)}));if(!e)return null;e.scrollIntoView({block:'center',inline:'nearest'});const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  if (!punkt) throw new Error(`Mangler kontrol: ${selector} ${text}`);
  return punkt;
}
async function click(selector, text = "") {
  const punkt = await center(selector, text);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: punkt.x, y: punkt.y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: punkt.x, y: punkt.y, button: "left", clickCount: 1 });
  await pause(160);
}
async function selectAll() {
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
}
async function enter() {
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await cdp("Input.dispatchKeyEvent", { type: "char", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
}
async function typeLines(selector, lines) {
  await click(selector);
  await selectAll();
  await cdp("Input.insertText", { text: lines[0] });
  for (const line of lines.slice(1)) {
    await enter();
    await cdp("Input.insertText", { text: line });
  }
  await pause(180);
}
async function shot(name, width, height) {
  await viewport(width, height);
  const svar = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const fil = join(OUT, `${width}x${height}-${name}.png`);
  writeFileSync(fil, Buffer.from(svar.data, "base64"));
  return fil;
}

const rectExpression = (panel, scroll, composer) => `(()=>{
  const p=document.querySelector(${JSON.stringify(panel)}),s=document.querySelector(${JSON.stringify(scroll)}),c=document.querySelector(${JSON.stringify(composer)});
  const pr=p.getBoundingClientRect(),sr=s.getBoundingClientRect(),cr=c.getBoundingClientRect();
  return {panel:{top:pr.top,bottom:pr.bottom,height:pr.height},scroll:{top:sr.top,bottom:sr.bottom,height:sr.height,scrollTop:s.scrollTop,scrollHeight:s.scrollHeight,clientHeight:s.clientHeight},composer:{top:cr.top,bottom:cr.bottom,height:cr.height},nonOverlap:sr.bottom<=cr.top+1,composerVisible:cr.top>=0&&cr.bottom<=innerHeight,activeComposers:[...document.querySelectorAll('[data-testid^=fast]')].filter(e=>getComputedStyle(e).display!=='none').length};
})()`;

const proof = {
  version: "V7.3.2",
  capturedAtUtc: new Date().toISOString(),
  base: BASE,
  route: "/main/mail/indbakker?postkasse=faelles&sag=v7-pilot-nordlys",
  case: "v7-pilot-nordlys",
  normalLogin: false,
  reload: false,
  viewports: ["1440x900", "1920x1080", "390x844", "360x800"],
  desktop: {},
  mobile: {},
  screenshots: [],
};

async function verifyDesktop(width, height) {
  await viewport(width, height);
  await go(proof.route);
  await wait("Boolean(document.querySelector('[data-testid=fast-hurtiginstruks]'))", "Svarudkastets faste komposer mangler");
  const initial = await js(rectExpression("#panel-svarudkast", ".ejer-mail-ai-scrollregion", "[data-testid=fast-hurtiginstruks]"));
  assert.equal(initial.nonOverlap, true);
  assert.equal(initial.composerVisible, true);
  assert.equal(initial.activeComposers, 1);
  proof.screenshots.push(await shot("svarudkast-top", width, height));

  const leftBefore = await js("document.querySelector('.ejer-mail-venstrehistorik').scrollTop");
  await js("(()=>{const e=document.querySelector('.ejer-mail-ai-scrollregion');e.scrollTop=e.scrollHeight;return e.scrollTop})()");
  await pause(200);
  const bottom = await js(rectExpression("#panel-svarudkast", ".ejer-mail-ai-scrollregion", "[data-testid=fast-hurtiginstruks]"));
  const leftAfter = await js("document.querySelector('.ejer-mail-venstrehistorik').scrollTop");
  assert.ok(bottom.scroll.scrollTop > 0);
  assert.equal(bottom.nonOverlap, true);
  assert.equal(bottom.composerVisible, true);
  assert.ok(Math.abs(bottom.composer.top - initial.composer.top) < 1);
  assert.equal(leftAfter, leftBefore);
  proof.screenshots.push(await shot("svarudkast-bund", width, height));

  const draftLines = [`V7.3.2 ${width}: første usendte linje`, "Anden linje via Enter", "Tredje linje bevares ved faneskift"];
  await typeLines("[data-testid=fast-hurtiginstruks] textarea", draftLines);
  await click("[role=tab]", "AI-chat");
  await wait("Boolean(document.querySelector('[data-testid=fast-ai-chat-komposer]'))", "AI-chattens faste komposer mangler");
  const beforeExchangeCount = await js("document.querySelectorAll('.ejer-ai-udveksling').length");
  const preservedInChat = await js("document.querySelector('[data-testid=fast-ai-chat-komposer] textarea').value");
  assert.ok(preservedInChat.includes(draftLines[2]));
  const chatInitial = await js(rectExpression("#panel-ai-chat", ".ejer-ai-chathistorik", "[data-testid=fast-ai-chat-komposer]"));
  const firstVisible = await js(`(()=>{const h=document.querySelector('.ejer-ai-chathistorik'),e=h.firstElementChild,hr=h.getBoundingClientRect(),er=e.getBoundingClientRect();return{top:er.top,bottom:er.bottom,visiblePixels:Math.max(0,Math.min(hr.bottom,er.bottom)-Math.max(hr.top,er.top))}})()`);
  assert.equal(chatInitial.nonOverlap, true);
  assert.equal(chatInitial.composerVisible, true);
  assert.ok(chatInitial.scroll.height >= 128);
  assert.ok(firstVisible.visiblePixels >= 60);
  proof.screenshots.push(await shot("ai-chat-top", width, height));

  await js("(()=>{const e=document.querySelector('.ejer-ai-chathistorik');e.scrollTop=e.scrollHeight;return e.scrollTop})()");
  await pause(200);
  const chatBottom = await js(rectExpression("#panel-ai-chat", ".ejer-ai-chathistorik", "[data-testid=fast-ai-chat-komposer]"));
  const lastVisible = await js(`(()=>{const h=document.querySelector('.ejer-ai-chathistorik'),e=h.lastElementChild,hr=h.getBoundingClientRect(),er=e.getBoundingClientRect();return{top:er.top,bottom:er.bottom,endVisible:er.bottom<=hr.bottom+1&&er.bottom>=hr.top+40}})()`);
  assert.ok(chatBottom.scroll.scrollTop > 0);
  assert.equal(chatBottom.nonOverlap, true);
  assert.equal(chatBottom.composerVisible, true);
  assert.ok(Math.abs(chatBottom.composer.top - chatInitial.composer.top) < 1);
  assert.equal(lastVisible.endVisible, true);
  proof.screenshots.push(await shot("ai-chat-bund", width, height));

  await typeLines("[data-testid=fast-ai-chat-komposer] textarea", draftLines);
  const afterExchangeCount = await js("document.querySelectorAll('.ejer-ai-udveksling').length");
  assert.equal(afterExchangeCount, beforeExchangeCount);
  await click("[role=tab]", "Svarudkast");
  const preservedBack = await js("document.querySelector('[data-testid=fast-hurtiginstruks] textarea').value");
  assert.ok(preservedBack.includes(draftLines[2]));
  await click("[role=tab]", "Oplysninger");
  const infoComposers = await js("[...document.querySelectorAll('[data-testid^=fast]')].filter(e=>getComputedStyle(e).display!=='none').length");
  assert.equal(infoComposers, 0);

  return {
    response: { initial, bottom, leftBefore, leftAfter },
    aiChat: { initial: chatInitial, bottom: chatBottom, firstVisible, lastVisible },
    draft: { lines: draftLines.length, preservedInChat: true, preservedBack: true, enterTriggeredExchange: afterExchangeCount !== beforeExchangeCount },
    informationTabActiveComposers: infoComposers,
  };
}

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await viewport(1440, 900);
  await go("/login");
  if (!(await js("location.pathname.startsWith('/main')"))) {
    await typeLines("input[type=email]", [EMAIL]);
    await typeLines("input[type=password]", [KODE]);
    await click("button", "Log ind");
    await wait("location.pathname.startsWith('/main')", "Normalt ejerlogin fejlede");
  }
  proof.normalLogin = true;
  await go(proof.route);
  await cdp("Page.reload", { ignoreCache: true });
  await wait("Boolean(document.querySelector('[data-testid=fast-hurtiginstruks]'))", "Reviewdata forsvandt efter reload");
  proof.reload = true;
  proof.desktop["1440x900"] = await verifyDesktop(1440, 900);
  proof.desktop["1920x1080"] = await verifyDesktop(1920, 1080);

  await viewport(390, 844);
  await go(proof.route);
  await click(".ejer-mail-mobilpaneler button", "Svar og AI");
  await typeLines("[data-testid=fast-hurtiginstruks] textarea", ["Mobil usendt linje 1", "Mobil usendt linje 2"]);
  await click(".ejer-mail-mobilpaneler button", "Samtale");
  await click(".ejer-mail-mobilpaneler button", "Svar og AI");
  proof.mobile["390x844"] = await js(`(()=>{const t=document.querySelector('[data-testid=fast-hurtiginstruks] textarea');return{active:document.querySelector('.ejer-mail-mobilpaneler [aria-selected=true]')?.innerText,preserved:t.value.includes('Mobil usendt linje 2'),horizontalOverflow:document.documentElement.scrollWidth>innerWidth}})()`);
  assert.equal(proof.mobile["390x844"].preserved, true);
  assert.equal(proof.mobile["390x844"].horizontalOverflow, false);
  await center("[data-testid=fast-hurtiginstruks]");
  proof.screenshots.push(await shot("mobil-svar", 390, 844));

  await viewport(360, 800);
  await click("[role=tab]", "AI-chat");
  await typeLines("[data-testid=fast-ai-chat-komposer] textarea", ["Mobil intern linje 1", "Mobil intern linje 2"]);
  proof.mobile["360x800"] = await js(`(()=>{const t=document.querySelector('[data-testid=fast-ai-chat-komposer] textarea');return{active:document.querySelector('.ejer-mail-ai-faner [aria-selected=true]')?.innerText,preserved:t.value.includes('Mobil intern linje 2'),focused:document.activeElement===t,horizontalOverflow:document.documentElement.scrollWidth>innerWidth}})()`);
  assert.equal(proof.mobile["360x800"].preserved, true);
  assert.equal(proof.mobile["360x800"].horizontalOverflow, false);
  await center("[data-testid=fast-ai-chat-komposer]");
  proof.screenshots.push(await shot("mobil-ai-chat", 360, 800));

  proof.font = await js(`({status:document.fonts.status,inter:document.fonts.check('14px Inter'),body:getComputedStyle(document.body).fontFamily,textarea:getComputedStyle(document.querySelector('textarea')).fontFamily})`);
  writeFileSync(join(OUT, "browser-measurements.json"), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof, null, 2));
} finally {
  try { socket.close(); } catch { /* lukning */ }
  try { edgeProcess.kill(); } catch { /* lukning */ }
  await pause(900);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Edge kan holde profilen kortvarigt. */ }
}
