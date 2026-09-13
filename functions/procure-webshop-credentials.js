import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function webshopKey(raw) {
  const key = Buffer.from(raw || "", "base64");
  if (key.length !== 32) throw new Error("Webshophemmeligheder er ikke konfigureret.");
  return key;
}

export function encryptWebshopCredential(credential, rawKey, iv = randomBytes(12)) {
  const cipher = createCipheriv("aes-256-gcm", webshopKey(rawKey), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credential), "utf8"), cipher.final()]);
  return {
    algoritme: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptWebshopCredential(record, rawKey) {
  if (record?.algoritme !== "aes-256-gcm") throw new Error("Ukendt krypteringsformat.");
  const decipher = createDecipheriv("aes-256-gcm", webshopKey(rawKey), Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}
