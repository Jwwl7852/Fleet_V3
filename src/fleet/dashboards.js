/* src/fleet/dashboards.js
 * Hvilke dashboards der findes, og hvad hvert kort viser. INGEN REACT.
 *
 * Opdelingen er den samme som i gitter.js og driftskalender.js: node kan ikke
 * indlæse .jsx, så lå katalogret i skærmen, kunne det ikke prøves — og det her
 * katalog er netop dét der skal kunne holdes op mod `kpi/`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ HVERT TAL PÅ ET DASHBOARD ER ET FELT I kpi/ — INTET ANDET.
 *
 * Beslutning 6: nøgletal kommer fra én aggregeret node. Undtagelsen i
 * CLAUDE.md — "er tallet AFLEDT af data skærmen allerede har, så beregn det
 * hos forbrugeren" — gælder IKKE her, og grunden er værd at holde fast i:
 *
 *   Driftskalenderen henter selv `opgaver` og kan tælle dem. Dashboardet
 *   henter INGEN moduldata. Det viser Warehouse ved siden af Facility ved
 *   siden af Procure, og skulle det udlede tallene, måtte det hente alle seks
 *   modulers noder ned på hver visning. Det er præcis den aggregerede node
 *   findes for.
 *
 * Derfor står feltstien på hvert kort herunder, og en prøve holder dem op mod
 * demo-kpi.js. Et kort der peger på et felt der ikke findes, ville skrive
 * INTET (—) i tavshed, og "—" ligner et tal der ikke er regnet frem for en
 * skrivefejl i en sti.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ TO MODULER HAR IKKE DERES TAL ENDNU, OG DE SIGER DET SELV.
 * `warehouse` har ÉT felt i kpi/, `unitbooking` har ingen. Deres kort er ikke
 * udeladt og ikke fyldt med hardkodede tal — de bærer `mangler` og skriver på
 * skærmen hvilke felter der skal beregnes. Et udeladt kort ser ud som et modul
 * der ikke findes; et hardkodet tal ser ud som en måling. Se README's
 * KPI-efterslæb.
 */

/* ---- Dashboards -------------------------------------------------------- */

/**
 * ⚠ NØGLEN ER MODULETS, IKKE ET NYT NAVN. `flaade`, ikke `fleet`.
 * Dashboardet skal kunne filtreres med harModul(), og det slår op på
 * modulnøglen. Et eget navnerum her ville betyde en oversættelsestabel mere,
 * og den slags driver — se moduler.js' egen note om navn mod nøgle.
 *
 * `samlet` er ikke et modul. Den står med `altid: true`, fordi den er
 * SAMLINGEN og ikke en af delene.
 */
export const SAMLET = "samlet";

export const DASHBOARDS = [
  {
    key: SAMLET,
    label: "Samlet dashboard",
    under: "Ét samlet overblik på tværs af alle moduler",
    altid: true,
  },
  /* ⚠ SKIVE 2C — KORREKTION 6. Planning manglede her, selvom et ægte,
     ikke-null KPI-domæne (`disponering`, kilde `etaper`, beregnet af
     disponeringstal()) fandtes hele tiden. Se dashboards.js's KPI-note
     nedenfor om hvorfor NØGLEN er "booking" og ikke "disponering". */
  { key: "booking", label: "Planning", under: "Bookinger, forslag og disponering der kræver handling" },
  { key: "flaade", label: "Fleet", under: "Enheder, service og vedligehold" },
  { key: "facility", label: "Facility", under: "Ejendomme, service og opgaver" },
  { key: "indkoeb", label: "Procure", under: "Indkøb, leverandører og fakturaer" },
  { key: "warehouse", label: "Warehouse", under: "Lagerbeholdning og varestyring" },
  /* ⚠ "Unitbooking", IKKE "UnitBooking". Modulet hedder det ene sted, og
     prøven holder katalogerne op mod hinanden — to stavemåder af et
     modulnavn er to steder det kan rettes. */
  { key: "unitbooking", label: "Unitbooking", under: "Reserverbare kasser og udstyr" },
  { key: "bemanding", label: "Workforce", under: "Kapacitet, vagter og bemanding" },
];

