/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/support.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
/* src/fleet/support.js
 * Support. BESLUTNING 23, korrigeret af BESLUTNING 24.
 *
 * INGEN IMPORTS.
 *
 * ⚠ FØRSTE GANG NOGET KRYDSER TENANT-GRÆNSEN.
 *
 * Alt andet i platformen ligger under tenants/<t>/ og håndhæves med
 * auth.token.tenant === $tenantId. Support skal to veje: kunden ser sine egne
 * sager, vi ser alles. Det kan ikke løses med den regel alene.
 *
 * Løsningen hviler på én skelnen i RTDB: reglerne KAN sammenligne et felt på
 * den post der læses, mod claim'et — men de kan IKKE filtrere en forespørgsel.
 *
 *   support/sager/<sagId>            i TOPPEN, som audit/. Har tenantId
 *   support/beskeder/<sagId>/<id>    tråden
 *   tenants/<t>/supportsager/<id>    INDEKS — kun id'er. Det kunden kan liste
 *
 * At læse ÉN sag er en regel pr. post: data.child('tenantId') mod claim'et.
 * At LISTE kræver .read på forælderen, og derfor findes indeksnoden.
 *
 * ⚠ TENANT-ISOLATIONEN ER IKKE BRUDT. En kunde kan stadig ikke læse en anden
 * kundes sag — reglen sammenligner postens eget tenantId. Vi kan, men kun med
 * support.laes, som ingen kunderolle har.
 *
 * ⚠ OG DET ER SVARET PÅ KUNDEPORTALEN. README har noteret problemet: en kunde
 * kan ikke liste sine egne bookinger, fordi .read på bookinger er alt eller
 * intet. Mønstret her — post i toppen med et ejerfelt, plus en indeksnode pr.
 * tenant til listen — er den løsning portalen skal bruge. Det er billigt at
 * skrive ned nu og dyrt at genopdage.
 */

/* ---- Vokabular --------------------------------------------------------- */

export const SUPPORT_KATEGORI = {
  virkerIkke:        "Noget virker ikke",
  brugerspoergsmaal: "Brugerspørgsmål",
  rettigheder:       "Rettigheder og adgang",
  integration:       "Integration",
  booking:           "Planning",
  flaade:            "Fleet",
  facility:          "Facility",
};

export const ALLE_KATEGORIER = Object.keys(SUPPORT_KATEGORI);

export const SUPPORT_PRIORITET = {
  lav:      { label: "Lav — spørgsmål, kan vente",        pill: "ok",   rang: 1 },
  medium:   { label: "Medium — jeg kan fortsætte",        pill: "info", rang: 2 },
  hoej:     { label: "Høj — vigtig funktion virker ikke", pill: "warn", rang: 3 },
  kritisk:  { label: "Kritisk — driften er stoppet",      pill: "bad",  rang: 4 },
};

export const ALLE_PRIORITETER = Object.keys(SUPPORT_PRIORITET);

export const SUPPORT_STATUS = {
  ny:             { label: "Ny",                 pill: "info", aaben: true },
  undersoeges:    { label: "Undersøges",         pill: "warn", aaben: true },
  afventerKunde:  { label: "Afventer kunde",     pill: "warn", aaben: true },
  afventerIntern: { label: "Afventer intern",    pill: "info", aaben: true },
  loest:          { label: "Løst",               pill: "ok",   aaben: false },
  lukket:         { label: "Lukket",             pill: "ok",   aaben: false },
};

export const ALLE_STATUS = Object.keys(SUPPORT_STATUS);

/* ---- Hvem må læse hvad ------------------------------------------------- */

/**
 * maaLaeseSag(sag, bruger) → bool
 *
 * ⚠ DEN HER FUNKTION ER REGLEN SKREVET ÉN GANG. Den skal svare NØJAGTIG det
 * samme som `support/sager/$sagId`'s .read gør, og den findes for at
 * skelnen kan testes uden emulator — og for at en skærm ikke opfinder sin egen
 * udgave.
 *
 * Fejler LUKKET: uden tenant og uden permission må man intet.
 */
