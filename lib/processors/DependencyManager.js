import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { showInfo } from "../utils/messages.js";

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
    const { bundler, framework, language } = this.config;

    // 1. 공통 의존성 로드
    const commonDeps = await this.loadDependencyFile('package.common.json');

    // 2. 번들러별 의존성 로드
    const bundlerDeps = await this.loadDependencyFile(`package.${bundler}.json`);

    // 3. 프레임워크별 의존성 로드 (vanilla는 제외)
    const frameworkDeps = framework !== 'vanilla'
      ? await this.loadDependencyFile(`package.${framework}.json`)
      : {};

    // 4. 언어별 의존성 로드 (javascript는 제외)
    const languageDeps = language === 'typescript'
      ? await this.loadDependencyFile(`package.${language}.json`)
      : {};

    // 5. 병합
    const merged = this.mergeDependencies(
      commonDeps,
      bundlerDeps,
      frameworkDeps,
      languageDeps
    );

    showInfo(`의존성 조합 완료: ${bundler} + ${framework} + ${language}`);

    return merged;
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
   * @returns {Object} Dependency object or empty object if not found
   */
  async loadDependencyFile(filename) {
    const filepath = path.join(this.dependenciesDir, filename);

    if (!fs.existsSync(filepath)) {
      console.warn(`⚠️  의존성 파일을 찾을 수 없습니다: ${filename}`);
      return {};
    }

    try {
      return await fs.readJson(filepath);
    } catch (error) {
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
    showInfo("패키지 설치 중...");
    await execa("npm", ["install"], {
      cwd: this.config.targetDir,
      stdio: "inherit"
    });
  }

  // Future: Add methods for different package managers
  // async installWithYarn() { ... }
  // async installWithPnpm() { ... }
}
