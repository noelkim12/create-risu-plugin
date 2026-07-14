import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getFeatureDefinition } from "../features/featureCatalog.js";

export class FeatureComposer {
  constructor(config, options = {}) {
    this.config = config;
    this.templatesBaseDir = options.templatesBaseDir ?? this.resolveTemplatesBaseDir();
  }

  resolveTemplatesBaseDir() {
    const filename = fileURLToPath(import.meta.url);
    return path.resolve(path.dirname(filename), "../../templates");
  }

  selectedDefinitions() {
    return this.config.features.map(getFeatureDefinition);
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

  validateFeatures() {
    for (const definition of this.selectedDefinitions()) {
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

  renderGeneratedRegistry() {
    const definitions = this.selectedDefinitions();
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

  async writeGeneratedRegistry() {
    await fs.outputFile(
      path.join(this.config.targetDir, "src/features/generated.ts"),
      this.renderGeneratedRegistry(),
      "utf8",
    );
  }

  async composeFeatures() {
    this.validateFeatures();
    for (const definition of this.selectedDefinitions()) {
      await this.copyFeatureLayer(definition, "common");
      await this.copyFeatureLayer(definition, this.config.framework);
    }
    await this.writeGeneratedRegistry();
  }
}
