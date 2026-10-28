import { beforeEach, describe, expect, it, vi } from "vitest";

const prompt = vi.fn();
vi.mock("inquirer", () => ({ default: { prompt } }));

const { promptFeatures } = await import("../../lib/prompts/frameworkPrompts.js");

describe("promptFeatures", () => {
  beforeEach(() => prompt.mockReset());

  it("uses an OFF-by-default checkbox for the four public capabilities", async () => {
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
            },
            {
              name: "Embedding client — create text embeddings",
              value: "embedding-client"
            },
            {
              name: "Contextual embedding client — embed pre-chunked documents",
              value: "contextual-embedding-client"
            },
            {
              name: "Reranker client — score document relevance",
              value: "reranker-client"
            }
          ]
      })
    ]);
  });
});
