import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => { vi.stubGlobal("risuai", {}) })

import { isCredentialId } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/core/validation"
import type {
  ApiKeyCredential,
  CredentialControllerState,
  CredentialCreate,
  CredentialId,
  CredentialSummary,
} from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/core/types"
import type { CredentialManagerController } from "../../../templates/features/credential-manager/common/ts/src/features/credential-manager/settings/credential-manager-controller"
import { mountKeysPanel } from "../../../templates/features/credential-manager/vanilla/ts/src/features/credential-manager/ui/keys-panel"
import { createRsaPrivateKeyPem } from "../../helpers/rsa-key-pair"

const KEY_ID_VALUE = "11111111-1111-4111-8111-111111111111"
if (!isCredentialId(KEY_ID_VALUE)) throw new TypeError("Invalid credential test id.")
const KEY_ID = KEY_ID_VALUE as CredentialId
const SECRET = "panel-secret-material"

function apiSummary(patch: Partial<CredentialSummary> = {}): CredentialSummary {
  return {
    id: KEY_ID,
    name: "Studio key",
    provider: "google-ai-studio",
    kind: "api-key",
    authMode: "api-key",
    audience: "https://generativelanguage.googleapis.com",
    updatedAt: 1,
    status: "stored",
    credentialUpdatedAt: 1,
    maskedSecret: "abc…xyz",
    ...patch,
  }
}

function resolvedApi(): ApiKeyCredential {
  return {
    schemaVersion: 2,
    keyId: KEY_ID,
    provider: "google-ai-studio",
    kind: "api-key",
    audience: "https://generativelanguage.googleapis.com",
    revision: "r1",
    updatedAt: 1,
    secret: { apiKey: SECRET },
  }
}

function state(patch: Partial<CredentialControllerState> = {}): CredentialControllerState {
  return {
    loaded: true,
    operation: "idle",
    credentials: [apiSummary()],
    pendingDeleteId: null,
    statusMessage: "",
    ...patch,
  }
}

function fakeController(initial = state()) {
  let current = initial
  let listener: ((value: CredentialControllerState) => void) | undefined
  const unsubscribe = vi.fn(() => { listener = undefined })
  const methods = {
    subscribe: vi.fn((next: (value: CredentialControllerState) => void) => {
      listener = next
      next(current)
      return unsubscribe
    }),
    load: vi.fn().mockResolvedValue(undefined),
    beginCreate: vi.fn(() => ({
      name: "New credential",
      provider: "google-ai-studio",
      kind: "api-key",
      authMode: "api-key",
      audience: "unbound",
    })),
    beginEdit: vi.fn((id: CredentialId) => {
      const summary = current.credentials.find(credential => credential.id === id)
      return summary === undefined
        ? null
        : {
          name: summary.name,
          provider: summary.provider,
          kind: summary.kind,
          authMode: summary.authMode,
          audience: summary.audience,
        }
    }),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    reveal: vi.fn().mockResolvedValue(resolvedApi()),
    clearSecret: vi.fn().mockResolvedValue(undefined),
    requestDelete: vi.fn(),
    cancelDelete: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(undefined),
  }
  return {
    controller: methods as unknown as CredentialManagerController,
    methods,
    publish(patch: Partial<CredentialControllerState>) {
      current = { ...current, ...patch }
      listener?.(current)
    },
  }
}

function button(target: HTMLElement, label: string): HTMLButtonElement {
  const result = [...target.querySelectorAll("button")].find(element =>
    element.textContent === label || element.getAttribute("aria-label") === label)
  if (!result) throw new Error(`Missing button ${label}`)
  return result
}

function setValue(target: HTMLElement, id: string, value: string): void {
  const element = target.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)
  if (!element) throw new Error(`Missing input ${id}`)
  element.value = value
  element.dispatchEvent(new Event("input"))
}

function selectValue(target: HTMLElement, id: string, value: string): void {
  const element = target.querySelector<HTMLSelectElement>(`#${id}`)
  if (!element) throw new Error(`Missing select ${id}`)
  element.value = value
  element.dispatchEvent(new Event("change"))
}

