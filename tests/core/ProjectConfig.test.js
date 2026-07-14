import { describe, expect, it } from "vitest";

import { ProjectConfig } from "../../lib/core/ProjectConfig.js";

const validConfig = () => new ProjectConfig()
  .setProjectName("feature-test")
  .setDescription("Feature test")
  .setFramework("vanilla");

describe("ProjectConfig features", () => {
  it("defaults to an empty selection", () => {
    const config = validConfig();
    expect(config.features).toEqual([]);
    expect(config.hasFeature("llm-client")).toBe(false);
  });

  it("normalizes duplicates and remains fluent", () => {
    const config = validConfig();
    expect(config.setFeatures(["llm-client", "llm-client"])).toBe(config);
    expect(config.features).toEqual(["llm-client"]);
    expect(config.hasFeature("llm-client")).toBe(true);
  });

  it("rejects unsupported feature IDs", () => {
    expect(() => validConfig().setFeatures(["unknown"])).toThrow(
      "Unsupported scaffold feature: unknown",
    );
  });

  it("revalidates a directly mutated feature array", () => {
    const config = validConfig().setFeatures(["llm-client"]);
    config.features.push("unknown");
    expect(() => config.validate()).toThrow("Unsupported scaffold feature: unknown");
  });

  it("returns a defensive feature copy", () => {
    const config = validConfig().setFeatures(["llm-client"]);
    const value = config.toObject();
    value.features.push("mutated");
    expect(config.features).toEqual(["llm-client"]);
  });
});
