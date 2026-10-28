import { vi } from "vitest"

vi.hoisted(() => { vi.stubGlobal("risuai", {}) })

import { AiServiceError } from "../../../templates/features/ai-services/common/ts/src/features/ai-services"
import { ContextualEmbeddingError } from "../../../templates/features/contextual-embedding-client/common/ts/src/features/contextual-embedding-client/core/errors"
import {
  isContextualEmbeddingConfigId,
  type ContextualEmbeddingConfig,
} from "../../../templates/features/contextual-embedding-client/common/ts/src/features/contextual-embedding-client/core/types"
import {
  ContextualEmbeddingSettingsController,
  type ContextualEmbeddingConfigEditingPort,
  type ContextualEmbeddingConnectionTestPort,
} from "../../../templates/features/contextual-embedding-client/common/ts/src/features/contextual-embedding-client/settings/settings-controller"
import {
  deferred,
  runConnectionControllerContract,
  type ConnectionControllerHarness,
} from "../../helpers/connection-controller-contract"

const CONFIG_ID_VALUE = "22222222-2222-4222-8222-222222222222"
if (!isContextualEmbeddingConfigId(CONFIG_ID_VALUE)) throw new TypeError("Invalid contextual embedding test configuration id.")
const CONFIG_ID = CONFIG_ID_VALUE

function createHarness(): ConnectionControllerHarness {
  const config: ContextualEmbeddingConfig = {
    id: CONFIG_ID,
    name: "Connection test",
    provider: "voyage",
    model: "test-model",
    credentialId: null,
    timeoutMs: 60_000,
    inputType: null,
    outputDimension: null,
    outputDtype: "float",
    base64: false,
    updatedAt: 1,
  }
  let loadImplementation = (): Promise<readonly ContextualEmbeddingConfig[]> => Promise.resolve([config])
  const create = vi.fn(async () => config)
  const update = vi.fn(async () => config)
  const remove = vi.fn(async () => undefined)
  const configs: ContextualEmbeddingConfigEditingPort = {
    list: vi.fn(() => loadImplementation()),
    create,
    update,
    delete: remove,
  }
  const signals: AbortSignal[] = []
  const success = { provider: "voyage", model: "test-model" } as const
  let testImplementation = (): Promise<typeof success> => Promise.resolve(success)
  const connectionTest: ContextualEmbeddingConnectionTestPort = {
    testConnection: (_configId, signal) => {
      signals.push(signal)
      return testImplementation()
    },
  }
  const controller = new ContextualEmbeddingSettingsController(
    configs,
    { list: async () => [] },
    connectionTest,
  )
  return {
    load: () => controller.load(),
    test: () => controller.testConnection(CONFIG_ID),
    cancel: () => controller.cancelTest(),
    state: () => {
      const state = controller.snapshot()
      return { operation: state.operation, statusMessage: state.statusMessage }
    },
    signals: () => signals,
    saveCount: () => create.mock.calls.length + update.mock.calls.length + remove.mock.calls.length,
    failWith: error => { testImplementation = () => Promise.reject(error) },
    deferTest: () => {
      const pending = deferred<typeof success>()
      testImplementation = () => pending.promise
      return { resolve: () => pending.resolve(success) }
    },
    deferLoad: () => {
      const pending = deferred<readonly ContextualEmbeddingConfig[]>()
      loadImplementation = () => pending.promise
      return { resolve: () => pending.resolve([config]) }
    },
    typedError: kind => kind === "shared"
      ? new AiServiceError("NETWORK_ERROR", "Safe shared failure.")
      : new ContextualEmbeddingError("AUTH_FAILED", "Safe capability failure."),
    genericFailureMessage: "Contextual embedding connection test failed.",
  }
}

runConnectionControllerContract("ContextualEmbeddingSettingsController connection test", createHarness)
