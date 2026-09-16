/* Ren transportkerne for optimistiske RTDB-skrivninger.
 *
 * Filen importerer ikke Firebase og kan derfor afprøves med en rigtig
 * HTTP-transport i Node. En kandidat er ikke en gemt værdi: kun en accepteret
 * PATCH/PUT eller en verificeret no-op må returneres som succes.
 */

const erObjekt = (vaerdi) => vaerdi !== null
  && typeof vaerdi === "object"
  && !Array.isArray(vaerdi);

export function feltPatch(foer, efter, sti = "", resultat = {}) {
  if (Object.is(foer, efter)) return resultat;
  if (erObjekt(foer) && erObjekt(efter)) {
    const noegler = new Set([...Object.keys(foer), ...Object.keys(efter)]);
    for (const noegle of noegler) {
      feltPatch(foer[noegle], efter[noegle], sti ? `${sti}/${noegle}` : noegle, resultat);
    }
    return resultat;
  }
  if (JSON.stringify(foer) !== JSON.stringify(efter)) {
    resultat[sti] = efter === undefined ? null : efter;
  }
  return resultat;
}

const transportFejl = (message, code, status = null) => Object.assign(new Error(message), {
  code,
  ...(status == null ? {} : { status }),
});

export async function udfoerTransaktionsSkrivning({
  url,
  token,
  opdater,
  opdaterPatch,
  konfliktfoelsomtFelt,
  fetchImpl = globalThis.fetch,
  maksForsog = 8,
  onAccepted = null,
}) {
  if (typeof fetchImpl !== "function") throw transportFejl("Fetch-transporten mangler.", "unavailable");

  for (let forsoeg = 1; forsoeg <= maksForsog; forsoeg += 1) {
    const laest = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, "X-Firebase-ETag": "true" },
    });
    if (!laest.ok) throw transportFejl(
      `Læsning før skrivning fejlede (${laest.status}).`,
      [401, 403].includes(laest.status) ? "permission-denied" : "unavailable",
      laest.status,
    );

    const foer = await laest.json();
    let kandidat;
    try {
      kandidat = opdater(foer);
    } catch (cause) {
      throw Object.assign(cause, { transactionDomainConflict: true });
    }

    const patch = feltPatch(foer, kandidat);
    const felter = Object.keys(patch);
    if (felter.length === 0) {
      const resultat = { foer, efter: foer, udfald: "no-op", forsoeg };
      await onAccepted?.(resultat);
      return resultat;
    }

    if (!felter.some(konfliktfoelsomtFelt)) {
      await opdaterPatch(patch);
      const resultat = { foer, efter: kandidat, udfald: "patch", forsoeg };
      await onAccepted?.(resultat);
      return resultat;
    }

    const etag = laest.headers.get("etag");
    if (!etag) throw transportFejl("Serveren returnerede ingen ETag.", "unavailable");
    const skrevet = await fetchImpl(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "if-match": etag,
      },
      body: JSON.stringify(kandidat),
    });
    if (skrevet.status === 412) continue;
    if (!skrevet.ok) throw transportFejl(
      `Skrivning fejlede (${skrevet.status}).`,
      [401, 403].includes(skrevet.status) ? "permission-denied" : "unavailable",
      skrevet.status,
    );

    const efter = await skrevet.json();
    const resultat = { foer, efter, udfald: "put", forsoeg };
    await onAccepted?.(resultat);
    return resultat;
  }

  throw transportFejl(
    `Enheden blev ændret under alle ${maksForsog} skriveforsøg. Intet blev gemt.`,
    "transaction-conflict",
    412,
  );
}
