export function mobilHandlingerFor(rute, stop) {
  let betydning = "opgave";
  if (rute?.rutetype === "hjemmepleje") betydning = "besøg";
  else if (rute?.rutetype === "transport" && (stop?.stoptype === "AFHENTNING" || /afhent/i.test(stop?.navn || ""))) betydning = "afhentning";
  else if (rute?.rutetype === "transport" && (stop?.stoptype === "LEVERING" || /lever/i.test(stop?.navn || ""))) betydning = "levering";
  else if (rute?.rutetype === "service") betydning = "serviceopgave";
  return { start: "Start", afslut: "Slut", startet: "Start", afsluttet: "Slut", betydning };
}
