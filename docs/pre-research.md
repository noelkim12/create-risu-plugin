# Risuai Plugin API v3 Migration Pre-Research

`create-risu-plugin`을 Risuai Plugin API v3 전용 스캐폴더로 살리기 위한 사전조사 문서입니다.

## 결론

기존 템플릿을 v2/v2.1 호환 형태로 보수하는 것보다, **API v3 전용으로 범위를 줄이고 템플릿을 재작성하는 방향**이 안전합니다.

권장 목표는 다음과 같습니다.

- 템플릿은 `vanilla`, `svelte` 두 개만 유지합니다.
- 생성 플러그인은 반드시 `//@api 3.0` metadata를 포함합니다.
- Risuai API는 `globalThis.__pluginApis__`가 아니라 전역 `risuai` 또는 `Risuai` 객체를 직접 사용합니다.
- 모든 Risuai API 호출과 Safe DOM API 호출은 `await` 기반으로 작성합니다.
- 기본 UI는 v3 iframe 내부 `document`에 렌더링합니다.
- 메인 앱 DOM 조작은 기본 템플릿에서 제거하고, 필요할 때만 `getRootDocument()` 기반 고급 예제로 분리합니다.
- WebSocket hot reload, auto-update, IndexedDB, React, Webpack 등은 기본 구조에서 제거합니다.

## 조사 대상

### create-risu-plugin

- `package.json`
- `bin/index.js`
- `lib/createProject.js`
- `lib/core/ProjectConfig.js`
- `lib/core/ProjectGenerator.js`
- `lib/processors/TemplateComposer.js`
- `lib/processors/DependencyManager.js`
- `lib/updaters/PackageJsonUpdater.js`
- `lib/updaters/ConfigFileUpdater.js`
- `lib/prompts/frameworkPrompts.js`
- `templates/frameworks/*`
- `templates/bundlers/*`
- `templates/dependencies/*`
- `templates/scripts/*`

### Risuai API v3

- `../risuai-pork/plugins.md`
- `../risuai-pork/src/ts/plugins/migrationGuide.md`
- `../risuai-pork/src/ts/plugins/apiV3/risuai.d.ts`
- `../risuai-pork/src/ts/plugins/apiV3/factory.ts`
- `../risuai-pork/src/ts/plugins/apiV3/v3.svelte.ts`
- `../risuai-pork/src/ts/plugins/apiV3/developMode.ts`
- `../risuai-pork/src/ts/plugins/plugins.svelte.ts`

## 현재 상태 요약

`create-risu-plugin`은 ESM 기반 Node CLI입니다.

- CLI entrypoint: `bin/index.js`
- main flow: `lib/createProject.js`
- project config: `lib/core/ProjectConfig.js`
- generation pipeline: `lib/core/ProjectGenerator.js`
- template copy: `lib/processors/TemplateComposer.js`
- dependency merge/install: `lib/processors/DependencyManager.js`
- generated package mutation: `lib/updaters/PackageJsonUpdater.js`
- generated config mutation: `lib/updaters/ConfigFileUpdater.js`

현재 프롬프트는 세 프레임워크를 노출합니다.

- `vanilla`
- `react`
- `svelte`

하지만 실질적으로 TypeScript 템플릿은 없고, 언어 선택에서 TypeScript는 비활성화되어 있습니다. 실제 템플릿은 JavaScript 중심입니다.

현재 템플릿 구조는 다음 범위를 포함합니다.

- `templates/frameworks/vanilla/js`
- `templates/frameworks/react/js`
- `templates/frameworks/svelte/js`
- `templates/bundlers/vite/js`
- `templates/bundlers/webpack`
- `templates/dependencies/package.*.json`
- `templates/scripts/js`
- `templates/scripts/modules/js`

## 치명적인 호환성 문제

### 1. `//@api 3.0` metadata 누락

현재 Vite banner는 `//@name`, `//@display-name`, `//@version`, `//@description` 등을 생성하지만 `//@api 3.0`을 생성하지 않습니다.

Risuai 쪽 import 로직은 API version이 없으면 `2.0`으로 취급합니다. 현재 Risuai는 `2.0` 플러그인을 거부하므로, 생성된 플러그인은 API 호출 이전에 import 단계에서 실패할 수 있습니다.

구현 시 최우선으로 Vite banner에 다음 라인을 추가해야 합니다.

```js
//@api 3.0
```

### 2. v2 API wrapper 전제

