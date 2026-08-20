/* src/fleet/qrkode.js
 * QR-kode — byte-tilstand, fejlrettelsesniveau M, version 1–6.
 *
 * ---------------------------------------------------------------------------
 * ⚠ HVORFOR EN QR VED SIDEN AF STREGKODEN
 *
 * De to læses af hver sin maskine. Stregkoden er terminalens håndscanner;
 * QR'en er en telefon. En chauffør på en rampe har en telefon i lommen og
 * sjældent en Code 128-scanner, og et mærkat der kun kan læses af udstyr man
 * ikke har med, er lige så ubrugeligt som et der ikke kan scannes.
 *
 * Begge bærer den SAMME kode. To forskellige nyttelaster på ét mærkat ville
 * være to sandheder om hvad pallen er — og den ene ville drive.
 *
 * ---------------------------------------------------------------------------
 * ⚠ ALFANUMERISK NÅR DET KAN LADE SIG GØRE, ELLERS BYTE
 *
 * `BKG-2026-00317-CRR-100248` ligger helt inden for det alfanumeriske sæt, og
 * dér pakkes to tegn i elleve bit mod byte-tilstandens seksten: 19 kodeord mod
 * 27. Byte bliver stående som faldbakke — et kundenavn med ø falder uden for
 * sættet, og en koder der kun virker for de pæne strenge er en fælde.
 *
 * ⚠ OG DEN SPARER IKKE ALTID EN VERSION. Jeg troede først at det var dét der
 * fejlede, fordi alle de koder afkoderen ikke kunne finde, var med STORE
 * bogstaver. Prøven sagde nej: begge tilstande lander på version 2 for vores
 * kode, og fejlraten flyttede sig ikke. Gevinsten er de otte kodeord i
 * fejlretningens favør — ikke et mindre symbol. De rigtige fejl var
 * formatbitsene og strafferegel 3.
 *
 * ---------------------------------------------------------------------------
 * ⚠ EFTERPRØVET MED EN FREMMED AFKODER, som Code 128'eren
 *
 * En QR-koder har fem steder at tage fejl uafhængigt af hinanden: Reed-Solomon
 * over GF(256), blokfletningen, modulplaceringen, maskeringen og formatbitsene.
 * Er ét af dem forkert, ser billedet stadig ud som en QR-kode. Outputtet er
 * derfor afkodet med zxing og sammenlignet med inputtet.
 *
 * INGEN IMPORTS.
 * ---------------------------------------------------------------------------
 */

/* ---- Galois-feltet GF(256) --------------------------------------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;      /* QR's primitive polynomium */
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Generatorpolynomiet til n fejlrettelseskodeord. */
function generator(n) {
  let g = [1];
  for (let i = 0; i < n; i += 1) {
    const nyt = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j += 1) {
      nyt[j] ^= g[j];
      nyt[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = nyt;
  }
  return g;
}

/** Reed-Solomon: resten efter division med generatorpolynomiet. */
function fejlretning(data, ecLaengde) {
  const g = generator(ecLaengde);
  const rest = new Array(ecLaengde).fill(0);
  for (const b of data) {
    const faktor = b ^ rest[0];
    rest.shift();
    rest.push(0);
    for (let i = 0; i < ecLaengde; i += 1) {
      rest[i] ^= gfMul(g[i + 1], faktor);
    }
  }
  return rest;
}

/* ---- Versionstabellen -------------------------------------------------- */

/**
 * Niveau M, version 1–6: [datakodeord i alt, ec-kodeord pr. blok, blokke].
 *
 * ⚠ TABELLEN ER IKKE EN INDSTILLING. Et forkert tal giver en kode der ser ud
 * som en QR og ikke kan læses — se hovedet. Den er efterprøvet ved afkodning.
 */
const VERSIONER = {
  1: { data: 16, ecPrBlok: 10, blokke: 1 },
  2: { data: 28, ecPrBlok: 16, blokke: 1 },
  3: { data: 44, ecPrBlok: 26, blokke: 1 },
  4: { data: 64, ecPrBlok: 18, blokke: 2 },
  5: { data: 86, ecPrBlok: 24, blokke: 2 },
  6: { data: 108, ecPrBlok: 16, blokke: 4 },
};

/** Justeringsmønstrets midterkoordinater pr. version. */
const JUSTERING = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
};

export const MAKS_VERSION = 6;
const stoerrelse = (version) => version * 4 + 17;

/* Det alfanumeriske sæt. Rækkefølgen ER værdierne — position i strengen er
   tegnets kode, så den må ikke røres. */
const ALFANUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export const kanAlfanumerisk = (tekst) =>
  typeof tekst === "string" && [...tekst].every((t) => ALFANUM.includes(t));

