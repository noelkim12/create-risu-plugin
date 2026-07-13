import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FeatureComposer } from "../../lib/processors/FeatureComposer.js";

const roots = [];

async function fixture(framework, features) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "risu-feature-composer-"));
  roots.push(root);
  const templatesBaseDir = path.join(root, "templates");
  const targetDir = path.join(root, "target");
  await fs.ensureDir(targetDir);

  for (const layer of ["common", "vanilla", "svelte"]) {
    const marker = path.join(
      templatesBaseDir,
      "features/llm-client",
      layer,
      "ts/src/features/llm-client",
      `${layer}.ts`,
    );
    await fs.outputFile(marker, `export const layer = "${layer}";\n`);
  }

  return {
    composer: new FeatureComposer(
      { framework, features, targetDir },
      { templatesBaseDir },
    ),
    targetDir,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.remove(root)));
});

describe("FeatureComposer", () => {
  it("writes only a no-op bridge when features are OFF", async () => {
    const { composer, targetDir } = await fixture("vanilla", []);
    expect(composer.validateFeatures()).toBe(true);
    await composer.composeFeatures();

    expect(await fs.pathExists(path.join(targetDir, "src/features/llm-client"))).toBe(false);
    await expect(fs.readFile(path.join(targetDir, "src/features/generated.ts"), "utf8"))
      .resolves.toContain("void host");
  });

  it("copies common plus the selected framework and writes one registration", async () => {
    const { composer, targetDir } = await fixture("svelte", ["llm-client"]);
    await composer.composeFeatures();

    expect(await fs.pathExists(path.join(targetDir, "src/features/llm-client/common.ts"))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, "src/features/llm-client/svelte.ts"))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, "src/features/llm-client/vanilla.ts"))).toBe(false);

    const registry = await fs.readFile(path.join(targetDir, "src/features/generated.ts"), "utf8");
    expect(registry).toContain('import { registerLlmClientFeature } from "./llm-client/register";');
    expect(registry.match(/registerLlmClientFeature\(host\)/g)).toHaveLength(1);
  });

  it("fails instead of overwriting a base-template file", async () => {
    const { composer, targetDir } = await fixture("vanilla", ["llm-client"]);
    await fs.outputFile(
      path.join(targetDir, "src/features/llm-client/common.ts"),
      "base template owns this file\n",
    );
    await expect(composer.composeFeatures()).rejects.toThrow();
  });
});