현재 템플릿은 `globalThis.__pluginApis__`와 자체 `RisuAPI` singleton wrapper에 의존합니다.

대표 패턴:

```js
const risuAPI = RisuAPI.getInstance(globalThis.__pluginApis__);
```

v3에서는 iframe 내부에 전역 `risuai` 프록시가 생성되고, `Risuai`는 alias입니다. 따라서 새 템플릿은 wrapper 대신 다음처럼 직접 접근해야 합니다.

```js
await risuai.getCharacter();
await risuai.getArgument('api_key');
await risuai.registerSetting(...);
```

### 3. 모든 v3 API는 Promise 기반

v3 API와 `SafeElement`, `SafeDocument`, `SafeClassArray`, storage API는 모두 Promise 기반입니다.

기존 템플릿에는 synchronous-looking 코드가 많습니다.

```js
const char = this._getChar();
const value = this._api.getArg(key);
```

v3 템플릿은 async bootstrap을 기본으로 해야 합니다.

```js
(async () => {
  const character = await risuai.getCharacter();
  console.log(character?.name);
})();
```

### 4. main document 직접 접근

기존 vanilla/svelte 템플릿은 `document.body`, `document.querySelector`, `MutationObserver`로 Risuai 앱 DOM을 직접 관찰하거나 조작합니다.

v3에서 plugin code의 `document`는 **플러그인 iframe 내부 document**입니다. Risuai 메인 앱 DOM에 접근하려면 다음 경로를 써야 합니다.

```js
const root = await risuai.getRootDocument();
const body = await root.querySelector('body');
```

그리고 반환되는 값은 일반 HTMLElement가 아니라 `SafeElement`입니다. 따라서 `element.style.color = 'red'`가 아니라 다음처럼 호출해야 합니다.

```js
await element.setStyle('color', 'red');
await element.setTextContent('Hello');
```

기본 템플릿은 main DOM 접근을 하지 않는 것이 좋습니다.

## iframe CSP 조사

Risuai v3 iframe은 강한 CSP를 적용합니다.

핵심 제약:

- `connect-src 'none'`
- `script-src 'nonce-...' 'wasm-unsafe-eval'`
- `default-src 'none'`

따라서 다음은 기본적으로 동작하지 않는다고 봐야 합니다.

- 플러그인 iframe 내부 `new WebSocket(...)`
- 플러그인 iframe 내부 `fetch(...)`
- 외부 `<script src="https://...">`
- 런타임 CDN JS 로딩
- chunk split으로 인한 추가 JS 파일 로딩

대신 다음 방향이 안전합니다.

- 모든 JS dependency를 Vite build time에 단일 번들로 포함합니다.
- `inlineDynamicImports: true`를 유지합니다.
- 원격 네트워크 요청이 필요하면 브라우저 `fetch`가 아니라 `await risuai.nativeFetch(...)`를 사용합니다.
- WASM/worker/chunk 기반 라이브러리는 기본 템플릿에서 피합니다.

## WebSocket hot reload 판단

기존 WebSocket hot reload는 v3에서 그대로 유지하기 어렵습니다.

이유:

1. iframe CSP의 `connect-src 'none'` 때문에 plugin iframe 내부 WebSocket 연결이 차단될 가능성이 큽니다.
2. 현재 hot reload client는 플러그인 번들 내부에서 실행됩니다.
3. reload 적용 로직은 `script-updater`, `getDatabase`, `setDatabaseLite`, `globalThis.__pluginApis__` 같은 v2 전제에 묶여 있습니다.
4. Risuai v3는 이미 File System Access API 기반 hot reload를 제공합니다.

Risuai v3 hot reload 흐름:

- 사용자가 `.js` 또는 `.ts` 플러그인 파일을 선택합니다.
- Risuai 앱이 파일 변경을 감지합니다.
- 변경 시 `importPlugin(content, { isHotReload: true, isUpdate: true, isTypescript })`를 호출합니다.

따라서 `create-risu-plugin`에서는 custom WebSocket hot reload를 제거하고 다음 개발 흐름을 문서화하는 것이 좋습니다.

1. `npm run dev` 또는 `npm run build -- --watch`로 `dist/<plugin>.js`를 생성합니다.
2. Risuai 앱에서 v3 hot reload로 `dist/<plugin>.js`를 선택합니다.
3. Vite watch가 파일을 갱신하면 Risuai가 다시 import합니다.