/** Hvor mange bit fylder teksten i den valgte tilstand — uden afslutning. */
function databits(tekst, alfanumerisk) {
  if (alfanumerisk) {
    const par = Math.floor(tekst.length / 2);
    return 4 + 9 + par * 11 + (tekst.length % 2 ? 6 : 0);
  }
  return 4 + 8 + new TextEncoder().encode(tekst).length * 8;
}

/**
 * Mindste version der rummer teksten. Null hvis den er for lang.
 *
 * ⚠ TAGER TEKSTEN, IKKE EN LÆNGDE. Versionen afhænger af TILSTANDEN, og
 * tilstanden af tegnene — en længde alene kan ikke svare på spørgsmålet.
 */
export function vaelgVersion(tekst) {
  if (typeof tekst !== "string" || tekst.length === 0) return null;
  const bits = databits(tekst, kanAlfanumerisk(tekst));
  for (let v = 1; v <= MAKS_VERSION; v += 1) {
    if (Math.ceil(bits / 8) <= VERSIONER[v].data) return v;
  }
  return null;
}

/* ---- Fra tekst til kodeord --------------------------------------------- */

function tilKodeord(tekst, version) {
  const { data: kapacitet } = VERSIONER[version];
  const bits = [];
  const skriv = (vaerdi, antal) => {
    for (let i = antal - 1; i >= 0; i -= 1) bits.push((vaerdi >> i) & 1);
  };

  if (kanAlfanumerisk(tekst)) {
    skriv(0b0010, 4);               /* alfanumerisk tilstand */
    skriv(tekst.length, 9);         /* længdefelt: 9 bit for version 1–9 */
    /* To tegn i elleve bit: første gange 45 plus det andet. Et enligt sidste
       tegn står i seks. */
    for (let i = 0; i + 1 < tekst.length; i += 2) {
      skriv(ALFANUM.indexOf(tekst[i]) * 45 + ALFANUM.indexOf(tekst[i + 1]), 11);
    }
    if (tekst.length % 2) skriv(ALFANUM.indexOf(tekst[tekst.length - 1]), 6);
  } else {
    const bytes = new TextEncoder().encode(tekst);
    skriv(0b0100, 4);               /* byte-tilstand */
    skriv(bytes.length, 8);         /* længdefelt: 8 bit for version 1–9 */
    for (const b of bytes) skriv(b, 8);
  }

  /* Afslutning: op til fire nuller, derefter op til hel byte. */
  const maksBits = kapacitet * 8;
  for (let i = 0; i < 4 && bits.length < maksBits; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const kodeord = [];
  for (let i = 0; i < bits.length; i += 8) {
    kodeord.push(bits.slice(i, i + 8).reduce((s, b) => (s << 1) | b, 0));
  }
  /* Udfyldning: 0xEC og 0x11 skiftevis, som standarden foreskriver. */
  const udfyld = [0xec, 0x11];
  let i = 0;
  while (kodeord.length < kapacitet) {
    kodeord.push(udfyld[i % 2]);
    i += 1;
  }
  return kodeord;
}

/** Blokdeling og fletning — data først, så fejlretning. */
function fletKodeord(kodeord, version) {
  const { ecPrBlok, blokke } = VERSIONER[version];
  const korte = Math.floor(kodeord.length / blokke);
  const ekstra = kodeord.length % blokke;

  const dataBlokke = [];
  const ecBlokke = [];
  let p = 0;
  for (let b = 0; b < blokke; b += 1) {
    /* De sidste `ekstra` blokke er ét kodeord længere. */
    const laengde = korte + (b >= blokke - ekstra ? 1 : 0);
    const blok = kodeord.slice(p, p + laengde);
    p += laengde;
    dataBlokke.push(blok);
    ecBlokke.push(fejlretning(blok, ecPrBlok));
  }

  const ud = [];
  const maksData = Math.max(...dataBlokke.map((b) => b.length));
  for (let i = 0; i < maksData; i += 1) {
    for (const blok of dataBlokke) if (i < blok.length) ud.push(blok[i]);
  }
  for (let i = 0; i < ecPrBlok; i += 1) {
    for (const blok of ecBlokke) ud.push(blok[i]);
  }
  return ud;
}

/* ---- Modulmatricen ----------------------------------------------------- */

function tomMatrix(version) {
  const n = stoerrelse(version);
  return {
    n,
    felt: Array.from({ length: n }, () => new Array(n).fill(null)),
    fast: Array.from({ length: n }, () => new Array(n).fill(false)),
  };
}

function saetFast(m, x, y, vaerdi) {
  if (x < 0 || y < 0 || x >= m.n || y >= m.n) return;
  m.felt[y][x] = vaerdi;
  m.fast[y][x] = true;
}

function tegnFunktionsmoenstre(m, version) {
  const n = m.n;

  /* Søgemønstrene i tre hjørner, med adskillelse. */
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let y = -1; y <= 7; y += 1) {
      for (let x = -1; x <= 7; x += 1) {
        const kant = x === 0 || x === 6 || y === 0 || y === 6;
        const midte = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        const indenfor = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        saetFast(m, ox + x, oy + y, indenfor && (kant || midte) ? 1 : 0);
      }
    }
  }

  /* Tidssporene. */
  for (let i = 8; i < n - 8; i += 1) {
    const v = i % 2 === 0 ? 1 : 0;
    saetFast(m, i, 6, v);
    saetFast(m, 6, i, v);
  }

  /* Justeringsmønstre — ikke oven i søgemønstrene. */
  const midter = JUSTERING[version];
  for (const cy of midter) {
    for (const cx of midter) {
      const hjoerne =
        (cx <= 8 && cy <= 8) ||
        (cx >= n - 9 && cy <= 8) ||
        (cx <= 8 && cy >= n - 9);
      if (hjoerne) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const yderkant = Math.max(Math.abs(dx), Math.abs(dy));
          saetFast(m, cx + dx, cy + dy, yderkant === 1 ? 0 : 1);
        }
      }
    }
  }

  /* Det mørke modul — altid tændt, altid samme sted. */
  saetFast(m, 8, n - 8, 1);

  /* Formatområderne reserveres, så data ikke lander i dem. */
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) { saetFast(m, i, 8, 0); saetFast(m, 8, i, 0); }
  }
  for (let i = 0; i < 8; i += 1) {
    saetFast(m, n - 1 - i, 8, 0);
    if (i < 7) saetFast(m, 8, n - 1 - i, 0);
  }
}

