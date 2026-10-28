import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FeatureComposer } from "../../lib/processors/FeatureComposer.js";

const roots = [];
const publicFeatureIds = [
  "llm-client",
  "embedding-client",
  "contextual-embedding-client",
  "reranker-client",
];

async function fixture(framework, features) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "risu-feature-composer-"));
  roots.push(root);
  const templatesBaseDir = path.join(root, "templates");
  const targetDir = path.join(root, "target");
  await fs.ensureDir(targetDir);

  for (const layer of ["common", "vanilla", "svelte"]) {
    for (const featureId of publicFeatureIds) {
      const marker = path.join(
        templatesBaseDir,
        "features",
        featureId,
        layer,
        "ts/src/features",
        featureId,
        `${layer}.ts`,
      );
      await fs.outputFile(marker, `export const layer = "${layer}";\n`);
    }

    const dependencyMarker = path.join(
      templatesBaseDir,
      "features/ai-services",
      layer,
      "ts/src/features/ai-services",
      `${layer}.ts`,
    );
    await fs.outputFile(dependencyMarker, `export const layer = "${layer}";\n`);

    const managerMarker = path.join(
      templatesBaseDir,
      "features/credential-manager",
      layer,
      "ts/src/features/credential-manager",
      `${layer}.ts`,
    );
    await fs.outputFile(managerMarker, `export const layer = "${layer}";\n`);
  }
  await fs.outputFile(
    path.join(templatesBaseDir, "features/llm-client/common/ts/docs/llm-client.md"),
    "# Canonical LLM guide\n",
  );

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
    expect(await fs.pathExists(path.join(targetDir, "docs/llm-client.md"))).toBe(false);
    await expect(fs.readFile(path.join(targetDir, "src/features/generated.ts"), "utf8"))
      .resolves.toContain("void host");
  });

  it.each(publicFeatureIds)("resolves AI Services and credential-manager for %s", async featureId => {
    const { composer } = await fixture("vanilla", [featureId]);

    expect(composer.selectedDefinitions().map(definition => definition.id)).toEqual([
      "ai-services",
      "credential-manager",
      featureId,
    ]);
  });

  it("resolves private dependencies before the selected public feature", async () => {
    const { composer, targetDir } = await fixture("svelte", ["llm-client"]);
    await composer.composeFeatures();

    expect(await fs.pathExists(path.join(targetDir, "src/features/llm-client/common.ts"))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, "src/features/llm-client/svelte.ts"))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, "src/features/llm-client/vanilla.ts"))).toBe(false);
    await expect(fs.readFile(path.join(targetDir, "docs/llm-client.md"), "utf8"))
      .resolves.toBe("# Canonical LLM guide\n");

    const registry = await fs.readFile(path.join(targetDir, "src/features/generated.ts"), "utf8");
    expect(registry).toContain('import { registerAiServicesFeature } from "./ai-services/register";');
    expect(registry).toContain('import { registerCredentialManagerFeature } from "./credential-manager/register";');
    expect(registry).toContain('import { registerLlmClientFeature } from "./llm-client/register";');
    expect(registry.match(/registerAiServicesFeature\(host\)/g)).toHaveLength(1);
    expect(registry.match(/registerCredentialManagerFeature\(host\)/g)).toHaveLength(1);
    expect(registry.match(/registerLlmClientFeature\(host\)/g)).toHaveLength(1);
    expect(registry.indexOf("registerAiServicesFeature(host)"))
      .toBeLessThan(registry.indexOf("registerCredentialManagerFeature(host)"));
    expect(registry.indexOf("registerCredentialManagerFeature(host)"))
      .toBeLessThan(registry.indexOf("registerLlmClientFeature(host)"));
  });

  it("rejects an incomplete selected feature layer", async () => {
    const { composer } = await fixture("vanilla", ["llm-client"]);
    await fs.remove(path.join(composer.templatesBaseDir, "features/llm-client/vanilla/ts"));

    await expect(composer.composeFeatures()).rejects.toThrow("Feature template layer is missing");
  });

  it("fails instead of overwriting a base-template file", async () => {
    const { composer, targetDir } = await fixture("vanilla", ["llm-client"]);
    await fs.outputFile(
      path.join(targetDir, "src/features/llm-client/common.ts"),
      "base template owns this file\n",
    );
    await expect(composer.composeFeatures()).rejects.toThrow();
    await expect(fs.readFile(
      path.join(targetDir, "src/features/llm-client/common.ts"),
      "utf8",
    )).resolves.toBe("base template owns this file\n");
  });
});