export const ALLE_DASHBOARDS = DASHBOARDS.map((d) => d.key);

/**
 * Hvilke dashboards en kunde kan vælge imellem.
 *
 * ⚠ MODULET AFGØR DET, IKKE BRUGEREN — endnu. Billede 3 i mockuppen giver
 * administratoren en afkrydsning pr. bruger, og den kommer i sin egen etape
 * sammen med rollemodellen. Indtil da er svaret det samme som sidebarens: man
 * ser de moduler kunden har købt. To forskellige svar på "hvad må jeg se"
 * ville være to steder at være uenige.
 */
export const tilgaengelige = (harModulFn) =>
  DASHBOARDS.filter((d) => d.altid || harModulFn(d.key));

/* ---- Kortene ----------------------------------------------------------- */

/**
 * Et modulkort: tre tal og en overskrift.
 *
 * `felt` er stien ind i `kpi/` — "flaade.udeAfDrift". Den slås op med
 * `kpiVaerdi()` nedenfor, og en prøve holder hver eneste sti op mod
 * demo-kpi.js.
 *
 * `form` siger hvordan tallet skrives: "antal" | "pct" | "kr". Uden den ville
 * skærmen skulle vide at `nedetidPct` er en procent og `braendstofOere` er
 * øre — og den slags viden spreder sig til hver forbruger.
 *
 * `tone` er en IKONACCENT og ikke en statusfarve. Se beslutning 30.
 */