/** Zigzag: to kolonner ad gangen, højre mod venstre, uden om tidssporet. */
function placerData(m, kodeord) {
  const bits = [];
  for (const k of kodeord) {
    for (let i = 7; i >= 0; i -= 1) bits.push((k >> i) & 1);
  }

  let p = 0;
  let opad = true;
  for (let hoejre = m.n - 1; hoejre > 0; hoejre -= 2) {
    if (hoejre === 6) hoejre = 5;   /* spring den lodrette tidskolonne over */
    for (let r = 0; r < m.n; r += 1) {
      const y = opad ? m.n - 1 - r : r;
      for (const x of [hoejre, hoejre - 1]) {
        if (m.fast[y][x]) continue;
        m.felt[y][x] = p < bits.length ? bits[p] : 0;
        p += 1;
      }
    }
    opad = !opad;
  }
}

const MASKER = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function maskeret(m, maske) {
  const ud = m.felt.map((r) => [...r]);
  for (let y = 0; y < m.n; y += 1) {
    for (let x = 0; x < m.n; x += 1) {
      if (m.fast[y][x]) continue;
      if (MASKER[maske](x, y)) ud[y][x] ^= 1;
    }
  }
  return ud;
}

/* Formatinformationen: niveau M (0b00) + maske, BCH(15,5), XOR 0x5412. */
function formatbits(maske) {
  let v = (0b00 << 3) | maske;
  let rest = v << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rest >> i) & 1) rest ^= 0b10100110111 << (i - 10);
  }
  return ((v << 10) | rest) ^ 0b101010000010010;
}

function skrivFormat(felt, n, maske) {
  const bits = formatbits(maske);
  /* ⚠ MEST BETYDENDE BIT FØRST. Første udgave skrev bit 0 i den første plads,
     og så stod hele formatordet spejlvendt — begge kopier. Koden så ud som en
     QR, og en afkoder fandt den, læste versionen og maskede rigtigt; den
     fejlede først på fejlretningen, hvor sporet er koldt. Rækkefølgen er
     efterprøvet modul for modul mod zxings egen koder. */
  const b = (i) => (bits >> (14 - i)) & 1;

  for (let i = 0; i <= 5; i += 1) felt[8][i] = b(i);
  felt[8][7] = b(6);
  felt[8][8] = b(7);
  felt[7][8] = b(8);
  for (let i = 9; i <= 14; i += 1) felt[14 - i][8] = b(i);

  /* ⚠ ANDEN KOPI ER 7 + 8, IKKE 8 + 7. Søjlen under nederste venstre
     søgemønster bærer syv bit; rækken til højre bærer otte og begynder ved
     n-8. Første udgave delte dem 8 + 7, og den ottende landede oven i det
     mørke modul — så manglede der en bit, og formatet kunne ikke rettes.
     Fordelingen er læst modul for modul ud af zxings egen koder. */
  for (let i = 0; i < 7; i += 1) felt[n - 1 - i][8] = b(i);
  for (let i = 0; i < 8; i += 1) felt[8][n - 8 + i] = b(7 + i);

  felt[n - 8][8] = 1;               /* det mørke modul */
}

/* ---- Maskevalg --------------------------------------------------------- */

