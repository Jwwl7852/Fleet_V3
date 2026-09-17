import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const BASE = process.env.VEYRO_OVERVIEW_URL || "http://127.0.0.1:5199";
const PORT = Number(process.env.VEYRO_OVERVIEW_DEBUG_PORT || 9341);
const OUT = resolve(process.env.VEYRO_OVERVIEW_OUTPUT || "artifacts/veyro-moduloverblik-v1-2026-09-17/screenshots");
const CODE_COMMIT = process.env.VEYRO_OVERVIEW_COMMIT || "ikke-angivet";
const EMAIL = process.env.VITE_DEV_EJER_MAIL || "";
const PASSWORD = process.env.VITE_DEV_BRUGER_KODE || "";
const ALLOW_ERRORS = process.env.VEYRO_OVERVIEW_ALLOW_ERRORS === "1";
const routes = [
  ["fleet", "/fleet-v2"],
  ["facility", "/facility-v2"],
  ["procure", "/indkoeb"],
  ["workforce", "/workforce-v2"],
  ["unitbooking", "/unitbooking"],
  ["warehouse", "/warehouse"],
];

const edge = [
  process.env.VEYRO_OVERVIEW_BROWSER,
  join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
].filter(Boolean).find((path) => { try { return process.getBuiltinModule("node:fs").statSync(path).isFile(); } catch { return false; } });
if (!edge) throw new Error("Microsoft Edge blev ikke fundet.");

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "veyro-overviews-v1-"));
const processHandle = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--force-device-scale-factor=1",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1440,900", `${BASE}/fleet-v2`,
], { stdio: "ignore" });
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));
const json = async (path) => { const response = await fetch(`http://127.0.0.1:${PORT}${path}`); if (!response.ok) throw new Error(`DevTools ${response.status}`); return response.json(); };
let page;
for (let index = 0; index < 60; index += 1) {
  try {
    const pages = await json("/json/list");
    page = pages.find((candidate) => candidate.type === "page" && candidate.url?.startsWith(BASE)) || pages.find((candidate) => candidate.type === "page");
    if (page?.webSocketDebuggerUrl) break;
  } catch { /* browseren starter */ }
  await pause(250);
}
if (!page?.webSocketDebuggerUrl) throw new Error("Kunne ikke forbinde til capturebrowseren.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const response = JSON.parse(event.data);
  if (!response.id || !pending.has(response.id)) return;
  const handler = pending.get(response.id); pending.delete(response.id);
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
async function waitFor(expression, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(100); }
  throw new Error(message);
}
async function setViewport(width, height) {
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600, screenWidth: width, screenHeight: height });
}
async function navigate(path) {
  await call("Page.navigate", { url: `${BASE}${path}` });
  await waitFor("document.readyState === 'complete'", `${path} blev ikke indlæst`);
  await waitFor(ALLOW_ERRORS ? "Boolean(document.querySelector('.fc-overview-kpis,[role=alert]'))" : "Boolean(document.querySelector('.fc-overview-kpis'))", `${path} viste ikke overblikket`);
  await pause(200);
}
async function capture(name, width, height) {
  await setViewport(width, height);
  await pause(120);
  const result = await call("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const file = join(OUT, `${width}x${height}-${name}.png`);
  writeFileSync(file, Buffer.from(result.data, "base64"));
  return file;
}

const captures = [];
try {
  await call("Page.enable"); await call("Runtime.enable");
  if (EMAIL && PASSWORD) {
    await call("Page.navigate", { url: `${BASE}/login` });
    await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('form'))", "Loginformularen blev ikke klar");
    await evaluate(`(()=>{const set=(selector,value)=>{const element=document.querySelector(selector);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));};set('input[type=email]',${JSON.stringify(EMAIL)});set('input[type=password]',${JSON.stringify(PASSWORD)});document.querySelector('form').requestSubmit();return true})()`);
    await waitFor("location.pathname !== '/login'", "Det lokale emulatorlogin fejlede", 15000);
  }
  for (const [name, path] of routes) {
    await setViewport(1440, 900); await navigate(path);
    captures.push({ file: `1440x900-${name}.png`, route: path, viewport: "1440x900", dataSource: "Tydeligt mærkede lokale syntetiske fixtures" });
    await capture(name, 1440, 900);
    await setViewport(390, 844); await pause(120);
    captures.push({ file: `390x844-${name}.png`, route: path, viewport: "390x844", dataSource: "Tydeligt mærkede lokale syntetiske fixtures" });
    await capture(name, 390, 844);
  }
  writeFileSync(join(OUT, "capture-manifest.json"), `${JSON.stringify({
    codeCommit: CODE_COMMIT,
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    environment: EMAIL ? "Autentificeret Version 1-root-app mod lokale emulatorer" : "Isoleret Version 1-demo uden Firebase-forbindelse",
    zoom: "100 % arbejdsområde / browser 100 %",
    captures,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, output: OUT, count: captures.length }, null, 2));
} finally {
  try { socket.close(); } catch { /* allerede lukket */ }
  processHandle.kill(); await pause(250);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge frigiver profilen sent */ }
}
