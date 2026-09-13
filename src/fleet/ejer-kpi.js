import { beregnBogfoerteOmkostninger } from "./ejer-bilag-regler.js";
import { crmAktiviteter, crmMuligheder, erAabenMulighed } from "./ejer-crm-regler.js";

export const EJER_KPI_DEFINITIONER = Object.freeze({
  faktureretNetto: { label: "Faktureret salg, netto", grundlag: "Ekskl. udgående moms", kilde: "Dokumenteret afsendte fakturaer minus bogførte kreditnotaer, én ekstern reference én gang" },
  betalinger: { label: "Registrerede betalinger", grundlag: "Inkl. moms", kilde: "Dineros registrerede betalingsposter grupperet efter betalingsdato" },
  restbeloeb: { label: "Restbeløb", grundlag: "Inkl. moms", kilde: "Senest synkroniserede Dinero-fakturaer; nul efter kredit er ikke bevis for kontant betaling" },
  omkostninger: { label: "Bogførte omkostninger", grundlag: "Bogført beløb efter synligt fortegn", kilde: "Daterede Dinero-poster på eksplicit mappede resultatkonti" },
  aftalevaerdi: { label: "Månedlig aftaleværdi", grundlag: "Ekskl. moms og engangsbeløb", kilde: "Aktuelle aktive aftaleversioners frosne tilbudssnapshot" },
  pipeline: { label: "Åben pipeline", grundlag: "Månedsværdi ekskl. engangsbeløb", kilde: "Åbne CRM-salgsmuligheder" },
});

const vaerdier = (v) => Object.values(v || {});
const iso = (v) => typeof v === "string" ? v.slice(0, 10) : null;
const iPeriode = (dato, fra, til) => Boolean(dato && dato >= fra && dato <= til);
const unikke = (poster, noegle) => [...new Map(poster.map((p) => [noegle(p), p])).values()];
const matcherKunde = (post, kundeNoegler) => !kundeNoegler.length || kundeNoegler.some((id) => [post?.tenantId, post?.kundeId, post?.kontaktGuid, post?.virksomhedId].includes(id));
const matcherModul = (post, modulId) => !modulId || vaerdier(post?.linjer).some((linje) => [linje?.modul, linje?.modulId].includes(modulId));

export function maanedsperiode(maaned) {
  if (!/^\d{4}-\d{2}$/.test(maaned || "")) throw new Error("Perioden skal være ÅÅÅÅ-MM.");
  const [aar, m] = maaned.split("-").map(Number);
  const sidste = new Date(Date.UTC(aar, m, 0)).getUTCDate();
  return { maaned, fra: `${maaned}-01`, til: `${maaned}-${String(sidste).padStart(2, "0")}` };
}

export function fladFakturagrundlag(rod) {
  return Object.entries(rod || {}).flatMap(([periode, kunder]) => Object.entries(kunder || {}).map(([tenantId, post]) => ({ ...post, periode: post.periode || periode, tenantId })));
}

export function fladeKreditter(rod) {
  return Object.values(rod || {}).flatMap((gruppe) => Object.values(gruppe?.poster || {}).map((post) => ({ ...post, tenantId: gruppe.tenantId, originalEksternReference: gruppe.originalEksternReference })));
}

const erDokumenteretSendt = (post) => ["Sent", "SeenByCustomer", "dokumenteret_sendt", "sendt"].includes(post?.mailStatus || post?.sendStatus);
const erBogfoertKredit = (post) => ["Booked", "bogfoert", "sendt", "dokumenteret_sendt"].includes(post?.status);
const belobFraBetaling = (post) => {
  const tal = Number(post?.Amount ?? post?.amount ?? post?.Beloeb);
  return Number.isFinite(tal) ? Math.round(tal * 100) : null;
};

