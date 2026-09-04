/* src/fleet/modulfaner.js
 * Modulnavigation — Fleet TARGET-restruktureringen (masterbrief §1,
 * produktejer-review 2026-09-01).
 *
 * ⚠ IKKE ET NYT ROUTINGSYSTEM. Hver `sti` er en EKSISTERENDE, kanonisk rute
 * (App.jsx), og listen her siger kun i hvilken rækkefølge modulets egne
 * arbejdsflader vises som en vandret fanebjælke øverst på hver af dem — se
 * `ModulNav` i ui.jsx. Sidebaren viser derfor kun modulet selv (ingen
 * undermenu), og navigation INDE i modulet sker via fanebjælken. Se nav.js's
 * `born`-liste for `flaade`, hvor børnene alle er `skjulINav: true` af netop
 * den grund.
 *
 * ⚠ ADMINISTRATIVE SKÆRME FLYTTES IKKE HERIND. Opsætning, leverandørmaster,
 * kunder, kategorier osv. bliver i den globale Administration/Opsætning —
 * kun "Enheder" står med her, fordi produktejeren eksplicit bad om den i
 * Fleets egen fanebjælke (samme rute, `/opsaetning/enheder`, uændret).
 */
export const FLEET_FANER = [
  { sti: "/flaade", label: "Overblik" },
  { sti: "/flaade/driftskalender", label: "Driftskalender" },
  { sti: "/flaade/indberetninger", label: "Indberetninger" },
  { sti: "/flaade/servicebog", label: "Servicebog" },
  { sti: "/opsaetning/enheder", label: "Enheder" },
  { sti: "/flaade/statistik", label: "Statistik" },
  { sti: "/flaade/kontakter", label: "Kontakter" },
];

/* ⚠ FACILITY TARGET (produktejer-review 2026-09-02) — samme mønster og samme
 * begrundelse som FLEET_FANER ovenfor. Fem faner, dokumenteret i
 * docs/product-redesign-v1/07_OLD_CURRENT_TARGET_FLEET_FACILITY_PROCURE_UNITBOOKING.md's
 * Facility-afsnit: `Overblik | Inventar | Service & reparation | Planlagt |
 * Statistik`. "Service & reparation" er filnavnet Servicekalender.jsx
 * UÆNDRET — kun ModulNav'en er ny på den skærm.
 *
 * ⚠ Klima & energi står IKKE med her. Den er eksplicit uden for FleetControl
 * V1 (se Klima.jsx's eget hoved og docs/product-redesign-v1/
 * 05_IMPLEMENTATION_SLICES.md, Skive 1) — en fane i bjælken ville love en
 * funktion der ikke er bygget.
 */
export const FACILITY_FANER = [
  { sti: "/facility", label: "Overblik" },
  { sti: "/facility/inventar", label: "Inventar" },
  { sti: "/facility/servicekalender", label: "Service & reparation" },
  { sti: "/facility/planlagt", label: "Planlagt" },
  { sti: "/facility/statistik", label: "Statistik" },
];

/* ⚠ PROCURE TARGET (produktejer-review 2026-09-02) — samme mønster, men
 * fanelisten er IKKE dokumentets ordret ("Overblik | Fakturaer | Arkiv |
 * Varer | Leverandører | Statistik"). Den er opdateret til arkitekturen som
 * den faktisk er i dag, besluttet i samme review:
 *
 * ⚠ INGEN Leverandører-fane. Leverandørkartoteket flyttede til en fælles
 * Administration-side (Skive 4B, Model B/Korrektion 3) — samme afgørelse
 * som Fleet/Facility begge allerede følger ved heller ikke at have deres
 * egen Leverandører-fane. Et link fra Overblik peger derhen i stedet.
 *
 * ⚠ INGEN Fakturaer-fane. Fakturaernes fulde liste, status og godkendelse
 * flyttede til det fælles Fakturacenter (Skive 4A). Procures eget —
 * matchet mod en bestilling, kontantkøb og brændstofmatch — findes stadig,
 * uændret, på `/indkoeb/fakturaer` (skjulINav: true), nået via et
 * kontekstuelt link fra Bestillinger. To fanebjælker der begge hedder
 * "Fakturaer" ville være netop den duplikering Skive 4A fjernede.
 *
 * ⚠ "Bestillinger" ER IKKE DEN GAMLE BESTILLINGER-SKÆRM. Den samler nu
 * Indkøbsbehov + Bestillingskladder + Godkendelse til ÉN arbejdsflade —
 * ordret det TARGET-dokumentets Overblik-wireframe bad om, bare under det
 * navn arbejdsfladen faktisk har. Overblik selv er en kompakt status- og
 * "næste handling"-visning, ikke arbejdsfladen.
 */
export const PROCURE_FANER = [
  { sti: "/indkoeb", label: "Overblik" },
  { sti: "/indkoeb/bestillinger", label: "Bestillinger" },
  { sti: "/indkoeb/varer", label: "Varer" },
  { sti: "/indkoeb/arkiv", label: "Arkiv" },
  { sti: "/indkoeb/statistik", label: "Statistik" },
];
