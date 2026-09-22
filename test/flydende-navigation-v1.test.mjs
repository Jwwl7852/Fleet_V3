import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync("src/fleet/AppShell.jsx", "utf8");
const styles = readFileSync("src/fleet/fleet.css", "utf8");

test("Version 1 starter uden en fast sidebar og genbruger NAV-konfigurationen", () => {
  assert.ok(shell.includes("NAV, GRUPPE_ORDEN, GRUPPE_LABEL"));
  assert.ok(shell.includes("const [menuAaben, setMenuAaben] = useState(false)"));
  assert.ok(shell.includes("{menuAaben && <>"));
  assert.doesNotMatch(shell, /<aside className="fc-side"/);
  assert.ok(styles.includes(".fc-app--flydende-menu{display:flex;flex-direction:column"));
});

test("adgang, moduler og destinationslinks filtreres med de eksisterende regler", () => {
  assert.ok(shell.includes(".filter((b) => !b.skjulINav)"));
  assert.ok(shell.includes("!b.kraeverPerm || harPerm(bruger?.perms, b.kraeverPerm)"));
  assert.ok(shell.includes("!n || harModul(moduler, n)"));
  assert.ok(shell.includes("<NavLink key={m.key} to={m.sti}"));
  assert.ok(shell.includes("onClick={() => vaelgToppunkt(m)}"));
});

test("menuen lukker kontrolleret og beskytter mod klik gennem baggrunden", () => {
  assert.ok(shell.includes("event.preventDefault(); event.stopPropagation(); lukMenu();"));
  assert.ok(shell.includes('if (event.key === "Escape")'));
  assert.ok(shell.includes("menuKnap.current?.focus()"));
  assert.ok(shell.includes("document.querySelector('[aria-modal=\"true\"]"));
});

test("hver åbning starter med moduloversigten uden automatisk undermenu", () => {
  const aabnMenu = shell.match(/const aabnMenu = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  assert.ok(aabnMenu.includes("setValgtMenuModul(null)"));
  assert.doesNotMatch(aabnMenu, /aktivtToppunkt/);
  assert.ok(shell.includes('aria-current={aktiv ? "page" : undefined} aria-pressed={valgt} aria-expanded={valgt}'));
});

test("desktop-hover åbner og lukker undermenuen forsinket over hele panelområdet", () => {
  assert.ok(shell.includes('matchMedia("(hover: hover) and (pointer: fine)")'));
  assert.match(shell, /setTimeout\(\(\) => \{\s*setValgtMenuModul\(m\.key\);[\s\S]*?\}, 120\)/);
  assert.match(shell, /setTimeout\(\(\) => \{\s*setValgtMenuModul\(null\);[\s\S]*?\}, 180\)/);
  assert.ok(shell.includes("onPointerEnter={holdUndermenuAaben} onPointerLeave={planlaegLukUndermenu}"));
  assert.ok(shell.includes("onPointerEnter={() => planlaegToppunkt(m)} onClick={() => vaelgToppunkt(m)}"));
});

test("mobilmenuen bruger samme panel med Tilbage, Luk og låst baggrund", () => {
  assert.ok(shell.includes('className="fc-flydende-tilbage"'));
  assert.ok(shell.includes('aria-label="Luk menu"'));
  assert.ok(styles.includes("body.fc-flydende-menu-aaben{overflow:hidden"));
  assert.ok(styles.includes(".fc-mobil-undermenu .fc-flydende-moduler{display:none}"));
  assert.ok(styles.includes(".fc-mobil-undermenu .fc-flydende-undermenu{display:flex}"));
});

test("fakturacentertællere og Outlet-kontrakten bevares", () => {
  assert.ok(shell.includes("const [fakturacenterAntal, setFakturacenterAntal] = useState"));
  assert.ok(shell.includes("fakturacenterAntal[sektion.id]"));
  assert.ok(shell.includes("<Outlet context={{ setFakturacenterAntal }} />"));
});