WebSocket 방식을 꼭 유지하려면, plugin iframe 내부가 아니라 Risuai 앱/devtool 쪽에서 WebSocket을 받아 `importPlugin`을 호출하는 구조가 필요합니다. 이는 템플릿 기능이 아니라 Risuai core devtool 기능에 가깝습니다.

## 삭제 권장 항목

### React

사용자 목표가 `vanilla`, `svelte` 두 템플릿으로 축소하는 것이므로 React는 제거합니다.

삭제 후보:

- `templates/frameworks/react`
- `templates/dependencies/package.react.json`
- `templates/bundlers/vite/js/vite.config.react.js`

### Webpack

현재 `ProjectConfig`는 모든 framework에 Vite를 선택합니다. Webpack은 dead/stale support입니다.

삭제 후보:

- `templates/bundlers/webpack`
- `templates/dependencies/package.webpack.json`
- Webpack 관련 README/docs 문구

### custom hot reload / update system

삭제 후보:

- `templates/bundlers/vite/js/vite-plugin-devmode.js`
- `templates/scripts/js/dev-server.js`
- `templates/scripts/modules/js/dev-server.js`
- 각 템플릿의 `src/core/script-updater.js`
- 각 템플릿의 `src/core/update-manager.js`
- update dialog components
- Caddy hot reload 관련 prompt/config/docs

### IndexedDB 기본 탑재

v3는 `pluginStorage`, `safeLocalStorage`, `getLocalPluginStorage()`를 제공합니다.

삭제 후보:

- 각 템플릿의 `src/core/idb-storage.js`
- indexeddb guide/docs
- `idb` dependency

### RisuAPI wrapper

삭제 후보:

- 각 템플릿의 `src/core/risu-api.js`

대체:

- 직접 `risuai` 사용
- 필요한 경우 아주 얇은 helper만 템플릿 내부에 둡니다.

## 보존 권장 항목

- CLI 기본 흐름
- 프로젝트명 검증
- package metadata 치환
- Vite 기반 single-file bundle
- banner metadata injection
- vanilla 템플릿 개념
- svelte 템플릿 개념
- `.gitignore` template 처리

단, `npm install` 자동 실행은 옵션화하는 것이 좋습니다. 최소 migration scope에서는 생성만 하고 사용자가 직접 install/build하는 쪽이 디버깅이 쉽습니다.

## 권장 신규 템플릿 구조

TypeScript source-first를 추천합니다. `risuai.d.ts` 도입 목적이 API v3의 async/SafeElement 제약을 타입으로 드러내는 것이기 때문입니다.

빌드 산출물은 Risuai가 import할 수 있는 단일 `.js`입니다.

```text
templates/
  frameworks/
    vanilla/
      ts/
        package.json
        README.md
        gitignore.template
        src/
          main.ts
          risuai.d.ts
          styles.css
    svelte/
      ts/
        package.json
        README.md
        gitignore.template
        svelte.config.js
        src/
          main.ts
          App.svelte
          risuai.d.ts
          styles.css
  bundlers/
    vite/
      ts/
        vite.config.vanilla.ts
        vite.config.svelte.ts
```

더 작은 1차 구현이 필요하면 JavaScript 템플릿을 유지하되, `risuai.d.ts`와 `// @ts-check` 기반으로 시작할 수 있습니다. 그러나 장기적으로는 TypeScript 템플릿이 더 안전합니다.

## 최소 vanilla 예제 방향

```ts
//@name example-plugin
//@display-name Example Plugin
//@api 3.0
//@version 0.1.0

async function openPanel(): Promise<void> {
  document.body.innerHTML = '';

  const root = document.createElement('main');
  const title = document.createElement('h1');
  const close = document.createElement('button');

  title.textContent = 'Example Plugin';
  close.textContent = 'Close';
  close.addEventListener('click', async () => {
    await risuai.hideContainer();
  });

  root.append(title, close);
  document.body.append(root);

  await risuai.showContainer('fullscreen');
}

(async () => {
  await risuai.registerSetting(
    'Open Example Plugin',
    openPanel,
    '⚙️',
    'html',
    'example-plugin-settings',
  );
})();
```

## 최소 Svelte 예제 방향

`src/main.ts`:

