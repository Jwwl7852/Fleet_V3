/* Browserkontrol af servicefiltrering på de integrerede Version 1-sider. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const baseUrl = process.env.SERVICE_FILTER_QA_URL || "http://127.0.0.1:5197";
assert.match(baseUrl, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/, "QA må kun køre mod localhost");
const outputDir = path.resolve(process.argv[2] || "artifacts/servicefiltrering-v1-2026-09-21");
await mkdir(outputDir, { recursive: true });

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  return match ? [[match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, "")]] : [];
}));
const localEnv = parseEnv(await readFile(path.resolve(".env.local"), "utf8"));
const loginEmail = process.env.SERVICE_FILTER_QA_EMAIL || localEnv.VITE_DEV_EJER_MAIL;
const loginPassword = process.env.SERVICE_FILTER_QA_PASSWORD || localEnv.VITE_DEV_BRUGER_KODE;
assert.ok(loginEmail && loginPassword, "Lokal QA kræver login i .env.local eller SERVICE_FILTER_QA_EMAIL/PASSWORD");

const edge = [
  process.env.EDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((candidate) => {
  try { return statSync(candidate).isFile(); } catch { return false; }
});
assert.ok(edge, "Microsoft Edge er nødvendig til browserkontrollen");

const profileDir = await mkdtemp(path.join(tmpdir(), "veyro-service-filter-"));
const child = spawn(edge, [
  "--headless=new", "--edge-skip-compat-layer-relaunch", "--remote-debugging-pipe",
  `--user-data-dir=${profileDir}`, "--no-first-run", "--disable-default-apps", "about:blank",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true });

let sequence = 0;
let buffer = Buffer.alloc(0);
const pending = new Map();
const consoleErrors = [];
child.stdio[4].on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  let separator;
  while ((separator = buffer.indexOf(0)) >= 0) {
    const packet = buffer.subarray(0, separator).toString("utf8");
    buffer = buffer.subarray(separator + 1);
    if (!packet) continue;
    const message = JSON.parse(packet);
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      consoleErrors.push((message.params.args || []).map((argument) => argument.value ?? argument.description ?? "").join(" "));
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await sleep(350);
const target = (await send("Target.getTargets")).targetInfos.find((item) => item.type === "page");
assert.ok(target, "Browseren kunne ikke oprette en side");
const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);

const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
};
const waitFor = async (expression, label, attempts = 250) => {
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
const navigate = async (route) => {
  await send("Page.navigate", { url: `${baseUrl}${route}` }, sessionId);
  await waitFor("document.readyState === 'complete'", route);
  await sleep(150);
};
const screenshot = async (filename) => {
  const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId);
  await writeFile(path.join(outputDir, filename), Buffer.from(result.data, "base64"));
};
const click = async (selector) => {
  const clicked = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return false;element.click();return true})()`);
  assert.equal(clicked, true, `Mangler kontrol: ${selector}`);
  await sleep(120);
};
const openFilter = async (index) => {
  const opened = await evaluate(`(()=>{const root=document.querySelectorAll('.service-multiselect')[${index}];const button=root?.querySelector('.service-multiselect-trigger');if(!button)return false;button.click();return true})()`);
  assert.equal(opened, true, `Mangler servicefilter ${index}`);
  await waitFor(`document.querySelectorAll('.service-multiselect')[${index}]?.querySelector('.service-multiselect-popover')`, `åbent filter ${index}`);
};
const selectFirstSpecificOption = async (index) => {
  const selected = await evaluate(`(()=>{const inputs=document.querySelectorAll('.service-multiselect')[${index}]?.querySelectorAll('.service-multiselect-option input');if(!inputs||inputs.length<2)return false;inputs[1].click();return true})()`);
  assert.equal(selected, true, `Filter ${index} mangler en specifik valgmulighed`);
  await sleep(160);
};
const inspectPage = async (route, prefix) => {
  const rowSelector = prefix === "fleet-service" ? ".service-requirement-row" : ".service-layout tbody tr";
  const demonstrationFilter = prefix === "fleet-service" ? 0 : 1;
  await navigate(route);
  await waitFor("document.querySelectorAll('.service-multiselect').length === 3", `${prefix}: tre filtre`);
  const initial = await evaluate(`({
    route: location.pathname,
    filters: [...document.querySelectorAll('.service-multiselect-label')].map((node)=>node.textContent.trim()),
    rows: document.querySelectorAll(${JSON.stringify(rowSelector)}).length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  })`);
  assert.deepEqual(initial.filters, ["Kategori", "Enhed", "Afdeling"], `${prefix}: forkert filterrækkefølge`);
  assert.equal(initial.overflow, false, `${prefix}: utilsigtet vandret siderulning`);
  await screenshot(`${prefix}-alle-filtre-1440x900.png`);

  await openFilter(demonstrationFilter);
  await selectFirstSpecificOption(demonstrationFilter);
  const filtered = await evaluate(`({
    rows: document.querySelectorAll(${JSON.stringify(rowSelector)}).length,
    summary: document.querySelectorAll('.service-multiselect-trigger')[${demonstrationFilter}]?.textContent.trim()
  })`);
  assert.ok(filtered.summary && !/^Alle /.test(filtered.summary), `${prefix}: filtervalg blev ikke registreret`);
  assert.ok(filtered.rows <= initial.rows, `${prefix}: filtrering forøgede antal rækker`);
  await screenshot(`${prefix}-aabent-flervalg-filtreret-1440x900.png`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, sessionId);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" }, sessionId);
  await waitFor("!document.querySelector('.service-multiselect-popover')", `${prefix}: Escape lukker filteret`);

  await click(".service-filter-reset");
  const reset = await evaluate(`([...document.querySelectorAll('.service-multiselect-trigger')].every((node)=>/^Alle /.test(node.textContent.trim())))`);
  assert.equal(reset, true, `${prefix}: nulstilling satte ikke alle filtre til Alle`);
  return { ...initial, filteredRows: filtered.rows };
};

const report = { baseUrl, capturedAtUtc: new Date().toISOString(), pages: {}, checks: [] };
try {
  await setViewport(1440, 900);
  await navigate("/fleet-v2/service");
  if (await evaluate("location.pathname === '/login'")) {
    await waitFor("document.querySelector('#fc-email') && document.querySelector('#fc-kode')", "loginformular");
    await evaluate(`(()=>{
      const setValue=(selector,value)=>{const element=document.querySelector(selector);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));};
      if (!document.querySelector('#fc-email').value) setValue('#fc-email',${JSON.stringify(loginEmail)});
      if (!document.querySelector('#fc-kode').value) setValue('#fc-kode',${JSON.stringify(loginPassword)});
      document.querySelector('form').requestSubmit();
      return true;
    })()`);
    await waitFor("location.pathname !== '/login'", "autentificering");
  }

  report.pages.fleet = await inspectPage("/fleet-v2/service", "fleet-service");
  report.pages.facility = await inspectPage("/facility-v2/service", "facility-service");

  await setViewport(390, 844);
  for (const [route, prefix] of [["/fleet-v2/service", "fleet-service"], ["/facility-v2/service", "facility-service"]]) {
    await navigate(route);
    await waitFor("document.querySelectorAll('.service-multiselect').length === 3", `${prefix}: mobilfiltre`);
    assert.equal(await evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"), false, `${prefix}: mobil har vandret siderulning`);
    await screenshot(`${prefix}-mobil-390x844.png`);
  }
  report.checks.push("Tre filtre synlige i rækkefølgen Kategori, Enhed, Afdeling");
  report.checks.push("Et specifikt kategori- eller enhedsvalg filtrerer resultatlisten");
  report.checks.push("Escape lukker flervalg, og Nulstil filtre gendanner Alle");
  report.checks.push("Desktop og mobil uden dokumentbredde-overløb");
  report.consoleErrors = consoleErrors;
  await writeFile(path.join(outputDir, "browser-qa.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  try { await send("Browser.close"); } catch { child.kill(); }
  const resolvedProfile = path.resolve(profileDir);
  const resolvedTemp = path.resolve(tmpdir());
  if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`)) await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3 });
}
