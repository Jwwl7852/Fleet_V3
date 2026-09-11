/* Faktiske reviewbilleder fra den isolerede ejer-emulator.
 *
 * Scriptet starter en separat headless Edge-profil, bruger den normale
 * loginformular (som kun forudfyldes i owner-emulator mode), og gemmer
 * viewport-screenshots. Ingen loginværdier læses, udskrives eller gemmes.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const BASE = process.env.OWNER_REVIEW_URL || "http://127.0.0.1:5211";
const PORT = Number(process.env.OWNER_REVIEW_DEBUG_PORT || 9331);
const OUT = resolve(process.env.OWNER_REVIEW_OUTPUT || "docs/screenshots/ejer-review-v4-final");
const browserKandidater = [
  process.env.OWNER_REVIEW_BROWSER,
  join(process.env.ProgramFiles || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
].filter(Boolean);

const browser = browserKandidater.find((sti) => {
  try { return Boolean(process.getBuiltinModule("node:fs").statSync(sti).isFile()); } catch { return false; }
});
if (!browser) throw new Error("Microsoft Edge blev ikke fundet. Sæt OWNER_REVIEW_BROWSER til en Chromium-browser.");

mkdirSync(OUT, { recursive: true });
const profil = mkdtempSync(join(tmpdir(), "veyro-owner-review-"));
const proces = spawn(browser, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`,
  "--window-size=1920,1080", `${BASE}/login`,
], { stdio: "ignore" });

const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));
async function hentJson(sti) {
  const svar = await fetch(`http://127.0.0.1:${PORT}${sti}`);
  if (!svar.ok) throw new Error(`DevTools svarede ${svar.status} på ${sti}.`);
  return svar.json();
}

let side;
for (let forsøg = 0; forsøg < 60; forsøg += 1) {
  try {
    const sider = await hentJson("/json/list");
    side = sider.find((post) => post.type === "page" && post.url?.startsWith(BASE))
      || sider.find((post) => post.type === "page");
    if (side?.webSocketDebuggerUrl) break;
  } catch { /* Browseren starter stadig. */ }
  await pause(250);
}
if (!side?.webSocketDebuggerUrl) throw new Error("Kunne ikke forbinde til den isolerede reviewbrowser.");

