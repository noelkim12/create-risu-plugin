import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Dependency manager - handles package dependencies and installation
 */
export class DependencyManager {
  constructor(config) {
    this.config = config;
    this.dependenciesDir = this.resolveDependenciesDir();
  }

  /**
   * Compose dependencies based on project configuration
   * @returns {Promise<Object>} Composed dependencies (dependencies, devDependencies)
   */
  async composeDependencies() {
    const { bundler, framework } = this.config;

    this.assertSupportedConfig(bundler, framework);

    const commonDeps = await this.loadDependencyFile("package.common.json", { required: true });
    const bundlerDeps = await this.loadDependencyFile(`package.${bundler}.json`, { required: true });
    const frameworkDeps = framework === "svelte"
      ? await this.loadDependencyFile("package.svelte.json", { required: true })
      : {};

    const merged = this.mergeDependencies(commonDeps, bundlerDeps, frameworkDeps);
    merged.engines = this.composeEngines();

    console.log(`📦 의존성 조합 완료: ${bundler} + ${framework}`);

    return merged;
  }

  assertSupportedConfig(bundler, framework) {
    if (bundler !== "vite") {
      throw new Error(`Unsupported bundler for v3 scaffold: ${bundler}`);
    }

    if (!["vanilla", "svelte"].includes(framework)) {
      throw new Error(`Unsupported framework for v3 scaffold: ${framework}`);
    }
  }

  composeEngines() {
    return {
      node: ">=20.19.0",
      npm: ">=10.0.0"
    };
  }

  /**
   * Resolve dependencies directory path
   * @returns {string} Dependencies directory path
   */
  resolveDependenciesDir() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "../../templates/dependencies");
  }

  /**
   * Load dependency file
   * @param {string} filename - Dependency filename (e.g., "package.common.json")
   * @param {{ required?: boolean }} options - Loading options
   * @returns {Object} Dependency object or empty object if optional and not found
   */
  async loadDependencyFile(filename, options = {}) {
    const filepath = path.join(this.dependenciesDir, filename);
    const required = options.required === true;

    if (!existsSync(filepath)) {
      if (required) {
        throw new Error(`Required dependency fragment is missing: ${filepath}`);
      }
      console.warn(`⚠️  의존성 파일을 찾을 수 없습니다: ${filename}`);
      return {};
    }

    try {
      return JSON.parse(await fs.readFile(filepath, "utf8"));
    } catch (error) {
      if (required) {
        throw new Error(`Required dependency fragment is malformed: ${filepath}. ${error.message}`);
      }
      console.error(`❌ 의존성 파일 읽기 실패: ${filename}`, error.message);
      return {};
    }
  }

  /**
   * Merge dependencies objects
   * @param {...Object} deps - Dependency objects to merge
   * @returns {Object} Merged dependencies
   */
  mergeDependencies(...deps) {
    const result = {
      dependencies: {},
      devDependencies: {}
    };

    for (const dep of deps) {
      if (dep.dependencies) {
        Object.assign(result.dependencies, dep.dependencies);
      }
      if (dep.devDependencies) {
        Object.assign(result.devDependencies, dep.devDependencies);
      }
    }

    return result;
  }

  /**
   * Install npm dependencies
   * @returns {Promise<void>}
   */
  async install() {
    console.log("📦 패키지 설치 중...");
    const { execa } = await import("execa");

    await execa("npm", ["install"], {
      cwd: this.config.targetDir,
      stdio: "inherit"
    });
  }

  // Future: Add methods for different package managers
  // async installWithYarn() { ... }
  // async installWithPnpm() { ... }
}
