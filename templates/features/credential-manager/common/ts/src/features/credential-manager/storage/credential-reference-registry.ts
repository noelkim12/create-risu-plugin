import type { CredentialReferenceRepository } from "../contracts"
import type { CredentialId } from "../core/types"

export class CredentialReferenceRegistry {
  private readonly repositories = new Set<CredentialReferenceRepository>()

  register(repository: CredentialReferenceRepository): () => void {
    this.repositories.add(repository)
    return () => this.repositories.delete(repository)
  }

  async unlinkCredential(keyId: CredentialId): Promise<void> {
    await Promise.all([...this.repositories].map(repository => repository.unlinkCredential(keyId)))
  }
}
