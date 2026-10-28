import { describe, expect, it, vi } from "vitest"

import { AiServiceError } from "../../../templates/features/ai-services/common/ts/src/features/ai-services/core/errors"
import { parseCredentialMetadata, parseResolvedCredential } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/core/validation"
import type { CredentialBinding, CredentialSummary } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/core/types"
import type { LlmSettings, SavedModelConfig } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/types"
import { parseStoredSettings } from "../../../templates/features/llm-client/common/ts/src/features/llm-client/core/validation"
import {
  LlmSettingsController,
  type ConnectionTestPort,
  type CredentialSelectionPort,
  type SettingsState,
} from "../../../templates/features/llm-client/common/ts/src/features/llm-client/settings/settings-controller"
import { createRsaPrivateKeyPem } from "../../helpers/rsa-key-pair"

const KEY_ID = "11111111-1111-4111-8111-111111111111"
const MODEL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTHER_MODEL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function catalog(): LlmSettings {
  return parseStoredSettings({
    schemaVersion: 2,
    savedModelConfigs: [{
      id: MODEL_ID,
      name: "Primary Model",
      provider: "openai-compatible",
      authMode: "bearer",
      baseUrl: "https://llm.example/v1",
      modelId: "model-a",
      keyId: KEY_ID,
      timeoutMs: 60_000,
      reasoning: { provider: "openai-compatible", effort: null },
      flags: [],
      additionalJson: "",
    }, {
      id: OTHER_MODEL_ID,
      name: "Local Model",
      provider: "ollama",
      authMode: "none",
      baseUrl: "http://localhost:11434",
      modelId: "model-b",
      keyId: null,
      timeoutMs: 60_000,
      reasoning: { provider: "ollama", enabled: false },
      flags: [],
      additionalJson: "",
    }],
    selectedModelConfigId: MODEL_ID,
    defaultModelConfigId: MODEL_ID,
  })
}

function credentialSummary(): CredentialSummary {
  const metadata = parseCredentialMetadata({
    id: KEY_ID,
    name: "Primary Key",
    provider: "openai-compatible",
    kind: "api-key",
    authMode: "bearer",
    audience: "https://llm.example/v1/chat/completions",
    updatedAt: 1,
  })
  if (metadata === null) throw new TypeError("Expected credential metadata fixture.")
  return { ...metadata, status: "stored", credentialUpdatedAt: 1, maskedSecret: "tes…ret" }
}

