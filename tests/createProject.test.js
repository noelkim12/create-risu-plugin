import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, ProjectGenerator } = vi.hoisted(() => {
  const generate = vi.fn();
  const ProjectGenerator = vi.fn(function ProjectGenerator() {
    return { generate };
  });
  return { generate, ProjectGenerator };
});

vi.mock("../lib/core/ProjectGenerator.js", () => ({ ProjectGenerator }));

import { buildProjectConfig, createProjectFromOptions } from "../lib/createProject.js";

beforeEach(() => {
  ProjectGenerator.mockClear();
  generate.mockReset();
  generate.mockResolvedValue(undefined);
});

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

describe("createProjectFromOptions", () => {
  it("uses no features when features are omitted", async () => {
    await createProjectFromOptions({ projectName: "omitted-features" });

    expect(ProjectGenerator.mock.calls[0][0].toObject().features).toEqual([]);
  });

  it("forwards an empty feature list", async () => {
    await createProjectFromOptions({ projectName: "empty-features", features: [] });

    expect(ProjectGenerator.mock.calls[0][0].toObject().features).toEqual([]);
  });

  it("forwards requested public feature IDs in caller order", async () => {
    await createProjectFromOptions({
      projectName: "requested-features",
      features: ["reranker-client", "llm-client"]
    });

    expect(ProjectGenerator.mock.calls[0][0].toObject().features).toEqual([
      "reranker-client",
      "llm-client"
    ]);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("deduplicates requested public feature IDs in caller order", async () => {
    await createProjectFromOptions({
      projectName: "duplicate-features",
      features: ["embedding-client", "llm-client", "embedding-client"]
    });

    expect(ProjectGenerator.mock.calls[0][0].toObject().features).toEqual([
      "embedding-client",
      "llm-client"
    ]);
  });

  it("rejects unsupported feature IDs", async () => {
    await expect(createProjectFromOptions({
      projectName: "unsupported-features",
      features: ["unsupported-feature"]
    })).rejects.toThrow("Unsupported scaffold feature: unsupported-feature");
  });
});
