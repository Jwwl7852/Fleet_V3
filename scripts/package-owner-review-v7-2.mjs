import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(".");
const out = join(root, "docs", "VEYRO_EJERKONSOL_REVIEW_V7_2.zip");
const report = join(root, "docs", "VEYRO_EJERKONSOL_REVIEW_V7_2.md");
const status = join(root, "docs", "VEYRO_EJERKONSOL_STATUS_V1.md");
const screenshots = join(root, "docs", "screenshots", "ejer-review-v7-2");
const verification = join(root, "docs", "VEYRO_EJERKONSOL_REVIEW_V7_2_ARCHIVE.json");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? files(path) : [path];
});

for (const required of [report, status, screenshots]) if (!existsSync(required)) throw new Error(`Mangler: ${required}`);
const stage = mkdtempSync(join(tmpdir(), "veyro-ejer-v72-"));
const unpacked = mkdtempSync(join(tmpdir(), "veyro-ejer-v72-check-"));
try {
  cpSync(report, join(stage, basename(report)));
  cpSync(status, join(stage, basename(status)));
  cpSync(screenshots, join(stage, "screenshots"), { recursive: true });
  const manifestEntries = files(stage).map((path) => ({ path: relative(stage, path).replaceAll("\\", "/"), bytes: statSync(path).size, sha256: sha256(path) })).sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(join(stage, "archive-manifest.json"), JSON.stringify({ version: "V7.2", codeCommit: "f5533b190b48175bef22024cc4890d1ba6172011", entries: manifestEntries }, null, 2));
  if (existsSync(out)) rmSync(out);
  const zip = spawnSync("tar.exe", ["-a", "-c", "-f", out, "-C", stage, "."], { encoding: "utf8" });
  if (zip.status !== 0) throw new Error(zip.stderr || zip.stdout || "ZIP-oprettelse fejlede");
  const unzip = spawnSync("tar.exe", ["-x", "-f", out, "-C", unpacked], { encoding: "utf8" });
  if (unzip.status !== 0) throw new Error(unzip.stderr || unzip.stdout || "ZIP-kontroludpakning fejlede");
  const extracted = JSON.parse(readFileSync(join(unpacked, "archive-manifest.json"), "utf8"));
  const checks = extracted.entries.map((entry) => {
    const path = join(unpacked, ...entry.path.split("/"));
    return { ...entry, exists: existsSync(path), hashMatches: existsSync(path) && sha256(path) === entry.sha256 };
  });
  const result = { archive: out, bytes: statSync(out).size, sha256: sha256(out), manifestEntries: checks.length, allEntriesMatch: checks.every((entry) => entry.exists && entry.hashMatches), checkedAt: new Date().toISOString() };
  if (!result.allEntriesMatch) throw new Error("ZIP-indholdet matcher ikke manifestet");
  writeFileSync(verification, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  rmSync(stage, { recursive: true, force: true });
  rmSync(unpacked, { recursive: true, force: true });
}
