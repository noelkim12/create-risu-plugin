import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ConfigFileUpdater } from "../../lib/updaters/ConfigFileUpdater.js";

const roots = [];

async function fixture(enabled) {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "risu-readme-"));
  roots.push(targetDir);
  await fs.writeFile(path.join(targetDir, "README.md"), "# ${프로젝트명}\n", "utf8");

  const config = {
    targetDir,
    projectName: "sample-plugin",
    hasFeature: featureId => enabled && featureId === "llm-client",
  };

  return { targetDir, updater: new ConfigFileUpdater(config) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.remove(root)));
});

describe("ConfigFileUpdater LLM README", () => {
  it("leaves the base README unchanged when llm-client is off", async () => {
    const { targetDir, updater } = await fixture(false);

    await updater.updateReadme();

    await expect(fs.readFile(path.join(targetDir, "README.md"), "utf8"))
      .resolves.toBe("# sample-plugin\n");
  });

  it("appends the LLM quick start once when llm-client is on", async () => {
    const { targetDir, updater } = await fixture(true);

    await updater.updateReadme();
    await updater.updateReadme();

    const readme = await fs.readFile(path.join(targetDir, "README.md"), "utf8");
    expect(readme).toContain("## LLM Client");
    expect(readme).toContain("llmClient.complete");
    expect(readme).toContain("docs/llm-client.md");
    expect(readme.match(/## LLM Client/g)).toHaveLength(1);
  });
});