function resolvedCredential() {
  const credential = parseResolvedCredential({
    schemaVersion: 2,
    keyId: KEY_ID,
    provider: "openai-compatible",
    kind: "api-key",
    audience: "https://llm.example/v1/chat/completions",
    revision: "revision",
    updatedAt: 1,
    secret: { apiKey: "test-secret" },
  })
  if (credential === null) throw new TypeError("Expected resolved credential fixture.")
  return credential
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

function createHarness(initial = catalog()) {
  let current = structuredClone(initial)
  const settings = {
    load: vi.fn(async (): Promise<LlmSettings> => structuredClone(current)),
    save: vi.fn(async (next: LlmSettings): Promise<void> => { current = structuredClone(next) }),
  }
  const compatible = vi.fn(async (_binding: CredentialBinding): Promise<readonly CredentialSummary[]> => [credentialSummary()])
  const resolve = vi.fn(async () => resolvedCredential())
  const credentials: CredentialSelectionPort = { listCompatible: compatible, resolveCredential: resolve }
  const testConnection = vi.fn(async (model: SavedModelConfig) => ({ provider: model.provider, model: model.modelId }))
  const client: ConnectionTestPort = { testConnection }
  const controller = new LlmSettingsController(settings, credentials, client, () => Promise.resolve({ platform: "web" }))
  let latest: SettingsState | undefined
  controller.subscribe(value => { latest = value })
  const state = (): SettingsState => {
    if (latest === undefined) throw new TypeError("Controller did not publish state.")
    return latest
  }
  return { client, compatible, controller, credentials, resolve, settings, state, testConnection }
}

describe("LlmSettingsController model catalog", () => {
  it("loads model summaries and compatible manager keys", async () => {
    const harness = createHarness()

    await harness.controller.load()

    expect(harness.state().modelSummaries).toHaveLength(2)
    expect(harness.state().compatibleKeys).toEqual([credentialSummary()])
    expect(harness.compatible).toHaveBeenCalledWith({
      provider: "openai-compatible",
      kind: "api-key",
      authMode: "bearer",
      audience: "https://llm.example/v1/chat/completions",
    })
  })

  it("creates models with provider defaults and no inline credential creation", async () => {
    const harness = createHarness()
    await harness.controller.load()

    harness.controller.createModel("google-vertex")
    expect(harness.state().modelDraft).toMatchObject({
      provider: "google-vertex",
      keyId: null,
      maxTokens: 1024,
      temperature: 1,
      topP: 0.95,
      topK: 40,
      location: "global",
    })
    expect(harness.resolve).not.toHaveBeenCalled()
  })

  it("links a compatible manager key and persists only the model document", async () => {
    const harness = createHarness()
    await harness.controller.load()
    const model = catalog().savedModelConfigs[0]
    if (model === undefined) throw new TypeError("Expected primary model fixture.")
    harness.controller.selectModelConfig(model.id)

    await harness.controller.linkModelKey(credentialSummary().id)
    await harness.controller.saveModel()

    expect(harness.state().modelDraft?.keyId).toBe(KEY_ID)
    expect(harness.settings.save).toHaveBeenCalledWith(expect.not.objectContaining({ savedKeys: expect.anything() }))
    expect(harness.resolve).not.toHaveBeenCalled()
  })

  it("derives Vertex project fields from the manager-resolved service account", async () => {
    const { pem } = await createRsaPrivateKeyPem()
    const vertexKey = parseCredentialMetadata({
      id: KEY_ID, name: "Vertex key", provider: "google-vertex", kind: "vertex-service-account",
      authMode: "service-account", audience: "vertex:project-a:us-central1", updatedAt: 1,
    })
    const vertexCredential = parseResolvedCredential({
      schemaVersion: 2, keyId: KEY_ID, provider: "google-vertex", kind: "vertex-service-account",
      audience: "vertex:project-a:us-central1", revision: "revision", updatedAt: 1,
      secret: { projectId: "project-a", location: "us-central1", clientEmail: "test@example.com", privateKey: pem },
    })
    if (vertexKey === null || vertexCredential === null) throw new TypeError("Expected Vertex fixtures.")
    const harness = createHarness()
    harness.compatible.mockResolvedValue([{ ...vertexKey, status: "stored", credentialUpdatedAt: 1, maskedSecret: "***" }])
    harness.resolve.mockResolvedValue(vertexCredential)
    await harness.controller.load()
    harness.controller.createModel("google-vertex")

    await harness.controller.linkModelKey(vertexKey.id)

    expect(harness.state().modelDraft).toMatchObject({ keyId: KEY_ID, projectId: "project-a", location: "us-central1" })
  })

  it("keeps no-auth models unlinked without creating a none-key record", async () => {
    const harness = createHarness()
    await harness.controller.load()
    harness.controller.createModel("ollama")
    const draft = harness.state().modelDraft
    if (draft === null) throw new TypeError("Expected an Ollama draft.")
    harness.controller.updateModelDraft({ ...draft, name: "Local", modelId: "llama3" })

    await harness.controller.saveModel()

    expect(harness.state().modelDraft?.keyId).toBeNull()
    expect(harness.resolve).not.toHaveBeenCalled()
    expect(harness.settings.save).toHaveBeenCalledWith(expect.not.objectContaining({ savedKeys: expect.anything() }))
  })

  it("rejects incompatible key links without changing the draft", async () => {
    const harness = createHarness()
    harness.compatible.mockResolvedValue([])
    await harness.controller.load()

    await harness.controller.linkModelKey(credentialSummary().id)

    expect(harness.state()).toMatchObject({ operation: "error", statusMessage: "Linked credential could not be loaded." })
    expect(harness.state().modelDraft?.keyId).toBe(KEY_ID)
  })

  it("tests an unsaved model draft with an explicitly manager-resolved credential", async () => {
    const harness = createHarness()
    await harness.controller.load()
    const draft = harness.state().modelDraft
    if (draft === null || draft.provider !== "openai-compatible") throw new TypeError("Expected OpenAI draft.")
    harness.controller.updateModelDraft({ ...draft, modelId: "unsaved-model" })

    await harness.controller.testConnection()

    expect(harness.resolve).toHaveBeenCalledWith(KEY_ID, expect.objectContaining({ provider: "openai-compatible" }))
    expect(harness.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "unsaved-model" }),
      resolvedCredential(),
      expect.any(AbortSignal),
    )
    expect(harness.settings.save).not.toHaveBeenCalled()
  })

  it("preserves public missing-credential errors during connection testing", async () => {
    const harness = createHarness()
    harness.resolve.mockRejectedValue(new AiServiceError("CREDENTIAL_MISSING", "A valid linked credential is required."))
    await harness.controller.load()

    await harness.controller.testConnection()

    expect(harness.testConnection).not.toHaveBeenCalled()
    expect(harness.state()).toMatchObject({ operation: "error", statusMessage: "A valid linked credential is required." })
  })

  it("deletes a model while retaining the remaining model selection", async () => {
    const harness = createHarness()
    await harness.controller.load()
    const model = catalog().savedModelConfigs[0]
    if (model === undefined) throw new TypeError("Expected primary model fixture.")

    await harness.controller.deleteModel(model.id, true)

    expect(harness.state().modelSummaries).toEqual([expect.objectContaining({ id: OTHER_MODEL_ID })])
    expect(harness.state().selectedModelConfigId).toBe(OTHER_MODEL_ID)
  })

  it("cancels a stale connection completion", async () => {
    const harness = createHarness()
    const completion = deferred<{ readonly provider: "openai-compatible"; readonly model: string }>()
    harness.testConnection.mockReturnValueOnce(completion.promise)
    await harness.controller.load()
    const test = harness.controller.testConnection()
    await vi.waitFor(() => expect(harness.testConnection).toHaveBeenCalledOnce())

    harness.controller.cancelTest()
    completion.resolve({ provider: "openai-compatible", model: "late" })
    await test

    expect(harness.state().operation).toBe("idle")
  })
})
