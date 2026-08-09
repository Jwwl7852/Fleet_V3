/* src/fleet/integrationer.js
 * Integrationer. BESLUTNING 22.
 *
 * INGEN IMPORTS.
 *
 * ⚠ KUN DET DER FINDES, MED RIGTIG STATUS. INGEN "COMING SOON".
 *
 * Listen herunder er tom, og det er det ærlige indhold: der er ingen
 * integrationer bygget.
 *
 * En side med logoer for HERE, DKV, e-conomic og en tachografleverandør —
 * mærket "kommer snart" — læses som partnerskaber der findes. Den er hverken
 * sand eller nyttig, og den koster troværdighed præcis når man har mest brug
 * for den: hos den kunde der spørger hvad platformen KAN, ikke hvad den vil
 * kunne. Samme fejlklasse som et nøglefelt til noget der ikke aflæses.
 *
 * Vejkortet findes — det hører bare ikke på en kundevendt skærm. Det står i
 * README og i FleetControl-spoergsmaal.md, hvor det kan bære forbehold og
 * åbne spørgsmål uden at ligne et løfte.
 *
 * Når den første integration bygges, tilføjes den HER med status `idrift` og
 * de felter der faktisk kan aflæses — sidste synkronisering, fejl, hvem der
 * har forbundet den.
 */

export const INTEGRATION_STATUS = {
  idrift:     { label: "I drift",        pill: "ok"   },
  fejl:       { label: "Fejl",           pill: "bad"  },
  konfigurer: { label: "Ikke forbundet", pill: "warn" },
};

/**
 * Bygget og forbundet. TOM MED VILJE — se noten ovenfor.
 *
 * Formen er hvad en integration der virker, skal kunne fortælle:
 *
 *   { id, navn, kategori, status, forbundetAf, forbundetMs,
 *     sidsteSynkMs, sidsteFejl }
 */
export const INTEGRATIONER = [];

export const antalIDrift = () =>
  INTEGRATIONER.filter((i) => i.status === "idrift").length;
