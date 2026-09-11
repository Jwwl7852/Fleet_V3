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
const OUT = resolve(
  process.env.OWNER_REVIEW_OUTPUT || "docs/screenshots/ejer-review-v6",
);
const CODE_COMMIT = process.env.OWNER_REVIEW_CODE_COMMIT || "ikke-angivet";
const browserKandidater = [
  process.env.OWNER_REVIEW_BROWSER,
  join(
    process.env.ProgramFiles || "C:/Program Files",
    "Microsoft/Edge/Application/msedge.exe",
  ),
  join(
    process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)",
    "Microsoft/Edge/Application/msedge.exe",
  ),
].filter(Boolean);

const browser = browserKandidater.find((sti) => {
  try {
    return Boolean(process.getBuiltinModule("node:fs").statSync(sti).isFile());
  } catch {
    return false;
  }
});
if (!browser)
  throw new Error(
    "Microsoft Edge blev ikke fundet. Sæt OWNER_REVIEW_BROWSER til en Chromium-browser.",
  );

mkdirSync(OUT, { recursive: true });
const profil = mkdtempSync(join(tmpdir(), "veyro-owner-review-"));
const proces = spawn(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profil}`,
    "--window-size=1920,1080",
    `${BASE}/login`,
  ],
  { stdio: "ignore" },
);

const pause = (ms) =>
  new Promise((resolvePause) => setTimeout(resolvePause, ms));
async function hentJson(sti) {
  const svar = await fetch(`http://127.0.0.1:${PORT}${sti}`);
  if (!svar.ok) throw new Error(`DevTools svarede ${svar.status} på ${sti}.`);
  return svar.json();
}

