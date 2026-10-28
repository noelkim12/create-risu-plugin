import { vi } from "vitest"

vi.hoisted(() => { vi.stubGlobal("risuai", {}) })

import { AiServiceError } from "../../../templates/features/ai-services/common/ts/src/features/ai-services"
import { RerankerError } from "../../../templates/features/reranker-client/common/ts/src/features/reranker-client/core/errors"
import {
  isRerankerConfigId,
  type RerankerConfig,
  type RerankerSettings,
} from "../../../templates/features/reranker-client/common/ts/src/features/reranker-client/core/types"
import {
  RerankerSettingsController,
  type RerankerConnectionTestPort,
  type RerankerSettingsRepositoryPort,
} from "../../../templates/features/reranker-client/common/ts/src/features/reranker-client/settings/settings-controller"
import {
  deferred,
  runConnectionControllerContract,
  type ConnectionControllerHarness,
} from "../../helpers/connection-controller-contract"

const CONFIG_ID_VALUE = "33333333-3333-4333-8333-333333333333"
if (!isRerankerConfigId(CONFIG_ID_VALUE)) throw new TypeError("Invalid reranker test configuration id.")
const CONFIG_ID = CONFIG_ID_VALUE

function createHarness(): ConnectionControllerHarness {
  const config: RerankerConfig = {
    id: CONFIG_ID,
    name: "Connection test",
    provider: "voyage",
    model: "test-model",
    credentialId: null,
    timeoutMs: 60_000,
    defaults: { topK: null, returnDocuments: false, truncation: true },
  }
  const document: RerankerSettings = { schemaVersion: 1, configs: [config] }
  let loadImplementation = (): Promise<RerankerSettings> => Promise.resolve(document)
  const save = vi.fn(async () => undefined)
  const repository: RerankerSettingsRepositoryPort = {
    load: vi.fn(() => loadImplementation()),
    save,
  }
  const signals: AbortSignal[] = []
  const success = { provider: "voyage", model: "test-model" } as const
  let testImplementation = (): Promise<typeof success> => Promise.resolve(success)
  const connectionTest: RerankerConnectionTestPort = {
    testConnection: (_configId, signal) => {
      signals.push(signal)
      return testImplementation()
    },
  }
  const controller = new RerankerSettingsController(
    repository,
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
    saveCount: () => save.mock.calls.length,
    failWith: error => { testImplementation = () => Promise.reject(error) },
    deferTest: () => {
      const pending = deferred<typeof success>()
      testImplementation = () => pending.promise
      return { resolve: () => pending.resolve(success) }
    },
    deferLoad: () => {
      const pending = deferred<RerankerSettings>()
      loadImplementation = () => pending.promise
      return { resolve: () => pending.resolve(document) }
    },
    typedError: kind => kind === "shared"
      ? new AiServiceError("NETWORK_ERROR", "Safe shared failure.")
      : new RerankerError("AUTH_FAILED", "Safe capability failure."),
    genericFailureMessage: "Reranker connection test failed.",
  }
}

runConnectionControllerContract("RerankerSettingsController connection test", createHarness)