describe("Vanilla Keys panel", () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it("renders masked summaries without raw secret material", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountKeysPanel(target, fake.controller)

    expect(target.textContent).toContain("Studio key")
    expect(target.textContent).toContain("Google AI Studio · API key · Stored locally")
    expect(target.textContent).toContain("abc…xyz")
    expect(target.textContent).toContain("https://generativelanguage.googleapis.com")
    expect(target.textContent).not.toContain(SECRET)
  })

  it("forwards API-key creation through the controller with the typed secret", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController(state({ credentials: [] }))
    mountKeysPanel(target, fake.controller)

    button(target, "Add credential").click()
    setValue(target, "ai-keys-name", "Production key")
    setValue(target, "ai-keys-audience", "https://generativelanguage.googleapis.com")
    setValue(target, "ai-keys-api-key", SECRET)
    button(target, "Save credential").click()

    const input = fake.methods.create.mock.calls[0]?.[0] as CredentialCreate
    expect(fake.methods.create).toHaveBeenCalledTimes(1)
    expect(input).toMatchObject({
      name: "Production key",
      provider: "google-ai-studio",
      kind: "api-key",
      authMode: "api-key",
      audience: "https://generativelanguage.googleapis.com",
    })
    expect(input.kind === "api-key" && input.secret.apiKey).toBe(SECRET)
  })

  it("keeps the stored secret when an edit leaves the key input blank", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountKeysPanel(target, fake.controller)

    button(target, "Edit credential Studio key").click()
    expect(target.querySelector("#ai-keys-api-key")).toBeTruthy()
    setValue(target, "ai-keys-name", "Renamed key")
    button(target, "Save changes").click()

    expect(fake.methods.update).toHaveBeenCalledTimes(1)
    const [updatedId, updatedInput] = fake.methods.update.mock.calls[0]
    expect(updatedId).toBe(KEY_ID)
    expect(updatedInput).not.toHaveProperty("secret")
    expect(updatedInput).toMatchObject({ name: "Renamed key", provider: "google-ai-studio" })
  })

  it("derives the Vertex audience from pasted Service Account JSON through the shared parser", async () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController(state({ credentials: [] }))
    mountKeysPanel(target, fake.controller)
    const { pem } = await createRsaPrivateKeyPem()

    button(target, "Add credential").click()
    selectValue(target, "ai-keys-provider", "google-vertex")
    expect(target.querySelector("#ai-keys-service-account-json")).toBeTruthy()
    expect(target.querySelector("#ai-keys-api-key")).toBeNull()
    setValue(target, "ai-keys-name", "Vertex account")
    setValue(target, "ai-keys-service-account-json", JSON.stringify({
      type: "service_account",
      project_id: "panel-project",
      private_key: pem,
      client_email: "panel@example.iam.gserviceaccount.com",
    }))
    button(target, "Save credential").click()

    expect(fake.methods.create).toHaveBeenCalledTimes(1)
    const input = fake.methods.create.mock.calls[0]?.[0] as CredentialCreate
    expect(input).toMatchObject({
      provider: "google-vertex",
      kind: "vertex-service-account",
      authMode: "service-account",
      audience: "vertex:panel-project:global",
    })
    expect(input.kind === "vertex-service-account"
      && input.secret.clientEmail === "panel@example.iam.gserviceaccount.com").toBe(true)
    expect(target.textContent).not.toContain("PRIVATE KEY")
  })

  it("shows the shared parser error and never calls create for malformed Service Account JSON", async () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController(state({ credentials: [] }))
    mountKeysPanel(target, fake.controller)

    button(target, "Add credential").click()
    selectValue(target, "ai-keys-provider", "google-vertex")
    setValue(target, "ai-keys-name", "Broken account")
    setValue(target, "ai-keys-service-account-json", "{ not json")
    button(target, "Save credential").click()

    await vi.waitFor(() => {
      expect(target.querySelector('[role="alert"]')?.textContent).toContain("Service Account JSON")
    })
    expect(fake.methods.create).not.toHaveBeenCalled()
  })

  it("reveals a stored credential transiently and hides it again", async () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountKeysPanel(target, fake.controller)

    button(target, "Edit credential Studio key").click()
    button(target, "Reveal key").click()
    expect(fake.methods.reveal).toHaveBeenCalledWith(KEY_ID)

    await vi.waitFor(() => {
      expect(target.querySelector(".ai-keys-revealed")?.textContent).toContain(SECRET)
    })

    button(target, "Hide key").click()
    expect(target.querySelector(".ai-keys-revealed")).toBeNull()
    expect(target.textContent).not.toContain(SECRET)
  })

  it("forwards secret clearing with the current draft", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountKeysPanel(target, fake.controller)

    button(target, "Edit credential Studio key").click()
    button(target, "Clear stored key").click()

    expect(fake.methods.clearSecret).toHaveBeenCalledTimes(1)
    const [clearedId, clearedDraft] = fake.methods.clearSecret.mock.calls[0]
    expect(clearedId).toBe(KEY_ID)
    expect(clearedDraft).toMatchObject({ name: "Studio key", provider: "google-ai-studio" })
    expect(target.querySelector(".ai-keys-revealed")).toBeNull()
  })

  it("routes deletion through request, cancel, and confirm controller actions", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const fake = fakeController()
    mountKeysPanel(target, fake.controller)

    button(target, "Delete credential Studio key").click()
    expect(fake.methods.requestDelete).toHaveBeenCalledWith(KEY_ID)
    expect(() => button(target, "Confirm delete")).toThrow()

    fake.publish({ pendingDeleteId: KEY_ID })
    button(target, "Cancel").click()
    expect(fake.methods.cancelDelete).toHaveBeenCalledTimes(1)

    fake.publish({ pendingDeleteId: KEY_ID })
    button(target, "Confirm delete").click()
    expect(fake.methods.confirmDelete).toHaveBeenCalledTimes(1)
  })

})
