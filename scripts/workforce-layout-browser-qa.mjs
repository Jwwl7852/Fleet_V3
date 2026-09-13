/* Visuel WORKFORCE-layoutkontrol mod den lokalt integrerede demo-app.
 * Browserprofilen er midlertidig og indeholder kun syntetiske demodata. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const baseUrl = process.env.WORKFORCE_LAYOUT_URL || "http://127.0.0.1:5197";
assert.match(baseUrl, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/, "QA må kun køre mod localhost");

const outputDir = path.resolve(process.argv[2] || "artifacts/workforce-layout-v1");
const screenshotDir = path.join(outputDir, "screenshots");
await mkdir(screenshotDir, { recursive: true });

const edge = [
  process.env.EDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((candidate) => {
  try { return statSync(candidate).isFile(); } catch { return false; }
});
assert.ok(edge, "En lokal Microsoft Edge-installation er nødvendig");

const pages = [
  ["overblik", "/workforce-v2"],
  ["medarbejdere", "/workforce-v2/medarbejdere"],
  ["bemanding", "/workforce-v2/bemanding"],
  ["fravaer", "/workforce-v2/fravaer"],
  ["kompetencer", "/workforce-v2/kompetencer"],
  ["timer", "/workforce-v2/timer"],
  ["min-arbejdsdag", "/workforce-v2/min-arbejdsdag"],
];
const viewports = [[1440, 900], [1920, 1080], [390, 844], [360, 800]];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profileDir = await mkdtemp(path.join(tmpdir(), "veyro-workforce-layout-"));
const child = spawn(edge, [
  "--headless=new", "--edge-skip-compat-layer-relaunch", "--remote-debugging-pipe",
  `--user-data-dir=${profileDir}`, "--no-first-run", "--disable-default-apps", "about:blank",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true });

let sequence = 0;
let buffer = Buffer.alloc(0);
const pending = new Map();
const consoleMessages = [];
child.stdio[4].on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  let separator;
  while ((separator = buffer.indexOf(0)) >= 0) {
    const packet = buffer.subarray(0, separator).toString("utf8");
    buffer = buffer.subarray(separator + 1);
    if (!packet) continue;
    const message = JSON.parse(packet);
    if (message.method === "Runtime.consoleAPICalled") {
      consoleMessages.push({
        type: message.params?.type,
        text: (message.params?.args || []).map((argument) => argument.value ?? argument.description ?? "").join(" "),
      });
      continue;
    }
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result || {});
  }
});
const send = (method, params = {}, sessionId) => {
  const id = ++sequence;
  const packet = { id, method, params };
  if (sessionId) packet.sessionId = sessionId;
  child.stdio[3].write(`${JSON.stringify(packet)}\0`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};

await sleep(350);
const target = (await send("Target.getTargets")).targetInfos.find((item) => item.type === "page");
assert.ok(target, "Headless browser kunne ikke oprette en side");
const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);

const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
};
const waitFor = async (expression, label, attempts = 300) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(80);
  }
  throw new Error(`Timeout: ${label}`);
};
const setViewport = async (width, height) => {
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: false,
    screenWidth: width, screenHeight: height,
  }, sessionId);
  await sleep(120);
};
const navigate = async (route) => {
  await send("Page.navigate", { url: `${baseUrl}${route}` }, sessionId);
  await waitFor("document.readyState === 'complete' && document.querySelector('.wf-app--embedded .wf-page-head')", route);
  await waitFor("!document.querySelector('.wf-loading')", `${route} blev ved med at hente`);
  await sleep(180);
};
const click = async (selector) => {
  const found = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return false;element.click();return true})()`);
  assert.equal(found, true, `Mangler ${selector}`);
  await sleep(120);
};
const measure = async (name, route, mode, width, height) => {
  const measurement = await evaluate(`(()=>{
    const box=(selector)=>{const element=document.querySelector(selector);if(!element)return null;const rect=element.getBoundingClientRect();const style=getComputedStyle(element);return{left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width),clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,display:style.display,gridTemplateColumns:style.gridTemplateColumns,maxWidth:style.maxWidth,zoom:style.zoom}};
    const controls=[...document.querySelectorAll('.wf-app button,.wf-app input,.wf-app select,.wf-app a')].filter((element)=>{const style=getComputedStyle(element);return style.display!=='none'&&style.visibility!=='hidden'}).map((element)=>{const rect=element.getBoundingClientRect();return{text:(element.textContent||element.getAttribute('aria-label')||'').trim().slice(0,50),left:Math.round(rect.left),right:Math.round(rect.right),insideScroll:Boolean(element.closest('.wf-table-wrap,.wf-schedule-wrap,.wf-profile-links,.wf-plan-legend'))}});
    return {viewport:{width:innerWidth,height:innerHeight},route:location.pathname,mode:${JSON.stringify(mode)},zoomText:document.querySelector('.fc-zoomkontroller output')?.textContent.trim(),compact:document.querySelector('.fc-app')?.classList.contains('fc-menu-kompakt'),horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,slot:box('.fc-slot'),zoom:box('.fc-workspace-zoom'),root:box('.wf-app'),workspace:box('.wf-workspace'),main:box('.wf-main'),notice:box('.wf-notice'),pageHead:box('.wf-page-head'),firstCard:box('.wf-card'),sidebar:box('.fc-side'),outsideControls:controls.filter((item)=>item.left<0||item.right>innerWidth+1)};
  })()`);
  assert.equal(measurement.route, route);
  assert.equal(measurement.horizontalOverflow, false, `${name}: siden har vandret overflow`);
  assert.deepEqual(measurement.outsideControls.filter((item) => !item.insideScroll), [], `${name}: synlig kontrol er uden for viewport og et udpeget internt scrollområde`);
  assert.ok(measurement.root.width >= measurement.zoom.width - 2, `${name}: modulroden udfylder ikke zoom-wrapperen`);
  assert.ok(measurement.main.width >= measurement.root.width - 2, `${name}: WORKFORCE-main udfylder ikke modulroden`);
  if (measurement.workspace.display === "grid") {
    assert.equal(measurement.workspace.gridTemplateColumns.includes(" "), false, `${name}: embedded-grid har stadig flere beregnede kolonner (${measurement.workspace.gridTemplateColumns})`);
  }
  const minimumNotice = width < 700 ? 240 : Math.min(600, Math.round(measurement.main.width * 0.45));
  assert.ok(measurement.notice.width >= minimumNotice, `${name}: demobeskeden er stadig for smal`);
  if (measurement.firstCard) assert.ok(measurement.firstCard.width >= (width < 700 ? 240 : 420), `${name}: første kort er ulæseligt smalt`);
  return measurement;
};
const screenshot = async (filename) => {
  const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId);
  await writeFile(path.join(screenshotDir, filename), Buffer.from(result.data, "base64"));
  return `screenshots/${filename}`;
};

const evidence = {
  version: "WORKFORCE integrated layout V1",
  capturedAtUtc: new Date().toISOString(),
  baseUrl,
  rootCause: "Embedded WORKFORCE beholdt standalone-gridets tomme 230px sidebarkolonne.",
  measurements: [],
  preferenceChecks: {},
  console: [],
  screenshots: [],
};

try {
  await setViewport(1440, 900);
  await navigate("/workforce-v2");
  await evaluate("localStorage.clear(); sessionStorage.clear(); true");
  await send("Page.reload", { ignoreCache: true }, sessionId);
  await waitFor("document.querySelector('.wf-app--embedded .wf-page-head') && !document.querySelector('.wf-loading')", "første reload");

  let number = 0;
  for (const [width, height] of viewports) {
    await setViewport(width, height);
    for (const [name, route] of pages) {
      await navigate(route);
      const label = `${width}x${height}-normal-${name}`;
      evidence.measurements.push(await measure(label, route, "normal", width, height));
      const file = `${String(++number).padStart(2, "0")}-${label}.png`;
      evidence.screenshots.push(await screenshot(file));
    }
  }

  for (const [width, height] of [[1440, 900], [1920, 1080]]) {
    await setViewport(width, height);
    await navigate("/workforce-v2");
    if (!(await evaluate("document.querySelector('.fc-app').classList.contains('fc-menu-kompakt')"))) await click(".fc-menu-toggle");
    for (const [name, route] of pages) {
      await navigate(route);
      const label = `${width}x${height}-kompakt-${name}`;
      const result = await measure(label, route, "kompakt", width, height);
      assert.equal(result.compact, true, `${label}: menuen er ikke kompakt`);
      assert.ok(result.sidebar.width <= 74, `${label}: den sammenfoldede menu er for bred`);
      evidence.measurements.push(result);
      const file = `${String(++number).padStart(2, "0")}-${label}.png`;
      evidence.screenshots.push(await screenshot(file));
    }
    await click(".fc-nulstil-visning");
    await waitFor("!document.querySelector('.fc-app').classList.contains('fc-menu-kompakt')", "nulstillet menu");
  }

  await setViewport(1440, 900);
  await navigate("/workforce-v2");
  await click(".fc-zoomkontroller button[aria-label='Zoom ind']");
  await click(".fc-zoomkontroller button[aria-label='Zoom ind']");
  await click(".fc-menu-toggle");
  await send("Page.reload", { ignoreCache: true }, sessionId);
  await waitFor("document.querySelector('.wf-app--embedded .wf-page-head') && !document.querySelector('.wf-loading')", "gemte visningsvalg");
  evidence.preferenceChecks.saved = await evaluate(`({zoom:document.querySelector('.fc-zoomkontroller output').textContent.trim(),compact:document.querySelector('.fc-app').classList.contains('fc-menu-kompakt')})`);
  assert.deepEqual(evidence.preferenceChecks.saved, { zoom: "110 %", compact: true });
  evidence.screenshots.push(await screenshot(`${String(++number).padStart(2, "0")}-1440x900-gemte-visningsvalg.png`));
  await click(".fc-nulstil-visning");
  await waitFor("document.querySelector('.fc-zoomkontroller output').textContent.includes('100') && !document.querySelector('.fc-app').classList.contains('fc-menu-kompakt')", "Nulstil visning");
  evidence.preferenceChecks.reset = await evaluate(`({zoom:document.querySelector('.fc-zoomkontroller output').textContent.trim(),compact:document.querySelector('.fc-app').classList.contains('fc-menu-kompakt')})`);
  assert.deepEqual(evidence.preferenceChecks.reset, { zoom: "100 %", compact: false });
  evidence.screenshots.push(await screenshot(`${String(++number).padStart(2, "0")}-1440x900-nulstillet-visning.png`));

  evidence.console = consoleMessages;
  await writeFile(path.join(outputDir, "measurements.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ screenshots: evidence.screenshots.length, measurements: evidence.measurements.length, preferenceChecks: evidence.preferenceChecks }, null, 2)}\n`);
} finally {
  try { await send("Browser.close"); } catch { child.kill(); }
  const resolvedProfile = path.resolve(profileDir);
  const resolvedTemp = path.resolve(tmpdir());
  if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`)) await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3 });
}
