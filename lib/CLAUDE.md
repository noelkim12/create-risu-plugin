# CLAUDE.md - LLM 지원 가이드

이 문서는 AI 어시스턴트(Claude 등)가 `create-risu-plugin` CLI에 새로운 프레임워크나 기능을 추가할 때 참고하는 가이드입니다.

---

## 📋 새 프레임워크 추가하기

### 목표
새로운 프레임워크(예: React, Svelte, Vue)를 지원하여 사용자가 선택할 수 있도록 합니다.

### 사전 요구사항
- 프레임워크 이름 (예: `react`, `svelte`, `vue`)
- 지원할 언어 (JavaScript, TypeScript 또는 둘 다)
- 필요한 npm 패키지 목록

---

## 🔧 단계별 가이드

### Phase 1: 프롬프트 옵션 추가

**파일**: `lib/prompts/frameworkPrompts.js`

**작업**:
1. `promptFramework()` 함수의 choices 배열에 새 옵션 추가
2. 현재는 `disabled: true`로 설정하여 향후 지원 예정 표시

**예시**:
```javascript
export async function promptFramework() {
  const { framework } = await inquirer.prompt([
    {
      name: "framework",
      type: "list",
      message: "어떤 프레임워크를 사용하시겠어요?",
      choices: [
        { name: "Vanilla JavaScript/TypeScript (순수 JS/TS)", value: "vanilla" },
        { name: "React", value: "react", disabled: false },  // ← 활성화
        { name: "Svelte (향후 지원 예정)", value: "svelte", disabled: true },
        { name: "Vue (향후 지원 예정)", value: "vue", disabled: true }
      ],
      default: "vanilla"
    }
  ]);

  return framework;
}
```

**검증**:
- [ ] CLI 실행 시 프레임워크 선택 목록에 새 옵션이 표시되는가?

---

### Phase 2: 템플릿 디렉토리 구조 생성

**디렉토리**: `templates/frameworks/{framework}/`

**작업**:
1. JavaScript 버전 템플릿 생성 (필수)
2. TypeScript 버전 템플릿 생성 (선택)

**디렉토리 구조**:
```
templates/frameworks/react/
├── js/                           # JavaScript 버전
│   ├── src/
│   │   ├── index.js             # 진입점
│   │   ├── constants.js         # 플레이스홀더: ${프로젝트명}
│   │   ├── core/
│   │   │   ├── risu-api.js
│   │   │   └── update-manager.js
│   │   ├── ui/
│   │   │   ├── components/
│   │   │   └── styles/
│   │   └── utils/
│   ├── scripts/
│   │   └── dev-server.js
│   ├── package.json
│   ├── gitignore.template
│   ├── caddy.config.template
│   └── README.md
└── ts/                           # TypeScript 버전 (선택)
    ├── src/
    │   └── index.ts
    └── package.json
```

**중요 파일**:

**`package.json`**:
```json
{
  "name": "risu-plugin-template",
  "version": "1.0.0",
  "description": "Risu AI Plugin Template",
  "main": "dist/risu-plugin-template.js",
  "browser": "dist/risu-plugin-template.js",
  "unpkg": "dist/risu-plugin-template.js",
  "scripts": {
    "dev": "cross-env NODE_ENV=development concurrently \"npm run dev:server\" \"npm run dev:vite\"",
    "dev:server": "node scripts/dev-server.js",
    "dev:vite": "vite build --watch --mode development",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "cross-env": "^7.0.3",
    "concurrently": "^8.2.2"
  }
}
```

**`src/index.js`** (React 예시):
```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { PLUGIN_NAME, PLUGIN_VERSION } from "./constants.js";
import { RisuAPI } from "./core/risu-api.js";
import { checkForUpdates } from "./core/update-manager.js";
import App from "./ui/components/App.jsx";

// 애플리케이션 실행
(async () => {
  if (__DEV_MODE__) {
    import('./core/dev-reload.js')
      .then(({ initHotReload }) => {
        initHotReload();
        console.log(`[${PLUGIN_NAME}] 🔥 Hot Reload enabled`);
      })
      .catch((error) => {
        console.warn('[App] Hot reload initialization failed:', error);
      });
  }

  try {
    const risuAPI = RisuAPI.getInstance(globalThis.__pluginApis__);
    const initialized = await risuAPI.initialize();

    if (!initialized) {
      console.error(`[${PLUGIN_NAME}] Failed to initialize RisuAPI`);
      return;
    }

    checkForUpdates({ silent: true }).catch(err => {
      console.warn('[App] Update check failed:', err);
    });

    // React 앱 렌더링
    const root = ReactDOM.createRoot(document.getElementById('risu-plugin-root'));
    root.render(<App risuAPI={risuAPI} />);

    console.log(`${PLUGIN_NAME} v${PLUGIN_VERSION} loaded`);

    risuAPI.onUnload(() => {
      root.unmount();
    });

  } catch (error) {
    console.error(`[${PLUGIN_NAME}] Initialization failed:`, error);
  }
})();
```