export function maaLaeseSag(sag, bruger) {
  if (!sag || !bruger) return false;
  if (harSupportPerm(bruger, PERM_SUPPORT_LAES)) return true;
  return Boolean(sag.tenantId) && sag.tenantId === bruger.tenant;
}

/** Permissions specificeret her, IKKE tilføjet til permissions.js.
 *  Kataloget siger selv at man ikke tilføjer en permission uden et sted der
 *  spørger efter den, og reglerne for support/ skrives når skrivning bygges.
 *  Samme linje som sag.* fra beslutning 20. */
export const PERM_SUPPORT_OPRET = "support.opret";
export const PERM_SUPPORT_LAES = "support.laes";
export const PERM_SUPPORT_SKRIV = "support.skriv";
export const PERM_ADGANG_GIV = "supportadgang.giv";

/** Rør-afgrænset claim-streng eller array, som harPerm i permissions.js. */
export function harSupportPerm(bruger, perm) {
  const p = bruger?.perms;
  if (!p || !perm) return false;
  return Array.isArray(p) ? p.includes(perm) : p.includes(`|${perm}|`);
}

/* ---- Konteksten der følger en sag -------------------------------------- */

/**
 * ⚠ EN SUPPORTSAG ER EN NY KANAL UD AF SYSTEMET.
 *
 * Alt hvad der lægges i konteksten, forlader kundens tenant og lander hos os.
 * Derfor en ALLOWLISTE og ikke en blokliste: en blokliste dækker det man kom
 * i tanke om, en allowliste dækker resten.
 *
 * Samme mekanisme som LOGBARE_FELTER i audit-regler.js, og af samme grund.
 */
export const SUPPORT_KONTEKST = {
  kunde:            "Kunde",
  side:             "Aktuel side",
  modul:            "Modul",
  browser:          "Browser / app-version",
  version:          "FleetControl-version",
  brugerId:         "Bruger-id",
  tidspunkt:        "Tidspunkt",
  fejlId:           "Fejl-id",
};

export const KONTEKSTFELTER = Object.keys(SUPPORT_KONTEKST);

/**
 * kontekstFilter(raa) → { tilladt, afvist }
 *
 * Serveren skal filtrere mod SAMME liste igen. Klientens filtrering er en
 * bekvemmelighed; serverens er kontrollen — som i audit-regler.js.
 *
 * ⚠ ALDRIG passwords, tokens eller FELTVÆRDIER. En feltværdi er kundens data:
 * lægger vi "kundenavn: Kolding Kommune" i en supportsag, har vi flyttet
 * kundens forretningsdata ud af deres tenant for at fejlsøge en knap.
 */
export function kontekstFilter(raa = {}) {
  const tilladt = {};
  const afvist = [];
  for (const [n, v] of Object.entries(raa)) {
    if (KONTEKSTFELTER.includes(n)) tilladt[n] = v;
    else afvist.push(n);
  }
  return { tilladt, afvist };
}

/* ---- Auditudtrækket ---------------------------------------------------- */

/**
 * ⚠ BESLUTNING 24 RETTER BESLUTNING 23.
 *
 * 23 sagde at supportsagen skulle "vise kundens auditlog". Læst som skrevet
 * ville det have betydet at support kunne læse auditloggen — og den er SELV
 * følsom: den afslører hvilke kunder der bliver kigget på, og af hvem. I
 * praksis ville det være permanent læseadgang til alle tenants' logge, altså
 * det stik modsatte af hvad 23 skulle opnå.
 *
 * Rettelsen er at det er et UDTRÆK og ikke en adgang:
 *
 *   · kun posterne for ÉN bruger — den der oprettede sagen
 *   · kun i et fast vindue omkring fejltidspunktet
 *   · udtrækket skrives PÅ SAGEN. Support læser sagen, aldrig audit/
 *   · udtrækket er selv en auditeret hændelse
 *   · support får ALDRIG audit.laes på en kundes tenant
 */
