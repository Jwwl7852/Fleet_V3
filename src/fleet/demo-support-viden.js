/* Syntetisk, kundegodkendt fixture i den fælles vidensbasekontrakt. */
import { selvkontrol } from "./selvkontrol.js";

export const DEMO_SUPPORT_VIDEN = [{
  id: "demo-fakturacenter-status-v1",
  titel: "Find fakturaer der afventer kontrol",
  indhold: "Åbn Økonomi → Fakturacenter og vælg Til kontrol. Her kan du åbne fakturaen, gennemgå match og fordeling og derefter bruge den viste kontrolhandling. Hvis fakturaen ikke står på listen, så skriv hvilken sektion du ser og fakturaens lokale test-id.",
  kilde: "Fakturacenterets integrerede arbejdsflade /oekonomi/fakturacenter?sektion=kontrol",
  modul: "FAKTURACENTER",
  programversion: "3.0.0",
  noegleord: ["faktura", "kontrol", "match", "fordeling"],
  leveringsstatus: "tilgaengelig",
  godkendt: true,
  kundeGodkendt: true,
  aktuelVersion: 1,
}];

selvkontrol("demo-support-viden", () => {
  for (const post of DEMO_SUPPORT_VIDEN) {
    if (!post.id || !post.titel || !post.indhold || !post.kilde) {
      console.warn("demo-support-viden: en post mangler identitet, indhold eller kilde.");
    }
    if (post.godkendt !== true || post.kundeGodkendt !== true) {
      console.warn(`demo-support-viden: ${post.id} er ikke eksplicit kundegodkendt.`);
    }
    if (!Number.isInteger(post.aktuelVersion) || post.aktuelVersion < 1) {
      console.warn(`demo-support-viden: ${post.id} mangler en gyldig version.`);
    }
  }
});
