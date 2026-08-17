/* src/fleet/reolplads.js
 * Hvad står der på hylden? ÉT svar, tre kilder.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR FILEN FINDES
 *
 * `reolpladser` er husets ene reolstruktur og deles af to moduler
 * (WAREHOUSE.md punkt 3.3). Der står TO slags ting på en plads:
 *
 *   · kasser              Turtlebooking — transportkasser til udlån
 *   · carriers            Warehouse — beholdere med kundens gods
 *
 * ⚠ OG GODSET STÅR IKKE PÅ HYLDEN. Efter etape 12 ligger hver eneste
 * beholdningspost i en CARRIER, og carrieren står på pladsen. Varelinjerne
 * opgøres derfor gennem to led — de tælles med, fordi de siger hvad der er i
 * det der står der, men de kan ikke selv pege på en hylde.
 *
 * Indtil etape 11 regnede `Lokationer.jsx` belægningen som antallet af
 * beholdningsposter alene. Den var allerede blind for kasserne. En hylde der
 * ser fri ud men ikke er det, sender nogen op ad stigen forgæves — og værre:
 * en placering bliver foreslået til en plads der er fysisk optaget.
 *
 * Det er `bemanding.ledig` og divisionsfilteret der stod to steder: samme
 * kendsgerning opgjort flere steder driver, og ingen af skærmene kan se at de
 * er uenige. Derfor ÉT sted.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR DEN IKKE SPØRGER OM STATUS
 *
 * Belægningen tæller det der SIGER at det står på pladsen — altså har
 * `pladsId` — og ikke det der har en bestemt status. Den skelnen er ikke
 * dovenskab, den er invarianten:
 *
 *   · en udlånt kasse har ingen `pladsId` (turtlebooking.js + reglerne)
 *   · en carrier i transit har ingen `pladsId` (warehouse.js + reglerne)
 *
 * Begge dele håndhæves i `firebase.rules.json`, ikke kun i en formular. Skulle
 * den her fil selv kende de to statuslister, ville de findes tre steder — og
 * den tredje kopi er altid den der glemmes, når en status kommer til.
 *
 * INGEN IMPORTS. Som permissions.js, moduler.js, beloeb.js og steder.js —
 * så den kan kopieres til `functions/delt/`, når den Cloud Function der
 * flytter en carrier, får brug for den.
 * ---------------------------------------------------------------------------
 */

/** Det der står på pladsen, opdelt efter hvor det kommer fra. */
export function belaegningPaaPlads(
  { beholdning = [], kasser = [], carriers = [] } = {}, pladsId
) {
  if (!pladsId) {
    return { varelinjer: 0, kasser: 0, carriers: 0, ialt: 0, optaget: false };
  }

  /* ⚠ TO LED. Beholdningsposten peger på en CARRIER, og carrieren peger på
     pladsen. Gemte posten også en pladsId, ville de to drive fra hinanden
     første gang nogen flyttede beholderen — og hylden ville vise varer der
     fysisk stod et andet sted. */
  const staarHer = new Set(
    carriers.filter((c) => c.pladsId === pladsId).map((c) => c.id));
  const varelinjer = beholdning.filter(
    (b) => staarHer.has(b.carrierId) && (b.antal ?? b.maengde ?? 0) !== 0
  ).length;
  const kasseAntal = kasser.filter((k) => k.pladsId === pladsId).length;
  const carrierAntal = staarHer.size;

  const ialt = varelinjer + kasseAntal + carrierAntal;
  return {
    varelinjer,
    kasser: kasseAntal,
    carriers: carrierAntal,
    ialt,
    optaget: ialt > 0,
  };
}

/**
 * Er pladsen fri?
 *
 * ⚠ EN LUKKET ELLER KARANTÆNERAMT PLADS ER IKKE "FRI", selv om der ikke står
 * noget. `PLADS_STATUS` afgør om der må plukkes FRA den; her afgøres om der
 * må sættes noget PÅ den. Statusnavnene sendes med som en liste frem for at
 * blive slået op, så filen bliver ved med at være importfri — kalderen
 * kender `ALLE_PLADS_STATUS` i forvejen.
 */
export function pladsErLedig(plads, belaegning, { brugbareStatus = ["aktiv"] } = {}) {
  if (!plads) return false;
  const status = plads.status ?? "aktiv";
  if (!brugbareStatus.includes(status)) return false;
  return !belaegning?.optaget;
}

/**
 * Belægningen for hele lageret på én gang.
 *
 * Ét gennemløb pr. kilde frem for ét pr. plads: med tusind pladser og ti
 * tusind beholdningsposter er forskellen mellem et opslag og en scanning
 * synlig i browseren.
 */
export function belaegningPrPlads({ beholdning = [], kasser = [], carriers = [] } = {}) {
  const ud = {};
  const tael = (id, felt) => {
    if (!id) return;
    if (!ud[id]) ud[id] = { varelinjer: 0, kasser: 0, carriers: 0, ialt: 0, optaget: false };
    ud[id][felt] += 1;
    ud[id].ialt += 1;
    ud[id].optaget = true;
  };

  /* Hvor står hver carrier? Ét opslag, så beholdningen kan tælles i ét
     gennemløb frem for ét pr. post. */
  const pladsFor = new Map(carriers.map((c) => [c.id, c.pladsId]));

  for (const k of kasser) tael(k.pladsId, "kasser");
  for (const c of carriers) tael(c.pladsId, "carriers");
  for (const b of beholdning) {
    if ((b.antal ?? b.maengde ?? 0) === 0) continue;
    /* ⚠ EN POST I EN CARRIER UDEN LOKATION TÆLLER INGEN STEDER. Det er de
       "uden lokation" på planchen: godset findes, men hylden gør ikke. Lagde
       vi dem på en tilfældig plads, ville belægningen se rigtig ud og være
       forkert. */
    tael(pladsFor.get(b.carrierId), "varelinjer");
  }

  return ud;
}
