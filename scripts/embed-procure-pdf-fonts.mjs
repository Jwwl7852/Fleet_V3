/* Danner den synkrone fontressource, som deles af browser-preview og Functions.
 * Kilde-TTF'erne er den officielle Inter 4.1-udgivelse under SIL OFL 1.1. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontDirectory = join(root, "src", "fleet", "procure-v2", "fonts");
const output = join(root, "src", "fleet", "procure-v2", "procure-pdf-fonts.js");

const encode = (name) => readFileSync(join(fontDirectory, name)).toString("base64");
const wrap = (value) => value.match(/.{1,100}/g).map((part) => `  "${part}",`).join("\n");
const source = `/* GENERERET FIL - rediger ikke manuelt.
 * Kilder: fonts/Inter-Regular.ttf og fonts/Inter-Bold.ttf (Inter 4.1, SIL OFL 1.1).
 * Koer: node scripts/embed-procure-pdf-fonts.mjs */

export const INTER_REGULAR_BASE64 = [
${wrap(encode("Inter-Regular.ttf"))}
].join("");

export const INTER_BOLD_BASE64 = [
${wrap(encode("Inter-Bold.ttf"))}
].join("");
`;

writeFileSync(output, source, "utf8");
console.log(`Skrev ${output}`);
