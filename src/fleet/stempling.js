/* src/fleet/stempling.js
 * Chaufførens ind- og udstempling. BESLUTNING 107.
 *
 * INGEN FIREBASE-IMPORT. Ren kerne — reglen, skærmen og en fremtidig
 * lønopgørelse skal regne det samme.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ HVORFOR NODEN HEDDER `stemplinger` OG IKKE NOGET PÆNERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * De to oplagte navne var taget, og det blev målt før en linje blev skrevet:
 *
 *   `vagter/`          er RESERVERET til en VAGTPLAN — hvem der er sat på
 *                      arbejde hvornår. Det står i demo-bemanding.js og i
 *                      kpi-aggregering.js: *"vagtplanen har ingen entitet
 *                      overhovedet; vagter/ står hverken i reglerne eller i
 *                      seedet."* En plan og en stempling er ikke det samme:
 *                      planen er hvad vi AFTALTE, stemplingen hvad der SKETE.
 *
 *   `tidsregistrering` er et FELT på en indberetning — ankomst og afgang på
 *                      et værkstedsbesøg (FELT.tidsregistrering).
 *
 * Det er tredje gang i dette repo at to ting er ved at hedde det samme —
 * `lagre` mod `lager`, `bookinger` mod `bookings`, `warehouse` mod
 * `warehouse` — og det er den fejl der har kostet mest. Navnet siger derfor
 * hvordan posten OPSTÅR: nogen har stemplet.
 *
 * ⚠ OG ARBEJDSTIDEN REGNES AF DEM, DEN GEMMES IKKE. En post bærer `indMs` og
 * `udMs`; minutterne udledes. Et gemt `minutter` ville drive fra sit grundlag
 * første gang nogen rettede et tidspunkt — det var fejlen i `bemanding.ledig`,
 * omgjort i beslutning 71.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠ INGEN POSITION — ENDNU, OG DET ER ET ÅBENT SPØRGSMÅL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Specifikationens kort siger *"Din position registreres, så tiden er
 * dokumenteret"*. Beslutning 22 siger INGEN GPS, og begrundelsen dér er at en
 * melding er et menneskes udsagn og ikke en måling — den handler om at FØLGE
 * en bil gennem dagen.
 *
 * Et enkelt punkt ved ind og ét ved ud er noget andet end sporing, og det er
 * derfor spørgsmålet er stillet frem for afgjort. **Svaret afventer ejeren**,
 * og indtil da skrives ingen koordinater.
 *
 * ⚠ FORMEN SPÆRRER IKKE FOR SVARET. Felterne er FLADE — `indMs`, `udMs` — så
 * `indLat`/`indLon` kan lægges til som to valgfrie felter uden at røre en
 * eneste eksisterende post. Havde vi gemt `ind: { ms }` som et objekt for at
 * "gøre plads", ville vi have valgt formen på et svar vi ikke har fået, og
 * hver post skulle skrives om hvis svaret blev nej.
 */

/** Feltnavne på en stempling. Reglens `$andet: false` siger det samme. */
export const STEMPLING_FELTER = ["indMs", "udMs", "note"];

/**
 * En stempling er ÅBEN indtil den har et `udMs`.
 *
 * ⚠ ÅBEN ER IKKE "I DAG". En chauffør der kører en nattur, stempler ind
 * mandag kl. 22 og ud tirsdag kl. 06. Ledte vi efter en åben post på dagens
 * dato, ville han stå som ikke-stemplet-ind hele natten — og "Stempl IND"
 * ville lave en post nummer to oven i den han allerede havde.
 */
export const erAaben = (s) => Boolean(s) && Number.isFinite(s.indMs)
  && !Number.isFinite(s.udMs);

/** Den åbne stempling, hvis der er en. Nyeste vinder. */
export const aabenStempling = (liste = []) =>
  [...liste].filter(erAaben).sort((a, b) => b.indMs - a.indMs)[0] || null;

/**
 * Minutter på en stempling — eller `null` hvis den stadig er åben.
 *
 * ⚠ EN ÅBEN STEMPLING HAR IKKE NUL MINUTTER. Den har et ubesvaret spørgsmål:
 * vi ved hvornår han begyndte og ikke hvornår han holdt op. Skrev vi 0, ville
 * en ugeopgørelse vise en dag uden arbejde for en mand der stadig kører.
 * Samme regel som `num()` og INTET.
 */
export function minutter(s) {
  if (!s || !Number.isFinite(s.indMs) || !Number.isFinite(s.udMs)) return null;
  return Math.max(0, Math.round((s.udMs - s.indMs) / 60000));
}

/**
 * "7:30" — timer og minutter, aldrig et decimaltal.
 *
 * ⚠ 7,5 TIME ER IKKE 7 TIMER OG 5 MINUTTER, og et decimaltal på en lønseddel
 * bliver læst som det ene af de to af den der ikke skrev det. Kolon er
 * entydigt. `null` bliver til INTET — se `format.js`.
 */
