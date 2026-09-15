const internSti = (vaerdi) => {
  if (typeof vaerdi !== "string" || !vaerdi.startsWith("/")
    || vaerdi.startsWith("//") || vaerdi.includes("\\")) return null;
  try {
    const url = new URL(vaerdi, "https://veyro.invalid");
    if (url.origin !== "https://veyro.invalid") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

export function opretReturtilstand(sti, scrollY = 0) {
  const sikkerSti = internSti(sti);
  return sikkerSti ? {
    veyroRetur: {
      sti: sikkerSti,
      scrollY: Math.max(0, Number.isFinite(Number(scrollY)) ? Number(scrollY) : 0),
    },
  } : {};
}

export function afgoerRetur({ tilstand, fallback, tilladteRodstier = [] } = {}) {
  const fallbackSti = internSti(fallback) || "/";
  const retur = tilstand?.veyroRetur;
  const returSti = internSti(retur?.sti);
  const tilladt = returSti && (!tilladteRodstier.length || tilladteRodstier.some((rod) => {
    const rodSti = internSti(rod)?.split(/[?#]/)[0] || "";
    const sikkerRod = rodSti === "/" ? "/" : rodSti.replace(/\/$/, "");
    const stiUdenParametre = returSti.split(/[?#]/)[0];
    return sikkerRod === "/" || (sikkerRod && (stiUdenParametre === sikkerRod || stiUdenParametre.startsWith(`${sikkerRod}/`)));
  }));
  return tilladt
    ? { handling: "historik", sti: returSti, scrollY: Math.max(0, Number(retur?.scrollY) || 0) }
    : { handling: "fallback", sti: fallbackSti, scrollY: 0 };
}
