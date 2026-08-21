/* src/fleet/demo-oekonomi.js
 * Demo-data til Økonomi og Dashboard.
 *
 * ⚠ HVORFOR FILEN FINDES: de tre datasæt herunder lå som lokale konstanter i
 * moduler/Oekonomi.jsx. Dashboard skulle vise den samme månedsgraf, og en
 * kopi ville have været Bil 104 med to nummerplader igen — to datasæt der
 * ligner hinanden indtil den ene bliver rettet.
 *
 * ⚠ OG test/demo-kilder.test.mjs FANGEDE DEM IKKE. Den matcher kun
 * DEMO_[A-ZÆØÅ0-9_]+, og de hed KATEGORIER, DAEKNINGSGRAD_HISTORIK og
 * KLAR_TIL_FAKTURERING. Det blev løst ved at omdøbe på flytningen frem for at
 * udvide linten: hedder de DEMO_* og ligger i fleet/, dækker den eksisterende
 * prøve dem af sig selv.
 *
 * Alle beløb i ØRE, ekskl. moms (beslutning 2).
 */
import { DEMO_KPI } from "./demo-kpi.js";

const NU = Date.now();
const D = 86400000;

export const DEMO_OMKOSTNINGSKATEGORIER = [
  { id: "vaerksted", navn: "Værksted",
    faktiskOere: 24180000, budgetOere: 20500000, forrigeOere: 22890000,
    historik: [19450000, 21200000, 18900000, 22400000, 20100000, 23650000,
               19800000, 24900000, 21750000, 22300000, 22890000] },
  { id: "braendstof", navn: "Brændstof",
    faktiskOere: 31450000, budgetOere: 30200000, forrigeOere: 32100000,
    historik: [28900000, 30450000, 29100000, 31800000, 30900000, 32400000,
               29700000, 33100000, 30200000, 31050000, 32100000] },
  { id: "daek", navn: "Dæk",
    faktiskOere: 6840000, budgetOere: 5900000, forrigeOere: 6120000,
    historik: [5200000, 7400000, 4800000, 6100000, 5650000, 8200000,
               5400000, 6900000, 5950000, 6300000, 6120000] },
  { id: "forsikring", navn: "Forsikring",
    faktiskOere: 8560000, budgetOere: 9120000, forrigeOere: 8560000,
    historik: [9120000, 9120000, 9120000, 9120000, 8560000, 8560000,
               8560000, 8560000, 8560000, 8560000, 8560000] },
  { id: "oevrige", navn: "Øvrige",
    faktiskOere: 13231500, budgetOere: 11285500, forrigeOere: 12610000,
    historik: [10900000, 11450000, 12100000, 10750000, 11900000, 13200000,
               11600000, 12800000, 12050000, 12400000, 12610000] },
];
/* ⚠ HER LÅ TO HISTORIKKER, én pr. division. Aksen er væk (beslutning 70), og
   der er én. Bus-rækken er SLETTET og ikke flettet ind: den beskrev en
   forretning ingen abonnent har, og et gennemsnit af to sæt ville have været
   et tal ingen havde målt. */
export const DEMO_DAEKNINGSGRAD_HISTORIK = [68, 69, 71, 70, 67, 69, 73, 71, 70, 72, 71];
/* Månedsetiketter regnes ud fra i dag. setDate(1) først, ellers ruller
   31. august tilbage til 3. marts. Delt, så Dashboards seks måneder og
   Økonomis tolv er de samme måneder. */
export function maanedsEtiketter(antal = 12) {
  return Array.from({ length: antal }, (_, i) => {
    const d = new Date(NU);
    d.setDate(1);
    d.setMonth(d.getMonth() - (antal - 1 - i));
    return d.toLocaleDateString("da-DK", { month: "short" });
  });
}

/**
 * Kategorierne plus historikken summet til en total.
 *
 * ⚠ REGNESTYKKET LIGGER HER, IKKE I SKÆRMEN. Økonomi og Dashboard viser den
 * samme graf; lå summen to steder, kunne de vise hver sit.
 *
 * Sidste punkt er IKKE i historik — det er det aktuelle tal fra kpi/, så
 * grafen ender i samme tal som nøgletallet ovenover den.
 */
export function omkostningsserie() {
  const kategorier = DEMO_OMKOSTNINGSKATEGORIER.map(
    (c) => ({ id: c.id, navn: c.navn, ...c })
  );
  const historik = Array.from(
    { length: kategorier[0].historik.length },
    (_, i) => kategorier.reduce((s, c) => s + c.historik[i], 0)
  );
  return { kategorier, historik };
}

export const DEMO_KLAR_TIL_FAKTURERING = [
  { id: "BKG-2026-00118", kunde: "Nordisk Fragt A/S", afsluttetMs: NU - 24 * D, beloebOere: 4280000 },
  { id: "BKG-2026-00119", kunde: "Sydjysk Rutebiler A/S", afsluttetMs: NU - 21 * D, beloebOere: 1840000 },
  { id: "BKG-2026-00121", kunde: "Skagen Seafood ApS", afsluttetMs: NU - 19 * D, beloebOere: 3150000 },
  { id: "BKG-2026-00124", kunde: "Kolding Kommune", afsluttetMs: NU - 17 * D, beloebOere: 1260000 },
  { id: "BKG-2026-00126", kunde: "Fyn Køl & Frost A/S", afsluttetMs: NU - 15 * D, beloebOere: 2640000 },
  { id: "BKG-2026-00129", kunde: "Djurs Sommerland A/S", afsluttetMs: NU - 12 * D, beloebOere: 980000 },
  { id: "BKG-2026-00130", kunde: "Jysk Byggecenter A/S", afsluttetMs: NU - 11 * D, beloebOere: 2120000 },
  { id: "BKG-2026-00133", kunde: "Midtjyllands Turistbusser ApS", afsluttetMs: NU - 7 * D, beloebOere: 1420000 },
  { id: "BKG-2026-00134", kunde: "Hamburg Handel GmbH", afsluttetMs: NU - 8 * D, beloebOere: 1834000 },
];
/* Selvkontrol. Uden den opdages en drift mellem demo-sættene først når nogen
   kigger — og her ER invarianten den skærmen handler om: summerer
   kategorierne ikke til nøgletallet, siger tabellens rækker og dens totalrække
   hver sit. Den stod som en kommentar før; nu bliver den kontrolleret. */
if (import.meta.env?.DEV) {
  for (const division of ["gods", "bus"]) {
    const { kategorier } = omkostningsserie();
    const faktisk = kategorier.reduce((s, c) => s + c.faktiskOere, 0);
    const budget = kategorier.reduce((s, c) => s + c.budgetOere, 0);
    const kpi = DEMO_KPI[division].oekonomi;
    if (faktisk !== kpi.driftsomkostningerOere) {
      console.warn(
        `demo-oekonomi: ${division} kategorier summer til ${faktisk} øre, men ` +
        `kpi.oekonomi.driftsomkostningerOere er ${kpi.driftsomkostningerOere}. ` +
        `Totalrækken og nøgletallet ville sige hver sit.`
      );
    }
    if (budget !== kpi.budgetOere) {
      console.warn(
        `demo-oekonomi: ${division} budget summer til ${budget} øre, men ` +
        `kpi.oekonomi.budgetOere er ${kpi.budgetOere}.`
      );
    }
  }
}
