import {
  initializeTestEnvironment as initializeRawTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  ALLE_PERMS,
  ROLLE_PERMS,
  kompaktPermStreng,
} from "../src/fleet/permissions.js";

export { assertFails, assertSucceeds };

const KENDTE_PERMISSIONS = new Set(ALLE_PERMS);
const KENDTE_ROLLER = new Set(Object.keys(ROLLE_PERMS));
const TILLADTE_EKSTRA_CLAIMS = new Set(["udbyder", "devTester"]);
const AUTORITETSFELTER = new Set(["tenant", "rolle", "pv", "perms"]);
const HAR_EGEN = (objekt, felt) => Object.prototype.hasOwnProperty.call(objekt, felt);

function emulatorFraMiljoe(variable, fallback) {
  const vaerdi = process.env[variable];
  if (!vaerdi) return fallback;
  const separator = vaerdi.lastIndexOf(":");
  const port = Number(vaerdi.slice(separator + 1));
  if (separator < 1 || !Number.isInteger(port)) return fallback;
  return { host: vaerdi.slice(0, separator), port };
}

export function isoleredeEmulatorporte(options) {
  const resultat = { ...options };
  if (options.database) {
    resultat.database = {
      ...options.database,
      ...emulatorFraMiljoe("FIREBASE_DATABASE_EMULATOR_HOST", {}),
    };
  }
  if (options.storage) {
    resultat.storage = {
      ...options.storage,
      ...emulatorFraMiljoe("FIREBASE_STORAGE_EMULATOR_HOST", {}),
    };
  }
  return resultat;
}

function semantiskePermissions(perms) {
  if (typeof perms !== "string") return null;
  if (perms === "") return [];
  if (!perms.startsWith("|") || !perms.endsWith("|")) return null;
  const dele = perms.slice(1, -1).split("|");
  if (dele.some((del) => !del) || new Set(dele).size !== dele.length) return null;
  return dele.every((perm) => KENDTE_PERMISSIONS.has(perm)) ? dele : null;
}

/**
 * Almindelige emulator-fixtures beskriver fortsat permissions med deres
 * semantiske navne. Her valideres fixture-identiteten og kodes gennem den
 * samme officielle v2-encoder som produktets serverbuilder.
 *
 * Bevidst ugyldige permissions bevares som et ugyldigt v2-format, så negative
 * tests fortsat prøver fail-closed-adfærd. Legacy/null-cases bruger den rå
 * rules-unit-testing-import i rules.custom-claims-v2.test.mjs og går derfor
 * aldrig gennem denne wrapper.
 */
export function testClaimsV2(claims = {}) {
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    throw new TypeError("Testclaims skal være et objekt.");
  }
  if (HAR_EGEN(claims, "pv")) {
    throw new TypeError("Almindelige Rules-fixtures må ikke sætte pv direkte.");
  }
  if (HAR_EGEN(claims, "tenant") && claims.tenant !== "") {
    if (typeof claims.tenant !== "string" ||
        claims.tenant.length > 40 ||
        /[.#$\[\]\/]/.test(claims.tenant)) {
      throw new TypeError("Testtenant er ikke en gyldig syntetisk RTDB-nøgle.");
    }
  }
  if (HAR_EGEN(claims, "rolle") && !KENDTE_ROLLER.has(claims.rolle)) {
    throw new TypeError(`Ukendt testrolle: ${String(claims.rolle)}.`);
  }
  for (const [navn, værdi] of Object.entries(claims)) {
    if (AUTORITETSFELTER.has(navn)) continue;
    if (!TILLADTE_EKSTRA_CLAIMS.has(navn) || typeof værdi !== "boolean") {
      throw new TypeError(`Ikke-tilladt ekstra testclaim: ${navn}.`);
    }
  }

  const permissions = HAR_EGEN(claims, "perms")
    ? semantiskePermissions(claims.perms)
    : [];
  return {
    ...claims,
    pv: 2,
    perms: permissions === null ? claims.perms : kompaktPermStreng(permissions),
  };
}

/**
 * Drop-in-erstatning for rules-unit-testing. Kun authenticatedContext pakkes;
 * cleanup, unauthenticatedContext og withSecurityRulesDisabled bindes fortsat
 * direkte til det oprindelige miljø.
 */
export async function initializeUnwrappedTestEnvironment(options) {
  return initializeRawTestEnvironment(isoleredeEmulatorporte(options));
}

export async function initializeTestEnvironment(options) {
  const miljø = await initializeUnwrappedTestEnvironment(options);
  return new Proxy(miljø, {
    get(target, property, receiver) {
      if (property === "authenticatedContext") {
        return (uid, claims = {}) =>
          target.authenticatedContext(uid, testClaimsV2(claims));
      }
      const værdi = Reflect.get(target, property, receiver);
      return typeof værdi === "function" ? værdi.bind(target) : værdi;
    },
  });
}
