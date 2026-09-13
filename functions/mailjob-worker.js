import { vurderMailjobFoerTransport } from "./salgsplatform.js";

export class MailjobWorkerFejl extends Error {
  constructor(kode, besked, detaljer = {}) {
    super(besked);
    this.name = "MailjobWorkerFejl";
    this.kode = kode;
    Object.assign(this, detaljer);
  }
}

const endeligeStatusser = new Set(["accepteret_af_graph", "dokumenteret_sendt", "ukendt"]);
const reserverbareStatusser = new Set(["kladde", "fejlet", "ikke_tilsluttet"]);
const kortFejl = (vaerdi) => String(vaerdi || "Ukendt transportfejl").slice(0, 800);

/**
 * Produktionskernen for en godkendt salgs-/supportmail. Den tager en transport
 * som dependency, så præcis samme reservation, sidste sagskontrol og
 * idempotente statusovergang kan køres mod emulatorerne uden Graph-credentials.
 * Hooken efterReservation er kun en intern dependency og eksponeres aldrig som
 * callable eller HTTP-kontrol.
 */
export async function koerMailjobWorker({
  db,
  jobId,
  forventetRevision,
  ejerUid,
  transport,
  efterReservation = async () => {},
  audit = async () => {},
  nu = () => Date.now(),
}) {
  if (!db || typeof transport !== "function") throw new TypeError("Mailjob-worker kræver database og transport.");
  const ref = db.ref(`udbyder/mailjobs/${jobId}`);
  const foer = (await ref.once("value")).val();
  if (!foer) throw new MailjobWorkerFejl("not-found", "Mailjobbet findes ikke.");
  if (endeligeStatusser.has(foer.status)) {
    throw new MailjobWorkerFejl("failed-precondition", "Mailjobbet har allerede et endeligt eller ukendt udfald og må ikke sendes blindt igen.");
  }
  if (Number(foer.revision || 0) !== Number(forventetRevision)) {
    throw new MailjobWorkerFejl("aborted", "Mailkladden blev ændret samtidigt.");
  }

  let afvisningsgrund = null;
  const reserve = await ref.transaction((aktuel) => {
    // Admin-SDK'et kan kalde transaktionsfunktionen med null, før serverens
    // aktuelle værdi er hentet. Den allerede læste og validerede værdi bruges
    // som første optimistiske forslag; serverens hashkontrol tvinger et retry,
    // hvis posten er ændret siden læsningen.
    const grundlag = aktuel || foer;
    if (!grundlag || Number(grundlag.revision || 0) !== Number(forventetRevision) || !reserverbareStatusser.has(grundlag.status)) {
      afvisningsgrund = { findes: Boolean(grundlag), revision: grundlag?.revision ?? null, status: grundlag?.status ?? null };
      return;
    }
    return {
      ...grundlag,
      status: "afsender",
      senesteForsoegMs: nu(),
      forsoeg: Number(grundlag.forsoeg || 0) + 1,
      revision: Number(grundlag.revision) + 1,
      opdateretAf: ejerUid,
    };
  });
  if (!reserve.committed) {
    throw new MailjobWorkerFejl("aborted", "Mailjobbet kunne ikke reserveres; genindlæs før nyt forsøg.", { afvisningsgrund });
  }

  const job = reserve.snapshot.val();
  await efterReservation({ db, job, jobId });
  try {
    if (["opfoelgning", "sagssvar"].includes(job.art)) {
      const friskTraad = (await db.ref(`udbyder/salgsindbakke/traade/${job.traadId}`).once("value")).val();
      const friskOpfoelgning = friskTraad?.opfoelgninger?.[job.opfoelgningId];
      const friskKladde = friskTraad?.svarKladder?.[job.svarKladdeId];
      const friskTilbudId = job.art === "opfoelgning" ? friskTraad?.links?.tilbudId : null;
      const friskTilbud = friskTilbudId
        ? (await db.ref(`udbyder/tilbud/${friskTilbudId}`).once("value")).val()
        : null;
      const sidsteKontrol = vurderMailjobFoerTransport({
        job,
        traad: friskTraad,
        opfoelgning: friskOpfoelgning,
        svarKladde: friskKladde,
        tilbud: friskTilbud,
        tilbudStatus: friskTilbud?.status,
      });
      if (!sidsteKontrol.tilladt) {
        const stoppetMs = nu();
        const pause = {
          status: "pauset",
          pauseAarsag: sidsteKontrol.aarsag,
          fejl: "Afsendelsen blev stoppet ved sidste kontrol før transport.",
          opdateretMs: stoppetMs,
        };
        await ref.update(pause);
        if (job.art === "opfoelgning" && friskOpfoelgning) {
          await db.ref(`udbyder/salgsindbakke/traade/${job.traadId}/opfoelgninger/${job.opfoelgningId}`).update({
            ...pause,
            revision: Number(friskOpfoelgning.revision || 0) + 1,
            pausetAf: "system",
            pausetMs: stoppetMs,
          });
        }
        throw new MailjobWorkerFejl("failed-precondition", "Afsendelsen blev stoppet, fordi sagen ændrede sig efter godkendelsen.", { stoppet: true, aarsag: sidsteKontrol.aarsag });
      }
    }

    const svar = await transport({ job: { ...job, jobId } });
    const accepteretMs = nu();
    const opdateringer = {
      [`udbyder/mailjobs/${jobId}/status`]: "accepteret_af_graph",
      [`udbyder/mailjobs/${jobId}/providerDraftId`]: svar?.providerDraftId || null,
      [`udbyder/mailjobs/${jobId}/graphAccepteretMs`]: accepteretMs,
      [`udbyder/mailjobs/${jobId}/fejl`]: null,
      [`udbyder/mailjobs/${jobId}/opdateretMs`]: accepteretMs,
    };
    if (job.art === "opfoelgning" && job.traadId && job.opfoelgningId) {
      const rod = `udbyder/salgsindbakke/traade/${job.traadId}/opfoelgninger/${job.opfoelgningId}`;
      opdateringer[`${rod}/status`] = "accepteret_af_graph";
      opdateringer[`${rod}/graphAccepteretMs`] = accepteretMs;
    }
    if (job.art === "sagssvar" && job.traadId && job.svarKladdeId) {
      const rod = `udbyder/salgsindbakke/traade/${job.traadId}/svarKladder/${job.svarKladdeId}`;
      opdateringer[`${rod}/status`] = "accepteret_af_graph";
      opdateringer[`${rod}/graphAccepteretMs`] = accepteretMs;
    }
    await db.ref().update(opdateringer);
    await audit({ ejerUid, jobId, job });
    return { ok: true, status: "accepteret_af_graph", dokumenteretSendt: false };
  } catch (aarsag) {
    if (aarsag?.stoppet) throw aarsag;
    const status = aarsag?.ukendtUdfald ? "ukendt" : "fejlet";
    const fejlMs = nu();
    const opdateringer = {
      [`udbyder/mailjobs/${jobId}/status`]: status,
      [`udbyder/mailjobs/${jobId}/fejl`]: kortFejl(aarsag?.message),
      [`udbyder/mailjobs/${jobId}/providerDraftId`]: aarsag?.providerDraftId || null,
      [`udbyder/mailjobs/${jobId}/opdateretMs`]: fejlMs,
    };
    if (job.art === "opfoelgning" && job.traadId && job.opfoelgningId) {
      const rod = `udbyder/salgsindbakke/traade/${job.traadId}/opfoelgninger/${job.opfoelgningId}`;
      opdateringer[`${rod}/status`] = status;
      opdateringer[`${rod}/fejl`] = kortFejl(aarsag?.message);
    }
    await db.ref().update(opdateringer);
    throw new MailjobWorkerFejl(status === "ukendt" ? "aborted" : "unavailable", `${kortFejl(aarsag?.message)}${status === "ukendt" ? " Udfaldet er ukendt; genudsend ikke før manuel afstemning." : ""}`, { status });
  }
}
