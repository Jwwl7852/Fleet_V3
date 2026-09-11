export function erEjerNavgruppeAaben({ gemt, noegle, aktiv }) {
  if (Object.prototype.hasOwnProperty.call(gemt || {}, noegle)) return gemt[noegle] === true;
  return Boolean(aktiv);
}

export function ejerVisningsnavn(bruger) {
  const navn = bruger?.displayName || bruger?.navn || "";
  return navn && !navn.includes("@") ? navn : "Ejer";
}

export function ejerInitialer(bruger) {
  return ejerVisningsnavn(bruger).split(/\s+/).filter(Boolean).slice(0, 2).map((del) => del[0]).join("").toUpperCase() || "EJ";
}