export const AUDITUDTRAEK = {
  minutterFoer: 5,
  minutterEfter: 5,
  maksPoster: 50,
};

/**
 * ⚠ GRÆNSEN ER FAST OG KAN IKKE SÆTTES AF SUPPORT SELV.
 *
 * Et vindue "omkring fejltidspunktet" bliver to timer den dag nogen har brug
 * for lidt mere, og så er udtrækket de facto hele loggen for den bruger. Et
 * loft der kan hæves af den der rammer det, er ikke et loft.
 *
 * Skal vinduet ændres, er det en ændring i denne fil og i den Cloud Function
 * der laver udtrækket — ikke et felt på skærmen.
 */
export function udtraekVindue(fejlMs) {
  if (!Number.isFinite(fejlMs)) return null;
  return {
    fra: fejlMs - AUDITUDTRAEK.minutterFoer * 60000,
    til: fejlMs + AUDITUDTRAEK.minutterEfter * 60000,
    maksPoster: AUDITUDTRAEK.maksPoster,
  };
}

/**
 * Klipper et udtræk til grænserne. Rammes loftet, SIGES DET — et udtræk der
 * er skåret i stilhed, læses som hele billedet.
 */
export function klipUdtraek(poster = [], fejlMs) {
  const v = udtraekVindue(fejlMs);
  if (!v) return { poster: [], afkortet: false, vindue: null };
  const iVindue = poster
    .filter((p) => Number.isFinite(p?.ms) && p.ms >= v.fra && p.ms <= v.til)
    .sort((a, b) => a.ms - b.ms);
  return {
    poster: iVindue.slice(0, v.maksPoster),
    afkortet: iVindue.length > v.maksPoster,
    vindue: v,
  };
}

/* ---- Supportadgang ----------------------------------------------------- */

/**
 * BESLUTNING 23. FleetControl-personale har som standard INGEN adgang.
 * Kundens administrator giver den, tidsbegrænset, med formål og sagsnummer.
 */
export const ADGANG_VARIGHED = {
  t1:  { label: "1 time",   timer: 1 },
  t4:  { label: "4 timer",  timer: 4 },
  t8:  { label: "8 timer",  timer: 8 },
  t24: { label: "24 timer", timer: 24 },
};

export const ADGANG_TYPE = {
  readOnly:        { label: "Read only", skriv: false },
  begraensetSkriv: { label: "Begrænset skriveadgang", skriv: true },
};

/**
 * ⚠ ADGANGEN UDLØBER AF SIG SELV — ikke fordi nogen husker at lukke den.
 * Derfor er `udloeberMs` et gemt tidspunkt og `aktiv` en AFLEDT værdi. Et
 * lagret aktiv-flag ville blive stående sandt den dag en oprydningsfunktion
 * fejler, og så er adgangen permanent uden at nogen har besluttet det.
 */
export const adgangAktiv = (bevilling, nu = Date.now()) =>
  Boolean(bevilling) && !bevilling.tilbagekaldtMs && nu < bevilling.udloeberMs;

export const adgangResterendeMin = (bevilling, nu = Date.now()) =>
  adgangAktiv(bevilling, nu) ? Math.ceil((bevilling.udloeberMs - nu) / 60000) : 0;

/**
 * kanGiveAdgang(bruger, sag) → { ok, aarsag }
 *
 * Kun kundens egen administrator. Support kan ikke give sig selv adgang — det
 * er hele pointen, og det er samme argument som beslutning 5: den der har
 * brug for adgangen, må ikke være den der bevilger den.
 */
