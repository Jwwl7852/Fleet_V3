import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SYNTHETIC_PASSWORD, TEST_USERS } from "./procure-auth-emulator-seed.mjs";

const baseUrl = process.env.VEYRO_BROWSER_QA_URL || "http://127.0.0.1:5197";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl)) throw new Error("Browser-QA må kun køre mod localhost.");
const outputDir = path.resolve(process.argv[2] || "artifacts/veyro-rettelsesrunde-2026-09-15/browser");
await mkdir(outputDir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function edgeExecutable() {
  const root = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application";
  const versions = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+\./.test(entry.name))
    .map((entry) => entry.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = path.join(root, version, "msedge.exe");
    try { await access(candidate); return candidate; } catch { /* fortsæt */ }
  }
  throw new Error("Microsoft Edge blev ikke fundet i den dokumenterede installation.");
}

async function openBrowser(name) {
  const profileDir = await mkdtemp(path.join(tmpdir(), `veyro-integrated-${name}-`));
  const edge = await edgeExecutable();
  const child = spawn(edge, ["--headless=new", "--edge-skip-compat-layer-relaunch", "--remote-debugging-pipe", `--user-data-dir=${profileDir}`, "--no-first-run", "--disable-default-apps", "about:blank"], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true });
  let sequence = 0; let buffer = Buffer.alloc(0); const pending = new Map(); const events = [];
  child.stdio[4].on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]); let separator;
    while ((separator = buffer.indexOf(0)) >= 0) {
      const packet = buffer.subarray(0, separator).toString("utf8"); buffer = buffer.subarray(separator + 1); if (!packet) continue;
      const message = JSON.parse(packet);
      if (!message.id) { events.push(message); continue; }
      const request = pending.get(message.id); if (!request) continue; pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result || {});
    }
  });
  const send = (method, params = {}, sessionId) => { const id = ++sequence; const packet = { id, method, params }; if (sessionId) packet.sessionId = sessionId; child.stdio[3].write(`${JSON.stringify(packet)}\0`); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); };
  await sleep(300);
  const targets = await send("Target.getTargets"); const page = targets.targetInfos.find((target) => target.type === "page");
  if (!page) throw new Error(`Ingen Edge-side i ${name}.`);
  const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId); await send("Network.enable", {}, sessionId);
  const evaluate = async (expression) => { const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result?.value; };
  const waitFor = async (expression, label, attempts = 800) => {
    for (let i = 0; i < attempts; i += 1) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(75); }
    const state = await evaluate(`(async()=>({url:location.href,text:document.body.innerText.slice(0,900),indexedDb:typeof indexedDB,indexedDatabases:typeof indexedDB==='undefined'?[]:await indexedDB.databases(),viteError:document.querySelector('vite-error-overlay')?.shadowRoot?.textContent||null}))()`);
    state.browserEvents = events.filter((event) => ['Runtime.exceptionThrown','Log.entryAdded','Inspector.targetCrashed'].includes(event.method)).slice(-12);
    throw new Error(`Timeout ${name}: ${label} · ${JSON.stringify(state)}`);
  };
  const navigate = async (route, expression) => { await send("Page.navigate", { url: `${baseUrl}${route}` }, sessionId); await waitFor(expression, route); await sleep(180); };
  const spaNavigate = async (route, expression) => { await evaluate(`history.pushState({},'',${JSON.stringify(route)});dispatchEvent(new PopStateEvent('popstate'))`); await waitFor(expression, route); await sleep(120); };
  const viewport = async (width, height, mobile = width <= 480) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, sessionId);
  const screenshot = async (filename) => { const metrics = await evaluate(`(()=>{const root=document.documentElement;const initialScrollX=scrollX;scrollTo(999999,scrollY);const maxScrollX=scrollX;scrollTo(initialScrollX,scrollY);const rect=(selector)=>{const node=document.querySelector(selector);if(!node)return null;const box=node.getBoundingClientRect();return {top:Math.round(box.top),height:Math.round(box.height),overflowX:getComputedStyle(node).overflowX,overflowY:getComputedStyle(node).overflowY};};return {clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,clientHeight:root.clientHeight,scrollHeight:root.scrollHeight,maxScrollX,shellGeometry:{side:rect('.fc-side'),nav:rect('.fc-nav'),activeSub:rect('.fc-nav-modul.fc-modul-aaben>.fc-sub'),main:rect('.fc-main')}};})()`); const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId); await writeFile(path.join(outputDir, filename), Buffer.from(shot.data, "base64")); return { filename, ...metrics, horizontalOverflow: metrics.maxScrollX > 0 }; };
  const close = async () => { try { await send("Browser.close"); } catch { child.kill(); } const resolved = path.resolve(profileDir); if (resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`) && path.basename(resolved).startsWith("veyro-integrated-")) await rm(resolved, { recursive: true, force: true, maxRetries: 3 }); };
  return { close, evaluate, events, navigate, screenshot, send, sessionId, spaNavigate, viewport, waitFor };
}

const setInput = (selector, value) => `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`;
const clickText = (selector, value) => `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find((node)=>node.textContent.trim().includes(${JSON.stringify(value)}));if(!el)return false;el.focus();el.click();return true})()`;

async function login(browser, user, route) {
  await browser.navigate(route, "document.querySelector('#fc-email')");
  await browser.evaluate(setInput("#fc-email", user.email));
  await browser.evaluate(setInput("#fc-kode", SYNTHETIC_PASSWORD));
  await browser.evaluate("document.querySelector('form button[type=submit]').click()");
  await browser.waitFor("!location.pathname.endsWith('/login')", `login ${user.role}`);
}

const anonymous = await openBrowser("anonymous");
const denied = await openBrowser("denied");
const admin = await openBrowser("admin");
const checks = {}; const screenshots = []; const viewports = [];
try {
  await anonymous.viewport(390, 844);
  await anonymous.navigate("/fleet-v2/livekort", "document.querySelector('#fc-email')");
  checks.anonymousDirectUrl = await anonymous.evaluate("({path:location.pathname,protectedFleet:!!document.querySelector('.veyro-module--fleet')})");
  assert(checks.anonymousDirectUrl.path.endsWith("/login") && !checks.anonymousDirectUrl.protectedFleet, "Anonym direkte FLEET-URL blev ikke afvist ved login.");
  screenshots.push(await anonymous.screenshot("01-anonym-direkte-url-390x844.png"));

  await denied.viewport(1440, 900, false);
  await login(denied, TEST_USERS.reader, "/fleet-v2/livekort");
  await denied.waitFor("document.body.innerText.includes('Ingen adgang til FLEET')", "manglende FLEET-adgang");
  checks.readerDenied = await denied.evaluate("({path:location.pathname,denied:document.body.innerText.includes('Ingen adgang til FLEET'),protectedFleet:!!document.querySelector('.veyro-module--fleet')})");
  assert(checks.readerDenied.denied && !checks.readerDenied.protectedFleet, "Bruger uden FLEET-permission så beskyttet modulindhold.");
  screenshots.push(await denied.screenshot("02-uden-fleet-adgang-1440x900.png"));

  await admin.viewport(1440, 900, false);
  await login(admin, TEST_USERS.admin, "/fleet-v2");
  await admin.waitFor("document.querySelector('.veyro-module--fleet h1')?.textContent.includes('God aften')", "integreret FLEET-overblik");
  checks.integratedShell = await admin.evaluate("({path:location.pathname,indexedDb:typeof indexedDB!=='undefined',appShells:document.querySelectorAll('.fc-app').length,fleetModules:document.querySelectorAll('.veyro-module--fleet').length,embedded:document.querySelectorAll('.fleet-v2-embedded').length,standaloneShells:document.querySelectorAll('.fleet-v2-shell').length})");
  assert(checks.integratedShell.indexedDb && checks.integratedShell.appShells === 1 && checks.integratedShell.fleetModules === 1 && checks.integratedShell.embedded === 1 && checks.integratedShell.standaloneShells === 0, "Den integrerede app havde ikke præcis én AppShell med embedded FLEET.");
  screenshots.push(await admin.screenshot("03-integreret-overblik-1440x900.png"));

  const shellBefore = await admin.evaluate("({side:document.querySelector('.fc-side').getBoundingClientRect().width,top:document.querySelector('.fc-top').getBoundingClientRect().height,zoom:document.querySelector('.fc-zoomkontroller output').textContent.trim()})");
  await admin.evaluate("document.querySelector('.fc-zoomkontroller [aria-label=\"Zoom ind\"]').click()");
  const shellAfterButton = await admin.evaluate("({side:document.querySelector('.fc-side').getBoundingClientRect().width,top:document.querySelector('.fc-top').getBoundingClientRect().height,zoom:document.querySelector('.fc-zoomkontroller output').textContent.trim()})");
  await admin.evaluate("document.querySelector('.fc-slot').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,shiftKey:true,bubbles:true,cancelable:true}))");
  const shellAfterWheel = await admin.evaluate("({side:document.querySelector('.fc-side').getBoundingClientRect().width,top:document.querySelector('.fc-top').getBoundingClientRect().height,zoom:document.querySelector('.fc-zoomkontroller output').textContent.trim()})");
  checks.workspaceZoom = { shellBefore, shellAfterButton, shellAfterWheel };
  assert(shellBefore.side === shellAfterButton.side && shellBefore.top === shellAfterButton.top && shellAfterButton.zoom !== shellBefore.zoom && shellAfterWheel.zoom !== shellAfterButton.zoom, "Arbejdsområdezoom ændrede shellen eller reagerede ikke på begge inputveje.");
  await admin.evaluate("document.querySelector('.fc-nulstil-visning').click()");
  await admin.evaluate("document.querySelector('.fc-menu-toggle').click()");
  checks.compactMenu = await admin.evaluate("({compact:document.querySelector('.fc-app').classList.contains('fc-menu-kompakt'),label:document.querySelector('.fc-side').getAttribute('aria-label'),toggleTop:Math.round(document.querySelector('.fc-menu-toggle').getBoundingClientRect().top),sideTop:Math.round(document.querySelector('.fc-side').getBoundingClientRect().top),sideHeight:Math.round(document.querySelector('.fc-side').getBoundingClientRect().height)})");
  assert(checks.compactMenu.compact && checks.compactMenu.label === "Kompakt navigation", "Kompakt menu blev ikke aktiveret.");
  await admin.evaluate("document.querySelector('.fc-nulstil-visning').click()");

  const routes = [
    ["/fleet-v2", "God aften", "04-overblik"],
    ["/fleet-v2/arbejdsko", "Arbejdskø", "05-arbejdsko"],
    ["/fleet-v2/indberetninger", "Indberetninger og triage", "06-indberetninger"],
    ["/fleet-v2/livekort", "Livekort", "07-livekort"],
    ["/fleet-v2/sager/case-demo-001", "Knirkende bremser", "08-sagsmappe"],
    ["/oekonomi/fakturacenter", "Fakturacenter", "09-fakturacenter"],
  ];
  for (const [width, height] of [[1920,1080],[1440,900],[390,844],[360,800]]) {
    await admin.viewport(width, height, width <= 480);
    for (const [route, heading, prefix] of routes) {
      await admin.spaNavigate(route, `[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes(${JSON.stringify(heading)}))`);
      const shot = await admin.screenshot(`${prefix}-${width}x${height}.png`);
      viewports.push({ route, width, height, ...shot });
      assert(!shot.horizontalOverflow, `Dokumentsiden kan rulles vandret uden for viewporten: ${route} ${width}x${height}.`);
      if (width <= 480) assert(shot.shellGeometry.main?.top < height * .7, `Hovedindholdet starter for langt nede på mobil: ${route} ${width}x${height}.`);
    }
  }

  await admin.viewport(1440, 900, false);
  await admin.spaNavigate("/fleet-v2/livekort", "document.querySelector('.geo-marker')");
  await admin.evaluate("document.querySelector('.geo-marker').click()");
  await admin.waitFor("document.querySelector('.geo-unit-popup')", "kortforankret Livekort-popup");
  checks.liveMapPopup = await admin.evaluate("({popup:document.querySelector('.geo-unit-popup')?.getAttribute('aria-label'),source:[...document.querySelectorAll('.live-position-details dd')].at(-1)?.textContent,demo:document.body.innerText.includes('Demopositioner – ikke live')})");
  screenshots.push(await admin.screenshot("10-livekort-popup-integreret-1440x900.png"));
  await admin.evaluate("document.querySelector('.geo-unit-popup-link').click()");
  await admin.waitFor("location.pathname.includes('/fleet-v2/enheder/') && document.querySelector('.profile-page')", "profil fra Livekort-popup");
  await admin.evaluate("history.back()");
  await admin.waitFor("location.pathname==='/fleet-v2/livekort' && document.querySelector('.geo-marker.selected')", "retur til Livekort med valgt enhed");
  checks.liveMapReturnSelection = true;

  await admin.spaNavigate("/fleet-v2/arbejdsko", "document.querySelector('[aria-label=\"Søg i sager\"]')");
  await admin.evaluate(setInput('[aria-label="Søg i sager"]', "Knirkende"));
  await admin.evaluate(clickText("button", "Tabel"));
  await admin.evaluate("window.scrollTo(0,Math.min(500,document.documentElement.scrollHeight-innerHeight))");
  const queueScroll = await admin.evaluate("scrollY");
  await admin.evaluate("document.querySelector('.queue-table-shell tbody button').click()");
  await admin.waitFor("location.pathname.includes('/fleet-v2/arbejdsko/') && document.querySelector('.fleet-route-dialog')", "sag fra arbejdskø");
  await admin.evaluate("history.back()");
  await admin.waitFor("location.pathname==='/fleet-v2/arbejdsko' && document.querySelector('[aria-label=\"Søg i sager\"]')?.value==='Knirkende'", "arbejdskøkontekst efter retur");
  checks.workQueueReturn = await admin.evaluate(`({filter:document.querySelector('[aria-label="Søg i sager"]').value,table:[...document.querySelectorAll('button')].find((node)=>node.textContent.includes('Tabel'))?.getAttribute('aria-pressed'),scrollY,expectedScroll:${queueScroll}})`);

  await admin.spaNavigate("/fleet-v2/indberetninger", "document.querySelector('[aria-label=\"Søg i indberetninger\"]')");
  await admin.evaluate(setInput('[aria-label="Søg i indberetninger"]', "Knirkende"));
  await admin.evaluate(clickText("button", "Sagsmappe"));
  await admin.waitFor("location.pathname==='/fleet-v2/sager/case-demo-001'", "sagsmappe fra indberetning");
  checks.caseFolderDesign = await admin.evaluate("({tabs:document.querySelectorAll('[role=tab]').length,problem:document.body.innerText.includes('Problem og næste handling'),history:document.body.innerText.includes('Noter og historik'),columns:document.querySelectorAll('.case-folder-main-column').length===1&&document.querySelectorAll('.case-folder-side-column').length===1})");
  assert(checks.caseFolderDesign.tabs === 0 && checks.caseFolderDesign.problem && checks.caseFolderDesign.history && checks.caseFolderDesign.columns, "Sagsmappen matcher ikke den bestilte opbygning.");
  screenshots.push(await admin.screenshot("11-sagsmappe-fra-indberetning-1440x900.png"));
  await admin.evaluate("history.back()");
  await admin.waitFor("location.pathname==='/fleet-v2/indberetninger' && document.querySelector('[aria-label=\"Søg i indberetninger\"]')?.value==='Knirkende'", "indberetningskontekst efter retur");
  checks.reportReturnFilter = true;

  await admin.spaNavigate("/fleet-v2/enheder", "document.querySelector('[aria-label=\"Søg i enheder\"]')");
  await admin.evaluate(setInput('[aria-label="Søg i enheder"]', "Silence"));
  await admin.evaluate("[...document.querySelectorAll('.unit-table tbody tr')].find((row)=>row.textContent.includes('SC-104')).click()");
  await admin.waitFor("location.pathname==='/fleet-v2/enheder/unit-sc-104'", "enhedsprofil fra filtreret katalog");
  await admin.send("Page.reload", {}, admin.sessionId);
  await admin.waitFor("location.pathname==='/fleet-v2/enheder/unit-sc-104' && document.querySelector('.profile-page')", "profil efter reload");
  await admin.evaluate("history.back()");
  await admin.waitFor("location.pathname==='/fleet-v2/enheder' && document.querySelector('[aria-label=\"Søg i enheder\"]')?.value==='Silence'", "enhedsfilter efter retur");
  checks.unitReturnAndReload = true;

  await admin.spaNavigate("/fleet-v2/sager/case-demo-001", "document.querySelector('.profile-breadcrumb button')");
  await admin.evaluate("document.querySelector('.profile-breadcrumb button').click()");
  await admin.waitFor("location.pathname==='/fleet-v2/arbejdsko'", "intern fallback fra direkte sags-URL");
  checks.directCaseFallback = true;

  const dialogOpener = await admin.evaluate("(()=>{const button=[...document.querySelectorAll('button')].find((node)=>node.textContent.includes('Manuel sag'));if(!button)return false;button.focus();button.click();return true})()");
  assert(dialogOpener, "Manuel sag-dialogen kunne ikke åbnes.");
  await admin.waitFor("document.querySelector('.unit-form-dialog')", "manuel sag-dialog");
  await admin.evaluate(setInput('[aria-label="Manuel sagstitel"]', "Ugemt browserkontrol"));
  await admin.evaluate("window.__qaConfirm=[];window.confirm=(message)=>{window.__qaConfirm.push(message);return false}");
  await admin.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, admin.sessionId);
  checks.dialogGuard = await admin.evaluate("({open:!!document.querySelector('.unit-form-dialog'),messages:window.__qaConfirm.slice()})");
  assert(checks.dialogGuard.open && checks.dialogGuard.messages.length === 1, "ESC beskyttede ikke den ugemte dialog.");
  await admin.evaluate("window.confirm=(message)=>{window.__qaConfirm.push(message);return true};document.querySelector('.unit-form-dialog header button').click()");
  await admin.waitFor("!document.querySelector('.unit-form-dialog')", "dialog lukket efter bekræftet kassering");
  checks.dialogFocusReturned = await admin.evaluate("document.activeElement?.textContent.includes('Manuel sag')");
  assert(checks.dialogFocusReturned, "Fokus returnerede ikke til dialogens åbner.");

  await admin.spaNavigate("/oekonomi/fakturacenter", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes('Fakturacenter'))");
  checks.invoiceCenter = await admin.evaluate("({inbox:document.body.innerText.includes('Indbakke'),archive:document.body.innerText.includes('Arkiv'),extra:document.body.innerText.includes('Ekstra kontrol'),paymentMislabel:/betal|bogfør/i.test([...document.querySelectorAll('button')].map((node)=>node.textContent).join(' '))})");
  screenshots.push(await admin.screenshot("12-fakturacenter-integreret-1440x900.png"));

  const runtimeProblems = admin.events.filter((event) => event.method === "Runtime.exceptionThrown").map((event) => event.params?.exceptionDetails?.text || "Runtime exception");
  const result = { ok: true, baseUrl, app: "root-app med embedded FLEET", backend: { auth: "Firebase Auth emulator", sharedData: "Realtime Database emulator", fleetPrototype: "lokal IndexedDB med syntetiske fixtures", externalServices: false }, checks, viewports, screenshots, runtimeProblems };
  await writeFile(path.join(outputDir, "RESULTAT.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await Promise.allSettled([anonymous.close(), denied.close(), admin.close()]);
}
