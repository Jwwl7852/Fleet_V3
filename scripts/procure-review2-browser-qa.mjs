/* Lokal, autoriseret review-QA for webshop/firmakort og PDF-QR/modtagelse.
 * Scriptet nægter eksterne emulatorværter, bruger kun .invalid-data og
 * gemmer screenshots/PDF i den angivne afleveringsmappe. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PROJECT_ID, SYNTHETIC_PASSWORD, TENANT_A, TEST_USERS } from "./procure-auth-emulator-seed.mjs";

const hosts = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9109",
  database: process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9010",
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5012",
};
for (const [name, host] of Object.entries(hosts)) assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, `${name} skal være en lokal emulator.`);
const baseUrl = process.env.PROCURE_AUTH_QA_URL || "http://127.0.0.1:5207";
assert.match(baseUrl, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const outputDir = path.resolve(process.argv[2] || "artifacts/procure-review2-browser-qa");
await mkdir(outputDir, { recursive: true });
const functionBase = `http://${hosts.functions}/${PROJECT_ID}/europe-west1`;
const databaseBase = `http://${hosts.database}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function signIn(email) {
  const response = await fetch(`http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: SYNTHETIC_PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json(); assert.equal(response.ok, true, JSON.stringify(body)); return body.idToken;
}
async function call(name, data, token, expected = 200) {
  const response = await fetch(`${functionBase}/${name}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data }),
  });
  const body = await response.json(); assert.equal(response.status, expected, `${name}: ${JSON.stringify(body)}`); return body.result;
}
async function read(pathname, token, tenant = TENANT_A) {
  const response = await fetch(`${databaseBase}/tenants/${tenant}/${pathname}.json?ns=${PROJECT_ID}&auth=${encodeURIComponent(token)}`);
  const body = await response.json(); assert.equal(response.ok, true, JSON.stringify(body)); return body;
}
async function waitForBackend(check, label, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) { const value = await check(); if (value) return value; await sleep(100); }
  throw new Error(`Timeout i backend: ${label}`);
}
async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let error = ""; child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} fejlede (${code}): ${error}`)));
  });
}
async function runCapture(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, env: { ...process.env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`${command} fejlede (${code}): ${error}`)));
  });
}

const buyerToken = await signIn(TEST_USERS.buyer.email);
const approverToken = await signIn(TEST_USERS.approver.email);
const adminToken = await signIn(TEST_USERS.admin.email);
await call("procureWebshopCredentialGem", { leverandoerId: "nordisk", brugernavn: "syntetisk-ui-bruger", adgangskode: "Syntetisk-kun-lokal-adgang" }, adminToken);
const saved = await call("procureMobilKladdeGem", { expectedRevision: 0, mutationId: `review2-save-${randomUUID()}`, draft: {
  items: { tape: 10 }, departmentId: "lager", department: "Lager", deliveryLocationId: "hovedlager",
  deliveryLocation: "Hovedlager · rampe 2", wantedDate: "2026-09-30", asSoonAsPossible: false,
} }, buyerToken);
const submitted = await call("procureMobilKladdeDelIndsend", { expectedRevision: saved.draft.revision,
  requestId: `review2-submit-${randomUUID()}`, selections: [{ id: "tape", quantity: 10 }] }, buyerToken);
const approval = await read(`procureGodkendelsessager/${submitted.approvalId}`, approverToken);
const decided = await call("procureGodkendelseslinjerAfgor", { approvalId: approval.id, expectedRevision: approval.revision,
  requestId: `review2-approve-${randomUUID()}`, decisions: Object.values(approval.lines).map((line) => ({ lineId: line.id, action: "approve", quantity: line.requestedQuantity })) }, approverToken);
assert.equal(decided.orders.length, 1);
const orderId = decided.orders[0].id;
let order = await read(`indkoebsordrer/${orderId}`, buyerToken);
const orderLineId = Object.keys(order.linjer)[0];
assert.equal(order.status, "godkendt"); assert.equal(order.linjer[orderLineId].antal, 10);

const pdf = await call("ordrePdfHent", { ordreId: orderId }, buyerToken);
const pdfBytes = Buffer.from(await (await fetch(pdf.url)).arrayBuffer());
assert.equal(sha(pdfBytes), pdf.sha256);
const pdfPath = path.join(outputDir, `${order.nummer}-syntetisk-ordre.pdf`);
await writeFile(pdfPath, pdfBytes);
const renderPrefix = path.join(outputDir, `${order.nummer}-syntetisk-ordre`);
await run(process.env.PDFTOPPM || "pdftoppm", ["-png", "-r", "220", pdfPath, renderPrefix]);
const pdfPngPath = `${renderPrefix}-1.png`;

const edge = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\152.0.4191.66\\msedge.exe";
async function openBrowser(name, width = 390, height = 844) {
  const profileDir = await mkdtemp(path.join(tmpdir(), `veyro-procure-review2-${name}-`));
  const child = spawn(edge, ["--headless=new", "--edge-skip-compat-layer-relaunch", "--enable-features=BarcodeDetector", "--remote-debugging-pipe", `--user-data-dir=${profileDir}`, "--no-first-run", "--disable-default-apps", "about:blank"], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true });
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
  await sleep(220); const targets = await send("Target.getTargets"); const page = targets.targetInfos.find((target) => target.type === "page"); assert.ok(page);
  const attached = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true }); const sessionId = attached.sessionId;
  await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId); await send("Network.enable", {}, sessionId); await send("DOM.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 }, sessionId);
  const evaluate = async (expression) => { const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result?.value; };
  const waitFor = async (expression, label, attempts = 250) => { for (let i = 0; i < attempts; i += 1) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(80); } throw new Error(`Timeout ${name}: ${label} · ${await evaluate("location.href+' | '+document.body.innerText.slice(0,600)")}`); };
  const navigate = async (url, expression) => { await send("Page.navigate", { url }, sessionId); await waitFor(expression, url); await sleep(180); };
  const screenshot = async (filename) => { const metrics = await evaluate("({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})"); assert.ok(metrics.scrollWidth <= metrics.clientWidth, `${filename} har vandret overflow`); const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId); await writeFile(path.join(outputDir, filename), Buffer.from(result.data, "base64")); return { filename, ...metrics }; };
  const setFiles = async (selector, files) => { const root = await send("DOM.getDocument", { depth: -1, pierce: true }, sessionId); const node = await send("DOM.querySelector", { nodeId: root.root.nodeId, selector }, sessionId); assert.ok(node.nodeId); await send("DOM.setFileInputFiles", { nodeId: node.nodeId, files }, sessionId); };
  const close = async () => { try { await send("Browser.close"); } catch { child.kill(); } const resolved = path.resolve(profileDir); if (resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`)) await rm(resolved, { recursive: true, force: true, maxRetries: 3 }); };
  return { child, profileDir, send, sessionId, evaluate, waitFor, navigate, screenshot, setFiles, close };
}
const reactInput = (selector, value, type = "HTMLInputElement") => `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const set=Object.getOwnPropertyDescriptor(${type}.prototype,'value').set;set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`;
const clickText = (selector, value) => `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.textContent.includes(${JSON.stringify(value)}));if(!el)return false;el.click();return true})()`;
async function login(browser, user, returnPath) {
  await browser.navigate(`${baseUrl}${returnPath}`, "document.querySelector('#fc-email')");
  await browser.evaluate(reactInput("#fc-email", user.email)); await browser.evaluate(reactInput("#fc-kode", SYNTHETIC_PASSWORD));
  await browser.evaluate("document.querySelector('form button[type=submit]').click()"); await browser.waitFor("!location.pathname.endsWith('/login')", `login ${user.role}`);
}

const shopBrowser = await openBrowser("shop", 1280, 950);
const receiptA = await openBrowser("receipt-a");
const receiptB = await openBrowser("receipt-b");
const foreignBrowser = await openBrowser("foreign");
const screenshots = []; const checks = {};
const tempFiles = await mkdtemp(path.join(tmpdir(), "veyro-procure-review2-files-"));
try {
  const qrPython = process.env.PROCURE_QR_PYTHON || "python";
  const qrPythonPath = process.env.PROCURE_QR_PYTHONPATH || "";
  const receiptUrl = await runCapture(qrPython, ["-c", "from PIL import Image; import zxingcpp,sys; results=zxingcpp.read_barcodes(Image.open(sys.argv[1])); assert len(results)==1, f'Forventede én QR-kode, fandt {len(results)}'; print(results[0].text)", pdfPngPath], qrPythonPath ? { PYTHONPATH: qrPythonPath } : {});
  const parsedReceiptUrl = new URL(receiptUrl);
  assert.equal(parsedReceiptUrl.origin, "https://procure-preview.example.invalid");
  assert.equal(parsedReceiptUrl.pathname, `/indkoeb/mobil/modtag/${orderId}`);
  Object.assign(checks, { pdfSha256: pdf.sha256, pdfBytes: pdfBytes.length, decodedReceiptUrl: receiptUrl });

  await login(shopBrowser, TEST_USERS.admin, `/indkoeb/bestillinger/${orderId}/send`);
  await shopBrowser.waitFor("document.body.innerText.includes(" + JSON.stringify(order.nummer) + ") && document.querySelector('[role=tablist]')", "godkendt webshopordre");
  await shopBrowser.evaluate(clickText("button", "Leverandørwebshop")); await shopBrowser.waitFor("document.body.innerText.includes('Åbning bestiller intet')", "webshopfane");
  const statusBeforeOpen = (await read(`indkoebsordrer/${orderId}`, adminToken)).status;
  const targetsBefore = (await shopBrowser.send("Target.getTargets")).targetInfos.length;
  await shopBrowser.evaluate(clickText("button", "Åbn leverandørwebshop")); await sleep(400);
  const targetsAfter = (await shopBrowser.send("Target.getTargets")).targetInfos.length;
  const statusAfterOpen = (await read(`indkoebsordrer/${orderId}`, adminToken)).status;
  assert.equal(statusBeforeOpen, "godkendt"); assert.equal(statusAfterOpen, "godkendt"); assert.ok(targetsAfter >= targetsBefore);
  await shopBrowser.evaluate(reactInput(".procure-form-grid input", "SYN-WEB-UI-2001"));
  await shopBrowser.evaluate(reactInput(".procure-form-grid input[inputmode=decimal]", "240,00"));
  await shopBrowser.evaluate(reactInput(".procure-form-grid select", "firmakort", "HTMLSelectElement"));
  await shopBrowser.waitFor("document.querySelectorAll('.procure-form-grid input').length>=6", "firmakortfelter");
  const inputs = await shopBrowser.evaluate(`(()=>{const values=['SYN-BEKRAEFT-2001','2026-09-24','SYN-KORT-UI-2001','SYN-KVITTERING-UI-2001'];const fields=[...document.querySelectorAll('.procure-form-grid input')].slice(2);fields.forEach((el,index)=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,values[index]);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});return fields.length})()`);
  assert.ok(inputs >= 4);
  screenshots.push(await shopBrowser.screenshot("01-autoriseret-webshop-firmakort-foer.png"));
  await shopBrowser.evaluate(clickText("button", "Registrér webshopbestilling"));
  await shopBrowser.waitFor("document.body.innerText.includes('Webshopbestillingen er registreret')", "webshop registreret");
  order = await waitForBackend(async () => { const value = await read(`indkoebsordrer/${orderId}`, adminToken); return value.status === "sendt" ? value : null; }, "webshopstatus sendt");
  assert.equal(order.betaling.metode, "firmakort"); assert.equal(order.betaling.oekonomistatus, "afventerDokumentation");
  screenshots.push(await shopBrowser.screenshot("02-autoriseret-webshop-firmakort-registreret.png"));
  Object.assign(checks, { webshopOpenDidNotOrder: statusBeforeOpen === statusAfterOpen, webshopOrderReference: "SYN-WEB-UI-2001", webshopAmountOere: 24000, paymentMethod: order.betaling.metode, financeStatusAfterOrder: order.betaling.oekonomistatus });

  const localReceiptPath = parsedReceiptUrl.pathname;
  await login(receiptA, TEST_USERS.buyer, localReceiptPath);
  await receiptA.waitFor("document.querySelector('.procure-mobile-receipt-line') && document.body.innerText.includes(" + JSON.stringify(order.nummer) + ")", "PDF-QR modtagelsesvisning");
  assert.equal(Object.keys((await read(`indkoebsordrer/${orderId}`, buyerToken)).modtagelser || {}).length, 0, "QR-åbning registrerede en modtagelse");
  screenshots.push(await receiptA.screenshot("03-pdf-qr-login-retur-ingen-modtagelse.png"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const fileA = path.join(tempFiles, "foelgeseddel-ui.png"); const fileB = path.join(tempFiles, "varefoto-ui.png");
  await writeFile(fileA, png); await writeFile(fileB, Buffer.concat([png, Buffer.from("review2")]));
  await receiptA.evaluate(`(()=>{const fields=[...document.querySelectorAll('.procure-mobile-receipt-fields input')];const values=['8','1','1'];fields.forEach((el,index)=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,values[index]);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});return fields.length})()`);
  await receiptA.evaluate(reactInput(".procure-mobile-receipt-meta input:not([type=date])", "FS-UI-2001"));
  await receiptA.setFiles(".procure-mobile-file input[type=file]", [fileA, fileB]);
  await receiptA.waitFor("document.querySelectorAll('.procure-mobile-attachments article').length===2", "to dokumentkladder");
  screenshots.push(await receiptA.screenshot("04-mobilmodtagelse-delmaengde-og-to-billeder.png"));
  await receiptA.evaluate(clickText("button", "Gennemgå modtagelse")); await receiptA.waitFor("document.querySelector('.procure-mobile-receipt-review')", "modtagelsesreview");
  screenshots.push(await receiptA.screenshot("05-mobilmodtagelse-gennemgang.png"));
  await receiptA.evaluate(clickText("button", "Bekræft modtagelse")); await receiptA.waitFor("document.querySelector('.procure-mobile-receipt-done')", "første modtagelse gemt", 500);
  order = await waitForBackend(async () => { const value = await read(`indkoebsordrer/${orderId}`, buyerToken); return Object.keys(value.modtagelser || {}).length === 1 ? value : null; }, "første modtagelse");
  assert.equal(order.status, "sendt");
  const firstReceipt = Object.values(order.modtagelser)[0]; const firstLine = Object.values(firstReceipt.linjer)[0];
  assert.deepEqual({ accepted: firstLine.godkendtAntal, damaged: firstLine.beskadigetAntal, rejected: firstLine.afvistAntal }, { accepted: 6, damaged: 1, rejected: 1 });
  assert.equal(Object.keys(firstReceipt.dokumenter).length, 2);
  screenshots.push(await receiptA.screenshot("06-mobilmodtagelse-delvist-registreret.png"));

  await login(receiptB, TEST_USERS.buyer, localReceiptPath);
  await receiptB.waitFor("document.querySelector('.procure-mobile-receipt-history') && document.querySelectorAll('.procure-mobile-receipt-files button').length===2", "modtagelse og filer genåbnet");
  const fileTargetsBefore = (await receiptB.send("Target.getTargets")).targetInfos.length;
  await receiptB.evaluate("document.querySelector('.procure-mobile-receipt-files button').click()");
  await receiptB.waitFor("document.body.innerText.includes('tenantkontrolleret link')", "bilag åbnet via adgangskontrol");
  const fileTargetsAfter = (await receiptB.send("Target.getTargets")).targetInfos.length; assert.ok(fileTargetsAfter >= fileTargetsBefore);
  screenshots.push(await receiptB.screenshot("07-mobilmodtagelse-genaabnet-anden-session.png"));
  await receiptB.evaluate(reactInput(".procure-mobile-receipt-meta input:not([type=date])", "FS-UI-2002"));
  await receiptB.evaluate(clickText("button", "Gennemgå modtagelse")); await receiptB.waitFor("document.querySelector('.procure-mobile-receipt-review')", "slutmodtagelse gennemgået");
  await receiptB.evaluate(clickText("button", "Bekræft modtagelse")); await receiptB.waitFor("document.querySelector('.procure-mobile-receipt-done')", "slutmodtagelse gemt", 500);
  order = await waitForBackend(async () => { const value = await read(`indkoebsordrer/${orderId}`, buyerToken); return value.status === "modtaget" ? value : null; }, "lager afsluttet");
  assert.equal(order.betaling.oekonomistatus, "afventerDokumentation");
  await receiptB.waitFor("document.body.innerText.includes('Lagerstatus: Afsluttet') && document.body.innerText.includes('Afventer dokumentation')", "lager og økonomi adskilt");
  screenshots.push(await receiptB.screenshot("08-lager-afsluttet-oekonomi-fortsaetter.png"));

  const invoice = await call("procureFakturaImport", { ordreId: orderId, ordreRevision: order.revision,
    requestId: `review2-invoice-${randomUUID()}`, invoiceNumber: "SYN-WEB-FAK-2001", invoiceDate: "2026-09-25", type: "invoice",
    lines: [{ orderLineId, quantity: 10, unitPriceOere: 2400 }] }, adminToken);
  await call("fakturastatus", { fakturaId: invoice.fakturaId, til: "godkendt" }, approverToken);
  const approvedInvoices = Object.values(await read("fakturaer", adminToken)).filter((item) => item.destinationId === orderId && item.status === "godkendt");
  const invoiceNetOere = approvedInvoices.reduce((sum, item) => sum + (item.fakturatype === "credit-note" ? -1 : 1) * item.beloebOere, 0);
  assert.equal(invoiceNetOere, 24000);
  await receiptB.navigate(`${baseUrl}/indkoeb/bestillinger/${orderId}`, "document.querySelector('#fakturaer')");
  await receiptB.waitFor("document.body.innerText.includes('SYN-WEB-FAK-2001')", "faktura tilknyttet samme ordre");
  screenshots.push(await receiptB.screenshot("09-samme-webshopkoeb-modtagelse-og-faktura.png"));
  Object.assign(checks, { firstReceipt: { accepted: 6, damaged: 1, rejected: 1, documents: 2 }, reopenedInSecondSession: true,
    attachmentOpenedWithAuthorizedLink: true, warehouseStatus: order.status, financeStatusAfterWarehouse: order.betaling.oekonomistatus,
    linkedInvoiceNumber: "SYN-WEB-FAK-2001", approvedInvoiceNetOere: invoiceNetOere, documentedSpendWithoutDoubleCountOere: invoiceNetOere });

  await login(foreignBrowser, TEST_USERS.foreign, localReceiptPath);
  await foreignBrowser.waitFor("document.body.innerText.includes('Bestillingen blev ikke fundet')", "fremmed tenant afvist"); checks.foreignTenantReceiptDenied = true;

  await shopBrowser.navigate(`${baseUrl}/indkoeb/opsaetning`, "document.querySelector('.procure-setup-add input')");
  const styles = await shopBrowser.evaluate(`(()=>{const input=getComputedStyle(document.querySelector('.procure-setup-add input'));const banner=getComputedStyle(document.querySelector('.fc-miljoe'));return {inputBorderRadius:input.borderRadius,inputPadding:input.padding,inputFontFamily:input.fontFamily,bannerFontSize:banner.fontSize,bannerFontWeight:banner.fontWeight}})()`);
  assert.notEqual(styles.inputBorderRadius, "0px"); assert.notEqual(styles.inputPadding, "0px"); checks.computedStyles = styles;

  const evidence = { ok: true, baseUrl, orderId, poNumber: order.nummer, pdfPath, pdfRender: pdfPngPath, checks, screenshots };
  await writeFile(path.join(outputDir, "PROCURE_REVIEW2_BROWSER_QA.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await Promise.allSettled([shopBrowser.close(), receiptA.close(), receiptB.close(), foreignBrowser.close()]);
  const resolved = path.resolve(tempFiles); if (resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`)) await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
}
