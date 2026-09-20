/* ⚠ KOPI — REDIGÉR IKKE HER.
 * Kilden er src/fleet/ressource-regler.js. Filen lægges af
 * scripts/kopier-delt.mjs, fordi Firebase kun deployer functions/-mappen.
 * test/functions-delt.test.mjs fejler hvis de to ikke er identiske.
 */
export const RESSOURCE_GRUPPER = Object.freeze([
  "enheder", "ejendomme", "medarbejdere", "medarbejderafdelinger", "kalenderkategorier",
  "units", "varer", "warehouse", "certifikater",
]);
export const HARDWARE_ARTER = Object.freeze(["obd", "gps"]);

const tekst = (vaerdi, maks = 100) => typeof vaerdi === "string"
  ? vaerdi.trim().slice(0, maks) : "";

export function validerRessourceKategori(input = {}, { tekniskeArter = null } = {}) {
  const fejl = {};
  const navn = tekst(input.navn, 80);
  const sortering = Number(input.sortering);
  if (!navn) fejl.navn = "Navn er påkrævet.";
  if (!Number.isInteger(sortering) || sortering < 0 || sortering > 9999) {
    fejl.sortering = "Sortering skal være et helt tal mellem 0 og 9999.";
  }
  const tekniskArt = tekst(input.tekniskArt, 40);
  if (tekniskeArter && !tekniskeArter.includes(tekniskArt)) {
    fejl.tekniskArt = "Vælg en teknisk grundtype.";
  }
  return {
    fejl,
    post: {
      navn, aktiv: input.aktiv !== false, sortering,
      ...(tekniskeArter ? { tekniskArt } : {}),
    },
  };
}

export function validerRessourceHardware(input = {}, art) {
  const fejl = {};
  if (!HARDWARE_ARTER.includes(art)) fejl.art = "Ukendt hardwaretype.";
  const serienummer = tekst(input.serienummer, 100);
  if (!serienummer) fejl.serienummer = "Serienummer er påkrævet.";
  const status = input.status === "inaktiv" ? "inaktiv" : "aktiv";
  if (status === "inaktiv" && input.tilknytning?.ressourceId) {
    fejl.status = "Tilknyttet hardware skal frigives, før det kan deaktiveres.";
  }
  return {
    fejl,
    post: {
      serienummer,
      leverandoer: tekst(input.leverandoer, 100),
      model: tekst(input.model, 100),
      status,
    },
  };
}

export function hardwareErLedig(hardware, { ressourceType, ressourceId } = {}) {
  if (!hardware || hardware.status !== "aktiv") return false;
  const link = hardware.tilknytning;
  return !link?.ressourceId
    || (link.ressourceType === ressourceType && link.ressourceId === ressourceId);
}

export function validerHardwareTilknytning({ art, hardwareId, ressourceType, ressourceId } = {}) {
  const fejl = {};
  if (!HARDWARE_ARTER.includes(art)) fejl.art = "Ukendt hardwaretype.";
  if (!tekst(hardwareId, 120)) fejl.hardwareId = "Vælg hardware.";
  const tilladtType = art === "obd" ? "enhed" : art === "gps" ? "unit" : null;
  if (ressourceType !== tilladtType) fejl.ressourceType = `${art?.toUpperCase() || "Hardware"} kan ikke knyttes til denne ressourcetype.`;
  if (!tekst(ressourceId, 160)) fejl.ressourceId = "Ressourcen mangler et stabilt ID.";
  return fejl;
}
