import { vi } from "vitest"

vi.hoisted(() => { vi.stubGlobal("risuai", {}) })

import { AiServiceError } from "../../../templates/features/ai-services/common/ts/src/features/ai-services"
import { EmbeddingError } from "../../../templates/features/embedding-client/common/ts/src/features/embedding-client/core/errors"
import {
  isEmbeddingConfigId,
  type EmbeddingSettings,
} from "../../../templates/features/embedding-client/common/ts/src/features/embedding-client/core/types"
import {
  EmbeddingSettingsController,
  type EmbeddingConnectionTestPort,
  type EmbeddingCredentialPort,
} from "../../../templates/features/embedding-client/common/ts/src/features/embedding-client/settings/embedding-controller"
import {
  deferred,
  runConnectionControllerContract,
  type ConnectionControllerHarness,
} from "../../helpers/connection-controller-contract"

const CONFIG_ID_VALUE = "11111111-1111-4111-8111-111111111111"
if (!isEmbeddingConfigId(CONFIG_ID_VALUE)) throw new TypeError("Invalid embedding test configuration id.")
const CONFIG_ID = CONFIG_ID_VALUE

function createHarness(): ConnectionControllerHarness {
  const document: EmbeddingSettings = {
    schemaVersion: 1,
    configs: [{
      id: CONFIG_ID,
      name: "Connection test",
      provider: "openai-compatible",
      modelId: "test-model",
      credentialId: null,
      timeoutMs: 60_000,
      endpoint: "https://embedding.example/v1/embeddings",
      authMode: "none",
      dimensions: null,
      encodingFormat: "float",
    }],
  }
  let loadImplementation = (): Promise<EmbeddingSettings> => Promise.resolve(structuredClone(document))
  const settings = {
    load: vi.fn(() => loadImplementation()),
    save: vi.fn(async (_settings: EmbeddingSettings): Promise<void> => undefined),
  }
  const credentials: EmbeddingCredentialPort = {
    list: async () => [],
  }
  const signals: AbortSignal[] = []
  const success = { provider: "voyage", model: "test-model" } as const
  let testImplementation = (): Promise<typeof success> => Promise.resolve(success)
  const connectionTest: EmbeddingConnectionTestPort = {
    testConnection: (_configId, signal) => {
      signals.push(signal)
      return testImplementation()
    },
  }
  const controller = new EmbeddingSettingsController({
    settings,
    credentials,
    connectionTest,
  })
  return {
    load: () => controller.load(),
    test: () => controller.testConnection(CONFIG_ID),
    cancel: () => controller.cancelTest(),
    state: () => {
      const state = controller.snapshot()
      return { operation: state.operation, statusMessage: state.statusMessage }
    },
    signals: () => signals,
    saveCount: () => settings.save.mock.calls.length,
    failWith: error => { testImplementation = () => Promise.reject(error) },
    deferTest: () => {
      const pending = deferred<typeof success>()
      testImplementation = () => pending.promise
      return { resolve: () => pending.resolve(success) }
    },
    deferLoad: () => {
      const pending = deferred<EmbeddingSettings>()
      loadImplementation = () => pending.promise
      return { resolve: () => pending.resolve(structuredClone(document)) }
    },
    typedError: kind => kind === "shared"
      ? new AiServiceError("NETWORK_ERROR", "Safe shared failure.")
      : new EmbeddingError("AUTH_FAILED", "Safe capability failure."),
    genericFailureMessage: "Embedding connection test failed.",
  }
}

runConnectionControllerContract("EmbeddingSettingsController connection test", createHarness)
