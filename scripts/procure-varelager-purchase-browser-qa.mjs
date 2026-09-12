/* Autoriseret browser-QA af forenklet Varelager, køb med kvittering og Forbrug.
 * Kører kun mod localhost og syntetiske Firebase-emulatordata. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { seedProcureAuthEmulator, SYNTHETIC_PASSWORD, TEST_USERS } from "./procure-auth-emulator-seed.mjs";

const baseUrl = process.env.PROCURE_INVENTORY_QA_URL || "http://127.0.0.1:5208";
assert.match(baseUrl, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
for (const variable of ["FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_DATABASE_EMULATOR_HOST", "FIREBASE_FUNCTIONS_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"])
  assert.match(process.env[variable] || "", /^(127\.0\.0\.1|localhost):\d+$/, `${variable} skal pege på localhost.`);
const outputDir = path.resolve(process.argv[2] || "output/review/varelager-koeb-browser");
await mkdir(outputDir, { recursive: true });
await seedProcureAuthEmulator();
const edge = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\152.0.4191.66\\msedge.exe";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openBrowser(name, width, height) {
  const profileDir = await mkdtemp(path.join(tmpdir(), `veyro-varelager-${name}-`));
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
  await sleep(350); const page = (await send("Target.getTargets")).targetInfos.find((target) => target.type === "page"); assert.ok(page);
  const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId); await send("Network.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 }, sessionId);
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: outputDir, eventsEnabled: true });
  const evaluate = async (expression) => { const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result?.value; };
  const waitFor = async (expression, label, attempts = 600) => { for (let i = 0; i < attempts; i += 1) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(80); } throw new Error(`Timeout ${name}: ${label} · ${await evaluate("location.href+' | '+document.body.innerText.slice(0,1200)")}`); };
  const navigate = async (url, ready) => { await send("Page.navigate", { url }, sessionId); await waitFor(ready, url); await sleep(250); };
  const setViewport = async (nextWidth, nextHeight) => send("Emulation.setDeviceMetricsOverride", { width: nextWidth, height: nextHeight, deviceScaleFactor: 1, mobile: nextWidth < 700 }, sessionId);
  const layout = async (rootSelector) => evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(rootSelector)});const r=root?.getBoundingClientRect();const controls=[...root?.querySelectorAll('button,input,select,a,label')||[]].filter(el=>{const s=getComputedStyle(el);const b=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&b.width>2}).map(el=>{const b=el.getBoundingClientRect();return {text:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,50),left:b.left,right:b.right,width:b.width}});return {viewport:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,root:r&&{left:r.left,right:r.right,width:r.width},outside:controls.filter(x=>x.left<-.5||x.right>innerWidth+.5)}})()`);
  const screenshot = async (filename, rootSelector) => { const measured = await layout(rootSelector); assert.ok(measured.scrollWidth <= measured.clientWidth, `${filename}: hele siden har vandret overflow`); assert.deepEqual(measured.outside, [], `${filename}: betjeningselement uden for viewport`); const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId); await writeFile(path.join(outputDir, filename), Buffer.from(result.data, "base64")); return { filename, ...measured }; };
  const close = async () => { try { await send("Browser.close"); } catch { child.kill(); } const resolved = path.resolve(profileDir); if (resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`)) await rm(resolved, { recursive: true, force: true, maxRetries: 3 }); };
  return { send, sessionId, evaluate, waitFor, navigate, setViewport, screenshot, close };
}

const input = (selector, value, type = "HTMLInputElement") => `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const set=Object.getOwnPropertyDescriptor(${type}.prototype,'value').set;set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`;
const click = (selector, text) => `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.textContent.includes(${JSON.stringify(text)}));if(!el)return false;el.click();return true})()`;
async function login(browser, returnPath) {
  await browser.navigate(`${baseUrl}${returnPath}`, "document.querySelector('#fc-email')");
  await browser.evaluate(input("#fc-email", TEST_USERS.buyer.email)); await browser.evaluate(input("#fc-kode", SYNTHETIC_PASSWORD));
  await browser.evaluate("document.querySelector('form button[type=submit]').click()"); await browser.waitFor("!location.pathname.endsWith('/login')", "almindeligt Firebase-login");
}

const desktop = await openBrowser("desktop", 1440, 980); const mobile = await openBrowser("mobile", 390, 844); const second = await openBrowser("second", 1440, 980);
const screenshots = []; const checks = {};
try {
  await login(desktop, "/indkoeb/lager");
  await desktop.waitFor("document.querySelector('.procure-inventory-list')?.innerText.includes('Pakketape') && document.body.innerText.includes('Varelager')", "Varelager");
  assert.equal(await desktop.evaluate("document.querySelectorAll('.procure-inventory-list tbody tr').length"), 1, "kun lagerførte varer skal vises én gang pr. varenummer");
  assert.equal(await desktop.evaluate("document.body.innerText.includes('Registrér forbrug')"), false);
  screenshots.push(await desktop.screenshot("01-desktop-varelager.png", ".procure-inventory"));

  await desktop.navigate(`${baseUrl}/indkoeb/bestillinger/mail-ordre-1/send`, "document.querySelector('.procure-mail-body')");
  await desktop.waitFor("document.querySelector('.procure-mail-body')?.value.includes('Fakturering\\nSend faktura til: faktura@fjordholm.example')", "mailforslag med fakturering");
  await desktop.waitFor("!document.querySelector('.procure-pdf-row')?.disabled", "revisionslåst ordre-PDF klar til preview", 1000);
  checks.mailProposal = await desktop.evaluate("document.querySelector('.procure-mail-body').value");
  assert.match(checks.mailProposal, /Angiv vores bestillingsnummer BST-2026-00043 på følgesedlen og fakturaen\./);
  assert.match(checks.mailProposal, /Fakturaen skal være i PDF-format\./);
  screenshots.push(await desktop.screenshot("12-desktop-mailforslag-fakturering.png", ".procure-send-grid"));

  await desktop.navigate(`${baseUrl}/indkoeb/katalog`, "document.querySelector('.procure-products')");
  await desktop.evaluate(click("button", "Vareopsætning"));
  await desktop.waitFor("document.querySelector('.procure-modal')?.innerText.includes('Før lagerstatus') && document.querySelector('.procure-modal')?.innerText.includes('Standardafdeling')", "vareopsætning");
  screenshots.push(await desktop.screenshot("02-desktop-vareopsaetning.png", ".procure-modal"));
  await desktop.evaluate("document.querySelector('.procure-modal-layer button[aria-label=\"Luk\"]')?.click()");
  await desktop.waitFor("!document.querySelector('.procure-modal-layer')", "vareopsætning lukket");

  await desktop.navigate(`${baseUrl}/indkoeb/bestillinger/ny`, "document.querySelector('.procure-purchase-choices')");
  screenshots.push(await desktop.screenshot("03-desktop-ny-bestilling-to-valg.png", ".procure-purchase-entry"));

  await login(mobile, "/indkoeb/bestillinger/ny");
  await mobile.waitFor("document.querySelector('.procure-purchase-choices')", "mobilvalg");
  screenshots.push(await mobile.screenshot("04-mobil-ny-bestilling-390.png", ".procure-purchase-entry"));
  await mobile.setViewport(360, 800); await sleep(150); screenshots.push(await mobile.screenshot("05-mobil-ny-bestilling-360.png", ".procure-purchase-entry")); await mobile.setViewport(390, 844);
  await mobile.evaluate(click("button", "Registrér allerede foretaget køb")); await mobile.waitFor("document.querySelector('.procure-purchase-form')", "købsformular");
  // Vælg Mælk og udfyld brugerens faktiske afdeling, antal og beløb.
  await mobile.evaluate(input(".procure-purchase-lines select", "milk", "HTMLSelectElement"));
  await mobile.waitFor("document.querySelectorAll('.procure-purchase-lines select')[1]?.value==='administration'", "standardafdeling foreslået");
  await mobile.evaluate(input(".procure-purchase-lines input[type=number]", 12));
  await mobile.evaluate(input(".procure-purchase-lines input[placeholder='0,00']", "144,00"));
  await mobile.evaluate(`(()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const file=new File([bytes],'mobil-kvittering.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(file);const el=document.querySelector('.procure-purchase-files input[accept="application/pdf,image/jpeg,image/png"]');el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));return el.files.length})()`);
  await mobile.waitFor("document.querySelector('.procure-purchase-files')?.innerText.includes('mobil-kvittering.png')", "kvittering valgt");
  screenshots.push(await mobile.screenshot("06-mobil-koeb-med-kvittering-390.png", ".procure-purchase-entry"));
  await mobile.evaluate(click("button", "Fortsæt")); await mobile.waitFor("document.body.innerText.includes('Kontrollér køb')", "gennemgang");
  screenshots.push(await mobile.screenshot("07-mobil-kontroller-koeb-390.png", ".procure-purchase-entry"));
  await mobile.evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Gem køb'));b.click();b.click();return true})()");
  await mobile.waitFor("document.body.innerText.includes('Købet er gemt') && document.body.innerText.includes('Kvittering')", "køb gemt", 1000);
  checks.mobileSuccess = await mobile.evaluate("document.querySelector('.procure-purchase-done').innerText");
  assert.doesNotMatch(checks.mobileSuccess, /[0-9a-f]{8}-[0-9a-f-]{20,}/i, "intern UUID må ikke vises");
  screenshots.push(await mobile.screenshot("08-mobil-koeb-registreret-390.png", ".procure-purchase-entry"));
  await mobile.setViewport(360, 800); await sleep(150); screenshots.push(await mobile.screenshot("09-mobil-koeb-registreret-360.png", ".procure-purchase-entry"));
  const reference = await mobile.evaluate("document.querySelector('.procure-purchase-done p b').textContent");

  await login(second, `/indkoeb/bestillinger?soeg=${encodeURIComponent(reference)}`);
  await second.waitFor(`document.querySelector('.procure-workspace-detail')?.innerText.includes(${JSON.stringify(reference)}) && document.body.innerText.includes('Åbn kvittering')`, "køb og bilag genåbnet i anden session");
  await second.evaluate("window.open=(url)=>{window.__procureOpenedUrl=url;return null}"); await second.evaluate(click("button", "Åbn kvittering"));
  await second.waitFor("window.__procureOpenedUrl", "autoriseret bilagslink");
  const reopened = await second.evaluate(`(async()=>{const response=await fetch(window.__procureOpenedUrl);const bytes=new Uint8Array(await response.arrayBuffer());const digest=await crypto.subtle.digest('SHA-256',bytes);return {ok:response.ok,size:bytes.length,sha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}})()`);
  assert.equal(reopened.ok, true); assert.equal(reopened.sha256, "431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460");
  checks.reopenedReceipt = reopened; checks.secondAuthorizedSession = true;
  screenshots.push(await second.screenshot("10-desktop-koeb-genaabnet-med-kvittering.png", ".procure-workspace"));

  await second.navigate(`${baseUrl}/indkoeb/forbrug?periode=2026-09`, "document.querySelector('.procure-material-report')");
  await second.waitFor("document.querySelector('.procure-material-report')?.innerText.includes('Mælk 1 liter') && document.querySelector('.procure-material-report')?.innerText.includes('Indkøbt mængde')", "materialeforbrug");
  await second.evaluate(`(()=>{const row=[...document.querySelectorAll('.procure-material-report tbody tr')].find(x=>x.textContent.includes('Mælk 1 liter'));row.querySelector('button').click();return true})()`);
  await second.waitFor("document.querySelector('.procure-material-detail')?.innerText.includes('12 liter')", "køb bag forbrug");
  screenshots.push(await second.screenshot("11-desktop-forbrug-med-koebsgrundlag.png", ".procure-v2"));
  const oldFiles = new Set(await readdir(outputDir)); await second.evaluate(click("button", "Eksportér CSV"));
  let csvName = ""; for (let attempt = 0; attempt < 100; attempt += 1) { const files = await readdir(outputDir); csvName = files.find((file) => file.startsWith("procure-materialeforbrug-") && file.endsWith(".csv") && !oldFiles.has(file)) || ""; if (csvName) break; await sleep(100); }
  assert.ok(csvName, "materialeforbrugs-CSV blev ikke downloadet"); const csv = await readFile(path.join(outputDir, csvName), "utf8");
  assert.match(csv, /"2026-09-01";"2026-09-30"/); assert.match(csv, /"Mælk 1 liter";"KANT-1001";"Administration";"Indkøbt mængde";"12";"liter"/);
  checks.csv = { filename: csvName, sha256: createHash("sha256").update(csv).digest("hex"), period: "2026-09-01–2026-09-30", milkQuantity: 12, unit: "liter" };

  const evidence = { ok: true, baseUrl, ordinaryFirebaseLogin: true, checks, screenshots };
  await writeFile(path.join(outputDir, "PROCURE_VARELAGER_KOEB_BROWSER_QA.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally { await Promise.allSettled([desktop.close(), mobile.close(), second.close()]); }
