import { createHash } from "node:crypto";

/* Kun valgt af Functions-emulatoren. Den afviser alle ikke-reserverede
   modtagere og kvitterer med hash af de bytes, transporten faktisk modtog. */
export const localTestMailAdapter = Object.freeze({
  async send({ til, attachments = [] }) {
    const recipients = String(til || "").split(/[;,]/).map((row) => row.trim()).filter(Boolean);
    if (!recipients.length || recipients.some((mail) => !mail.toLowerCase().endsWith(".invalid"))) {
      throw new Error("Lokal testtransport accepterer kun .invalid-modtagere.");
    }
    if (attachments.length !== 1 || attachments[0].contentType !== "application/pdf" || !Buffer.isBuffer(attachments[0].bytes)) {
      throw new Error("Lokal testtransport kræver præcis én PDF med faktiske bytes.");
    }
    const bytes = attachments[0].bytes;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return { providerId: `local-test-${sha256.slice(0, 16)}`, afsender: "testtransport@example.invalid",
      transportKvittering: { attachmentSha256: sha256, attachmentSize: bytes.length, attachmentName: attachments[0].filename } };
  },
});
