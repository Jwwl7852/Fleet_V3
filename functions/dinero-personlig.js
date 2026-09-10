/* Serveradapter til Dineros personlige integration.
 * Ingen credentials eller token forlader Functions-processen. */

const API = "https://api.dinero.dk";
const AUTH = "https://authz.dinero.dk/dineroapi/oauth/token";

export class DineroFejl extends Error {
  constructor(message, { status = null, code = null, unknownOutcome = false, body = null } = {}) {
    super(message); this.name = "DineroFejl"; this.status = status; this.code = code;
    this.unknownOutcome = unknownOutcome; this.body = body;
  }
}

async function laesSvar(response) {
  const tekst = await response.text();
  if (!tekst) return null;
  try { return JSON.parse(tekst); } catch { return tekst; }
}

export async function hentDineroToken({ clientId, clientSecret, apiKey, fetchImpl = fetch }) {
  if (!clientId || !clientSecret || !apiKey) throw new DineroFejl("Dinero-credentials mangler.", { code: "IKKE_TILSLUTTET" });
  const body = new URLSearchParams({ grant_type: "password", scope: "read write", username: apiKey, password: apiKey });
  let response;
  try {
    response = await fetchImpl(AUTH, {
      method: "POST", headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      }, body,
    });
  } catch (error) {
    throw new DineroFejl(`Dinero-token kunne ikke hentes: ${error.message}`, { code: "NETVAERK" });
  }
  const data = await laesSvar(response);
  if (!response.ok || !data?.access_token) throw new DineroFejl("Dinero afviste autorisationen.", { status: response.status, body: data });
  return { accessToken: data.access_token, expiresIn: data.expires_in || 3600 };
}

export function dineroKlient({ organizationId, accessToken, fetchImpl = fetch }) {
  if (!organizationId || !accessToken) throw new DineroFejl("Dinero organisation eller token mangler.", { code: "IKKE_TILSLUTTET" });
  const kald = async (method, path, body) => {
    let response;
    try {
      response = await fetchImpl(`${API}${path}`, {
        method, headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...(body == null ? {} : { "content-type": "application/json" }) },
        body: body == null ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new DineroFejl(`Dinero-kaldet mistede forbindelsen: ${error.message}`, {
        code: "NETVAERK", unknownOutcome: !["GET", "HEAD"].includes(method),
      });
    }
    const data = await laesSvar(response);
    if (!response.ok) throw new DineroFejl(`Dinero svarede HTTP ${response.status}.`, { status: response.status, body: data });
    return data;
  };
  const sti = (suffix) => `/v1/${encodeURIComponent(organizationId)}${suffix}`;
  return {
    opretKreditnota: (body) => kald("POST", sti("/sales/creditnotes"), body),
    bogfoerKreditnota: (guid, timestamp, number = undefined) => kald("POST", sti(`/sales/creditnotes/${encodeURIComponent(guid)}/book`), { Timestamp: timestamp, ...(number == null ? {} : { Number: number }) }),
    sendKreditnota: (guid, body) => kald("POST", sti(`/sales/creditnotes/${encodeURIComponent(guid)}/email`), body),
    kreditnota: (guid) => kald("GET", sti(`/sales/creditnotes/${encodeURIComponent(guid)}`)),
    faktura: (guid) => kald("GET", sti(`/invoices/${encodeURIComponent(guid)}`)),
    betalinger: (art, guid) => kald("GET", sti(`/${art === "kreditnota" ? "sales/creditnotes" : "invoices"}/${encodeURIComponent(guid)}/payments`)),
    mailouts: (art, guid) => kald("GET", sti(`/${art === "kreditnota" ? "sales/creditnotes" : "invoices"}/${encodeURIComponent(guid)}/mailouts`)),
    poster: ({ fromDate, toDate, includePrimo = false }) => kald("GET", sti(`/entries?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&includePrimo=${includePrimo}`)),
    liste: (art, { changesSince, page = 0, pageSize = 100 } = {}) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(Math.min(1000, pageSize)) });
      if (changesSince) params.set("changesSince", changesSince);
      const ressource = art === "kreditnotaer" ? "sales/creditnotes" : "invoices";
      return kald("GET", sti(`/${ressource}?${params}`));
    },
  };
}

export function dineroKreditnotaCreateModel(snapshot, { invoiceGuid, externalReference, accountNumber = 1000 }) {
  return {
    CreditNoteFor: invoiceGuid, Currency: snapshot.valuta || "DKK", Language: "da-DK",
    ExternalReference: externalReference, Description: snapshot.aarsag,
    ProductLines: snapshot.linjer.map((linje) => ({
      LineType: "Product", Description: linje.navn, AccountNumber: accountNumber,
      Quantity: linje.antal / 1000,
      BaseAmountValue: linje.beloebOere / (linje.antal / 1000) / 100,
      Discount: 0,
    })),
  };
}

export async function hentAlleDineroSider(klient, art, { changesSince, pageSize = 100 } = {}) {
  const collection = [];
  for (let page = 0; ; page += 1) {
    const svar = await klient.liste(art, { changesSince, page, pageSize });
    const side = Array.isArray(svar) ? svar : (svar?.Collection || []);
    collection.push(...side);
    if (side.length < pageSize) return collection;
  }
}
