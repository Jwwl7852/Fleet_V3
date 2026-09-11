import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\152.0.4191.66\\msedge.exe";
const baseUrl = process.env.PROCURE_QA_URL || "http://127.0.0.1:5205";
const outputDir = path.resolve(process.argv[2] || "artifacts/procure-browser-qa");
const profileDir = await mkdtemp(path.join(tmpdir(), "veyro-procure-qa-"));
await mkdir(outputDir, { recursive: true });

const browser = spawn(edge, [
  "--headless=new",
  "--edge-skip-compat-layer-relaunch",
  "--remote-debugging-pipe",
  `--user-data-dir=${profileDir}`,
  "--no-first-run",
  "--disable-default-apps",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true });

let sequence = 0;
let buffer = Buffer.alloc(0);
const pending = new Map();
browser.stdio[4].on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  let separator;
  while ((separator = buffer.indexOf(0)) >= 0) {
    const packet = buffer.subarray(0, separator).toString("utf8");
    buffer = buffer.subarray(separator + 1);
    if (!packet) continue;
    const message = JSON.parse(packet);
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result || {});
  }
});

function send(method, params = {}, sessionId) {
  const id = ++sequence;
  const packet = { id, method, params };
  if (sessionId) packet.sessionId = sessionId;
  browser.stdio[3].write(`${JSON.stringify(packet)}\0`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(expression, sessionId) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "Browserudtryk fejlede");
  return response.result?.value;
}

async function waitFor(expression, label, sessionId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(`Boolean(${expression})`, sessionId)) return;
    await sleep(80);
  }
  throw new Error(`Timeout: ${label}`);
}

async function navigate(url, selector, sessionId) {
  await send("Page.navigate", { url }, sessionId);
  await waitFor(`document.querySelector(${JSON.stringify(selector)})`, url, sessionId);
  await sleep(180);
}

const cases = [
  ["products", 390, 844, ".procure-mobile-products", "01-mobil-varer-390.png"],
  ["qr", 390, 844, ".procure-qr-product", "02-mobil-qr-gentagelse-390.png"],
  ["cart", 390, 844, ".procure-mobile-cartline", "03-mobil-kurv-390.png"],
  ["cart", 390, 844, ".procure-mobile-review", "03b-mobil-kurv-gennemgang-390.png", true],
  ["receipt", 390, 844, ".procure-mobile-receipt", "04-mobil-kvittering-390.png"],
  ["products", 360, 800, ".procure-mobile-products", "05-mobil-varer-360.png"],
];
const desktopCases = [
  ["/indkoeb/bestillinger", ".procure-workspace", "06-desktop-bestillinger.png"],
  ["/indkoeb/godkendelser", ".procure-split.approvals", "07-desktop-godkendelser.png"],
  ["/indkoeb/forbrug", ".procure-analysis-kpis", "08-desktop-indkoebsanalyse.png"],
  ["/indkoeb/opsaetning", ".procure-setup", "09-desktop-opsaetning.png"],
];