export function timerOgMin(min) {
  if (!Number.isFinite(min)) return "—";
  const t = Math.floor(min / 60);
  return `${t}:${String(min - t * 60).padStart(2, "0")}`;
}

/* ---- Ugen ------------------------------------------------------------- */

const DOEGN = 86400000;

/**
 * Mandagen i den uge `ms` ligger i, ved midnat lokal tid.
 *
 * ⚠ UGEN BEGYNDER MANDAG, og `getDay()` giver 0 for søndag — samme fælde som
 * gitterets ugekolonner (beslutning 65). En uge der begynder søndag, ville
 * lægge en søndagsvagt i den forkerte uge på en lønopgørelse.
 */
export function ugestart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const dag = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dag);
  return d.getTime();
}

/**
 * De syv dage i ugen, med stemplingerne lagt på den dag de BEGYNDTE.
 *
 * ⚠ EN NATTUR TÆLLER PÅ AFGANGSDAGEN. Den kunne deles over midnat, og det
 * ville være rigtigere for en lønopgørelse — men det er et spørgsmål om
 * overenskomst, ikke om kode, og et gæt ville stå som en beregning. Indtil
 * nogen har svaret, ligger vagten hvor den begyndte, og det står på skærmen.
 *
 * ⚠ OG DAGENE BYGGES MED `Date`, ikke med `+ 86400000`. Et døgn er 23 eller
 * 25 timer ved sommertidsskiftet, og en uge ville ellers begynde kl. 23 om
 * søndagen. Samme grund som `slots()` i gitter.js.
 */
export function ugedage(ugestartMs, liste = []) {
  const dage = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ugestartMs);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const fra = d.getTime();
    const naeste = new Date(fra);
    naeste.setDate(naeste.getDate() + 1);
    const til = naeste.getTime();

    const paaDagen = liste.filter((s) =>
      Number.isFinite(s.indMs) && s.indMs >= fra && s.indMs < til);

    /* ⚠ EN DAG MED EN ÅBEN STEMPLING HAR IKKE ET TAL. `null` bobler op
       gennem summen: har vi ikke hørt hvornår han holdt op, kan dagens sum
       ikke gøres op, og "0:00" ville påstå at han ikke arbejdede. */
    const harAaben = paaDagen.some(erAaben);
    const sum = harAaben ? null
      : paaDagen.reduce((n, s) => n + (minutter(s) ?? 0), 0);

    dage.push({ fra, til, stemplinger: paaDagen, minutter: sum, harAaben });
  }
  return dage;
}

/** Ugens sum — `null` hvis bare én dag ikke kan gøres op. */
export const ugesum = (dage = []) =>
  dage.some((d) => d.minutter == null) ? null
    : dage.reduce((n, d) => n + d.minutter, 0);

/* ---- Hvad der må skrives ---------------------------------------------- */

/**
 * Fejl ved en stempling — tom liste betyder gyldig.
 *
 * ⚠ HÅNDHÆVES OGSÅ I REGLEN. Her svares hurtigt; reglen afgør. En
 * klientvalidering der ikke også står i `firebase.rules.json`, tillader før
 * eller siden noget serveren skulle have stoppet.
 */
export function valideStempling(s, { nu = Date.now() } = {}) {
  const fejl = [];
  const p = s || {};

  if (!Number.isFinite(p.indMs)) fejl.push("Stemplingen mangler et starttidspunkt.");
  for (const felt of Object.keys(p)) {
    if (!STEMPLING_FELTER.includes(felt)) fejl.push(`Ukendt felt: ${felt}`);
  }
  if (p.udMs != null) {
    if (!Number.isFinite(p.udMs)) fejl.push("Sluttidspunktet er ikke et tidspunkt.");
    else if (p.udMs < p.indMs) fejl.push("Man kan ikke stemple ud før man stemplede ind.");
    /* ⚠ ET LOFT PÅ ET DØGN. En glemt udstempling giver ellers en vagt på
       hundrede timer, og den står i en opgørelse som om nogen arbejdede.
       Loftet er en AFVISNING og ikke en afkortning: vi ved ikke hvornår han
       gik, og at gætte midnat ville være en måling vi fandt på. */
    else if (p.udMs - p.indMs > DOEGN) {
      fejl.push("Vagten er over et døgn. Kontakt kontoret — den skal rettes i hånden.");
    }
  }
  /* ⚠ ET FREMTIDIGT TIDSPUNKT ER EN URFEJL. Telefonen sætter tiden (som på en
     statusmelding, beslutning 103), og et ur der er en måned foran, ville
     lægge vagten i en fremtidig uge hvor ingen leder efter den. */
  if (Number.isFinite(p.indMs) && p.indMs > nu + 2 * 3600000) {
    fejl.push("Tidspunktet ligger i fremtiden. Tjek telefonens ur.");
  }
  if (p.note != null && (typeof p.note !== "string" || p.note.length > 200)) {
    fejl.push("Noten skal være tekst på højst 200 tegn.");
  }
  return fejl;
}
