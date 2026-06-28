import fs from "fs-extra";
import path from "path";
import { DependencyManager } from "../processors/DependencyManager.js";

/**
 * Package.json updater
 */
export class PackageJsonUpdater {
  constructor(config) {
    this.config = config;
    this.packageJsonPath = path.join(config.targetDir, "package.json");
    this.dependencyManager = new DependencyManager(config);
  }

  /**
   * Update package.json with project info and dependencies
   * @returns {Promise<void>}
   */
  async update() {
    const packageJson = await fs.readJson(this.packageJsonPath);

    // 1. 기본 정보 업데이트
    packageJson.name = this.config.projectName;
    packageJson.description = this.config.description;
    packageJson.browser = `dist/${this.config.projectName}.js`;
    packageJson.unpkg = `dist/${this.config.projectName}.js`;

    // 2. 의존성 병합
    await this.mergeDependencies(packageJson);

    await fs.writeJson(this.packageJsonPath, packageJson, { spaces: 2 });
  }

  /**
   * Merge dependencies from dependency files
   * @param {Object} packageJson - Package.json object
   * @returns {Promise<void>}
   */
  async mergeDependencies(packageJson) {
    const composedDeps = await this.dependencyManager.composeDependencies();

    // dependencies 병합
    if (composedDeps.dependencies && Object.keys(composedDeps.dependencies).length > 0) {
      packageJson.dependencies = {
        ...packageJson.dependencies,
        ...composedDeps.dependencies
      };
    }

    // devDependencies 병합
    if (composedDeps.devDependencies && Object.keys(composedDeps.devDependencies).length > 0) {
      packageJson.devDependencies = {
        ...packageJson.devDependencies,
        ...composedDeps.devDependencies
      };
    }

    if (composedDeps.engines && Object.keys(composedDeps.engines).length > 0) {
      packageJson.engines = {
        ...packageJson.engines,
        ...composedDeps.engines
      };
    }
  }

}
