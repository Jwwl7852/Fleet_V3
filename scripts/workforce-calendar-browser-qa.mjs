/* Browser-QA for WORKFORCE Kalender against the local, isolated V1 demo. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const baseUrl = process.env.WORKFORCE_CALENDAR_URL || "http://127.0.0.1:5199";
assert.match(baseUrl, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/, "QA må kun køre mod localhost");
const outputDir = path.resolve(process.argv[2] || "artifacts/veyro-workforce-calendar-v1-2026-09-19");
const screenshotDir = path.join(outputDir, "screenshots");
await mkdir(screenshotDir, { recursive: true });

const edge = [
  process.env.EDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((candidate) => { try { return statSync(candidate).isFile(); } catch { return false; } });
assert.ok(edge, "En lokal Microsoft Edge-installation er nødvendig");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profileDir = await mkdtemp(path.join(tmpdir(), "veyro-workforce-calendar-"));
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
        text: (message.params?.args || []).map((item) => item.value ?? item.description ?? "").join(" "),
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

await sleep(400);
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
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height }, sessionId);
  await sleep(120);
};
const clickText = async (selector, text) => {
  const clicked = await evaluate(`(()=>{const element=[...document.querySelectorAll(${JSON.stringify(selector)})].find((item)=>item.textContent.trim()===${JSON.stringify(text)});if(!element)return false;element.click();return true})()`);
  assert.equal(clicked, true, `Mangler ${selector} med teksten ${text}`);
  await sleep(160);
};
const click = async (selector) => {
  const clicked = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return false;element.click();return true})()`);
  assert.equal(clicked, true, `Mangler ${selector}`);
  await sleep(160);
};
const screenshot = async (filename) => {
  const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId);
  await writeFile(path.join(screenshotDir, filename), Buffer.from(result.data, "base64"));
  return `screenshots/${filename}`;
};
const inspectLayout = async (label) => {
  const result = await evaluate(`(()=>{const grid=document.querySelector('.wf-schedule-wrap');const popover=document.querySelector('.wf-period-popover');const rect=popover?.getBoundingClientRect();return{label:${JSON.stringify(label)},path:location.pathname,viewport:[innerWidth,innerHeight],documentClientWidth:document.documentElement.clientWidth,documentScrollWidth:document.documentElement.scrollWidth,pageHorizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,gridClientWidth:grid?.clientWidth||0,gridScrollWidth:grid?.scrollWidth||0,popover:rect?{left:Math.round(rect.left),right:Math.round(rect.right),top:Math.round(rect.top),bottom:Math.round(rect.bottom)}:null,view:[...document.querySelectorAll('.wf-view-switch button')].find((item)=>item.getAttribute('aria-pressed')==='true')?.textContent.trim(),period:document.querySelector('.wf-period-trigger')?.textContent.trim(),employees:document.querySelectorAll('.wf-employee-cell').length,yearMonths:document.querySelectorAll('.wf-year-overview>button').length}})()`);
  assert.equal(result.pageHorizontalOverflow, false, `${label}: hele siden har vandret rulning`);
  if (result.popover) {
    assert.ok(result.popover.left >= 0 && result.popover.right <= result.viewport[0], `${label}: periode-popup er uden for viewport vandret`);
    assert.ok(result.popover.top >= 0 && result.popover.bottom <= result.viewport[1], `${label}: periode-popup er uden for viewport lodret`);
  }
  return result;
};
const openCalendar = async () => {
  await send("Page.navigate", { url: `${baseUrl}/workforce-v2/kalender` }, sessionId);
  await waitFor("document.readyState === 'complete'", "kalendersiden");
  if (await evaluate("Boolean(document.querySelector('#fc-email'))")) {
    const submitted = await evaluate(`(()=>{const email=document.querySelector('#fc-email');const password=document.querySelector('#fc-kode');const form=email?.closest('form')||document.querySelector('form');if(!email?.value||!password?.value||!form)return false;form.requestSubmit();return true})()`);
    assert.equal(submitted, true, "Normal emulator-login var ikke forudfyldt");
  }
  await waitFor("location.pathname === '/workforce-v2/kalender' && document.querySelector('.wf-calendar-card') && !document.querySelector('.wf-loading')", "autentificeret WORKFORCE Kalender");
  await sleep(250);
};

const report = {
  title: "VEYRO V1 · WORKFORCE Kalender · browserrapport",
  capturedAtUtc: new Date().toISOString(),
  baseUrl,
  login: "Normal lokal emulator-login med forudfyldt syntetisk testbruger",
  screenshots: [],
  measurements: [],
  checks: {},
  console: [],
};

try {
  await setViewport(1440, 900);
  await openCalendar();
  report.checks.oldRouteRedirect = await (async () => {
    await send("Page.navigate", { url: `${baseUrl}/workforce-v2/bemanding` }, sessionId);
    await waitFor("location.pathname === '/workforce-v2/kalender' && document.querySelector('.wf-calendar-card')", "kompatibel Bemanding-viderestilling");
    return await evaluate("location.pathname");
  })();

  for (const [view, file] of [["Dag", "01-dag-1440x900.png"], ["Uge", "02-uge-1440x900.png"], ["Måned", "03-maaned-1440x900.png"], ["År", "04-aar-1440x900.png"]]) {
    await clickText(".wf-view-switch button", view);
    await waitFor(`document.querySelector('.wf-view-switch button[aria-pressed="true"]')?.textContent.trim() === ${JSON.stringify(view)}`, `${view}-visning`);
    const measurement = await inspectLayout(`${view} 1440x900`);
    if (view === "År") assert.equal(measurement.yearMonths, 12, "Årsvisningen skal vise 12 kompakte måneder");
    else assert.ok(measurement.employees > 0, `${view}: medarbejderrækker mangler`);
    report.measurements.push(measurement);
    report.screenshots.push(await screenshot(file));
  }

  report.checks.periodPickerSelections = {};
  for (const [view, pickerSelector] of [["Dag", ".wf-day-picker"], ["Uge", ".wf-week-picker"], ["Måned", ".wf-month-picker"], ["År", ".wf-year-picker"]]) {
    await clickText(".wf-view-switch button", view);
    const before = await evaluate("document.querySelector('.wf-period-trigger')?.textContent.trim()");
    await click(".wf-period-trigger");
    await waitFor(`document.querySelector(${JSON.stringify(pickerSelector)})`, `${view}-periodevælger`);
    const selected = await evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(`${pickerSelector} button:not(.selected)`) });if(!button)return false;button.click();return true})()`);
    assert.equal(selected, true, `${view}: periodevælgeren havde intet alternativt valg`);
    await waitFor("!document.querySelector('.wf-period-popover')", `${view}-periodevalg lukker popup`);
    const after = await evaluate("document.querySelector('.wf-period-trigger')?.textContent.trim()");
    assert.notEqual(after, before, `${view}: periodevalget opdaterede ikke kalenderen`);
    report.checks.periodPickerSelections[view] = { before, after };
    await clickText(".wf-period-nav button", "I dag");
  }

  await clickText(".wf-view-switch button", "Uge");
  await click(".wf-period-trigger");
  await waitFor("document.querySelector('.wf-period-popover[role=dialog]')", "ugevælger");
  report.measurements.push(await inspectLayout("Uge-popup 1440x900"));
  report.screenshots.push(await screenshot("05-uge-popup-1440x900.png"));
  report.checks.weekPickerRows = await evaluate("document.querySelectorAll('.wf-week-picker button').length");
  assert.ok(report.checks.weekPickerRows >= 4, "Ugevælgeren viser ikke ugerne i måneden");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
  await waitFor("!document.querySelector('.wf-period-popover')", "Escape lukker periodevælgeren");
  report.checks.escapeReturnsFocus = await evaluate("document.activeElement === document.querySelector('.wf-period-trigger')");
  assert.equal(report.checks.escapeReturnsFocus, true, "Escape returnerede ikke fokus til periodeknappen");

  report.checks.categoryOptions = await evaluate("(()=>{const details=[...document.querySelectorAll('.wf-multi-filter')].find((item)=>item.querySelector('summary')?.textContent.includes('Kategorier'));return details?.querySelectorAll('input[type=checkbox]').length||0})()");
  assert.ok(report.checks.categoryOptions > 0, "Kalenderkategorier fra Opsætning blev ikke indlæst");
  report.checks.combinedFilters = await evaluate(`(()=>{const filters=[...document.querySelectorAll('.wf-multi-filter')];for(const details of filters.slice(0,3)){const checkbox=details.querySelector('input[type=checkbox]');if(checkbox)checkbox.click();}return document.querySelectorAll('.wf-active-filters span').length})()`);
  assert.ok(report.checks.combinedFilters >= 2, "Kombinerede filtervalg blev ikke synlige");
  await click(".wf-filter-reset");
  await waitFor("!document.querySelector('.wf-active-filters')", "nulstilling af filtre");

  report.checks.openEdit = await (async () => {
    const opened = await evaluate("(()=>{const shift=document.querySelector('.wf-shift');if(!shift)return false;shift.click();return true})()");
    if (!opened) return "Ingen vagt i den valgte uge";
    await waitFor("document.querySelector('.wf-modal')", "åbn/redigér vagt");
    const title = await evaluate("document.querySelector('.wf-modal h2,.wf-modal h3')?.textContent.trim() || ''");
    await evaluate("document.querySelector('.wf-modal button[aria-label*=Luk],.wf-modal .wf-btn')?.click();true");
    await sleep(120);
    return title;
  })();

  await setViewport(1280, 800);
  await clickText(".wf-view-switch button", "Måned");
  report.measurements.push(await inspectLayout("Måned 1280x800"));
  report.screenshots.push(await screenshot("06-maaned-1280x800.png"));

  await setViewport(390, 844);
  await clickText(".wf-view-switch button", "Uge");
  report.measurements.push(await inspectLayout("Uge mobil 390x844"));
  report.screenshots.push(await screenshot("07-uge-mobil-390x844.png"));
  await click(".wf-period-trigger");
  await waitFor("document.querySelector('.wf-period-popover')", "mobil periode-popup");
  report.measurements.push(await inspectLayout("Uge-popup mobil 390x844"));
  report.screenshots.push(await screenshot("08-uge-popup-mobil-390x844.png"));
  await evaluate("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));true");
  await waitFor("!document.querySelector('.wf-period-popover')", "klik udenfor lukker mobil-popup");

  const initiallyCompact = await evaluate("document.querySelector('.fc-app')?.classList.contains('fc-menu-kompakt')");
  if (!initiallyCompact) await click(".fc-menu-toggle");
  report.checks.compactNavigation = await evaluate("document.querySelector('.fc-app')?.classList.contains('fc-menu-kompakt')");
  assert.equal(report.checks.compactNavigation, true, "Navigationen kunne ikke foldes sammen");
  report.measurements.push(await inspectLayout("Uge mobil kompakt navigation 390x844"));
  report.screenshots.push(await screenshot("09-uge-mobil-kompakt-menu-390x844.png"));

  report.console = consoleMessages;
  await writeFile(path.join(outputDir, "browserrapport.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outputDir, "billedmanifest.json"), `${JSON.stringify({ screenshots: report.screenshots }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ screenshots: report.screenshots.length, measurements: report.measurements.length, checks: report.checks }, null, 2)}\n`);
} finally {
  try { await send("Browser.close"); } catch { child.kill(); }
  const resolvedProfile = path.resolve(profileDir);
  const resolvedTemp = path.resolve(tmpdir());
  if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`)) await rm(profileDir, { recursive: true, force: true, maxRetries: 3 });
}
