// allow: SIZE_OK - the plan requires this focused catalog acceptance matrix in one suite.
import { describe, expect, it } from "vitest"

import { MODEL_FLAGS } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import {
  assertValidRequest,
  assertValidStreamRequest,
  createDefaultSettings,
  legacyDefaultSettings,
  migrateLegacyCatalog,
  parseStoredSettings,
  parseStoredSettingsDocument,
  validateProviderConfig,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"

const KEY_ID = "11111111-1111-4111-8111-111111111111"
const MODEL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTHER_KEY_ID = "22222222-2222-4222-8222-222222222222"
const OTHER_MODEL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function validSettingsDocument(flags: readonly string[] = ["hasImageInput", "hasStreaming", "geminiThinking"]): unknown {
  return {
    schemaVersion: 2,
    savedModelConfigs: [{
      id: MODEL_ID,
      name: "Gemini Flash",
      provider: "google-ai-studio",
      authMode: "api-key",
      modelId: "gemini-2.5-flash",
      keyId: KEY_ID,
      timeoutMs: 60_000,
      maxTokens: 1024,
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      thinkingTokens: 128,
      reasoning: { provider: "google-ai-studio", level: "low" },
      flags,
      additionalJson: "{\"toolConfig\":{\"functionCallingConfig\":{\"mode\":\"AUTO\"}}}",
    }],
    selectedModelConfigId: MODEL_ID,
    defaultModelConfigId: MODEL_ID,
  }
}

function openAiSettingsDocument(flags: readonly string[] = []): unknown {
  return {
    schemaVersion: 2,
    savedModelConfigs: [{
      id: MODEL_ID,
      name: "OpenAI Model",
      provider: "openai-compatible",
      authMode: "bearer",
      baseUrl: "https://api.example.com/v1",
      modelId: "test-model",
      keyId: KEY_ID,
      timeoutMs: 60_000,
      reasoning: { provider: "openai-compatible", effort: null },
      flags,
      additionalJson: "",
    }],
    selectedModelConfigId: MODEL_ID,
    defaultModelConfigId: MODEL_ID,
  }
}

function onlyModel(value: unknown) {
  const model = parseStoredSettings(value).savedModelConfigs[0]
  expect(model).toBeDefined()
  if (model === undefined) throw new TypeError("Expected one model fixture.")
  return model
}

describe("LLM catalog contracts and migration", () => {
  it("creates an empty secret-free schema v2 catalog", () => {
    const settings = createDefaultSettings()

    expect(settings).toEqual({
      schemaVersion: 2,
      savedModelConfigs: [],
      selectedModelConfigId: null,
      defaultModelConfigId: null,
    })
  })

  it("accepts exactly the requested symbolic flag contract", () => {
    expect(MODEL_FLAGS).toEqual([
      "hasImageInput", "hasImageOutput", "hasAudioInput", "hasAudioOutput",
      "hasPrefill", "hasCache", "hasFullSystemPrompt", "hasFirstSystemPrompt",
      "hasStreaming", "requiresAlternateRole", "mustStartWithUserInput", "hasVideoInput",
      "OAICompletionTokens", "DeveloperRole", "geminiThinking", "geminiBlockOff",
      "deepSeekPrefix", "deepSeekThinkingInput", "deepSeekThinkingOutput",
    ])
  })

  it("parses v2 IDs, parameters, flag defaults, and valid typed media content", () => {
    const result = parseStoredSettingsDocument(validSettingsDocument())
    const model = result.settings.savedModelConfigs[0]
    expect(model).toBeDefined()
    if (model === undefined) throw new TypeError("Expected one model fixture.")

    expect(result.requiresPersistence).toBe(false)
    expect(result.warnings).toEqual([])
    expect(model.id).toBe(MODEL_ID)
    expect(model.flags).toContain("hasImageInput")
    expect(() => assertValidRequest({
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Describe this image" },
          { type: "image", base64: "aGVsbG8=", mimeType: "image/png" },
        ],
      }],
    }, model)).not.toThrow()
  })

  it("round-trips unknown future flags and emits a typed warning", () => {
    const result = parseStoredSettingsDocument(validSettingsDocument([
      "hasImageInput",
      "hasStreaming",
      "geminiThinking",
      "futureSymbolicCapability",
    ]))

    expect(result.settings.savedModelConfigs[0]?.flags).toContain("futureSymbolicCapability")
    expect(result.warnings).toEqual([{
      code: "UNKNOWN_MODEL_FLAG",
      modelConfigId: MODEL_ID,
      flag: "futureSymbolicCapability",
    }])
  })

  it("migrates v1 models and compatible credentials in deterministic order without mutating input", () => {
    const legacy = legacyDefaultSettings()
    const source = {
      ...legacy,
      activeProvider: "openai-compatible",
      providers: {
        ...legacy.providers,
        "google-ai-studio": { ...legacy.providers["google-ai-studio"], model: "gemini-legacy" },
        "google-vertex": { ...legacy.providers["google-vertex"], model: "gemini-vertex-legacy" },
        "openai-compatible": {
          ...legacy.providers["openai-compatible"],
          baseUrl: "https://legacy.example.com/v1",
          model: "legacy-chat",
          customHeaderNames: ["X-Tenant"],
        },
        ollama: { ...legacy.providers.ollama, model: "llama-legacy" },
      },
    }
    const credential = {
      schemaVersion: 1,
      slot: "openai-compatible",
      audience: "https://legacy.example.com/v1/chat/completions",
      revision: "legacy-revision",
      updatedAt: 123,
      secret: { apiKey: "secret-value", "X-Tenant": "tenant-secret" },
    }
    const before = structuredClone({ source, credential })
    const generatedIds = [
      KEY_ID,
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      MODEL_ID,
      "55555555-5555-4555-8555-555555555555",
    ]
    let generatedIndex = 0

    const result = parseStoredSettingsDocument(source, {
      legacyCredentials: [credential],
      generateId: () => generatedIds[generatedIndex++] ?? "missing-id",
    })

    expect(result.requiresPersistence).toBe(true)
    expect(result.settings.schemaVersion).toBe(2)
    expect(result.settings.savedModelConfigs).toHaveLength(4)
    expect(result.settings.savedModelConfigs.every(model => model.flags.length === 0)).toBe(true)
    expect(result.settings.selectedModelConfigId).toBe(MODEL_ID)
    expect(result.legacyCatalog.keys).toEqual([{
      id: KEY_ID,
      name: "OpenAI-Compatible Key",
      provider: "openai-compatible",
      kind: "api-key",
      authMode: "bearer",
      audience: "https://legacy.example.com/v1/chat/completions",
      updatedAt: 123,
    }])
    expect(result.legacyCatalog.credentials[0]?.secret).toEqual({ apiKey: "secret-value", "X-Tenant": "tenant-secret" })
    expect(JSON.stringify(result.settings)).not.toContain("secret-value")
    expect({ source, credential }).toEqual(before)
  })

  it("rejects malformed legacy credentials without changing source records", () => {
    const source = legacyDefaultSettings()
    const malformedCredential = {
      schemaVersion: 1,
      slot: "google-ai-studio",
      audience: "https://generativelanguage.googleapis.com",
      revision: "legacy-revision",
      updatedAt: 123,
      secret: "plaintext-should-not-be-accepted",
    }
    const before = structuredClone({ source, malformedCredential })

    expect(() => migrateLegacyCatalog(source, { legacyCredentials: [malformedCredential] }))
      .toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
    expect({ source, malformedCredential }).toEqual(before)
  })

  it("rejects stale legacy credential audiences instead of silently linking them", () => {
    const source = legacyDefaultSettings()
    const staleCredential = {
      schemaVersion: 1,
      slot: "google-ai-studio",
      audience: "https://stale.example.com",
      revision: "legacy-revision",
      updatedAt: 123,
      secret: { apiKey: "secret-value" },
    }

    expect(() => migrateLegacyCatalog(source, { legacyCredentials: [staleCredential] }))
      .toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it.each([
    ["saved model", (settings: ReturnType<typeof parseStoredSettings>) => ({
      ...settings,
      savedModelConfigs: [...settings.savedModelConfigs, {
        ...settings.savedModelConfigs[0],
        id: OTHER_MODEL_ID,
        name: " GEMINI flash ",
      }],
    })],
  ])("rejects duplicate normalized %s names", (_label, duplicate) => {
    const settings = parseStoredSettings(validSettingsDocument())
    expect(() => parseStoredSettings(duplicate(settings)))
      .toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it("rejects linked keys when authentication is disabled", () => {
    const settings = parseStoredSettings(validSettingsDocument())
    const model = settings.savedModelConfigs[0]
    expect(model).toBeDefined()
    if (model === undefined) throw new TypeError("Expected one model fixture.")

    expect(() => parseStoredSettings({
      ...settings,
      savedModelConfigs: [{
        ...model,
        provider: "openai-compatible",
        authMode: "none",
        baseUrl: "https://api.example.com/v1",
        keyId: OTHER_KEY_ID,
        reasoning: { provider: "openai-compatible", effort: null },
      }],
    })).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it("rejects secret material in settings and model records", () => {
    const settings = parseStoredSettings(validSettingsDocument())
    expect(() => parseStoredSettings({
      ...settings,
      savedKeys: [{
        id: KEY_ID,
        name: "Studio Key",
        provider: "google-ai-studio",
        kind: "api-key",
        secret: "should-never-persist",
      }],
    })).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
    expect(() => parseStoredSettings({
      ...settings,
      savedModelConfigs: settings.savedModelConfigs.map(model => ({ ...model, apiKey: "should-never-persist" })),
    })).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
    expect(() => parseStoredSettings({
      ...settings,
      savedModelConfigs: settings.savedModelConfigs.map(model => ({
        ...model,
        additionalJson: "{\"nested\":{\"privateKey\":\"should-never-persist\"}}",
      })),
    })).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it.each([
    "accessToken",
    "ACCESS_TOKEN",
    "access-token",
    "clientSecret",
    "client_secret",
    "CLIENT-SECRET",
    "token",
    "x-api-key",
    "X_API_KEY",
    "xApiKey",
  ])("rejects persisted additional JSON credential alias %s", alias => {
    const settings = parseStoredSettings(validSettingsDocument())

    expect(() => parseStoredSettings({
      ...settings,
      savedModelConfigs: settings.savedModelConfigs.map(model => ({
        ...model,
        additionalJson: JSON.stringify({ nested: { [alias]: "credential-value" } }),
      })),
    })).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it.each(["tokenLimit", "monkey"])("rejects unknown additional JSON property %s", propertyName => {
    const settings = parseStoredSettings(validSettingsDocument())

    expect(() => parseStoredSettings({
      ...settings,
      savedModelConfigs: settings.savedModelConfigs.map(model => ({
        ...model,
        additionalJson: JSON.stringify({ [propertyName]: 1 }),
      })),
    })).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it("rejects provider-incompatible known flags", () => {
    expect(() => parseStoredSettings(validSettingsDocument([
      "hasImageInput",
      "geminiThinking",
      "DeveloperRole",
    ]))).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it("rejects malformed additional JSON", () => {
    const settings = parseStoredSettings(openAiSettingsDocument())
    expect(() => parseStoredSettings({
      ...settings,
      savedModelConfigs: settings.savedModelConfigs.map(model => ({ ...model, additionalJson: "[1,2,3]" })),
    })).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it.each([
    "{\"duplicate\":1,\"duplicate\":2}",
    "{\"nested\":{\"constructor\":true}}",
    "{\"nested\":[1]}",
    "null",
  ])("rejects duplicate, polluted, array, or primitive additional JSON %s", additionalJson => {
    const settings = parseStoredSettings(openAiSettingsDocument())
    expect(() => parseStoredSettings({
      ...settings,
      savedModelConfigs: settings.savedModelConfigs.map(model => ({ ...model, additionalJson })),
    })).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it("rejects malformed or unflagged media parts", () => {
    const flaggedModel = onlyModel(validSettingsDocument())
    const unflaggedModel = onlyModel(openAiSettingsDocument())
    const malformed = {
      messages: [{ role: "user", content: [{ type: "image", base64: "not base64", mimeType: "image/png" }] }],
    } as const
    const validImage = {
      messages: [{ role: "user", content: [{ type: "image", base64: "aGVsbG8=", mimeType: "image/png" }] }],
    } as const

    expect(() => assertValidRequest(malformed, flaggedModel))
      .toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
    expect(() => assertValidRequest(validImage, unflaggedModel))
      .toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it.each([
    "image/",
    "image",
    "image//png",
    "audio/png",
  ])("rejects malformed or mismatched image MIME type %s", mimeType => {
    const model = onlyModel(validSettingsDocument())
    const request = {
      messages: [{
        role: "user",
        content: [{ type: "image", base64: "aGVsbG8=", mimeType }],
      }],
    } as const

    expect(() => assertValidRequest(request, model))
      .toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it("accepts a syntactically valid matching media MIME type", () => {
    const model = onlyModel(validSettingsDocument())
    const request = {
      messages: [{
        role: "user",
        content: [{ type: "image", base64: "aGVsbG8=", mimeType: "image/svg+xml" }],
      }],
    } as const

    expect(() => assertValidRequest(request, model)).not.toThrow()
  })

  it("gates assistant prefill and streaming by symbolic flags", () => {
    const unflaggedModel = onlyModel(openAiSettingsDocument())
    const request = {
      messages: [{ role: "user", content: "Hello" }],
      prefill: { role: "assistant", content: "Prefix" },
    } as const

    expect(() => assertValidRequest(request, unflaggedModel))
      .toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
    expect(() => assertValidStreamRequest({ messages: request.messages }, unflaggedModel))
      .toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))

    const flaggedModel = onlyModel(openAiSettingsDocument(["hasPrefill", "hasStreaming"]))
    expect(() => assertValidRequest(request, flaggedModel)).not.toThrow()
    expect(() => assertValidStreamRequest({ messages: request.messages }, flaggedModel)).not.toThrow()
  })

  it("discriminates first-system support from system placement and flag absence", () => {
    const fullSystem = onlyModel(openAiSettingsDocument(["hasFullSystemPrompt"]))
    const firstSystem = onlyModel(openAiSettingsDocument(["hasFirstSystemPrompt"]))
    const unflagged = onlyModel(openAiSettingsDocument())
    const leadingSystemRequest = {
      messages: [
        { role: "system", content: "Policy" },
        { role: "user", content: "Hello" },
      ],
    } as const

    expect(() => assertValidRequest({
      messages: [{ role: "user", content: "Hello" }, { role: "system", content: "Later" }],
    }, fullSystem)).not.toThrow()
    expect(() => assertValidRequest(leadingSystemRequest, firstSystem)).not.toThrow()
    expect(() => assertValidRequest(leadingSystemRequest, unflagged))
      .toThrow(expect.objectContaining({ code: "CONFIG_INVALID", provider: "openai-compatible" }))
    expect(() => assertValidRequest({
      messages: [{ role: "user", content: "Hello" }, { role: "system", content: "Later" }],
    }, firstSystem)).toThrow(expect.objectContaining({ code: "CONFIG_INVALID", provider: "openai-compatible" }))
  })

  it("discriminates must-start user input without alternate-role support", () => {
    const mustStart = onlyModel(openAiSettingsDocument(["mustStartWithUserInput"]))
    const userFirst = {
      messages: [{ role: "user", content: "Hello" }],
    } as const

    expect(() => assertValidRequest({
      messages: [{ role: "assistant", content: "Initial answer" }],
    }, mustStart)).toThrow(expect.objectContaining({ code: "CONFIG_INVALID", provider: "openai-compatible" }))
    expect(() => assertValidRequest(userFirst, mustStart)).not.toThrow()
  })

  it("enforces developer, alternation, first-user, and prefill role constraints", () => {
    const fullSystem = onlyModel(openAiSettingsDocument(["hasFullSystemPrompt"]))
    const developer = onlyModel(openAiSettingsDocument(["DeveloperRole"]))
    const alternate = onlyModel(openAiSettingsDocument(["requiresAlternateRole", "mustStartWithUserInput", "hasPrefill"]))

    expect(() => assertValidRequest({ messages: [{ role: "developer", content: "Policy" }] }, developer)).not.toThrow()
    expect(() => assertValidRequest({ messages: [{ role: "developer", content: "Policy" }] }, fullSystem)).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
    expect(() => assertValidRequest({
      messages: [{ role: "assistant", content: "Hi" }, { role: "assistant", content: "Again" }],
    }, alternate)).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
    expect(() => assertValidRequest({
      messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }],
      prefill: { role: "assistant", content: "Again" },
    }, alternate)).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it("gates audio and video input plus cache references by selected flags", () => {
    const audioModel = onlyModel(openAiSettingsDocument(["hasAudioInput"]))
    const geminiCacheModel = onlyModel(validSettingsDocument(["geminiThinking", "hasCache", "hasVideoInput"]))
    const mediaRequest = {
      messages: [{ role: "user", content: [{ type: "audio", base64: "aGVsbG8=", mimeType: "audio/wav" }] }],
    } as const
    const videoRequest = {
      messages: [{ role: "user", content: [{ type: "video", base64: "aGVsbG8=", mimeType: "video/mp4" }] }],
    } as const

    expect(() => assertValidRequest(mediaRequest, audioModel)).not.toThrow()
    expect(() => assertValidRequest(videoRequest, audioModel)).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
    expect(() => assertValidRequest(videoRequest, geminiCacheModel)).not.toThrow()
    expect(() => assertValidRequest({ messages: [{ role: "user", content: "Hi" }], cache: { id: "cachedContents/one" } }, geminiCacheModel)).not.toThrow()
    expect(() => assertValidRequest({ messages: [{ role: "user", content: "Hi" }], cache: { id: "cachedContents/one" } }, audioModel)).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }))
  })

  it("retains legacy provider field validation for migration inputs", () => {
    const config = legacyDefaultSettings().providers["google-vertex"]
    expect(validateProviderConfig({
      ...config,
      authMode: "service-account",
      model: "gemini-test",
      projectId: "",
      location: "",
    })).toEqual({
      projectId: "Project ID is required for Service Account authentication.",
      location: "Location is required for Service Account authentication.",
    })
  })
})
