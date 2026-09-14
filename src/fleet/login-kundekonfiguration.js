import { LOGIN_MODULER } from "./login-billeder.js";

const CONTEXT_ID = /^[a-z0-9][a-z0-9_-]{5,63}$/;

export function valideOffentligLoginKontekst(data) {
  if (!data || data.version !== 1 || !CONTEXT_ID.test(data.contextId || "") || !Array.isArray(data.moduler)) return null;
  const moduler = [...new Set(data.moduler)];
  if (!moduler.length || moduler.some((modul) => !LOGIN_MODULER.includes(modul))) return null;
  return { status: "kendt", contextId: data.contextId, moduler };
}

export async function hentOffentligLoginKontekst({ url, fetchFn = fetch, signal } = {}) {
  if (!url) return { status: "ukendt", moduler: [] };
  try {
    const svar = await fetchFn(url, { method: "GET", credentials: "omit", cache: "no-store", headers: { Accept: "application/json" }, signal });
    if (!svar.ok) return { status: "ukendt", moduler: [] };
    return valideOffentligLoginKontekst(await svar.json()) || { status: "ukendt", moduler: [] };
  } catch (error) {
    if (error?.name !== "AbortError") console.info("Ingen valideret offentlig loginkontekst; neutral loginflade vises.");
    return { status: "ukendt", moduler: [] };
  }
}