export function kanGiveAdgang(bruger, sag) {
  if (!sag) return { ok: false, aarsag: "Ingen sag valgt." };
  if (!bruger) return { ok: false, aarsag: "Ikke logget ind." };
  if (harSupportPerm(bruger, PERM_SUPPORT_LAES) && bruger.tenant !== sag.tenantId) {
    return {
      ok: false,
      aarsag: "Support kan ikke give sig selv adgang. Kundens administrator bevilger den.",
    };
  }
  if (bruger.tenant !== sag.tenantId) {
    return { ok: false, aarsag: "Du hører ikke til den tenant sagen ligger i." };
  }
  if (!harSupportPerm(bruger, PERM_ADGANG_GIV)) {
    return { ok: false, aarsag: `Kræver ${PERM_ADGANG_GIV}, som kun en administrator har.` };
  }
  return { ok: true };
}

/** Bevillingen der ville blive skrevet. Bygger, skriver ikke. */
export function byggBevilling({ sag, bruger, varighed, type, formaal }, nu = Date.now()) {
  const v = ADGANG_VARIGHED[varighed];
  if (!v) throw new Error(`byggBevilling: ukendt varighed "${varighed}".`);
  if (!ADGANG_TYPE[type]) throw new Error(`byggBevilling: ukendt adgangstype "${type}".`);
  if (!formaal?.trim()) throw new Error("byggBevilling: et formål er påkrævet.");
  return {
    sagId: sag.id,
    sagsnummer: sag.nummer,
    tenantId: sag.tenantId,
    givetAf: bruger?.uid ?? null,
    givetMs: nu,
    udloeberMs: nu + v.timer * 3600000,
    type,
    formaal: formaal.trim(),
    tilbagekaldtMs: null,
  };
}

/* ---- Nummerserien ------------------------------------------------------ */

/**
 * SUP-ÅÅÅÅ-NNNNN. FEM cifre — beslutning 8's format uden undtagelser.
 * Prototypen skrev SUP-2026-1024 med fire; ét format gælder alle serier.
 *
 * `rod: "support"` gør counteren GLOBAL. Sagsnumrene er vores, ikke kundens:
 * to tenants må ikke kunne få samme nummer, for så kan to sager ikke skelnes
 * i en samtale med den ene af dem. Se naesteNummer() i booking-state.js.
 */
export const SUPPORT_SERIE = { praefiks: "SUP", serie: "sager", rod: "support" };

export const SUPPORT_NUMMER = /^SUP-\d{4}-\d{5}$/;

/* ---- Fælles kunde-/ejerkontrakt V1 ----------------------------------- */

export const SUPPORT_KONTRAKT_VERSION = "veyro.support.v1.1";

export const SUPPORT_SAMTALE_STATUS = Object.freeze({
  aiDialog: "AI-dialog",
  afventerSupport: "Afventer Veyro Support",
  underBehandling: "Under behandling",
  afventerKunde: "Afventer kunde",
  loest: "Løst",
});

export const SUPPORT_ANSVAR = Object.freeze({ ai: "ai", ejer: "ejer" });
export const SUPPORT_AFSENDER = Object.freeze({ kunde: "kunde", ai: "ai", ejer: "ejer" });
export const SUPPORT_SYNLIGHED = Object.freeze({ kunde: "kunde", intern: "intern" });
export const SUPPORT_KANAL = Object.freeze({ portal: "portal", mail: "mail" });

/* V8/V8.1 bruger disse statusnavne i ejerarbejdsfladen. De er en adapter-
 * visning, ikke et andet statusfelt der kan drive fra supportsagen. */
export const SUPPORT_EJER_STATUS = Object.freeze({
  aiDialog: "ny",
  afventerSupport: "triage",
  underBehandling: "afventer_os",
  afventerKunde: "afventer_kunden",
  loest: "loest",
});

export const SUPPORT_PORTAL_STATUS_FRA_EJER = Object.freeze({
  triage: "afventerSupport",
  afventer_os: "underBehandling",
  afventer_kunden: "afventerKunde",
  loest: "loest",
});

export const SUPPORT_GRAENSER = Object.freeze({
  emne: 140,
  tekst: 8_000,
  anmodningId: 80,
  afproevedeTrin: 20,
});

const ANMODNING_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function gyldigtSupportAnmodningId(id) {
  return typeof id === "string" && ANMODNING_ID.test(id);
}

