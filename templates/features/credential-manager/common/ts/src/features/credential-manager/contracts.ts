import type {
  CredentialBinding,
  CredentialCreate,
  CredentialId,
  CredentialMetadata,
  CredentialStatus,
  CredentialSummary,
  CredentialUpdate,
  LegacyCatalogImportResult,
  LegacyCredentialCatalog,
  ResolvedCredential,
} from "./core/types"

export interface CredentialReferenceRepository {
  unlinkCredential(keyId: CredentialId): Promise<void>
}

export interface CredentialManagerRuntime {
  list(): Promise<readonly CredentialSummary[]>
  listCompatible(binding: CredentialBinding): Promise<readonly CredentialSummary[]>
  status(keyId: CredentialId): Promise<CredentialStatus | null>
  create(input: CredentialCreate): Promise<CredentialMetadata>
  update(keyId: CredentialId, input: CredentialUpdate): Promise<CredentialMetadata>
  reveal(keyId: CredentialId): Promise<ResolvedCredential | null>
  delete(keyId: CredentialId): Promise<void>
  importLegacyCatalog(catalog: LegacyCredentialCatalog): Promise<LegacyCatalogImportResult>
  registerReferences(repository: CredentialReferenceRepository): () => void
  resolveCredential(keyId: CredentialId, binding: CredentialBinding): Promise<ResolvedCredential>
}

export type CredentialResolver = Pick<CredentialManagerRuntime, "resolveCredential">
