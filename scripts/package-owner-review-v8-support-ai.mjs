import {
  cpSync, existsSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync, writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(".");
const out = join(root, "VEYRO_EJERKONSOL_REVIEW_V8_SUPPORT_AI.zip");
const report = join(root, "docs", "VEYRO_EJERKONSOL_REVIEW_V8_SUPPORT_AI.md");
const status = join(root, "docs", "VEYRO_EJERKONSOL_STATUS_V1.md");
const contract = join(root, "docs", "VEYRO_EJER_SUPPORT_KONTRAKT_INPUT_V1.md");
const screenshots = join(root, "docs", "screenshots", "ejer-review-v8-support-ai");
const verification = join(root, "docs", "VEYRO_EJERKONSOL_REVIEW_V8_SUPPORT_AI_ARCHIVE.json");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? files(path) : [path];
});
const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
if (git.status !== 0) throw new Error(git.stderr || "HEAD kunne ikke læses");
const finalHead = git.stdout.trim();

for (const required of [report, status, contract, screenshots]) {
  if (!existsSync(required)) throw new Error(`Mangler: ${required}`);
}
const stage = mkdtempSync(join(tmpdir(), "veyro-ejer-v8-support-"));
const unpacked = mkdtempSync(join(tmpdir(), "veyro-ejer-v8-support-check-"));
try {
  for (const path of [report, status, contract]) cpSync(path, join(stage, basename(path)));
  cpSync(screenshots, join(stage, "screenshots"), { recursive: true });
  const entries = files(stage).map((path) => ({
    path: relative(stage, path).replaceAll("\\", "/"),
    bytes: statSync(path).size,
    sha256: sha256(path),
  })).sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(join(stage, "archive-manifest.json"), `${JSON.stringify({
    version: "V8 Support AI", finalHead, createdAt: new Date().toISOString(), entries,
  }, null, 2)}\n`);
  if (existsSync(out)) rmSync(out);
  const quote = (path) => path.replaceAll("'", "''");
  const zip = spawnSync("powershell", ["-NoProfile", "-Command",
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${quote(stage)}', '${quote(out)}', [System.IO.Compression.CompressionLevel]::Optimal, $false)`],
  { encoding: "utf8" });
  if (zip.status !== 0) throw new Error(zip.stderr || zip.stdout || ".NET ZIP-oprettelse fejlede");
  const unzip = spawnSync("powershell", ["-NoProfile", "-Command",
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${quote(out)}', '${quote(unpacked)}')`],
  { encoding: "utf8" });
  if (unzip.status !== 0) throw new Error(unzip.stderr || unzip.stdout || ".NET ZIP-kontroludpakning fejlede");
  const extracted = JSON.parse(readFileSync(join(unpacked, "archive-manifest.json"), "utf8"));
  const checks = extracted.entries.map((entry) => {
    const path = join(unpacked, ...entry.path.split("/"));
    return { ...entry, exists: existsSync(path), hashMatches: existsSync(path) && sha256(path) === entry.sha256 };
  });
  const result = {
    archive: out, bytes: statSync(out).size, sha256: sha256(out), finalHead,
    manifestEntries: checks.length, allEntriesMatch: checks.every((entry) => entry.exists && entry.hashMatches),
    verifiedByExtraction: true, checkedAt: new Date().toISOString(),
  };
  if (!result.allEntriesMatch) throw new Error("ZIP-indholdet matcher ikke manifestet");
  writeFileSync(verification, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  rmSync(stage, { recursive: true, force: true });
  rmSync(unpacked, { recursive: true, force: true });
}
