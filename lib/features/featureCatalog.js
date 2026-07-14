export const FEATURE_IDS = Object.freeze({
  LLM_CLIENT: "llm-client"
});

export const FEATURE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: FEATURE_IDS.LLM_CLIENT,
    promptLabel: "LLM client — call external LLM APIs directly",
    templateDirectory: "llm-client",
    registrationModule: "./llm-client/register",
    registrationExport: "registerLlmClientFeature"
  })
]);

export function getFeatureDefinition(id) {
  const definition = FEATURE_DEFINITIONS.find(feature => feature.id === id);
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
  return FEATURE_DEFINITIONS.map(feature => ({
    name: feature.promptLabel,
    value: feature.id
  }));
}
