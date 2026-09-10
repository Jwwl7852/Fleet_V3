const GRAPH = "https://graph.microsoft.com/v1.0";

async function graphFetch(url, { token, method = "GET", body, headers = {} } = {}) {
  let svar;
  try {
    svar = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: 'IdType="ImmutableId"', ...headers },
      body: body == null ? undefined : JSON.stringify(body),
    });
  } catch (aarsag) {
    const fejl = new Error(`Microsoft Graph kunne ikke kontaktes: ${aarsag?.message || "netværksfejl"}`);
    fejl.ukendtUdfald = method !== "GET";
    throw fejl;
  }
  if (!svar.ok) {
    const tekst = await svar.text();
    const fejl = new Error(`Microsoft Graph svarede ${svar.status}: ${tekst.slice(0, 800)}`);
    fejl.status = svar.status;
    fejl.ukendtUdfald = false;
    throw fejl;
  }
  if (svar.status === 202 || svar.status === 204) return { accepteret: true, status: svar.status };
  return svar.json();
}

export async function hentGraphToken({ tenantId, clientId, clientSecret }) {
  const form = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  const svar = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  });
  if (!svar.ok) throw new Error(`Microsoft-identitet svarede ${svar.status}. Kontrollér Entra-konfiguration og secret.`);
  const data = await svar.json();
  if (!data.access_token) throw new Error("Microsoft-identitet returnerede intet access token.");
  return data.access_token;
}

export async function hentMailDelta({ token, mailboxId, folderId, deltaLink }) {
  const select = "$select=id,internetMessageId,conversationId,subject,body,from,toRecipients,receivedDateTime,sentDateTime,hasAttachments,internetMessageHeaders,isDraft";
  let url = deltaLink || `${GRAPH}/users/${encodeURIComponent(mailboxId)}/mailFolders/${encodeURIComponent(folderId)}/messages/delta?${select}`;
  const beskeder = [];
  for (let side = 0; url && side < 20; side += 1) {
    const data = await graphFetch(url, { token });
    beskeder.push(...(data.value || []));
    if (data["@odata.deltaLink"]) return { beskeder, deltaLink: data["@odata.deltaLink"] };
    url = data["@odata.nextLink"];
  }
  throw new Error("Graph delta blev ikke afsluttet inden for 20 sider; checkpoint er ikke ændret.");
}

export async function hentMailVedhaeftninger({ token, mailboxId, messageId }) {
  const data = await graphFetch(`/users/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`, { token });
  return (data.value || []).map((v) => ({ id: v.id, navn: v.name, mime: v.contentType, stoerrelse: v.size, inline: v.isInline === true, graphType: v["@odata.type"] || "" }));
}

export async function hentMailVedhaeftningBytes({ token, mailboxId, messageId, attachmentId }) {
  const svar = await fetch(`${GRAPH}/users/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`, { headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"' } });
  if (!svar.ok) throw new Error(`Graph-vedhæftning svarede ${svar.status}: ${(await svar.text()).slice(0, 500)}`);
  return Buffer.from(await svar.arrayBuffer());
}

export async function opretOgSendKladde({ token, mailboxId, mail, vedhaeftning }) {
  const headers = [{ name: "X-Veyro-Job-Id", value: mail.jobId }];
  const kladde = await graphFetch(`/users/${encodeURIComponent(mailboxId)}/messages`, { token, method: "POST", body: {
    subject: mail.emne, body: { contentType: "Text", content: `${mail.tekst}${mail.signatur ? `\n\n${mail.signatur}` : ""}` },
    toRecipients: [{ emailAddress: { address: mail.til } }], internetMessageHeaders: headers,
  }});
  if (!kladde.id) throw new Error("Graph oprettede en kladde uden id.");
  if (vedhaeftning) {
    if (vedhaeftning.bytes.length > 3 * 1024 * 1024) throw new Error("Tilbuds-PDF'en overstiger Graphs grænse for enkel vedhæftning; upload-session er ikke aktiveret.");
    await graphFetch(`/users/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(kladde.id)}/attachments`, { token, method: "POST", body: {
      "@odata.type": "#microsoft.graph.fileAttachment", name: vedhaeftning.navn,
      contentType: vedhaeftning.mime || "application/pdf", contentBytes: vedhaeftning.bytes.toString("base64"),
    }});
  }
  try {
    const resultat = await graphFetch(`/users/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(kladde.id)}/send`, { token, method: "POST" });
    return { providerDraftId: kladde.id, accepteret: resultat.accepteret === true };
  } catch (fejl) {
    fejl.providerDraftId = kladde.id;
    throw fejl;
  }
}
