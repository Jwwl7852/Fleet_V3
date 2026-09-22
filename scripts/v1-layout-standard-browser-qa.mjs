import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TEST_EMAIL, TEST_PASSWORD } from "./seed-v1-colleague-emulator.mjs";

const BASE = process.env.VEYRO_QA_URL || "http://127.0.0.1:5197";
const PORT = Number(process.env.VEYRO_QA_DEBUG_PORT || 9372);
const OUT = resolve(process.argv[2] || "artifacts/veyro-layoutstandard-v1-2026-09-22");
const edge = [
  process.env.VEYRO_QA_BROWSER,
  join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
].filter(Boolean).find((candidate) => {
  try { return statSync(candidate).isFile(); } catch { return false; }
});
if (!edge) throw new Error("Microsoft Edge blev ikke fundet.");

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "veyro-layoutstandard-"));
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
  await waitFor("document.querySelector('.fc-sidehoved h1')", `${path} har sidetitel`);
  await pause(250);
};
const screenshot = async (filename) => {
  const result = await call("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  writeFileSync(join(OUT, filename), Buffer.from(result.data, "base64"));
  const metrics = await evaluate("({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,path:location.pathname,title:document.querySelector('.fc-sidehoved h1')?.innerText})");
  return { filename, ...metrics, horizontalOverflow: metrics.scrollWidth > metrics.clientWidth };
};
const setInput = (selector, value) => `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;
const rect = (selector) => `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),bottom:Math.round(r.bottom)}})()`;

const report = { baseUrl: BASE, screenshots: [], checks: {}, modules: [] };
try {
  await call("Page.enable");
  await call("Runtime.enable");
  await viewport(1440, 900);
  await waitFor("document.querySelector('#fc-email')", "loginformular");
  await evaluate(setInput("#fc-email", TEST_EMAIL));
  await evaluate(setInput("#fc-kode", TEST_PASSWORD));
  await evaluate("document.querySelector('form button[type=submit]').click()");
  await waitFor("location.pathname !== '/login'", "lokalt syntetisk login");

  await navigate("/fleet-v2/indberetninger");
  await evaluate("document.querySelectorAll('.triage-list>button')[1]?.click()");
  await pause(200);
  report.screenshots.push(await screenshot("01-fleet-indberetninger-1440x900.png"));
  report.checks.fleetReports1440 = await evaluate(`(()=>({filters:[...document.querySelectorAll('.triage-filters .input-with-icon,.triage-filters select')].map(e=>Math.round(e.getBoundingClientRect().height)),panels:[...document.querySelectorAll('.fleet-three-panel>*')].filter(e=>!e.classList.contains('fleet-panel-handle')).map(e=>Math.round(e.getBoundingClientRect().bottom)),viewport:innerHeight,rows:[...document.querySelectorAll('.triage-list>button')].map(e=>Math.round(e.getBoundingClientRect().height)),statuses:[...document.querySelectorAll('.triage-list .status-badge')].map(e=>e.textContent.trim())}))()`);
  await evaluate(setInput(".triage-filters input", "findes-ikke"));
  await waitFor("document.querySelectorAll('.triage-list>button').length === 0", "tom indberetningsfiltrering");
  report.checks.fleetReportsEmpty = await evaluate("({empty:document.querySelector('.triage-list .empty-inline')?.innerText,panels:[...document.querySelectorAll('.fleet-three-panel>*')].filter(e=>!e.classList.contains('fleet-panel-handle')).map(e=>Math.round(e.getBoundingClientRect().bottom)),viewport:innerHeight})");
  await evaluate(setInput(".triage-filters input", "")); await pause(150);

  await navigate("/fleet-v2/arbejdsko");
  report.screenshots.push(await screenshot("02-fleet-arbejdsko-kanban-1440x900.png"));
  report.checks.workQueue = await evaluate(`(()=>{const k=${rect(".queue-kpis")},a=${rect(".queue-actions-toolbar")},b=${rect(".kanban-board")};return {kpis:k,actions:a,board:b,overlap:k.y+k.height>a.y,columns:[...document.querySelectorAll('.kanban-column')].map(e=>({height:Math.round(e.getBoundingClientRect().height),empty:!!e.querySelector('.kanban-empty'),cards:e.querySelectorAll('.queue-card').length})),fields:[...document.querySelectorAll('.queue-toolbar .input-with-icon,.queue-toolbar select')].map(e=>Math.round(e.getBoundingClientRect().height))}})()`);
  await evaluate(setInput(".queue-toolbar input", "findes-ikke"));
  await waitFor("document.querySelectorAll('.queue-card').length === 0", "tom Kanban-filtrering");
  report.screenshots.push(await screenshot("03-fleet-arbejdsko-tom-kanban-1440x900.png"));
  report.checks.emptyKanban = await evaluate("({columns:document.querySelectorAll('.kanban-column').length,emptyStates:document.querySelectorAll('.kanban-empty').length,boardHeight:Math.round(document.querySelector('.kanban-board').getBoundingClientRect().height)})");
  await evaluate(setInput(".queue-toolbar input", "")); await pause(150);

  await viewport(1280, 800); await pause(120);
  await evaluate("[...document.querySelectorAll('.queue-actions-toolbar button')].find(e=>e.textContent.trim()==='Tabel')?.click()");
  await waitFor("document.querySelector('.queue-table-shell')", "tabelvisning");
  report.screenshots.push(await screenshot("04-fleet-arbejdsko-tabel-1280x800.png"));
  report.checks.table = await evaluate(`(()=>({shell:${rect(".queue-table-shell")},rows:document.querySelectorAll('.queue-table-shell tbody tr').length,bodyHeight:document.body.scrollHeight,viewport:innerHeight}))()`);

  await viewport(1440, 900);
  await navigate("/facility-v2/indberetninger");
  report.screenshots.push(await screenshot("05-facility-indberetninger-1440x900.png"));
  report.checks.facilityReports = await evaluate("({filters:[...document.querySelectorAll('.compact-filters input,.compact-filters select')].map(e=>Math.round(e.getBoundingClientRect().height)),panels:[...document.querySelectorAll('.facility-three-panel>.card')].map(e=>Math.round(e.getBoundingClientRect().bottom)),viewport:innerHeight,rows:[...document.querySelectorAll('.master-list li button')].map(e=>Math.round(e.getBoundingClientRect().height)),statuses:[...document.querySelectorAll('.facility-report-status')].map(e=>e.textContent.trim())})");

  await viewport(1280, 800);
  for (const [module, path] of [
    ["FLEET", "/fleet-v2/indberetninger"], ["FACILITY", "/facility-v2/indberetninger"],
    ["PLANNING", "/planning-v2"], ["PROCURE", "/indkoeb"], ["WAREHOUSE", "/warehouse"],
    ["WORKFORCE", "/workforce-v2"], ["UNITBOOKING", "/unitbooking"],
    ["Fakturacenter", "/oekonomi/fakturacenter"], ["Ressourcer", "/ressourcer/enheder"], ["Opsætning", "/opsaetning"],
  ]) {
    await navigate(path);
    report.modules.push(await evaluate(`({module:${JSON.stringify(module)},path:location.pathname,title:document.querySelector('.fc-sidehoved h1')?.innerText,topContext:!!document.querySelector('.fc-top-kontekst'),horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})`));
  }
  for (const [filename, path] of [
    ["06-planning-1280x800.png", "/planning-v2"],
    ["07-procure-1280x800.png", "/indkoeb"],
    ["08-ressourcer-1280x800.png", "/ressourcer/enheder"],
  ]) { await navigate(path); report.screenshots.push(await screenshot(filename)); }
  await navigate("/fleet-v2/arbejdsko");
  await call("Page.reload", { ignoreCache: true });
  await waitFor("document.querySelector('.kanban-board')", "Arbejdskø efter genindlæsning");
  await navigate("/planning-v2");
  await navigate("/fleet-v2/arbejdsko");
  report.checks.reloadAndReturn = await evaluate("({title:document.querySelector('.fc-sidehoved h1')?.innerText,boardHeight:Math.round(document.querySelector('.kanban-board').getBoundingClientRect().height),caseCards:document.querySelectorAll('.queue-card').length})");

  await viewport(390, 844);
  await navigate("/fleet-v2/indberetninger");
  report.screenshots.push(await screenshot("09-fleet-indberetninger-390x844.png"));
  report.checks.mobileFleet = await evaluate("({horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,listVisible:!!document.querySelector('.triage-list-panel'),bodyHeight:document.body.scrollHeight})");
  await navigate("/facility-v2/indberetninger");
  report.screenshots.push(await screenshot("10-facility-indberetninger-390x844.png"));
  report.checks.mobileFacility = await evaluate("({horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,listVisible:!!document.querySelector('.triage-list'),bodyHeight:document.body.scrollHeight})");
  await navigate("/fleet-v2/arbejdsko");
  report.screenshots.push(await screenshot("11-fleet-arbejdsko-390x844.png"));
  report.checks.mobileWorkQueue = await evaluate("({horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,actionsVisible:!!document.querySelector('.queue-actions-toolbar'),columns:document.querySelectorAll('.kanban-column').length,bodyHeight:document.body.scrollHeight})");

  writeFileSync(join(OUT, "qa-report.json"), JSON.stringify({ ok: true, ...report }, null, 2));
  console.log(JSON.stringify({ ok: true, output: OUT, ...report }, null, 2));
} finally {
  try { socket.close(); } catch { /* lukker */ }
  try { browser.kill(); } catch { /* lukker */ }
  await pause(500);
  const resolved = resolve(profile);
  if (resolved.startsWith(`${resolve(tmpdir())}${process.platform === "win32" ? "\\" : "/"}`)) {
    try { rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Edge kan kortvarigt låse filer */ }
  }
}
