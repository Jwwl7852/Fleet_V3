import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SYNTHETIC_PASSWORD, TEST_USERS } from "./procure-auth-emulator-seed.mjs";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\152.0.4191.66\\msedge.exe";
const baseUrl = process.env.PROCURE_AUTH_QA_URL || "http://127.0.0.1:5206";
const outputDir = path.resolve(process.argv[2] || "artifacts/procure-auth-browser-qa");
await mkdir(outputDir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openBrowser(name) {
  const profileDir = await mkdtemp(path.join(tmpdir(), `veyro-procure-${name}-`));
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
  await sleep(220); const targets = await send("Target.getTargets"); const page = targets.targetInfos.find((target) => target.type === "page");
  if (!page) throw new Error(`Ingen side i ${name}.`);
  const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId); await send("Network.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  const evaluate = async (expression) => { const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result?.value; };
  const waitFor = async (expression, label, attempts = 320) => {
    for (let i = 0; i < attempts; i += 1) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(80); }
    const state = await evaluate("({url:location.href,text:document.body.innerText.slice(0,800)})");
    throw new Error(`Timeout ${name}: ${label} · ${JSON.stringify(state)}`);
  };
  const navigate = async (url, expression) => { await send("Page.navigate", { url }, sessionId); await waitFor(expression, url); await sleep(160); };
  const screenshot = async (filename) => { const metrics = await evaluate("({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})"); const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId); await writeFile(path.join(outputDir, filename), Buffer.from(shot.data, "base64")); return { filename, ...metrics, horizontalOverflow: metrics.scrollWidth > metrics.clientWidth }; };
  const close = async () => { try { await send("Browser.close"); } catch { child.kill(); } const resolved = path.resolve(profileDir); if (resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`) && path.basename(resolved).startsWith("veyro-procure-")) await rm(resolved, { recursive: true, force: true, maxRetries: 3 }); };
  return { send, sessionId, evaluate, waitFor, navigate, screenshot, close };
}

const setReactInput = (selector, value) => `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`;
const clickText = (selector, text) => `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.textContent.includes(${JSON.stringify(text)}));if(!el)return false;el.click();return true})()`;

async function login(browser, user, returnPath = "/indkoeb/mobil") {
  await browser.navigate(`${baseUrl}${returnPath}`, "document.querySelector('#fc-email')");
  await browser.evaluate(setReactInput("#fc-email", user.email));
  await browser.evaluate(setReactInput("#fc-kode", SYNTHETIC_PASSWORD));
  await browser.evaluate("document.querySelector('form button[type=submit]').click()");
  await browser.waitFor("!location.pathname.endsWith('/login')", `login ${user.role}`);
}

const a = await openBrowser("session-a"); const b = await openBrowser("session-b");
const screenshots = []; const checks = {};
try {
  await login(a, TEST_USERS.buyer);
  await a.waitFor("document.querySelectorAll('.procure-mobile-product').length===10 && document.body.innerText.includes('Pakketape')", "ti varer");
  await a.evaluate(`(()=>{const tape=[...document.querySelectorAll('.procure-mobile-product')].find(card=>card.textContent.includes('Pakketape'));const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(tape.querySelector('input[type=number]'),'10');tape.querySelector('input[type=number]').dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('.procure-mobile-product')].filter(card=>!card.textContent.includes('Pakketape')).forEach(card=>card.querySelector('.procure-mobile-qty button:last-child').click());return true})()`);
  await a.waitFor("document.querySelector('.procure-mobile-cart-cta')?.textContent.includes('10 varelinjer')", "ti varer");
  await a.waitFor("document.querySelector('.procure-mobile-save')?.textContent.includes('Synkroniseret')", "servergemt kladde");
  screenshots.push(await a.screenshot("01-auth-mobil-varer-390.png"));
  await a.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true }, a.sessionId);
  screenshots.push(await a.screenshot("01b-auth-mobil-varer-360.png"));
  await a.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, a.sessionId);

  await login(b, TEST_USERS.buyer);
  await b.waitFor("document.querySelector('.procure-mobile-cart-cta')?.textContent.includes('10 varelinjer')", "kladde genoptaget i session B");
  checks.twoAuthorizedSessions = true;
  checks.resumedLineCount = Number(await b.evaluate("document.querySelector('.procure-mobile-cart-cta').textContent.match(/(\\d+) varelinjer/)[1]"));

  await a.navigate(`${baseUrl}/indkoeb/mobil/kurv`, "document.querySelectorAll('.procure-mobile-cartline').length===10");
  await a.evaluate(`(()=>{const rows=[...document.querySelectorAll('.procure-mobile-cartline')];const tape=rows.find(row=>row.textContent.includes('Pakketape'));[tape,...rows.filter(row=>row!==tape).slice(0,4)].forEach(row=>row.querySelector('.procure-mobile-send-toggle input').click());return true})()`);
  await a.waitFor("document.querySelector('.procure-mobile-review')?.textContent.includes('5 af 10 varelinjer')", "fem af ti linjer valgt");
  screenshots.push(await a.screenshot("02-auth-mobil-kurv-delindsendelse-390.png"));

  await a.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, a.sessionId); await a.evaluate("window.dispatchEvent(new Event('offline'))");
  await a.waitFor("document.querySelector('.procure-mobile-submit')?.disabled", "offline spærrer indsendelse");
  await a.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, a.sessionId); await a.evaluate("window.dispatchEvent(new Event('online'))");
  await a.waitFor("!document.querySelector('.procure-mobile-submit')?.disabled", "online igen");
  checks.reconnectDidNotSubmit = await a.evaluate("location.pathname.endsWith('/kurv')");
  await a.evaluate("(()=>{const button=document.querySelector('.procure-mobile-cart>.procure-mobile-submit');button.click();button.click();return true})()");
  await a.waitFor("location.pathname.endsWith('/mine') && new URLSearchParams(location.search).get('kvittering')==='1'", "kvittering");
  screenshots.push(await a.screenshot("03-auth-mobil-kvittering-390.png"));
  checks.receiptReference = await a.evaluate("document.querySelector('.procure-mobile-receipt strong')?.textContent||document.querySelector('.procure-mobile-receipt')?.textContent.slice(0,100)");

  await b.navigate(`${baseUrl}/indkoeb/mobil/kurv`, "document.querySelector('.procure-mobile-cart')");
  await b.send("Page.reload", {}, b.sessionId); await b.waitFor("document.querySelectorAll('.procure-mobile-cartline').length===5", "fem resterende linjer i anden session");
  checks.remainingLineCount = Number(await b.evaluate("document.querySelectorAll('.procure-mobile-cartline').length"));

  await a.navigate(`${baseUrl}/indkoeb/mobil/scan/qr-auth-tape-a1`, "document.querySelector('.procure-qr-product')");
  const qrBefore = Number.parseFloat(await a.evaluate("document.querySelector('.procure-qr-existing b').textContent"));
  await a.send("Page.reload", {}, a.sessionId); await a.waitFor("document.querySelector('.procure-qr-product')", "samme QR genlæst");
  const qrAfterPassive = Number.parseFloat(await a.evaluate("document.querySelector('.procure-qr-existing b').textContent"));
  await a.evaluate("document.querySelector('.procure-qr-product .procure-mobile-submit').click()");
  await a.waitFor("location.pathname.endsWith('/indkoeb/mobil/scan')", "tilføj og scan næste");
  await a.waitFor("document.querySelector('.procure-mobile-save')?.textContent.includes('Synkroniseret')", "QR-tilføjelse servergemt");
  await a.navigate(`${baseUrl}/indkoeb/mobil/scan/qr-auth-tape-a1`, "document.querySelector('.procure-qr-product')");
  const qrAfterActive = Number.parseFloat(await a.evaluate("document.querySelector('.procure-qr-existing b').textContent"));
  Object.assign(checks, { qrBefore, qrAfterPassive, qrAfterActive, passiveScanDidNotAdd: qrAfterPassive === qrBefore, activeAddIncremented: qrAfterActive === qrBefore + 1 });
  screenshots.push(await a.screenshot("04-auth-qr-aktiv-tilfoejelse-390.png"));

  await b.evaluate(clickText("button", "Log ud")); await b.waitFor("location.pathname.endsWith('/login')", "log ud session B");
  await login(b, TEST_USERS.buyer, "/indkoeb/mobil/scan/qr-auth-tape-a1");
  await b.waitFor("location.pathname.endsWith('/indkoeb/mobil/scan/qr-auth-tape-a1') && document.querySelector('.procure-qr-product')", "login-retur til QR"); checks.loginReturnToQr = true;

  await a.evaluate(clickText("button", "Log ud")); await a.waitFor("location.pathname.endsWith('/login')", "log ud før godkendelse");
  await login(a, TEST_USERS.approver, "/indkoeb/godkendelser");
  await a.waitFor("document.querySelectorAll('.procure-approval-lines>article').length===5", "fem indsendte linjer hos godkender");
  await a.evaluate(`(()=>{const rows=[...document.querySelectorAll('.procure-approval-lines>article')];const change=(el,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(el,value);el.dispatchEvent(new Event('change',{bubbles:true}));};const tape=rows.find(row=>row.textContent.includes('Pakketape'));change(tape.querySelector('select'),'approve');change(rows.find(row=>row!==tape).querySelector('select'),'approve');change(rows.filter(row=>row!==tape)[1].querySelector('select'),'defer');return true})()`);
  await a.waitFor("document.querySelector('.procure-approval-lines input[type=number]') && document.querySelector('.procure-approval-lines textarea')", "afgørelsesfelter");
  await a.evaluate(`(()=>{const rows=[...document.querySelectorAll('.procure-approval-lines>article')];const set=(el,value,proto)=>{const setter=Object.getOwnPropertyDescriptor(proto,'value').set;setter.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};const tape=rows.find(row=>row.textContent.includes('Pakketape'));set(tape.querySelector('input[type=number]'),'6',HTMLInputElement.prototype);set(document.querySelector('.procure-approval-lines textarea'),'Afventer lageroptælling',HTMLTextAreaElement.prototype);return true})()`);
  await a.waitFor("document.querySelector('.procure-decision-preview')?.textContent.includes('3 linjeafgørelse') && !document.querySelector('.procure-actions .procure-button')?.disabled", "beslutningsresumé");
  await a.evaluate("document.querySelector('.procure-decision-preview').scrollIntoView({block:'center'})"); await sleep(120);
  screenshots.push(await a.screenshot("05-auth-godkendelse-delmaengde-390.png"));
  await a.evaluate("document.querySelector('.procure-actions .procure-button').click()");
  await a.waitFor("document.body.innerText.includes('leverandørordre') && document.body.innerText.includes('ventende')", "linjeafgørelser gemt");
  checks.approvedSixOfTen = true; checks.deferredWithReason = true;

  await b.evaluate(clickText("button", "Log ud")); await b.waitFor("location.pathname.endsWith('/login')", "log ud før anden godkendersession");
  await login(b, TEST_USERS.approver, "/indkoeb/godkendelser");
  await b.waitFor("document.querySelector('.procure-approval-lines')?.textContent.includes('allerede godkendt 6') && document.querySelector('.procure-history')?.textContent.includes('Udskudt')", "afgørelser genåbnet i anden autoriseret session");
  checks.approvalReopenedSecondSession = true;
  await b.evaluate(clickText("button", "Log ud")); await b.waitFor("location.pathname.endsWith('/login')", "log ud før anden tenant");
  await login(b, TEST_USERS.foreign, "/indkoeb/mobil/scan/qr-auth-tape-a1");
  await b.waitFor("document.body.innerText.includes('QR-koden kan ikke bruges') || document.body.innerText.includes('Mærkatet er ukendt') || document.body.innerText.includes('Ingen adgang')", "anden tenant afvises"); checks.otherTenantDenied = true;

  console.log(JSON.stringify({ ok: true, baseUrl, outputDir, checks, screenshots }, null, 2));
} finally { await Promise.allSettled([a.close(), b.close()]); }
