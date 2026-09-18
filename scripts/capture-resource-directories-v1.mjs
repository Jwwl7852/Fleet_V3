import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const BASE = process.env.VEYRO_RESOURCE_URL || "http://127.0.0.1:5197";
const PORT = Number(process.env.VEYRO_RESOURCE_DEBUG_PORT || 9352);
const OUT = resolve(process.env.VEYRO_RESOURCE_OUTPUT || "artifacts/veyro-ressourcer-kompakt-v1-2026-09-17/screenshots-after");
const CODE_COMMIT = process.env.VEYRO_RESOURCE_COMMIT || "working-tree";
const EMAIL = process.env.VITE_DEV_EJER_MAIL || "";
const PASSWORD = process.env.VITE_DEV_BRUGER_KODE || "";
const routes = [
  ["01-enheder", "/ressourcer/enheder", ".resource-directory-page"],
  ["02-ejendomme", "/facility-v2/ejendomme", ".resource-directory-page"],
  ["03-medarbejdere", "/ressourcer/medarbejdere", ".fc-ressource-side"],
  ["04-units", "/ressourcer/units", ".fc-ressource-side"],
  ["05-varekatalog", "/ressourcer/varekatalog", ".procure-v2.resource-directory-page"],
  ["06-lagerlokationer", "/ressourcer/lagerlokationer", ".fc-ressource-side"],
  ["07-certifikater", "/ressourcer/certifikater", ".fc-ressource-side"],
];
const viewports = [[1440, 900], [1280, 800], [390, 844]];

const edge = [
  process.env.VEYRO_RESOURCE_BROWSER,
  join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
].filter(Boolean).find((path) => {
  try { return process.getBuiltinModule("node:fs").statSync(path).isFile(); }
  catch { return false; }
});
if (!edge) throw new Error("Microsoft Edge blev ikke fundet.");
if (!EMAIL || !PASSWORD) throw new Error("Review-login skal komme fra procesmiljøet.");

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "veyro-resources-v1-"));
const browser = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--force-device-scale-factor=1",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--window-size=1440,900", `${BASE}/login`,
], { stdio: "ignore" });
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));
const json = async (path) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!response.ok) throw new Error(`DevTools ${response.status}`);
  return response.json();
};

let page;
for (let index = 0; index < 60; index += 1) {
  try {
    const pages = await json("/json/list");
    page = pages.find((candidate) => candidate.type === "page" && candidate.url?.startsWith(BASE))
      || pages.find((candidate) => candidate.type === "page");
    if (page?.webSocketDebuggerUrl) break;
  } catch { /* Edge starter */ }
  await pause(250);
}
if (!page?.webSocketDebuggerUrl) throw new Error("Kunne ikke forbinde til capturebrowseren.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", reject, { once: true });
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
  return new Promise((resolveCall, reject) => pending.set(id, { resolve: resolveCall, reject }));
};
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browserfejl");
  return result.result?.value;
}
async function waitFor(expression, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await pause(100);
  }
  throw new Error(message);
}
async function setViewport(width, height) {
  await call("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: width < 600,
    screenWidth: width, screenHeight: height,
  });
}

