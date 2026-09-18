import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { NAV } from "../src/fleet/nav.js";

const BASE = process.env.VEYRO_VISUAL_URL || "http://127.0.0.1:5197";
const PORT = Number(process.env.VEYRO_VISUAL_DEBUG_PORT || 9356);
const OUT = resolve(process.env.VEYRO_VISUAL_OUTPUT || "artifacts/veyro-visuel-helhed-v1-2026-09-18");
const EMAIL = process.env.VITE_DEV_EJER_MAIL || "";
const PASSWORD = process.env.VITE_DEV_BRUGER_KODE || "";
const CODE_COMMIT = process.env.VEYRO_VISUAL_COMMIT || "working-tree";
const VIEWPORTS = [[1440, 900], [390, 844]];
const ROUTE_CAPTURE = process.env.VEYRO_VISUAL_ROUTES !== "0";
const INTERACTION_CAPTURE = process.env.VEYRO_VISUAL_INTERACTIONS === "1";
const SIDEBAR_CAPTURE = process.env.VEYRO_VISUAL_SIDEBAR === "1";

if (!EMAIL || !PASSWORD) throw new Error("Review-login skal komme fra procesmiljøet.");

const routes = [];
const seen = new Set();
for (const group of NAV) {
  const candidates = group.born?.length
    ? group.born.filter((item) => !item.skjulINav)
    : [group];
  for (const item of candidates) {
    if (!item.sti || item.sti.includes(":")) continue;
    if (seen.has(item.sti)) continue;
    seen.add(item.sti);
    routes.push({ key: item.key, label: item.label, path: item.sti, group: group.label });
  }
}

const edge = [
  process.env.VEYRO_VISUAL_BROWSER,
  join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
].filter(Boolean).find((path) => {
  try { return process.getBuiltinModule("node:fs").statSync(path).isFile(); }
  catch { return false; }
});
if (!edge) throw new Error("Microsoft Edge blev ikke fundet.");

const screenshotsDir = join(OUT, "screenshots");
const interactionsDir = join(OUT, "interactions");
const sidebarDir = join(OUT, "sidebar");
mkdirSync(screenshotsDir, { recursive: true });
if (INTERACTION_CAPTURE) mkdirSync(interactionsDir, { recursive: true });
if (SIDEBAR_CAPTURE) mkdirSync(sidebarDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "veyro-visual-v1-"));
const browser = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--force-device-scale-factor=1",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--window-size=1440,900", `${BASE}/login`,
], { stdio: "ignore" });

const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));
const json = async (path) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!response.ok) throw new Error(`DevTools ${response.status}`);
  return response.json();
};