export function renSupportTekst(tekst, maks = SUPPORT_GRAENSER.tekst) {
  const vaerdi = typeof tekst === "string" ? tekst.trim() : "";
  return vaerdi && vaerdi.length <= maks ? vaerdi : null;
}

/**
 * Ejerens vidensbase har ét autoritativt godkendelsessnit. Ældre boolske
 * felter kan eksistere i historikken, men de kan aldrig i sig selv gøre en
 * post kundesynlig. Den aktuelle post og dens aktuelle version skal både
 * være identificerbare og udtrykkeligt godkendt til kunder.
 */
export function erKundegodkendtSupportViden(post = {}) {
  return Boolean(
    post.vidensstatus === "godkendt"
    && post.publikum === "kunde_godkendt"
    && post.titel
    && post.indhold
    && post.kilde
    && Number(post.aktuelVersion) > 0
    && (!post.leveringsstatus || post.leveringsstatus === "tilgaengelig")
  );
}

export function ejerStatusFraSupportSag(sag = {}) {
  return SUPPORT_EJER_STATUS[sag.status] || "triage";
}

export function supportStatusFraEjer(status) {
  return SUPPORT_PORTAL_STATUS_FRA_EJER[status] || null;
}

/**
 * Read-projektion til ejerens eksisterende V8/V8.1-komponenter. Der skrives
 * aldrig en kopi under udbyder/salgsindbakke/traade. Alle mutationer går
 * tilbage gennem supportEjer*-operationerne til den autoritative supportsag.
 */
export function supportSagTilEjerTraad({ sag, beskeder = {}, noter = {}, internAi = {}, svarKladder = {} } = {}) {
  if (!sag) return null;
  const ejerBeskeder = Object.fromEntries(Object.entries(beskeder).map(([id, post]) => [id, {
    id,
    retning: post?.afsenderType === SUPPORT_AFSENDER.kunde ? "indgaaende" : "udgaaende",
    fra: post?.afsenderType === SUPPORT_AFSENDER.kunde ? (sag.kontaktEmail || sag.oprettetAfUid) : "portal@veyro.invalid",
    til: post?.afsenderType === SUPPORT_AFSENDER.kunde ? "Veyro Support" : (sag.kontaktEmail || sag.oprettetAfUid),
    emne: sag.emne,
    tekst: post?.tekst || "",
    sendtMs: Number(post?.oprettetMs || 0),
    kanal: SUPPORT_KANAL.portal,
    synlighed: post?.synlighed,
    kilde: post?.kilde || null,
    sagsbehandlerNavn: post?.afsenderType === SUPPORT_AFSENDER.ejer ? "Veyro Support" : undefined,
  }]));
  const ejerNoter = Object.fromEntries(Object.entries(noter).map(([id, post]) => [id, {
    id, tekst: post?.tekst || "", oprettetAf: post?.oprettetAfUid || "",
    oprettetMs: Number(post?.oprettetMs || 0), intern: true,
  }]));
  return {
    id: sag.id,
    traadId: sag.id,
    kontraktVersion: sag.kontraktVersion,
    sagstype: "support",
    delingsstatus: "delt",
    kilde: { art: "kundeportal", adapter: "veyro.support.v1.1" },
    emne: sag.emne,
    status: ejerStatusFraSupportSag(sag),
    ansvarligUid: sag.ansvarligUid || "",
    revision: Number(sag.revision || 0),
    oprettetMs: Number(sag.oprettetMs || 0),
    opdateretMs: Number(sag.opdateretMs || 0),
    senesteAktivitetMs: Number(sag.opdateretMs || 0),
    kontaktNavn: sag.kontaktNavn || "",
    kontaktEmail: sag.kontaktEmail || "",
    virksomhedsnavn: sag.virksomhedsnavn || sag.tenantId || "",
    links: {
      tenantId: sag.tenantId,
      ...(sag.virksomhedId ? { virksomhedId: sag.virksomhedId } : {}),
    },
    support: {
      nummer: sag.nummer,
      type: sag.type || "andet",
      status: ejerStatusFraSupportSag(sag),
      prioritet: sag.prioritet || "normal",
      modul: sag.modul || "",
      fristMs: sag.fristMs || null,
      problem: sag.problemResume || "",
      version: sag.programversion || "",
      forsoegt: Array.isArray(sag.afproevedeTrin) ? sag.afproevedeTrin.join("\n") : "",
    },
    beskeder: ejerBeskeder,
    noter: ejerNoter,
    aiArbejdsrum: internAi || {},
    svarKladder: svarKladder || {},
  };
}

