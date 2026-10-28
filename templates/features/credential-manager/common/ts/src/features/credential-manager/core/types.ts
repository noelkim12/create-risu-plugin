export type CredentialProviderId =
  | "google-ai-studio"
  | "google-vertex"
  | "openai-compatible"
  | "ollama"
  | "deepseek"
  | "voyage"

export type CredentialKind = "api-key" | "vertex-service-account" | "none"
export type CredentialAuthMode = "api-key" | "bearer" | "service-account" | "none"

declare const credentialIdBrand: unique symbol

export type CredentialId = string & {
  readonly [credentialIdBrand]: "CredentialId"
}

type CredentialMetadataBase = {
  readonly id: CredentialId
  readonly name: string
  readonly audience: string
  readonly updatedAt: number
}

export type ApiKeyCredentialMetadata = CredentialMetadataBase & {
  readonly provider: CredentialProviderId
  readonly kind: "api-key"
  readonly authMode: "api-key" | "bearer"
}

export type VertexServiceAccountCredentialMetadata = CredentialMetadataBase & {
  readonly provider: "google-vertex"
  readonly kind: "vertex-service-account"
  readonly authMode: "service-account"
}

export type NoAuthCredentialMetadata = CredentialMetadataBase & {
  readonly provider: CredentialProviderId
  readonly kind: "none"
  readonly authMode: "none"
}

export type CredentialMetadata =
  | ApiKeyCredentialMetadata
  | VertexServiceAccountCredentialMetadata
  | NoAuthCredentialMetadata

export type CredentialBinding =
  | Pick<ApiKeyCredentialMetadata, "provider" | "kind" | "authMode" | "audience">
  | Pick<VertexServiceAccountCredentialMetadata, "provider" | "kind" | "authMode" | "audience">

export type CredentialStorageState = "not-required" | "missing" | "stored" | "stale"

export type CredentialStatus = {
  readonly status: CredentialStorageState
  readonly credentialUpdatedAt: number | null
  readonly maskedSecret: string | null
}

export type CredentialSummary = CredentialMetadata & CredentialStatus

export type ApiKeySecret = Readonly<Record<string, string>> & {
  readonly apiKey: string
}

export type VertexServiceAccountSecret = {
  readonly projectId: string
  readonly location: string
  readonly clientEmail: string
  readonly privateKey: string
  readonly privateKeyId?: string
}

type ResolvedCredentialBase = {
  readonly schemaVersion: 2
  readonly keyId: CredentialId
  readonly audience: string
  readonly revision: string
  readonly updatedAt: number
}

export type ApiKeyCredential = ResolvedCredentialBase & {
  readonly provider: CredentialProviderId
  readonly kind: "api-key"
  readonly secret: ApiKeySecret
}

export type VertexServiceAccountCredential = ResolvedCredentialBase & {
  readonly provider: "google-vertex"
  readonly kind: "vertex-service-account"
  readonly secret: VertexServiceAccountSecret
}

export type ResolvedCredential = ApiKeyCredential | VertexServiceAccountCredential

export type CredentialDraft =
  | Omit<ApiKeyCredentialMetadata, "id" | "updatedAt">
  | Omit<VertexServiceAccountCredentialMetadata, "id" | "updatedAt">
  | Omit<NoAuthCredentialMetadata, "id" | "updatedAt">

export type CredentialCreate =
  | (Omit<ApiKeyCredentialMetadata, "id" | "updatedAt"> & { readonly secret: ApiKeySecret })
  | (Omit<VertexServiceAccountCredentialMetadata, "id" | "updatedAt"> & { readonly secret: VertexServiceAccountSecret })
  | (Omit<NoAuthCredentialMetadata, "id" | "updatedAt"> & { readonly secret: null })

export type CredentialUpdate =
  | (Omit<ApiKeyCredentialMetadata, "id" | "updatedAt"> & { readonly secret?: ApiKeySecret | null })
  | (Omit<VertexServiceAccountCredentialMetadata, "id" | "updatedAt"> & {
      readonly secret?: VertexServiceAccountSecret | null
    })
  | (Omit<NoAuthCredentialMetadata, "id" | "updatedAt"> & { readonly secret?: null })

export type LegacyCredentialCatalog = {
  readonly keys: readonly CredentialMetadata[]
  readonly credentials: readonly ResolvedCredential[]
}

export type LegacyCatalogImportResult =
  | { readonly kind: "imported"; readonly importedCredentialIds: readonly CredentialId[] }
  | { readonly kind: "unchanged" }
  | { readonly kind: "conflict"; readonly conflictingCredentialIds: readonly CredentialId[] }

export type CredentialControllerOperation =
  | "idle"
  | "loading"
  | "saving"
  | "revealing"
  | "deleting"
  | "migrating"
  | "success"
  | "error"

export type CredentialControllerState = {
  readonly loaded: boolean
  readonly operation: CredentialControllerOperation
  readonly credentials: readonly CredentialSummary[]
  readonly pendingDeleteId: CredentialId | null
  readonly statusMessage: string
}