**`src/constants.js`** (플레이스홀더 포함):
```javascript
export const PLUGIN_NAME = '${프로젝트명}';
export const PLUGIN_VERSION = '1.0.0';
```

**검증**:
- [ ] 모든 필수 파일이 생성되었는가?
- [ ] `package.json`에 프레임워크별 의존성이 포함되었는가?
- [ ] 플레이스홀더(`${프로젝트명}`)가 올바른 위치에 있는가?

---

### Phase 3: 번들러 설정 생성

**디렉토리**: `templates/bundlers/vite/`

**작업**:
1. 프레임워크별 Vite 설정 파일 생성
2. React의 경우 `@vitejs/plugin-react` 사용

**파일**: `templates/bundlers/vite/vite.config.react-js.js`

**예시**:
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { vitePluginDevMode } from './scripts/vite-plugin-devmode.js';
import { vitePluginArgs } from './scripts/vite-plugin-args.js';

export default defineConfig({
  plugins: [
    react(),
    cssInjectedByJsPlugin(),
    vitePluginDevMode({
      defaultPort: 13131,
      outputFilePath: path.resolve(__dirname, 'src/core/dev-reload.js'),
    }),
    vitePluginArgs({
      outputFilePath: path.resolve(__dirname, 'src/plugin-args.json'),
    }),
  ],

  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'RisuPlugin',
      formats: ['iife'],
      fileName: () => 'risu-plugin-template.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        banner: `/*! Risu Plugin - Built with Vite + React */`,
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      format: {
        comments: false,
      },
    },
    watch: {
      exclude: [
        '**/src/core/plugin-config.js',
        '**/src/core/dev-reload.js',
        '**/node_modules/**'
      ]
    }
  },

  server: {
    port: 13131,
    strictPort: false,
    open: false,
    hmr: true,
    watch: {
      ignored: [
        '**/src/core/plugin-config.js',
        '**/src/core/dev-reload.js',
        '**/node_modules/**',
      ]
    }
  },

  define: {
    __DEV_MODE__: JSON.stringify(process.env.NODE_ENV === 'development'),
    __PLUGIN_NAME__: JSON.stringify('PLUGIN_NAME_PLACEHOLDER'),
    __PLUGIN_VERSION__: JSON.stringify('PLUGIN_VERSION_PLACEHOLDER'),
  },
});
```

**의존성 추가**: `templates/dependencies/package.vite.json`

필요한 경우 React 전용 의존성 파일 생성:
```json
{
  "devDependencies": {
    "vite": "^5.0.0",
    "vite-plugin-css-injected-by-js": "^3.5.0",
    "terser": "^5.36.0",
    "@vitejs/plugin-react": "^4.2.0"
  }
}
```

**검증**:
- [ ] Vite 설정 파일이 생성되었는가?
- [ ] 프레임워크별 플러그인이 올바르게 설정되었는가?
- [ ] 번들 설정이 IIFE 형식으로 되어 있는가?

---

### Phase 4: 파일 복사 및 검증 로직 확인

**파일**: `lib/processors/TemplateComposer.js`

**확인 사항**:
```javascript
validateTemplate() {
  const { framework, language } = this.config;
  const languageAbbr = language === 'javascript' ? 'js' : 'ts';
  const templateDir = path.join(this.templatesBaseDir, "frameworks", framework, languageAbbr);

  if (!fs.existsSync(templateDir)) {
    showError(`템플릿 디렉토리를 찾을 수 없습니다: ${templateDir}`);
    return false;
  }
  return true;
}
```

**자동 동작**:
- 프레임워크 + 언어 조합으로 템플릿 경로 자동 결정
- 예: `react` + `javascript` → `templates/frameworks/react/js/`

**검증**:
- [ ] `TemplateComposer`가 새 프레임워크 경로를 올바르게 찾는가?
- [ ] 번들러 설정이 올바르게 복사되는가?

---

### Phase 5: 테스트

**테스트 절차**:

1. **CLI 실행**:
   ```bash
   node bin/create-risu-plugin.js
   ```

2. **프레임워크 선택**:
   - 새로 추가한 프레임워크 선택
   - JavaScript 또는 TypeScript 선택

3. **생성 확인**:
   ```bash
   cd {생성된-프로젝트}
   npm install
   npm run build
   ```

4. **빌드 결과 검증**:
   - [ ] `dist/{프로젝트명}.js` 파일이 생성되었는가?
   - [ ] 파일 크기가 적절한가? (일반적으로 50KB ~ 500KB)
   - [ ] 번들 파일이 IIFE 형식인가?
   - [ ] React/Svelte 등 프레임워크 코드가 포함되었는가?

5. **개발 모드 테스트**:
   ```bash
   npm run dev
   ```
   - [ ] Hot reload가 작동하는가?
   - [ ] WebSocket 연결이 정상적인가?

**검증**:
- [ ] 모든 테스트가 통과하는가?

---

## 🎯 체크리스트

### 프레임워크 추가 완료 체크리스트

- [ ] **Phase 1**: `frameworkPrompts.js`에 옵션 추가
- [ ] **Phase 2**: 템플릿 디렉토리 구조 생성
  - [ ] `templates/frameworks/{framework}/js/` 생성
  - [ ] `package.json` 설정
  - [ ] `src/index.js` 진입점 작성
  - [ ] `src/constants.js` 플레이스홀더 포함
  - [ ] 필요한 모든 디렉토리/파일 생성
- [ ] **Phase 3**: 번들러 설정 생성
  - [ ] `vite.config.{framework}-js.js` 작성
  - [ ] 프레임워크별 플러그인 설정
  - [ ] 의존성 파일 업데이트 (필요 시)
- [ ] **Phase 4**: 복사 로직 확인
  - [ ] `TemplateComposer`가 경로를 올바르게 해석하는가?
- [ ] **Phase 5**: 테스트
  - [ ] CLI 실행 테스트
  - [ ] 프로젝트 생성 테스트
  - [ ] 빌드 테스트
  - [ ] 개발 모드 테스트

---

## 📝 일반적인 실수

### 1. 경로 오류
**문제**: `templates/{framework}/js/` 대신 `templates/frameworks/{framework}/js/` 사용
**해결**: `TemplateComposer`가 `templates/frameworks/` 경로를 사용함

### 2. 플레이스홀더 누락
**문제**: `constants.js`에 `${프로젝트명}` 플레이스홀더 없음
**해결**: `ConfigFileUpdater.updateConstants()`가 이를 치환함

### 3. 번들러 설정 파일 이름 오류
**문제**: `vite.config.react.js` (잘못됨)
**올바른 이름**: `vite.config.react-js.js` (프레임워크-언어 형식)

### 4. 의존성 누락
**문제**: `package.json`에 프레임워크 의존성 없음
**해결**: React의 경우 `react`, `react-dom` 필수

### 5. IIFE 형식 미사용
**문제**: Vite 설정에서 `formats: ['es']` 사용
**해결**: Risu AI는 IIFE 형식 필요 → `formats: ['iife']`

---

## 🔍 디버깅 가이드

### 템플릿을 찾을 수 없음 오류

**오류 메시지**:
```
템플릿 디렉토리를 찾을 수 없습니다: templates/frameworks/react/js
```

**확인 사항**:
1. 디렉토리 경로가 정확한가?
   ```bash
   ls -la templates/frameworks/react/js/
   ```

2. `frameworkPrompts.js`의 value와 디렉토리 이름이 일치하는가?
   ```javascript
   { name: "React", value: "react" }  // value가 디렉토리 이름
   ```

### 번들러 설정 파일을 찾을 수 없음 오류

**오류 메시지**:
```
⚠️  번들러 설정 파일을 찾을 수 없습니다: templates/bundlers/vite/vite.config.react-js.js
```

**확인 사항**:
1. 파일 이름 형식이 올바른가?
   ```
   {bundler}.config.{framework}-{languageAbbr}.js
   vite.config.react-js.js
   ```

2. 파일이 실제로 존재하는가?
   ```bash
   ls -la templates/bundlers/vite/
   ```

---

## 🚀 고급 기능

### TypeScript 지원 추가

1. `templates/frameworks/{framework}/ts/` 디렉토리 생성
2. `tsconfig.json` 파일 추가
3. `vite.config.{framework}-ts.js` 생성
4. TypeScript 의존성 추가

### 커스텀 플러그인 추가

Vite 플러그인을 추가하여 추가 기능 구현:
```javascript
// custom-plugin.js
export function customPlugin() {
  return {
    name: 'custom-plugin',
    transform(code, id) {
      // 코드 변환 로직
      return code;
    }
  };
}
```

---

## 📚 참고 자료

- [Vite 공식 문서](https://vitejs.dev/)
- [React Vite 플러그인](https://github.com/vitejs/vite-plugin-react)
- [Svelte Vite 플러그인](https://github.com/sveltejs/vite-plugin-svelte)
- [Risu AI 플러그인 문서](https://github.com/kwaroran/RisuAI)

---

**최종 업데이트**: 2025-01-15
**관리자**: CLI Tool 개발팀
