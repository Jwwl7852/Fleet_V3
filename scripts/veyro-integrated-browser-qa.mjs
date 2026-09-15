import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SYNTHETIC_PASSWORD, TEST_USERS } from "./procure-auth-emulator-seed.mjs";

const baseUrl = process.env.VEYRO_BROWSER_QA_URL || "http://127.0.0.1:5197";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl)) throw new Error("Browser-QA må kun køre mod localhost.");
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
const projectId = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(databaseHost) || projectId !== "demo-veyro-owner") {
  throw new Error("Browser-QA må kun læse sit syntetiske lokale emulatordatasæt.");
}
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
  const measure = async () => evaluate(`(()=>{const root=document.documentElement;const initialScrollX=scrollX;scrollTo(999999,scrollY);const maxScrollX=scrollX;scrollTo(initialScrollX,scrollY);const rect=(selector)=>{const node=document.querySelector(selector);if(!node)return null;const box=node.getBoundingClientRect();return {top:Math.round(box.top),height:Math.round(box.height),overflowX:getComputedStyle(node).overflowX,overflowY:getComputedStyle(node).overflowY};};return {clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,clientHeight:root.clientHeight,scrollHeight:root.scrollHeight,maxScrollX,compact:document.querySelector('.fc-app')?.classList.contains('fc-menu-kompakt')||false,zoom:document.querySelector('.fc-zoomkontroller output')?.textContent.trim()||null,shellGeometry:{side:rect('.fc-side'),nav:rect('.fc-nav'),activeSub:rect('.fc-nav-modul.fc-modul-aaben>.fc-sub'),main:rect('.fc-main')}};})()`);
  const screenshot = async (filename) => { const metrics = await measure(); const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId); await writeFile(path.join(outputDir, filename), Buffer.from(shot.data, "base64")); return { filename, ...metrics, horizontalOverflow: metrics.maxScrollX > 0 }; };
  const close = async () => { try { await send("Browser.close"); } catch { child.kill(); } const resolved = path.resolve(profileDir); if (resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`) && path.basename(resolved).startsWith("veyro-integrated-")) await rm(resolved, { recursive: true, force: true, maxRetries: 3 }); };
  return { close, evaluate, events, measure, navigate, screenshot, send, sessionId, spaNavigate, viewport, waitFor };
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
const approver = await openBrowser("approver");
const checks = {}; const screenshots = []; const viewports = []; const layoutMatrix = [];
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
  checks.warehouseMenuLabel = await admin.evaluate("(()=>{const item=document.querySelector('.fc-nav-modul[data-modul-label=\"Warehouse\"]');return{label:item?.querySelector('button')?.textContent.trim()||null,uppercaseOnly:item?.querySelector('button')?.textContent.trim()==='WAREHOUSE'}})()");
  assert(checks.warehouseMenuLabel.label === "Warehouse" && !checks.warehouseMenuLabel.uppercaseOnly, "Warehouse havde ikke samme titelkapitalisering som de øvrige moduler.");
  await admin.evaluate("document.querySelector('.fc-nav-modul[data-modul-label=\"Warehouse\"]')?.scrollIntoView({block:'center'})");
  screenshots.push(await admin.screenshot("29-sidebar-warehouse-1440x900.png"));

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
  const fleetMenuPoint = await admin.evaluate("(()=>{const module=document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"]');module.scrollIntoView({block:'center'});const button=module.querySelector('button');const box=button.getBoundingClientRect();return{x:box.left+box.width/2,y:box.top+box.height/2}})()");
  await admin.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fleetMenuPoint.x, y: fleetMenuPoint.y }, admin.sessionId);
  await admin.waitFor("document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"]').classList.contains('fc-kompakt-aaben')", "kompakt Fleet-flyout med mus");
  const flyoutPoint = await admin.evaluate("(()=>{const box=document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"] .fc-sub').getBoundingClientRect();return{x:box.left+Math.min(60,box.width/2),y:box.top+Math.min(80,box.height/2)}})()");
  await admin.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: flyoutPoint.x, y: flyoutPoint.y }, admin.sessionId);
  await sleep(300);
  checks.compactFlyoutMouse = await admin.evaluate("({open:document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"]').classList.contains('fc-kompakt-aaben'),livekort:[...document.querySelectorAll('.fc-nav-modul[data-modul-label=\"Fleet\"] .fc-sublink')].some((node)=>node.textContent.trim()==='Livekort')})");
  assert(checks.compactFlyoutMouse.open && checks.compactFlyoutMouse.livekort, "Kompakt flyout kunne ikke følges med musen fra ikon til undermenu.");
  await admin.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, admin.sessionId);
  checks.compactFlyoutEscape = await admin.evaluate("({closed:!document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"]').classList.contains('fc-kompakt-aaben'),focusReturned:document.activeElement===document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"] button')})");
  assert(checks.compactFlyoutEscape.closed && checks.compactFlyoutEscape.focusReturned, "ESC lukkede ikke det kompakte flyout med fokusretur til åbneren.");
  await admin.evaluate("document.querySelector('.fc-menu-toggle').focus()");
  await admin.evaluate("document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"] button').focus()");
  await admin.waitFor("document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"]').classList.contains('fc-kompakt-aaben')", "kompakt Fleet-flyout med tastaturfokus");
  await admin.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" }, admin.sessionId);
  await admin.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" }, admin.sessionId);
  checks.compactFlyoutKeyboard = await admin.evaluate("({open:document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"]').classList.contains('fc-kompakt-aaben'),submenuFocused:document.activeElement?.classList.contains('fc-sublink')||false,focusedText:document.activeElement?.textContent.trim()||''})");
  assert(checks.compactFlyoutKeyboard.open && checks.compactFlyoutKeyboard.submenuFocused, "Kompakt flyout kunne ikke betjenes med tastatur.");
  await admin.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, admin.sessionId);
  checks.compactFlyoutEscape = await admin.evaluate("({open:document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"]').classList.contains('fc-kompakt-aaben'),focusReturned:document.activeElement===document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"] button')})");
  assert(!checks.compactFlyoutEscape.open && checks.compactFlyoutEscape.focusReturned, "Escape lukkede ikke flyout med fokusretur.");
  await admin.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }, admin.sessionId);
  await admin.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fleetMenuPoint.x, y: fleetMenuPoint.y, radiusX: 2, radiusY: 2, force: 1 }] }, admin.sessionId);
  await admin.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, admin.sessionId);
  await admin.waitFor("document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"]').classList.contains('fc-kompakt-aaben')", "kompakt Fleet-flyout med touch");
  await admin.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 900, y: 120, radiusX: 2, radiusY: 2, force: 1 }] }, admin.sessionId);
  await admin.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, admin.sessionId);
  await sleep(100);
  checks.compactFlyoutTouch = await admin.evaluate("!document.querySelector('.fc-nav-modul[data-modul-label=\"Fleet\"]').classList.contains('fc-kompakt-aaben')");
  assert(checks.compactFlyoutTouch, "Touch uden for flyout lukkede det ikke.");
  await admin.send("Emulation.setTouchEmulationEnabled", { enabled: false }, admin.sessionId);
  await admin.evaluate("document.querySelector('.fc-nulstil-visning').click()");

  const routes = [
    ["/fleet-v2", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes('God aften'))", "04-overblik"],
    ["/fleet-v2/arbejdsko", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes('Arbejdskø'))", "05-arbejdsko"],
    ["/fleet-v2/indberetninger", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes('Indberetninger og triage'))", "06-indberetninger"],
    ["/fleet-v2/livekort", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes('Livekort'))", "07-livekort"],
    ["/fleet-v2/sager/case-demo-001", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes('Knirkende bremser'))", "08-sagsmappe"],
    ["/oekonomi/fakturacenter", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes('Fakturacenter'))", "09-fakturacenter"],
    ["/fleet-v2/service", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes('Service og compliance'))", "13-service"],
    ["/opsaetning/fleet-kategorier", "document.body.innerText.includes('FLEET-kategorier')", "14-kategorier"],
    ["/fleet-v2/oekonomi", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.trim()==='Økonomi')", "15-fleet-oekonomi"],
    ["/fleet-v2/statistik", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes('Køretøjs- og driftsstatistik'))", "16-statistik"],
  ];
  const shellModes = [
    { menu: "normal", zoomSteps: 0, zoom: "100 %" },
    { menu: "normal", zoomSteps: 5, zoom: "125 %" },
    { menu: "compact", zoomSteps: 0, zoom: "100 %" },
    { menu: "compact", zoomSteps: 5, zoom: "125 %" },
  ];
  for (const [width, height] of [[1920,1080],[1440,900],[390,844],[360,800]]) {
    await admin.viewport(width, height, width <= 480);
    for (const [route, ready, prefix] of routes) {
      await admin.spaNavigate(route, ready);
      await admin.evaluate("document.querySelector('.fc-nulstil-visning')?.click()");
      const shot = await admin.screenshot(`${prefix}-${width}x${height}.png`);
      viewports.push({ route, width, height, ...shot });
      assert(!shot.horizontalOverflow, `Dokumentsiden kan rulles vandret uden for viewporten: ${route} ${width}x${height}.`);
      if (width <= 480) assert(shot.shellGeometry.main?.top < height * .7, `Hovedindholdet starter for langt nede på mobil: ${route} ${width}x${height}.`);
      for (const mode of shellModes) {
        await admin.evaluate("document.querySelector('.fc-nulstil-visning')?.click()");
        await sleep(60);
        await admin.evaluate(`(()=>{if(${JSON.stringify(mode.menu)}==='compact')document.querySelector('.fc-menu-toggle')?.click();for(let i=0;i<${mode.zoomSteps};i+=1)document.querySelector('.fc-zoomkontroller [aria-label="Zoom ind"]')?.click()})()`);
        await sleep(60);
        const measured = await admin.measure();
        const row = { route, width, height, menu: mode.menu, expectedZoom: mode.zoom, ...measured };
        layoutMatrix.push(row);
        assert(measured.maxScrollX === 0, `Vandret dokumentrul ved ${route}, ${width}x${height}, ${mode.menu}, ${mode.zoom}.`);
        assert(measured.compact === (mode.menu === "compact") && measured.zoom === mode.zoom, `Shelltilstand kunne ikke sættes ved ${route}, ${width}x${height}: ${JSON.stringify({ measured: { compact: measured.compact, zoom: measured.zoom }, expected: mode })}.`);
        if (width <= 480) assert(measured.shellGeometry.main?.top < height * .7, `Hovedindholdet starter for langt nede ved ${route}, ${width}x${height}, ${mode.menu}, ${mode.zoom}.`);
      }
      await admin.evaluate("document.querySelector('.fc-nulstil-visning')?.click()");
    }
  }

  await admin.viewport(1920, 1080, false);
  await admin.spaNavigate("/fleet-v2/arbejdsko/case-demo-002", "document.querySelector('.fleet-route-dialog.draggable')");
  const dragStart = await admin.evaluate("(()=>{const dialog=document.querySelector('.fleet-route-dialog');const head=dialog.querySelector('.fleet-route-dialog-head');const d=dialog.getBoundingClientRect();const h=head.getBoundingClientRect();const b=document.querySelector('.fleet-dialog-backdrop').getBoundingClientRect();return{dialog:{left:d.left,top:d.top,right:d.right,bottom:d.bottom},bounds:{left:b.left,top:b.top,right:b.right,bottom:b.bottom},point:{x:h.left+h.width*.4,y:h.top+Math.min(28,h.height/2)}}})()");
  await admin.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dragStart.point.x, y: dragStart.point.y }, admin.sessionId);
  await admin.send("Input.dispatchMouseEvent", { type: "mousePressed", x: dragStart.point.x, y: dragStart.point.y, button: "left", buttons: 1, clickCount: 1 }, admin.sessionId);
  await sleep(80);
  for (const delta of [25, 50, 75, 100]) {
    await admin.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dragStart.point.x - delta, y: dragStart.point.y, button: "left", buttons: 1 }, admin.sessionId);
    await sleep(40);
  }
  await admin.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: dragStart.point.x - 100, y: dragStart.point.y, button: "left", buttons: 0, clickCount: 1 }, admin.sessionId);
  await sleep(100);
  checks.draggableDialog = await admin.evaluate(`(()=>{const d=document.querySelector('.fleet-route-dialog').getBoundingClientRect();const b=document.querySelector('.fleet-dialog-backdrop').getBoundingClientRect();return{movedX:Math.round(d.left-${dragStart.dialog.left}),movedY:Math.round(d.top-${dragStart.dialog.top}),inside:d.left>=b.left+11&&d.right<=b.right-11&&d.top>=b.top+11&&d.bottom<=b.bottom-11}})()`);
  assert(checks.draggableDialog.movedX < -50 && checks.draggableDialog.inside, `Arbejdskødialogen kunne ikke flyttes sikkert inden for arbejdsfladen: ${JSON.stringify(checks.draggableDialog)}`);
  screenshots.push(await admin.screenshot("22-flytbar-dialog-1920x1080.png"));
  await admin.viewport(390, 844, true);
  await admin.spaNavigate("/fleet-v2/arbejdsko/case-demo-002", "document.querySelector('.fleet-route-dialog.draggable')");
  checks.mobileDialog = await admin.evaluate("(()=>{const d=document.querySelector('.fleet-route-dialog').getBoundingClientRect();return{left:Math.round(d.left),top:Math.round(d.top),width:Math.round(d.width),height:Math.round(d.height),viewport:{width:innerWidth,height:innerHeight},overflow:getComputedStyle(document.querySelector('.fleet-route-dialog-body')).overflowY}})()");
  assert(checks.mobileDialog.width <= 390 && checks.mobileDialog.height <= 844, "Arbejdskødialogen overskred mobilviewporten.");
  screenshots.push(await admin.screenshot("23-arbejdsko-dialog-390x844.png"));
  await admin.evaluate("document.querySelector('.fleet-route-dialog-head button').click()");
  await admin.waitFor("!document.querySelector('.fleet-route-dialog')", "mobil dialog lukket");
  await admin.spaNavigate("/fleet-v2/arbejdsko", "document.querySelector('[aria-label=\"Søg i sager\"]')");
  await admin.evaluate(setInput('[aria-label="Søg i sager"]', "Knirkende"));
  await admin.evaluate("[...document.querySelectorAll('button')].find((node)=>node.textContent.includes('Knirkende'))?.scrollIntoView({block:'center'})");
  await admin.evaluate(clickText("button", "Knirkende"));
  await admin.waitFor("document.querySelector('.fleet-route-dialog')", "sag åbnet fra mobil arbejdskø");
  screenshots.push(await admin.screenshot("27-mobil-arbejdsko-sag-390x844.png"));
  await admin.evaluate("document.querySelector('.fleet-route-dialog-head button').click()");
  await admin.waitFor("!document.querySelector('.fleet-route-dialog')", "mobil sag lukket til arbejdskø");
  checks.mobileQueueAction = await admin.evaluate("({path:location.pathname,filter:document.querySelector('[aria-label=\"Søg i sager\"]')?.value,caseVisible:document.body.innerText.includes('Knirkende bremser')})");
  assert(checks.mobileQueueAction.path === "/fleet-v2/arbejdsko" && checks.mobileQueueAction.filter === "Knirkende" && checks.mobileQueueAction.caseVisible, "Mobilens find-åbn-luk-returforløb bevarede ikke arbejdskøens filter.");
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
  for (const [width, height] of [[1920,1080],[1440,900],[390,844],[360,800]]) {
    await admin.viewport(width, height, width <= 480);
    const shot = await admin.screenshot(`17-dirty-dialog-${width}x${height}.png`);
    screenshots.push(shot);
    assert(!shot.horizontalOverflow, `Dirty-dialogen skabte vandret dokumentscroll ved ${width}x${height}.`);
  }
  await admin.viewport(1440, 900, false);
  await admin.evaluate("window.__qaConfirm=[];window.confirm=(message)=>{window.__qaConfirm.push(message);return false}");
  await admin.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, admin.sessionId);
  checks.dialogGuard = await admin.evaluate("({open:!!document.querySelector('.unit-form-dialog'),messages:window.__qaConfirm.slice()})");
  assert(checks.dialogGuard.open && checks.dialogGuard.messages.length === 1, "ESC beskyttede ikke den ugemte dialog.");
  await admin.evaluate("window.confirm=(message)=>{window.__qaConfirm.push(message);return true};document.querySelector('.unit-form-dialog header button').click()");
  await admin.waitFor("!document.querySelector('.unit-form-dialog')", "dialog lukket efter bekræftet kassering");
  checks.dialogFocusReturned = await admin.evaluate("document.activeElement?.textContent.includes('Manuel sag')");
  assert(checks.dialogFocusReturned, "Fokus returnerede ikke til dialogens åbner.");

  await admin.spaNavigate("/oekonomi/fakturacenter", "[...document.querySelectorAll('h1')].some((node)=>node.textContent.includes('Fakturacenter'))");
  await admin.waitFor("document.body.innerText.includes('FC-ENKELT-OVER')", "serverfakturaer i Fakturacenter");
  checks.invoiceCenter = await admin.evaluate("({inbox:document.body.innerText.includes('Indbakke'),archive:document.body.innerText.includes('Arkiv'),extra:document.body.innerText.includes('Ekstra kontrol'),paymentMislabel:/betal|bogfør/i.test([...document.querySelectorAll('button')].map((node)=>node.textContent).join(' '))})");
  screenshots.push(await admin.screenshot("12-fakturacenter-integreret-1440x900.png"));

  await admin.evaluate(setInput('.fic-list-controls label:nth-child(1) select', 'matchet'));
  await admin.waitFor("document.querySelectorAll('.fic-invoice').length===4", "matchfilter Matchet");
  const matchedInvoices = await admin.evaluate("[...document.querySelectorAll('.fic-invoice')].map((node)=>node.textContent.match(/FC-[A-Z-]+/)?.[0]).filter(Boolean)");
  await admin.evaluate(setInput('.fic-list-controls label:nth-child(2) select', 'flere-moduler'));
  await admin.waitFor("document.querySelectorAll('.fic-invoice').length===1 && document.body.innerText.includes('FC-FILTER-FLERE')", "modulfilter Flere moduler");
  const multipleModuleInvoices = await admin.evaluate("[...document.querySelectorAll('.fic-invoice')].map((node)=>node.textContent.match(/FC-[A-Z-]+/)?.[0]).filter(Boolean)");
  await admin.evaluate(setInput('.fic-list-controls label:nth-child(1) select', 'mangler-match'));
  await admin.evaluate(setInput('.fic-list-controls label:nth-child(2) select', 'alle-moduler'));
  await admin.waitFor("document.querySelectorAll('.fic-invoice').length===1 && document.body.innerText.includes('FC-MASSE-MANGLER-GRUNDLAG')", "matchfilter Mangler match");
  checks.invoiceFilters = { matchedInvoices, multipleModuleInvoices, missingMatchInvoices: await admin.evaluate("[...document.querySelectorAll('.fic-invoice')].map((node)=>node.textContent.match(/FC-[A-Z-]+/)?.[0]).filter(Boolean)") };
  screenshots.push(await admin.screenshot("24-fakturacenter-match-modulfiltre-1440x900.png"));
  await admin.evaluate(setInput('.fic-list-controls label:nth-child(1) select', 'alle'));
  const panelBefore = await admin.evaluate("(()=>{const s=document.querySelector('.fic-panel-separator');return{now:Number(s.getAttribute('aria-valuenow')),storage:localStorage.getItem('veyro:fakturacenter:panel-layout:v1')}})()");
  await admin.evaluate("document.querySelector('.fic-panel-separator').focus()");
  await admin.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" }, admin.sessionId);
  await admin.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight" }, admin.sessionId);
  const panelAfterDrag = await admin.evaluate("(()=>{const s=document.querySelector('.fic-panel-separator');return{now:Number(s.getAttribute('aria-valuenow')),storage:localStorage.getItem('veyro:fakturacenter:panel-layout:v1')}})()");
  assert(panelAfterDrag.now !== panelBefore.now && panelAfterDrag.storage, "Fakturacenterets panelbredde blev ikke ændret og gemt fra separatorens tastaturbetjening.");
  await admin.send("Page.reload", {}, admin.sessionId);
  await admin.waitFor("document.querySelector('.fic-panel-separator')", "Fakturacenter efter reload");
  const panelAfterReload = await admin.evaluate("(()=>{const s=document.querySelector('.fic-panel-separator');const regions=[...document.querySelectorAll('.fic-inbox-list,.fic-document-scroll,.fic-workspace-detail')];return{now:Number(s.getAttribute('aria-valuenow')),storage:localStorage.getItem('veyro:fakturacenter:panel-layout:v1'),scrollRegions:regions.map((node)=>({className:node.className,overflowY:getComputedStyle(node).overflowY,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight}))}})()");
  assert(panelAfterReload.now === panelAfterDrag.now && panelAfterReload.storage === panelAfterDrag.storage, "Fakturacenterets panelbredde blev ikke bevaret efter reload.");
  checks.invoicePanelPersistence = { input: "separatorens ArrowRight", before: panelBefore, afterAdjustment: panelAfterDrag, afterReload: panelAfterReload };

  await admin.spaNavigate("/fleet-v2/enheder", "document.querySelector('.unit-table')");
  await admin.evaluate(clickText('button', 'Opret enhed'));
  await admin.waitFor("document.querySelector('.unit-dialog')", "fælles enhedsformular");
  const unitNumber = `QA-${Date.now().toString(36).toUpperCase()}`;
  await admin.evaluate(setInput('.unit-dialog .unit-form-field:nth-of-type(1) input', unitNumber));
  await admin.evaluate(setInput('.unit-dialog .unit-form-field:nth-of-type(4) input', 'Veyro'));
  await admin.evaluate(setInput('.unit-dialog .unit-form-field:nth-of-type(5) input', 'Syntetisk integrationsenhed'));
  await admin.evaluate(setInput('.unit-dialog .unit-form-field:nth-of-type(8) input', 'Testafdeling'));
  screenshots.push(await admin.screenshot("28-faelles-enhedsformular-1440x900.png"));
  await admin.evaluate("window.confirm=()=>true;document.querySelector('.unit-dialog form button[type=submit]').click()");
  await admin.waitFor(`!document.querySelector('.unit-dialog') && document.body.innerText.includes(${JSON.stringify(unitNumber)})`, "enhed gemt i fælles register");
  const unitId = await admin.evaluate(`(()=>{const row=[...document.querySelectorAll('.unit-table tbody tr')].find((node)=>node.textContent.includes(${JSON.stringify(unitNumber)}));return row?.dataset?.unitId||row?.querySelector('[data-unit-id]')?.dataset?.unitId||null})()`);
  const unitResponse = await fetch(`http://${databaseHost}/tenants/procure-auth-a/koeretoejer.json?ns=${projectId}`, { headers: { authorization: "Bearer owner" } });
  const unitState = await unitResponse.json();
  const sharedUnitEntry = Object.entries(unitState).find(([, unit]) => unit.fleetProfil?.number === unitNumber);
  assert(sharedUnitEntry, "Den oprettede FLEET-enhed fandtes ikke i det fælles emulatorregister.");
  await admin.spaNavigate("/planning-v2/ressourcer", "document.querySelector('.pr-shared-resources')");
  await admin.waitFor(`document.body.innerText.includes(${JSON.stringify(unitNumber)})`, "ny fælles enhed i PLANNING");
  checks.sharedUnitRegister = { unitId: sharedUnitEntry[0], unitNumber, sourcePath: `tenants/procure-auth-a/koeretoejer/${sharedUnitEntry[0]}`, fleetProfile: sharedUnitEntry[1].fleetProfil, planningVisible: await admin.evaluate(`document.body.innerText.includes(${JSON.stringify(unitNumber)})`), localRowDataId: unitId };
  screenshots.push(await admin.screenshot("25-faelles-enhed-i-planning-1440x900.png"));

  await admin.spaNavigate("/fleet-v2/sager/case-demo-001/bestilling", "document.querySelector('[aria-label=\"Arbejdsbeskrivelse\"]')");
  const draftText = `Bevaret syntetisk sagskladde ${Date.now()}`;
  await admin.evaluate(setInput('[aria-label="Arbejdsbeskrivelse"]', draftText));
  await admin.evaluate(setInput('[aria-label="Mailtekst"]', `${draftText} · mailtekst`));
  await admin.evaluate(clickText('button', 'Opret leverandør'));
  await admin.waitFor("location.pathname==='/indkoeb/leverandoerer' && document.querySelector('#lv-navn')", "fælles leverandøroprettelse fra sagskladde");
  const supplierName = `Syntetisk QA-værksted ${Date.now()}`;
  await admin.evaluate(setInput('#lv-navn', supplierName));
  await admin.evaluate(setInput('#lv-email', 'qa-vaerksted@example.invalid'));
  await admin.evaluate(clickText('button', 'Opret leverandør'));
  await admin.waitFor(`location.pathname==='/fleet-v2/sager/case-demo-001/bestilling' && document.body.innerText.includes(${JSON.stringify(supplierName)})`, "retur til sagskladde med ny leverandør");
  checks.supplierDraftReturn = await admin.evaluate(`(()=>({supplier:[...document.querySelector('.assignment-page select').selectedOptions].map((node)=>node.textContent).join(''),workDescription:document.querySelector('[aria-label="Arbejdsbeskrivelse"]')?.value,mailText:document.querySelector('[aria-label="Mailtekst"]')?.value,draftKey:[...Object.keys(sessionStorage)].find((key)=>key.startsWith('veyro:fleet:workshop-assignment-draft:'))||null}))()`);
  assert(checks.supplierDraftReturn.supplier.includes(supplierName) && checks.supplierDraftReturn.workDescription === draftText && checks.supplierDraftReturn.mailText === `${draftText} · mailtekst` && checks.supplierDraftReturn.draftKey, `Leverandøroprettelsen bevarede ikke sagskladden eller valgte ikke den nye leverandør: ${JSON.stringify(checks.supplierDraftReturn)}`);
  screenshots.push(await admin.screenshot("26-leverandoer-retur-med-bevaret-sagskladde-1440x900.png"));

  await admin.spaNavigate("/oekonomi/fakturacenter?sektion=indbakke", "document.body.innerText.includes('FC-ENKELT-OVER')");
  await admin.evaluate(setInput('.fic-filter input', "FC-ENKELT-OVER"));
  await admin.waitFor("document.querySelectorAll('.fic-invoice').length===1", "enkelt faktura over nettogrænse");
  await admin.evaluate("document.querySelector('.fic-invoice-main').click()");
  await admin.evaluate(clickText("button", "Markér som kontrolleret"));
  await admin.waitFor("document.body.innerText.includes('sendt til Ekstra kontrol')", "første kontrol bliver i Indbakke");
  checks.invoiceSingleControl = await admin.evaluate("({path:location.pathname+location.search,message:[...document.querySelectorAll('[role=status]')].map((node)=>node.textContent.trim()).find((text)=>text.includes('sendt til Ekstra kontrol')),stillInbox:location.search.includes('sektion=indbakke')||!location.search.includes('sektion=')})");
  assert(checks.invoiceSingleControl.stillInbox, "Enkeltkontrol forlod Indbakke.");

  await admin.spaNavigate("/oekonomi/fakturacenter?sektion=ekstra-kontrol", "document.body.innerText.includes('FC-ENKELT-OVER')");
  await admin.evaluate("document.querySelector('.fic-invoice-main').click()");
  await admin.evaluate(clickText("button", "Godkend ekstra kontrol"));
  await admin.waitFor("document.body.innerText.includes('anden person')", "egen ekstra godkendelse afvises");
  checks.invoiceSelfApprovalDenied = await admin.evaluate("[...document.querySelectorAll('[role=status]')].map((node)=>node.textContent.trim()).find((text)=>text.includes('anden person'))");
  screenshots.push(await admin.screenshot("18-ekstra-kontrol-egen-afvist-1440x900.png"));

  await approver.viewport(1440, 900, false);
  await login(approver, TEST_USERS.approver, "/oekonomi/fakturacenter?sektion=ekstra-kontrol");
  await approver.waitFor("document.body.innerText.includes('FC-ENKELT-OVER')", "ekstra kontrol som anden bruger");
  await approver.evaluate("document.querySelector('.fic-invoice-main').click()");
  await approver.evaluate(clickText("button", "Godkend ekstra kontrol"));
  await approver.waitFor("document.body.innerText.includes('flyttet til Arkiv')", "anden bruger godkender ekstra kontrol");
  await approver.spaNavigate("/oekonomi/fakturacenter?sektion=arkiv", "document.body.innerText.includes('FC-ENKELT-OVER')");
  checks.invoiceSecondApprover = await approver.evaluate("({archive:document.body.innerText.includes('FC-ENKELT-OVER'),user:document.querySelector('.fc-bruger')?.textContent||document.body.innerText})");
  screenshots.push(await approver.screenshot("19-ekstra-kontrol-anden-godkender-1440x900.png"));

  await admin.spaNavigate("/oekonomi/fakturacenter?sektion=indbakke", "document.body.innerText.includes('FC-MASSE-OVER')");
  await admin.evaluate(setInput('.fic-filter input', "FC-MASSE"));
  await admin.waitFor("document.querySelectorAll('.fic-invoice').length===3", "tre synlige massefakturaer");
  await admin.evaluate("document.querySelector('.fic-select-all input').click()");
  await admin.waitFor("document.querySelector('.fic-bulk')?.textContent.includes('3 valgte')", "tre valgte massefakturaer");
  await admin.evaluate("document.querySelector('.fic-bulk .fic-primary').click()");
  await admin.waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Bekræft massekontrol')", "massekontrolbekræftelse");
  screenshots.push(await admin.screenshot("20-massekontrol-bekraeftelse-1440x900.png"));
  await admin.evaluate(clickText("[role=dialog] button", "Bekræft og markér som kontrolleret"));
  await admin.waitFor("document.body.innerText.includes('2 lykkedes, 1 blokeret')", "massekontrol med delvis succes");
  await admin.waitFor("document.querySelector('.fic-bulk-results')", "resultat pr. faktura");
  checks.invoiceBulkPartial = await admin.evaluate("({message:[...document.querySelectorAll('[role=status]')].map((node)=>node.textContent.trim()).find((text)=>text.includes('2 lykkedes, 1 blokeret')),rows:[...document.querySelectorAll('.fic-bulk-results li')].map((node)=>node.textContent.trim())})");
  assert(checks.invoiceBulkPartial.rows.length === 3, "Massekontrollen viste ikke et resultat for hver faktura.");
  screenshots.push(await admin.screenshot("21-massekontrol-delvis-succes-1440x900.png"));

  const invoiceResponse = await fetch(`http://${databaseHost}/tenants/procure-auth-a/fakturaer.json?ns=${projectId}`, {
    headers: { authorization: "Bearer owner" },
  });
  assert(invoiceResponse.ok, `Emulatorens fakturakontrol kunne ikke efterprøves: ${invoiceResponse.status}.`);
  const invoiceState = await invoiceResponse.json();
  checks.invoiceServerState = {
    single: {
      status: invoiceState["fc-enkelt-over"].kontrolstatus,
      paymentStatus: invoiceState["fc-enkelt-over"].status,
      differentApprover: invoiceState["fc-enkelt-over"].kontrolleretAf
        !== invoiceState["fc-enkelt-over"].ekstraKontrolleretAf,
    },
    massOver: invoiceState["fc-masse-over"].kontrolstatus,
    massNetUnder: invoiceState["fc-masse-net-under"].kontrolstatus,
    massMissingBasis: invoiceState["fc-masse-mangler-grundlag"].kontrolstatus,
    allPaymentStatusesUnchanged: Object.values(invoiceState).every((invoice) => invoice.status === "modtaget"),
  };
  assert(checks.invoiceServerState.single.status === "arkiveret"
    && checks.invoiceServerState.single.paymentStatus === "modtaget"
    && checks.invoiceServerState.single.differentApprover
    && checks.invoiceServerState.massOver === "ekstra-kontrol"
    && checks.invoiceServerState.massNetUnder === "arkiveret"
    && checks.invoiceServerState.massMissingBasis === "indbakke"
    && checks.invoiceServerState.allPaymentStatusesUnchanged,
  `Fakturacenterets servertilstand matcher ikke de dokumenterede kontroludfald: ${JSON.stringify(checks.invoiceServerState)}`);

  const runtimeProblems = admin.events.filter((event) => event.method === "Runtime.exceptionThrown").map((event) => event.params?.exceptionDetails?.text || "Runtime exception");
  const result = { ok: true, baseUrl, app: "root-app med embedded FLEET", backend: { auth: "Firebase Auth emulator", sharedData: "Realtime Database emulator", fleetUnitRegister: "tenants/<tenant>/koeretoejer i Realtime Database-emulator; FLEET læser/skriver og PLANNING læser samme post", fleetOperationalPrototype: "sager, indberetninger, værksted og øvrige endnu ikke adapterede forløb bruger tydeligt mærkede lokale IndexedDB-fixtures", externalGpsObd: "udskudt efter aftale; ikke aktiveret eller integreret" }, checks, viewports, layoutMatrix, screenshots, runtimeProblems };
  await writeFile(path.join(outputDir, "RESULTAT.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await Promise.allSettled([anonymous.close(), denied.close(), admin.close(), approver.close()]);
}