function straf(felt, n) {
  let sum = 0;

  /* Regel 1: fem eller flere ens i træk. */
  for (let i = 0; i < n; i += 1) {
    for (const raekke of [felt[i], felt.map((r) => r[i])]) {
      let loeb = 1;
      for (let j = 1; j < n; j += 1) {
        if (raekke[j] === raekke[j - 1]) loeb += 1;
        else { if (loeb >= 5) sum += 3 + (loeb - 5); loeb = 1; }
      }
      if (loeb >= 5) sum += 3 + (loeb - 5);
    }
  }

  /* Regel 2: 2x2 i samme farve. */
  for (let y = 0; y < n - 1; y += 1) {
    for (let x = 0; x < n - 1; x += 1) {
      const v = felt[y][x];
      if (v === felt[y][x + 1] && v === felt[y + 1][x] && v === felt[y + 1][x + 1]) {
        sum += 3;
      }
    }
  }

  /* Regel 3: et FALSKT søgemønster — 1:1:3:1:1 med fire lyse ved siden af.
     Det er dét der får en scanner til slet ikke at finde koden.
     ⚠ KUN INDEN I SYMBOLET. Et mellemspil hvor kantens stille zone talte med
     som de fire lyse moduler, gjorde det VÆRRE: straffen skal være den samme
     som afkodernes, ellers vælges en maske ingen af dem ville have valgt.
     Målt mod zxings egen strafberegning. */
  const KERNE = [1, 0, 1, 1, 1, 0, 1];
  /* ⚠ VINDUET KLIPPES VED KANTEN, og der tælles ÉN straf — ikke én pr. side.
     Begge dele afveg i første udgave, og resultatet var at koderen valgte
     masker, en afkoder ikke kunne finde koden i. */
  const lys = (linje, fra, til) => {
    for (let k = Math.max(fra, 0); k < Math.min(til, n); k += 1) {
      if (linje[k] === 1) return false;
    }
    return true;
  };
  for (let i = 0; i < n; i += 1) {
    for (const linje of [felt[i], felt.map((r) => r[i])]) {
      for (let j = 0; j + 7 <= n; j += 1) {
        if (!KERNE.every((v, k) => linje[j + k] === v)) continue;
        if (lys(linje, j - 4, j) || lys(linje, j + 7, j + 11)) sum += 40;
      }
    }
  }

  /* Regel 4: skævhed i forholdet mellem mørke og lyse. */
  const moerke = felt.flat().filter((v) => v === 1).length;
  const pct = (moerke * 100) / (n * n);
  sum += Math.floor(Math.abs(pct - 50) / 5) * 10;

  return sum;
}

/* ---- Det offentlige ---------------------------------------------------- */

/**
 * Modulerne som et kvadratisk array af 0/1, uden stille zone.
 *
 * ⚠ DEN STILLE ZONE ER IKKE MED — standarden kræver fire moduler hele vejen
 * rundt, og den hører i det der TEGNER koden. Se QR_STILLE_ZONE.
 */
export function qrModuler(tekst, { tvungenMaske } = {}) {
  if (typeof tekst !== "string" || tekst.length === 0) return null;

  const version = vaelgVersion(tekst);
  if (!version) return null;

  const kodeord = fletKodeord(tilKodeord(tekst, version), version);

  const m = tomMatrix(version);
  tegnFunktionsmoenstre(m, version);
  placerData(m, kodeord);

  /* tvungenMaske er til efterprøvning: den lader en fremmed koders matrix
     sammenlignes modul for modul med vores. Enhver maske er gyldig — formatet
     fortæller afkoderen hvilken der er brugt — så valget er kun læsbarhed. */
  const masker = tvungenMaske === undefined
    ? [0, 1, 2, 3, 4, 5, 6, 7]
    : [tvungenMaske];

  let bedst = null;
  for (const maske of masker) {
    const felt = maskeret(m, maske);
    skrivFormat(felt, m.n, maske);
    const p = straf(felt, m.n);
    if (!bedst || p < bedst.straf) bedst = { felt, straf: p, maske };
  }
  return bedst.felt;
}

/** Standardens stille zone: fire moduler hele vejen rundt. */
export const QR_STILLE_ZONE = 4;

/** Kodens bredde i moduler, stille zone inklusive. */
export function qrBredde(tekst) {
  const m = qrModuler(tekst);
  return m ? m.length + QR_STILLE_ZONE * 2 : null;
}

/** De mørke moduler som {x, y} — det SVG'et tegner. */
export function qrFelter(tekst) {
  const m = qrModuler(tekst);
  if (!m) return null;
  const ud = [];
  for (let y = 0; y < m.length; y += 1) {
    for (let x = 0; x < m.length; x += 1) {
      if (m[y][x] === 1) ud.push({ x, y });
    }
  }
  return ud;
}