try {
  await sleep(250);
  const targets = await send("Target.getTargets");
  const page = targets.targetInfos.find((target) => target.type === "page");
  if (!page) throw new Error("Ingen Edge-side blev oprettet.");
  const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(`${baseUrl}/scripts/fixtures/procure-qa-seed.html?target=products`, ".procure-mobile-products", sessionId);
  await evaluate("document.querySelector('.procure-mobile-missing').click()", sessionId);
  await waitFor("document.querySelector('[role=dialog]')", "vare-dialog", sessionId);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, sessionId);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" }, sessionId);
  await waitFor("!document.querySelector('[role=dialog]')", "Escape lukker dialog", sessionId);
  await evaluate(`(() => { const card=[...document.querySelectorAll('.procure-mobile-product')].find((node)=>node.textContent.includes('Strækfilm')); [...card.querySelectorAll('button')].at(-1).click(); })()`, sessionId);
  await sleep(300);
  await send("Page.reload", {}, sessionId);
  await waitFor("document.querySelector('.procure-mobile-cart-cta')?.textContent.includes('5 varelinjer')", "kladde efter reload", sessionId);

  await navigate(`${baseUrl}/indkoeb/mobil/scan/qr-tape-a1`, ".procure-qr-product", sessionId);
  const qrBefore = Number.parseFloat(await evaluate("document.querySelector('.procure-qr-existing b').textContent", sessionId));
  await evaluate("[...document.querySelectorAll('.procure-qr-product button')].find((button)=>button.textContent.includes('Tilføj og scan næste')).click()", sessionId);
  await waitFor("location.pathname.endsWith('/indkoeb/mobil/scan')", "klar til næste QR-scan", sessionId);
  await sleep(300);
  await navigate(`${baseUrl}/indkoeb/mobil/scan/qr-tape-a1`, ".procure-qr-product", sessionId);
  const qrAfter = Number.parseFloat(await evaluate("document.querySelector('.procure-qr-existing b').textContent", sessionId));
  if (qrAfter !== qrBefore + 1) throw new Error("Gentagen QR-scanning opdaterede ikke kurvantal.");

  await navigate(`${baseUrl}/indkoeb/mobil/kurv`, ".procure-mobile-cartline", sessionId);
  const cartLinesBeforeOffline = Number(await evaluate("document.querySelectorAll('.procure-mobile-cartline').length", sessionId));
  await evaluate("[...document.querySelectorAll('.procure-mobile-send-toggle input')].forEach((input)=>{if(!input.checked)input.click()})", sessionId);
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, sessionId);
  await evaluate("window.dispatchEvent(new Event('offline'))", sessionId);
  await waitFor("document.querySelector('.procure-mobile-offline') && document.querySelector('.procure-mobile-submit').disabled", "offline-spærring", sessionId);
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
  await evaluate("window.dispatchEvent(new Event('online'))", sessionId);
  await waitFor("!document.querySelector('.procure-mobile-submit').disabled", "online igen", sessionId);
  if (!await evaluate("location.pathname.endsWith('/kurv')", sessionId)) throw new Error("Genoprettet forbindelse udløste automatisk indsendelse.");
  const cartLinesAfterOffline = Number(await evaluate("document.querySelectorAll('.procure-mobile-cartline').length", sessionId));
  if (cartLinesAfterOffline !== cartLinesBeforeOffline) throw new Error("Netværksfejl ændrede kurven.");
  const historyBefore = Number(await evaluate("JSON.parse(localStorage.getItem('veyro:procure:mobile-history:v1:demo:demo')).length", sessionId));
  await evaluate(`(() => { const button=document.querySelector('.procure-mobile-cart>.procure-mobile-submit'); button.click(); button.click(); })()`, sessionId);
  await waitFor("location.pathname.endsWith('/mine') && new URLSearchParams(location.search).get('kvittering') === '1'", "kvittering", sessionId);
  const historyAfter = Number(await evaluate("JSON.parse(localStorage.getItem('veyro:procure:mobile-history:v1:demo:demo')).length", sessionId));
  if (historyAfter !== historyBefore + 2) throw new Error("Gentagne tryk oprettede et forkert antal leverandørordrer.");

  const functionalChecks = { draftResumedLines: 5, qrBefore, qrAfter, cartLinesBeforeOffline, cartLinesAfterOffline, automaticSubmitAfterReconnect: false, supplierOrdersCreated: historyAfter - historyBefore };

  const results = [];
  for (const [target, width, height, selector, filename, scrollBottom] of cases) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true }, sessionId);
    await send("Page.navigate", { url: `${baseUrl}/scripts/fixtures/procure-qa-seed.html?target=${target}` }, sessionId);
    await waitFor(`document.querySelector(${JSON.stringify(selector)})`, `${target} ved ${width}px`, sessionId);
    await sleep(250);
    await evaluate(scrollBottom ? "window.scrollTo(0, document.documentElement.scrollHeight)" : "window.scrollTo(0, 0)", sessionId);
    const metrics = await evaluate("({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth})", sessionId);
    const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId);
    await writeFile(path.join(outputDir, filename), Buffer.from(screenshot.data, "base64"));
    results.push({ filename, width, height, ...metrics, horizontalOverflow: metrics.scrollWidth > metrics.clientWidth });
  }
  for (const [route, selector, filename] of desktopCases) {
    const width = 1440; const height = 1000;
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(`${baseUrl}${route}`, selector, sessionId);
    await evaluate("window.scrollTo(0, 0)", sessionId);
    const metrics = await evaluate("({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth})", sessionId);
    const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId);
    await writeFile(path.join(outputDir, filename), Buffer.from(screenshot.data, "base64"));
    results.push({ filename, width, height, ...metrics, horizontalOverflow: metrics.scrollWidth > metrics.clientWidth });
  }

  console.log(JSON.stringify({ ok: true, baseUrl, outputDir, functionalChecks, screenshots: results }, null, 2));
  await send("Browser.close");
} finally {
  if (browser.exitCode === null) browser.kill();
  const resolvedProfile = path.resolve(profileDir);
  const resolvedTemp = path.resolve(tmpdir());
  if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`) && path.basename(resolvedProfile).startsWith("veyro-procure-qa-")) {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3 });
  }
}