/** V1 deler kun brugerens egne sager. Rollen udvider ikke dette snit. */
export function maaKundeLaeseSupportSag(sag, bruger) {
  return Boolean(
    sag
    && bruger?.uid
    && bruger?.tenant
    && sag.tenantId === bruger.tenant
    && sag.oprettetAfUid === bruger.uid
  );
}

export function maaEjerBehandleSupport(bruger) {
  return bruger?.udbyder === true;
}

/**
 * Et genereret svar må først publiceres efter et nyt servertjek. Dermed
 * bortfalder det, hvis kunden eskalerede, eller en ejer overtog undervejs.
 */
export function maaPublicereSupportAi(sag, startRevision) {
  return Boolean(
    sag
    && sag.status === "aiDialog"
    && sag.ansvarstype === SUPPORT_ANSVAR.ai
    && sag.ansvarligUid == null
    && sag.revision === startRevision
  );
}

export function kundesynligeSupportBeskeder(beskeder = {}) {
  return Object.fromEntries(
    Object.entries(beskeder).filter(([, besked]) =>
      besked?.synlighed === SUPPORT_SYNLIGHED.kunde
      && Object.hasOwn(SUPPORT_AFSENDER, besked?.afsenderType)),
  );
}

/** Returnerer kun kontraktens kundesynlige felter. */
export function kundesynligSupportSag(sag) {
  if (!sag) return null;
  const {
    kontraktVersion, id, nummer, tenantId, oprettetAfUid, status,
    ansvarstype, emne, problemResume, modul, programversion, side,
    afproevedeTrin, anvendteKilder, eskaleringsaarsag, revision,
    oprettetMs, opdateretMs, eskaleretMs, overtagetMs, loestMs,
  } = sag;
  return {
    kontraktVersion, id, traadId: id, nummer, tenantId, oprettetAfUid, status,
    ansvarstype, emne, problemResume, modul, programversion, side,
    afproevedeTrin: Array.isArray(afproevedeTrin) ? afproevedeTrin : [],
    anvendteKilder: Array.isArray(anvendteKilder) ? anvendteKilder : [],
    eskaleringsaarsag: eskaleringsaarsag || null,
    revision, oprettetMs, opdateretMs, eskaleretMs: eskaleretMs || null,
    overtagetMs: overtagetMs || null, loestMs: loestMs || null,
  };
}

export function supportStatusskift(sag, handling) {
  if (!sag) return null;
  if (handling === "eskaler" && sag.status !== "loest") {
    return { status: "afventerSupport", ansvarstype: SUPPORT_ANSVAR.ejer, ansvarligUid: null };
  }
  if (handling === "overtag" && sag.status === "afventerSupport") {
    return { status: "underBehandling", ansvarstype: SUPPORT_ANSVAR.ejer };
  }
  if (handling === "afventerKunde" && sag.ansvarstype === SUPPORT_ANSVAR.ejer) {
    return { status: "afventerKunde", ansvarstype: SUPPORT_ANSVAR.ejer };
  }
  if (handling === "loes") {
    return { status: "loest", ansvarstype: sag.ansvarstype, ansvarligUid: sag.ansvarligUid || null };
  }
  if (handling === "genaabn" && sag.status === "loest") {
    return { status: "afventerSupport", ansvarstype: SUPPORT_ANSVAR.ejer, ansvarligUid: null };
  }
  return null;
}
