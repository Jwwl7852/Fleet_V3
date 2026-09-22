export function brugerInitialer(navn, email) {
  const kilde = String(navn || email || "?").trim();
  const dele = kilde.split(/[\s.@_-]+/).filter(Boolean);
  return dele.slice(0, 2).map((del) => del[0]).join("").toLocaleUpperCase("da-DK") || "?";
}