export const MODULKORT = {
  /* ⚠ SKIVE 2C — TRE FELTER, ALLE FRA disponeringstal() I kpi-aggregering.js,
     VERIFICERET FØR IMPLEMENTERING. `ledigKapacitetPct` er MED VILJE ikke
     med — den er `null` for enhver tenant, fordi spørgsmålet "ledig i hvilken
     periode, målt i hvad" ikke er stillet færdigt (se funktionens egen note).
     Et kort med et felt der ALTID er streget ud, ville ikke være et
     nøgletal — det ville være en påstået måling af noget der aldrig
     regnes. De tre der ER med, kommer alle fra ægte, allerede eksisterende
     kilder: åbne (uplanlagte) etaper, disponeringskonflikter (samme
     tjekDisponering() som Disponering-skærmen selv bruger) og
     forsinkelsesrisiko (ETA efter fristen). Ingen ny aggregator, ingen
     demodata. */
  booking: {
    tone: "ikon-5", ikon: "kalender", sti: "/booking",
    tal: [
      { felt: "disponering.aabneEtaper", label: "Mangler plan", form: "antal" },
      { felt: "disponering.konflikter", label: "Disponeringskonflikter", form: "antal" },
      { felt: "disponering.forsinkelsesrisiko", label: "Forsinkelsesrisiko", form: "antal" },
    ],
  },
  flaade: {
    tone: "ikon-5", ikon: "lastbil", sti: "/flaade",
    tal: [
      { felt: "flaade.udeAfDrift", label: "Enheder ude af drift", form: "antal" },
      { felt: "flaade.serviceInden30", label: "Service forfalder (30 dage)", form: "antal" },
      { felt: "opgaver.aabne", label: "Åbne opgaver", form: "antal" },
    ],
  },
  facility: {
    tone: "ikon-4", ikon: "bygning", sti: "/facility",
    tal: [
      { felt: "facility.aabneFejl", label: "Fejl og mangler", form: "antal" },
      { felt: "facility.servicepunkterForfalder", label: "Kommende servicebesøg", form: "antal" },
      { felt: "facility.klimaalarmerIDag", label: "Klimaalarm", form: "antal" },
    ],
  },
  indkoeb: {
    tone: "ikon-2", ikon: "vogn", sti: "/indkoeb",
    tal: [
      { felt: "indkoeb.fakturaerTilGodkendelse", label: "Fakturaer til godkendelse", form: "antal" },
      { felt: "indkoeb.aabneOrdrer", label: "Åbne ordrer", form: "antal" },
      { felt: "indkoeb.indkoebsprisafvigelser", label: "Prisafvigelser", form: "antal" },
    ],
  },
  bemanding: {
    /* ⚠ STIEN VAR "/bemanding" OG ER RETTET TIL "/bemanding/kompetencer".
       Skive 1 gjorde Bemandingsplan til LATER (skjulINav) og repointede
       Workforce-gruppens EGEN sti i nav.js af samme grund — men kortet her
       blev ikke rettet i samme ombæring, og pegede derfor ind på den skjulte
       "ikke en del af V1 endnu"-stub. Rettet nu, fordi denne skive alligevel
       rører kataloget. */
    tone: "ikon-6", ikon: "personer", sti: "/bemanding/kompetencer",
    tal: [
      /* ⚠ KAPACITETSGRADEN ER AFLEDT, OG DEN REGNES HOS FORBRUGEREN.
         disponeret/planlagt — begge felter står i kpi/. Et gemt
         `kapacitetPct` ville drive fra sit grundlag første gang kun det ene
         blev rettet; det er præcis fejlen i `bemanding.ledig`. */
      { afledt: "kapacitet", label: "Kapacitetsgrad", form: "pct" },
      { felt: "bemanding.underbemandede", label: "Underbemandede vagter", form: "antal" },
      { afledt: "ledig", label: "Ledige kapaciteter", form: "antal" },
    ],
  },

  /* ⚠ DE TO HER HAR INGEN TAL ENDNU — OG DE SIGER DET.
     Kortet tegnes, men i stedet for tal står der hvilke felter der skal
     beregnes. Et udeladt kort ser ud som et modul der ikke findes; et
     hardkodet tal ser ud som en måling. Se README's KPI-efterslæb.

     ⚠ OG DE HØRER IKKE I udenKilde(). Den liste er snævret ind til ÉT
     spørgsmål — kan flåden og bemandingen deles på division — og en prøve
     håndhæver det. Warehouse og UnitBooking mangler noget tredje: noden
     findes, dataene er seedet, aggregeringen regner bare ikke feltet endnu.
     Blandes de to, holder man op med at kunne læse efterslæbet. */
  warehouse: {
    tone: "ikon-3", ikon: "kasse", sti: "/warehouse",
    mangler: ["warehouse.belaegningsgradPct", "warehouse.indlagteVarer",
              "warehouse.lavLagerbeholdning"],
    hvorfor: "Noden og dataene findes — aggregeringen regner ikke tallene endnu. " +
             "De hører i kpi/ og ikke hos forbrugeren: Dashboardet henter ingen " +
             "lagerdata og kan derfor ikke udlede dem.",
  },
  unitbooking: {
    tone: "ikon-1", ikon: "kalender", sti: "/unitbooking",
    mangler: ["unitbooking.reserveredeKasser", "unitbooking.kommendeKlargoeringer",
              "unitbooking.returneringerForsinket"],
    hvorfor: "Modulet har ingen felter i kpi/ overhovedet. Kasserne og udlånene " +
             "er seedet, så det er aggregeringen der mangler — ikke dataene.",
  },
};

/**
 * kpiVaerdi(kpi, "flaade.udeAfDrift") → tallet, eller null.
 *
 * ⚠ null OG IKKE undefined, OG IKKE 0. Et felt der ikke findes, og et felt der
 * er null, skal svare det samme: skærmen skriver INTET (—) for begge. Svarede
 * den `undefined` for en forkert sti, ville en tastefejl i katalogret se ud
 * som et ubesvaret nøgletal — og det er den ene fejl man ikke opdager, fordi
 * den ligner en tilstand systemet har med vilje.
 *
 * Prøven holder hver sti op mod demo-kpi.js, så en tastefejl fælder den dér i
 * stedet.
 */
export function kpiVaerdi(kpi, sti) {
  if (!kpi || typeof sti !== "string") return null;
  const v = sti.split(".").reduce((o, n) => (o == null ? o : o[n]), kpi);
  return v === undefined ? null : v;
}

