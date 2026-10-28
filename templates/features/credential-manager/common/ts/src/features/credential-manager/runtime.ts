import { CredentialManagerController } from "./settings/credential-manager-controller"
import { CredentialReferenceRegistry } from "./storage/credential-reference-registry"
import { LocalCredentialCatalogRepository } from "./storage/local-credential-catalog-repository"
import { LocalCredentialManager } from "./storage/local-credential-manager"
import { defaultLocalStorageFactory } from "../ai-services/storage/storage-keys"

const references = new CredentialReferenceRegistry()
const manager = new LocalCredentialManager(
  {
    catalog: new LocalCredentialCatalogRepository(defaultLocalStorageFactory),
    references,
  },
  { storageFactory: defaultLocalStorageFactory },
)

export const credentialManagerRuntime = {
  controller: new CredentialManagerController(manager),
  manager,
  references,
  resolver: manager,
} as const
