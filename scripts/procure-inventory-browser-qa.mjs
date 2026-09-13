/* Autoriseret browser-QA for PROCURE lager. Kører kun mod localhost og
 * Firebase Emulator Suite med syntetiske brugere/data. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { seedProcureAuthEmulator, SYNTHETIC_PASSWORD, TEST_USERS } from "./procure-auth-emulator-seed.mjs";

const baseUrl = process.env.PROCURE_INVENTORY_QA_URL || "http://127.0.0.1:5208";
assert.match(baseUrl, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
for (const variable of ["FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_DATABASE_EMULATOR_HOST", "FIREBASE_FUNCTIONS_EMULATOR_HOST"])
  assert.match(process.env[variable] || "", /^(127\.0\.0\.1|localhost):\d+$/, `${variable} skal pege på localhost.`);

const outputDir = path.resolve(process.argv[2] || "output/review/lager-browser");
await mkdir(outputDir, { recursive: true });
await seedProcureAuthEmulator();
const edge = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\152.0.4191.66\\msedge.exe";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openBrowser(name, width, height) {
  const profileDir = await mkdtemp(path.join(tmpdir(), `veyro-lager-${name}-`));
  const child = spawn(edge, ["--headless=new", "--edge-skip-compat-layer-relaunch", "--remote-debugging-pipe", `--user-data-dir=${profileDir}`, "--no-first-run", "--disable-default-apps", "about:blank"], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true });
  let sequence = 0; let buffer = Buffer.alloc(0); const pending = new Map();
  child.stdio[4].on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]); let separator;
    while ((separator = buffer.indexOf(0)) >= 0) {
      const packet = buffer.subarray(0, separator).toString("utf8"); buffer = buffer.subarray(separator + 1); if (!packet) continue;
      const message = JSON.parse(packet); const request = pending.get(message.id); if (!request) continue; pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result || {});
    }
  });
  const send = (method, params = {}, sessionId) => { const id = ++sequence; const packet = { id, method, params }; if (sessionId) packet.sessionId = sessionId; child.stdio[3].write(`${JSON.stringify(packet)}\0`); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); };
  await sleep(300); const page = (await send("Target.getTargets")).targetInfos.find((target) => target.type === "page"); assert.ok(page);
  const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId); await send("Network.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 }, sessionId);
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: outputDir, eventsEnabled: true });
  const evaluate = async (expression) => { const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result?.value; };
  const waitFor = async (expression, label, attempts = 500) => { for (let i = 0; i < attempts; i += 1) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(80); } throw new Error(`Timeout ${name}: ${label} · ${await evaluate("location.href+' | '+document.body.innerText.slice(0,900)")}`); };
  const navigate = async (url, ready) => { await send("Page.navigate", { url }, sessionId); await waitFor(ready, url); await sleep(220); };
  const setViewport = async (nextWidth, nextHeight) => send("Emulation.setDeviceMetricsOverride", { width: nextWidth, height: nextHeight, deviceScaleFactor: 1, mobile: nextWidth < 700 }, sessionId);
  const layout = async (rootSelector) => evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(rootSelector)});const r=root?.getBoundingClientRect();const controls=[...root?.querySelectorAll('button,input,select,a')||[]].filter(el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'}).map(el=>{const b=el.getBoundingClientRect();return {text:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,60),left:b.left,right:b.right,width:b.width}});return {viewport:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,root:r&&{left:r.left,right:r.right,width:r.width},outside:controls.filter(x=>x.left<-.5||x.right>innerWidth+.5)}})()`);
  const screenshot = async (filename, rootSelector) => { const measured = await layout(rootSelector); assert.ok(measured.scrollWidth <= measured.clientWidth, `${filename}: hele siden har vandret overflow`); assert.deepEqual(measured.outside, [], `${filename}: betjeningselement uden for viewport`); const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId); await writeFile(path.join(outputDir, filename), Buffer.from(result.data, "base64")); return { filename, ...measured }; };
  const close = async () => { try { await send("Browser.close"); } catch { child.kill(); } const resolved = path.resolve(profileDir); if (resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`)) await rm(resolved, { recursive: true, force: true, maxRetries: 3 }); };
  return { send, sessionId, evaluate, waitFor, navigate, setViewport, screenshot, close };
}

const reactInput = (selector, value, type = "HTMLInputElement") => `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const set=Object.getOwnPropertyDescriptor(${type}.prototype,'value').set;set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`;
const clickText = (selector, value) => `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.textContent.includes(${JSON.stringify(value)}));if(!el)return false;el.click();return true})()`;
async function login(browser, returnPath) {
  await browser.navigate(`${baseUrl}${returnPath}`, "document.querySelector('#fc-email')");
  await browser.evaluate(reactInput("#fc-email", TEST_USERS.buyer.email));
  await browser.evaluate(reactInput("#fc-kode", SYNTHETIC_PASSWORD));
  await browser.evaluate("document.querySelector('form button[type=submit]').click()");
  await browser.waitFor("!location.pathname.endsWith('/login')", "almindeligt login");
}

const mobile = await openBrowser("mobile", 390, 844);
const desktop = await openBrowser("desktop", 1440, 980);
const second = await openBrowser("second-session", 1440, 980);
const screenshots = []; const checks = {};
try {
  await login(mobile, "/indkoeb/mobil/modtag/lager-ordre-1");
  await mobile.waitFor("document.querySelector('.procure-mobile-receipt-line') && document.body.innerText.includes('BST-2026-00042')", "modtagelsesordre");
  await mobile.waitFor("document.querySelector('.procure-mobile-receiving select')?.value", "serverhentet lagerplacering");
  assert.equal(await mobile.evaluate("document.querySelectorAll('h1').length"), 1);
  screenshots.push(await mobile.screenshot("01-mobil-modtag-varer-390.png", ".procure-mobile-receiving"));
  await mobile.setViewport(375, 812); await sleep(150);
  screenshots.push(await mobile.screenshot("01b-mobil-modtag-varer-375.png", ".procure-mobile-receiving"));
  await mobile.setViewport(360, 800); await sleep(150);
  screenshots.push(await mobile.screenshot("02-mobil-modtag-varer-360.png", ".procure-mobile-receiving"));
  await mobile.setViewport(390, 844);
  await mobile.evaluate(clickText("button", "Gennemgå modtagelse")); await mobile.waitFor("document.querySelector('.procure-mobile-receipt-review')", "gennemgang");
  await mobile.evaluate(clickText("button", "Bekræft modtagelse")); await mobile.waitFor("document.body.innerText.includes('Varerne er modtaget')", "modtagelse gemt", 800);
  screenshots.push(await mobile.screenshot("03-mobil-modtagelse-gemt-390.png", ".procure-mobile-receiving"));
  await mobile.evaluate(clickText("button", "Optæl og opdater lagerstatus")); await mobile.waitFor("document.querySelector('.procure-mobile-count')", "optælling");
  await mobile.evaluate(reactInput(".procure-mobile-count input[type=number]", 66));
  await mobile.evaluate(reactInput(".procure-mobile-count textarea", "Afvigelse ved optælling", "HTMLTextAreaElement"));
  await mobile.waitFor("document.querySelector('.procure-inventory-difference')?.textContent.includes('−2')", "minus to");
  screenshots.push(await mobile.screenshot("04-mobil-optael-lager-390.png", ".procure-mobile-receiving"));
  await mobile.setViewport(360, 800); await sleep(150);
  screenshots.push(await mobile.screenshot("05-mobil-optael-lager-360.png", ".procure-mobile-receiving"));
  await mobile.setViewport(390, 844);
  await mobile.evaluate(clickText("button", "Bekræft optælling"));
  await mobile.waitFor("document.body.innerText.includes('Lagerstatus er opdateret') && document.body.innerText.includes('Ny beholdning: 66 ruller') && document.body.innerText.includes('Optællingskorrektion: −2 ruller')", "konkret kvittering", 600);
  assert.equal(await mobile.evaluate("document.querySelectorAll('h1').length"), 1);
  checks.concreteReceipt = await mobile.evaluate("document.querySelector('.procure-mobile-final').innerText");
  screenshots.push(await mobile.screenshot("06-mobil-lagerstatus-opdateret-390.png", ".procure-mobile-receiving"));
  await mobile.setViewport(360, 800); await sleep(150);
  screenshots.push(await mobile.screenshot("07-mobil-lagerstatus-opdateret-360.png", ".procure-mobile-receiving"));

  await login(desktop, "/indkoeb/lager");
  await desktop.waitFor("document.querySelector('.procure-inventory-detail')?.innerText.includes('66 ruller') && document.querySelector('.procure-inventory-detail')?.innerText.includes('Optælling')", "lagerhistorik");
  const desktopLayout = await desktop.evaluate(`(()=>{const content=document.querySelector('.procure-inventory').getBoundingClientRect();const shell=document.querySelector('main')?.getBoundingClientRect();const wraps=[...document.querySelectorAll('.procure-inventory .procure-table-wrap')].map(el=>({clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}));return {content:{left:content.left,right:content.right,width:content.width},shell:shell&&{left:shell.left,right:shell.right,width:shell.width},wraps,page:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}}})()`);
  assert.ok(desktopLayout.content.left < 340, `lagerindhold starter for langt mod højre: ${desktopLayout.content.left}`);
  assert.ok(desktopLayout.content.right <= desktopLayout.page.clientWidth + 1);
  assert.ok(desktopLayout.content.width > 1000);
  checks.desktopLayout = desktopLayout;
  screenshots.push(await desktop.screenshot("08-desktop-lageroversigt-og-historik.png", ".procure-inventory"));

  await rm(path.join(outputDir, "procure-lager-2026-01-01-2026-12-31.csv"), { force: true });
  const oldFiles = new Set(await readdir(outputDir));
  await desktop.evaluate(clickText("button", "Eksportér CSV"));
  let csvName = "";
  for (let attempt = 0; attempt < 80; attempt += 1) { const files = await readdir(outputDir); csvName = files.find((file) => file.endsWith(".csv") && !oldFiles.has(file)) || ""; if (csvName) break; await sleep(100); }
  assert.ok(csvName, "CSV-download blev ikke fundet");
  const csv = await readFile(path.join(outputDir, csvName), "utf8");
  assert.match(csv, /"Fra dato";"Til dato"/); assert.match(csv, /"2026-01-01";"2026-12-31"/); assert.match(csv, /"Ultimo"/); assert.match(csv, /"66";"ruller"/);
  checks.csv = { filename: csvName, selectedPeriod: "2026-01-01 – 2026-12-31", containsUnits: csv.includes("ruller") };

  await login(second, "/indkoeb/lager");
  await second.waitFor("document.querySelector('.procure-inventory-detail')?.innerText.includes('66 ruller') && document.querySelector('.procure-inventory-detail')?.innerText.includes('Afvigelse ved optælling')", "genåbnet anden session");
  checks.reopenedSecondAuthorizedSession = true;
  screenshots.push(await second.screenshot("09-desktop-genaabnet-anden-session.png", ".procure-inventory"));

  const evidence = { ok: true, baseUrl, ordinaryFirebaseLogin: true, checks, screenshots };
  await writeFile(path.join(outputDir, "PROCURE_LAGER_BROWSER_QA.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await Promise.allSettled([mobile.close(), desktop.close(), second.close()]);
}
