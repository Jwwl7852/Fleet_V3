/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/claims-migration.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/** Ren, testbar orkestrering af en claims-migration. Firebase-I/O leveres af
 * kalderen, saa en enkelt kontofejl ikke kan afbryde resten af tenantens batch. */
export async function migrerClaimKonti({ poster, gyldigRolle, forny, fejlkode, vedFejl }) {
  const fejlede = [];
  const fejldetaljer = [];
  let fornyet = 0;
  for (const [uid, post] of Object.entries(poster || {})) {
    if (!gyldigRolle(post?.rolle)) {
      fejlede.push(uid);
      fejldetaljer.push({ uid, kode: "claims/invalid-role" });
      continue;
    }
    try {
      await forny(uid, post);
      fornyet += 1;
    } catch (fejl) {
      vedFejl(fejl);
      fejlede.push(uid);
      fejldetaljer.push({ uid, kode: fejlkode(fejl) });
    }
  }
  return {
    ok: fejlede.length === 0,
    ramte: Object.keys(poster || {}).length,
    fornyet,
    fejlede,
    fejldetaljer,
  };
}
