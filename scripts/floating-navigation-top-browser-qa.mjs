import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TEST_EMAIL, TEST_PASSWORD } from "./seed-v1-colleague-emulator.mjs";

const BASE = process.env.VEYRO_QA_URL || "http://127.0.0.1:5197";
const PORT = Number(process.env.VEYRO_QA_DEBUG_PORT || 9368);
const OUT = resolve(process.argv[2] || "artifacts/veyro-flydende-menu-og-top-v1-2026-09-22");
const edge = [
  process.env.VEYRO_QA_BROWSER,
  join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
].filter(Boolean).find((candidate) => {
  try { return process.getBuiltinModule("node:fs").statSync(candidate).isFile(); }
  catch { return false; }
});
if (!edge) throw new Error("Microsoft Edge blev ikke fundet.");

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "veyro-flydende-nav-"));
const browser = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--force-device-scale-factor=1",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1440,900", `${BASE}/login`,
], { stdio: "ignore", windowsHide: true });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const getJson = async (path) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!response.ok) throw new Error(`DevTools svarede ${response.status}`);
  return response.json();
};

let page;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    const pages = await getJson("/json/list");
    page = pages.find((candidate) => candidate.type === "page" && candidate.url?.startsWith(BASE))
      || pages.find((candidate) => candidate.type === "page");
    if (page?.webSocketDebuggerUrl) break;
  } catch { /* Edge starter */ }
  await pause(200);
}
if (!page?.webSocketDebuggerUrl) throw new Error("Kunne ikke forbinde til QA-browseren.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((done, fail) => {
  socket.addEventListener("open", done, { once: true });
  socket.addEventListener("error", fail, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const response = JSON.parse(event.data);
  if (!response.id || !pending.has(response.id)) return;
  const handler = pending.get(response.id);
  pending.delete(response.id);
  response.error ? handler.reject(new Error(response.error.message)) : handler.resolve(response.result);
});
const call = (method, params = {}) => {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((done, fail) => pending.set(id, { resolve: done, reject: fail }));
};
const evaluate = async (expression) => {
  const response = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
};
const waitFor = async (expression, label, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await pause(100);
  }
  throw new Error(`Timeout: ${label}`);
};
const viewport = async (width, height) => call("Emulation.setDeviceMetricsOverride", {
  width, height, deviceScaleFactor: 1, mobile: width < 600, screenWidth: width, screenHeight: height,
});
const navigate = async (path) => {
  await call("Page.navigate", { url: `${BASE}${path}` });
  await waitFor("document.readyState === 'complete'", `${path} indlæst`);
  await waitFor("location.pathname !== '/login'", `${path} kræver login`);
  await waitFor("document.querySelector('.fc-sidehoved')", `${path} har V1-skal`);
  await pause(350);
};
const screenshot = async (filename) => {
  const result = await call("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  writeFileSync(join(OUT, filename), Buffer.from(result.data, "base64"));
  const metrics = await evaluate("({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,path:location.pathname})");
  return { filename, ...metrics, horizontalOverflow: metrics.scrollWidth > metrics.clientWidth };
};
const input = (selector, value) => `(()=>{const el=document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;

const report = { baseUrl: BASE, screenshots: [], checks: {} };
try {
  await call("Page.enable");
  await call("Runtime.enable");
  await viewport(1440, 900);
  await waitFor("document.querySelector('#fc-email')", "loginformular");
  await evaluate(input("#fc-email", TEST_EMAIL));
  await evaluate(input("#fc-kode", TEST_PASSWORD));
  await evaluate("document.querySelector('form button[type=submit]').click()");
  await waitFor("location.pathname !== '/login'", "lokalt syntetisk login");

  await navigate("/fleet-v2/livekort");
  report.screenshots.push(await screenshot("01-desktop-livekort-lukket-1440x900.png"));
  await evaluate("document.querySelector('.fc-menu-knap').click()");
  await waitFor("document.querySelector('#fc-flydende-navigation')", "flydende navigation");
  report.screenshots.push(await screenshot("02-desktop-fleet-menu-1440x900.png"));
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await waitFor("!document.querySelector('#fc-flydende-navigation')", "Escape lukker menu");
  report.checks.escapeClosedAndReturnedFocus = await evaluate("document.activeElement === document.querySelector('.fc-menu-knap')");
  await evaluate("document.querySelector('.fc-menu-knap').click()");
  await waitFor("document.querySelector('.fc-menu-skaerm')", "menu-overlay til klik-udenfor-kontrol", 5000);
  await evaluate("document.querySelector('.fc-menu-skaerm').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  await waitFor("!document.querySelector('#fc-flydende-navigation')", "klik udenfor lukker menu");
  report.checks.outsideClickClosed = true;

  await navigate("/facility-v2/indberetninger");
  report.screenshots.push(await screenshot("03-facility-indberetninger-1440x900.png"));
  report.checks.facility1440 = await evaluate("(()=>{const p=[...document.querySelectorAll('.triage-layout>.card')].map(e=>{const r=e.getBoundingClientRect();return {height:Math.round(r.height),bottom:Math.round(r.bottom),scroll:getComputedStyle(e).overflowY}});return {panels:p,viewport:innerHeight,bottomGap:innerHeight-p[0].bottom,caseLink:document.querySelector('.triage-case-link')?.textContent.trim()}})()");
  await viewport(1280, 800); await pause(250);
  report.screenshots.push(await screenshot("04-facility-indberetninger-1280x800.png"));
  report.checks.facility1280 = await evaluate("(()=>{const p=[...document.querySelectorAll('.triage-layout>.card')].map(e=>Math.round(e.getBoundingClientRect().bottom));return {panelBottoms:p,viewport:innerHeight,bottomGap:innerHeight-p[0]}})()");

  await viewport(1440, 900);
  await navigate("/fleet-v2/indberetninger");
  report.screenshots.push(await screenshot("05-fleet-indberetninger-1440x900.png"));
  report.checks.fleetPanels = await evaluate("(()=>{const p=[...document.querySelectorAll('.triage-layout>*')].filter(e=>!e.classList.contains('fleet-panel-handle')).map(e=>Math.round(e.getBoundingClientRect().bottom));return {panelBottoms:p,viewport:innerHeight,bottomGap:innerHeight-p[0]}})()");

  await viewport(390, 844);
  await navigate("/facility-v2/indberetninger");
  report.screenshots.push(await screenshot("06-mobil-facility-indberetninger-390x844.png"));
  await evaluate("document.querySelector('.fc-menu-knap').click()");
  await waitFor("document.querySelector('#fc-flydende-navigation')", "mobilens modulliste");
  report.screenshots.push(await screenshot("07-mobil-modulliste-390x844.png"));
  await evaluate("[...document.querySelectorAll('button.fc-flydende-modul')].find(e=>e.textContent.includes('Facility')).click()");
  await waitFor("document.querySelector('.fc-flydende-nav.fc-mobil-undermenu')", "mobilens FACILITY-undermenu");
  report.screenshots.push(await screenshot("08-mobil-facility-undermenu-390x844.png"));
  report.checks.mobile = await evaluate("({bodyLocked:document.body.classList.contains('fc-flydende-menu-aaben'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,back:[...document.querySelectorAll('button')].some(e=>e.textContent.includes('Tilbage'))})");

  writeFileSync(join(OUT, "qa-report.json"), JSON.stringify({ ok: true, ...report }, null, 2));
  console.log(JSON.stringify({ ok: true, output: OUT, ...report }, null, 2));
} finally {
  try { socket.close(); } catch { /* lukker */ }
  try { browser.kill(); } catch { /* lukker */ }
  await pause(500);
  const resolved = resolve(profile);
  if (resolved.startsWith(`${resolve(tmpdir())}${process.platform === "win32" ? "\\" : "/"}`)) {
    try { rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { /* Edge kan kortvarigt beholde filer låst på Windows. */ }
  }
}
