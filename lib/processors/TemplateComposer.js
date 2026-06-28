import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { showError, showInfo } from "../utils/messages.js";

/**
 * 템플릿 컴포저 - 템플릿 디렉토리 작업을 처리합니다
 */
export class TemplateComposer {
  constructor(config) {
    this.config = config;
    this.templatesBaseDir = this.resolveTemplatesBaseDir();
  }

  
  /**
   * 템플릿을 대상 디렉토리로 복사합니다
   * @returns {Promise<void>}
   */
  async copyTemplate() {
    // 1. 기본 템플릿 구조 복사
    await this.copyBaseTemplate();

    // 2. 번들러 설정 복사
    await this.copyBundlerConfig();

    // 3. Framework template owns source and project files.
  }

  /**
   * 템플릿 기본 디렉토리 경로를 가져옵니다
   * @returns {string} 템플릿 기본 디렉토리 경로
   */
  getTemplatesBaseDir() {
    return this.templatesBaseDir;
  }

  /**
   * 템플릿 기본 디렉토리 경로를 해석합니다
   * @returns {string} 템플릿 기본 디렉토리 경로
   */
  resolveTemplatesBaseDir() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "../../templates");
  }

  /**
   * 템플릿 구조가 존재하는지 검증합니다
   * @returns {boolean} 템플릿이 존재하면 true
   */
  validateTemplate() {
    const { framework } = this.config;
    const templateDir = path.join(this.templatesBaseDir, "frameworks", framework, "ts");

    if (!fs.existsSync(templateDir)) {
      showError(`템플릿 디렉토리를 찾을 수 없습니다: ${templateDir}`);
      return false;
    }
    return true;
  }

  /**
   * 대상 디렉토리가 이미 존재하는지 확인합니다
   * @returns {boolean} 디렉토리가 존재하면 true
   */
  checkTargetExists() {
    if (fs.existsSync(this.config.targetDir)) {
      showError("동일한 이름의 폴더가 이미 존재합니다.");
      return true;
    }
    return false;
  }

  /**
   * 기본 템플릿 구조를 복사합니다
   * @returns {Promise<void>}
   */
  async copyBaseTemplate() {
    const { framework } = this.config;
    const templateDir = path.join(this.templatesBaseDir, "frameworks", framework, "ts");

    // templates/frameworks/{framework}/ts/ 전체 복사 (기본 구조)
    await fs.copy(templateDir, this.config.targetDir, {
      filter: (src) => {
        if (path.basename(src).startsWith("vite.config.")) return false;
        return true;
      }
    });
  }

  /**
   * 번들러 설정을 복사합니다
   * @returns {Promise<void>}
   */
  async copyBundlerConfig() {
    const { framework } = this.config;
    const configFileName = `vite.config.${framework}.ts`;
    const configSrc = path.join(this.templatesBaseDir, "bundlers", "vite", "ts", configFileName);
    const configDest = path.join(this.config.targetDir, "vite.config.ts");

    if (!fs.existsSync(configSrc)) {
      throw new Error(`Required Vite bundler config is missing for framework "${framework}": ${configSrc}`);
    }

    await fs.copy(configSrc, configDest);
    showInfo(`번들러 설정 복사: ${configFileName} → vite.config.ts`);
  }

}
