/* Mindste rene providerstruktur: samler allerede indlæste snapshots.
 * Ingen persistence, cache eller netværk.
 */
import {
  AARSAGSKODE, KILDE, REGELNIVEAU, referenceNoegle, resultat,
} from "../planning-basic.js";

const FELTER = ["opgaver", "opgaveforekomster", "ressourcer", "kunder", "lokationer", "dagsplaner", "transportprojektioner"];

export function opretStatiskPlanningProvider({ id, kilde, snapshot }) {
  if (!id || !Object.values(KILDE).includes(kilde)) throw new Error("Provider kræver stabilt id og kendt kilde.");
  return Object.freeze({ id, kilde, hentSnapshot: () => snapshot });
}

export function samlProviderSnapshots(providers = []) {
  const snapshot = Object.fromEntries(FELTER.map((felt) => [felt, []]));
  const fund = [];
  const sete = new Map();
  for (const provider of providers) {
    const data = provider.hentSnapshot();
    if (provider.kilde !== KILDE.PLANNING && ["opgaver", "opgaveforekomster", "dagsplaner"].some((felt) => (data?.[felt] || []).length)) {
      fund.push({
        kode: AARSAGSKODE.REFERENCE_EJERSKAB_UKLART,
        tekst: `Provideren ${provider.id} må ikke levere Planning-ejede aggregater som ${provider.kilde}.`,
        niveau: REGELNIVEAU.HARD,
        sti: `providers.${provider.id}`,
        objektId: provider.id,
        objektReference: null,
        reference: `${AARSAGSKODE.REFERENCE_EJERSKAB_UKLART}:${provider.id}:planning-aggregat`,
      });
    }
    for (const felt of FELTER) snapshot[felt].push(...(data?.[felt] || []));
    const objekter = [
      ...(data?.opgaver || []), ...(data?.ressourcer || []),
      ...(data?.kunder || []), ...(data?.lokationer || []),
      ...(data?.dagsplaner || []).flatMap((d) => d.ruter || []),
      ...(data?.transportprojektioner || []),
    ];
    for (const objekt of objekter) {
      const ref = objekt?.reference;
      const noegle = referenceNoegle(ref);
      if (!noegle) continue;
      if (ref.kilde !== provider.kilde) {
        fund.push({
          kode: AARSAGSKODE.REFERENCE_EJERSKAB_UKLART,
          tekst: `Provideren ${provider.id} erklærer ${provider.kilde}, men leverer ${noegle}.`,
          niveau: REGELNIVEAU.HARD,
          sti: `providers.${provider.id}`,
          objektId: provider.id,
          objektReference: ref,
          reference: `${AARSAGSKODE.REFERENCE_EJERSKAB_UKLART}:${provider.id}:${noegle}`,
        });
      }
      if (sete.has(noegle)) {
        fund.push({
          kode: AARSAGSKODE.REFERENCE_DUBLET,
          tekst: `Den typed reference ${noegle} leveres mere end én gang.`,
          niveau: REGELNIVEAU.HARD,
          sti: `providers.${provider.id}`,
          objektId: provider.id,
          objektReference: ref,
          reference: `${AARSAGSKODE.REFERENCE_DUBLET}:${noegle}:providers`,
        });
      } else sete.set(noegle, provider.id);
    }
  }
  return { ...resultat(fund), snapshot };
}
