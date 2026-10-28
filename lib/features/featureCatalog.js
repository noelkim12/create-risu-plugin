export const FEATURE_IDS = Object.freeze({
  AI_SERVICES: "ai-services",
  CREDENTIAL_MANAGER: "credential-manager",
  LLM_CLIENT: "llm-client",
  EMBEDDING_CLIENT: "embedding-client",
  CONTEXTUAL_EMBEDDING_CLIENT: "contextual-embedding-client",
  RERANKER_CLIENT: "reranker-client"
});

export const FEATURE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: FEATURE_IDS.AI_SERVICES,
    promptVisible: false,
    dependencies: Object.freeze([]),
    templateDirectory: "ai-services",
    registrationModule: "./ai-services/register",
    registrationExport: "registerAiServicesFeature"
  }),
  Object.freeze({
    id: FEATURE_IDS.CREDENTIAL_MANAGER,
    promptVisible: false,
    dependencies: Object.freeze([FEATURE_IDS.AI_SERVICES]),
    templateDirectory: "credential-manager",
    registrationModule: "./credential-manager/register",
    registrationExport: "registerCredentialManagerFeature"
  }),
  Object.freeze({
    id: FEATURE_IDS.LLM_CLIENT,
    promptVisible: true,
    promptLabel: "LLM client — call external LLM APIs directly",
    dependencies: Object.freeze([FEATURE_IDS.CREDENTIAL_MANAGER]),
    templateDirectory: "llm-client",
    credentialConsumer: true,
    registrationModule: "./llm-client/register",
    registrationExport: "registerLlmClientFeature"
  }),
  Object.freeze({
    id: FEATURE_IDS.EMBEDDING_CLIENT,
    promptVisible: true,
    promptLabel: "Embedding client — create text embeddings",
    dependencies: Object.freeze([FEATURE_IDS.CREDENTIAL_MANAGER]),
    templateDirectory: "embedding-client",
    credentialConsumer: true,
    registrationModule: "./embedding-client/register",
    registrationExport: "registerEmbeddingClientFeature"
  }),
  Object.freeze({
    id: FEATURE_IDS.CONTEXTUAL_EMBEDDING_CLIENT,
    promptVisible: true,
    promptLabel: "Contextual embedding client — embed pre-chunked documents",
    dependencies: Object.freeze([FEATURE_IDS.CREDENTIAL_MANAGER]),
    templateDirectory: "contextual-embedding-client",
    credentialConsumer: true,
    registrationModule: "./contextual-embedding-client/register",
    registrationExport: "registerContextualEmbeddingClientFeature"
  }),
  Object.freeze({
    id: FEATURE_IDS.RERANKER_CLIENT,
    promptVisible: true,
    promptLabel: "Reranker client — score document relevance",
    dependencies: Object.freeze([FEATURE_IDS.CREDENTIAL_MANAGER]),
    templateDirectory: "reranker-client",
    credentialConsumer: true,
    registrationModule: "./reranker-client/register",
    registrationExport: "registerRerankerClientFeature"
  })
]);

export function getFeatureDefinition(id, { includeInternal = false } = {}) {
  const definition = FEATURE_DEFINITIONS.find(feature => (
    feature.id === id && (includeInternal || feature.promptVisible)
  ));
  if (!definition) {
    throw new Error(`Unsupported scaffold feature: ${id}`);
  }
  return definition;
}

export function normalizeFeatureIds(ids) {
  if (!Array.isArray(ids)) {
    throw new Error("Scaffold features must be an array.");
  }

  const normalized = [];
  for (const id of ids) {
    getFeatureDefinition(id);
    if (!normalized.includes(id)) normalized.push(id);
  }
  return normalized;
}

export function featurePromptChoices() {
  return FEATURE_DEFINITIONS.filter(feature => feature.promptVisible).map(feature => ({
    name: feature.promptLabel,
    value: feature.id
  }));
}
