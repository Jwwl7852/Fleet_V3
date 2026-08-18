/* src/fleet/prioritet.js
 * Hvor travlt der er med et stykke arbejde. ÉT katalog.
 *
 * INGEN IMPORTS. Den Cloud Function der validerer en opgave eller en
 * plukordre, skal bruge nøjagtig samme katalog som skærmen — og
 * `functions/`-mappen er det eneste der deployes, så en import op gennem
 * træet fejler i skyen. Filen står i DELTE_FILER i scripts/kopier-delt.mjs.
 *
 * ---------------------------------------------------------------------------
 * ⚠ ORDET VAR TAGET TRE GANGE, OG DE TRE ER IKKE DET SAMME.
 *
 *   1. `reservations.js` PRIORITET      40/30/20/10/5
 *      Hvilken KILDE der vinder når to reservationer overlapper. Værksted slår
 *      booking, fordi en bil på værksted ikke kan køre. Det er ikke noget et
 *      menneske sætter — det er en rangorden mellem systemets egne kilder, og
 *      den har intet med travlhed at gøre.
 *
 *   2. `support.js` SUPPORT_PRIORITET   lav | medium | hoej | kritisk
 *      FIRE trin, og labelet bærer en definition: "Kritisk — driften er
 *      stoppet". Det er en hændelsens alvor over for OS som leverandør, ikke
 *      en rækkefølge i kundens egen arbejdskø. Den bliver stående.
 *
 *   3. Den her: tre trin, sat af et MENNESKE på et stykke arbejde i kundens
 *      eget hus. Plukordren havde den først; Fleets driftsopgaver og
 *      indberetninger har præcis samme spørgsmål, og et fjerde katalog ville
 *      være "Dæk" mod "Dækskifte" en gang til — to ordlister der ikke kan
 *      summeres, på to skærme der viser den samme slags kø.
 * ---------------------------------------------------------------------------
 *
 * ⚠ VÆRDIEN ER `normal`, LABELET ER "Mellem". De to skal ikke gøres ens.
 * `normal` står i `firebase.rules.json` som `matches(/^(lav|normal|hoej)$/)`
 * og på hver plukordre der måtte være oprettet. At omdøbe værdien til
 * `mellem` for at få labelet til at passe, ville være en datamigrering for et
 * ord — og hvor mange plukordrer der findes i den udrullede base, kan vi ikke
 * måle herfra. Samme regel som `flaade` mod "Fleet": NAVNET skifter, NØGLEN
 * gør ikke.
 *
 * ⚠ REKKEFØLGEN I OBJEKTET ER lav → normal → hoej, og den er ikke ligegyldig.
 * `ALLE_PRIORITETER` er Object.keys, og den fylder en dropdown i Pluk. Vendte
 * vi kataloget om for at få "Høj" øverst i en tabel, ville dropdownen skifte
 * rækkefølge et helt andet sted. Sorteringen hører i `vaegt`, ikke i
 * nøglernes orden.
 */

export const PRIORITET = {
  /* pill: grøn, gul, rød. En treskala skal kunne aflæses på farven alene i en
     kø hvor man scanner tredive rækker. `lav` stod som "info" (blå) sammen med
     `normal`, og to trin i samme farve er to trin man skal læse for at skelne. */
  lav:    { prioritet: "lav",    label: "Lav",    pill: "ok",   vaegt: 3 },
  normal: { prioritet: "normal", label: "Mellem", pill: "warn", vaegt: 2 },
  hoej:   { prioritet: "hoej",   label: "Høj",    pill: "bad",  vaegt: 1 },
};

export const ALLE_PRIORITETER = Object.keys(PRIORITET);

/**
 * ⚠ EN MANGLENDE PRIORITET ER IKKE "MELLEM".
 *
 * Returnerer null — ikke PRIORITET.normal — når feltet ikke er sat. Det er
 * samme regel som den manglende momssats: et system der gætter rigtigt ni
 * gange ud af ti, lærer brugeren at stole på det tiende. En indberetning fra
 * en chauffør har INGEN prioritet, før en værkfører har set på den, og
 * "uvurderet" er et svar — "Mellem" er en påstand.
 *
 * Skærmen skriver INTET (—) for null, som num() og pct() gør, og tæller de
 * uvurderede for sig.
 */
export const prioritetFor = (post) => PRIORITET[post?.prioritet] || null;

/** Er prioriteten sat OG kendt? En ukendt værdi er ikke en lav prioritet. */
export const harPrioritet = (post) => Boolean(prioritetFor(post));

/**
 * Sorteringsnøgle. Høj først, og de UVURDEREDE lige efter — ikke sidst.
 *
 * ⚠ Det er med vilje. En post uden prioritet er en post ingen har taget
 * stilling til, og lå den nederst i køen, ville den blive liggende netop
 * fordi ingen havde taget stilling til den. `9` ville have skjult dem;
 * 1,5 lægger dem hvor de bliver set.
 */
export const prioritetVaegt = (post) => prioritetFor(post)?.vaegt ?? 1.5;