const socket = new WebSocket(side.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});
let id = 0;
const ventende = new Map();
socket.addEventListener("message", (event) => {
  const besked = JSON.parse(event.data);
  if (!besked.id || !ventende.has(besked.id)) return;
  const { resolve: afslut, reject } = ventende.get(besked.id);
  ventende.delete(besked.id);
  if (besked.error) reject(new Error(besked.error.message)); else afslut(besked.result);
});
function kald(method, params = {}) {
  const næste = ++id;
  socket.send(JSON.stringify({ id: næste, method, params }));
  return new Promise((afslut, reject) => ventende.set(næste, { resolve: afslut, reject }));
}
async function evaluer(expression) {
  const svar = await kald("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (svar.exceptionDetails) throw new Error(svar.exceptionDetails.text || "JavaScript-fejl i reviewbrowseren.");
  return svar.result?.value;
}
async function ventPaa(expression, besked, timeoutMs = 15000) {
  const slut = Date.now() + timeoutMs;
  while (Date.now() < slut) {
    if (await evaluer(expression)) return;
    await pause(150);
  }
  throw new Error(besked);
}
async function gaaTil(sti) {
  await kald("Page.navigate", { url: `${BASE}${sti}` });
  await ventPaa("document.readyState === 'complete'", `Siden ${sti} blev ikke klar.`);
  await pause(300);
}
async function viewport(bredde, højde) {
  await kald("Emulation.setDeviceMetricsOverride", {
    width: bredde, height: højde, deviceScaleFactor: 1, mobile: false,
    screenWidth: bredde, screenHeight: højde,
  });
}
async function billede(navn, sti, bredde, højde) {
  await viewport(bredde, højde);
  await gaaTil(sti);
  await ventPaa("Boolean(document.querySelector('.ejer-app'))", `Ejerskallen mangler på ${sti}.`);
  await ventPaa("!Array.from(document.querySelectorAll('.fc-empty')).some((el) => /^Henter/.test(el.textContent || ''))", `Dataindholdet blev ikke klar på ${sti}.`, 30000);
  const svar = await kald("Page.captureScreenshot", {
    format: "png", fromSurface: true, captureBeyondViewport: false,
  });
  const fil = join(OUT, `${bredde}x${højde}-${navn}.png`);
  writeFileSync(fil, Buffer.from(svar.data, "base64"));
  return fil;
}

try {
  await kald("Page.enable");
  await kald("Runtime.enable");
  await viewport(1440, 900);
  await gaaTil("/login");
  if (!(await evaluer("location.pathname.startsWith('/main')"))) {
    await ventPaa("Boolean(document.querySelector('input[type=email]')?.value && document.querySelector('input[type=password]')?.value)", `Den lokale loginformular blev ikke sikkert forudfyldt (${await evaluer("location.href")}).`, 15000);
    const klar = await evaluer("Boolean(document.querySelector('input[type=email]')?.value && document.querySelector('input[type=password]')?.value)");
    if (!klar) throw new Error("Den lokale loginformular er ikke sikkert forudfyldt; reviewcapture afbrydes.");
    await evaluer("document.querySelector('form')?.requestSubmit(); true");
    await ventPaa("location.pathname.startsWith('/main')", "Normalt ejerlogin lykkedes ikke.");
  }

  const filer = [];
  filer.push(await billede("01-overblik", "/main", 1440, 900));
  filer.push(await billede("02-mail-faelles-kundekorrespondance", "/main/mail/indbakker?sag=review-nordlys", 1440, 900));
  filer.push(await billede("03-support", "/main/support", 1440, 900));
  filer.push(await billede("04-opfoelgning-godkendelse", "/main/mail/opfoelgning", 1440, 900));
  filer.push(await billede("05-rapporter-og-hitrate", "/main/rapporter", 1920, 1080));
  filer.push(await billede("06-kundekonto-brugere-enheder", "/main/kunder/flow-tenant?fane=forbrug", 1440, 900));
  filer.push(await billede("07-kundekonto-obd", "/main/kunder/flow-tenant?fane=obd", 1440, 900));
  filer.push(await billede("08-tilbud-rateblad-ai", "/main/salg/tilbud", 1920, 1080));
  filer.push(await billede("09-bilag-mobilkamera", "/main/oekonomi/bilag", 1440, 900));
  filer.push(await billede("10-leverandoerer", "/main/indstillinger/leverandoerer", 1440, 900));
  filer.push(await billede("11-integrationer", "/main/integrationer", 1920, 1080));
  filer.push(await billede("12-mobil-360-kundekonto", "/main/kunder/flow-tenant?fane=forbrug", 360, 800));
  filer.push(await billede("13-mobil-390-mail", "/main/mail/indbakker?sag=review-nordlys", 390, 844));
  filer.push(await billede("14-breakpoint-kundekonto", "/main/kunder/flow-tenant?fane=obd", 899, 900));
  await evaluer("document.querySelector('.ejer-mobilmenuknap')?.click(); true");
  await ventPaa("document.querySelector('.ejer-side')?.classList.contains('ejer-side-aaben')", "Mobilnavigationen åbnede ikke.");
  await pause(250);
  const mobilMenuSvar = await kald("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const mobilMenuFil = join(OUT, "899x900-15-mobil-navigation-aaben.png");
  writeFileSync(mobilMenuFil, Buffer.from(mobilMenuSvar.data, "base64"));
  filer.push(mobilMenuFil);
  await kald("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await kald("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await ventPaa("!document.querySelector('.ejer-side')?.classList.contains('ejer-side-aaben') && document.activeElement?.classList.contains('ejer-mobilmenuknap')", "ESC lukkede ikke mobilnavigationen med fokusretur.");
  await pause(250);
  const mobilStyles = await evaluer(`(() => {
    const mål = (selector) => { const el = document.querySelector(selector); if (!el) return null; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { text:el.textContent, display:s.display, visibility:s.visibility, color:s.color, fontSize:s.fontSize, rect:{ x:r.x, y:r.y, width:r.width, height:r.height } }; };
    return { menuButton:mål('.ejer-mobilmenuknap'), sidebar:mål('.ejer-side'), menu:mål('.ejer-menuindhold'), horizontalOverflow:document.documentElement.scrollWidth > innerWidth };
  })()`);

  await viewport(1920, 1080);
  await gaaTil("/main/mail/indbakker?sag=review-nordlys");
  const styles = await evaluer(`(() => {
    const mål = (selector) => { const el = document.querySelector(selector); if (!el) return null; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { fontFamily:s.fontFamily, fontSize:s.fontSize, lineHeight:s.lineHeight, height:r.height, width:r.width, borderRadius:s.borderRadius, color:s.color, backgroundColor:s.backgroundColor }; };
    return { url:location.href, viewport:{ width:innerWidth, height:innerHeight, devicePixelRatio }, fonts:{ status:document.fonts.status, interLoaded:document.fonts.check('14px "Inter Variable"') }, body:mål('body'), sidebar:mål('.ejer-side'), content:mål('.ejer-indhold'), card:mål('.ejer-mail-liste'), input:mål('.ejer-mail-soeg input'), button:mål('.ejer-segmenter button'), tableHeader:mål('.fc-table th'), horizontalOverflow:document.documentElement.scrollWidth > innerWidth, mobile:${JSON.stringify(mobilStyles)} };
  })()`);
  writeFileSync(join(OUT, "browser-style-verification.json"), `${JSON.stringify(styles, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, filer: filer.map((fil) => fil.slice(resolve(".").length + 1)), styles }, null, 2));
} finally {
  try { socket.close(); } catch { /* allerede lukket */ }
  proces.kill();
  await pause(250);
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Edge kan holde profilen kortvarigt. */ }
}
