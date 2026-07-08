import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const BIN = path.resolve("bin/index.js");

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "crp-cli-"));
}

test("scaffolds a svelte plugin non-interactively", async () => {
  const out = path.join(makeTmpDir(), "my-cli-plugin");
  const { stdout } = await execFileAsync(process.execPath, [
    BIN, "my-cli-plugin",
    "--framework", "svelte",
    "--description", "CLI test plugin",
    "--out", out,
    "--skip-install",
  ]);

  assert.match(stdout, /created: /);
  const pkg = fs.readJsonSync(path.join(out, "package.json"));
  assert.equal(pkg.name, "my-cli-plugin");
  assert.equal(pkg.description, "CLI test plugin");
  assert.ok(fs.existsSync(path.join(out, "src", "App.svelte")));
});

test("defaults description and framework when omitted", async () => {
  const out = path.join(makeTmpDir(), "bare-plugin");
  await execFileAsync(process.execPath, [BIN, "bare-plugin", "--out", out, "--skip-install"]);

  const pkg = fs.readJsonSync(path.join(out, "package.json"));
  assert.equal(pkg.description, "Bare Plugin for RISU AI");
  // vanilla template has no App.svelte
  assert.ok(!fs.existsSync(path.join(out, "src", "App.svelte")));
  assert.ok(fs.existsSync(path.join(out, "vite.config.ts")));
});

test("exits non-zero for a non-kebab-case name", async () => {
  const out = path.join(makeTmpDir(), "bad");
  await assert.rejects(
    () => execFileAsync(process.execPath, [BIN, "Bad_Name", "--out", out, "--skip-install"]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /kebab-case/);
      return true;
    },
  );
});