const captures = [];
const catalogCaptures = [];
try {
  await call("Page.enable");
  await call("Runtime.enable");
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('form'))", "Loginformularen blev ikke klar");
  await evaluate(`(()=>{const set=(selector,value)=>{const element=document.querySelector(selector);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));};set('input[type=email]',${JSON.stringify(EMAIL)});set('input[type=password]',${JSON.stringify(PASSWORD)});document.querySelector('form').requestSubmit();return true})()`);
  await waitFor("location.pathname !== '/login'", "Det lokale emulatorlogin fejlede");

  for (const [width, height] of viewports) {
    await setViewport(width, height);
    for (const [name, path, selector] of routes) {
      await call("Page.navigate", { url: `${BASE}${path}` });
      await waitFor("document.readyState === 'complete'", `${path} blev ikke indlæst`);
      await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, `${path} viste ikke registeret`);
      await pause(250);
      const metrics = await evaluate(`(()=>{const h=document.querySelector('h1');const rows=[...document.querySelectorAll('tr[role="button"],tr[role="link"]')];const local=[...document.querySelectorAll('.fc-scroll,.unit-table-shell,.table-scroll,.procure-table-wrap')].find(e=>e.scrollWidth>e.clientWidth);return {title:h?.textContent?.trim()||'',titleSize:h?getComputedStyle(h).fontSize:null,pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,localTableScroll:Boolean(local),clickableRows:rows.length,keyboardRows:rows.filter(r=>r.tabIndex===0).length,testMarker:document.body.innerText.includes('TEST')}})()`);
      const shot = await call("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const file = `${name}-${width}x${height}.png`;
      writeFileSync(join(OUT, file), Buffer.from(shot.data, "base64"));
      captures.push({
        file, route: path, viewport: `${width}x${height}`, zoom: "100 %",
        role: "syntetisk administrator", tenant: "procure-auth-a",
        dataSource: "tenantlagrede syntetiske data i lokale emulatorer",
        ...metrics,
      });
    }
  }
  const catalogOutput = join(OUT, "varekatalog-supplement");
  mkdirSync(catalogOutput, { recursive: true });
  const catalogScenarios = [
    ["varekatalog-alle-desktop-1440x900.png", 1440, 900, "", 12],
    ["varekatalog-el-filter-desktop-1440x900.png", 1440, 900, "?kategori=El-materiel", 2],
    ["varekatalog-alle-mobil-390x844.png", 390, 844, "", 12],
    ["varekatalog-lang-soegning-mobil-390x844.png", 390, 844, "?soeg=refleksmarkering", 1],
  ];
  for (const [file, width, height, query, expectedRows] of catalogScenarios) {
    await setViewport(width, height);
    await call("Page.navigate", { url: `${BASE}/ressourcer/varekatalog${query}` });
    await waitFor("document.readyState === 'complete'", "Varekataloget blev ikke indlæst");
    await waitFor("Boolean(document.querySelector('.procure-catalog-table'))", "Varekataloget viste ikke tabellen");
    await waitFor(`document.querySelectorAll('.procure-catalog-table tbody tr').length === ${expectedRows}`, `Varekataloget viste ikke ${expectedRows} varer`);
    await pause(250);
    const metrics = await evaluate(`(()=>{const rows=[...document.querySelectorAll('.procure-catalog-table tbody tr')];const table=document.querySelector('.procure-catalog-table');return {route:location.pathname+location.search,viewport:${JSON.stringify(`${width}x${height}`)},zoom:'100 %',rows:rows.length,keyboardRows:rows.filter(row=>row.tabIndex===0).length,pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,localTableScroll:Boolean(table&&table.scrollWidth>table.clientWidth),resultText:document.querySelector('.procure-result-count')?.textContent?.replace(/\\s+/g,' ').trim()||'',testMarker:document.body.innerText.includes('TEST')}})()`);
    const shot = await call("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    writeFileSync(join(catalogOutput, file), Buffer.from(shot.data, "base64"));
    catalogCaptures.push({
      file, role: "syntetisk administrator", tenant: "procure-auth-a",
      dataSource: "tenantlagrede syntetiske data i lokale emulatorer",
      ...metrics,
    });
  }
  writeFileSync(join(OUT, "capture-manifest.json"), `${JSON.stringify({
    codeCommit: CODE_COMMIT,
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    app: "Samlet Version 1-root-app med én AppShell",
    normalEmulatorLogin: true,
    externalServices: false,
    captures,
  }, null, 2)}\n`);
  writeFileSync(join(catalogOutput, "catalog-capture-manifest.json"), `${JSON.stringify({
    codeCommit: CODE_COMMIT,
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    app: "Samlet Version 1-root-app med én AppShell",
    normalEmulatorLogin: true,
    externalServices: false,
    captures: catalogCaptures,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, output: OUT, count: captures.length, catalogCount: catalogCaptures.length }, null, 2));
} finally {
  try { socket.close(); } catch { /* allerede lukket */ }
  browser.kill();
  await pause(250);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge kan frigive sent */ }
}
