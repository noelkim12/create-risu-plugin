import { beforeEach, describe, expect, it, vi } from "vitest";

const prompt = vi.fn();
vi.mock("inquirer", () => ({ default: { prompt } }));

const { promptFeatures } = await import("../../lib/prompts/frameworkPrompts.js");

describe("promptFeatures", () => {
  beforeEach(() => prompt.mockReset());

  it("uses an OFF-by-default checkbox for llm-client", async () => {
    prompt.mockResolvedValue({ features: ["llm-client"] });

    await expect(promptFeatures()).resolves.toEqual(["llm-client"]);
    expect(prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "features",
        type: "checkbox",
        default: [],
        choices: [
          {
            name: "LLM client — call external LLM APIs directly",
            value: "llm-client"
          }
        ]
      })
    ]);
  });
});