```ts
//@name example-svelte-plugin
//@display-name Example Svelte Plugin
//@api 3.0
//@version 0.1.0

import { mount, unmount } from 'svelte';
import App from './App.svelte';

let app: ReturnType<typeof mount> | undefined;

async function openPanel(): Promise<void> {
  document.body.innerHTML = '';
  app = mount(App, { target: document.body });
  await risuai.showContainer('fullscreen');
}

(async () => {
  await risuai.registerSetting(
    'Open Example Svelte Plugin',
    openPanel,
    '⚙️',
    'html',
    'example-svelte-plugin-settings',
  );

  await risuai.onUnload(async () => {
    if (app) {
      unmount(app);
    }
  });
})();
```

`App.svelte`는 iframe-local UI만 담당합니다. Risuai main DOM을 직접 query하지 않습니다.

## API v3 사용 체크리스트

- [ ] 생성 번들 최상단에 `//@api 3.0`이 있다.
- [ ] `globalThis.__pluginApis__`가 없다.
- [ ] `getArg`, `setArg`, `getChar`, `setChar`를 사용하지 않는다.
- [ ] `getArgument`, `setArgument`, `getCharacter`, `setCharacter`를 사용한다.
- [ ] 모든 Risuai API 호출에 `await`가 있다.
- [ ] 기본 템플릿에서 main app DOM을 직접 조작하지 않는다.
- [ ] 기본 템플릿에서 `MutationObserver(document.body)`를 쓰지 않는다.
- [ ] 외부 `<script src>`나 CDN 런타임 로딩을 전제하지 않는다.
- [ ] Vite build는 단일 JS 파일을 생성한다.
- [ ] dynamic import/chunk split이 생기지 않도록 한다.
- [ ] storage 예제는 `pluginStorage` 또는 `getLocalPluginStorage()`를 사용한다.
- [ ] hot reload는 Risuai v3 file hot reload 흐름을 문서화한다.

## 구현 우선순위

1. Vite banner에 `//@api 3.0` 추가
2. framework prompt에서 React 제거
3. TypeScript 지원 방향 결정
4. Webpack/React/dead dependency 제거
5. vanilla 템플릿을 v3 최소 구조로 재작성
6. svelte 템플릿을 v3 최소 구조로 재작성
7. `risuai.d.ts`를 템플릿에 포함
8. custom hot reload/update/idb 제거
9. README/QUICKSTART를 v3 개발 흐름으로 갱신
10. 생성 프로젝트 smoke test

## 검증 계획

최소 검증은 다음 순서로 진행합니다.

1. CLI로 vanilla 프로젝트 생성
2. 생성된 프로젝트에서 install/build
3. `dist/*.js` 최상단 metadata 확인
4. `//@api 3.0` 존재 확인
5. `globalThis.__pluginApis__` 부재 확인
6. `getArg`, `getChar` 등 deprecated API 부재 확인
7. CLI로 svelte 프로젝트 생성
8. 동일 검증 반복
9. 가능하면 Risuai v3 hot reload로 `dist/*.js` 선택 후 settings/button이 등록되는지 확인

## 남은 결정 사항

### TypeScript-only로 갈 것인가?

추천은 TypeScript-first입니다. 다만 사용자 진입장벽을 낮추려면 vanilla JS 템플릿을 1차로 유지할 수 있습니다.

선택지:

- A: `vanilla-ts`, `svelte-ts`만 제공
- B: `vanilla-js`, `svelte-js`만 v3로 먼저 복구
- C: source는 TS, CLI에서 language prompt 제거

현재 목표에는 C가 가장 단순합니다.

### 자동 npm install 유지 여부

현재 CLI는 생성 후 자동으로 `npm install`을 실행합니다. migration 중에는 실패 지점이 늘어날 수 있으므로 옵션화하는 것이 좋습니다.

추천:

- 기본값: install 하지 않음
- prompt 또는 flag로 install 선택

### update-url 자동화 유지 여부

v3 metadata는 `//@update-url`을 지원합니다. 하지만 기존 update-manager는 제거하고, metadata와 배포 문서만 남기는 것이 좋습니다.

## 최종 방향

`create-risu-plugin`은 “많은 기능이 들어간 v2 플러그인 앱 템플릿 생성기”에서 “Risuai API v3 전용, iframe-safe, 단일 번들 플러그인 스캐폴더”로 방향을 바꾸는 것이 맞습니다.

살릴 핵심은 CLI와 Vite banner generation입니다. 버릴 핵심은 v2 wrapper, main DOM hacks, custom hot reload/update/storage stack입니다.