let page;
for (let index = 0; index < 80; index += 1) {
  try {
    const pages = await json("/json/list");
    page = pages.find((candidate) => candidate.type === "page" && candidate.url?.startsWith(BASE))
      || pages.find((candidate) => candidate.type === "page");
    if (page?.webSocketDebuggerUrl) break;
  } catch { /* Edge starter */ }
  await pause(250);
}
if (!page?.webSocketDebuggerUrl) throw new Error("Kunne ikke forbinde til capturebrowseren.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const response = JSON.parse(event.data);
  if (!response.id || !pending.has(response.id)) return;
  const handler = pending.get(response.id);
  pending.delete(response.id);
  response.error ? handler.reject(new Error(response.error.message)) : handler.resolve(response.result);
});
const call = (method, params = {}) => {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveCall, reject) => pending.set(id, { resolve: resolveCall, reject }));
};
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browserfejl");
  return result.result?.value;
}
async function waitFor(expression, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await pause(100);
  }
  throw new Error(message);
}
async function setViewport(width, height) {
  await call("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: width < 600,
    screenWidth: width, screenHeight: height,
  });
}
async function navigate(path) {
  await call("Page.navigate", { url: `${BASE}${path}` });
  await waitFor("document.readyState === 'complete'", `${path} blev ikke indlæst`);
  await waitFor("location.pathname !== '/login'", `${path} sendte tilbage til login`);
  await pause(450);
}
async function screenshot(file, directory = screenshotsDir) {
  const result = await call("Page.captureScreenshot", {
    format: "png", fromSurface: true, captureBeyondViewport: false,
  });
  writeFileSync(join(directory, file), Buffer.from(result.data, "base64"));
}
const slug = (value) => value
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const measureExpression = `(()=>{
  const visible=(el)=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
  const rect=(el)=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),width:+r.width.toFixed(1),height:+r.height.toFixed(1)}};
  const style=(el)=>{if(!el)return null;const s=getComputedStyle(el);return {background:s.backgroundColor,borderColor:s.borderColor,borderWidth:s.borderWidth,borderRadius:s.borderRadius,boxShadow:s.boxShadow,padding:s.padding,fontSize:s.fontSize,lineHeight:s.lineHeight}};
  const median=(values)=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return null;return +sorted[Math.floor(sorted.length/2)].toFixed(1)};
  const root=document.querySelector('.fc-indhold')||document.querySelector('main')||document.body;
  const heading=[...root.querySelectorAll('h1')].find(visible)||null;
  const candidates=[...root.querySelectorAll('.fc-kort,.fc-panel,.fc-ressource-register,.resource-directory-panel,.card,.wf-card,.pr-panel,.procure-panel,section')].filter(visible);
  const panel=candidates.find((el)=>{const s=getComputedStyle(el);return s.backgroundColor!=='rgba(0, 0, 0, 0)'&&parseFloat(s.borderTopWidth)>0})||candidates[0]||null;
  const controls=[...root.querySelectorAll('input,select,button')].filter(visible);
  const inputs=[...root.querySelectorAll('input,select,textarea')].filter(visible);
  const buttons=[...root.querySelectorAll('button,a.fc-btn,a.primary-button,a.wf-btn')].filter(visible);
  const heads=[...root.querySelectorAll('thead tr')].filter(visible);
  const rows=[...root.querySelectorAll('tbody tr')].filter(visible);
  const dialog=[...document.querySelectorAll('[role=dialog],.fc-dialog,.wf-modal,.procure-modal')].find(visible)||null;
  const rootRect=rect(root);const headingRect=rect(heading);const panelRect=rect(panel);
  return {
    actualPath:location.pathname+location.search,
    title:heading?.textContent?.replace(/\\s+/g,' ').trim()||document.title,
    pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
    testMarker:document.body.innerText.includes('TEST'),
    loading:/Henter skærmen|Indlæser/.test(root.innerText),
    denied:/ingen adgang|ikke adgang|adgang nægtet/i.test(root.innerText),
    rootClass:root.className||'',headingClass:heading?.className||'',panelClass:panel?.className||'',
    root:rootRect,heading:headingRect,headingStyle:style(heading),panel:panelRect,panelStyle:style(panel),
    headingToPanel:headingRect&&panelRect?+(panelRect.y-(headingRect.y+headingRect.height)).toFixed(1):null,
    rightMargin:rootRect?+(innerWidth-(rootRect.x+rootRect.width)).toFixed(1):null,
    controlHeight:median(controls.map(el=>el.getBoundingClientRect().height)),
    inputHeight:median(inputs.map(el=>el.getBoundingClientRect().height)),
    buttonHeight:median(buttons.map(el=>el.getBoundingClientRect().height)),
    tableHeadHeight:median(heads.map(el=>el.getBoundingClientRect().height)),
    tableRowHeight:median(rows.map(el=>el.getBoundingClientRect().height)),
    counts:{panels:candidates.length,controls:controls.length,inputs:inputs.length,buttons:buttons.length,tables:root.querySelectorAll('table').length,rows:rows.length,dialogs:dialog?1:0,forms:root.querySelectorAll('form').length},
    dialog:rect(dialog),dialogStyle:style(dialog),
  };
})()`;

