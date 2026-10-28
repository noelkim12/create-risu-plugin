import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectConfig } from "../../lib/core/ProjectConfig.js";
import { ProjectGenerator } from "../../lib/core/ProjectGenerator.js";

const roots = [];
const LLM_GUIDE_TEMPLATE = path.resolve("templates/features/llm-client/common/ts/docs/llm-client.md");
const LLM_ENTRYPOINT_TEMPLATE = path.resolve("templates/features/llm-client/common/ts/src/features/llm-client/index.ts");

async function generate(framework, enabled) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "risu-generator-"));
  roots.push(root);
  const targetDir = path.join(root, `${framework}-${enabled ? "on" : "off"}`);
  const config = new ProjectConfig()
    .setProjectName(path.basename(targetDir))
    .setDescription("Generated matrix fixture")
    .setFramework(framework)
    .setFeatures(enabled ? ["llm-client"] : []);
  config.targetDir = targetDir;

  await new ProjectGenerator(config).generate({ installDependencies: false });
  return targetDir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.remove(root)));
});

describe("ProjectGenerator feature matrix", () => {
  for (const framework of ["vanilla", "svelte"]) {
    for (const enabled of [false, true]) {
      it(`${framework} with llm-client ${enabled ? "ON" : "OFF"}`, async () => {
        const target = await generate(framework, enabled);
        const registry = await fs.readFile(path.join(target, "src/features/generated.ts"), "utf8");

        expect(registry).toContain("registerFeatures");
        expect(await fs.pathExists(path.join(target, "src/ui/container-host.ts"))).toBe(true);
        expect(await fs.pathExists(path.join(target, "src/features/llm-client"))).toBe(enabled);
        expect(registry.includes("registerLlmClientFeature")).toBe(enabled);
        expect(await fs.pathExists(path.join(target, "docs/llm-client.md"))).toBe(enabled);

        if (enabled) {
          await expect(fs.readFile(path.join(target, "docs/llm-client.md"), "utf8"))
            .resolves.toBe(await fs.readFile(LLM_GUIDE_TEMPLATE, "utf8"));
          await expect(fs.readFile(path.join(target, "src/features/llm-client/index.ts"), "utf8"))
            .resolves.toBe(await fs.readFile(LLM_ENTRYPOINT_TEMPLATE, "utf8"));
        }

        const main = await fs.readFile(path.join(target, "src/main.ts"), "utf8");
        expect(main).toContain("await registerFeatures(containerHost)");

        const readme = await fs.readFile(path.join(target, "README.md"), "utf8");
        expect(readme.includes("## LLM Client")).toBe(enabled);
        expect(readme.includes("llmClient.complete")).toBe(enabled);
        expect(readme.includes("modelConfigId")).toBe(enabled);
        expect(readme.includes("llmClient.stream")).toBe(enabled);
      });
    }
  }
});
