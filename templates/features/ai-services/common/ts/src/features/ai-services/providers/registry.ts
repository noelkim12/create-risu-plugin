import { AiServiceError } from "./../core/errors"
import type {
  RetrievalCapabilityId,
  RetrievalProviderAuthMode,
  RetrievalProviderId,
} from "./../core/types"

export type RetrievalProviderRegistration = {
  readonly id: RetrievalProviderId
  readonly supportedCapabilities: readonly RetrievalCapabilityId[]
  readonly supportedAuthModes: readonly RetrievalProviderAuthMode[]
}

export const INITIAL_RETRIEVAL_PROVIDERS = [
  {
    id: "voyage",
    supportedCapabilities: ["embedding", "contextual-embedding", "reranker"],
    supportedAuthModes: ["bearer"],
  },
  {
    id: "openai-compatible",
    supportedCapabilities: ["embedding"],
    supportedAuthModes: ["bearer", "none"],
  },
] as const satisfies readonly RetrievalProviderRegistration[]

export class RetrievalProviderRegistry {
  private readonly registrations = new Map<RetrievalProviderId, RetrievalProviderRegistration>()

  constructor(registrations: readonly RetrievalProviderRegistration[] = INITIAL_RETRIEVAL_PROVIDERS) {
    for (const registration of registrations) this.register(registration)
  }

  register(registration: RetrievalProviderRegistration): void {
    if (this.registrations.has(registration.id)) {
      throw new AiServiceError("CONFIG_INVALID", "A retrieval provider is already registered.", {
        provider: registration.id,
      })
    }
    this.registrations.set(registration.id, {
      id: registration.id,
      supportedCapabilities: [...registration.supportedCapabilities],
      supportedAuthModes: [...registration.supportedAuthModes],
    })
  }

  get(provider: RetrievalProviderId): RetrievalProviderRegistration {
    const registration = this.registrations.get(provider)
    if (registration === undefined) {
      throw new AiServiceError("CONFIG_INVALID", "The retrieval provider is not registered.", { provider })
    }
    return registration
  }

  assertSupports(provider: RetrievalProviderId, capability: RetrievalCapabilityId): void {
    if (!this.get(provider).supportedCapabilities.includes(capability)) {
      throw new AiServiceError("UNSUPPORTED_CAPABILITY", "The provider does not support this retrieval capability.", {
        provider,
        capability,
      })
    }
  }

  assertSupportsAuthMode(provider: RetrievalProviderId, authMode: RetrievalProviderAuthMode): void {
    if (!this.get(provider).supportedAuthModes.includes(authMode)) {
      throw new AiServiceError("CONFIG_INVALID", "The provider does not support this credential authentication mode.", {
        provider,
      })
    }
  }
}