/**
 * kapacitetsgrad(kpi) → procent, eller null.
 *
 * ⚠ REGNET HOS FORBRUGEREN, IKKE GEMT. Og gaten står FØR regnestykket:
 * `null / 58 * 100` er 0, ikke null — et regnestykke på null giver stille et
 * tal, og 0 % kapacitet ligner en måling af en flåde der står stille. Se
 * noten ved deviationPct() i format.js.
 */
export function kapacitetsgrad(kpi) {
  const d = kpi?.bemanding?.disponeret;
  const p = kpi?.bemanding?.planlagt;
  if (!Number.isFinite(d) || !Number.isFinite(p) || p === 0) return null;
  return (d / p) * 100;
}

/**
 * ledig(kpi) → antal, eller null.
 *
 * ⚠ DEN VAR ET GEMT FELT I `kpi/`, og den var husets navngivne eksempel på
 * fejlen: et gemt afledt tal driver fra sit grundlag. Ni steder i koden
 * henviser til "bemanding.ledig" som DEN kendte fejl — og feltet lå der
 * stadig. Nu regnes den her, af de to tal den er forskellen mellem.
 *
 * ⚠ GATEN STÅR FØR SUBTRAKTIONEN, ikke efter. `null - 48` er −48 og
 * `58 - null` er 58 — begge ser ud som MÅLINGER, og `num()` når aldrig at
 * skrive INTET, fordi tallet er blevet rigtigt på vejen. Samme fælde som
 * beslutning 67 fandt i dækningsgradsafvigelsen.
 *
 * ⚠ OG DEN ER null I DAG, fordi `planlagt` er det: der findes ingen vagtplan
 * (beslutning 69). Det er det rigtige svar — "ledig kapacitet" uden at vide
 * hvor mange der var på vagt, er ikke et tal, det er et gæt.
 */
export function ledig(kpi) {
  const p = kpi?.bemanding?.planlagt;
  const d = kpi?.bemanding?.disponeret;
  if (!Number.isFinite(p) || !Number.isFinite(d)) return null;
  return p - d;
}

/**
 * De afledte tal, slået op på samme måde som felterne. Ét sted.
 *
 * ⚠ OG KATALOGET I widgets.js BRUGER DET SAMME. Ellers ville en widget og et
 * modulkort med samme navn kunne regne hver sin vej — 84 mod 83 i ny
 * forklædning, og det er netop den fejl den her afledning findes for at rette.
 */
export const AFLEDT = { kapacitet: kapacitetsgrad, ledig };

/**
 * kortTal(kpi, post) → { label, vaerdi, form }
 *
 * Ét opslag for begge slags tal, så skærmen ikke skal kende forskellen på et
 * felt og en afledning.
 */
export function kortTal(kpi, post) {
  const vaerdi = post.afledt
    ? (AFLEDT[post.afledt]?.(kpi) ?? null)
    : kpiVaerdi(kpi, post.felt);
  return { label: post.label, form: post.form, vaerdi };
}

/* ---- Prioriterede handlinger ------------------------------------------- */

/**
 * ⚠ HANDLINGERNE ER DE SAMME TAL SOM KORTENE — ikke en anden tælling.
 *
 * Mockuppens liste siger "7 enheder står uden for drift" ved siden af et
 * Fleet-kort der siger 7. Kom de to fra hver sin kilde, kunne de sige hver
 * sit på samme skærm, og det er beslutning 6's fejl inden for én visning.
 *
 * `graense` er hvornår rækken overhovedet vises: nul forsinkede opgaver er
 * ikke en handling. `prioritet` bruger det DELTE katalog i prioritet.js —
 * et fjerde ordforråd for "hvor travlt" ville være det femte i repoet.
 */
