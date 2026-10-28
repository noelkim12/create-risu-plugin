import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FEATURE_DEFINITIONS, getFeatureDefinition } from "../features/featureCatalog.js";

export class FeatureComposer {
  constructor(config, options = {}) {
    this.config = config;
    this.templatesBaseDir = options.templatesBaseDir ?? this.resolveTemplatesBaseDir();
    this.resolvedDefinitions = null;
  }

  resolveTemplatesBaseDir() {
    const filename = fileURLToPath(import.meta.url);
    return path.resolve(path.dirname(filename), "../../templates");
  }

  selectedDefinitions() {
    if (this.resolvedDefinitions) return this.resolvedDefinitions;

    const selectedIds = new Set(this.config.features.map(id => getFeatureDefinition(id).id));
    const definitions = [];
    const resolvedIds = new Set();
    const visit = definition => {
      if (resolvedIds.has(definition.id)) return;

      for (const dependencyId of definition.dependencies) {
        visit(getFeatureDefinition(dependencyId, { includeInternal: true }));
      }

      resolvedIds.add(definition.id);
      definitions.push(definition);
    };

    for (const definition of FEATURE_DEFINITIONS) {
      if (definition.promptVisible && selectedIds.has(definition.id)) visit(definition);
    }

    this.resolvedDefinitions = definitions;
    return definitions;
  }

  layerPath(definition, layer) {
    return path.join(
      this.templatesBaseDir,
      "features",
      definition.templateDirectory,
      layer,
      "ts",
    );
  }

  validateFeatures(definitions = this.selectedDefinitions()) {
    for (const definition of definitions) {
      for (const layer of ["common", this.config.framework]) {
        const source = this.layerPath(definition, layer);
        if (!fs.existsSync(source)) {
          throw new Error(`Feature template layer is missing: ${source}`);
        }
      }
    }
    return true;
  }

  async copyFeatureLayer(definition, layer) {
    await fs.copy(this.layerPath(definition, layer), this.config.targetDir, {
      overwrite: false,
      errorOnExist: true,
    });
  }

  renderGeneratedRegistry(definitions = this.selectedDefinitions()) {
    const lines = [
      'import type { ContainerHost } from "../ui/container-host";',
      "",
      ...definitions.flatMap(definition => [
        `import { ${definition.registrationExport} } from "${definition.registrationModule}";`,
      ]),
      definitions.length > 0 ? "" : null,
      "export async function registerFeatures(host: ContainerHost): Promise<void> {",
      ...(definitions.length === 0
        ? ["  void host;"]
        : definitions.map(definition => `  await ${definition.registrationExport}(host);`)),
      "}",
      "",
    ];

    return lines.filter(line => line !== null).join("\n");
  }

  async writeGeneratedRegistry(definitions = this.selectedDefinitions()) {
    await fs.outputFile(
      path.join(this.config.targetDir, "src/features/generated.ts"),
      this.renderGeneratedRegistry(definitions),
      "utf8",
    );
  }

  async composeFeatures() {
    const definitions = this.selectedDefinitions();
    this.validateFeatures(definitions);
    for (const definition of definitions) {
      await this.copyFeatureLayer(definition, "common");
      await this.copyFeatureLayer(definition, this.config.framework);
    }
    await this.writeGeneratedRegistry(definitions);
  }
}
