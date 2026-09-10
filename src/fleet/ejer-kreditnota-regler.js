/* Rene kreditnotaregler, delt af ejerfladen og Cloud Functions.
 * Beløb er positive størrelser i øre; dokumenttypen bærer fortegnet. */

const heltal = (v) => Number.isSafeInteger(v);
const linjeBeloeb = (linje) => heltal(linje?.beloebOere)
  ? linje.beloebOere
  : Math.round(((linje?.antal || 0) * (linje?.satsOere || 0)) / 1000);
const linjeMoms = (linje, beloeb) => heltal(linje?.momsOere)
  ? linje.momsOere
  : Math.round((beloeb * Number(linje?.momssats || 0)) / 100);

export const KREDIT_RESERVERER = Object.freeze([
  "kladde", "frigivet", "arbejder", "bogfoert", "sendt", "ukendt_udfald", "handling_pakraevet",
]);

export function kreditlinjeFraKilde(kildelinje, indeks, antal) {
  const kildeAntal = kildelinje?.antal;
  if (!heltal(kildeAntal) || kildeAntal <= 0 || !heltal(antal) || antal <= 0 || antal > kildeAntal) {
    throw new Error(`Kreditmængden på linje ${indeks + 1} er ugyldig.`);
  }
  const fuldtBeloeb = linjeBeloeb(kildelinje);
  const fuldMoms = linjeMoms(kildelinje, fuldtBeloeb);
  const beloebOere = antal === kildeAntal ? fuldtBeloeb : Math.round((fuldtBeloeb * antal) / kildeAntal);
  const momsOere = antal === kildeAntal ? fuldMoms : Math.round((fuldMoms * antal) / kildeAntal);
  return {
    kildeIndeks: indeks, kildeNoegle: kildelinje.kildeNoegle || `linje-${indeks + 1}`,
    navn: kildelinje.navn || kildelinje.modulId || `Linje ${indeks + 1}`,
    enhed: kildelinje.enhed || null, antal, kildeAntal,
    satsOere: kildelinje.satsOere, momssats: kildelinje.momssats,
    beloebOere, momsOere, ialtOere: beloebOere + momsOere,
  };
}

export function summerKreditlinjer(linjer) {
  return (linjer || []).reduce((sum, linje) => ({
    beloebOere: sum.beloebOere + linje.beloebOere,
    momsOere: sum.momsOere + linje.momsOere,
    ialtOere: sum.ialtOere + linje.ialtOere,
  }), { beloebOere: 0, momsOere: 0, ialtOere: 0 });
}

export function reserveretKredit(poster) {
  const aktive = Object.values(poster || {}).filter((post) => KREDIT_RESERVERER.includes(post?.status));
  const perLinje = {};
  let ialtOere = 0;
  for (const post of aktive) {
    ialtOere += Number(post?.snapshot?.ialtOere || post?.ialtOere || 0);
    for (const linje of post?.snapshot?.linjer || post?.linjer || []) {
      perLinje[linje.kildeIndeks] = (perLinje[linje.kildeIndeks] || 0) + Number(linje.antal || 0);
    }
  }
  return { ialtOere, perLinje, antal: aktive.length };
}

export function byggKreditsnapshot({ faktura, valg, aarsag, kreditId, oprettetMs, oprettetAf }) {
  if (!faktura?.sha256 || faktura?.version !== 1 || !Array.isArray(faktura.linjer)) {
    throw new Error("Den frosne fakturaversion mangler.");
  }
  const linjer = (valg || []).map((v) => {
    if (!heltal(v?.kildeIndeks) || !faktura.linjer[v.kildeIndeks]) throw new Error("En valgt fakturalinje findes ikke.");
    return kreditlinjeFraKilde(faktura.linjer[v.kildeIndeks], v.kildeIndeks, v.antal);
  });
  if (!linjer.length) throw new Error("Vælg mindst én linje til kreditering.");
  const totaler = summerKreditlinjer(linjer);
  return {
    version: 1, type: "kreditnota", kreditId,
    originalFaktura: {
      forretningsnoegle: faktura.forretningsnoegle, periode: faktura.periode,
      kundeId: faktura.kundeId, version: faktura.version, sha256: faktura.sha256,
      beloebOere: faktura.beloebOere, momsOere: faktura.momsOere, ialtOere: faktura.ialtOere,
    },
    valuta: "DKK", aarsag, modtager: faktura.modtager, linjer, ...totaler,
    oprettetMs, oprettetAf,
  };
}

export function validerKreditModResterende(faktura, poster, snapshot, ignorerId = null) {
  const andre = Object.fromEntries(Object.entries(poster || {}).filter(([id]) => id !== ignorerId));
  const reserveret = reserveretKredit(andre);
  const fejl = [];
  for (const linje of snapshot?.linjer || []) {
    const kilde = faktura?.linjer?.[linje.kildeIndeks];
    const tilbage = Number(kilde?.antal || 0) - Number(reserveret.perLinje[linje.kildeIndeks] || 0);
    if (linje.antal > tilbage) fejl.push(`${linje.navn}: højst ${tilbage / 1000} kan krediteres.`);
  }
  const restIaltOere = Number(faktura?.ialtOere || 0) - reserveret.ialtOere;
  if (snapshot?.ialtOere > restIaltOere) fejl.push("Kreditnotaen overstiger fakturaens resterende beløb.");
  return { ok: fejl.length === 0, fejl, reserveretIaltOere: reserveret.ialtOere, restIaltOere };
}
