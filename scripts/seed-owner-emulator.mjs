/* Lokal browser-smoke for ejerkonsollen.
 *
 * Scriptet nægter at køre mod andet end de tre eksplicitte localhost-
 * emulatorer og et demo-*-projekt. Konto, adgangskode og data nedenfor er
 * syntetiske testfixtures; de må aldrig genbruges uden for emulatoren.
 */
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { byggEjerClaims } from "../src/fleet/ejeradgang.js";

const PROJEKT = process.env.GCLOUD_PROJECT || "demo-veyro-owner";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const DATABASE_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

if (!/^demo-/.test(PROJEKT)
    || AUTH_HOST !== "127.0.0.1:9099"
    || DATABASE_HOST !== "127.0.0.1:9000"
    || STORAGE_HOST !== "127.0.0.1:9199") {
  throw new Error(
    "Afvist: ejerfixture må kun seedes i demo-*-projektet på de tre lokale emulatorporte.",
  );
}

export const EMULATOR_EJER = Object.freeze({
  email: "ejer@demo.veyro.invalid",
  password: "Kun-Lokal-Emulator-2026!",
});

const app = initializeApp({
  projectId: PROJEKT,
  databaseURL: `http://${DATABASE_HOST}?ns=${PROJEKT}`,
  storageBucket: `${PROJEKT}.appspot.com`,
}, "veyro-owner-emulator-seed");

try {
  const auth = getAuth(app);
  let bruger;
  try {
    bruger = await auth.getUserByEmail(EMULATOR_EJER.email);
    bruger = await auth.updateUser(bruger.uid, {
      password: EMULATOR_EJER.password,
      emailVerified: true,
      disabled: false,
    });
  } catch (fejl) {
    if (fejl?.code !== "auth/user-not-found") throw fejl;
    bruger = await auth.createUser({
      email: EMULATOR_EJER.email,
      password: EMULATOR_EJER.password,
      emailVerified: true,
    });
  }
  await auth.setCustomUserClaims(bruger.uid, byggEjerClaims({}));

  await getDatabase(app).ref().update({
    [`profiler/${bruger.uid}`]: {
      navn: "Ejer (lokal emulator)",
      email: EMULATOR_EJER.email,
      opdateretMs: Date.now(),
    },
    "udbyder/crm/virksomheder/browser-smoke": {
      stamdata: {
        navn: "Eksempelvirksomhed — kun emulator",
        cvr: "00000000",
        status: "lead",
      },
      oprettetMs: Date.now(),
      oprettetAf: bruger.uid,
    },
  });

  console.log(`Seedet lokal ejerfixture: ${EMULATOR_EJER.email}`);
} finally {
  await deleteApp(app);
}
