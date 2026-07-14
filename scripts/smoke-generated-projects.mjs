import fs from "fs-extra";
import path from "node:path";
import { execa } from "execa";

import { ProjectConfig } from "../lib/core/ProjectConfig.js";
import { ProjectGenerator } from "../lib/core/ProjectGenerator.js";

const EXPECTED_ENGINES = { node: ">=20.19.0", npm: ">=10.0.0" };
const COMMON_DEV_DEPENDENCIES = ["@types/node", "esbuild", "typescript", "vite"];
const FORBIDDEN_SOURCE = /risuai\.addProvider|risuai\.runLLMModel|\bfetch\s*\(/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function recursiveFiles(directory) {
  return (await fs.readdir(directory, { recursive: true })).map(String);
}

function assertPackageContract(name, framework, packageJson) {
  assert(packageJson.version === "1.0.0", `${name}: generated package version changed`);
  assert(
    JSON.stringify(packageJson.engines) === JSON.stringify(EXPECTED_ENGINES),
    `${name}: generated runtime engine constraints changed`,
  );
  assert(
    Object.keys(packageJson.dependencies ?? {}).length === 0,
    `${name}: generated runtime dependencies must stay empty`,
  );
  const expectedDevDependencies = framework === "svelte"
    ? [...COMMON_DEV_DEPENDENCIES, "@sveltejs/vite-plugin-svelte", "svelte"].sort()
    : [...COMMON_DEV_DEPENDENCIES].sort();
  assert(
    JSON.stringify(Object.keys(packageJson.devDependencies ?? {}).sort())
      === JSON.stringify(expectedDevDependencies),
    `${name}: generated development dependency set changed`,
  );
}

const rootPackage = await fs.readJson(path.resolve("package.json"));
assert(rootPackage.version === "3.1.0", "CLI package version must remain 3.1.0");

const guideTemplate = path.resolve("templates/features/llm-client/common/ts/docs/llm-client.md");
assert(await fs.pathExists(guideTemplate), "llm-client generated guide template is missing");

const smokeRoot = path.resolve("tmpdir/llm-client-smoke");
await fs.remove(smokeRoot);
await fs.ensureDir(smokeRoot);

for (const framework of ["vanilla", "svelte"]) {
  for (const enabled of [false, true]) {
    const name = `${framework}-llm-${enabled ? "on" : "off"}`;
    const targetDir = path.join(smokeRoot, name);
    const config = new ProjectConfig()
      .setProjectName(name)
      .setDescription("LLM feature smoke fixture")
      .setFramework(framework)
      .setFeatures(enabled ? ["llm-client"] : []);
    config.targetDir = targetDir;

    await new ProjectGenerator(config).generate({ installDependencies: false });

    const featureDir = path.join(targetDir, "src/features/llm-client");
    const generatedGuide = path.join(targetDir, "docs/llm-client.md");
    assert(
      (await fs.pathExists(featureDir)) === enabled,
      `${name}: llm-client source presence did not match selection`,
    );
    assert(
      (await fs.pathExists(generatedGuide)) === enabled,
      `${name}: llm-client guide presence did not match selection`,
    );

    const featureFiles = enabled ? await recursiveFiles(featureDir) : [];
    if (enabled) {
      assert(featureFiles.includes("core/llm-client.ts"), `${name}: common client source is missing`);
      assert(featureFiles.includes("register.ts"), `${name}: framework registration source is missing`);
      assert(
        featureFiles.some(file => framework === "svelte"
          ? file.endsWith("LlmSettingsPanel.svelte")
          : file.endsWith("settings-panel.ts")),
        `${name}: selected framework settings UI is missing`,
      );
    }

    for (const relative of featureFiles) {
      if (!/\.(?:ts|svelte)$/.test(relative)) continue;
      const source = await fs.readFile(path.join(featureDir, relative), "utf8");
      if (FORBIDDEN_SOURCE.test(source)) {
        throw new Error(`${name}: forbidden provider registration or browser fetch in ${relative}`);
      }
    }

    const packageJson = await fs.readJson(path.join(targetDir, "package.json"));
    assertPackageContract(name, framework, packageJson);

    await execa("npm", ["install"], { cwd: targetDir, stdio: "inherit" });
    await execa("npm", ["run", "typecheck"], { cwd: targetDir, stdio: "inherit" });
    await execa("npm", ["run", "build"], { cwd: targetDir, stdio: "inherit" });

    const distFiles = (await fs.readdir(path.join(targetDir, "dist")))
      .filter(file => file.endsWith(".js"));
    assert(
      JSON.stringify(distFiles) === JSON.stringify([`${name}.js`]),
      `${name}: expected only dist/${name}.js, found ${distFiles.join(", ")}`,
    );
    const bundle = await fs.readFile(path.join(targetDir, "dist", distFiles[0]), "utf8");
    assert(bundle.includes("//@api 3.0"), `${name}: bundle is missing //@api 3.0`);
  }
}

console.log(`Smoke fixtures passed: ${smokeRoot}`);