export function beregnEjerKpi(input) {
  const periode = maanedsperiode(input.periode);
  const valgtKunde = input.crm?.[input.kundeId]?.stamdata || {};
  const kundeNoegler = input.kundeId ? [...new Set([input.kundeId, valgtKunde.tenantId, valgtKunde.dineroKontaktId].filter(Boolean))] : [];
  const dineroFakturaer = vaerdier(input.dinero?.dokumenter?.faktura);
  const dineroKreditter = vaerdier(input.dinero?.dokumenter?.kreditnota);
  const grundlag = fladFakturagrundlag(input.fakturagrundlag);
  const jobs = vaerdier(input.fakturajobs);
  const lokaleFakturaer = jobs.map((job) => {
    const g = grundlag.find((x) => x.forretningsnoegle === job.forretningsnoegle || x.tenantId === job.tenantId && x.periode === job.periode);
    const s = g?.frigivelse || g;
    return s ? { ...s, guid: job.eksternReference || job.id, dato: iso(job.fakturadato) || `${job.periode}-01`, sendStatus: job.sendStatus, tenantId: job.tenantId, oprindelse: "veyro_job" } : null;
  }).filter(Boolean);
  const fakturaKilde = dineroFakturaer.length ? dineroFakturaer : lokaleFakturaer;
  const sendte = unikke(fakturaKilde.filter((f) => erDokumenteretSendt(f) && iPeriode(iso(f.dato), periode.fra, periode.til) && matcherKunde(f, kundeNoegler) && matcherModul(f, input.modulId)), (f) => f.guid || f.eksternReference);

  const lokaleKreditter = fladeKreditter(input.kreditnotaer).map((k) => ({
    ...k, guid: k.eksternReference || k.id, dato: iso(k.kreditdato) || iso(k.frigivelse?.frigivetMs ? new Date(k.frigivelse.frigivetMs).toISOString() : null),
    totalEksklMomsOere: k.beloebOere,
  }));
  const kreditKilde = dineroKreditter.length ? dineroKreditter : lokaleKreditter;
  const bogfoerteKreditter = unikke(kreditKilde.filter((k) => erBogfoertKredit(k) && iPeriode(iso(k.dato), periode.fra, periode.til) && matcherKunde(k, kundeNoegler) && matcherModul(k, input.modulId)), (k) => k.guid || k.id);
  const fakturaNettoOere = sendte.reduce((s, f) => s + (Number.isSafeInteger(f.totalEksklMomsOere) ? f.totalEksklMomsOere : f.beloebOere || 0), 0);
  const kreditNettoOere = bogfoerteKreditter.reduce((s, k) => s + Math.abs(Number.isSafeInteger(k.totalEksklMomsOere) ? k.totalEksklMomsOere : k.beloebOere || 0), 0);

  const valgteDineroFakturaer = dineroFakturaer.filter((f) => matcherKunde(f, kundeNoegler));
  const betalinger = valgteDineroFakturaer.flatMap((f) => vaerdier(f.betaling?.poster).map((p, indeks) => ({ ...p, fakturaGuid: f.guid, id: p.Guid || p.Id || `${f.guid}:${indeks}`, dato: iso(p.Date || p.PaymentDate || p.date), beloebOere: belobFraBetaling(p) })));
  const periodeBetalinger = unikke(betalinger.filter((p) => iPeriode(p.dato, periode.fra, periode.til) && Number.isSafeInteger(p.beloebOere)), (p) => p.id);
  const restPoster = valgteDineroFakturaer.filter((f) => Number.isSafeInteger(f.betaling?.restOere));
  const restUkendt = valgteDineroFakturaer.length - restPoster.length;
  const nuDato = input.nuDato || new Date().toISOString().slice(0, 10);
  const aldersgrupper = { ikkeForfalden: 0, dage1_30: 0, dage31_60: 0, dage61_90: 0, over90: 0, ukendt: 0 };
  for (const f of restPoster.filter((x) => x.betaling.restOere > 0)) {
    if (!f.forfaldsdato) { aldersgrupper.ukendt += f.betaling.restOere; continue; }
    const dage = Math.floor((Date.parse(`${nuDato}T00:00:00Z`) - Date.parse(`${f.forfaldsdato}T00:00:00Z`)) / 86400000);
    if (dage <= 0) aldersgrupper.ikkeForfalden += f.betaling.restOere;
    else if (dage <= 30) aldersgrupper.dage1_30 += f.betaling.restOere;
    else if (dage <= 60) aldersgrupper.dage31_60 += f.betaling.restOere;
    else if (dage <= 90) aldersgrupper.dage61_90 += f.betaling.restOere;
    else aldersgrupper.over90 += f.betaling.restOere;
  }

  const periodePoster = Object.fromEntries(Object.entries(input.dinero?.posteringer || {}).filter(([, p]) => {
    const mapping = input.dinero?.kontomapping?.[p.kontonummer];
    return iPeriode(iso(p.dato), periode.fra, periode.til) && (!input.kategori || mapping?.kategori === input.kategori);
  }));
  const omkostning = beregnBogfoerteOmkostninger(periodePoster, input.dinero?.kontomapping);
  const bilag = vaerdier(input.bilag);
  const aftaler = vaerdier(input.aftaler).filter((a) => a.status === "aktiv" && matcherKunde(a, kundeNoegler));
  const aftaleraekker = aftaler.map((aftale) => {
    const version = aftale.versioner?.[aftale.aktuelVersion]?.prisSnapshot || {};
    const linjer = version.linjer || version.beregning?.linjer || [];
    return { id: aftale.id, tenantId: aftale.tenantId, linjer, maanedligOere: version.beregning?.maanedlig?.beloebOere ?? version.maanedlig?.beloebOere ?? 0, introMaanedligOere: version.beregning?.introMaanedlig?.beloebOere ?? version.introMaanedlig?.beloebOere ?? null };
  }).filter((a) => matcherModul(a, input.modulId));
  const muligheder = crmMuligheder(input.crm).filter((m) => matcherKunde(m, kundeNoegler) && (!input.modulId || m.moduler?.includes(input.modulId)));
  const aktiviteter = crmAktiviteter(input.crm);
  const afsluttede = muligheder.filter((m) => ["vundet", "tabt"].includes(m.fase) && iPeriode(iso(m.afsluttetDato || m.opdateretDato), periode.fra, periode.til));
  const vundne = afsluttede.filter((m) => m.fase === "vundet").length;

  return {
    periode,
    filtre: { kundeId: input.kundeId || null, modulId: input.modulId || null, kategori: input.kategori || null },
    salg: { fakturaNettoOere, kreditNettoOere, faktureretNettoOere: fakturaNettoOere - kreditNettoOere, fakturaer: sendte, kreditter: bogfoerteKreditter, datakilde: dineroFakturaer.length ? "Dinero" : "Veyro-jobstatus", dataKomplet: dineroFakturaer.length > 0 && (!input.modulId || dineroFakturaer.every((f) => Array.isArray(f.linjer))) },
    betaling: { registreretOere: periodeBetalinger.reduce((s, p) => s + p.beloebOere, 0), poster: periodeBetalinger, restOere: restPoster.reduce((s, f) => s + f.betaling.restOere, 0), restUkendt, aldersgrupper },
    fakturaarbejde: { afventerFrigivelse: grundlag.filter((g) => !g.frigivelse).length, afventerAfsendelse: jobs.filter((j) => ["afventer", "anmodet", "arbejder"].includes(j.sendStatus)).length, afsendelsesfejl: jobs.filter((j) => ["fejl", "ukendt_udfald"].includes(j.sendStatus)).length },
    omkostning: { ...omkostning, dataKomplet: input.dinero?.synk?.status?.posteringer?.status === "ajour", datakilde: "Dinero-posteringer" },
    bilagsarbejde: { nye: bilag.filter((b) => ["ny", "under_behandling"].includes(b.status)).length, gennemgangOere: bilag.filter((b) => ["til_gennemgang", "godkendt", "klar_til_dinero"].includes(b.status)).reduce((s, b) => s + (b.metadata?.aktuel?.totalOere || 0), 0), muligeDubletter: bilag.filter((b) => b.status === "mulig_dublet").length, ukendtBeloeb: bilag.filter((b) => !Number.isSafeInteger(b.metadata?.aktuel?.totalOere)).length, bogfoertUdenBilag: omkostning.raekker.filter((p) => !Object.keys(p.bilagMatch || {}).length).length },
    abonnement: { aktive: aftaler.length, maanedligOere: aftaleraekker.reduce((s, a) => s + a.maanedligOere, 0), introMaanedligOere: aftaleraekker.reduce((s, a) => s + (a.introMaanedligOere ?? a.maanedligOere), 0), raekker: aftaleraekker },
    pipeline: { aabenMaanedligOere: muligheder.filter(erAabenMulighed).reduce((s, m) => s + (m.maanedligVaerdiOere || 0), 0), aabenEngangOere: muligheder.filter(erAabenMulighed).reduce((s, m) => s + (m.engangsVaerdiOere || 0), 0), udenNaeste: muligheder.filter((m) => erAabenMulighed(m) && !m.naesteAktivitetDato).length, vinderate: afsluttede.length ? vundne / afsluttede.length : null, vundne, afsluttede: afsluttede.length },
    opfoelgning: { forfaldne: aktiviteter.filter((a) => a.status !== "afsluttet" && a.fristDato && a.fristDato < nuDato).length },
  };
}
