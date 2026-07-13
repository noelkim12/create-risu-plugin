import { describe, expect, it } from "vitest";

import { buildProjectConfig } from "../lib/createProject.js";

describe("buildProjectConfig", () => {
  it("propagates the framework and optional features", () => {
    const config = buildProjectConfig({
      projectName: "llm-feature",
      description: "LLM feature",
      framework: "svelte",
      features: ["llm-client"]
    });

    expect(config.toObject()).toMatchObject({
      projectName: "llm-feature",
      framework: "svelte",
      features: ["llm-client"]
    });
  });
});