const captures = [];
const failures = [];
const interactions = [];
const interactionFailures = [];
const interactionUnavailable = [];
const sidebarAudit = [];
const scenarios = [
  { key: "ressource-enhed-detalje", path: "/ressourcer/enheder", selector: "tbody tr[role=button]" },
  { key: "ressource-ejendom-detalje", path: "/facility-v2/ejendomme", selector: "tbody tr[role=link]" },
  { key: "ressource-medarbejder-detalje", path: "/ressourcer/medarbejdere", selector: "tbody tr[role=button]" },
  { key: "ressource-unit-detalje", path: "/ressourcer/units", selector: "tbody tr[role=button]" },
  { key: "ressource-vare-detalje", path: "/ressourcer/varekatalog", selector: "tbody tr[role=button]" },
  { key: "ressource-lagerlokation-detalje", path: "/ressourcer/lagerlokationer", selector: "tbody tr[role=button]" },
  { key: "ressource-certifikat-detalje", path: "/ressourcer/certifikater", selector: "tbody tr[role=button]" },
  { key: "ressource-vare-opret", path: "/ressourcer/varekatalog", text: "Opret vare" },
  { key: "fleet-arbejdsko-detalje", path: "/fleet-v2/arbejdsko", selector: ".queue-card-main" },
  { key: "fleet-arbejdsko-opret", path: "/fleet-v2/arbejdsko", text: "Manuel sag" },
  { key: "facility-arbejdsko-detalje", path: "/facility-v2/arbejdsko", selector: ".facility-queue-card" },
  { key: "facility-arbejdsko-opret", path: "/facility-v2/arbejdsko", text: "Manuel sag" },
  { key: "procure-bestilling-detalje", path: "/indkoeb/bestillinger", selector: ".procure-list > button", optional: true },
  { key: "procure-vare-opret", path: "/indkoeb/katalog", text: "Opret vare" },
  { key: "warehouse-vare-opret", path: "/warehouse/varer", text: "Ny vare" },
  { key: "kunde-detalje", path: "/opsaetning/kunder", selector: "tbody tr[role=button]", optional: true },
  { key: "leverandoer-detalje", path: "/indkoeb/leverandoerer", selector: "tbody tr[role=button]" },
];
try {
  await call("Page.enable");
  await call("Runtime.enable");
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('form'))", "Loginformularen blev ikke klar");
  await evaluate(`(()=>{const set=(selector,value)=>{const element=document.querySelector(selector);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));};set('input[type=email]',${JSON.stringify(EMAIL)});set('input[type=password]',${JSON.stringify(PASSWORD)});document.querySelector('form').requestSubmit();return true})()`);
  await waitFor("location.pathname !== '/login'", "Det lokale emulatorlogin fejlede");

  if (SIDEBAR_CAPTURE) {
    await setViewport(1440, 900);
    await navigate("/facility-v2/arbejdsko");
    const measureSidebar = async (state) => evaluate(`(()=>{
      const visible=(el)=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
      const round=(value)=>+value.toFixed(2);
      const side=document.querySelector('.fc-side');const sr=side.getBoundingClientRect();const center=sr.left+sr.width/2;const logo=document.querySelector('.fc-brand-logo .veyro-logo');const logoRect=logo.getBoundingClientRect();
      const logoCenter=${JSON.stringify(state)}==='sammenklappet'?logoRect.left+logoRect.width*(396/2048):logoRect.left+logoRect.width/2;
      const links=[...document.querySelectorAll('.fc-nav-modul>.fc-link,.fc-fakturacenter-main>.fc-link')].filter(visible);
      return {state:${JSON.stringify(state)},sidebar:{x:round(sr.x),width:round(sr.width),center:round(center)},logo:{x:round(logoRect.x),width:round(logoRect.width),visualCenter:round(logoCenter),delta:round(logoCenter-center)},items:links.map((link)=>{
        const holder=link.querySelector('.fc-nav-ikon');const svg=holder?.querySelector('svg');const path=svg?.querySelector('path');
        const lr=link.getBoundingClientRect();const hr=holder.getBoundingClientRect();const vr=svg.getBoundingClientRect();const box=path.getBBox();
        const holderCenter=hr.left+hr.width/2;const actionCenter=lr.left+lr.width/2;const symbolDelta=((box.x+box.width/2)-12)*(vr.width/24);
        return {label:link.getAttribute('aria-label')||link.textContent.trim(),active:link.classList.contains('fc-on'),action:{x:round(lr.x),y:round(lr.y),width:round(lr.width),height:round(lr.height),center:round(actionCenter),delta:round(actionCenter-center)},holder:{x:round(hr.x),y:round(hr.y),width:round(hr.width),height:round(hr.height),center:round(holderCenter),delta:round(holderCenter-center)},symbol:{bbox:{x:round(box.x),width:round(box.width)},opticalDelta:round(symbolDelta)}};
      })};
    })()`);
    if (await evaluate("document.querySelector('.fc-app').classList.contains('fc-menu-kompakt')")) {
      await evaluate("document.querySelector('.fc-menu-toggle').click();true");
      await pause(250);
    }
    sidebarAudit.push(await measureSidebar("udfoldet"));
    await screenshot("menu-udfoldet-1440x900.png", sidebarDir);
    await evaluate("document.querySelector('.fc-menu-toggle').click();true");
    await pause(250);
    sidebarAudit.push(await measureSidebar("sammenklappet"));
    await screenshot("menu-sammenklappet-1440x900.png", sidebarDir);
  }

  if (ROUTE_CAPTURE) {
    for (const [width, height] of VIEWPORTS) {
      await setViewport(width, height);
      for (let index = 0; index < routes.length; index += 1) {
        const route = routes[index];
        try {
          await navigate(route.path);
          const metrics = await evaluate(measureExpression);
          const file = `${String(index + 1).padStart(2, "0")}-${slug(route.key)}-${width}x${height}.png`;
          await screenshot(file);
          captures.push({ ...route, viewport: `${width}x${height}`, zoom: "100 %", file, ...metrics });
        } catch (error) {
          failures.push({ ...route, viewport: `${width}x${height}`, error: error.message });
        }
      }
    }
  }

  if (INTERACTION_CAPTURE) {
    await setViewport(1440, 900);
    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      try {
        await navigate(scenario.path);
        const clicked = await evaluate(`(()=>{const visible=(el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0};const candidates=${scenario.selector
          ? `[...document.querySelectorAll(${JSON.stringify(scenario.selector)})]`
          : `[...document.querySelectorAll('button,a')]`};const target=candidates.find((el)=>visible(el)&&${scenario.text ? `el.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(scenario.text)})` : "true"});if(!target)return false;target.click();return true})()`);
        if (!clicked && scenario.optional) {
          interactionUnavailable.push({ ...scenario, reason: "Ingen syntetiske poster i den aktuelle emulatorvisning" });
          continue;
        }
        if (!clicked) throw new Error("Den aftalte kontrol kunne ikke findes");
        await pause(650);
        const metrics = await evaluate(measureExpression);
        const file = `${String(index + 1).padStart(2, "0")}-${slug(scenario.key)}-1440x900.png`;
        await screenshot(file, interactionsDir);
        interactions.push({ ...scenario, file, ...metrics });
      } catch (error) {
        interactionFailures.push({ ...scenario, error: error.message });
      }
    }
  }

  const reportName = SIDEBAR_CAPTURE && !ROUTE_CAPTURE && !INTERACTION_CAPTURE
    ? "sidebar-audit.json"
    : ROUTE_CAPTURE ? "visual-audit.json" : "interaction-audit.json";
  writeFileSync(join(OUT, reportName), `${JSON.stringify({
    codeCommit: CODE_COMMIT,
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    normalEmulatorLogin: true,
    externalServices: false,
    routes: routes.length,
    viewports: VIEWPORTS.map(([width, height]) => `${width}x${height}`),
    captures,
    failures,
    interactions,
    interactionFailures,
    interactionUnavailable,
    sidebarAudit,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: failures.length === 0 && interactionFailures.length === 0, output: OUT, routes: routes.length, captures: captures.length, failures: failures.length, interactions: interactions.length, interactionFailures: interactionFailures.length, interactionUnavailable: interactionUnavailable.length, sidebarStates: sidebarAudit.length }, null, 2));
} finally {
  try { socket.close(); } catch { /* allerede lukket */ }
  browser.kill();
  await pause(250);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge frigiver profilen sent */ }
}
