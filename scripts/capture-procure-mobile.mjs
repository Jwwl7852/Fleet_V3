/**
 * Reproducerbar, isoleret mobil-QA mod den lokale Vite-preview.
 * Bruger kun syntetisk demoindhold i en midlertidig Edge-profil.
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = process.argv[2] || "http://127.0.0.1:5205";
const outputDir = process.argv[3];
const viewportWidth = Number(process.argv[4] || 390);
const viewportHeight = viewportWidth <= 360 ? 800 : 844;
if (!outputDir) throw new Error("Angiv en outputmappe til screenshots.");
await mkdir(outputDir, { recursive: true });

const profile = await mkdtemp(join(tmpdir(), "veyro-procure-mobile-"));
const port = 9300 + (process.pid % 500);
const edge = spawn(edgePath, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let target;
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    target = tabs.find((tab) => tab.type === "page");
    if (target) break;
  } catch { /* Edge starter fortsat. */ }
  await sleep(100);
}
if (!target) { edge.kill(); throw new Error("Kunne ikke forbinde til den isolerede Edge-session."); }

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let commandId = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++commandId; pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const screenshot = async (name) => {
  const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(join(outputDir, name), Buffer.from(result.data, "base64"));
};

try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1, mobile: true,
    screenWidth: viewportWidth, screenHeight: viewportHeight,
  });
  await send("Page.navigate", { url: `${baseUrl}/indkoeb/mobil` });
  await sleep(1600);
  const seeded = await evaluate(`(() => {
    const key = Object.keys(localStorage).find((name) => name.includes('veyro:procure:mobile-draft:v1:'));
    if (!key) return false;
    localStorage.setItem(key, JSON.stringify({
      submissionId:'qa-synthetic-mobile-${viewportWidth}', items:{tape:3,film:1,gloves:1,bags:1,vest:1}, custom:[],
      department:'Lager', departmentId:'lager', deliveryLocation:'Hovedlager', wantedDate:'2026-09-18', updatedAt:Date.now()
    }));
    location.reload(); return true;
  })()`);
  if (!seeded) throw new Error("Mobilkladdens scope-nøgle blev ikke oprettet.");
  await sleep(1200);
  const productMetrics = await evaluate(`({innerWidth,scrollWidth:document.documentElement.scrollWidth,lines:document.querySelector('.procure-mobile-cart-cta')?.textContent})`);
  if (productMetrics.innerWidth !== viewportWidth || productMetrics.scrollWidth > viewportWidth || !productMetrics.lines?.includes("5 varelinjer")) {
    throw new Error(`Uventet ${viewportWidth}px varevisning: ${JSON.stringify(productMetrics)}`);
  }
  await screenshot(`01-mobile-varer-${viewportWidth}.png`);

  await send("Page.navigate", { url: `${baseUrl}/indkoeb/mobil/kurv` }); await sleep(800);
  const cartMetrics = await evaluate(`({innerWidth,scrollWidth:document.documentElement.scrollWidth,lines:document.querySelectorAll('.procure-mobile-cartline').length})`);
  if (cartMetrics.innerWidth !== viewportWidth || cartMetrics.scrollWidth > viewportWidth || cartMetrics.lines !== 5) {
    throw new Error(`Uventet ${viewportWidth}px kurv: ${JSON.stringify(cartMetrics)}`);
  }
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await sleep(250);
  const offline = await evaluate(`({url:location.href,alert:document.querySelector('.procure-mobile-offline')?.textContent,disabled:document.querySelector('.procure-mobile-submit')?.disabled})`);
  if (!offline.alert?.includes("Ordren sendes ikke automatisk") || offline.disabled !== true) throw new Error(`Offlineværn mangler: ${JSON.stringify(offline)}`);
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(400);
  if (!(await evaluate("location.pathname")).endsWith("/kurv")) throw new Error("Genoprettet forbindelse afsendte eller navigerede automatisk.");
  await screenshot(`02-mobile-kurv-${viewportWidth}.png`);

  await evaluate(`(() => { const button=document.querySelector('.procure-mobile-submit'); button.click(); button.click(); })()`);
  await sleep(900);
  const receipt = await evaluate(`({url:location.href,text:document.querySelector('.procure-mobile-receipt')?.textContent,purchases:document.querySelectorAll('.procure-mobile-purchase').length})`);
  const references = receipt.text?.match(/PO-2026-\d+/g) || [];
  if (!receipt.url.includes("kvittering=1") || references.length !== 2 || receipt.purchases !== 6) {
    throw new Error(`Dobbelttryk gav forkert kvittering: ${JSON.stringify(receipt)}`);
  }
  await screenshot(`03-mobile-kvittering-${viewportWidth}.png`);
  process.stdout.write(`${JSON.stringify({ viewportWidth, productMetrics, cartMetrics, offline, receipt, profile }, null, 2)}\n`);
} finally {
  socket.close(); edge.kill();
}
