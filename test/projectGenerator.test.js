import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { ProjectConfig } from "../lib/core/ProjectConfig.js";
import { ProjectGenerator } from "../lib/core/ProjectGenerator.js";

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "crp-test-"));
}

test("setTargetDir overrides the cwd-based default", () => {
  const config = new ProjectConfig()
    .setProjectName("my-test-plugin")
    .setTargetDir("/tmp/some/other/place");
  assert.equal(config.targetDir, path.resolve("/tmp/some/other/place"));
});

test("generate scaffolds a vanilla project without npm install when skipInstall is set", async () => {
  const target = path.join(makeTmpDir(), "my-test-plugin");
  const config = new ProjectConfig()
    .setProjectName("my-test-plugin")
    .setDescription("Test plugin")
    .setFramework("vanilla")
    .setTargetDir(target);

  await new ProjectGenerator(config, { skipInstall: true }).generate();

  const pkg = fs.readJsonSync(path.join(target, "package.json"));
  assert.equal(pkg.name, "my-test-plugin");
  assert.equal(pkg.description, "Test plugin");
  assert.ok(fs.existsSync(path.join(target, "vite.config.ts")));
  assert.ok(fs.existsSync(path.join(target, ".gitignore")));
  assert.ok(fs.existsSync(path.join(target, "src", "main.ts")));
  assert.ok(!fs.existsSync(path.join(target, "node_modules")));
});

test("generate throws instead of exiting when the target directory exists", async () => {
  const target = path.join(makeTmpDir(), "already-there");
  fs.mkdirpSync(target);
  const config = new ProjectConfig()
    .setProjectName("already-there")
    .setDescription("dup")
    .setFramework("vanilla")
    .setTargetDir(target);

  await assert.rejects(
    () => new ProjectGenerator(config, { skipInstall: true }).generate(),
    /이미 존재/,
  );
});
