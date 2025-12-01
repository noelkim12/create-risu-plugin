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

    // 3. 번들러 플러그인 복사
    await this.copyBundlerPlugins();

    // 4. 공통 스크립트 복사
    await this.copyCommonScripts();

    // 향후: 5. 프레임워크별 소스 복사
    // await this.copyFrameworkSource();
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
    const { framework, language } = this.config;
    const languageAbbr = language === 'javascript' ? 'js' :
                        language === 'typescript' ? 'ts' : language;
    const templateDir = path.join(this.templatesBaseDir, "frameworks", framework, languageAbbr);

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
    const { framework, language } = this.config;
    const languageAbbr = language === 'javascript' ? 'js' :
                        language === 'typescript' ? 'ts' : language;
    const templateDir = path.join(this.templatesBaseDir, "frameworks", framework, languageAbbr);

    // templates/frameworks/{framework}/{language}/ 전체 복사 (기본 구조)
    await fs.copy(templateDir, this.config.targetDir, {
      filter: (src) => {
        // vite.config.js는 제외 (bundler에서 복사)
        if (src.includes('vite.config.js')) return false;
        // webpack.config.js도 제외
        if (src.includes('webpack.config.js')) return false;
        // vite-plugin-*.js는 제외 (bundler에서 복사)
        if (src.includes('vite-plugin-')) return false;
        // scripts 폴더는 제외 (공통 스크립트에서 복사)
        if (src.includes('/scripts/') || src.includes('\\scripts\\')) return false;
        return true;
      }
    });
  }

  /**
   * 번들러 설정을 복사합니다
   * @returns {Promise<void>}
   */
  async copyBundlerConfig() {
    const { bundler, framework, language } = this.config;

    // 언어 약어 변환 (javascript → js, typescript → ts)
    const languageAbbr = language === 'javascript' ? 'js' :
                        language === 'typescript' ? 'ts' : language;

    // bundlers/{bundler}/{language}/vite.config.{framework}.{ext}
    // JavaScript: vite.config.react.js
    // TypeScript: vite.config.react.ts
    const configExt = languageAbbr;
    const configFileName = `${bundler}.config.${framework}.${configExt}`;
    const configSrc = path.join(this.templatesBaseDir, 'bundlers', bundler, languageAbbr, configFileName);
    const configDest = path.join(this.config.targetDir, `${bundler}.config.js`);

    if (fs.existsSync(configSrc)) {
      await fs.copy(configSrc, configDest);
      showInfo(`번들러 설정 복사: ${configFileName} → ${bundler}.config.js`);
    } else {
      console.warn(`⚠️  번들러 설정 파일을 찾을 수 없습니다: ${configSrc}`);
    }
  }

  /**
   * 번들러 플러그인 파일들을 복사합니다
   * @returns {Promise<void>}
   */
  async copyBundlerPlugins() {
    const { bundler, language } = this.config;
    const languageAbbr = language === 'javascript' ? 'js' :
                        language === 'typescript' ? 'ts' : language;
    const bundlerDir = path.join(this.templatesBaseDir, 'bundlers', bundler, languageAbbr);
    const scriptsDir = path.join(this.config.targetDir, 'scripts');

    // scripts 디렉토리 생성 (없으면)
    await fs.ensureDir(scriptsDir);

    // 번들러별 플러그인 파일 목록
    const pluginFiles = ['vite-plugin-args.js', 'vite-plugin-devmode.js'];

    for (const pluginFile of pluginFiles) {
      const pluginSrc = path.join(bundlerDir, pluginFile);
      const pluginDest = path.join(scriptsDir, pluginFile);

      if (fs.existsSync(pluginSrc)) {
        await fs.copy(pluginSrc, pluginDest);
        showInfo(`번들러 플러그인 복사: ${pluginFile}`);
      } else {
        // vite가 아닌 번들러의 경우 해당 플러그인이 없을 수 있음
        if (bundler === 'vite') {
          console.warn(`⚠️  번들러 플러그인 파일을 찾을 수 없습니다: ${pluginSrc}`);
        }
      }
    }
  }

  /**
   * 공통 스크립트 파일들을 복사합니다
   * @returns {Promise<void>}
   */
  async copyCommonScripts() {
    const { language } = this.config;
    const languageAbbr = language === 'javascript' ? 'js' :
                        language === 'typescript' ? 'ts' : language;
    const scriptsSrcDir = path.join(this.templatesBaseDir, 'scripts', languageAbbr);
    const scriptsDestDir = path.join(this.config.targetDir, 'scripts');

    if (!fs.existsSync(scriptsSrcDir)) {
      console.warn(`⚠️  공통 스크립트 디렉토리를 찾을 수 없습니다: ${scriptsSrcDir}`);
      return;
    }

    // scripts 디렉토리 생성 (없으면)
    await fs.ensureDir(scriptsDestDir);

    // 공통 스크립트 파일들 복사
    const scriptFiles = await fs.readdir(scriptsSrcDir);
    const jsFiles = scriptFiles.filter(file => file.endsWith('.js'));

    for (const scriptFile of jsFiles) {
      const scriptSrc = path.join(scriptsSrcDir, scriptFile);
      const scriptDest = path.join(scriptsDestDir, scriptFile);

      await fs.copy(scriptSrc, scriptDest);
      showInfo(`공통 스크립트 복사: ${scriptFile}`);
    }
  }

}
