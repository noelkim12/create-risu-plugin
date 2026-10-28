import type { CredentialManagerRuntime } from "../contracts"
import type {
  CredentialControllerOperation,
  CredentialControllerState,
  CredentialCreate,
  CredentialDraft,
  CredentialId,
  CredentialMetadata,
  CredentialUpdate,
  ResolvedCredential,
} from "../core/types"

type Listener = (state: CredentialControllerState) => void

class CredentialManagerControllerError extends Error {
  constructor() {
    super("Credential operation failed.")
    this.name = "CredentialManagerControllerError"
  }
}

function defaultDraft(): CredentialDraft {
  return {
    name: "New credential",
    provider: "google-ai-studio",
    kind: "api-key",
    authMode: "api-key",
    audience: "unbound",
  }
}

function draftFromMetadata(metadata: CredentialMetadata): CredentialDraft {
  switch (metadata.kind) {
    case "api-key":
      return {
        name: metadata.name,
        provider: metadata.provider,
        kind: metadata.kind,
        authMode: metadata.authMode,
        audience: metadata.audience,
      }
    case "vertex-service-account":
      return {
        name: metadata.name,
        provider: metadata.provider,
        kind: metadata.kind,
        authMode: metadata.authMode,
        audience: metadata.audience,
      }
    case "none":
      return {
        name: metadata.name,
        provider: metadata.provider,
        kind: metadata.kind,
        authMode: metadata.authMode,
        audience: metadata.audience,
      }
  }
}

export class CredentialManagerController {
  private readonly listeners = new Set<Listener>()
  private state: CredentialControllerState = {
    loaded: false,
    operation: "idle",
    credentials: [],
    pendingDeleteId: null,
    statusMessage: "",
  }

  constructor(private readonly manager: CredentialManagerRuntime) {}

  snapshot(): CredentialControllerState {
    return structuredClone(this.state)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  async load(): Promise<void> {
    await this.run("loading", "", async () => {
      this.publish({ loaded: true, credentials: await this.manager.list(), pendingDeleteId: null })
    })
  }

  beginCreate(): CredentialDraft {
    return defaultDraft()
  }

  beginEdit(keyId: CredentialId): CredentialDraft | null {
    const summary = this.state.credentials.find(credential => credential.id === keyId)
    return summary === undefined ? null : draftFromMetadata(summary)
  }

  async create(input: CredentialCreate): Promise<void> {
    await this.save("Credential saved.", () => this.manager.create(input))
  }

  async update(keyId: CredentialId, input: CredentialUpdate): Promise<void> {
    await this.save("Credential saved.", () => this.manager.update(keyId, input))
  }

  async clearSecret(keyId: CredentialId, draft: CredentialDraft): Promise<void> {
    await this.save("Credential secret cleared.", () => this.manager.update(keyId, { ...draft, secret: null }))
  }

  async reveal(keyId: CredentialId): Promise<ResolvedCredential | null> {
    return this.run("revealing", "Credential revealed.", () => this.manager.reveal(keyId))
  }

  requestDelete(keyId: CredentialId): void {
    if (!this.state.loaded || this.isBusy() || !this.state.credentials.some(credential => credential.id === keyId)) return
    this.publish({ pendingDeleteId: keyId, statusMessage: "" })
  }

  cancelDelete(): void {
    if (this.state.pendingDeleteId === null) return
    this.publish({ pendingDeleteId: null, statusMessage: "" })
  }

  async confirmDelete(): Promise<void> {
    const keyId = this.state.pendingDeleteId
    if (keyId === null || this.isBusy()) return
    this.publish({ pendingDeleteId: null })
    await this.run("deleting", "Credential deleted.", async () => {
      await this.manager.delete(keyId)
      this.publish({ loaded: true, credentials: await this.manager.list() })
    })
  }

  private async save(
    successMessage: string,
    action: () => Promise<CredentialMetadata>,
  ): Promise<void> {
    await this.run("saving", successMessage, async () => {
      await action()
      this.publish({ loaded: true, credentials: await this.manager.list(), pendingDeleteId: null })
    })
  }

  private async run<Result>(
    operation: Exclude<CredentialControllerOperation, "idle" | "success" | "error" | "migrating">,
    successMessage: string,
    action: () => Promise<Result>,
  ): Promise<Result> {
    this.publish({ operation, statusMessage: "" })
    try {
      const result = await action()
      this.publish({ operation: "success", statusMessage: successMessage })
      return result
    } catch {
      this.publish({ operation: "error", statusMessage: "Credential operation failed." })
      throw new CredentialManagerControllerError()
    }
  }

  private isBusy(): boolean {
    return this.state.operation === "loading"
      || this.state.operation === "saving"
      || this.state.operation === "revealing"
      || this.state.operation === "deleting"
  }

  private publish(patch: Partial<CredentialControllerState>): void {
    this.state = structuredClone({ ...this.state, ...patch })
    for (const listener of this.listeners) listener(this.snapshot())
  }
}
