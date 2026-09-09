import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

async function collectTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTests(path));
    else if (entry.name.endsWith(".test.mjs")) files.push(path);
  }
  return files;
}

const files = (await collectTests(resolve("test"))).sort();
if (!files.length) throw new Error("Ingen platformtests blev fundet under test/.");

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
