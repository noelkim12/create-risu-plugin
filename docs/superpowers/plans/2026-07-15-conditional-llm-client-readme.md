# Conditional LLM Client README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an LLM Client quick-start section to the generated root README only when the `llm-client` feature is selected.

**Architecture:** Keep the Markdown copy in a feature-owned fragment outside the copied TypeScript overlay. Extend `ConfigFileUpdater` to load and append that fragment after replacing the base README placeholders, guarded by `ProjectConfig.hasFeature("llm-client")` and an idempotence marker.

**Tech Stack:** Node.js ESM, `fs-extra`, Vitest, Markdown templates

## Global Constraints

- Projects without `llm-client` must retain the existing generated README content.
- Projects with `llm-client` must receive the same framework-independent LLM quick start.
- Do not add a new LLM wrapper; document the existing `llmClient.complete` API.
- Keep the detailed operational documentation in `docs/llm-client.md`.

---

### Task 1: Conditionally append the LLM Client quick start

**Files:**
- Create: `templates/features/llm-client/README.fragment.md`
- Create: `tests/updaters/ConfigFileUpdater.test.js`
- Modify: `lib/updaters/ConfigFileUpdater.js`
- Modify: `tests/core/ProjectGenerator.test.js`

**Interfaces:**
- Consumes: `config.hasFeature(featureId): boolean`, `config.targetDir`, and `config.projectName`.
- Produces: `ConfigFileUpdater.updateReadme(): Promise<void>` that appends the feature fragment once when `llm-client` is enabled.

- [ ] **Step 1: Write failing updater tests**

Create `tests/updaters/ConfigFileUpdater.test.js` with fixtures that write `# ${프로젝트명}\n` to a temporary root README. Assert that `updateReadme()` leaves feature-off output as `# sample-plugin\n`, appends an `## LLM Client` section containing `llmClient.complete` and `docs/llm-client.md` when enabled, and does not duplicate the section after two calls.

```js
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
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -- tests/updaters/ConfigFileUpdater.test.js`

Expected: the feature-on test fails because `ConfigFileUpdater` does not append an LLM section.

- [ ] **Step 3: Add the feature-owned README fragment**

Create `templates/features/llm-client/README.fragment.md` with an `<!-- llm-client-readme -->` marker, configuration instructions, a minimal `llmClient.complete` example, response and usage access, supported providers, limitations, the credential-storage warning, and a relative link to `docs/llm-client.md`.

````md
<!-- llm-client-readme -->
## LLM Client

This project includes the optional direct LLM client. Open **LLM Settings** in Risu, configure a provider, and run **Test Connection** before making requests.

```ts
import { llmClient } from "./src/features/llm-client"

const response = await llmClient.complete({
  messages: [{ role: "user", content: "Reply briefly." }],
})

console.log(response.text)
console.log(response.provider, response.model, response.usage)
```

The client supports Google AI Studio, Google Vertex, OpenAI-compatible endpoints, and Ollama. It is text-only and non-streaming. Provider credentials are stored unencrypted in Risu's device-local plugin storage, so use restricted credentials and avoid shared devices. See [the detailed LLM client guide](docs/llm-client.md) for authentication, runtime, and network details.
````

- [ ] **Step 4: Implement conditional, idempotent README composition**

In `lib/updaters/ConfigFileUpdater.js`, resolve the fragment relative to the module with `fileURLToPath(import.meta.url)`. After placeholder replacement, append `\n${fragment.trim()}\n` only when `this.config.hasFeature("llm-client")` is true and the README does not already contain `<!-- llm-client-readme -->`.

```js
import { fileURLToPath } from "node:url";

const LLM_README_MARKER = "<!-- llm-client-readme -->";
const LLM_README_PATH = fileURLToPath(new URL(
  "../../templates/features/llm-client/README.fragment.md",
  import.meta.url,
));

// Inside updateReadme(), after placeholder replacement:
if (this.config.hasFeature("llm-client") && !readme.includes(LLM_README_MARKER)) {
  const fragment = await fs.readFile(LLM_README_PATH, "utf8");
  readme = `${readme.trimEnd()}\n\n${fragment.trim()}\n`;
}
```

- [ ] **Step 5: Run the focused test to verify GREEN**

Run: `npm test -- tests/updaters/ConfigFileUpdater.test.js`

Expected: both tests pass.

- [ ] **Step 6: Add generated-project contract assertions**

In `tests/core/ProjectGenerator.test.js`, extend each existing Vanilla/Svelte × OFF/ON case after generation:

```js
const readme = await fs.readFile(path.join(target, "README.md"), "utf8");
expect(readme.includes("## LLM Client")).toBe(enabled);
expect(readme.includes("llmClient.complete")).toBe(enabled);
```

- [ ] **Step 7: Run integration and full verification**

Run: `npm test -- tests/core/ProjectGenerator.test.js tests/updaters/ConfigFileUpdater.test.js`

Expected: all focused unit and generation tests pass.

Run: `npm run test:all`

Expected: unit, legacy, and all Vanilla/Svelte × llm-client OFF/ON smoke checks pass, including generated install, typecheck, and build.

- [ ] **Step 8: Commit the implementation**

```bash
git add templates/features/llm-client/README.fragment.md \
  lib/updaters/ConfigFileUpdater.js \
  tests/updaters/ConfigFileUpdater.test.js \
  tests/core/ProjectGenerator.test.js
git commit -m "feat: document optional llm client in generated readme"
```
