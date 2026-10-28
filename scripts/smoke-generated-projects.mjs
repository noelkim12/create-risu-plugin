import fs from "fs-extra";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execa } from "execa";

import { ProjectConfig } from "../lib/core/ProjectConfig.js";
import { ProjectGenerator } from "../lib/core/ProjectGenerator.js";

const EXPECTED_ENGINES = { node: ">=20.19.0", npm: ">=10.0.0" };
const COMMON_DEV_DEPENDENCIES = ["@types/node", "esbuild", "typescript", "vite"];
const FORBIDDEN_SOURCE = /risuai\.addProvider|risuai\.runLLMModel|\bfetch\s*\(/;
const SEMVER_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const COMMAND_TIMEOUT_MS = {
  install: 300_000,
  typecheck: 60_000,
  build: 120_000,
};

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

async function runNpm(targetDir, args, timeoutMs) {
  await execa("npm", args, {
    cwd: targetDir,
    stdio: "inherit",
    timeout: timeoutMs,
    forceKillAfterDelay: 10_000,
  });
}

async function checkMockServer(targetDir) {
  const previousNodeEnv = process.env.NODE_ENV;
  const require = createRequire(path.join(targetDir, "package.json"));
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const server = await createServer({
    root: targetDir,
    configFile: path.join(targetDir, "vite.mock.config.ts"),
    server: { host: "127.0.0.1", port: 0, open: false },
  });
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert(address && typeof address !== "string", "Mock server did not bind a TCP port");
    for (const resource of ["/dev/", "/dev/plugin.html", "/dev/host.ts", "/dev/runtime.ts", "/src/main.ts"]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${resource}`);
      assert(response.ok, `Mock resource ${resource} failed: ${response.status}`);
      await response.text();
    }
  } finally {
    await server.close();
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

const rootPackage = await fs.readJson(path.resolve("package.json"));
assert(
  typeof rootPackage.version === "string" && SEMVER_VERSION.test(rootPackage.version),
  "CLI package version must be semantic version text",
);

const guideTemplate = path.resolve("templates/features/llm-client/common/ts/docs/llm-client.md");
const entrypointTemplate = path.resolve("templates/features/llm-client/common/ts/src/features/llm-client/index.ts");
assert(await fs.pathExists(guideTemplate), "llm-client generated guide template is missing");
assert(await fs.pathExists(entrypointTemplate), "llm-client public entrypoint template is missing");

const smokeRoot = path.resolve("tmpdir/llm-client-smoke");

async function runFixture(framework, enabled) {
  const name = `${framework}-llm-${enabled ? "on" : "off"}`;
  const targetDir = path.join(smokeRoot, name);
  const config = new ProjectConfig()
    .setProjectName(name)
    .setDescription("LLM feature smoke fixture")
    .setFramework(framework)
    .setFeatures(enabled
      ? ["llm-client", "embedding-client", "contextual-embedding-client", "reranker-client"]
      : []);
  config.targetDir = targetDir;

  await new ProjectGenerator(config).generate({ installDependencies: false });

  const featureDir = path.join(targetDir, "src/features/llm-client");
  const generatedGuide = path.join(targetDir, "docs/llm-client.md");
  const generatedEntrypoint = path.join(featureDir, "index.ts");
  assert(
    (await fs.pathExists(featureDir)) === enabled,
    `${name}: llm-client source presence did not match selection`,
  );
  assert(
    (await fs.pathExists(generatedGuide)) === enabled,
    `${name}: llm-client guide presence did not match selection`,
  );
  assert(
    (await fs.pathExists(generatedEntrypoint)) === enabled,
    `${name}: llm-client public entrypoint presence did not match selection`,
  );

  const featureFiles = enabled ? await recursiveFiles(featureDir) : [];
  if (enabled) {
    assert(featureFiles.includes("core/llm-client.ts"), `${name}: common client source is missing`);
    assert(featureFiles.includes("register.ts"), `${name}: framework registration source is missing`);
    assert(
      (await fs.readFile(generatedGuide, "utf8")) === await fs.readFile(guideTemplate, "utf8"),
      `${name}: generated guide differs from its canonical template`,
    );
    assert(
      (await fs.readFile(generatedEntrypoint, "utf8")) === await fs.readFile(entrypointTemplate, "utf8"),
      `${name}: generated public entrypoint differs from its canonical template`,
    );
    if (framework === "vanilla") {
      assert(
        featureFiles.includes("ui/settings-panel.ts"),
        `${name}: selected Vanilla settings UI is missing`,
      );
      assert(
        featureFiles.includes("ui/settings-panel.css"),
        `${name}: selected Vanilla settings UI stylesheet is missing`,
      );
      assert(
        !featureFiles.includes("ui/LlmSettingsPanel.svelte"),
        `${name}: vanilla output unexpectedly contains Svelte settings UI`,
      );
    } else {
      assert(
        featureFiles.includes("ui/LlmSettingsPanel.svelte"),
        `${name}: selected Svelte settings UI is missing`,
      );
      assert(
        !featureFiles.includes("ui/settings-panel.ts"),
        `${name}: svelte output unexpectedly contains Vanilla settings UI`,
      );
      assert(
        !featureFiles.includes("ui/settings-panel.css"),
        `${name}: svelte output unexpectedly contains Vanilla settings UI stylesheet`,
      );
    }
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

  const readme = await fs.readFile(path.join(targetDir, "README.md"), "utf8");
  assert(
    readme.includes("## LLM Client") === enabled,
    `${name}: README LLM section presence did not match selection`,
  );
  assert(
    readme.includes("modelConfigId") === enabled,
    `${name}: README direct-call model selection did not match selection`,
  );
  assert(
    readme.includes("llmClient.stream") === enabled,
    `${name}: README stream API documentation did not match selection`,
  );
  assert(
    readme.includes("<!-- ai-services-readme -->") === enabled,
    `${name}: AI Services README section presence did not match selection`,
  );

  await runNpm(targetDir, ["install"], COMMAND_TIMEOUT_MS.install);
  await runNpm(targetDir, ["run", "typecheck"], COMMAND_TIMEOUT_MS.typecheck);
  await runNpm(targetDir, ["run", "build"], COMMAND_TIMEOUT_MS.build);

  const distFiles = (await fs.readdir(path.join(targetDir, "dist")))
    .filter(file => file.endsWith(".js"));
  assert(
    JSON.stringify(distFiles) === JSON.stringify([`${name}.js`]),
    `${name}: expected only dist/${name}.js, found ${distFiles.join(", ")}`,
  );
  const bundle = await fs.readFile(path.join(targetDir, "dist", distFiles[0]), "utf8");
  assert(bundle.includes("//@api 3.0"), `${name}: bundle is missing //@api 3.0`);
  assert(!bundle.includes("risu-mock:"), `${name}: mock storage code leaked into the production bundle`);
  await checkMockServer(targetDir);
}

async function runSmoke() {
  await fs.remove(smokeRoot);
  try {
    await fs.ensureDir(smokeRoot);
    for (const framework of ["vanilla", "svelte"]) {
      for (const enabled of [false, true]) {
        await runFixture(framework, enabled);
      }
    }
  } finally {
    await fs.remove(smokeRoot);
  }
}

await runSmoke();
console.log("Smoke fixtures passed and cleaned.");
