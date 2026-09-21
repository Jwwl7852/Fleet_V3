import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TEST_EMAIL, TEST_PASSWORD } from "./seed-v1-colleague-emulator.mjs";

const baseUrl = process.env.VEYRO_BROWSER_QA_URL || "http://127.0.0.1:5197";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl)) throw new Error("Livekort-QA må kun køre mod localhost.");
const outputDir = path.resolve(process.argv[2] || "artifacts/livekort-v1-2026-09-21");
await mkdir(outputDir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const progress = (message) => process.stdout.write(`[livekort-qa] ${message}\n`);

async function edgeExecutable() {
  const root = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application";
  const versions = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+\./.test(entry.name))
    .map((entry) => entry.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = path.join(root, version, "msedge.exe");
    try { await access(candidate); return candidate; } catch { /* fortsæt */ }
  }
  throw new Error("Microsoft Edge blev ikke fundet.");
}

async function openBrowser() {
  const profileDir = await mkdtemp(path.join(tmpdir(), "veyro-live-map-"));
  progress("Starter lokal Edge");
  const debugPort = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(await edgeExecutable(), ["--headless=new", "--edge-skip-compat-layer-relaunch", `--remote-debugging-port=${debugPort}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profileDir}`, "--no-first-run", "--disable-default-apps", "about:blank"], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let browserEndpoint = null;
  for (let attempt = 0; attempt < 100 && !browserEndpoint; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) browserEndpoint = (await response.json()).webSocketDebuggerUrl;
    } catch { /* browseren starter stadig */ }
    if (!browserEndpoint) await sleep(100);
  }
  if (!browserEndpoint) throw new Error("Kunne ikke oprette forbindelse til den lokale Edge-kontrolport.");
  progress("Edge-kontrolport er klar");
  const socket = new WebSocket(browserEndpoint);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout ved forbindelse til Edge.")), 10000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Edge WebSocket kunne ikke åbnes.")); }, { once: true });
  });
  let sequence = 0; const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)); if (!message.id) return;
    const request = pending.get(message.id); if (!request) return; pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result || {});
  });
  const send = (method, params = {}, sessionId) => {
    const id = ++sequence; const packet = { id, method, params }; if (sessionId) packet.sessionId = sessionId;
    socket.send(JSON.stringify(packet));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
  const targets = await send("Target.getTargets"); const page = targets.targetInfos.find((target) => target.type === "page");
  const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId);
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
  };
  const waitFor = async (expression, label, attempts = 400) => {
    for (let index = 0; index < attempts; index += 1) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(75); }
    throw new Error(`Timeout: ${label}`);
  };
  const viewport = (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 480 }, sessionId);
  const screenshot = async (file) => {
    const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId);
    await writeFile(path.join(outputDir, file), Buffer.from(shot.data, "base64"));
  };
  const close = async () => {
    try { await send("Browser.close"); } catch { child.kill(); }
    socket.close();
    const resolved = path.resolve(profileDir);
    if (resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`) && path.basename(resolved).startsWith("veyro-live-map-")) await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
  };
  return { close, evaluate, screenshot, send, sessionId, viewport, waitFor };
}

const setInput = (selector, value) => `(()=>{const node=document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;
const clickText = (selector, text) => `(()=>{const node=[...document.querySelectorAll(${JSON.stringify(selector)})].find((item)=>item.textContent.trim()===${JSON.stringify(text)});if(!node)return false;node.click();return true})()`;

const browser = await openBrowser();
const report = { capturedAtUtc: new Date().toISOString(), source: "synthetic-live-map-fixture", providerVerified: false, screenshots: [], checks: {} };
try {
  progress("Åbner Livekort");
  await browser.viewport(1440, 900);
  await browser.send("Page.navigate", { url: `${baseUrl}/fleet-v2/livekort` }, browser.sessionId);
  await browser.waitFor("document.querySelector('#fc-email')", "login");
  progress("Logger ind i lokal test");
  await browser.evaluate(setInput("#fc-email", TEST_EMAIL));
  await browser.evaluate(setInput("#fc-kode", TEST_PASSWORD));
  await browser.evaluate("document.querySelector('form button[type=submit]').click()");
  await browser.waitFor("document.querySelector('.live-map-page-v2')", "Livekort efter login");
  progress("Livekort indlæst");
  await sleep(500);
  await browser.screenshot("01-live-1440x900.png"); report.screenshots.push("01-live-1440x900.png");
  progress("Live 1440×900 kontrolleret");
  report.checks.live = await browser.evaluate("({units:document.querySelectorAll('.live-unit-card').length,markers:document.querySelectorAll('.geo-marker').length,statusFilters:document.querySelectorAll('.live-status-tabs button').length,unitTypeOptions:[...document.querySelector('select[aria-label=\"Enhedstype\"]')?.options||[]].map((item)=>item.textContent),horizontal:document.documentElement.scrollWidth>innerWidth})");

  assert(await browser.evaluate(clickText(".live-mode-switch button", "Historik")), "Historikknap mangler"); await sleep(300);
  await browser.screenshot("02-historik-kort-1440x900.png"); report.screenshots.push("02-historik-kort-1440x900.png");
  progress("Historikkort kontrolleret");
  report.checks.historyMap = await browser.evaluate("({routeSegments:document.querySelectorAll('.geo-route-overlay polyline').length,trips:document.querySelectorAll('.history-events>button').length,stops:document.querySelectorAll('.history-stop').length,gaps:document.querySelectorAll('.history-gap').length})");
  await browser.evaluate("document.querySelector('.history-export summary').click()");
  report.checks.export = await browser.evaluate("({choices:[...document.querySelectorAll('.history-export div button')].map((item)=>item.textContent.trim()),scope:document.querySelector('.history-export small')?.textContent})");
  await browser.evaluate("document.querySelector('.history-export summary').click()");

  await browser.evaluate("document.querySelector('.history-period-button').click()"); await sleep(150);
  await browser.screenshot("03-periodepopup-1440x900.png"); report.screenshots.push("03-periodepopup-1440x900.png");
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, browser.sessionId);
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" }, browser.sessionId); await sleep(120);
  report.checks.periodPopup = await browser.evaluate("({closed:!document.querySelector('.history-period-popup'),focusReturned:document.activeElement===document.querySelector('.history-period-button')})");

  assert(await browser.evaluate(clickText(".history-tabs button", "Positioner")), "Positionsfane mangler"); await sleep(250);
  await browser.screenshot("04-positioner-1440x900.png"); report.screenshots.push("04-positioner-1440x900.png");
  report.checks.positions = await browser.evaluate("({rows:document.querySelectorAll('.history-table-card tbody tr').length,selected:document.querySelectorAll('.history-table-card tbody tr.is-selected').length,detail:!!document.querySelector('.history-position-detail')})");

  assert(await browser.evaluate(clickText(".history-tabs button", "Målinger")), "Målingsfane mangler"); await sleep(250);
  await browser.screenshot("05-maalinger-1440x900.png"); report.screenshots.push("05-maalinger-1440x900.png");
  report.checks.measurements = await browser.evaluate("({charts:document.querySelectorAll('.metric-chart').length,missingDriveBattery:document.querySelector('.history-metric-summary')?.innerText.includes('Providerfelt ikke registreret')})");

  await browser.viewport(1280, 800); await sleep(250);
  report.checks.desktop1280 = await browser.evaluate("({horizontal:document.documentElement.scrollWidth>innerWidth,viewport:[innerWidth,innerHeight]})");
  await browser.screenshot("06-maalinger-1280x800.png"); report.screenshots.push("06-maalinger-1280x800.png");

  assert(await browser.evaluate(clickText(".history-tabs button", "Kort")), "Kortfane mangler");
  await browser.viewport(390, 844); await sleep(300);
  await browser.screenshot("07-historik-kort-390x844.png"); report.screenshots.push("07-historik-kort-390x844.png");
  report.checks.mobileHistory = await browser.evaluate("({horizontal:document.documentElement.scrollWidth>innerWidth,toolbar:getComputedStyle(document.querySelector('.history-toolbar')).gridTemplateColumns,mapHeight:Math.round(document.querySelector('.history-map-card').getBoundingClientRect().height)})");

  assert(await browser.evaluate(clickText(".live-mode-switch button", "Live")), "Liveknap mangler"); await sleep(200);
  await browser.screenshot("08-live-390x844.png"); report.screenshots.push("08-live-390x844.png");
  progress("Mobilvisninger kontrolleret");
  report.checks.mobileLive = await browser.evaluate("({horizontal:document.documentElement.scrollWidth>innerWidth,switches:document.querySelectorAll('.live-mobile-switch button').length})");

  await writeFile(path.join(outputDir, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  assert(!report.checks.live.horizontal && !report.checks.desktop1280.horizontal && !report.checks.mobileHistory.horizontal && !report.checks.mobileLive.horizontal, "Utilsigtet vandret siderulning fundet.");
  assert(report.checks.historyMap.routeSegments === 2 && report.checks.historyMap.gaps >= 1, "Historikruten viser ikke databrud korrekt.");
  assert(report.checks.periodPopup.closed && report.checks.periodPopup.focusReturned, "Periodepopup lukkede ikke med fokusretur.");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