export const HANDLINGER = [
  { key: "udeAfDrift", felt: "flaade.udeAfDrift", modul: "flaade",
    tekst: "enheder står uden for drift", hvorfor: "Påvirker drift og planlagte leverancer",
    ikon: "lastbil",
    prioritet: "hoej", sti: "/opsaetning/enheder", graense: 1 },
  { key: "klimaalarm", felt: "facility.klimaalarmerIDag", modul: "facility",
    tekst: "klimaalarmer er aktive", hvorfor: "Kræver hurtig handling",
    ikon: "termometer",
    prioritet: "hoej", sti: "/facility/klima", graense: 1 },
  { key: "forsinkede", felt: "opgaver.forsinkede", modul: "flaade",
    tekst: "opgaver er forsinkede", hvorfor: "Slutningen ligger bag os",
    ikon: "ur",
    prioritet: "hoej", sti: "/flaade/koe?vis=forsinkede", graense: 1 },
  /* ⚠ SKIVE 2C — Korrektion 6's Planning-dashboard, samme tre felter som
     MODULKORT.booking. `konflikter` og `forsinkelsesrisiko` bruger
     tjekDisponering()/ETA-mod-frist — den SAMME funktion som Disponering
     og etapeskift håndhæver med, ikke en ny tælling. */
  { key: "disponeringskonflikter", felt: "disponering.konflikter", modul: "booking",
    tekst: "etaper har en disponeringskonflikt", hvorfor: "Kan ikke udføres som planlagt",
    ikon: "advarsel",
    prioritet: "hoej", sti: "/booking/disponering", graense: 1 },
  { key: "planningForsinkelsesrisiko", felt: "disponering.forsinkelsesrisiko", modul: "booking",
    tekst: "ture har forsinkelsesrisiko", hvorfor: "ETA'en ligger efter fristen",
    ikon: "ur",
    prioritet: "hoej", sti: "/booking/live-kort", graense: 1 },
  { key: "fakturaer", felt: "indkoeb.fakturaerTilGodkendelse", modul: "indkoeb",
    tekst: "fakturaer venter på godkendelse", hvorfor: "Forfalder inden for 2 dage",
    ikon: "seddel",
    prioritet: "normal", sti: "/indkoeb/fakturaer", graense: 1 },
  { key: "service", felt: "facility.servicepunkterForfalder", modul: "facility",
    tekst: "servicepunkter forfalder", hvorfor: "Planlæg inden fristen",
    ikon: "skruenoegle",
    prioritet: "normal", sti: "/facility/servicekalender", graense: 1 },
  { key: "aabneEtaper", felt: "disponering.aabneEtaper", modul: "booking",
    tekst: "etaper mangler en plan", hvorfor: "Afventer en tur",
    ikon: "kalender",
    prioritet: "normal", sti: "/booking/disponering", graense: 1 },
  { key: "nyeIndberetninger", felt: "flaade.nyeIndberetninger", modul: "flaade",
    tekst: "nye indberetninger er ikke vurderet", hvorfor: "Prioriteten sættes i triagen",
    ikon: "dokument",
    prioritet: "lav", sti: "/flaade/koe?vis=nye", graense: 1 },
];

/**
 * handlinger(kpi, { harModulFn }) → de rækker der faktisk kræver handling.
 *
 * ⚠ ET UBESVARET FELT ER IKKE NUL, OG DET GIVER IKKE EN RÆKKE.
 * `null >= 1` er false i JavaScript, men det er held og ikke en beslutning —
 * `null >= 0` er true. Gaten står derfor eksplicit på Number.isFinite(), så
 * en ændring i grænsen ikke pludselig lader ubesvarede felter blive til
 * handlinger nogen skal reagere på.
 *
 * ⚠ OG ET MODUL KUNDEN IKKE HAR, GIVER INGEN HANDLING. Ellers stod der
 * "5 fakturaer venter" hos en vognmand der ikke har købt Procure — med et
 * link til en skærm han ikke kan åbne.
 */
export function handlinger(kpi, { harModulFn = () => true } = {}) {
  const ud = [];
  for (const h of HANDLINGER) {
    if (!harModulFn(h.modul)) continue;
    const n = kpiVaerdi(kpi, h.felt);
    if (!Number.isFinite(n) || n < h.graense) continue;
    ud.push({ ...h, antal: n });
  }
  return ud;
}