let side;
for (let forsøg = 0; forsøg < 60; forsøg += 1) {
  try {
    const sider = await hentJson("/json/list");
    side =
      sider.find(
        (post) => post.type === "page" && post.url?.startsWith(BASE),
      ) || sider.find((post) => post.type === "page");
    if (side?.webSocketDebuggerUrl) break;
  } catch {
    /* Browseren starter stadig. */
  }
  await pause(250);
}
if (!side?.webSocketDebuggerUrl)
  throw new Error("Kunne ikke forbinde til den isolerede reviewbrowser.");

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
  if (besked.error) reject(new Error(besked.error.message));
  else afslut(besked.result);
});
function kald(method, params = {}) {
  const næste = ++id;
  socket.send(JSON.stringify({ id: næste, method, params }));
  return new Promise((afslut, reject) =>
    ventende.set(næste, { resolve: afslut, reject }),
  );
}
async function evaluer(expression) {
  const svar = await kald("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (svar.exceptionDetails)
    throw new Error(
      svar.exceptionDetails.text || "JavaScript-fejl i reviewbrowseren.",
    );
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
  await ventPaa(
    "document.readyState === 'complete'",
    `Siden ${sti} blev ikke klar.`,
  );
  await pause(300);
}
async function viewport(bredde, højde) {
  await kald("Emulation.setDeviceMetricsOverride", {
    width: bredde,
    height: højde,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: bredde,
    screenHeight: højde,
  });
}
async function billede(navn, sti, bredde, højde) {
  await viewport(bredde, højde);
  await gaaTil(sti);
  await ventPaa(
    "Boolean(document.querySelector('.ejer-app'))",
    `Ejerskallen mangler på ${sti}.`,
  );
  await ventPaa(
    "!Array.from(document.querySelectorAll('.fc-empty')).some((el) => /^Henter/.test(el.textContent || ''))",
    `Dataindholdet blev ikke klar på ${sti}.`,
    30000,
  );
  const svar = await kald("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const fil = join(OUT, `${bredde}x${højde}-${navn}.png`);
  writeFileSync(fil, Buffer.from(svar.data, "base64"));
  return fil;
}
async function aktueltBillede(navn, bredde, højde) {
  const svar = await kald("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const fil = join(OUT, `${bredde}x${højde}-${navn}.png`);
  writeFileSync(fil, Buffer.from(svar.data, "base64"));
  return fil;
}
async function klikTekst(selector, tekst) {
  return evaluer(
    `(() => { const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((post) => (post.textContent || '').trim().includes(${JSON.stringify(tekst)})); if (!el) return false; el.click(); return true; })()`,
  );
}
async function hjulKontrol(selectors) {
  await evaluer(
    `(${JSON.stringify(selectors)}).forEach((s)=>{const e=document.querySelector(s);if(e)e.scrollTop=0})`,
  );
  const resultat = [];
  for (const selector of selectors) {
    const punkt = await evaluer(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+Math.min(r.height/2,220),scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,max:Math.max(0,e.scrollHeight-e.clientHeight)}})()`,
    );
    const før = await evaluer(
      `Object.fromEntries(${JSON.stringify(selectors)}.map(s=>[s,document.querySelector(s)?.scrollTop??null]))`,
    );
    if (punkt)
      await kald("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: punkt.x,
        y: punkt.y,
        deltaX: 0,
        deltaY: 260,
      });
    await pause(180);
    const efter = await evaluer(
      `Object.fromEntries(${JSON.stringify(selectors)}.map(s=>[s,document.querySelector(s)?.scrollTop??null]))`,
    );
    let graenser = null;
    if (punkt) {
      graenser = await evaluer(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollTop=e.scrollHeight;return{bundFoer:e.scrollTop,max:Math.max(0,e.scrollHeight-e.clientHeight)}})()`,
      );
      await kald("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: punkt.x,
        y: punkt.y,
        deltaX: 0,
        deltaY: 260,
      });
      await pause(100);
      graenser.bundEfter = await evaluer(
        `document.querySelector(${JSON.stringify(selector)})?.scrollTop??null`,
      );
      await evaluer(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e)e.scrollTop=0})()`,
      );
      await kald("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: punkt.x,
        y: punkt.y,
        deltaX: 0,
        deltaY: -260,
      });
      await pause(100);
      graenser.topEfter = await evaluer(
        `document.querySelector(${JSON.stringify(selector)})?.scrollTop??null`,
      );
    }
    const ændrede = Object.keys(efter).filter(
      (nøgle) => efter[nøgle] !== før[nøgle],
    );
    resultat.push({
      handling: `hjul på ${selector}`,
      element: punkt,
      før,
      efter,
      ændrede,
      isolationOk: ændrede.every((nøgle) => nøgle === selector),
      graenser,
    });
  }
  return resultat;
}

try {
  await kald("Page.enable");
  await kald("Runtime.enable");
  await viewport(1440, 900);
  await gaaTil("/login");
  if (!(await evaluer("location.pathname.startsWith('/main')"))) {
    await ventPaa(
      "Boolean(document.querySelector('input[type=email]')?.value && document.querySelector('input[type=password]')?.value)",
      `Den lokale loginformular blev ikke sikkert forudfyldt (${await evaluer("location.href")}).`,
      15000,
    );
    const klar = await evaluer(
      "Boolean(document.querySelector('input[type=email]')?.value && document.querySelector('input[type=password]')?.value)",
    );
    if (!klar)
      throw new Error(
        "Den lokale loginformular er ikke sikkert forudfyldt; reviewcapture afbrydes.",
      );
    await evaluer("document.querySelector('form')?.requestSubmit(); true");
    await ventPaa(
      "location.pathname.startsWith('/main')",
      "Normalt ejerlogin lykkedes ikke.",
    );
  }

  const filer = [];
  filer.push(await billede("01-overblik", "/main", 1440, 900));
  filer.push(await billede("02-mail-liste", "/main/mail/indbakker", 1440, 900));
  filer.push(
    await billede(
      "03-mail-faelles-kundekorrespondance",
      "/main/mail/indbakker?sag=review-nordlys",
      1440,
      900,
    ),
  );
  filer.push(await billede("04-support", "/main/support", 1440, 900));
  await viewport(1440, 900);
  await gaaTil("/main/mail/opfoelgning");
  await ventPaa(
    "Boolean(document.querySelector('.ejer-opfoelgning-tabs'))",
    "Opfølgninger blev ikke klar.",
    30000,
  );
  if (!(await klikTekst(".ejer-opfoelgning-tabs button", "På pause")))
    throw new Error("Fanen På pause blev ikke fundet.");
  await ventPaa(
    "document.body.innerText.includes('Stoppet — tilbud accepteret')",
    "Den stoppede opfølgning blev ikke vist.",
  );
  filer.push(
    await aktueltBillede("05-opfoelgning-stoppet-ved-accept", 1440, 900),
  );
  filer.push(
    await billede("06-rapporter-og-hitrate", "/main/rapporter", 1920, 1080),
  );
  filer.push(
    await billede(
      "07-kundekonto-brugere-enheder",
      "/main/kunder/flow-tenant?fane=forbrug",
      1440,
      900,
    ),
  );
  filer.push(
    await billede(
      "08-kundekonto-obd",
      "/main/kunder/flow-tenant?fane=obd",
      1440,
      900,
    ),
  );
  filer.push(
    await billede(
      "09-kundekonto-brugere-enheder",
      "/main/kunder/flow-tenant?fane=forbrug",
      1920,
      1080,
    ),
  );
  await viewport(1920, 1080);
  await gaaTil("/main/salg/tilbud");
  await ventPaa(
    "document.body.innerText.includes('accepteret og låst')",
    "Det accepterede tilbud blev ikke vist.",
    30000,
  );
  filer.push(await aktueltBillede("10-tilbud-accepteret-og-laast", 1920, 1080));
  const laasekontrol = await evaluer(
    `(() => { const område = document.querySelector('.ejer-tilbud-layout'); const tekst = område?.innerText || ''; return { accepteretOgLaast:tekst.includes('accepteret og låst') || document.body.innerText.includes('accepteret og låst'), gemKladde:tekst.includes('Gem kladde'), indsaetForslag:tekst.includes('Indsæt i tilbud'), redigerRateblad:tekst.includes('Redigér rateblad') }; })()`,
  );
  const aabnedeNyKladde = await klikTekst("button", "Opret ny kladde");
  if (aabnedeNyKladde || (await klikTekst("button", "Redigér"))) {
    await ventPaa(
      "Boolean(document.querySelector('#tilbud-ai-instruks'))",
      "Tilbudskladden blev ikke åbnet.",
    );
    await evaluer(
      `(() => { const el=document.querySelector('#tilbud-ai-instruks'); const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(el,'Gør teksten kortere og fremhæv pilotens afgrænsning.'); el.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
    );
    await klikTekst("button", "Foreslå indledning");
    await ventPaa(
      "document.body.innerText.includes('AI-forslag · gennemgå før indsættelse')",
      "Den lokale AI-testadapter lavede ikke et forslag.",
    );
    await evaluer(
      "document.querySelector('.ejer-ai-resultat')?.scrollIntoView({block:'center'}); true",
    );
    await pause(200);
    filer.push(
      await aktueltBillede(
        "11-tilbud-ai-forslag-foer-indsaettelse",
        1920,
        1080,
      ),
    );
    await klikTekst(".ejer-tilbud-redigerfaner button", "Sammensæt løsning");
    await evaluer(
      `(() => { const type=document.querySelector('#tilbud-type'); const selectSetter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; selectSetter.call(type,'pilot_med_drift'); type.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`,
    );
    await ventPaa(
      "Boolean(document.querySelector('#tilbud-pilot-start'))",
      "Pilotfelterne blev ikke vist.",
    );
    await evaluer(
      `(() => { const skriv=(id,v)=>{const el=document.querySelector(id);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}; skriv('#tilbud-pilot-start','2026-01-31'); skriv('#tilbud-pilot-maaneder','1'); scrollTo(0,0); return true; })()`,
    );
    await pause(200);
    filer.push(
      await aktueltBillede("11b-pilot-med-vejledende-drift", 1920, 1080),
    );
  }
  filer.push(
    await billede("12-bilag-mobilkamera", "/main/oekonomi/bilag", 1440, 900),
  );
  filer.push(
    await billede(
      "13-leverandoerer",
      "/main/indstillinger/leverandoerer",
      1440,
      900,
    ),
  );
  await klikTekst("button", "Redigér");
  await ventPaa(
    "Boolean(document.querySelector('.ejer-leverandoer-form'))",
    "Leverandørformularen blev ikke vist.",
  );
  await evaluer(
    `(()=>{const el=document.querySelector('.ejer-leverandoer-form input[type="email"]');if(!el)return false;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,'review-v6@demo.invalid');el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
  );
  await klikTekst("button", "Gem leverandør");
  await ventPaa(
    "document.body.innerText.includes('Gem leverandørændringer?')",
    "Leverandørens gemmebekræftelse blev ikke vist.",
  );
  filer.push(await aktueltBillede("13b-gem-bekraeftelsesdialog", 1440, 900));
  filer.push(
    await billede("14-integrationer", "/main/integrationer", 1920, 1080),
  );
  filer.push(
    await billede("15-mobil-360-mail-liste", "/main/mail/indbakker", 360, 800),
  );
  const mobil360Kontrol = await evaluer(
    `({ viewport:{width:innerWidth,height:innerHeight}, horizontalOverflow:document.documentElement.scrollWidth > innerWidth, listeBredde:document.querySelector('.ejer-mail-liste')?.getBoundingClientRect().width || 0 })`,
  );
  filer.push(
    await billede(
      "16-mobil-360-mail-samtale",
      "/main/mail/indbakker?sag=review-nordlys",
      360,
      800,
    ),
  );
  filer.push(
    await billede(
      "17-mobil-390-mail-samtale",
      "/main/mail/indbakker?sag=review-nordlys",
      390,
      844,
    ),
  );
  filer.push(
    await billede(
      "18-breakpoint-kundekonto",
      "/main/kunder/flow-tenant?fane=obd",
      899,
      900,
    ),
  );
  await evaluer("document.querySelector('.ejer-mobilmenuknap')?.click(); true");
  await ventPaa(
    "document.querySelector('.ejer-side')?.classList.contains('ejer-side-aaben')",
    "Mobilnavigationen åbnede ikke.",
  );
  await pause(250);
  const mobilMenuSvar = await kald("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const mobilMenuFil = join(OUT, "899x900-19-mobil-navigation-aaben.png");
  writeFileSync(mobilMenuFil, Buffer.from(mobilMenuSvar.data, "base64"));
  filer.push(mobilMenuFil);
  await kald("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await kald("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await ventPaa(
    "!document.querySelector('.ejer-side')?.classList.contains('ejer-side-aaben') && document.activeElement?.classList.contains('ejer-mobilmenuknap')",
    "ESC lukkede ikke mobilnavigationen med fokusretur.",
  );
  await pause(250);
  const mobilStyles = await evaluer(`(() => {
    const mål = (selector) => { const el = document.querySelector(selector); if (!el) return null; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { text:el.textContent, display:s.display, visibility:s.visibility, color:s.color, fontSize:s.fontSize, rect:{ x:r.x, y:r.y, width:r.width, height:r.height } }; };
    return { menuButton:mål('.ejer-mobilmenuknap'), sidebar:mål('.ejer-side'), menu:mål('.ejer-menuindhold'), horizontalOverflow:document.documentElement.scrollWidth > innerWidth };
  })()`);

  await viewport(1440, 900);
  await gaaTil("/main/salg/pipeline");
  const menuFoer = await evaluer(
    `(() => { const knap=Array.from(document.querySelectorAll('.ejer-navgruppe')).find((el)=>(el.textContent||'').includes('Salg')); return { expanded:knap?.getAttribute('aria-expanded'), path:location.pathname, underpunkter:knap?.parentElement?.querySelectorAll('.ejer-link').length || 0 }; })()`,
  );
  await klikTekst(".ejer-navgruppe", "Salg");
  await pause(150);
  const menuLukket = await evaluer(
    `(() => { const knap=Array.from(document.querySelectorAll('.ejer-navgruppe')).find((el)=>(el.textContent||'').includes('Salg')); return { expanded:knap?.getAttribute('aria-expanded'), path:location.pathname, underpunkter:knap?.parentElement?.querySelectorAll('.ejer-link').length || 0 }; })()`,
  );
  filer.push(
    await aktueltBillede("20-pipeline-med-salg-sammenfoldet", 1440, 900),
  );
  await klikTekst(".ejer-navgruppe", "Salg");
  await pause(150);
  const menuGenAabnet = await evaluer(
    `(() => { const knap=Array.from(document.querySelectorAll('.ejer-navgruppe')).find((el)=>(el.textContent||'').includes('Salg')); return { expanded:knap?.getAttribute('aria-expanded'), path:location.pathname, underpunkter:knap?.parentElement?.querySelectorAll('.ejer-link').length || 0 }; })()`,
  );
  await viewport(1440, 900);
  await gaaTil("/main/mail/indbakker?sag=review-nordlys");
  await pause(150);
  const scrollKontrol1440 = await hjulKontrol([
    ".ejer-mail-raekker",
    ".ejer-mail-samtale",
    ".ejer-mail-ai",
    "html",
  ]);
  await viewport(1920, 1080);
  await gaaTil("/main/mail/indbakker?sag=review-nordlys");
  await pause(150);
  const scrollKontrol1920 = await hjulKontrol([
    ".ejer-mail-raekker",
    ".ejer-mail-samtale",
    ".ejer-mail-ai",
    "html",
  ]);

  await viewport(390, 844);
  await gaaTil("/main/mail/indbakker?sag=review-nordlys");
  const bevaretTekst = "Lokalt V5-udkast bevares ved tilbage-navigation.";
  await evaluer(
    `(() => { const el=document.querySelector('textarea[aria-label="Svarudkast"]'); if(!el)return false; const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(el,${JSON.stringify(bevaretTekst)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
  );
  await klikTekst(".ejer-mail-mobil-tilbage", "Tilbage til indbakken");
  await ventPaa(
    "!new URLSearchParams(location.search).has('sag')",
    "Mobil tilbage-navigation fjernede ikke sagsvisningen.",
  );
  await klikTekst(".ejer-mail-raekker button", "Maria Eksempel");
  await ventPaa(
    "new URLSearchParams(location.search).get('sag') === 'review-nordlys'",
    "Sagen kunne ikke åbnes igen fra listen.",
  );
  const draftKontrol = await evaluer(
    `({ path:location.pathname, sag:new URLSearchParams(location.search).get('sag'), tekst:document.querySelector('textarea[aria-label="Svarudkast"]')?.value || '', bevaret:document.querySelector('textarea[aria-label="Svarudkast"]')?.value === ${JSON.stringify(bevaretTekst)}, viewport:{width:innerWidth,height:innerHeight}, horizontalOverflow:document.documentElement.scrollWidth > innerWidth })`,
  );

  await viewport(1920, 1080);
  await gaaTil("/main/mail/indbakker?sag=review-nordlys");
  const styles = await evaluer(`(() => {
    const mål = (selector) => { const el = document.querySelector(selector); if (!el) return null; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { fontFamily:s.fontFamily, fontSize:s.fontSize, lineHeight:s.lineHeight, height:r.height, width:r.width, borderRadius:s.borderRadius, color:s.color, backgroundColor:s.backgroundColor }; };
    return { url:location.href, viewport:{ width:innerWidth, height:innerHeight, devicePixelRatio }, fonts:{ status:document.fonts.status, interVariableLoaded:document.fonts.check('14px "Inter Variable"'), interLoaded:document.fonts.check('14px Inter') }, body:mål('body'), sidebar:mål('.ejer-side'), content:mål('.ejer-indhold'), card:mål('.ejer-mail-liste'), input:mål('.ejer-mail-soeg input'), button:mål('.ejer-segmenter button'), tableHeader:mål('.fc-table th'), horizontalOverflow:document.documentElement.scrollWidth > innerWidth, mobile:${JSON.stringify(mobilStyles)} };
  })()`);
  writeFileSync(
    join(OUT, "browser-style-verification.json"),
    `${JSON.stringify(styles, null, 2)}\n`,
  );
  const interaktioner = {
    menu: { før: menuFoer, lukket: menuLukket, genåbnet: menuGenAabnet },
    desktopScroll: {
      "1440x900": scrollKontrol1440,
      "1920x1080": scrollKontrol1920,
    },
    mobilListe360: mobil360Kontrol,
    mobilKladde: draftKontrol,
    accepteretTilbud: laasekontrol,
  };
  writeFileSync(
    join(OUT, "interaction-verification.json"),
    `${JSON.stringify(interaktioner, null, 2)}\n`,
  );
  writeFileSync(
    join(OUT, "capture-manifest.json"),
    `${JSON.stringify(
      {
        codeCommit: CODE_COMMIT,
        capturedAt: new Date().toISOString(),
        baseUrl: BASE,
        dataSource: "Syntetiske emulatorfixtures og lokale testadaptere",
        externalIntegrations: "Ikke tilsluttet",
        files: filer.map((fil) => fil.slice(resolve(".").length + 1)),
        evidence: [
          "browser-style-verification.json",
          "interaction-verification.json",
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        filer: filer.map((fil) => fil.slice(resolve(".").length + 1)),
        styles,
        interaktioner,
      },
      null,
      2,
    ),
  );
} finally {
  try {
    socket.close();
  } catch {
    /* allerede lukket */
  }
  proces.kill();
  await pause(250);
  try {
    rmSync(profil, { recursive: true, force: true });
  } catch {
    /* Edge kan holde profilen kortvarigt. */
  }
}
