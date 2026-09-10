import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LOGO_STI = fileURLToPath(new URL("./assets/veyro-systems-logo.png", import.meta.url));
const NAVY = rgb(18 / 255, 43 / 255, 60 / 255);
const TURKIS = rgb(0 / 255, 166 / 255, 166 / 255);
const GRAA = rgb(91 / 255, 107 / 255, 118 / 255);
const LYS = rgb(239 / 255, 244 / 255, 246 / 255);
const A4 = [595.28, 841.89];

const tekst = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
const dk = (oere) => new Intl.NumberFormat("da-DK", {
  style: "currency", currency: "DKK", minimumFractionDigits: 2,
}).format((Number(oere) || 0) / 100);
const antal = (skalatal) => new Intl.NumberFormat("da-DK", { maximumFractionDigits: 3 }).format((Number(skalatal) || 0) / 1000);

function delTekst(font, vaerdi, bredde, stoerrelse) {
  const ord = tekst(vaerdi).split(/\s+/).filter(Boolean);
  const linjer = [];
  let linje = "";
  for (const ordDel of ord) {
    const kandidat = linje ? `${linje} ${ordDel}` : ordDel;
    if (font.widthOfTextAtSize(kandidat, stoerrelse) <= bredde) linje = kandidat;
    else {
      if (linje) linjer.push(linje);
      linje = ordDel;
    }
  }
  if (linje) linjer.push(linje);
  return linjer.length ? linjer : [""];
}

export async function genererTilbudsPdf({ tilbud, versionPost, virksomhed }) {
  const snapshot = versionPost?.snapshot;
  if (!snapshot?.beregning || !tilbud?.nummer || !versionPost?.version) {
    throw new Error("Et frosset tilbudssnapshot med nummer og version er påkrævet.");
  }
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${tilbud.nummer} v${versionPost.version}`);
  pdf.setAuthor("Veyro Systems");
  pdf.setSubject("Tilbud");
  pdf.setCreator("Veyro ejerkonsol");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fed = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await readFile(LOGO_STI));
  let side;
  let y;

  const nySide = () => {
    side = pdf.addPage(A4);
    const { width, height } = side.getSize();
    side.drawRectangle({ x: 0, y: height - 94, width, height: 94, color: NAVY });
    const skala = Math.min(150 / logo.width, 46 / logo.height);
    side.drawImage(logo, { x: 42, y: height - 72, width: logo.width * skala, height: logo.height * skala });
    side.drawText("TILBUD", { x: width - 118, y: height - 58, size: 18, font: fed, color: rgb(1, 1, 1) });
    y = height - 126;
    return side;
  };
  const sikr = (hoejde) => { if (y - hoejde < 54) nySide(); };
  const skriv = (vaerdi, x, stoerrelse = 9, font = normal, color = NAVY) => {
    side.drawText(tekst(vaerdi), { x, y, size: stoerrelse, font, color });
  };
  nySide();
  skriv(`${tilbud.nummer} · version ${versionPost.version}`, 42, 14, fed);
  y -= 18;
  skriv(`Udstedt ${snapshot.udstedelsesdato} · gyldigt til ${snapshot.gyldigTil}`, 42, 10, normal, GRAA);
  y -= 38;
  skriv(virksomhed?.stamdata?.navn || tilbud.virksomhedId, 42, 15, fed);
  y -= 18;
  if (snapshot.kontaktNavn || snapshot.kontaktEmail) {
    skriv([snapshot.kontaktNavn, snapshot.kontaktEmail].filter(Boolean).join(" · "), 42, 9, normal, GRAA);
    y -= 15;
  }
  y -= 12;

  const tegnTabelhoved = () => {
    side.drawRectangle({ x: 42, y: y - 5, width: 511, height: 22, color: LYS });
    skriv("Ydelse", 48, 8, fed); skriv("Antal", 330, 8, fed); skriv("Pris", 400, 8, fed); skriv("Linjetotal", 478, 8, fed);
    y -= 24;
  };
  tegnTabelhoved();
  for (const linje of snapshot.beregning.linjer || []) {
    const navnelinjer = delTekst(normal, linje.navn, 268, 8.5);
    const hoejde = Math.max(24, navnelinjer.length * 11 + 8);
    if (y - hoejde < 82) { nySide(); tegnTabelhoved(); }
    navnelinjer.forEach((t, i) => side.drawText(t, { x: 48, y: y - (i * 11), size: 8.5, font: normal, color: NAVY }));
    skriv(`${antal(linje.antal)} ${tekst(linje.enhed)}`, 330, 8.5);
    skriv(dk(linje.satsOere), 400, 8.5);
    skriv(dk(linje.linjetotalOere), 478, 8.5, fed);
    y -= hoejde;
    side.drawLine({ start: { x: 42, y: y + 8 }, end: { x: 553, y: y + 8 }, thickness: 0.5, color: LYS });
  }

  sikr(126);
  y -= 8;
  side.drawRectangle({ x: 315, y: y - 76, width: 238, height: 88, color: LYS });
  skriv("Månedligt ekskl. moms", 327, 9); skriv(dk(snapshot.beregning.maanedlig?.beloebOere), 465, 9, fed); y -= 20;
  skriv("Engangsbeløb ekskl. moms", 327, 9); skriv(dk(snapshot.beregning.engang?.beloebOere), 465, 9, fed); y -= 20;
  skriv("Første år ekskl. moms", 327, 9); skriv(dk(snapshot.beregning.foersteAarEksklMomsOere), 465, 9, fed); y -= 20;
  skriv(`Moms beregnes pr. linje · ${snapshot.valuta}`, 327, 8, normal, GRAA);
  y -= 44;

  const afsnit = (overskrift, indhold) => {
    if (!tekst(indhold)) return;
    const linjer = delTekst(normal, indhold, 511, 9);
    sikr(28 + linjer.length * 12);
    skriv(overskrift, 42, 10, fed, TURKIS); y -= 16;
    for (const linje of linjer) { skriv(linje, 42, 9); y -= 12; }
    y -= 8;
  };
  afsnit("Indledning", snapshot.indledning);
  afsnit("Kundens behov", snapshot.behovstekst);
  afsnit("Foreslået løsning", snapshot.loesningsbeskrivelse);
  afsnit("Vilkår", `Binding: ${snapshot.bindingMaaneder} måneder. Betaling: ${snapshot.betalingsbetingelser}.`);
  if (snapshot.introMaaneder > 0) afsnit("Introduktionsperiode", `${snapshot.introRabatBps / 100} % introduktionsrabat i ${snapshot.introMaaneder} måneder. Derefter gælder den aftalte pris.`);
  afsnit("Forudsætninger", snapshot.forudsaetninger);
  afsnit("Bemærkninger", snapshot.fritekst);

  for (const [indeks, p] of pdf.getPages().entries()) {
    p.drawText(`Veyro Systems · ${tilbud.nummer} · version ${versionPost.version}`, { x: 42, y: 28, size: 7, font: normal, color: GRAA });
    p.drawText(`Side ${indeks + 1} af ${pdf.getPageCount()}`, { x: 492, y: 28, size: 7, font: normal, color: GRAA });
  }
  return pdf.save();
}
