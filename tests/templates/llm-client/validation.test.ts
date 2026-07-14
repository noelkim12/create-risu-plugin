import { describe, expect, it } from "vitest"

import {
  assertValidRequest,
  createDefaultSettings,
  validateProviderConfig,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"

describe("LLM settings defaults and validation", () => {
  it("uses stable endpoints, empty model IDs, and a 60 second timeout", () => {
    const settings = createDefaultSettings()
    expect(settings.schemaVersion).toBe(1)
    expect(settings.activeProvider).toBe("google-ai-studio")
    expect(settings.providers["google-ai-studio"].model).toBe("")
    expect(settings.providers.ollama.baseUrl).toBe("http://127.0.0.1:11434/v1")
    expect(settings.providers.ollama.timeoutMs).toBe(60_000)
    expect(settings.providers["google-vertex"].authMode).toBe("api-key")
  })

  it("requires a model and validates provider-specific fields", () => {
    const settings = createDefaultSettings()
    expect(validateProviderConfig(settings.providers["google-ai-studio"]))
      .toEqual({ model: "Model is required." })

    expect(validateProviderConfig({
      ...settings.providers["google-vertex"],
      authMode: "service-account",
      model: "gemini-test",
      projectId: "",
      location: "",
    })).toEqual({
      projectId: "Project ID is required for Service Account authentication.",
      location: "Location is required for Service Account authentication.",
    })
  })

  it("rejects insecure public HTTP and URL credentials", () => {
    const settings = createDefaultSettings()
    expect(validateProviderConfig({
      ...settings.providers["openai-compatible"],
      model: "test-model",
      baseUrl: "http://api.example.com/v1",
    })).toHaveProperty("baseUrl")
    expect(validateProviderConfig({
      ...settings.providers["openai-compatible"],
      model: "test-model",
      baseUrl: "https://user:pass@example.com/v1",
    })).toHaveProperty("baseUrl")
  })

  it("rejects a Vertex location that could change the Google hostname", () => {
    const config = createDefaultSettings().providers["google-vertex"]
    expect(validateProviderConfig({
      ...config,
      authMode: "service-account",
      projectId: "project-a",
      location: "us-central1.evil.example",
      model: "gemini-test",
    })).toMatchObject({
      location: "Location must be global or a lowercase Google Cloud region name.",
    })
  })

  it.each([
    ["temperature", Number.NaN],
    ["temperature", Number.POSITIVE_INFINITY],
    ["topP", Number.NaN],
    ["topP", Number.POSITIVE_INFINITY],
  ] as const)("rejects non-finite %s", (field, value) => {
    expect(() => assertValidRequest({
      messages: [{ role: "user", content: "hello" }],
      [field]: value,
    })).toThrowError(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })
})
